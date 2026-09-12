import { useEffect, useMemo, useState } from "react";
import type { WorkPackageDetail } from "../lib/node-detail";
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

  const options = useMemo(
    () => workPackage.availableTitles.filter((title) => title !== workPackage.title),
    [workPackage.availableTitles, workPackage.title],
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

  const toggleDependency = (title: string) => {
    setDependencies((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : [...current, title],
    );
  };

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
          options.map((title) => (
            <label key={title} className="wp-dependency-option">
              <input
                type="checkbox"
                checked={dependencies.includes(title)}
                onChange={() => toggleDependency(title)}
              />
              <span>{title}</span>
            </label>
          ))
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
