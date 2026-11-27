# Scenery

Deterministic, track-aware placement of the world's scenery: trees, pines,
rocks, bushes, mountains, clouds and a lake — all placed from a seeded RNG so
the layout is stable across runs and fully testable.

**Source:** `src/game/scenery.ts`, `src/game/rng.ts`
**Tests:** `tests/scenery.test.ts`

## Purpose

Populate the map around the track without ever placing scenery on the drivable
ribbon, without overlaps, and without any randomness that changes between
sessions. Rendering (`world.ts`) consumes the same `SceneryItem[]` list, so
what you see is exactly what the tests verify.

## Key API

- `mulberry32(seed)` — seeded 32-bit PRNG (mulberry32); the single randomness
  source. Pure function: same seed ⇒ same stream.
- `generateScenery(track, params = DEFAULT_SCENERY)` — returns `SceneryItem[]`.
- `SceneryItem` — `{ type, x, z, y, scale, rotation }` with type ∈
  `'tree' | 'pine' | 'rock' | 'bush' | 'mountain' | 'cloud' | 'lake'`.
- `DEFAULT_SCENERY` — the shipped tuning:
  - seed 20240613
  - 90 trees (0.8–1.6 scale), 55 pines (0.9–1.9), 28 rocks (0.6–1.7), 70 bushes (0.7–1.5)
  - 14 mountains (ring around the track, centroid ± 300–430 units)
  - 10 clouds (infield-ish, radius 60–260, y 70–110)
  - minTrackDistance 14, maxTrackDistance 120
  - lake at [0, 0] (infield) if clear of the track by > halfWidth + 30

## Placement rules

- **Ground items** (trees, pines, rocks, bushes): sample a random centerline
  sample, pick a side, offset laterally in [minTrackDistance, maxTrackDistance],
  add ±15 units of longitudinal jitter, and require:
  - clearance ≥ `minTrackDistance` from the track (checked with
    `closestPoint`), and
  - no other ground item within 2.6 (bushes) / 3.4 (others) units — overlap
    rejection.
  - 60 attempts per item before giving up (placement degrades gracefully).
- **Mountains**: ring around the track centroid (one per ~1/14 of the circle,
  jittered), no track-clearance check (they sit far outside), scale 0.9–2.5.
- **Clouds**: random angle/radius around the centroid, no ground-clearance
  requirement; puffs of 4 icospheres.
- **Lake**: placed at the configured position only if it is at least
  `halfWidth + 30` from the centerline; otherwise omitted entirely.

## Notes

- The generator is pure: `generateScenery(track, params)` with the same params
  yields an identical layout every time, which is what the determinism tests
  assert.
- `minTrackDistance` is the hard floor for clearance; the `distanceToTrack`
  helper is just `Track.closestPoint(x, z).distance`.
- The lake check, not the lake geometry (radius 24 water disc + rim), is in
  `world.ts`.
