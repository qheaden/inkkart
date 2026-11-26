import { describe, test, expect } from 'bun:test';
import { Track, DEFAULT_TRACK, SPAWN_PROGRESS } from '../src/game/track';
import { stepKart, createKart, forwardSpeed, DEFAULT_PHYSICS } from '../src/game/physics';
import { RaceTimer } from '../src/game/timer';
import { steerInputTowardCenterline } from './helpers';

describe('integration: autopilot drives a full lap', () => {
  test('kart completes a lap with the real physics and lap timer', () => {
    const track = new Track(DEFAULT_TRACK);
    const timer = new RaceTimer(0);

    const spawn = track.pointAt(SPAWN_PROGRESS, 0);
    const tangent = track.tangentAt(SPAWN_PROGRESS);
    const kart = createKart(spawn.x, spawn.z, Math.atan2(tangent.tx, tangent.tz));

    let raceTime = 0;
    let prevProgress = SPAWN_PROGRESS;
    let lapEventCount = 0;
    let onTrackFrames = 0;
    let totalFrames = 0;
    let maxDistanceOff = 0;
    let lastLapDuration: number | null = null;

    const dt = 1 / 60;
    const maxSeconds = 240;

    while (raceTime < maxSeconds && lapEventCount === 0) {
      const steer = steerInputTowardCenterline(track, kart, 30);
      // slow a bit in tight corners
      const diff = Math.abs(steer) > 0.55 ? 0.45 : 1;
      stepKart(kart, { throttle: diff, steer, handbrake: false }, track, dt, DEFAULT_PHYSICS);

      raceTime += dt;
      const nearest = track.closestPoint(kart.x, kart.z);
      const onTrack = nearest.distance <= track.halfWidth;
      onTrackFrames += onTrack ? 1 : 0;
      totalFrames++;
      maxDistanceOff = Math.max(maxDistanceOff, nearest.distance);

      const event = timer.update(raceTime, nearest.progress, prevProgress);
      prevProgress = nearest.progress;
      if (event) {
        lapEventCount++;
        lastLapDuration = event.duration;
      }
    }

    const onTrackRatio = onTrackFrames / Math.max(1, totalFrames);

    console.log(`[autopilot] lap completed in ${lastLapDuration?.toFixed(1)}s | on-track ${(onTrackRatio * 100).toFixed(0)}% | maxOff ${maxDistanceOff.toFixed(1)} u | steps ${totalFrames}`);

    // the game's own loop logic: one lap counted, a sane lap time, kart stays on the ribbon
    expect(lapEventCount).toBeGreaterThanOrEqual(1);
    expect(lastLapDuration).not.toBeNull();
    expect(lastLapDuration!).toBeGreaterThan(8); // a lap can't be 3 seconds
    expect(lastLapDuration!).toBeLessThan(180);
    expect(onTrackRatio).toBeGreaterThan(0.72);
    expect(maxDistanceOff).toBeLessThan(DEFAULT_PHYSICS.boundaryDistance);
  }, 120_000);

  test('spawn heading points along the track (kart can go)', () => {
    const track = new Track(DEFAULT_TRACK);
    const spawn = track.pointAt(SPAWN_PROGRESS, 0);
    const tangent = track.tangentAt(SPAWN_PROGRESS);
    const heading = Math.atan2(tangent.tx, tangent.tz);
    const kart = createKart(spawn.x, spawn.z, heading);
    const distBefore = track.closestPoint(kart.x, kart.z).distance;
    stepKart(kart, { throttle: 1, steer: 0, handbrake: false }, track, 1 / 60, DEFAULT_PHYSICS);
    // kart should have moved along the track direction and stayed on the ribbon
    const forwardSpeedAfter = forwardSpeed(kart);
    expect(forwardSpeedAfter).toBeGreaterThan(0);
    const distAfter = track.closestPoint(kart.x, kart.z).distance;
    expect(distAfter).toBeLessThanOrEqual(distBefore + 1);
  });
});
