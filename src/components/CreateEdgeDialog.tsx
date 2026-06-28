import { useMemo, useState, type FormEvent } from "react";
import {
  compatibleSourceNodes,
  compatibleTargetNodes,
  nodeLabel,
  type GraphNode,
  type LinkTypeMeta,
} from "../lib/graph";

interface CreateEdgeDialogProps {
  open: boolean;
  nodes: GraphNode[];
  linkTypes: LinkTypeMeta[];
  saving: boolean;
  onClose: () => void;
  onCreate: (input: {
    linkType: string;
    source: string;
    target: string;
  }) => void;
}

function sortNodes(nodes: GraphNode[]): GraphNode[] {
  return [...nodes].sort((left, right) =>
    nodeLabel(left.id).localeCompare(nodeLabel(right.id)),
  );
}

export function CreateEdgeDialog({
  open,
  nodes,
  linkTypes,
  saving,
  onClose,
  onCreate,
}: CreateEdgeDialogProps) {
  const [linkType, setLinkType] = useState("");
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");

  const sortedLinkTypes = useMemo(
    () =>
      [...linkTypes].sort((left, right) =>
        left.link_type.localeCompare(right.link_type),
      ),
    [linkTypes],
  );

  const selectedLinkType = sortedLinkTypes.find(
    (item) => item.link_type === linkType,
  );

  const sourceNodes = useMemo(
    () =>
      selectedLinkType
        ? sortNodes(compatibleSourceNodes(nodes, selectedLinkType))
        : [],
    [nodes, selectedLinkType],
  );

  const targetNodes = useMemo(
    () =>
      selectedLinkType
        ? sortNodes(compatibleTargetNodes(nodes, selectedLinkType))
        : [],
    [nodes, selectedLinkType],
  );

  if (!open) {
    return null;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!source || !target || !linkType) {
      return;
    }
    onCreate({ linkType, source, target });
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <dialog
        className="edit-dialog"
        open
        aria-labelledby="create-edge-title"
        onClick={(event) => event.stopPropagation()}
        onClose={onClose}
      >
        <form onSubmit={handleSubmit}>
          <header className="edit-dialog-header">
            <h2 id="create-edge-title">New edge</h2>
            <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>

          <label className="edit-field">
            <span>Link type</span>
            <select
              value={linkType}
              onChange={(event) => {
                setLinkType(event.target.value);
                setSource("");
                setTarget("");
              }}
              required
              disabled={sortedLinkTypes.length === 0}
            >
              <option value="" disabled>
                {sortedLinkTypes.length === 0
                  ? "No link types available"
                  : "Select link type…"}
              </option>
              {sortedLinkTypes.map((item) => (
                <option key={item.link_type} value={item.link_type}>
                  {item.link_type}
                </option>
              ))}
            </select>
          </label>

          <label className="edit-field">
            <span>Source</span>
            <select
              value={source}
              onChange={(event) => setSource(event.target.value)}
              required
              disabled={!selectedLinkType || sourceNodes.length === 0}
            >
              <option value="" disabled>
                {!selectedLinkType
                  ? "Select link type first"
                  : sourceNodes.length === 0
                    ? "No compatible source vertices"
                    : "Select source vertex…"}
              </option>
              {sourceNodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {nodeLabel(node.id)} ({node.type})
                </option>
              ))}
            </select>
          </label>

          <label className="edit-field">
            <span>Target</span>
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              required
              disabled={!selectedLinkType || targetNodes.length === 0}
            >
              <option value="" disabled>
                {!selectedLinkType
                  ? "Select link type first"
                  : targetNodes.length === 0
                    ? "No compatible target vertices"
                    : "Select target vertex…"}
              </option>
              {targetNodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {nodeLabel(node.id)} ({node.type})
                </option>
              ))}
            </select>
          </label>

          <footer className="edit-dialog-actions">
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !linkType || !source || !target || source === target}
            >
              {saving ? "Creating…" : "Create edge"}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
