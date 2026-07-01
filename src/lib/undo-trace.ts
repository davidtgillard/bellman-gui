import type { UndoStatus } from "./undo-api";

/** Kinds of undo-stack operations a developer may want to trace. */
export type UndoTraceEvent = "undo" | "redo";

const TRACE_STORAGE_KEY = "bellman:trace-undo";

/**
 * Reports whether undo/redo tracing is enabled.
 *
 * Enabled automatically in dev builds, or in any build when the
 * `bellman:trace-undo` localStorage key is set. Kept lazy so toggling the key
 * takes effect without a rebuild.
 * @returns True when trace output should be emitted.
 */
function traceEnabled(): boolean {
  if (import.meta.env?.DEV) {
    return true;
  }
  try {
    return globalThis.localStorage?.getItem(TRACE_STORAGE_KEY) != null;
  } catch {
    return false;
  }
}

/**
 * Logs an undo/redo stack operation to the console for developers.
 *
 * Complements the backend `Slot` trace (gated by `BELLMAN_GUI_TRACE_UNDO`) so a
 * single operation can be followed across the frontend call and the Rust
 * `Record`.
 * @param event - Which stack operation was invoked.
 * @param status - Undo/redo availability reported after the operation.
 */
export function traceUndo(event: UndoTraceEvent, status: UndoStatus): void {
  if (!traceEnabled()) {
    return;
  }
  console.debug(
    `[undo] ${event} -> canUndo=${status.canUndo} canRedo=${status.canRedo}` +
      ` undo=${status.undoLabel ?? "-"} redo=${status.redoLabel ?? "-"}`,
  );
}
