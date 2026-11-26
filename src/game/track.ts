import * as THREE from 'three';

export interface TrackSample {
  /** world position of the track centerline at this sample */
  x: number;
  z: number;
  /** unit tangent in XZ plane */
  tx: number;
  tz: number;
  /** unit perpendicular (left side of the track) in XZ plane */
  nx: number;
  nz: number;
}

export interface TrackParams {
  /** total width of the drivable ribbon */
  width: number;
  /** number of centerline samples used for physics/scenery queries */
  sampleCount: number;
  /** control points (x, z) forming a closed loop */
  controlPoints: Array<[number, number]>;
}

/**
 * A closed-loop asphalt track defined by a Catmull-Rom spline.
 * Everything physics and gameplay needs derives from the sampled centerline.
 */
export class Track {
  readonly width: number;
  readonly halfWidth: number;
  readonly samples: TrackSample[] = [];
  readonly length: number;
  readonly curve: THREE.CatmullRomCurve3;
  readonly centroid: { x: number; z: number };

  constructor(params: TrackParams) {
    this.width = params.width;
    this.halfWidth = params.width / 2;
    const points = params.controlPoints.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
    this.curve.arcLengthDivisions = 800;
    this.length = this.curve.getLength();
    this.samples = [];

    for (let i = 0; i < params.sampleCount; i++) {
      const t = i / params.sampleCount;
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const tl = Math.hypot(tan.x, tan.z);
      const tx = tan.x / tl;
      const tz = tan.z / tl;
      // left normal in XZ plane
      const nx = -tz;
      const nz = tx;
      this.samples.push({ x: p.x, z: p.z, tx, tz, nx, nz });
    }

    // Bridge the gap between the first and last sample so distance queries are wrap-safe.
    let cx = 0;
    let cz = 0;
    for (const s of this.samples) {
      cx += s.x;
      cz += s.z;
    }
    this.centroid = { x: cx / this.samples.length, z: cz / this.samples.length };
  }

  /** Wrap a progress fraction into [0, 1) */
  static wrapProgress(p: number): number {
    return ((p % 1) + 1) % 1;
  }

  getSample(index: number): TrackSample {
    const i = ((Math.round(index) % this.samples.length) + this.samples.length) % this.samples.length;
    return this.samples[i]!;
  }

  /**
   * Find the centerline sample closest to (x, z).
   * `hint` is an optional previous index; when provided a small local search window is used
   * first, falling back to a full scan when the hint is clearly stale.
   */
  closestPoint(x: number, z: number, hint: number = -1): { index: number; distance: number; progress: number } {
    const n = this.samples.length;
    let best = -1;
    let bestDist = Infinity;

    const scan = (i: number) => {
      const s = this.samples[i]!;
      const dx = s.x - x;
      const dz = s.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    };

    if (hint >= 0) {
      const window = Math.min(40, n - 1);
      for (let k = -window; k <= window; k++) {
        scan(((hint + k) % n + n) % n);
      }
      // sanity check: if best is nowhere near viable, do a full scan
      if (best >= 0 && bestDist > (this.halfWidth + 80) * (this.halfWidth + 80)) {
        best = -1;
        bestDist = Infinity;
      }
    }
    if (best < 0) {
      for (let i = 0; i < n; i++) scan(i);
    }

    return {
      index: best,
      distance: Math.sqrt(bestDist),
      progress: best / n,
    };
  }

  /** Is the point on the drivable ribbon (within halfWidth)? */
  isOnTrack(x: number, z: number, hint: number = -1): boolean {
    return this.closestPoint(x, z, hint).distance <= this.halfWidth;
  }

  /**
   * Local cornering radius of the centerline at sample index,
   * via tangent-angle finite differences. Straights return Infinity.
   */
  radiusAt(index: number, k: number = 6): number {
    const n = this.samples.length;
    const i0 = ((index - k) % n + n) % n;
    const i1 = (index + k) % n;
    const s0 = this.samples[i0]!;
    const s1 = this.samples[i1]!;
    const a0 = Math.atan2(s0.tx, s0.tz);
    const a1 = Math.atan2(s1.tx, s1.tz);
    let d = a1 - a0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const ds = Math.hypot(s1.x - s0.x, s1.z - s0.z);
    if (ds < 1e-9 || Math.abs(d) < 1e-9) return Infinity;
    return ds / Math.abs(d);
  }

  /** Forward unit vector along the centerline at progress p (0..1). */
  tangentAt(progress: number): { tx: number; tz: number } {
    const s = this.getSample(progress * this.samples.length);
    return { tx: s.tx, tz: s.tz };
  }

  /** World position at progress p; `lateral` shifts along the track's left normal. */
  pointAt(progress: number, lateral: number = 0): { x: number; z: number } {
    const s = this.getSample(progress * this.samples.length);
    return { x: s.x + s.nx * lateral, z: s.z + s.nz * lateral };
  }
}

/**
 * The full closed loop. Coordinates in world units.
 * A varied circuit: a long start straight, a fast right-hand sweeper, a
 * tight hairpin on the east side, a north S-curve, a NW hairpin, and a
 * medium-radius SW corner back onto the start straight.
 * (x east, z south.)
 */
export const DEFAULT_TRACK: TrackParams = {
  width: 16,
  sampleCount: 720,
  controlPoints: [
    [-10, 155],   // 0 start line, long straight heading east
    [70, 156],
    [135, 148],
    [175, 118],   // gentle right entry
    [196, 62],    // fast SE sweeper
    [188, -12],   // east side hairpin (tight)
    [142, -48],
    [95, -42],    // fast left wiggle
    [60, -72],
    [10, -96],    // north side (gentle S-curve)
    [-35, -86],
    [-95, -102],
    [-150, -80],  // NW corner hairpin (tight)
    [-178, -28],
    [-178, 30],   // west side straight heading south
    [-170, 75],
    [-125, 100],  // SW exit heading east
    [-75, 152],   // final straight entry
  ],
};

/** Start/finish line offset: where the kart spawns, as a progress fraction. */
export const SPAWN_PROGRESS = 0.03;
