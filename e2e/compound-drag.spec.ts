import {
  clickGraphBackground,
  expect,
  getGraphPan,
  getGraphNodeState,
  openWorkPackageGraph,
  setupPage,
  tapGraphNode,
  test,
  waitForCompoundGraphReady,
  type Scenario,
} from "./support/fixtures";

const PROJECT = {
  id: "project--billing-redesign",
  type: "project",
};
const COMPOSITE_PARENT = {
  id: "billing-redesign--wp-invoicing",
  type: "work_package",
};
const CHILD_A = {
  id: "billing-redesign--wp-child-a",
  type: "work_package",
};
const CHILD_B = {
  id: "billing-redesign--wp-child-b",
  type: "work_package",
};

function compoundDragScenario(): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [PROJECT, COMPOSITE_PARENT, CHILD_A, CHILD_B],
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
      projects: {
        "billing-redesign": {
          [COMPOSITE_PARENT.id]: { x: 0, y: 0, w: 420, h: 280 },
          [CHILD_A.id]: { x: -90, y: -30 },
          [CHILD_B.id]: { x: 90, y: -30 },
        },
      },
    },
  };
}

async function openCompoundGraph(page: import("@playwright/test").Page): Promise<void> {
  await setupPage(page, compoundDragScenario());
  await openWorkPackageGraph(page, PROJECT.id);
  await waitForCompoundGraphReady(page, COMPOSITE_PARENT.id, [CHILD_A.id, CHILD_B.id]);
}

test.describe("composite graph interaction", () => {
  test("clicking the graph background deselects an inner node", async ({ page }) => {
    await openCompoundGraph(page);

    await tapGraphNode(page, CHILD_A.id);
    await expect(page.locator(".node-detail-sidebar")).toBeVisible();

    await clickGraphBackground(page);

    await expect(page.locator(".node-detail-sidebar")).toHaveCount(0);
  });

  test("clicking a selected child again deselects it", async ({ page }) => {
    await openCompoundGraph(page);

    await tapGraphNode(page, CHILD_A.id);
    await expect(page.locator(".node-detail-sidebar")).toBeVisible();

    await tapGraphNode(page, CHILD_A.id);

    await expect(page.locator(".node-detail-sidebar")).toHaveCount(0);
  });

  test("real mouse clicks toggle child selection", async ({ page }) => {
    await openCompoundGraph(page);

    const center = await page.evaluate((id) => {
      const bridge = (window as unknown as {
        __TEST__?: { getGraphNodeRenderedCenter?: (nodeId: string) => { x: number; y: number } };
      }).__TEST__;
      if (!bridge?.getGraphNodeRenderedCenter) {
        throw new Error("getGraphNodeRenderedCenter test hook is unavailable");
      }
      return bridge.getGraphNodeRenderedCenter(id);
    }, CHILD_A.id);

    await page.mouse.click(center.x, center.y);
    await expect
      .poll(async () => page.locator(".node-detail-sidebar").count())
      .toBe(1);
    await expect
      .poll(async () =>
        page.evaluate((id) => {
          const bridge = (window as unknown as {
            __TEST__?: { getSelectedGraphNodeId?: () => string | null };
          }).__TEST__;
          return bridge?.getSelectedGraphNodeId?.() === id;
        }, CHILD_A.id),
      )
      .toBe(true);

    await tapGraphNode(page, CHILD_A.id);
    await expect(page.locator(".node-detail-sidebar")).toHaveCount(0);
  });

  test("arrow keys pan after selecting an inner node", async ({ page }) => {
    await openCompoundGraph(page);

    await tapGraphNode(page, CHILD_A.id);
    await expect(page.locator(".node-detail-sidebar")).toBeVisible();

    const before = await getGraphPan(page);
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(400);
    await page.keyboard.up("ArrowRight");
    const after = await getGraphPan(page);

    expect(after.x).toBeLessThan(before.x);
  });

  test("arrow keys pan after deselecting an inner node via canvas click", async ({
    page,
  }) => {
    await openCompoundGraph(page);

    await tapGraphNode(page, CHILD_A.id);
    await expect(page.locator(".node-detail-sidebar")).toBeVisible();

    await clickGraphBackground(page);
    await expect(page.locator(".node-detail-sidebar")).toHaveCount(0);

    const before = await getGraphPan(page);
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(400);
    await page.keyboard.up("ArrowRight");
    const after = await getGraphPan(page);

    expect(after.x).toBeLessThan(before.x);
  });

  test("arrow keys pan after focusing sidebar then deselecting via canvas", async ({
    page,
  }) => {
    await openCompoundGraph(page);

    await tapGraphNode(page, CHILD_A.id);
    const sidebar = page.locator(".node-detail-sidebar");
    await expect(sidebar).toBeVisible();
    await sidebar.click();

    await clickGraphBackground(page);
    await expect(sidebar).toHaveCount(0);

    const before = await getGraphPan(page);
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(400);
    await page.keyboard.up("ArrowRight");
    const after = await getGraphPan(page);

    expect(after.x).toBeLessThan(before.x);
  });

  test("arrow keys pan after sidebar unmounts with stale focus", async ({ page }) => {
    await openCompoundGraph(page);

    await tapGraphNode(page, CHILD_A.id);
    await expect(page.locator(".node-detail-sidebar")).toBeVisible();

    await page.evaluate(() => {
      const sidebar = document.querySelector(".node-detail-sidebar");
      const close = sidebar?.querySelector("button");
      close?.focus();
      sidebar?.remove();
    });

    const before = await getGraphPan(page);
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(400);
    await page.keyboard.up("ArrowRight");
    const after = await getGraphPan(page);

    expect(Math.abs(after.x - before.x)).toBeGreaterThan(20);
  });

  test("arrow keys pan the composite border with its chrome", async ({ page }) => {
    await openCompoundGraph(page);

    await tapGraphNode(page, COMPOSITE_PARENT.id);
    await expect(page.locator(".compound-parent-label")).toBeVisible();

    const parentBefore = await getGraphNodeState(page, COMPOSITE_PARENT.id);
    const panBefore = await getGraphPan(page);

    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(400);
    await page.keyboard.up("ArrowLeft");

    const parentAfter = await getGraphNodeState(page, COMPOSITE_PARENT.id);
    const panAfter = await getGraphPan(page);

    expect(parentAfter?.x).toBeCloseTo(parentBefore?.x ?? 0, 0);
    expect(parentAfter?.y).toBeCloseTo(parentBefore?.y ?? 0, 0);
    expect(panAfter.x).toBeGreaterThan(panBefore.x);
  });

  test("back returns from the work package graph to top level", async ({ page }) => {
    await openCompoundGraph(page);
    await expect(page.locator(".graph-view-breadcrumb")).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();

    await expect(page.locator(".graph-view-breadcrumb")).toHaveCount(0);
    await expect.poll(async () => getGraphNodeState(page, PROJECT.id)).not.toBeNull();
  });
});
