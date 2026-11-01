import { TILE_SIZE } from '../data/config';

export type Terrain = 'grass';

export interface Tile {
  readonly x: number;
  readonly y: number;
  terrain: Terrain;
}

export interface GridPos {
  x: number;
  y: number;
}

/**
 * The buildable tile grid. Tile (0,0) is the top-left tile and its top-left
 * corner sits at world (0,0). Tiles are TILE_SIZE world units square.
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly tiles: Tile[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.tiles = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this.tiles.push({ x, y, terrain: 'grass' });
      }
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Tile | undefined {
    return this.inBounds(x, y) ? this.tiles[y * this.width + x] : undefined;
  }

  forEach(fn: (tile: Tile) => void): void {
    for (const t of this.tiles) fn(t);
  }

  /** Size of the grid in world units. */
  get worldWidth(): number {
    return this.width * TILE_SIZE;
  }

  get worldHeight(): number {
    return this.height * TILE_SIZE;
  }

  /** World point -> integer tile coordinate (may be out of bounds). */
  static worldToTile(wx: number, wy: number): GridPos {
    return { x: Math.floor(wx / TILE_SIZE), y: Math.floor(wy / TILE_SIZE) };
  }

  /** Tile coordinate -> world position of the tile's top-left corner. */
  static tileToWorld(x: number, y: number): { x: number; y: number } {
    return { x: x * TILE_SIZE, y: y * TILE_SIZE };
  }

  /** Tile coordinate -> world position of the tile's center. */
  static tileCenter(x: number, y: number): { x: number; y: number } {
    return { x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE };
  }
}
