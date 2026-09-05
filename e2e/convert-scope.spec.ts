import {
  expect,
  openNodeContextMenu,
  setupPage,
  test,
  type Scenario,
} from "./support/fixtures";

const INITIATIVE = { id: "initiative/explore-ml-ranking", type: "initiative" };
const PROJECT_EMPTY = { id: "project/empty", type: "project" };
const PROJECT_WITH_WORK_PACKAGES = {
  id: "project/billing-redesign",
  type: "project",
};
const MILESTONE = { id: "milestone/ga-release", type: "milestone" };
const GOAL = { id: "goal/reduce-churn", type: "goal" };
const WORK_PACKAGE_PARENT = {
  id: "project/billing-redesign/wp-invoicing",
  type: "work_package",
};
const WORK_PACKAGE_LEAF = {
  id: "project/billing-redesign/wp-pdf-export",
  type: "work_package",
};
const PARENT_LINK = {
  id: "parent_of--invoicing--pdf",
  link_type: "parent_of",
  source: WORK_PACKAGE_PARENT.id,
  target: WORK_PACKAGE_LEAF.id,
};

function convertScopeScenario(): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [
          INITIATIVE,
          PROJECT_EMPTY,
          PROJECT_WITH_WORK_PACKAGES,
          MILESTONE,
          GOAL,
          WORK_PACKAGE_PARENT,
          WORK_PACKAGE_LEAF,
        ],
        links: [PARENT_LINK],
        link_types: [],
        label: null,
      },
    ],
    index: 0,
  };
}

test.describe("convert initiative and project context menu", () => {
  test("offers convert to project on initiatives", async ({ page }) => {
    await setupPage(page, convertScopeScenario());
    await openNodeContextMenu(page, INITIATIVE.id);

    await expect(page.getByRole("button", { name: "Convert to project" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Convert to initiative" })).toHaveCount(0);
  });

  test("offers convert to initiative on projects", async ({ page }) => {
    await setupPage(page, convertScopeScenario());
    await openNodeContextMenu(page, PROJECT_EMPTY.id);

    await expect(page.getByRole("button", { name: "Convert to initiative" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Convert to project" })).toHaveCount(0);
  });

  test("hides convert items for other node kinds", async ({ page }) => {
    await setupPage(page, convertScopeScenario());

    await openNodeContextMenu(page, MILESTONE.id);
    await expect(page.getByRole("button", { name: "Convert to project" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Convert to initiative" })).toHaveCount(0);

    await openNodeContextMenu(page, GOAL.id);
    await expect(page.getByRole("button", { name: "Convert to project" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Convert to initiative" })).toHaveCount(0);
  });

  test("hides convert items inside the work package graph", async ({ page }) => {
    await setupPage(page, convertScopeScenario());
    await openNodeContextMenu(page, PROJECT_WITH_WORK_PACKAGES.id);
    await page.getByRole("button", { name: "Show work package graph" }).click();
    await expect(page.locator(".graph-view-breadcrumb")).toBeVisible();

    await openNodeContextMenu(page, WORK_PACKAGE_PARENT.id);
    await expect(page.getByRole("button", { name: "Convert to project" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Convert to initiative" })).toHaveCount(0);
  });

  test("converts an initiative to a project", async ({ page }) => {
    await setupPage(page, convertScopeScenario());
    await openNodeContextMenu(page, INITIATIVE.id);
    await page.getByRole("button", { name: "Convert to project" }).click();

    await openNodeContextMenu(page, "project/explore-ml-ranking");
    await expect(page.getByRole("button", { name: "Convert to initiative" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show work package graph" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Convert to project" })).toHaveCount(0);
  });

  test("demotes an empty project without a confirm dialog", async ({ page }) => {
    await setupPage(page, convertScopeScenario());
    await openNodeContextMenu(page, PROJECT_EMPTY.id);
    await page.getByRole("button", { name: "Convert to initiative" }).click();

    await openNodeContextMenu(page, "initiative/empty");
    await expect(page.getByRole("button", { name: "Convert to project" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show work package graph" })).toHaveCount(0);
  });

  test("confirms before demoting a project with work packages", async ({ page }) => {
    await setupPage(page, convertScopeScenario());
    await openNodeContextMenu(page, PROJECT_WITH_WORK_PACKAGES.id);

    // Default Playwright behavior dismisses the confirm dialog: project stays.
    await page.getByRole("button", { name: "Convert to initiative" }).click();
    await openNodeContextMenu(page, PROJECT_WITH_WORK_PACKAGES.id);
    await expect(page.getByRole("button", { name: "Convert to initiative" })).toBeVisible();

    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain("work packages will be parked");
      void dialog.accept();
    });
    await page.getByRole("button", { name: "Convert to initiative" }).click();

    await openNodeContextMenu(page, "initiative/billing-redesign");
    await expect(page.getByRole("button", { name: "Convert to project" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show work package graph" })).toHaveCount(0);
  });
});
