import { describe, expect, it } from "vitest";
import {
  KeyboardPanController,
  PAN_RAMP_UP_MS,
  shouldAllowKeyboardPan,
} from "./keyboard-pan";

describe("KeyboardPanController", () => {
  it("ramps pan speed from zero instead of starting at max speed", () => {
    const controller = new KeyboardPanController({
      maxSpeed: 1000,
      rampUpMs: PAN_RAMP_UP_MS,
    });

    controller.keyDown("right");
    controller.beginHold(0);

    expect(controller.currentSpeed(0)).toBe(0);
    expect(controller.currentSpeed(PAN_RAMP_UP_MS / 2)).toBe(500);
    expect(controller.currentSpeed(PAN_RAMP_UP_MS)).toBe(1000);
    expect(controller.currentSpeed(PAN_RAMP_UP_MS * 2)).toBe(1000);
  });

  it("pans in the direction of held arrow keys", () => {
    const controller = new KeyboardPanController({
      maxSpeed: 1000,
      rampUpMs: 100,
    });

    controller.keyDown("right");
    controller.beginHold(0);

    const early = controller.tick(50);
    expect(early.dx).toBeLessThan(0);
    expect(early.dy).toBe(0);

    const late = controller.tick(200);
    expect(late.dx).toBeLessThan(0);
    expect(Math.abs(late.dx)).toBeGreaterThan(Math.abs(early.dx));
  });

  it("respects updated max speed settings", () => {
    const controller = new KeyboardPanController({
      maxSpeed: 1000,
      rampUpMs: 100,
    });

    controller.keyDown("right");
    controller.beginHold(0);
    const fast = controller.tick(200);

    controller.clear();
    controller.setMaxSpeed(200);
    controller.keyDown("right");
    controller.beginHold(0);
    const slow = controller.tick(200);

    expect(Math.abs(slow.dx)).toBeLessThan(Math.abs(fast.dx));
  });

  it("stops panning when keys are released", () => {
    const controller = new KeyboardPanController({
      maxSpeed: 1000,
      rampUpMs: 100,
    });

    controller.keyDown("right");
    controller.beginHold(0);
    controller.tick(200);
    controller.keyUp("right");

    expect(controller.isActive()).toBe(false);
    expect(controller.tick(250)).toEqual({ dx: 0, dy: 0 });
  });
});

describe("shouldAllowKeyboardPan", () => {
  it("allows pan for ordinary event targets", () => {
    const event = { target: {} } as KeyboardEvent;
    expect(shouldAllowKeyboardPan(event)).toBe(true);
  });
});
