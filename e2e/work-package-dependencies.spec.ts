import {
  countCalls,
  expect,
  getCalls,
  getGraphNodeClasses,
  openWorkPackageGraph,
  selectNode,
  setupPage,
  tapGraphNode,
  test,
  waitForCompoundGraphReady,
} from "./support/fixtures";
import {
  COMPOUND_CREATE_LAYOUT,
  PROJECT,
  WP_LEAF,
  WP_PARENT,
  createScenario,
} from "./support/work-package-create-scenario";

async function lastCall(page: Parameters<typeof getCalls>[0], cmd: string) {
  const calls = await getCalls(page);
  return [...calls].reverse().find((call) => call.cmd === cmd) as
    | { cmd: string; args?: { request?: Record<string, unknown> } }
    | undefined;
}

async function openDependencyEditor(page: import("@playwright/test").Page) {
  await setupPage(page, createScenario({ layout: COMPOUND_CREATE_LAYOUT }));
  await openWorkPackageGraph(page, PROJECT.id);
  await waitForCompoundGraphReady(page, WP_PARENT.id, [WP_LEAF.id]);
  await selectNode(page, WP_PARENT.id, { waitForEdit: true });
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".graph-link-mode-chip")).toContainText(
    "Click a work package to add or remove",
  );
}

test.describe("work package dependency picking", () => {
  test("toggles a graph node into the selected list and saves it", async ({
    page,
  }) => {
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });

    await openDependencyEditor(page);

    await expect
      .poll(async () => getGraphNodeClasses(page, WP_PARENT.id))
      .toContain("link-origin");
    await expect
      .poll(async () => getGraphNodeClasses(page, WP_LEAF.id))
      .toContain("link-target");
    await expect(page.locator(`[data-link-target-ring="${WP_LEAF.id}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-dep-selected-ring="${WP_LEAF.id}"]`)).toHaveCount(0);

    await tapGraphNode(page, WP_LEAF.id);

    await expect(page.locator(".node-detail-title")).toHaveText("wp-invoicing");
    await expect(page.locator(".wp-dependency-selected")).toContainText("wp-pdf-export");
    await expect(page.locator(".wp-dependencies-empty")).toHaveCount(0);
    expect(dialogs).toEqual([]);

    await expect
      .poll(async () => getGraphNodeClasses(page, WP_LEAF.id))
      .toContain("dep-selected");
    const selectedRing = page.locator(`[data-dep-selected-ring="${WP_LEAF.id}"]`);
    await expect(selectedRing).toBeVisible();
    await expect(selectedRing).toHaveCSS("border-top-color", "rgb(74, 222, 128)");
    await expect(selectedRing).toHaveCSS("animation-name", "link-target-pulse");

    await page.getByRole("button", { name: "Save" }).click();
    await expect
      .poll(async () => countCalls(page, "update_work_package_command"))
      .toBe(1);
    const call = await lastCall(page, "update_work_package_command");
    expect(call?.args?.request?.dependencies).toEqual(["wp-pdf-export"]);
  });

  test("tapping a selected dependency removes it", async ({ page }) => {
    await openDependencyEditor(page);
    await tapGraphNode(page, WP_LEAF.id);
    await expect(page.locator(".wp-dependency-selected")).toContainText("wp-pdf-export");

    await tapGraphNode(page, WP_LEAF.id);

    await expect(page.locator(".wp-dependencies-empty")).toContainText("None selected.");
    await expect(page.locator(".wp-dependency-selected")).toHaveCount(0);
    await expect(page.locator(`[data-dep-selected-ring="${WP_LEAF.id}"]`)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("Add combobox can add a hidden or unselected title", async ({ page }) => {
    await openDependencyEditor(page);

    await page.getByRole("combobox", { name: "Add" }).fill("pdf");
    await page.getByRole("option", { name: "wp-pdf-export" }).click();

    await expect(page.locator(".wp-dependency-selected")).toContainText("wp-pdf-export");
  });

  test("prompts before discarding unsaved dependency changes", async ({ page }) => {
    await openDependencyEditor(page);
    await tapGraphNode(page, WP_LEAF.id);
    await expect(page.locator(".wp-dependency-selected")).toContainText("wp-pdf-export");

    const sidebar = page.getByRole("complementary", { name: "Node details" });
    await page.getByRole("button", { name: "Close node details" }).click();
    await expect(sidebar).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Close node details" }).click();
    await expect(sidebar).toHaveCount(0);
  });
});
