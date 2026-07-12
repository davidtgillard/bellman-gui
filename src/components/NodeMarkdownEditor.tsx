import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { keymap, EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  hasBlockingErrors,
  validateNodeMarkdown,
  type ContentValidationContext,
} from "../lib/node-content-validation";
import { setActiveMarkdownEditor } from "../lib/active-markdown-editor";
import { history, historyKeymap } from "../lib/codemirror-history";
import {
  initialStateFromHistory,
  loadNodeEditorHistory,
  persistNodeEditorHistory,
  type NodeEditorHistoryEntry,
} from "../lib/node-editor-history";
import { nodeLabel } from "../lib/graph";

const HISTORY_DEPTH = 50;

interface NodeMarkdownEditorProps {
  roadmapRoot: string;
  nodeId: string;
  nodeType: string;
  initialMarkdown: string;
  saving: boolean;
  backendError: string | null;
  onSave: (markdown: string) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

function expectedSlugFor(nodeId: string): string {
  return nodeLabel(nodeId);
}

const editorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#0b1220",
      color: "#e2e8f0",
      fontSize: "0.9375rem",
    },
    ".cm-content": {
      caretColor: "#e2e8f0",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
      padding: "0.75rem 0",
    },
    ".cm-line": { padding: "0 0.75rem" },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#e2e8f0" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "#334155" },
    ".cm-gutters": {
      backgroundColor: "#0b1220",
      color: "#475569",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "rgba(148, 163, 184, 0.08)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(148, 163, 184, 0.08)" },
    ".cm-lintRange-error": {
      textDecoration: "underline wavy #ef4444",
    },
    ".cm-lintRange-warning": {
      textDecoration: "underline wavy #f59e0b",
    },
  },
  { dark: true },
);

const editorHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "#93c5fd", fontWeight: "600" },
  { tag: tags.strong, color: "#f8fafc", fontWeight: "700" },
  { tag: tags.emphasis, color: "#e2e8f0", fontStyle: "italic" },
  { tag: tags.link, color: "#60a5fa", textDecoration: "underline" },
  { tag: tags.url, color: "#38bdf8" },
  { tag: tags.list, color: "#cbd5e1" },
  { tag: tags.quote, color: "#94a3b8", fontStyle: "italic" },
  { tag: tags.monospace, color: "#fbbf24" },
]);

export function NodeMarkdownEditor({
  roadmapRoot,
  nodeId,
  nodeType,
  initialMarkdown,
  saving,
  backendError,
  onSave,
  onCancel,
  onDirtyChange,
}: NodeMarkdownEditorProps) {
  const [value, setValue] = useState(initialMarkdown);
  const [showPreview, setShowPreview] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [restoredHistory, setRestoredHistory] =
    useState<NodeEditorHistoryEntry | null>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const viewRef = useRef<EditorView | null>(null);

  const context = useMemo<ContentValidationContext>(
    () => ({ nodeType, expectedSlug: expectedSlugFor(nodeId) }),
    [nodeId, nodeType],
  );

  const diagnostics = useMemo(
    () => validateNodeMarkdown(value, context),
    [value, context],
  );

  const dirty = value !== initialMarkdown;
  const blocked = hasBlockingErrors(diagnostics);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    let cancelled = false;
    void loadNodeEditorHistory(roadmapRoot, nodeId, initialMarkdown)
      .then((entry) => {
        if (!cancelled) {
          setRestoredHistory(entry);
          setHistoryReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRestoredHistory(null);
          setHistoryReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roadmapRoot, nodeId, initialMarkdown]);

  useEffect(() => {
    return () => {
      setActiveMarkdownEditor(null);
      viewRef.current = null;
    };
  }, []);

  const lintExtension = useMemo(
    () =>
      linter((view: EditorView): Diagnostic[] => {
        const text = view.state.doc.toString();
        const length = text.length;
        return validateNodeMarkdown(text, context).map((diagnostic) => ({
          from: Math.min(diagnostic.from, length),
          to: Math.min(diagnostic.to, length),
          severity: diagnostic.severity,
          message: diagnostic.message,
        }));
      }),
    [context],
  );

  const focusBridge = useMemo(
    () =>
      EditorView.domEventHandlers({
        focus: (_event, view) => {
          setActiveMarkdownEditor(view);
          return false;
        },
        blur: () => {
          setActiveMarkdownEditor(null);
          return false;
        },
      }),
    [],
  );

  const extensions = useMemo(
    () => [
      markdown(),
      syntaxHighlighting(editorHighlight),
      lintExtension,
      lintGutter(),
      EditorView.lineWrapping,
      history({ minDepth: HISTORY_DEPTH }),
      keymap.of(historyKeymap),
      focusBridge,
    ],
    [focusBridge, lintExtension],
  );

  const initialState = useMemo(
    () => initialStateFromHistory(restoredHistory),
    [restoredHistory],
  );

  const handleSave = () => {
    if (saving || blocked || !dirty) {
      return;
    }
    const view = viewRef.current ?? editorRef.current?.view ?? null;
    void (async () => {
      if (view) {
        try {
          await persistNodeEditorHistory(roadmapRoot, nodeId, view.state);
        } catch (error) {
          console.error("[node-editor-history] failed to persist:", error);
        }
      }
      onSave(value);
    })();
  };

  return (
    <div className="node-markdown-editor">
      <div className="node-editor-toolbar">
        <button
          type="button"
          className="node-editor-toggle"
          aria-pressed={showPreview}
          onClick={() => setShowPreview((current) => !current)}
        >
          {showPreview ? "Edit" : "Preview"}
        </button>
      </div>

      {showPreview ? (
        <article className="node-detail-markdown node-editor-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
        </article>
      ) : null}

      {historyReady ? (
        <div
          className={
            showPreview
              ? "node-markdown-codemirror node-markdown-codemirror-hidden"
              : "node-markdown-codemirror"
          }
          hidden={showPreview}
          aria-hidden={showPreview}
        >
          <CodeMirror
            ref={editorRef}
            value={value}
            theme={editorTheme}
            minHeight="360px"
            extensions={extensions}
            initialState={initialState ?? undefined}
            onChange={setValue}
            onCreateEditor={(view) => {
              viewRef.current = view;
              if (view.hasFocus) {
                setActiveMarkdownEditor(view);
              }
            }}
            basicSetup={{ foldGutter: false, history: false }}
            aria-label="Node markdown editor"
          />
        </div>
      ) : (
        <p className="node-detail-status">Loading editor…</p>
      )}

      <div className="node-editor-problems" aria-label="Validation problems">
        {backendError ? (
          <p className="node-editor-problem error" role="alert">
            {backendError}
          </p>
        ) : null}
        {diagnostics.length === 0 && !backendError ? (
          <p className="node-editor-problem ok">No problems detected.</p>
        ) : null}
        {diagnostics.map((diagnostic, index) => (
          <p
            key={`${diagnostic.from}-${index}`}
            className={`node-editor-problem ${diagnostic.severity}`}
          >
            {diagnostic.message}
          </p>
        ))}
      </div>

      <div className="node-editor-actions">
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="node-editor-save"
          onClick={handleSave}
          disabled={saving || blocked || !dirty}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
