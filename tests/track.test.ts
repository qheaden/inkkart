import { describe, test, expect } from 'bun:test';
import { Track, DEFAULT_TRACK, SPAWN_PROGRESS } from '../src/game/track';

const track = new Track(DEFAULT_TRACK);

describe('Track', () => {
  test('is a closed loop: length > 0 and wrap-around distance is small', () => {
    expect(track.length).toBeGreaterThan(500);
    const first = track.samples[0]!;
    const last = track.samples[track.samples.length - 1]!;
    const gap = Math.hypot(first.x - last.x, first.z - last.z);
    expect(gap).toBeLessThan(10); // samples are ~1.5-2 u apart, gap must be tiny
  });

  test('samples are roughly evenly spaced', () => {
    const n = track.samples.length;
    const gaps: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = track.samples[i]!;
      const b = track.samples[(i + 1) % n]!;
      gaps.push(Math.hypot(b.x - a.x, b.z - a.z));
    }
    const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    for (const g of gaps) {
      // allow 40% spacing variance
      expect(g).toBeGreaterThan(avg * 0.6);
      expect(g).toBeLessThan(avg * 1.4);
    }
  });

  test('unit tangents are normalized', () => {
    for (let i = 0; i < 40; i++) {
      const s = track.samples[Math.floor((i / 40) * track.samples.length)]!;
      expect(Math.hypot(s.tx, s.tz)).toBeCloseTo(1, 5);
    }
  });

  test('left normal is perpendicular to the tangent', () => {
    for (let i = 0; i < 40; i++) {
      const s = track.samples[Math.floor((i / 40) * track.samples.length)]!;
      expect(s.nx * s.tx + s.nz * s.tz).toBeCloseTo(0, 5);
      expect(Math.hypot(s.nx, s.nz)).toBeCloseTo(1, 5);
    }
  });

  test('closestPoint finds the sample at a known position', () => {
    const t = 0.42;
    const s = track.getSample(t * track.samples.length);
    const { index, progress, distance } = track.closestPoint(s.x, s.z);
    expect(distance).toBeLessThan(0.5);
    expect(Math.abs(progress - t)).toBeLessThan(0.02);
    expect(Math.abs(index - Math.round(t * track.samples.length))).toBeLessThan(3);
  });

  test('isOnTrack: center is on track, far away is off', () => {
    const s = track.getSample(10);
    expect(track.isOnTrack(s.x, s.z)).toBe(true);
    const far = track.pointAt(0.5, 0);
    expect(track.isOnTrack(far.x + 100, far.z)).toBe(false);
  });

  test('spawn point is on the track and facing forward along the loop', () => {
    const spawn = track.pointAt(SPAWN_PROGRESS, 0);
    expect(track.isOnTrack(spawn.x, spawn.z)).toBe(true);
    const tangent = track.tangentAt(SPAWN_PROGRESS);
    const heading = Math.atan2(tangent.tx, tangent.tz);
    // a kart heading along the tangent should move closer to the centerline ahead
    const ahead = { x: spawn.x + Math.sin(heading) * 10, z: spawn.z + Math.cos(heading) * 10 };
    const dBefore = track.closestPoint(spawn.x, spawn.z).distance;
    const dAfter = track.closestPoint(ahead.x, ahead.z).distance;
    expect(dAfter).toBeLessThan(dBefore + 0.5);
  });

  test('is a varied circuit with fast sweepers and tight hairpins', () => {
    const radii: number[] = [];
    for (let i = 0; i < track.samples.length; i++) radii.push(track.radiusAt(i));
    const finite = radii.filter((r) => isFinite(r));
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const tight = finite.filter((r) => r < 45).length;
    const straightish = finite.filter((r) => r > 200).length;
    // fast corners + tight hairpins + long straights all present
    expect(min).toBeLessThan(35); // at least one tight hairpin
    expect(max).toBeGreaterThan(250); // long straights exist
    expect(tight).toBeGreaterThanOrEqual(20); // several hairpin-ish sections
    expect(straightish).toBeGreaterThanOrEqual(150); // a good chunk of the lap is straightish
    expect(finite.length).toBeGreaterThan(600);
  });

  test('has no self-intersection (distant parts stay well apart)', () => {
    const n = track.samples.length;
    let minGap = Infinity;
    for (let i = 0; i < n; i += 2) {
      for (let j = i + 2; j < n; j += 2) {
        const arcGap = Math.min(j - i, n - (j - i));
        if (arcGap < 60) continue; // near-adjacent samples
        const s1 = track.samples[i]!;
        const s2 = track.samples[j]!;
        const d = Math.hypot(s1.x - s2.x, s1.z - s2.z);
        if (d < minGap) minGap = d;
      }
    }
    expect(minGap).toBeGreaterThanOrEqual(30);
  });

  test('wrap-around: progress 0.99 and 0.01 are close on the ribbon', () => {
    const a = track.getSample(Math.round(0.99 * track.samples.length));
    const b = track.getSample(Math.round(0.01 * track.samples.length));
    const gap = Math.hypot(a.x - b.x, a.z - b.z);
    expect(gap).toBeLessThan(26); // ~2% of the lap, close to the start line
  });
});
