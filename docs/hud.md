# HUD

The heads-up display driver: reads a `HudSnapshot` and writes the lap/time/speed/
messages into the DOM. Thin, one-way DOM layer — the engine owns all state.

**Source:** `src/game/hud.ts`
**Tests:** exercised via `tests/integration.test.ts` and browser hooks

## Purpose

Render the live race state (current lap time, last/best lap, speed in km/h,
lap counter, message banner, off-track/countdown note) into the HUD elements
from `index.html`. All state lives in the engine; the HUD only displays it.

## Key API

- `HudSnapshot` — the full state the HUD needs:
  `status` (`'countdown' | 'running' | 'finished'`), `countdown`, `lap`,
  `currentLapTime`, `lastLap`, `bestLap`, `speedKmh`, `onTrack`, `message`,
  `messageKind` (`'info' | 'lap' | 'best' | 'countdown'`).
- `Hud` — constructed with the HUD elements already present in the DOM (the
  engine checks `#hud-time` exists before constructing, so headless tests can
  skip it). Required elements: `#hud-time`, `#hud-lap`, `#hud-best`,
  `#hud-last`, `#hud-speed`, `#hud-msg`, `#hud-note` — missing ones throw.
- `hud.update(snapshot)` — writes:
  - time via `formatTime` from the timer module
  - `LAP n`
  - `BEST m:ss.cc` / `LAST m:ss.cc` (or `--:--.--`)
  - speed as `round(km/h) km/h`
  - note: `OFF TRACK` when off the ribbon, `GET READY` during countdown,
    otherwise blank (hidden via opacity)
  - message banner with class `msg info|lap|best` and opacity
- `hud.getText()` — returns the current text contents of all HUD fields, used
  by browser-test debug hooks.

## Touch layout

When the engine adds `body.touch-mode` (mobile devices), the HUD re-layouts
around the on-screen controls:

- `.hud-bl` (keyboard hints) is hidden.
- `.hud-br` (speed) and `.hud-tr` (best/last) stack at the top-right, under
  each other, so the pedals don't cover the speed readout.
- `#hud-note` (OFF TRACK / GET READY) moves up, off the bottom edge.

## Notes

- Speed display is derived by the engine (`forwardSpeed × 2.6`), not the HUD.
- The HUD is purely cosmetic — no game logic reads back from it.
