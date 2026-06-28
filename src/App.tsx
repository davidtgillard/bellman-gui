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
  findAddedNodeId,
  fromRoadmapGraphDto,
  graphWithoutLink,
  graphWithoutNode,
  innerGraphForProject,
  parseRoadmapGraph,
  topLevelGraphNodes,
  toReagraphLinks,
  toReagraphNodes,
  nodeLabel,
  type GraphLink,
  type GraphNode,
  type LinkTypeMeta,
  type RoadmapGraph,
  type RoadmapGraphDto,
  type NodeKind,
} from "./lib/graph";
import { createLink, createNode, removeLink, removeNode } from "./lib/roadmap-api";
import { loadNodeDetail, type NodeDetail } from "./lib/node-detail";
import "./App.css";

const exampleGraph = parseRoadmapGraph("example", exampleRegistry, exampleLinks);

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
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(
    () => new Set(exampleGraph.nodes.map((node) => node.type)),
  );
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [innerGraphProjectId, setInnerGraphProjectId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeDetailOpen, setNodeDetailOpen] = useState(false);
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null);
  const [nodeDetailLoading, setNodeDetailLoading] = useState(false);
  const [nodeDetailError, setNodeDetailError] = useState<string | null>(null);
  const nodeDetailRequestRef = useRef(0);

  interface ApplyGraphOptions {
    resetVisibleTypes?: boolean;
    revealNodeId?: string;
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
      setInnerGraphProjectId(null);
      setSelectedNodeId(null);
      setNodeDetailOpen(false);
      setNodeDetail(null);
      setNodeDetailError(null);
      setNodeDetailLoading(false);
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
  }, []);

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
        applyGraph(graph, revealNodeId ? { revealNodeId } : undefined);
        setNodeDialogOpen(false);
      } catch (caught) {
        setError(String(caught));
      } finally {
        setSaving(false);
      }
    },
    [applyGraph, nodes, roadmapRoot],
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
      if (innerGraphProjectId === nodeId) {
        setInnerGraphProjectId(null);
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
      innerGraphProjectId,
      links,
      nodes,
      roadmapRoot,
      selectedNodeId,
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

  const nodeTypes = useMemo(() => {
    const sourceNodes = innerGraphProjectId
      ? innerGraphForProject(nodes, links, innerGraphProjectId).nodes
      : topLevelGraphNodes(nodes);
    return [...new Set(sourceNodes.map((node) => node.type))].sort();
  }, [innerGraphProjectId, links, nodes]);

  const displayGraph = useMemo(() => {
    if (innerGraphProjectId) {
      return innerGraphForProject(nodes, links, innerGraphProjectId);
    }
    return {
      nodes: topLevelGraphNodes(nodes),
      links,
    };
  }, [innerGraphProjectId, links, nodes]);

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

  const reagraphNodes = useMemo(() => toReagraphNodes(filteredNodes), [filteredNodes]);
  const reagraphLinks = useMemo(() => toReagraphLinks(filteredLinks), [filteredLinks]);

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

  const handleNodeClick = useCallback(
    (nodeId: string) => {
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
    [nodes, roadmapRoot],
  );

  const handleShowInnerGraph = useCallback((projectId: string) => {
    setInnerGraphProjectId(projectId);
    setFocusNodeId(null);
    setSelectedNodeId(null);
    setNodeDetailOpen(false);
    setNodeDetail(null);
    setNodeDetailError(null);
    setNodeDetailLoading(false);
    setVisibleTypes((current) => {
      const next = new Set(current);
      next.add("work_package");
      return next;
    });
  }, []);

  const handleBackToTopLevel = useCallback(() => {
    setInnerGraphProjectId(null);
    setFocusNodeId(null);
    setSelectedNodeId(null);
    setNodeDetailOpen(false);
    setNodeDetail(null);
    setNodeDetailError(null);
    setNodeDetailLoading(false);
  }, []);

  const renderContextMenu = useCallback(
    (event: {
      data: {
        id: string;
        source?: string;
        target?: string;
        data?: { type?: string };
        position?: unknown;
      };
      onClose: () => void;
    }) => {
      const isEdge =
        typeof event.data.source === "string" &&
        typeof event.data.target === "string" &&
        !("position" in event.data);

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

      return (
        <GraphContextMenu
          editable={editable}
          nodeId={event.data.id}
          nodeType={nodeType}
          showInnerGraph={!innerGraphProjectId && nodeType === "project"}
          onShowInnerGraph={handleShowInnerGraph}
          onRemoveNode={(nodeId, type) => void handleRemoveNode(nodeId, type)}
          onClose={event.onClose}
        />
      );
    },
    [
      editable,
      handleRemoveLink,
      handleRemoveNode,
      handleShowInnerGraph,
      innerGraphProjectId,
    ],
  );

  const innerGraphProjectLabel = innerGraphProjectId
    ? nodeLabel(innerGraphProjectId)
    : null;

  const graphEmptyMessage = innerGraphProjectId
    ? innerGraphProjectLabel
      ? `Project ${innerGraphProjectLabel} has no work packages to display.`
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
          <button
            type="button"
            onClick={() => setNodeDialogOpen(true)}
            disabled={!editable || saving}
            title={
              editable
                ? "Create a new node"
                : "Open a roadmap folder on disk to edit the graph"
            }
          >
            New node…
          </button>
          <button
            type="button"
            onClick={() => setLinkDialogOpen(true)}
            disabled={!editable || saving || nodes.length < 2}
            title={
              editable
                ? "Create a new link"
                : "Open a roadmap folder on disk to edit the graph"
            }
          >
            New link…
          </button>
          <button type="button" onClick={() => void handleOpenRoadmap()} disabled={opening}>
            {opening ? "Opening…" : "Open roadmap…"}
          </button>
        </div>
      </header>
      {error ? <div className="error-banner">{error}</div> : null}
      {!editable ? (
        <div className="info-banner">
          The bundled example graph is read-only. Open a roadmap folder to create nodes and
          links.
        </div>
      ) : null}
      <div className="graph-area">
        <div className="graph-dock-panel">
          {innerGraphProjectId && innerGraphProjectLabel ? (
            <GraphViewBreadcrumb
              projectLabel={innerGraphProjectLabel}
              onBack={handleBackToTopLevel}
            />
          ) : null}
          <RoadmapGraphView
            nodes={reagraphNodes}
            links={reagraphLinks}
            focusNodeId={focusNodeId}
            selectedNodeId={selectedNodeId}
            onNodeClick={handleNodeClick}
            contextMenu={renderContextMenu}
            emptyMessage={graphEmptyMessage}
          />
          <NodeTypeLegend
            types={nodeTypes}
            visibleTypes={visibleTypes}
            onToggleType={handleToggleType}
          />
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
        onClose={() => setNodeDialogOpen(false)}
        onCreate={(input) => void handleCreateNode(input)}
      />
      <CreateLinkDialog
        open={linkDialogOpen}
        nodes={nodes}
        linkTypes={linkTypes}
        saving={saving}
        onClose={() => setLinkDialogOpen(false)}
        onCreate={(input) => void handleCreateLink(input)}
      />
    </main>
  );
}

export default App;
