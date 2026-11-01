export type Material = 'iron' | 'copper' | 'coal';
export const MATERIALS: readonly Material[] = ['iron', 'copper', 'coal'];

/** 0 = east (right), 1 = south (down), 2 = west (left), 3 = north (up). */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const rotateCW = (d: Dir): Dir => ((d + 1) % 4) as Dir;

export type BuildingKind = 'miner' | 'conveyor' | 'generator' | 'pole' | 'storage';
export const BUILDING_KINDS: readonly BuildingKind[] = ['miner', 'conveyor', 'generator', 'pole', 'storage'];

export type Cost = Partial<Record<Material, number>>;
export type Stock = Record<Material, number>;

/** An item riding on a conveyor. */
export interface Item {
  kind: Material;
  /** Progress across the tile: 0 = entry edge, 1 = exit edge. */
  p: number;
  /** Direction the item was travelling when it entered this tile (gives the entry edge). */
  from: Dir;
  /** Whether it moved last tick (for render interpolation). */
  moving: boolean;
}

interface BuildingBase {
  id: number;
  x: number;
  y: number;
  /** Facing. Miner: output side. Storage/Generator: items flow in this direction (input at the back). */
  dir: Dir;
}

export interface Miner extends BuildingBase {
  kind: 'miner';
  /** Production progress in ticks (scaled by power satisfaction). */
  progress: number;
  /** Finished ore waiting to be output (blocks production). */
  holding: Material | null;
  /** Power satisfaction 0..1 from the last tick. */
  power: number;
}

export interface Conveyor extends BuildingBase {
  kind: 'conveyor';
  /** Front (highest p) first. */
  items: Item[];
}

export interface Generator extends BuildingBase {
  kind: 'generator';
  /** Coal waiting to burn. */
  fuel: number;
  /** Ticks left on the coal currently burning. */
  burn: number;
  /** Whether it produced power last tick. */
  producing: boolean;
}

export interface Pole extends BuildingBase {
  kind: 'pole';
}

export interface Storage extends BuildingBase {
  kind: 'storage';
  contents: Stock;
  /** The pre-placed storage; cannot be removed. */
  starter: boolean;
  /** Round-robin cursor for output. */
  rr: number;
}

export type Building = Miner | Conveyor | Generator | Pole | Storage;

/** A power line between two buildings (by id). */
export interface Link {
  a: number;
  b: number;
}

export interface Deposit {
  x: number;
  y: number;
  kind: Material;
}
