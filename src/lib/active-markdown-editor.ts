import type { EditorView } from "@codemirror/view";
import { redo, undo } from "./codemirror-history";

let activeView: EditorView | null = null;

/**
 * Registers the focused markdown CodeMirror view for menu-driven undo/redo.
 * @param view - Active editor view, or null when focus leaves the editor.
 */
export function setActiveMarkdownEditor(view: EditorView | null): void {
  activeView = view;
}

/**
 * Undoes in the focused markdown editor when one is registered.
 * @returns True when an editor undo was performed.
 */
export function undoActiveMarkdownEditor(): boolean {
  if (!activeView) {
    return false;
  }
  return undo(activeView);
}

/**
 * Redoes in the focused markdown editor when one is registered.
 * @returns True when an editor redo was performed.
 */
export function redoActiveMarkdownEditor(): boolean {
  if (!activeView) {
    return false;
  }
  return redo(activeView);
}

/**
 * Returns whether a DOM event target is inside a CodeMirror editor.
 * @param target - Event target to inspect.
 * @returns True when the target is within a CodeMirror editor root.
 */
export function isCodeMirrorEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest(".cm-editor") || target.closest(".node-markdown-codemirror"));
}
