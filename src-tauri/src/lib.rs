mod bellman_cmd;
mod cli;
mod graph;
mod graph_layout;
mod node_detail;
mod roadmap_edit;

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
    create_link, create_node, remove_link, remove_node, CreateLinkRequest, CreateNodeRequest,
    RemoveLinkRequest, RemoveNodeRequest,
};
use std::path::PathBuf;
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::{Emitter};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
fn load_roadmap_graph_command(roadmap_root: String) -> Result<graph::RoadmapGraphDto, String> {
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
async fn pick_and_load_roadmap(app: tauri::AppHandle) -> Result<Option<graph::RoadmapGraphDto>, String> {
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

    load_roadmap_graph(path_ref).map(Some)
}

#[tauri::command]
async fn create_node_command(
    app: tauri::AppHandle,
    request: CreateNodeRequest,
) -> Result<graph::RoadmapGraphDto, String> {
    let roadmap_root = request.roadmap_root.clone();
    create_node(&app, request).await?;
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
async fn create_link_command(
    request: CreateLinkRequest,
) -> Result<graph::RoadmapGraphDto, String> {
    let roadmap_root = request.roadmap_root.clone();
    create_link(request).await?;
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
async fn remove_link_command(
    request: RemoveLinkRequest,
) -> Result<graph::RoadmapGraphDto, String> {
    let roadmap_root = request.roadmap_root.clone();
    remove_link(request).await?;
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
async fn remove_node_command(
    app: tauri::AppHandle,
    request: RemoveNodeRequest,
) -> Result<graph::RoadmapGraphDto, String> {
    let roadmap_root = request.roadmap_root.clone();
    remove_node(&app, request).await?;
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
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
fn load_initial_roadmap(cli: tauri::State<CliOptions>) -> Result<Option<graph::RoadmapGraphDto>, String> {
    match cli.initial_roadmap_root.as_ref() {
        Some(path) => load_roadmap_graph(path.as_path()).map(Some),
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
        .setup(|app| {
            let open_roadmap = MenuItem::with_id(
                app,
                "open-roadmap",
                "Open Roadmap…",
                true,
                Some("CmdOrCtrl+O"),
            )?;
            let file_menu = Submenu::with_items(app, "File", true, &[&open_roadmap])?;
            let menu = Menu::with_items(app, &[&file_menu])?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().0 == "open-roadmap" {
                let _ = app.emit("open-roadmap", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_roadmap_graph_command,
            load_initial_roadmap,
            pick_and_load_roadmap,
            bellman_version,
            create_node_command,
            create_link_command,
            remove_link_command,
            remove_node_command,
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
