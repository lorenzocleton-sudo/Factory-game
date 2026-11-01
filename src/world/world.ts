import { GRID_SIZE, ISLAND_BORDER } from '../data/config';
import { generateDecorations, type Decoration } from './decorations';
import { Grid } from './grid';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pure world state: the buildable grid plus static scenery.
 * Contains no rendering code so the simulation can use it headlessly.
 */
export class World {
  readonly grid: Grid;
  readonly decorations: Decoration[];

  constructor() {
    this.grid = new Grid(GRID_SIZE, GRID_SIZE);
    this.decorations = generateDecorations(this.grid.width, this.grid.height);
  }

  /** The grass top of the island (grid + decorative rim), in world units. */
  get islandRect(): Rect {
    return {
      x: -ISLAND_BORDER,
      y: -ISLAND_BORDER,
      width: this.grid.worldWidth + ISLAND_BORDER * 2,
      height: this.grid.worldHeight + ISLAND_BORDER * 2,
    };
  }
}
