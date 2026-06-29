import { describe, expect, it } from "vitest";
import {
  defaultNodePosition,
  fromWorkPackageLayoutDto,
  projectLayoutKey,
  projectNodePositions,
  withNodePosition,
  withoutNodePosition,
} from "./graph-layout";

describe("graph-layout", () => {
  it("normalizes backend layout payloads", () => {
    const layout = fromWorkPackageLayoutDto({
      version: 1,
      kind: "bellman-gui-work-package-layout",
      projects: {
        "project--billing-redesign": {
          "billing-redesign--wp-invoicing": { x: 10, y: -5 },
        },
      },
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
});
