import { describe, expect, it } from "vitest";
import { validateWorkPackageName } from "./work-package-name";

describe("work-package-name", () => {
  it("validates work package names", () => {
    expect(validateWorkPackageName("")).toBeTruthy();
    expect(validateWorkPackageName("Not Valid")).toBeTruthy();
    expect(validateWorkPackageName("wp-ok")).toBeNull();
  });
});
