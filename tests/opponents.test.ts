import { describe, test, expect } from 'bun:test';
import { Track, DEFAULT_TRACK } from '../src/game/track';
import { stepKart, createKart, forwardSpeed, DEFAULT_PHYSICS } from '../src/game/physics';
import { RaceTimer } from '../src/game/timer';
import {
  DEFAULT_OPPONENTS,
  DEFAULT_OPPONENT_PHYSICS,
  MAX_OPPONENT_SPEED,
  AVOID_DISTANCE,
  spawnOpponent,
  lateralOffset,
  opponentTargetLateral,
  opponentInput,
  kartObbCorners,
  obbCollision,
  pushApart,
  resolveCollisions,
  type OpponentSpec,
} from '../src/game/opponents';
import { steerInputTowardCenterline } from './helpers';

const track = new Track(DEFAULT_TRACK);

function freshSpawn(spec: OpponentSpec) {
  return spawnOpponent(track, spec);
}

describe('computer players: spawning', () => {
  test('spawn with nine opponents on the start straight, ahead of the player', () => {
    expect(DEFAULT_OPPONENTS).toHaveLength(9);
    for (const spec of DEFAULT_OPPONENTS) {
      const kart = freshSpawn(spec);
      const nearest = track.closestPoint(kart.x, kart.z);
      expect(nearest.distance).toBeLessThanOrEqual(track.halfWidth);
      expect(nearest.progress).toBeGreaterThan(0);
      // everyone is ahead of the player (player spawns at 0.03)
      expect(nearest.progress).toBeGreaterThan(0.03);
    }
  });

  test('opponents drive different lines (distinct lines, colors, staggers)', () => {
    const specs = DEFAULT_OPPONENTS;
    // distinct lateral lines and colors (karts share 3 lines)
    const lines = new Set(specs.map((spec) => spec.preferredLateral));
    const colors = new Set(specs.map((spec) => spec.color));
    const progress = new Set(specs.map((spec) => spec.spawnProgress));
    expect(lines.size).toBeGreaterThanOrEqual(3);
    expect(lines.size).toBeLessThanOrEqual(5);
    expect(colors.size).toBe(specs.length);
    expect(progress.size).toBe(specs.length);

    // every line is used by exactly three karts
    const lineCounts = new Map<number, number>();
    for (const spec of specs) lineCounts.set(spec.preferredLateral, (lineCounts.get(spec.preferredLateral) ?? 0) + 1);
    for (const count of lineCounts.values()) expect(count).toBe(3);

    // every line sits inside the ribbon, keeping karts off the edge
    for (const spec of specs) {
      expect(Math.abs(spec.preferredLateral)).toBeLessThanOrEqual(track.halfWidth - 1.7 + 0.001);
    }

    // distinct-line karts are pushed well apart (nearest-slot pairs are ≥3 apart)
    for (let i = 0; i < specs.length; i++) {
      for (let j = i + 1; j < specs.length; j++) {
        const lineGap = Math.abs(specs[i]!.preferredLateral - specs[j]!.preferredLateral);
        const slotGap = Math.abs(specs[i]!.spawnProgress - specs[j]!.spawnProgress);
        // karts in distinct lines must be longitudinally clear of each other
        if (lineGap > 0.01 && lineGap < 1.5) {
          expect(slotGap).toBeGreaterThan(0.004);
        }
      }
    }

    const kartA = freshSpawn(specs[0]!);
    const kartB = freshSpawn(specs[1]!);
    const latA = lateralOffset(track, kartA.x, kartA.z);
    const latB = lateralOffset(track, kartB.x, kartB.z);
    expect(latA).toBeCloseTo(specs[0]!.preferredLateral, 0.5);
    expect(latB).toBeCloseTo(specs[1]!.preferredLateral, 0.5);
    expect(Math.abs(latA - latB)).toBeGreaterThan(2.5);
  });

  test('opponent colors differ from the player kart (red 0xe0393e)', () => {
    for (const spec of DEFAULT_OPPONENTS) {
      expect(spec.color).not.toBe(0xe0393e);
    }
  });
});

describe('computer players: steering lines', () => {
  test('follow the centerline region of their preferred line on straights', () => {
    const spec = DEFAULT_OPPONENTS[0]!;
    const kart = freshSpawn(spec); // on preferred line, heading along track
    // faraway player so avoidance never triggers
    const player = createKart(2000, 2000, 0);
    const input = opponentInput(track, kart, player, spec);
    expect(Math.abs(input.steer)).toBeLessThan(0.25);
    expect(input.throttle).toBeGreaterThan(0.8);
  });

  test('steer back toward the preferred line when off it', () => {
    const spec = DEFAULT_OPPONENTS[0]!; // prefers left (-3.4)
    const kart = freshSpawn(spec);
    const n = track.closestPoint(kart.x, kart.z);
    const s = track.getSample(n.index);
    // shift the kart toward the center (+2 toward the middle)
    kart.x += s.nx * 2;
    kart.z += s.nz * 2;
    const player = createKart(2000, 2000, 0);
    const input = opponentInput(track, kart, player, spec);
    // preferred line is further left; kart is now right of it => turn left
    expect(input.steer).toBeGreaterThan(0.1);
  });

  test('throttle stays within [0,1]', () => {
    const spec = DEFAULT_OPPONENTS[0]!;
    const kart = freshSpawn(spec);
    const player = createKart(2000, 2000, 0);
    const input = opponentInput(track, kart, player, spec);
    expect(input.throttle).toBeGreaterThanOrEqual(0);
    expect(input.throttle).toBeLessThanOrEqual(1);
  });
});

describe('computer players: avoidance', () => {
  test('swings to the far side of the ribbon when the player is ahead', () => {
    const spec = DEFAULT_OPPONENTS[0]!; // prefers -3.4
    const kart = freshSpawn(spec);
    // player directly ahead along the kart's forward direction (dead ahead)
    const fx = Math.sin(kart.heading);
    const fz = Math.cos(kart.heading);
    const player = createKart(kart.x + fx * 5.5, kart.z + fz * 5.5, kart.heading);
    const expectedDist = Math.hypot(player.x - kart.x, player.z - kart.z);
    expect(expectedDist).toBeLessThan(AVOID_DISTANCE);

    const target = opponentTargetLateral(track, kart, player, spec.preferredLateral, AVOID_DISTANCE);
    expect(target.avoided).toBe(true);
    expect(target.lateral).toBeGreaterThan(0); // pushed to the far side (away from the player)
    const input = opponentInput(track, kart, player, spec);
    expect(input.steer).toBeLessThan(0); // steers toward the right side
  });

  test('keeps the preferred line when the player is far away', () => {
    const spec = DEFAULT_OPPONENTS[1]!;
    const kart = freshSpawn(spec);
    const player = createKart(2000, 2000, 0);
    const target = opponentTargetLateral(track, kart, player, spec.preferredLateral, AVOID_DISTANCE);
    expect(target.avoided).toBe(false);
    expect(target.lateral).toBe(spec.preferredLateral);
  });

  test('avoidance target stays inside the ribbon', () => {
    const spec = DEFAULT_OPPONENTS[0]!;
    const kart = freshSpawn(spec);
    const n = track.closestPoint(kart.x, kart.z);
    const ahead = track.getSample((n.index + 4) % track.samples.length);
    const player = createKart(ahead.x + ahead.nx * spec.preferredLateral, ahead.z + ahead.nz * spec.preferredLateral, 0);
    const target = opponentTargetLateral(track, kart, player, spec.preferredLateral, AVOID_DISTANCE);
    expect(Math.abs(target.lateral)).toBeLessThanOrEqual(track.halfWidth - 0.1);
  });

  test('a cruising opponent swings off a stationary player (no-contact pass)', () => {
    const spec = DEFAULT_OPPONENTS[0]!;
    const kart = freshSpawn(spec);
    const n = track.closestPoint(kart.x, kart.z);
    const ahead = track.getSample((n.index + 4) % track.samples.length);
    const player = createKart(
      ahead.x + ahead.nx * spec.preferredLateral,
      ahead.z + ahead.nz * spec.preferredLateral,
      Math.atan2(ahead.tx, ahead.tz),
    );
    // stationary player, kart accelerates from spawn
    let swung = false;
    for (let i = 0; i < 60 * 5; i++) {
      const input = opponentInput(track, kart, player, spec, { avoidDistance: 12 });
      stepKart(kart, input, track, 1 / 60, DEFAULT_OPPONENT_PHYSICS);
      const lat = lateralOffset(track, kart.x, kart.z);
      if (lat > spec.preferredLateral + 1.2) swung = true; // swings to the far side
    }
    expect(swung).toBe(true);
  });

  test('chasing player never overlaps the opponent mid-race (realistic lines)', () => {
    const spec = DEFAULT_OPPONENTS[0]!;
    // opponent ahead on its preferred line, player behind on the centerline
    const kart = freshSpawn(spec);
    const player = spawnOpponent(track, { ...spec, spawnProgress: 0.048, preferredLateral: 0 });
    for (const k of [kart, player]) {
      k.vx = Math.sin(k.heading) * 40;
      k.vz = Math.cos(k.heading) * 40;
    }
    let collided = 0;
    let minDist = 99;
    let swung = false;
    for (let i = 0; i < 60 * 40; i++) {
      const input = opponentInput(track, kart, player, spec);
      stepKart(kart, input, track, 1 / 60, DEFAULT_OPPONENT_PHYSICS);
      const pSteer = steerInputTowardCenterline(track, player, 30);
      stepKart(player, { throttle: 1, steer: pSteer, handbrake: false }, track, 1 / 60, DEFAULT_PHYSICS);
      resolveCollisions(player, [kart]);
      const latK = lateralOffset(track, kart.x, kart.z);
      if (Math.abs(latK - spec.preferredLateral) > 2.0) swung = true;
      const d = Math.hypot(player.x - kart.x, player.z - kart.z);
      minDist = Math.min(minDist, d);
      if (obbCollision(player, kart)) collided++;
    }
    // boxes never overlap mid-race; the kart is seen veering off its preferred line
    expect(collided).toBe(0);
    expect(minDist).toBeLessThan(7); // the player still gets alongside the kart
    expect(swung).toBe(true);
  }, 60_000);
});

describe('computer players: bounding boxes', () => {
  test('kartObbCorners produce a rectangle (4 corners around the center)', () => {
    const kart = createKart(2, 3, Math.PI / 4);
    const corners = kartObbCorners(kart, 0.75, 1.35);
    expect(corners).toHaveLength(4);
    for (const c of corners) {
      const d = Math.hypot(c.x - kart.x, c.z - kart.z);
      expect(d).toBeGreaterThan(0.5);
      expect(d).toBeLessThan(2.5);
    }
  });

  test('obbCollision detects a head-on overlap and pushes the player backward', () => {
    const a = createKart(0, 0, 0);
    const b = createKart(0, 2.2, 0); // 2.2 ahead; half-lengths sum to 2.7 -> overlap
    const mtv = obbCollision(a, b);
    expect(mtv).not.toBeNull();
    expect(mtv!.dz).toBeLessThan(0); // pushed back (away from the kart ahead)
    expect(Math.abs(mtv!.dx)).toBeLessThan(0.1);
  });

  test('obbCollision detects side-by-side overlap', () => {
    const a = createKart(0, 0, 0);
    const b = createKart(1.2, 0, 0);
    const mtv = obbCollision(a, b);
    expect(mtv).not.toBeNull();
    expect(mtv!.dx).toBeLessThan(0); // pushed toward -x (away from b)
    expect(mtv!.depth).toBeCloseTo(0.3, 1);
  });

  test('obbCollision detects rotated (45 degree) overlapping karts', () => {
    const a = createKart(0, 0, Math.PI / 4);
    const b = createKart(0.9, 0.9, -Math.PI / 4);
    const mtv = obbCollision(a, b);
    expect(mtv).not.toBeNull();
    expect(mtv!.depth).toBeGreaterThan(0);
  });

  test('obbCollision returns null when the karts are far apart', () => {
    const a = createKart(0, 0, 0);
    const b = createKart(500, 0, 0);
    expect(obbCollision(a, b)).toBeNull();
  });

  test('pushApart separates overlapping karts and softens the approach', () => {
    const player = createKart(0, 0, 0);
    player.vz = 10; // closing in on the opponent
    const opp = createKart(0, 2.0, 0);
    const before = Math.hypot(player.x - opp.x, player.z - opp.z);
    const resolved = pushApart(player, opp, 0.55, 0.35);
    expect(resolved).toBe(true);
    const after = Math.hypot(player.x - opp.x, player.z - opp.z);
    expect(after).toBeGreaterThan(before);
    // player threw itself toward the opponent: after the separation pass,
    // its velocity along the normal should have been damped
    expect(player.vz).toBeLessThan(10);
  });

  test('resolveCollisions clears a player stacked onto an opponent', () => {
    const player = createKart(0, 0, 0);
    const opp = createKart(0, 0.5, 0); // nearly stacked
    const before = Math.hypot(player.x - opp.x, player.z - opp.z);
    const resolved = resolveCollisions(player, [opp]);
    expect(resolved).toBe(1);
    const after = Math.hypot(player.x - opp.x, player.z - opp.z);
    expect(after).toBeGreaterThanOrEqual(before);
  });

  test('resolveCollisions ignores far-away opponents', () => {
    const player = createKart(0, 0, 0);
    const opp = createKart(200, 0, 0);
    expect(resolveCollisions(player, [opp])).toBe(0);
  });

  test('opposing pushes move both karts', () => {
    const player = createKart(0, 0, 0);
    const opp = createKart(0, 2.0, 0);
    resolveCollisions(player, [opp]);
    // player pushed backward (−z) and opponent pushed forward (+z)
    expect(player.z).toBeLessThan(0);
    expect(opp.z).toBeGreaterThan(2.0);
  });
});

describe('computer players: lap integration', () => {
  test('all nine opponents drive a full lap on the real track', () => {
    const specs = DEFAULT_OPPONENTS;
    const karts = specs.map((spec) => freshSpawn(spec));

    // faraway player so avoidance never triggers (avoidance has its own tests)
    const player = createKart(2000, 2000, 0);

    const timers = specs.map(() => new RaceTimer(0));
    let raceTime = 0;
    const prevProgress = karts.map((k) => track.closestPoint(k.x, k.z).progress);
    const lapEvents: number[] = [];
    const maxOffs: number[] = [];
    const onTrackFrames: number[] = [];
    const totalFrames: number[] = [];

    const dt = 1 / 60;
    const maxSeconds = 240;

    while (raceTime < maxSeconds && lapEvents.length < specs.length) {
      raceTime += dt;
      for (let i = 0; i < karts.length; i++) {
        const input = opponentInput(track, karts[i]!, player, specs[i]!);
        stepKart(karts[i]!, input, track, dt, DEFAULT_OPPONENT_PHYSICS);
        const nearest = track.closestPoint(karts[i]!.x, karts[i]!.z);
        maxOffs[i] = Math.max(maxOffs[i] ?? 0, nearest.distance);
        totalFrames[i] = (totalFrames[i] ?? 0) + 1;
        onTrackFrames[i] = (onTrackFrames[i] ?? 0) + (nearest.distance <= track.halfWidth ? 1 : 0);

        const event = timers[i]!.update(raceTime, nearest.progress, prevProgress[i]!);
        prevProgress[i] = nearest.progress;
        if (event) lapEvents.push(i);
      }
    }

    expect(lapEvents.length).toBe(specs.length);
    for (let i = 0; i < karts.length; i++) {
      const ratio = (onTrackFrames[i] ?? 0) / Math.max(1, totalFrames[i] ?? 1);
      console.log(`[opponent ${specs[i]!.name}] on-track ${(ratio * 100).toFixed(0)}% | maxOff ${maxOffs[i]?.toFixed(1)} u`);
      expect(ratio).toBeGreaterThan(0.7);
      expect(maxOffs[i] ?? 0).toBeLessThan(DEFAULT_PHYSICS.boundaryDistance);
    }
  }, 120_000);
});

describe('opponent lateral lines vs player', () => {
  test('opponents keep a distinct lateral line from the player through a drive', () => {
    let kart = freshSpawn(DEFAULT_OPPONENTS[0]!);
    const player = createKart(2000, 2000, 0);
    for (let i = 0; i < 60 * 4; i++) {
      const input = opponentInput(track, kart, player, DEFAULT_OPPONENTS[0]!);
      stepKart(kart, input, track, 1 / 60, DEFAULT_OPPONENT_PHYSICS);
      const lat = lateralOffset(track, kart.x, kart.z);
      expect(Math.abs(lat)).toBeGreaterThan(2); // never near the player's centerline
      if (i === 0) expect(Math.abs(lat - DEFAULT_OPPONENTS[0]!.preferredLateral)).toBeLessThan(1.5);
    }
    expect(forwardSpeed(kart)).toBeGreaterThan(0);
  });
});

describe('computer players: speed config', () => {
  test('opponents run faster than the player', () => {
    expect(DEFAULT_OPPONENT_PHYSICS.maxForwardSpeed).toBeGreaterThan(DEFAULT_PHYSICS.maxForwardSpeed);
    expect(MAX_OPPONENT_SPEED).toBeGreaterThan(DEFAULT_PHYSICS.maxForwardSpeed);
  });

  test('every opponent accelerates harder than the player', () => {
    for (const spec of DEFAULT_OPPONENTS) {
      expect(spec.speedFactor).toBeGreaterThan(1);
    }
  });
});
