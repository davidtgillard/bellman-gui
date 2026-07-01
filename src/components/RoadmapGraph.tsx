import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import fcose from "cytoscape-fcose";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CYTOSCAPE_STYLESHEET } from "../lib/cytoscape-theme";
import {
  runLayoutWhenContainerReady,
  usesPresetLayout,
} from "../lib/cytoscape-layout";
import { defaultNodePosition, type NodePosition } from "../lib/graph-layout";

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
  emptyMessage?: string;
  focusNodeId?: string | null;
  selectedNodeId?: string | null;
  onNodeClick?: (nodeId: string) => void;
  contextMenu?: (event: GraphContextMenuEvent) => ReactNode;
  draggable?: boolean;
  nodePositions?: Record<string, NodePosition>;
  onNodePositionChange?: (nodeId: string, position: NodePosition) => void;
  onAutoLayoutComplete?: (positions: Record<string, NodePosition>) => void;
  layoutReady?: boolean;
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
  const nodeIds = nodes.map((node) => node.id);
  const usePreset = usesPresetLayout(nodePositions);
  const elements: ElementDefinition[] = sortGraphViewNodes(nodes).map((node) => {
    const saved = nodePositions?.[node.id];
    const position = saved ?? (usePreset ? defaultNodePosition(node.id, nodeIds) : undefined);
    const label = node.subLabel
      ? `${node.label ?? node.id}\n${node.subLabel}`
      : (node.label ?? node.id);

    return {
      data: {
        id: node.id,
        label,
        subLabel: node.subLabel,
        type: node.data?.type ?? "",
        color: node.fill ?? "#64748b",
        ...(node.parent ? { parent: node.parent } : {}),
      },
      classes: node.classes,
      ...(position ? { position: { x: position.x, y: position.y } } : {}),
    };
  });

  for (const link of links) {
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

function focusGraphOnNode(cy: Core, nodeId: string): void {
  const node = cy.getElementById(nodeId);
  if (node.nonempty()) {
    cy.animate({
      fit: { eles: node, padding: 60 },
      duration: 300,
    });
  }
}

interface ContextMenuState {
  x: number;
  y: number;
  event: GraphContextMenuEvent;
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
  onAutoLayoutComplete,
  layoutReady = true,
}: RoadmapGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const layoutCleanupRef = useRef<(() => void) | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const onNodePositionChangeRef = useRef(onNodePositionChange);
  const onAutoLayoutCompleteRef = useRef(onAutoLayoutComplete);
  const contextMenuRef = useRef(contextMenu);
  const [cyReady, setCyReady] = useState(false);
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState | null>(
    null,
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuState(null);
  }, []);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  useEffect(() => {
    onNodePositionChangeRef.current = onNodePositionChange;
  }, [onNodePositionChange]);

  useEffect(() => {
    onAutoLayoutCompleteRef.current = onAutoLayoutComplete;
  }, [onAutoLayoutComplete]);

  useEffect(() => {
    contextMenuRef.current = contextMenu;
  }, [contextMenu]);

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

    const cy = cytoscape({
      container,
      style: CYTOSCAPE_STYLESHEET,
      wheelSensitivity: 0.2,
      boxSelectionEnabled: false,
      minZoom: 0.2,
      maxZoom: 3,
    });

    cyRef.current = cy;
    setCyReady(true);

    cy.on("tap", "node", (event) => {
      closeContextMenu();
      const node = event.target;
      cy.nodes().unselect();
      node.select();
      onNodeClickRef.current?.(node.id());
    });

    cy.on("tap", "edge", () => {
      closeContextMenu();
      cy.nodes().unselect();
    });

    cy.on("tap", (event) => {
      if (event.target === cy) {
        closeContextMenu();
        cy.nodes().unselect();
      }
    });

    cy.on("cxttap", "node", (event) => {
      const node = event.target;
      const originalEvent = event.originalEvent as MouseEvent;
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

      setContextMenuState({
        x: originalEvent.clientX,
        y: originalEvent.clientY,
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

    cy.on("dragfree", "node", (event) => {
      const node = event.target;
      const pos = node.position();
      onNodePositionChangeRef.current?.(node.id(), { x: pos.x, y: pos.y });
    });

    const resizeObserver = new ResizeObserver(() => {
      cy.resize();
    });
    resizeObserver.observe(container);

    return () => {
      layoutCleanupRef.current?.();
      layoutCleanupRef.current = null;
      resizeObserver.disconnect();
      setCyReady(false);
      cy.destroy();
      cyRef.current = null;
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
      cy.batch(() => {
        cy.elements().remove();
      });
      return;
    }

    cy.batch(() => {
      cy.elements().remove();
      cy.add(toElementDefinitions(nodes, links, nodePositions));
    });

    if (draggable) {
      cy.nodes().grabify();
    } else {
      cy.nodes().ungrabify();
    }

    if (!layoutReady) {
      return;
    }

    layoutCleanupRef.current = runLayoutWhenContainerReady(
      cy,
      container,
      nodePositions,
      links.length,
      nodes.some((node) => Boolean(node.parent || node.data?.isCompound)),
      (positions) => onAutoLayoutCompleteRef.current?.(positions),
    );

    return () => {
      layoutCleanupRef.current?.();
      layoutCleanupRef.current = null;
    };
  }, [cyReady, draggable, layoutReady, links, nodePositions, nodes]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !selectedNodeId) {
      return;
    }

    const node = cy.getElementById(selectedNodeId);
    if (node.nonempty()) {
      cy.nodes().unselect();
      node.select();
    }
  }, [selectedNodeId]);

  useEffect(() => {
    if (!focusNodeId || !nodes.some((node) => node.id === focusNodeId)) {
      return;
    }

    const timer = window.setTimeout(() => {
      const cy = cyRef.current;
      if (cy) {
        focusGraphOnNode(cy, focusNodeId);
      }
    }, FOCUS_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [focusNodeId, nodes]);

  return (
    <div className="graph-container">
      <div className="graph-viewport" ref={containerRef} />
      {nodes.length === 0 ? (
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
