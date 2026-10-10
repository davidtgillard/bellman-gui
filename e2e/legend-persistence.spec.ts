import {
  dragGraphBackground,
  expect,
  getGraphPan,
  reloadApp,
  setupPage,
  test,
  waitForGraph,
  type Scenario,
} from "./support/fixtures";

const PROJECT = { id: "project/billing", type: "project" };
const INITIATIVE = { id: "initiative/reduce-churn", type: "initiative" };
const MILESTONE = { id: "milestone/ga", type: "milestone" };
const ROADMAP_ROOT = "/roadmap";

function multiTypeScenario(): Scenario {
  return {
    states: [
      {
        root: ROADMAP_ROOT,
        editable: true,
        nodes: [PROJECT, INITIATIVE, MILESTONE],
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
    const initiativeCheckbox = legend.getByRole("checkbox", { name: "Initiative" });

    await expect(initiativeCheckbox).toBeChecked();
    await initiativeCheckbox.uncheck();
    await expect(initiativeCheckbox).not.toBeChecked();

    await reloadApp(page, multiTypeScenario());

    await expect(legend.getByRole("checkbox", { name: "Initiative" })).not.toBeChecked();
    await expect(legend.getByRole("checkbox", { name: "Project" })).toBeChecked();
    await expect(legend.getByRole("checkbox", { name: "Milestone" })).toBeChecked();
  });

  test("toggling legend visibility does not change the viewport pan", async ({ page }) => {
    await setupPage(page, multiTypeScenario());
    await waitForGraph(page);
    await dragGraphBackground(page);

    const panBefore = await getGraphPan(page);
    const legend = page.getByRole("complementary", { name: "Node types" });
    await legend.getByRole("checkbox", { name: "Initiative" }).uncheck();

    const panAfter = await getGraphPan(page);
    expect(panAfter.x).toBeCloseTo(panBefore.x, 0);
    expect(panAfter.y).toBeCloseTo(panBefore.y, 0);
  });
});
