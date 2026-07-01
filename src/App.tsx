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
import { createLink, createNode, removeLink, removeNode } from "./lib/roadmap-api";
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
import { loadNodeDetail, type NodeDetail } from "./lib/node-detail";
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
  const [sidecarVersion, setSidecarVersion] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nodeDialogOpen, setNodeDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogInitialNodeId, setLinkDialogInitialNodeId] = useState<string | null>(
    null,
  );
  const [pendingNodePlacement, setPendingNodePlacement] = useState<{
    preferred: NodePosition;
    existingPositions: Record<string, NodePosition>;
  } | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(
    () => new Set(exampleGraph.nodes.map((node) => node.type)),
  );
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [graphViewStack, setGraphViewStack] =
    useState<GraphViewFrame[]>(INITIAL_GRAPH_VIEW_STACK);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeDetailOpen, setNodeDetailOpen] = useState(false);
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null);
  const [nodeDetailLoading, setNodeDetailLoading] = useState(false);
  const [nodeDetailError, setNodeDetailError] = useState<string | null>(null);
  const nodeDetailRequestRef = useRef(0);
  const [workPackageLayout, setWorkPackageLayout] = useState<WorkPackageLayout>(
    EMPTY_WORK_PACKAGE_LAYOUT,
  );
  const [layoutHydrated, setLayoutHydrated] = useState(
    !roadmapLayoutPersistable(exampleGraph.root, exampleGraph.editable),
  );
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
      setVisibleTypes(new Set(graph.nodes.map((node) => node.type)));
      setFocusNodeId(null);
      setGraphViewStack(INITIAL_GRAPH_VIEW_STACK);
      setSelectedNodeId(null);
      setNodeDetailOpen(false);
      setNodeDetail(null);
      setNodeDetailError(null);
      setNodeDetailLoading(false);
      if (!roadmapLayoutPersistable(graph.root, graph.editable)) {
        setWorkPackageLayout(EMPTY_WORK_PACKAGE_LAYOUT);
        setLayoutHydrated(true);
      } else {
        setLayoutHydrated(false);
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
      setLayoutHydrated(true);
    }
  }, []);

  useEffect(() => {
    workPackageLayoutRef.current = workPackageLayout;
  }, [workPackageLayout]);

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
                })
              : await saveTopLevelNodePosition({
                  roadmap_root: roadmapRoot,
                  node_id: nodeId,
                  x: position.x,
                  y: position.y,
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
    (nodeId: string, position: NodePosition) => {
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
    setOpening(true);
    setError(null);

    try {
      const dto = await invoke<RoadmapGraphDto | null>("pick_and_load_roadmap");
      if (dto) {
        applyGraph(fromRoadmapGraphDto(dto), { resetVisibleTypes: true });
      }
    } catch (caught) {
      const message = String(caught);
      setError(
        message.includes("dialog") || message.includes("folder")
          ? message
          : `${message}. If the folder picker did not appear, check that a display server is available (common on WSL).`,
      );
    } finally {
      setOpening(false);
    }
  }, [applyGraph]);

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
        setLinkDialogOpen(false);
        setLinkDialogInitialNodeId(null);
      } catch (caught) {
        setError(String(caught));
      } finally {
        setSaving(false);
      }
    },
    [applyGraph, roadmapRoot],
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
      roadmapRoot,
      selectedNodeId,
      workPackageLayout,
    ],
  );

  useEffect(() => {
    if (!roadmapLayoutPersistable(roadmapRoot, editable)) {
      setLayoutHydrated(true);
      return;
    }

    setLayoutHydrated(false);
    let cancelled = false;

    void loadWorkPackageLayout(roadmapRoot)
      .then((layout) => {
        if (!cancelled) {
          setWorkPackageLayout(layout);
          setLayoutHydrated(true);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(String(caught));
          setLayoutHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [editable, roadmapRoot]);

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
      } catch (caught) {
        setLinks(snapshot);
        setError(String(caught));
      } finally {
        setSaving(false);
      }
    },
    [applyGraph, links, roadmapRoot],
  );

  useEffect(() => {
    invoke<string>("bellman_version")
      .then((version) => setSidecarVersion(version))
      .catch(() => setSidecarVersion(null));
  }, []);

  useEffect(() => {
    invoke<RoadmapGraphDto | null>("load_initial_roadmap")
      .then((dto) => {
        if (dto) {
          applyGraph(fromRoadmapGraphDto(dto), { resetVisibleTypes: true });
        }
      })
      .catch((caught) => setError(String(caught)));
  }, [applyGraph]);

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

  const filteredLinks = useMemo(
    () =>
      displayGraph.links.filter(
        (link) => visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target),
      ),
    [displayGraph.links, visibleNodeIds],
  );

  const graphViewNodes = useMemo(
    () =>
      filteredNodes.map((node) => {
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
    [compoundView, filteredNodes],
  );

  const graphViewLinks = useMemo(
    () =>
      filteredLinks.map((link) => ({
        id: link.id,
        source: link.source,
        target: link.target,
        label: link.linkType,
      })),
    [filteredLinks],
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

  const clearGraphSelection = useCallback(() => {
    setFocusNodeId(null);
    setSelectedNodeId(null);
    setNodeDetailOpen(false);
    setNodeDetail(null);
    setNodeDetailError(null);
    setNodeDetailLoading(false);
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

      const node = nodes.find((item) => item.id === nodeId);
      setSelectedNodeId(nodeId);
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
    [clearGraphSelection, nodes, roadmapRoot],
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
    void layoutSaveChainRef.current;
    setGraphViewStack((current) =>
      current.length <= 1 ? INITIAL_GRAPH_VIEW_STACK : current.slice(0, -1),
    );
    clearGraphSelection();
  }, [clearGraphSelection]);

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
          showWorkPackageInnerGraph={
            inWorkPackageGraph &&
            nodeType === "work_package" &&
            !isOverflowNodeId(nodeId) &&
            activeWorkPackageFocus !== nodeId &&
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
    setNodeDetailOpen(false);
    setSelectedNodeId(null);
    setNodeDetail(null);
    setNodeDetailError(null);
    setNodeDetailLoading(false);
  }, []);

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
      <header className="toolbar">
        <div className="toolbar-title">
          <h1>Bellman GUI</h1>
          <p className="toolbar-subtitle">{roadmapRoot}</p>
        </div>
        <div className="toolbar-actions">
          {sidecarVersion ? (
            <span className="sidecar-badge">bellman {sidecarVersion}</span>
          ) : null}
          <button type="button" onClick={() => void handleOpenRoadmap()} disabled={opening}>
            {opening ? "Opening…" : "Open roadmap…"}
          </button>
        </div>
      </header>
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
            focusNodeId={focusNodeId}
            selectedNodeId={selectedNodeId}
            onNodeClick={handleNodeClick}
            contextMenu={renderContextMenu}
            emptyMessage={graphEmptyMessage}
            draggable
            layoutReady={layoutReady}
            nodePositions={innerGraphNodePositions}
            onNodePositionChange={
              roadmapLayoutPersistable(roadmapRoot, editable)
                ? handleNodePositionChange
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
