import { forwardRef } from "react";
import { nodeTypeColor, nodeTypeLabel } from "../lib/graph";

interface NodeTypeLegendProps {
  types: string[];
  visibleTypes: Set<string>;
  onToggleType: (type: string) => void;
  /** When false, keep mounted for measurement but do not display. */
  fits?: boolean;
}

export const NodeTypeLegend = forwardRef<HTMLElement, NodeTypeLegendProps>(
  function NodeTypeLegend(
    { types, visibleTypes, onToggleType, fits = true },
    ref,
  ) {
    if (types.length === 0) {
      return null;
    }

    return (
      <aside
        ref={ref}
        className="node-legend"
        aria-label="Node types"
        aria-hidden={!fits}
        inert={!fits ? true : undefined}
        style={
          fits
            ? undefined
            : { visibility: "hidden", pointerEvents: "none" }
        }
      >
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
      </aside>
    );
  },
);
