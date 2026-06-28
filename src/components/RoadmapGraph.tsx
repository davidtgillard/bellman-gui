import { Suspense, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { GraphCanvas, type GraphCanvasRef } from "reagraph";

interface ReagraphNode {
  id: string;
  label?: string;
  fill?: string;
}

interface ReagraphLink {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface RoadmapGraphProps {
  nodes: ReagraphNode[];
  links: ReagraphLink[];
  emptyMessage?: string;
  focusNodeId?: string | null;
  selectedNodeId?: string | null;
  onNodeClick?: (nodeId: string) => void;
  contextMenu?: (event: {
    data: { id: string; data?: { type?: string } };
    onClose: () => void;
  }) => ReactNode;
}

const FOCUS_DELAY_MS = 450;

function focusGraphOnNode(
  graphRef: RefObject<GraphCanvasRef | null>,
  nodeId: string,
): void {
  graphRef.current?.fitNodesInView([nodeId], { animated: true });
}

export function RoadmapGraph({
  nodes,
  links,
  emptyMessage = "Open a bellman roadmap folder to view its graph.",
  focusNodeId = null,
  selectedNodeId = null,
  onNodeClick,
  contextMenu,
}: RoadmapGraphProps) {
  const graphRef = useRef<GraphCanvasRef>(null);

  useEffect(() => {
    if (!focusNodeId || !nodes.some((node) => node.id === focusNodeId)) {
      return;
    }

    const timer = window.setTimeout(() => {
      focusGraphOnNode(graphRef, focusNodeId);
    }, FOCUS_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [focusNodeId, nodes]);

  if (nodes.length === 0) {
    return (
      <div className="graph-empty">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="graph-container">
      <div className="graph-viewport">
        <Suspense fallback={<div className="graph-empty">Loading graph…</div>}>
          <GraphCanvas
            ref={graphRef}
            nodes={nodes}
            edges={links}
            layoutType="forceDirected2d"
            labelType="all"
            animated
            selections={selectedNodeId ? [selectedNodeId] : []}
            onNodeClick={(node) => onNodeClick?.(node.id)}
            contextMenu={contextMenu}
          />
        </Suspense>
      </div>
    </div>
  );
}
