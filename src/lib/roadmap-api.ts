import { invoke } from "@tauri-apps/api/core";
import {
  fromRoadmapGraphDto,
  type CreateLinkRequest,
  type CreateNodeRequest,
  type RemoveLinkRequest,
  type RemoveNodeRequest,
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
