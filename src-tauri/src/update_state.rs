use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::settings::{load_settings, settings_path, DEFAULT_UPDATE_CHECK_INTERVAL_HOURS};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct UpdateStateDto {
    #[serde(default)]
    pub last_update_check: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UpdateCheckStatusDto {
    pub should_check: bool,
    pub check_interval_hours: f64,
    pub last_update_check: Option<String>,
}

fn update_state_path() -> PathBuf {
    settings_path()
        .parent()
        .map(|parent| parent.join("update-state.json"))
        .unwrap_or_else(|| PathBuf::from("bellman-gui-update-state.json"))
}

fn load_update_state() -> UpdateStateDto {
    let path = update_state_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return UpdateStateDto::default();
    };

    match serde_json::from_str(&raw) {
        Ok(state) => state,
        Err(error) => {
            eprintln!(
                "[update-state] ignoring invalid {}: {error}",
                path.display()
            );
            UpdateStateDto::default()
        }
    }
}

fn save_update_state(state: &UpdateStateDto) -> Result<(), String> {
    let path = update_state_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!("failed to create update state directory {}: {error}", parent.display())
        })?;
    }
    let raw = serde_json::to_string_pretty(state)
        .map_err(|error| format!("failed to serialize update state: {error}"))?;
    fs::write(&path, format!("{raw}\n"))
        .map_err(|error| format!("failed to write {}: {error}", path.display()))
}

fn parse_rfc3339(value: &str) -> Option<SystemTime> {
    // Accept "YYYY-MM-DDTHH:MM:SSZ" produced by touch_update_check_command.
    let trimmed = value.trim().trim_end_matches('Z');
    let (date, time) = trimmed.split_once('T')?;
    let mut date_parts = date.split('-');
    let year: i64 = date_parts.next()?.parse().ok()?;
    let month: u32 = date_parts.next()?.parse().ok()?;
    let day: u32 = date_parts.next()?.parse().ok()?;
    let mut time_parts = time.split(':');
    let hour: u32 = time_parts.next()?.parse().ok()?;
    let minute: u32 = time_parts.next()?.parse().ok()?;
    let second: u32 = time_parts.next()?.parse().ok()?;

    // Convert civil UTC time to unix seconds without external deps.
    let days = days_from_civil(year, month, day)?;
    let secs = days * 86_400 + i64::from(hour) * 3_600 + i64::from(minute) * 60 + i64::from(second);
    if secs < 0 {
        return None;
    }
    Some(UNIX_EPOCH + Duration::from_secs(secs as u64))
}

fn days_from_civil(year: i64, month: u32, day: u32) -> Option<i64> {
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let mut y = year;
    let m = month as i64;
    let d = day as i64;
    y -= i64::from(m <= 2);
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if m > 2 { m - 3 } else { m + 9 };
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

fn now_rfc3339() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = (now / 86_400) as i64;
    let secs_of_day = now % 86_400;
    let (year, month, day) = civil_from_days(days);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = y + i64::from(m <= 2);
    (year, m as u32, d as u32)
}

fn should_run_background_check(state: &UpdateStateDto, interval_hours: f64) -> bool {
    let Some(last) = state.last_update_check.as_deref() else {
        return true;
    };
    let Some(last_time) = parse_rfc3339(last) else {
        return true;
    };
    let Ok(elapsed) = SystemTime::now().duration_since(last_time) else {
        return true;
    };
    let interval = Duration::from_secs_f64(interval_hours.max(0.0) * 3600.0);
    elapsed >= interval
}

#[tauri::command]
pub fn update_check_status_command() -> UpdateCheckStatusDto {
    let settings = load_settings();
    let state = load_update_state();
    let interval = if settings.update_check_interval_hours.is_finite()
        && settings.update_check_interval_hours > 0.0
    {
        settings.update_check_interval_hours
    } else {
        DEFAULT_UPDATE_CHECK_INTERVAL_HOURS
    };
    UpdateCheckStatusDto {
        should_check: should_run_background_check(&state, interval),
        check_interval_hours: interval,
        last_update_check: state.last_update_check,
    }
}

#[tauri::command]
pub fn touch_update_check_command() -> Result<UpdateStateDto, String> {
    let mut state = load_update_state();
    state.last_update_check = Some(now_rfc3339());
    save_update_state(&state)?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use tempfile::TempDir;

    #[test]
    fn should_check_when_never_checked() {
        let state = UpdateStateDto::default();
        assert!(should_run_background_check(&state, 24.0));
    }

    #[test]
    fn should_not_check_when_within_interval() {
        let state = UpdateStateDto {
            last_update_check: Some(now_rfc3339()),
        };
        assert!(!should_run_background_check(&state, 24.0));
    }

    #[test]
    fn round_trips_update_state_file() {
        let temp = TempDir::new().expect("temp dir");
        let previous = env::var("XDG_CONFIG_HOME").ok();
        env::set_var("XDG_CONFIG_HOME", temp.path());

        let written = touch_update_check_command().expect("touch");
        assert!(written.last_update_check.is_some());
        let status = update_check_status_command();
        assert!(!status.should_check);
        assert_eq!(status.last_update_check, written.last_update_check);

        if let Some(value) = previous {
            env::set_var("XDG_CONFIG_HOME", value);
        } else {
            env::remove_var("XDG_CONFIG_HOME");
        }
    }
}
