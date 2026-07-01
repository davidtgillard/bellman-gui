import {
  countCalls,
  emitEvent,
  expect,
  setupPage,
  test,
  type Scenario,
} from "./support/fixtures";

const PROJECT = { id: "project--billing", type: "project" };
const GOAL = { id: "goal--reduce-churn", type: "goal" };
const MILESTONE = { id: "milestone--ga", type: "milestone" };

/** Scenario with one undoable edit: adding a milestone on top of a base graph. */
function milestoneScenario(): Scenario {
  const base = {
    root: "/roadmap",
    editable: true,
    nodes: [PROJECT, GOAL],
    links: [],
    link_types: [],
    label: null as string | null,
  };
  const withMilestone = {
    ...base,
    nodes: [PROJECT, GOAL, MILESTONE],
    label: "create milestone ga",
  };
  return { states: [base, withMilestone], index: 1 };
}

/** Scenario with no history, so nothing can be undone. */
function emptyHistoryScenario(): Scenario {
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
  };
}

test.describe("undo/redo", () => {
  test("undo button reverts the graph and enables redo", async ({ page }) => {
    await setupPage(page, milestoneScenario());

    const undoButton = page.getByTestId("undo-button");
    const redoButton = page.getByTestId("redo-button");
    const legend = page.getByRole("complementary", { name: "Node types" });

    await expect(legend.getByText("Milestone")).toBeVisible();
    await expect(undoButton).toBeEnabled();
    await expect(redoButton).toBeDisabled();
    await expect(undoButton).toHaveAttribute("title", "Undo: create milestone ga");

    await undoButton.click();

    await expect(legend.getByText("Milestone")).toHaveCount(0);
    await expect(legend.getByText("Goal")).toBeVisible();
    await expect(redoButton).toBeEnabled();
    await expect(undoButton).toBeDisabled();
    expect(await countCalls(page, "undo_command")).toBe(1);

    await redoButton.click();

    await expect(legend.getByText("Milestone")).toBeVisible();
    await expect(undoButton).toBeEnabled();
    expect(await countCalls(page, "redo_command")).toBe(1);
    expect(await countCalls(page, "undo_state_command")).toBeGreaterThanOrEqual(2);
  });

  test("keyboard shortcuts trigger undo and redo", async ({ page }) => {
    await setupPage(page, milestoneScenario());

    const legend = page.getByRole("complementary", { name: "Node types" });
    await expect(legend.getByText("Milestone")).toBeVisible();

    await page.keyboard.press("Control+z");
    await expect(legend.getByText("Milestone")).toHaveCount(0);
    expect(await countCalls(page, "undo_command")).toBe(1);

    await page.keyboard.press("Control+Shift+z");
    await expect(legend.getByText("Milestone")).toBeVisible();
    expect(await countCalls(page, "redo_command")).toBe(1);
  });

  test("Edit-menu events trigger undo and redo", async ({ page }) => {
    await setupPage(page, milestoneScenario());

    const legend = page.getByRole("complementary", { name: "Node types" });
    await expect(legend.getByText("Milestone")).toBeVisible();

    await emitEvent(page, "undo");
    await expect(legend.getByText("Milestone")).toHaveCount(0);
    expect(await countCalls(page, "undo_command")).toBe(1);

    await emitEvent(page, "redo");
    await expect(legend.getByText("Milestone")).toBeVisible();
    expect(await countCalls(page, "redo_command")).toBe(1);
  });

  test("undo is a no-op when there is no history", async ({ page }) => {
    await setupPage(page, emptyHistoryScenario());

    const undoButton = page.getByTestId("undo-button");
    const redoButton = page.getByTestId("redo-button");
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();

    await page.keyboard.press("Control+z");
    expect(await countCalls(page, "undo_command")).toBe(0);
  });
});
