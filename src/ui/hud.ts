import { BUILD_COSTS, BUILDING_NAMES, MATERIAL_COLORS, MATERIAL_NAMES } from '../game/rules';
import { BUILDING_KINDS, MATERIALS, type BuildingKind, type Dir, type Stock } from '../game/types';

export type Tool = BuildingKind | 'connect' | 'delete' | null;

export interface HudHandlers {
  onTool: (tool: Tool) => void;
  onRotate: () => void;
  onReset: () => void;
}

const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const ARROWS = ['→', '↓', '←', '↑'];

const SHORT_NAMES: Record<BuildingKind, string> = {
  miner: 'Miner',
  conveyor: 'Conveyor',
  generator: 'Generator',
  pole: 'Pole',
  storage: 'Storage',
};

/** Tiny inline SVG icons for the build bar. */
const ICONS: Record<BuildingKind, string> = {
  miner:
    '<rect x="3" y="3" width="18" height="18" rx="4" fill="#7d8aa0" stroke="#4f5a6e" stroke-width="1.5"/><circle cx="12" cy="12" r="5" fill="#3e4656"/><path d="M12 12 L16 9 L15 13 Z" fill="#c9d0da"/>',
  conveyor:
    '<rect x="2" y="6" width="20" height="12" rx="2" fill="#575d6c" stroke="#3d414d" stroke-width="1.5"/><path d="M6 9 L9 12 L6 15 M12 9 L15 12 L12 15" stroke="#c4cad6" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  generator:
    '<rect x="3" y="3" width="18" height="18" rx="4" fill="#c0643f" stroke="#7e3b24" stroke-width="1.5"/><path d="M12 7 C15 10 15 12 14.5 14 C14 16 10 16 9.5 14 C9 12 10.5 11 11 9.5 C11.5 11 12.5 11 12 7 Z" fill="#ffd23f"/>',
  pole:
    '<rect x="4" y="9" width="16" height="4" rx="1.5" fill="#9a6a44" stroke="#5f3d22"/><circle cx="12" cy="11" r="4" fill="#9a6a44" stroke="#5f3d22" stroke-width="1.5"/><circle cx="5" cy="11" r="1.6" fill="#dde7ee"/><circle cx="19" cy="11" r="1.6" fill="#dde7ee"/>',
  storage:
    '<rect x="3" y="3" width="18" height="18" rx="3" fill="#d29b5c" stroke="#8a5a33" stroke-width="2"/><path d="M4 9.5 H20 M4 14.5 H20 M5 5 L19 19" stroke="#b47c43" stroke-width="1.5"/>',
};

const CSS = `
.hud { position: fixed; z-index: 20; font: 600 13px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #3b2f2a; }
.hud-top { top: calc(env(safe-area-inset-top, 0px) + 8px); left: 50%; transform: translateX(-50%);
  display: flex; gap: 6px; align-items: center; padding: 5px 8px; border-radius: 14px;
  background: rgba(255, 250, 240, 0.92); box-shadow: 0 2px 8px rgba(30, 60, 80, 0.18); pointer-events: none; white-space: nowrap; }
.hud-chip { display: flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 9px; background: rgba(120, 90, 60, 0.08); }
.hud-dot { width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid rgba(0,0,0,0.45); flex: none; }
.hud-chip b { font-variant-numeric: tabular-nums; }
.hud-chip small { font-weight: 500; opacity: 0.7; }
.hud-cap { font-weight: 500; font-size: 11px; opacity: 0.75; font-variant-numeric: tabular-nums; }
.hud-reset { top: calc(env(safe-area-inset-top, 0px) + 8px); right: calc(env(safe-area-inset-right, 0px) + 8px);
  border: 0; border-radius: 10px; padding: 5px 8px; font: 600 11px system-ui, sans-serif; color: #fff;
  background: rgba(150, 60, 50, 0.7); }
.hud-bottom { left: 0; right: 0; bottom: 0; padding: 6px 8px calc(env(safe-area-inset-bottom, 0px) + 8px);
  display: flex; flex-direction: column; gap: 6px; pointer-events: none; }
.hud-row { display: flex; gap: 6px; justify-content: center; pointer-events: none; }
.hud-bar { max-width: 560px; width: 100%; margin: 0 auto; }
.hud button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; cursor: pointer; pointer-events: auto; }
.hud-mode { border: 2px solid transparent; border-radius: 12px; padding: 7px 12px; font: 700 13px system-ui, sans-serif;
  background: rgba(255, 250, 240, 0.94); color: #3b2f2a; box-shadow: 0 2px 6px rgba(30, 60, 80, 0.18); }
.hud-mode.on { background: #ffe7a8; border-color: #e0a84a; }
.hud-mode.del.on { background: #ffd0c8; border-color: #d4574a; }
.hud-mode:disabled { opacity: 0.45; }
.hud-build { flex: 1 1 0; min-width: 0; border: 2px solid transparent; border-radius: 14px; padding: 5px 2px 6px;
  background: rgba(255, 250, 240, 0.95); color: #3b2f2a; box-shadow: 0 2px 8px rgba(30, 60, 80, 0.2);
  display: flex; flex-direction: column; align-items: center; gap: 2px; }
.hud-build svg { width: 26px; height: 26px; }
.hud-build .nm { font: 700 11px system-ui, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.hud-build .cost { display: flex; gap: 4px; font: 600 10.5px system-ui, sans-serif; font-variant-numeric: tabular-nums; }
.hud-build .cost span { display: flex; align-items: center; gap: 2px; }
.hud-build .cost i { width: 8px; height: 8px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.5); display: inline-block; }
.hud-build.on { background: #ffe7a8; border-color: #e0a84a; }
.hud-build.cant .cost { color: #c0392b; }
.hud-hint { text-align: center; font: 600 12px system-ui, sans-serif; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.5); min-height: 15px; }
.hud-toast { left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 150px); transform: translateX(-50%);
  max-width: calc(100vw - 32px); padding: 8px 14px; border-radius: 12px; text-align: center;
  background: rgba(40, 36, 44, 0.88); color: #fff; font: 600 13px system-ui, sans-serif;
  opacity: 0; transition: opacity 0.2s; pointer-events: none; }
.hud-toast.show { opacity: 1; }
.hud-toast.bad { background: rgba(170, 48, 40, 0.92); }
@media (max-width: 520px) { .hud-chip small { display: none; } .hud-top { left: 12px; transform: none; } }
`;

/**
 * HTML overlay: material pool (top), build bar (bottom, thumb reach),
 * short messages and the reset button.
 */
export class Hud {
  private readonly buildButtons = new Map<BuildingKind, HTMLButtonElement>();
  private readonly connectBtn: HTMLButtonElement;
  private readonly deleteBtn: HTMLButtonElement;
  private readonly rotateBtn: HTMLButtonElement;
  private readonly hint: HTMLDivElement;
  private readonly toastEl: HTMLDivElement;
  private readonly poolEls = new Map<string, HTMLElement>();
  private readonly capEl: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPoolKey = '';

  constructor(handlers: HudHandlers) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // --- Top: material pool --------------------------------------------------
    const top = div('hud hud-top');
    for (const m of MATERIALS) {
      const chip = div('hud-chip');
      chip.title = MATERIAL_NAMES[m];
      const dot = div('hud-dot');
      dot.style.background = hex(MATERIAL_COLORS[m]);
      const n = document.createElement('b');
      const label = document.createElement('small');
      label.textContent = m === 'iron' ? 'Iron' : m === 'copper' ? 'Copper' : 'Coal';
      chip.append(dot, n, label);
      top.appendChild(chip);
      this.poolEls.set(m, n);
    }
    this.capEl = div('hud-cap');
    this.capEl.title = 'Storage used / capacity';
    top.appendChild(this.capEl);
    document.body.appendChild(top);

    // --- Reset ---------------------------------------------------------------
    const reset = document.createElement('button');
    reset.className = 'hud hud-reset';
    reset.textContent = 'Reset game';
    reset.title = 'Reset game (for testing)';
    reset.addEventListener('click', () => handlers.onReset());
    document.body.appendChild(reset);

    // --- Bottom: build bar -----------------------------------------------------
    const bottom = div('hud hud-bottom');
    this.hint = div('hud-hint');
    const modes = div('hud-row hud-bar');
    this.connectBtn = modeButton('⚡ Connect', () => handlers.onTool('connect'));
    this.deleteBtn = modeButton('✕ Delete', () => handlers.onTool('delete'));
    this.deleteBtn.classList.add('del');
    this.rotateBtn = modeButton('⟳ Rotate →', () => handlers.onRotate());
    modes.append(this.connectBtn, this.deleteBtn, this.rotateBtn);

    const builds = div('hud-row hud-bar');
    for (const kind of BUILDING_KINDS) {
      const b = document.createElement('button');
      b.className = 'hud-build';
      b.title = BUILDING_NAMES[kind];
      const cost = BUILD_COSTS[kind];
      const costHtml = MATERIALS.filter((m) => cost[m])
        .map((m) => `<span>${cost[m]}<i style="background:${hex(MATERIAL_COLORS[m])}"></i></span>`)
        .join('');
      b.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[kind]}</svg><span class="nm">${SHORT_NAMES[kind]}</span><span class="cost">${costHtml}</span>`;
      b.addEventListener('click', () => handlers.onTool(kind));
      builds.appendChild(b);
      this.buildButtons.set(kind, b);
    }
    bottom.append(this.hint, modes, builds);
    document.body.appendChild(bottom);

    this.toastEl = div('hud hud-toast');
    document.body.appendChild(this.toastEl);

    // Keep taps on the UI from reaching the canvas / page.
    for (const el of [top, reset, bottom]) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  setTool(tool: Tool, dir: Dir): void {
    for (const [k, b] of this.buildButtons) b.classList.toggle('on', k === tool);
    this.connectBtn.classList.toggle('on', tool === 'connect');
    this.deleteBtn.classList.toggle('on', tool === 'delete');
    this.rotateBtn.disabled = !(tool && tool !== 'connect' && tool !== 'delete' && tool !== 'pole');
    this.setDir(dir);
  }

  setDir(dir: Dir): void {
    this.rotateBtn.textContent = `⟳ Rotate ${ARROWS[dir]}`;
  }

  setHint(text: string): void {
    this.hint.textContent = text;
  }

  toast(msg: string, good = false): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.toggle('bad', !good);
    this.toastEl.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), good ? 1400 : 2400);
  }

  /** Refresh pool numbers and cost affordability (cheap: only touches the DOM on change). */
  update(pool: Stock, used: number, cap: number): void {
    const key = `${pool.iron}|${pool.copper}|${pool.coal}|${used}|${cap}`;
    if (key === this.lastPoolKey) return;
    this.lastPoolKey = key;
    for (const m of MATERIALS) this.poolEls.get(m)!.textContent = String(pool[m]);
    this.capEl.textContent = `${used}/${cap}`;
    for (const [kind, b] of this.buildButtons) {
      const cost = BUILD_COSTS[kind];
      b.classList.toggle('cant', MATERIALS.some((m) => (cost[m] ?? 0) > pool[m]));
    }
  }
}

function div(className: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  return d;
}

function modeButton(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'hud-mode';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
