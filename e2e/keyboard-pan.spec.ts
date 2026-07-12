import {
  expect,
  getGraphPan,
  reloadApp,
  setupPage,
  test,
  type Scenario,
} from "./support/fixtures";

const PROJECT = { id: "project/billing", type: "project" };
const GOAL = { id: "goal/reduce-churn", type: "goal" };

function graphScenario(settings?: Scenario["settings"]): Scenario {
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
    settings,
  };
}

async function waitForGraphPan(page: import("@playwright/test").Page) {
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

test.describe("keyboard pan", () => {
  test("arrow keys pan the graph", async ({ page }) => {
    await setupPage(page, graphScenario());
    await waitForGraphPan(page);

    const before = await getGraphPan(page);

    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(600);
    await page.keyboard.up("ArrowRight");

    const after = await getGraphPan(page);
    expect(after.x).toBeLessThan(before.x);
  });

  test("pan speed ramps up instead of jumping to max speed immediately", async ({
    page,
  }) => {
    await setupPage(page, graphScenario({ max_pan_speed: 1200 }));
    await waitForGraphPan(page);

    await page.keyboard.down("ArrowRight");

    const earlyPan = await getGraphPan(page);
    await page.waitForTimeout(80);
    const midPan = await getGraphPan(page);
    await page.waitForTimeout(420);
    const latePan = await getGraphPan(page);

    await page.keyboard.up("ArrowRight");

    const earlyDelta = earlyPan.x - midPan.x;
    const lateDelta = midPan.x - latePan.x;

    expect(earlyDelta).toBeGreaterThan(0);
    expect(lateDelta).toBeGreaterThan(earlyDelta * 1.5);
  });

  test("max pan speed comes from global settings", async ({ page }) => {
    await setupPage(page, graphScenario({ max_pan_speed: 180 }));
    await waitForGraphPan(page);
    await page.locator(".graph-viewport").click();

    const slowBefore = await getGraphPan(page);
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(700);
    await page.keyboard.up("ArrowRight");
    const slowAfter = await getGraphPan(page);
    const slowDistance = Math.abs(slowAfter.x - slowBefore.x);
    expect(slowDistance).toBeGreaterThan(0);

    await reloadApp(page, graphScenario({ max_pan_speed: 1800 }));
    await waitForGraphPan(page);
    await expect
      .poll(async () => {
        const calls = await page.evaluate(() => {
          const bridge = (window as unknown as {
            __TEST__?: { calls?: Array<{ cmd: string }> };
          }).__TEST__;
          return bridge?.calls?.filter((call) => call.cmd === "load_settings_command").length ?? 0;
        });
        return calls >= 1;
      })
      .toBe(true);
    await page.locator(".graph-viewport").click();

    const fastBefore = await getGraphPan(page);
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(700);
    await page.keyboard.up("ArrowRight");
    const fastAfter = await getGraphPan(page);
    const fastDistance = Math.abs(fastAfter.x - fastBefore.x);

    expect(fastDistance).toBeGreaterThan(slowDistance * 1.5);
  });
});
