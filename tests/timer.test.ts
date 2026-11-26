import { describe, test, expect } from 'bun:test';
import { RaceTimer, formatTime } from '../src/game/timer';

describe('RaceTimer', () => {
  test('counts a lap when progress wraps past the line mid-loop', () => {
    const timer = new RaceTimer(0);
    // kart has reached halfway around
    timer.update(0.5, 0.5, 0.49);
    expect(timer.laps).toBe(0);
    // now cross the start line (from 0.97 to 0.02)
    const event = timer.update(10, 0.02, 0.97);
    expect(event).not.toBeNull();
    expect(event!.lap).toBe(1);
    expect(event!.duration).toBeCloseTo(10, 5);
    expect(event!.best).toBe(true);
    expect(timer.bestLap).toBeCloseTo(10, 5);
    expect(timer.lastLap).toBeCloseTo(10, 5);
    expect(timer.laps).toBe(1);
  });

  test('ignores a crossing the kart never half-completed', () => {
    const timer = new RaceTimer(0);
    // kart only drifted near the line back and forth
    timer.update(0.2, 0.03, 0.85);
    const event = timer.update(0.4, 0.02, 0.90);
    expect(event).toBeNull();
    expect(timer.laps).toBe(0);
  });

  test('best lap survives a slower lap and resets correctly', () => {
    const timer = new RaceTimer(0);
    timer.update(0.5, 0.6, 0.5); // furthest 0.6
    const first = timer.update(10, 0.02, 0.98);
    expect(first!.lap).toBe(1);

    timer.update(12, 0.6, 0.55); // furthest 0.6 again
    const second = timer.update(40, 0.03, 0.97);
    expect(second!.lap).toBe(2);
    expect(second!.duration).toBeCloseTo(30, 5);
    expect(second!.best).toBe(false); // 30 > 10
    expect(timer.bestLap).toBeCloseTo(10, 5);

    timer.reset(0);
    expect(timer.laps).toBe(0);
    expect(timer.bestLap).toBeNull();
    expect(timer.lastLap).toBeNull();
    expect(timer.currentLapTime(0)).toBe(0);
  });

  test('best lap improves on a faster lap', () => {
    const timer = new RaceTimer(0);
    timer.update(0.1, 0.6, 0.55);
    timer.update(20, 0.03, 0.97);
    timer.update(25, 0.6, 0.55);
    const fast = timer.update(28, 0.04, 0.97);
    expect(fast!.best).toBe(true);
    expect(fast!.duration).toBeCloseTo(8, 5);
    expect(timer.bestLap).toBeCloseTo(8, 5);
  });

  test('furthest progress only advances moving forward', () => {
    const timer = new RaceTimer(0);
    timer.update(1, 0.4, 0.3);
    expect(timer.furthest).toBeCloseTo(0.4, 5);
    // backward: furthest should not regress
    timer.update(2, 0.35, 0.4);
    expect(timer.furthest).toBeCloseTo(0.4, 5);
  });

  test('currentLapTime never goes negative', () => {
    const timer = new RaceTimer(5);
    expect(timer.currentLapTime(2)).toBe(0);
  });
});

describe('formatTime', () => {
  test('formats seconds as m:ss.cc', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(65.43)).toBe('1:05.43');
    expect(formatTime(9.07)).toBe('0:09.07');
    expect(formatTime(600)).toBe('10:00.00');
  });

  test('handles invalid input', () => {
    expect(formatTime(NaN)).toBe('--:--.--');
    expect(formatTime(-5)).toBe('--:--.--');
    expect(formatTime(Infinity)).toBe('--:--.--');
  });
});
