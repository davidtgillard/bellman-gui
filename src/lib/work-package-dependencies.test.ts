import { describe, expect, it } from "vitest";
import { overflowNodeId } from "./work-package-view";
import {
  eligibleDependencyNodeIds,
  selectedDependencyNodeIds,
  toggleDependency,
  unselectedDependencyOptions,
} from "./work-package-dependencies";

const ORIGIN = "project/billing-redesign/wp-invoicing";
const PDF = "project/billing-redesign/wp-pdf-export";
const CREDITS = "project/billing-redesign/wp-credits";
const OVERFLOW = overflowNodeId(ORIGIN);

describe("toggleDependency", () => {
  it("adds a missing title and removes an existing one", () => {
    expect(toggleDependency([], "wp-pdf-export")).toEqual(["wp-pdf-export"]);
    expect(toggleDependency(["wp-pdf-export"], "wp-pdf-export")).toEqual([]);
  });

  it("ignores a toggle of the origin title", () => {
    expect(toggleDependency(["wp-pdf-export"], "wp-invoicing", "wp-invoicing")).toEqual(
      ["wp-pdf-export"],
    );
  });
});

describe("eligibleDependencyNodeIds", () => {
  it("returns other work packages whose titles are available", () => {
    expect(
      eligibleDependencyNodeIds({
        originId: ORIGIN,
        availableTitles: ["wp-invoicing", "wp-pdf-export", "wp-credits"],
        nodes: [
          { id: ORIGIN, type: "work_package" },
          { id: PDF, type: "work_package" },
          { id: CREDITS, type: "work_package" },
        ],
      }),
    ).toEqual([PDF, CREDITS]);
  });

  it("excludes the origin, overflow nodes, and non-work-packages", () => {
    expect(
      eligibleDependencyNodeIds({
        originId: ORIGIN,
        availableTitles: ["wp-invoicing", "wp-pdf-export", "wp-credits"],
        nodes: [
          { id: ORIGIN, type: "work_package" },
          { id: OVERFLOW, type: "work_package" },
          { id: "goal/reduce-churn", type: "goal" },
          { id: PDF, type: "work_package" },
        ],
      }),
    ).toEqual([PDF]);
  });
});

describe("selectedDependencyNodeIds", () => {
  it("maps selected titles onto visible node ids", () => {
    expect(
      selectedDependencyNodeIds(["wp-pdf-export", "wp-missing"], [
        { id: ORIGIN, type: "work_package" },
        { id: PDF, type: "work_package" },
        { id: OVERFLOW, type: "work_package" },
      ]),
    ).toEqual([PDF]);
  });
});

describe("unselectedDependencyOptions", () => {
  it("omits selected titles and filters by substring", () => {
    expect(
      unselectedDependencyOptions(
        ["wp-pdf-export", "wp-credits", "wp-ledger"],
        ["wp-credits"],
        "PDF",
      ),
    ).toEqual(["wp-pdf-export"]);
  });
});
