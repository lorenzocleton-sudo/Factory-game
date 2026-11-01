import type { Container } from 'pixi.js';
import { CAMERA, TILE_SIZE } from '../data/config';
import type { Rect } from '../world/world';

export interface Point {
  x: number;
  y: number;
}

/**
 * 2D camera for the world layer.
 *
 * State is the world point shown at the screen center plus a zoom factor
 * (screen px per world unit). All screen coordinates are CSS pixels relative
 * to the canvas' top-left corner.
 */
export class Camera {
  /** World point at the center of the screen. */
  x = 0;
  y = 0;
  zoom = 1;

  minZoom = 0.5;
  maxZoom = CAMERA.maxTilePx / TILE_SIZE;
  defaultZoom = 1;

  private viewW = 1;
  private viewH = 1;
  private userMoved = false;

  constructor(
    /** Everything that should be visible at min zoom (island incl. cliffs). */
    private readonly fitBounds: Rect,
    /** The buildable grid; default view centers on it when it can't all fit. */
    private readonly focusBounds: Rect,
  ) {}

  get viewWidth(): number {
    return this.viewW;
  }

  get viewHeight(): number {
    return this.viewH;
  }

  /** Call whenever the screen size changes. */
  resize(width: number, height: number): void {
    this.viewW = Math.max(1, width);
    this.viewH = Math.max(1, height);

    const m = CAMERA.fitMargin;
    const fitZoom = Math.min(
      (this.viewW - m * 2) / this.fitBounds.width,
      (this.viewH - m * 2) / this.fitBounds.height,
    );
    const minTileZoom = CAMERA.minDefaultTilePx / TILE_SIZE;

    this.maxZoom = CAMERA.maxTilePx / TILE_SIZE;
    // Default: show the whole island if tiles are still big enough to tap,
    // otherwise zoom in so tiles are at least minDefaultTilePx.
    this.defaultZoom = Math.min(this.maxZoom, Math.max(fitZoom, minTileZoom));
    // Min zoom: the whole island fits on screen.
    this.minZoom = Math.min(fitZoom, this.defaultZoom);

    if (!this.userMoved) {
      this.reset();
    } else {
      this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
      this.clampPosition();
    }
  }

  /** Return to the default view. */
  reset(): void {
    this.zoom = this.defaultZoom;
    const b = this.defaultZoom > this.minZoom + 1e-6 ? this.focusBounds : this.fitBounds;
    this.x = b.x + b.width / 2;
    this.y = b.y + b.height / 2;
    this.clampPosition();
    this.userMoved = false;
  }

  /** Move the view by a screen-space delta (finger/mouse movement). */
  panBy(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.userMoved = true;
    this.clampPosition();
  }

  /** Multiply zoom by `factor`, keeping the world point under `screen` fixed. */
  zoomAt(screen: Point, factor: number): void {
    const before = this.screenToWorld(screen.x, screen.y);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.screenToWorld(screen.x, screen.y);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.userMoved = true;
    this.clampPosition();
  }

  screenToWorld(sx: number, sy: number): Point {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: (sy - this.viewH / 2) / this.zoom + this.y,
    };
  }

  worldToScreen(wx: number, wy: number): Point {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: (wy - this.y) * this.zoom + this.viewH / 2,
    };
  }

  /** Apply the camera transform to a display container. */
  applyTo(container: Container): void {
    container.scale.set(this.zoom);
    container.position.set(this.viewW / 2 - this.x * this.zoom, this.viewH / 2 - this.y * this.zoom);
  }

  /** Keep the island from being dragged off screen. */
  private clampPosition(): void {
    const b = this.fitBounds;
    const halfW = this.viewW / 2 / this.zoom;
    const halfH = this.viewH / 2 / this.zoom;
    // If the view is wider than the island, lock to center; else allow panning
    // until the island edge reaches the screen edge (plus a little slack).
    const slack = 24 / this.zoom;
    this.x = clampAxis(this.x, b.x, b.width, halfW, slack);
    this.y = clampAxis(this.y, b.y, b.height, halfH, slack);
  }
}

function clampAxis(c: number, start: number, size: number, halfView: number, slack: number): number {
  const center = start + size / 2;
  if (size <= halfView * 2) {
    // Island smaller than the view: allow small drift only.
    const room = halfView - size / 2;
    return clamp(c, center - room, center + room);
  }
  return clamp(c, start + halfView - slack, start + size - halfView + slack);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
