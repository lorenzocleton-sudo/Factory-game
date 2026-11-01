import { Container, Graphics } from 'pixi.js';
import {
  CLIFF_HEIGHT,
  COLORS,
  ISLAND_CORNER_RADIUS,
  TILE_SIZE,
  UNDERSIDE_DEPTH,
  WORLD_SEED,
} from '../data/config';
import { createRng, randRange } from '../data/random';
import type { Decoration } from '../world/decorations';
import type { World } from '../world/world';

/** Thickness of the darker grass "lip" visible under the island's top edge. */
const LIP = 8;

/**
 * Builds the static display objects for the main island.
 * Layers (back to front): underside, cliff face, grass top, tile grid,
 * `overlay` (for highlights / future buildings), decorations.
 */
export class IslandRenderer {
  readonly root = new Container();
  /** Layer above the tiles for highlights and (later) machines/belts. */
  readonly overlay = new Container();

  constructor(private readonly world: World) {
    const rng = createRng(WORLD_SEED + 7);
    this.root.addChild(this.drawUnderside(rng));
    this.root.addChild(this.drawCliff(rng));
    this.root.addChild(this.drawTop());
    this.root.addChild(this.drawGrid());
    this.root.addChild(this.overlay);
    this.root.addChild(this.drawDecorations());
  }

  /** Jagged, tapering rock below the cliff face. */
  private drawUnderside(rng: () => number): Graphics {
    const r = this.world.islandRect;
    const g = new Graphics();
    const top = r.y + r.height + CLIFF_HEIGHT - 30;
    const cols = Math.round(r.width / (TILE_SIZE * 0.75));
    const colW = (r.width - 40) / cols;
    const depths: number[] = [];
    for (let i = 0; i < cols; i++) {
      const t = (i + 0.5) / cols;
      // Deepest in the middle, shallow at the sides.
      const shape = 1 - Math.pow(Math.abs(t * 2 - 1), 1.4);
      const depth = UNDERSIDE_DEPTH * shape * randRange(rng, 0.55, 1) + 20;
      const x = r.x + 20 + i * colW;
      const color = i % 2 === 0 ? COLORS.rockDark : COLORS.rockDeep;
      g.roundRect(x - 1, top, colW + 2, depth, Math.min(14, colW / 2)).fill(color);
      depths.push(depth);
    }
    // Faint highlight streaks on the underside columns.
    for (let i = 0; i < cols; i += 2) {
      const len = depths[i] - 60;
      if (len < 12) continue;
      const x = r.x + 20 + i * colW + colW * 0.3;
      g.roundRect(x, top + 40, 4, Math.min(len, 24 + rng() * 20), 2).fill({ color: COLORS.rock, alpha: 0.5 });
    }
    return g;
  }

  /** Grey rock face visible just below the island's bottom edge. */
  private drawCliff(rng: () => number): Graphics {
    const r = this.world.islandRect;
    const g = new Graphics();
    const top = r.y + r.height - ISLAND_CORNER_RADIUS; // hidden behind grass
    const bottom = r.y + r.height + CLIFF_HEIGHT;
    const inset = 6;

    // Base slab.
    g.roundRect(r.x + inset, top, r.width - inset * 2, bottom - top, 18).fill(COLORS.rockDark);

    // Rock blocks (aligned with tile columns for a tidy, board-game look).
    const cols = Math.round((r.width - inset * 2) / TILE_SIZE);
    const colW = (r.width - inset * 2) / cols;
    for (let i = 0; i < cols; i++) {
      const x = r.x + inset + i * colW + 2;
      const w = colW - 4;
      const edgeRound = i === 0 || i === cols - 1;
      const blockBottom = bottom - 6 - rng() * 14 - (edgeRound ? 10 : 0);
      g.roundRect(x, top, w, blockBottom - top, 10).fill(COLORS.rock);
      // Lighter upper band.
      const band = r.y + r.height + 22 + rng() * 22;
      g.roundRect(x, top, w, band - top, 10).fill(COLORS.rockLight);
      // Small chip details.
      if (rng() < 0.6) {
        g.roundRect(x + w * randRange(rng, 0.2, 0.6), band + 10 + rng() * 20, w * 0.25, 5, 2.5).fill({
          color: COLORS.rockDark,
          alpha: 0.6,
        });
      }
    }

    // Shadow cast by the grass top onto the cliff.
    g.rect(r.x + inset, r.y + r.height, r.width - inset * 2, 12).fill({ color: COLORS.rockDeep, alpha: 0.35 });
    return g;
  }

  /** Grass top of the island including the decorative rim. */
  private drawTop(): Graphics {
    const r = this.world.islandRect;
    const g = new Graphics();
    // Darker lip gives the grass slab a little thickness.
    g.roundRect(r.x, r.y + LIP, r.width, r.height, ISLAND_CORNER_RADIUS).fill(COLORS.grassEdgeShadow);
    g.roundRect(r.x, r.y, r.width, r.height, ISLAND_CORNER_RADIUS).fill(COLORS.grassRim);

    // Subtle grass texture on the rim (deterministic dabs).
    const rng = createRng(WORLD_SEED + 21);
    const W = this.world.grid.worldWidth;
    const H = this.world.grid.worldHeight;
    for (let i = 0; i < 70; i++) {
      const x = r.x + 10 + rng() * (r.width - 20);
      const y = r.y + 10 + rng() * (r.height - 20);
      const inGrid = x > -10 && x < W + 10 && y > -10 && y < H + 10;
      if (inGrid) continue;
      g.ellipse(x, y, 4 + rng() * 4, 2 + rng() * 2).fill({ color: COLORS.grassRimDark, alpha: 0.25 });
    }
    return g;
  }

  /** The 10x10 buildable area: gaps between tiles form the subtle grid lines. */
  private drawGrid(): Graphics {
    const grid = this.world.grid;
    const g = new Graphics();
    const gap = 1.5;
    g.roundRect(-gap * 2, -gap * 2, grid.worldWidth + gap * 4, grid.worldHeight + gap * 4, 10).fill(
      COLORS.gridBase,
    );
    grid.forEach((tile) => {
      const color = (tile.x + tile.y) % 2 === 0 ? COLORS.tileA : COLORS.tileB;
      g.roundRect(tile.x * TILE_SIZE + gap, tile.y * TILE_SIZE + gap, TILE_SIZE - gap * 2, TILE_SIZE - gap * 2, 7).fill(
        color,
      );
    });
    return g;
  }

  private drawDecorations(): Container {
    const c = new Container();
    const g = new Graphics();
    c.addChild(g);
    let i = 0;
    for (const d of this.world.decorations) {
      drawDecoration(g, d, createRng(WORLD_SEED + 100 + i++));
    }
    return c;
  }
}

function drawDecoration(g: Graphics, d: Decoration, rng: () => number): void {
  const { x, y, size: s } = d;
  // Soft drop shadow (light comes from the top-left).
  g.ellipse(x + s * 0.18, y + s * 0.3, s * 1.0, s * 0.85).fill({ color: COLORS.shadow, alpha: 0.18 });

  switch (d.kind) {
    case 'tree': {
      g.circle(x, y, s).fill(COLORS.treeDark);
      g.circle(x - s * 0.15, y - s * 0.15, s * 0.8).fill(COLORS.tree);
      g.circle(x - s * 0.32, y - s * 0.35, s * 0.38).fill(COLORS.treeLight);
      break;
    }
    case 'pine': {
      // Top-down pine: stacked tiers that shrink toward the tip.
      g.poly(starPoints(x, y, s, s * 0.78, 8, rng() * Math.PI)).fill(COLORS.treeDark);
      g.poly(starPoints(x - s * 0.08, y - s * 0.1, s * 0.72, s * 0.55, 8, rng() * Math.PI)).fill(COLORS.tree);
      g.poly(starPoints(x - s * 0.16, y - s * 0.2, s * 0.42, s * 0.32, 6, rng() * Math.PI)).fill(COLORS.treeLight);
      g.circle(x - s * 0.2, y - s * 0.24, s * 0.12).fill(0x8fe08a);
      break;
    }
    case 'bush': {
      g.circle(x - s * 0.45, y + s * 0.1, s * 0.6).fill(COLORS.bush);
      g.circle(x + s * 0.45, y + s * 0.15, s * 0.55).fill(COLORS.bush);
      g.circle(x, y - s * 0.2, s * 0.7).fill(COLORS.bush);
      g.circle(x - s * 0.2, y - s * 0.4, s * 0.3).fill(COLORS.bushLight);
      break;
    }
    case 'rock': {
      const pts: number[] = [];
      const n = 7;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const rr = s * randRange(rng, 0.8, 1.1);
        pts.push(x + Math.cos(a) * rr * 1.15, y + Math.sin(a) * rr * 0.9);
      }
      g.poly(pts).fill(COLORS.stone).stroke({ width: 2, color: COLORS.stoneDark, alpha: 0.8 });
      g.ellipse(x - s * 0.3, y - s * 0.3, s * 0.45, s * 0.3).fill(COLORS.stoneLight);
      break;
    }
  }
}

function starPoints(cx: number, cy: number, outer: number, inner: number, n: number, rot: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}
