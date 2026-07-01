import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEGEND_VISIBILITY_KEY_PREFIX,
  legendVisibilityStorageKey,
  loadLegendVisibility,
  resolveVisibleTypes,
  saveLegendVisibility,
} from "./legend-visibility";

const ROOT = "/roadmap/example";

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("legend visibility persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a stable storage key per roadmap root", () => {
    expect(legendVisibilityStorageKey(ROOT)).toBe(`${LEGEND_VISIBILITY_KEY_PREFIX}${ROOT}`);
  });

  it("round-trips visible node types through localStorage", () => {
    saveLegendVisibility(ROOT, new Set(["goal", "project"]));

    expect(loadLegendVisibility(ROOT)).toEqual(["goal", "project"]);
  });

  it("returns null for missing or invalid stored values", () => {
    expect(loadLegendVisibility(ROOT)).toBeNull();

    globalThis.localStorage.setItem(legendVisibilityStorageKey(ROOT), "not-json");
    expect(loadLegendVisibility(ROOT)).toBeNull();

    globalThis.localStorage.setItem(legendVisibilityStorageKey(ROOT), JSON.stringify(["goal", 1]));
    expect(loadLegendVisibility(ROOT)).toBeNull();
  });

  it("defaults to all available types when nothing is stored", () => {
    expect(resolveVisibleTypes(["goal", "project"], null)).toEqual(new Set(["goal", "project"]));
  });

  it("restores stored visibility for available types", () => {
    expect(resolveVisibleTypes(["goal", "project", "milestone"], ["goal"])).toEqual(
      new Set(["goal"]),
    );
  });

  it("preserves an intentionally empty visible set", () => {
    expect(resolveVisibleTypes(["goal", "project"], [])).toEqual(new Set());
  });

  it("falls back to all available types when stored types no longer exist", () => {
    expect(resolveVisibleTypes(["goal", "project"], ["milestone"])).toEqual(
      new Set(["goal", "project"]),
    );
  });
});
