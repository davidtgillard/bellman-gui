import {
  clickGraphBackground,
  dragCompoundResizeHandle,
  dragCompoundTitleBar,
  dragCompositeParentByModelDelta,
  dragGraphNode,
  dragGraphNodeWithSteps,
  expect,
  getCompositeChildOffsets,
  getCompositeRenderedBox,
  getGraphNodeAbsolutePosition,
  getGraphNodeState,
  getSubtreeNodeIds,
  isNodeRenderedVisible,
  nodesOverlap,
  openWorkPackageGraph,
  setupPage,
  tapGraphNode,
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

function baseScenario(): Scenario {
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

function overlapScenario(): Scenario {
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
      projects: {
        "billing-redesign": {
          [COMPOSITE_PARENT.id]: { x: 0, y: 0, w: 420, h: 280 },
          [COMPOSITE_C.id]: { x: 520, y: 0, w: 320, h: 220 },
          [COMPOSITE_C_CHILD.id]: { x: 0, y: 0 },
          [CHILD_A.id]: { x: -90, y: -30 },
          [CHILD_B.id]: { x: 90, y: -30 },
        },
      },
    },
  };
}

async function openGraph(page: import("@playwright/test").Page, scenario: Scenario): Promise<void> {
  await setupPage(page, scenario);
  await openWorkPackageGraph(page, PROJECT.id);
  await waitForCompoundGraphReady(page, COMPOSITE_PARENT.id, [CHILD_A.id, CHILD_B.id]);
}

test.describe("work package layout invariants", () => {
  test.describe("req 1 composite move", () => {
    test("preserves child offsets and composite dimensions", async ({ page }) => {
      await openGraph(page, baseScenario());
      const offsetsBefore = await getCompositeChildOffsets(page, COMPOSITE_PARENT.id);
      const parentBefore = await getGraphNodeState(page, COMPOSITE_PARENT.id);

      const boxBefore = await getCompositeRenderedBox(page, COMPOSITE_PARENT.id);
      await tapGraphNode(page, COMPOSITE_PARENT.id);
      await dragCompoundTitleBar(page, 80, 50);
      const boxAfter = await getCompositeRenderedBox(page, COMPOSITE_PARENT.id);

      const offsetsAfter = await getCompositeChildOffsets(page, COMPOSITE_PARENT.id);
      const parentAfter = await getGraphNodeState(page, COMPOSITE_PARENT.id);

      for (const childId of Object.keys(offsetsBefore)) {
        expect(offsetsAfter[childId]?.dx).toBeCloseTo(offsetsBefore[childId]?.dx ?? 0, 0);
        expect(offsetsAfter[childId]?.dy).toBeCloseTo(offsetsBefore[childId]?.dy ?? 0, 0);
      }
      expect(parentAfter?.w).toBe(parentBefore?.w);
      expect(parentAfter?.h).toBe(parentBefore?.h);
      expect(Math.hypot(
        (boxAfter?.x1 ?? 0) - (boxBefore?.x1 ?? 0),
        (boxAfter?.y1 ?? 0) - (boxBefore?.y1 ?? 0),
      )).toBeGreaterThan(15);
    });
  });

  test.describe("req 2 composite resize", () => {
    test("preserves child absolute positions", async ({ page }) => {
      await openGraph(page, baseScenario());
      const absBefore = {
        a: await getGraphNodeAbsolutePosition(page, CHILD_A.id),
        b: await getGraphNodeAbsolutePosition(page, CHILD_B.id),
      };

      await tapGraphNode(page, COMPOSITE_PARENT.id);
      await dragCompoundResizeHandle(page, "se", 60, 40);

      const absAfter = {
        a: await getGraphNodeAbsolutePosition(page, CHILD_A.id),
        b: await getGraphNodeAbsolutePosition(page, CHILD_B.id),
      };
      expect(absAfter.a?.x).toBeCloseTo(absBefore.a?.x ?? 0, 0);
      expect(absAfter.a?.y).toBeCloseTo(absBefore.a?.y ?? 0, 0);
      expect(absAfter.b?.x).toBeCloseTo(absBefore.b?.x ?? 0, 0);
      expect(absAfter.b?.y).toBeCloseTo(absBefore.b?.y ?? 0, 0);
    });
  });

  test.describe("req 3 inner move isolation", () => {
    test("child move does not change parent or sibling", async ({ page }) => {
      await openGraph(page, baseScenario());
      const parentBefore = await getGraphNodeState(page, COMPOSITE_PARENT.id);
      const siblingBefore = await getGraphNodeAbsolutePosition(page, CHILD_B.id);

      await dragGraphNode(page, CHILD_A.id, 80, 40, COMPOSITE_PARENT.id);

      const parentAfter = await getGraphNodeState(page, COMPOSITE_PARENT.id);
      const siblingAfter = await getGraphNodeAbsolutePosition(page, CHILD_B.id);

      expect(parentAfter?.x).toBeCloseTo(parentBefore?.x ?? 0, 0);
      expect(parentAfter?.y).toBeCloseTo(parentBefore?.y ?? 0, 0);
      expect(parentAfter?.w).toBe(parentBefore?.w);
      expect(parentAfter?.h).toBe(parentBefore?.h);
      expect(siblingAfter?.x).toBeCloseTo(siblingBefore?.x ?? 0, 0);
      expect(siblingAfter?.y).toBeCloseTo(siblingBefore?.y ?? 0, 0);
    });

    test("outward child drag clamp keeps parent chrome fixed", async ({ page }) => {
      await openGraph(page, baseScenario());
      const parentBefore = await getGraphNodeState(page, COMPOSITE_PARENT.id);
      const boxBefore = await getCompositeRenderedBox(page, COMPOSITE_PARENT.id);
      const siblingBefore = await getGraphNodeAbsolutePosition(page, CHILD_B.id);

      await dragGraphNodeWithSteps(page, CHILD_A.id, -120, -90, 8);
      await clickGraphBackground(page);

      const parentAfter = await getGraphNodeState(page, COMPOSITE_PARENT.id);
      const boxAfter = await getCompositeRenderedBox(page, COMPOSITE_PARENT.id);
      const siblingAfter = await getGraphNodeAbsolutePosition(page, CHILD_B.id);

      expect(parentAfter?.w).toBe(parentBefore?.w);
      expect(parentAfter?.h).toBe(parentBefore?.h);
      expect(parentAfter?.x).toBeCloseTo(parentBefore?.x ?? 0, 0);
      expect(parentAfter?.y).toBeCloseTo(parentBefore?.y ?? 0, 0);
      expect(boxAfter?.x1).toBeCloseTo(boxBefore?.x1 ?? 0, 0);
      expect(boxAfter?.y1).toBeCloseTo(boxBefore?.y1 ?? 0, 0);
      expect(siblingAfter?.x).toBeCloseTo(siblingBefore?.x ?? 0, 0);
      expect(siblingAfter?.y).toBeCloseTo(siblingBefore?.y ?? 0, 0);
    });
  });

  test.describe("req 4 overlap clamp", () => {
    test("composite drag does not overlap neighbor", async ({ page }) => {
      await openGraph(page, overlapScenario());
      await waitForCompoundGraphReady(page, COMPOSITE_C.id, [COMPOSITE_C_CHILD.id]);
      await expect
        .poll(async () => getGraphNodeState(page, COMPOSITE_C.id))
        .not.toBeNull();

      const neighborBefore = await getGraphNodeState(page, COMPOSITE_C.id);

      await tapGraphNode(page, COMPOSITE_PARENT.id);
      await dragCompositeParentByModelDelta(page, COMPOSITE_PARENT.id, 800, 0);

      expect(await nodesOverlap(page, COMPOSITE_PARENT.id, COMPOSITE_C.id)).toBe(false);
      const neighborAfter = await getGraphNodeState(page, COMPOSITE_C.id);
      expect(neighborAfter?.x).toBeCloseTo(neighborBefore?.x ?? 0, 0);
      expect(neighborAfter?.y).toBeCloseTo(neighborBefore?.y ?? 0, 0);
    });
  });

  test.describe("req 5 visibility during drag", () => {
    test("composite step drag keeps subtree visible", async ({ page }) => {
      await openGraph(page, baseScenario());
      await tapGraphNode(page, COMPOSITE_PARENT.id);

      await dragCompoundTitleBar(page, 100, 60, 4, async () => {
        const ids = await getSubtreeNodeIds(page, COMPOSITE_PARENT.id);
        for (const nodeId of ids) {
          expect(await isNodeRenderedVisible(page, nodeId)).toBe(true);
        }
        const box = await getCompositeRenderedBox(page, COMPOSITE_PARENT.id);
        expect(box).not.toBeNull();
        const area = (box!.x2 - box!.x1) * (box!.y2 - box!.y1);
        expect(area).toBeGreaterThan(2000);
      });
    });

    test("child step drag keeps parent border visible", async ({ page }) => {
      await openGraph(page, baseScenario());

      await dragGraphNodeWithSteps(page, CHILD_A.id, 70, 35, 4, async () => {
        expect(await isNodeRenderedVisible(page, COMPOSITE_PARENT.id)).toBe(true);
        expect(await isNodeRenderedVisible(page, CHILD_A.id)).toBe(true);
        expect(await isNodeRenderedVisible(page, CHILD_B.id)).toBe(true);
      });
    });
  });
});
