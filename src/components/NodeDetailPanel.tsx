import type { MutableRefObject } from "react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { nodeTypeLabel } from "../lib/graph";
import type { NodeDetail, DependencyWarning } from "../lib/node-detail";
import {
  classificationsAreValid,
  joinMarkdown,
  issueMentionsAttribute,
  splitClassifications,
  withLegalPins,
  type AttributeAssignment,
} from "../lib/attributes";
import {
  NodeMarkdownEditor,
  type SaveMarkdownOptions,
} from "./NodeMarkdownEditor";
import { WorkPackageEditor, type SaveWorkPackageInput } from "./WorkPackageEditor";
import { ClassificationChips } from "./ClassificationChips";
import { ClassificationsEditor } from "./ClassificationsEditor";

interface NodeDetailPanelProps {
  detail: NodeDetail | null;
  loading: boolean;
  error: string | null;
  editable: boolean;
  editing: boolean;
  saving: boolean;
  saveError: string | null;
  dependencyWarnings?: DependencyWarning[];
  otherIssues?: DependencyWarning[];
  syncSkipped?: boolean;
  roadmapRoot: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveMarkdown: (markdown: string, options?: SaveMarkdownOptions) => void;
  onSaveWorkPackage: (input: SaveWorkPackageInput) => void;
  onDirtyChange: (dirty: boolean) => void;
  onDraftDependenciesChange?: (titles: string[]) => void;
  dependencyToggleRef?: MutableRefObject<(nodeId: string) => void>;
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
  otherIssues = [],
  syncSkipped = false,
  roadmapRoot,
  onStartEdit,
  onCancelEdit,
  onSaveMarkdown,
  onSaveWorkPackage,
  onDirtyChange,
  onDraftDependenciesChange,
  dependencyToggleRef,
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
  const catalog = detail.catalog ?? [];
  const classifications = detail.classifications ?? [];
  const body = splitClassifications(detail.markdown).body;

  return (
    <div className={editing ? "node-detail-panel node-detail-panel-editing" : "node-detail-panel"}>
      <header className="node-detail-header">
        <span className="node-detail-type">{nodeTypeLabel(detail.nodeType)}</span>
        <h2 className="node-detail-title">{detail.title}</h2>
        <p className="node-detail-id">{detail.nodeId}</p>
        {detail.sourcePath ? (
          <p className="node-detail-source">{detail.sourcePath}</p>
        ) : null}
        {!editing ? (
          <ClassificationChips
            nodeType={detail.nodeType}
            catalog={catalog}
            assignments={classifications}
          />
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
          catalog={catalog}
          classifications={classifications}
          nodeType={detail.nodeType}
          saving={saving}
          backendError={saveError}
          dependencyWarnings={dependencyWarnings}
          otherIssues={otherIssues}
          syncSkipped={syncSkipped}
          onSave={onSaveWorkPackage}
          onCancel={onCancelEdit}
          onDirtyChange={onDirtyChange}
          onDraftDependenciesChange={onDraftDependenciesChange}
          dependencyToggleRef={dependencyToggleRef}
        />
      ) : editing ? (
        <MarkdownClassificationEditor
          key={detail.nodeId}
          roadmapRoot={roadmapRoot}
          nodeId={detail.nodeId}
          nodeType={detail.nodeType}
          body={body}
          catalog={catalog}
          classifications={classifications}
          saving={saving}
          saveError={saveError}
          dependencyWarnings={dependencyWarnings}
          otherIssues={otherIssues}
          syncSkipped={syncSkipped}
          onSave={onSaveMarkdown}
          onCancel={onCancelEdit}
          onDirtyChange={onDirtyChange}
        />
      ) : (
        <article className="node-detail-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </article>
      )}
    </div>
  );
}

function MarkdownClassificationEditor({
  roadmapRoot,
  nodeId,
  nodeType,
  body,
  catalog,
  classifications,
  saving,
  saveError,
  dependencyWarnings,
  otherIssues,
  syncSkipped,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  roadmapRoot: string;
  nodeId: string;
  nodeType: string;
  body: string;
  catalog: NodeDetail["catalog"];
  classifications: AttributeAssignment[];
  saving: boolean;
  saveError: string | null;
  dependencyWarnings: DependencyWarning[];
  otherIssues: DependencyWarning[];
  syncSkipped: boolean;
  onSave: (markdown: string, options?: SaveMarkdownOptions) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(classifications);
  const [bodyDirty, setBodyDirty] = useState(false);
  const classDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(classifications),
    [classifications, draft],
  );
  const valid = classificationsAreValid(
    nodeType,
    catalog,
    draft.filter((item) => item.value !== ""),
  );

  useEffect(() => {
    onDirtyChange(bodyDirty || classDirty);
  }, [bodyDirty, classDirty, onDirtyChange]);

  return (
    <div className="node-edit-body">
      <ClassificationsEditor
        nodeType={nodeType}
        catalog={catalog}
        assignments={draft}
        disabled={saving}
        serverIssues={otherIssues}
        onChange={setDraft}
      />
      <NodeMarkdownEditor
        roadmapRoot={roadmapRoot}
        nodeId={nodeId}
        nodeType={nodeType}
        initialMarkdown={body}
        saving={saving}
        backendError={saveError}
        dependencyWarnings={dependencyWarnings}
        otherIssues={otherIssues.filter(
          (issue) => !catalog.some((definition) => issueMentionsAttribute(issue.message, definition.name)),
        )}
        syncSkipped={syncSkipped}
        saveBlocked={!valid}
        extraDirty={classDirty}
        onSave={(markdown, options) =>
          onSave(
            joinMarkdown(
              markdown,
              withLegalPins(
                draft.filter((item) => item.value !== ""),
                catalog,
              ),
              catalog,
            ),
            options,
          )
        }
        onCancel={onCancel}
        onDirtyChange={setBodyDirty}
      />
    </div>
  );
}
