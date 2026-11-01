import type { World } from '../world/world';

/**
 * Deterministic game simulation. Advanced only in fixed steps by FixedTickLoop.
 * Empty for now: machines, belts and items will update here later.
 */
export class Simulation {
  /** Number of fixed ticks processed since start. */
  tick = 0;

  constructor(readonly world: World) {}

  step(): void {
    this.tick++;
    // Future: update machines, move items on belts, etc.
  }
}
