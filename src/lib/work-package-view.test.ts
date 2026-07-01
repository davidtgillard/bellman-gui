import { describe, expect, it } from "vitest";
import registry from "../fixtures/example-roadmap/.fits/registry.json";
import links from "../fixtures/example-roadmap/links/links.json";
import { parseRoadmapGraph } from "./graph";
import {
  buildCompoundWorkPackageView,
  buildParentRelations,
  isOverflowNodeId,
  isParentLink,
  overflowNodeId,
  overflowParentId,
  workPackageHasChildren,
} from "./work-package-view";

describe("work-package-view", () => {
  const graph = parseRoadmapGraph("/example", registry, links);
  const projectId = "project--billing-redesign";

  it("identifies parent_of links", () => {
    const parentLink = graph.links.find((link) => link.linkType === "parent_of");
    expect(parentLink).toBeDefined();
    expect(isParentLink(parentLink!)).toBe(true);
  });

  it("builds a compound project view without parent_of edges", () => {
    const view = buildCompoundWorkPackageView({
      nodes: graph.nodes,
      links: graph.links,
      projectId,
    });

    expect(view.usesFlatFallback).toBe(false);
    expect(view.displayLinks.some((link) => link.linkType === "parent_of")).toBe(false);
    expect(view.displayLinks.some((link) => link.linkType === "precedes_FS_Mandatory")).toBe(
      true,
    );

    const invoicing = view.displayNodes.find(
      (node) => node.id === "billing-redesign--wp-invoicing",
    );
    const pdfExport = view.displayNodes.find(
      (node) => node.id === "billing-redesign--wp-pdf-export",
    );

    expect(invoicing?.isCompound).toBe(true);
    expect(pdfExport?.parent).toBe("billing-redesign--wp-invoicing");
  });

  it("caps visible children and adds an overflow node", () => {
    const childIds = ["a", "b", "c", "d", "e", "f"].map(
      (name) => `billing-redesign--wp-${name}`,
    );
    const nodes = [
      { id: "billing-redesign--wp-parent", type: "work_package" },
      ...childIds.map((id) => ({ id, type: "work_package" })),
    ];
    const parentLinks = childIds.map((childId, index) => ({
      id: `parent_of--parent--${index}`,
      linkType: "parent_of",
      source: "billing-redesign--wp-parent",
      target: childId,
    }));

    const view = buildCompoundWorkPackageView({
      nodes,
      links: parentLinks,
      projectId: "project--billing-redesign",
      maxVisibleChildren: 5,
    });

    expect(view.displayNodes.filter((node) => node.parent === "billing-redesign--wp-parent")).toHaveLength(
      6,
    );
    expect(view.overflowByParent.get("billing-redesign--wp-parent")).toBe(1);
    expect(view.displayNodes.some((node) => node.id === overflowNodeId("billing-redesign--wp-parent"))).toBe(
      true,
    );
  });

  it("shows sub-packages badge instead of nested compounds at project root", () => {
    const nodes = [
      { id: "billing-redesign--wp-root", type: "work_package" },
      { id: "billing-redesign--wp-middle", type: "work_package" },
      { id: "billing-redesign--wp-leaf", type: "work_package" },
    ];
    const scopedLinks = [
      {
        id: "parent_of--root--middle",
        linkType: "parent_of",
        source: "billing-redesign--wp-root",
        target: "billing-redesign--wp-middle",
      },
      {
        id: "parent_of--middle--leaf",
        linkType: "parent_of",
        source: "billing-redesign--wp-middle",
        target: "billing-redesign--wp-leaf",
      },
    ];

    const view = buildCompoundWorkPackageView({
      nodes,
      links: scopedLinks,
      projectId,
    });

    const middle = view.displayNodes.find((node) => node.id === "billing-redesign--wp-middle");
    expect(middle?.parent).toBe("billing-redesign--wp-root");
    expect(middle?.subLabel).toBe("has sub-packages");
    expect(view.displayNodes.some((node) => node.id === "billing-redesign--wp-leaf")).toBe(false);
  });

  it("allows nested compounds when drilled into a work package", () => {
    const nodes = [
      { id: "billing-redesign--wp-root", type: "work_package" },
      { id: "billing-redesign--wp-middle", type: "work_package" },
      { id: "billing-redesign--wp-leaf", type: "work_package" },
    ];
    const scopedLinks = [
      {
        id: "parent_of--root--middle",
        linkType: "parent_of",
        source: "billing-redesign--wp-root",
        target: "billing-redesign--wp-middle",
      },
      {
        id: "parent_of--middle--leaf",
        linkType: "parent_of",
        source: "billing-redesign--wp-middle",
        target: "billing-redesign--wp-leaf",
      },
    ];

    const view = buildCompoundWorkPackageView({
      nodes,
      links: scopedLinks,
      projectId,
      focusParentId: "billing-redesign--wp-root",
    });

    const middle = view.displayNodes.find((node) => node.id === "billing-redesign--wp-middle");
    const leaf = view.displayNodes.find((node) => node.id === "billing-redesign--wp-leaf");

    expect(middle?.isCompound).toBe(true);
    expect(leaf?.parent).toBe("billing-redesign--wp-middle");
  });

  it("reports work package child relationships", () => {
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const { childrenByParent } = buildParentRelations(graph.links, nodeIds);

    expect(
      workPackageHasChildren("billing-redesign--wp-invoicing", childrenByParent),
    ).toBe(true);
    expect(isOverflowNodeId(overflowNodeId("billing-redesign--wp-invoicing"))).toBe(true);
    expect(overflowParentId(overflowNodeId("billing-redesign--wp-invoicing"))).toBe(
      "billing-redesign--wp-invoicing",
    );
  });
});
