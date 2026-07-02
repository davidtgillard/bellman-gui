import { useEffect, useMemo, useState } from "react";
import type { WorkPackageDetail } from "../lib/node-detail";

interface WorkPackageEditorProps {
  workPackage: WorkPackageDetail;
  saving: boolean;
  backendError: string | null;
  onSave: (input: { description: string; dependencies: string[] }) => void;
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

export function WorkPackageEditor({
  workPackage,
  saving,
  backendError,
  onSave,
  onCancel,
  onDirtyChange,
}: WorkPackageEditorProps) {
  const [description, setDescription] = useState(workPackage.description);
  const [dependencies, setDependencies] = useState<string[]>(
    workPackage.dependencies,
  );

  const options = useMemo(
    () => workPackage.availableTitles.filter((title) => title !== workPackage.title),
    [workPackage.availableTitles, workPackage.title],
  );

  const dirty =
    description !== workPackage.description ||
    !sameMembers(dependencies, workPackage.dependencies);

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
    onSave({ description: description.trim() || "TBD.", dependencies });
  };

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
          disabled={saving || !dirty}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
