/**
 * Keyboard input capture for the kart.
 * Pure mapping logic (key events → input state) is exported for tests;
 * the DOM listener wiring lives in `attachInput`.
 */

export interface KartKeys {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
}

export interface MappedInput {
  throttle: number; // -1..1
  steer: number; // -1..1
  handbrake: boolean;
}

/**
 * Map raw key state to the physics input.
 * throttle: 1 when throttle held, -1 when brake held, 0 otherwise.
 * steer: +1 left (toward the driver's left, camera-mirrored axes), -1 right.
 */
export function mapKeysToInput(keys: KartKeys): MappedInput {
  const throttle = keys.throttle ? 1 : keys.brake ? -1 : 0;
  const steer = (keys.left ? 1 : 0) + (keys.right ? -1 : 0);
  return { throttle, steer, handbrake: keys.handbrake };
}

export function defaultKeys(): KartKeys {
  return { throttle: false, brake: false, left: false, right: false, handbrake: false };
}

/**
 * Steering smoothing rate (1/s). Higher values ramp the steer toward its
 * target faster (snappier); lower values feel weightier but more progressive.
 */
export const DEFAULT_STEER_SMOOTH_RATE = 7;

/**
 * Smooth a steering input toward its target.
 * Exponential ease-in: the kart leans into turns progressively instead of
 * snapping instantly, so holding a key gives a smooth turn instead of a jerk.
 * Snaps to the target when within a small epsilon.
 */
export function smoothSteer(
  current: number,
  target: number,
  dt: number,
  rate: number = DEFAULT_STEER_SMOOTH_RATE,
): number {
  const next = current + (target - current) * Math.min(1, rate * dt);
  if (Math.abs(target - next) < 0.001) return target;
  return next;
}

export type KeyHandler = (e: KeyboardEvent, down: boolean) => void;

/** Attach keyboard listeners; returns a detach function. */
export function attachInput(keys: KartKeys, onAnyKey?: () => void): () => void {
  const setKey = (e: KeyboardEvent, down: boolean) => {
    const code = e.code;
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        keys.throttle = down;
        e.preventDefault();
        break;
      case 'ArrowDown':
      case 'KeyS':
        keys.brake = down;
        e.preventDefault();
        break;
      case 'ArrowLeft':
      case 'KeyA':
        keys.left = down;
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'KeyD':
        keys.right = down;
        e.preventDefault();
        break;
      case 'Space':
        keys.handbrake = down;
        e.preventDefault();
        break;
      default:
        return;
    }
    if (down) onAnyKey?.();
  };
  const down = (e: KeyboardEvent) => setKey(e, true);
  const up = (e: KeyboardEvent) => setKey(e, false);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  };
}
