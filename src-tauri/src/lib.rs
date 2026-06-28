mod bellman_cmd;
mod cli;
mod graph;
mod roadmap_edit;

use bellman_cmd::run_bellman;
use cli::CliOptions;
use graph::load_roadmap_graph;
use roadmap_edit::{create_edge, create_vertex, CreateEdgeRequest, CreateVertexRequest};
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
async fn create_vertex_command(
    app: tauri::AppHandle,
    request: CreateVertexRequest,
) -> Result<graph::RoadmapGraphDto, String> {
    let roadmap_root = request.roadmap_root.clone();
    create_vertex(&app, request).await?;
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
async fn create_edge_command(
    request: CreateEdgeRequest,
) -> Result<graph::RoadmapGraphDto, String> {
    let roadmap_root = request.roadmap_root.clone();
    create_edge(request).await?;
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
async fn bellman_version(app: tauri::AppHandle) -> Result<String, String> {
    run_bellman(&app, &["version"]).await
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
            create_vertex_command,
            create_edge_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
