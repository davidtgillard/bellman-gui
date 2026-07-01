import {
  expect,
  openNodeContextMenu,
  setupPage,
  test,
  type Scenario,
} from "./support/fixtures";

const PROJECT_EMPTY = { id: "project--empty", type: "project" };
const PROJECT_WITH_WORK_PACKAGES = {
  id: "project--billing-redesign",
  type: "project",
};
const WORK_PACKAGE_PARENT = {
  id: "billing-redesign--wp-invoicing",
  type: "work_package",
};
const WORK_PACKAGE_LEAF = {
  id: "billing-redesign--wp-pdf-export",
  type: "work_package",
};
const PARENT_LINK = {
  id: "parent_of--invoicing--pdf",
  link_type: "parent_of",
  source: WORK_PACKAGE_PARENT.id,
  target: WORK_PACKAGE_LEAF.id,
};

function innerGraphMenuScenario(): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [
          PROJECT_EMPTY,
          PROJECT_WITH_WORK_PACKAGES,
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

test.describe("inner graph context menu", () => {
  test("disables work package graph for projects with no work packages", async ({
    page,
  }) => {
    await setupPage(page, innerGraphMenuScenario());
    await openNodeContextMenu(page, PROJECT_EMPTY.id);

    const menuItem = page.getByRole("button", { name: "Show work package graph" });
    await expect(menuItem).toBeVisible();
    await expect(menuItem).toBeDisabled();
    await expect(menuItem).toHaveAttribute(
      "title",
      "This project has no work packages",
    );
  });

  test("enables work package graph for projects with work packages", async ({
    page,
  }) => {
    await setupPage(page, innerGraphMenuScenario());
    await openNodeContextMenu(page, PROJECT_WITH_WORK_PACKAGES.id);

    const menuItem = page.getByRole("button", { name: "Show work package graph" });
    await expect(menuItem).toBeVisible();
    await expect(menuItem).toBeEnabled();
    await expect(menuItem).not.toHaveAttribute("title");
  });

  test("opens the work package graph when the menu item is enabled", async ({
    page,
  }) => {
    await setupPage(page, innerGraphMenuScenario());
    await openNodeContextMenu(page, PROJECT_WITH_WORK_PACKAGES.id);
    await page.getByRole("button", { name: "Show work package graph" }).click();

    await expect(page.locator(".graph-view-breadcrumb")).toContainText(
      "billing-redesign work packages",
    );
  });

  test("disables inner graph for work packages with no sub-packages", async ({
    page,
  }) => {
    await setupPage(page, innerGraphMenuScenario());
    await openNodeContextMenu(page, PROJECT_WITH_WORK_PACKAGES.id);
    await page.getByRole("button", { name: "Show work package graph" }).click();
    await expect(page.locator(".graph-view-breadcrumb")).toBeVisible();

    await openNodeContextMenu(page, WORK_PACKAGE_LEAF.id);

    const menuItem = page.getByRole("button", { name: "Show inner graph" });
    await expect(menuItem).toBeVisible();
    await expect(menuItem).toBeDisabled();
    await expect(menuItem).toHaveAttribute(
      "title",
      "This work package has no sub-packages",
    );
  });

  test("enables inner graph for work packages with sub-packages", async ({
    page,
  }) => {
    await setupPage(page, innerGraphMenuScenario());
    await openNodeContextMenu(page, PROJECT_WITH_WORK_PACKAGES.id);
    await page.getByRole("button", { name: "Show work package graph" }).click();
    await expect(page.locator(".graph-view-breadcrumb")).toBeVisible();

    await openNodeContextMenu(page, WORK_PACKAGE_PARENT.id);

    const menuItem = page.getByRole("button", { name: "Show inner graph" });
    await expect(menuItem).toBeVisible();
    await expect(menuItem).toBeEnabled();
    await expect(menuItem).not.toHaveAttribute("title");
  });

  test("opens the inner graph when the menu item is enabled", async ({ page }) => {
    await setupPage(page, innerGraphMenuScenario());
    await openNodeContextMenu(page, PROJECT_WITH_WORK_PACKAGES.id);
    await page.getByRole("button", { name: "Show work package graph" }).click();
    await openNodeContextMenu(page, WORK_PACKAGE_PARENT.id);
    await page.getByRole("button", { name: "Show inner graph" }).click();

    await expect(page.locator(".graph-view-breadcrumb")).toContainText("wp-invoicing");
  });
});
