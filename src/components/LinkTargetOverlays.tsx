import type { Core } from "cytoscape";
import { useEffect, useState, type CSSProperties } from "react";
import {
  buildLinkTargetRingVisuals,
  type LinkTargetRingVisual,
} from "../lib/link-target-overlays";

interface LinkTargetOverlaysProps {
  cy: Core;
  targetIds: ReadonlySet<string>;
  revision: number;
}

/**
 * Non-interactive mint rings around nodes that can complete a new link.
 * @param props - Overlay binding to the Cytoscape graph.
 * @param props.cy - Cytoscape instance.
 * @param props.targetIds - Node ids that can complete the link.
 * @param props.revision - Counter bumped when selection or structure changes.
 * @returns Overlay layer, or null when no targets are visible.
 */
export function LinkTargetOverlays({
  cy,
  targetIds,
  revision,
}: LinkTargetOverlaysProps) {
  const [visuals, setVisuals] = useState<LinkTargetRingVisual[]>(() =>
    buildLinkTargetRingVisuals(cy, targetIds),
  );

  useEffect(() => {
    const refresh = () => {
      setVisuals(buildLinkTargetRingVisuals(cy, targetIds));
    };

    refresh();
    cy.on("viewport", refresh);
    cy.on("resize", refresh);
    cy.on("position", "node", refresh);

    return () => {
      cy.removeListener("viewport", refresh);
      cy.removeListener("resize", refresh);
      cy.removeListener("position", "node", refresh);
    };
  }, [cy, targetIds, revision]);

  if (visuals.length === 0) {
    return null;
  }

  return (
    <div className="link-target-overlays-layer" aria-hidden>
      {visuals.map((visual) => (
        <div
          key={visual.id}
          className="link-target-ring"
          data-link-target-ring={visual.id}
          style={
            {
              left: visual.left,
              top: visual.top,
              width: visual.width,
              height: visual.height,
              borderRadius: visual.borderRadius,
              "--link-glow-color": visual.glowColor,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
