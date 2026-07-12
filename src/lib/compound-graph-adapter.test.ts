import { describe, expect, it } from "vitest";
import { buildCompoundWorkPackageView } from "./work-package-view";
import {
  buildCompoundGraphScene,
  buildCompoundGraphSceneFromView,
  isCompoundGraphNodes,
} from "./compound-graph-adapter";
import { isOverflowNodeId, OVERFLOW_NODE_PREFIX } from "@dgillard/cytoscape-compound-graph";

const PROJECT = "project/billing";
const PARENT_A = "project/billing/wp-a";
const PARENT_B = "project/billing/wp-b";
const CHILD_A1 = "project/billing/wp-a-1";
const CHILD_B1 = "project/billing/wp-b-1";

function multiRootCompoundView() {
  return buildCompoundWorkPackageView({
    projectId: PROJECT,
    nodes: [
      { id: PROJECT, type: "project" },
      { id: PARENT_A, type: "work_package" },
      { id: PARENT_B, type: "work_package" },
      { id: CHILD_A1, type: "work_package" },
      { id: CHILD_B1, type: "work_package" },
    ],
    links: [
      { id: "p-a", linkType: "parent_of", source: PARENT_A, target: CHILD_A1 },
      { id: "p-b", linkType: "parent_of", source: PARENT_B, target: CHILD_B1 },
    ],
  });
}

describe("compound-graph-adapter", () => {
  it("detects compound graph nodes", () => {
    const view = multiRootCompoundView();
    const nodes = view.displayNodes.map((node) => ({
      id: node.id,
      parent: node.parent,
      data: { isCompound: node.isCompound, isOverflow: node.isOverflow },
    }));
    expect(isCompoundGraphNodes(nodes)).toBe(true);
    expect(isCompoundGraphNodes([{ id: "solo", data: { type: "goal" } }])).toBe(false);
  });

  it("builds a scene with two root containers and leaf children", () => {
    const view = multiRootCompoundView();
    const scene = buildCompoundGraphSceneFromView(
      view,
      view.displayNodes,
      {
        [PARENT_A]: { x: 0, y: 0, w: 220, h: 180 },
        [PARENT_B]: { x: 300, y: 0, w: 220, h: 180 },
        [CHILD_A1]: { x: -20, y: 10 },
        [CHILD_B1]: { x: 20, y: -10 },
      },
      (node) => node.id,
    );

    const elements = scene.buildElements();
    const nodeData = elements
      .filter((element) => !("source" in (element.data ?? {})))
      .map((element) => element.data);

    expect(nodeData.filter((data) => data?.kind === "container")).toHaveLength(2);
    expect(nodeData.filter((data) => data?.kind === "leaf")).toHaveLength(2);

    const childA = nodeData.find((data) => data?.id === CHILD_A1);
    expect(childA?.kind).toBe("leaf");
  });

  it("maps overflow nodes and excludes them from flat layout after init", () => {
    const overflowId = `${OVERFLOW_NODE_PREFIX}${PARENT_A}`;
    const scene = buildCompoundGraphScene(
      [
        {
          id: PARENT_A,
          label: "parent-a",
          data: { isCompound: true, type: "work_package" },
        },
        {
          id: overflowId,
          label: "+3 more",
          parent: PARENT_A,
          data: { isOverflow: true, type: "work_package" },
          classes: "overflow",
        },
      ],
      [],
      {
        [PARENT_A]: { x: 0, y: 0, w: 200, h: 160 },
        [overflowId]: { x: 0, y: 40 },
      },
    );

    const overflowElement = scene
      .buildElements()
      .find((element) => element.data?.id === overflowId);
    expect(overflowElement?.data?.isOverflow).toBe(true);
    expect(isOverflowNodeId(overflowId)).toBe(true);
  });
});
