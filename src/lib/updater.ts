import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateCheckStatus {
  shouldCheck: boolean;
  checkIntervalHours: number;
  lastUpdateCheck: string | null;
}

interface UpdateCheckStatusDto {
  should_check: boolean;
  check_interval_hours: number;
  last_update_check: string | null;
}

export type UpdateCheckOutcome =
  | { kind: "up_to_date"; currentVersion: string }
  | { kind: "available"; currentVersion: string; update: Update }
  | { kind: "failed"; message: string }
  | { kind: "unsupported"; message: string };

/**
 * Loads whether a background update check should run now.
 * @returns Throttle status for startup update checks.
 */
export async function loadUpdateCheckStatus(): Promise<UpdateCheckStatus> {
  if (!isTauri()) {
    return {
      shouldCheck: false,
      checkIntervalHours: 24,
      lastUpdateCheck: null,
    };
  }

  const dto = await invoke<UpdateCheckStatusDto>("update_check_status_command");
  return {
    shouldCheck: dto.should_check,
    checkIntervalHours: dto.check_interval_hours,
    lastUpdateCheck: dto.last_update_check,
  };
}

/**
 * Records that an update check completed (success or failure).
 */
export async function touchUpdateCheck(): Promise<void> {
  if (!isTauri()) {
    return;
  }
  await invoke("touch_update_check_command");
}

/**
 * Checks GitHub for a newer signed AppImage via the Tauri updater plugin.
 * @returns Up-to-date, available, failed, or unsupported outcome.
 */
export async function checkForAppUpdate(): Promise<UpdateCheckOutcome> {
  if (!isTauri()) {
    return {
      kind: "unsupported",
      message: "Updates are only available in the packaged AppImage.",
    };
  }

  let currentVersion = "unknown";
  try {
    currentVersion = await getVersion();
  } catch {
    // Keep "unknown" if version lookup fails.
  }

  try {
    const update = await check();
    await touchUpdateCheck();
    if (!update) {
      return { kind: "up_to_date", currentVersion };
    }
    return { kind: "available", currentVersion, update };
  } catch (caught) {
    await touchUpdateCheck().catch(() => undefined);
    const message = caught instanceof Error ? caught.message : String(caught);
    if (
      message.toLowerCase().includes("could not fetch") ||
      message.toLowerCase().includes("network") ||
      message.toLowerCase().includes("error sending request")
    ) {
      return { kind: "failed", message };
    }
    // Dev / unsigned builds often fail signature or endpoint checks.
    if (
      message.toLowerCase().includes("signature") ||
      message.toLowerCase().includes("appimage") ||
      message.toLowerCase().includes("not a valid")
    ) {
      return {
        kind: "unsupported",
        message:
          "Updates only apply to release AppImage builds. " +
          (message || "Updater is unavailable in this build."),
      };
    }
    return { kind: "failed", message };
  }
}

/**
 * Downloads and installs an available update, then relaunches the app.
 * @param update - Update handle from a successful check.
 */
export async function installAppUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}

/**
 * Returns the current app version string.
 * @returns Semver string from Tauri, or a fallback label.
 */
export async function loadAppVersion(): Promise<string> {
  if (!isTauri()) {
    return "dev";
  }
  try {
    return await getVersion();
  } catch {
    return "unknown";
  }
}
