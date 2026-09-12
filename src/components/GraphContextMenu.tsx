import { isOverflowNodeId } from "../lib/work-package-view";

interface GraphContextMenuProps {
  editable: boolean;
  nodeId?: string;
  nodeType?: string;
  linkId?: string;
  background?: boolean;
  /** When true, restrict create actions to work packages. */
  workPackageGraph?: boolean;
  showInnerGraph?: boolean;
  showWorkPackageInnerGraph?: boolean;
  workPackageInnerGraphAvailable?: boolean;
  onShowInnerGraph?: (projectId: string) => void;
  onShowWorkPackageInnerGraph?: (workPackageId: string) => void;
  onCreateNode?: () => void;
  onCreateChildWorkPackage?: (parentNodeId: string) => void;
  onCreateLink?: (nodeId: string) => void;
  canCreateLink?: boolean;
  onRemoveNode?: (nodeId: string, nodeType: string) => void;
  onConvertToProject?: (nodeId: string, nodeType: string) => void;
  onConvertToInitiative?: (nodeId: string, nodeType: string) => void;
  onRemoveLink?: (linkId: string) => void;
  removeLinkLabel?: string;
  onClose: () => void;
}

export function GraphContextMenu({
  editable,
  nodeId,
  nodeType = "",
  linkId,
  background = false,
  workPackageGraph = false,
  showInnerGraph = false,
  showWorkPackageInnerGraph = false,
  workPackageInnerGraphAvailable = true,
  onShowInnerGraph,
  onShowWorkPackageInnerGraph,
  onCreateNode,
  onCreateChildWorkPackage,
  onCreateLink,
  canCreateLink = true,
  onRemoveNode,
  onConvertToProject,
  onConvertToInitiative,
  onRemoveLink,
  removeLinkLabel = "Remove link",
  onClose,
}: GraphContextMenuProps) {
  const items: Array<{
    label: string;
    onClick: () => void;
    destructive?: boolean;
    disabled?: boolean;
    title?: string;
  }> = [];

  if (editable && background && onCreateNode) {
    items.push({
      label: workPackageGraph ? "New work package…" : "New node…",
      onClick: () => {
        onCreateNode();
        onClose();
      },
    });
  }

  if (
    editable &&
    workPackageGraph &&
    nodeId &&
    nodeType === "work_package" &&
    onCreateChildWorkPackage &&
    !isOverflowNodeId(nodeId)
  ) {
    items.push({
      label: "New child work package…",
      onClick: () => {
        onCreateChildWorkPackage(nodeId);
        onClose();
      },
    });
  }

  if (
    editable &&
    nodeId &&
    onCreateLink &&
    !isOverflowNodeId(nodeId)
  ) {
    items.push({
      label: "New link",
      disabled: !canCreateLink,
      title: canCreateLink
        ? undefined
        : "This node type cannot be linked to any other node",
      onClick: () => {
        onCreateLink(nodeId);
        onClose();
      },
    });
  }

  if (showInnerGraph && nodeId && onShowInnerGraph) {
    items.push({
      label: "Show work package graph",
      onClick: () => {
        onShowInnerGraph(nodeId);
        onClose();
      },
    });
  }

  if (showWorkPackageInnerGraph && nodeId && onShowWorkPackageInnerGraph) {
    items.push({
      label: "Show inner graph",
      disabled: !workPackageInnerGraphAvailable,
      title: workPackageInnerGraphAvailable
        ? undefined
        : "This work package has no sub-packages",
      onClick: () => {
        onShowWorkPackageInnerGraph(nodeId);
        onClose();
      },
    });
  }

  if (
    editable &&
    nodeId &&
    nodeType === "initiative" &&
    onConvertToProject &&
    !isOverflowNodeId(nodeId)
  ) {
    items.push({
      label: "Convert to project",
      onClick: () => {
        onConvertToProject(nodeId, nodeType);
        onClose();
      },
    });
  }

  if (
    editable &&
    nodeId &&
    nodeType === "project" &&
    onConvertToInitiative &&
    !isOverflowNodeId(nodeId)
  ) {
    items.push({
      label: "Convert to initiative",
      onClick: () => {
        onConvertToInitiative(nodeId, nodeType);
        onClose();
      },
    });
  }

  if (editable && nodeId && nodeType && onRemoveNode && !isOverflowNodeId(nodeId)) {
    items.push({
      label: "Remove node",
      destructive: true,
      onClick: () => {
        onRemoveNode(nodeId, nodeType);
        onClose();
      },
    });
  }

  if (editable && linkId && onRemoveLink) {
    items.push({
      label: removeLinkLabel,
      destructive: true,
      onClick: () => {
        onRemoveLink(linkId);
        onClose();
      },
    });
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <menu className="graph-context-menu">
      {items.map((item) => (
        <li key={item.label}>
          <button
            type="button"
            className={item.destructive ? "graph-context-menu-destructive" : undefined}
            disabled={item.disabled}
            title={item.title}
            onClick={item.onClick}
          >
            {item.label}
          </button>
        </li>
      ))}
    </menu>
  );
}
