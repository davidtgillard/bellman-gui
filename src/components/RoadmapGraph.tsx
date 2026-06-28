import { Suspense } from "react";
import { GraphCanvas } from "reagraph";

interface ReagraphNode {
  id: string;
  label?: string;
  fill?: string;
}

interface ReagraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface RoadmapGraphProps {
  nodes: ReagraphNode[];
  edges: ReagraphEdge[];
  emptyMessage?: string;
}

export function RoadmapGraph({
  nodes,
  edges,
  emptyMessage = "Open a bellman roadmap folder to view its graph.",
}: RoadmapGraphProps) {
  if (nodes.length === 0) {
    return (
      <div className="graph-empty">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="graph-container">
      <Suspense fallback={<div className="graph-empty">Loading graph…</div>}>
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          layoutType="forceDirected2d"
          labelType="all"
          animated
        />
      </Suspense>
    </div>
  );
}
