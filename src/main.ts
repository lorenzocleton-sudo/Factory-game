import { Application, Container } from 'pixi.js';
import { AUTOSAVE_MS, CLIFF_HEIGHT, COLORS, TICKS_PER_SECOND, TILE_SIZE, UNDERSIDE_DEPTH } from './data/config';
import { BuildController } from './game/controller';
import { clearSave, loadGame, saveGame } from './game/save';
import { PointerInput } from './input/pointerInput';
import { BuildingRenderer } from './render/buildingRenderer';
import { Camera } from './render/camera';
import { DebugOverlay } from './render/debugOverlay';
import { IslandRenderer } from './render/islandRenderer';
import { SkyRenderer } from './render/skyRenderer';
import { TileHighlight } from './render/tileHighlight';
import { FixedTickLoop } from './sim/fixedTickLoop';
import { Simulation } from './sim/simulation';
import { Hud } from './ui/hud';
import { Grid } from './world/grid';
import { World } from './world/world';

async function main(): Promise<void> {
  const host = document.getElementById('app')!;

  const app = new Application();
  await app.init({
    resizeTo: host,
    background: COLORS.skyBottom,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  host.appendChild(app.canvas);

  // --- World (pure data) + simulation ---------------------------------
  const world = new World();
  const game = loadGame(world.grid.width, world.grid.height);
  const sim = new Simulation(world, game);
  const loop = new FixedTickLoop(TICKS_PER_SECOND, () => sim.step());
  loop.start();

  // --- Scene graph ------------------------------------------------------
  const sky = new SkyRenderer();
  const worldLayer = new Container();
  const island = new IslandRenderer(world);
  const highlight = new TileHighlight();
  const buildings = new BuildingRenderer(game);
  island.overlay.addChild(buildings.root, highlight.view);
  worldLayer.addChild(island.root);
  app.stage.addChild(sky.root, worldLayer);

  // --- Camera -----------------------------------------------------------
  const top = world.islandRect;
  const fitBounds = { ...top, height: top.height + CLIFF_HEIGHT + UNDERSIDE_DEPTH };
  const gridBounds = { x: 0, y: 0, width: world.grid.worldWidth, height: world.grid.worldHeight };
  const camera = new Camera(fitBounds, gridBounds);
  // Reference point for background parallax.
  const parallaxOrigin = { x: gridBounds.width / 2, y: gridBounds.height / 2 };

  let lastW = 0;
  let lastH = 0;
  const handleResize = (): void => {
    const { width, height } = app.screen;
    if (width === lastW && height === lastH) return;
    lastW = width;
    lastH = height;
    camera.resize(width, height);
    sky.resize(width, height);
  };
  handleResize();

  // --- Save -------------------------------------------------------------------
  let resetting = false;
  const save = (): void => {
    if (!resetting) saveGame(game);
  };
  setInterval(save, AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);

  // --- UI + build tools ----------------------------------------------------------
  let controller: BuildController;
  const hud = new Hud({
    onTool: (tool) => controller.setTool(tool),
    onRotate: () => controller.rotate(),
    onReset: () => {
      if (!window.confirm('Reset the game? All progress will be lost.')) return;
      resetting = true;
      clearSave();
      window.location.reload();
    },
  });
  controller = new BuildController(game, hud, highlight);

  // --- Input --------------------------------------------------------------
  const tileAt = (screen: { x: number; y: number }) => {
    const w = camera.screenToWorld(screen.x, screen.y);
    return Grid.worldToTile(w.x, w.y);
  };
  new PointerInput(app.canvas, camera, {
    onTap: (screen) => controller.tap(tileAt(screen)),
    onHover: (screen) => controller.hover(tileAt(screen)),
    wantsDraw: () => controller.wantsDraw(),
    onDrawStart: (screen) => controller.drawStart(tileAt(screen)),
    onDrawMove: (screen) => controller.drawMove(tileAt(screen)),
    onDrawEnd: () => controller.drawEnd(),
    onDrawCancel: () => controller.drawCancel(),
  });

  // Dev-only handle for automated testing in the browser console.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__cogwork = { game, camera, sim, controller };
  }

  // --- Render loop ----------------------------------------------------------
  const debug = new DebugOverlay(document.body, 52);
  app.ticker.add((ticker) => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    handleResize();
    camera.applyTo(worldLayer);
    sky.update(dt, (camera.x - parallaxOrigin.x) * camera.zoom, (camera.y - parallaxOrigin.y) * camera.zoom);
    highlight.update(dt);
    buildings.update(dt, loop.alpha, controller.view());
    const cap = game.capacity();
    hud.update(game.pool(), cap.used, cap.total);

    const sel = highlight.current;
    debug.update({
      tick: sim.tick,
      fps: Math.round(ticker.FPS),
      zoom: `${camera.zoom.toFixed(2)} (${Math.round(camera.zoom * TILE_SIZE)}px/tile)`,
      tile: sel ? `${sel.x},${sel.y}` : '-',
    });
  });
}

main().catch((err) => {
  console.error(err);
  document.body.textContent = `Failed to start: ${String(err)}`;
});
