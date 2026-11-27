# AI Opponents

Nine computer players racing alongside the player: three-line grid, distinct
lines/colors/speed factors, corner-aware speed control with braking,
player-avoidance, and OBB-based collision resolution (player vs AI and AI vs
AI). The same pure logic is also used for the browser smoke test through a
centerline-following autopilot.

**Source:** `src/game/opponents.ts`, `src/game/autopilot.ts`
**Tests:** `tests/opponents.test.ts`, `tests/integration.test.ts`

## Purpose

Give the field distinct personalities and make them hard to catch without
gaming the player: they drive their own preferred line, brake into corners,
swing away when the player is in their way, and never share a lane.

## Grid layout

- `DEFAULT_OPPONENTS` — nine specs, spawned just ahead of the player on the
  start straight (spawnProgress 0.038–0.082).
- Three lanes at lateral offsets −3.4 / 0.0 / +3.4 (half-ribbon is 8, so each
  line is safely inside the asphalt). Karts in the same line are staggered at
  least three grid slots (~17 units) apart, so no two boxes ever touch at
  spawn.
- Distinct chassis colors and mildly-differentiated `speedFactor`s (1.08–1.24).
- `spawnOpponent(track, spec)` — builds a kart state at the spec's spawn
  progress on the centerline, heading along the tangent.

## Physics for AI

- `DEFAULT_OPPONENT_PHYSICS` — `DEFAULT_PHYSICS` with `maxForwardSpeed` raised
  to 68 and the high-speed grip fade removed entirely. Computer players keep
  full grip at a higher top speed: the field stays hard to catch and the
  player's slide penalty is meaningless.
- `MAX_OPPONENT_SPEED = 64` — straight-line target speed ceiling.
- `RIBBON_MARGIN = 1.7` — karts keep this margin inside the asphalt.

## Per-frame control (`opponentInput`)

1. **Line choice**: `opponentTargetLateral` defaults to the spec's preferred
   lateral line. When the player is within `AVOID_DISTANCE = 12` units, the
   kart swings to the side of the ribbon *opposite* the player's side (if the
   player is dead-ahead on centerline, it swings to the side the preferred
   line is not on).
2. **Steering**: aim at a centerline sample `lookahead` samples ahead of the
   kart, offset by the target lateral line. Corner-aware lookahead: shorter
   (down to 9, or 12 for evasive swings) in sharp corners so the aim point
   stays on the ribbon; longer on straights. When avoiding the player the aim
   point is pulled closer (≤ 12) so the swing completes in time.
3. **Throttle**: the slowest corner ahead in a ~1.5×forward-speed window
   (min 30, max 96 samples; `radiusAt` over the window) decides the target
   speed: `max(16, min(64, 7.2 × sqrt(radius)))`, straights ⇒ 64. Throttle is
   - `-0.9` (braking) when moving faster than the corner allows,
   - `0.5`/`0.85` when evasive,
   - otherwise `1` (× `speedFactor`), reduced to `0.45` when steering hard.
   Throttle is clamped to [-1, 1].

## Autopilot (`autopilot.ts`)

A pure, centerline-following control scheme used in tests and for the full-lap
smoke test: steers toward a centerline sample 30 samples ahead; throttle is
0.45 when steering hard (|steer| > 0.55), else 1. Shares no code with the AI —
it is the test harness's reference driver, not the opponent's logic.

## Collision resolution

- `kartObbCorners` — world-space corners of a kart's oriented bounding box
  (halfWidth 0.75, halfLength 1.35).
- `obbCollision(a, b)` — SAT-style shortest-translation-vector between two
  boxes along their four world-space axes (both karts' right and forward
  axes). Returns the vector pushing `a` out of `b`'s box, or `null` when no
  overlap. Pure.
- `pushApart(a, b, shareA = 0.5, restitution = 0.35)` — positional correction
  (split by `shareA`) plus a soft velocity separation (impulse `j` along the
  normal). Returns whether a collision was resolved.
- `resolveCollisions(player, opponents)` — pushes the player out of every
  opponent's box, splitting the correction (player share 0.55). The engine
  additionally resolves opponent-vs-opponent pairs at 0.5/0.5.

## Notes

- All logic is pure — no DOM, no randomness — so it is fully unit-testable.
- `lateralOffset` returns the signed lateral distance of a point relative to
  the nearest centerline sample (track left-normal direction); used by the
  debug hooks and tests.
- Engine-side per-frame pipeline (`engine.ts`): compute input → step kart →
  resolve player-vs-opponent collisions → resolve opponent-vs-opponent pairs.
