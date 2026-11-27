# Track

The track is a closed-loop asphalt circuit defined by a Catmull-Rom spline and
sampled into a dense centerline that every other system (physics, AI, scenery,
rendering, timing) derives from.

**Source:** `src/game/track.ts`
**Tests:** `tests/track.test.ts`

## Purpose

- Gives karts a drivable ribbon: a centerline, a half-width, and per-sample
  forward tangents and left normals.
- Provides wrap-safe distance/progress queries used by physics (off-track,
  boundary push-back), the timer (lap progress), the AI (line following,
  corner radii) and scenery (clearance checks).

## Key API

- `Track` class — constructed from `TrackParams` (`width`, `sampleCount`,
  `controlPoints`).
  - `samples: TrackSample[]` — 720 samples by default; each sample is
    `{ x, z, tx, tz, nx, nz }` (world position, unit forward tangent, unit
    left normal in the XZ plane).
  - `length` — arc length of the spline (`curve.arcLengthDivisions = 800`).
  - `centroid` — mean of sample positions; used for the mountain ring, sun and
    sky placement.
  - `curve` — the underlying `THREE.CatmullRomCurve3` (`centripetal`, closed).
  - `closestPoint(x, z, hint?)` — nearest centerline sample. Accepts a previous
    sample index as a hint for a fast local search, with a full-scan fallback
    when the hint is stale. Returns `{ index, distance, progress }` where
    `progress = index / sampleCount` (0..1, wrap-safe).
  - `isOnTrack(x, z, hint?)` — within `halfWidth` of the centerline.
  - `radiusAt(index, k = 6)` — local cornering radius via tangent-angle finite
    differences (straights return `Infinity`).
  - `tangentAt(progress)` / `pointAt(progress, lateral = 0)` — forward unit
    vector and world position at a progress fraction; `lateral` shifts along
    the track's left normal.
  - `getSample(index)` — wrap-safe sample access.
- `DEFAULT_TRACK` — the race circuit: 18 control points, width 16 (halfWidth 8),
  720 samples. Long start straight, fast SE sweeper, tight east hairpin, north
  S-curve, NW hairpin, medium SW corner. Coordinates: x east, z south.
- `SPAWN_PROGRESS` — 0.03: where karts spawn, as a progress fraction.

## Notes

- Physics and scenery use the samples as the single source of truth; do not
  sample the spline directly elsewhere.
- `closestPoint` with a hint is the hot path (per kart per frame); the hint
  window is 40 samples and the staleness bailout is based on a `halfWidth + 80`
  distance threshold.
