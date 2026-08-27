import {
  dragCompositeParentByModelDelta,
  expect,
  getGraphNodeAbsolutePosition,
  getGraphNodeState,
  getGraphZoom,
  getLeafRenderedDiameterPx,
  getNodeVisualBox,
  GRAPH_NODE_CSS_DIAMETER_PX,
  nodesOverlap,
  openWorkPackageGraph,
  sampleLeafRenderedDiameters,
  setupPage,
  test,
  waitForCompoundGraphReady,
  waitForGraph,
  type LeafRenderedDiameter,
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

function presetLayoutScenario(): Scenario {
  const scenario = emptyLayoutScenario();
  scenario.layout = {
    version: 1,
    kind: "bellman-gui-work-package-layout",
    top_level: {},
    projects: {
      "billing-redesign": {
        [COMPOSITE_PARENT.id]: { x: 0, y: 0, w: 420, h: 280 },
        [COMPOSITE_C.id]: { x: 520, y: 0, w: 320, h: 220 },
        [COMPOSITE_C_CHILD.id]: { x: 0, y: 0 },
        [CHILD_A.id]: { x: -90, y: -30 },
        [CHILD_B.id]: { x: 90, y: -30 },
      },
    },
  };
  return scenario;
}

function expectCssNodeDiameter(diameter: LeafRenderedDiameter): void {
  expect(diameter.w).toBeGreaterThanOrEqual(GRAPH_NODE_CSS_DIAMETER_PX - 2);
  expect(diameter.w).toBeLessThanOrEqual(GRAPH_NODE_CSS_DIAMETER_PX + 2);
  expect(diameter.h).toBeGreaterThanOrEqual(GRAPH_NODE_CSS_DIAMETER_PX - 2);
  expect(diameter.h).toBeLessThanOrEqual(GRAPH_NODE_CSS_DIAMETER_PX + 2);
  expect(diameter.w).not.toBeCloseTo(18, 0);
  expect(diameter.w).not.toBeCloseTo(72, 0);
}

function expectTopLevelRenderedDiameter(diameter: LeafRenderedDiameter): void {
  expect(diameter.zoom).toBeGreaterThan(0);
  expect(diameter.w).toBeCloseTo(GRAPH_NODE_CSS_DIAMETER_PX * diameter.zoom, 0);
  expect(diameter.h).toBeCloseTo(GRAPH_NODE_CSS_DIAMETER_PX * diameter.zoom, 0);
}

async function expectLeafDiameterOnFirstFrames(
  page: import("@playwright/test").Page,
  nodeId: string,
): Promise<void> {
  await expect
    .poll(async () => {
      const diameter = await getLeafRenderedDiameterPx(page, nodeId);
      return diameter !== null && diameter.w > 1;
    }, { timeout: 15_000 })
    .toBe(true);
  const first = await getLeafRenderedDiameterPx(page, nodeId);
  expect(first).not.toBeNull();
  expectCssNodeDiameter(first!);
  const frames = await sampleLeafRenderedDiameters(page, nodeId, 3);
  expect(frames.length).toBeGreaterThan(0);
  for (const diameter of frames) {
    expectCssNodeDiameter(diameter);
  }
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

    const zoom = await getGraphZoom(page);
    const childAfterUnjam = await getGraphNodeState(page, CHILD_A.id);
    const childBoxAfterUnjam = await getNodeVisualBox(page, CHILD_A.id);
    const childSizeAfterUnjam = {
      w: (childBoxAfterUnjam?.x2 ?? 0) - (childBoxAfterUnjam?.x1 ?? 0),
      h: (childBoxAfterUnjam?.y2 ?? 0) - (childBoxAfterUnjam?.y1 ?? 0),
    };
    // Model width is cssDiameter / fittedZoom; on-screen size is asserted in the
    // first-paint tests below via renderedBoundingBox.
    expect(zoom).toBeGreaterThan(0);
    expect(childAfterUnjam?.w ?? 0).toBeCloseTo(36 / zoom, 1);
    expect(childAfterUnjam?.h ?? 0).toBeCloseTo(36 / zoom, 1);
    expect((childAfterUnjam?.w ?? 0) * zoom).toBeCloseTo(36, 1);
    expect(childSizeAfterUnjam.w).toBeGreaterThan(20);
    expect(childSizeAfterUnjam.h).toBeGreaterThan(20);

    const before = await getGraphNodeState(page, COMPOSITE_PARENT.id);
    await dragCompositeParentByModelDelta(page, COMPOSITE_PARENT.id, 20, 0);
    const after = await getGraphNodeState(page, COMPOSITE_PARENT.id);
    const childBoxAfterDrag = await getNodeVisualBox(page, CHILD_A.id);

    expect(Math.hypot((after?.x ?? 0) - (before?.x ?? 0), (after?.y ?? 0) - (before?.y ?? 0))).toBeGreaterThan(
      5,
    );
    expect(after?.w).toBe(before?.w);
    expect(after?.h).toBe(before?.h);
    expect((childBoxAfterDrag?.x2 ?? 0) - (childBoxAfterDrag?.x1 ?? 0)).toBeCloseTo(
      childSizeAfterUnjam.w,
      0,
    );
    expect((childBoxAfterDrag?.y2 ?? 0) - (childBoxAfterDrag?.y1 ?? 0)).toBeCloseTo(
      childSizeAfterUnjam.h,
      0,
    );
  });

  test("empty-layout leaves match CSS diameter on first paint and after unjam", async ({
    page,
  }) => {
    await setupPage(page, emptyLayoutScenario());
    await waitForGraph(page);
    const topLevel = await getLeafRenderedDiameterPx(page, PROJECT.id);
    expect(topLevel).not.toBeNull();
    expectTopLevelRenderedDiameter(topLevel!);

    await openWorkPackageGraph(page, PROJECT.id);
    await expectLeafDiameterOnFirstFrames(page, CHILD_A.id);
    await waitForCompoundGraphReady(page, COMPOSITE_PARENT.id, [CHILD_A.id, CHILD_B.id]);
    const settled = await getLeafRenderedDiameterPx(page, CHILD_A.id);
    expect(settled).not.toBeNull();
    expectCssNodeDiameter(settled!);
  });

  test("preset-layout leaves match CSS diameter on first paint", async ({ page }) => {
    await setupPage(page, presetLayoutScenario());
    await waitForGraph(page);
    const topLevel = await getLeafRenderedDiameterPx(page, PROJECT.id);
    expect(topLevel).not.toBeNull();
    expectTopLevelRenderedDiameter(topLevel!);

    await openWorkPackageGraph(page, PROJECT.id);
    await expectLeafDiameterOnFirstFrames(page, CHILD_A.id);
    await waitForCompoundGraphReady(page, COMPOSITE_PARENT.id, [CHILD_A.id, CHILD_B.id]);
    const settled = await getLeafRenderedDiameterPx(page, CHILD_A.id);
    expect(settled).not.toBeNull();
    expectCssNodeDiameter(settled!);
  });
});
