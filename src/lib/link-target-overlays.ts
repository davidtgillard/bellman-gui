import type { Core } from "cytoscape";

const RING_PADDING_PX = 6;

/** Screen-space ring for a linkable target node. */
export interface LinkTargetRingVisual {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  glowColor: string;
  borderRadius: string;
}

/**
 * Projects linkable Cytoscape nodes into overlay ring boxes.
 * @param cy - Cytoscape instance.
 * @param targetIds - Node ids that can complete the link.
 * @returns Overlay visuals for currently displayed targets.
 */
export function buildLinkTargetRingVisuals(
  cy: Core,
  targetIds: ReadonlySet<string>,
): LinkTargetRingVisual[] {
  const visuals: LinkTargetRingVisual[] = [];

  for (const id of targetIds) {
    const node = cy.getElementById(id);
    if (node.empty() || node.style("display") === "none") {
      continue;
    }

    const bb = node.renderedBoundingBox({
      includeNodes: true,
      includeLabels: false,
      includeOverlays: false,
    });
    const shape = String(node.style("shape"));
    visuals.push({
      id,
      left: bb.x1 - RING_PADDING_PX,
      top: bb.y1 - RING_PADDING_PX,
      width: bb.w + RING_PADDING_PX * 2,
      height: bb.h + RING_PADDING_PX * 2,
      glowColor: String(node.data("color") ?? "#64748b"),
      borderRadius: shape === "ellipse" ? "50%" : "8px",
    });
  }

  return visuals;
}
