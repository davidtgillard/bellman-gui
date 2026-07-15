import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { nodeTypeLabel } from "../lib/graph";
import type { NodeDetail, DependencyWarning } from "../lib/node-detail";
import {
  NodeMarkdownEditor,
  type SaveMarkdownOptions,
} from "./NodeMarkdownEditor";
import { WorkPackageEditor } from "./WorkPackageEditor";

interface NodeDetailPanelProps {
  detail: NodeDetail | null;
  loading: boolean;
  error: string | null;
  editable: boolean;
  editing: boolean;
  saving: boolean;
  saveError: string | null;
  dependencyWarnings?: DependencyWarning[];
  syncSkipped?: boolean;
  roadmapRoot: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveMarkdown: (markdown: string, options?: SaveMarkdownOptions) => void;
  onSaveWorkPackage: (input: { description: string; dependencies: string[] }) => void;
  onDirtyChange: (dirty: boolean) => void;
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

export function NodeDetailPanel({
  detail,
  loading,
  error,
  editable,
  editing,
  saving,
  saveError,
  dependencyWarnings = [],
  syncSkipped = false,
  roadmapRoot,
  onStartEdit,
  onCancelEdit,
  onSaveMarkdown,
  onSaveWorkPackage,
  onDirtyChange,
}: NodeDetailPanelProps) {
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

  const isWorkPackage = detail.nodeType === "work_package";
  const canEdit = editable && (!isWorkPackage || detail.workPackage !== null);

  return (
    <div className={editing ? "node-detail-panel node-detail-panel-editing" : "node-detail-panel"}>
      <header className="node-detail-header">
        <span className="node-detail-type">{nodeTypeLabel(detail.nodeType)}</span>
        <h2 className="node-detail-title">{detail.title}</h2>
        <p className="node-detail-id">{detail.nodeId}</p>
        {detail.sourcePath ? (
          <p className="node-detail-source">{detail.sourcePath}</p>
        ) : null}
        {canEdit && !editing ? (
          <button type="button" className="node-detail-edit" onClick={onStartEdit}>
            Edit
          </button>
        ) : null}
      </header>

      {editing && isWorkPackage && detail.workPackage ? (
        <WorkPackageEditor
          key={detail.nodeId}
          workPackage={detail.workPackage}
          saving={saving}
          backendError={saveError}
          onSave={onSaveWorkPackage}
          onCancel={onCancelEdit}
          onDirtyChange={onDirtyChange}
        />
      ) : editing ? (
        <NodeMarkdownEditor
          key={detail.nodeId}
          roadmapRoot={roadmapRoot}
          nodeId={detail.nodeId}
          nodeType={detail.nodeType}
          initialMarkdown={detail.markdown}
          saving={saving}
          backendError={saveError}
          dependencyWarnings={dependencyWarnings}
          syncSkipped={syncSkipped}
          onSave={onSaveMarkdown}
          onCancel={onCancelEdit}
          onDirtyChange={onDirtyChange}
        />
      ) : (
        <article className="node-detail-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.markdown}</ReactMarkdown>
        </article>
      )}
    </div>
  );
}
