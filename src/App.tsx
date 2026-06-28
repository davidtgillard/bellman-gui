import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CreateEdgeDialog } from "./components/CreateEdgeDialog";
import { CreateVertexDialog } from "./components/CreateVertexDialog";
import { RoadmapGraph as RoadmapGraphView } from "./components/RoadmapGraph";
import { VertexTypeLegend } from "./components/VertexTypeLegend";
import exampleRegistry from "./fixtures/example-roadmap/.fits/registry.json";
import exampleLinks from "./fixtures/example-roadmap/links/links.json";
import {
  findAddedNodeId,
  fromRoadmapGraphDto,
  parseRoadmapGraph,
  toReagraphEdges,
  toReagraphNodes,
  type GraphEdge,
  type GraphNode,
  type LinkTypeMeta,
  type RoadmapGraph,
  type RoadmapGraphDto,
  type VertexKind,
} from "./lib/graph";
import { createEdge, createVertex } from "./lib/roadmap-api";
import "./App.css";

const exampleGraph = parseRoadmapGraph("example", exampleRegistry, exampleLinks);

function App() {
  const [roadmapRoot, setRoadmapRoot] = useState(exampleGraph.root);
  const [editable, setEditable] = useState(exampleGraph.editable);
  const [linkTypes, setLinkTypes] = useState<LinkTypeMeta[]>(exampleGraph.linkTypes);
  const [nodes, setNodes] = useState<GraphNode[]>(exampleGraph.nodes);
  const [edges, setEdges] = useState<GraphEdge[]>(exampleGraph.edges);
  const [error, setError] = useState<string | null>(null);
  const [sidecarVersion, setSidecarVersion] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vertexDialogOpen, setVertexDialogOpen] = useState(false);
  const [edgeDialogOpen, setEdgeDialogOpen] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(
    () => new Set(exampleGraph.nodes.map((node) => node.type)),
  );
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  interface ApplyGraphOptions {
    resetVisibleTypes?: boolean;
    revealNodeId?: string;
  }

  const applyGraph = useCallback((graph: RoadmapGraph, options: ApplyGraphOptions = {}) => {
    setRoadmapRoot(graph.root);
    setEditable(graph.editable);
    setLinkTypes(graph.linkTypes);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    if (options.resetVisibleTypes) {
      setVisibleTypes(new Set(graph.nodes.map((node) => node.type)));
      setFocusNodeId(null);
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
      setError(String(caught));
    } finally {
      setOpening(false);
    }
  }, [applyGraph]);

  const handleCreateVertex = useCallback(
    async (input: {
      vertexKind: VertexKind;
      name: string;
      project?: string;
      description?: string;
    }) => {
      setSaving(true);
      setError(null);

      try {
        const previousNodes = nodes;
        const graph = await createVertex({
          roadmap_root: roadmapRoot,
          vertex_kind: input.vertexKind,
          name: input.name,
          project: input.project,
          description: input.description,
        });
        const revealNodeId = findAddedNodeId(previousNodes, graph.nodes);
        applyGraph(graph, revealNodeId ? { revealNodeId } : undefined);
        setVertexDialogOpen(false);
      } catch (caught) {
        setError(String(caught));
      } finally {
        setSaving(false);
      }
    },
    [applyGraph, nodes, roadmapRoot],
  );

  const handleCreateEdge = useCallback(
    async (input: { linkType: string; source: string; target: string }) => {
      setSaving(true);
      setError(null);

      try {
        const graph = await createEdge({
          roadmap_root: roadmapRoot,
          link_type: input.linkType,
          source: input.source,
          target: input.target,
        });
        applyGraph(graph);
        setEdgeDialogOpen(false);
      } catch (caught) {
        setError(String(caught));
      } finally {
        setSaving(false);
      }
    },
    [applyGraph, roadmapRoot],
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

  const nodeTypes = useMemo(
    () => [...new Set(nodes.map((node) => node.type))].sort(),
    [nodes],
  );

  const filteredNodes = useMemo(
    () => nodes.filter((node) => visibleTypes.has(node.type)),
    [nodes, visibleTypes],
  );

  const visibleNodeIds = useMemo(
    () => new Set(filteredNodes.map((node) => node.id)),
    [filteredNodes],
  );

  const filteredEdges = useMemo(
    () =>
      edges.filter(
        (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
      ),
    [edges, visibleNodeIds],
  );

  const reagraphNodes = useMemo(() => toReagraphNodes(filteredNodes), [filteredNodes]);
  const reagraphEdges = useMemo(() => toReagraphEdges(filteredEdges), [filteredEdges]);

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
            onClick={() => setVertexDialogOpen(true)}
            disabled={!editable || saving}
            title={
              editable
                ? "Create a new vertex"
                : "Open a roadmap folder on disk to edit the graph"
            }
          >
            New vertex…
          </button>
          <button
            type="button"
            onClick={() => setEdgeDialogOpen(true)}
            disabled={!editable || saving || nodes.length < 2}
            title={
              editable
                ? "Create a new edge"
                : "Open a roadmap folder on disk to edit the graph"
            }
          >
            New edge…
          </button>
          <button type="button" onClick={() => void handleOpenRoadmap()} disabled={opening}>
            {opening ? "Opening…" : "Open roadmap…"}
          </button>
        </div>
      </header>
      {error ? <div className="error-banner">{error}</div> : null}
      {!editable ? (
        <div className="info-banner">
          The bundled example graph is read-only. Open a roadmap folder to create vertices and
          edges.
        </div>
      ) : null}
      <div className="graph-area">
        <RoadmapGraphView
          nodes={reagraphNodes}
          edges={reagraphEdges}
          focusNodeId={focusNodeId}
          emptyMessage={
            nodes.length === 0
              ? "Open a bellman roadmap folder to view its graph."
              : "Select at least one vertex type to display."
          }
        />
        <VertexTypeLegend
          types={nodeTypes}
          visibleTypes={visibleTypes}
          onToggleType={handleToggleType}
        />
      </div>
      <CreateVertexDialog
        open={vertexDialogOpen}
        nodes={nodes}
        saving={saving}
        onClose={() => setVertexDialogOpen(false)}
        onCreate={(input) => void handleCreateVertex(input)}
      />
      <CreateEdgeDialog
        open={edgeDialogOpen}
        nodes={nodes}
        linkTypes={linkTypes}
        saving={saving}
        onClose={() => setEdgeDialogOpen(false)}
        onCreate={(input) => void handleCreateEdge(input)}
      />
    </main>
  );
}

export default App;
