import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initialStateFromHistory,
  loadNodeEditorHistory,
  persistNodeEditorHistory,
} from "./node-editor-history";
import { historyField } from "./codemirror-history";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("node-editor-history", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("loadNodeEditorHistory invokes the load command", async () => {
    invokeMock.mockResolvedValue({
      doc: "# hello\n",
      state: { doc: "# hello\n", history: {} },
    });

    const entry = await loadNodeEditorHistory("/roadmap", "goal/reduce-churn", "# hello\n");

    expect(invokeMock).toHaveBeenCalledWith("load_node_editor_history_command", {
      roadmapRoot: "/roadmap",
      nodeId: "goal/reduce-churn",
      expectedDoc: "# hello\n",
    });
    expect(entry?.doc).toBe("# hello\n");
  });

  it("persistNodeEditorHistory serializes state and saves", async () => {
    invokeMock.mockResolvedValue(undefined);
    const state = {
      doc: { toString: () => "# saved\n" },
      toJSON: () => ({ doc: "# saved\n", history: { done: [1] } }),
    };

    await persistNodeEditorHistory(
      "/roadmap",
      "goal/reduce-churn",
      state as never,
    );

    expect(invokeMock).toHaveBeenCalledWith("save_node_editor_history_command", {
      roadmapRoot: "/roadmap",
      nodeId: "goal/reduce-churn",
      entry: {
        doc: "# saved\n",
        state: { doc: "# saved\n", history: { done: [1] } },
      },
    });
  });

  it("initialStateFromHistory returns fields for historyField", () => {
    const result = initialStateFromHistory({
      doc: "# x\n",
      state: { doc: "# x\n", history: {} },
    });
    expect(result).toEqual({
      json: { doc: "# x\n", history: {} },
      fields: { history: historyField },
    });
    expect(initialStateFromHistory(null)).toBeNull();
  });
});
