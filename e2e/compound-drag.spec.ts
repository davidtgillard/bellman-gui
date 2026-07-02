import {
  dragCompoundTitleBar,
  dragCompositeParentByModelDelta,
  dragGraphNode,
  expect,
  getCompositeRenderedBox,
  getGraphNodeAbsolutePosition,
  getGraphNodeState,
  getGraphPan,
  openWorkPackageGraph,
  selectGraphNodeOnly,
  setupPage,
  tapGraphNode,
  test,
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

  await expect
    .poll(async () => {
      const parent = await getGraphNodeState(page, COMPOSITE_PARENT.id);
      const childA = await getGraphNodeState(page, CHILD_A.id);
      const childB = await getGraphNodeState(page, CHILD_B.id);
      return (
        parent !== null &&
        parent.w !== undefined &&
        parent.h !== undefined &&
        childA !== null &&
        childB !== null
      );
    })
    .toBe(true);
}

test.describe("composite drag invariants", () => {
  test("moving a composite preserves child offsets relative to the parent", async ({
    page,
  }) => {
    await openCompoundGraph(page);

    const childBefore = await getGraphNodeAbsolutePosition(page, CHILD_A.id);
    const parentBefore = await getGraphNodeState(page, COMPOSITE_PARENT.id);

    await tapGraphNode(page, COMPOSITE_PARENT.id);
    await expect(page.locator(".compound-drag-handle")).toBeVisible();
    await dragCompositeParentByModelDelta(page, COMPOSITE_PARENT.id, 70, 45);

    const childAfter = await getGraphNodeAbsolutePosition(page, CHILD_A.id);
    const parentAfter = await getGraphNodeState(page, COMPOSITE_PARENT.id);

    const parentDx = (parentAfter?.x ?? 0) - (parentBefore?.x ?? 0);
    const parentDy = (parentAfter?.y ?? 0) - (parentBefore?.y ?? 0);
    expect(Math.hypot(parentDx, parentDy)).toBeGreaterThan(20);
    const childDx = (childAfter?.x ?? 0) - (childBefore?.x ?? 0);
    const childDy = (childAfter?.y ?? 0) - (childBefore?.y ?? 0);
    expect(Math.sign(childDx || parentDx)).toBe(Math.sign(parentDx));
    expect(Math.sign(childDy || parentDy)).toBe(Math.sign(parentDy));
    expect(Math.hypot(childDx, childDy)).toBeGreaterThan(20);
  });

  test("moving a composite moves its rendered border with the title bar", async ({
    page,
  }) => {
    await openCompoundGraph(page);

    await tapGraphNode(page, COMPOSITE_PARENT.id);
    await expect(page.locator(".compound-drag-handle")).toBeVisible();

    const boxBefore = await getCompositeRenderedBox(page, COMPOSITE_PARENT.id);
    const parentBefore = await getGraphNodeState(page, COMPOSITE_PARENT.id);
    expect(boxBefore).not.toBeNull();

    await dragCompoundTitleBar(page, 120, 80);

    const boxAfter = await getCompositeRenderedBox(page, COMPOSITE_PARENT.id);
    const parentAfter = await getGraphNodeState(page, COMPOSITE_PARENT.id);
    expect(boxAfter).not.toBeNull();

    expect(parentAfter?.x ?? 0).not.toBeCloseTo(parentBefore?.x ?? 0, 0);
    expect(parentAfter?.y ?? 0).not.toBeCloseTo(parentBefore?.y ?? 0, 0);

    const deltaX = (boxAfter?.x1 ?? 0) - (boxBefore?.x1 ?? 0);
    const deltaY = (boxAfter?.y1 ?? 0) - (boxBefore?.y1 ?? 0);
    expect(Math.hypot(deltaX, deltaY)).toBeGreaterThan(40);
  });

  test("moving a composite after dragging its only child keeps chrome aligned", async ({
    page,
  }) => {
    const onlyChild = {
      id: "billing-redesign--wp-only-child",
      type: "work_package",
    };
    await setupPage(page, {
      states: [
        {
          root: "/roadmap",
          editable: true,
          nodes: [PROJECT, COMPOSITE_PARENT, onlyChild],
          links: [
            {
              id: "parent_of--invoicing--only-child",
              link_type: "parent_of",
              source: COMPOSITE_PARENT.id,
              target: onlyChild.id,
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
            [onlyChild.id]: { x: -90, y: -30 },
          },
        },
      },
    });
    await openWorkPackageGraph(page, PROJECT.id);
    await expect
      .poll(async () => getGraphNodeState(page, onlyChild.id))
      .not.toBeNull();

    await dragGraphNode(page, onlyChild.id, 90, 50);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        }),
    );

    await tapGraphNode(page, COMPOSITE_PARENT.id);
    await expect(page.locator(".compound-drag-handle")).toBeVisible();

    const boxBefore = await getCompositeRenderedBox(page, COMPOSITE_PARENT.id);
    const handleBefore = await page.locator(".compound-drag-handle").boundingBox();
    expect(boxBefore).not.toBeNull();
    expect(handleBefore).not.toBeNull();

    await dragCompoundTitleBar(page, 120, 80);

    const boxAfter = await getCompositeRenderedBox(page, COMPOSITE_PARENT.id);
    const handleAfter = await page.locator(".compound-drag-handle").boundingBox();
    expect(boxAfter).not.toBeNull();
    expect(handleAfter).not.toBeNull();

    const borderCenterDeltaX =
      (boxAfter!.x1 + boxAfter!.x2) / 2 - (boxBefore!.x1 + boxBefore!.x2) / 2;
    const handleCenterDeltaX =
      handleAfter!.x + handleAfter!.width / 2 - (handleBefore!.x + handleBefore!.width / 2);
    expect(Math.abs(handleCenterDeltaX - borderCenterDeltaX)).toBeLessThan(8);
    expect(Math.hypot(boxAfter!.x1 - boxBefore!.x1, boxAfter!.y1 - boxBefore!.y1)).toBeGreaterThan(
      40,
    );
  });

  test("moving a child preserves the composite position and dimensions", async ({
    page,
  }) => {
    await openCompoundGraph(page);

    await dragGraphNode(page, CHILD_A.id, 90, 50);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        }),
    );

    const parentAtDragStart = await page.evaluate(() => {
      const bridge = (window as unknown as {
        __TEST__?: {
          lastChildDragParentState?: GraphNodeState;
        };
      }).__TEST__;
      return bridge?.lastChildDragParentState ?? null;
    });
    expect(parentAtDragStart).not.toBeNull();

    const parentAfter = await getGraphNodeState(page, COMPOSITE_PARENT.id);
    expect(parentAfter?.w).toBe(parentAtDragStart?.w);
    expect(parentAfter?.h).toBe(parentAtDragStart?.h);
    expect(parentAfter?.x).toBeCloseTo(parentAtDragStart?.x ?? 0, 0);
    expect(parentAfter?.y).toBeCloseTo(parentAtDragStart?.y ?? 0, 0);
    expect(parentAfter?.x1).toBeCloseTo(parentAtDragStart?.x1 ?? 0, 0);
    expect(parentAfter?.y1).toBeCloseTo(parentAtDragStart?.y1 ?? 0, 0);
  });

  test("moving a child preserves sibling positions", async ({ page }) => {
    await openCompoundGraph(page);

    const siblingBefore = await getGraphNodeAbsolutePosition(page, CHILD_B.id);
    expect(siblingBefore).not.toBeNull();

    await dragGraphNode(page, CHILD_A.id, 90, 50);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        }),
    );

    const siblingAfter = await getGraphNodeAbsolutePosition(page, CHILD_B.id);
    expect(siblingAfter?.x).toBeCloseTo(siblingBefore?.x ?? 0, 0);
    expect(siblingAfter?.y).toBeCloseTo(siblingBefore?.y ?? 0, 0);
  });

  test("dragging the only child moves the child, not the composite", async ({
    page,
  }) => {
    const onlyChild = {
      id: "billing-redesign--wp-only-child",
      type: "work_package",
    };
    await setupPage(page, {
      states: [
        {
          root: "/roadmap",
          editable: true,
          nodes: [PROJECT, COMPOSITE_PARENT, onlyChild],
          links: [
            {
              id: "parent_of--invoicing--only-child",
              link_type: "parent_of",
              source: COMPOSITE_PARENT.id,
              target: onlyChild.id,
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
            [onlyChild.id]: { x: -90, y: -30 },
          },
        },
      },
    });
    await openWorkPackageGraph(page, PROJECT.id);
    await expect
      .poll(async () => getGraphNodeState(page, onlyChild.id))
      .not.toBeNull();

    const childBefore = await getGraphNodeState(page, onlyChild.id);
    const parentBefore = await getGraphNodeState(page, COMPOSITE_PARENT.id);
    expect(childBefore).not.toBeNull();
    expect(parentBefore).not.toBeNull();

    await dragGraphNode(page, onlyChild.id, 90, 50);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        }),
    );

    const childAfter = await getGraphNodeState(page, onlyChild.id);
    const parentAfter = await getGraphNodeState(page, COMPOSITE_PARENT.id);

    expect(childAfter?.x ?? 0).not.toBeCloseTo(childBefore?.x ?? 0, 0);
    expect(childAfter?.y ?? 0).not.toBeCloseTo(childBefore?.y ?? 0, 0);
    expect(parentAfter?.x).toBeCloseTo(parentBefore?.x ?? 0, 0);
    expect(parentAfter?.y).toBeCloseTo(parentBefore?.y ?? 0, 0);
    expect(parentAfter?.w).toBe(parentBefore?.w);
    expect(parentAfter?.h).toBe(parentBefore?.h);
  });

  test("can drag a child after it is already selected", async ({ page }) => {
    await openCompoundGraph(page);

    const childBefore = await getGraphNodeState(page, CHILD_A.id);
    await selectGraphNodeOnly(page, CHILD_A.id);
    await expect(page.locator(".node-detail-sidebar")).toBeVisible();

    await dragGraphNode(page, CHILD_A.id, 90, 50);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        }),
    );

    const childAfter = await getGraphNodeState(page, CHILD_A.id);
    expect(childAfter?.x ?? 0).not.toBeCloseTo(childBefore?.x ?? 0, 0);
    expect(childAfter?.y ?? 0).not.toBeCloseTo(childBefore?.y ?? 0, 0);
  });

  test("clicking the graph background deselects an inner node", async ({ page }) => {
    await openCompoundGraph(page);

    await tapGraphNode(page, CHILD_A.id);
    await expect(page.locator(".node-detail-sidebar")).toBeVisible();

    const canvas = page.locator(".graph-viewport canvas").first();
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error("graph canvas is not visible");
    }
    await page.mouse.click(box.x + 8, box.y + 8);

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

    await page.mouse.click(center.x, center.y);
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

    const canvas = page.locator(".graph-viewport canvas").first();
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error("graph canvas is not visible");
    }
    await page.mouse.click(box.x + 8, box.y + 8);
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

    const canvas = page.locator(".graph-viewport canvas").first();
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error("graph canvas is not visible");
    }
    await page.mouse.click(box.x + 8, box.y + 8);
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
    await expect(page.locator(".compound-drag-handle")).toBeVisible();

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
