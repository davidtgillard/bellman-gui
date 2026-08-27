import cytoscape from "cytoscape";
import { describe, expect, it } from "vitest";
import {
  applyReferenceZoomToLeafMetrics,
  createCompoundGraphStylesheet,
  DEFAULT_COMPOUND_GRAPH_THEME,
} from "@dgillard/cytoscape-compound-graph";
import {
  applyCompoundLeafCyMetrics,
  compoundReferenceZoomFromCamera,
  finalizeCompoundLeafMetrics,
} from "./compound-leaf-metrics";
import { GRAPH_NODE_LABEL_TYPOGRAPHY } from "./cytoscape-theme";

const LEAF_NODE_DIAMETER = DEFAULT_COMPOUND_GRAPH_THEME.leafNode.diameter;

function leafCy() {
  return cytoscape({
    headless: true,
    styleEnabled: true,
    style: createCompoundGraphStylesheet(),
    elements: [
      {
        data: {
          id: "parent",
          kind: "container",
          compoundWidth: 400,
          compoundHeight: 400,
        },
        position: { x: 0, y: 0 },
      },
      {
        data: {
          id: "child",
          kind: "leaf",
          label: "child",
          nodeWidth: LEAF_NODE_DIAMETER,
          nodeHeight: LEAF_NODE_DIAMETER,
        },
        position: { x: 0, y: 0 },
      },
    ],
  });
}

describe("compound-leaf-metrics", () => {
  it("treats a non-positive camera zoom as unit zoom", () => {
    expect(compoundReferenceZoomFromCamera(0.5)).toBe(0.5);
    expect(compoundReferenceZoomFromCamera(0)).toBe(1);
    expect(compoundReferenceZoomFromCamera(Number.NaN)).toBe(1);
  });

  it("writes overlay leaf size at the fitted zoom before unjam would run", () => {
    const cy = leafCy();
    const fittedZoom = 0.5;
    applyCompoundLeafCyMetrics(cy, fittedZoom);
    expect(cy.getElementById("child").data("nodeWidth")).toBeCloseTo(
      LEAF_NODE_DIAMETER / fittedZoom,
    );
    expect(cy.getElementById("child").data("nodeHeight")).toBeCloseTo(
      LEAF_NODE_DIAMETER / fittedZoom,
    );
    expect(cy.getElementById("child").data("labelMaxWidth")).toBeCloseTo(
      GRAPH_NODE_LABEL_TYPOGRAPHY.textMaxWidthPx / fittedZoom,
    );
    // Live-zoom mapping is frozen, so a later camera change does not shrink leaves.
    expect(applyReferenceZoomToLeafMetrics(cy, fittedZoom)).toBe(false);
    cy.zoom(0.25);
    expect(cy.getElementById("child").data("nodeWidth")).toBeCloseTo(
      LEAF_NODE_DIAMETER / fittedZoom,
    );
  });

  it("does not write 36/1 when the camera is already fitted", () => {
    const cy = leafCy();
    applyCompoundLeafCyMetrics(cy, 0.5);
    expect(cy.getElementById("child").data("nodeWidth")).not.toBe(LEAF_NODE_DIAMETER);
    expect(cy.getElementById("child").data("nodeWidth")).toBeCloseTo(LEAF_NODE_DIAMETER / 0.5);
  });

  it("overwrites a freeze that happened at zoom 1 after a later fit to 0.5", () => {
    const cy = leafCy();
    applyCompoundLeafCyMetrics(cy, 1);
    expect(cy.getElementById("child").data("nodeWidth")).toBeCloseTo(LEAF_NODE_DIAMETER);
    expect(applyReferenceZoomToLeafMetrics(cy, 1)).toBe(false);

    cy.zoom(0.5);
    const referenceZoom = finalizeCompoundLeafMetrics(cy);
    expect(referenceZoom).toBe(0.5);
    expect(cy.getElementById("child").data("nodeWidth")).toBeCloseTo(LEAF_NODE_DIAMETER / 0.5);
    expect(cy.getElementById("child").data("nodeHeight")).toBeCloseTo(LEAF_NODE_DIAMETER / 0.5);
  });
});
