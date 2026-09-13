export const None = "None" as const;
// eslint-disable-next-line no-redeclare -- const and type share the None name by design
export type None = typeof None;

export type WorkPackageEstimateTriple = [string, string, string];

/** A 3-point duration triple, or the explicit `None` sentinel (YAML/IPC `"unknown"`). */
export type WorkPackageEstimate = WorkPackageEstimateTriple | None;

/** Estimate as sent over Tauri IPC and stored in YAML. */
export type WorkPackageEstimateWire = WorkPackageEstimateTriple | "unknown";

export interface EstimateFieldValues {
  optimistic: string;
  likely: string;
  pessimistic: string;
}

export interface EstimateFieldErrors {
  optimistic?: string;
  likely?: string;
  pessimistic?: string;
  order?: string;
  units?: string;
}

export type EstimateValidationResult =
  | { ok: true; estimate: WorkPackageEstimate; errors: EstimateFieldErrors }
  | { ok: false; errors: EstimateFieldErrors };

export interface ParsedDuration {
  amount: number;
  unit: "h" | "d" | "w";
  normalized: string;
}

/** Compact form after trim: no internal whitespace. */
const DURATION_PATTERN = /^(\d+(?:\.\d)?)([hdw])$/i;
const ZERO_DURATION_PATTERN = /^0+(?:\.0+)?[hdw]?$/i;

const FORMAT_HINT = "Use a duration like 1w, 2d, or 8h.";
const ZERO_HINT = "Duration must be greater than zero.";
const UNIT_HINT =
  "Estimate values must use the same duration suffix (h, d, or w).";
const ORDER_HINT =
  "Estimates must be ordered: optimistic ≤ likely ≤ pessimistic.";

/**
 * Parses a duration token such as `1w`, `2.5d`, or `8h`.
 * Trims leading/trailing whitespace; rejects internal whitespace.
 * @param token - Duration string.
 * @returns Parsed token, or null when invalid.
 */
export function parseDurationToken(token: string): ParsedDuration | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  const match = DURATION_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  if (unit !== "h" && unit !== "d" && unit !== "w") {
    return null;
  }
  return {
    amount,
    unit,
    normalized: `${match[1]}${unit}`,
  };
}

/**
 * Normalizes a duration token to lowercase compact form (e.g. `1W` → `1w`).
 * Trims leading/trailing whitespace; rejects internal whitespace.
 * @param token - Duration string.
 * @returns Normalized token, or null when invalid.
 */
export function normalizeDurationToken(token: string): string | null {
  return parseDurationToken(token)?.normalized ?? null;
}

/**
 * Field error for an already-trimmed duration token, or null when valid/empty.
 * @param trimmed - Field value with edges already trimmed.
 * @returns Error message for this field alone.
 */
function durationFieldErrorTrimmed(trimmed: string): string | null {
  if (!trimmed) {
    return null;
  }
  if (ZERO_DURATION_PATTERN.test(trimmed)) {
    return ZERO_HINT;
  }
  if (!parseDurationToken(trimmed)) {
    return FORMAT_HINT;
  }
  return null;
}

/**
 * Returns a field-level error for a single duration token, or null when valid/empty.
 * Trims leading/trailing whitespace; internal whitespace is invalid.
 * @param raw - Raw field value.
 * @returns Error message for this field alone.
 */
export function durationFieldError(raw: string): string | null {
  return durationFieldErrorTrimmed(raw.trim());
}

/**
 * Validates an optimistic / likely / pessimistic estimate triple from the GUI.
 * Trims leading/trailing whitespace on each field; rejects internal whitespace.
 * All empty yields `None`; any filled requires all three and ordered amounts.
 * @param values - Field values from the form.
 * @returns Validation result with normalized estimate or field errors.
 */
export function validateWorkPackageEstimate(
  values: EstimateFieldValues,
): EstimateValidationResult {
  const optimisticRaw = values.optimistic.trim();
  const likelyRaw = values.likely.trim();
  const pessimisticRaw = values.pessimistic.trim();
  const anyFilled = Boolean(optimisticRaw || likelyRaw || pessimisticRaw);

  if (!anyFilled) {
    return { ok: true, estimate: None, errors: {} };
  }

  const errors: EstimateFieldErrors = {};

  const optimistic = parseDurationToken(optimisticRaw);
  const likely = parseDurationToken(likelyRaw);
  const pessimistic = parseDurationToken(pessimisticRaw);

  if (!optimisticRaw) {
    errors.optimistic = "Required when any estimate is set.";
  } else {
    const fieldError = durationFieldErrorTrimmed(optimisticRaw);
    if (fieldError) {
      errors.optimistic = fieldError;
    }
  }

  if (!likelyRaw) {
    errors.likely = "Required when any estimate is set.";
  } else {
    const fieldError = durationFieldErrorTrimmed(likelyRaw);
    if (fieldError) {
      errors.likely = fieldError;
    }
  }

  if (!pessimisticRaw) {
    errors.pessimistic = "Required when any estimate is set.";
  } else {
    const fieldError = durationFieldErrorTrimmed(pessimisticRaw);
    if (fieldError) {
      errors.pessimistic = fieldError;
    }
  }

  if (optimistic && likely && pessimistic) {
    if (
      optimistic.unit !== likely.unit ||
      likely.unit !== pessimistic.unit
    ) {
      errors.units = UNIT_HINT;
      errors.optimistic = errors.optimistic ?? UNIT_HINT;
      errors.likely = errors.likely ?? UNIT_HINT;
      errors.pessimistic = errors.pessimistic ?? UNIT_HINT;
    } else if (
      !(optimistic.amount <= likely.amount && likely.amount <= pessimistic.amount)
    ) {
      errors.order = ORDER_HINT;
      errors.optimistic = errors.optimistic ?? ORDER_HINT;
      errors.likely = errors.likely ?? ORDER_HINT;
      errors.pessimistic = errors.pessimistic ?? ORDER_HINT;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    estimate: [optimistic!.normalized, likely!.normalized, pessimistic!.normalized],
    errors: {},
  };
}

/**
 * Converts a stored estimate into form field values.
 * @param estimate - Triple or `None`.
 * @returns Empty strings when the estimate is `None`.
 */
export function estimateToFieldValues(
  estimate: WorkPackageEstimate,
): EstimateFieldValues {
  if (estimate === None) {
    return { optimistic: "", likely: "", pessimistic: "" };
  }
  return {
    optimistic: estimate[0],
    likely: estimate[1],
    pessimistic: estimate[2],
  };
}

/**
 * Returns whether two estimates are equal.
 * @param left - First estimate.
 * @param right - Second estimate.
 * @returns Whether both sides match.
 */
export function sameEstimate(
  left: WorkPackageEstimate,
  right: WorkPackageEstimate,
): boolean {
  if (left === None && right === None) {
    return true;
  }
  if (left === None || right === None) {
    return false;
  }
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

/**
 * Maps a domain estimate to the IPC/YAML wire value.
 * @param estimate - Triple or `None`.
 * @returns Triple or `"unknown"`.
 */
export function toEstimateWire(
  estimate: WorkPackageEstimate,
): WorkPackageEstimateWire {
  return estimate === None ? "unknown" : estimate;
}

/**
 * Maps an IPC/YAML wire value to the domain estimate.
 * @param value - Triple or `"unknown"`.
 * @returns Triple or `None`.
 */
export function fromEstimateWire(
  value: WorkPackageEstimateWire,
): WorkPackageEstimate {
  return value === "unknown" ? None : value;
}
