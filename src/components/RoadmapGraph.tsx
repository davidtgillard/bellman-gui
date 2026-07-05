import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import fcose from "cytoscape-fcose";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { WorkPackageLayoutModel } from "@dgillard/cytoscape-compound-graph";
import {
  CYTOSCAPE_STYLESHEET,
  workPackageGraphStylesheet,
} from "../lib/cytoscape-theme";
import {
  buildCompoundGraphScene,
  isCompoundGraphNodes,
  sceneLayoutInputs,
} from "../lib/compound-graph-adapter";
import type { CompoundGraphScene } from "@dgillard/cytoscape-compound-graph";
import { layoutModelFromCy } from "@dgillard/cytoscape-compound-graph";
import {
  graphNodeModelPosition,
  installWheelZoom,
  redrawGraphSynchronously,
  runLayoutWhenContainerReady,
  usesPresetLayout,
} from "../lib/cytoscape-layout";
import { CompoundOverlays } from "./CompoundOverlays";
import { defaultNodePosition, type NodePosition, type NodeSize } from "../lib/graph-layout";
import { graphNodeDisplayLabel } from "../lib/graph";
import {
  ARROW_KEY_DIRECTIONS,
  isArrowPanKey,
  KeyboardPanController,
  PAN_RAMP_UP_MS,
  shouldIgnoreKeyboardPanTarget,
  shouldAllowKeyboardPan,
} from "../lib/keyboard-pan";
import { DEFAULT_MAX_PAN_SPEED, loadSettings } from "../lib/settings";

cytoscape.use(fcose);

interface GraphViewNode {
  id: string;
  label?: string;
  fill?: string;
  parent?: string;
  subLabel?: string;
  classes?: string;
  data?: { type?: string; isCompound?: boolean; isOverflow?: boolean };
}

interface GraphViewLink {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface GraphContextMenuEvent {
  data: {
    id: string;
    source?: string;
    target?: string;
    data?: { type?: string };
    position?: unknown;
    background?: boolean;
    graphPosition?: NodePosition;
    nodePositions?: Record<string, NodePosition>;
  };
  onClose: () => void;
}

interface RoadmapGraphProps {
  nodes: GraphViewNode[];
  links: GraphViewLink[];
  visibleNodeIds?: ReadonlySet<string>;
  emptyMessage?: string;
  focusNodeId?: string | null;
  selectedNodeId?: string | null;
  onNodeClick?: (nodeId: string) => void;
  /** Returns true when React selection state was cleared. */
  onSelectionClear?: () => boolean;
  contextMenu?: (event: GraphContextMenuEvent) => ReactNode;
  draggable?: boolean;
  nodePositions?: Record<string, NodePosition>;
  onNodePositionChange?: (positions: Record<string, NodePosition>) => void;
  onNodeResize?: (nodeId: string, position: NodePosition) => void;
  onCompoundSizesMeasured?: (
    sizes: Record<string, NodeSize>,
    positions: Record<string, NodePosition>,
  ) => void;
  onAutoLayoutComplete?: (positions: Record<string, NodePosition>) => void;
  layoutReady?: boolean;
  layoutSyncToken?: number;
  compoundGraph?: boolean;
}

const FOCUS_DELAY_MS = 450;

function sortGraphViewNodes(nodes: GraphViewNode[]): GraphViewNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sorted: GraphViewNode[] = [];
  const placed = new Set<string>();

  const place = (node: GraphViewNode) => {
    if (placed.has(node.id)) {
      return;
    }
    if (node.parent && byId.has(node.parent) && !placed.has(node.parent)) {
      place(byId.get(node.parent)!);
    }
    placed.add(node.id);
    sorted.push(node);
  };

  for (const node of nodes) {
    place(node);
  }

  return sorted;
}

function uniqueGraphViewNodes(nodes: GraphViewNode[]): GraphViewNode[] {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    if (seen.has(node.id)) {
      return false;
    }
    seen.add(node.id);
    return true;
  });
}

function compositeChromeTargetId(
  cy: Core | null,
  nodes: GraphViewNode[],
): string | null {
  if (!cy) {
    return null;
  }

  const selected = cy.nodes(":selected");
  if (selected.length !== 1) {
    return null;
  }

  const node = selected.first();
  if (node.data("kind") !== "container") {
    return null;
  }

  const meta = nodes.find((entry) => entry.id === node.id());
  if (!meta?.data?.isCompound) {
    return null;
  }

  return node.id();
}

function snapshotNodePositions(cy: Core): Record<string, NodePosition> {
  const positions: Record<string, NodePosition> = {};
  cy.nodes().forEach((node) => {
    const position = node.position();
    positions[node.id()] = { x: position.x, y: position.y };
  });
  return positions;
}

function toElementDefinitions(
  nodes: GraphViewNode[],
  links: GraphViewLink[],
  nodePositions: Record<string, NodePosition> | undefined,
): ElementDefinition[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const usePreset = usesPresetLayout(nodePositions);
  const elements: ElementDefinition[] = sortGraphViewNodes(uniqueGraphViewNodes(nodes)).map((node) => {
    const saved = nodePositions?.[node.id];
    const position = saved ?? (usePreset ? defaultNodePosition(node.id, [...nodeIds]) : undefined);
    const baseLabel = graphNodeDisplayLabel(node.label ?? node.id);
    const label = node.subLabel
      ? `${baseLabel}\n${graphNodeDisplayLabel(node.subLabel)}`
      : baseLabel;

    const hasSize = saved?.w !== undefined && saved?.h !== undefined;

    return {
      data: {
        id: node.id,
        label,
        subLabel: node.subLabel,
        type: node.data?.type ?? "",
        color: node.fill ?? "#64748b",
        ...(node.parent ? { parent: node.parent } : {}),
        ...(hasSize ? { compoundWidth: saved!.w, compoundHeight: saved!.h } : {}),
      },
      classes: node.classes,
      ...(position ? { position: { x: position.x, y: position.y } } : {}),
    };
  });

  for (const link of links) {
    if (!nodeIds.has(link.source) || !nodeIds.has(link.target)) {
      continue;
    }
    elements.push({
      data: {
        id: link.id,
        source: link.source,
        target: link.target,
        label: link.label ?? "",
      },
    });
  }

  return elements;
}

function syncGraphVisibility(cy: Core, visibleNodeIds: ReadonlySet<string> | undefined): void {
  if (!visibleNodeIds) {
    cy.elements().style("display", "element");
    return;
  }

  cy.batch(() => {
    cy.nodes().forEach((node) => {
      node.style("display", visibleNodeIds.has(node.id()) ? "element" : "none");
    });
    cy.edges().forEach((edge) => {
      const visible =
        visibleNodeIds.has(edge.source().id()) && visibleNodeIds.has(edge.target().id());
      edge.style("display", visible ? "element" : "none");
    });
  });
}

function focusGraphOnNode(cy: Core, nodeId: string): void {
  const node = cy.getElementById(nodeId);
  if (node.nonempty()) {
    cy.animate({
      fit: { eles: node, padding: 60 },
      duration: 300,
    });
  }
}

function graphStructureKey(nodes: GraphViewNode[], links: GraphViewLink[]): string {
  const nodePart = nodes
    .map(
      (node) =>
        `${node.id}:${node.parent ?? ""}:${node.classes ?? ""}:${node.data?.isCompound ?? false}`,
    )
    .sort()
    .join("\n");
  const linkPart = links
    .map((link) => `${link.id}:${link.source}:${link.target}`)
    .sort()
    .join("\n");
  return `${nodePart}\n---\n${linkPart}`;
}

function modelAbsoluteCenter(
  model: WorkPackageLayoutModel,
  nodeId: string,
): { x: number; y: number } {
  const node = model.nodes.get(nodeId);
  if (!node) {
    return { x: 0, y: 0 };
  }
  let x = node.center.x;
  let y = node.center.y;
  let parentId = model.parentOf.get(nodeId);
  while (parentId) {
    const parent = model.nodes.get(parentId);
    if (!parent) {
      break;
    }
    x += parent.center.x;
    y += parent.center.y;
    parentId = model.parentOf.get(parentId);
  }
  return { x, y };
}

function collectSubtreeIds(
  model: WorkPackageLayoutModel,
  rootId: string,
): string[] {
  const result: string[] = [rootId];
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const childId of model.childrenOf.get(id) ?? []) {
      result.push(childId);
      stack.push(childId);
    }
  }
  return result;
}

function boxesOverlap(
  left: { x1: number; y1: number; x2: number; y2: number },
  right: { x1: number; y1: number; x2: number; y2: number },
): boolean {
  return !(
    left.x2 <= right.x1 ||
    right.x2 <= left.x1 ||
    left.y2 <= right.y1 ||
    right.y2 <= left.y1
  );
}

function compoundLayoutOuterBox(layout: {
  x: number;
  y: number;
  w?: number;
  h?: number;
}): { x1: number; y1: number; x2: number; y2: number } | null {
  if (layout.w === undefined || layout.h === undefined) {
    return null;
  }
  return {
    x1: layout.x - layout.w / 2,
    y1: layout.y - layout.h / 2,
    x2: layout.x + layout.w / 2,
    y2: layout.y + layout.h / 2,
  };
}

function layoutBoxToRendered(
  cy: Core,
  box: { x1: number; y1: number; x2: number; y2: number },
): { x1: number; y1: number; x2: number; y2: number } {
  const zoom = cy.zoom();
  const pan = cy.pan();
  return {
    x1: box.x1 * zoom + pan.x,
    y1: box.y1 * zoom + pan.y,
    x2: box.x2 * zoom + pan.x,
    y2: box.y2 * zoom + pan.y,
  };
}

interface ContextMenuState {
  x: number;
  y: number;
  event: GraphContextMenuEvent;
}

export function RoadmapGraph({
  nodes,
  links,
  visibleNodeIds,
  emptyMessage = "Open a bellman roadmap folder to view its graph.",
  focusNodeId = null,
  selectedNodeId = null,
  onNodeClick,
  onSelectionClear,
  contextMenu,
  draggable = false,
  nodePositions,
  onNodePositionChange,
  onNodeResize,
  onCompoundSizesMeasured,
  onAutoLayoutComplete,
  layoutReady = true,
  layoutSyncToken = 0,
  compoundGraph = false,
}: RoadmapGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const layoutCleanupRef = useRef<(() => void) | null>(null);
  const sceneChildDragCleanupRef = useRef<(() => void) | null>(null);
  const sceneParentDragCleanupRef = useRef<(() => void) | null>(null);
  const wheelZoomCleanupRef = useRef<(() => void) | null>(null);
  const graphStructureKeyRef = useRef("");
  const sceneRef = useRef<CompoundGraphScene | null>(null);
  const layoutCompletedRef = useRef(false);
  const lastLayoutSyncTokenRef = useRef(0);
  const visibleNodeIdsRef = useRef(visibleNodeIds);
  const onNodeClickRef = useRef(onNodeClick);
  const onSelectionClearRef = useRef(onSelectionClear);
  const onNodePositionChangeRef = useRef(onNodePositionChange);
  const onNodeResizeRef = useRef(onNodeResize);
  const onCompoundSizesMeasuredRef = useRef(onCompoundSizesMeasured);
  const nodesRef = useRef(nodes);
  const nodePositionsRef = useRef(nodePositions);
  const layoutReadyRef = useRef(layoutReady);
  const compoundGraphRef = useRef(compoundGraph);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const lastSelectedCompoundLeafRef = useRef<string | null>(null);
  const compoundLeafTapRef = useRef<
    ((childId: string, wasSelected: boolean) => void) | null
  >(null);
  const compoundLeafClearAfterDragRef = useRef<((childId: string) => void) | null>(null);
  const compoundLeafClickHandledRef = useRef(false);
  const suppressLeafSelectionRef = useRef(false);
  const pendingLeafDeselectRef = useRef(false);

  const useCompoundScene = useCallback(
    () => compoundGraphRef.current && isCompoundGraphNodes(nodesRef.current),
    [],
  );

  const rebuildScene = useCallback(
    (positions: Record<string, NodePosition> | undefined) => {
      if (!useCompoundScene()) {
        sceneRef.current = null;
        return null;
      }
      const scene = buildCompoundGraphScene(
        nodesRef.current,
        links,
        positions ?? nodePositionsRef.current,
      );
      sceneRef.current = scene;
      return scene;
    },
    [links, useCompoundScene],
  );

  const persistSceneLayout = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }
    redrawGraphSynchronously(cyRef.current!);
    setGraphSelectionRevision((revision) => revision + 1);
    onNodePositionChangeRef.current?.(scene.flatLayout());
  }, []);

  const attachSceneHandlers = useCallback(
    (cy: Core, scene: CompoundGraphScene) => {
      sceneChildDragCleanupRef.current?.();
      sceneParentDragCleanupRef.current?.();
      let childDragGesture: {
        childId: string;
        wasSelected: boolean;
        startLayout: { x: number; y: number };
        pointerMoved: boolean;
      } | null = null;

      sceneChildDragCleanupRef.current = scene.attachChildDragHandlers(cy, {
        onStart: (childId) => {
          suppressLeafSelectionRef.current = true;
          const node = cy.getElementById(childId);
          const layout = scene.flatLayout()[childId];
          childDragGesture = {
            childId,
            wasSelected:
              (!node.empty() && node.selected()) ||
              childId === selectedNodeIdRef.current ||
              childId === lastSelectedCompoundLeafRef.current,
            startLayout: { x: layout?.x ?? 0, y: layout?.y ?? 0 },
            pointerMoved: false,
          };
        },
        onMove: () => {
          if (childDragGesture) {
            childDragGesture.pointerMoved = true;
          }
        },
        onEnd: () => {
          persistSceneLayout();
          const gesture = childDragGesture;
          childDragGesture = null;
          if (!gesture) {
            return;
          }
          const endLayout = scene.flatLayout()[gesture.childId];
          const modelMoved =
            Math.hypot(
              (endLayout?.x ?? 0) - gesture.startLayout.x,
              (endLayout?.y ?? 0) - gesture.startLayout.y,
            ) > 1;
          if (!modelMoved && (gesture.wasSelected || !gesture.pointerMoved)) {
            suppressLeafSelectionRef.current = false;
            if (gesture.wasSelected) {
              pendingLeafDeselectRef.current = true;
            } else {
              compoundLeafClickHandledRef.current = true;
            }
            compoundLeafTapRef.current?.(gesture.childId, gesture.wasSelected);
            return;
          }
          if (!gesture.wasSelected) {
            compoundLeafClearAfterDragRef.current?.(gesture.childId);
          }
        },
      });
      sceneParentDragCleanupRef.current = scene.attachParentDragHandlers(cy, {
        onChange: persistSceneLayout,
      });
    },
    [persistSceneLayout],
  );

  const reportNewCompoundSizes = useCallback((scene: CompoundGraphScene) => {
    if (!layoutReadyRef.current || usesPresetLayout(nodePositionsRef.current)) {
      return;
    }
    const callback = onCompoundSizesMeasuredRef.current;
    if (!callback) {
      return;
    }
    const layout = scene.flatLayout();
    const sizes: Record<string, NodeSize> = {};
    const measuredPositions: Record<string, NodePosition> = {};
    for (const [nodeId, position] of Object.entries(layout)) {
      if (position.w === undefined || position.h === undefined) {
        continue;
      }
      const saved = nodePositionsRef.current?.[nodeId];
      if (saved?.w !== undefined && saved?.h !== undefined) {
        continue;
      }
      sizes[nodeId] = { w: position.w, h: position.h };
      measuredPositions[nodeId] = position;
    }
    if (Object.keys(sizes).length > 0) {
      callback(sizes, measuredPositions);
    }
  }, []);

  const syncCompoundReferenceZoom = useCallback((cy: Core) => {
    const zoom = cy.zoom();
    setCompoundReferenceZoom(zoom > 0 ? zoom : 1);
  }, []);

  const initializeCompoundScene = useCallback(
    (cy: Core) => {
      if (!useCompoundScene()) {
        return;
      }
      const scene = rebuildScene(nodePositionsRef.current);
      if (!scene) {
        return;
      }
      scene.initializeFromCy(cy);
      syncCompoundReferenceZoom(cy);
      attachSceneHandlers(cy, scene);
      reportNewCompoundSizes(scene);
    },
    [
      attachSceneHandlers,
      rebuildScene,
      reportNewCompoundSizes,
      syncCompoundReferenceZoom,
      useCompoundScene,
    ],
  );
  const onAutoLayoutCompleteRef = useRef(onAutoLayoutComplete);
  const contextMenuRef = useRef(contextMenu);
  const keyboardPanRef = useRef(
    new KeyboardPanController({
      maxSpeed: DEFAULT_MAX_PAN_SPEED,
      rampUpMs: PAN_RAMP_UP_MS,
    }),
  );
  const keyboardPanFrameRef = useRef<number | null>(null);
  const [cyReady, setCyReady] = useState(false);
  const [graphSelectionRevision, setGraphSelectionRevision] = useState(0);
  const [compoundReferenceZoom, setCompoundReferenceZoom] = useState(1);
  const [maxPanSpeed, setMaxPanSpeed] = useState(DEFAULT_MAX_PAN_SPEED);
  const [backgroundPanEnabled, setBackgroundPanEnabled] = useState(false);
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState | null>(
    null,
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuState(null);
  }, []);

  const applyGraphVisibility = useCallback((cy: Core, preserveViewport: boolean) => {
    const viewport = preserveViewport ? { pan: cy.pan(), zoom: cy.zoom() } : null;
    syncGraphVisibility(cy, visibleNodeIdsRef.current);
    if (viewport) {
      cy.viewport(viewport);
    }
  }, []);

  const measureCompoundSizes = useCallback(() => {
    // Compound sizing is handled by CompoundGraphScene.initializeFromCy.
  }, []);

  useEffect(() => {
    visibleNodeIdsRef.current = visibleNodeIds;
  }, [visibleNodeIds]);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  useEffect(() => {
    onSelectionClearRef.current = onSelectionClear;
  }, [onSelectionClear]);

  useEffect(() => {
    onNodePositionChangeRef.current = onNodePositionChange;
  }, [onNodePositionChange]);

  useEffect(() => {
    onNodeResizeRef.current = onNodeResize;
  }, [onNodeResize]);

  useEffect(() => {
    compoundGraphRef.current = compoundGraph;
  }, [compoundGraph]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    nodePositionsRef.current = nodePositions;
  }, [nodePositions]);

  useEffect(() => {
    layoutReadyRef.current = layoutReady;
  }, [layoutReady]);

  useEffect(() => {
    if (!cyReady || !useCompoundScene()) {
      return;
    }
    const cy = cyRef.current;
    if (!cy || !usesPresetLayout(nodePositions) || cy.nodes().length === 0) {
      return;
    }
    const scene = rebuildScene(nodePositions);
    if (!scene) {
      return;
    }
    scene.initializeFromCy(cy);
    syncCompoundReferenceZoom(cy);
    if (layoutCompletedRef.current) {
      attachSceneHandlers(cy, scene);
    }
  }, [
    attachSceneHandlers,
    cyReady,
    layoutSyncToken,
    nodePositions,
    rebuildScene,
    syncCompoundReferenceZoom,
    useCompoundScene,
  ]);

  useEffect(() => {
    onCompoundSizesMeasuredRef.current = onCompoundSizesMeasured;
  }, [onCompoundSizesMeasured]);

  useEffect(() => {
    onAutoLayoutCompleteRef.current = onAutoLayoutComplete;
  }, [onAutoLayoutComplete]);

  useEffect(() => {
    contextMenuRef.current = contextMenu;
  }, [contextMenu]);

  useEffect(() => {
    void loadSettings()
      .then((settings) => {
        setMaxPanSpeed(settings.maxPanSpeed);
        setBackgroundPanEnabled(settings.backgroundPanEnabled);
      })
      .catch((error) => {
        console.warn("[settings] failed to load settings", error);
      });
  }, []);

  useEffect(() => {
    keyboardPanRef.current.setMaxSpeed(maxPanSpeed);
  }, [maxPanSpeed]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cyReady || !cy) {
      return;
    }
    cy.userPanningEnabled(backgroundPanEnabled);
  }, [backgroundPanEnabled, cyReady]);

  useEffect(() => {
    const controller = keyboardPanRef.current;

    const stopKeyboardPanLoop = () => {
      if (keyboardPanFrameRef.current !== null) {
        cancelAnimationFrame(keyboardPanFrameRef.current);
        keyboardPanFrameRef.current = null;
      }
    };

    const runKeyboardPanLoop = () => {
      const cy = cyRef.current;
      if (!cy || !controller.isActive()) {
        stopKeyboardPanLoop();
        return;
      }

      const { dx, dy } = controller.tick(performance.now());
      if (dx !== 0 || dy !== 0) {
        cy.panBy({ x: dx, y: dy });
      }

      keyboardPanFrameRef.current = requestAnimationFrame(runKeyboardPanLoop);
    };

    const startKeyboardPanLoop = () => {
      if (keyboardPanFrameRef.current !== null) {
        return;
      }
      keyboardPanFrameRef.current = requestAnimationFrame(runKeyboardPanLoop);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const cy = cyRef.current;
        if (
          cy &&
          !shouldIgnoreKeyboardPanTarget(event.target) &&
          cy.nodes(":selected").length > 0
        ) {
          event.preventDefault();
          const cleared = onSelectionClearRef.current?.() ?? false;
          if (cleared) {
            cy.nodes().unselect();
          }
        }
        return;
      }

      if (
        event.defaultPrevented ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        !isArrowPanKey(event.key) ||
        !shouldAllowKeyboardPan(event)
      ) {
        return;
      }

      event.preventDefault();
      controller.keyDown(ARROW_KEY_DIRECTIONS[event.key]);
      controller.beginHold(performance.now());
      startKeyboardPanLoop();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!isArrowPanKey(event.key)) {
        return;
      }
      controller.keyUp(ARROW_KEY_DIRECTIONS[event.key]);
      if (!controller.isActive()) {
        stopKeyboardPanLoop();
      }
    };

    const onWindowBlur = () => {
      controller.clear();
      stopKeyboardPanLoop();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      controller.clear();
      stopKeyboardPanLoop();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [cyReady]);

  useEffect(() => {
    if (!contextMenuState) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".graph-context-menu, .graph-context-menu-portal")
      ) {
        return;
      }
      closeContextMenu();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [closeContextMenu, contextMenuState]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    layoutCleanupRef.current?.();
    layoutCleanupRef.current = null;
    sceneChildDragCleanupRef.current?.();
    sceneChildDragCleanupRef.current = null;
    sceneParentDragCleanupRef.current?.();
    sceneParentDragCleanupRef.current = null;
    wheelZoomCleanupRef.current?.();
    wheelZoomCleanupRef.current = null;

    const existing = cyRef.current;
    if (existing) {
      existing.destroy();
      cyRef.current = null;
    }

    // Orphaned canvases can remain if init runs again before destroy completes.
    container.replaceChildren();

    const cy = cytoscape({
      container,
      style: compoundGraph ? workPackageGraphStylesheet() : CYTOSCAPE_STYLESHEET,
      wheelSensitivity: 0.2,
      boxSelectionEnabled: false,
      userPanningEnabled: false,
      minZoom: 0.2,
      maxZoom: 3,
    });

    cyRef.current = cy;
    setCyReady(true);

    const testWindow = window as typeof window & {
      __TEST__?: {
        graphPan?: () => { x: number; y: number };
        graphUserPanningEnabled?: () => boolean;
        openNodeContextMenu?: (nodeId: string) => void;
        selectNode?: (nodeId: string) => void;
        selectGraphNodeOnly?: (nodeId: string) => void;
        tapGraphNode?: (nodeId: string) => void;
        tapGraphBackground?: () => void;
        getGraphNodeState?: (
          nodeId: string,
        ) => { x: number; y: number; w?: number; h?: number } | null;
        getCompositeChildOffsets?: (
          parentId: string,
        ) => Record<string, { dx: number; dy: number }>;
        getCompositeRenderedBox?: (
          parentId: string,
        ) => { x1: number; y1: number; x2: number; y2: number } | null;
        getGraphNodeRenderedCenter?: (nodeId: string) => { x: number; y: number };
        getGraphNodeAbsolutePosition?: (nodeId: string) => { x: number; y: number };
        dragCompositeParentBy?: (
          parentId: string,
          dx: number,
          dy: number,
        ) => void;
        getNodeVisualBox?: (
          nodeId: string,
        ) => { x1: number; y1: number; x2: number; y2: number } | null;
        nodesOverlap?: (leftId: string, rightId: string) => boolean;
        isNodeRenderedVisible?: (nodeId: string) => boolean;
        getSubtreeNodeIds?: (rootId: string) => string[];
        getSelectedGraphNodeId?: () => string | null;
      };
    };
    if (testWindow.__TEST__) {
      testWindow.__TEST__.graphPan = () => {
        const pan = cy.pan();
        return { x: pan.x, y: pan.y };
      };
      testWindow.__TEST__.graphUserPanningEnabled = () => cy.userPanningEnabled();
      testWindow.__TEST__.openNodeContextMenu = (nodeId: string) => {
        const node = cy.getElementById(nodeId);
        if (node.empty()) {
          throw new Error(`Graph node not found: ${nodeId}`);
        }
        node.trigger("cxttap");
      };
      testWindow.__TEST__.selectNode = (nodeId: string) => {
        const node = cy.getElementById(nodeId);
        if (node.empty()) {
          throw new Error(`Graph node not found: ${nodeId}`);
        }
        cy.nodes().unselect();
        node.select();
        onNodeClickRef.current?.(node.id());
      };
      testWindow.__TEST__.selectGraphNodeOnly = (nodeId: string) => {
        const node = cy.getElementById(nodeId);
        if (node.empty()) {
          throw new Error(`Graph node not found: ${nodeId}`);
        }
        cy.nodes().unselect();
        node.select();
      };
      testWindow.__TEST__.tapGraphNode = (nodeId: string) => {
        const node = cy.getElementById(nodeId);
        if (node.empty()) {
          throw new Error(`Graph node not found: ${nodeId}`);
        }
        if (compoundGraph && node.data("kind") === "leaf") {
          if (node.selected()) {
            const cleared = onSelectionClearRef.current?.() ?? false;
            if (cleared) {
              cy.nodes().unselect();
              graphContainerRef.current?.focus({ preventScroll: true });
            }
          } else {
            suppressLeafSelectionRef.current = false;
            cy.nodes().unselect();
            node.select();
            onNodeClickRef.current?.(nodeId);
          }
          return;
        }
        node.trigger("mousedown");
        node.trigger("tap");
      };
      testWindow.__TEST__.tapGraphBackground = () => {
        closeContextMenu();
        const cleared = onSelectionClearRef.current?.() ?? false;
        if (cleared) {
          cy.nodes().unselect();
          graphContainerRef.current?.focus({ preventScroll: true });
        }
      };
      testWindow.__TEST__.getGraphNodeState = (nodeId: string) => {
        const node = cy.getElementById(nodeId);
        if (node.empty()) {
          return null;
        }
        const position = graphNodeModelPosition(node);
        const state: {
          x: number;
          y: number;
          w?: number;
          h?: number;
          x1?: number;
          y1?: number;
        } = {
          x: position.x,
          y: position.y,
        };
        const width = node.data("compoundWidth");
        const height = node.data("compoundHeight");
        const isCompound =
          node.data("kind") === "container" ||
          width !== undefined ||
          height !== undefined;
        if (isCompound) {
          const box = node.boundingBox({ includeLabels: false, includeOverlays: false });
          state.x1 = box.x1;
          state.y1 = box.y1;
          if (width !== undefined && height !== undefined) {
            state.w = Number(width);
            state.h = Number(height);
          } else {
            state.w = box.x2 - box.x1;
            state.h = box.y2 - box.y1;
          }
        }
        return state;
      };
      testWindow.__TEST__.getCompositeChildOffsets = (parentId: string) => {
        const scene = sceneRef.current;
        const model = scene?.getModel();
        if (!model) {
          return {};
        }
        const offsets: Record<string, { dx: number; dy: number }> = {};
        for (const childId of model.childrenOf.get(parentId) ?? []) {
          const child = model.nodes.get(childId);
          if (child) {
            offsets[childId] = { dx: child.center.x, dy: child.center.y };
          }
        }
        return offsets;
      };
      testWindow.__TEST__.getCompositeRenderedBox = (parentId: string) => {
        const node = cy.getElementById(parentId);
        if (node.empty()) {
          return null;
        }
        const position = graphNodeModelPosition(node);
        const width = node.data("compoundWidth");
        const height = node.data("compoundHeight");
        if (width !== undefined && height !== undefined) {
          const outer = compoundLayoutOuterBox({
            x: position.x,
            y: position.y,
            w: Number(width),
            h: Number(height),
          });
          if (outer) {
            return layoutBoxToRendered(cy, outer);
          }
        }
        const box = node.renderedBoundingBox({
          includeLabels: false,
          includeOverlays: false,
        });
        return { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 };
      };
      testWindow.__TEST__.getGraphNodeRenderedCenter = (nodeId: string) => {
        const node = cy.getElementById(nodeId);
        if (node.empty()) {
          throw new Error(`Graph node not found: ${nodeId}`);
        }
        const box = node.renderedBoundingBox({ includeLabels: true, includeOverlays: false });
        const container = cy.container();
        if (!container) {
          throw new Error("graph container is unavailable");
        }
        const rect = container.getBoundingClientRect();
        return {
          x: rect.left + (box.x1 + box.x2) / 2,
          y: rect.top + (box.y1 + box.y2) / 2,
        };
      };
      testWindow.__TEST__.getGraphNodeAbsolutePosition = (nodeId: string) => {
        if (compoundGraphRef.current && isCompoundGraphNodes(nodesRef.current)) {
          const model = layoutModelFromCy(cy, sceneLayoutInputs(nodesRef.current));
          return modelAbsoluteCenter(model, nodeId);
        }
        const node = cy.getElementById(nodeId);
        if (node.empty()) {
          throw new Error(`Graph node not found: ${nodeId}`);
        }
        const position = node.position();
        return { x: position.x, y: position.y };
      };
      testWindow.__TEST__.dragCompositeParentBy = (parentId, dx, dy) => {
        const scene = sceneRef.current;
        if (!scene) {
          throw new Error("compound scene is unavailable");
        }
        const parent = cy.getElementById(parentId);
        if (parent.empty()) {
          throw new Error(`Composite parent not found: ${parentId}`);
        }
        const position = parent.position();
        parent.trigger("grab");
        parent.position({ x: position.x + dx, y: position.y + dy });
        parent.trigger("drag");
        parent.trigger("free");
      };
      testWindow.__TEST__.getNodeVisualBox = (nodeId) => {
        const node = cy.getElementById(nodeId);
        if (node.empty()) {
          return null;
        }
        const box = node.boundingBox({ includeLabels: true, includeOverlays: false });
        return { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 };
      };
      testWindow.__TEST__.nodesOverlap = (leftId, rightId) => {
        const scene = sceneRef.current;
        if (scene) {
          const layout = scene.flatLayout();
          const leftOuter = layout[leftId] ? compoundLayoutOuterBox(layout[leftId]) : null;
          const rightOuter = layout[rightId] ? compoundLayoutOuterBox(layout[rightId]) : null;
          if (leftOuter && rightOuter) {
            return boxesOverlap(leftOuter, rightOuter);
          }
        }
        const left = cy.getElementById(leftId);
        const right = cy.getElementById(rightId);
        if (left.empty() || right.empty()) {
          return false;
        }
        const leftBox = left.boundingBox({ includeLabels: true, includeOverlays: false });
        const rightBox = right.boundingBox({ includeLabels: true, includeOverlays: false });
        return boxesOverlap(leftBox, rightBox);
      };
      testWindow.__TEST__.isNodeRenderedVisible = (nodeId) => {
        const node = cy.getElementById(nodeId);
        if (node.empty()) {
          return false;
        }
        return node.style("display") !== "none";
      };
      testWindow.__TEST__.getSubtreeNodeIds = (rootId) => {
        const scene = sceneRef.current;
        const model = scene?.getModel();
        if (!model) {
          return [rootId];
        }
        return collectSubtreeIds(model, rootId);
      };
      testWindow.__TEST__.getSelectedGraphNodeId = () => {
        const selected = cy.nodes(":selected");
        return selected.length > 0 ? selected[0].id() : null;
      };
    }

    let selectedNodeIdAtPointerDown: string | null = null;

    cy.on("mousedown", "node", (event) => {
      const node = event.target;
      selectedNodeIdAtPointerDown = node.selected() ? node.id() : null;
    });

    const clearGraphSelectionIfAllowed = (): boolean => {
      const cleared = onSelectionClearRef.current?.() ?? false;
      if (cleared) {
        cy.nodes().unselect();
        lastSelectedCompoundLeafRef.current = null;
        graphContainerRef.current?.focus({ preventScroll: true });
      }
      return cleared;
    };

    const selectCompoundLeaf = (childId: string) => {
      suppressLeafSelectionRef.current = false;
      closeContextMenu();
      cy.nodes().unselect();
      const node = cy.getElementById(childId);
      if (!node.empty()) {
        node.select();
      }
    };

    compoundLeafTapRef.current = (childId, wasSelected) => {
      if (wasSelected) {
        selectedNodeIdAtPointerDown = null;
        clearGraphSelectionIfAllowed();
        return;
      }
      selectedNodeIdAtPointerDown = null;
      selectCompoundLeaf(childId);
    };

    compoundLeafClearAfterDragRef.current = (childId) => {
      const node = cy.getElementById(childId);
      if (!node.empty() && node.selected()) {
        clearGraphSelectionIfAllowed();
      }
    };

    cy.on("tap", "node", (event) => {
      closeContextMenu();
      const node = event.target;
      const nodeId = node.id();

      if (compoundGraph && node.data("kind") === "leaf") {
        if (compoundLeafClickHandledRef.current) {
          compoundLeafClickHandledRef.current = false;
          return;
        }
        const childId = nodeId;
        const shouldToggleOff =
          pendingLeafDeselectRef.current ||
          node.selected() ||
          childId === selectedNodeIdRef.current ||
          childId === lastSelectedCompoundLeafRef.current;
        window.setTimeout(() => {
          if (pendingLeafDeselectRef.current) {
            pendingLeafDeselectRef.current = false;
            clearGraphSelectionIfAllowed();
            return;
          }
          if (!shouldToggleOff) {
            return;
          }
          const cyNode = cy.getElementById(childId);
          if (
            cyNode.nonempty() &&
            (cyNode.selected() ||
              childId === selectedNodeIdRef.current ||
              childId === lastSelectedCompoundLeafRef.current)
          ) {
            clearGraphSelectionIfAllowed();
          }
        }, 0);
        return;
      }

      if (selectedNodeIdAtPointerDown === nodeId) {
        selectedNodeIdAtPointerDown = null;
        clearGraphSelectionIfAllowed();
        return;
      }

      selectedNodeIdAtPointerDown = null;
      if (!node.selected()) {
        cy.nodes().unselect();
        node.select();
      }
    });

    const bumpGraphSelection = () => {
      setGraphSelectionRevision((revision) => revision + 1);
    };
    cy.on("select", "node", (event) => {
      const node = event.target;
      if (
        compoundGraph &&
        node.data("kind") === "leaf" &&
        suppressLeafSelectionRef.current
      ) {
        suppressLeafSelectionRef.current = false;
        node.unselect();
        return;
      }
      if (compoundGraph && node.data("kind") === "leaf") {
        lastSelectedCompoundLeafRef.current = node.id();
      }
      onNodeClickRef.current?.(event.target.id());
      bumpGraphSelection();
    });
    cy.on("unselect", "node", bumpGraphSelection);

    cy.on("tap", "edge", () => {
      closeContextMenu();
      clearGraphSelectionIfAllowed();
    });

    cy.on("tap", (event) => {
      if (event.target === cy) {
        closeContextMenu();
        clearGraphSelectionIfAllowed();
      }
    });

    const contextMenuPointForNode = (
      node: cytoscape.NodeSingular,
      originalEvent?: MouseEvent,
    ) => {
      if (originalEvent) {
        return { x: originalEvent.clientX, y: originalEvent.clientY };
      }
      cy.center(node);
      const bb = node.renderedBoundingBox();
      const rect = container.getBoundingClientRect();
      return {
        x: rect.left + (bb.x1 + bb.x2) / 2,
        y: rect.top + (bb.y1 + bb.y2) / 2,
      };
    };

    cy.on("cxttap", "node", (event) => {
      const node = event.target;
      const originalEvent = event.originalEvent as MouseEvent | undefined;
      const renderContextMenu = contextMenuRef.current;
      if (!renderContextMenu) {
        return;
      }

      const menuEvent: GraphContextMenuEvent = {
        data: {
          id: node.id(),
          data: { type: String(node.data("type") ?? "") },
          position: node.position(),
        },
        onClose: closeContextMenu,
      };

      const point = contextMenuPointForNode(node, originalEvent);
      setContextMenuState({
        x: point.x,
        y: point.y,
        event: menuEvent,
      });
    });

    cy.on("cxttap", "edge", (event) => {
      const edge = event.target;
      const originalEvent = event.originalEvent as MouseEvent;
      const renderContextMenu = contextMenuRef.current;
      if (!renderContextMenu) {
        return;
      }

      const menuEvent: GraphContextMenuEvent = {
        data: {
          id: edge.id(),
          source: edge.source().id(),
          target: edge.target().id(),
        },
        onClose: closeContextMenu,
      };

      setContextMenuState({
        x: originalEvent.clientX,
        y: originalEvent.clientY,
        event: menuEvent,
      });
    });

    cy.on("cxttap", (event) => {
      if (event.target !== cy) {
        return;
      }

      const originalEvent = event.originalEvent as MouseEvent;
      const renderContextMenu = contextMenuRef.current;
      if (!renderContextMenu) {
        return;
      }

      const menuEvent: GraphContextMenuEvent = {
        data: {
          id: "",
          background: true,
          graphPosition: {
            x: event.position?.x ?? 0,
            y: event.position?.y ?? 0,
          },
          nodePositions: snapshotNodePositions(cy),
        },
        onClose: closeContextMenu,
      };

      setContextMenuState({
        x: originalEvent.clientX,
        y: originalEvent.clientY,
        event: menuEvent,
      });
    });

    wheelZoomCleanupRef.current = installWheelZoom(
      graphContainerRef.current ?? container.parentElement ?? container,
      cy,
      container,
      0.2,
    );

    let previousContainerWidth: number | null = null;
    let previousWindowWidth: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      const containerWidth = container.clientWidth;
      const windowWidth = window.innerWidth;
      cy.resize();

      // The node detail sidebar shares the flex row with the graph, so opening,
      // widening, or closing it changes the graph container width while the
      // window stays the same. Pan the viewport by that sidebar-driven delta so
      // the graph is visually pushed left when the panel expands and pulled back
      // right when it retracts, instead of being clipped/covered on the right.
      // Width changes that come from the window itself resizing (the sidebar
      // unchanged) move the container and window by the same amount and cancel
      // out, leaving the original frame of view untouched.
      if (previousContainerWidth !== null && previousWindowWidth !== null) {
        const containerDelta = containerWidth - previousContainerWidth;
        const windowDelta = windowWidth - previousWindowWidth;
        const sidebarShift = containerDelta - windowDelta;
        if (sidebarShift !== 0) {
          cy.panBy({ x: sidebarShift, y: 0 });
        }
      }
      previousContainerWidth = containerWidth;
      previousWindowWidth = windowWidth;

      // cy.resize() clears the canvas synchronously but defers the repaint to
      // the next animation frame, so a live drag (e.g. resizing the node detail
      // panel) shows a blank frame each tick, which reads as a flash. Force a
      // synchronous redraw so the graph repaints in the same frame it resizes.
      redrawGraphSynchronously(cy);
    });
    resizeObserver.observe(container);

    return () => {
      layoutCleanupRef.current?.();
      layoutCleanupRef.current = null;
      sceneChildDragCleanupRef.current?.();
      sceneChildDragCleanupRef.current = null;
      sceneParentDragCleanupRef.current?.();
      sceneParentDragCleanupRef.current = null;
      wheelZoomCleanupRef.current?.();
      wheelZoomCleanupRef.current = null;
      resizeObserver.disconnect();
      graphStructureKeyRef.current = "";
      layoutCompletedRef.current = false;
      lastLayoutSyncTokenRef.current = 0;
      setCyReady(false);
      compoundLeafTapRef.current = null;
      compoundLeafClearAfterDragRef.current = null;
      if (testWindow.__TEST__) {
        delete testWindow.__TEST__.graphPan;
        delete testWindow.__TEST__.graphUserPanningEnabled;
        delete testWindow.__TEST__.openNodeContextMenu;
        delete testWindow.__TEST__.selectNode;
      }
      cy.destroy();
      cyRef.current = null;
      container.replaceChildren();
    };
  }, [closeContextMenu]);

  useEffect(() => {
    const cy = cyRef.current;
    const container = containerRef.current;
    if (!cyReady || !cy || !container) {
      return;
    }

    layoutCleanupRef.current?.();
    layoutCleanupRef.current = null;

    if (nodes.length === 0) {
      graphStructureKeyRef.current = "";
      layoutCompletedRef.current = false;
      setGraphSelectionRevision((revision) => revision + 1);
      cy.batch(() => {
        cy.elements().remove();
      });
      return;
    }

    const structureKey = graphStructureKey(nodes, links);
    const structureChanged = structureKey !== graphStructureKeyRef.current;

    if (structureChanged) {
      graphStructureKeyRef.current = structureKey;
      layoutCompletedRef.current = false;
      setGraphSelectionRevision((revision) => revision + 1);
      cy.batch(() => {
        cy.elements().remove();
        if (compoundGraph && isCompoundGraphNodes(nodes)) {
          const scene = rebuildScene(nodePositions);
          if (scene) {
            cy.add(scene.buildElements());
            if (usesPresetLayout(nodePositions)) {
              scene.initializeFromCy(cy);
              syncCompoundReferenceZoom(cy);
            }
          }
        } else {
          cy.add(toElementDefinitions(nodes, links, nodePositions));
        }
      });
    } else if (layoutSyncToken > lastLayoutSyncTokenRef.current) {
      if (compoundGraph && isCompoundGraphNodes(nodes)) {
        const scene = rebuildScene(nodePositions);
        if (scene && usesPresetLayout(nodePositions) && cy.nodes().length > 0) {
          scene.initializeFromCy(cy);
          syncCompoundReferenceZoom(cy);
        }
      }
      lastLayoutSyncTokenRef.current = layoutSyncToken;
    }

    const hasCompoundNodes =
      compoundGraph && nodes.some((node) => Boolean(node.parent || node.data?.isCompound));

    if (!layoutReady || layoutCompletedRef.current) {
      return;
    }

    layoutCleanupRef.current = runLayoutWhenContainerReady(
      cy,
      container,
      nodePositions,
      links.length,
      Boolean(hasCompoundNodes),
      (positions) => {
        onAutoLayoutCompleteRef.current?.(positions);
      },
      () => {
        layoutCompletedRef.current = true;
        if (cyRef.current) {
          applyGraphVisibility(cyRef.current, true);
          if (hasCompoundNodes) {
            initializeCompoundScene(cyRef.current);
          } else {
            measureCompoundSizes();
          }
        }
      },
    );

    return () => {
      layoutCleanupRef.current?.();
      layoutCleanupRef.current = null;
    };
  }, [
    applyGraphVisibility,
    compoundGraph,
    cyReady,
    draggable,
    initializeCompoundScene,
    layoutReady,
    layoutSyncToken,
    links,
    measureCompoundSizes,
    nodePositions,
    nodes,
    rebuildScene,
  ]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cyReady || !cy || !layoutCompletedRef.current) {
      return;
    }

    applyGraphVisibility(cy, true);
  }, [applyGraphVisibility, cyReady, visibleNodeIds]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cyReady || !cy) {
      return;
    }
    cy.style().fromJson(compoundGraph ? workPackageGraphStylesheet() : CYTOSCAPE_STYLESHEET);
  }, [compoundGraph, cyReady]);

  useEffect(() => {
    const shell = graphContainerRef.current;
    const cy = cyRef.current;
    if (!cyReady || !shell || !cy || !draggable || !compoundGraph) {
      return;
    }

    const onPointerEnd = () => {
      shell.classList.remove("graph-child-pointer-active");
    };

    shell.addEventListener("pointerup", onPointerEnd, true);
    shell.addEventListener("pointercancel", onPointerEnd, true);
    return () => {
      shell.removeEventListener("pointerup", onPointerEnd, true);
      shell.removeEventListener("pointercancel", onPointerEnd, true);
      shell.classList.remove("graph-child-pointer-active");
    };
  }, [compoundGraph, cyReady, draggable]);

  useEffect(() => {
    const shell = graphContainerRef.current;
    if (!shell) {
      return;
    }

    shell.tabIndex = -1;
    const focusGraph = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".node-detail-sidebar")) {
        return;
      }
      shell.focus({ preventScroll: true });
    };

    shell.addEventListener("pointerdown", focusGraph, true);
    return () => shell.removeEventListener("pointerdown", focusGraph, true);
  }, [cyReady]);

  const previousSelectedNodeIdRef = useRef<string | null>(selectedNodeId);
  useLayoutEffect(() => {
    const previous = previousSelectedNodeIdRef.current;
    previousSelectedNodeIdRef.current = selectedNodeId;
    if (previous && !selectedNodeId) {
      graphContainerRef.current?.focus({ preventScroll: true });
    }
  }, [selectedNodeId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !selectedNodeId) {
      if (cy) {
        cy.nodes().unselect();
      }
      return;
    }

    const node = cy.getElementById(selectedNodeId);
    if (node.nonempty() && !node.selected()) {
      cy.nodes().unselect();
      node.select();
    }
  }, [selectedNodeId, cyReady]);

  useEffect(() => {
    if (
      !focusNodeId ||
      !nodes.some((node) => node.id === focusNodeId) ||
      (visibleNodeIds && !visibleNodeIds.has(focusNodeId))
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      const cy = cyRef.current;
      if (cy) {
        focusGraphOnNode(cy, focusNodeId);
      }
    }, FOCUS_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [focusNodeId, nodes, visibleNodeIds]);

  const allTypesHidden =
    nodes.length > 0 &&
    visibleNodeIds !== undefined &&
    !nodes.some((node) => visibleNodeIds.has(node.id));

  const resizeCy = cyReady ? cyRef.current : null;
  const activeScene = sceneRef.current;
  void graphSelectionRevision;
  const compositeChromeId = compositeChromeTargetId(resizeCy, nodes);
  const compositeChromeNode = compositeChromeId
    ? nodes.find((node) => node.id === compositeChromeId)
    : undefined;
  const overlayProbeLabel = graphNodeDisplayLabel(
    compositeChromeNode?.label ??
      nodes.find((node) => node.data?.isCompound === false && !node.data?.isOverflow)?.label ??
      "child",
  );

  return (
    <div className="graph-container" ref={graphContainerRef} aria-label="Roadmap graph">
      <div
        className={`graph-viewport${activeScene?.isChildDragInProgress() ? " graph-viewport-dragging" : ""}`}
        ref={containerRef}
      />
      {draggable && resizeCy && activeScene && compoundGraph ? (
        <CompoundOverlays
          cy={resizeCy}
          scene={activeScene}
          referenceZoom={compoundReferenceZoom}
          probeLabel={overlayProbeLabel}
          selectedContainerId={compositeChromeId}
          onResizeComplete={(nodeId, position) =>
            onNodeResizeRef.current?.(nodeId, position)
          }
          onOverlayChange={() => setGraphSelectionRevision((revision) => revision + 1)}
        />
      ) : null}
      {nodes.length === 0 || allTypesHidden ? (
        <div className="graph-empty graph-empty-overlay" aria-live="polite">
          <p>{emptyMessage}</p>
        </div>
      ) : null}
      {contextMenuState && contextMenu
        ? createPortal(
            <div
              className="graph-context-menu-portal"
              style={{
                position: "fixed",
                left: contextMenuState.x,
                top: contextMenuState.y,
                zIndex: 1000,
              }}
            >
              {contextMenu(contextMenuState.event)}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
