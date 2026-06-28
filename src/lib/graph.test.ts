import { describe, expect, it } from "vitest";
import registry from "../fixtures/example-roadmap/.fits/registry.json";
import links from "../fixtures/example-roadmap/links/links.json";
import {
  findAddedNodeId,
  nodeLabel,
  nodeTypeColor,
  nodeTypeLabel,
  parseRoadmapGraph,
  toReagraphLinks,
  toReagraphNodes,
} from "./graph";

describe("parseRoadmapGraph", () => {
  const graph = parseRoadmapGraph("/example", registry, links);

  it("parses example fixture nodes and links", () => {
    expect(graph.nodes).toHaveLength(6);
    expect(graph.links).toHaveLength(2);
  });

  it("maps precedence link direction from in to out", () => {
    const link = graph.links.find(
      (item) => item.linkType === "precedes_FS_Mandatory",
    );
    expect(link).toBeDefined();
    expect(link?.source).toBe("billing-redesign--wp-invoicing");
    expect(link?.target).toBe("billing-redesign--wp-pdf-export");
  });

  it("maps node labels from qualified ids", () => {
    expect(nodeLabel("initiative--explore-ml-ranking")).toBe(
      "explore-ml-ranking",
    );
    expect(nodeLabel("billing-redesign--wp-invoicing")).toBe("wp-invoicing");
  });

  it("maps node type labels and colors", () => {
    expect(nodeTypeLabel("work_package")).toBe("Work Package");
    expect(nodeTypeColor("initiative")).toBe("#3b82f6");
    expect(nodeTypeColor("unknown")).toBe("#64748b");
  });

  it("converts to ReaGraph node and link shapes", () => {
    const reagraphNodes = toReagraphNodes(graph.nodes);
    const reagraphLinks = toReagraphLinks(graph.links);

    expect(reagraphNodes[0]).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
      fill: expect.any(String),
    });
    expect(reagraphLinks[0]).toMatchObject({
      id: expect.any(String),
      source: expect.any(String),
      target: expect.any(String),
      label: expect.any(String),
    });
  });

  it("finds a single added node id", () => {
    const added = findAddedNodeId(graph.nodes, [
      ...graph.nodes,
      { id: "goal--new-item", type: "goal" },
    ]);
    expect(added).toBe("goal--new-item");
  });
});
