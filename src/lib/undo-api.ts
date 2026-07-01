import { invoke } from "@tauri-apps/api/core";
import { fromRoadmapGraphDto, type RoadmapGraphDto } from "./graph";

/** Serialized undo/redo availability returned by the backend. */
interface UndoStateDto {
  can_undo: boolean;
  can_redo: boolean;
  undo_label: string | null;
  redo_label: string | null;
}

/** Undo/redo availability and pending operation labels for the current roadmap. */
export interface UndoStatus {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

/**
 * Undoes the most recent structural edit and returns the resulting graph.
 * @param roadmapRoot - Root directory of the roadmap whose history to undo.
 * @returns Roadmap graph after the undo.
 */
export async function undo(roadmapRoot: string) {
  const dto = await invoke<RoadmapGraphDto>("undo_command", {
    roadmapRoot,
  });
  return fromRoadmapGraphDto(dto);
}

/**
 * Redoes the most recently undone structural edit and returns the resulting graph.
 * @param roadmapRoot - Root directory of the roadmap whose history to redo.
 * @returns Roadmap graph after the redo.
 */
export async function redo(roadmapRoot: string) {
  const dto = await invoke<RoadmapGraphDto>("redo_command", {
    roadmapRoot,
  });
  return fromRoadmapGraphDto(dto);
}

/**
 * Reads the current undo/redo availability for a roadmap.
 * @param roadmapRoot - Root directory of the roadmap to inspect.
 * @returns Undo/redo availability and pending operation labels.
 */
export async function undoState(roadmapRoot: string): Promise<UndoStatus> {
  const dto = await invoke<UndoStateDto>("undo_state_command", {
    roadmapRoot,
  });
  return {
    canUndo: dto.can_undo,
    canRedo: dto.can_redo,
    undoLabel: dto.undo_label,
    redoLabel: dto.redo_label,
  };
}
