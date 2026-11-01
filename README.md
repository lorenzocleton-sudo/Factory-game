# Cogwork Isles

**▶ Play: https://lorenzocleton-sudo.github.io/Factory-game/**

A cozy mobile-first factory game on a floating island. This is the technical
foundation only: the world, camera, input and a fixed-tick simulation loop.
No gameplay yet.

## Controls

| Action | Touch | Mouse / trackpad |
| --- | --- | --- |
| Select a tile (debug highlight) | Tap | Click |
| Pan | Two-finger drag | Drag |
| Zoom | Pinch | Wheel / trackpad pinch |

One-finger drag on touch is intentionally unused; it is reserved for building tools.
The top-left debug readout shows the simulation tick counter (10 ticks/s), FPS,
zoom and the last tapped tile.

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
  sim/               fixed-tick loop (10 TPS) + Simulation (empty for now)
  render/            PixiJS drawing: sky, island, tile highlight, camera, debug overlay
  input/             pointer/touch/wheel handling → camera + tap events
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
