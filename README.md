# Cogwork Isles

**▶ Play: https://lorenzocleton-sudo.github.io/Factory-game/**

A cozy mobile-first factory game on a floating island. Mine ore, move it on
conveyors, and keep your miners powered with coal generators.

## How to play

- **Materials:** iron ore, copper ore and coal. There is no money: everything costs
  materials. The **material pool** (top of the screen) is the combined contents of all
  storages. You start with one starter storage holding 60 iron ore, 15 copper ore, 10 coal.
- **Deposits:** 3 iron (grey), 2 copper (orange) and 1 coal (black) on the island.
- **Build bar (bottom):** pick a building, tap a tile to see a ghost preview
  (green = OK, red = not allowed), tap the same tile again to build. With a mouse the
  ghost follows the cursor, so one click builds. **Rotate** turns the preview.

| Building | Cost | Notes |
| --- | --- | --- |
| Miner | 10 iron | Only on a deposit. Needs power (uses 5). 1 ore / 2 s out of its front arrow. Stops if blocked or unpowered. |
| Conveyor | 1 iron / tile | **Drag** to draw a line with automatic corners. Moves items 2 tiles/s. Drawing over an existing belt re-points it for free. |
| Generator | 15 iron + 5 copper | Takes coal on its input side (black arrow), holds 10. Burns 1 coal / 10 s for 20 power while something on its network needs power. |
| Power pole | 2 iron + 1 copper | Up to 4 power lines. |
| Storage | 10 iron | Holds 100 items. Input at the green arrow, output at the yellow arrow. Only sends items the end of its conveyor line can take (e.g. only coal toward a generator). |

- **Connect:** tap a pole or machine, then another within 5 tiles to string a power
  line (tap an already-linked pair to remove the line). Miners and generators take exactly
  one line each. A network shares its generators' output; if demand is higher than supply
  every miner on it slows down in proportion. A ⚡ badge marks unpowered / underpowered miners.
- **Delete:** tap a building to remove it for a 100% refund; items inside go back to
  the pool if there is storage space. The starter storage can't be removed.
- **Saving:** the game autosaves to this browser every 30 s and when the page is hidden.
  **Reset game** (top right) starts over.

## Controls

| Action | Touch | Mouse / trackpad |
| --- | --- | --- |
| Tap / build / select | Tap | Click |
| Draw conveyors (Conveyor tool) | One-finger drag | Left-drag |
| Pan | Two-finger drag | Drag (right/middle-drag while drawing conveyors) |
| Zoom | Pinch | Wheel / trackpad pinch |

The debug readout (below the material pool) shows the simulation tick counter
(10 ticks/s), FPS, zoom and the last tapped tile.

## Development

```bash
npm install
npm run dev      # dev server, also reachable from your phone on the LAN
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

## Project layout

```
src/
  main.ts            bootstrap: wires world, sim, renderers and input together
  data/              tuning constants, colors, seeded RNG
  world/             pure world state (grid, tiles, scenery) – no rendering
  game/              game state + rules (building, power, save/load), build controller
  sim/               fixed-tick loop (10 TPS) + Simulation (power, miners, belts, storage)
  render/            PixiJS drawing: sky, island, buildings/items/cables, camera, debug overlay
  ui/                HTML HUD: material pool, build bar, messages, reset button
  input/             pointer/touch/wheel handling → camera, taps, conveyor drawing
```

Everything is drawn in code with PixiJS `Graphics`; there are no image assets.

- **Coordinates:** tile `(0,0)` is top-left; a tile is `TILE_SIZE` (64) world units.
  `Camera.screenToWorld` + `Grid.worldToTile` convert a tap to a cell at any zoom/pan.
- **Zoom limits:** the default zoom keeps tiles ≥ 52 CSS px (or fits the whole island
  if that is bigger); minimum zoom fits the whole island on screen; max is 180 px/tile.
- **Simulation:** `FixedTickLoop` runs on its own timer with a time accumulator, so
  ticks stay at exactly 10/s regardless of render frame rate.

## Deployment

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push to
`main`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
