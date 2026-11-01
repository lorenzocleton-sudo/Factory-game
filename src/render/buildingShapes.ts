import type { Graphics } from 'pixi.js';
import { TILE_SIZE } from '../data/config';
import { MATERIAL_COLORS } from '../game/rules';
import { DX, DY, type BuildingKind, type Dir, type Material } from '../game/types';

/**
 * Shared drawing code for buildings, used both by the real buildings and the
 * ghost preview. Everything is drawn in world units with Graphics primitives.
 */

const T = TILE_SIZE;
const H = T / 2;

export const PALETTE = {
  shadow: 0x1d3a1f,
  beltEdge: 0x3d414d,
  belt: 0x575d6c,
  chevron: 0xa6adbd,
  minerBody: 0x7d8aa0,
  minerEdge: 0x4f5a6e,
  minerTop: 0x9aa7bc,
  drill: 0x3e4656,
  arrowOut: 0xffcf5a,
  arrowIn: 0x6fd66a,
  arrowEdge: 0x2d2a32,
  genBody: 0xc0643f,
  genEdge: 0x7e3b24,
  genTop: 0xdb7c52,
  chimney: 0x5a4a45,
  poleWood: 0x9a6a44,
  poleEdge: 0x5f3d22,
  insulator: 0xdde7ee,
  crate: 0xd29b5c,
  crateEdge: 0x8a5a33,
  plank: 0xb47c43,
  gold: 0xf2c94c,
  cable: 0x2d2a32,
  bolt: 0xffd23f,
} as const;

export function tileCenter(x: number, y: number): { x: number; y: number } {
  return { x: (x + 0.5) * T, y: (y + 0.5) * T };
}

/** Filled triangle pointing in `dir`, centred at (x, y). */
export function arrow(g: Graphics, x: number, y: number, dir: Dir, size: number, color: number): void {
  const dx = DX[dir];
  const dy = DY[dir];
  const px = -dy;
  const py = dx;
  g.poly([
    x + dx * size,
    y + dy * size,
    x - dx * size * 0.7 + px * size,
    y - dy * size * 0.7 + py * size,
    x - dx * size * 0.7 - px * size,
    y - dy * size * 0.7 - py * size,
  ])
    .fill(color)
    .stroke({ width: 2, color: PALETTE.arrowEdge, alpha: 0.85, join: 'round' });
}

/**
 * Point along a conveyor's path at s in [0,1]: from the entry edge (given by the
 * travel direction items enter with) to the centre, then out of the exit edge.
 */
export function beltPoint(x: number, y: number, entryTravel: Dir, dir: Dir, s: number): { x: number; y: number; d: Dir } {
  const c = tileCenter(x, y);
  if (s < 0.5) {
    const t = s * 2;
    return { x: c.x - DX[entryTravel] * H * (1 - t), y: c.y - DY[entryTravel] * H * (1 - t), d: entryTravel };
  }
  const t = (s - 0.5) * 2;
  return { x: c.x + DX[dir] * H * t, y: c.y + DY[dir] * H * t, d: dir };
}

/** Belt body; corners when items enter from a side. `offset` animates the arrows (0..0.5). */
export function drawConveyor(g: Graphics, x: number, y: number, dir: Dir, entryTravel: Dir, offset: number): void {
  const c = tileCenter(x, y);
  const ex = c.x - DX[entryTravel] * H;
  const ey = c.y - DY[entryTravel] * H;
  const ox = c.x + DX[dir] * H;
  const oy = c.y + DY[dir] * H;
  g.moveTo(ex, ey).lineTo(c.x, c.y).lineTo(ox, oy).stroke({ width: 46, color: PALETTE.beltEdge, join: 'round', cap: 'butt' });
  g.moveTo(ex, ey).lineTo(c.x, c.y).lineTo(ox, oy).stroke({ width: 34, color: PALETTE.belt, join: 'round', cap: 'butt' });

  // Two chevrons sliding along the belt direction.
  for (let k = 0; k < 2; k++) {
    const s = k * 0.5 + offset + 0.12;
    if (s > 0.95) continue;
    const p = beltPoint(x, y, entryTravel, dir, s);
    const dx = DX[p.d];
    const dy = DY[p.d];
    const px = -dy;
    const py = dx;
    g.moveTo(p.x - dx * 4 + px * 8, p.y - dy * 4 + py * 8)
      .lineTo(p.x + dx * 4, p.y + dy * 4)
      .lineTo(p.x - dx * 4 - px * 8, p.y - dy * 4 - py * 8)
      .stroke({ width: 3.5, color: PALETTE.chevron, cap: 'round', join: 'round' });
  }
}

export function drawItem(g: Graphics, px: number, py: number, kind: Material): void {
  const color = MATERIAL_COLORS[kind];
  g.circle(px, py + 1.5, 8).fill({ color: 0x000000, alpha: 0.2 });
  g.circle(px, py, 8).fill(color).stroke({ width: 2, color: 0x1b1b20, alpha: 0.75 });
  g.circle(px - 2.5, py - 2.5, 2.5).fill({ color: 0xffffff, alpha: kind === 'coal' ? 0.25 : 0.45 });
}

function shadowRect(g: Graphics, ox: number, oy: number, inset: number): void {
  g.roundRect(ox + inset + 2, oy + inset + 4, T - inset * 2, T - inset * 2, 10).fill({ color: PALETTE.shadow, alpha: 0.18 });
}

export function drawMiner(g: Graphics, x: number, y: number, dir: Dir): void {
  const ox = x * T;
  const oy = y * T;
  const c = tileCenter(x, y);
  shadowRect(g, ox, oy, 8);
  g.roundRect(ox + 8, oy + 8, T - 16, T - 16, 10).fill(PALETTE.minerBody).stroke({ width: 2.5, color: PALETTE.minerEdge });
  g.roundRect(ox + 13, oy + 13, T - 26, T - 26, 7).fill(PALETTE.minerTop);
  // Bolts in the corners.
  for (const [bx, by] of [
    [ox + 13, oy + 13],
    [ox + T - 13, oy + 13],
    [ox + 13, oy + T - 13],
    [ox + T - 13, oy + T - 13],
  ]) {
    g.circle(bx, by, 2).fill(PALETTE.minerEdge);
  }
  arrow(g, c.x + DX[dir] * 23, c.y + DY[dir] * 23, dir, 7, PALETTE.arrowOut);
}

/** Rotating drill head; `angle` in radians. */
export function drawDrill(g: Graphics, x: number, y: number, angle: number, ore: Material | null): void {
  const c = tileCenter(x, y);
  g.circle(c.x, c.y, 11).fill(PALETTE.drill);
  const tip = ore ? MATERIAL_COLORS[ore] : PALETTE.minerTop;
  for (let i = 0; i < 3; i++) {
    const a = angle + (i * Math.PI * 2) / 3;
    const a2 = a + 0.9;
    g.poly([c.x, c.y, c.x + Math.cos(a) * 10, c.y + Math.sin(a) * 10, c.x + Math.cos(a2) * 6, c.y + Math.sin(a2) * 6]).fill(tip);
  }
  g.circle(c.x, c.y, 3).fill(0xdfe5ee);
}

export function drawGenerator(g: Graphics, x: number, y: number, dir: Dir): void {
  const ox = x * T;
  const oy = y * T;
  const c = tileCenter(x, y);
  shadowRect(g, ox, oy, 6);
  g.roundRect(ox + 6, oy + 6, T - 12, T - 12, 11).fill(PALETTE.genBody).stroke({ width: 2.5, color: PALETTE.genEdge });
  g.roundRect(ox + 12, oy + 12, T - 24, T - 24, 7).fill(PALETTE.genTop);
  // Chimney in the corner opposite the input side.
  const { x: chx, y: chy } = generatorChimney(x, y, dir);
  g.circle(chx, chy, 6.5).fill(PALETTE.chimney).stroke({ width: 2, color: 0x332825 });
  g.circle(chx, chy, 3).fill(0x221b19);
  // Coal input arrow at the back edge, pointing inward.
  arrow(g, c.x - DX[dir] * 23, c.y - DY[dir] * 23, dir, 7, MATERIAL_COLORS.coal);
}

/** Chimney position. */
export function generatorChimney(x: number, y: number, dir: Dir): { x: number; y: number } {
  const c = tileCenter(x, y);
  // Front corner (away from the coal input), offset to the side.
  return { x: c.x + DX[dir] * 12 + DY[dir] * 12, y: c.y + DY[dir] * 12 - DX[dir] * 12 };
}

export function drawPole(g: Graphics, x: number, y: number): void {
  const c = tileCenter(x, y);
  g.ellipse(c.x + 3, c.y + 6, 13, 8).fill({ color: PALETTE.shadow, alpha: 0.2 });
  g.circle(c.x, c.y, 8).fill(PALETTE.poleWood).stroke({ width: 2, color: PALETTE.poleEdge });
  g.roundRect(c.x - 16, c.y - 3.5, 32, 7, 3).fill(PALETTE.poleWood).stroke({ width: 1.5, color: PALETTE.poleEdge });
  g.circle(c.x - 14, c.y, 3.2).fill(PALETTE.insulator);
  g.circle(c.x + 14, c.y, 3.2).fill(PALETTE.insulator);
  g.circle(c.x, c.y, 3).fill(PALETTE.insulator);
}

export function drawStorage(g: Graphics, x: number, y: number, dir: Dir, starter: boolean): void {
  const ox = x * T;
  const oy = y * T;
  const c = tileCenter(x, y);
  shadowRect(g, ox, oy, 6);
  g.roundRect(ox + 6, oy + 6, T - 12, T - 12, 8).fill(PALETTE.crate).stroke({ width: 3, color: PALETTE.crateEdge });
  // Planks.
  for (const f of [0.38, 0.62]) {
    g.moveTo(ox + 9, oy + T * f).lineTo(ox + T - 9, oy + T * f).stroke({ width: 2, color: PALETTE.plank });
  }
  g.moveTo(ox + 11, oy + 11).lineTo(ox + T - 11, oy + T - 11).stroke({ width: 3, color: PALETTE.plank });
  if (starter) {
    for (const [sx, sy] of [
      [ox + 9, oy + 9],
      [ox + T - 9, oy + 9],
      [ox + 9, oy + T - 9],
      [ox + T - 9, oy + T - 9],
    ]) {
      g.circle(sx, sy, 3.5).fill(PALETTE.gold).stroke({ width: 1.2, color: PALETTE.crateEdge });
    }
  }
  // Input at the back (pointing in), output at the front (pointing out).
  arrow(g, c.x - DX[dir] * 21, c.y - DY[dir] * 21, dir, 7, PALETTE.arrowIn);
  arrow(g, c.x + DX[dir] * 21, c.y + DY[dir] * 21, dir, 7, PALETTE.arrowOut);
}

/** Static body of any non-conveyor building. */
export function drawBuildingBody(g: Graphics, kind: BuildingKind, x: number, y: number, dir: Dir, starter = false): void {
  switch (kind) {
    case 'miner':
      drawMiner(g, x, y, dir);
      break;
    case 'generator':
      drawGenerator(g, x, y, dir);
      break;
    case 'pole':
      drawPole(g, x, y);
      break;
    case 'storage':
      drawStorage(g, x, y, dir, starter);
      break;
    case 'conveyor':
      drawConveyor(g, x, y, dir, dir, 0);
      break;
  }
}

/** Small lightning bolt badge in a tile's top-right corner. */
export function drawBolt(g: Graphics, x: number, y: number, alpha: number): void {
  const bx = x * T + T - 12;
  const by = y * T + 12;
  g.circle(bx, by, 11).fill({ color: PALETTE.cable, alpha: 0.9 * alpha }).stroke({ width: 2, color: PALETTE.bolt, alpha });
  g.poly([bx + 2, by - 8, bx - 5, by + 1.5, bx - 0.5, by + 1.5, bx - 2, by + 8, bx + 5, by - 1.5, bx + 0.5, by - 1.5]).fill({
    color: PALETTE.bolt,
    alpha,
  });
}
