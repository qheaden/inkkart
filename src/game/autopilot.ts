import type { Track } from './track';
import type { KartState } from './physics';

/**
 * Pure: steer toward a world-space target point.
 * Positive returns mean steering toward the driver's left.
 */
export function steerTowardPoint(kart: KartState, targetX: number, targetZ: number): number {
  const desired = Math.atan2(targetX - kart.x, targetZ - kart.z);
  let diff = desired - kart.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.max(-1, Math.min(1, diff * 2.2));
}

/**
 * Simple centerline-following autopilot.
 * Pure: same state in => same steering out.
 */
export function steerTowardCenterline(track: Track, kart: KartState, lookahead = 30): number {
  const n = track.closestPoint(kart.x, kart.z);
  const s = track.getSample((n.index + lookahead) % track.samples.length);
  return steerTowardPoint(kart, s.x, s.z);
}

/**
 * The full autopilot control input for one frame.
 * Slows in tight corners via reduced throttle.
 */
export function autopilotInput(track: Track, kart: KartState): { throttle: number; steer: number; handbrake: boolean } {
  const steer = steerTowardCenterline(track, kart, 30);
  const throttle = Math.abs(steer) > 0.55 ? 0.45 : 1;
  return { throttle, steer, handbrake: false };
}
