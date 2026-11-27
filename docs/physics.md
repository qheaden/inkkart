# Physics

Kart movement: longitudinal forces, an inertial heading model (velocity lags
the nose → real slip), lateral grip with a player-only high-speed fade, and
boundary push-back.

**Source:** `src/game/physics.ts`
**Tests:** `tests/physics.test.ts`

## Purpose

Compute each kart's next state from a `KartInput` (throttle / steer / handbrake)
against the track. Pure, deterministic and DOM/WebGL-free — the same step is
used for the player and for every AI opponent, so both follow identical rules.

## Key API

- `createKart(x, z, heading)` — fresh stationary kart state
  (`{ x, z, heading, vx, vz }`). Heading convention: forward =
  `(sin(heading), cos(heading))`.
- `stepKart(state, input, track, dt, params = DEFAULT_PHYSICS)` — advances the
  kart by `dt` and mutates/returns `state`.
- `forwardSpeed(state)` — forward speed along the heading direction.
- `speedGripFraction(speed, params)` — 0..1 grip multiplier from the
  high-speed fade (1 = full grip). Pure.
- `KartState` / `KartInput` / `PhysicsParams` interfaces.
- `DEFAULT_PHYSICS` — the player's tuning (see below).

## Model

1. **Longitudinal forces** (linearised, uncoupled per frame):
   - Throttle accelerates forward (`accel` 26 u/s²) unless handbraking.
   - Brake: 48 u/s² while moving forward, else reverse at 16 u/s².
   - Drag 0.35 (extra off-track drag factor ×3.2) and off-track cap.
   - Max forward speed 58 u/s (on track), 24 u/s (off track), max reverse 14 u/s.
   - Handbrake bleeds forward speed at 1.8/s.
2. **Steering / heading**: chassis heading rotates by
   `steer × turnRate × (fwd >= 0 ? 1 : -1) × min(1, |fwd| / 12) × (handbrake ? 1.45 : 1) × dt`
   (`turnRate` 2.55 rad/s). Speed below 12 u/s cannot turn (stationary karts
   don't pivot).
3. **Slip**: the world-space velocity is *not* rotated with the heading. It is
   rebuilt from the pre-rotation acceleration, then re-projected onto the new
   heading axes. The result is a slip angle — velocity lags the nose — which is
   the core of the slide.
4. **Lateral grip**: lateral velocity is removed at `grip` per second
   (`lateralGrip` 6.5 normally, `driftGrip` 1.6 while handbraking), scaled by
   `speedGripFraction`.
5. **Boundary push-back**: beyond `boundaryDistance` (90 u) from the centerline,
   the kart is pushed back toward the track and outward speed is damped, so it
   cannot escape into the void.

## High-speed grip fade (player only)

`speedSensitiveGrip` (`{ start: 44, end: 58, minGripFraction: 0.32 }`): below
44 u/s the kart keeps full grip; between 44 and 58 u/s grip fades linearly to
0.32; above 58 it stays at 0.32. This is what makes hard turning near max speed
slide — traction returns by slowing below ~44 u/s.

Computer players omit `speedSensitiveGrip` entirely (full grip, higher top
speed) — the fade is a deliberate player-tactability penalty.

## Tuning knobs

`accel`, `reverseAccel`, `brake`, `maxForwardSpeed`, `maxReverseSpeed`, `drag`,
`offTrackDrag`, `offTrackMaxSpeed`, `lateralGrip`, `driftGrip`, `turnRate`,
`boundaryDistance`, `boundaryPush`, `speedSensitiveGrip`.

## Notes

- The player uses `DEFAULT_PHYSICS`; the AI uses `DEFAULT_OPPONENT_PHYSICS`
  (in `opponents.ts`), which only changes `maxForwardSpeed` to 68 and drops the
  fade.
- All logic is pure: no `Math.random()`, no DOM. Same inputs ⇒ same state.
