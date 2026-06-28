use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

const SIDECAR_HINT: &str = "Install the bundled CLI with `bash packaging/prepare-sidecar.sh`, \
rebuild the app (`npm run tauri dev`), or put `bellman` on your PATH.";

async fn run_sidecar(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let sidecar = app
        .shell()
        .sidecar("binaries/bellman")
        .map_err(|error| format!("failed to resolve bellman sidecar: {error}"))?;

    let mut command = sidecar;
    for arg in args {
        command = command.args([*arg]);
    }

    let output = command
        .output()
        .await
        .map_err(|error| format!("failed to run bellman sidecar: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        let detail = if stderr.is_empty() { stdout.clone() } else { stderr };
        return Err(if detail.is_empty() {
            "bellman sidecar command failed".to_string()
        } else {
            detail
        });
    }

    Ok(stdout)
}

async fn run_path_bellman(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let mut command = app.shell().command("bellman");
    for arg in args {
        command = command.args([*arg]);
    }

    let output = command
        .output()
        .await
        .map_err(|error| format!("failed to run bellman from PATH: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        let detail = if stderr.is_empty() { stdout.clone() } else { stderr };
        return Err(if detail.is_empty() {
            "bellman command failed".to_string()
        } else {
            detail
        });
    }

    Ok(stdout)
}

/// Runs bellman via the bundled sidecar, falling back to a PATH install in development.
pub async fn run_bellman(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    match run_sidecar(app, args).await {
        Ok(output) => Ok(output),
        Err(sidecar_error) => match run_path_bellman(app, args).await {
            Ok(output) => Ok(output),
            Err(path_error) => {
                if path_error.starts_with("failed to run bellman from PATH:") {
                    Err(format!(
                        "{sidecar_error}. PATH fallback also failed: {path_error}. {SIDECAR_HINT}"
                    ))
                } else {
                    Err(path_error)
                }
            }
        },
    }
}
