import { forwardRef } from "react";
import { nodeTypeColor, nodeTypeLabel } from "../lib/graph";
import {
  LINK_HARDNESS_ORDER,
  kindLabel,
  linkHardnessVisual,
  linkKindColor,
  type LinkKind,
} from "../lib/link-display";

interface NodeTypeLegendProps {
  types: string[];
  visibleTypes: Set<string>;
  onToggleType: (type: string) => void;
  /** When false, keep mounted for measurement but do not display. */
  fits?: boolean;
  /** Relationship kinds present in the current graph. */
  linkKinds?: LinkKind[];
  /** When true, show the Mandatory / Discretionary / Optional stroke key. */
  showHardness?: boolean;
}

export const NodeTypeLegend = forwardRef<HTMLElement, NodeTypeLegendProps>(
  function NodeTypeLegend(
    {
      types,
      visibleTypes,
      onToggleType,
      fits = true,
      linkKinds = [],
      showHardness = true,
    },
    ref,
  ) {
    const showNodes = types.length > 0;
    const showLinks = showHardness || linkKinds.length > 0;
    if (!showNodes && !showLinks) {
      return null;
    }

    return (
      <aside
        ref={ref}
        className="node-legend"
        aria-label={showNodes ? "Node types" : "Links"}
        aria-hidden={!fits}
        inert={!fits ? true : undefined}
        style={
          fits
            ? undefined
            : { visibility: "hidden", pointerEvents: "none" }
        }
      >
        {showNodes ? (
          <>
            <h2 className="node-legend-title">Node types</h2>
            <ul className="node-legend-list">
              {types.map((type) => {
                const visible = visibleTypes.has(type);
                return (
                  <li key={type}>
                    <label
                      className={`node-legend-item${visible ? "" : " node-legend-item-hidden"}`}
                    >
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={() => onToggleType(type)}
                        tabIndex={fits ? undefined : -1}
                      />
                      <span
                        className="node-legend-swatch"
                        style={{ backgroundColor: nodeTypeColor(type) }}
                        aria-hidden
                      />
                      <span className="node-legend-label">{nodeTypeLabel(type)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {showLinks ? (
          <>
            <h2 className={`node-legend-title${showNodes ? " node-legend-title-follow" : ""}`}>
              Links
            </h2>
            <ul className="node-legend-list">
              {showHardness
                ? LINK_HARDNESS_ORDER.map((hardness) => {
                    const visual = linkHardnessVisual(hardness);
                    return (
                      <li key={hardness} className="node-legend-key">
                        <span
                          className="node-legend-stroke"
                          style={{
                            borderTopStyle: visual.lineStyle,
                            borderTopWidth: `${visual.width}px`,
                            opacity: visual.opacity,
                          }}
                          aria-hidden
                        />
                        <span className="node-legend-label">{hardness}</span>
                      </li>
                    );
                  })
                : null}
              {linkKinds.map((kind) => (
                <li key={kind} className="node-legend-key">
                  <span
                    className="node-legend-stroke"
                    style={{ borderTopColor: linkKindColor(kind) }}
                    aria-hidden
                  />
                  <span className="node-legend-label">{kindLabel(kind)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </aside>
    );
  },
);
