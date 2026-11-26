import type { Track } from './track';
import type { KartState, KartInput, PhysicsParams } from './physics';
import { createKart, forwardSpeed, DEFAULT_PHYSICS } from './physics';
import { steerTowardPoint } from './autopilot';

/**
 * Computer players.
 * Pure: same state in => same input out, so behavior is fully unit-testable.
 * The engine wires these to the shared physics and to per-kart meshes.
 */

export interface OpponentSpec {
  name: string;
  /** chassis color of the opponent's kart */
  color: number;
  /** progress (0..1) along the track where the opponent spawns */
  spawnProgress: number;
  /** preferred lateral offset from the centerline in track units (world units along the
   *  track normal). Exactly half the ribbon is 8; keep inside ±(halfWidth-1.7).
   *  Distinct per opponent so they drive in different lines. */
  preferredLateral: number;
  /** throttle personality multiplier (1 = equal to the player, <1 = slightly slower) */
  speedFactor: number;
}

/**
 * Nine computer players ahead of the player on the start straight.
 * Three-line grid: every kart shares one of three distinct lateral lines
 * (-3.4, 0.0, +3.4) and karts in the same line are staggered at least three
 * grid slots (~17 units) apart, so no two boxes ever touch. Adjacent slots
 * are in different lines (3.4 units apart laterally — safely clear).
 * Distinct chassis colors and mildly-differentised speed factors.
 */
export const DEFAULT_OPPONENTS: readonly OpponentSpec[] = Object.freeze([
  { name: 'Blue', color: 0x2471d3, spawnProgress: 0.038, preferredLateral: -3.4, speedFactor: 1.22 },
  { name: 'Purple', color: 0x9b59b6, spawnProgress: 0.0435, preferredLateral: 0.0, speedFactor: 1.16 },
  { name: 'Teal', color: 0x1abc9c, spawnProgress: 0.049, preferredLateral: 3.4, speedFactor: 1.24 },
  { name: 'Amber', color: 0xe67e22, spawnProgress: 0.0545, preferredLateral: -3.4, speedFactor: 1.14 },
  { name: 'Lime', color: 0x8ac926, spawnProgress: 0.060, preferredLateral: 0.0, speedFactor: 1.10 },
  { name: 'Pink', color: 0xe84393, spawnProgress: 0.0655, preferredLateral: 3.4, speedFactor: 1.20 },
  { name: 'Cyan', color: 0x00b8d4, spawnProgress: 0.071, preferredLateral: -3.4, speedFactor: 1.18 },
  { name: 'Brown', color: 0x8d6e63, spawnProgress: 0.0765, preferredLateral: 0.0, speedFactor: 1.08 },
  { name: 'Grey', color: 0xd7d7d0, spawnProgress: 0.082, preferredLateral: 3.4, speedFactor: 1.12 },
]);

/**
 * Physics for computer players: slightly faster on straights than the player.
 * The cap above the player's maxForwardSpeed is what makes them hard to catch.
 * Computer players keep full lateral grip (no high-speed fade) — the fade is
 * a player-tractability penalty, so the field stays hard to catch.
 */
export const DEFAULT_OPPONENT_PHYSICS: PhysicsParams = Object.freeze({
  ...DEFAULT_PHYSICS,
  maxForwardSpeed: 68,
  speedSensitiveGrip: undefined,
});

/** Absolute top speed the computer players hold on straights (world units/s). */
export const MAX_OPPONENT_SPEED = 64;

/** How close (in world units) counts as "the player is in our way". */
export const AVOID_DISTANCE = 12;

/** How many centerline samples ahead to aim at when steering. */
export const LOOKAHEAD_SAMPLES = 26;

/** Margin kept inside the asphalt so karts never ride the very edge. */
export const RIBBON_MARGIN = 1.7;

/** Small gap between two kart geometries when testing overlaps (world units). */
export const DEFAULT_HALF_WIDTH = 0.75;
export const DEFAULT_HALF_LENGTH = 1.35;

/** Build a fresh kart state for the given spec (positioned on the ribbon). */
export function spawnOpponent(track: Track, spec: OpponentSpec): KartState {
  const p = track.pointAt(spec.spawnProgress, spec.preferredLateral);
  const tangent = track.tangentAt(spec.spawnProgress);
  return createKart(p.x, p.z, Math.atan2(tangent.tx, tangent.tz));
}

/** Lateral offset (track left-normal direction, world units) of a point relative to the track. */
export function lateralOffset(track: Track, x: number, z: number): number {
  const n = track.closestPoint(x, z);
  const s = track.getSample(n.index);
  return (x - s.x) * s.nx + (z - s.z) * s.nz;
}

/**
 * The lateral target an opponent should aim at for the current frame.
 * Defaults to the spec's preferred line; if the player is close, the kart
 * swings to the far side of the ribbon.
 */
export function opponentTargetLateral(
  track: Track,
  kart: KartState,
  player: KartState,
  preferredLateral: number,
  avoidDistance: number = AVOID_DISTANCE,
): { lateral: number; avoided: boolean } {
  const n = track.closestPoint(kart.x, kart.z);
  const s = track.getSample(n.index);
  const dx = player.x - kart.x;
  const dz = player.z - kart.z;
  const dist = Math.hypot(dx, dz);

  if (dist >= avoidDistance || dist < 1e-6) {
    return { lateral: preferredLateral, avoided: false };
  }

  const playerLateral = dx * s.nx + dz * s.nz;
  const limit = track.halfWidth - RIBBON_MARGIN;

  // Push to the side of the ribbon opposite the player's side.
  // When the player is dead ahead on centerline, swing to the side the
  // preferred line is NOT on.
  let away: number;
  if (Math.abs(playerLateral) < 1.0) {
    away = preferredLateral >= 0 ? -1 : 1;
  } else {
    away = playerLateral > 0 ? -1 : 1;
  }
  const lateral = Math.max(-limit, Math.min(limit, away * limit));
  return { lateral, avoided: true };
}

/**
 * The opponent's control input for one frame.
 * Follows its preferred line and swings to the far side of the ribbon when
 * the player is nearby (aiming nearer so the swing completes in time),
 * and throttles back in tight corners.
 */
export function opponentInput(
  track: Track,
  kart: KartState,
  player: KartState,
  spec: OpponentSpec,
  opts: { lookahead?: number; avoidDistance?: number } = {},
): KartInput {
  const avoidDistance = opts.avoidDistance ?? AVOID_DISTANCE;
  const n = track.closestPoint(kart.x, kart.z);
  const target = opponentTargetLateral(track, kart, player, spec.preferredLateral, avoidDistance);
  const fwd = forwardSpeed(kart);

  // Aim at a point on the desired line ahead of the kart. Corner-aware
  // lookahead: shorter in sharp corners so the aim point stays on the ribbon,
  // longer on straights (predictive driving).
  const localRadius = track.radiusAt(n.index);
  const cornerAware = Math.max(0, Math.min(1, 1 - localRadius / 130));
  const lookahead = target.avoided
    ? Math.min(opts.lookahead ?? LOOKAHEAD_SAMPLES, 12)
    : Math.max(9, Math.round((opts.lookahead ?? LOOKAHEAD_SAMPLES) * (1 - cornerAware * 0.62)));
  const aimSample = track.getSample((n.index + lookahead) % track.samples.length);
  const limit = track.halfWidth - RIBBON_MARGIN;
  const aimLateral = Math.max(-limit, Math.min(limit, target.lateral));
  const targetX = aimSample.x + aimSample.nx * aimLateral;
  const targetZ = aimSample.z + aimSample.nz * aimLateral;
  const steer = steerTowardPoint(kart, targetX, targetZ);

  // Slowest corner ahead decides the pace: brake when the kart moves faster
  // than the corner can take it (speed-proportional lookahead window).
  const lookaheadN = Math.max(30, Math.min(96, Math.round(fwd * 1.5)));
  let radius = track.radiusAt(n.index);
  for (let i = 4; i <= lookaheadN; i += 4) {
    const r = track.radiusAt((n.index + i) % track.samples.length);
    if (r < radius) radius = r;
  }
  const targetSpeed = Number.isFinite(radius)
    ? Math.max(16, Math.min(MAX_OPPONENT_SPEED, 7.2 * Math.sqrt(radius)))
    : MAX_OPPONENT_SPEED;

  let throttle: number;
  if (target.avoided) {
    throttle = Math.abs(steer) > 0.6 ? 0.5 : 0.85;
  } else if (fwd > targetSpeed + 3) {
    throttle = -0.9;
  } else {
    throttle = Math.abs(steer) > 0.55 ? 0.45 : 1;
    throttle *= spec.speedFactor;
  }

  return { steer, throttle: Math.max(-1, Math.min(1, throttle)), handbrake: false };
}

// ---------------------------------------------------------------------------
// Bounding-box collision (oriented rectangles, aka OBBs)
// ---------------------------------------------------------------------------

/** World-space corners of a kart's bounding box. */
export function kartObbCorners(
  kart: KartState,
  halfWidth: number = DEFAULT_HALF_WIDTH,
  halfLength: number = DEFAULT_HALF_LENGTH,
): Array<{ x: number; z: number }> {
  const fx = Math.sin(kart.heading);
  const fz = Math.cos(kart.heading);
  // right vector (perpendicular to forward in the XZ plane)
  const rx = fz;
  const rz = -fx;
  const pts: Array<{ x: number; z: number }> = [];
  for (const [sFx, sRx] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    pts.push({
      x: kart.x + rx * halfWidth * sRx + fx * halfLength * sFx,
      z: kart.z + rz * halfWidth * sRx + fz * halfLength * sFx,
    });
  }
  return pts;
}

function projectCorners(
  corners: Array<{ x: number; z: number }>,
  ax: number,
  az: number,
): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of corners) {
    const d = p.x * ax + p.z * az;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

/**
 * Shortest-translation-vector between the bounding boxes of two karts.
 * Returns the vector that pushes `a` out of the overlap (unit axis × depth),
 * or null when the boxes do not intersect.
 * Pure: same states in => same vector out.
 */
export function obbCollision(
  a: KartState,
  b: KartState,
  halfWidth: number = DEFAULT_HALF_WIDTH,
  halfLength: number = DEFAULT_HALF_LENGTH,
): { dx: number; dz: number; depth: number } | null {
  const cornersA = kartObbCorners(a, halfWidth, halfLength);
  const cornersB = kartObbCorners(b, halfWidth, halfLength);

  const axes: Array<{ x: number; z: number }> = [];
  const fwdA = { x: Math.sin(a.heading), z: Math.cos(a.heading) };
  const rightA = { x: Math.cos(a.heading), z: -Math.sin(a.heading) };
  const fwdB = { x: Math.sin(b.heading), z: Math.cos(b.heading) };
  const rightB = { x: Math.cos(b.heading), z: -Math.sin(b.heading) };
  axes.push(rightA, fwdA, rightB, fwdB);

  let bestDepth = Infinity;
  let bestAxis: { x: number; z: number } | null = null;

  for (const axis of axes) {
    const [minA, maxA] = projectCorners(cornersA, axis.x, axis.z);
    const [minB, maxB] = projectCorners(cornersB, axis.x, axis.z);
    const depth = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (depth <= 0) return null; // separating axis found — no overlap
    if (depth < bestDepth) {
      bestDepth = depth;
      bestAxis = axis;
    }
  }

  if (!bestAxis) return null;

  // Orient the axis from B toward A so the vector pushes A away from B.
  const dirX = a.x - b.x;
  const dirZ = a.z - b.z;
  const dot = bestAxis.x * dirX + bestAxis.z * dirZ;
  const s = dot < 0 ? -1 : 1;
  return { dx: bestAxis.x * s * bestDepth, dz: bestAxis.z * s * bestDepth, depth: bestDepth };
}

/**
 * Positional correction (+ a soft velocity response) so `a` leaves `b`'s box.
 * Returns whether a collision was resolved.
 * `shareA`: fraction of positional correction applied to A (0.5 = split).
 */
export function pushApart(
  a: KartState,
  b: KartState,
  shareA: number = 0.5,
  restitution: number = 0.35,
  halfWidth?: number,
  halfLength?: number,
): boolean {
  const mtv = obbCollision(a, b, halfWidth, halfLength);
  if (!mtv) return false;
  const len = Math.hypot(mtv.dx, mtv.dz);
  if (len < 1e-9) return true; // overlapping but no meaningful axis — just report

  // positional correction
  a.x += mtv.dx * shareA;
  a.z += mtv.dz * shareA;
  b.x -= mtv.dx * (1 - shareA);
  b.z -= mtv.dz * (1 - shareA);

  // soft velocity separation along the normal
  const nx = mtv.dx / len;
  const nz = mtv.dz / len;
  const relN = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (relN < 0) {
    const j = -(1 + restitution) * relN / 2;
    a.vx += j * nx;
    a.vz += j * nz;
    b.vx -= j * nx;
    b.vz -= j * nz;
  }
  return true;
}

/**
 * Resolve the player's bounding box against every opponent kart.
 * Returns the number of collisions resolved.
 */
export function resolveCollisions(
  player: KartState,
  opponents: KartState[],
  opts: { sharePlayer?: number; restitution?: number; halfWidth?: number; halfLength?: number } = {},
): number {
  const sharePlayer = opts.sharePlayer ?? 0.55;
  const restitution = opts.restitution ?? 0.35;
  let resolved = 0;
  for (const opp of opponents) {
    if (pushApart(player, opp, sharePlayer, restitution, opts.halfWidth, opts.halfLength)) {
      resolved++;
    }
  }
  return resolved;
}
