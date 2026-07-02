import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GraphContextMenu } from "./components/GraphContextMenu";
import { GraphViewBreadcrumb } from "./components/GraphViewBreadcrumb";
import { NodeDetailSidebar } from "./components/NodeDetailSidebar";
import { CreateLinkDialog } from "./components/CreateLinkDialog";
import { CreateNodeDialog } from "./components/CreateNodeDialog";
import { NodeDetailPanel } from "./components/NodeDetailPanel";
import { RoadmapGraph as RoadmapGraphView } from "./components/RoadmapGraph";
import { NodeTypeLegend } from "./components/NodeTypeLegend";
import exampleRegistry from "./fixtures/example-roadmap/.fits/registry.json";
import exampleLinks from "./fixtures/example-roadmap/links/links.json";
import {
  canCreateLinkFromNode,
  findAddedNodeId,
  fromRoadmapGraphDto,
  graphWithoutLink,
  graphWithoutNode,
  innerGraphForProject,
  nodeLabel,
  nodeTypeColor,
  parseRoadmapGraph,
  topLevelGraphNodes,
  type GraphLink,
  type GraphNode,
  type LinkTypeMeta,
  type RoadmapGraph,
  type RoadmapGraphDto,
  type NodeKind,
} from "./lib/graph";
import {
  createLink,
  createNode,
  removeLink,
  removeNode,
  updateWorkPackage,
} from "./lib/roadmap-api";
import { redo, undo, undoState, type UndoStatus } from "./lib/undo-api";
import { traceUndo } from "./lib/undo-trace";
import {
  applyNodePlacement,
  EMPTY_WORK_PACKAGE_LAYOUT,
  loadWorkPackageLayout,
  normalizeLayoutForNodes,
  normalizeTopLevelPositions,
  projectLayoutKey,
  projectNodePositions,
  removeTopLevelNodePosition,
  removeWorkPackageNodePosition,
  saveGraphLayout,
  saveTopLevelNodePosition,
  saveWorkPackageNodePosition,
  topLevelNodePositions,
  withNodePosition,
  withScopePositions,
  withTopLevelNodePosition,
  withoutNodePosition,
  withoutTopLevelNodePosition,
  type NodePosition,
  type NodeSize,
  type WorkPackageLayout,
} from "./lib/graph-layout";
import { hasSavedLayout } from "./lib/cytoscape-layout";
import {
  buildCompoundWorkPackageView,
  compoundNodeLabel,
  currentProjectId,
  currentWorkPackageFocus,
  graphViewBreadcrumbLabels,
  isOverflowNodeId,
  isWorkPackageGraphView,
  overflowNodeLabel,
  overflowParentId,
  type CompoundWorkPackageViewNode,
  type GraphViewFrame,
  workPackageHasChildren,
} from "./lib/work-package-view";
import { loadNodeDetail, saveNodeMarkdown, type NodeDetail } from "./lib/node-detail";
import {
  loadLegendVisibility,
  resolveVisibleTypes,
  saveLegendVisibility,
} from "./lib/legend-visibility";
import "./App.css";

const exampleGraph = parseRoadmapGraph("example", exampleRegistry, exampleLinks);
const INITIAL_GRAPH_VIEW_STACK: GraphViewFrame[] = [{ kind: "top" }];

function roadmapLayoutPersistable(root: string, editable: boolean): boolean {
  return editable && root !== "example";
}

function App() {
  const [roadmapRoot, setRoadmapRoot] = useState(exampleGraph.root);
  const [editable, setEditable] = useState(exampleGraph.editable);
  const [linkTypes, setLinkTypes] = useState<LinkTypeMeta[]>(exampleGraph.linkTypes);
  const [nodes, setNodes] = useState<GraphNode[]>(exampleGraph.nodes);
  const [links, setLinks] = useState<GraphLink[]>(exampleGraph.links);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [nodeDialogOpen, setNodeDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogInitialNodeId, setLinkDialogInitialNodeId] = useState<string | null>(
    null,
  );
  const [pendingNodePlacement, setPendingNodePlacement] = useState<{
    preferred: NodePosition;
    existingPositions: Record<string, NodePosition>;
  } | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(() =>
    resolveVisibleTypes(
      exampleGraph.nodes.map((node) => node.type),
      loadLegendVisibility(exampleGraph.root),
    ),
  );
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [graphViewStack, setGraphViewStack] =
    useState<GraphViewFrame[]>(INITIAL_GRAPH_VIEW_STACK);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeDetailOpen, setNodeDetailOpen] = useState(false);
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null);
  const [nodeDetailLoading, setNodeDetailLoading] = useState(false);
  const [nodeDetailError, setNodeDetailError] = useState<string | null>(null);
  const [nodeEditing, setNodeEditing] = useState(false);
  const [nodeEditSaving, setNodeEditSaving] = useState(false);
  const [nodeEditError, setNodeEditError] = useState<string | null>(null);
  const nodeEditDirtyRef = useRef(false);
  const nodeDetailRequestRef = useRef(0);
  const legendPersistReadyRef = useRef(false);
  const [workPackageLayout, setWorkPackageLayout] = useState<WorkPackageLayout>(
    EMPTY_WORK_PACKAGE_LAYOUT,
  );
  const [hydratedLayoutKey, setHydratedLayoutKey] = useState<string | null>(() =>
    roadmapLayoutPersistable(exampleGraph.root, exampleGraph.editable) ? null : "",
  );
  const [layoutSyncToken, setLayoutSyncToken] = useState(0);
  const currentLayoutKey = roadmapLayoutPersistable(roadmapRoot, editable)
    ? `${roadmapRoot}:${editable}`
    : null;
  const layoutHydrated =
    currentLayoutKey === null || hydratedLayoutKey === currentLayoutKey;
  const workPackageLayoutRef = useRef(workPackageLayout);
  const layoutSaveChainRef = useRef(Promise.resolve());

  interface ApplyGraphOptions {
    resetVisibleTypes?: boolean;
    revealNodeId?: string;
    layout?: WorkPackageLayout;
  }

  const applyGraph = useCallback((graph: RoadmapGraph, options: ApplyGraphOptions = {}) => {
    setRoadmapRoot(graph.root);
    setEditable(graph.editable);
    setLinkTypes(graph.linkTypes);
    setNodes(graph.nodes);
    setLinks(graph.links);
    if (options.resetVisibleTypes) {
      setVisibleTypes(
        resolveVisibleTypes(
          graph.nodes.map((node) => node.type),
          loadLegendVisibility(graph.root),
        ),
      );
      setFocusNodeId(null);
      setGraphViewStack(INITIAL_GRAPH_VIEW_STACK);
      setSelectedNodeId(null);
      setNodeDetailOpen(false);
      setNodeDetail(null);
      setNodeDetailError(null);
      setNodeDetailLoading(false);
      if (!roadmapLayoutPersistable(graph.root, graph.editable)) {
        setWorkPackageLayout(EMPTY_WORK_PACKAGE_LAYOUT);
        setHydratedLayoutKey("");
      } else {
        setHydratedLayoutKey(null);
      }
    } else {
      setVisibleTypes((current) => {
        const available = new Set(graph.nodes.map((node) => node.type));
        const next = new Set([...current].filter((type) => available.has(type)));
        if (options.revealNodeId) {
          const revealed = graph.nodes.find((node) => node.id === options.revealNodeId);
          if (revealed) {
            next.add(revealed.type);
          }
        }
        return next;
      });
      if (options.revealNodeId) {
        setFocusNodeId(options.revealNodeId);
      }
    }
    setError(null);

    if (options.layout) {
      setWorkPackageLayout(options.layout);
      setHydratedLayoutKey(
        roadmapLayoutPersistable(graph.root, graph.editable)
          ? `${graph.root}:${graph.editable}`
          : "",
      );
      setLayoutSyncToken((token) => token + 1);
    }
  }, []);

  useEffect(() => {
    workPackageLayoutRef.current = workPackageLayout;
  }, [workPackageLayout]);

  useEffect(() => {
    legendPersistReadyRef.current = false;
  }, [roadmapRoot]);

  useEffect(() => {
    if (!legendPersistReadyRef.current) {
      legendPersistReadyRef.current = true;
      return;
    }
    saveLegendVisibility(roadmapRoot, visibleTypes);
  }, [roadmapRoot, visibleTypes]);

  const refreshUndoState = useCallback(
    async (root: string, isEditable: boolean): Promise<UndoStatus | null> => {
      if (!isEditable || root === "example") {
        setCanUndo(false);
        setCanRedo(false);
        return null;
      }
      try {
        const status = await undoState(root);
        setCanUndo(status.canUndo);
        setCanRedo(status.canRedo);
        return status;
      } catch {
        return null;
      }
    },
    [],
  );

  const handleUndo = useCallback(async () => {
    if (!canUndo) {
      return;
    }
    setError(null);
    try {
      const graph = await undo(roadmapRoot);
      applyGraph(graph);
      const status = await refreshUndoState(graph.root, graph.editable);
      if (status) {
        traceUndo("undo", status);
      }
    } catch (caught) {
      setError(String(caught));
    }
  }, [applyGraph, canUndo, refreshUndoState, roadmapRoot]);

  const handleRedo = useCallback(async () => {
    if (!canRedo) {
      return;
    }
    setError(null);
    try {
      const graph = await redo(roadmapRoot);
      applyGraph(graph);
      const status = await refreshUndoState(graph.root, graph.editable);
      if (status) {
        traceUndo("redo", status);
      }
    } catch (caught) {
      setError(String(caught));
    }
  }, [applyGraph, canRedo, refreshUndoState, roadmapRoot]);

  useEffect(() => {
    if (!currentLayoutKey || hydratedLayoutKey === currentLayoutKey) {
      return;
    }

    let cancelled = false;

    void loadWorkPackageLayout(roadmapRoot)
      .then((layout) => {
        if (!cancelled) {
          setWorkPackageLayout(layout);
          setHydratedLayoutKey(currentLayoutKey);
          setLayoutSyncToken((token) => token + 1);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(String(caught));
          setHydratedLayoutKey(currentLayoutKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentLayoutKey, hydratedLayoutKey, roadmapRoot]);

  const persistNodePosition = useCallback(
    (projectId: string | null, nodeId: string, position: NodePosition) => {
      if (!roadmapLayoutPersistable(roadmapRoot, editable)) {
        return;
      }

      layoutSaveChainRef.current = layoutSaveChainRef.current
        .then(async () => {
          try {
            const layout = projectId
              ? await saveWorkPackageNodePosition({
                  roadmap_root: roadmapRoot,
                  project_id: projectLayoutKey(projectId),
                  node_id: nodeId,
                  x: position.x,
                  y: position.y,
                  w: position.w,
                  h: position.h,
                })
              : await saveTopLevelNodePosition({
                  roadmap_root: roadmapRoot,
                  node_id: nodeId,
                  x: position.x,
                  y: position.y,
                  w: position.w,
                  h: position.h,
                });
            setWorkPackageLayout(layout);
          } catch (caught) {
            setError(String(caught));
          }
        })
        .catch(() => undefined);
    },
    [editable, roadmapRoot],
  );

  const handleNodePositionChange = useCallback(
    (positions: Record<string, NodePosition>) => {
      const projectId = currentProjectId(graphViewStack);
      let nextLayout = workPackageLayoutRef.current;

      for (const [nodeId, position] of Object.entries(positions)) {
        nextLayout = projectId
          ? withNodePosition(nextLayout, projectId, nodeId, position)
          : withTopLevelNodePosition(nextLayout, nodeId, position);
      }

      workPackageLayoutRef.current = nextLayout;
      setWorkPackageLayout(nextLayout);

      if (!roadmapLayoutPersistable(roadmapRoot, editable)) {
        return;
      }

      void saveGraphLayout(roadmapRoot, nextLayout).catch((caught) =>
        setError(String(caught)),
      );
    },
    [editable, graphViewStack, roadmapRoot],
  );

  const handleNodeResize = useCallback(
    (nodeId: string, position: NodePosition) => {
      // A resize gesture reports the composite's new centre and size together;
      // withNodePosition/withTopLevelNodePosition merge both into the layout.
      const projectId = currentProjectId(graphViewStack);
      if (projectId) {
        setWorkPackageLayout((current) =>
          withNodePosition(current, projectId, nodeId, position),
        );
        persistNodePosition(projectId, nodeId, position);
        return;
      }

      setWorkPackageLayout((current) =>
        withTopLevelNodePosition(current, nodeId, position),
      );
      persistNodePosition(null, nodeId, position);
    },
    [graphViewStack, persistNodePosition],
  );

  const handleCompoundSizesMeasured = useCallback(
    (sizes: Record<string, NodeSize>, measuredPositions: Record<string, NodePosition>) => {
      if (!roadmapLayoutPersistable(roadmapRoot, editable) || !layoutHydrated) {
        return;
      }

      const projectId = currentProjectId(graphViewStack);
      const current = workPackageLayoutRef.current;
      const existing = projectId
        ? projectNodePositions(current, projectId)
        : topLevelNodePositions(current);

      // Freeze an initial size for any composite that does not yet have one, so
      // its box stops auto-resizing when children are moved. Composites that
      // already have a saved size are left untouched.
      let nextLayout = current;
      let changed = false;
      for (const [nodeId, size] of Object.entries(sizes)) {
        const saved = existing[nodeId];
        if (saved && saved.w !== undefined && saved.h !== undefined) {
          continue;
        }
        const position = saved ?? measuredPositions[nodeId];
        if (!position) {
          continue;
        }
        nextLayout = projectId
          ? withNodePosition(nextLayout, projectId, nodeId, {
              ...position,
              w: size.w,
              h: size.h,
            })
          : withTopLevelNodePosition(nextLayout, nodeId, {
              ...position,
              w: size.w,
              h: size.h,
            });
        changed = true;
      }

      if (!changed) {
        return;
      }

      workPackageLayoutRef.current = nextLayout;
      setWorkPackageLayout(nextLayout);
      void saveGraphLayout(roadmapRoot, nextLayout).catch((caught) =>
        setError(String(caught)),
      );
    },
    [editable, graphViewStack, layoutHydrated, roadmapRoot],
  );

  const handleAutoLayoutComplete = useCallback(
    (positions: Record<string, NodePosition>) => {
      if (!roadmapLayoutPersistable(roadmapRoot, editable) || !layoutHydrated) {
        return;
      }

      const projectId = currentProjectId(graphViewStack);
      const scope = projectId
        ? ({ kind: "project" as const, projectId })
        : ({ kind: "top_level" as const });
      const current = workPackageLayoutRef.current;
      const existing = projectId
        ? projectNodePositions(current, projectId)
        : topLevelNodePositions(current);

      if (hasSavedLayout(existing)) {
        return;
      }

      const nextLayout = normalizeLayoutForNodes(
        withScopePositions(current, scope, positions),
        nodes,
      );
      workPackageLayoutRef.current = nextLayout;
      setWorkPackageLayout(nextLayout);
      void saveGraphLayout(roadmapRoot, nextLayout).catch((caught) =>
        setError(String(caught)),
      );
    },
    [editable, graphViewStack, layoutHydrated, nodes, roadmapRoot],
  );

  const handleOpenRoadmap = useCallback(async () => {
    setError(null);

    try {
      const dto = await invoke<RoadmapGraphDto | null>("pick_and_load_roadmap");
      if (dto) {
        const graph = fromRoadmapGraphDto(dto);
        applyGraph(graph, { resetVisibleTypes: true });
        void refreshUndoState(graph.root, graph.editable);
      }
    } catch (caught) {
      const message = String(caught);
      setError(
        message.includes("dialog") || message.includes("folder")
          ? message
          : `${message}. If the folder picker did not appear, check that a display server is available (common on WSL).`,
      );
    }
  }, [applyGraph, refreshUndoState]);

  const handleCreateNode = useCallback(
    async (input: {
      nodeKind: NodeKind;
      name: string;
      project?: string;
      description?: string;
    }) => {
      setSaving(true);
      setError(null);

      const placement = pendingNodePlacement;
      const projectId = currentProjectId(graphViewStack);
      const inProjectGraph = isWorkPackageGraphView(graphViewStack);
      const placementScope = inProjectGraph && projectId
        ? ({ kind: "project" as const, projectId })
        : ({ kind: "top_level" as const });

      try {
        const previousNodes = nodes;
        const graph = await createNode({
          roadmap_root: roadmapRoot,
          node_kind: input.nodeKind,
          name: input.name,
          project: input.project,
          description: input.description,
        });
        const revealNodeId = findAddedNodeId(previousNodes, graph.nodes);
        let savedLayout: WorkPackageLayout | undefined;

        if (
          revealNodeId &&
          placement &&
          roadmapLayoutPersistable(roadmapRoot, graph.editable)
        ) {
          const { layout: nextLayout } = applyNodePlacement(
            workPackageLayout,
            placementScope,
            revealNodeId,
            placement.preferred,
            placement.existingPositions,
          );
          savedLayout = await saveGraphLayout(roadmapRoot, nextLayout);
        }

        applyGraph(graph, {
          ...(revealNodeId ? { revealNodeId } : {}),
          ...(savedLayout ? { layout: savedLayout } : {}),
        });
        void refreshUndoState(graph.root, graph.editable);
        setPendingNodePlacement(null);
        setNodeDialogOpen(false);
      } catch (caught) {
        setError(String(caught));
      } finally {
        setSaving(false);
      }
    },
    [
      applyGraph,
      graphViewStack,
      nodes,
      pendingNodePlacement,
      refreshUndoState,
      roadmapRoot,
      workPackageLayout,
    ],
  );

  const handleCreateLink = useCallback(
    async (input: { linkType: string; source: string; target: string }) => {
      setSaving(true);
      setError(null);

      try {
        const graph = await createLink({
          roadmap_root: roadmapRoot,
          link_type: input.linkType,
          source: input.source,
          target: input.target,
        });
        applyGraph(graph);
        void refreshUndoState(graph.root, graph.editable);
        setLinkDialogOpen(false);
        setLinkDialogInitialNodeId(null);
      } catch (caught) {
        setError(String(caught));
      } finally {
        setSaving(false);
      }
    },
    [applyGraph, refreshUndoState, roadmapRoot],
  );

  const handleRemoveNode = useCallback(
    async (nodeId: string, nodeType: string) => {
      const projectId = currentProjectId(graphViewStack);
      const snapshot = { nodes, links };
      const optimistic = graphWithoutNode(nodes, links, nodeId);
      setNodes(optimistic.nodes);
      setLinks(optimistic.links);
      setSaving(true);
      setError(null);

      if (selectedNodeId === nodeId) {
        setNodeDetailOpen(false);
        setSelectedNodeId(null);
        setNodeDetail(null);
        setNodeDetailError(null);
        setNodeDetailLoading(false);
      }
      if (projectId === nodeId) {
        setGraphViewStack(INITIAL_GRAPH_VIEW_STACK);
      }
      if (
        nodeType === "work_package" &&
        projectId &&
        roadmapLayoutPersistable(roadmapRoot, editable)
      ) {
        setWorkPackageLayout((current) =>
          withoutNodePosition(current, projectId, nodeId),
        );
        void removeWorkPackageNodePosition(
          roadmapRoot,
          projectLayoutKey(projectId),
          nodeId,
        )
          .then(setWorkPackageLayout)
          .catch((caught) => setError(String(caught)));
      } else if (
        !projectId &&
        roadmapLayoutPersistable(roadmapRoot, editable) &&
        nodeId in workPackageLayout.topLevel
      ) {
        setWorkPackageLayout((current) => withoutTopLevelNodePosition(current, nodeId));
        void removeTopLevelNodePosition(roadmapRoot, nodeId)
          .then(setWorkPackageLayout)
          .catch((caught) => setError(String(caught)));
      }

      try {
        const graph = await removeNode({
          roadmap_root: roadmapRoot,
          node_id: nodeId,
          node_type: nodeType,
        });
        applyGraph(graph);
        void refreshUndoState(graph.root, graph.editable);
      } catch (caught) {
        setNodes(snapshot.nodes);
        setLinks(snapshot.links);
        setError(String(caught));
      } finally {
        setSaving(false);
      }
    },
    [
      applyGraph,
      editable,
      graphViewStack,
      links,
      nodes,
      refreshUndoState,
      roadmapRoot,
      selectedNodeId,
      workPackageLayout,
    ],
  );

  const handleRemoveLink = useCallback(
    async (linkId: string) => {
      const snapshot = links;
      setLinks(graphWithoutLink(links, linkId));
      setSaving(true);
      setError(null);

      try {
        const graph = await removeLink({
          roadmap_root: roadmapRoot,
          link_id: linkId,
        });
        applyGraph(graph);
        void refreshUndoState(graph.root, graph.editable);
      } catch (caught) {
        setLinks(snapshot);
        setError(String(caught));
      } finally {
        setSaving(false);
      }
    },
    [applyGraph, links, refreshUndoState, roadmapRoot],
  );

  useEffect(() => {
    invoke<RoadmapGraphDto | null>("load_initial_roadmap")
      .then((dto) => {
        if (dto) {
          const graph = fromRoadmapGraphDto(dto);
          applyGraph(graph, { resetVisibleTypes: true });
          void refreshUndoState(graph.root, graph.editable);
        }
      })
      .catch((caught) => setError(String(caught)));
  }, [applyGraph, refreshUndoState]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen("open-roadmap", () => {
      void handleOpenRoadmap();
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      unlisten?.();
    };
  }, [handleOpenRoadmap]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier || event.key.toLowerCase() !== "z") {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        void handleRedo();
      } else {
        void handleUndo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRedo, handleUndo]);

  useEffect(() => {
    let unlistenUndo: (() => void) | undefined;
    let unlistenRedo: (() => void) | undefined;

    void listen("undo", () => void handleUndo()).then((dispose) => {
      unlistenUndo = dispose;
    });
    void listen("redo", () => void handleRedo()).then((dispose) => {
      unlistenRedo = dispose;
    });

    return () => {
      unlistenUndo?.();
      unlistenRedo?.();
    };
  }, [handleRedo, handleUndo]);

  const activeProjectId = useMemo(
    () => currentProjectId(graphViewStack),
    [graphViewStack],
  );
  const activeWorkPackageFocus = useMemo(
    () => currentWorkPackageFocus(graphViewStack),
    [graphViewStack],
  );
  const inWorkPackageGraph = isWorkPackageGraphView(graphViewStack);

  const compoundView = useMemo(() => {
    if (!activeProjectId) {
      return null;
    }
    return buildCompoundWorkPackageView({
      nodes,
      links,
      projectId: activeProjectId,
      focusParentId: activeWorkPackageFocus,
    });
  }, [activeProjectId, activeWorkPackageFocus, links, nodes]);

  const nodeTypes = useMemo(() => {
    const sourceNodes = activeProjectId
      ? innerGraphForProject(nodes, links, activeProjectId).nodes
      : topLevelGraphNodes(nodes);
    return [...new Set(sourceNodes.map((node) => node.type))].sort();
  }, [activeProjectId, links, nodes]);

  const displayGraph = useMemo(() => {
    if (compoundView) {
      return {
        nodes: compoundView.displayNodes,
        links: compoundView.displayLinks,
      };
    }
    return {
      nodes: topLevelGraphNodes(nodes),
      links,
    };
  }, [compoundView, links, nodes]);

  const filteredNodes = useMemo(
    () => displayGraph.nodes.filter((node) => visibleTypes.has(node.type)),
    [displayGraph.nodes, visibleTypes],
  );

  const visibleNodeIds = useMemo(
    () => new Set(filteredNodes.map((node) => node.id)),
    [filteredNodes],
  );

  const displayNodeIds = useMemo(
    () => new Set(displayGraph.nodes.map((node) => node.id)),
    [displayGraph.nodes],
  );

  const graphViewNodes = useMemo(
    () =>
      displayGraph.nodes.map((node) => {
        if (compoundView) {
          const compoundNode = node as CompoundWorkPackageViewNode;
          const label =
            compoundNode.isOverflow && compoundNode.parent
              ? overflowNodeLabel(
                  compoundNode.parent,
                  compoundView.overflowByParent.get(compoundNode.parent) ??
                    compoundNode.overflowCount ??
                    0,
                )
              : compoundNodeLabel(compoundNode);

          return {
            id: compoundNode.id,
            label,
            subLabel: compoundNode.subLabel,
            fill: nodeTypeColor(compoundNode.type),
            parent: compoundNode.parent,
            classes: compoundNode.isOverflow ? "overflow" : undefined,
            data: {
              type: compoundNode.type,
              isCompound: compoundNode.isCompound,
              isOverflow: compoundNode.isOverflow,
            },
          };
        }

        return {
          id: node.id,
          label: nodeLabel(node.id),
          fill: nodeTypeColor(node.type),
          data: { type: node.type },
        };
      }),
    [compoundView, displayGraph.nodes],
  );

  const graphViewLinks = useMemo(
    () =>
      displayGraph.links
        .filter(
          (link) => displayNodeIds.has(link.source) && displayNodeIds.has(link.target),
        )
        .map((link) => ({
          id: link.id,
          source: link.source,
          target: link.target,
          label: link.linkType,
        })),
    [displayGraph.links, displayNodeIds],
  );
  const layoutReady =
    !roadmapLayoutPersistable(roadmapRoot, editable) || layoutHydrated;
  const innerGraphNodePositions = useMemo(() => {
    const positions = activeProjectId
      ? projectNodePositions(workPackageLayout, activeProjectId)
      : topLevelNodePositions(workPackageLayout);
    if (activeProjectId) {
      return positions;
    }
    return normalizeTopLevelPositions(positions, topLevelGraphNodes(nodes));
  }, [activeProjectId, nodes, workPackageLayout]);

  const handleToggleType = useCallback((type: string) => {
    setVisibleTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const handleNodeEditDirtyChange = useCallback((dirty: boolean) => {
    nodeEditDirtyRef.current = dirty;
  }, []);

  const confirmDiscardIfDirty = useCallback(() => {
    if (!nodeEditDirtyRef.current) {
      return true;
    }
    const confirmed = window.confirm("Discard unsaved changes to this node?");
    if (confirmed) {
      nodeEditDirtyRef.current = false;
    }
    return confirmed;
  }, []);

  const clearGraphSelection = useCallback(() => {
    setFocusNodeId(null);
    setSelectedNodeId(null);
    setNodeDetailOpen(false);
    setNodeDetail(null);
    setNodeDetailError(null);
    setNodeDetailLoading(false);
    setNodeEditing(false);
    setNodeEditError(null);
    nodeEditDirtyRef.current = false;
  }, []);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      const overflowParent = overflowParentId(nodeId);
      if (overflowParent) {
        setGraphViewStack((current) => {
          const projectId = currentProjectId(current);
          if (!projectId) {
            return current;
          }
          return [
            ...current,
            { kind: "work_package", projectId, workPackageId: overflowParent },
          ];
        });
        clearGraphSelection();
        return;
      }

      if (nodeId === selectedNodeId) {
        return;
      }

      if (!confirmDiscardIfDirty()) {
        return;
      }

      const node = nodes.find((item) => item.id === nodeId);
      setSelectedNodeId(nodeId);
      setNodeEditing(false);
      setNodeEditError(null);
      setNodeDetailOpen(true);
      setNodeDetail(null);
      setNodeDetailError(null);

      if (!node) {
        setNodeDetailLoading(false);
        return;
      }

      setNodeDetailLoading(true);
      const requestId = nodeDetailRequestRef.current + 1;
      nodeDetailRequestRef.current = requestId;
      void loadNodeDetail(roadmapRoot, nodeId, node.type)
        .then((detail) => {
          if (nodeDetailRequestRef.current !== requestId) {
            return;
          }
          setNodeDetail(detail);
          setNodeDetailError(null);
        })
        .catch((caught) => {
          if (nodeDetailRequestRef.current !== requestId) {
            return;
          }
          setNodeDetail(null);
          setNodeDetailError(String(caught));
        })
        .finally(() => {
          if (nodeDetailRequestRef.current === requestId) {
            setNodeDetailLoading(false);
          }
        });
    },
    [clearGraphSelection, confirmDiscardIfDirty, nodes, roadmapRoot, selectedNodeId],
  );

  const handleShowInnerGraph = useCallback(
    (projectId: string) => {
      setGraphViewStack([{ kind: "top" }, { kind: "project", projectId }]);
      clearGraphSelection();
      setVisibleTypes((current) => {
        const next = new Set(current);
        next.add("work_package");
        return next;
      });
    },
    [clearGraphSelection],
  );

  const handleShowWorkPackageInnerGraph = useCallback(
    (workPackageId: string) => {
      setGraphViewStack((current) => {
        const projectId = currentProjectId(current);
        if (!projectId) {
          return current;
        }
        if (currentWorkPackageFocus(current) === workPackageId) {
          return current;
        }
        return [...current, { kind: "work_package", projectId, workPackageId }];
      });
      clearGraphSelection();
    },
    [clearGraphSelection],
  );

  const handleBackGraphView = useCallback(() => {
    if (!confirmDiscardIfDirty()) {
      return;
    }
    void layoutSaveChainRef.current;
    setGraphViewStack((current) =>
      current.length <= 1 ? INITIAL_GRAPH_VIEW_STACK : current.slice(0, -1),
    );
    clearGraphSelection();
  }, [clearGraphSelection, confirmDiscardIfDirty]);

  const handleGraphSelectionClear = useCallback((): boolean => {
    if (!confirmDiscardIfDirty()) {
      return false;
    }
    clearGraphSelection();
    return true;
  }, [clearGraphSelection, confirmDiscardIfDirty]);

  const renderContextMenu = useCallback(
    (event: {
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
    }) => {
      const isBackground = event.data.background === true;

      const isEdge =
        !isBackground &&
        typeof event.data.source === "string" &&
        typeof event.data.target === "string" &&
        !("position" in event.data);

      if (isBackground) {
        if (!editable) {
          return null;
        }

        return (
          <GraphContextMenu
            editable={editable}
            background
            onCreateNode={() => {
              const graphPosition = event.data.graphPosition;
              const nodePositions = event.data.nodePositions;
              if (graphPosition && nodePositions) {
                setPendingNodePlacement({
                  preferred: graphPosition,
                  existingPositions: nodePositions,
                });
              } else {
                setPendingNodePlacement(null);
              }
              setNodeDialogOpen(true);
            }}
            onClose={event.onClose}
          />
        );
      }

      if (isEdge) {
        if (!editable) {
          return null;
        }

        return (
          <GraphContextMenu
            editable={editable}
            linkId={event.data.id}
            onRemoveLink={(linkId) => void handleRemoveLink(linkId)}
            onClose={event.onClose}
          />
        );
      }

      const nodeType =
        typeof event.data.data?.type === "string" ? event.data.data.type : "";

      const nodeId = event.data.id;
      const node = nodes.find((item) => item.id === nodeId);
      const canCreateLink =
        node !== undefined && canCreateLinkFromNode(node, nodes, linkTypes);

      return (
        <GraphContextMenu
          editable={editable}
          nodeId={nodeId}
          nodeType={nodeType}
          canCreateLink={canCreateLink}
          showInnerGraph={!inWorkPackageGraph && nodeType === "project"}
          innerGraphAvailable={
            innerGraphForProject(nodes, links, nodeId).nodes.length > 0
          }
          showWorkPackageInnerGraph={
            inWorkPackageGraph &&
            nodeType === "work_package" &&
            !isOverflowNodeId(nodeId) &&
            activeWorkPackageFocus !== nodeId &&
            compoundView !== null
          }
          workPackageInnerGraphAvailable={
            compoundView !== null &&
            workPackageHasChildren(nodeId, compoundView.childrenByParent)
          }
          onCreateLink={(startNodeId) => {
            setLinkDialogInitialNodeId(startNodeId);
            setLinkDialogOpen(true);
          }}
          onShowInnerGraph={handleShowInnerGraph}
          onShowWorkPackageInnerGraph={handleShowWorkPackageInnerGraph}
          onRemoveNode={(removeNodeId, type) => void handleRemoveNode(removeNodeId, type)}
          onClose={event.onClose}
        />
      );
    },
    [
      activeWorkPackageFocus,
      compoundView,
      editable,
      handleRemoveLink,
      handleRemoveNode,
      handleShowInnerGraph,
      handleShowWorkPackageInnerGraph,
      inWorkPackageGraph,
      linkTypes,
      links,
      nodes,
    ],
  );

  const breadcrumbLabels = useMemo(
    () => graphViewBreadcrumbLabels(graphViewStack),
    [graphViewStack],
  );

  const graphEmptyMessage = inWorkPackageGraph
    ? activeProjectId
      ? `Project ${nodeLabel(activeProjectId)} has no work packages to display.`
      : "This project has no work packages to display."
    : nodes.length === 0
      ? "Open a bellman roadmap folder to view its graph."
      : "Select at least one node type to display.";

  const handleDetailClose = useCallback(() => {
    if (!confirmDiscardIfDirty()) {
      return;
    }
    setNodeDetailOpen(false);
    setSelectedNodeId(null);
    setNodeDetail(null);
    setNodeDetailError(null);
    setNodeDetailLoading(false);
    setNodeEditing(false);
    setNodeEditError(null);
  }, [confirmDiscardIfDirty]);

  const handleStartNodeEdit = useCallback(() => {
    setNodeEditError(null);
    nodeEditDirtyRef.current = false;
    setNodeEditing(true);
  }, []);

  const handleCancelNodeEdit = useCallback(() => {
    nodeEditDirtyRef.current = false;
    setNodeEditError(null);
    setNodeEditing(false);
  }, []);

  const handleSaveNodeMarkdown = useCallback(
    async (markdown: string) => {
      if (!nodeDetail) {
        return;
      }
      const nodeId = nodeDetail.nodeId;
      setNodeEditSaving(true);
      setNodeEditError(null);
      try {
        const detail = await saveNodeMarkdown(roadmapRoot, nodeId, markdown);
        setNodeDetail(detail);
        nodeEditDirtyRef.current = false;
        setNodeEditing(false);
        void refreshUndoState(roadmapRoot, editable);
      } catch (caught) {
        setNodeEditError(String(caught));
      } finally {
        setNodeEditSaving(false);
      }
    },
    [editable, nodeDetail, refreshUndoState, roadmapRoot],
  );

  const handleSaveWorkPackage = useCallback(
    async (input: { description: string; dependencies: string[] }) => {
      if (!nodeDetail || !nodeDetail.workPackage) {
        return;
      }
      const nodeId = nodeDetail.nodeId;
      const nodeType = nodeDetail.nodeType;
      setNodeEditSaving(true);
      setNodeEditError(null);
      try {
        const graph = await updateWorkPackage({
          roadmap_root: roadmapRoot,
          node_id: nodeId,
          description: input.description,
          dependencies: input.dependencies,
        });
        applyGraph(graph);
        const detail = await loadNodeDetail(graph.root, nodeId, nodeType);
        setNodeDetail(detail);
        nodeEditDirtyRef.current = false;
        setNodeEditing(false);
        void refreshUndoState(graph.root, graph.editable);
      } catch (caught) {
        setNodeEditError(String(caught));
      } finally {
        setNodeEditSaving(false);
      }
    },
    [applyGraph, nodeDetail, refreshUndoState, roadmapRoot],
  );

  const selectedNode = selectedNodeId
    ? nodes.find((item) => item.id === selectedNodeId)
    : undefined;
  const missingNodeError =
    nodeDetailOpen && selectedNodeId && !selectedNode
      ? "Selected node is not available in the current graph."
      : null;

  const detailTitle = selectedNodeId ? nodeLabel(selectedNodeId) : "Node details";

  useEffect(() => {
    if (!nodeDetailOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [nodeDetailOpen]);

  return (
    <main className="app-shell">
      {error ? (
        <div className="error-banner" role="alert">
          <span className="error-banner-message">{error}</span>
          <button
            type="button"
            className="error-banner-dismiss"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      ) : null}
      {!editable ? (
        <div className="info-banner">
          The bundled example graph is read-only. Open a roadmap folder, then right-click the
          graph to create nodes and right-click a node to create links.
        </div>
      ) : null}
      <div className="graph-area">
        <div className="graph-dock-panel">
          {inWorkPackageGraph ? (
            <GraphViewBreadcrumb labels={breadcrumbLabels} onBack={handleBackGraphView} />
          ) : null}
          <RoadmapGraphView
            nodes={graphViewNodes}
            links={graphViewLinks}
            visibleNodeIds={visibleNodeIds}
            focusNodeId={focusNodeId}
            selectedNodeId={selectedNodeId}
            onNodeClick={handleNodeClick}
            onSelectionClear={handleGraphSelectionClear}
            contextMenu={renderContextMenu}
            emptyMessage={graphEmptyMessage}
            draggable
            layoutReady={layoutReady}
            layoutSyncToken={layoutSyncToken}
            nodePositions={innerGraphNodePositions}
            onNodePositionChange={
              roadmapLayoutPersistable(roadmapRoot, editable)
                ? handleNodePositionChange
                : undefined
            }
            onNodeResize={
              roadmapLayoutPersistable(roadmapRoot, editable)
                ? handleNodeResize
                : undefined
            }
            onCompoundSizesMeasured={
              roadmapLayoutPersistable(roadmapRoot, editable)
                ? handleCompoundSizesMeasured
                : undefined
            }
            onAutoLayoutComplete={
              roadmapLayoutPersistable(roadmapRoot, editable)
                ? handleAutoLayoutComplete
                : undefined
            }
          />
          {!inWorkPackageGraph ? (
            <NodeTypeLegend
              types={nodeTypes}
              visibleTypes={visibleTypes}
              onToggleType={handleToggleType}
            />
          ) : null}
        </div>
        {nodeDetailOpen ? (
          <NodeDetailSidebar title={detailTitle} onClose={handleDetailClose}>
            <NodeDetailPanel
              detail={nodeDetail}
              loading={nodeDetailLoading}
              error={missingNodeError ?? nodeDetailError}
              editable={editable && roadmapRoot !== "example"}
              editing={nodeEditing}
              saving={nodeEditSaving}
              saveError={nodeEditError}
              onStartEdit={handleStartNodeEdit}
              onCancelEdit={handleCancelNodeEdit}
              onSaveMarkdown={(markdown) => void handleSaveNodeMarkdown(markdown)}
              onSaveWorkPackage={(input) => void handleSaveWorkPackage(input)}
              onDirtyChange={handleNodeEditDirtyChange}
            />
          </NodeDetailSidebar>
        ) : null}
      </div>
      <CreateNodeDialog
        open={nodeDialogOpen}
        nodes={nodes}
        saving={saving}
        onClose={() => {
          setNodeDialogOpen(false);
          setPendingNodePlacement(null);
          setError(null);
        }}
        onCreate={(input) => void handleCreateNode(input)}
      />
      <CreateLinkDialog
        open={linkDialogOpen}
        nodes={nodes}
        linkTypes={linkTypes}
        saving={saving}
        initialNodeId={linkDialogInitialNodeId}
        onClose={() => {
          setLinkDialogOpen(false);
          setLinkDialogInitialNodeId(null);
          setError(null);
        }}
        onCreate={(input) => void handleCreateLink(input)}
      />
    </main>
  );
}

export default App;
