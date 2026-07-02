import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  hasBlockingErrors,
  validateNodeMarkdown,
  type ContentValidationContext,
} from "../lib/node-content-validation";

interface NodeMarkdownEditorProps {
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
  const segments = nodeId.split("--");
  return segments[segments.length - 1] ?? nodeId;
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

  const extensions = useMemo(
    () => [
      markdown(),
      syntaxHighlighting(editorHighlight),
      lintExtension,
      lintGutter(),
      EditorView.lineWrapping,
    ],
    [lintExtension],
  );

  const handleSave = () => {
    if (saving || blocked || !dirty) {
      return;
    }
    onSave(value);
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
      ) : (
        <CodeMirror
          className="node-markdown-codemirror"
          value={value}
          theme={editorTheme}
          minHeight="360px"
          extensions={extensions}
          onChange={setValue}
          basicSetup={{ foldGutter: false }}
          aria-label="Node markdown editor"
        />
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
