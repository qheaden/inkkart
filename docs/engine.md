# Game Engine

The orchestrator: owns the renderer, scene, camera, the kart, all nine AI
opponents, the timer, the sound engine, the HUD, the input wiring and the
game loop. Ties the pure logic modules together and exposes debug hooks.

**Source:** `src/game/engine.ts` (the composition root), with per-frame
behavior mirrored in `src/main.ts` (bootstrap + R-reset + debug hook)
**Tests:** `tests/integration.test.ts`, plus in-browser verification hooks

## Purpose

Build the world once, then run the loop: countdown → GO → running, applying
physics to the kart and every opponent, resolving collisions, ticking the
timer, updating visuals/audio/camera/HUD, and rendering.

## Composition

The engine constructs and owns:

- `Track` from `DEFAULT_TRACK` (720 samples)
- `THREE.WebGLRenderer` (antialias, sRGB output, ACES tone mapping, PCF shadows)
- `THREE.Scene` with fog (210–780), background color, sky dome, hemisphere +
  directional sun light, ground circle, track ribbon group, scenery group, sun glow sprite
- Player kart mesh (red `0xe0393e`) + nine AI kart meshes (distinct colors)
- `RaceTimer`, `SoundEngine`, `Hud` (if `#hud-time` exists), `KartKeys`

## Lifecycle

1. `start()` — begins the rAF loop. `dt` is clamped to `[0.0001, 0.05]` s.
2. `frame(dt)` — two states:
   - **countdown** (3.6 s): decrements `countdown`, emits `3`/`2`/`1` messages
     and beeps at 2.6 / 1.6 / 0.6 thresholds, then at the 0.6 threshold flips to
     running, resets the timer and clock, plays the GO beep. Steering is
     pre-smoothed during countdown so the kart starts clean.
   - **running**: `raceTime += dt`; maps keys → smoothed steer → `stepKart`
     with `DEFAULT_PHYSICS`; computes each opponent's input and steps it with
     `DEFAULT_OPPONENT_PHYSICS`; resolves player-vs-opponent collisions and
     opponent-vs-opponent pairs (OBB); updates the timer (lap events → message
     + lap jingle); computes visual speed, slip-based camera shake and
     audio/HUD/camera/render.
3. `destroy()` — stops the loop, detaches input/listeners, disposes the
   renderer and removes the global debug hook.
4. `reset()` (bound to `R` in `main.ts`) — respawns the kart and all
   opponents, resets the timer and clock, returns to countdown, fades audio
   out and places the camera immediately.

## Camera

Third-person chase cam: target 9.2 units behind and 4.4 units up, lerp rate
`1 - exp(-6.5 × dt)`, look-at 7 units ahead. Shake on the grass (0.32) or on
hard slip (`max(0, slip - 9) × 0.018`), added as random jitter each frame.

## HUD / messages

- Lap events set a message banner (`LAP 2 — 1:23.45 ★ BEST`) with kind
  `lap` or `best`, and a lap jingle.
- Countdown messages come from the countdown step; `GET READY` is set on reset.

## Debug hooks (`window.__game`)

- `getSnapshot()` — `GameSnapshot` (status/countdown/lap/raceTime/current
  lap time/last/best/speed/speedKmh/slip/onTrack/progress/distance/position/
  heading/message/steer/throttle/handbrake/drawCalls/triangles).
- `reset()` — the reset path.
- `completeLap()` — browser tests: force a lap by faking the crossing
  (`furthest = 0.97`, feed 0.97 → 0.02).
- `getKartVisual()` — per-wheel steer yaw + roll spin (front-wheel steer
  groups and all wheels).
- `getBannerInfo()` — start-gantry banner planes (rotation, normal, position).
- `getOpponents()` — per-opponent state (name/color/position/heading/speed/
  progress/distance/onTrack/steer/throttle/targetLateral/lateral offset).

`window.__kartDebug.getSnapshot` is also installed by `main.ts`.

## Notes

- The engine holds no tuning logic itself beyond the countdown/GO gating and
  the camera; all gameplay tuning lives in the pure modules.
- `speedKmh = |forwardSpeed| × 2.6` for display.
- `updateVisual` is called with `(dt, absSpeed, steer, throttle)` once per kart
  per frame to drive wheel spin, body roll and squat/dive.
