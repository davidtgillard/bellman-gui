import { describe, expect, it } from "vitest";
import registry from "../fixtures/example-roadmap/.fits/registry.json";
import links from "../fixtures/example-roadmap/links/links.json";
import {
  canBeLinkFinish,
  canBeLinkStart,
  canCreateLinkFromNode,
  findAddedNodeId,
  graphWithoutLink,
  graphWithoutNode,
  innerGraphForProject,
  nodeLabel,
  nodeTypeColor,
  nodeTypeLabel,
  wrapLabelAtHyphens,
  graphNodeDisplayLabel,
  parseRoadmapGraph,
  normalizeRoadmapGraphData,
  deduplicateGraphNodes,
  topLevelGraphNodes,
  workPackageBelongsToProject,
  workPackageProjectName,
} from "./graph";
import { toCytoscapeElements } from "./cytoscape-graph";

describe("parseRoadmapGraph", () => {
  const graph = parseRoadmapGraph("/example", registry, links);

  it("parses example fixture nodes and links", () => {
    expect(graph.nodes).toHaveLength(6);
    expect(graph.links).toHaveLength(2);
  });

  it("detects which endpoints a node type can use when creating links", () => {
    const workPackage = graph.nodes.find(
      (node) => node.id === "project/billing-redesign/wp-invoicing",
    );
    const goal = graph.nodes.find((node) => node.type === "goal");
    const milestone = graph.nodes.find((node) => node.type === "milestone");

    expect(workPackage).toBeDefined();
    expect(goal).toBeDefined();
    expect(milestone).toBeDefined();

    expect(canBeLinkStart(workPackage!, graph.nodes, graph.linkTypes)).toBe(true);
    expect(canBeLinkFinish(workPackage!, graph.nodes, graph.linkTypes)).toBe(true);
    expect(canBeLinkStart(goal!, graph.nodes, graph.linkTypes)).toBe(false);
    expect(canBeLinkFinish(goal!, graph.nodes, graph.linkTypes)).toBe(true);
    expect(canBeLinkStart(milestone!, graph.nodes, graph.linkTypes)).toBe(false);
    expect(canBeLinkFinish(milestone!, graph.nodes, graph.linkTypes)).toBe(true);
    expect(canCreateLinkFromNode(workPackage!, graph.nodes, graph.linkTypes)).toBe(
      true,
    );
    expect(canCreateLinkFromNode(goal!, graph.nodes, graph.linkTypes)).toBe(true);
    expect(canCreateLinkFromNode(milestone!, graph.nodes, graph.linkTypes)).toBe(
      true,
    );
  });

  it("maps precedence link direction from in to out", () => {
    const link = graph.links.find(
      (item) => item.linkType === "precedes_FS_Mandatory",
    );
    expect(link).toBeDefined();
    expect(link?.source).toBe("project/billing-redesign/wp-invoicing");
    expect(link?.target).toBe("project/billing-redesign/wp-pdf-export");
  });

  it("maps node labels from qualified ids", () => {
    expect(nodeLabel("initiative/explore-ml-ranking")).toBe(
      "explore-ml-ranking",
    );
    expect(nodeLabel("project/billing-redesign/wp-invoicing")).toBe("wp-invoicing");
  });

  it("wraps long hyphenated labels onto multiple lines", () => {
    expect(wrapLabelAtHyphens("short-name")).toBe("short-name");
    expect(wrapLabelAtHyphens("explore-ml-ranking")).toBe("explore-ml-ranking");
    expect(wrapLabelAtHyphens("billing-redesign-invoicing-pdf-export")).toBe(
      "billing-redesign\ninvoicing-pdf-export",
    );
    expect(graphNodeDisplayLabel("very-long-work-package-name-here")).toBe(
      "very-long-work\npackage-name-here",
    );
  });

  it("maps node type labels and colors", () => {
    expect(nodeTypeLabel("work_package")).toBe("Work Package");
    expect(nodeTypeColor("initiative")).toBe("#3b82f6");
    expect(nodeTypeColor("unknown")).toBe("#64748b");
  });

  it("converts to Cytoscape element shapes", () => {
    const elements = toCytoscapeElements(graph.nodes, graph.links);

    expect(elements.nodes[0]).toMatchObject({
      data: {
        id: expect.any(String),
        label: expect.any(String),
        type: expect.any(String),
        color: expect.any(String),
      },
    });
    expect(elements.edges[0]).toMatchObject({
      data: {
        id: expect.any(String),
        source: expect.any(String),
        target: expect.any(String),
        label: expect.any(String),
      },
    });
  });

  it("finds a single added node id", () => {
    const added = findAddedNodeId(graph.nodes, [
      ...graph.nodes,
      { id: "goal/new-item", type: "goal" },
    ]);
    expect(added).toBe("goal/new-item");
  });

  it("removes a node and incident links from graph data", () => {
    const withoutNode = graphWithoutNode(
      graph.nodes,
      graph.links,
      "project/billing-redesign/wp-invoicing",
    );
    expect(withoutNode.nodes).toHaveLength(5);
    expect(withoutNode.links).toHaveLength(0);

    expect(graphWithoutLink(graph.links, graph.links[0].id)).toHaveLength(1);
  });

  it("excludes work packages from the top-level graph", () => {
    const topLevel = topLevelGraphNodes(graph.nodes);
    expect(topLevel).toHaveLength(4);
    expect(topLevel.some((node) => node.type === "work_package")).toBe(false);
  });

  it("derives work package project scope from ids", () => {
    expect(workPackageProjectName("project/billing-redesign/wp-invoicing")).toBe(
      "billing-redesign",
    );
    expect(
      workPackageBelongsToProject(
        "project/billing-redesign/wp-invoicing",
        "project/billing-redesign",
      ),
    ).toBe(true);
    expect(
      workPackageBelongsToProject(
        "project/billing-redesign/wp-invoicing",
        "project/other-project",
      ),
    ).toBe(false);
  });

  it("builds an inner graph scoped to a project", () => {
    const inner = innerGraphForProject(
      graph.nodes,
      graph.links,
      "project/billing-redesign",
    );
    expect(inner.nodes).toHaveLength(2);
    expect(inner.links).toHaveLength(2);
    expect(inner.nodes.every((node) => node.type === "work_package")).toBe(true);
  });

  it("collapses registry aliases that share a type and label", () => {
    const { nodes, idAliases } = deduplicateGraphNodes([
      { id: "usv-lars-p2", type: "project" },
      { id: "project/usv-lars-p2", type: "project" },
      { id: "settings-manager", type: "initiative" },
      { id: "initiative/settings-manager", type: "initiative" },
    ]);

    expect(nodes.map((node) => node.id).sort()).toEqual([
      "initiative/settings-manager",
      "project/usv-lars-p2",
    ]);
    expect(idAliases.get("usv-lars-p2")).toBe("project/usv-lars-p2");
    expect(idAliases.get("settings-manager")).toBe("initiative/settings-manager");
  });

  it("remaps links when collapsing duplicate node ids", () => {
    const { nodes, links } = normalizeRoadmapGraphData(
      [
        { id: "usv-lars-p2", type: "project" },
        { id: "project/usv-lars-p2", type: "project" },
      ],
      [
        {
          id: "supports--usv-lars-p2--goal/x",
          linkType: "supports",
          source: "usv-lars-p2",
          target: "goal/x",
        },
      ],
    );

    expect(nodes).toHaveLength(1);
    expect(links[0].source).toBe("project/usv-lars-p2");
  });
});
