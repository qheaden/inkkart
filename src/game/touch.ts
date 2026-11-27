/**
 * On-screen touch controls for mobile devices.
 *
 * Pure logic (device detection, key merging, the multi-touch button tracker)
 * is exported for unit tests; the DOM wiring lives in `attachTouchControls`.
 *
 * The engine merges these keys with the keyboard keys (`unionKeys`) so both
 * can drive the kart at the same time. The engine only makes the controls
 * visible on mobile-like devices — desktops keep the keyboard layout.
 */
import { defaultKeys, type KartKeys } from './input';

export type TouchButton = 'left' | 'right' | 'throttle' | 'brake' | 'handbrake';

export const TOUCH_BUTTONS: readonly TouchButton[] = ['left', 'right', 'throttle', 'brake', 'handbrake'];

export interface TouchDeviceInfo {
  /** number of concurrent touch points the device supports (0 = none) */
  maxTouchPoints: number;
  /** whether the primary pointer is coarse (finger) — i.e. touch-first */
  coarsePointer: boolean;
}

/**
 * Mobile devices only get the on-screen controls: a coarse primary pointer
 * with at least one touch point. Desktops keep the keyboard layout — even
 * desktops with a touchscreen (fine primary pointer) stay keyboard-only.
 */
export function shouldShowTouchControls(info: TouchDeviceInfo): boolean {
  return info.maxTouchPoints > 0 && info.coarsePointer;
}

/**
 * OR-merge two key states. Keyboard and touch are independent sources of
 * truth (each writes its own `KartKeys`); the effective input is the union,
 * so +1 throttle from either side is just one held key.
 */
export function unionKeys(a: KartKeys, b: KartKeys): KartKeys {
  return {
    throttle: a.throttle || b.throttle,
    brake: a.brake || b.brake,
    left: a.left || b.left,
    right: a.right || b.right,
    handbrake: a.handbrake || b.handbrake,
  };
}

/**
 * Multi-touch button tracker. Remembers which touches are holding which
 * buttons, so releasing one finger does not release a button that another
 * finger is still holding. Keys are pointer ids (strings).
 */
export class TouchButtonTracker {
  private held = new Map<string, TouchButton>();

  press(id: string, button: TouchButton): void {
    this.held.set(id, button);
  }

  /** Release a touch; returns the button it was holding (or null). */
  release(id: string): TouchButton | null {
    const button = this.held.get(id) ?? null;
    this.held.delete(id);
    return button;
  }

  releaseAll(): void {
    this.held.clear();
  }

  isActive(button: TouchButton): boolean {
    for (const held of this.held.values()) {
      if (held === button) return true;
    }
    return false;
  }

  activeButtons(): TouchButton[] {
    const unique = new Set<TouchButton>();
    for (const held of this.held.values()) unique.add(held);
    return [...unique];
  }

  /** number of live touches */
  get size(): number {
    return this.held.size;
  }
}

/** Build a `KartKeys` state from the list of active buttons. */
export function keysFromActiveButtons(active: readonly TouchButton[]): KartKeys {
  const keys = defaultKeys();
  for (const button of active) keys[button] = true;
  return keys;
}

/** Read the device's touch/pointer capabilities in the browser. */
export function detectTouchDevice(): TouchDeviceInfo {
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  return {
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    coarsePointer:
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
  };
}

export interface TouchControlsOptions {
  /** container element holding the `[data-button]` / `[data-reset]` controls */
  root: HTMLElement;
  /** key state written by the touch controls (merged by the caller) */
  keys: KartKeys;
  /** audio-unlock hook, called on the first interaction */
  onAnyKey?: () => void;
  /** reset hook, called when the reset pill is tapped */
  onReset?: () => void;
}

const BUTTON_SELECTOR = '[data-button]';
const RESET_SELECTOR = '[data-reset]';

/**
 * Wire the touch controls in `root` to `keys`. Returns a detach function.
 *
 * Pointer capture keeps events flowing to a button even if the finger drifts
 * off it; `lostpointercapture`/`pointercancel` release the hold as a fallback.
 * All keys are released on window blur / tab hidden so a dropped frame cannot
 * strand a button in the pressed state.
 */
export function attachTouchControls(options: TouchControlsOptions): () => void {
  const { root, keys, onAnyKey, onReset } = options;
  const tracker = new TouchButtonTracker();
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(BUTTON_SELECTOR));

  const sync = (): void => {
    const active = new Set(tracker.activeButtons());
    keys.left = active.has('left');
    keys.right = active.has('right');
    keys.throttle = active.has('throttle');
    keys.brake = active.has('brake');
    keys.handbrake = active.has('handbrake');
    for (const btn of buttons) {
      btn.classList.toggle('is-pressed', active.has(btn.dataset.button as TouchButton));
    }
  };

  const onPointerDown = (e: PointerEvent): void => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest?.(BUTTON_SELECTOR) as HTMLButtonElement | null;
    if (btn && root.contains(btn)) {
      const button = btn.dataset.button as TouchButton;
      if (!TOUCH_BUTTONS.includes(button)) return;
      e.preventDefault();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        // some browsers reject the pointer id; the hold still works until
        // the browser fires a pointerup/pointercancel on the root
      }
      tracker.press(String(e.pointerId), button);
      sync();
      onAnyKey?.();
      return;
    }
    const reset = target?.closest?.(RESET_SELECTOR) as HTMLButtonElement | null;
    if (reset && root.contains(reset)) {
      e.preventDefault();
      onAnyKey?.();
      onReset?.();
    }
  };

  const onPointerEnd = (e: PointerEvent): void => {
    const id = String(e.pointerId);
    if (tracker.release(id)) sync();
  };

  const releaseAll = (): void => {
    if (tracker.size > 0) {
      tracker.releaseAll();
      sync();
    }
  };

  const onVisibilityChange = (): void => {
    if (document.hidden) releaseAll();
  };

  const onContextMenu = (e: Event): void => e.preventDefault();

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointerup', onPointerEnd);
  root.addEventListener('pointercancel', onPointerEnd);
  root.addEventListener('lostpointercapture', onPointerEnd);
  root.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointerup', onPointerEnd);
    root.removeEventListener('pointercancel', onPointerEnd);
    root.removeEventListener('lostpointercapture', onPointerEnd);
    root.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('blur', releaseAll);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    releaseAll();
  };
}
