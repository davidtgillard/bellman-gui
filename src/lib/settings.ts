import { invoke } from "@tauri-apps/api/core";

export const DEFAULT_MAX_PAN_SPEED = 960;

interface BellmanGuiSettingsDto {
  max_pan_speed: number;
}

export interface BellmanGuiSettings {
  maxPanSpeed: number;
}

function fromSettingsDto(dto: BellmanGuiSettingsDto): BellmanGuiSettings {
  return {
    maxPanSpeed: dto.max_pan_speed,
  };
}

/**
 * Loads global bellman-gui settings from the user's config directory.
 */
export async function loadSettings(): Promise<BellmanGuiSettings> {
  const dto = await invoke<BellmanGuiSettingsDto>("load_settings_command");
  return fromSettingsDto(dto);
}
