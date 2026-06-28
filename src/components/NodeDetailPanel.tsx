import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { nodeTypeLabel } from "../lib/graph";
import type { NodeDetail } from "../lib/node-detail";

interface NodeDetailPanelProps {
  detail: NodeDetail | null;
  loading: boolean;
  error: string | null;
}

function NodeDetailErrorIcon() {
  return (
    <svg
      className="node-detail-error-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export function NodeDetailPanel({ detail, loading, error }: NodeDetailPanelProps) {
  if (loading) {
    return (
      <div className="node-detail-panel">
        <p className="node-detail-status">Loading node details…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="node-detail-panel">
        <div className="node-detail-error" role="alert">
          <NodeDetailErrorIcon />
          <div className="node-detail-error-body">
            <p className="node-detail-error-title">Could not load node details</p>
            <p className="node-detail-error-message">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="node-detail-panel">
        <p className="node-detail-status">Click a node to inspect its markdown source.</p>
      </div>
    );
  }

  return (
    <div className="node-detail-panel">
      <header className="node-detail-header">
        <span className="node-detail-type">{nodeTypeLabel(detail.nodeType)}</span>
        <h2 className="node-detail-title">{detail.title}</h2>
        <p className="node-detail-id">{detail.nodeId}</p>
        {detail.sourcePath ? (
          <p className="node-detail-source">{detail.sourcePath}</p>
        ) : null}
      </header>
      <article className="node-detail-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.markdown}</ReactMarkdown>
      </article>
    </div>
  );
}
