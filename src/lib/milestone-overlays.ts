import type { Core } from "cytoscape";

export interface MilestoneOverlayVisual {
  id: string;
  label: string;
  date: string | null;
  screenY: number;
  selected: boolean;
}

/**
 * Builds screen-space visuals for visible milestone anchors.
 * Pennants are always drawn at the viewport horizontal center; bands span full width.
 * @param cy - Cytoscape instance.
 * @param visibleNodeIds - Legend visibility filter; when omitted all milestones show.
 * @returns Overlay visuals for each visible milestone.
 */
export function buildMilestoneOverlayVisuals(
  cy: Core,
  visibleNodeIds?: ReadonlySet<string>,
): MilestoneOverlayVisual[] {
  const pan = cy.pan();
  const zoom = cy.zoom();
  const visuals: MilestoneOverlayVisual[] = [];

  cy.nodes().forEach((node) => {
    if (node.data("type") !== "milestone") {
      return;
    }
    const id = node.id();
    if (visibleNodeIds && !visibleNodeIds.has(id)) {
      return;
    }
    if (node.style("display") === "none") {
      return;
    }

    const position = node.position();
    const labelData = String(node.data("label") ?? id);
    const subLabel = node.data("subLabel");
    const date =
      typeof subLabel === "string" && subLabel.trim().length > 0
        ? subLabel.trim()
        : null;
    // Cytoscape label may include "\n" + date; prefer the primary line for the title.
    const label = labelData.split("\n")[0]?.trim() || id;

    visuals.push({
      id,
      label,
      date,
      screenY: position.y * zoom + pan.y,
      selected: node.selected(),
    });
  });

  return visuals;
}
