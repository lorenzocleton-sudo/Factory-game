/**
 * Tiny HTML debug readout in the top-left corner (respects the notch / safe area).
 * HTML rather than canvas text so it stays crisp and costs nothing to update.
 */
export class DebugOverlay {
  private readonly el: HTMLDivElement;
  private lastUpdate = 0;

  constructor(parent: HTMLElement = document.body) {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
      left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
      padding: '4px 8px',
      borderRadius: '8px',
      background: 'rgba(20, 40, 60, 0.45)',
      color: '#fff',
      font: '11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      whiteSpace: 'pre',
      pointerEvents: 'none',
      zIndex: '10',
    } satisfies Partial<CSSStyleDeclaration>);
    parent.appendChild(this.el);
  }

  /** Throttled to ~10 updates/s. */
  update(lines: Record<string, string | number>): void {
    const now = performance.now();
    if (now - this.lastUpdate < 100) return;
    this.lastUpdate = now;
    this.el.textContent = Object.entries(lines)
      .map(([k, v]) => `${k} ${v}`)
      .join('\n');
  }
}
