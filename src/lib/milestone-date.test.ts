import { describe, expect, it } from "vitest";
import { parseMilestoneDate } from "./milestone-date";

describe("parseMilestoneDate", () => {
  it("reads an ISO date under ## Date", () => {
    expect(
      parseMilestoneDate("# GA Release\n\n## Date\n\n2026-09-30\n\n## Description\n\nShip it."),
    ).toBe("2026-09-30");
  });

  it("returns the first non-empty line when not ISO", () => {
    expect(parseMilestoneDate("## Date\n\nQ3 2026\n")).toBe("Q3 2026");
  });

  it("extracts ISO from a longer line", () => {
    expect(parseMilestoneDate("## Date\n\nTarget: 2026-09-30 (GA)\n")).toBe("2026-09-30");
  });

  it("returns null when Date section is missing", () => {
    expect(parseMilestoneDate("# GA Release\n\n## Description\n\nShip it.")).toBeNull();
  });

  it("returns null when Date section is empty", () => {
    expect(parseMilestoneDate("# GA\n\n## Date\n\n## Description\n\nBody")).toBeNull();
  });

  it("stops at the next heading", () => {
    expect(
      parseMilestoneDate("## Date\n\n2026-01-01\n\n## Other\n\n2027-01-01"),
    ).toBe("2026-01-01");
  });
});
