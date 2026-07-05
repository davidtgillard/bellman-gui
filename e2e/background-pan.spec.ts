import {
  dragGraphBackground,
  expect,
  getGraphPan,
  isGraphBackgroundPanEnabled,
  setupPage,
  test,
  waitForGraph,
  waitForSettingsApplied,
  type Scenario,
} from "./support/fixtures";

const PROJECT = { id: "project--billing", type: "project" };
const GOAL = { id: "goal--reduce-churn", type: "goal" };

function graphScenario(settings?: Scenario["settings"]): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [PROJECT, GOAL],
        links: [],
        link_types: [],
        label: null,
      },
    ],
    index: 0,
    settings,
  };
}

test.describe("background pan", () => {
  test("dragging the canvas is disabled by default", async ({ page }) => {
    await setupPage(page, graphScenario());
    await waitForGraph(page);

    const before = await getGraphPan(page);
    await dragGraphBackground(page);
    const after = await getGraphPan(page);

    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
  });

  test("background pan can be enabled in global settings", async ({ page }) => {
    await setupPage(
      page,
      graphScenario({ background_pan_enabled: true }),
    );
    await waitForGraph(page);
    await waitForSettingsApplied(page, () => isGraphBackgroundPanEnabled(page));

    const before = await getGraphPan(page);
    await dragGraphBackground(page);
    const after = await getGraphPan(page);

    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(
      20,
    );
  });
});