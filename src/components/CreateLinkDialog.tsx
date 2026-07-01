import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  compatibleLinkTypes,
  nodeLabel,
  type GraphNode,
  type LinkTypeMeta,
} from "../lib/graph";

interface CreateLinkDialogProps {
  open: boolean;
  nodes: GraphNode[];
  linkTypes: LinkTypeMeta[];
  saving: boolean;
  initialNodeId?: string | null;
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

function compatibleStartNodes(
  nodes: GraphNode[],
  linkTypes: LinkTypeMeta[],
  finishNode: GraphNode | undefined,
): GraphNode[] {
  if (!finishNode) {
    return sortNodes(nodes);
  }

  return sortNodes(
    nodes.filter(
      (node) =>
        node.id !== finishNode.id &&
        compatibleLinkTypes(linkTypes, node.type, finishNode.type).length > 0,
    ),
  );
}

function compatibleFinishNodes(
  nodes: GraphNode[],
  linkTypes: LinkTypeMeta[],
  startNode: GraphNode | undefined,
): GraphNode[] {
  if (!startNode) {
    return sortNodes(nodes);
  }

  return sortNodes(
    nodes.filter(
      (node) =>
        node.id !== startNode.id &&
        compatibleLinkTypes(linkTypes, startNode.type, node.type).length > 0,
    ),
  );
}

export function CreateLinkDialog({
  open,
  nodes,
  linkTypes,
  saving,
  initialNodeId = null,
  onClose,
  onCreate,
}: CreateLinkDialogProps) {
  const [linkType, setLinkType] = useState("");
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setLinkType("");
    setSource(initialNodeId ?? "");
    setTarget("");
  }, [initialNodeId, open]);

  const startNode = nodes.find((node) => node.id === source);
  const finishNode = nodes.find((node) => node.id === target);

  const startNodes = useMemo(() => {
    const compatible = compatibleStartNodes(nodes, linkTypes, finishNode);
    if (source && !compatible.some((node) => node.id === source)) {
      const selected = nodes.find((node) => node.id === source);
      return selected ? sortNodes([...compatible, selected]) : compatible;
    }
    return compatible;
  }, [finishNode, linkTypes, nodes, source]);

  const finishNodes = useMemo(() => {
    const compatible = compatibleFinishNodes(nodes, linkTypes, startNode);
    if (target && !compatible.some((node) => node.id === target)) {
      const selected = nodes.find((node) => node.id === target);
      return selected ? sortNodes([...compatible, selected]) : compatible;
    }
    return compatible;
  }, [linkTypes, nodes, startNode, target]);

  const compatibleTypes = useMemo(() => {
    if (!startNode || !finishNode) {
      return [];
    }

    return [...compatibleLinkTypes(linkTypes, startNode.type, finishNode.type)].sort(
      (left, right) => left.link_type.localeCompare(right.link_type),
    );
  }, [finishNode, linkTypes, startNode]);

  useEffect(() => {
    if (!linkType) {
      return;
    }

    if (!compatibleTypes.some((item) => item.link_type === linkType)) {
      setLinkType("");
    }
  }, [compatibleTypes, linkType]);

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

  const handleSwapEndpoints = () => {
    setSource(target);
    setTarget(source);
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <dialog
        className="edit-dialog"
        open
        aria-labelledby="create-link-title"
        onClick={(event) => event.stopPropagation()}
        onClose={onClose}
      >
        <form onSubmit={handleSubmit}>
          <header className="edit-dialog-header">
            <h2 id="create-link-title">New link</h2>
            <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>

          <div className="link-endpoints">
            <label className="edit-field link-endpoint-field">
              <span>Start node</span>
              <select
                value={source}
                onChange={(event) => setSource(event.target.value)}
                required
                disabled={startNodes.length === 0}
              >
                <option value="" disabled>
                  {startNodes.length === 0
                    ? "No compatible start nodes"
                    : "Select start node…"}
                </option>
                {startNodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {nodeLabel(node.id)} ({node.type})
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="link-endpoint-swap"
              onClick={handleSwapEndpoints}
              disabled={!source && !target}
              aria-label="Swap start and finish nodes"
              title="Swap start and finish nodes"
            >
              ⇄
            </button>

            <label className="edit-field link-endpoint-field">
              <span>Finish node</span>
              <select
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                required
                disabled={finishNodes.length === 0}
              >
                <option value="" disabled>
                  {finishNodes.length === 0
                    ? "No compatible finish nodes"
                    : "Select finish node…"}
                </option>
                {finishNodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {nodeLabel(node.id)} ({node.type})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="edit-field">
            <span>Link type</span>
            <select
              value={linkType}
              onChange={(event) => setLinkType(event.target.value)}
              required
              disabled={!startNode || !finishNode || compatibleTypes.length === 0}
            >
              <option value="" disabled>
                {!startNode || !finishNode
                  ? "Select start and finish nodes first"
                  : compatibleTypes.length === 0
                    ? "No compatible link types"
                    : "Select link type…"}
              </option>
              {compatibleTypes.map((item) => (
                <option key={item.link_type} value={item.link_type}>
                  {item.link_type}
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
              {saving ? "Creating…" : "Create link"}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
