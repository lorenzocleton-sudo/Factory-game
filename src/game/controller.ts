import { LINK_RANGE } from '../data/config';
import type { BuildView, GhostTile } from '../render/buildingRenderer';
import type { TileHighlight } from '../render/tileHighlight';
import type { Hud, Tool } from '../ui/hud';
import type { GridPos } from '../world/grid';
import type { GameState, PathStep } from './state';
import { rotateCW, type BuildingKind, type Dir } from './types';

const HINTS: Record<string, string> = {
  none: 'Pick something to build',
  build: 'Tap a tile to preview · tap it again to build',
  conveyor: 'Drag to draw a conveyor line · or tap twice to place one',
  connect: `Tap a pole or machine, then another within ${LINK_RANGE} tiles`,
  delete: 'Tap a building to remove it (full refund)',
};

/**
 * Turns taps / drags into build actions according to the selected tool,
 * and describes the ghost preview for the renderer.
 */
export class BuildController {
  tool: Tool = null;
  dir: Dir = 0;
  private ghostTile: GridPos | null = null;
  private path: GridPos[] | null = null;
  private connectFromId: number | null = null;

  constructor(
    private readonly game: GameState,
    private readonly hud: Hud,
    private readonly highlight: TileHighlight,
  ) {
    this.refreshHud();
  }

  get buildKind(): BuildingKind | null {
    return this.tool && this.tool !== 'connect' && this.tool !== 'delete' ? this.tool : null;
  }

  setTool(tool: Tool): void {
    this.tool = this.tool === tool ? null : tool;
    this.ghostTile = null;
    this.path = null;
    this.connectFromId = null;
    this.highlight.hide();
    this.refreshHud();
  }

  rotate(): void {
    if (!this.buildKind) return;
    this.dir = rotateCW(this.dir);
    this.hud.setDir(this.dir);
  }

  /** Mouse hover: the ghost follows the cursor so a click builds right away. */
  hover(tile: GridPos): void {
    if (!this.buildKind || this.path) return;
    this.ghostTile = this.game.inBounds(tile.x, tile.y) ? tile : null;
  }

  tap(tile: GridPos): void {
    const inside = this.game.inBounds(tile.x, tile.y);
    const kind = this.buildKind;

    if (kind) {
      if (!inside) {
        this.ghostTile = null;
        return;
      }
      const g = this.ghostTile;
      if (g && g.x === tile.x && g.y === tile.y) {
        const res =
          kind === 'conveyor'
            ? this.game.placeConveyorPath([{ x: tile.x, y: tile.y, dir: this.dir }])
            : this.game.place(kind, tile.x, tile.y, this.dir);
        this.hud.toast(res.msg, res.ok);
      } else {
        this.ghostTile = { ...tile };
      }
      return;
    }

    if (this.tool === 'delete') {
      if (!inside) return;
      const res = this.game.remove(tile.x, tile.y);
      this.hud.toast(res.msg, res.ok);
      return;
    }

    if (this.tool === 'connect') {
      const b = this.game.at(tile.x, tile.y);
      if (!b || !this.game.isPowerNode(b)) {
        if (b) this.hud.toast('Only poles, miners and generators take power lines');
        this.connectFromId = null;
        return;
      }
      const from = this.connectFromId !== null ? this.game.buildings.get(this.connectFromId) : undefined;
      if (!from) {
        this.connectFromId = b.id;
        return;
      }
      if (from === b) {
        this.connectFromId = null;
        return;
      }
      const res = this.game.toggleLink(from, b);
      this.hud.toast(res.msg, res.ok);
      // Chain from a pole so lines can be strung quickly.
      if (res.ok) this.connectFromId = b.kind === 'pole' ? b.id : null;
      return;
    }

    // No tool: plain tile selection highlight (as before).
    if (inside) this.highlight.show(tile);
    else this.highlight.hide();
  }

  // --- Conveyor drag ---------------------------------------------------------------

  wantsDraw(): boolean {
    return this.tool === 'conveyor';
  }

  drawStart(tile: GridPos): void {
    this.path = this.game.inBounds(tile.x, tile.y) ? [{ ...tile }] : [];
    this.ghostTile = null;
  }

  drawMove(tile: GridPos): void {
    const path = this.path;
    if (!path) return;
    if (!this.game.inBounds(tile.x, tile.y)) return;
    if (path.length === 0) {
      path.push({ ...tile });
      return;
    }
    let last = path[path.length - 1];
    if (last.x === tile.x && last.y === tile.y) return;
    // Walk to the target one grid step at a time (an L-shape for diagonal jumps),
    // along the dominant axis first.
    const xFirst = Math.abs(tile.x - last.x) >= Math.abs(tile.y - last.y);
    while (last.x !== tile.x || last.y !== tile.y) {
      const next = { ...last };
      if ((xFirst && next.x !== tile.x) || next.y === tile.y) next.x += Math.sign(tile.x - next.x);
      else next.y += Math.sign(tile.y - next.y);
      const idx = path.findIndex((p) => p.x === next.x && p.y === next.y);
      if (idx >= 0) path.length = idx + 1; // backtracking / loop: trim
      else path.push(next);
      last = next;
    }
  }

  drawEnd(): void {
    const steps = this.pathSteps();
    this.path = null;
    if (steps.length === 0) return;
    this.dir = steps[steps.length - 1].dir;
    this.hud.setDir(this.dir);
    const res = this.game.placeConveyorPath(steps);
    this.hud.toast(res.msg, res.ok);
  }

  drawCancel(): void {
    this.path = null;
  }

  /** Path tiles with directions: each points at the next; the last keeps the previous heading. */
  private pathSteps(): PathStep[] {
    const path = this.path ?? [];
    const steps: PathStep[] = [];
    for (let i = 0; i < path.length; i++) {
      let dir: Dir;
      if (i < path.length - 1) dir = dirBetween(path[i], path[i + 1]);
      else if (i > 0) dir = dirBetween(path[i - 1], path[i]);
      else dir = this.dir;
      steps.push({ x: path[i].x, y: path[i].y, dir });
    }
    return steps;
  }

  // --- View --------------------------------------------------------------------------

  view(): BuildView {
    const ghosts: GhostTile[] = [];
    const kind = this.buildKind;
    if (this.path && kind === 'conveyor') {
      const steps = this.pathSteps();
      const check = this.game.checkConveyorPath(steps);
      steps.forEach((s, i) => {
        ghosts.push({
          kind: 'conveyor',
          x: s.x,
          y: s.y,
          dir: s.dir,
          entry: i > 0 ? steps[i - 1].dir : s.dir,
          valid: check.valid[i] && !check.unaffordable,
        });
      });
    } else if (kind && this.ghostTile) {
      const { x, y } = this.ghostTile;
      const valid =
        kind === 'conveyor'
          ? this.game.checkConveyorPath([{ x, y, dir: this.dir }]).error === null
          : this.game.buildError(kind, x, y) === null;
      ghosts.push({ kind, x, y, dir: this.dir, entry: this.dir, valid });
    }
    const from = this.connectFromId !== null ? this.game.buildings.get(this.connectFromId) ?? null : null;
    return { ghosts, connectFrom: from };
  }

  private refreshHud(): void {
    this.hud.setTool(this.tool, this.dir);
    const t = this.tool;
    this.hud.setHint(
      t === null ? HINTS.none : t === 'conveyor' ? HINTS.conveyor : t === 'connect' ? HINTS.connect : t === 'delete' ? HINTS.delete : HINTS.build,
    );
  }
}

function dirBetween(a: GridPos, b: GridPos): Dir {
  if (b.x > a.x) return 0;
  if (b.y > a.y) return 1;
  if (b.x < a.x) return 2;
  return 3;
}
