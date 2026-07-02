import cytoscape from "cytoscape";
import { describe, expect, it } from "vitest";
import {
  dragCompoundParentTo,
  snapshotSubtreePositions,
} from "./cytoscape-layout";
import { CYTOSCAPE_STYLESHEET } from "./cytoscape-theme";

function makeCompoundCy(): cytoscape.Core {
  return cytoscape({
    headless: true,
    style: CYTOSCAPE_STYLESHEET,
    elements: [
      {
        data: {
          id: "parent",
          label: "parent",
          compoundWidth: 420,
          compoundHeight: 280,
        },
        position: { x: 100, y: 200 },
      },
      {
        data: { id: "child-a", label: "child-a", parent: "parent" },
        position: { x: -90, y: -30 },
      },
      {
        data: { id: "child-b", label: "child-b", parent: "parent" },
        position: { x: 90, y: -30 },
      },
    ],
  });
}

describe("dragCompoundParentTo integration", () => {
  it("batch parent and child position updates together", () => {
    const cy = makeCompoundCy();
    const parent = cy.getElementById("parent");
    const childA = cy.getElementById("child-a");
    cy.batch(() => {
      parent.position({ x: 150, y: 170 });
      childA.position({ x: -90, y: -30 });
      cy.getElementById("child-b").position({ x: 90, y: -30 });
    });
    expect(parent.position().x).toBeCloseTo(150, 5);
    expect(childA.position().x).toBeCloseTo(-90, 5);
  });

  it("translates after explicit child positions are established", () => {
    const cy = makeCompoundCy();
    const parent = cy.getElementById("parent");
    const childA = cy.getElementById("child-a");
    cy.batch(() => {
      childA.position({ x: -90, y: -30 });
      cy.getElementById("child-b").position({ x: 90, y: -30 });
    });
    const start = snapshotSubtreePositions(parent);
    dragCompoundParentTo(cy, parent, start, { x: 150, y: 170 });
    expect(parent.position().x).toBeCloseTo(150, 5);
    expect(childA.position().x).toBeCloseTo(-90, 5);
  });
});
