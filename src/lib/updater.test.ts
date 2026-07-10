import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import {
  checkForAppUpdate,
  loadUpdateCheckStatus,
  touchUpdateCheck,
} from "./updater";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(async () => "0.1.0"),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const checkMock = vi.mocked(check);

describe("updater", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    checkMock.mockReset();
  });

  it("loads update check status from the backend", async () => {
    invokeMock.mockResolvedValueOnce({
      should_check: true,
      check_interval_hours: 24,
      last_update_check: null,
    });

    await expect(loadUpdateCheckStatus()).resolves.toEqual({
      shouldCheck: true,
      checkIntervalHours: 24,
      lastUpdateCheck: null,
    });
    expect(invokeMock).toHaveBeenCalledWith("update_check_status_command");
  });

  it("records a completed update check", async () => {
    invokeMock.mockResolvedValueOnce({ last_update_check: "2026-07-09T12:00:00Z" });
    await touchUpdateCheck();
    expect(invokeMock).toHaveBeenCalledWith("touch_update_check_command");
  });

  it("reports up to date when check returns null", async () => {
    checkMock.mockResolvedValueOnce(null);
    invokeMock.mockResolvedValueOnce({ last_update_check: "2026-07-09T12:00:00Z" });

    await expect(checkForAppUpdate()).resolves.toEqual({
      kind: "up_to_date",
      currentVersion: "0.1.0",
    });
  });

  it("reports available when check returns an update", async () => {
    const update = {
      version: "0.1.2",
      downloadAndInstall: vi.fn(),
    };
    checkMock.mockResolvedValueOnce(update as never);
    invokeMock.mockResolvedValueOnce({ last_update_check: "2026-07-09T12:00:00Z" });

    const outcome = await checkForAppUpdate();
    expect(outcome).toMatchObject({
      kind: "available",
      currentVersion: "0.1.0",
    });
    if (outcome.kind === "available") {
      expect(outcome.update.version).toBe("0.1.2");
    }
  });
});
