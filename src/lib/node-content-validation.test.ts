import { describe, expect, it } from "vitest";
import {
  hasBlockingErrors,
  slugify,
  validateNodeMarkdown,
  type ContentValidationContext,
} from "./node-content-validation";

const goalContext: ContentValidationContext = {
  nodeType: "goal",
  expectedSlug: "reduce-churn",
};

describe("slugify", () => {
  it("kebab-cases heading text", () => {
    expect(slugify("Reduce churn")).toBe("reduce-churn");
    expect(slugify("  GA Release!  ")).toBe("ga-release");
  });
});

describe("validateNodeMarkdown", () => {
  it("flags empty content as an error", () => {
    const diagnostics = validateNodeMarkdown("   \n  ", goalContext);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
    expect(hasBlockingErrors(diagnostics)).toBe(true);
  });

  it("requires the first line to be an H1", () => {
    const diagnostics = validateNodeMarkdown("Reduce churn\n\nBody", goalContext);
    const error = diagnostics.find((d) => d.severity === "error");
    expect(error).toBeDefined();
    expect(error?.message).toContain("level-1 heading");
    expect(error?.from).toBe(0);
  });

  it("treats a leading ## as a missing H1 error", () => {
    const diagnostics = validateNodeMarkdown("## Metric\n\nBody", goalContext);
    expect(hasBlockingErrors(diagnostics)).toBe(true);
  });

  it("accepts a valid matching H1 with arbitrary sections", () => {
    const markdown =
      "# Reduce churn\n\nIntro\n\n## Introduction\n\nText\n\n## Motivation\n\nText";
    const diagnostics = validateNodeMarkdown(markdown, goalContext);
    expect(diagnostics).toHaveLength(0);
    expect(hasBlockingErrors(diagnostics)).toBe(false);
  });

  it("does not warn about section headings", () => {
    const markdown =
      "# Billing redesign\n\nBody\n\n## Introduction\n\n## Motivation\n\n## Detailed Description\n\n## Dependencies";
    const diagnostics = validateNodeMarkdown(markdown, {
      nodeType: "project",
      expectedSlug: "billing-redesign",
    });
    expect(diagnostics).toHaveLength(0);
  });

  it("warns when the H1 does not match the node id", () => {
    const diagnostics = validateNodeMarkdown("# Something else\n\nBody", goalContext);
    const warning = diagnostics.find((d) => d.severity === "warning");
    expect(warning).toBeDefined();
    expect(warning?.message).toContain("doesn't match the node id");
    expect(hasBlockingErrors(diagnostics)).toBe(false);
  });

  it("flags malformed and empty links as warnings", () => {
    const missingClose = validateNodeMarkdown("# Reduce churn\n\n[text](http", goalContext);
    expect(
      missingClose.some((d) => d.message.includes("missing a closing parenthesis")),
    ).toBe(true);

    const emptyUrl = validateNodeMarkdown("# Reduce churn\n\n[text]()", goalContext);
    expect(emptyUrl.some((d) => d.message.includes("empty URL"))).toBe(true);
  });

  it("returns diagnostics ordered by position", () => {
    const markdown = "# Something else\n\n## Bogus\n\nBody";
    const diagnostics = validateNodeMarkdown(markdown, goalContext);
    const offsets = diagnostics.map((d) => d.from);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });
});
