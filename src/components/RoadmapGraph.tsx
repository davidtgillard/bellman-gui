import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  GraphCanvas,
  type GraphCanvasRef,
  type LayoutOverrides,
  type NodePositionArgs,
} from "reagraph";
import { defaultNodePosition, type NodePosition } from "../lib/graph-layout";

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
    data: {
      id: string;
      source?: string;
      target?: string;
      data?: { type?: string };
      position?: unknown;
    };
    onClose: () => void;
  }) => ReactNode;
  draggable?: boolean;
  nodePositions?: Record<string, NodePosition>;
  onNodePositionChange?: (nodeId: string, position: NodePosition) => void;
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
  draggable = false,
  nodePositions,
  onNodePositionChange,
}: RoadmapGraphProps) {
  const graphRef = useRef<GraphCanvasRef>(null);
  const nodeIds = useMemo(() => nodes.map((node) => node.id), [nodes]);
  const nodePositionsRef = useRef(nodePositions);
  const positionsAppliedRef = useRef(false);
  const [layoutSeed, setLayoutSeed] = useState(0);

  useEffect(() => {
    nodePositionsRef.current = nodePositions;
  }, [nodePositions]);

  useEffect(() => {
    if (!draggable) {
      positionsAppliedRef.current = false;
      return;
    }

    if (Object.keys(nodePositions ?? {}).length === 0) {
      return;
    }

    if (positionsAppliedRef.current) {
      return;
    }

    positionsAppliedRef.current = true;
    setLayoutSeed((current) => current + 1);
  }, [draggable, nodePositions]);

  const layoutOverrides = useMemo(
    () =>
      ({
        getNodePosition: (id: string, { drags }: NodePositionArgs) => {
          const dragPosition = drags?.[id]?.position;
          if (dragPosition) {
            return dragPosition;
          }

          const saved = nodePositionsRef.current?.[id];
          if (saved) {
            return { x: saved.x, y: saved.y, z: 0 };
          }

          const fallback = defaultNodePosition(id, nodeIds);
          return { x: fallback.x, y: fallback.y, z: 0 };
        },
      }) as LayoutOverrides,
    [nodeIds],
  );

  const canvasKey = draggable
    ? `custom:${nodeIds.join(",")}:${layoutSeed}`
    : "force";

  const handleNodeDragged = useCallback(
    (node: { id: string; position: { x: number; y: number } }) => {
      onNodePositionChange?.(node.id, {
        x: node.position.x,
        y: node.position.y,
      });
    },
    [onNodePositionChange],
  );

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
            key={canvasKey}
            ref={graphRef}
            nodes={nodes}
            edges={links}
            layoutType={draggable ? "custom" : "forceDirected2d"}
            layoutOverrides={draggable ? layoutOverrides : undefined}
            labelType="all"
            animated={false}
            draggable={draggable}
            selections={selectedNodeId ? [selectedNodeId] : []}
            onNodeClick={(node) => onNodeClick?.(node.id)}
            onNodeDragged={draggable ? handleNodeDragged : undefined}
            contextMenu={contextMenu}
          />
        </Suspense>
      </div>
    </div>
  );
}
