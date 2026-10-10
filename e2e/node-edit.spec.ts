import {
  countCalls,
  expect,
  getCalls,
  getGraphEdgeIds,
  openBackgroundContextMenu,
  openNodeContextMenu,
  reloadApp,
  selectNode,
  setupPage,
  test,
  type NodeDetailFixture,
  type Scenario,
} from "./support/fixtures";

const PROJECT = { id: "project/billing-redesign", type: "project" };
const REDUCE_CHURN = { id: "initiative/reduce-churn", type: "initiative" };
const WP_INVOICING = { id: "project/billing-redesign/wp-invoicing", type: "work_package" };
const WP_PDF = { id: "project/billing-redesign/wp-pdf-export", type: "work_package" };
const PARENT_LINK = {
  id: "parent_of--invoicing--pdf",
  link_type: "parent_of",
  source: WP_INVOICING.id,
  target: WP_PDF.id,
};

const ATTRIBUTE_CATALOG = [
  {
    name: "priority",
    version: "1.0",
    description: "Delivery priority.",
    applies_to: ["initiative", "project"],
    cardinality: "one",
    required: true,
    values: ["P0", "P1", "P2", "P3"],
    value_schema: null,
    assignment_schema: null,
  },
  {
    name: "goal",
    version: "1.0",
    description: "Outcome this work contributes toward.",
    applies_to: ["initiative", "project", "work_package"],
    cardinality: "many",
    required: false,
    values: {
      "reduce-churn": { title: "Reduce Churn", description: "Keep churn down." },
    },
    value_schema: { type: "object", properties: { title: { type: "string" } } },
    assignment_schema: null,
  },
  {
    name: "program",
    version: "1.0",
    description: "Large work scope.",
    applies_to: ["initiative", "project", "work_package"],
    cardinality: "many",
    required: false,
    values: { "platform-v2": { title: "Platform v2" } },
    value_schema: { type: "object", properties: { title: { type: "string" } } },
    assignment_schema: {
      type: "object",
      additionalProperties: false,
      properties: { allocation: { type: "number", minimum: 0, maximum: 1 } },
    },
  },
];

const REDUCE_CHURN_DETAIL: NodeDetailFixture = {
  node_id: REDUCE_CHURN.id,
  node_type: "initiative",
  title: "reduce-churn",
  markdown: "# Reduce churn\n\nLower churn.\n\n## Metric\n\n3.5%",
  source_path: "/roadmap/initiatives/reduce-churn.md",
  work_package: null,
};

const INITIATIVE_A = { id: "initiative/settings-manager", type: "initiative" };
const INITIATIVE_B = { id: "initiative/billing-redesign", type: "initiative" };
const PRECEDES_LINK = {
  id: "precedes_FS_Mandatory_scope--settings-manager--billing-redesign",
  link_type: "precedes_FS_Mandatory_scope",
  source: INITIATIVE_B.id,
  target: INITIATIVE_A.id,
};

const INITIATIVE_DETAIL: NodeDetailFixture = {
  node_id: INITIATIVE_A.id,
  node_type: "initiative",
  title: "settings-manager",
  markdown: `# Settings Manager

Intro.

## Dependencies

- billing-redesign [FS, Mandatory]
`,
  source_path: "/roadmap/initiatives/settings-manager.md",
  work_package: null,
};

function initiativeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [INITIATIVE_A, INITIATIVE_B],
        links: [],
        link_types: [],
        label: null,
      },
    ],
    index: 0,
    nodeDetail: INITIATIVE_DETAIL,
    ...overrides,
  };
}

const WP_DETAIL: NodeDetailFixture = {
  node_id: WP_INVOICING.id,
  node_type: "work_package",
  title: "wp-invoicing",
  markdown: "# wp-invoicing\n\nRebuild invoicing.",
  source_path: "/roadmap/projects/billing-redesign/work-packages.yaml",
  work_package: {
    role: "parent",
    project: "billing-redesign",
    title: "wp-invoicing",
    description: "Rebuild invoicing.",
    dependencies: [],
    available_titles: ["wp-invoicing", "wp-pdf-export"],
  },
};

function reduceChurnScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [PROJECT, REDUCE_CHURN],
        links: [],
        link_types: [],
        label: null,
      },
    ],
    index: 0,
    nodeDetail: REDUCE_CHURN_DETAIL,
    ...overrides,
  };
}

function workPackageScenario(): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [PROJECT, REDUCE_CHURN, WP_INVOICING, WP_PDF],
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
    await setupPage(page, reduceChurnScenario());
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });

    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.locator(".cm-content")).toBeVisible();
  });

  test("scrolls the markdown editor with the mouse wheel", async ({ page }) => {
    const longBody = Array.from(
      { length: 80 },
      (_, index) => `Line ${index + 1} of long markdown.`,
    ).join("\n");
    await setupPage(
      page,
      reduceChurnScenario({
        nodeDetail: {
          ...REDUCE_CHURN_DETAIL,
          markdown: `# Reduce churn\n\n${longBody}`,
        },
      }),
    );
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    const scroller = page.locator(".node-markdown-codemirror .cm-scroller");
    await expect(scroller).toBeVisible();

    const before = await scroller.evaluate((el) => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);

    await scroller.hover();
    await page.mouse.wheel(0, 400);

    await expect
      .poll(async () => scroller.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(before.scrollTop);
  });

  test("hides Edit on a read-only roadmap", async ({ page }) => {
    await setupPage(
      page,
      reduceChurnScenario({
        states: [
          {
            root: "/roadmap",
            editable: false,
            nodes: [PROJECT, REDUCE_CHURN],
            links: [],
            link_types: [],
            label: null,
          },
        ],
      }),
    );
    await selectNode(page, REDUCE_CHURN.id);

    await expect(
      page.getByRole("complementary", { name: "Node details" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  });

  test("blocks saving while validation fails and re-enables when fixed", async ({
    page,
  }) => {
    await setupPage(page, reduceChurnScenario());
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
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
    await setupPage(page, reduceChurnScenario());
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.locator(".cm-content")).toBeVisible();

    await page.getByRole("button", { name: "Preview" }).click();

    await expect(page.locator(".node-markdown-codemirror-hidden")).toBeAttached();
    await expect(page.locator(".cm-content")).not.toBeVisible();
    const preview = page.locator(".node-editor-preview");
    await expect(preview).toBeVisible();
    await expect(preview.getByRole("heading", { name: "Reduce churn" })).toBeVisible();
    // Still editing: Save/Cancel remain available.
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.locator(".cm-content")).toBeVisible();
  });

  test("saves valid edits and returns to the rendered view", async ({ page }) => {
    await setupPage(page, reduceChurnScenario());
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
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

  test("ctrl+s saves markdown while keeping the editor open", async ({ page }) => {
    await setupPage(page, reduceChurnScenario());
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    const content = page.locator(".cm-content");
    await content.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" via shortcut");

    await page.keyboard.press("Control+s");

    await expect(content).toBeVisible();
    await expect(content).toContainText("via shortcut");
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(await countCalls(page, "save_node_markdown_command")).toBe(1);
  });

  test("allows saving despite non-blocking warnings", async ({ page }) => {
    await setupPage(page, reduceChurnScenario());
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
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

  test("refreshes the graph after a successful initiative markdown save", async ({
    page,
  }) => {
    await setupPage(
      page,
      initiativeScenario({
        saveGraphLinks: [PRECEDES_LINK],
        saveSyncSkipped: false,
      }),
    );
    await selectNode(page, INITIATIVE_A.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    const content = page.locator(".cm-content");
    await content.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" updated");

    await page.keyboard.press("Control+s");

    await expect(content).toBeVisible();
    expect(await countCalls(page, "save_node_markdown_command")).toBe(1);
    await expect.poll(async () => getGraphEdgeIds(page)).toContain(PRECEDES_LINK.id);
  });

  test("removes a dependency edge from the graph after markdown save", async ({
    page,
  }) => {
    await setupPage(
      page,
      initiativeScenario({
        states: [
          {
            root: "/roadmap",
            editable: true,
            nodes: [INITIATIVE_A, INITIATIVE_B],
            links: [PRECEDES_LINK],
            link_types: [],
            label: null,
          },
        ],
        saveGraphLinks: [],
        saveSyncSkipped: false,
      }),
    );
    await selectNode(page, INITIATIVE_A.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    await replaceEditorContent(
      page,
      `# Settings Manager

Intro.
`,
    );

    await page.keyboard.press("Control+s");

    expect(await countCalls(page, "save_node_markdown_command")).toBe(1);
    await expect.poll(async () => getGraphEdgeIds(page)).not.toContain(PRECEDES_LINK.id);
  });

  test("shows dependency warnings without blocking save", async ({ page }) => {
    await setupPage(
      page,
      initiativeScenario({
        saveSyncSkipped: true,
        saveDependencyWarnings: [
          {
            line: null,
            message: "unknown dependency predecessor 'missing-init'",
          },
        ],
      }),
    );
    await selectNode(page, INITIATIVE_A.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    await replaceEditorContent(
      page,
      `# Settings Manager

Intro.

## Dependencies

- missing-init [FS, Mandatory]
`,
    );

    await page.keyboard.press("Control+s");

    await expect(page.locator(".cm-content")).toBeVisible();
    expect(await countCalls(page, "save_node_markdown_command")).toBe(1);
    await expect(
      page.getByText("unknown dependency predecessor", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("sync skipped until dependency issues are fixed", {
        exact: false,
      }),
    ).toBeVisible();
    await expect.poll(async () => getGraphEdgeIds(page)).toHaveLength(0);
  });

  test("surfaces a backend save failure and keeps editing", async ({ page }) => {
    await setupPage(
      page,
      reduceChurnScenario({ saveError: "bellman sync failed: boom" }),
    );
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
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
    await setupPage(page, reduceChurnScenario());
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
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

    const description = page.getByRole("textbox", { name: "Description" });
    await description.fill("Rebuild invoicing with credits.");

    const saveButton = page.getByRole("button", { name: "Save" });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    expect(await countCalls(page, "update_work_package_command")).toBe(1);
  });

  test("views and edits initiative attributes", async ({ page }) => {
    const detail: NodeDetailFixture = {
      ...REDUCE_CHURN_DETAIL,
      markdown: "# Reduce churn\n\nLower churn.\n\n## Classifications\n\n- priority: P2\n- goal: reduce-churn\n",
      catalog: ATTRIBUTE_CATALOG,
      classifications: [
        { name: "priority", value: "P2", payload: {} },
        { name: "goal", value: "reduce-churn", payload: {} },
      ],
    };
    await setupPage(page, reduceChurnScenario({ nodeDetail: detail }));
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });

    const sidebar = page.getByRole("complementary", { name: "Node details" });
    await expect(sidebar.getByText("P2")).toBeVisible();
    await expect(sidebar.locator(".classification-chip", { hasText: "Reduce Churn" })).toBeVisible();
    await expect(sidebar.getByRole("heading", { name: "Attributes" })).toHaveCount(0);

    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("group", { name: "Attributes" })).toBeVisible();
    await expect(page.locator(".cm-content")).not.toContainText("Classifications");
    await page.getByLabel("priority *").selectOption("P0");
    await page.getByRole("button", { name: "Remove Reduce Churn" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".cm-content")).toHaveCount(0);

    const saved = await getCalls(page);
    const save = [...saved].reverse().find((call) => call.cmd === "save_node_markdown_command");
    const markdown = String(
      (save?.args as { markdown?: string } | undefined)?.markdown ?? "",
    );
    expect(markdown).toContain("- priority: P0");
    expect(markdown).not.toContain("goal:");
    await expect(sidebar.getByText("P0")).toBeVisible();
    await expect(sidebar.locator(".classification-chip", { hasText: "Reduce Churn" })).toHaveCount(0);

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Add goal value").click();
    await page.getByLabel("Add goal value").press("Enter");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(sidebar.locator(".classification-chip", { hasText: "Reduce Churn" })).toBeVisible();
  });

  test("adds an open string attribute value", async ({ page }) => {
    const catalog = [
      ...ATTRIBUTE_CATALOG,
      {
        name: "objective",
        version: "1.0",
        description: "A thematic objective.",
        applies_to: ["initiative", "project"],
        cardinality: "many",
        required: false,
        values: null,
        value_schema: {},
        assignment_schema: { type: "string" },
      },
    ];
    const detail: NodeDetailFixture = {
      ...REDUCE_CHURN_DETAIL,
      catalog,
      classifications: [{ name: "priority", value: "P1", payload: {} }],
    };
    await setupPage(page, reduceChurnScenario({ nodeDetail: detail }));
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("group", { name: "Attributes" })).toBeVisible();
    await page.getByLabel("Add objective value").fill("reliability");
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByRole("button", { name: "Save" }).click();

    const saved = await getCalls(page);
    const save = [...saved].reverse().find((call) => call.cmd === "save_node_markdown_command");
    const markdown = String(
      (save?.args as { markdown?: string } | undefined)?.markdown ?? "",
    );
    expect(markdown).toContain("- objective: reliability");
  });

  test("blocks save when a required attribute is missing", async ({ page }) => {
    const detail: NodeDetailFixture = {
      ...REDUCE_CHURN_DETAIL,
      catalog: ATTRIBUTE_CATALOG,
      classifications: [],
    };
    await setupPage(page, reduceChurnScenario({ nodeDetail: detail }));
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
    await expect(page.getByText("Priority — required")).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
    await page.getByLabel("priority *").selectOption("P1");
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  test("blocks save when program allocation is outside 0 to 1", async ({ page }) => {
    await setupPage(page, {
      ...workPackageScenario(),
      nodeDetails: {
        [WP_INVOICING.id]: {
          ...WP_DETAIL,
          catalog: ATTRIBUTE_CATALOG,
          classifications: [
            {
              name: "program",
              value: "platform-v2",
              payload: { allocation: 0.5 },
              pinned_version: "1.0",
            },
          ],
        },
      },
    });
    await openNodeContextMenu(page, PROJECT.id);
    await page.getByRole("button", { name: "Show work package graph" }).click();
    await selectNode(page, WP_INVOICING.id, { waitForEdit: true });
    await expect(page.getByText("Platform v2")).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("allocation").fill("2");
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
    await expect(page.getByRole("alert")).toContainText("invalid");
    await page.getByLabel("allocation").fill("0.4");
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
    await page.getByRole("button", { name: "Save" }).click();
    const saved = await getCalls(page);
    const update = [...saved].reverse().find((call) => call.cmd === "update_work_package_command");
    const request = (update?.args as { request?: { classifications?: Array<{ payload?: { allocation?: number } }> } })
      .request;
    expect(request?.classifications?.[0]?.payload?.allocation).toBe(0.4);
  });

  test("requires priority before creating an initiative", async ({ page }) => {
    await setupPage(page, reduceChurnScenario({ attributeCatalog: ATTRIBUTE_CATALOG }));
    await openBackgroundContextMenu(page);
    await page.getByRole("button", { name: "New node…" }).click();
    await page.getByLabel("Name").fill("new-item");
    await expect(page.getByLabel("priority *")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create node" })).toBeDisabled();
    await page.getByLabel("priority *").selectOption("P1");
    await expect(page.getByRole("button", { name: "Create node" })).toBeEnabled();
    await page.getByRole("button", { name: "Create node" }).click();
    const saved = await getCalls(page);
    const create = [...saved].reverse().find((call) => call.cmd === "create_node_command");
    const request = (create?.args as { request?: { classifications?: Array<{ name: string; value: string }> } })
      .request;
    expect(request?.classifications).toEqual([
      expect.objectContaining({ name: "priority", value: "P1" }),
    ]);
  });

  test("undo after a content save issues an undo command", async ({ page }) => {
    await setupPage(page, reduceChurnScenario());
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
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

  test("ctrl+z while editing undoes text without calling undo_command", async ({
    page,
  }) => {
    await setupPage(page, reduceChurnScenario());
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    const content = page.locator(".cm-content");
    await expect(content).toBeVisible();
    await content.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" TEMP");
    await expect(content).toContainText("TEMP");

    await page.keyboard.press("Control+z");
    await expect(content).not.toContainText("TEMP");
    expect(await countCalls(page, "undo_command")).toBe(0);
  });

  test("editor undo history survives save and reopen", async ({ page }) => {
    await setupPage(page, reduceChurnScenario());
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    const content = page.locator(".cm-content");
    await content.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" SURVIVE");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".cm-content")).toHaveCount(0);
    expect(await countCalls(page, "save_node_editor_history_command")).toBe(1);

    await page.getByRole("button", { name: "Edit" }).click();
    const reopened = page.locator(".cm-content");
    await expect(reopened).toBeVisible();
    await expect(reopened).toContainText("SURVIVE");
    await reopened.click();
    await page.keyboard.press("Control+z");
    await expect(reopened).not.toContainText("SURVIVE");
    expect(await countCalls(page, "undo_command")).toBe(0);
  });

  test("editor undo history survives reload via disk", async ({ page }) => {
    const savedMarkdown = `${REDUCE_CHURN_DETAIL.markdown} RELOAD`;

    await setupPage(page, reduceChurnScenario());
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    const content = page.locator(".cm-content");
    await content.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" RELOAD");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".cm-content")).toHaveCount(0);
    expect(await countCalls(page, "save_node_editor_history_command")).toBe(1);

    await reloadApp(page, {
      ...reduceChurnScenario(),
      nodeDetail: { ...REDUCE_CHURN_DETAIL, markdown: savedMarkdown },
    });
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    const reopened = page.locator(".cm-content");
    await expect(reopened).toBeVisible();
    await expect(reopened).toContainText("RELOAD");
    await reopened.click();
    await page.keyboard.press("Control+z");
    await expect(reopened).not.toContainText("RELOAD");
    expect(await countCalls(page, "undo_command")).toBe(0);
  });

  test("editor undo history survives rename via stable GUID", async ({ page }) => {
    const savedMarkdown = `${REDUCE_CHURN_DETAIL.markdown} RENAMED`;
    const renamedId = "initiative/cut-churn";

    await setupPage(page, reduceChurnScenario());
    await selectNode(page, REDUCE_CHURN.id, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();

    const content = page.locator(".cm-content");
    await content.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" RENAMED");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".cm-content")).toHaveCount(0);

    await page.evaluate(async (nodeId) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke: (cmd: string, args: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      await internals?.invoke("rename_node_command", {
        request: {
          roadmap_root: "/roadmap",
          node_id: nodeId,
          node_type: "initiative",
          new_name: "cut-churn",
        },
      });
    }, REDUCE_CHURN.id);

    await reloadApp(page, {
      ...reduceChurnScenario(),
      states: [
        {
          root: "/roadmap",
          editable: true,
          nodes: [{ id: renamedId, type: "initiative" }],
          links: [],
        },
      ],
      nodeDetail: {
        ...REDUCE_CHURN_DETAIL,
        node_id: renamedId,
        title: "cut-churn",
        markdown: savedMarkdown,
        source_path: "/roadmap/initiatives/cut-churn.md",
      },
    });

    await selectNode(page, renamedId, { waitForEdit: true });
    await page.getByRole("button", { name: "Edit" }).click();
    const reopened = page.locator(".cm-content");
    await expect(reopened).toBeVisible();
    await expect(reopened).toContainText("RENAMED");
    await reopened.click();
    await page.keyboard.press("Control+z");
    await expect(reopened).not.toContainText("RENAMED");
    expect(await countCalls(page, "undo_command")).toBe(0);
  });
});
