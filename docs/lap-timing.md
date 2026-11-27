# Lap Timing

Lap timing for the solo time trial: a pure, clock-driven state machine with
furthest-progress gating so a crossing only counts if the kart actually made
it around the loop.

**Source:** `src/game/timer.ts`
**Tests:** `tests/timer.test.ts`

## Purpose

Turn raw track progress (progress fraction from `Track.closestPoint`) into
completed laps, durations and best/last lap records. The engine supplies the
current clock time and progress, so the logic is fully deterministic and
unit-testable without a browser.

## Key API

- `RaceTimer` — constructed with the start-time passed by the engine.
  - `laps` — completed lap count.
  - `currentLapStart` — clock time at which the current lap began.
  - `lastLap` / `bestLap` — durations (seconds) of the most recent and best lap.
  - `furthest` — furthest progress (0..1) reached since the last crossing.
  - `reset(now = 0)` — zero out lap/timer state (keeps `currentLapStart = now`).
  - `currentLapTime(now)` — `max(0, now - currentLapStart)`.
  - `update(now, progress, prevProgress)` — feed the current progress fraction
    (0..1, wrapping across the line). Returns a `LapEvent`
    (`{ lap, duration, best, raceTime }`) the frame a valid lap completes,
    else `null`.
- `formatTime(seconds)` — formats as `m:ss.cc` (e.g. `1:23.45`); returns
  `--:--.--` for invalid input. Used by the HUD and the engine messages.

## Behavior

- A lap completes only when the progress wraps from > 0.85 to < 0.15 (the
  start/finish line).
- Crossings are rejected if the kart never made it at least halfway around
  (`furthest < 0.5`) — e.g. bouncing off the line or resetting just past it.
  In that case `furthest` is re-seeded to the current progress and the lap is
  not counted.
- The first lap after a valid crossing starts at the crossing timestamp; the
  event reports `raceTime` (the full clock) so HUD messages can reference it.

## Notes

- The timer is deliberately decoupled from the render loop: the engine calls
  `update` once per frame with the kart's progress and the race clock.
- `furthest` only advances when moving forward and not across the line.
- The browser test hook `completeLapNow()` in the engine fakes the crossing
  (sets `furthest = 0.97` and feeds a 0.97 → 0.02 wrap) to count a lap instantly.
