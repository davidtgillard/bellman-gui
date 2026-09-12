import { useMemo, useState, type FormEvent } from "react";
import {
  nodeTypeLabel,
  projectNames,
  type GraphNode,
  type NodeKind,
  NODE_KINDS,
} from "../lib/graph";
import {
  validateWorkPackageEstimate,
  type WorkPackageEstimate,
} from "../lib/work-package-estimate";
import { validateWorkPackageName } from "../lib/work-package-name";
import { WorkPackageEstimateFields } from "./WorkPackageEstimateFields";

export type CreateNodeDialogMode = "top_level" | "work_package";

interface CreateNodeDialogProps {
  open: boolean;
  nodes: GraphNode[];
  saving: boolean;
  /** When `work_package`, only WP creation is offered. */
  mode?: CreateNodeDialogMode;
  /** Read-only parent label when creating a nested work package. */
  parentLabel?: string | null;
  /** Project name locked from the active WP graph view. */
  lockedProject?: string | null;
  onClose: () => void;
  onCreate: (input: {
    nodeKind: NodeKind;
    name: string;
    project?: string;
    description?: string;
    estimate?: WorkPackageEstimate | null;
  }) => void;
}

const EMPTY_ESTIMATE = { optimistic: "", likely: "", pessimistic: "" };

export function CreateNodeDialog({
  open,
  nodes,
  saving,
  mode = "top_level",
  parentLabel = null,
  lockedProject = null,
  onClose,
  onCreate,
}: CreateNodeDialogProps) {
  const isWorkPackageMode = mode === "work_package";
  const [nodeKind, setNodeKind] = useState<NodeKind>(
    isWorkPackageMode ? "work_package" : "initiative",
  );
  const [name, setName] = useState("");
  const [project, setProject] = useState(lockedProject ?? "");
  const [description, setDescription] = useState("");
  const [estimateValues, setEstimateValues] = useState(EMPTY_ESTIMATE);

  const projects = useMemo(() => projectNames(nodes), [nodes]);
  const isWorkPackage = isWorkPackageMode || nodeKind === "work_package";

  const nameError = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      // Avoid a red border on a freshly opened empty field; still disable submit.
      return null;
    }
    if (isWorkPackage) {
      return validateWorkPackageName(name);
    }
    return null;
  }, [isWorkPackage, name]);

  const nameMissing = !name.trim();
  const nameInvalidForSubmit = isWorkPackage
    ? Boolean(validateWorkPackageName(name))
    : nameMissing;

  const estimateValidation = useMemo(
    () =>
      isWorkPackage
        ? validateWorkPackageEstimate(estimateValues)
        : { ok: true, estimate: null, errors: {} },
    [estimateValues, isWorkPackage],
  );

  if (!open) {
    return null;
  }

  const dialogTitle = isWorkPackageMode
    ? parentLabel
      ? "New child work package"
      : "New work package"
    : "New node";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (nameInvalidForSubmit || !estimateValidation.ok) {
      return;
    }

    const resolvedName = name.trim();
    const resolvedProject = isWorkPackageMode
      ? lockedProject ?? undefined
      : isWorkPackage
        ? project
        : undefined;

    if (isWorkPackage && !resolvedProject) {
      return;
    }

    onCreate({
      nodeKind: isWorkPackageMode ? "work_package" : nodeKind,
      name: resolvedName,
      project: resolvedProject ?? undefined,
      description: isWorkPackage ? description.trim() || "TBD." : undefined,
      estimate: isWorkPackage ? estimateValidation.estimate : undefined,
    });
  };

  const submitDisabled =
    saving ||
    nameInvalidForSubmit ||
    !estimateValidation.ok ||
    (isWorkPackage && !(isWorkPackageMode ? lockedProject : project));

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <dialog
        className="edit-dialog"
        open
        aria-labelledby="create-node-title"
        onClick={(event) => event.stopPropagation()}
        onClose={onClose}
      >
        <form onSubmit={handleSubmit}>
          <header className="edit-dialog-header">
            <h2 id="create-node-title">{dialogTitle}</h2>
            <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>

          {!isWorkPackageMode ? (
            <label className="edit-field">
              <span>Type</span>
              <select
                value={nodeKind}
                onChange={(event) => setNodeKind(event.target.value as NodeKind)}
              >
                {NODE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {nodeTypeLabel(kind)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="edit-field">
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="my-new-item"
              autoFocus
              required
              className={nameError ? "is-invalid" : undefined}
              aria-invalid={Boolean(nameError)}
            />
            <span className="field-hint">Use lowercase kebab-case.</span>
            {nameError ? (
              <span className="field-error" role="alert">
                {nameError}
              </span>
            ) : null}
          </label>

          {isWorkPackageMode && parentLabel ? (
            <label className="edit-field">
              <span>Parent</span>
              <input type="text" value={parentLabel} disabled readOnly />
            </label>
          ) : null}

          {isWorkPackage && !isWorkPackageMode ? (
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
          ) : null}

          {isWorkPackage ? (
            <>
              <label className="edit-field">
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="TBD."
                  rows={3}
                />
              </label>

              <WorkPackageEstimateFields
                values={estimateValues}
                errors={estimateValidation.errors}
                disabled={saving}
                onChange={setEstimateValues}
              />
            </>
          ) : null}

          <footer className="edit-dialog-actions">
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={submitDisabled}>
              {saving ? "Creating…" : isWorkPackageMode ? "Create work package" : "Create node"}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
