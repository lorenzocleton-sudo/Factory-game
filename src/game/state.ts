import { LINK_RANGE, POLE_MAX_LINKS, STORAGE_CAPACITY } from '../data/config';
import { BUILD_COSTS, BUILDING_NAMES, DEPOSITS, STARTER_STORAGE, costTotal, formatAmounts } from './rules';
import {
  MATERIALS,
  type Building,
  type BuildingKind,
  type Cost,
  type Deposit,
  type Dir,
  type Generator,
  type Link,
  type Material,
  type Miner,
  type Pole,
  type Stock,
  type Storage,
} from './types';

export interface Result {
  ok: boolean;
  msg: string;
}

const ok = (msg: string): Result => ({ ok: true, msg });
const fail = (msg: string): Result => ({ ok: false, msg });

export interface PowerNetwork {
  miners: Miner[];
  generators: Generator[];
  poles: Pole[];
}

export interface PathStep {
  x: number;
  y: number;
  dir: Dir;
}

export interface PathCheck {
  /** Per step: can a conveyor go (or be re-pointed) here? */
  valid: boolean[];
  /** Number of new conveyor tiles (each costs material). */
  newTiles: number;
  /** Why the path can't be built, or null. */
  error: string | null;
  /** True when the only problem is missing materials. */
  unaffordable: boolean;
}

export interface SaveData {
  v: 1;
  nextId: number;
  buildings: Building[];
  links: Link[];
}

/**
 * All mutable game state plus the building / power rules.
 * Pure data + rules, no rendering. The Simulation advances it over time.
 */
export class GameState {
  readonly buildings = new Map<number, Building>();
  links: Link[] = [];
  nextId = 1;
  /** Bumped on every structural change (build, remove, rotate, link) so caches can refresh. */
  version = 0;
  readonly deposits: readonly Deposit[];

  private readonly tiles: (Building | undefined)[];
  private readonly depositGrid: (Material | null)[];
  private netCache: { version: number; nets: PowerNetwork[] } | null = null;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.tiles = new Array(width * height).fill(undefined);
    this.depositGrid = new Array(width * height).fill(null);
    this.deposits = DEPOSITS.filter((d) => this.inBounds(d.x, d.y));
    for (const d of this.deposits) this.depositGrid[d.y * width + d.x] = d.kind;
  }

  static createNew(width: number, height: number): GameState {
    const s = new GameState(width, height);
    const st = STARTER_STORAGE;
    s.addBuilding({
      id: s.nextId++,
      kind: 'storage',
      x: st.x,
      y: st.y,
      dir: st.dir,
      contents: { ...st.contents },
      starter: true,
      rr: 0,
    });
    return s;
  }

  // --- Queries ----------------------------------------------------------------

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  at(x: number, y: number): Building | undefined {
    return this.inBounds(x, y) ? this.tiles[y * this.width + x] : undefined;
  }

  depositAt(x: number, y: number): Material | null {
    return this.inBounds(x, y) ? this.depositGrid[y * this.width + x] : null;
  }

  storages(): Storage[] {
    const out: Storage[] = [];
    for (const b of this.buildings.values()) if (b.kind === 'storage') out.push(b);
    return out;
  }

  /** The material pool: combined contents of all storages. */
  pool(): Stock {
    const p: Stock = { iron: 0, copper: 0, coal: 0 };
    for (const s of this.storages()) for (const m of MATERIALS) p[m] += s.contents[m];
    return p;
  }

  capacity(): { used: number; total: number } {
    let used = 0;
    let total = 0;
    for (const s of this.storages()) {
      used += storageUsed(s);
      total += STORAGE_CAPACITY;
    }
    return { used, total };
  }

  /** Free storage space, optionally pretending one storage is gone. */
  freeSpace(exclude?: Building): number {
    let free = 0;
    for (const s of this.storages()) if (s !== exclude) free += Math.max(0, STORAGE_CAPACITY - storageUsed(s));
    return free;
  }

  /** What the pool is short of to pay `cost`, or null if it can pay. */
  missing(cost: Cost): Cost | null {
    const pool = this.pool();
    const miss: Cost = {};
    let any = false;
    for (const m of MATERIALS) {
      const short = (cost[m] ?? 0) - pool[m];
      if (short > 0) {
        miss[m] = short;
        any = true;
      }
    }
    return any ? miss : null;
  }

  canAfford(cost: Cost): boolean {
    return this.missing(cost) === null;
  }

  // --- Material movement --------------------------------------------------------

  private take(cost: Cost): void {
    for (const m of MATERIALS) {
      let left = cost[m] ?? 0;
      for (const s of this.storages()) {
        if (left <= 0) break;
        const n = Math.min(left, s.contents[m]);
        s.contents[m] -= n;
        left -= n;
      }
    }
  }

  /** Put up to `n` of a material into storages with space. Returns how many fit. */
  storeMaterial(kind: Material, n: number): number {
    let left = n;
    for (const s of this.storages()) {
      if (left <= 0) break;
      const fit = Math.min(left, STORAGE_CAPACITY - storageUsed(s));
      if (fit > 0) {
        s.contents[kind] += fit;
        left -= fit;
      }
    }
    return n - left;
  }

  // --- Building ------------------------------------------------------------------

  placementError(kind: BuildingKind, x: number, y: number): string | null {
    if (!this.inBounds(x, y)) return 'Outside the buildable area';
    if (this.at(x, y)) return 'That tile is already taken';
    const dep = this.depositAt(x, y);
    if (kind === 'miner' && !dep) return 'Miners must go on an ore deposit';
    if (kind !== 'miner' && dep) return 'Ore deposits are for miners only';
    return null;
  }

  /** Full validity check for a single building (placement + cost). */
  buildError(kind: BuildingKind, x: number, y: number): string | null {
    const err = this.placementError(kind, x, y);
    if (err) return err;
    const miss = this.missing(BUILD_COSTS[kind]);
    return miss ? `Missing ${formatAmounts(miss)}` : null;
  }

  place(kind: BuildingKind, x: number, y: number, dir: Dir): Result {
    const err = this.buildError(kind, x, y);
    if (err) return fail(err);
    this.take(BUILD_COSTS[kind]);
    this.addBuilding(this.makeBuilding(kind, x, y, dir));
    return ok(`Built ${BUILDING_NAMES[kind]}`);
  }

  checkConveyorPath(path: PathStep[]): PathCheck {
    const valid: boolean[] = [];
    let newTiles = 0;
    let error: string | null = null;
    for (const s of path) {
      const b = this.at(s.x, s.y);
      if (b && b.kind === 'conveyor') {
        valid.push(true); // existing belt gets re-pointed for free
        continue;
      }
      const err = this.placementError('conveyor', s.x, s.y);
      valid.push(err === null);
      if (err) error ??= err;
      else newTiles++;
    }
    let unaffordable = false;
    if (!error) {
      const per = BUILD_COSTS.conveyor;
      const cost: Cost = {};
      for (const m of MATERIALS) if (per[m]) cost[m] = per[m]! * newTiles;
      const miss = this.missing(cost);
      if (miss) {
        error = `Missing ${formatAmounts(miss)}`;
        unaffordable = true;
      }
    }
    return { valid, newTiles, error, unaffordable };
  }

  placeConveyorPath(path: PathStep[]): Result {
    if (path.length === 0) return fail('Nothing to build');
    const check = this.checkConveyorPath(path);
    if (check.error) return fail(check.error);
    const per = BUILD_COSTS.conveyor;
    const cost: Cost = {};
    for (const m of MATERIALS) if (per[m]) cost[m] = per[m]! * check.newTiles;
    this.take(cost);
    for (const s of path) {
      const b = this.at(s.x, s.y);
      if (b && b.kind === 'conveyor') b.dir = s.dir;
      else this.addBuilding(this.makeBuilding('conveyor', s.x, s.y, s.dir));
    }
    this.version++;
    const n = check.newTiles;
    return ok(n > 0 ? `Built ${n} conveyor${n === 1 ? '' : 's'}` : 'Conveyors re-routed');
  }

  remove(x: number, y: number): Result {
    const b = this.at(x, y);
    if (!b) return fail('Nothing to remove here');
    if (b.kind === 'storage' && b.starter) return fail("The starter storage can't be removed");

    const cost = BUILD_COSTS[b.kind];
    if (this.freeSpace(b) < costTotal(cost)) return fail('Not enough storage space for the refund');

    // Items held inside the building.
    const inside: Array<[Material, number]> = [];
    switch (b.kind) {
      case 'storage':
        for (const m of MATERIALS) inside.push([m, b.contents[m]]);
        break;
      case 'generator':
        inside.push(['coal', b.fuel]);
        break;
      case 'miner':
        if (b.holding) inside.push([b.holding, 1]);
        break;
      case 'conveyor':
        for (const it of b.items) inside.push([it.kind, 1]);
        break;
      case 'pole':
        break;
    }

    this.removeBuilding(b);
    for (const m of MATERIALS) if (cost[m]) this.storeMaterial(m, cost[m]!);
    let lost = 0;
    for (const [m, n] of inside) lost += n - this.storeMaterial(m, n);

    const name = BUILDING_NAMES[b.kind];
    return ok(lost > 0 ? `Removed ${name} (${lost} items lost: storage full)` : `Removed ${name}`);
  }

  // --- Power lines -------------------------------------------------------------

  isPowerNode(b: Building): b is Miner | Generator | Pole {
    return b.kind === 'miner' || b.kind === 'generator' || b.kind === 'pole';
  }

  linkCount(id: number): number {
    let n = 0;
    for (const l of this.links) if (l.a === id || l.b === id) n++;
    return n;
  }

  private linkIndex(a: number, b: number): number {
    return this.links.findIndex((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  }

  connectError(a: Building, b: Building): string | null {
    if (a === b) return 'Tap a different pole or machine';
    if (!this.isPowerNode(a) || !this.isPowerNode(b)) return 'Only poles, miners and generators take power lines';
    for (const n of [a, b]) {
      const count = this.linkCount(n.id);
      if (n.kind === 'pole' && count >= POLE_MAX_LINKS) return `Pole is full (max ${POLE_MAX_LINKS} lines)`;
      if (n.kind !== 'pole' && count >= 1) return `${BUILDING_NAMES[n.kind]} is already connected`;
    }
    if (Math.hypot(a.x - b.x, a.y - b.y) > LINK_RANGE + 1e-9) return `Too far (max ${LINK_RANGE} tiles)`;
    return null;
  }

  /** Connect two nodes, or disconnect them if they are already linked. */
  toggleLink(a: Building, b: Building): Result {
    const idx = this.linkIndex(a.id, b.id);
    if (idx >= 0) {
      this.links.splice(idx, 1);
      this.version++;
      return ok('Power line removed');
    }
    const err = this.connectError(a, b);
    if (err) return fail(err);
    this.links.push({ a: a.id, b: b.id });
    this.version++;
    return ok('Connected');
  }

  /** Connected power networks (every power node belongs to exactly one, possibly alone). */
  networks(): PowerNetwork[] {
    if (this.netCache && this.netCache.version === this.version) return this.netCache.nets;
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r)!;
      let c = x;
      while (c !== r) {
        const n = parent.get(c)!;
        parent.set(c, r);
        c = n;
      }
      return r;
    };
    for (const b of this.buildings.values()) if (this.isPowerNode(b)) parent.set(b.id, b.id);
    for (const l of this.links) {
      if (!parent.has(l.a) || !parent.has(l.b)) continue;
      parent.set(find(l.a), find(l.b));
    }
    const byRoot = new Map<number, PowerNetwork>();
    for (const b of this.buildings.values()) {
      if (!this.isPowerNode(b)) continue;
      const r = find(b.id);
      let net = byRoot.get(r);
      if (!net) {
        net = { miners: [], generators: [], poles: [] };
        byRoot.set(r, net);
      }
      if (b.kind === 'miner') net.miners.push(b);
      else if (b.kind === 'generator') net.generators.push(b);
      else net.poles.push(b);
    }
    const nets = [...byRoot.values()];
    this.netCache = { version: this.version, nets };
    return nets;
  }

  // --- Internals ----------------------------------------------------------------

  private makeBuilding(kind: BuildingKind, x: number, y: number, dir: Dir): Building {
    const id = this.nextId++;
    switch (kind) {
      case 'miner':
        return { id, kind, x, y, dir, progress: 0, holding: null, power: 0 };
      case 'conveyor':
        return { id, kind, x, y, dir, items: [] };
      case 'generator':
        return { id, kind, x, y, dir, fuel: 0, burn: 0, producing: false };
      case 'pole':
        return { id, kind, x, y, dir };
      case 'storage':
        return { id, kind, x, y, dir, contents: { iron: 0, copper: 0, coal: 0 }, starter: false, rr: 0 };
    }
  }

  private addBuilding(b: Building): void {
    this.buildings.set(b.id, b);
    this.tiles[b.y * this.width + b.x] = b;
    this.version++;
  }

  private removeBuilding(b: Building): void {
    this.buildings.delete(b.id);
    this.tiles[b.y * this.width + b.x] = undefined;
    this.links = this.links.filter((l) => l.a !== b.id && l.b !== b.id);
    this.version++;
  }

  // --- Save / load ----------------------------------------------------------------

  toJSON(): SaveData {
    return { v: 1, nextId: this.nextId, buildings: [...this.buildings.values()], links: this.links };
  }

  /** Rebuild state from save data. Returns null if the data is unusable. */
  static fromJSON(raw: unknown, width: number, height: number): GameState | null {
    if (!raw || typeof raw !== 'object') return null;
    const data = raw as Partial<SaveData>;
    if (data.v !== 1 || !Array.isArray(data.buildings) || !Array.isArray(data.links)) return null;
    const s = new GameState(width, height);
    const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const dirOf = (v: unknown): Dir => ((((Math.round(num(v)) % 4) + 4) % 4) as Dir);
    const mat = (v: unknown): Material | null => (MATERIALS.includes(v as Material) ? (v as Material) : null);
    const stock = (v: unknown): Stock => {
      const o = (v ?? {}) as Record<string, unknown>;
      return { iron: Math.max(0, num(o.iron)), copper: Math.max(0, num(o.copper)), coal: Math.max(0, num(o.coal)) };
    };

    let maxId = 0;
    for (const r of data.buildings as unknown as Array<Record<string, unknown>>) {
      if (!r || typeof r !== 'object') continue;
      const id = Math.round(num(r.id, -1));
      const x = Math.round(num(r.x, -1));
      const y = Math.round(num(r.y, -1));
      if (id <= 0 || !s.inBounds(x, y) || s.at(x, y) || s.buildings.has(id)) continue;
      const dir = dirOf(r.dir);
      let b: Building;
      switch (r.kind) {
        case 'miner':
          if (!s.depositAt(x, y)) continue;
          b = { id, kind: 'miner', x, y, dir, progress: num(r.progress), holding: mat(r.holding), power: 0 };
          break;
        case 'conveyor': {
          if (s.depositAt(x, y)) continue;
          const items = Array.isArray(r.items) ? (r.items as Array<Record<string, unknown>>) : [];
          b = {
            id,
            kind: 'conveyor',
            x,
            y,
            dir,
            items: items
              .filter((it) => it && mat(it.kind))
              .map((it) => ({
                kind: mat(it.kind)!,
                p: Math.min(1, Math.max(0, num(it.p))),
                from: dirOf(it.from),
                moving: false,
              }))
              .sort((a, c) => c.p - a.p),
          };
          break;
        }
        case 'generator':
          if (s.depositAt(x, y)) continue;
          b = { id, kind: 'generator', x, y, dir, fuel: Math.max(0, num(r.fuel)), burn: Math.max(0, num(r.burn)), producing: false };
          break;
        case 'pole':
          if (s.depositAt(x, y)) continue;
          b = { id, kind: 'pole', x, y, dir };
          break;
        case 'storage':
          if (s.depositAt(x, y)) continue;
          b = { id, kind: 'storage', x, y, dir, contents: stock(r.contents), starter: r.starter === true, rr: 0 };
          break;
        default:
          continue;
      }
      s.addBuilding(b);
      maxId = Math.max(maxId, id);
    }
    // The starter storage must always exist.
    if (!s.storages().some((st) => st.starter)) return null;

    for (const l of data.links as unknown as Array<Record<string, unknown>>) {
      const a = s.buildings.get(num(l?.a, -1));
      const b = s.buildings.get(num(l?.b, -1));
      if (a && b && s.linkIndex(a.id, b.id) < 0 && !s.connectError(a, b)) s.links.push({ a: a.id, b: b.id });
    }
    s.nextId = Math.max(maxId + 1, Math.round(num(data.nextId, 1)));
    s.version++;
    return s;
  }
}

export function storageUsed(s: Storage): number {
  return s.contents.iron + s.contents.copper + s.contents.coal;
}
