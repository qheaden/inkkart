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

## Touch controls (mobile)

On touch-capable, coarse-pointer devices (phones and tablets in portrait or
landscape) the engine attaches on-screen controls instead of relying on the
keyboard. Desktops keep the keyboard layout — even desktops with a
touchscreen (fine primary pointer) — and both sources can drive the kart at
the same time.

**Source:** `src/game/touch.ts` (detection, key union, multi-touch tracker, DOM wiring)
**Tests:** `tests/touch.test.ts`

### Device detection (`shouldShowTouchControls`)

Pure and unit-tested: shown only when `maxTouchPoints > 0 && coarsePointer`.
`detectTouchDevice()` reads `navigator.maxTouchPoints` and
`matchMedia('(pointer: coarse)')` in the browser.

### Layout

- bottom-left: steer ◀ / ▶ (hold)
- bottom-right: RESET (tap), HANDBRAKE (hold), BRAKE ▼ / GAS ▲
- The `#touch-controls` container is hidden by default; the engine adds
  `body.touch-mode` to reveal it. Touch buttons never intercept the
  renderer (pointer-events: none on the container, auto on the buttons).

### Wiring (`attachTouchControls`)

- One `pointerdown` handler on the container (event delegation): a
  `[data-button]` press records `pointerId → button` in a tracker; pointer
  capture keeps the events flowing even if the finger drifts off the button.
- The tracker keeps a button held until **every** touch holding it is
  released, so two fingers can hold GAS independently of steering.
- `pointerup` / `pointercancel` / `lostpointercapture` release the button;
  window blur and tab-hidden release all buttons so nothing gets stuck.
- A `[data-reset]` tap fires the engine's `reset()`.
- The first interaction unlocks audio, same as a keypress.
- Buttons toggle an `is-pressed` class for the green-tinged pressed look;
  `is-pressed.is-brake/throttle` stay their own hue.

### Key merge (`unionKeys`)

Keyboard and touch write separate `KartKeys` objects. The effective input is
their OR-merge, then it goes through the same `mapKeysToInput` →
`smoothSteer` path as before — the keyboard path is unchanged.

## Notes

- The same smoothed steer is used for the visual steer wheels (front steer
  groups yaw by `steer × 0.36` rad).
- `attachInput` returns the detacher; the engine calls it on destroy.
