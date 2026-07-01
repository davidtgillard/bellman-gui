export type PanDirection = "up" | "down" | "left" | "right";

export interface KeyboardPanOptions {
  maxSpeed: number;
  rampUpMs: number;
}

export const PAN_RAMP_UP_MS = 400;

export class KeyboardPanController {
  private readonly pressed = new Set<PanDirection>();
  private holdStartMs: number | null = null;
  private lastTickMs: number | null = null;

  constructor(private options: KeyboardPanOptions) {}

  setMaxSpeed(maxSpeed: number): void {
    this.options.maxSpeed = maxSpeed;
  }

  keyDown(direction: PanDirection): void {
    if (this.pressed.size === 0) {
      this.holdStartMs = null;
      this.lastTickMs = null;
    }
    this.pressed.add(direction);
  }

  beginHold(nowMs: number): void {
    if (this.pressed.size === 0 || this.holdStartMs !== null) {
      return;
    }
    this.holdStartMs = nowMs;
    this.lastTickMs = nowMs;
  }

  keyUp(direction: PanDirection): void {
    this.pressed.delete(direction);
    if (this.pressed.size === 0) {
      this.holdStartMs = null;
      this.lastTickMs = null;
    }
  }

  clear(): void {
    this.pressed.clear();
    this.holdStartMs = null;
    this.lastTickMs = null;
  }

  isActive(): boolean {
    return this.pressed.size > 0;
  }

  currentSpeed(nowMs: number): number {
    if (!this.isActive() || this.holdStartMs === null) {
      return 0;
    }
    const holdMs = nowMs - this.holdStartMs;
    const ramp = Math.min(1, holdMs / this.options.rampUpMs);
    return this.options.maxSpeed * ramp;
  }

  tick(nowMs: number): { dx: number; dy: number } {
    if (!this.isActive()) {
      return { dx: 0, dy: 0 };
    }

    if (this.holdStartMs === null) {
      this.beginHold(nowMs);
      return { dx: 0, dy: 0 };
    }

    const previousTickMs = this.lastTickMs ?? nowMs;
    const deltaMs = nowMs - previousTickMs;
    this.lastTickMs = nowMs;

    const speed = this.currentSpeed(nowMs);
    const distance = (speed * deltaMs) / 1000;

    let dx = 0;
    let dy = 0;
    if (this.pressed.has("left")) {
      dx += distance;
    }
    if (this.pressed.has("right")) {
      dx -= distance;
    }
    if (this.pressed.has("up")) {
      dy += distance;
    }
    if (this.pressed.has("down")) {
      dy -= distance;
    }

    return { dx, dy };
  }
}

export const ARROW_KEY_DIRECTIONS: Record<string, PanDirection> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

export function isArrowPanKey(key: string): key is keyof typeof ARROW_KEY_DIRECTIONS {
  return key in ARROW_KEY_DIRECTIONS;
}

export function shouldIgnoreKeyboardPanTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true'], [role='dialog']"),
  );
}
