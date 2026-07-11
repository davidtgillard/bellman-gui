import { invoke } from "@tauri-apps/api/core";
import {
  fromRoadmapGraphDto,
  type CreateLinkRequest,
  type CreateNodeRequest,
  type RemoveLinkRequest,
  type RemoveNodeRequest,
  type RenameNodeRequest,
  type RenameNodeResponse,
  type RenameNodeResponseDto,
  type RoadmapGraphDto,
} from "./graph";

/**
 * Creates a roadmap node via the bellman sidecar and returns the updated graph.
 * @param request - Node creation payload for the backend.
 * @returns Updated roadmap graph after creation.
 */
export async function createNode(request: CreateNodeRequest) {
  const dto = await invoke<RoadmapGraphDto>("create_node_command", { request });
  return fromRoadmapGraphDto(dto);
}

/**
 * Creates a roadmap link in links.json(c) and returns the updated graph.
 * @param request - Link creation payload for the backend.
 * @returns Updated roadmap graph after creation.
 */
export async function createLink(request: CreateLinkRequest) {
  const dto = await invoke<RoadmapGraphDto>("create_link_command", { request });
  return fromRoadmapGraphDto(dto);
}

/**
 * Removes a roadmap link from links.json(c) and returns the updated graph.
 * @param request - Link removal payload for the backend.
 * @returns Updated roadmap graph after removal.
 */
export async function removeLink(request: RemoveLinkRequest) {
  const dto = await invoke<RoadmapGraphDto>("remove_link_command", { request });
  return fromRoadmapGraphDto(dto);
}

/**
 * Deletes a roadmap node via the bellman sidecar and returns the updated graph.
 * @param request - Node removal payload for the backend.
 * @returns Updated roadmap graph after removal.
 */
export async function removeNode(request: RemoveNodeRequest) {
  const dto = await invoke<RoadmapGraphDto>("remove_node_command", { request });
  return fromRoadmapGraphDto(dto);
}

/**
 * Renames a roadmap node via the bellman sidecar and returns the updated graph.
 * @param request - Node rename payload for the backend.
 * @returns Updated roadmap graph and the new node id after rename.
 */
export async function renameNode(request: RenameNodeRequest): Promise<RenameNodeResponse> {
  const dto = await invoke<RenameNodeResponseDto>("rename_node_command", { request });
  return {
    graph: fromRoadmapGraphDto(dto.graph),
    newNodeId: dto.new_node_id,
  };
}

export interface UpdateWorkPackageRequest {
  roadmap_root: string;
  node_id: string;
  description: string;
  dependencies: string[];
}

/**
 * Updates a work package's description and dependencies in work-packages.yaml,
 * runs a bellman sync, and returns the resulting graph.
 * @param request - Work package update payload for the backend.
 * @returns Updated roadmap graph after the edit and sync.
 */
export async function updateWorkPackage(request: UpdateWorkPackageRequest) {
  const dto = await invoke<RoadmapGraphDto>("update_work_package_command", { request });
  return fromRoadmapGraphDto(dto);
}
