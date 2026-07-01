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

export interface Scenario {
  states: RoadmapState[];
  index?: number;
  settings?: {
    max_pan_speed?: number;
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

export { test, expect };
