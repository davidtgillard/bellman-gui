import { invoke } from "@tauri-apps/api/core";

export const DEFAULT_MAX_PAN_SPEED = 960;

interface BellmanGuiSettingsDto {
  max_pan_speed: number;
  background_pan_enabled?: boolean;
}

export interface BellmanGuiSettings {
  maxPanSpeed: number;
  backgroundPanEnabled: boolean;
}

function fromSettingsDto(dto: BellmanGuiSettingsDto): BellmanGuiSettings {
  return {
    maxPanSpeed: dto.max_pan_speed,
    backgroundPanEnabled: dto.background_pan_enabled ?? false,
  };
}

/**
 * Loads global bellman-gui settings from the user's config directory.
 */
export async function loadSettings(): Promise<BellmanGuiSettings> {
  const dto = await invoke<BellmanGuiSettingsDto>("load_settings_command");
  return fromSettingsDto(dto);
}
