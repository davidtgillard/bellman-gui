import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

const MOCK_PATH = fileURLToPath(new URL("./tauri-mock.js", import.meta.url));

export interface RoadmapState {
  root: string;
  editable: boolean;
  nodes: Array<{ id: string; type: string }>;
  links: Array<{
    id: string;
    link_type: string;
    source: string;
    target: string;
  }>;
  link_types?: Array<{ link_type: string; in_type: string; out_type: string }>;
  label?: string | null;
}

export interface NodeDetailFixture {
  node_id: string;
  node_type: string;
  title: string;
  markdown: string;
  source_path: string | null;
  work_package: {
    project: string;
    title: string;
    description: string;
    dependencies: string[];
    available_titles: string[];
  } | null;
}

export interface Scenario {
  states: RoadmapState[];
  index?: number;
  persistUndo?: boolean;
  settings?: {
    max_pan_speed?: number;
    background_pan_enabled?: boolean;
  };
  nodeDetail?: NodeDetailFixture;
  nodeDetails?: Record<string, NodeDetailFixture>;
  saveError?: string;
  layout?: {
    version: number;
    kind: string;
    top_level?: Record<string, { x: number; y: number; w?: number; h?: number }>;
    projects: Record<
      string,
      Record<string, { x: number; y: number; w?: number; h?: number }>
    >;
  };
}

export interface RecordedCall {
  cmd: string;
  args: unknown;
}

interface TestBridge {
  calls: RecordedCall[];
  reset(): void;
  emit(event: string, payload?: unknown): void;
  selectNode?: (nodeId: string) => void;
  selectGraphNodeOnly?: (nodeId: string) => void;
  tapGraphNode?: (nodeId: string) => void;
  getGraphNodeState?: (
    nodeId: string,
  ) => { x: number; y: number; w?: number; h?: number; x1?: number; y1?: number } | null;
  getCompositeChildOffsets?: (
    parentId: string,
  ) => Record<string, { dx: number; dy: number }>;
  getCompositeRenderedBox?: (
    parentId: string,
  ) => { x1: number; y1: number; x2: number; y2: number } | null;
  getGraphNodeRenderedCenter?: (nodeId: string) => { x: number; y: number };
  getGraphNodeAbsolutePosition?: (nodeId: string) => { x: number; y: number };
}

export interface GraphNodeState {
  x: number;
  y: number;
  w?: number;
  h?: number;
  x1?: number;
  y1?: number;
}

/**
 * Installs the fake Tauri IPC backend for the given scenario and loads the app.
 * @param page - Playwright page to configure.
 * @param scenario - Seed roadmap states and starting history index.
 */
export async function setupPage(page: Page, scenario: Scenario): Promise<void> {
  await page.addInitScript((seed) => {
    (window as unknown as { __TEST_SCENARIO__: unknown }).__TEST_SCENARIO__ = seed;
  }, scenario);
  await page.addInitScript({ path: MOCK_PATH });
  await page.goto("/");
}

/**
 * Re-applies test init scripts and reloads the app, simulating a new session.
 * @param page - Playwright page to reload.
 * @param scenario - Optional scenario seed for the reloaded session.
 */
export async function reloadApp(page: Page, scenario?: Scenario): Promise<void> {
  if (scenario) {
    await page.addInitScript((seed) => {
      (window as unknown as { __TEST_SCENARIO__: unknown }).__TEST_SCENARIO__ = seed;
    }, scenario);
  }
  await page.addInitScript({ path: MOCK_PATH });
  await page.reload();
}

const PERSIST_KEY_PREFIX = "bellman:undo-history:";

/**
 * Seeds persisted undo history in localStorage before the app loads.
 * @param page - Playwright page to configure.
 * @param root - Roadmap root used as the storage key suffix.
 * @param payload - Serialized undo stack `{ states, index }`.
 */
export async function seedPersistedUndo(
  page: Page,
  root: string,
  payload: { states: RoadmapState[]; index: number },
): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
    },
    { key: `${PERSIST_KEY_PREFIX}${root}`, value: payload },
  );
}

/**
 * Returns the IPC commands the app has invoked so far.
 * @param page - Playwright page to inspect.
 * @returns The recorded IPC calls in invocation order.
 */
export async function getCalls(page: Page): Promise<RecordedCall[]> {
  return page.evaluate(
    () => (window as unknown as { __TEST__: TestBridge }).__TEST__.calls,
  );
}

/**
 * Counts how many times a given IPC command has been invoked.
 * @param page - Playwright page to inspect.
 * @param cmd - The command name to count.
 * @returns Number of recorded invocations of the command.
 */
export async function countCalls(page: Page, cmd: string): Promise<number> {
  const calls = await getCalls(page);
  return calls.filter((call) => call.cmd === cmd).length;
}

/**
 * Emits a simulated backend event (e.g. the Edit-menu undo/redo events).
 * @param page - Playwright page to emit on.
 * @param event - Event name to emit.
 */
export async function emitEvent(page: Page, event: string): Promise<void> {
  await page.evaluate(
    (name) => (window as unknown as { __TEST__: TestBridge }).__TEST__.emit(name),
    event,
  );
}

/**
 * Returns the current cytoscape pan position exposed by the graph test hook.
 * @param page - Playwright page to inspect.
 */
export async function getGraphPan(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const bridge = (window as unknown as {
      __TEST__?: { graphPan?: () => { x: number; y: number } };
    }).__TEST__;
    if (!bridge?.graphPan) {
      throw new Error("graph pan test hook is unavailable");
    }
    return bridge.graphPan();
  });
}

/**
 * Waits until the graph canvas and test hooks are ready.
 * @param page - Playwright page to wait on.
 */
export async function waitForGraph(page: Page): Promise<void> {
  await expect(page.locator(".graph-viewport canvas").first()).toBeVisible();
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
}

/**
 * Drags across an empty area of the graph canvas to pan the viewport.
 * @param page - Playwright page to interact with.
 */
export async function dragGraphBackground(page: Page): Promise<void> {
  const canvas = page.locator(".graph-viewport canvas").first();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("graph canvas is not visible");
  }

  const startX = box.x + box.width * 0.08;
  const startY = box.y + box.height * 0.08;
  const endX = startX + 140;
  const endY = startY + 90;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
}

/**
 * Returns whether cytoscape background panning is currently enabled.
 * @param page - Playwright page to inspect.
 */
export async function isGraphBackgroundPanEnabled(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const bridge = (window as unknown as {
      __TEST__?: { graphUserPanningEnabled?: () => boolean };
    }).__TEST__;
    if (!bridge?.graphUserPanningEnabled) {
      throw new Error("graph user panning test hook is unavailable");
    }
    return bridge.graphUserPanningEnabled();
  });
}

/**
 * Opens the graph context menu for a node via the cytoscape test hook.
 * @param page - Playwright page to interact with.
 * @param nodeId - Roadmap node identifier.
 */
export async function openNodeContextMenu(page: Page, nodeId: string): Promise<void> {
  await waitForGraph(page);
  await expect
    .poll(async () => {
      return page.evaluate((id) => {
        const bridge = (window as unknown as {
          __TEST__?: { openNodeContextMenu?: (nodeId: string) => void };
        }).__TEST__;
        if (!bridge?.openNodeContextMenu) {
          return false;
        }
        try {
          bridge.openNodeContextMenu(id);
          return true;
        } catch {
          return false;
        }
      }, nodeId);
    })
    .toBe(true);
  await expect(page.locator(".graph-context-menu")).toBeVisible();
}

/**
 * Opens the node detail panel by simulating a graph node selection via the
 * cytoscape test hook.
 * @param page - Playwright page to interact with.
 * @param nodeId - Roadmap node identifier.
 */
export async function selectGraphNodeOnly(page: Page, nodeId: string): Promise<void> {
  await page.evaluate((id) => {
    const bridge = (window as unknown as { __TEST__: TestBridge }).__TEST__;
    if (!bridge?.selectGraphNodeOnly) {
      throw new Error("selectGraphNodeOnly test hook is unavailable");
    }
    bridge.selectGraphNodeOnly(id);
  }, nodeId);
}

export async function selectNode(page: Page, nodeId: string): Promise<void> {
  await waitForGraph(page);
  await expect
    .poll(async () => {
      return page.evaluate((id) => {
        const bridge = (window as unknown as { __TEST__: TestBridge }).__TEST__;
        if (!bridge?.selectNode) {
          return false;
        }
        try {
          bridge.selectNode(id);
          return true;
        } catch {
          return false;
        }
      }, nodeId);
    })
    .toBe(true);
  await expect(page.getByRole("complementary", { name: "Node details" })).toBeVisible();
}

/**
 * Simulates a graph node tap via the cytoscape test hook.
 * @param page - Playwright page to interact with.
 * @param nodeId - Roadmap node identifier.
 */
export async function tapGraphNode(page: Page, nodeId: string): Promise<void> {
  await waitForGraph(page);
  await expect
    .poll(async () => {
      return page.evaluate((id) => {
        const bridge = (window as unknown as { __TEST__: TestBridge }).__TEST__;
        if (!bridge?.tapGraphNode) {
          return false;
        }
        try {
          bridge.tapGraphNode(id);
          return true;
        } catch {
          return false;
        }
      }, nodeId);
    })
    .toBe(true);
}

/**
 * Returns the current model-space state for a graph node.
 * @param page - Playwright page to inspect.
 * @param nodeId - Roadmap node identifier.
 */
export async function getGraphNodeAbsolutePosition(
  page: Page,
  nodeId: string,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate((id) => {
    const bridge = (window as unknown as { __TEST__: TestBridge }).__TEST__;
    if (!bridge?.getGraphNodeAbsolutePosition) {
      return null;
    }
    return bridge.getGraphNodeAbsolutePosition(id);
  }, nodeId);
}

export async function getGraphNodeState(
  page: Page,
  nodeId: string,
): Promise<GraphNodeState | null> {
  return page.evaluate((id) => {
    const bridge = (window as unknown as { __TEST__: TestBridge }).__TEST__;
    if (!bridge?.getGraphNodeState) {
      throw new Error("graph node state test hook is unavailable");
    }
    return bridge.getGraphNodeState(id);
  }, nodeId);
}

/**
 * Returns each child's parent-relative position inside a composite.
 * @param page - Playwright page to inspect.
 * @param parentId - Composite parent node identifier.
 */
export async function getCompositeChildOffsets(
  page: Page,
  parentId: string,
): Promise<Record<string, { dx: number; dy: number }>> {
  return page.evaluate((id) => {
    const bridge = (window as unknown as { __TEST__: TestBridge }).__TEST__;
    if (!bridge?.getCompositeChildOffsets) {
      throw new Error("composite child offset test hook is unavailable");
    }
    return bridge.getCompositeChildOffsets(id);
  }, parentId);
}

/**
 * Returns the composite parent's rendered bounding box in viewport pixels.
 * @param page - Playwright page to inspect.
 * @param parentId - Composite parent node identifier.
 */
export async function getCompositeRenderedBox(
  page: Page,
  parentId: string,
): Promise<{ x1: number; y1: number; x2: number; y2: number } | null> {
  return page.evaluate((id) => {
    const bridge = (window as unknown as { __TEST__: TestBridge }).__TEST__;
    if (!bridge?.getCompositeRenderedBox) {
      throw new Error("composite rendered box test hook is unavailable");
    }
    return bridge.getCompositeRenderedBox(id);
  }, parentId);
}

/**
 * Waits until a graph node reaches the expected model-space position/size.
 * @param page - Playwright page to inspect.
 * @param nodeId - Roadmap node identifier.
 * @param expected - Expected node state subset to match.
 */
export async function waitForGraphNodeState(
  page: Page,
  nodeId: string,
  expected: GraphNodeState,
): Promise<void> {
  await expect
    .poll(async () => getGraphNodeState(page, nodeId))
    .toMatchObject(expected);
}

/**
 * Drags a graph node by screen-space delta using the rendered node centre.
 * When parentId is supplied, returns the parent composite state captured at drag start.
 * @param page - Playwright page to interact with.
 * @param nodeId - Roadmap node identifier.
 * @param deltaX - Horizontal drag distance in pixels.
 * @param deltaY - Vertical drag distance in pixels.
 * @param parentId - Optional composite parent to snapshot at drag start.
 */
export async function dragGraphNode(
  page: Page,
  nodeId: string,
  deltaX: number,
  deltaY: number,
  parentId?: string,
): Promise<GraphNodeState | null> {
  await waitForGraph(page);
  const start = await page.evaluate((id) => {
    const bridge = (window as unknown as { __TEST__: TestBridge }).__TEST__;
    if (!bridge?.getGraphNodeRenderedCenter) {
      throw new Error("graph node rendered center test hook is unavailable");
    }
    return bridge.getGraphNodeRenderedCenter(id);
  }, nodeId);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();

  const parentAtDragStart = parentId
    ? await getGraphNodeState(page, parentId)
    : null;

  await page.mouse.move(start.x + deltaX, start.y + deltaY, { steps: 12 });
  await page.mouse.up();

  return parentAtDragStart;
}

/**
 * Opens the work-package graph for a project from the graph context menu.
 * @param page - Playwright page to interact with.
 * @param projectId - Project node identifier.
 */
export async function openWorkPackageGraph(
  page: Page,
  projectId: string,
): Promise<void> {
  await openNodeContextMenu(page, projectId);
  await page.getByRole("button", { name: "Show work package graph" }).click();
  await expect(page.locator(".graph-view-breadcrumb")).toBeVisible();
  await waitForGraph(page);
}

/**
 * Moves a composite parent by model-space delta via the same path as title-bar drag.
 */
export async function dragCompositeParentByModelDelta(
  page: Page,
  parentId: string,
  dx: number,
  dy: number,
): Promise<void> {
  await page.evaluate(
    ({ id, deltaX, deltaY }) => {
      const bridge = (window as unknown as {
        __TEST__?: {
          dragCompositeParentBy?: (parentId: string, dx: number, dy: number) => void;
        };
      }).__TEST__;
      if (!bridge?.dragCompositeParentBy) {
        throw new Error("composite drag test hook is unavailable");
      }
      bridge.dragCompositeParentBy(id, deltaX, deltaY);
    },
    { id: parentId, deltaX: dx, deltaY: dy },
  );
}

/**
 * Drags the selected composite title bar by screen-space delta.
 * @param page - Playwright page to interact with.
 * @param deltaX - Horizontal drag distance in pixels.
 * @param deltaY - Vertical drag distance in pixels.
 */
export async function dragCompoundTitleBar(
  page: Page,
  deltaX: number,
  deltaY: number,
): Promise<void> {
  const handle = page.locator(".compound-drag-handle").first();
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error("compound drag handle is not visible");
  }

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 12 });
  await page.mouse.up();
}

export { test, expect };
