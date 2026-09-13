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
  /** Visual treatment: link-mode targets or selected dependencies. */
  tone?: "eligible" | "selected";
}

/**
 * Non-interactive rings around canvas pick targets.
 * @param props - Overlay binding to the Cytoscape graph.
 * @param props.cy - Cytoscape instance.
 * @param props.targetIds - Node ids to ring.
 * @param props.revision - Counter bumped when selection or structure changes.
 * @param props.tone - Link-mode eligible targets, or selected dependencies.
 * @returns Overlay layer, or null when no targets are visible.
 */
export function LinkTargetOverlays({
  cy,
  targetIds,
  revision,
  tone = "eligible",
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

  const selected = tone === "selected";

  return (
    <div className="link-target-overlays-layer" aria-hidden>
      {visuals.map((visual) => (
        <div
          key={visual.id}
          className={selected ? "dep-selected-ring" : "link-target-ring"}
          data-link-target-ring={selected ? undefined : visual.id}
          data-dep-selected-ring={selected ? visual.id : undefined}
          style={
            {
              left: visual.left,
              top: visual.top,
              width: visual.width,
              height: visual.height,
              borderRadius: visual.borderRadius,
              "--link-glow-color": selected ? "#4ade80" : visual.glowColor,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
