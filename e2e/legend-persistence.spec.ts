import { expect, reloadApp, setupPage, test, type Scenario } from "./support/fixtures";

const PROJECT = { id: "project--billing", type: "project" };
const GOAL = { id: "goal--reduce-churn", type: "goal" };
const MILESTONE = { id: "milestone--ga", type: "milestone" };
const ROADMAP_ROOT = "/roadmap";

function multiTypeScenario(): Scenario {
  return {
    states: [
      {
        root: ROADMAP_ROOT,
        editable: true,
        nodes: [PROJECT, GOAL, MILESTONE],
        links: [],
        link_types: [],
        label: null,
      },
    ],
    index: 0,
  };
}

test.describe("legend visibility persistence", () => {
  test("hidden node types stay hidden after reload", async ({ page }) => {
    await setupPage(page, multiTypeScenario());

    const legend = page.getByRole("complementary", { name: "Node types" });
    const goalCheckbox = legend.getByRole("checkbox", { name: "Goal" });

    await expect(goalCheckbox).toBeChecked();
    await goalCheckbox.uncheck();
    await expect(goalCheckbox).not.toBeChecked();

    await reloadApp(page, multiTypeScenario());

    await expect(legend.getByRole("checkbox", { name: "Goal" })).not.toBeChecked();
    await expect(legend.getByRole("checkbox", { name: "Project" })).toBeChecked();
    await expect(legend.getByRole("checkbox", { name: "Milestone" })).toBeChecked();
  });
});
