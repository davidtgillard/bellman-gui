import { nodeTypeColor, nodeTypeLabel } from "../lib/graph";

interface VertexTypeLegendProps {
  types: string[];
  visibleTypes: Set<string>;
  onToggleType: (type: string) => void;
}

export function VertexTypeLegend({
  types,
  visibleTypes,
  onToggleType,
}: VertexTypeLegendProps) {
  if (types.length === 0) {
    return null;
  }

  return (
    <aside className="vertex-legend" aria-label="Vertex types">
      <h2 className="vertex-legend-title">Vertex types</h2>
      <ul className="vertex-legend-list">
        {types.map((type) => {
          const visible = visibleTypes.has(type);
          return (
            <li key={type}>
              <label className={`vertex-legend-item${visible ? "" : " vertex-legend-item-hidden"}`}>
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={() => onToggleType(type)}
                />
                <span
                  className="vertex-legend-swatch"
                  style={{ backgroundColor: nodeTypeColor(type) }}
                  aria-hidden
                />
                <span className="vertex-legend-label">{nodeTypeLabel(type)}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
