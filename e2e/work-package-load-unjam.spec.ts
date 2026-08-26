import {
  dragCompositeParentByModelDelta,
  expect,
  getGraphNodeAbsolutePosition,
  getGraphNodeState,
  nodesOverlap,
  openWorkPackageGraph,
  setupPage,
  test,
  waitForCompoundGraphReady,
  type Scenario,
} from "./support/fixtures";

const PROJECT = { id: "project/billing-redesign", type: "project" };
const COMPOSITE_PARENT = {
  id: "project/billing-redesign/wp-invoicing",
  type: "work_package",
};
const COMPOSITE_C = {
  id: "project/billing-redesign/wp-reporting",
  type: "work_package",
};
const COMPOSITE_C_CHILD = {
  id: "project/billing-redesign/wp-reporting-child",
  type: "work_package",
};
const CHILD_A = { id: "project/billing-redesign/wp-child-a", type: "work_package" };
const CHILD_B = { id: "project/billing-redesign/wp-child-b", type: "work_package" };

/** Post-clone layout: no cached positions; nodes stack at origin until load-time unjam. */
function emptyLayoutScenario(): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [PROJECT, COMPOSITE_PARENT, COMPOSITE_C, COMPOSITE_C_CHILD, CHILD_A, CHILD_B],
        links: [
          {
            id: "parent_of--invoicing--child-a",
            link_type: "parent_of",
            source: COMPOSITE_PARENT.id,
            target: CHILD_A.id,
          },
          {
            id: "parent_of--invoicing--child-b",
            link_type: "parent_of",
            source: COMPOSITE_PARENT.id,
            target: CHILD_B.id,
          },
          {
            id: "parent_of--reporting--child",
            link_type: "parent_of",
            source: COMPOSITE_C.id,
            target: COMPOSITE_C_CHILD.id,
          },
        ],
        link_types: [],
        label: null,
      },
    ],
    index: 0,
    layout: {
      version: 1,
      kind: "bellman-gui-work-package-layout",
      top_level: {},
      projects: {},
    },
  };
}

test.describe("work package load unjam", () => {
  test("separates stacked nodes on empty layout and allows composite drag", async ({
    page,
  }) => {
    await setupPage(page, emptyLayoutScenario());
    await openWorkPackageGraph(page, PROJECT.id);
    await waitForCompoundGraphReady(page, COMPOSITE_PARENT.id, [CHILD_A.id, CHILD_B.id]);

    await expect
      .poll(async () => {
        const positions = await Promise.all(
          [COMPOSITE_PARENT.id, COMPOSITE_C.id, CHILD_A.id, CHILD_B.id].map((id) =>
            getGraphNodeAbsolutePosition(page, id),
          ),
        );
        const keys = new Set(positions.map((position) => `${position.x},${position.y}`));
        return keys.size;
      })
      .toBeGreaterThan(1);

    expect(await nodesOverlap(page, COMPOSITE_PARENT.id, COMPOSITE_C.id)).toBe(false);
    expect(await nodesOverlap(page, CHILD_A.id, CHILD_B.id)).toBe(false);

    const before = await getGraphNodeState(page, COMPOSITE_PARENT.id);
    await dragCompositeParentByModelDelta(page, COMPOSITE_PARENT.id, 20, 0);
    const after = await getGraphNodeState(page, COMPOSITE_PARENT.id);

    expect(Math.hypot((after?.x ?? 0) - (before?.x ?? 0), (after?.y ?? 0) - (before?.y ?? 0))).toBeGreaterThan(
      5,
    );
  });
});
