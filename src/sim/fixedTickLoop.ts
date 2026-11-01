import { MAX_CATCHUP_TICKS } from '../data/config';

/**
 * Runs a callback at a fixed rate, independent of the render frame rate.
 *
 * It owns its own timer (setInterval) rather than piggy-backing on the render
 * ticker, and uses a time accumulator so the long-run tick rate is exact even
 * when the timer fires irregularly. After a long stall (e.g. tab in the
 * background) it processes at most MAX_CATCHUP_TICKS and drops the rest.
 */
export class FixedTickLoop {
  readonly stepMs: number;
  private accumulator = 0;
  private last = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    ticksPerSecond: number,
    private readonly onTick: () => void,
  ) {
    this.stepMs = 1000 / ticksPerSecond;
  }

  start(): void {
    if (this.timer !== null) return;
    this.last = performance.now();
    this.accumulator = 0;
    // Poll a few times per step so ticks are not delayed by timer jitter.
    this.timer = setInterval(() => this.pump(), Math.max(4, this.stepMs / 4));
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Fraction (0..1) of the way to the next tick; handy for render interpolation later. */
  get alpha(): number {
    return Math.min(1, this.accumulator / this.stepMs);
  }

  private pump(): void {
    const now = performance.now();
    this.accumulator += now - this.last;
    this.last = now;

    let steps = 0;
    while (this.accumulator >= this.stepMs) {
      if (steps >= MAX_CATCHUP_TICKS) {
        this.accumulator = 0;
        break;
      }
      this.onTick();
      this.accumulator -= this.stepMs;
      steps++;
    }
  }
}
