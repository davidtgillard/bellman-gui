import {
  emitEvent,
  expect,
  getGraphNodeAbsolutePosition,
  setupPage,
  test,
  waitForGraph,
  type Scenario,
} from "./support/fixtures";

const GOAL = { id: "goal/reduce-churn", type: "goal" };
const INITIATIVE = { id: "initiative/explore-ml-ranking", type: "initiative" };
const PROJECT = { id: "project/billing-redesign", type: "project" };
const MILESTONE = { id: "milestone/ga-release", type: "milestone" };

function otherRoadmapScenario(): Scenario {
  return {
    states: [
      {
        root: "/other-roadmap",
        editable: true,
        nodes: [
          { id: "goal/other", type: "goal" },
          { id: "initiative/other", type: "initiative" },
        ],
        links: [],
        link_types: [],
        label: null,
      },
    ],
    index: 0,
    layout: {
      version: 1,
      kind: "bellman-gui-work-package-layout",
      top_level: {
        "goal/other": { x: 40, y: 20 },
        "initiative/other": { x: -60, y: -30 },
      },
      projects: {},
    },
  };
}

test.describe("example roadmap layout", () => {
  test("example nodes stay spread after switching from another roadmap", async ({
    page,
  }) => {
    await setupPage(page, otherRoadmapScenario());
    await waitForGraph(page);

    await emitEvent(page, "show-example-roadmap");
    await waitForGraph(page);

    await expect
      .poll(async () => {
        const positions = await Promise.all(
          [GOAL.id, INITIATIVE.id, PROJECT.id, MILESTONE.id].map((id) =>
            getGraphNodeAbsolutePosition(page, id),
          ),
        );
        const keys = new Set(positions.map((position) => `${position.x},${position.y}`));
        return keys.size;
      })
      .toBe(4);
  });
});
