# AGENTS.md

## Common Commands

- Build the app: `bun run build`
- Run tests: `bun run test`
- Serve the app: `bun run serve`

## Tech Stack

- TypeScript
- Bun runtime
- Three.js for 3D rendering

## Testing

- All functionality must be verified by automated tests
- Tests must use the `bun:test` framework
- Do not write tautological tests

## Documentation

- **Keep docs up to date:** after finishing work on any game system, review the matching document in `docs/` (see the index below) and update it to reflect the change — new behavior, renamed APIs, changed tuning, or new systems must be documented; if a system is removed or renamed, remove or update its document too. Do not leave stale documentation behind.

- docs/track.md — the closed-loop circuit: track definition, centerline sampling, and wrap-safe queries (closest point, radius, progress)
- docs/physics.md — kart movement: longitudinal forces, inertial slip model, lateral grip with the player-only high-speed fade, boundary push-back
- docs/lap-timing.md — lap timing: furthest-progress gating, lap events, `m:ss.cc` formatting
- docs/ai-opponents.md — computer players: three-line grid, corner-aware braking, player avoidance, OBB collisions, autopilot helper
- docs/input.md — keyboard capture, key→input mapping, exponential steering smoothing
- docs/scenery.md — deterministic, track-aware scenery placement (trees, pines, rocks, bushes, mountains, clouds, lake) and the seeded RNG
- docs/audio.md — Web Audio sound: engine voice tones, drift/grass rumble, countdown beeps, lap jingle
- docs/hud.md — HUD driver: DOM updates for lap/time/speed/messages from a HudSnapshot
- docs/engine.md — game engine: game loop (countdown → GO → running), collisions, chase camera, debug hooks
- docs/rendering.md — 3D world and kart meshes: sky, lights, track ribbon, scenery instances, kart body and wheels
