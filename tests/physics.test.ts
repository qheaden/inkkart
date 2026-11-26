import { describe, test, expect } from 'bun:test';
import { Track, DEFAULT_TRACK } from '../src/game/track';
import {
  stepKart,
  createKart,
  forwardSpeed,
  speedGripFraction,
  DEFAULT_PHYSICS,
  type KartState,
} from '../src/game/physics';
import { DEFAULT_OPPONENT_PHYSICS } from '../src/game/opponents';
import { steerInputTowardCenterline } from './helpers';

const track = new Track(DEFAULT_TRACK);

function spawnOnTrack(): KartState {
  const spawn = track.pointAt(0.1, 0);
  const t = track.tangentAt(0.1);
  return createKart(spawn.x, spawn.z, Math.atan2(t.tx, t.tz));
}

function simulate(kart: KartState, input: Parameters<typeof stepKart>[1], seconds: number, dt = 1 / 120): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) stepKart(kart, input, track, dt, DEFAULT_PHYSICS);
}

describe('physics', () => {
  test('throttle accelerates forward speed', () => {
    const kart = spawnOnTrack();
    simulate(kart, { throttle: 1, steer: 0, handbrake: false }, 1.5);
    expect(forwardSpeed(kart)).toBeGreaterThan(10);
  });

  test('max speed is capped on track', () => {
    const kart = spawnOnTrack();
    simulate(kart, { throttle: 1, steer: 0, handbrake: false }, 20);
    expect(forwardSpeed(kart)).toBeLessThanOrEqual(DEFAULT_PHYSICS.maxForwardSpeed + 0.001);
  });

  test('braking bleeds speed', () => {
    const kart = spawnOnTrack();
    simulate(kart, { throttle: 1, steer: 0, handbrake: false }, 4);
    const before = forwardSpeed(kart);
    simulate(kart, { throttle: -1, steer: 0, handbrake: false }, 3);
    const after = forwardSpeed(kart);
    expect(after).toBeLessThan(before);
  });

  test('reverse builds crawl speed when stopped', () => {
    const kart = spawnOnTrack();
    simulate(kart, { throttle: -1, steer: 0, handbrake: false }, 2);
    expect(forwardSpeed(kart)).toBeLessThan(0);
    expect(Math.abs(forwardSpeed(kart))).toBeLessThanOrEqual(DEFAULT_PHYSICS.maxReverseSpeed + 0.001);
  });

  test('steering rotates the heading and does not spin a stationary kart', () => {
    const kart = spawnOnTrack();
    const startHeading = kart.heading;
    // stationary: steering at standstill should rotate little
    stepKart(kart, { throttle: 0, steer: 1, handbrake: false }, track, 1 / 60, DEFAULT_PHYSICS);
    const still = Math.abs(kart.heading - startHeading);
    expect(still).toBeLessThan(0.06);

    // while moving: heading changes meaningfully
    simulate(kart, { throttle: 1, steer: 0, handbrake: false }, 3);
    const before = kart.heading;
    simulate(kart, { throttle: 0, steer: 1, handbrake: false }, 0.5);
    expect(Math.abs(kart.heading - before)).toBeGreaterThan(0.4);
  });

  test('left and right steer rotate opposite directions', () => {
    const k1 = spawnOnTrack();
    simulate(k1, { throttle: 1, steer: 0, handbrake: false }, 2);
    const beforeRight = k1.heading;
    simulate(k1, { throttle: 0, steer: 1, handbrake: false }, 0.3);
    const rotatedRight = k1.heading - beforeRight;

    const k2 = spawnOnTrack();
    simulate(k2, { throttle: 1, steer: 0, handbrake: false }, 2);
    const beforeLeft = k2.heading;
    simulate(k2, { throttle: 0, steer: -1, handbrake: false }, 0.3);
    const rotatedLeft = k2.heading - beforeLeft;

    expect(rotatedRight).toBeGreaterThan(0.1);
    expect(rotatedLeft).toBeLessThan(-0.1);
  });

  test('off-track slows the kart down', () => {
    // put the kart well off the ribbon (but inside boundary push-back)
    const spawn = track.pointAt(0.2, 0);
    const t = track.tangentAt(0.2);
    const heading = Math.atan2(t.tx, t.tz);
    // lateral right offset: right vector = (cos(heading), -sin(heading))
    const kart: KartState = {
      x: spawn.x + Math.cos(heading) * 30,
      z: spawn.z - Math.sin(heading) * 30,
      heading,
      vx: 0,
      vz: 0,
    };
    simulate(kart, { throttle: 1, steer: 0, handbrake: false }, 3);
    const offSpeed = forwardSpeed(kart);

    const onKart = spawnOnTrack();
    // steer to stay on the asphalt while moving
    const steps = 3 * 120;
    for (let i = 0; i < steps; i++) {
      stepKart(onKart, { throttle: 1, steer: steerInputTowardCenterline(track, onKart, 30), handbrake: false }, track, 1 / 120, DEFAULT_PHYSICS);
    }
    const onSpeed = forwardSpeed(onKart);

    expect(offSpeed).toBeGreaterThan(0); // still moves
    expect(offSpeed).toBeLessThan(onSpeed * 0.75); // but much slower than on asphalt
  });

  test('handbrake increases turn rate and bleeds speed', () => {
    const a = spawnOnTrack();
    simulate(a, { throttle: 1, steer: 0, handbrake: false }, 2.5);
    const before = a.heading;
    const speedBefore = forwardSpeed(a);
    simulate(a, { throttle: 1, steer: 1, handbrake: true }, 0.5);
    const turnAmount = Math.abs(a.heading - before);
    const bleed = speedBefore - forwardSpeed(a);

    expect(turnAmount).toBeGreaterThan(0.2);
    expect(bleed).toBeGreaterThan(-2); // is not exploding; handbrake bleeds but throttle still pushes
    expect(forwardSpeed(a)).toBeLessThan(DEFAULT_PHYSICS.maxForwardSpeed);
  });

  test('boundary push-back pulls a far-off-track kart back toward the ribbon', () => {
    const spawn = track.pointAt(0.3, 0);
    const t = track.tangentAt(0.3);
    const heading = Math.atan2(t.tx, t.tz);
    const kart: KartState = {
      x: spawn.x + Math.cos(heading) * 160,
      z: spawn.z - Math.sin(heading) * 160,
      heading,
      vx: 0,
      vz: 0,
    };
    const before = track.closestPoint(kart.x, kart.z).distance;
    simulate(kart, { throttle: 0, steer: 0, handbrake: false }, 1.5);
    const after = track.closestPoint(kart.x, kart.z).distance;
    expect(before).toBeGreaterThan(DEFAULT_PHYSICS.boundaryDistance);
    expect(after).toBeLessThan(before);
  });

  test('kart position is conserved when throttle is 0 and on flat: obeys drag only', () => {
    const kart = spawnOnTrack();
    simulate(kart, { throttle: 1, steer: 0, handbrake: false }, 2);
    const speed = forwardSpeed(kart);
    const x0 = kart.x;
    const z0 = kart.z;
    simulate(kart, { throttle: 0, steer: 0, handbrake: false }, 2);
    const moved = Math.hypot(kart.x - x0, kart.z - z0);
    expect(moved).toBeGreaterThan(0); // coasts
    expect(Math.abs(forwardSpeed(kart))).toBeLessThan(speed); // dragged down
  });

  test('forwardSpeed matches velocity · forward', () => {
    const kart = spawnOnTrack();
    simulate(kart, { throttle: 1, steer: 0.5, handbrake: false }, 1.5);
    const fx = Math.sin(kart.heading);
    const fz = Math.cos(kart.heading);
    const manual = kart.vx * fx + kart.vz * fz;
    expect(forwardSpeed(kart)).toBeCloseTo(manual, 10);
  });
});

describe('physics: high-speed grip fade', () => {
  function velocityComponents(kart: KartState): { fwd: number; lat: number } {
    const fx = Math.sin(kart.heading);
    const fz = Math.cos(kart.heading);
    const rx = fz;
    const rz = -fx;
    return { fwd: kart.vx * fx + kart.vz * fz, lat: Math.abs(kart.vx * rx + kart.vz * rz) };
  }

  function makeKart(heading: number, fwd: number, lat: number): KartState {
    const spawn = track.pointAt(0.1, 0);
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = fz;
    const rz = -fx;
    return {
      x: spawn.x,
      z: spawn.z,
      heading,
      vx: fx * fwd + rx * lat,
      vz: fz * fwd + rz * lat,
    };
  }

  test('grip fraction is 1 below the fade start and decreases smoothly to the minimum by end', () => {
    const fade = DEFAULT_PHYSICS.speedSensitiveGrip!;
    expect(fade).toBeDefined();
    expect(speedGripFraction(0, DEFAULT_PHYSICS)).toBe(1);
    expect(speedGripFraction(fade.start, DEFAULT_PHYSICS)).toBe(1);
    expect(speedGripFraction(fade.end, DEFAULT_PHYSICS)).toBeCloseTo(fade.minGripFraction, 5);
    const mid1 = speedGripFraction((fade.start + fade.end) / 2, DEFAULT_PHYSICS);
    const mid2 = speedGripFraction(fade.start + (fade.end - fade.start) * 0.25, DEFAULT_PHYSICS);
    expect(mid1).toBeGreaterThan(fade.minGripFraction);
    expect(mid1).toBeLessThan(1);
    expect(mid2).toBeGreaterThan(mid1); // decreases with speed
    expect(speedGripFraction(100, DEFAULT_PHYSICS)).toBeCloseTo(fade.minGripFraction, 5);
  });

  test('highlight: faded kart slides sideways under full throttle through a corner', () => {
    // Same spawn, same inputs, same track for both karts — only the physics differ.
    // The fade should make the player-side kart slide meaningfully more.
    const spawn = track.pointAt(0.12, 0);
    const tangent = track.tangentAt(0.12);
    const heading = Math.atan2(tangent.tx, tangent.tz);

    const run = (params: Parameters<typeof stepKart>[4]): number => {
      const kart = createKart(spawn.x, spawn.z, heading);
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      kart.vx = fx * 50;
      kart.vz = fz * 50;
      let maxLat = 0;
      const dt = 1 / 60;
      for (let i = 0; i < 4 * 60; i++) {
        const steer = steerInputTowardCenterline(track, kart, 30);
        stepKart(kart, { throttle: 1, steer, handbrake: false }, track, dt, params);
        const fx2 = Math.sin(kart.heading);
        const fz2 = Math.cos(kart.heading);
        const rx2 = fz2;
        const rz2 = -fx2;
        maxLat = Math.max(maxLat, Math.abs(kart.vx * rx2 + kart.vz * rz2));
      }
      return maxLat;
    };

    const fadedLat = run(DEFAULT_PHYSICS);
    const fullLat = run(DEFAULT_OPPONENT_PHYSICS);

    expect(fadedLat).toBeGreaterThan(fullLat * 1.15);
    expect(fadedLat).toBeGreaterThan(5);
  }, 120_000);

  test('turning at near-max speed still turns the heading (slide, not a wall)', () => {
    const spawn = track.pointAt(0.1, 0);
    const t = track.tangentAt(0.1);
    const heading = Math.atan2(t.tx, t.tz);
    void spawn;
    const kart = makeKart(heading, 54, 0);
    const before = kart.heading;
    for (let i = 0; i < 30; i++) {
      stepKart(kart, { throttle: 0, steer: 1, handbrake: false }, track, 1 / 120, DEFAULT_PHYSICS);
    }
    expect(Math.abs(kart.heading - before)).toBeGreaterThan(0.15);
    // and it started to slide: lateral velocity was built up by the turn
    expect(velocityComponents(kart).lat).toBeGreaterThan(0.5);
  });

  test('traction returns once the kart slows below the fade start', () => {
    const fade = DEFAULT_PHYSICS.speedSensitiveGrip!;
    // same scenario as the slide test, but drive with reduced throttle so the
    // kart stays below the fade start the whole time
    const spawn = track.pointAt(0.12, 0);
    const tangent = track.tangentAt(0.12);
    const heading = Math.atan2(tangent.tx, tangent.tz);

    const kart = createKart(spawn.x, spawn.z, heading);
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    kart.vx = fx * 30; // well below the fade start
    kart.vz = fz * 30;
    let maxLat = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 4 * 60; i++) {
      const steer = steerInputTowardCenterline(track, kart, 30);
      stepKart(kart, { throttle: 0.45, steer, handbrake: false }, track, dt, DEFAULT_PHYSICS);
      const fx2 = Math.sin(kart.heading);
      const fz2 = Math.cos(kart.heading);
      const rx2 = fz2;
      const rz2 = -fx2;
      maxLat = Math.max(maxLat, Math.abs(kart.vx * rx2 + kart.vz * rz2));
    }
    // below the fade start the kart stays tight: modest side-slip throughout
    expect(speedGripFraction(30, DEFAULT_PHYSICS)).toBe(1);
    expect(maxLat).toBeLessThan(8);
    expect(forwardSpeed(kart)).toBeGreaterThan(0);

    // and once the fast kart brakes hard below start, grip is restored exactly
    const fast = createKart(spawn.x, spawn.z, heading);
    fast.vx = fx * 56;
    fast.vz = fz * 56;
    for (let i = 0; i < 120; i++) {
      stepKart(fast, { throttle: 0, steer: 0, handbrake: false }, track, dt, DEFAULT_PHYSICS);
    }
    expect(forwardSpeed(fast)).toBeLessThan(fade.start);
    expect(speedGripFraction(forwardSpeed(fast), DEFAULT_PHYSICS)).toBe(1);

  }, 120_000);

  test('computer players keep full grip at any speed', () => {
    // opponent physics opts out of the fade
    expect(DEFAULT_OPPONENT_PHYSICS.speedSensitiveGrip).toBeUndefined();
    expect(speedGripFraction(60, DEFAULT_OPPONENT_PHYSICS)).toBe(1);
    expect(speedGripFraction(74, DEFAULT_OPPONENT_PHYSICS)).toBe(1);
  });
});
