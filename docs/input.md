# Input

Keyboard capture and the pure mapping from keys to physics input, with
exponential steering smoothing so turns feel weighty rather than twitchy.

**Source:** `src/game/input.ts`
**Tests:** `tests/input.test.ts`

## Purpose

Feed raw key state to the physics step. The mapping and smoothing are pure
(exported and unit-tested); only the `attachInput` DOM wiring is impure.

## Key map

| Key | Action |
| --- | --- |
| `W` / `↑` | throttle |
| `S` / `↓` | brake |
| `A` / `←` | steer left |
| `D` / `→` | steer right |
| `Space` | handbrake |

Keys are tracked by `KeyboardEvent.code`; throttle/brake/left/right/handbrake
are booleans in `KartKeys`, and `attachInput(keys, onAnyKey?)` wires
`keydown`/`keyup` listeners and returns a detach function. Arrow/space keys
are `preventDefault()`'d.

## Mapping (`mapKeysToInput`)

- throttle: `1` when throttle held, `-1` when brake held, else `0`.
- steer: `+1` left, `-1` right (sum of the two booleans — pressing both gives
  `0`).
- handbrake: straight passthrough.

## Steering smoothing (`smoothSteer`)

Exponential ease-in toward the target with rate 7/s by default
(`DEFAULT_STEER_SMOOTH_RATE`): `current + (target - current) × min(1, rate × dt)`,
snapping to the target when within 0.001. Higher rates snappier, lower rates
weightier. The engine ramps the player's steer through this and feeds the
*smoothed* value into the physics step, so holding a key produces a smooth turn
instead of an instant jerk.

## Notes

- The same smoothed steer is used for the visual steer wheels (front steer
  groups yaw by `steer × 0.36` rad).
- `attachInput` returns the detacher; the engine calls it on destroy.
