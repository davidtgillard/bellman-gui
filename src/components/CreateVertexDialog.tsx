import { useMemo, useState, type FormEvent } from "react";
import {
  nodeTypeLabel,
  projectNames,
  type GraphNode,
  type VertexKind,
  VERTEX_KINDS,
} from "../lib/graph";

interface CreateVertexDialogProps {
  open: boolean;
  nodes: GraphNode[];
  saving: boolean;
  onClose: () => void;
  onCreate: (input: {
    vertexKind: VertexKind;
    name: string;
    project?: string;
    description?: string;
  }) => void;
}

export function CreateVertexDialog({
  open,
  nodes,
  saving,
  onClose,
  onCreate,
}: CreateVertexDialogProps) {
  const [vertexKind, setVertexKind] = useState<VertexKind>("initiative");
  const [name, setName] = useState("");
  const [project, setProject] = useState("");
  const [description, setDescription] = useState("TBD.");

  const projects = useMemo(() => projectNames(nodes), [nodes]);
  const isWorkPackage = vertexKind === "work_package";

  if (!open) {
    return null;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    onCreate({
      vertexKind,
      name: trimmedName,
      project: isWorkPackage ? project : undefined,
      description: isWorkPackage ? description.trim() || "TBD." : undefined,
    });
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <dialog
        className="edit-dialog"
        open
        aria-labelledby="create-vertex-title"
        onClick={(event) => event.stopPropagation()}
        onClose={onClose}
      >
        <form onSubmit={handleSubmit}>
          <header className="edit-dialog-header">
            <h2 id="create-vertex-title">New vertex</h2>
            <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>

          <label className="edit-field">
            <span>Type</span>
            <select
              value={vertexKind}
              onChange={(event) => setVertexKind(event.target.value as VertexKind)}
            >
              {VERTEX_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {nodeTypeLabel(kind)}
                </option>
              ))}
            </select>
          </label>

          <label className="edit-field">
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="my-new-item"
              autoFocus
              required
            />
            <span className="field-hint">Use lowercase kebab-case.</span>
          </label>

          {isWorkPackage ? (
            <>
              <label className="edit-field">
                <span>Project</span>
                <select
                  value={project}
                  onChange={(event) => setProject(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select a project…
                  </option>
                  {projects.map((projectName) => (
                    <option key={projectName} value={projectName}>
                      {projectName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="edit-field">
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  required
                />
              </label>
            </>
          ) : null}

          <footer className="edit-dialog-actions">
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving || (isWorkPackage && !project)}>
              {saving ? "Creating…" : "Create vertex"}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
