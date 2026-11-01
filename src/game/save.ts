import { SAVE_KEY } from '../data/config';
import { GameState } from './state';

/** Load the saved game, or start a new one if there is no (valid) save. */
export function loadGame(width: number, height: number): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = GameState.fromJSON(JSON.parse(raw), width, height);
      if (s) return s;
      console.warn('Save game was invalid; starting a new game.');
    }
  } catch (err) {
    console.warn('Could not load save game:', err);
  }
  return GameState.createNew(width, height);
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save game:', err);
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
