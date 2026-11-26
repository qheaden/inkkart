import { describe, test, expect } from 'bun:test';
import { Track, DEFAULT_TRACK } from '../src/game/track';
import { generateScenery, DEFAULT_SCENERY } from '../src/game/scenery';

const track = new Track(DEFAULT_TRACK);

describe('scenery generation', () => {
  test('is deterministic for a given seed', () => {
    const a = generateScenery(track, DEFAULT_SCENERY);
    const b = generateScenery(track, DEFAULT_SCENERY);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.type).toBe(b[i]!.type);
      expect(a[i]!.x).toBeCloseTo(b[i]!.x, 6);
      expect(a[i]!.z).toBeCloseTo(b[i]!.z, 6);
      expect(a[i]!.scale).toBeCloseTo(b[i]!.scale, 6);
      expect(a[i]!.rotation).toBeCloseTo(b[i]!.rotation, 6);
    }
  });

  test('different seeds produce different layouts', () => {
    const a = generateScenery(track, { ...DEFAULT_SCENERY, seed: 1 });
    const b = generateScenery(track, { ...DEFAULT_SCENERY, seed: 2 });
    const same = a.length === b.length && a.every((item, i) => Math.abs(item.x - b[i]!.x) < 1e-6 && Math.abs(item.z - b[i]!.z) < 1e-6);
    expect(same).toBe(false);
  });

  test('all ground items stay clear of the drivable ribbon', () => {
    const items = generateScenery(track, DEFAULT_SCENERY);
    for (const item of items) {
      if (item.type === 'cloud' || item.type === 'mountain') continue; // float / ring
      const d = track.closestPoint(item.x, item.z).distance;
      expect(d).toBeGreaterThanOrEqual(DEFAULT_SCENERY.minTrackDistance - 0.01);
    }
  });

  test('generates the requested counts', () => {
    const items = generateScenery(track, DEFAULT_SCENERY);
    const count = (t: string) => items.filter((i) => i.type === t).length;
    expect(count('tree')).toBeGreaterThan(50);
    expect(count('pine')).toBeGreaterThan(30);
    expect(count('bush')).toBeGreaterThan(40);
    expect(count('rock')).toBeGreaterThan(15);
    expect(count('mountain')).toBe(DEFAULT_SCENERY.mountainCount);
    expect(count('cloud')).toBe(DEFAULT_SCENERY.cloudCount);
  });

  test('mountains form a distant ring around the track', () => {
    const items = generateScenery(track, DEFAULT_SCENERY).filter((i) => i.type === 'mountain');
    for (const m of items) {
      const dCentroid = Math.hypot(m.x - track.centroid.x, m.z - track.centroid.z);
      expect(dCentroid).toBeGreaterThanOrEqual(DEFAULT_SCENERY.mountainMinRadius);
      expect(dCentroid).toBeLessThanOrEqual(DEFAULT_SCENERY.mountainMaxRadius);
      const dTrack = track.closestPoint(m.x, m.z).distance;
      expect(dTrack).toBeGreaterThan(100); // well beyond playable area
    }
  });

  test('clouds float high above the ground', () => {
    const items = generateScenery(track, DEFAULT_SCENERY).filter((i) => i.type === 'cloud');
    for (const c of items) {
      expect(c.y).toBeGreaterThanOrEqual(70);
    }
  });

  test('the lake is placed in the infield, clear of the ribbon', () => {
    const items = generateScenery(track, DEFAULT_SCENERY);
    const lake = items.find((i) => i.type === 'lake');
    expect(lake).toBeDefined();
    const d = track.closestPoint(lake!.x, lake!.z).distance;
    expect(d).toBeGreaterThan(track.halfWidth + 20);
  });

  test('no scenery items collide with each other (ground items)', () => {
    const items = generateScenery(track, DEFAULT_SCENERY).filter((i) => i.type === 'tree' || i.type === 'pine' || i.type === 'rock' || i.type === 'bush');
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const d = Math.hypot(items[i]!.x - items[j]!.x, items[i]!.z - items[j]!.z);
        // same-type items should not stack on top of each other
        if (items[i]!.type === items[j]!.type) {
          expect(d).toBeGreaterThan(2.2);
        }
      }
    }
  });
});
