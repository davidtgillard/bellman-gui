import { invoke, isTauri } from "@tauri-apps/api/core";

export const DEFAULT_MAX_PAN_SPEED = 960;
export const DEFAULT_UPDATE_CHECK_INTERVAL_HOURS = 24;

interface BellmanGuiSettingsDto {
  max_pan_speed: number;
  background_pan_enabled?: boolean;
  update_check_interval_hours?: number;
}

export interface BellmanGuiSettings {
  maxPanSpeed: number;
  backgroundPanEnabled: boolean;
  updateCheckIntervalHours: number;
}

function fromSettingsDto(dto: BellmanGuiSettingsDto): BellmanGuiSettings {
  return {
    maxPanSpeed: dto.max_pan_speed,
    backgroundPanEnabled: dto.background_pan_enabled ?? false,
    updateCheckIntervalHours:
      dto.update_check_interval_hours ?? DEFAULT_UPDATE_CHECK_INTERVAL_HOURS,
  };
}

/**
 * Loads global bellman-gui settings from the user's config directory.
 * @returns Resolved GUI settings.
 */
export async function loadSettings(): Promise<BellmanGuiSettings> {
  if (!isTauri()) {
    return {
      maxPanSpeed: DEFAULT_MAX_PAN_SPEED,
      backgroundPanEnabled: false,
      updateCheckIntervalHours: DEFAULT_UPDATE_CHECK_INTERVAL_HOURS,
    };
  }

  const dto = await invoke<BellmanGuiSettingsDto>("load_settings_command");
  return fromSettingsDto(dto);
}
