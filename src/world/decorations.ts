import { ISLAND_BORDER, TILE_SIZE, WORLD_SEED } from '../data/config';
import { createRng, randRange } from '../data/random';

export type DecorationKind = 'tree' | 'pine' | 'bush' | 'rock';

export interface Decoration {
  kind: DecorationKind;
  /** World position of the decoration's center. */
  x: number;
  y: number;
  /** Footprint radius in world units. */
  size: number;
}

/**
 * Deterministically scatter trees, bushes and rocks on the grass rim that
 * surrounds the buildable grid. Nothing is ever placed over the grid itself.
 */
export function generateDecorations(gridW: number, gridH: number): Decoration[] {
  const rng = createRng(WORLD_SEED);
  const W = gridW * TILE_SIZE;
  const H = gridH * TILE_SIZE;
  const mid = -ISLAND_BORDER / 2; // centerline of the rim on the top/left sides
  const decos: Decoration[] = [];

  // Corners get the big trees, like a board game frame.
  const corners: Array<[number, number]> = [
    [mid + 2, mid + 2],
    [W - mid - 2, mid + 2],
    [mid + 2, H - mid - 2],
    [W - mid - 2, H - mid - 2],
  ];
  corners.forEach(([x, y], i) => {
    decos.push({ kind: i % 2 === 0 ? 'pine' : 'tree', x, y, size: 23 });
  });

  // Along each side, sprinkle a few smaller items at deterministic random spots.
  type Side = 'top' | 'bottom' | 'left' | 'right';
  const sides: Side[] = ['top', 'bottom', 'left', 'right'];
  const kinds: DecorationKind[] = ['bush', 'rock', 'tree', 'rock', 'bush', 'pine'];

  for (const side of sides) {
    const len = side === 'top' || side === 'bottom' ? W : H;
    const count = 3;
    for (let i = 0; i < count; i++) {
      // Spread along the side, with jitter, avoiding the corners.
      const t = (i + 0.5) / count;
      const along = 1.3 * TILE_SIZE + t * (len - 2.6 * TILE_SIZE) + randRange(rng, -28, 28);
      const kind = kinds[Math.floor(rng() * kinds.length)];
      const size = kind === 'rock' ? randRange(rng, 9, 13) : kind === 'bush' ? randRange(rng, 11, 15) : randRange(rng, 16, 19);
      // Keep the whole footprint inside the rim (never over the grid).
      const maxOff = ISLAND_BORDER / 2 - size - 4;
      const across = mid + randRange(rng, -Math.max(0, maxOff), Math.max(0, maxOff) * 0.4);
      let x = 0;
      let y = 0;
      switch (side) {
        case 'top':
          x = along;
          y = across;
          break;
        case 'bottom':
          x = along;
          y = H - across;
          break;
        case 'left':
          x = across;
          y = along;
          break;
        case 'right':
          x = W - across;
          y = along;
          break;
      }
      decos.push({ kind, x, y, size });
    }
  }

  // Draw back-to-front (top of screen first) so overlaps look right.
  decos.sort((a, b) => a.y - b.y);
  return decos;
}
