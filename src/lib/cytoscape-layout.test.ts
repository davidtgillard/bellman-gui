import { describe, expect, it, vi } from "vitest";
import {
  autoLayoutOptions,
  applyCompoundGrabPolicy,
  compoundSizeForContent,
  dragCompoundParentTo,
  graphLayoutSeed,
  shiftBoxInside,
  shouldPromoteChildGrabToParent,
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

  it("promotes child grabs only when the parent composite is solely selected", () => {
    const selectedParent = {
      id: () => "parent",
      isParent: () => true,
      selected: () => true,
    };
    const unselectedParent = {
      id: () => "parent",
      isParent: () => true,
      selected: () => false,
    };
    const parentCollection = (parent: typeof selectedParent) => ({
      empty: () => false,
      nonempty: () => true,
      first: () => parent,
    });
    const cy = (parent: typeof selectedParent, selectedCount: number) => ({
      nodes: () => ({
        length: selectedCount,
        first: () => ({ id: () => parent.id() }),
      }),
    });

    const childOnSelectedParent = {
      isChild: () => true,
      selected: () => false,
      parent: () => parentCollection(selectedParent),
      cy: () => cy(selectedParent, 1),
    };
    const childOnUnselectedParent = {
      isChild: () => true,
      selected: () => false,
      parent: () => parentCollection(unselectedParent),
      cy: () => cy(unselectedParent, 0),
    };
    const selectedChild = {
      isChild: () => true,
      selected: () => true,
      parent: () => parentCollection(selectedParent),
      cy: () => cy(selectedParent, 1),
    };
    const topLevel = {
      isChild: () => false,
      selected: () => false,
      parent: () => parentCollection(selectedParent),
      cy: () => cy(selectedParent, 1),
    };

    expect(shouldPromoteChildGrabToParent(childOnSelectedParent as never)).toBe(false);
    expect(shouldPromoteChildGrabToParent(childOnUnselectedParent as never)).toBe(false);
    expect(shouldPromoteChildGrabToParent(selectedChild as never)).toBe(false);
    expect(shouldPromoteChildGrabToParent(topLevel as never)).toBe(false);
  });

  it("leaves composite parents with children and all children non-grabbable", () => {
    const parent = {
      isParent: () => true,
      children: () => ({ length: 1 }),
      ungrabify: vi.fn(),
    };
    const emptyParent = {
      isParent: () => true,
      children: () => ({ length: 0 }),
      ungrabify: vi.fn(),
    };
    const childCollection = {
      ungrabify: vi.fn(),
    };
    const cy = {
      nodes: (selector?: string) => {
        if (selector === ":child") {
          return childCollection;
        }
        return {
          grabify: vi.fn(),
          ungrabify: vi.fn(),
          forEach: (fn: (node: typeof parent) => void) => {
            if (selector === ":parent") {
              fn(parent as never);
              fn(emptyParent as never);
            }
          },
        };
      },
    };

    applyCompoundGrabPolicy(cy as never, true);

    expect(parent.ungrabify).toHaveBeenCalled();
    expect(emptyParent.ungrabify).not.toHaveBeenCalled();
    expect(childCollection.ungrabify).toHaveBeenCalled();
  });

  it("dragCompoundParentTo updates parent and restores direct children in one batch", () => {
    const position = vi.fn();
    const childPosition = vi.fn();
    const childNode = {
      id: () => "child-a",
      position: childPosition,
    };
    const node = {
      id: () => "parent",
      isChild: () => false,
      position,
      children: () => ({
        forEach: (fn: (child: typeof childNode) => void) => fn(childNode),
      }),
    };
    const cy = {
      batch: (fn: () => void) => fn(),
    };
    const start = new Map([
      ["parent", { x: 100, y: 200 }],
      ["child-a", { x: -90, y: -30 }],
    ]);

    dragCompoundParentTo(cy as never, node as never, start, { x: 150, y: 170 });

    expect(position).toHaveBeenCalledWith({ x: 150, y: 170 });
    expect(childPosition).toHaveBeenCalledWith({ x: -90, y: -30 });
  });
});
