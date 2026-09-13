import {
  countCalls,
  dragCompositeParentByModelDelta,
  dragGraphNode,
  expect,
  getCalls,
  getCompositeChildOffsets,
  getCompositeRenderedBox,
  getGraphNodeAbsolutePosition,
  getGraphNodeRenderedCenter,
  getGraphNodeState,
  openBackgroundContextMenu,
  openWorkPackageGraph,
  setupPage,
  tapGraphNode,
  test,
  waitForCompoundGraphReady,
  waitForStableGraphNodeRenderedCenter,
  type Scenario,
} from "./support/fixtures";
import {
  COMPOUND_CREATE_LAYOUT,
  PROJECT,
  WP_LEAF,
  WP_PARENT,
  createScenario,
} from "./support/work-package-create-scenario";

function compoundScenario(): Scenario {
  return createScenario({ layout: COMPOUND_CREATE_LAYOUT });
}

function lastSavedProjectLayout(
  calls: Awaited<ReturnType<typeof getCalls>>,
  nodeId: string,
): { x: number; y: number; w?: number; h?: number } | undefined {
  const saveCall = calls.filter((call) => call.cmd === "save_graph_layout_command").at(-1);
  const savedLayout = (saveCall?.args as { layout?: Scenario["layout"] } | undefined)?.layout;
  return savedLayout?.projects?.["billing-redesign"]?.[nodeId];
}

test.describe("work package root drag", () => {
  test("newly created top-level non-container work package can be dragged", async ({
    page,
  }) => {
    await setupPage(page, compoundScenario());
    await openWorkPackageGraph(page, PROJECT.id);
    await waitForCompoundGraphReady(page, WP_PARENT.id, [WP_LEAF.id]);

    await openBackgroundContextMenu(page);
    await page.getByRole("button", { name: "New work package…" }).click();
    const dialog = page.locator(".edit-dialog");
    await dialog.getByLabel("Name").fill("wp-movable");
    await dialog.getByRole("button", { name: "Create work package" }).click();
    await expect(dialog).toHaveCount(0);

    const newNodeId = "project/billing-redesign/wp-movable";
    const renderedBefore = await waitForStableGraphNodeRenderedCenter(page, newNodeId);
    const modelBefore = await getGraphNodeAbsolutePosition(page, newNodeId);
    expect(modelBefore).not.toBeNull();

    const savesBefore = await countCalls(page, "save_graph_layout_command");
    await dragGraphNode(page, newNodeId, 140, 90);

    await expect
      .poll(async () => {
        const renderedAfter = await getGraphNodeRenderedCenter(page, newNodeId);
        return Math.hypot(
          (renderedAfter?.x ?? 0) - renderedBefore.x,
          (renderedAfter?.y ?? 0) - renderedBefore.y,
        );
      })
      .toBeGreaterThan(20);

    await expect
      .poll(async () => countCalls(page, "save_graph_layout_command"))
      .toBeGreaterThan(savesBefore);

    await expect
      .poll(async () => {
        const afterDrag = await getGraphNodeAbsolutePosition(page, newNodeId);
        const saved = lastSavedProjectLayout(await getCalls(page), newNodeId);
        if (!afterDrag || !saved) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.hypot(afterDrag.x - saved.x, afterDrag.y - saved.y);
      })
      .toBeLessThan(2);

    const saved = lastSavedProjectLayout(await getCalls(page), newNodeId);
    expect(saved).toBeTruthy();
    expect(
      Math.hypot((saved?.x ?? 0) - modelBefore!.x, (saved?.y ?? 0) - modelBefore!.y),
    ).toBeGreaterThan(20);
  });

  test("top-level container work package can be dragged", async ({ page }) => {
    await setupPage(page, compoundScenario());
    await openWorkPackageGraph(page, PROJECT.id);
    await waitForCompoundGraphReady(page, WP_PARENT.id, [WP_LEAF.id]);

    const offsetsBefore = await getCompositeChildOffsets(page, WP_PARENT.id);
    const parentBefore = await getGraphNodeState(page, WP_PARENT.id);
    const boxBefore = await getCompositeRenderedBox(page, WP_PARENT.id);

    await tapGraphNode(page, WP_PARENT.id);
    await dragCompositeParentByModelDelta(page, WP_PARENT.id, 80, 50);

    const boxAfter = await getCompositeRenderedBox(page, WP_PARENT.id);
    const offsetsAfter = await getCompositeChildOffsets(page, WP_PARENT.id);
    const parentAfter = await getGraphNodeState(page, WP_PARENT.id);

    for (const childId of Object.keys(offsetsBefore)) {
      expect(offsetsAfter[childId]?.dx).toBeCloseTo(offsetsBefore[childId]?.dx ?? 0, 0);
      expect(offsetsAfter[childId]?.dy).toBeCloseTo(offsetsBefore[childId]?.dy ?? 0, 0);
    }
    expect(parentAfter?.w).toBe(parentBefore?.w);
    expect(parentAfter?.h).toBe(parentBefore?.h);
    expect(
      Math.hypot(
        (boxAfter?.x1 ?? 0) - (boxBefore?.x1 ?? 0),
        (boxAfter?.y1 ?? 0) - (boxBefore?.y1 ?? 0),
      ),
    ).toBeGreaterThan(15);
  });
});
