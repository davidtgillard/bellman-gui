use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    ensure_sidecar_stub();
    tauri_build::build();
}

/// Tauri `externalBin` requires `binaries/bellman-<target-triple>` before the
/// build script finishes. Create a local stub when the real sidecar is absent
/// so `cargo test` / `cargo build` work without a prior `prepare-sidecar`.
fn ensure_sidecar_stub() {
    let target = env::var("TARGET").unwrap_or_else(|_| env::var("HOST").unwrap_or_default());
    if target.is_empty() {
        return;
    }

    let dest = PathBuf::from("binaries").join(format!("bellman-{target}"));
    println!("cargo:rerun-if-changed={}", dest.display());
    if dest.is_file() {
        return;
    }

    let stub = PathBuf::from("../packaging/bellman-sidecar-stub.sh");
    println!("cargo:rerun-if-changed={}", stub.display());
    if !stub.is_file() {
        panic!(
            "missing sidecar at {} and stub template at {}",
            dest.display(),
            stub.display()
        );
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).unwrap_or_else(|error| {
            panic!("failed to create {}: {error}", parent.display());
        });
    }

    fs::copy(&stub, &dest).unwrap_or_else(|error| {
        panic!(
            "failed to install stub sidecar {} from {}: {error}",
            dest.display(),
            stub.display()
        );
    });

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&dest)
            .unwrap_or_else(|error| panic!("failed to stat {}: {error}", dest.display()))
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&dest, perms).unwrap_or_else(|error| {
            panic!("failed to chmod {}: {error}", dest.display());
        });
    }
}
