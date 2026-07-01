import { describe, expect, it } from "vitest";
import {
  autoLayoutOptions,
  graphLayoutSeed,
  usesPresetLayout,
} from "./cytoscape-layout";

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
});
