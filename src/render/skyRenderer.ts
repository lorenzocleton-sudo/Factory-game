import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS, WORLD_SEED } from '../data/config';
import { createRng, randRange } from '../data/random';

interface Cloud {
  view: Graphics;
  /** Screen-relative vertical position (0..1). */
  fy: number;
  speed: number;
  width: number;
}

interface FarIsland {
  view: Container;
  fx: number;
  fy: number;
  phase: number;
  parallax: number;
}

/**
 * Screen-space background: gradient sky, slowly drifting clouds and a few
 * faded distant islands. Lives behind the world container.
 */
export class SkyRenderer {
  readonly root = new Container();
  private readonly gradient: Sprite;
  private readonly clouds: Cloud[] = [];
  private readonly farIslands: FarIsland[] = [];
  private w = 1;
  private h = 1;
  private time = 0;

  constructor() {
    this.gradient = new Sprite(makeGradientTexture(COLORS.skyTop, COLORS.skyBottom));
    this.root.addChild(this.gradient);

    const rng = createRng(WORLD_SEED + 3);

    // Distant islands sit behind the clouds.
    const farLayer = new Container();
    this.root.addChild(farLayer);
    const spots: Array<[number, number, number]> = [
      [0.14, 0.06, 0.5],
      [0.86, 0.9, 0.75],
      [0.12, 0.94, 0.6],
    ];
    for (const [fx, fy, scale] of spots) {
      const view = drawFarIsland(rng);
      view.scale.set(scale);
      view.alpha = 0.55;
      farLayer.addChild(view);
      this.farIslands.push({ view, fx, fy, phase: rng() * Math.PI * 2, parallax: 0.04 + scale * 0.05 });
    }

    const cloudLayer = new Container();
    this.root.addChild(cloudLayer);
    for (let i = 0; i < 6; i++) {
      const width = randRange(rng, 90, 170);
      const view = drawCloud(width, rng);
      view.alpha = randRange(rng, 0.75, 0.95);
      view.x = rng() * 1000;
      cloudLayer.addChild(view);
      this.clouds.push({ view, fy: (i + 0.3 + rng() * 0.4) / 6, speed: randRange(rng, 4, 11), width });
    }
  }

  resize(width: number, height: number): void {
    const first = this.w <= 1;
    this.w = width;
    this.h = height;
    this.gradient.width = width;
    this.gradient.height = height;
    if (first) {
      for (const c of this.clouds) c.view.x = Math.random() * (width + c.width) - c.width;
    }
    this.layout(0, 0);
  }

  /**
   * @param dt seconds since last frame
   * @param camOffsetX/Y camera pan in screen px (used for subtle parallax)
   */
  update(dt: number, camOffsetX: number, camOffsetY: number): void {
    this.time += dt;
    for (const c of this.clouds) {
      c.view.x += c.speed * dt;
      if (c.view.x > this.w + 20) c.view.x = -c.width - 20 - Math.random() * 60;
    }
    this.layout(camOffsetX, camOffsetY);
  }

  private layout(camOffsetX: number, camOffsetY: number): void {
    for (const c of this.clouds) {
      c.view.y = c.fy * this.h - camOffsetY * 0.03;
    }
    for (const f of this.farIslands) {
      f.view.x = f.fx * this.w - camOffsetX * f.parallax;
      f.view.y = f.fy * this.h - camOffsetY * f.parallax + Math.sin(this.time * 0.5 + f.phase) * 4;
    }
  }
}

function makeGradientTexture(top: number, bottom: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, hex(top));
  grad.addColorStop(1, hex(bottom));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  return Texture.from(canvas);
}

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

/** Puffy cloud built from overlapping circles; origin at its left/middle. */
function drawCloud(width: number, rng: () => number): Graphics {
  const g = new Graphics();
  const h = width * 0.32;
  const puffs: Array<[number, number, number]> = [];
  const n = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const r = h * (0.45 + Math.sin(t * Math.PI) * 0.45) * randRange(rng, 0.85, 1.1);
    puffs.push([t * width, -Math.sin(t * Math.PI) * h * 0.25, r]);
  }
  // Shaded underside.
  for (const [x, y, r] of puffs) g.circle(x, y + 5, r).fill(COLORS.cloudShade);
  g.roundRect(0, -h * 0.1, width, h * 0.5, h * 0.25).fill(COLORS.cloudShade);
  // White top.
  for (const [x, y, r] of puffs) g.circle(x, y, r).fill(COLORS.cloud);
  g.roundRect(0, -h * 0.15, width, h * 0.45, h * 0.22).fill(COLORS.cloud);
  return g;
}

/** Tiny faded island for background depth; origin at the grass top center. */
function drawFarIsland(rng: () => number): Container {
  const c = new Container();
  const g = new Graphics();
  const w = 90;
  const top = 46;
  // Underside taper.
  g.poly([-w / 2 + 6, top - 4, w / 2 - 6, top - 4, w * 0.18, top + 52, -w * 0.12, top + 64]).fill(COLORS.rockDark);
  // Cliff face.
  g.roundRect(-w / 2 + 3, top - 16, w - 6, 30, 8).fill(COLORS.rock);
  g.roundRect(-w / 2 + 3, top - 16, w - 6, 16, 8).fill(COLORS.rockLight);
  // Grass top.
  g.roundRect(-w / 2, -top / 2 + 4, w, top, 12).fill(COLORS.grassEdgeShadow);
  g.roundRect(-w / 2, -top / 2, w, top, 12).fill(COLORS.grassRim);
  // A couple of trees.
  const trees = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < trees; i++) {
    const tx = randRange(rng, -w * 0.3, w * 0.3);
    const ty = randRange(rng, -6, 6);
    g.circle(tx, ty, 12).fill(COLORS.treeDark);
    g.circle(tx - 2, ty - 2, 9).fill(COLORS.tree);
  }
  c.addChild(g);
  return c;
}
