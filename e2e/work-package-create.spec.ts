import {
  countCalls,
  expect,
  getCalls,
  openBackgroundContextMenu,
  openNodeContextMenu,
  openWorkPackageGraph,
  selectNode,
  setupPage,
  test,
  type Scenario,
} from "./support/fixtures";

const PROJECT = { id: "project/billing-redesign", type: "project" };
const WP_PARENT = {
  id: "project/billing-redesign/wp-invoicing",
  type: "work_package",
};
const WP_LEAF = {
  id: "project/billing-redesign/wp-pdf-export",
  type: "work_package",
};
const PARENT_LINK = {
  id: "parent_of--invoicing--pdf",
  link_type: "parent_of",
  source: WP_PARENT.id,
  target: WP_LEAF.id,
};

function createScenario(): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [PROJECT, WP_PARENT, WP_LEAF],
        links: [PARENT_LINK],
        link_types: [
          {
            link_type: "parent_of",
            in_type: "work_package",
            out_type: "work_package",
          },
        ],
        label: null,
      },
    ],
    index: 0,
    nodeDetails: {
      [WP_PARENT.id]: {
        node_id: WP_PARENT.id,
        node_type: "work_package",
        title: "wp-invoicing",
        markdown: "# wp-invoicing\n\nParent package.",
        source_path: "/roadmap/projects/billing-redesign/work-packages.yaml",
        work_package: {
          project: "billing-redesign",
          title: "wp-invoicing",
          description: "Parent package.",
          dependencies: [],
          available_titles: ["wp-invoicing", "wp-pdf-export"],
          estimate: null,
        },
      },
    },
  };
}

async function lastCall(page: Parameters<typeof getCalls>[0], cmd: string) {
  const calls = await getCalls(page);
  return [...calls].reverse().find((call) => call.cmd === cmd) as
    | { cmd: string; args?: { request?: Record<string, unknown> } }
    | undefined;
}

test.describe("work package create", () => {
  test("canvas menu creates a root work package without a type selector", async ({
    page,
  }) => {
    await setupPage(page, createScenario());
    await openWorkPackageGraph(page, PROJECT.id);
    await openBackgroundContextMenu(page);

    await expect(
      page.getByRole("button", { name: "New work package…" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "New work package…" }).click();

    const dialog = page.locator(".edit-dialog");
    await expect(dialog.getByRole("heading", { name: "New work package" })).toBeVisible();
    await expect(dialog.locator("select")).toHaveCount(0);
    await dialog.getByLabel("Name").fill("wp-root-new");
    await dialog.getByRole("button", { name: "Create work package" }).click();

    await expect
      .poll(async () => countCalls(page, "create_node_command"))
      .toBe(1);
    const call = await lastCall(page, "create_node_command");
    expect(call?.args?.request).toMatchObject({
      node_kind: "work_package",
      name: "wp-root-new",
      project: "billing-redesign",
    });
    expect(call?.args?.request?.parent).toBeFalsy();
  });

  test("parent menu creates a nested child work package", async ({ page }) => {
    await setupPage(page, createScenario());
    await openWorkPackageGraph(page, PROJECT.id);
    await openNodeContextMenu(page, WP_PARENT.id);

    await page.getByRole("button", { name: "New child work package…" }).click();
    const dialog = page.locator(".edit-dialog");
    await expect(
      dialog.getByRole("heading", { name: "New child work package" }),
    ).toBeVisible();
    await expect(dialog.getByLabel("Parent")).toHaveValue("wp-invoicing");
    await dialog.getByLabel("Name").fill("wp-child-new");
    await dialog.getByRole("button", { name: "Create work package" }).click();

    await expect
      .poll(async () => countCalls(page, "create_node_command"))
      .toBe(1);
    const call = await lastCall(page, "create_node_command");
    expect(call?.args?.request).toMatchObject({
      node_kind: "work_package",
      name: "wp-child-new",
      project: "billing-redesign",
      parent: WP_PARENT.id,
    });
  });

  test("inner-graph canvas create nests under the focused work package", async ({
    page,
  }) => {
    await setupPage(page, createScenario());
    await openWorkPackageGraph(page, PROJECT.id);
    await openNodeContextMenu(page, WP_PARENT.id);
    await page.getByRole("button", { name: "Show inner graph" }).click();
    await expect(page.locator(".graph-view-breadcrumb")).toContainText("wp-invoicing");

    await openBackgroundContextMenu(page);
    await page.getByRole("button", { name: "New work package…" }).click();
    const dialog = page.locator(".edit-dialog");
    await expect(
      dialog.getByRole("heading", { name: "New child work package" }),
    ).toBeVisible();
    await dialog.getByLabel("Name").fill("wp-inner-child");
    await dialog.getByRole("button", { name: "Create work package" }).click();

    const call = await lastCall(page, "create_node_command");
    expect(call?.args?.request).toMatchObject({
      name: "wp-inner-child",
      parent: WP_PARENT.id,
    });
  });

  test("rejects invalid estimates and saves valid ones", async ({ page }) => {
    await setupPage(page, createScenario());
    await openWorkPackageGraph(page, PROJECT.id);
    await selectNode(page, WP_PARENT.id);
    await page.getByRole("button", { name: "Edit" }).click();

    await page.getByLabel("Optimistic").fill("4w");
    await page.getByLabel("Likely").fill("2w");
    await page.getByLabel("Pessimistic").fill("1w");
    await expect(page.getByRole("alert").filter({ hasText: /optimistic|ordered/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(await countCalls(page, "update_work_package_command")).toBe(0);

    await page.getByLabel("Optimistic").fill("1w");
    await page.getByLabel("Likely").fill("2w");
    await page.getByLabel("Pessimistic").fill("4w");
    await page.getByRole("button", { name: "Save" }).click();

    await expect
      .poll(async () => countCalls(page, "update_work_package_command"))
      .toBe(1);
    const call = await lastCall(page, "update_work_package_command");
    expect(call?.args?.request?.estimate).toEqual(["1w", "2w", "4w"]);
  });

  test("hides project and disables create for invalid name or estimates", async ({
    page,
  }) => {
    await setupPage(page, createScenario());
    await openWorkPackageGraph(page, PROJECT.id);
    await openBackgroundContextMenu(page);
    await page.getByRole("button", { name: "New work package…" }).click();

    const dialog = page.locator(".edit-dialog");
    await expect(dialog.getByLabel("Project")).toHaveCount(0);
    await expect(dialog.getByLabel("Optimistic")).toHaveValue("");
    await expect(dialog.getByLabel("Likely")).toHaveValue("");
    await expect(dialog.getByLabel("Pessimistic")).toHaveValue("");
    await expect(dialog.getByRole("button", { name: "Create work package" })).toBeDisabled();

    await dialog.getByLabel("Name").fill("Not Valid");
    await expect(dialog.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByRole("button", { name: "Create work package" })).toBeDisabled();

    await dialog.getByLabel("Name").fill("wp-ok");
    await dialog.getByLabel("Optimistic").fill("1w");
    await expect(dialog.getByLabel("Likely")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByRole("button", { name: "Create work package" })).toBeDisabled();

    await dialog.getByLabel("Likely").fill("2w");
    await dialog.getByLabel("Pessimistic").fill("4w");
    await expect(dialog.getByRole("button", { name: "Create work package" })).toBeEnabled();
  });

  test("shows estimate errors for zero and mixed duration suffixes while focused", async ({
    page,
  }) => {
    await setupPage(page, createScenario());
    await openWorkPackageGraph(page, PROJECT.id);
    await openBackgroundContextMenu(page);
    await page.getByRole("button", { name: "New work package…" }).click();

    const dialog = page.locator(".edit-dialog");
    await dialog.getByLabel("Name").fill("wp-ok");

    const optimistic = dialog.getByLabel("Optimistic");
    await optimistic.fill("0");
    await expect(optimistic).toHaveClass(/is-invalid/);
    await expect(
      dialog.getByRole("alert").filter({ hasText: "Duration must be greater than zero." }),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Create work package" })).toBeDisabled();

    await optimistic.fill("1w");
    await dialog.getByLabel("Likely").fill("2d");
    await dialog.getByLabel("Pessimistic").fill("4w");
    await expect(
      dialog.getByRole("alert").filter({ hasText: /same duration suffix/i }),
    ).toBeVisible();
    await expect(dialog.getByLabel("Likely")).toHaveClass(/is-invalid/);
    await expect(dialog.getByRole("button", { name: "Create work package" })).toBeDisabled();
  });
});
