import {
  clickGraphBackground,
  countCalls,
  expect,
  getGraphEdgeIds,
  getGraphNodeClasses,
  getGraphPan,
  openNodeContextMenu,
  setupPage,
  tapGraphNode,
  test,
  waitForUndoReady,
  type Scenario,
} from "./support/fixtures";

const INITIATIVE_A = { id: "initiative/settings-manager", type: "initiative" };
const INITIATIVE_B = { id: "initiative/billing-redesign", type: "initiative" };
const PROJECT = { id: "project/billing", type: "project" };
const GOAL = { id: "goal/reduce-churn", type: "goal" };

const LINK_TYPES = [
  {
    link_type: "precedes_FS_Mandatory_scope",
    in_type: "initiative",
    out_type: "initiative",
  },
  {
    link_type: "precedes_FF_Discretionary_scope",
    in_type: "initiative",
    out_type: "initiative",
  },
  {
    link_type: "supports",
    in_type: "work_scope",
    out_type: "goal",
  },
];

function createLinkScenario(): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [INITIATIVE_A, INITIATIVE_B, PROJECT, GOAL],
        links: [],
        link_types: LINK_TYPES,
        label: null,
      },
    ],
    index: 0,
  };
}

async function startLinkingFrom(page: import("@playwright/test").Page, nodeId: string) {
  await openNodeContextMenu(page, nodeId);
  await page.getByRole("button", { name: "New link" }).click();
  await expect(page.locator(".graph-link-mode-chip")).toBeVisible();
}

test.describe("click-to-connect links", () => {
  test("highlights compatible targets and dims the rest", async ({ page }) => {
    await setupPage(page, createLinkScenario());
    await startLinkingFrom(page, INITIATIVE_A.id);

    await expect(page.locator(".graph-link-mode-chip")).toContainText(
      "Choose a node to link",
    );
    await expect(page.locator(`[data-link-target-ring="${INITIATIVE_B.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-link-target-ring="${GOAL.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-link-target-ring="${PROJECT.id}"]`)).toHaveCount(0);

    await expect
      .poll(async () => getGraphNodeClasses(page, PROJECT.id))
      .toContain("link-dimmed");
    await expect
      .poll(async () => getGraphNodeClasses(page, INITIATIVE_A.id))
      .toContain("link-origin");
  });

  test("ignores invalid target clicks", async ({ page }) => {
    await setupPage(page, createLinkScenario());
    await startLinkingFrom(page, INITIATIVE_A.id);

    await tapGraphNode(page, PROJECT.id);

    await expect(page.locator(".graph-link-mode-chip")).toBeVisible();
    expect(await countCalls(page, "create_link_command")).toBe(0);
    await expect.poll(async () => getGraphEdgeIds(page)).toEqual([]);
  });

  test("opens a type popover when several link types are compatible", async ({
    page,
  }) => {
    await setupPage(page, createLinkScenario());
    await startLinkingFrom(page, INITIATIVE_A.id);
    await tapGraphNode(page, INITIATIVE_B.id);

    const dialog = page.getByRole("dialog", { name: "Link type" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#create-link-kind")).toHaveValue("precedes");
    await expect(page.getByText("precedes_FS_Mandatory_scope")).toHaveCount(0);

    await dialog.locator("#create-link-relation").selectOption("FS");
    await dialog.locator("#create-link-hardness").selectOption("Mandatory");
    await dialog.getByRole("button", { name: "Create link" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".graph-link-mode-chip")).toHaveCount(0);
    await expect
      .poll(async () => getGraphEdgeIds(page))
      .toContainEqual(expect.stringContaining("precedes_FS_Mandatory_scope"));
  });

  test("creates immediately when only one link type is compatible", async ({
    page,
  }) => {
    await setupPage(page, createLinkScenario());
    await startLinkingFrom(page, INITIATIVE_A.id);
    await tapGraphNode(page, GOAL.id);

    await expect(page.getByRole("dialog", { name: "Link type" })).toHaveCount(0);
    await expect
      .poll(async () => getGraphEdgeIds(page))
      .toContainEqual(expect.stringContaining("supports"));
    expect(await countCalls(page, "create_link_command")).toBe(1);
  });

  test("Escape and Cancel leave linking mode without creating a link", async ({
    page,
  }) => {
    await setupPage(page, createLinkScenario());
    await startLinkingFrom(page, INITIATIVE_A.id);
    await page.keyboard.press("Escape");
    await expect(page.locator(".graph-link-mode-chip")).toHaveCount(0);
    expect(await countCalls(page, "create_link_command")).toBe(0);

    await startLinkingFrom(page, INITIATIVE_A.id);
    await page.locator(".graph-link-mode-chip button", { hasText: "Cancel" }).click();
    await expect(page.locator(".graph-link-mode-chip")).toHaveCount(0);

    await startLinkingFrom(page, INITIATIVE_A.id);
    await clickGraphBackground(page);
    await expect(page.locator(".graph-link-mode-chip")).toHaveCount(0);
  });

  test("arrow keys still pan while choosing a target", async ({ page }) => {
    await setupPage(page, createLinkScenario());
    await startLinkingFrom(page, INITIATIVE_A.id);

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const bridge = (window as unknown as {
            __TEST__?: { graphPan?: () => { x: number; y: number } };
          }).__TEST__;
          return typeof bridge?.graphPan === "function";
        });
      })
      .toBe(true);

    const before = await getGraphPan(page);
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(500);
    await page.keyboard.up("ArrowRight");
    const after = await getGraphPan(page);

    expect(Math.abs(after.x - before.x)).toBeGreaterThan(0);
    await expect(page.locator(".graph-link-mode-chip")).toBeVisible();
  });

  test("undo and redo reverse a created link", async ({ page }) => {
    await setupPage(page, createLinkScenario());
    await startLinkingFrom(page, INITIATIVE_A.id);
    await tapGraphNode(page, GOAL.id);
    await expect
      .poll(async () => getGraphEdgeIds(page))
      .toContainEqual(expect.stringContaining("supports"));

    await waitForUndoReady(page);
    await page.keyboard.press("Control+z");
    await expect.poll(async () => getGraphEdgeIds(page)).toEqual([]);

    await page.keyboard.press("Control+Shift+z");
    await expect
      .poll(async () => getGraphEdgeIds(page))
      .toContainEqual(expect.stringContaining("supports"));
  });
});
