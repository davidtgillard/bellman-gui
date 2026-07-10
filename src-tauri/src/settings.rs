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
        }
    }
}

pub fn settings_path() -> PathBuf {
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        return PathBuf::from(xdg)
            .join("bellman-gui")
            .join("settings.json");
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
    }
}

#[tauri::command]
pub fn load_settings_command() -> BellmanGuiSettingsDto {
    load_settings()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use tempfile::TempDir;

    #[test]
    fn defaults_when_settings_file_is_missing() {
        let settings = load_settings();
        assert_eq!(settings, BellmanGuiSettingsDto::default());
    }

    #[test]
    fn reads_max_pan_speed_from_settings_file() {
        let temp = TempDir::new().expect("temp dir");
        let config_dir = temp.path().join("bellman-gui");
        fs::create_dir_all(&config_dir).expect("create config dir");
        fs::write(
            config_dir.join("settings.json"),
            r#"{ "max_pan_speed": 420 }"#,
        )
        .expect("write settings");

        let previous = env::var("XDG_CONFIG_HOME").ok();
        env::set_var("XDG_CONFIG_HOME", temp.path());

        let settings = load_settings();
        assert_eq!(settings.max_pan_speed, 420.0);
        assert_eq!(
            settings.update_check_interval_hours,
            DEFAULT_UPDATE_CHECK_INTERVAL_HOURS
        );

        if let Some(value) = previous {
            env::set_var("XDG_CONFIG_HOME", value);
        } else {
            env::remove_var("XDG_CONFIG_HOME");
        }
    }

    #[test]
    fn reads_background_pan_enabled_from_settings_file() {
        let temp = TempDir::new().expect("temp dir");
        let config_dir = temp.path().join("bellman-gui");
        fs::create_dir_all(&config_dir).expect("create config dir");
        fs::write(
            config_dir.join("settings.json"),
            r#"{ "background_pan_enabled": true }"#,
        )
        .expect("write settings");

        let previous = env::var("XDG_CONFIG_HOME").ok();
        env::set_var("XDG_CONFIG_HOME", temp.path());

        let settings = load_settings();
        assert!(settings.background_pan_enabled);

        if let Some(value) = previous {
            env::set_var("XDG_CONFIG_HOME", value);
        } else {
            env::remove_var("XDG_CONFIG_HOME");
        }
    }

    #[test]
    fn reads_update_check_interval_from_settings_file() {
        let temp = TempDir::new().expect("temp dir");
        let config_dir = temp.path().join("bellman-gui");
        fs::create_dir_all(&config_dir).expect("create config dir");
        fs::write(
            config_dir.join("settings.json"),
            r#"{ "update_check_interval_hours": 12 }"#,
        )
        .expect("write settings");

        let previous = env::var("XDG_CONFIG_HOME").ok();
        env::set_var("XDG_CONFIG_HOME", temp.path());

        let settings = load_settings();
        assert_eq!(settings.update_check_interval_hours, 12.0);

        if let Some(value) = previous {
            env::set_var("XDG_CONFIG_HOME", value);
        } else {
            env::remove_var("XDG_CONFIG_HOME");
        }
    }

    #[test]
    fn clamps_invalid_max_pan_speed_values() {
        let temp = TempDir::new().expect("temp dir");
        let config_dir = temp.path().join("bellman-gui");
        fs::create_dir_all(&config_dir).expect("create config dir");
        fs::write(
            config_dir.join("settings.json"),
            r#"{ "max_pan_speed": -5 }"#,
        )
        .expect("write settings");

        let previous = env::var("XDG_CONFIG_HOME").ok();
        env::set_var("XDG_CONFIG_HOME", temp.path());

        let settings = load_settings();
        assert_eq!(settings.max_pan_speed, MIN_MAX_PAN_SPEED);

        if let Some(value) = previous {
            env::set_var("XDG_CONFIG_HOME", value);
        } else {
            env::remove_var("XDG_CONFIG_HOME");
        }
    }
}
