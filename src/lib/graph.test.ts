import { describe, expect, it } from "vitest";
import registry from "../fixtures/example-roadmap/.fits/registry.json";
import links from "../fixtures/example-roadmap/links/links.json";
import {
  nodeLabel,
  parseRoadmapGraph,
  toReagraphEdges,
  toReagraphNodes,
} from "./graph";

describe("parseRoadmapGraph", () => {
  const graph = parseRoadmapGraph("/example", registry, links);

  it("parses example fixture nodes and edges", () => {
    expect(graph.nodes).toHaveLength(6);
    expect(graph.edges).toHaveLength(2);
  });

  it("maps precedence edge direction from in to out", () => {
    const edge = graph.edges.find(
      (item) => item.linkType === "precedes_FS_Mandatory",
    );
    expect(edge).toBeDefined();
    expect(edge?.source).toBe("billing-redesign--wp-invoicing");
    expect(edge?.target).toBe("billing-redesign--wp-pdf-export");
  });

  it("maps node labels from qualified ids", () => {
    expect(nodeLabel("initiative--explore-ml-ranking")).toBe(
      "explore-ml-ranking",
    );
    expect(nodeLabel("billing-redesign--wp-invoicing")).toBe("wp-invoicing");
  });

  it("converts to ReaGraph node and edge shapes", () => {
    const reagraphNodes = toReagraphNodes(graph.nodes);
    const reagraphEdges = toReagraphEdges(graph.edges);

    expect(reagraphNodes[0]).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
      fill: expect.any(String),
    });
    expect(reagraphEdges[0]).toMatchObject({
      id: expect.any(String),
      source: expect.any(String),
      target: expect.any(String),
      label: expect.any(String),
    });
  });
});
