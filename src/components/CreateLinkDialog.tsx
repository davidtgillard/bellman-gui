import { useMemo, useState, type FormEvent } from "react";
import {
  canBeLinkFinish,
  canBeLinkStart,
  compatibleLinkTypes,
  nodeLabel,
  type GraphNode,
  type LinkTypeMeta,
} from "../lib/graph";
import {
  compatibleHardnesses,
  compatibleRelations,
  inspectRelation,
  kindLabel,
  parseCompatibleLinkTypes,
  resolveLinkTypeId,
  uniqueCompatibleKinds,
  type LinkHardness,
  type LinkKind,
  type LinkRelation,
} from "../lib/link-display";

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

function initialEndpoints(
  initialNodeId: string | null | undefined,
  nodes: GraphNode[],
  linkTypes: LinkTypeMeta[],
): { source: string; target: string } {
  if (!initialNodeId) {
    return { source: "", target: "" };
  }

  const pinnedNode = nodes.find((node) => node.id === initialNodeId);
  if (!pinnedNode) {
    return { source: "", target: "" };
  }

  const asStart = canBeLinkStart(pinnedNode, nodes, linkTypes);
  const asFinish = canBeLinkFinish(pinnedNode, nodes, linkTypes);

  if (!asStart && asFinish) {
    return { source: "", target: initialNodeId };
  }

  return { source: initialNodeId, target: "" };
}

type CreateLinkDialogFormProps = Omit<CreateLinkDialogProps, "open">;

function CreateLinkDialogForm({
  nodes,
  linkTypes,
  saving,
  initialNodeId = null,
  onClose,
  onCreate,
}: CreateLinkDialogFormProps) {
  const [kind, setKind] = useState<LinkKind | "">("");
  const [relation, setRelation] = useState<LinkRelation | "">("");
  const [hardness, setHardness] = useState<LinkHardness | "">("");
  const [source, setSource] = useState(
    () => initialEndpoints(initialNodeId, nodes, linkTypes).source,
  );
  const [target, setTarget] = useState(
    () => initialEndpoints(initialNodeId, nodes, linkTypes).target,
  );

  const startNode = nodes.find((node) => node.id === source);
  const finishNode = nodes.find((node) => node.id === target);

  const pinnedNode =
    initialNodeId !== null
      ? nodes.find((node) => node.id === initialNodeId)
      : undefined;
  const pinnedCanBeStart = pinnedNode
    ? canBeLinkStart(pinnedNode, nodes, linkTypes)
    : false;
  const pinnedCanBeFinish = pinnedNode
    ? canBeLinkFinish(pinnedNode, nodes, linkTypes)
    : false;

  const pinnedStart = initialNodeId !== null && source === initialNodeId;
  const pinnedFinish = initialNodeId !== null && target === initialNodeId;

  const swapDisabled =
    (!source && !target) ||
    (initialNodeId !== null && (!pinnedCanBeStart || !pinnedCanBeFinish));

  const swapTitle = (() => {
    if (!source && !target) {
      return "Swap start and finish nodes";
    }
    if (initialNodeId !== null && !pinnedCanBeStart && pinnedCanBeFinish) {
      return "This node type cannot be the start of a link";
    }
    if (initialNodeId !== null && pinnedCanBeStart && !pinnedCanBeFinish) {
      return "This node type cannot be the finish of a link";
    }
    if (initialNodeId !== null && !pinnedCanBeStart && !pinnedCanBeFinish) {
      return "This node type cannot be linked to any other node";
    }
    return "Swap start and finish nodes";
  })();

  const startNodes = useMemo(() => {
    if (pinnedStart) {
      const pinned = nodes.find((node) => node.id === initialNodeId);
      return pinned ? [pinned] : [];
    }

    const compatible = compatibleStartNodes(nodes, linkTypes, finishNode);
    if (source && !compatible.some((node) => node.id === source)) {
      const selected = nodes.find((node) => node.id === source);
      return selected ? sortNodes([...compatible, selected]) : compatible;
    }
    return compatible;
  }, [finishNode, initialNodeId, linkTypes, nodes, pinnedStart, source]);

  const finishNodes = useMemo(() => {
    if (pinnedFinish) {
      const pinned = nodes.find((node) => node.id === initialNodeId);
      return pinned ? [pinned] : [];
    }

    const compatible = compatibleFinishNodes(nodes, linkTypes, startNode);
    if (target && !compatible.some((node) => node.id === target)) {
      const selected = nodes.find((node) => node.id === target);
      return selected ? sortNodes([...compatible, selected]) : compatible;
    }
    return compatible;
  }, [initialNodeId, linkTypes, nodes, pinnedFinish, startNode, target]);

  const endpointsSelected = Boolean(startNode && finishNode);

  const compatibleTypes = useMemo(() => {
    if (!endpointsSelected) {
      return [];
    }

    return [...compatibleLinkTypes(linkTypes, startNode!.type, finishNode!.type)].sort(
      (left, right) => left.link_type.localeCompare(right.link_type),
    );
  }, [endpointsSelected, finishNode, linkTypes, startNode]);

  const parsedCompatible = useMemo(
    () => parseCompatibleLinkTypes(compatibleTypes),
    [compatibleTypes],
  );
  const kinds = uniqueCompatibleKinds(parsedCompatible);
  const validKind =
    kind && kinds.includes(kind) ? kind : kinds.length === 1 ? kinds[0] : "";
  const relations =
    validKind === "precedes" ? compatibleRelations(parsedCompatible, validKind) : [];
  const validRelation =
    validKind === "precedes"
      ? relation && relations.includes(relation)
        ? relation
        : relations.length === 1
          ? relations[0]
          : ""
      : "";
  const hardnesses =
    validKind === "precedes"
      ? compatibleHardnesses(parsedCompatible, validKind, validRelation || null)
      : [];
  const validHardness =
    validKind === "precedes"
      ? hardness && hardnesses.includes(hardness)
        ? hardness
        : hardnesses.length === 1
          ? hardnesses[0]
          : ""
      : "";
  const validLinkType =
    validKind === "precedes"
      ? resolveLinkTypeId(
          compatibleTypes,
          validKind,
          validRelation || null,
          validHardness || null,
        ) ?? ""
      : validKind
        ? (resolveLinkTypeId(compatibleTypes, validKind) ?? "")
        : "";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!source || !target || !validLinkType) {
      return;
    }
    onCreate({ linkType: validLinkType, source, target });
  };

  const handleSwapEndpoints = () => {
    setSource(target);
    setTarget(source);
  };

  const renderEndpointValue = (node: GraphNode) =>
    `${nodeLabel(node.id)} (${node.type})`;

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
              {pinnedStart && startNode ? (
                <div className="link-endpoint-fixed">{renderEndpointValue(startNode)}</div>
              ) : (
                <select
                  id="create-link-start"
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
                      {renderEndpointValue(node)}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <button
              type="button"
              className="link-endpoint-swap"
              onClick={handleSwapEndpoints}
              disabled={swapDisabled}
              aria-label={swapTitle}
              title={swapTitle}
            >
              ⇄
            </button>

            <label className="edit-field link-endpoint-field">
              <span>Finish node</span>
              {pinnedFinish && finishNode ? (
                <div className="link-endpoint-fixed">{renderEndpointValue(finishNode)}</div>
              ) : (
                <select
                  id="create-link-finish"
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
                      {renderEndpointValue(node)}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>

          <label className="edit-field">
            <span>Kind</span>
            <select
              id="create-link-kind"
              value={validKind}
              onChange={(event) => {
                setKind(event.target.value as LinkKind);
                setRelation("");
                setHardness("");
              }}
              required
              disabled={!endpointsSelected || kinds.length === 0}
            >
              <option value="" disabled>
                {!endpointsSelected
                  ? "Select start and finish nodes first"
                  : kinds.length === 0
                    ? "No compatible link types"
                    : "Select kind…"}
              </option>
              {kinds.map((item) => (
                <option key={item} value={item}>
                  {kindLabel(item)}
                </option>
              ))}
            </select>
          </label>

          {validKind === "precedes" ? (
            <>
              <label className="edit-field">
                <span>Relation</span>
                <select
                  id="create-link-relation"
                  value={validRelation}
                  onChange={(event) =>
                    setRelation(event.target.value as LinkRelation)
                  }
                  required
                  disabled={relations.length === 0}
                >
                  <option value="" disabled>
                    Select relation…
                  </option>
                  {relations.map((item) => (
                    <option key={item} value={item}>
                      {inspectRelation(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="edit-field">
                <span>Hardness</span>
                <select
                  id="create-link-hardness"
                  value={validHardness}
                  onChange={(event) =>
                    setHardness(event.target.value as LinkHardness)
                  }
                  required
                  disabled={hardnesses.length === 0}
                >
                  <option value="" disabled>
                    Select hardness…
                  </option>
                  {hardnesses.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          <footer className="edit-dialog-actions">
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                saving || !validLinkType || !source || !target || source === target
              }
            >
              {saving ? "Creating…" : "Create link"}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}

export function CreateLinkDialog({
  open,
  initialNodeId = null,
  ...formProps
}: CreateLinkDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <CreateLinkDialogForm
      key={initialNodeId ?? ""}
      initialNodeId={initialNodeId}
      {...formProps}
    />
  );
}
