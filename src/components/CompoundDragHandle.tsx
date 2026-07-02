import type { Core } from "cytoscape";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  collectDragPersistencePositions,
  compoundChromeRenderedBox,
  dragCompoundParentTo,
  snapshotCompoundAncestorLock,
  snapshotSubtreePositions,
} from "../lib/cytoscape-layout";
import type { NodePosition } from "../lib/graph-layout";

function focusGraphContainer(cy: Core): void {
  cy.container()?.closest<HTMLElement>(".graph-container")?.focus({ preventScroll: true });
}

interface HandleRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ActiveDrag {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  zoom: number;
  startParentPosition: NodePosition;
  startPositions: Map<string, NodePosition>;
  ancestorLock: ReturnType<typeof snapshotCompoundAncestorLock> | null;
}

interface CompoundDragHandleProps {
  cy: Core;
  nodeId: string;
  label: string;
  /** Persists the final composite position(s) after a title-bar drag gesture. */
  onDragComplete: (positions: Record<string, NodePosition>) => void;
}

/**
 * Renders a title-bar drag handle just above the selected composite node.
 * Unselected composites rely on direct grab or child-grab promotion instead.
 */
export function CompoundDragHandle({
  cy,
  nodeId,
  label,
  onDragComplete,
}: CompoundDragHandleProps) {
  const [rect, setRect] = useState<HandleRect | null>(null);
  const activeRef = useRef<ActiveDrag | null>(null);
  const frameRef = useRef<number | null>(null);

  const recomputeRect = useCallback(() => {
    const node = cy.getElementById(nodeId);
    if (node.empty() || !node.isParent()) {
      setRect(null);
      return;
    }

    const box = compoundChromeRenderedBox(node);
    const titleHeight = Math.max(18, Math.min(24, 20 * cy.zoom()));
    setRect({
      left: box.x1,
      top: box.y1 - titleHeight,
      width: box.x2 - box.x1,
      height: titleHeight,
    });
  }, [cy, nodeId]);

  useEffect(() => {
    const scheduleRecompute = () => {
      if (frameRef.current !== null) {
        return;
      }
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        recomputeRect();
      });
    };

    recomputeRect();
    cy.on("render zoom drag", scheduleRecompute);
    cy.on("remove", scheduleRecompute);

    return () => {
      cy.removeListener("render zoom drag", scheduleRecompute);
      cy.removeListener("remove", scheduleRecompute);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [cy, recomputeRect]);

  const applyDrag = useCallback(
    (active: ActiveDrag, clientX: number, clientY: number) => {
      const node = cy.getElementById(nodeId);
      if (node.empty() || !node.isParent()) {
        return;
      }

      const dx = (clientX - active.startClientX) / active.zoom;
      const dy = (clientY - active.startClientY) / active.zoom;
      dragCompoundParentTo(
        cy,
        node,
        active.startPositions,
        {
          x: active.startParentPosition.x + dx,
          y: active.startParentPosition.y + dy,
        },
        active.ancestorLock ?? undefined,
      );
      recomputeRect();
    },
    [cy, nodeId, recomputeRect],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const node = cy.getElementById(nodeId);
      if (node.empty() || !node.isParent()) {
        return;
      }

      if (!node.selected()) {
        cy.nodes().unselect();
        node.select();
      }

      event.preventDefault();
      event.stopPropagation();
      focusGraphContainer(cy);
      (event.target as HTMLElement).setPointerCapture(event.pointerId);

      const position = node.position();
      activeRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        zoom: cy.zoom(),
        startParentPosition: { x: position.x, y: position.y },
        startPositions: snapshotSubtreePositions(node),
        ancestorLock: node.isChild() ? snapshotCompoundAncestorLock(node) : null,
      };
    },
    [cy, nodeId],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const active = activeRef.current;
      if (!active) {
        return;
      }
      event.preventDefault();
      applyDrag(active, event.clientX, event.clientY);
    },
    [applyDrag],
  );

  const finishDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const active = activeRef.current;
      if (!active) {
        return;
      }

      applyDrag(active, event.clientX, event.clientY);
      activeRef.current = null;

      const node = cy.getElementById(nodeId);
      if (node.nonempty()) {
        const position = node.position();
        const moved =
          position.x !== active.startParentPosition.x ||
          position.y !== active.startParentPosition.y;
        if (moved) {
          onDragComplete(collectDragPersistencePositions(cy, nodeId));
        }
      }
    },
    [applyDrag, cy, nodeId, onDragComplete],
  );

  if (!rect) {
    return null;
  }

  return (
    <div
      className="compound-drag-handle"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
      title={`Drag ${label}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <span className="compound-drag-handle-label">{label}</span>
    </div>
  );
}
