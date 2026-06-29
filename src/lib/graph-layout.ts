import { invoke } from "@tauri-apps/api/core";
import { nodeLabel } from "./graph";

export interface NodePosition {
  x: number;
  y: number;
}

export interface WorkPackageLayout {
  version: number;
  kind: string;
  projects: Record<string, Record<string, NodePosition>>;
}

export const EMPTY_WORK_PACKAGE_LAYOUT: WorkPackageLayout = {
  version: 1,
  kind: "bellman-gui-work-package-layout",
  projects: {},
};

interface WorkPackageLayoutDto {
  version: number;
  kind: string;
  projects: Record<string, Record<string, NodePosition>>;
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
    projects: dto.projects ?? {},
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
