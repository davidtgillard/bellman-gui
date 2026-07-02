mod bellman_cmd;
mod cli;
mod graph;
mod graph_layout;
mod node_detail;
mod roadmap_edit;
mod settings;
mod undo;

use bellman_cmd::run_bellman;
use cli::CliOptions;
use graph::load_roadmap_graph;
use graph_layout::{
    load_work_package_layout, remove_top_level_node_position, remove_work_package_node_position,
    save_graph_layout, save_top_level_node_position, save_work_package_node_position,
    SaveTopLevelNodePositionRequest, SaveWorkPackageNodePositionRequest,
    WorkPackageLayoutDto,
};
use node_detail::load_node_detail_command;
use roadmap_edit::{
    create_link, create_node, remove_link, remove_node, update_work_package, CreateLinkRequest,
    CreateNodeRequest, RemoveLinkRequest, RemoveNodeRequest, UpdateWorkPackageRequest,
};
use settings::load_settings_command;
use crate::undo::{Snapshot, UndoState, UndoStateDto};
use std::path::{Path, PathBuf};
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::{Emitter};
use tauri_plugin_dialog::DialogExt;

/// Captures the after-edit snapshot and records the before/after diff on the
/// undo stack. Snapshot failures are logged but never fail the edit itself.
fn record_edit(state: &UndoState, root: &str, label: String, before: Option<Snapshot>) {
    let Some(before) = before else {
        eprintln!("[undo] skipping record for {root}: failed to capture before snapshot");
        return;
    };
    match crate::undo::capture(Path::new(root)) {
        Ok(after) => {
            if let Err(error) = state.push(root, label, before, after) {
                eprintln!("[undo] failed to record edit for {root}: {error}");
            }
        }
        Err(error) => eprintln!("[undo] failed to capture after snapshot for {root}: {error}"),
    }
}

#[tauri::command]
fn load_roadmap_graph_command(
    roadmap_root: String,
    state: tauri::State<UndoState>,
) -> Result<graph::RoadmapGraphDto, String> {
    let graph = load_roadmap_graph(PathBuf::from(roadmap_root).as_path())?;
    state.load_or_reset(Path::new(&graph.root))?;
    Ok(graph)
}

#[tauri::command]
async fn pick_and_load_roadmap(
    app: tauri::AppHandle,
    state: tauri::State<'_, UndoState>,
) -> Result<Option<graph::RoadmapGraphDto>, String> {
    let dialog_app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_title("Open bellman roadmap")
            .blocking_pick_folder()
    })
    .await
    .map_err(|error| format!("folder dialog failed: {error}"))?;

    let Some(path) = picked else {
        return Ok(None);
    };

    let path_ref = path
        .as_path()
        .ok_or_else(|| "selected folder path is unavailable".to_string())?;

    let graph = load_roadmap_graph(path_ref)?;
    state.load_or_reset(path_ref)?;
    Ok(Some(graph))
}

#[tauri::command]
async fn create_node_command(
    app: tauri::AppHandle,
    request: CreateNodeRequest,
    state: tauri::State<'_, UndoState>,
) -> Result<graph::RoadmapGraphDto, String> {
    let roadmap_root = request.roadmap_root.clone();
    let label = format!("create {:?} {}", request.node_kind, request.name);
    let before = crate::undo::capture(Path::new(&roadmap_root)).ok();
    create_node(&app, request).await?;
    record_edit(&state, &roadmap_root, label, before);
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
async fn create_link_command(
    request: CreateLinkRequest,
    state: tauri::State<'_, UndoState>,
) -> Result<graph::RoadmapGraphDto, String> {
    let roadmap_root = request.roadmap_root.clone();
    let label = format!(
        "create link {} {} -> {}",
        request.link_type, request.source, request.target
    );
    let before = crate::undo::capture(Path::new(&roadmap_root)).ok();
    create_link(request).await?;
    record_edit(&state, &roadmap_root, label, before);
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
async fn remove_link_command(
    request: RemoveLinkRequest,
    state: tauri::State<'_, UndoState>,
) -> Result<graph::RoadmapGraphDto, String> {
    let roadmap_root = request.roadmap_root.clone();
    let label = format!("remove link {}", request.link_id);
    let before = crate::undo::capture(Path::new(&roadmap_root)).ok();
    remove_link(request).await?;
    record_edit(&state, &roadmap_root, label, before);
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
async fn remove_node_command(
    app: tauri::AppHandle,
    request: RemoveNodeRequest,
    state: tauri::State<'_, UndoState>,
) -> Result<graph::RoadmapGraphDto, String> {
    let roadmap_root = request.roadmap_root.clone();
    let label = format!("remove {} {}", request.node_type, request.node_id);
    let before = crate::undo::capture(Path::new(&roadmap_root)).ok();
    remove_node(&app, request).await?;
    record_edit(&state, &roadmap_root, label, before);
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
async fn save_node_markdown_command(
    roadmap_root: String,
    node_id: String,
    markdown: String,
    state: tauri::State<'_, UndoState>,
) -> Result<node_detail::NodeDetailDto, String> {
    let label = format!("edit {node_id}");
    let before = crate::undo::capture(Path::new(&roadmap_root)).ok();
    let detail =
        node_detail::save_node_markdown(Path::new(&roadmap_root), &node_id, &markdown)?;
    record_edit(&state, &roadmap_root, label, before);
    Ok(detail)
}

#[tauri::command]
async fn update_work_package_command(
    app: tauri::AppHandle,
    request: UpdateWorkPackageRequest,
    state: tauri::State<'_, UndoState>,
) -> Result<graph::RoadmapGraphDto, String> {
    let roadmap_root = request.roadmap_root.clone();
    let label = format!("edit {}", request.node_id);
    let before = crate::undo::capture(Path::new(&roadmap_root)).ok();
    update_work_package(&app, request).await?;
    record_edit(&state, &roadmap_root, label, before);
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
fn undo_command(
    roadmap_root: String,
    state: tauri::State<UndoState>,
) -> Result<graph::RoadmapGraphDto, String> {
    state.undo(&roadmap_root)?;
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
fn redo_command(
    roadmap_root: String,
    state: tauri::State<UndoState>,
) -> Result<graph::RoadmapGraphDto, String> {
    state.redo(&roadmap_root)?;
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
fn undo_state_command(
    roadmap_root: String,
    state: tauri::State<UndoState>,
) -> Result<UndoStateDto, String> {
    state.state(&roadmap_root)
}

#[tauri::command]
async fn bellman_version(app: tauri::AppHandle) -> Result<String, String> {
    run_bellman(&app, &["version"]).await
}

#[tauri::command]
fn load_work_package_layout_command(roadmap_root: String) -> Result<WorkPackageLayoutDto, String> {
    load_work_package_layout(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
fn save_work_package_node_position_command(
    request: SaveWorkPackageNodePositionRequest,
) -> Result<WorkPackageLayoutDto, String> {
    save_work_package_node_position(
        PathBuf::from(&request.roadmap_root).as_path(),
        &request.project_id,
        &request.node_id,
        request.x,
        request.y,
    )
}

#[tauri::command]
fn remove_work_package_node_position_command(
    roadmap_root: String,
    project_id: String,
    node_id: String,
) -> Result<WorkPackageLayoutDto, String> {
    remove_work_package_node_position(
        PathBuf::from(roadmap_root).as_path(),
        &project_id,
        &node_id,
    )
}

#[tauri::command]
fn save_graph_layout_command(
    roadmap_root: String,
    layout: WorkPackageLayoutDto,
) -> Result<WorkPackageLayoutDto, String> {
    save_graph_layout(PathBuf::from(roadmap_root).as_path(), layout)
}

#[tauri::command]
fn save_top_level_node_position_command(
    request: SaveTopLevelNodePositionRequest,
) -> Result<WorkPackageLayoutDto, String> {
    save_top_level_node_position(
        PathBuf::from(&request.roadmap_root).as_path(),
        &request.node_id,
        request.x,
        request.y,
    )
}

#[tauri::command]
fn remove_top_level_node_position_command(
    roadmap_root: String,
    node_id: String,
) -> Result<WorkPackageLayoutDto, String> {
    remove_top_level_node_position(PathBuf::from(roadmap_root).as_path(), &node_id)
}

#[tauri::command]
fn load_initial_roadmap(
    cli: tauri::State<CliOptions>,
    state: tauri::State<UndoState>,
) -> Result<Option<graph::RoadmapGraphDto>, String> {
    match cli.initial_roadmap_root.as_ref() {
        Some(path) => {
            let graph = load_roadmap_graph(path.as_path())?;
            state.load_or_reset(path.as_path())?;
            Ok(Some(graph))
        }
        None => Ok(None),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(cli::cli_options_from_env())
        .manage(UndoState::default())
        .setup(|app| {
            let open_roadmap = MenuItem::with_id(
                app,
                "open-roadmap",
                "Open Roadmap…",
                true,
                Some("CmdOrCtrl+O"),
            )?;
            let file_menu = Submenu::with_items(app, "File", true, &[&open_roadmap])?;
            let undo_item =
                MenuItem::with_id(app, "undo", "Undo", true, Some("CmdOrCtrl+Z"))?;
            let redo_item =
                MenuItem::with_id(app, "redo", "Redo", true, Some("CmdOrCtrl+Shift+Z"))?;
            let edit_menu = Submenu::with_items(app, "Edit", true, &[&undo_item, &redo_item])?;
            let menu = Menu::with_items(app, &[&file_menu, &edit_menu])?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().0.as_str() {
            "open-roadmap" => {
                let _ = app.emit("open-roadmap", ());
            }
            "undo" => {
                let _ = app.emit("undo", ());
            }
            "redo" => {
                let _ = app.emit("redo", ());
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            load_roadmap_graph_command,
            load_initial_roadmap,
            load_settings_command,
            pick_and_load_roadmap,
            bellman_version,
            create_node_command,
            create_link_command,
            remove_link_command,
            remove_node_command,
            save_node_markdown_command,
            update_work_package_command,
            undo_command,
            redo_command,
            undo_state_command,
            load_node_detail_command,
            load_work_package_layout_command,
            save_work_package_node_position_command,
            remove_work_package_node_position_command,
            save_graph_layout_command,
            save_top_level_node_position_command,
            remove_top_level_node_position_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
