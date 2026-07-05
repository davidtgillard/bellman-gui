import type { Core } from "cytoscape";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { BELLMAN_COMPOUND_GRAPH_THEME } from "../lib/cytoscape-theme";
import {
  leafDomVisualStyle,
  type ChildDragVisual,
  type CompoundGraphScene,
  type LeafDomVisualStyle,
  type ParentDragVisual,
  type ResizeChildConstraints,
  type ResizeCorner,
} from "@dgillard/cytoscape-compound-graph";
import type { NodePosition } from "../lib/graph-layout";

const CORNERS: ResizeCorner[] = ["nw", "ne", "sw", "se"];
const HANDLE_SIZE = 12;
const HANDLE_GAP = 8;
const RESIZE_MOVE_THRESHOLD_PX = 2;

const CORNER_CURSOR: Record<ResizeCorner, string> = {
  nw: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  se: "nwse-resize",
};

const THEME = BELLMAN_COMPOUND_GRAPH_THEME;

function readCssLengthValue(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function overlayVisualEqual<T extends object | null>(left: T, right: T): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

interface ChildVisualStyle extends LeafDomVisualStyle {}

const DEFAULT_CHILD_VISUAL_STYLE: ChildVisualStyle = leafDomVisualStyle(THEME);

function readComputedChildVisualStyle(
  labelElement: HTMLElement | null,
  nodeElement: HTMLElement | null,
  selectedNodeElement: HTMLElement | null,
): ChildVisualStyle {
  if (!labelElement || !nodeElement || !selectedNodeElement) {
    return DEFAULT_CHILD_VISUAL_STYLE;
  }
  const labelStyle = window.getComputedStyle(labelElement);
  const nodeStyle = window.getComputedStyle(nodeElement);
  const selectedNodeStyle = window.getComputedStyle(selectedNodeElement);
  return {
    fontSize: readCssLengthValue(labelStyle.fontSize, THEME.leafLabel.fontSize),
    fontFamily: labelStyle.fontFamily || THEME.leafLabel.fontFamily,
    fontWeight: labelStyle.fontWeight || String(THEME.leafLabel.fontWeight),
    color: labelStyle.color || THEME.leafLabel.color,
    labelOutlineWidth: readCssLengthValue(
      labelStyle.getPropertyValue("--child-label-outline-width"),
      THEME.leafLabel.outlineWidth,
    ),
    labelOutlineColor:
      labelStyle.getPropertyValue("--child-label-outline-color").trim() ||
      THEME.leafLabel.outlineColor,
    labelMarginY: readCssLengthValue(
      labelStyle.getPropertyValue("--child-label-gap-y"),
      THEME.leafLabel.marginY,
    ),
    nodeWidth: readCssLengthValue(nodeStyle.width, THEME.leafNode.diameter),
    nodeHeight: readCssLengthValue(nodeStyle.height, THEME.leafNode.diameter),
    selectionOutlineWidth: readCssLengthValue(
      selectedNodeStyle.getPropertyValue("--child-selection-ring-width"),
      THEME.leafSelection.outlineWidth,
    ),
    selectionOutlineColor:
      selectedNodeStyle.getPropertyValue("--child-selection-ring-color").trim() ||
      THEME.leafSelection.outlineColor,
  };
}

interface CompoundOverlaysProps {
  cy: Core;
  scene: CompoundGraphScene;
  probeLabel: string;
  selectedContainerId: string | null;
  onResizeComplete: (nodeId: string, position: NodePosition) => void;
  onOverlayChange?: () => void;
}

export function CompoundOverlays({
  cy,
  scene,
  probeLabel,
  selectedContainerId,
  onResizeComplete,
  onOverlayChange,
}: CompoundOverlaysProps) {
  const childLabelProbeRef = useRef<HTMLDivElement>(null);
  const childNodeProbeRef = useRef<HTMLDivElement>(null);
  const childSelectedNodeProbeRef = useRef<HTMLDivElement>(null);
  const childVisualStyleSignatureRef = useRef("");
  const childVisualStyleRef = useRef<ChildVisualStyle>(DEFAULT_CHILD_VISUAL_STYLE);
  const referenceZoomRef = useRef(1);
  const resizeStartRef = useRef<{
    containerId: string;
    corner: ResizeCorner;
    startClientX: number;
    startClientY: number;
    zoom: number;
    startModel: ReturnType<CompoundGraphScene["cloneModel"]>;
    constraints: ResizeChildConstraints;
    moved: boolean;
  } | null>(null);

  const [parentVisuals, setParentVisuals] = useState<Map<string, ParentDragVisual>>(
    new Map(),
  );
  const [childDragVisual, setChildDragVisual] = useState<ChildDragVisual | null>(null);
  const [handleRects, setHandleRects] = useState<
    Map<string, { left: number; top: number; width: number; height: number }>
  >(new Map());

  const refreshOverlays = useCallback(() => {
    scene.refreshFootprintsFromCy(cy);
    const nextChildDragVisual = scene.childDragVisual(cy);
    const nextParentVisuals = scene.parentDragVisuals(cy);
    setChildDragVisual((previous) =>
      overlayVisualEqual(previous, nextChildDragVisual) ? previous : nextChildDragVisual,
    );
    setParentVisuals((previous) => {
      const same =
        previous.size === nextParentVisuals.size &&
        [...nextParentVisuals.entries()].every(([id, visual]) =>
          overlayVisualEqual(previous.get(id) ?? null, visual),
        );
      return same ? previous : nextParentVisuals;
    });
    onOverlayChange?.();
  }, [cy, onOverlayChange, scene]);

  const recomputeHandles = useCallback(() => {
    if (!selectedContainerId) {
      setHandleRects(new Map());
      return;
    }
    const box = scene.renderedHandleBox(cy, selectedContainerId);
    setHandleRects(box ? new Map([[selectedContainerId, box]]) : new Map());
  }, [cy, scene, selectedContainerId]);

  const applyConfiguredChildVisualStyle = useCallback((targetCy: Core): void => {
    const childVisualStyle = readComputedChildVisualStyle(
      childLabelProbeRef.current,
      childNodeProbeRef.current,
      childSelectedNodeProbeRef.current,
    );
    const referenceZoom = referenceZoomRef.current > 0 ? referenceZoomRef.current : 1;
    childVisualStyleRef.current = childVisualStyle;
    childVisualStyleSignatureRef.current = JSON.stringify(childVisualStyle);
    targetCy.batch(() => {
      targetCy.nodes("[kind = 'leaf']").forEach((node) => {
        node.data("labelFontSize", childVisualStyle.fontSize / referenceZoom);
        node.data("labelFontFamily", childVisualStyle.fontFamily);
        node.data("labelFontWeight", childVisualStyle.fontWeight);
        node.data("labelColor", childVisualStyle.color);
        node.data("labelOutlineWidth", childVisualStyle.labelOutlineWidth / referenceZoom);
        node.data("labelOutlineColor", childVisualStyle.labelOutlineColor);
        node.data(
          "labelMarginY",
          (childVisualStyle.labelMarginY + childVisualStyle.labelOutlineWidth) /
            referenceZoom,
        );
        node.data("nodeWidth", childVisualStyle.nodeWidth / referenceZoom);
        node.data("nodeHeight", childVisualStyle.nodeHeight / referenceZoom);
        node.data(
          "selectionOutlineWidth",
          childVisualStyle.selectionOutlineWidth / referenceZoom,
        );
        node.data("selectionOutlineColor", childVisualStyle.selectionOutlineColor);
      });
    });
  }, []);

  const syncConfiguredChildVisualStyle = useCallback(
    (targetCy: Core): boolean => {
      const nextStyle = readComputedChildVisualStyle(
        childLabelProbeRef.current,
        childNodeProbeRef.current,
        childSelectedNodeProbeRef.current,
      );
      const nextSignature = JSON.stringify(nextStyle);
      if (nextSignature === childVisualStyleSignatureRef.current) {
        return false;
      }
      applyConfiguredChildVisualStyle(targetCy);
      return true;
    },
    [applyConfiguredChildVisualStyle],
  );

  const refreshInteriorClearances = useCallback(() => {
    const zoom = cy.zoom();
    if (!(zoom > 0)) {
      return;
    }
    scene.setEdgeClearance(THEME.childEdgeClearancePx / zoom);
    scene.setNodeOverlapPadding(THEME.nodeOverlapPadding);
  }, [cy, scene]);

  useEffect(() => {
    refreshInteriorClearances();
  }, [parentVisuals, refreshInteriorClearances]);

  useEffect(() => {
    const labelProbe = childLabelProbeRef.current;
    const nodeProbe = childNodeProbeRef.current;
    const selectedNodeProbe = childSelectedNodeProbeRef.current;
    if (!labelProbe || !nodeProbe || !selectedNodeProbe || typeof ResizeObserver === "undefined") {
      return;
    }
    const syncFromCss = () => {
      if (!syncConfiguredChildVisualStyle(cy)) {
        return;
      }
      scene.refreshFootprintsFromCy(cy);
      scene.ensureModelFromCy(cy);
      refreshInteriorClearances();
      recomputeHandles();
      refreshOverlays();
    };
    const resizeObserver = new ResizeObserver(syncFromCss);
    resizeObserver.observe(labelProbe);
    resizeObserver.observe(nodeProbe);
    resizeObserver.observe(selectedNodeProbe);
    return () => resizeObserver.disconnect();
  }, [
    cy,
    recomputeHandles,
    refreshInteriorClearances,
    refreshOverlays,
    scene,
    syncConfiguredChildVisualStyle,
  ]);

  useEffect(() => {
    referenceZoomRef.current = cy.zoom() > 0 ? cy.zoom() : 1;
    applyConfiguredChildVisualStyle(cy);
    refreshOverlays();
    recomputeHandles();

    const onRender = () => {
      syncConfiguredChildVisualStyle(cy);
      recomputeHandles();
      refreshOverlays();
    };
    cy.on("render zoom pan drag", onRender);
    cy.on("select unselect", onRender);

    return () => {
      cy.removeListener("render zoom pan drag", onRender);
      cy.removeListener("select unselect", onRender);
    };
  }, [
    applyConfiguredChildVisualStyle,
    cy,
    recomputeHandles,
    refreshOverlays,
    syncConfiguredChildVisualStyle,
  ]);

  const applyResize = useCallback(
    (clientX: number, clientY: number) => {
      const active = resizeStartRef.current;
      if (!active) {
        return;
      }

      const dxModel = (clientX - active.startClientX) / active.zoom;
      const dyModel = (clientY - active.startClientY) / active.zoom;
      if (
        !active.moved &&
        Math.hypot(clientX - active.startClientX, clientY - active.startClientY) <
          RESIZE_MOVE_THRESHOLD_PX
      ) {
        return;
      }
      active.moved = true;
      scene.resizeFromCorner(
        active.containerId,
        active.corner,
        dxModel,
        dyModel,
        active.startModel,
        active.constraints,
      );
      scene.syncToCy(cy);
      recomputeHandles();
      refreshOverlays();
    },
    [cy, recomputeHandles, refreshOverlays, scene],
  );

  const finishResize = useCallback(() => {
    const active = resizeStartRef.current;
    resizeStartRef.current = null;
    if (!active?.moved) {
      return;
    }
    const layout = scene.flatLayout()[active.containerId];
    if (layout) {
      onResizeComplete(active.containerId, layout);
    }
  }, [onResizeComplete, scene]);

  const onHandlePointerDown = useCallback(
    (containerId: string, corner: ResizeCorner) =>
      (event: ReactPointerEvent<HTMLDivElement>) => {
        scene.ensureModelFromCy(cy);
        refreshInteriorClearances();
        const constraints = scene.computeResizeChildConstraints(cy, containerId);

        event.preventDefault();
        event.stopPropagation();
        (event.target as HTMLElement).setPointerCapture(event.pointerId);

        resizeStartRef.current = {
          containerId,
          corner,
          startClientX: event.clientX,
          startClientY: event.clientY,
          zoom: cy.zoom(),
          startModel: scene.cloneModel(),
          constraints,
          moved: false,
        };
      },
    [cy, refreshInteriorClearances, scene],
  );

  const onHandlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!resizeStartRef.current) {
        return;
      }
      event.preventDefault();
      applyResize(event.clientX, event.clientY);
    },
    [applyResize],
  );

  const onHandlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!resizeStartRef.current) {
        return;
      }
      event.preventDefault();
      applyResize(event.clientX, event.clientY);
      finishResize();
    },
    [applyResize, finishResize],
  );

  const childStyle = childVisualStyleRef.current;
  const ghostZoomScale =
    childDragVisual && childDragVisual.zoom > 0
      ? childDragVisual.zoom / referenceZoomRef.current
      : 1;

  return (
    <>
      <div ref={childLabelProbeRef} className="child-drag-label style-probe">
        {probeLabel}
      </div>
      <div ref={childNodeProbeRef} className="child-drag-node style-probe" />
      <div ref={childSelectedNodeProbeRef} className="child-drag-node is-selected style-probe" />

      {[...parentVisuals.entries()].map(([containerId, visual]) => (
        <div key={containerId}>
          <div
            className={`compound-parent-overlay${visual.selected ? " is-selected" : ""}`}
            style={{
              left: visual.left,
              top: visual.top,
              width: visual.width,
              height: visual.height,
            }}
          />
          <div
            className="compound-parent-label-anchor"
            style={{
              left: visual.left + visual.width / 2,
              top: visual.top,
            }}
          >
            <div
              className="compound-parent-label"
              style={
                {
                  "--compound-parent-label-zoom-scale": visual.zoomScale,
                } as CSSProperties
              }
            >
              {visual.label}
            </div>
          </div>
        </div>
      ))}

      {selectedContainerId && handleRects.get(selectedContainerId)
        ? CORNERS.map((corner) => {
            const box = handleRects.get(selectedContainerId)!;
            const left =
              corner === "nw" || corner === "sw"
                ? box.left - HANDLE_GAP - HANDLE_SIZE
                : box.left + box.width + HANDLE_GAP;
            const top =
              corner === "nw" || corner === "ne"
                ? box.top - HANDLE_GAP - HANDLE_SIZE
                : box.top + box.height + HANDLE_GAP;
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
                onPointerDown={onHandlePointerDown(selectedContainerId, corner)}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                onPointerCancel={onHandlePointerUp}
              />
            );
          })
        : null}

      {childDragVisual ? (
        <div className="child-drag-layer" aria-hidden="true">
          <div
            className="child-drag-ghost"
            style={{
              left: childDragVisual.renderedX,
              top: childDragVisual.renderedY,
            }}
          >
            <div
              className="child-drag-node is-selected"
              style={{
                backgroundColor: childDragVisual.color,
                width: childStyle.nodeWidth,
                height: childStyle.nodeHeight,
                transform: `scale(${ghostZoomScale})`,
              }}
            />
            <div
              className="child-drag-label"
              style={{
                fontSize: childStyle.fontSize,
                fontFamily: childStyle.fontFamily,
                fontWeight: childStyle.fontWeight,
                color: childStyle.color,
                transform: `translateX(-50%) scale(${ghostZoomScale})`,
              }}
            >
              {childDragVisual.label}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
