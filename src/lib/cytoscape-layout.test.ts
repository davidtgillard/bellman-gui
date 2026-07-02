import { describe, expect, it } from "vitest";
import {
  autoLayoutOptions,
  compoundSizeForContent,
  graphLayoutSeed,
  shiftBoxInside,
  usesPresetLayout,
  wheelZoomLevel,
} from "./cytoscape-layout";
import { COMPOUND_MIN_HEIGHT, COMPOUND_MIN_WIDTH, COMPOUND_PADDING } from "./cytoscape-theme";

describe("cytoscape-layout", () => {
  it("detects preset layout mode for saved layouts", () => {
    expect(usesPresetLayout({ a: { x: 1, y: 2 } })).toBe(true);
    expect(usesPresetLayout({})).toBe(false);
    expect(usesPresetLayout(undefined)).toBe(false);
  });

  it("uses cose for edgeless graphs and fcose when links exist", () => {
    expect(autoLayoutOptions(0)).toMatchObject({ name: "cose" });
    expect(autoLayoutOptions(2)).toMatchObject({ name: "fcose" });
  });

  it("derives a stable seed from graph ids", () => {
    const first = graphLayoutSeed(["b", "a"], ["e2", "e1"]);
    const second = graphLayoutSeed(["a", "b"], ["e1", "e2"]);
    const third = graphLayoutSeed(["a", "b", "c"], ["e1", "e2"]);

    expect(first).toBe(second);
    expect(first).not.toBe(third);
  });

  it("places edgeless nodes at varied distances", () => {
    const placed = [
      { x: 0, y: 0 },
      { x: 180, y: 40 },
      { x: -60, y: 220 },
      { x: 120, y: -150 },
    ];
    const distances: number[] = [];
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        distances.push(
          Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y),
        );
      }
    }
    const mean = distances.reduce((sum, value) => sum + value, 0) / distances.length;
    const variance =
      distances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / distances.length;
    expect(Math.sqrt(variance) / mean).toBeGreaterThan(0.05);
  });

  it("computes compound size from child bounds with padding", () => {
    expect(compoundSizeForContent(null)).toEqual({
      w: COMPOUND_MIN_WIDTH,
      h: COMPOUND_MIN_HEIGHT,
    });
    expect(
      compoundSizeForContent({ x1: 0, y1: 0, x2: 100, y2: 40 }),
    ).toEqual({
      w: 100 + COMPOUND_PADDING.left + COMPOUND_PADDING.right,
      h: 40 + COMPOUND_PADDING.top + COMPOUND_PADDING.bottom,
    });
  });

  it("shifts a footprint inside its container", () => {
    expect(
      shiftBoxInside(
        { x1: 0, y1: 0, x2: 10, y2: 10 },
        { x1: 20, y1: 20, x2: 40, y2: 40 },
      ),
    ).toEqual({ dx: 20, dy: 20 });

    expect(
      shiftBoxInside(
        { x1: 35, y1: 20, x2: 45, y2: 30 },
        { x1: 20, y1: 20, x2: 40, y2: 40 },
      ),
    ).toEqual({ dx: -5, dy: 0 });
  });

  it("computes wheel zoom levels with clamping", () => {
    expect(wheelZoomLevel(1, -120, 0, 0.2, 0.2, 3)).toBeGreaterThan(1);
    expect(wheelZoomLevel(1, 120, 0, 0.2, 0.2, 3)).toBeLessThan(1);
    expect(wheelZoomLevel(0.2, 120, 0, 0.2, 0.2, 3)).toBe(0.2);
    expect(wheelZoomLevel(3, -120, 0, 0.2, 0.2, 3)).toBe(3);
  });
});
