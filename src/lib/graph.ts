export interface RegistryInstance {
  id: string;
  type: string;
  kind: string;
}

export interface RegistryDocument {
  instances: RegistryInstance[];
  link_types?: LinkTypeMeta[];
}

export interface LinkTypeMeta {
  link_type: string;
  in_type: string;
  out_type: string;
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
  editable: boolean;
  nodes: GraphNode[];
  links: GraphLink[];
  linkTypes: LinkTypeMeta[];
}

export interface GraphNode {
  id: string;
  type: string;
}

export interface GraphLink {
  id: string;
  linkType: string;
  source: string;
  target: string;
}

export type NodeKind =
  | "initiative"
  | "project"
  | "milestone"
  | "goal"
  | "work_package";

export const NODE_KINDS: NodeKind[] = [
  "initiative",
  "project",
  "milestone",
  "goal",
  "work_package",
];

export interface CreateNodeRequest {
  roadmap_root: string;
  node_kind: NodeKind;
  name: string;
  project?: string;
  description?: string;
}

export interface CreateLinkRequest {
  roadmap_root: string;
  link_type: string;
  source: string;
  target: string;
}

export interface RemoveLinkRequest {
  roadmap_root: string;
  link_id: string;
}

export interface RemoveNodeRequest {
  roadmap_root: string;
  node_id: string;
  node_type: string;
}

export interface RoadmapGraphDto {
  root: string;
  editable: boolean;
  nodes: GraphNode[];
  links: Array<{
    id: string;
    link_type: string;
    source: string;
    target: string;
  }>;
  link_types: LinkTypeMeta[];
}

/**
 * Converts a Tauri IPC roadmap graph payload into the in-app graph model.
 * @param dto - Serialized graph returned by the backend.
 * @returns Normalized roadmap graph with camelCase link fields.
 */
export function fromRoadmapGraphDto(dto: RoadmapGraphDto): RoadmapGraph {
  const links = dto.links.map((link) => ({
    id: link.id,
    linkType: link.link_type,
    source: link.source,
    target: link.target,
  }));
  const { nodes, links: normalizedLinks } = normalizeRoadmapGraphData(
    dto.nodes.map((node) => ({ id: node.id, type: node.type })),
    links,
  );

  return {
    root: dto.root,
    editable: dto.editable,
    nodes,
    links: normalizedLinks,
    linkTypes: dto.link_types,
  };
}

export const NODE_TYPE_COLORS: Record<string, string> = {
  initiative: "#3b82f6",
  project: "#22c55e",
  work_package: "#94a3b8",
  milestone: "#f97316",
  goal: "#a855f7",
};

const DEFAULT_NODE_COLOR = "#64748b";

/**
 * Returns the display color for a node type.
 * @param type - Registry node type identifier.
 * @returns Hex color string for the node type.
 */
export function nodeTypeColor(type: string): string {
  return NODE_TYPE_COLORS[type] ?? DEFAULT_NODE_COLOR;
}

/**
 * Converts a registry node type id to a human-readable label.
 * @param type - Registry node type identifier.
 * @returns Human-readable label for the node type.
 */
export function nodeTypeLabel(type: string): string {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

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
 * Returns whether a node id uses the registry's type-qualified prefix.
 * @param node - Graph node to inspect.
 * @returns Whether the id starts with `{type}--`.
 */
export function hasTypedNodePrefix(node: GraphNode): boolean {
  return node.id.startsWith(`${node.type}--`);
}

/**
 * Builds a deduplication key for nodes that share the same type and label.
 * @param node - Graph node to key.
 * @returns Stable key for alias detection.
 */
export function nodeDedupKey(node: GraphNode): string {
  return `${node.type}:${nodeLabel(node.id)}`;
}

function preferredDuplicateNode(left: GraphNode, right: GraphNode): GraphNode {
  const leftTyped = hasTypedNodePrefix(left);
  const rightTyped = hasTypedNodePrefix(right);
  if (leftTyped !== rightTyped) {
    return leftTyped ? left : right;
  }
  if (left.id.length !== right.id.length) {
    return left.id.length > right.id.length ? left : right;
  }
  return left.id <= right.id ? left : right;
}

/**
 * Collapses registry aliases that share a type and display label.
 * Prefers type-qualified ids such as `project--billing` over `billing`.
 * @param nodes - Raw graph nodes from the registry.
 * @returns Canonical nodes and a map from alias id to canonical id.
 */
export function deduplicateGraphNodes(nodes: GraphNode[]): {
  nodes: GraphNode[];
  idAliases: Map<string, string>;
} {
  const groups = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    const key = nodeDedupKey(node);
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  }

  const idAliases = new Map<string, string>();
  const canonicalNodes: GraphNode[] = [];

  for (const group of groups.values()) {
    const canonical = group.reduce(preferredDuplicateNode);
    canonicalNodes.push(canonical);
    for (const node of group) {
      idAliases.set(node.id, canonical.id);
    }
  }

  return { nodes: canonicalNodes, idAliases };
}

/**
 * Normalizes roadmap nodes and remaps link endpoints through alias ids.
 * @param nodes - Raw graph nodes from the registry.
 * @param links - Graph links referencing node ids.
 * @returns Deduplicated nodes with remapped links.
 */
export function normalizeRoadmapGraphData(
  nodes: GraphNode[],
  links: GraphLink[],
): { nodes: GraphNode[]; links: GraphLink[] } {
  const { nodes: canonicalNodes, idAliases } = deduplicateGraphNodes(nodes);
  const remapId = (nodeId: string) => idAliases.get(nodeId) ?? nodeId;

  return {
    nodes: canonicalNodes,
    links: links.map((link) => ({
      ...link,
      source: remapId(link.source),
      target: remapId(link.target),
    })),
  };
}

/**
 * Builds a roadmap graph from bellman registry and link documents.
 * @param root - Roadmap root path or display name.
 * @param registry - Parsed `.fits/registry.json` contents.
 * @param links - Parsed `links/links.jsonc` contents.
 * @returns Graph containing node instances and directed links.
 */
export function parseRoadmapGraph(
  root: string,
  registry: RegistryDocument,
  links: LinksDocument,
): RoadmapGraph {
  const rawNodes = registry.instances
    .filter((instance) => instance.kind === "node")
    .map((instance) => ({
      id: instance.id,
      type: instance.type,
    }));

  const uniqueNodes = [...new Map(rawNodes.map((node) => [node.id, node])).values()];

  const graphLinks = links.links.map((link) => ({
    id: link.id,
    linkType: link.link_type,
    source: link.in,
    target: link.out,
  }));

  const { nodes, links: normalizedLinks } = normalizeRoadmapGraphData(
    uniqueNodes,
    graphLinks,
  );

  return {
    root,
    editable: false,
    nodes,
    links: normalizedLinks,
    linkTypes: registry.link_types ?? [],
  };
}

/**
 * Returns whether a node type matches a link endpoint type from the registry.
 * @param nodeType - Concrete node type from the registry.
 * @param endpointType - Link endpoint type from the registry.
 * @returns Whether the node type can participate in that endpoint.
 */
export function nodeMatchesLinkEndpoint(
  nodeType: string,
  endpointType: string,
): boolean {
  if (nodeType === endpointType) {
    return true;
  }
  return (
    endpointType === "work_scope" &&
    (nodeType === "initiative" || nodeType === "project")
  );
}

/**
 * Filters link types valid for an ordered pair of node types.
 * @param linkTypes - Link type metadata from the registry.
 * @param sourceType - Source node type.
 * @param targetType - Target node type.
 * @returns Link types compatible with the selected endpoints.
 */
export function compatibleLinkTypes(
  linkTypes: LinkTypeMeta[],
  sourceType: string,
  targetType: string,
): LinkTypeMeta[] {
  return linkTypes.filter(
    (linkType) =>
      nodeMatchesLinkEndpoint(sourceType, linkType.in_type) &&
      nodeMatchesLinkEndpoint(targetType, linkType.out_type),
  );
}

/**
 * Filters nodes that can serve as the source endpoint for a link type.
 * @param nodes - Graph nodes from the current roadmap.
 * @param linkType - Selected link type metadata.
 * @returns Nodes compatible with the link type's source endpoint.
 */
export function compatibleSourceNodes(
  nodes: GraphNode[],
  linkType: LinkTypeMeta,
): GraphNode[] {
  return nodes.filter((node) =>
    nodeMatchesLinkEndpoint(node.type, linkType.in_type),
  );
}

/**
 * Filters nodes that can serve as the target endpoint for a link type.
 * @param nodes - Graph nodes from the current roadmap.
 * @param linkType - Selected link type metadata.
 * @returns Nodes compatible with the link type's target endpoint.
 */
export function compatibleTargetNodes(
  nodes: GraphNode[],
  linkType: LinkTypeMeta,
): GraphNode[] {
  return nodes.filter((node) =>
    nodeMatchesLinkEndpoint(node.type, linkType.out_type),
  );
}

/**
 * Returns whether a node can be the start of a link to some other node.
 * @param node - Candidate start node.
 * @param nodes - Graph nodes from the current roadmap.
 * @param linkTypes - Link type metadata from the registry.
 * @returns Whether any compatible finish node exists.
 */
export function canBeLinkStart(
  node: GraphNode,
  nodes: GraphNode[],
  linkTypes: LinkTypeMeta[],
): boolean {
  return nodes.some(
    (other) =>
      other.id !== node.id &&
      compatibleLinkTypes(linkTypes, node.type, other.type).length > 0,
  );
}

/**
 * Returns whether a node can be the finish of a link from some other node.
 * @param node - Candidate finish node.
 * @param nodes - Graph nodes from the current roadmap.
 * @param linkTypes - Link type metadata from the registry.
 * @returns Whether any compatible start node exists.
 */
export function canBeLinkFinish(
  node: GraphNode,
  nodes: GraphNode[],
  linkTypes: LinkTypeMeta[],
): boolean {
  return nodes.some(
    (other) =>
      other.id !== node.id &&
      compatibleLinkTypes(linkTypes, other.type, node.type).length > 0,
  );
}

/**
 * Returns whether a node can participate in a new link as start or finish.
 * @param node - Candidate node from the context menu.
 * @param nodes - Graph nodes from the current roadmap.
 * @param linkTypes - Link type metadata from the registry.
 * @returns Whether link creation can begin from this node.
 */
export function canCreateLinkFromNode(
  node: GraphNode,
  nodes: GraphNode[],
  linkTypes: LinkTypeMeta[],
): boolean {
  return (
    canBeLinkStart(node, nodes, linkTypes) ||
    canBeLinkFinish(node, nodes, linkTypes)
  );
}

/**
 * Lists project names derived from project node ids.
 * @param nodes - Graph nodes from the current roadmap.
 * @returns Sorted project names for work-package creation.
 */
export function projectNames(nodes: GraphNode[]): string[] {
  return nodes
    .filter((node) => node.type === "project")
    .map((node) => nodeLabel(node.id))
    .sort();
}

/**
 * Returns the project scope name embedded in a work package id.
 * @param workPackageId - Fully qualified work package identifier.
 * @returns Project scope prefix before the first `--`, or null when absent.
 */
export function workPackageProjectName(workPackageId: string): string | null {
  const separator = workPackageId.indexOf("--");
  if (separator <= 0) {
    return null;
  }
  return workPackageId.slice(0, separator);
}

/**
 * Returns whether a work package belongs to the given project node.
 * @param workPackageId - Work package node identifier.
 * @param projectId - Project node identifier.
 * @returns Whether the work package is scoped to the project.
 */
export function workPackageBelongsToProject(
  workPackageId: string,
  projectId: string,
): boolean {
  const projectName = nodeLabel(projectId);
  return workPackageProjectName(workPackageId) === projectName;
}

/**
 * Filters nodes visible in the top-level roadmap graph.
 * Work packages are inner graph nodes and are excluded.
 * @param nodes - All roadmap graph nodes.
 * @returns Nodes that should appear in the top-level graph.
 */
export function topLevelGraphNodes(nodes: GraphNode[]): GraphNode[] {
  return nodes.filter((node) => node.type !== "work_package");
}

/**
 * Builds the inner work package graph for a project node.
 * @param nodes - All roadmap graph nodes.
 * @param links - All roadmap graph links.
 * @param projectId - Project node identifier.
 * @returns Work package nodes and links scoped to the project.
 */
export function innerGraphForProject(
  nodes: GraphNode[],
  links: GraphLink[],
  projectId: string,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const innerNodes = nodes.filter(
    (node) =>
      node.type === "work_package" &&
      workPackageBelongsToProject(node.id, projectId),
  );
  const innerNodeIds = new Set(innerNodes.map((node) => node.id));
  const innerLinks = links.filter(
    (link) => innerNodeIds.has(link.source) && innerNodeIds.has(link.target),
  );
  return { nodes: innerNodes, links: innerLinks };
}

/**
 * Returns the id of a node present after an update but not before.
 * @param before - Nodes before the graph update.
 * @param after - Nodes after the graph update.
 * @returns The added node id when exactly one node was added.
 */
export function findAddedNodeId(
  before: GraphNode[],
  after: GraphNode[],
): string | null {
  const beforeIds = new Set(before.map((node) => node.id));
  const added = after.filter((node) => !beforeIds.has(node.id));
  return added.length === 1 ? added[0].id : null;
}

/**
 * Returns graph data with a node and its incident links removed.
 * @param nodes - Current roadmap nodes.
 * @param links - Current roadmap links.
 * @param nodeId - Node identifier to remove.
 * @returns Updated nodes and links without the removed node.
 */
export function graphWithoutNode(
  nodes: GraphNode[],
  links: GraphLink[],
  nodeId: string,
): { nodes: GraphNode[]; links: GraphLink[] } {
  return {
    nodes: nodes.filter((node) => node.id !== nodeId),
    links: links.filter(
      (link) => link.source !== nodeId && link.target !== nodeId,
    ),
  };
}

/**
 * Returns graph links with one link removed.
 * @param links - Current roadmap links.
 * @param linkId - Link identifier to remove.
 * @returns Updated links without the removed link.
 */
export function graphWithoutLink(links: GraphLink[], linkId: string): GraphLink[] {
  return links.filter((link) => link.id !== linkId);
}
