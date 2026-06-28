interface GraphNodeContextMenuProps {
  nodeId: string;
  nodeType: string;
  onShowInnerGraph: (projectId: string) => void;
  onClose: () => void;
}

export function GraphNodeContextMenu({
  nodeId,
  nodeType,
  onShowInnerGraph,
  onClose,
}: GraphNodeContextMenuProps) {
  if (nodeType !== "project") {
    return null;
  }

  return (
    <menu className="graph-context-menu">
      <li>
        <button
          type="button"
          onClick={() => {
            onShowInnerGraph(nodeId);
            onClose();
          }}
        >
          Show work package graph
        </button>
      </li>
    </menu>
  );
}
