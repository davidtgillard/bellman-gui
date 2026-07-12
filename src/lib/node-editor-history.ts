import { invoke } from "@tauri-apps/api/core";
import { historyField, type EditorState } from "./codemirror-history";

/** Persisted CodeMirror editor history for one node. */
export interface NodeEditorHistoryEntry {
  doc: string;
  state: unknown;
}

/**
 * Loads persisted editor history for a node when the stored doc matches `expectedDoc`.
 * @param roadmapRoot - Roadmap root directory.
 * @param nodeId - Graph node id (logical path or GUID).
 * @param expectedDoc - Current markdown on disk / in the editor.
 * @returns History entry or null when missing or stale.
 */
export async function loadNodeEditorHistory(
  roadmapRoot: string,
  nodeId: string,
  expectedDoc: string,
): Promise<NodeEditorHistoryEntry | null> {
  const entry = await invoke<NodeEditorHistoryEntry | null>(
    "load_node_editor_history_command",
    {
      roadmapRoot,
      nodeId,
      expectedDoc,
    },
  );
  return entry;
}

/**
 * Persists CodeMirror editor state for a node under its registry GUID.
 * @param roadmapRoot - Roadmap root directory.
 * @param nodeId - Graph node id (logical path or GUID).
 * @param state - Editor state to serialize.
 */
export async function persistNodeEditorHistory(
  roadmapRoot: string,
  nodeId: string,
  state: EditorState,
): Promise<void> {
  const json = state.toJSON({ history: historyField });
  const doc = typeof json.doc === "string" ? json.doc : state.doc.toString();
  await invoke("save_node_editor_history_command", {
    roadmapRoot,
    nodeId,
    entry: {
      doc,
      state: json,
    },
  });
}

/**
 * Builds the CodeMirror `initialState` prop from a persisted history entry.
 * @param entry - Persisted history entry.
 * @returns Props for `@uiw/react-codemirror` `initialState`, or null when unusable.
 */
export function initialStateFromHistory(entry: NodeEditorHistoryEntry | null): {
  json: unknown;
  fields: { history: typeof historyField };
} | null {
  if (!entry || entry.state == null) {
    return null;
  }
  return {
    json: entry.state,
    fields: { history: historyField },
  };
}
