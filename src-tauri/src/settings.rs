use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const DEFAULT_MAX_PAN_SPEED: f64 = 960.0;
pub const DEFAULT_UPDATE_CHECK_INTERVAL_HOURS: f64 = 24.0;
const MIN_MAX_PAN_SPEED: f64 = 60.0;
const MAX_MAX_PAN_SPEED: f64 = 10_000.0;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BellmanGuiSettingsDto {
    #[serde(default = "default_max_pan_speed")]
    pub max_pan_speed: f64,
    #[serde(default)]
    pub background_pan_enabled: bool,
    #[serde(default = "default_update_check_interval_hours")]
    pub update_check_interval_hours: f64,
    /// Absolute path of the last successfully opened disk roadmap, if any.
    #[serde(default)]
    pub last_roadmap_root: Option<String>,
}

fn default_max_pan_speed() -> f64 {
    DEFAULT_MAX_PAN_SPEED
}

fn default_update_check_interval_hours() -> f64 {
    DEFAULT_UPDATE_CHECK_INTERVAL_HOURS
}

impl Default for BellmanGuiSettingsDto {
    fn default() -> Self {
        Self {
            max_pan_speed: DEFAULT_MAX_PAN_SPEED,
            background_pan_enabled: false,
            update_check_interval_hours: DEFAULT_UPDATE_CHECK_INTERVAL_HOURS,
            last_roadmap_root: None,
        }
    }
}

pub fn settings_path() -> PathBuf {
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        return PathBuf::from(xdg)
            .join("bellman-gui")
            .join("settings.json");
    }

    #[cfg(windows)]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            if !appdata.trim().is_empty() {
                return PathBuf::from(appdata)
                    .join("bellman-gui")
                    .join("settings.json");
            }
        }
        if let Ok(profile) = std::env::var("USERPROFILE") {
            if !profile.trim().is_empty() {
                return PathBuf::from(profile)
                    .join("AppData")
                    .join("Roaming")
                    .join("bellman-gui")
                    .join("settings.json");
            }
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home)
            .join(".config")
            .join("bellman-gui")
            .join("settings.json");
    }

    PathBuf::from("bellman-gui-settings.json")
}

fn clamp_max_pan_speed(value: f64) -> f64 {
    if !value.is_finite() {
        return DEFAULT_MAX_PAN_SPEED;
    }
    value.clamp(MIN_MAX_PAN_SPEED, MAX_MAX_PAN_SPEED)
}

fn clamp_update_check_interval_hours(value: f64) -> f64 {
    if !value.is_finite() || value <= 0.0 {
        return DEFAULT_UPDATE_CHECK_INTERVAL_HOURS;
    }
    value
}

pub fn load_settings() -> BellmanGuiSettingsDto {
    let path = settings_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return BellmanGuiSettingsDto::default();
    };

    let parsed: BellmanGuiSettingsDto = match serde_json::from_str(&raw) {
        Ok(settings) => settings,
        Err(error) => {
            eprintln!(
                "[settings] ignoring invalid {}: {error}",
                path.display()
            );
            return BellmanGuiSettingsDto::default();
        }
    };

    BellmanGuiSettingsDto {
        max_pan_speed: clamp_max_pan_speed(parsed.max_pan_speed),
        background_pan_enabled: parsed.background_pan_enabled,
        update_check_interval_hours: clamp_update_check_interval_hours(
            parsed.update_check_interval_hours,
        ),
        last_roadmap_root: parsed
            .last_roadmap_root
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
    }
}

pub fn save_settings(settings: &BellmanGuiSettingsDto) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create settings directory {}: {error}",
                parent.display()
            )
        })?;
    }
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("failed to serialize settings: {error}"))?;
    fs::write(&path, format!("{raw}\n"))
        .map_err(|error| format!("failed to write {}: {error}", path.display()))
}

/// Remembers the last opened disk roadmap, or clears it when `root` is `None`.
pub fn set_last_roadmap_root(root: Option<String>) {
    let mut settings = load_settings();
    let next = root
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value != "example");
    if settings.last_roadmap_root == next {
        return;
    }
    settings.last_roadmap_root = next;
    if let Err(error) = save_settings(&settings) {
        eprintln!("[settings] failed to save last roadmap: {error}");
    }
}

#[tauri::command]
pub fn load_settings_command() -> BellmanGuiSettingsDto {
    load_settings()
}

#[tauri::command]
pub fn clear_last_roadmap_command() {
    set_last_roadmap_root(None);
}

/// Serializes tests that mutate process-wide config env vars (`XDG_CONFIG_HOME`, etc.).
#[cfg(test)]
pub(crate) fn config_env_lock() -> std::sync::MutexGuard<'static, ()> {
    use std::sync::Mutex;
    static LOCK: Mutex<()> = Mutex::new(());
    LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::ffi::OsString;
    use std::path::{Path, PathBuf};
    use std::sync::MutexGuard;
    use tempfile::TempDir;

    /// Holds the config-env mutex and restores `XDG_CONFIG_HOME` on drop.
    struct XdgConfigHomeGuard {
        _lock: MutexGuard<'static, ()>,
        previous: Option<OsString>,
        temp: TempDir,
    }

    impl XdgConfigHomeGuard {
        fn new() -> Self {
            let lock = config_env_lock();
            let temp = TempDir::new().expect("temp dir");
            let previous = env::var_os("XDG_CONFIG_HOME");
            env::set_var("XDG_CONFIG_HOME", temp.path());
            Self {
                _lock: lock,
                previous,
                temp,
            }
        }

        fn path(&self) -> &Path {
            self.temp.path()
        }

        fn config_dir(&self) -> PathBuf {
            self.path().join("bellman-gui")
        }
    }

    impl Drop for XdgConfigHomeGuard {
        fn drop(&mut self) {
            match &self.previous {
                Some(value) => env::set_var("XDG_CONFIG_HOME", value),
                None => env::remove_var("XDG_CONFIG_HOME"),
            }
        }
    }

    #[test]
    fn defaults_when_settings_file_is_missing() {
        let _guard = XdgConfigHomeGuard::new();
        let settings = load_settings();
        assert_eq!(settings, BellmanGuiSettingsDto::default());
    }

    #[test]
    fn reads_max_pan_speed_from_settings_file() {
        let guard = XdgConfigHomeGuard::new();
        let config_dir = guard.config_dir();
        fs::create_dir_all(&config_dir).expect("create config dir");
        fs::write(
            config_dir.join("settings.json"),
            r#"{ "max_pan_speed": 420 }"#,
        )
        .expect("write settings");

        let settings = load_settings();
        assert_eq!(settings.max_pan_speed, 420.0);
        assert_eq!(
            settings.update_check_interval_hours,
            DEFAULT_UPDATE_CHECK_INTERVAL_HOURS
        );
    }

    #[test]
    fn reads_background_pan_enabled_from_settings_file() {
        let guard = XdgConfigHomeGuard::new();
        let config_dir = guard.config_dir();
        fs::create_dir_all(&config_dir).expect("create config dir");
        fs::write(
            config_dir.join("settings.json"),
            r#"{ "background_pan_enabled": true }"#,
        )
        .expect("write settings");

        let settings = load_settings();
        assert!(settings.background_pan_enabled);
    }

    #[test]
    fn reads_update_check_interval_from_settings_file() {
        let guard = XdgConfigHomeGuard::new();
        let config_dir = guard.config_dir();
        fs::create_dir_all(&config_dir).expect("create config dir");
        fs::write(
            config_dir.join("settings.json"),
            r#"{ "update_check_interval_hours": 12 }"#,
        )
        .expect("write settings");

        let settings = load_settings();
        assert_eq!(settings.update_check_interval_hours, 12.0);
    }

    #[test]
    fn clamps_invalid_max_pan_speed_values() {
        let guard = XdgConfigHomeGuard::new();
        let config_dir = guard.config_dir();
        fs::create_dir_all(&config_dir).expect("create config dir");
        fs::write(
            config_dir.join("settings.json"),
            r#"{ "max_pan_speed": -5 }"#,
        )
        .expect("write settings");

        let settings = load_settings();
        assert_eq!(settings.max_pan_speed, MIN_MAX_PAN_SPEED);
    }

    #[test]
    fn reads_last_roadmap_root_from_settings_file() {
        let guard = XdgConfigHomeGuard::new();
        let config_dir = guard.config_dir();
        fs::create_dir_all(&config_dir).expect("create config dir");
        fs::write(
            config_dir.join("settings.json"),
            r#"{ "last_roadmap_root": "/tmp/my-roadmap" }"#,
        )
        .expect("write settings");

        let settings = load_settings();
        assert_eq!(
            settings.last_roadmap_root.as_deref(),
            Some("/tmp/my-roadmap")
        );
    }

    #[test]
    fn set_last_roadmap_root_round_trips_through_settings_file() {
        let _guard = XdgConfigHomeGuard::new();

        set_last_roadmap_root(Some("/tmp/persisted-roadmap".into()));
        assert_eq!(
            load_settings().last_roadmap_root.as_deref(),
            Some("/tmp/persisted-roadmap")
        );

        set_last_roadmap_root(None);
        assert_eq!(load_settings().last_roadmap_root, None);

        set_last_roadmap_root(Some("example".into()));
        assert_eq!(load_settings().last_roadmap_root, None);
    }

    #[cfg(windows)]
    #[test]
    fn settings_path_uses_appdata_when_xdg_unset() {
        let _lock = config_env_lock();
        let temp = TempDir::new().expect("temp dir");
        let previous_xdg = env::var_os("XDG_CONFIG_HOME");
        let previous_appdata = env::var_os("APPDATA");
        env::remove_var("XDG_CONFIG_HOME");
        env::set_var("APPDATA", temp.path());

        let path = settings_path();
        assert_eq!(
            path,
            temp.path().join("bellman-gui").join("settings.json")
        );

        match previous_xdg {
            Some(value) => env::set_var("XDG_CONFIG_HOME", value),
            None => env::remove_var("XDG_CONFIG_HOME"),
        }
        match previous_appdata {
            Some(value) => env::set_var("APPDATA", value),
            None => env::remove_var("APPDATA"),
        }
    }
}
