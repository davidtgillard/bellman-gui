import type { Core, NodeSingular } from "cytoscape";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { compoundChromeRenderedBox, redrawGraphSynchronously } from "../lib/cytoscape-layout";
import {
  COMPOUND_MIN_HEIGHT,
  COMPOUND_MIN_WIDTH,
  COMPOUND_PADDING,
} from "../lib/cytoscape-theme";
import type { NodePosition } from "../lib/graph-layout";

type Corner = "nw" | "ne" | "sw" | "se";

const HANDLE_SIZE = 12;
const HANDLE_GAP = 8;

const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];

const CORNER_CURSOR: Record<Corner, string> = {
  nw: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  se: "nwse-resize",
};

interface ModelBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface HandleRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function focusGraphContainer(cy: Core): void {
  cy.container()?.closest<HTMLElement>(".graph-container")?.focus({ preventScroll: true });
}

interface ActiveResize {
  corner: Corner;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  zoom: number;
  startBox: ModelBox;
  childrenBox: ModelBox | null;
}

interface CompoundResizeHandlesProps {
  cy: Core;
  nodeId: string;
  /** Persists the final composite position and size after a resize gesture. */
  onResizeComplete: (nodeId: string, position: NodePosition) => void;
}

function modelBox(node: NodeSingular): ModelBox {
  const box = node.boundingBox({ includeLabels: false, includeOverlays: false });
  return { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 };
}

function childrenModelBox(node: NodeSingular): ModelBox | null {
  const children = node.children();
  if (children.empty()) {
    return null;
  }
  const box = children.boundingBox({ includeLabels: true, includeOverlays: false });
  return { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 };
}

/**
 * Computes the new composite box for a corner drag, clamped so the box always
 * contains its children (plus padding) and respects the minimum size.
 * @param active - The in-progress resize gesture state.
 * @param dxModel - Horizontal pointer delta in model units.
 * @param dyModel - Vertical pointer delta in model units.
 * @returns The resized box in model coordinates.
 */
export function resizedCompoundBox(
  active: Pick<ActiveResize, "corner" | "startBox" | "childrenBox">,
  dxModel: number,
  dyModel: number,
): ModelBox {
  const { corner, startBox, childrenBox } = active;
  let { x1, y1, x2, y2 } = startBox;

  const movesEast = corner === "ne" || corner === "se";
  const movesWest = corner === "nw" || corner === "sw";
  const movesNorth = corner === "nw" || corner === "ne";
  const movesSouth = corner === "sw" || corner === "se";

  if (movesEast) {
    x2 = startBox.x2 + dxModel;
    const minRight = Math.max(
      x1 + COMPOUND_MIN_WIDTH,
      childrenBox ? childrenBox.x2 + COMPOUND_PADDING.right : x1 + COMPOUND_MIN_WIDTH,
    );
    x2 = Math.max(x2, minRight);
  }
  if (movesWest) {
    x1 = startBox.x1 + dxModel;
    const maxLeft = Math.min(
      x2 - COMPOUND_MIN_WIDTH,
      childrenBox ? childrenBox.x1 - COMPOUND_PADDING.left : x2 - COMPOUND_MIN_WIDTH,
    );
    x1 = Math.min(x1, maxLeft);
  }
  if (movesSouth) {
    y2 = startBox.y2 + dyModel;
    const minBottom = Math.max(
      y1 + COMPOUND_MIN_HEIGHT,
      childrenBox ? childrenBox.y2 + COMPOUND_PADDING.bottom : y1 + COMPOUND_MIN_HEIGHT,
    );
    y2 = Math.max(y2, minBottom);
  }
  if (movesNorth) {
    y1 = startBox.y1 + dyModel;
    const maxTop = Math.min(
      y2 - COMPOUND_MIN_HEIGHT,
      childrenBox ? childrenBox.y1 - COMPOUND_PADDING.top : y2 - COMPOUND_MIN_HEIGHT,
    );
    y1 = Math.min(y1, maxTop);
  }

  return { x1, y1, x2, y2 };
}

/**
 * Renders corner resize handles over the selected composite node and applies the
 * new size directly to the Cytoscape node while dragging. This is the only way a
 * composite may be resized; ordinary dragging never changes its dimensions.
 * @param props - The Cytoscape core, target node id, and completion callback.
 * @returns Absolutely-positioned corner handles, or null when not applicable.
 */
export function CompoundResizeHandles({
  cy,
  nodeId,
  onResizeComplete,
}: CompoundResizeHandlesProps) {
  const [rect, setRect] = useState<HandleRect | null>(null);
  const activeRef = useRef<ActiveResize | null>(null);
  const frameRef = useRef<number | null>(null);

  const recomputeRect = useCallback(() => {
    const node = cy.getElementById(nodeId);
    if (node.empty() || !node.isParent()) {
      setRect(null);
      return;
    }
    const box = compoundChromeRenderedBox(node);
    setRect({
      left: box.x1,
      top: box.y1,
      width: box.x2 - box.x1,
      height: box.y2 - box.y1,
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

  const applyResize = useCallback(
    (active: ActiveResize, clientX: number, clientY: number) => {
      const node = cy.getElementById(nodeId);
      if (node.empty() || !node.isParent()) {
        return;
      }

      const dxModel = (clientX - active.startClientX) / active.zoom;
      const dyModel = (clientY - active.startClientY) / active.zoom;
      const box = resizedCompoundBox(active, dxModel, dyModel);
      const width = box.x2 - box.x1;
      const height = box.y2 - box.y1;

      cy.batch(() => {
        node.data("compoundWidth", width);
        node.data("compoundHeight", height);
        node.position({ x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 });
      });
      redrawGraphSynchronously(cy);
      recomputeRect();
    },
    [cy, nodeId, recomputeRect],
  );

  const handlePointerDown = useCallback(
    (corner: Corner) => (event: ReactPointerEvent<HTMLDivElement>) => {
      const node = cy.getElementById(nodeId);
      if (node.empty() || !node.isParent()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      focusGraphContainer(cy);
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      activeRef.current = {
        corner,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        zoom: cy.zoom(),
        startBox: modelBox(node),
        childrenBox: childrenModelBox(node),
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
      applyResize(active, event.clientX, event.clientY);
    },
    [applyResize],
  );

  const finishResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const active = activeRef.current;
      if (!active) {
        return;
      }
      applyResize(active, event.clientX, event.clientY);
      activeRef.current = null;

      const node = cy.getElementById(nodeId);
      if (node.nonempty() && node.isParent()) {
        const position = node.position();
        onResizeComplete(nodeId, {
          x: position.x,
          y: position.y,
          w: Number(node.data("compoundWidth")),
          h: Number(node.data("compoundHeight")),
        });
      }
    },
    [applyResize, cy, nodeId, onResizeComplete],
  );

  if (!rect) {
    return null;
  }

  return (
    <>
      {CORNERS.map((corner) => {
        const isEast = corner === "ne" || corner === "se";
        const isSouth = corner === "sw" || corner === "se";
        const left = isEast
          ? rect.left + rect.width + HANDLE_GAP
          : rect.left - HANDLE_GAP - HANDLE_SIZE;
        const top = isSouth
          ? rect.top + rect.height + HANDLE_GAP
          : rect.top - HANDLE_GAP - HANDLE_SIZE;
        return (
          <div
            key={corner}
            className="compound-resize-handle"
            data-corner={corner}
            style={{
              left,
              top,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              cursor: CORNER_CURSOR[corner],
            }}
            onPointerDown={handlePointerDown(corner)}
            onPointerMove={handlePointerMove}
            onPointerUp={finishResize}
            onPointerCancel={finishResize}
          />
        );
      })}
    </>
  );
}
