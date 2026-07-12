import { describe, expect, it } from "vitest";
import {
  graphEmptyMessageFor,
  loadBundledExampleGraph,
  loadBundledExampleLinks,
} from "./example-roadmap";
import { fromRoadmapGraphDto, type RoadmapGraphDto } from "./graph";

describe("bundled example roadmap", () => {
  it("loads 6 nodes and 2 links from registry + links.jsonc + subgraphs", () => {
    const graph = loadBundledExampleGraph();
    expect(graph.root).toBe("example");
    expect(graph.editable).toBe(false);
    expect(graph.nodes).toHaveLength(6);
    expect(graph.links).toHaveLength(2);
    expect(loadBundledExampleLinks().links).toHaveLength(2);
  });

  it("restores example nodes after applying an empty opened roadmap", () => {
    const emptyDto: RoadmapGraphDto = {
      root: "/tmp/empty-roadmap",
      editable: true,
      nodes: [],
      links: [],
      link_types: [],
    };
    const emptyGraph = fromRoadmapGraphDto(emptyDto);
    expect(emptyGraph.nodes).toHaveLength(0);

    const restored = loadBundledExampleGraph();
    expect(restored.root).toBe("example");
    expect(restored.nodes.length).toBeGreaterThan(0);
  });
});

describe("graphEmptyMessageFor", () => {
  it("prompts to open a folder for the bundled example with no nodes", () => {
    expect(
      graphEmptyMessageFor({
        inWorkPackageGraph: false,
        activeProjectLabel: null,
        roadmapRoot: "example",
        nodeCount: 0,
      }),
    ).toBe("Open a bellman roadmap folder to view its graph.");
  });

  it("explains sync for an opened roadmap with no registered nodes", () => {
    expect(
      graphEmptyMessageFor({
        inWorkPackageGraph: false,
        activeProjectLabel: null,
        roadmapRoot: "/home/user/kf-roadmap.git",
        nodeCount: 0,
      }),
    ).toContain("bellman sync");
  });

  it("asks to select a type when nodes exist but none are visible", () => {
    expect(
      graphEmptyMessageFor({
        inWorkPackageGraph: false,
        activeProjectLabel: null,
        roadmapRoot: "example",
        nodeCount: 3,
      }),
    ).toBe("Select at least one node type to display.");
  });

  it("names the project when a work-package view is empty", () => {
    expect(
      graphEmptyMessageFor({
        inWorkPackageGraph: true,
        activeProjectLabel: "billing-redesign",
        roadmapRoot: "example",
        nodeCount: 0,
      }),
    ).toBe("Project billing-redesign has no work packages to display.");
  });
});
