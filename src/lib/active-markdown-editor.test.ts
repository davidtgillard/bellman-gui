/* eslint-disable jsdoc/check-tag-names -- Vitest environment pragma */
/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  isCodeMirrorEventTarget,
  redoActiveMarkdownEditor,
  setActiveMarkdownEditor,
  undoActiveMarkdownEditor,
} from "./active-markdown-editor";

describe("active-markdown-editor", () => {
  it("reports CodeMirror event targets", () => {
    const root = document.createElement("div");
    root.className = "node-markdown-codemirror";
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    const content = document.createElement("div");
    content.className = "cm-content";
    editor.appendChild(content);
    root.appendChild(editor);
    document.body.appendChild(root);

    expect(isCodeMirrorEventTarget(content)).toBe(true);
    expect(isCodeMirrorEventTarget(document.body)).toBe(false);

    root.remove();
  });

  it("returns false for undo/redo when no editor is active", () => {
    setActiveMarkdownEditor(null);
    expect(undoActiveMarkdownEditor()).toBe(false);
    expect(redoActiveMarkdownEditor()).toBe(false);
  });
});
