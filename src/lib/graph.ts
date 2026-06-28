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

export function toReagraphNodes(nodes: GraphNode[]) {
  return nodes.map((node) => ({
    id: node.id,
    label: nodeLabel(node.id),
    fill: NODE_COLORS[node.type] ?? "#64748b",
    data: { type: node.type },
  }));
}

export function toReagraphEdges(edges: GraphEdge[]) {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.linkType,
  }));
}
