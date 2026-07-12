import {
  expect,
  reloadApp,
  seedPersistedUndo,
  setupPage,
  test,
  waitForUndoReady,
  type RoadmapState,
  type Scenario,
} from "./support/fixtures";

const PROJECT = { id: "project/billing", type: "project" };
const GOAL = { id: "goal/reduce-churn", type: "goal" };
const MILESTONE = { id: "milestone/ga", type: "milestone" };
const ROADMAP_ROOT = "/roadmap";

/** Scenario with one undoable edit: adding a milestone on top of a base graph. */
function milestoneScenario(): Scenario {
  const base: RoadmapState = {
    root: ROADMAP_ROOT,
    editable: true,
    nodes: [PROJECT, GOAL],
    links: [],
    link_types: [],
    label: null,
  };
  const withMilestone: RoadmapState = {
    ...base,
    nodes: [PROJECT, GOAL, MILESTONE],
    label: "create milestone ga",
  };
  return { states: [base, withMilestone], index: 1, persistUndo: true };
}

/** Scenario representing the base graph only (no undo history). */
function baseScenario(): Scenario {
  return {
    states: [
      {
        root: ROADMAP_ROOT,
        editable: true,
        nodes: [PROJECT, GOAL],
        links: [],
        link_types: [],
        label: null,
      },
    ],
    index: 0,
    persistUndo: true,
  };
}

test.describe("undo persistence", () => {
  test("history survives a simulated app restart", async ({ page }) => {
    await setupPage(page, milestoneScenario());

    const legend = page.getByRole("complementary", { name: "Node types" });

    await expect(legend.getByText("Milestone")).toBeVisible();

    await reloadApp(page, milestoneScenario());

    await expect(legend.getByText("Milestone")).toBeVisible();

    await waitForUndoReady(page);
    await page.keyboard.press("Control+z");
    await expect(legend.getByText("Milestone")).toHaveCount(0);
    await expect(legend.getByText("Goal")).toBeVisible();
  });

  test("stale persisted history is cleared when the graph no longer matches", async ({
    page,
  }) => {
    const base: RoadmapState = {
      root: ROADMAP_ROOT,
      editable: true,
      nodes: [PROJECT, GOAL],
      links: [],
      link_types: [],
      label: null,
    };
    const withMilestone: RoadmapState = {
      ...base,
      nodes: [PROJECT, GOAL, MILESTONE],
      label: "create milestone ga",
    };

    await seedPersistedUndo(page, ROADMAP_ROOT, {
      states: [base, withMilestone],
      index: 1,
    });
    await setupPage(page, baseScenario());

    const legend = page.getByRole("complementary", { name: "Node types" });

    await expect(legend.getByText("Milestone")).toHaveCount(0);

    await page.keyboard.press("Control+z");
    await expect(legend.getByText("Milestone")).toHaveCount(0);
  });

  test("history is not persisted when persistUndo is disabled", async ({ page }) => {
    const scenario = milestoneScenario();
    delete scenario.persistUndo;
    await setupPage(page, scenario);

    const legend = page.getByRole("complementary", { name: "Node types" });
    await expect(legend.getByText("Milestone")).toBeVisible();

    await reloadApp(page, baseScenario());

    await expect(legend.getByText("Milestone")).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(legend.getByText("Milestone")).toHaveCount(0);
  });
});
