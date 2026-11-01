/**
 * Static tuning values for Cogwork Isles.
 * Anything that is a "magic number" shared between modules lives here.
 */

/** Number of buildable tiles along each side of the island. */
export const GRID_SIZE = 20;

/** Size of one tile in world units (world units == screen px at zoom 1). */
export const TILE_SIZE = 64;

/** Width of the decorative (non-buildable) grass rim around the grid, in world units. */
export const ISLAND_BORDER = 64;

/** Corner radius of the island's grass top, in world units. */
export const ISLAND_CORNER_RADIUS = 30;

/** How far the rock cliff face extends below the island's bottom edge, in world units. */
export const CLIFF_HEIGHT = 96;

/** Extra depth of the jagged rocky underside below the cliff face, in world units. */
export const UNDERSIDE_DEPTH = 120;

/** Simulation rate. */
export const TICKS_PER_SECOND = 10;

/** Max simulation ticks processed in a single catch-up (avoids a spiral of death after a stall). */
export const MAX_CATCHUP_TICKS = 20;

export const CAMERA = {
  /** Minimum on-screen tile size at the default zoom, in CSS pixels. */
  minDefaultTilePx: 52,
  /** Maximum on-screen tile size when zoomed all the way in, in CSS pixels. */
  maxTilePx: 180,
  /** Screen margin (CSS px) kept around the island when computing the "fit whole island" zoom. */
  fitMargin: 16,
  /** Mouse wheel zoom sensitivity (larger = faster). */
  wheelSensitivity: 0.0015,
};

export const INPUT = {
  /** Max pointer travel (CSS px) for a press to still count as a tap. */
  tapMaxMove: 10,
  /** Max press duration (ms) for a press to still count as a tap. */
  tapMaxMs: 450,
};

/** Seed for deterministic decoration / cloud placement. */
export const WORLD_SEED = 1337;

export const COLORS = {
  skyTop: 0x8fd0f5,
  skyBottom: 0xd4eefc,
  cloud: 0xffffff,
  cloudShade: 0xe3f1fb,

  grassRim: 0x86cf5c,
  grassRimDark: 0x5fae45,
  grassEdgeShadow: 0x4f9a3c,
  gridBase: 0x74c050,
  tileA: 0x93d866,
  tileB: 0x8fd462,

  rockLight: 0xa7a9b6,
  rock: 0x8b8e9c,
  rockDark: 0x6f7282,
  rockDeep: 0x5c5f6e,

  treeDark: 0x2f8a3e,
  tree: 0x3ea64a,
  treeLight: 0x5cc25e,
  trunk: 0x8a5a3a,
  bush: 0x4fb54f,
  bushLight: 0x6fcf62,
  stone: 0xa3a6b2,
  stoneLight: 0xc4c7d1,
  stoneDark: 0x7e8190,
  shadow: 0x1d4a1f,

  highlight: 0xffffff,
} as const;

// --- Gameplay tuning ---------------------------------------------------------

/** Ticks for a fully powered miner to produce one ore (2 s). */
export const MINER_TICKS = 2 * TICKS_PER_SECOND;
/** Power a miner uses. */
export const MINER_POWER = 5;
/** Power a burning generator produces. */
export const GENERATOR_POWER = 20;
/** Ticks one coal burns for (10 s). */
export const GENERATOR_BURN_TICKS = 10 * TICKS_PER_SECOND;
/** Coal a generator can hold. */
export const GENERATOR_MAX_COAL = 10;
/** Items one storage can hold (all types combined). */
export const STORAGE_CAPACITY = 100;
/** Conveyor speed in tiles per second. */
export const CONVEYOR_TILES_PER_SECOND = 2;
/** Conveyor progress per tick (fraction of a tile). */
export const CONVEYOR_STEP = CONVEYOR_TILES_PER_SECOND / TICKS_PER_SECOND;
/** Minimum distance between two items on a belt, in tiles. */
export const ITEM_SPACING = 1 / 3;
/** Max connections per power pole. */
export const POLE_MAX_LINKS = 4;
/** Max power line length, in tiles (center to center). */
export const LINK_RANGE = 5;
/** Autosave interval. */
export const AUTOSAVE_MS = 30_000;
/** localStorage key for the save game. */
export const SAVE_KEY = 'cogwork-isles-save-v1';
