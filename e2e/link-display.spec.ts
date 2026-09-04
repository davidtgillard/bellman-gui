import {
  expect,
  getGraphEdgeIds,
  openNodeContextMenu,
  selectEdge,
  setupPage,
  test,
  type Scenario,
} from "./support/fixtures";

const INITIATIVE_A = { id: "initiative/settings-manager", type: "initiative" };
const INITIATIVE_B = { id: "initiative/billing-redesign", type: "initiative" };
const PROJECT = { id: "project/billing", type: "project" };
const GOAL = { id: "goal/reduce-churn", type: "goal" };

const PRECEDES_LINK = {
  id: "precedes_FS_Mandatory_scope--settings-manager--billing-redesign",
  link_type: "precedes_FS_Mandatory_scope",
  source: INITIATIVE_B.id,
  target: INITIATIVE_A.id,
};

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

function precedesScenario(): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [INITIATIVE_A, INITIATIVE_B],
        links: [PRECEDES_LINK],
        link_types: LINK_TYPES,
        label: null,
      },
    ],
    index: 0,
  };
}

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

test.describe("link display", () => {
  test("selecting an edge opens the inspector with a human title", async ({
    page,
  }) => {
    await setupPage(page, precedesScenario());
    await selectEdge(page, PRECEDES_LINK.id);

    const inspector = page.getByRole("complementary", { name: "Link details" });
    await expect(inspector.locator(".node-detail-sidebar-title")).toHaveText(
      "Mandatory finish-to-start",
    );
    await expect(
      inspector.locator(".link-detail-fields dd", { hasText: "Finish-to-start" }),
    ).toBeVisible();
    await expect(
      inspector.locator(".link-detail-fields dd", { hasText: /^Mandatory$/ }),
    ).toBeVisible();
    await expect(page.getByText("precedes_FS_Mandatory_scope")).toHaveCount(0);
  });

  test("create-link dialog uses kind, relation, and hardness instead of raw ids", async ({
    page,
  }) => {
    await setupPage(page, createLinkScenario());
    await openNodeContextMenu(page, INITIATIVE_A.id);
    await page.getByRole("button", { name: "New link…" }).click();

    const dialog = page.getByRole("dialog", { name: "New link" });
    await expect(dialog).toBeVisible();
    await dialog.locator("#create-link-finish").selectOption(INITIATIVE_B.id);

    await expect(dialog.locator("#create-link-kind")).toHaveValue("precedes");
    await expect(dialog.locator("#create-link-relation")).toBeVisible();
    await expect(dialog.locator("#create-link-hardness")).toBeVisible();
    await expect(dialog.getByRole("option", { name: "Finish-to-start" })).toBeAttached();
    await expect(dialog.getByRole("option", { name: "Discretionary" })).toBeAttached();
    await expect(dialog.getByText("precedes_FS_Mandatory_scope")).toHaveCount(0);

    await dialog.locator("#create-link-relation").selectOption("FS");
    await dialog.locator("#create-link-hardness").selectOption("Mandatory");
    await dialog.getByRole("button", { name: "Create link" }).click();

    await expect(dialog).toHaveCount(0);
    await expect
      .poll(async () => getGraphEdgeIds(page))
      .toContainEqual(expect.stringContaining("precedes_FS_Mandatory_scope"));
  });

  test("legend includes a hardness key", async ({ page }) => {
    await setupPage(page, precedesScenario());

    const legend = page.getByRole("complementary", { name: "Node types" });
    await expect(legend.getByRole("heading", { name: "Links" })).toBeVisible();
    await expect(legend.getByText("Mandatory")).toBeVisible();
    await expect(legend.getByText("Discretionary")).toBeVisible();
    await expect(legend.getByText("Optional")).toBeVisible();
    await expect(legend.getByText("Precedence")).toBeVisible();
  });
});
