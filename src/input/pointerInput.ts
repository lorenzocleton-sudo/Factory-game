import { CAMERA, INPUT } from '../data/config';
import type { Camera, Point } from '../render/camera';

interface TrackedPointer {
  id: number;
  type: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
}

export interface PointerInputHandlers {
  /** A tap / click at a screen position (CSS px relative to the canvas). */
  onTap?: (screen: Point) => void;
}

/**
 * Camera navigation + tap detection.
 *
 * Touch:  one-finger tap = tap. Two fingers = pinch zoom + pan.
 *         (One-finger drag is intentionally left free for future building tools.)
 * Mouse:  click = tap, drag = pan, wheel = zoom at cursor.
 * Trackpad pinch (ctrl+wheel) also zooms.
 */
export class PointerInput {
  private readonly pointers = new Map<number, TrackedPointer>();
  /** True while the current press can still become a tap. */
  private tapCandidate = false;
  /** Set once a multi-touch gesture starts; cleared when all pointers lift. */
  private gestureActive = false;
  private lastMid: Point | null = null;
  private lastDist = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly camera: Camera,
    private readonly handlers: PointerInputHandlers = {},
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('lostpointercapture', this.onCancel);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', preventDefault);
    // iOS Safari page-zoom gestures.
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(ev, preventDefault, { passive: false } as AddEventListenerOptions);
    }
  }

  destroy(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onCancel);
    this.el.removeEventListener('lostpointercapture', this.onCancel);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('contextmenu', preventDefault);
  }

  private local(e: PointerEvent | WheelEvent): Point {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore: capture is best-effort */
    }
    const p = this.local(e);
    this.pointers.set(e.pointerId, {
      id: e.pointerId,
      type: e.pointerType,
      x: p.x,
      y: p.y,
      startX: p.x,
      startY: p.y,
      startTime: performance.now(),
    });

    if (this.pointers.size === 1 && !this.gestureActive) {
      this.tapCandidate = true;
    } else {
      // Second finger down: this is a gesture, never a tap.
      this.tapCandidate = false;
      this.gestureActive = true;
      this.resetPinchBaseline();
    }
  };

  private onMove = (e: PointerEvent): void => {
    const tp = this.pointers.get(e.pointerId);
    if (!tp) return;
    const p = this.local(e);
    const dx = p.x - tp.x;
    const dy = p.y - tp.y;
    tp.x = p.x;
    tp.y = p.y;

    if (this.pointers.size >= 2) {
      this.updatePinch();
      return;
    }

    if (Math.hypot(tp.x - tp.startX, tp.y - tp.startY) > INPUT.tapMaxMove) {
      this.tapCandidate = false;
    }

    // Mouse (and pen) drag pans. Touch single-finger drag is reserved.
    if (tp.type !== 'touch' && e.buttons !== 0 && !this.tapCandidate) {
      this.camera.panBy(dx, dy);
    }
  };

  private onUp = (e: PointerEvent): void => {
    const tp = this.pointers.get(e.pointerId);
    if (!tp) return;
    this.pointers.delete(e.pointerId);

    const isTap =
      this.tapCandidate &&
      this.pointers.size === 0 &&
      performance.now() - tp.startTime <= INPUT.tapMaxMs &&
      Math.hypot(tp.x - tp.startX, tp.y - tp.startY) <= INPUT.tapMaxMove;

    this.afterRelease();
    if (isTap) this.handlers.onTap?.({ x: tp.x, y: tp.y });
  };

  private onCancel = (e: PointerEvent): void => {
    if (!this.pointers.delete(e.pointerId)) return;
    this.tapCandidate = false;
    this.afterRelease();
  };

  private afterRelease(): void {
    if (this.pointers.size === 0) {
      this.tapCandidate = false;
      this.gestureActive = false;
      this.lastMid = null;
    } else if (this.pointers.size >= 2) {
      this.resetPinchBaseline();
    } else {
      // Down to one finger after a pinch: stop moving until it lifts.
      this.lastMid = null;
    }
  }

  private twoPointers(): [TrackedPointer, TrackedPointer] {
    const it = this.pointers.values();
    return [it.next().value as TrackedPointer, it.next().value as TrackedPointer];
  }

  private resetPinchBaseline(): void {
    if (this.pointers.size < 2) return;
    const [a, b] = this.twoPointers();
    this.lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.lastDist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  }

  private updatePinch(): void {
    const [a, b] = this.twoPointers();
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    if (!this.lastMid) {
      this.lastMid = mid;
      this.lastDist = dist;
      return;
    }
    // Pan with the midpoint, then zoom around the new midpoint.
    this.camera.panBy(mid.x - this.lastMid.x, mid.y - this.lastMid.y);
    this.camera.zoomAt(mid, dist / this.lastDist);
    this.lastMid = mid;
    this.lastDist = dist;
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16; // lines
    else if (e.deltaMode === 2) dy *= this.el.clientHeight; // pages
    // ctrl+wheel is a trackpad pinch: small deltas, so boost sensitivity.
    const sens = e.ctrlKey ? CAMERA.wheelSensitivity * 6 : CAMERA.wheelSensitivity;
    const factor = Math.exp(-dy * sens);
    this.camera.zoomAt(this.local(e), factor);
  };
}

function preventDefault(e: Event): void {
  e.preventDefault();
}
