import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RoadmapGraph } from "./components/RoadmapGraph";
import { VertexTypeLegend } from "./components/VertexTypeLegend";
import exampleRegistry from "./fixtures/example-roadmap/.fits/registry.json";
import exampleLinks from "./fixtures/example-roadmap/links/links.json";
import {
  fromRoadmapGraphDto,
  parseRoadmapGraph,
  toReagraphEdges,
  toReagraphNodes,
  type GraphEdge,
  type GraphNode,
  type RoadmapGraphDto,
} from "./lib/graph";
import "./App.css";

const exampleGraph = parseRoadmapGraph("example", exampleRegistry, exampleLinks);

function App() {
  const [roadmapRoot, setRoadmapRoot] = useState(exampleGraph.root);
  const [nodes, setNodes] = useState<GraphNode[]>(exampleGraph.nodes);
  const [edges, setEdges] = useState<GraphEdge[]>(exampleGraph.edges);
  const [error, setError] = useState<string | null>(null);
  const [sidecarVersion, setSidecarVersion] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(
    () => new Set(exampleGraph.nodes.map((node) => node.type)),
  );

  const applyGraph = useCallback((graph: ReturnType<typeof parseRoadmapGraph>) => {
    setRoadmapRoot(graph.root);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setVisibleTypes(new Set(graph.nodes.map((node) => node.type)));
    setError(null);
  }, []);

  const handleOpenRoadmap = useCallback(async () => {
    setOpening(true);
    setError(null);

    try {
      const dto = await invoke<RoadmapGraphDto | null>("pick_and_load_roadmap");
      if (dto) {
        applyGraph(fromRoadmapGraphDto(dto));
      }
    } catch (caught) {
      setError(String(caught));
    } finally {
      setOpening(false);
    }
  }, [applyGraph]);

  useEffect(() => {
    invoke<string>("bellman_version")
      .then((version) => setSidecarVersion(version))
      .catch(() => setSidecarVersion(null));
  }, []);

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
          <button type="button" onClick={() => void handleOpenRoadmap()} disabled={opening}>
            {opening ? "Opening…" : "Open roadmap…"}
          </button>
        </div>
      </header>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="graph-area">
        <RoadmapGraph
          nodes={reagraphNodes}
          edges={reagraphEdges}
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
    </main>
  );
}

export default App;
