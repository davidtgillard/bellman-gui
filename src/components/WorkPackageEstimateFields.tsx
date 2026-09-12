import type { EstimateFieldValues, EstimateFieldErrors } from "../lib/work-package-estimate";

interface WorkPackageEstimateFieldsProps {
  values: EstimateFieldValues;
  errors: EstimateFieldErrors;
  disabled?: boolean;
  onChange: (values: EstimateFieldValues) => void;
}

function fieldClassName(invalid: boolean): string | undefined {
  return invalid ? "is-invalid" : undefined;
}

export function WorkPackageEstimateFields({
  values,
  errors,
  disabled = false,
  onChange,
}: WorkPackageEstimateFieldsProps) {
  const summaryMessages = Array.from(
    new Set(
      [errors.units, errors.order, errors.optimistic, errors.likely, errors.pessimistic].filter(
        (message): message is string => Boolean(message),
      ),
    ),
  );

  return (
    <fieldset className="wp-estimate-fields">
      <legend>Estimate</legend>
      <p className="field-hint">
        Leave blank for unknown, or use durations like 1w, 2d, or 8h.
      </p>
      {summaryMessages.length > 0 ? (
        <div className="wp-estimate-summary" role="alert">
          {summaryMessages.map((message) => (
            <p key={message} className="field-error">
              {message}
            </p>
          ))}
        </div>
      ) : null}
      <div className="wp-estimate-row">
        <label className="edit-field">
          <span>Optimistic</span>
          <input
            type="text"
            value={values.optimistic}
            disabled={disabled}
            className={fieldClassName(Boolean(errors.optimistic))}
            aria-invalid={Boolean(errors.optimistic)}
            onChange={(event) =>
              onChange({ ...values, optimistic: event.target.value })
            }
          />
        </label>
        <label className="edit-field">
          <span>Likely</span>
          <input
            type="text"
            value={values.likely}
            disabled={disabled}
            className={fieldClassName(Boolean(errors.likely))}
            aria-invalid={Boolean(errors.likely)}
            onChange={(event) =>
              onChange({ ...values, likely: event.target.value })
            }
          />
        </label>
        <label className="edit-field">
          <span>Pessimistic</span>
          <input
            type="text"
            value={values.pessimistic}
            disabled={disabled}
            className={fieldClassName(Boolean(errors.pessimistic))}
            aria-invalid={Boolean(errors.pessimistic)}
            onChange={(event) =>
              onChange({ ...values, pessimistic: event.target.value })
            }
          />
        </label>
      </div>
    </fieldset>
  );
}
