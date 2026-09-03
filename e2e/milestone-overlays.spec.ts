import type { Page } from "@playwright/test";
import {
  expect,
  getGraphZoom,
  setGraphZoom,
  setupPage,
  test,
  waitForGraph,
  type Scenario,
} from "./support/fixtures";

const GOAL = { id: "goal/reduce-churn", type: "goal" };
const MILESTONE = { id: "milestone/ga", type: "milestone" };

/** Matches `GRAPH_NODE_LABEL_TYPOGRAPHY.fontSizePx` and `.milestone-overlay-title`. */
const MILESTONE_TITLE_FONT_SIZE_PX = 11;

function milestoneScenario(): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [GOAL, MILESTONE],
        links: [],
        link_types: [],
        label: null,
      },
    ],
    index: 0,
  };
}

async function milestoneTitleFontSizePx(page: Page): Promise<number> {
  const title = page.locator(".milestone-overlay-title").first();
  await expect(title).toBeVisible();
  return title.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
}

test.describe("milestone overlays", () => {
  test("milestone labels scale with graph zoom like other node labels", async ({ page }) => {
    await setupPage(page, milestoneScenario());
    await waitForGraph(page);

    const title = page.locator(".milestone-overlay-title").first();
    await expect(title).toBeVisible();
    await expect(title).toHaveText("ga");

    await setGraphZoom(page, 0.5);
    await expect.poll(async () => getGraphZoom(page)).toBeCloseTo(0.5, 5);
    await expect
      .poll(async () => milestoneTitleFontSizePx(page))
      .toBeCloseTo(MILESTONE_TITLE_FONT_SIZE_PX * 0.5, 0);

    await setGraphZoom(page, 2);
    await expect.poll(async () => getGraphZoom(page)).toBeCloseTo(2, 5);
    await expect
      .poll(async () => milestoneTitleFontSizePx(page))
      .toBeCloseTo(MILESTONE_TITLE_FONT_SIZE_PX * 2, 0);
  });
});
