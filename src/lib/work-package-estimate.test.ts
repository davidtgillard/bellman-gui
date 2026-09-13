import { describe, expect, it } from "vitest";
import {
  durationFieldError,
  estimateToFieldValues,
  fromEstimateWire,
  None,
  parseDurationToken,
  sameEstimate,
  toEstimateWire,
  validateWorkPackageEstimate,
} from "./work-package-estimate";

describe("work-package-estimate", () => {
  it("parses compact duration tokens into amount and unit", () => {
    expect(parseDurationToken("1h")).toEqual({
      amount: 1,
      unit: "h",
      normalized: "1h",
    });
    expect(parseDurationToken("1d")).toEqual({
      amount: 1,
      unit: "d",
      normalized: "1d",
    });
    expect(parseDurationToken("1w")).toEqual({
      amount: 1,
      unit: "w",
      normalized: "1w",
    });
    expect(parseDurationToken("2.5d")).toEqual({
      amount: 2.5,
      unit: "d",
      normalized: "2.5d",
    });
    expect(parseDurationToken("8H")?.normalized).toBe("8h");
    expect(parseDurationToken("1w ")?.normalized).toBe("1w");
    expect(parseDurationToken("  1w  ")?.normalized).toBe("1w");
    expect(parseDurationToken(" 1w")?.normalized).toBe("1w");
    expect(parseDurationToken("\t1w")?.normalized).toBe("1w");
    expect(parseDurationToken("bad")).toBeNull();
    expect(parseDurationToken("0")).toBeNull();
    expect(parseDurationToken("0w")).toBeNull();
    expect(parseDurationToken("1e2w")).toBeNull();
    expect(parseDurationToken("1.w")).toBeNull();
    expect(parseDurationToken(".5w")).toBeNull();
    expect(parseDurationToken("2.50d")).toBeNull();
  });

  it("rejects internal whitespace in duration tokens", () => {
    expect(parseDurationToken("1 w")).toBeNull();
    expect(parseDurationToken("1    d")).toBeNull();
    expect(parseDurationToken("5  w")).toBeNull();
    expect(parseDurationToken("1\td")).toBeNull();
  });

  it("maps an empty estimate to None", () => {
    const result = validateWorkPackageEstimate({
      optimistic: "",
      likely: "",
      pessimistic: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.estimate).toBe(None);
    }
  });

  it("requires all three values when any is filled", () => {
    const result = validateWorkPackageEstimate({
      optimistic: "1w",
      likely: "",
      pessimistic: "",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.likely).toBeTruthy();
    expect(result.errors.pessimistic).toBeTruthy();
  });

  it("rejects invalid tokens, zero, and unordered triples", () => {
    expect(
      validateWorkPackageEstimate({
        optimistic: "1x",
        likely: "2w",
        pessimistic: "4w",
      }).ok,
    ).toBe(false);

    const zero = validateWorkPackageEstimate({
      optimistic: "0",
      likely: "1w",
      pessimistic: "2w",
    });
    expect(zero.ok).toBe(false);
    expect(zero.errors.optimistic).toMatch(/greater than zero/i);

    const zeroUnit = validateWorkPackageEstimate({
      optimistic: "0w",
      likely: "1w",
      pessimistic: "2w",
    });
    expect(zeroUnit.ok).toBe(false);
    expect(zeroUnit.errors.optimistic).toMatch(/greater than zero/i);

    const mixedUnits = validateWorkPackageEstimate({
      optimistic: "1w",
      likely: "2d",
      pessimistic: "4w",
    });
    expect(mixedUnits.ok).toBe(false);
    expect(mixedUnits.errors.units).toMatch(/same duration suffix/i);
    expect(mixedUnits.errors.optimistic).toBeTruthy();
    expect(mixedUnits.errors.likely).toBeTruthy();
    expect(mixedUnits.errors.pessimistic).toBeTruthy();

    const unordered = validateWorkPackageEstimate({
      optimistic: "4w",
      likely: "2w",
      pessimistic: "1w",
    });
    expect(unordered.ok).toBe(false);
    expect(unordered.errors.order).toMatch(/optimistic/i);
    expect(unordered.errors.optimistic).toBeTruthy();
    expect(unordered.errors.likely).toBeTruthy();
    expect(unordered.errors.pessimistic).toBeTruthy();
  });

  it("trims leading and trailing whitespace and rejects internal whitespace", () => {
    expect(durationFieldError("  1w  ")).toBeNull();
    expect(durationFieldError("1 w")).toMatch(/1w, 2d, or 8h/);
    expect(durationFieldError("1    d")).toMatch(/1w, 2d, or 8h/);
    expect(durationFieldError("5  w")).toMatch(/1w, 2d, or 8h/);

    const padded = validateWorkPackageEstimate({
      optimistic: "  1w  ",
      likely: " 2w ",
      pessimistic: "4w",
    });
    expect(padded.ok).toBe(true);
    if (padded.ok) {
      expect(padded.estimate).toEqual(["1w", "2w", "4w"]);
    }

    const internal = validateWorkPackageEstimate({
      optimistic: "1 w",
      likely: "2w",
      pessimistic: "4w",
    });
    expect(internal.ok).toBe(false);
    expect(internal.errors.optimistic).toMatch(/1w, 2d, or 8h/);
  });

  it("reports duration field errors while typing", () => {
    expect(durationFieldError("")).toBeNull();
    expect(durationFieldError("0")).toMatch(/greater than zero/i);
    expect(durationFieldError("0d")).toMatch(/greater than zero/i);
    expect(durationFieldError("1x")).toMatch(/1w, 2d, or 8h/);
    expect(durationFieldError("1w")).toBeNull();
  });

  it("normalizes a valid ordered triple", () => {
    const result = validateWorkPackageEstimate({
      optimistic: "1W",
      likely: "2w",
      pessimistic: "4w",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.estimate).toEqual(["1w", "2w", "4w"]);
    }
  });

  it("converts estimates to field values", () => {
    expect(estimateToFieldValues(None)).toEqual({
      optimistic: "",
      likely: "",
      pessimistic: "",
    });
    expect(estimateToFieldValues(["1w", "2w", "4w"])).toEqual({
      optimistic: "1w",
      likely: "2w",
      pessimistic: "4w",
    });
  });

  it("compares estimate triples", () => {
    expect(sameEstimate(None, None)).toBe(true);
    expect(sameEstimate(["1w", "2w", "4w"], ["1w", "2w", "4w"])).toBe(true);
    expect(sameEstimate(["1w", "2w", "4w"], None)).toBe(false);
  });

  it("round-trips None through the IPC wire sentinel", () => {
    expect(toEstimateWire(None)).toBe("unknown");
    expect(fromEstimateWire("unknown")).toBe(None);
    expect(toEstimateWire(["1w", "2w", "4w"])).toEqual(["1w", "2w", "4w"]);
    expect(fromEstimateWire(["1w", "2w", "4w"])).toEqual(["1w", "2w", "4w"]);
  });
});
