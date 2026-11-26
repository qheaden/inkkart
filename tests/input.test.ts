import { describe, test, expect } from 'bun:test';
import { mapKeysToInput, defaultKeys, smoothSteer, DEFAULT_STEER_SMOOTH_RATE } from '../src/game/input';

describe('input mapping', () => {
  test('neutral keys produce zero input', () => {
    const input = mapKeysToInput(defaultKeys());
    expect(input.throttle).toBe(0);
    expect(input.steer).toBe(0);
    expect(input.handbrake).toBe(false);
  });

  test('throttle and brake are mutually exclusive', () => {
    const input = mapKeysToInput({ ...defaultKeys(), throttle: true });
    expect(input.throttle).toBe(1);

    const brakeOnly = mapKeysToInput({ ...defaultKeys(), brake: true });
    expect(brakeOnly.throttle).toBe(-1);

    // both held: throttle wins (drive, not brake)
    const both = mapKeysToInput({ ...defaultKeys(), throttle: true, brake: true });
    expect(both.throttle).toBe(1);
  });

  test('steer is left +1, right -1, opposing keys cancel', () => {
    expect(mapKeysToInput({ ...defaultKeys(), left: true }).steer).toBe(1);
    expect(mapKeysToInput({ ...defaultKeys(), right: true }).steer).toBe(-1);
    expect(mapKeysToInput({ ...defaultKeys(), left: true, right: true }).steer).toBe(0);
  });

  test('handbrake passes through', () => {
    const input = mapKeysToInput({ ...defaultKeys(), handbrake: true });
    expect(input.handbrake).toBe(true);
  });

  test('combined drive scenario', () => {
    const input = mapKeysToInput({
      throttle: true,
      brake: false,
      left: true,
      right: false,
      handbrake: false,
    });
    expect(input.throttle).toBe(1);
    expect(input.steer).toBe(1);
  });
});

describe('steering smoothing', () => {
  test('ramps toward the target instead of snapping instantly', () => {
    const s1 = smoothSteer(0, 1, 1 / 60);
    expect(s1).toBeGreaterThan(0);
    expect(s1).toBeLessThan(1); // never exceeds the target in one step
    expect(s1).toBeCloseTo(DEFAULT_STEER_SMOOTH_RATE / 60, 6);
  });

  test('monotonically approaches the target over frames', () => {
    let cur = 0;
    for (let i = 0; i < 60; i++) {
      const next = smoothSteer(cur, 1, 1 / 60);
      expect(next).toBeGreaterThanOrEqual(cur);
      cur = next;
    }
    expect(cur).toBeCloseTo(1, 3);
  });

  test('eases back to zero when the key is released', () => {
    let cur = 1;
    for (let i = 0; i < 60; i++) {
      cur = smoothSteer(cur, 0, 1 / 60);
    }
    expect(cur).toBeCloseTo(0, 3);
    expect(cur).toBeLessThan(0.01);
  });

  test('never overshoots the target', () => {
    expect(smoothSteer(-1, 1, 1 / 60)).toBeGreaterThanOrEqual(-1);
    expect(smoothSteer(0.9, 1, 1 / 60)).toBeLessThanOrEqual(1);
  });

  test('handles zero dt without moving', () => {
    expect(smoothSteer(0.5, 1, 0)).toBe(0.5);
  });
});
