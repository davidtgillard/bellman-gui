import {
  expect,
  reloadApp,
  seedPersistedUndo,
  setupPage,
  test,
  type RoadmapState,
  type Scenario,
} from "./support/fixtures";

const PROJECT = { id: "project--billing", type: "project" };
const GOAL = { id: "goal--reduce-churn", type: "goal" };
const MILESTONE = { id: "milestone--ga", type: "milestone" };
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

    const undoButton = page.getByTestId("undo-button");
    const legend = page.getByRole("complementary", { name: "Node types" });

    await expect(legend.getByText("Milestone")).toBeVisible();
    await expect(undoButton).toBeEnabled();
    await expect(undoButton).toHaveAttribute("title", "Undo: create milestone ga");

    await reloadApp(page, milestoneScenario());

    await expect(legend.getByText("Milestone")).toBeVisible();
    await expect(undoButton).toBeEnabled();
    await expect(undoButton).toHaveAttribute("title", "Undo: create milestone ga");

    await undoButton.click();
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

    const undoButton = page.getByTestId("undo-button");
    const redoButton = page.getByTestId("redo-button");
    const legend = page.getByRole("complementary", { name: "Node types" });

    await expect(legend.getByText("Milestone")).toHaveCount(0);
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();
  });

  test("history is not persisted when persistUndo is disabled", async ({ page }) => {
    const scenario = milestoneScenario();
    delete scenario.persistUndo;
    await setupPage(page, scenario);

    const undoButton = page.getByTestId("undo-button");
    await expect(undoButton).toBeEnabled();

    await reloadApp(page, baseScenario());

    await expect(undoButton).toBeDisabled();
  });
});
