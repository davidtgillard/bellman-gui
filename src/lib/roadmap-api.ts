import { invoke } from "@tauri-apps/api/core";
import {
  fromRoadmapGraphDto,
  type CreateEdgeRequest,
  type CreateVertexRequest,
  type RoadmapGraphDto,
} from "./graph";

/**
 * Creates a roadmap vertex via the bellman sidecar and returns the updated graph.
 * @param request - Vertex creation payload for the backend.
 * @returns Updated roadmap graph after creation.
 */
export async function createVertex(request: CreateVertexRequest) {
  const dto = await invoke<RoadmapGraphDto>("create_vertex_command", { request });
  return fromRoadmapGraphDto(dto);
}

/**
 * Creates a roadmap edge in links.json(c) and returns the updated graph.
 * @param request - Edge creation payload for the backend.
 * @returns Updated roadmap graph after creation.
 */
export async function createEdge(request: CreateEdgeRequest) {
  const dto = await invoke<RoadmapGraphDto>("create_edge_command", { request });
  return fromRoadmapGraphDto(dto);
}
