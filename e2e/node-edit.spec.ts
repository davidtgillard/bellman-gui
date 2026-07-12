import {
  countCalls,
  expect,
  openNodeContextMenu,
  selectNode,
  setupPage,
  test,
  type NodeDetailFixture,
  type Scenario,
} from "./support/fixtures";

const PROJECT = { id: "project/billing-redesign", type: "project" };
const GOAL = { id: "goal/reduce-churn", type: "goal" };
const WP_INVOICING = { id: "project/billing-redesign/wp-invoicing", type: "work_package" };
const WP_PDF = { id: "project/billing-redesign/wp-pdf-export", type: "work_package" };
const PARENT_LINK = {
  id: "parent_of--invoicing--pdf",
  link_type: "parent_of",
  source: WP_INVOICING.id,
  target: WP_PDF.id,
};

const GOAL_DETAIL: NodeDetailFixture = {
  node_id: GOAL.id,
  node_type: "goal",
  title: "reduce-churn",
  markdown: "# Reduce churn\n\nLower churn.\n\n## Metric\n\n3.5%",
  source_path: "/roadmap/goals/reduce-churn.md",
  work_package: null,
};

const WP_DETAIL: NodeDetailFixture = {
  node_id: WP_INVOICING.id,
  node_type: "work_package",
  title: "wp-invoicing",
  markdown: "# wp-invoicing\n\nRebuild invoicing.",
  source_path: "/roadmap/projects/billing-redesign/work-packages.yaml",
  work_package: {
    project: "billing-redesign",
    title: "wp-invoicing",
    description: "Rebuild invoicing.",
    dependencies: [],
    available_titles: ["wp-invoicing", "wp-pdf-export"],
  },
};

function goalScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [PROJECT, GOAL],
        links: [],
        link_types: [],
        label: null,
      },
    ],
    index: 0,
    nodeDetail: GOAL_DETAIL,
    ...overrides,
  };
}

function workPackageScenario(): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [PROJECT, GOAL, WP_INVOICING, WP_PDF],
        links: [PARENT_LINK],
        link_types: [],
        label: null,
      },
    ],
    index: 0,
    nodeDetails: {
      [WP_INVOICING.id]: WP_DETAIL,
    },
  };
}

async function replaceEditorContent(
  page: import("@playwright/test").Page,
  text: string,
): Promise<void> {
  const content = page.locator(".cm-content");
  await content.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) {
      await page.keyboard.press("Enter");
    }
    if (lines[i].length > 0) {
      await page.keyboard.type(lines[i]);
    }
  }
}

test.describe("node content editing", () => {
  test("opens the markdown editor for an editable node", async ({ page }) => {
    await setupPage(page, goalScenario());
    await selectNode(page, GOAL.id, { waitForEdit: true });

    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.locator(".cm-content")).toBeVisible();
  });

  test("hides Edit on a read-only roadmap", async ({ page }) => {
    await setupPage(
      page,
      goalScenario({
        states: [
          {
            root: "/roadmap",
            editable: false,
            nodes: [PROJECT, GOAL],
            links: [],
            link_types: [],
            label: null,
          },
        ],
      }),
    );
    await selectNode(page, GOAL.id);

    await expect(
      page.getByRole("complementary", { name: "Node details" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  });

  test("blocks saving while validation fails and re-enables when fixed", async ({
    page,
  }) => {
    await setupPage(page, goalScenario());
    await selectNode(page, GOAL.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    await replaceEditorContent(page, "Just body text without a heading");

    const saveButton = page.getByRole("button", { name: "Save" });
    await expect(
      page.getByText("first line must be a level-1 heading", { exact: false }),
    ).toBeVisible();
    await expect(saveButton).toBeDisabled();
    expect(await countCalls(page, "save_node_markdown_command")).toBe(0);

    await replaceEditorContent(page, "# Reduce churn\n\nUpdated body.");
    await expect(saveButton).toBeEnabled();
  });

  test("previews rendered markdown without leaving edit mode", async ({ page }) => {
    await setupPage(page, goalScenario());
    await selectNode(page, GOAL.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.locator(".cm-content")).toBeVisible();

    await page.getByRole("button", { name: "Preview" }).click();

    await expect(page.locator(".cm-content")).toHaveCount(0);
    const preview = page.locator(".node-editor-preview");
    await expect(preview).toBeVisible();
    await expect(preview.getByRole("heading", { name: "Reduce churn" })).toBeVisible();
    // Still editing: Save/Cancel remain available.
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.locator(".cm-content")).toBeVisible();
  });

  test("saves valid edits and returns to the rendered view", async ({ page }) => {
    await setupPage(page, goalScenario());
    await selectNode(page, GOAL.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    const content = page.locator(".cm-content");
    await content.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" updated");

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.locator(".cm-content")).toHaveCount(0);
    await expect(page.locator(".node-detail-markdown")).toContainText("updated");
    expect(await countCalls(page, "save_node_markdown_command")).toBe(1);
  });

  test("allows saving despite non-blocking warnings", async ({ page }) => {
    await setupPage(page, goalScenario());
    await selectNode(page, GOAL.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    await replaceEditorContent(page, "# Different heading\n\nBody text.");

    await expect(
      page.getByText("doesn't match the node id", { exact: false }),
    ).toBeVisible();
    const saveButton = page.getByRole("button", { name: "Save" });
    await expect(saveButton).toBeEnabled();

    await saveButton.click();
    expect(await countCalls(page, "save_node_markdown_command")).toBe(1);
  });

  test("surfaces a backend save failure and keeps editing", async ({ page }) => {
    await setupPage(
      page,
      goalScenario({ saveError: "bellman sync failed: boom" }),
    );
    await selectNode(page, GOAL.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    const content = page.locator(".cm-content");
    await content.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" updated");

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("bellman sync failed: boom")).toBeVisible();
    await expect(page.locator(".cm-content")).toBeVisible();
  });

  test("prompts before discarding unsaved edits when closing", async ({ page }) => {
    await setupPage(page, goalScenario());
    await selectNode(page, GOAL.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    const content = page.locator(".cm-content");
    await content.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" dirty change");

    const sidebar = page.getByRole("complementary", { name: "Node details" });

    // Default Playwright behavior dismisses the confirm dialog: panel stays open.
    await page.getByRole("button", { name: "Close node details" }).click();
    await expect(sidebar).toBeVisible();

    // Accepting the confirm dialog closes the panel.
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Close node details" }).click();
    await expect(sidebar).toHaveCount(0);
  });

  test("edits a work package through the structured form", async ({ page }) => {
    await setupPage(page, workPackageScenario());

    await openNodeContextMenu(page, PROJECT.id);
    await page.getByRole("button", { name: "Show work package graph" }).click();
    await expect(page.locator(".graph-view-breadcrumb")).toBeVisible();

    await selectNode(page, WP_INVOICING.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    const description = page.getByRole("textbox");
    await description.fill("Rebuild invoicing with credits.");

    const saveButton = page.getByRole("button", { name: "Save" });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    expect(await countCalls(page, "update_work_package_command")).toBe(1);
  });

  test("undo after a content save issues an undo command", async ({ page }) => {
    await setupPage(page, goalScenario());
    await selectNode(page, GOAL.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    const content = page.locator(".cm-content");
    await content.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" updated");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".cm-content")).toHaveCount(0);

    await page.keyboard.press("Control+z");
    expect(await countCalls(page, "undo_command")).toBe(1);
  });
});
