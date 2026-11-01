import { Graphics } from 'pixi.js';
import { COLORS, TILE_SIZE } from '../data/config';
import type { GridPos } from '../world/grid';

/**
 * Soft pulsing highlight over one grid tile. Lives in the world container,
 * so it follows camera pan/zoom automatically.
 */
export class TileHighlight {
  readonly view = new Graphics();
  private tile: GridPos | null = null;
  private t = 0;

  constructor() {
    const inset = 3;
    const s = TILE_SIZE - inset * 2;
    this.view
      .roundRect(inset, inset, s, s, 9)
      .fill({ color: COLORS.highlight, alpha: 0.35 })
      .stroke({ width: 3, color: COLORS.highlight, alpha: 0.9 });
    this.view.visible = false;
  }

  get current(): GridPos | null {
    return this.tile;
  }

  show(tile: GridPos): void {
    this.tile = { ...tile };
    this.view.position.set(tile.x * TILE_SIZE, tile.y * TILE_SIZE);
    this.view.visible = true;
    this.t = 0;
  }

  hide(): void {
    this.tile = null;
    this.view.visible = false;
  }

  update(dt: number): void {
    if (!this.view.visible) return;
    this.t += dt;
    // Quick fade-in, then a gentle breathing pulse.
    const fadeIn = Math.min(1, this.t / 0.12);
    this.view.alpha = fadeIn * (0.75 + 0.25 * Math.sin(this.t * 4));
  }
}
