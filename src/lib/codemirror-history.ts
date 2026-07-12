/**
 * Re-exports CodeMirror history helpers used by the markdown editor.
 * Kept in a thin module so tests can mock serialization without pulling the full editor.
 */
export {
  history,
  historyField,
  historyKeymap,
  undo,
  redo,
  undoDepth,
  redoDepth,
} from "@codemirror/commands";
export type { EditorState } from "@codemirror/state";
