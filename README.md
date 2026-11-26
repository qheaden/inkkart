# InkKart

A realtime 3D kart time-trial racer, built with **Bun + TypeScript + Three.js**.
Race the track on your own, outrun nine computer players, and try to beat your best
lap.

**Status:** working time trial — countdown → GO, lap timer, scenery, Web Audio, and
nine opponents racing alongside the player.

## Play

```bash
bun install     # once
bun run start   # build + serve on http://localhost:3000/
```

| Key | Action |
| --- | --- |
| `W` / `↑` | throttle |
| `S` / `↓` | brake |
| `A` / `D` / `←` / `→` | steer (smooth, ramped heading changes) |
| `Space` | handbrake — cuts the engine and reduces grip |
| `R` | reset the player and all opponents to the grid |

The kart is deliberately **less grippy at near-max speed** (roughly 44–58 u/s):
turn hard while flat out and the back end slides, and you need to slow down to
regain traction. The computer players keep full grip and a higher top speed, so
they stay hard to catch — learn the track, brake early, and carry your lines.

## Development

```bash
bun run build       # bundle src/main.ts → dist/ (index.html included)
bun run serve       # serve dist/ on http://localhost:3000/ (PORT env to override)
bun run start       # build + serve
bun test            # run the test suite (bun:test)
bun run typecheck   # tsc --noEmit
```

Regenerating `dist/` is not required for tests — the logic is pure and unit-testable.

## How it's built

The project is split into **pure, DOM/WebGL-free game logic** (`src/game/*.ts`) and
a thin rendering/engine layer, so the racing can be tested headlessly.

```
src/
  main.ts            entry point (engine bootstrap + R-reset + __game debug hook)
  server.ts          static dev server for dist/ (Bun.serve)
  game/
    track.ts         closed-loop circuit (CatmullRom, 720 samples, halfWidth 8)
    physics.ts       kart movement: longitudinal forces, inertial heading model
                     (velocity lags the nose → real slip), lateral grip with an
                     optional player-only high-speed fade, boundary push-back
    timer.ts         lap timing with furthest-progress gating
    rng.ts           seeded mulberry32 PRNG (deterministic scenery)
    scenery.ts       seeded, track-aware tree/pine/rock/bush/mountain/cloud/lake placement
    input.ts         keyboard → throttle/steer/handbrake + exponential steer smoothing
    autopilot.ts     pure centerline-following steering (used in tests)
    opponents.ts     nine computer players: three-line grid, distinct lines/colors,
                     speed-proportional braking, chase avoidance, OBB collisions (SAT)
    kart.ts          kart mesh (steer-group front wheels, body roll/pitch)
    world.ts         sky, ground, track ribbon, scenery assembly
    engine.ts        game loop (countdown → GO → running), collisions, camera, HUD,
                     debug hooks (getSnapshot / getOpponents / reset)
    audio.ts         Web Audio engine: engine tones, drift gain by slip, countdown beeps,
                     lap jingle
    hud.ts           HUD driver (lap time, best/last, speed, messages)
tests/               bun:test — unit, integration and opponent coverage (90 tests)
```

Design highlights:

- **Slip physics, not glued karts** — the chassis heading rotates as you steer while
  the velocity keeps its inertia, so turning builds a slip angle that grip scrubs
  out. With the high-speed fade, the player loses that grip near max speed; the
  computer players opt out of the fade entirely.
- **Nine computer players in three distinct lines** (−3.4 / 0.0 / +3.4), staggered
  ~17 units longitudinally, with distinct chassis colors and speed factors
  (1.08–1.24) and full grip at a higher top speed (68 u/s). They follow their line,
  slow in corners, swing away to avoid the player, and use OBB collisions with the
  player plus a light opponent-vs-opponent push.
- **All logic is pure and testable** — every tuning decision (track shape, physics,
  AI, scenery, timer) has headless unit tests; the renderer is excluded.

## Tests

```bash
bun test
```

90 tests across 8 files: track/physics/timer/scenery/audio/input units, the
high-speed grip fade (pure curve + faded vs full-grip sliding behavior), opponent
spawning/lines/avoidance/chase/OBB, lap integration for all nine karts, and a
full-lap autopilot smoke test through the real physics.

## Why "InkKart"?

InkKart is named as an experiment with writing code using the Thinking Machines
**Inkling 2 Mini** model — the game is the subject of that experiment. "Ink" is the
code that comes out of the model; "Kart" is the racer it produced.

## Repo

https://github.com/qheaden/inkkart (private)
