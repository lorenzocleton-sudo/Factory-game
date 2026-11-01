import { Container, Graphics } from 'pixi.js';
import { CONVEYOR_STEP, CONVEYOR_TILES_PER_SECOND, GENERATOR_MAX_COAL, LINK_RANGE, STORAGE_CAPACITY, TILE_SIZE } from '../data/config';
import { createRng, randRange } from '../data/random';
import { MATERIAL_COLORS } from '../game/rules';
import { storageUsed, type GameState } from '../game/state';
import { DX, DY, opposite, type Building, type BuildingKind, type Conveyor, type Dir } from '../game/types';
import {
  PALETTE,
  beltPoint,
  drawBolt,
  drawBuildingBody,
  drawConveyor,
  drawDrill,
  drawItem,
  generatorChimney,
  tileCenter,
} from './buildingShapes';

const T = TILE_SIZE;

export interface GhostTile {
  kind: BuildingKind;
  x: number;
  y: number;
  dir: Dir;
  /** Conveyor only: travel direction items enter with (for drawing corners). */
  entry: Dir;
  valid: boolean;
}

/** What the build controller wants drawn on top of the world this frame. */
export interface BuildView {
  ghosts: GhostTile[];
  /** First node picked in Connect mode. */
  connectFrom: Building | null;
}

/**
 * Draws deposits, buildings, belt items, power lines, status icons and the
 * ghost preview. Static layers are rebuilt only when the game state's version
 * changes; moving things are redrawn every frame.
 */
export class BuildingRenderer {
  readonly root = new Container();
  private readonly depositG = new Graphics();
  private readonly beltG = new Graphics();
  private readonly itemG = new Graphics();
  private readonly bodyG = new Graphics();
  private readonly cableG = new Graphics();
  private readonly fxG = new Graphics();
  private readonly ghostG = new Graphics();
  private readonly ghostTintG = new Graphics();

  private builtVersion = -1;
  /** Entry (travel) direction per conveyor id, for corners. */
  private entries = new Map<number, Dir>();
  private time = 0;

  constructor(private readonly game: GameState) {
    this.ghostG.alpha = 0.6;
    this.root.addChild(this.depositG, this.beltG, this.itemG, this.bodyG, this.cableG, this.fxG, this.ghostTintG, this.ghostG);
    this.drawDeposits();
  }

  update(dt: number, alpha: number, view: BuildView): void {
    this.time += dt;
    if (this.builtVersion !== this.game.version) this.rebuildStatic();
    this.drawBelts();
    this.drawItems(alpha);
    this.drawFx();
    this.drawConnect(view.connectFrom);
    this.drawGhosts(view.ghosts);
  }

  // --- Static layers --------------------------------------------------------------

  private drawDeposits(): void {
    const g = this.depositG;
    for (const d of this.game.deposits) {
      const ox = d.x * T;
      const oy = d.y * T;
      const rng = createRng(d.x * 7919 + d.y * 104729 + 17);
      g.roundRect(ox + 3, oy + 3, T - 6, T - 6, 9).fill({ color: 0x7a6247, alpha: 0.55 });
      g.roundRect(ox + 6, oy + 6, T - 12, T - 12, 7).fill({ color: 0x8f7556, alpha: 0.45 });
      const color = MATERIAL_COLORS[d.kind];
      const edge = d.kind === 'coal' ? 0x0d0d10 : d.kind === 'copper' ? 0x9a4f1c : 0x5d646e;
      const shine = d.kind === 'coal' ? 0x55555c : d.kind === 'copper' ? 0xffb27a : 0xd9dee5;
      const spots: Array<[number, number, number]> = [
        [0.28, 0.3, 10],
        [0.7, 0.28, 8.5],
        [0.5, 0.55, 11],
        [0.26, 0.74, 8],
        [0.74, 0.72, 9.5],
      ];
      for (const [fx, fy, r0] of spots) {
        const cx = ox + T * fx + randRange(rng, -3, 3);
        const cy = oy + T * fy + randRange(rng, -3, 3);
        const r = r0 * randRange(rng, 0.85, 1.1);
        const pts: number[] = [];
        const n = 6;
        const rot = rng() * Math.PI;
        for (let k = 0; k < n; k++) {
          const a = rot + (k / n) * Math.PI * 2;
          const rr = r * randRange(rng, 0.75, 1.05);
          pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85);
        }
        g.poly(pts).fill(color).stroke({ width: 2, color: edge, join: 'round' });
        g.circle(cx - r * 0.3, cy - r * 0.3, r * 0.28).fill({ color: shine, alpha: 0.8 });
      }
    }
  }

  private rebuildStatic(): void {
    this.builtVersion = this.game.version;
    const g = this.bodyG;
    g.clear();
    this.entries.clear();
    for (const b of this.game.buildings.values()) {
      if (b.kind === 'conveyor') this.entries.set(b.id, this.entryOf(b));
      else drawBuildingBody(g, b.kind, b.x, b.y, b.dir, b.kind === 'storage' && b.starter);
    }

    // Power lines: thin cables with a little sag.
    const c = this.cableG;
    c.clear();
    for (const l of this.game.links) {
      const a = this.game.buildings.get(l.a);
      const b = this.game.buildings.get(l.b);
      if (!a || !b) continue;
      const pa = tileCenter(a.x, a.y);
      const pb = tileCenter(b.x, b.y);
      const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2 + len * 0.08;
      c.moveTo(pa.x, pa.y + 2).quadraticCurveTo(mx, my + 4, pb.x, pb.y + 2).stroke({ width: 3, color: PALETTE.shadow, alpha: 0.18 });
      c.moveTo(pa.x, pa.y).quadraticCurveTo(mx, my, pb.x, pb.y).stroke({ width: 2.2, color: PALETTE.cable, alpha: 0.9 });
      c.circle(pa.x, pa.y, 3).fill(PALETTE.cable);
      c.circle(pb.x, pb.y, 3).fill(PALETTE.cable);
    }
  }

  /** Travel direction items enter a conveyor with: straight from the back, else from a single side feeder. */
  private entryOf(c: Conveyor): Dir {
    if (this.feedsInto(c.x - DX[c.dir], c.y - DY[c.dir], c.dir)) return c.dir;
    const sides: Dir[] = [];
    for (const d of [((c.dir + 1) % 4) as Dir, ((c.dir + 3) % 4) as Dir]) {
      // A feeder travelling in direction d sits on the side opposite d.
      if (this.feedsInto(c.x - DX[d], c.y - DY[d], d)) sides.push(d);
    }
    return sides.length === 1 ? sides[0] : c.dir;
  }

  /** Does the building at (x, y) push items in direction `travel`? */
  private feedsInto(x: number, y: number, travel: Dir): boolean {
    const b = this.game.at(x, y);
    if (!b) return false;
    return (b.kind === 'conveyor' || b.kind === 'miner' || b.kind === 'storage') && b.dir === travel;
  }

  // --- Dynamic layers ---------------------------------------------------------------

  private drawBelts(): void {
    const g = this.beltG;
    g.clear();
    const offset = (this.time * CONVEYOR_TILES_PER_SECOND) % 0.5;
    for (const b of this.game.buildings.values()) {
      if (b.kind !== 'conveyor') continue;
      drawConveyor(g, b.x, b.y, b.dir, this.entries.get(b.id) ?? b.dir, offset);
    }
  }

  private drawItems(alpha: number): void {
    const g = this.itemG;
    g.clear();
    for (const b of this.game.buildings.values()) {
      if (b.kind !== 'conveyor') continue;
      for (const it of b.items) {
        const p = Math.min(1, it.p + (it.moving ? CONVEYOR_STEP * alpha : 0));
        // Items that entered from the front can't exist; guard anyway.
        const entry = it.from === opposite(b.dir) ? b.dir : it.from;
        const pt = beltPoint(b.x, b.y, entry, b.dir, p);
        drawItem(g, pt.x, pt.y, it.kind);
      }
    }
  }

  private drawFx(): void {
    const g = this.fxG;
    g.clear();
    const blink = 0.55 + 0.45 * Math.sin(this.time * 6);
    for (const b of this.game.buildings.values()) {
      switch (b.kind) {
        case 'miner': {
          const working = b.power > 0 && !b.holding;
          // Per-miner phase so drills don't spin in lockstep.
          const angle = working ? this.time * 6 * b.power + b.id : b.id;
          drawDrill(g, b.x, b.y, angle, this.game.depositAt(b.x, b.y));
          if (b.power <= 0) drawBolt(g, b.x, b.y, blink);
          else if (b.power < 1) drawBolt(g, b.x, b.y, 0.9);
          break;
        }
        case 'generator': {
          const c = tileCenter(b.x, b.y);
          if (b.producing) {
            const pulse = 0.5 + 0.25 * Math.sin(this.time * 5 + b.id);
            g.circle(c.x, c.y, 10).fill({ color: 0xffa64d, alpha: pulse });
            g.circle(c.x, c.y, 5).fill({ color: 0xfff1a8, alpha: 0.9 });
            // Smoke puffs drifting up from the chimney.
            const ch = generatorChimney(b.x, b.y, b.dir);
            for (let k = 0; k < 3; k++) {
              const t = (this.time * 0.6 + k / 3 + b.id * 0.13) % 1;
              g.circle(ch.x + Math.sin(t * 6 + k) * 3, ch.y - 6 - t * 22, 3 + t * 4).fill({ color: 0xf2f2f2, alpha: 0.55 * (1 - t) });
            }
          } else {
            g.circle(c.x, c.y, 8).fill({ color: 0x5a3020, alpha: 0.6 });
          }
          // Coal level: 10 small cells along the bottom edge.
          const ox = b.x * T + 12;
          const oy = b.y * T + T - 16;
          const w = (T - 24) / GENERATOR_MAX_COAL;
          g.roundRect(ox - 2, oy - 2, T - 20, 8, 3).fill({ color: 0x3a2018, alpha: 0.6 });
          for (let i = 0; i < GENERATOR_MAX_COAL; i++) {
            g.rect(ox + i * w + 0.5, oy, w - 1, 4).fill(i < b.fuel ? 0x16161a : 0xe9c5ae);
          }
          break;
        }
        case 'storage': {
          const used = storageUsed(b);
          const ox = b.x * T + 14;
          const oy = b.y * T + 10;
          const w = T - 28;
          g.roundRect(ox - 1, oy - 1, w + 2, 6, 3).fill({ color: PALETTE.crateEdge, alpha: 0.85 });
          if (used > 0) {
            const frac = Math.min(1, used / STORAGE_CAPACITY);
            g.roundRect(ox, oy, w * frac, 4, 2).fill(frac >= 1 ? 0xe5484d : 0x7ee081);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private drawConnect(from: Building | null): void {
    if (!from) return;
    const g = this.fxG;
    const c = tileCenter(from.x, from.y);
    g.circle(c.x, c.y, LINK_RANGE * T).fill({ color: 0xffe08a, alpha: 0.08 }).stroke({ width: 3, color: 0xffe08a, alpha: 0.7 });
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 6);
    g.roundRect(from.x * T + 2, from.y * T + 2, T - 4, T - 4, 10).stroke({ width: 4, color: 0xffd23f, alpha: pulse });
  }

  private drawGhosts(ghosts: GhostTile[]): void {
    const tint = this.ghostTintG;
    const g = this.ghostG;
    tint.clear();
    g.clear();
    for (const gh of ghosts) {
      const color = gh.valid ? 0x5bd16b : 0xe5484d;
      tint
        .roundRect(gh.x * T + 2, gh.y * T + 2, T - 4, T - 4, 9)
        .fill({ color, alpha: 0.35 })
        .stroke({ width: 3, color, alpha: 0.95 });
      if (gh.kind === 'conveyor') drawConveyor(g, gh.x, gh.y, gh.dir, gh.entry, 0);
      else drawBuildingBody(g, gh.kind, gh.x, gh.y, gh.dir);
    }
  }
}
