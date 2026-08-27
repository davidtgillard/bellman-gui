import type { Core } from "cytoscape";
import {
  applyReferenceZoomToLeafMetrics,
  leafDomVisualStyle,
  type LeafDomVisualStyle,
} from "@dgillard/cytoscape-compound-graph";
import { BELLMAN_COMPOUND_GRAPH_THEME, GRAPH_NODE_LABEL_TYPOGRAPHY } from "./cytoscape-theme";

/**
 * Cytoscape zoom to freeze leaf model sizes against. Non-positive zoom is treated as 1.
 * @param zoom - Live camera zoom from `cy.zoom()`.
 * @returns Fitted reference zoom used for `cssDiameter / zoom` leaf metrics.
 */
export function compoundReferenceZoomFromCamera(zoom: number): number {
  return zoom > 0 ? zoom : 1;
}

/**
 * Writes zoom-compensated leaf diameters and label metrics into Cytoscape, then freezes
 * live-zoom stylesheet mapping. Unconditionally overwrites `nodeWidth` / `nodeHeight`, so
 * it can correct a freeze that happened at the wrong zoom. Call after the last `cy.fit()`.
 * @param cy - Cytoscape instance with `kind = 'leaf'` nodes.
 * @param referenceZoom - Fitted viewport zoom (screen px / this = model units).
 * @param visual - Screen-pixel leaf style; defaults to the Bellman theme (CSS 36px).
 */
export function applyCompoundLeafCyMetrics(
  cy: Core,
  referenceZoom: number,
  visual: LeafDomVisualStyle = leafDomVisualStyle(BELLMAN_COMPOUND_GRAPH_THEME),
): void {
  const zoom = referenceZoom > 0 ? referenceZoom : 1;
  cy.batch(() => {
    cy.nodes("[kind = 'leaf']").forEach((node) => {
      node.data("labelFontSize", visual.fontSize / zoom);
      node.data("labelFontFamily", visual.fontFamily);
      node.data("labelFontWeight", visual.fontWeight);
      node.data("labelColor", visual.color);
      node.data("labelOutlineWidth", visual.labelOutlineWidth / zoom);
      node.data("labelOutlineColor", visual.labelOutlineColor);
      node.data(
        "labelMarginY",
        (visual.labelMarginY + visual.labelOutlineWidth) / zoom,
      );
      node.data("nodeWidth", visual.nodeWidth / zoom);
      node.data("nodeHeight", visual.nodeHeight / zoom);
      node.data("labelMaxWidth", GRAPH_NODE_LABEL_TYPOGRAPHY.textMaxWidthPx / zoom);
      node.data("selectionOutlineWidth", visual.selectionOutlineWidth / zoom);
      node.data("selectionOutlineColor", visual.selectionOutlineColor);
    });
  });
  applyReferenceZoomToLeafMetrics(cy, zoom);
}

/**
 * Applies overlay leaf metrics at the live camera zoom. Use after initialize/unjam and
 * the last viewport fit so on-screen diameter is `cssDiameter`, not `cssDiameter * zoom`.
 * @param cy - Cytoscape instance whose camera is already fitted.
 * @param visual - Screen-pixel leaf style; defaults to the Bellman theme (CSS 36px).
 * @returns Reference zoom written into leaf data.
 */
export function finalizeCompoundLeafMetrics(
  cy: Core,
  visual?: LeafDomVisualStyle,
): number {
  const referenceZoom = compoundReferenceZoomFromCamera(cy.zoom());
  applyCompoundLeafCyMetrics(cy, referenceZoom, visual);
  return referenceZoom;
}
