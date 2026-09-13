import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import { nodeLabel } from "../lib/graph";
import type { WorkPackageDetail } from "../lib/node-detail";
import {
  toggleDependency,
  unselectedDependencyOptions,
} from "../lib/work-package-dependencies";
import {
  estimateToFieldValues,
  validateWorkPackageEstimate,
  type WorkPackageEstimate,
} from "../lib/work-package-estimate";
import { WorkPackageEstimateFields } from "./WorkPackageEstimateFields";

export type SaveWorkPackageInput =
  | {
      description: string;
      dependencies: string[];
      estimate: WorkPackageEstimate;
    }
  | {
      description: string;
      dependencies: string[];
      estimate?: never;
    };

interface WorkPackageEditorProps {
  workPackage: WorkPackageDetail;
  saving: boolean;
  backendError: string | null;
  onSave: (input: SaveWorkPackageInput) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onDraftDependenciesChange?: (titles: string[]) => void;
  dependencyToggleRef?: MutableRefObject<(nodeId: string) => void>;
}

function sameMembers(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const set = new Set(left);
  return right.every((item) => set.has(item));
}

const EMPTY_ESTIMATE = { optimistic: "", likely: "", pessimistic: "" };

export function WorkPackageEditor({
  workPackage,
  saving,
  backendError,
  onSave,
  onCancel,
  onDirtyChange,
  onDraftDependenciesChange,
  dependencyToggleRef,
}: WorkPackageEditorProps) {
  const isLeaf = workPackage.role === "leaf";
  const [description, setDescription] = useState(workPackage.description);
  const [dependencies, setDependencies] = useState<string[]>(
    workPackage.dependencies,
  );
  const [estimateValues, setEstimateValues] = useState(() =>
    workPackage.role === "leaf"
      ? estimateToFieldValues(workPackage.estimate)
      : EMPTY_ESTIMATE,
  );
  const [addQuery, setAddQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const options = useMemo(
    () => workPackage.availableTitles.filter((title) => title !== workPackage.title),
    [workPackage.availableTitles, workPackage.title],
  );

  const addCandidates = useMemo(
    () => unselectedDependencyOptions(options, dependencies, addQuery),
    [addQuery, dependencies, options],
  );

  const originalEstimateFields = useMemo(
    () =>
      workPackage.role === "leaf"
        ? estimateToFieldValues(workPackage.estimate)
        : EMPTY_ESTIMATE,
    [workPackage],
  );

  const estimateValidation = useMemo(
    () => validateWorkPackageEstimate(estimateValues),
    [estimateValues],
  );

  const estimateDirty =
    isLeaf &&
    (estimateValues.optimistic !== originalEstimateFields.optimistic ||
      estimateValues.likely !== originalEstimateFields.likely ||
      estimateValues.pessimistic !== originalEstimateFields.pessimistic);

  const dirty =
    description !== workPackage.description ||
    !sameMembers(dependencies, workPackage.dependencies) ||
    estimateDirty;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onDraftDependenciesChange?.(dependencies);
  }, [dependencies, onDraftDependenciesChange]);

  useEffect(() => {
    return () => onDraftDependenciesChange?.([]);
  }, [onDraftDependenciesChange]);

  const applyToggle = (title: string) => {
    setDependencies((current) =>
      toggleDependency(current, title, workPackage.title),
    );
  };

  useEffect(() => {
    if (!dependencyToggleRef) {
      return;
    }
    dependencyToggleRef.current = (nodeId: string) => {
      setDependencies((current) =>
        toggleDependency(current, nodeLabel(nodeId), workPackage.title),
      );
    };
    return () => {
      dependencyToggleRef.current = () => {};
    };
  }, [dependencyToggleRef, workPackage.title]);

  const handleSave = () => {
    if (saving || !dirty) {
      return;
    }
    if (isLeaf) {
      if (!estimateValidation.ok) {
        return;
      }
      onSave({
        description: description.trim() || "TBD.",
        dependencies,
        estimate: estimateValidation.estimate,
      });
      return;
    }
    onSave({
      description: description.trim() || "TBD.",
      dependencies,
    });
  };

  const addTitle = (title: string) => {
    applyToggle(title);
    setAddQuery("");
    setAddOpen(false);
  };

  const saveDisabled =
    saving || !dirty || (isLeaf && !estimateValidation.ok);

  return (
    <div className="work-package-editor">
      <label className="edit-field">
        <span>Description</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
        />
      </label>

      {isLeaf ? (
        <WorkPackageEstimateFields
          values={estimateValues}
          errors={estimateValidation.errors}
          disabled={saving}
          onChange={setEstimateValues}
        />
      ) : null}

      <fieldset className="wp-dependencies">
        <legend>Dependencies</legend>
        {options.length === 0 ? (
          <p className="field-hint">No other work packages in this project.</p>
        ) : (
          <>
            <p className="field-hint">
              Click a work package on the graph to add or remove.
            </p>
            {dependencies.length === 0 ? (
              <p className="field-hint wp-dependencies-empty">None selected.</p>
            ) : (
              <ul className="wp-dependency-selected">
                {dependencies.map((title) => (
                  <li key={title} className="wp-dependency-chip">
                    <span>{title}</span>
                    <button
                      type="button"
                      className="wp-dependency-remove"
                      onClick={() => applyToggle(title)}
                      aria-label={`Remove ${title}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="wp-dependency-add">
              <label className="wp-dependency-add-field">
                <span>Add</span>
                <input
                  type="search"
                  role="combobox"
                  aria-expanded={addOpen && addCandidates.length > 0}
                  aria-controls="wp-dependency-suggestions"
                  aria-autocomplete="list"
                  placeholder="Search work packages…"
                  value={addQuery}
                  disabled={saving}
                  onChange={(event) => {
                    setAddQuery(event.target.value);
                    setAddOpen(true);
                  }}
                  onFocus={() => setAddOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setAddOpen(false), 120);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setAddOpen(false);
                      return;
                    }
                    if (event.key === "Enter" && addCandidates[0]) {
                      event.preventDefault();
                      addTitle(addCandidates[0]);
                    }
                  }}
                />
              </label>
              {addOpen && addCandidates.length > 0 ? (
                <ul
                  id="wp-dependency-suggestions"
                  className="wp-dependency-suggestions"
                  role="listbox"
                >
                  {addCandidates.map((title) => (
                    <li key={title} role="option">
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => addTitle(title)}
                      >
                        {title}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </>
        )}
      </fieldset>

      {backendError ? (
        <div className="node-editor-problems">
          <p className="node-editor-problem error" role="alert">
            {backendError}
          </p>
        </div>
      ) : null}

      <div className="node-editor-actions">
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="node-editor-save"
          onClick={handleSave}
          disabled={saveDisabled}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
