# Audio

Web Audio sound generation for the kart: a synthesized engine voice (three
harmonic tones), a drift/grass rumble, countdown beeps and a lap jingle — all
generated with oscillators, noise buffers and gain nodes. No audio files.

**Source:** `src/game/audio.ts`
**Tests:** `tests/audio.test.ts`

## Purpose

Give the kart a soundtrack that scales with speed and slip, without any
downloaded assets. The pure helpers are exported and unit-tested; the
`SoundEngine` wrapper is only constructed in the browser after a user gesture
(first keypress), because browsers refuse to start `AudioContext` before one.

## Pure helpers

- `engineFrequency(speedNorm)` — normalized speed 0..1 → 42 Hz (idle) to 175 Hz (top).
- `engineOscillatorType(speedNorm)` — `triangle` below 0.25, else `sawtooth`
  (the main tone warms up as it leans out).
- `driftGain(lateralSlip, handbrake, onTrack)` — 0..1 noise-loop gain:
  - 0.22 flat rumble on the grass (off track)
  - handbrake + slip > 4 → 0.18 + slip × 0.02 (max 0.5)
  - slip > 9 → (slip − 6) × 0.045 (max 0.4)
  - otherwise 0
- `ENGINE_TONES` — the three-tone engine voice: sub-octave body (0.5×, triangle, 0.55 gain),
  main growl (1.0×, 1.0 gain) and an upper octave (2.0×, 0.32 gain, +9 cents).
- `engineToneFrequencies(speedNorm)` — the three tones' absolute frequencies.
- `lapJingleNotes()` — two-note ascending chime (659.25 Hz, 987.77 Hz).
- `countdownNotes()` — 440 Hz for 3/2/1, 880 Hz for GO.

## `SoundEngine` (browser-only)

- `init()` — lazy creation of the `AudioContext` (falls back to
  `webkitAudioContext`), a master gain (0.5), the three engine oscillators
  (each in its own gain node → a lowpass filter → engine gain → master) and a
  looping 2 s white-noise buffer through a bandpass filter (380 Hz, Q 0.6) →
  noise gain → master. Must be called from a user gesture; safe to call again
  (it resumes the context and returns).
- `update(speedNorm, lateralSlip, handbrake, onTrack, running)` — every frame:
  engine gain 0.05–0.16 (proportional to speed, only while running), per-tone
  frequency updates, filter frequency 500 + speedNorm × 1400 Hz, main-tone
  type switch, and the drift/grass noise gain.
- `beep(freq, duration = 0.12, gain = 0.25)` — one-shot sine beep with
  exponential decay.
- `playCountdown(index)` — beep from `countdownNotes()`.
- `playLapJingle()` — the two-note chime, 130 ms apart.
- `stop()` — fade engine and noise gains to zero (used on reset/destroy).

## Notes

- The engine gain and noise gain are updated with `setTargetAtTime` (time
  constants 0.06–0.1 s) rather than hard-stepped, so the sound doesn't click.
- `Math.random()` is used once (noise buffer generation) — that's visual/audio
  only, never game logic, so determinism is not affected.
