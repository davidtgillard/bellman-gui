import type { Core } from "cytoscape";

const PICK_CLASSES = "link-origin link-target link-dimmed dep-selected";

/** Canvas linking-mode endpoints used to style Cytoscape elements. */
export interface LinkingModeState {
  originId: string;
  targetIds: ReadonlySet<string>;
}

/** Canvas pick-mode endpoints, including optional selected-dependency ids. */
export interface CanvasPickModeState extends LinkingModeState {
  selectedIds?: ReadonlySet<string>;
}

/**
 * Applies or clears canvas pick classes and selectability on a graph.
 * @param cy - Cytoscape instance.
 * @param pick - Active pick session, or null to restore the graph.
 */
export function applyCanvasPickClasses(
  cy: Core,
  pick: CanvasPickModeState | null,
): void {
  cy.batch(() => {
    cy.elements().removeClass(PICK_CLASSES);
    cy.nodes().forEach((node) => {
      node.selectify();
    });
    if (!pick) {
      return;
    }
    cy.nodes().forEach((node) => {
      const id = node.id();
      if (id === pick.originId) {
        node.addClass("link-origin");
        return;
      }
      if (pick.selectedIds?.has(id)) {
        node.addClass("dep-selected");
        return;
      }
      if (pick.targetIds.has(id)) {
        node.addClass("link-target");
        return;
      }
      node.addClass("link-dimmed");
      node.unselectify();
    });
    cy.edges().addClass("link-dimmed");
  });
}

/**
 * Applies or clears click-to-connect classes and selectability on a graph.
 * @param cy - Cytoscape instance.
 * @param linking - Active linking session, or null to restore the graph.
 */
export function applyLinkingModeClasses(
  cy: Core,
  linking: LinkingModeState | null,
): void {
  applyCanvasPickClasses(cy, linking);
}
