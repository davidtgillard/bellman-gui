import type { Core } from "cytoscape";
import { useEffect, useState } from "react";
import { NODE_TYPE_COLORS } from "../lib/graph";
import {
  buildMilestoneOverlayVisuals,
  type MilestoneOverlayVisual,
} from "../lib/milestone-overlays";

const MILESTONE_GOLD = NODE_TYPE_COLORS.milestone;

interface MilestoneOverlaysProps {
  cy: Core;
  visibleNodeIds?: ReadonlySet<string>;
  /** Bump to rebuild after selection, drag, or structure changes. */
  revision: number;
}

/**
 * Non-interactive overlay: full-width milestone bands and centered gold pennants.
 * Hit-testing stays on the Cytoscape milestone anchors beneath this layer.
 * @param props - Overlay binding to the Cytoscape graph.
 * @param props.cy - Cytoscape instance for the top-level graph.
 * @param props.visibleNodeIds - Legend visibility filter for milestone nodes.
 * @param props.revision - Counter bumped when selection or structure changes.
 * @returns Overlay layer, or null when no milestones are visible.
 */
export function MilestoneOverlays({
  cy,
  visibleNodeIds,
  revision,
}: MilestoneOverlaysProps) {
  const [visuals, setVisuals] = useState<MilestoneOverlayVisual[]>(() =>
    buildMilestoneOverlayVisuals(cy, visibleNodeIds),
  );

  useEffect(() => {
    const refresh = () => {
      setVisuals(buildMilestoneOverlayVisuals(cy, visibleNodeIds));
    };

    refresh();
    cy.on("viewport", refresh);
    cy.on("resize", refresh);
    cy.on("position", "node", refresh);
    cy.on("select unselect", "node", refresh);

    return () => {
      cy.removeListener("viewport", refresh);
      cy.removeListener("resize", refresh);
      cy.removeListener("position", "node", refresh);
      cy.removeListener("select unselect", "node", refresh);
    };
  }, [cy, visibleNodeIds, revision]);

  if (visuals.length === 0) {
    return null;
  }

  return (
    <div className="milestone-overlays-layer" aria-hidden>
      {visuals.map((visual) => (
        <div
          key={visual.id}
          className={`milestone-overlay${visual.selected ? " is-selected" : ""}`}
          style={{ top: visual.screenY }}
        >
          <div className="milestone-band" />
          <div className="milestone-pennant-cluster">
            <svg
              className="milestone-pennant"
              viewBox="0 0 28 22"
              width={28}
              height={22}
              aria-hidden
            >
              {/* Pole */}
              <line
                x1="3"
                y1="1"
                x2="3"
                y2="21"
                stroke={MILESTONE_GOLD}
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* Pennant flag pointing right */}
              <polygon
                points="4,2 26,11 4,14"
                fill={MILESTONE_GOLD}
                stroke="#a16207"
                strokeWidth="0.75"
                strokeLinejoin="round"
              />
            </svg>
            <div className="milestone-overlay-labels">
              <span className="milestone-overlay-title">{visual.label}</span>
              {visual.date ? (
                <span className="milestone-overlay-date">{visual.date}</span>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
