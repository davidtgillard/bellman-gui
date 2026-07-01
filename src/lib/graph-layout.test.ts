import { describe, expect, it } from "vitest";
import {
  applyNodePlacement,
  defaultNodePosition,
  fromWorkPackageLayoutDto,
  MIN_NODE_DISTANCE,
  projectLayoutKey,
  projectNodePositions,
  resolvePlacedNodePosition,
  normalizeTopLevelPositions,
  topLevelNodePositions,
  withNodePosition,
  withScopePositions,
  withTopLevelNodePosition,
  withoutNodePosition,
  withoutTopLevelNodePosition,
} from "./graph-layout";

describe("graph-layout", () => {
  it("normalizes backend layout payloads", () => {
    const layout = fromWorkPackageLayoutDto({
      version: 1,
      kind: "bellman-gui-work-package-layout",
      top_level: {
        "initiative--alpha": { x: 5, y: 6 },
      },
      projects: {
        "project--billing-redesign": {
          "billing-redesign--wp-invoicing": { x: 10, y: -5 },
        },
      },
    });

    expect(topLevelNodePositions(layout)).toEqual({
      "initiative--alpha": { x: 5, y: 6 },
    });
    expect(projectNodePositions(layout, "project--billing-redesign")).toEqual({
      "billing-redesign--wp-invoicing": { x: 10, y: -5 },
    });
    expect(projectNodePositions(layout, "billing-redesign")).toEqual({
      "billing-redesign--wp-invoicing": { x: 10, y: -5 },
    });
  });

  it("uses canonical project scope keys when updating positions", () => {
    expect(projectLayoutKey("project--billing-redesign")).toBe("billing-redesign");

    const initial = fromWorkPackageLayoutDto({
      version: 1,
      kind: "bellman-gui-work-package-layout",
      projects: {},
    });

    const updated = withNodePosition(
      initial,
      "project--billing-redesign",
      "billing-redesign--wp-invoicing",
      { x: 1, y: 2 },
    );
    expect(updated).not.toBe(initial);
    expect(updated.projects["billing-redesign"]).toEqual({
      "billing-redesign--wp-invoicing": { x: 1, y: 2 },
    });
    expect(projectNodePositions(updated, "project--billing-redesign")).toEqual({
      "billing-redesign--wp-invoicing": { x: 1, y: 2 },
    });

    const removed = withoutNodePosition(
      updated,
      "project--billing-redesign",
      "billing-redesign--wp-invoicing",
    );
    expect(projectNodePositions(removed, "project--billing-redesign")).toEqual({});
  });

  it("assigns stable fallback grid positions", () => {
    const ids = ["a", "b", "c"];
    expect(defaultNodePosition("b", ids)).toEqual({ x: 40, y: 40 });
    expect(defaultNodePosition("missing", ids)).toEqual({ x: 0, y: 0 });
  });

  it("nudges placements away from nearby nodes", () => {
    const preferred = { x: 0, y: 0 };
    const nearby = [{ x: 10, y: 0 }];
    const resolved = resolvePlacedNodePosition(preferred, nearby, MIN_NODE_DISTANCE);

    expect(Math.hypot(resolved.x - nearby[0].x, resolved.y - nearby[0].y)).toBeGreaterThanOrEqual(
      MIN_NODE_DISTANCE,
    );
    expect(resolved).not.toEqual(preferred);
  });

  it("bootstraps unsaved node positions when placing a new node", () => {
    const initial = fromWorkPackageLayoutDto({
      version: 1,
      kind: "bellman-gui-work-package-layout",
      top_level: {},
      projects: {},
    });

    const { layout, position } = applyNodePlacement(
      initial,
      { kind: "top_level" },
      "initiative--new",
      { x: 100, y: 50 },
      {
        "initiative--alpha": { x: 0, y: 0 },
        "project--beta": { x: 200, y: 0 },
      },
    );

    expect(position).toEqual({ x: 100, y: 50 });
    expect(layout.topLevel["initiative--alpha"]).toEqual({ x: 0, y: 0 });
    expect(layout.topLevel["project--beta"]).toEqual({ x: 200, y: 0 });
    expect(layout.topLevel["initiative--new"]).toEqual({ x: 100, y: 50 });
  });

  it("updates top-level node positions", () => {
    const initial = fromWorkPackageLayoutDto({
      version: 1,
      kind: "bellman-gui-work-package-layout",
      top_level: {},
      projects: {},
    });

    const updated = withTopLevelNodePosition(initial, "goal--delta", { x: 3, y: 4 });
    expect(topLevelNodePositions(updated)).toEqual({
      "goal--delta": { x: 3, y: 4 },
    });

    const removed = withoutTopLevelNodePosition(updated, "goal--delta");
    expect(topLevelNodePositions(removed)).toEqual({});
  });

  it("merges scope positions for top-level and project graphs", () => {
    const initial = fromWorkPackageLayoutDto({
      version: 1,
      kind: "bellman-gui-work-package-layout",
      top_level: {
        "goal--alpha": { x: 1, y: 2 },
      },
      projects: {
        "billing-redesign": {
          "billing-redesign--wp-invoicing": { x: 3, y: 4 },
        },
      },
    });

    const topLevel = withScopePositions(
      initial,
      { kind: "top_level" },
      {
        "goal--beta": { x: 5, y: 6 },
        "project--gamma": { x: 7, y: 8 },
      },
    );
    expect(topLevelNodePositions(topLevel)).toEqual({
      "goal--alpha": { x: 1, y: 2 },
      "goal--beta": { x: 5, y: 6 },
      "project--gamma": { x: 7, y: 8 },
    });

    const project = withScopePositions(
      initial,
      { kind: "project", projectId: "project--billing-redesign" },
      {
        "billing-redesign--wp-pdf-export": { x: 9, y: 10 },
      },
    );
    expect(projectNodePositions(project, "project--billing-redesign")).toEqual({
      "billing-redesign--wp-invoicing": { x: 3, y: 4 },
      "billing-redesign--wp-pdf-export": { x: 9, y: 10 },
    });
  });

  it("maps legacy layout keys onto canonical node ids", () => {
    const nodes = [
      { id: "project--usv-lars-p2", type: "project" },
      { id: "goal--partner-integrations", type: "goal" },
    ];

    const normalized = normalizeTopLevelPositions(
      {
        "usv-lars-p2": { x: 1, y: 2 },
        "project--usv-lars-p2": { x: 3, y: 4 },
        "partner-integrations": { x: 5, y: 6 },
      },
      nodes,
    );

    expect(normalized).toEqual({
      "project--usv-lars-p2": { x: 3, y: 4 },
      "goal--partner-integrations": { x: 5, y: 6 },
    });
  });
});
