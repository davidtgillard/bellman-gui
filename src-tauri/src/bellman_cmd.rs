use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

const SIDECAR_HINT: &str = "Install the bundled CLI with `bash packaging/prepare-sidecar.sh`, \
rebuild the app (`npm run tauri dev`), or put `bellman` on your PATH.";

#[derive(Debug, Clone)]
pub struct BellmanRunOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

async fn run_sidecar_output(app: &AppHandle, args: &[&str]) -> Result<BellmanRunOutput, String> {
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

    Ok(BellmanRunOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
}

async fn run_path_bellman_output(app: &AppHandle, args: &[&str]) -> Result<BellmanRunOutput, String> {
    let mut command = app.shell().command("bellman");
    for arg in args {
        command = command.args([*arg]);
    }

    let output = command
        .output()
        .await
        .map_err(|error| format!("failed to run bellman from PATH: {error}"))?;

    Ok(BellmanRunOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
}

/// Runs bellman and returns stdout/stderr regardless of exit status.
pub async fn run_bellman_capture(app: &AppHandle, args: &[&str]) -> Result<BellmanRunOutput, String> {
    match run_sidecar_output(app, args).await {
        Ok(output) => Ok(output),
        Err(sidecar_error) => match run_path_bellman_output(app, args).await {
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

/// Runs bellman via the bundled sidecar, falling back to a PATH install in development.
pub async fn run_bellman(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let output = run_bellman_capture(app, args).await?;
    if output.success {
        Ok(output.stdout)
    } else {
        let detail = if output.stderr.is_empty() {
            output.stdout
        } else {
            output.stderr
        };
        Err(if detail.is_empty() {
            "bellman command failed".to_string()
        } else {
            detail
        })
    }
}
