import { nodeTypeColor, nodeTypeLabel } from "../lib/graph";

interface NodeTypeLegendProps {
  types: string[];
  visibleTypes: Set<string>;
  onToggleType: (type: string) => void;
}

export function NodeTypeLegend({
  types,
  visibleTypes,
  onToggleType,
}: NodeTypeLegendProps) {
  if (types.length === 0) {
    return null;
  }

  return (
    <aside className="node-legend" aria-label="Node types">
      <h2 className="node-legend-title">Node types</h2>
      <ul className="node-legend-list">
        {types.map((type) => {
          const visible = visibleTypes.has(type);
          return (
            <li key={type}>
              <label className={`node-legend-item${visible ? "" : " node-legend-item-hidden"}`}>
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={() => onToggleType(type)}
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
}
