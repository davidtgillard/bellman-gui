import { describe, expect, it } from "vitest";
import {
  compatibleLinkTypes,
  compatibleSourceNodes,
  compatibleTargetNodes,
  linkEndpointsForPick,
  linkTargetsForOrigin,
  nodeMatchesLinkEndpoint,
  type GraphNode,
  type LinkTypeMeta,
} from "./graph";

const linkTypes: LinkTypeMeta[] = [
  { link_type: "parent_of", in_type: "work_package", out_type: "work_package" },
  { link_type: "supports", in_type: "work_scope", out_type: "goal" },
  { link_type: "precedes_FS_Mandatory", in_type: "work_package", out_type: "work_package" },
  {
    link_type: "precedes_FS_Mandatory_scope",
    in_type: "project",
    out_type: "project",
  },
];

const nodes: GraphNode[] = [
  { id: "initiative/alpha", type: "initiative" },
  { id: "project/beta", type: "project" },
  { id: "project/beta/wp-gamma", type: "work_package" },
  { id: "goal/delta", type: "goal" },
];

describe("link type compatibility", () => {
  it("matches work_scope endpoints to initiatives and projects", () => {
    expect(nodeMatchesLinkEndpoint("initiative", "work_scope")).toBe(true);
    expect(nodeMatchesLinkEndpoint("project", "work_scope")).toBe(true);
    expect(nodeMatchesLinkEndpoint("work_package", "work_scope")).toBe(false);
  });

  it("matches initiatives to project-typed scope-precedence endpoints", () => {
    expect(nodeMatchesLinkEndpoint("initiative", "project")).toBe(true);
    expect(
      compatibleLinkTypes(linkTypes, "initiative", "project").map(
        (item) => item.link_type,
      ),
    ).toEqual(["precedes_FS_Mandatory_scope"]);
    expect(
      compatibleLinkTypes(linkTypes, "project", "initiative").map(
        (item) => item.link_type,
      ),
    ).toEqual(["precedes_FS_Mandatory_scope"]);
  });

  it("filters link types for selected node types", () => {
    expect(
      compatibleLinkTypes(linkTypes, "work_package", "work_package").map(
        (item) => item.link_type,
      ),
    ).toEqual(["parent_of", "precedes_FS_Mandatory"]);

    expect(
      compatibleLinkTypes(linkTypes, "project", "goal").map((item) => item.link_type),
    ).toEqual(["supports"]);
  });

  it("filters source and target nodes for a selected link type", () => {
    const supports = linkTypes.find((item) => item.link_type === "supports");
    expect(supports).toBeDefined();
    if (!supports) {
      return;
    }

    expect(compatibleSourceNodes(nodes, supports).map((node) => node.id)).toEqual([
      "initiative/alpha",
      "project/beta",
    ]);
    expect(compatibleTargetNodes(nodes, supports).map((node) => node.id)).toEqual([
      "goal/delta",
    ]);

    const parentOf = linkTypes.find((item) => item.link_type === "parent_of");
    expect(parentOf).toBeDefined();
    if (!parentOf) {
      return;
    }

    expect(compatibleSourceNodes(nodes, parentOf).map((node) => node.id)).toEqual([
      "project/beta/wp-gamma",
    ]);
    expect(compatibleTargetNodes(nodes, parentOf).map((node) => node.id)).toEqual([
      "project/beta/wp-gamma",
    ]);
  });
});

describe("linkTargetsForOrigin", () => {
  it("prefers the origin as start and lists compatible finishes", () => {
    const origin = nodes[0];
    const result = linkTargetsForOrigin(origin, nodes, linkTypes);

    expect(result.originRole).toBe("start");
    expect(result.targets.map((node) => node.id).sort()).toEqual([
      "goal/delta",
      "project/beta",
    ]);
    expect(linkEndpointsForPick(origin.id, result.originRole, "goal/delta")).toEqual({
      source: "initiative/alpha",
      target: "goal/delta",
    });
  });

  it("uses the origin as finish when it cannot start a link", () => {
    const origin = nodes[3];
    const result = linkTargetsForOrigin(origin, nodes, linkTypes);

    expect(origin.type).toBe("goal");
    expect(result.originRole).toBe("finish");
    expect(result.targets.map((node) => node.id).sort()).toEqual([
      "initiative/alpha",
      "project/beta",
    ]);
    expect(linkEndpointsForPick(origin.id, result.originRole, "project/beta")).toEqual({
      source: "project/beta",
      target: "goal/delta",
    });
  });

  it("skips synthetic overflow nodes as counterparts", () => {
    const withOverflow: GraphNode[] = [
      ...nodes,
      { id: "__overflow__:project/beta/wp-gamma", type: "work_package" },
    ];
    const origin = withOverflow[2];
    const result = linkTargetsForOrigin(origin, withOverflow, linkTypes);

    expect(result.targets.some((node) => node.id.startsWith("__overflow__:"))).toBe(
      false,
    );
  });
});
