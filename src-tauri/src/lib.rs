mod graph;

use graph::load_roadmap_graph;
use std::path::PathBuf;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
fn load_roadmap_graph_command(roadmap_root: String) -> Result<graph::RoadmapGraphDto, String> {
    load_roadmap_graph(PathBuf::from(roadmap_root).as_path())
}

#[tauri::command]
async fn bellman_version(app: tauri::AppHandle) -> Result<String, String> {
    let output = app
        .shell()
        .sidecar("binaries/bellman")
        .map_err(|error| format!("failed to resolve bellman sidecar: {error}"))?
        .args(["version"])
        .output()
        .await
        .map_err(|error| format!("failed to run bellman sidecar: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("bellman version failed: {stderr}"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_roadmap_graph_command,
            bellman_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
