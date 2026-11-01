import {
  CONVEYOR_STEP,
  GENERATOR_BURN_TICKS,
  GENERATOR_MAX_COAL,
  GENERATOR_POWER,
  ITEM_SPACING,
  MINER_POWER,
  MINER_TICKS,
  STORAGE_CAPACITY,
} from '../data/config';
import { storageUsed, type GameState } from '../game/state';
import { DX, DY, MATERIALS, opposite, type Building, type Conveyor, type Dir, type Material } from '../game/types';
import type { World } from '../world/world';

/** Which materials the far end of a conveyor line accepts (null = nothing takes items). */
type SinkFilter = ((m: Material) => boolean) | null;

/**
 * Deterministic game simulation. Advanced only in fixed steps by FixedTickLoop.
 * Order per tick: power -> miners -> conveyors -> storage output.
 */
export class Simulation {
  /** Number of fixed ticks processed since start. */
  tick = 0;

  private orderVersion = -1;
  private conveyorOrder: Conveyor[] = [];

  constructor(
    readonly world: World,
    readonly game: GameState,
  ) {}

  step(): void {
    this.tick++;
    if (this.orderVersion !== this.game.version) this.rebuildOrder();
    this.updatePower();
    this.updateMiners();
    this.updateConveyors();
    this.updateStorages();
  }

  // --- Power -----------------------------------------------------------------

  private updatePower(): void {
    for (const net of this.game.networks()) {
      const demand = net.miners.length * MINER_POWER;
      let supply = 0;
      for (const g of net.generators) {
        // Only burn coal while something on the network needs power.
        if (demand > 0 && g.burn <= 0 && g.fuel > 0) {
          g.fuel--;
          g.burn = GENERATOR_BURN_TICKS;
        }
        g.producing = demand > 0 && g.burn > 0;
        if (g.producing) {
          supply += GENERATOR_POWER;
          g.burn--;
        }
      }
      const ratio = demand > 0 ? Math.min(1, supply / demand) : 0;
      for (const m of net.miners) m.power = ratio;
    }
  }

  // --- Miners ----------------------------------------------------------------

  private updateMiners(): void {
    for (const b of this.game.buildings.values()) {
      if (b.kind !== 'miner') continue;
      if (b.holding && this.insert(b.x + DX[b.dir], b.y + DY[b.dir], b.holding, b.dir)) b.holding = null;
      if (b.holding || b.power <= 0) continue; // blocked output or no power: stop
      b.progress += b.power; // underpowered miners run proportionally slower
      if (b.progress >= MINER_TICKS) {
        b.progress -= MINER_TICKS;
        const ore = this.game.depositAt(b.x, b.y);
        if (!ore) continue;
        b.holding = ore;
        if (this.insert(b.x + DX[b.dir], b.y + DY[b.dir], ore, b.dir)) b.holding = null;
      }
    }
  }

  // --- Conveyors ---------------------------------------------------------------

  /** Process belts from the end of each line backwards so queues compress cleanly. */
  private rebuildOrder(): void {
    this.orderVersion = this.game.version;
    const depth = (c: Conveyor): number => {
      let d = 0;
      let cur: Building | undefined = c;
      const seen = new Set<number>();
      while (cur && cur.kind === 'conveyor' && !seen.has(cur.id)) {
        seen.add(cur.id);
        const next: Building | undefined = this.game.at(cur.x + DX[cur.dir], cur.y + DY[cur.dir]);
        if (!next || next.kind !== 'conveyor' || next.dir === opposite(cur.dir)) break;
        cur = next;
        d++;
      }
      return d;
    };
    const list: Array<[Conveyor, number]> = [];
    for (const b of this.game.buildings.values()) if (b.kind === 'conveyor') list.push([b, depth(b)]);
    list.sort((a, b) => a[1] - b[1]);
    this.conveyorOrder = list.map((e) => e[0]);
  }

  private updateConveyors(): void {
    for (const c of this.conveyorOrder) {
      const items = c.items;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const limit = i === 0 ? 1 : items[i - 1].p - ITEM_SPACING;
        const np = Math.min(it.p + CONVEYOR_STEP, limit);
        it.moving = np > it.p + 1e-6;
        if (np > it.p) it.p = np;
      }
      const front = items[0];
      if (front && front.p >= 1) {
        if (this.insert(c.x + DX[c.dir], c.y + DY[c.dir], front.kind, c.dir)) items.shift();
        else front.moving = false;
      }
    }
  }

  /**
   * Try to hand an item travelling in direction `travel` to the building at (x, y).
   * Conveyors accept from the back or sides; storages and generators only from their input side.
   */
  private insert(x: number, y: number, kind: Material, travel: Dir): boolean {
    const t = this.game.at(x, y);
    if (!t) return false;
    switch (t.kind) {
      case 'conveyor': {
        if (t.dir === opposite(travel)) return false;
        const rear = t.items[t.items.length - 1];
        if (rear && rear.p < ITEM_SPACING) return false;
        t.items.push({ kind, p: 0, from: travel, moving: true });
        return true;
      }
      case 'storage':
        if (t.dir !== travel || storageUsed(t) >= STORAGE_CAPACITY) return false;
        t.contents[kind]++;
        return true;
      case 'generator':
        if (kind !== 'coal' || t.dir !== travel || t.fuel >= GENERATOR_MAX_COAL) return false;
        t.fuel++;
        return true;
      default:
        return false;
    }
  }

  // --- Storage output ------------------------------------------------------------

  private updateStorages(): void {
    for (const s of this.game.storages()) {
      const fx = s.x + DX[s.dir];
      const fy = s.y + DY[s.dir];
      if (!this.game.at(fx, fy)) continue;
      const accepts = this.sinkFilter(fx, fy, s.dir, s.id);
      if (!accepts) continue;
      // Round-robin over the material types this line can deliver.
      for (let k = 0; k < MATERIALS.length; k++) {
        const m = MATERIALS[(s.rr + k) % MATERIALS.length];
        if (s.contents[m] <= 0 || !accepts(m)) continue;
        if (this.insert(fx, fy, m, s.dir)) {
          s.contents[m]--;
          s.rr = (s.rr + k + 1) % MATERIALS.length;
        }
        break;
      }
    }
  }

  /**
   * Follow the conveyor line starting at (x, y) to whatever it ends in, so a storage
   * only sends items the destination can use (e.g. only coal toward a generator)
   * and never dumps items onto a dead-end belt.
   */
  private sinkFilter(x: number, y: number, travel: Dir, sourceId: number): SinkFilter {
    const seen = new Set<number>();
    let t = this.game.at(x, y);
    while (t) {
      if (t.kind === 'conveyor') {
        if (t.dir === opposite(travel) || seen.has(t.id)) return null;
        seen.add(t.id);
        travel = t.dir;
        t = this.game.at(t.x + DX[travel], t.y + DY[travel]);
        continue;
      }
      if (t.kind === 'storage') return t.dir === travel && t.id !== sourceId ? () => true : null;
      if (t.kind === 'generator') return t.dir === travel ? (m) => m === 'coal' : null;
      return null;
    }
    return null;
  }
}
