import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { redo, undo, undoState } from "./undo-api";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

const graphDto = {
  root: "/roadmap",
  editable: true,
  nodes: [{ id: "goal--reduce-churn", type: "goal" }],
  links: [
    {
      id: "supports--project--x--goal--reduce-churn",
      link_type: "supports",
      source: "project--x",
      target: "goal--reduce-churn",
    },
  ],
  link_types: [{ link_type: "supports", in_type: "work_scope", out_type: "goal" }],
};

describe("undo-api", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("undo invokes undo_command and maps the returned graph", async () => {
    invokeMock.mockResolvedValueOnce(graphDto);

    const graph = await undo("/roadmap");

    expect(invokeMock).toHaveBeenCalledWith("undo_command", {
      roadmapRoot: "/roadmap",
    });
    expect(graph.root).toBe("/roadmap");
    expect(graph.editable).toBe(true);
    expect(graph.links[0]?.linkType).toBe("supports");
  });

  it("redo invokes redo_command and maps the returned graph", async () => {
    invokeMock.mockResolvedValueOnce(graphDto);

    const graph = await redo("/roadmap");

    expect(invokeMock).toHaveBeenCalledWith("redo_command", {
      roadmapRoot: "/roadmap",
    });
    expect(graph.nodes[0]?.id).toBe("goal--reduce-churn");
  });

  it("undoState invokes undo_state_command and maps snake_case fields", async () => {
    invokeMock.mockResolvedValueOnce({
      can_undo: true,
      can_redo: false,
      undo_label: "remove link foo",
      redo_label: null,
    });

    const status = await undoState("/roadmap");

    expect(invokeMock).toHaveBeenCalledWith("undo_state_command", {
      roadmapRoot: "/roadmap",
    });
    expect(status).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: "remove link foo",
      redoLabel: null,
    });
  });
});
