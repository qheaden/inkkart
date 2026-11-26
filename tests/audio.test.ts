import { describe, test, expect } from 'bun:test';
import {
  engineFrequency,
  engineOscillatorType,
  driftGain,
  lapJingleNotes,
  countdownNotes,
  ENGINE_TONES,
  engineToneFrequencies,
} from '../src/game/audio';

describe('audio pure helpers', () => {
  test('engine frequency maps speed 0→1 to 42→175 Hz', () => {
    expect(engineFrequency(0)).toBeCloseTo(42);
    expect(engineFrequency(1)).toBeCloseTo(175);
    expect(engineFrequency(0.5)).toBeCloseTo(108.5);
  });

  test('engine frequency clamps beyond 0..1', () => {
    expect(engineFrequency(-3)).toBeCloseTo(42);
    expect(engineFrequency(99)).toBeCloseTo(175);
  });

  test('oscillator type warms up from triangle to sawtooth', () => {
    expect(engineOscillatorType(0)).toBe('triangle');
    expect(engineOscillatorType(0.25)).toBe('sawtooth');
    expect(engineOscillatorType(1)).toBe('sawtooth');
  });

  test('engine voice is a three-tone mix (sub + main + octave edge)', () => {
    expect(ENGINE_TONES).toHaveLength(3);
    const ratios = ENGINE_TONES.map((t) => t.ratio);
    expect(ratios[0]!).toBeLessThan(1); // sub-octave body
    expect(ratios[1]).toBeCloseTo(1); // main growl
    expect(ratios[2]!).toBeCloseTo(2); // bright octave
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]!).toBeGreaterThan(ratios[i - 1]!);
    }
    for (const tone of ENGINE_TONES) {
      expect(tone.gain).toBeGreaterThan(0);
      expect(tone.gain).toBeLessThanOrEqual(1);
      expect(tone.detuneCents).toBeGreaterThanOrEqual(0);
    }
  });

  test('engine tone frequencies track the scaled base frequency', () => {
    expect(engineToneFrequencies(0)).toHaveLength(ENGINE_TONES.length);
    expect(engineToneFrequencies(0)[0]).toBeCloseTo(21);
    expect(engineToneFrequencies(0)[1]).toBeCloseTo(42);
    expect(engineToneFrequencies(0)[2]).toBeCloseTo(84);
    expect(engineToneFrequencies(1)[1]).toBeCloseTo(175);
    expect(engineToneFrequencies(1)[2]).toBeCloseTo(350);
    expect(engineToneFrequencies(0.5)[0]).toBeCloseTo(54.25);
  });

  test('engine tone frequencies clamp like the base frequency', () => {
    expect(engineToneFrequencies(99)[1]).toBeCloseTo(175);
    expect(engineToneFrequencies(-3)[1]).toBeCloseTo(42);
  });

  test('drift gain stays silent at low slip', () => {
    expect(driftGain(0, false, true)).toBe(0);
    expect(driftGain(3, false, true)).toBe(0);
  });

  test('handbrake with visible slip produces rumble', () => {
    const g = driftGain(12, true, true);
    expect(g).toBeGreaterThan(0.2);
    expect(g).toBeLessThanOrEqual(0.5);
  });

  test('hard slip produces rumble even without handbrake', () => {
    const g = driftGain(12, false, true);
    expect(g).toBeGreaterThan(0.1);
  });

  test('grass rumble is audible and modest', () => {
    const g = driftGain(0, false, false);
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThanOrEqual(0.25);
  });

  test('lap jingle is an ascending two-note chime', () => {
    const notes = lapJingleNotes();
    expect(notes).toHaveLength(2);
    expect(notes[0]).toBeLessThan(notes[1]!);
  });

  test('countdown has three low beeps and a high GO beep', () => {
    const notes = countdownNotes();
    expect(notes).toHaveLength(4);
    expect(notes.slice(0, 3).every((n) => n === 440)).toBe(true);
    expect(notes[3]).toBe(880);
  });
});
