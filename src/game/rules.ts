import type { BuildingKind, Cost, Deposit, Dir, Material, Stock } from './types';
import { MATERIALS } from './types';

export const BUILD_COSTS: Record<BuildingKind, Cost> = {
  miner: { iron: 10 },
  conveyor: { iron: 1 },
  generator: { iron: 15, copper: 5 },
  pole: { iron: 2, copper: 1 },
  storage: { iron: 10 },
};

export const BUILDING_NAMES: Record<BuildingKind, string> = {
  miner: 'Miner',
  conveyor: 'Conveyor',
  generator: 'Generator',
  pole: 'Power pole',
  storage: 'Storage',
};

export const MATERIAL_NAMES: Record<Material, string> = {
  iron: 'iron ore',
  copper: 'copper ore',
  coal: 'coal',
};

export const MATERIAL_COLORS: Record<Material, number> = {
  iron: 0x9ea6b0,
  copper: 0xe8843a,
  coal: 0x26262b,
};

export const STARTER_STORAGE: { x: number; y: number; dir: Dir; contents: Stock } = {
  x: 9,
  y: 9,
  dir: 0,
  contents: { iron: 60, copper: 15, coal: 10 },
};

/** Fixed ore deposits, spread across the island (never on the starter storage). */
export const DEPOSITS: readonly Deposit[] = [
  { x: 5, y: 5, kind: 'iron' },
  { x: 14, y: 6, kind: 'iron' },
  { x: 6, y: 14, kind: 'iron' },
  { x: 15, y: 14, kind: 'copper' },
  { x: 11, y: 2, kind: 'copper' },
  { x: 12, y: 10, kind: 'coal' },
];

/** "3 iron ore, 1 copper ore" */
export function formatAmounts(c: Cost): string {
  return MATERIALS.filter((m) => (c[m] ?? 0) > 0)
    .map((m) => `${c[m]} ${MATERIAL_NAMES[m]}`)
    .join(', ');
}

export function costTotal(c: Cost): number {
  return MATERIALS.reduce((s, m) => s + (c[m] ?? 0), 0);
}
