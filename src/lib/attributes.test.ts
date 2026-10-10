import { describe, expect, it } from "vitest";
import goalJsonc from "../fixtures/example-roadmap/attributes/goal.jsonc?raw";
import priorityJsonc from "../fixtures/example-roadmap/attributes/priority.jsonc?raw";
import programJsonc from "../fixtures/example-roadmap/attributes/program.jsonc?raw";
import billing from "../fixtures/example-roadmap/projects/billing-redesign/billing-redesign.md?raw";
import {
  definitionsForNode,
  issueMentionsAttribute,
  joinMarkdown,
  openScalarKind,
  parseAttributeDefinition,
  splitClassifications,
  validateAssignments,
  valueLabel,
  visibleAssignments,
  withLegalPins,
  type AttributeDefinition,
} from "./attributes";

const catalog = [priorityJsonc, programJsonc, goalJsonc]
  .map((text) => parseAttributeDefinition(text))
  .filter((item): item is AttributeDefinition => item !== null);

describe("attribute definitions and classifications", () => {
  it("loads the example catalog", () => {
    expect(catalog.map((item) => item.name)).toEqual(["priority", "program", "goal"]);
    expect(catalog[0]?.required).toBe(true);
    expect(catalog[1]?.assignmentSchema).toBeTruthy();
  });

  it("splits classifications out of project markdown", () => {
    const split = splitClassifications(billing);
    expect(split.body).not.toContain("Classifications");
    expect(split.assignments.map((item) => item.name)).toEqual([
      "priority",
      "program",
      "goal",
    ]);
    expect(split.assignments[1]?.payload).toEqual({ allocation: 0.5 });
    expect(split.assignments[1]?.pinnedVersion).toBe("1.0");
    expect(valueLabel(catalog[2], "reduce-churn")).toBe("Reduce Churn");
  });

  it("rejects a missing required priority and an out-of-range allocation", () => {
    const missing = validateAssignments("project", catalog, []);
    expect(missing.some((error) => error.message.includes("priority"))).toBe(true);

    const bad = validateAssignments("project", catalog, [
      { name: "priority", value: "P1", payload: {}, pinnedVersion: null },
      {
        name: "program",
        value: "platform-v2",
        payload: { allocation: 2 },
        pinnedVersion: null,
      },
    ]);
    expect(bad.some((error) => error.message.includes("allocation"))).toBe(true);
  });

  it("drops illegal pins on rewrite and keeps a still-legal pin", () => {
    const split = splitClassifications(billing);
    const dropped = withLegalPins(
      split.assignments.map((item) =>
        item.name === "program" ? { ...item, pinnedVersion: "2.0" } : item,
      ),
      catalog,
    );
    expect(dropped.find((item) => item.name === "program")?.pinnedVersion).toBeNull();
    const kept = withLegalPins(split.assignments, catalog);
    expect(kept.find((item) => item.name === "program")?.pinnedVersion).toBe("1.0");
  });

  it("round-trips a legal assignment including a still-valid pin", () => {
    const split = splitClassifications(billing);
    expect(validateAssignments("project", catalog, split.assignments)).toEqual([]);
    const joined = joinMarkdown(split.body, split.assignments, catalog);
    expect(joined).toContain("- program@1.0: platform-v2 [allocation: 0.5]");
    expect(joined).toContain("- goal: reduce-churn");
  });

  it("maps quoted bellman messages onto an attribute", () => {
    expect(
      issueMentionsAttribute("initiative 'alpha': missing required attribute 'priority'", "priority"),
    ).toBe(true);
    expect(issueMentionsAttribute("missing required attribute priority", "priority")).toBe(true);
    expect(issueMentionsAttribute("no P0 initiatives", "priority")).toBe(false);
  });

  it("hides open object attributes on markdown kinds", () => {
    const openObject = parseAttributeDefinition(`{
      "name": "budget",
      "version": "1.0",
      "applies_to": ["project", "work_package"],
      "cardinality": "one",
      "required": true,
      "value_schema": {
        "type": "object",
        "properties": { "amount": { "type": "number" } }
      }
    }`);
    expect(openObject).not.toBeNull();
    const withBudget = [...catalog, openObject!];
    expect(definitionsForNode(withBudget, "project").map((item) => item.name)).not.toContain("budget");
    expect(definitionsForNode(withBudget, "work_package").map((item) => item.name)).toContain("budget");
    expect(
      visibleAssignments("project", withBudget, [
        { name: "budget", value: { amount: 12 }, payload: {}, pinnedVersion: null },
      ]),
    ).toEqual([]);
  });

  it("treats an empty open value schema as a string field", () => {
    const definition = parseAttributeDefinition(`{
      "name": "objective",
      "version": "1.0",
      "applies_to": ["initiative", "project"],
      "cardinality": "many",
      "value_schema": {},
      "assignment_schema": { "type": "string" }
    }`);
    expect(definition).not.toBeNull();
    expect(openScalarKind(definition!)).toBe("string");
  });
});
