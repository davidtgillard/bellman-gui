import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RoadmapGraph } from "./components/RoadmapGraph";
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

  const applyGraph = useCallback((graph: ReturnType<typeof parseRoadmapGraph>) => {
    setRoadmapRoot(graph.root);
    setNodes(graph.nodes);
    setEdges(graph.edges);
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

  const reagraphNodes = useMemo(() => toReagraphNodes(nodes), [nodes]);
  const reagraphEdges = useMemo(() => toReagraphEdges(edges), [edges]);

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
      <RoadmapGraph nodes={reagraphNodes} edges={reagraphEdges} />
    </main>
  );
}

export default App;
