import { nodeLabel, type GraphLink } from "../lib/graph";
import {
  inspectKind,
  inspectRelation,
  inspectTitle,
  linkHardnessVisual,
  linkKindColor,
  parseLinkType,
} from "../lib/link-display";

interface LinkDetailPanelProps {
  link: GraphLink;
  editable: boolean;
  onRemove?: (linkId: string) => void;
}

/**
 * Compact inspector for a selected graph link.
 * @param props - Inspector props.
 * @param props.link - Selected graph link.
 * @param props.editable - Whether the roadmap can be edited.
 * @param props.onRemove - Optional remove handler.
 * @returns Inspector panel.
 */
export function LinkDetailPanel({ link, editable, onRemove }: LinkDetailPanelProps) {
  const parsed = parseLinkType(link.linkType);
  const visual = linkHardnessVisual(parsed.kind === "precedes" ? parsed.hardness : null);
  const color = linkKindColor(parsed.kind);

  return (
    <div className="node-detail-panel link-detail-panel">
      <header className="node-detail-header">
        <span className="node-detail-type">{inspectKind(parsed)}</span>
        <h3 className="node-detail-title">{inspectTitle(parsed)}</h3>
      </header>

      <div
        className="link-detail-preview"
        aria-hidden
        style={{
          borderTopStyle: visual.lineStyle,
          borderTopWidth: `${visual.width}px`,
          borderTopColor: color,
          opacity: visual.opacity,
        }}
      />

      <dl className="link-detail-fields">
        {parsed.relation ? (
          <div className="link-detail-field">
            <dt>Relation</dt>
            <dd>{inspectRelation(parsed.relation)}</dd>
          </div>
        ) : null}
        {parsed.hardness ? (
          <div className="link-detail-field">
            <dt>Hardness</dt>
            <dd>{parsed.hardness}</dd>
          </div>
        ) : null}
        <div className="link-detail-field">
          <dt>From</dt>
          <dd>{nodeLabel(link.source)}</dd>
        </div>
        <div className="link-detail-field">
          <dt>To</dt>
          <dd>{nodeLabel(link.target)}</dd>
        </div>
      </dl>

      {editable && onRemove ? (
        <button
          type="button"
          className="link-detail-remove"
          onClick={() => onRemove(link.id)}
        >
          Remove link
        </button>
      ) : null}
    </div>
  );
}
