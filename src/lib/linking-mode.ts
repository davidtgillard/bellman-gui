import type { Core } from "cytoscape";

const LINKING_CLASSES = "link-origin link-target link-dimmed";

/** Canvas linking-mode endpoints used to style Cytoscape elements. */
export interface LinkingModeState {
  originId: string;
  targetIds: ReadonlySet<string>;
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
  cy.batch(() => {
    cy.elements().removeClass(LINKING_CLASSES);
    cy.nodes().forEach((node) => {
      node.selectify();
    });
    if (!linking) {
      return;
    }
    cy.nodes().forEach((node) => {
      const id = node.id();
      if (id === linking.originId) {
        node.addClass("link-origin");
        return;
      }
      if (linking.targetIds.has(id)) {
        node.addClass("link-target");
        return;
      }
      node.addClass("link-dimmed");
      node.unselectify();
    });
    cy.edges().addClass("link-dimmed");
  });
}
