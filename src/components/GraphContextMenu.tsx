interface GraphContextMenuProps {
  editable: boolean;
  nodeId?: string;
  nodeType?: string;
  linkId?: string;
  showInnerGraph?: boolean;
  onShowInnerGraph?: (projectId: string) => void;
  onRemoveNode?: (nodeId: string, nodeType: string) => void;
  onRemoveLink?: (linkId: string) => void;
  onClose: () => void;
}

export function GraphContextMenu({
  editable,
  nodeId,
  nodeType = "",
  linkId,
  showInnerGraph = false,
  onShowInnerGraph,
  onRemoveNode,
  onRemoveLink,
  onClose,
}: GraphContextMenuProps) {
  const items: Array<{ label: string; onClick: () => void; destructive?: boolean }> = [];

  if (showInnerGraph && nodeId && onShowInnerGraph) {
    items.push({
      label: "Show work package graph",
      onClick: () => {
        onShowInnerGraph(nodeId);
        onClose();
      },
    });
  }

  if (editable && nodeId && nodeType && onRemoveNode) {
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
      label: "Remove link",
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
            onClick={item.onClick}
          >
            {item.label}
          </button>
        </li>
      ))}
    </menu>
  );
}
