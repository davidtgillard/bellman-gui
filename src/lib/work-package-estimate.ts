export type WorkPackageEstimate = [string, string, string];

export interface EstimateFieldValues {
  optimistic: string;
  likely: string;
  pessimistic: string;
}

export interface EstimateValidationResult {
  ok: boolean;
  estimate: WorkPackageEstimate | null;
  errors: {
    optimistic?: string;
    likely?: string;
    pessimistic?: string;
    order?: string;
    units?: string;
  };
}

export interface ParsedDuration {
  amount: number;
  unit: "h" | "d" | "w";
  normalized: string;
}

const DURATION_PATTERN = /^(\d+(?:\.\d)?)\s*([hdw])$/i;
const ZERO_DURATION_PATTERN = /^0+(?:\.0+)?\s*[hdw]?$/i;

const FORMAT_HINT = "Use a duration like 1w, 2d, or 8h.";
const ZERO_HINT = "Duration must be greater than zero.";
const UNIT_HINT =
  "Estimate values must use the same duration suffix (h, d, or w).";
const ORDER_HINT =
  "Estimates must be ordered: optimistic ≤ likely ≤ pessimistic.";

/**
 * Parses a duration token such as `1w`, `2.5d`, or `8h` into amount and unit.
 * @param token - Raw duration string.
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
 * Normalizes a duration token to lowercase with no spaces (e.g. `1W` → `1w`).
 * @param token - Raw duration string.
 * @returns Normalized token, or null when invalid.
 */
export function normalizeDurationToken(token: string): string | null {
  return parseDurationToken(token)?.normalized ?? null;
}

/**
 * Returns a field-level error for a single duration token, or null when valid/empty.
 * @param raw - Raw field value.
 * @returns Error message for this field alone.
 */
export function durationFieldError(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (ZERO_DURATION_PATTERN.test(trimmed)) {
    return ZERO_HINT;
  }
  if (!normalizeDurationToken(trimmed)) {
    return FORMAT_HINT;
  }
  return null;
}

/**
 * Validates an optimistic / likely / pessimistic estimate triple.
 * All empty omits the estimate; any filled requires all three and ordered amounts.
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
    return { ok: true, estimate: null, errors: {} };
  }

  const errors: EstimateValidationResult["errors"] = {};

  const optimistic = parseDurationToken(optimisticRaw);
  const likely = parseDurationToken(likelyRaw);
  const pessimistic = parseDurationToken(pessimisticRaw);

  if (!optimisticRaw) {
    errors.optimistic = "Required when any estimate is set.";
  } else {
    const fieldError = durationFieldError(optimisticRaw);
    if (fieldError) {
      errors.optimistic = fieldError;
    }
  }

  if (!likelyRaw) {
    errors.likely = "Required when any estimate is set.";
  } else {
    const fieldError = durationFieldError(likelyRaw);
    if (fieldError) {
      errors.likely = fieldError;
    }
  }

  if (!pessimisticRaw) {
    errors.pessimistic = "Required when any estimate is set.";
  } else {
    const fieldError = durationFieldError(pessimisticRaw);
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
    return { ok: false, estimate: null, errors };
  }

  return {
    ok: true,
    estimate: [optimistic!.normalized, likely!.normalized, pessimistic!.normalized],
    errors: {},
  };
}

/**
 * Converts a stored estimate array into form field values.
 * @param estimate - Triple from the DTO, or null/undefined when absent.
 * @returns Empty strings when no estimate is present.
 */
export function estimateToFieldValues(
  estimate: WorkPackageEstimate | null | undefined,
): EstimateFieldValues {
  if (!estimate) {
    return { optimistic: "", likely: "", pessimistic: "" };
  }
  return {
    optimistic: estimate[0] ?? "",
    likely: estimate[1] ?? "",
    pessimistic: estimate[2] ?? "",
  };
}

/**
 * Returns whether two estimate triples are equal (including both null).
 * @param left - First estimate.
 * @param right - Second estimate.
 * @returns Whether both sides match.
 */
export function sameEstimate(
  left: WorkPackageEstimate | null | undefined,
  right: WorkPackageEstimate | null | undefined,
): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}
