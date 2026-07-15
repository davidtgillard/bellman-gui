import { describe, expect, it } from "vitest";
import {
  clampSidebarWidth,
  legendFitsInDock,
  maxSidebarWidthForLegend,
} from "./graph-area-layout";

describe("clampSidebarWidth", () => {
  it("uses preferred when within bounds", () => {
    expect(clampSidebarWidth(520, 800, 320)).toBe(520);
  });

  it("caps at maxWidthPx", () => {
    expect(clampSidebarWidth(520, 400, 320)).toBe(400);
  });

  it("floors at minWidth when space allows", () => {
    expect(clampSidebarWidth(200, 800, 320)).toBe(320);
  });

  it("allows below minWidth when max is smaller", () => {
    expect(clampSidebarWidth(520, 200, 320)).toBe(200);
  });

  it("returns 0 when max is 0", () => {
    expect(clampSidebarWidth(520, 0, 320)).toBe(0);
  });
});

describe("maxSidebarWidthForLegend", () => {
  it("reserves legend footprint for the dock", () => {
    expect(maxSidebarWidthForLegend(1000, 200)).toBe(800);
  });

  it("never goes negative", () => {
    expect(maxSidebarWidthForLegend(150, 200)).toBe(0);
  });
});

describe("legendFitsInDock", () => {
  it("fits when dock is at least legend need", () => {
    expect(legendFitsInDock(200, 200)).toBe(true);
    expect(legendFitsInDock(250, 200)).toBe(true);
  });

  it("does not fit when dock is narrower", () => {
    expect(legendFitsInDock(199, 200)).toBe(false);
  });
});
