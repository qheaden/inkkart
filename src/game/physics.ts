import type { Track } from './track';

export interface KartState {
  /** world position */
  x: number;
  z: number;
  /** heading in radians; forward = (sin(heading), cos(heading)) */
  heading: number;
  /** velocity in XZ plane */
  vx: number;
  vz: number;
}

export interface KartInput {
  /** throttle: 0 = coast, 1 = full, -1 = full brake/reverse */
  throttle: number;
  /** steering: +1 toward the driver's left, -1 toward the driver's right */
  steer: number;
  /** handbrake: drifts, cuts engine, reduces grip */
  handbrake: boolean;
}

export interface PhysicsParams {
  accel: number;
  reverseAccel: number;
  brake: number;
  maxForwardSpeed: number;
  maxReverseSpeed: number;
  drag: number;
  offTrackDrag: number;
  offTrackMaxSpeed: number;
  lateralGrip: number;
  driftGrip: number;
  turnRate: number;
  boundaryDistance: number;
  boundaryPush: number;
  /**
   * Optional high-speed grip fade. Below `start` the kart keeps full grip;
   * between `start` and `end` lateral grip fades linearly from 1.0 down to
   * `minGripFraction`; above `end` grip stays at `minGripFraction`.
   * Used by the player kart so turning near max speed makes the car slide.
   * Omitted for computer players (they keep full grip).
   */
  speedSensitiveGrip?: {
    start: number;
    end: number;
    minGripFraction: number;
  };
}

export const DEFAULT_PHYSICS: PhysicsParams = {
  accel: 26,
  reverseAccel: 16,
  brake: 48,
  maxForwardSpeed: 58,
  maxReverseSpeed: 14,
  drag: 0.35,
  offTrackDrag: 3.2,
  offTrackMaxSpeed: 24,
  lateralGrip: 6.5,
  driftGrip: 1.6,
  turnRate: 2.55,
  boundaryDistance: 90,
  boundaryPush: 26,
  // Less lateral grip at near-max speed: turning hard while fast makes the
  // kart slide. Traction is recovered by slowing down below ~44 u/s.
  speedSensitiveGrip: { start: 44, end: 58, minGripFraction: 0.32 },
};

export function createKart(x: number, z: number, heading: number): KartState {
  return { x, z, heading, vx: 0, vz: 0 };
}

/**
 * Effective lateral-grip fraction at a given forward speed (1 = full grip).
 * Pure: same inputs => same output.
 */
export function speedGripFraction(speed: number, params: PhysicsParams): number {
  const fade = params.speedSensitiveGrip;
  if (!fade || speed <= fade.start) return 1;
  const t = Math.min(1, (speed - fade.start) / Math.max(1e-6, fade.end - fade.start));
  return 1 - (1 - fade.minGripFraction) * t;
}

/** Forward speed along the heading direction. */
export function forwardSpeed(s: KartState): number {
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  return s.vx * fx + s.vz * fz;
}

/**
 * Advance the kart one step. Mutates and returns `state`.
 * Pure with respect to its inputs (no I/O), so it is fully unit-testable.
 */
export function stepKart(
  state: KartState,
  input: KartInput,
  track: Track,
  dt: number,
  params: PhysicsParams = DEFAULT_PHYSICS,
): KartState {
  const fx = Math.sin(state.heading);
  const fz = Math.cos(state.heading);
  // right vector (perpendicular to forward in XZ plane)
  const rx = fz;
  const rz = -fx;

  let fwd = state.vx * fx + state.vz * fz;
  let lat = state.vx * rx + state.vz * rz;

  const nearest = track.closestPoint(state.x, state.z);
  const onTrack = nearest.distance <= track.halfWidth;

  // ---- longitudinal forces (unchanged) ----
  const handbrake = input.handbrake;
  if (input.throttle > 0) {
    if (!handbrake) {
      fwd += input.throttle * params.accel * dt;
    }
  } else if (input.throttle < 0) {
    if (fwd > 0.5) {
      fwd -= params.brake * dt; // braking while moving forward
    } else {
      fwd += input.throttle * params.reverseAccel * dt; // reverse
    }
  }

  // drag / rolling resistance
  const dragCoef = onTrack ? 1.0 : params.offTrackDrag * 0.4;
  fwd -= fwd * params.drag * dragCoef * dt;

  // off-track cap
  const maxSpeed = onTrack ? params.maxForwardSpeed : params.offTrackMaxSpeed;
  if (fwd > maxSpeed) fwd = maxSpeed;
  if (fwd < -params.maxReverseSpeed) fwd = -params.maxReverseSpeed;

  // handbrake bleeds forward speed quickly
  if (handbrake) fwd -= fwd * 1.8 * dt;

  // ---- steering: the chassis rotates, but the velocity keeps its inertia ----
  const steerNorm = Math.max(-1, Math.min(1, input.steer));
  const speedFactor = Math.min(1, Math.abs(fwd) / 12);
  const sign = fwd >= 0 ? 1 : -1;
  const turnBoost = handbrake ? 1.45 : 1.0;
  const dTheta = steerNorm * params.turnRate * sign * speedFactor * turnBoost * dt;
  state.heading += dTheta;

  // Physics: the kart's velocity does NOT rotate with the heading.
  // Rebuild the world-space velocity with the pre-rotation acceleration
  // (inertia), then re-project it onto the new heading axes. This is what
  // produces a real slip angle — the velocity lags the nose — which is the
  // core of the slide.
  const worldFx = fx * fwd + rx * lat;
  const worldFz = fz * fwd + rz * lat;

  const nfx = Math.sin(state.heading);
  const nfz = Math.cos(state.heading);
  const nrx = nfz;
  const nrz = -nfx;

  const fwd2 = worldFx * nfx + worldFz * nfz;
  let lat2 = worldFx * nrx + worldFz * nrz;

  // ---- lateral friction (grip): removes the slip velocity ----
  const fullGrip = handbrake ? params.driftGrip : params.lateralGrip;
  const grip = fullGrip * speedGripFraction(Math.max(0, fwd2), params);
  lat2 -= lat2 * Math.min(1, grip * dt);

  // ---- reassemble velocity ----
  state.vx = nfx * fwd2 + nrx * lat2;
  state.vz = nfz * fwd2 + nrz * lat2;

  // ---- position ----
  state.x += state.vx * dt;
  state.z += state.vz * dt;

  // ---- boundary push-back so the kart cannot escape into the void ----
  const farCheck = track.closestPoint(state.x, state.z);
  if (farCheck.distance > params.boundaryDistance) {
    const s = track.getSample(farCheck.index);
    const dx = s.x - state.x;
    const dz = s.z - state.z;
    const d = Math.hypot(dx, dz) || 1;
    const push = (params.boundaryPush * dt) / d;
    state.x += dx * push;
    state.z += dz * push;
    // kill outward speed
    state.vx = state.vx * 0.9 + (dx / d) * params.boundaryPush * dt;
    state.vz = state.vz * 0.9 + (dz / d) * params.boundaryPush * dt;
  }

  return state;
}
