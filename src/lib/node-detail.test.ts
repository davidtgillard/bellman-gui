import { describe, expect, it } from "vitest";
import { workPackageDetailFromDto } from "./node-detail";
import { None } from "./work-package-estimate";

describe("workPackageDetailFromDto", () => {
  it("maps a leaf unknown estimate to None", () => {
    const detail = workPackageDetailFromDto({
      role: "leaf",
      project: "billing",
      title: "wp-one",
      description: "Do the thing.",
      dependencies: [],
      available_titles: ["wp-one"],
      estimate: "unknown",
    });
    expect(detail).toEqual({
      role: "leaf",
      project: "billing",
      title: "wp-one",
      description: "Do the thing.",
      dependencies: [],
      availableTitles: ["wp-one"],
      estimate: None,
    });
  });

  it("maps a leaf duration triple", () => {
    const detail = workPackageDetailFromDto({
      role: "leaf",
      project: "billing",
      title: "wp-one",
      description: "Do the thing.",
      dependencies: [],
      available_titles: ["wp-one"],
      estimate: ["1w", "2w", "4w"],
    });
    expect(detail.role).toBe("leaf");
    if (detail.role === "leaf") {
      expect(detail.estimate).toEqual(["1w", "2w", "4w"]);
    }
  });

  it("maps a parent without an estimate field", () => {
    const detail = workPackageDetailFromDto({
      role: "parent",
      project: "billing",
      title: "wp-parent",
      description: "Parent.",
      dependencies: [],
      available_titles: ["wp-parent", "wp-child"],
    });
    expect(detail).toEqual({
      role: "parent",
      project: "billing",
      title: "wp-parent",
      description: "Parent.",
      dependencies: [],
      availableTitles: ["wp-parent", "wp-child"],
    });
    expect(detail).not.toHaveProperty("estimate");
  });
});
