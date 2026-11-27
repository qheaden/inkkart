# Rendering & World

The 3D layer: sky dome, lights, ground, the track ribbon, the kart meshes and
the scenery instances — all Three.js meshes built from the pure modules'
output. The renderer is deliberately excluded from tests; everything it draws
is derived from data that *is* testable.

**Source:** `src/game/world.ts`, `src/game/kart.ts`
**Tests:** excluded by design (headless logic is covered by the other suites)

## Purpose

Draw the track, the kart and the environment. All geometry derives from the
same track samples and scenery items used by the physics/AI/scenery modules,
so the visuals and the logic can never drift apart.

## World (`world.ts`)

- `buildSky(radius = 900)` — a 900-radius sphere with a canvas-gradient
  texture (deep blue → pale horizon), BackSide, no fog, depthWrite off.
- `buildGround(radius = 700)` — a 700-radius green circle at y = −0.08,
  receives shadows.
- `buildLights(scene, track)` — hemisphere light (warm sky / green grass),
  plus a directional sun (0xfff2d9, 1.6) positioned over the track's centroid
  with a 260-unit shadow frustum, 2048×2048 shadow map, negative bias/normalBias
  to reduce acne.
- `buildTrackMeshes(track)` — the track ribbon group:
  - asphalt (width 16, 0x3b4048, vertex-colored)
  - white edge lines at ±(halfWidth − 0.75)
  - red/white curbs on both edges (1.25 wide, alternating per 6 samples)
  - white center dashes (3-sample dashes, 3-sample gaps, 0.28 half-width)
  - checkered start line at sample 0 (canvas texture, 8×2 checkers)
  - start gantry: two posts + dual-faced "START" banner planes (back-to-back so
    the kart reads the text from both directions), exposed as
    `userData.banners` for in-browser verification
- `buildSceneryGroup(items)` — clones a shared template per scenery type
  (tree / pine / rock / bush / mountain / cloud / lake), positions/scales/
  rotates each instance; mountains and clouds skip shadow casting. Materials
  are shared per type via a small cache.
- `buildSunGlow()` — a radial-gradient sprite mesh for the sun glow.

## Kart (`kart.ts`)

`buildKart(color = 0xe0393e)` — low-poly kart leaning into ~1.3 wide × 2.6 long:

- chassis box (1.14 × 0.34 × 2.25) + nose cone, cockpit opening, seated driver
  (capsule torso, sphere helmet, box visor), side pods, rear spoiler with
  struts, chrome exhausts, emissive headlights.
- four wheels: `CylinderGeometry(0.36, 0.36, 0.32)` rotated to spin around
  their local X axis, each inside its own steer group, so rolling stays a
  clean straight roll while the front wheels yaw with steering.
- `KartParts = { group, body, wheels, steerGroups }` — front two
  steerGroups yaw by `steer × 0.36` rad; all four wheels spin by
  `(absSpeed × dt) / 0.36`.
- `updateVisual(parts, dt, absSpeed, steer, throttle)` — per-frame wheel
  spin, body roll into turns (`targetRoll = steer × min(1, |speed|/40) × 0.15`,
  left turn lifts the left side) and squat/dive (nose up under throttle, down
  under braking), both smoothed with exponential damping.

## Notes

- Wheels use a shared tire material; helmet is yellow (`0xf6e23b`), torso is
  dark blue, spoiler body-colored — the kart carries its chassis color through
  the body and nose while keeping the dark cockpit/seat.
- The kart is built once per kart (player + 9 opponents) and only re-parented
  (group position/rotation) each frame — no geometry is rebuilt per frame.
