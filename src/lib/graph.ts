export interface RegistryInstance {
  id: string;
  type: string;
  kind: string;
}

export interface RegistryDocument {
  instances: RegistryInstance[];
}

export interface LinkRecord {
  id: string;
  link_type: string;
  in: string;
  out: string;
}

export interface LinksDocument {
  links: LinkRecord[];
}

export interface RoadmapGraph {
  root: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  type: string;
}

export interface GraphEdge {
  id: string;
  linkType: string;
  source: string;
  target: string;
}

export interface RoadmapGraphDto {
  root: string;
  nodes: GraphNode[];
  edges: Array<{
    id: string;
    link_type: string;
    source: string;
    target: string;
  }>;
}

/**
 * Converts a Tauri IPC roadmap graph payload into the in-app graph model.
 * @param dto - Serialized graph returned by the backend.
 * @returns Normalized roadmap graph with camelCase edge fields.
 */
export function fromRoadmapGraphDto(dto: RoadmapGraphDto): RoadmapGraph {
  return {
    root: dto.root,
    nodes: dto.nodes,
    edges: dto.edges.map((edge) => ({
      id: edge.id,
      linkType: edge.link_type,
      source: edge.source,
      target: edge.target,
    })),
  };
}

const NODE_COLORS: Record<string, string> = {
  initiative: "#3b82f6",
  project: "#22c55e",
  work_package: "#94a3b8",
  milestone: "#f97316",
  goal: "#a855f7",
};

const QUALIFIED_PREFIXES = [
  "initiative--",
  "project--",
  "milestone--",
  "goal--",
] as const;

/**
 * Derives a short display label from a bellman qualified node id.
 * @param nodeId - Fully qualified node identifier from the registry.
 * @returns Human-readable label with type prefix removed when present.
 */
export function nodeLabel(nodeId: string): string {
  for (const prefix of QUALIFIED_PREFIXES) {
    if (nodeId.startsWith(prefix)) {
      return nodeId.slice(prefix.length);
    }
  }
  const slash = nodeId.indexOf("--");
  if (slash >= 0) {
    return nodeId.slice(slash + 2);
  }
  return nodeId;
}

/**
 * Builds a roadmap graph from bellman registry and link documents.
 * @param root - Roadmap root path or display name.
 * @param registry - Parsed `.fits/registry.json` contents.
 * @param links - Parsed `links/links.jsonc` contents.
 * @returns Graph containing node instances and directed edges.
 */
export function parseRoadmapGraph(
  root: string,
  registry: RegistryDocument,
  links: LinksDocument,
): RoadmapGraph {
  const nodes = registry.instances
    .filter((instance) => instance.kind === "node")
    .map((instance) => ({
      id: instance.id,
      type: instance.type,
    }));

  const edges = links.links.map((link) => ({
    id: link.id,
    linkType: link.link_type,
    source: link.in,
    target: link.out,
  }));

  return { root, nodes, edges };
}

/**
 * Maps graph nodes to the shape expected by Reagraph.
 * @param nodes - Roadmap graph nodes.
 * @returns Reagraph node objects with labels and fill colors by type.
 */
export function toReagraphNodes(nodes: GraphNode[]) {
  return nodes.map((node) => ({
    id: node.id,
    label: nodeLabel(node.id),
    fill: NODE_COLORS[node.type] ?? "#64748b",
    data: { type: node.type },
  }));
}

/**
 * Maps graph edges to the shape expected by Reagraph.
 * @param edges - Roadmap graph edges.
 * @returns Reagraph edge objects preserving source, target, and link type.
 */
export function toReagraphEdges(edges: GraphEdge[]) {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.linkType,
  }));
}
