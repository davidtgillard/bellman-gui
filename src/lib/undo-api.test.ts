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
  nodes: [{ id: "initiative/reduce-churn", type: "initiative" }],
  links: [
    {
      id: "precedes_FS_Mandatory--project/x--initiative/reduce-churn",
      link_type: "precedes_FS_Mandatory",
      source: "project/x",
      target: "initiative/reduce-churn",
    },
  ],
  link_types: [{ link_type: "precedes_FS_Mandatory", in_type: "project", out_type: "initiative" }],
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
    expect(graph.links[0]?.linkType).toBe("precedes_FS_Mandatory");
  });

  it("redo invokes redo_command and maps the returned graph", async () => {
    invokeMock.mockResolvedValueOnce(graphDto);

    const graph = await redo("/roadmap");

    expect(invokeMock).toHaveBeenCalledWith("redo_command", {
      roadmapRoot: "/roadmap",
    });
    expect(graph.nodes[0]?.id).toBe("initiative/reduce-churn");
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
