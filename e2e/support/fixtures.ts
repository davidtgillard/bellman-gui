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
export async function selectNode(page: Page, nodeId: string): Promise<void> {
  await waitForGraph(page);
  await expect
    .poll(async () => {
      return page.evaluate((id) => {
        const bridge = (window as unknown as {
          __TEST__?: { selectNode?: (nodeId: string) => void };
        }).__TEST__;
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

export { test, expect };
