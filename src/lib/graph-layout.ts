import { invoke } from "@tauri-apps/api/core";
import { nodeLabel } from "./graph";

export interface NodePosition {
  x: number;
  y: number;
}

export interface WorkPackageLayout {
  version: number;
  kind: string;
  topLevel: Record<string, NodePosition>;
  projects: Record<string, Record<string, NodePosition>>;
}

export const EMPTY_WORK_PACKAGE_LAYOUT: WorkPackageLayout = {
  version: 1,
  kind: "bellman-gui-work-package-layout",
  topLevel: {},
  projects: {},
};

export const MIN_NODE_DISTANCE = 85;

interface WorkPackageLayoutDto {
  version: number;
  kind: string;
  top_level?: Record<string, NodePosition>;
  projects: Record<string, Record<string, NodePosition>>;
}

interface SaveTopLevelNodePositionRequest {
  roadmap_root: string;
  node_id: string;
  x: number;
  y: number;
}

interface SaveWorkPackageNodePositionRequest {
  roadmap_root: string;
  project_id: string;
  node_id: string;
  x: number;
  y: number;
}

/**
 * Converts a backend layout payload into the in-app layout model.
 * @param dto - Serialized layout returned by the backend.
 * @returns Normalized work package layout document.
 */
export function fromWorkPackageLayoutDto(dto: WorkPackageLayoutDto): WorkPackageLayout {
  return {
    version: dto.version,
    kind: dto.kind,
    topLevel: dto.top_level ?? {},
    projects: dto.projects ?? {},
  };
}

/**
 * Returns saved positions for top-level roadmap nodes.
 * @param layout - Graph layout document.
 * @returns Node id to position map for the top-level graph.
 */
export function topLevelNodePositions(
  layout: WorkPackageLayout,
): Record<string, NodePosition> {
  return layout.topLevel;
}

/**
 * Returns a layout document with one top-level node position updated.
 * @param layout - Current layout document.
 * @param nodeId - Top-level node identifier.
 * @param position - Updated node coordinates.
 * @returns Updated layout document.
 */
export function withTopLevelNodePosition(
  layout: WorkPackageLayout,
  nodeId: string,
  position: NodePosition,
): WorkPackageLayout {
  return {
    ...layout,
    topLevel: {
      ...layout.topLevel,
      [nodeId]: position,
    },
  };
}

/**
 * Returns a layout document with one top-level node position removed.
 * @param layout - Current layout document.
 * @param nodeId - Top-level node identifier.
 * @returns Updated layout document.
 */
export function withoutTopLevelNodePosition(
  layout: WorkPackageLayout,
  nodeId: string,
): WorkPackageLayout {
  if (!(nodeId in layout.topLevel)) {
    return layout;
  }

  const nextTopLevel = { ...layout.topLevel };
  delete nextTopLevel[nodeId];

  return {
    ...layout,
    topLevel: nextTopLevel,
  };
}

/**
 * Picks a node position near the preferred point, nudging away from nearby nodes.
 * @param preferred - Desired placement in graph coordinates.
 * @param existing - Positions of nodes that should not be overlapped.
 * @param minDistance - Minimum center-to-center distance between nodes.
 * @returns Resolved coordinates for the new node.
 */
export function resolvePlacedNodePosition(
  preferred: NodePosition,
  existing: NodePosition[],
  minDistance = MIN_NODE_DISTANCE,
): NodePosition {
  const tooClose = (position: NodePosition) =>
    existing.some(
      (other) => Math.hypot(other.x - position.x, other.y - position.y) < minDistance,
    );

  if (!tooClose(preferred)) {
    return preferred;
  }

  for (let ring = 1; ring <= 12; ring++) {
    const samples = Math.max(8, ring * 6);
    for (let index = 0; index < samples; index++) {
      const angle = (index / samples) * Math.PI * 2;
      const candidate = {
        x: preferred.x + Math.cos(angle) * minDistance * ring,
        y: preferred.y + Math.sin(angle) * minDistance * ring,
      };
      if (!tooClose(candidate)) {
        return candidate;
      }
    }
  }

  return {
    x: preferred.x + minDistance,
    y: preferred.y + minDistance,
  };
}

export type LayoutPlacementScope =
  | { kind: "top_level" }
  | { kind: "project"; projectId: string };

/**
 * Merges a right-click placement into the layout, bootstrapping unsaved node positions.
 * @param layout - Current layout document.
 * @param scope - Whether placement belongs to the top-level or project graph.
 * @param newNodeId - Identifier of the node being created.
 * @param preferred - Desired placement in graph coordinates.
 * @param existingPositions - Current rendered positions keyed by node id.
 * @returns Updated layout and resolved position for the new node.
 */
export function applyNodePlacement(
  layout: WorkPackageLayout,
  scope: LayoutPlacementScope,
  newNodeId: string,
  preferred: NodePosition,
  existingPositions: Record<string, NodePosition>,
): { layout: WorkPackageLayout; position: NodePosition } {
  const occupantPositions = Object.entries(existingPositions)
    .filter(([nodeId]) => nodeId !== newNodeId)
    .map(([, position]) => position);
  const position = resolvePlacedNodePosition(preferred, occupantPositions);

  let nextLayout = layout;

  for (const [nodeId, nodePosition] of Object.entries(existingPositions)) {
    if (nodeId === newNodeId) {
      continue;
    }

    if (scope.kind === "top_level") {
      if (!(nodeId in nextLayout.topLevel)) {
        nextLayout = withTopLevelNodePosition(nextLayout, nodeId, nodePosition);
      }
      continue;
    }

    const projectPositions = projectNodePositions(nextLayout, scope.projectId);
    if (!(nodeId in projectPositions)) {
      nextLayout = withNodePosition(nextLayout, scope.projectId, nodeId, nodePosition);
    }
  }

  if (scope.kind === "top_level") {
    nextLayout = withTopLevelNodePosition(nextLayout, newNodeId, position);
  } else {
    nextLayout = withNodePosition(nextLayout, scope.projectId, newNodeId, position);
  }

  return { layout: nextLayout, position };
}

/**
 * Returns a layout document with scope positions merged in.
 * @param layout - Current layout document.
 * @param scope - Whether positions belong to the top-level or project graph.
 * @param positions - Node id to position map for the scope.
 * @returns Updated layout document.
 */
export function withScopePositions(
  layout: WorkPackageLayout,
  scope: LayoutPlacementScope,
  positions: Record<string, NodePosition>,
): WorkPackageLayout {
  if (scope.kind === "top_level") {
    return {
      ...layout,
      topLevel: {
        ...layout.topLevel,
        ...positions,
      },
    };
  }

  const scopeKey = projectLayoutKey(scope.projectId);
  const nextProjects = { ...layout.projects };

  for (const key of Object.keys(nextProjects)) {
    if (key !== scopeKey && projectLayoutKey(key) === scopeKey) {
      delete nextProjects[key];
    }
  }

  return {
    ...layout,
    projects: {
      ...nextProjects,
      [scopeKey]: {
        ...(nextProjects[scopeKey] ?? {}),
        ...positions,
      },
    },
  };
}

function toWorkPackageLayoutDto(layout: WorkPackageLayout): WorkPackageLayoutDto {
  return {
    version: layout.version,
    kind: layout.kind,
    top_level: layout.topLevel,
    projects: layout.projects,
  };
}

/**
 * Canonical project key for layout storage and lookup.
 * Uses the project scope name so qualified and unqualified ids match.
 * @param projectId - Project node identifier from the registry.
 * @returns Stable layout bucket key for the project.
 */
export function projectLayoutKey(projectId: string): string {
  return nodeLabel(projectId);
}

function resolveProjectLayoutBucket(
  layout: WorkPackageLayout,
  projectId: string,
): string | null {
  const scope = projectLayoutKey(projectId);
  if (layout.projects[scope]) {
    return scope;
  }
  if (layout.projects[projectId]) {
    return projectId;
  }
  for (const key of Object.keys(layout.projects)) {
    if (projectLayoutKey(key) === scope) {
      return key;
    }
  }
  return null;
}

/**
 * Returns saved positions for a project, or an empty map when none exist.
 * @param layout - Work package layout document.
 * @param projectId - Project node identifier.
 * @returns Node id to position map for the project.
 */
export function projectNodePositions(
  layout: WorkPackageLayout,
  projectId: string,
): Record<string, NodePosition> {
  const bucket = resolveProjectLayoutBucket(layout, projectId);
  return bucket ? layout.projects[bucket] : {};
}

/**
 * Returns a layout document with one node position updated for a project.
 * @param layout - Current layout document.
 * @param projectId - Project node identifier.
 * @param nodeId - Work package node identifier.
 * @param position - Updated node coordinates.
 * @returns Updated layout document.
 */
export function withNodePosition(
  layout: WorkPackageLayout,
  projectId: string,
  nodeId: string,
  position: NodePosition,
): WorkPackageLayout {
  const scope = projectLayoutKey(projectId);
  const nextProjects = { ...layout.projects };

  for (const key of Object.keys(nextProjects)) {
    if (key !== scope && projectLayoutKey(key) === scope) {
      delete nextProjects[key];
    }
  }

  return {
    ...layout,
    projects: {
      ...nextProjects,
      [scope]: {
        ...(nextProjects[scope] ?? {}),
        [nodeId]: position,
      },
    },
  };
}

/**
 * Returns a layout document with one node position removed from a project.
 * @param layout - Current layout document.
 * @param projectId - Project node identifier.
 * @param nodeId - Work package node identifier.
 * @returns Updated layout document.
 */
export function withoutNodePosition(
  layout: WorkPackageLayout,
  projectId: string,
  nodeId: string,
): WorkPackageLayout {
  const bucket = resolveProjectLayoutBucket(layout, projectId);
  if (!bucket) {
    return layout;
  }

  const project = layout.projects[bucket];
  if (!project || !(nodeId in project)) {
    return layout;
  }

  const nextProject = { ...project };
  delete nextProject[nodeId];

  const nextProjects = { ...layout.projects };
  if (Object.keys(nextProject).length === 0) {
    delete nextProjects[bucket];
  } else {
    nextProjects[bucket] = nextProject;
  }

  return {
    ...layout,
    projects: nextProjects,
  };
}

export async function saveGraphLayout(
  roadmapRoot: string,
  layout: WorkPackageLayout,
): Promise<WorkPackageLayout> {
  const dto = await invoke<WorkPackageLayoutDto>("save_graph_layout_command", {
    roadmapRoot,
    layout: toWorkPackageLayoutDto(layout),
  });
  return fromWorkPackageLayoutDto(dto);
}

/**
 * Removes a top-level node position from the persisted layout file.
 * @param roadmapRoot - Roadmap root path on disk.
 * @param nodeId - Top-level node identifier.
 * @returns Updated layout document after removal.
 */
export async function removeTopLevelNodePosition(
  roadmapRoot: string,
  nodeId: string,
): Promise<WorkPackageLayout> {
  const dto = await invoke<WorkPackageLayoutDto>("remove_top_level_node_position_command", {
    roadmapRoot,
    nodeId,
  });
  return fromWorkPackageLayoutDto(dto);
}

/**
 * Loads persisted work package layout from the roadmap `.fits` directory.
 * @param roadmapRoot - Roadmap root path on disk.
 * @returns Work package layout document.
 */
export async function loadWorkPackageLayout(roadmapRoot: string): Promise<WorkPackageLayout> {
  const dto = await invoke<WorkPackageLayoutDto>("load_work_package_layout_command", {
    roadmapRoot,
  });
  return fromWorkPackageLayoutDto(dto);
}

/**
 * Persists one top-level node position.
 * @param request - Layout save payload for the backend.
 * @returns Updated layout document after save.
 */
export async function saveTopLevelNodePosition(
  request: SaveTopLevelNodePositionRequest,
): Promise<WorkPackageLayout> {
  const dto = await invoke<WorkPackageLayoutDto>("save_top_level_node_position_command", {
    request,
  });
  return fromWorkPackageLayoutDto(dto);
}

/**
 * Persists one work package node position for a project.
 * @param request - Layout save payload for the backend.
 * @returns Updated layout document after save.
 */
export async function saveWorkPackageNodePosition(
  request: SaveWorkPackageNodePositionRequest,
): Promise<WorkPackageLayout> {
  const dto = await invoke<WorkPackageLayoutDto>("save_work_package_node_position_command", {
    request,
  });
  return fromWorkPackageLayoutDto(dto);
}

/**
 * Removes a work package node position from the persisted layout file.
 * @param roadmapRoot - Roadmap root path on disk.
 * @param projectId - Project node identifier.
 * @param nodeId - Work package node identifier.
 * @returns Updated layout document after removal.
 */
export async function removeWorkPackageNodePosition(
  roadmapRoot: string,
  projectId: string,
  nodeId: string,
): Promise<WorkPackageLayout> {
  const dto = await invoke<WorkPackageLayoutDto>("remove_work_package_node_position_command", {
    roadmapRoot,
    projectId,
    nodeId,
  });
  return fromWorkPackageLayoutDto(dto);
}

/**
 * Computes a fallback grid position for nodes without saved coordinates.
 * @param nodeId - Node identifier to position.
 * @param nodeIds - Ordered node identifiers in the current graph.
 * @returns Default x/y coordinates for the node.
 */
export function defaultNodePosition(
  nodeId: string,
  nodeIds: string[],
): NodePosition {
  const index = nodeIds.indexOf(nodeId);
  const column = index < 0 ? 0 : index;
  return {
    x: 40 * column,
    y: column % 2 === 0 ? 0 : 40,
  };
}
