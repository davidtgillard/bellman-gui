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
  data?: { type?: string };
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
}

const FOCUS_DELAY_MS = 450;

function toElementDefinitions(
  nodes: GraphViewNode[],
  links: GraphViewLink[],
  nodePositions: Record<string, NodePosition> | undefined,
  usePreset: boolean,
): ElementDefinition[] {
  const nodeIds = nodes.map((node) => node.id);
  const elements: ElementDefinition[] = nodes.map((node) => {
    const saved = nodePositions?.[node.id];
    const position = saved ?? (usePreset ? defaultNodePosition(node.id, nodeIds) : undefined);

    return {
      data: {
        id: node.id,
        label: node.label ?? node.id,
        type: node.data?.type ?? "",
        color: node.fill ?? "#64748b",
      },
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
}: RoadmapGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const layoutCleanupRef = useRef<(() => void) | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const onNodePositionChangeRef = useRef(onNodePositionChange);
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
    if (!cyReady || !cy || !container || nodes.length === 0) {
      return;
    }

    layoutCleanupRef.current?.();
    layoutCleanupRef.current = null;

    const usePreset = usesPresetLayout(draggable, nodePositions);

    cy.batch(() => {
      cy.elements().remove();
      cy.add(toElementDefinitions(nodes, links, nodePositions, usePreset));
    });

    if (draggable) {
      cy.nodes().grabify();
    } else {
      cy.nodes().ungrabify();
    }

    layoutCleanupRef.current = runLayoutWhenContainerReady(
      cy,
      container,
      draggable,
      nodePositions,
      links.length,
    );

    return () => {
      layoutCleanupRef.current?.();
      layoutCleanupRef.current = null;
    };
  }, [cyReady, draggable, links, nodePositions, nodes]);

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

  if (nodes.length === 0) {
    return (
      <div className="graph-empty">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="graph-container">
      <div className="graph-viewport" ref={containerRef} />
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
