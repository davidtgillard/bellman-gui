import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { loadSettings } from "./settings";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));

const invokeMock = vi.mocked(invoke);

describe("settings", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("loads max pan speed from the backend settings command", async () => {
    invokeMock.mockResolvedValueOnce({ max_pan_speed: 640 });

    await expect(loadSettings()).resolves.toEqual({
      maxPanSpeed: 640,
      backgroundPanEnabled: false,
    });
    expect(invokeMock).toHaveBeenCalledWith("load_settings_command");
  });

  it("loads background pan setting from the backend settings command", async () => {
    invokeMock.mockResolvedValueOnce({
      max_pan_speed: 960,
      background_pan_enabled: true,
    });

    await expect(loadSettings()).resolves.toEqual({
      maxPanSpeed: 960,
      backgroundPanEnabled: true,
    });
  });
});
