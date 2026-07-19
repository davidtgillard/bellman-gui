import { describe, expect, it, vi } from "vitest";
import { buildMilestoneOverlayVisuals } from "./milestone-overlays";

function mockMilestoneNode(options: {
  id: string;
  y: number;
  label?: string;
  subLabel?: string | null;
  selected?: boolean;
  display?: string;
}) {
  return {
    data: (key: string) => {
      if (key === "type") {
        return "milestone";
      }
      if (key === "label") {
        return options.label ?? options.id;
      }
      if (key === "subLabel") {
        return options.subLabel ?? null;
      }
      return undefined;
    },
    id: () => options.id,
    style: (key: string) => (key === "display" ? (options.display ?? "element") : ""),
    position: () => ({ x: 0, y: options.y }),
    selected: () => options.selected ?? false,
  };
}

describe("buildMilestoneOverlayVisuals", () => {
  it("builds screen Y from model Y, zoom, and pan", () => {
    const milestone = mockMilestoneNode({
      id: "milestone/ga",
      y: 100,
      label: "ga-release",
      subLabel: "2026-09-30",
    });
    const cy = {
      pan: () => ({ x: 10, y: 20 }),
      zoom: () => 2,
      nodes: () => ({
        forEach: (fn: (node: typeof milestone) => void) => {
          fn(milestone);
        },
      }),
    };

    expect(buildMilestoneOverlayVisuals(cy as never)).toEqual([
      {
        id: "milestone/ga",
        label: "ga-release",
        date: "2026-09-30",
        screenY: 220,
        selected: false,
      },
    ]);
  });

  it("respects visibleNodeIds and hidden display", () => {
    const visible = mockMilestoneNode({ id: "milestone/a", y: 0, label: "a" });
    const hiddenByLegend = mockMilestoneNode({ id: "milestone/b", y: 10, label: "b" });
    const hiddenByDisplay = mockMilestoneNode({
      id: "milestone/c",
      y: 20,
      label: "c",
      display: "none",
    });
    const nodes = [visible, hiddenByLegend, hiddenByDisplay];
    const cy = {
      pan: () => ({ x: 0, y: 0 }),
      zoom: () => 1,
      nodes: () => ({
        forEach: (fn: (node: (typeof nodes)[number]) => void) => {
          for (const node of nodes) {
            fn(node);
          }
        },
      }),
    };

    expect(
      buildMilestoneOverlayVisuals(cy as never, new Set(["milestone/a", "milestone/c"])).map(
        (visual) => visual.id,
      ),
    ).toEqual(["milestone/a"]);
  });

  it("ignores non-milestone nodes", () => {
    const goal = {
      data: vi.fn(() => "goal"),
      id: () => "goal/x",
      style: () => "element",
      position: () => ({ x: 0, y: 0 }),
      selected: () => false,
    };
    const cy = {
      pan: () => ({ x: 0, y: 0 }),
      zoom: () => 1,
      nodes: () => ({
        forEach: (fn: (node: typeof goal) => void) => {
          fn(goal);
        },
      }),
    };

    expect(buildMilestoneOverlayVisuals(cy as never)).toEqual([]);
  });
});
