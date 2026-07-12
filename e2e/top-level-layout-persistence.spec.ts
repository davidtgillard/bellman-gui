import {
  dragGraphNode,
  expect,
  getCalls,
  getGraphNodeAbsolutePosition,
  reloadApp,
  setupPage,
  test,
  waitForGraph,
  waitForGraphNodeState,
  type Scenario,
} from "./support/fixtures";

const GOAL = { id: "goal/partner-integrations", type: "goal" };
const INITIATIVE = { id: "initiative/kri-image-tools", type: "initiative" };
const ROADMAP_ROOT = "/roadmap";

const INITIAL_LAYOUT = {
  version: 1,
  kind: "bellman-gui-work-package-layout",
  top_level: {
    [GOAL.id]: { x: 100, y: 50 },
    [INITIATIVE.id]: { x: -120, y: -80 },
  },
  projects: {},
};

function topLevelScenario(layout = INITIAL_LAYOUT): Scenario {
  return {
    states: [
      {
        root: ROADMAP_ROOT,
        editable: true,
        nodes: [GOAL, INITIATIVE],
        links: [],
        link_types: [],
        label: null,
      },
    ],
    index: 0,
    layout,
  };
}

test.describe("top-level layout persistence", () => {
  test("dragging a top-level node saves layout and restores after reload", async ({
    page,
  }) => {
    const scenario = topLevelScenario();
    await setupPage(page, scenario);
    await waitForGraph(page);
    await waitForGraphNodeState(page, GOAL.id, INITIAL_LAYOUT.top_level[GOAL.id]);

    const before = await getGraphNodeAbsolutePosition(page, GOAL.id);
    await dragGraphNode(page, GOAL.id, 140, 90);

    await expect
      .poll(async () => {
        const calls = await getCalls(page);
        return calls.filter((call) => call.cmd === "save_graph_layout_command").length;
      })
      .toBeGreaterThan(0);

    const saveCall = (await getCalls(page))
      .filter((call) => call.cmd === "save_graph_layout_command")
      .at(-1);
    const savedLayout = (
      saveCall?.args as { layout?: Scenario["layout"] } | undefined
    )?.layout;
    expect(savedLayout?.top_level?.[GOAL.id]).toBeTruthy();

    const savedGoal = savedLayout!.top_level![GOAL.id]!;
    expect(Math.hypot(savedGoal.x - before.x, savedGoal.y - before.y)).toBeGreaterThan(
      20,
    );

    const afterDrag = await getGraphNodeAbsolutePosition(page, GOAL.id);
    expect(Math.hypot(afterDrag.x - savedGoal.x, afterDrag.y - savedGoal.y)).toBeLessThan(
      2,
    );

    await reloadApp(page, topLevelScenario(savedLayout));
    await waitForGraph(page);
    await waitForGraphNodeState(page, GOAL.id, {
      x: savedGoal.x,
      y: savedGoal.y,
    });

    const afterReload = await getGraphNodeAbsolutePosition(page, GOAL.id);
    expect(
      Math.hypot(afterReload.x - savedGoal.x, afterReload.y - savedGoal.y),
    ).toBeLessThan(2);
  });
});
