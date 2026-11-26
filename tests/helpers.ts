import { Track, DEFAULT_TRACK } from '../src/game/track';
import type { KartState } from '../src/game/physics';

export function makeTrack(params = DEFAULT_TRACK): Track {
  return new Track(params);
}

/** Simple helper: steer a kart toward the next centerline point. */
export function steerInputTowardCenterline(track: Track, kart: KartState, lookahead: number = 25): number {
  const n = track.closestPoint(kart.x, kart.z);
  const s = track.getSample((n.index + lookahead) % track.samples.length);
  const desired = Math.atan2(s.x - kart.x, s.z - kart.z);
  let diff = desired - kart.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.max(-1, Math.min(1, diff * 2.2));
}
