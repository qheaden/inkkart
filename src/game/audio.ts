/**
 * Web Audio sound generation for the kart.
 * The pure helpers are unit-testable; the SoundEngine wraps the real AudioContext
 * and is only ever constructed in the browser after a user gesture.
 */

/** Map normalized speed (0..1) to engine oscillator frequency in Hz. */
export function engineFrequency(speedNorm: number): number {
  const s = Math.max(0, Math.min(1, speedNorm));
  // 42 Hz at idle → 175 Hz at top speed
  return 42 + s * 133;
}

/** Oscillator type alternates sub-octave for a meatier idle. */
export function engineOscillatorType(speedNorm: number): OscillatorType {
  return speedNorm < 0.25 ? 'triangle' : 'sawtooth';
}

/** Drift audio gain (0..1) for given lateral slip and handbrake state. */
export function driftGain(lateralSlip: number, handbrake: boolean, onTrack: boolean): number {
  if (!onTrack) return 0.22; // rumble on the grass
  if (handbrake && lateralSlip > 4) return Math.min(0.5, 0.18 + lateralSlip * 0.02);
  if (lateralSlip > 9) return Math.min(0.4, (lateralSlip - 6) * 0.045);
  return 0;
}

export interface EngineTone {
  /** multiple of the base engine frequency */
  ratio: number;
  /** relative amplitude (0..1); the main tone is the reference */
  gain: number;
  /** detune in cents (small values richen the timbre without audible wobble) */
  detuneCents: number;
}

/**
 * The engine voice: a sub-octave body, the main growl and a bright upper
 * octave. Multiple tones — rather than a single line — make full throttle
 * sound like a real engine.
 */
export const ENGINE_TONES: readonly EngineTone[] = Object.freeze([
  { ratio: 0.5, gain: 0.55, detuneCents: 0 },
  { ratio: 1.0, gain: 1.0, detuneCents: 0 },
  { ratio: 2.0, gain: 0.32, detuneCents: 9 },
]);

/** Frequencies of the engine tones at normalized speed (0..1). */
export function engineToneFrequencies(speedNorm: number): number[] {
  const base = engineFrequency(speedNorm);
  return ENGINE_TONES.map((tone) => base * tone.ratio);
}

/** Lap jingle: ascending two-note chime (Hz). */
export function lapJingleNotes(): number[] {
  return [659.25, 987.77];
}

/** Countdown beeps: low for 3..1, high for GO. */
export function countdownNotes(): number[] {
  return [440, 440, 440, 880];
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOscs: OscillatorNode[] = [];
  private engineGains: GainNode[] = [];
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseSrc: AudioBufferSourceNode | null = null;
  private started = false;

  /** Lazily create the AudioContext. Must be called from a user gesture. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // engine voice: one oscillator per tone → lowpass → master gain
    // (sub triangle + main + upper-octave sawtooth)
    const toneTypes: OscillatorType[] = ['triangle', 'sawtooth', 'sawtooth'];
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 900;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    ENGINE_TONES.forEach((tone, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = toneTypes[i] ?? 'sawtooth';
      osc.frequency.value = engineFrequency(0) * tone.ratio;
      osc.detune.value = tone.detuneCents;
      const toneGain = this.ctx!.createGain();
      toneGain.gain.value = tone.gain;
      osc.connect(toneGain);
      toneGain.connect(this.engineFilter!);
      osc.start();
      this.engineOscs.push(osc);
      this.engineGains.push(toneGain);
    });

    // noise loop for drift/grass rumble
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseSrc = this.ctx.createBufferSource();
    this.noiseSrc.buffer = buffer;
    this.noiseSrc.loop = true;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 380;
    noiseFilter.Q.value = 0.6;
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0.0;
    this.noiseSrc.connect(noiseFilter);
    noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.master);
    this.noiseSrc.start();

    this.started = true;
  }

  /** Update engine + noise volumes. speedNorm in 0..1. */
  update(speedNorm: number, lateralSlip: number, handbrake: boolean, onTrack: boolean, running: boolean): void {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    const targetEngine = running ? 0.05 + speedNorm * 0.11 : 0.0;
    this.engineGain?.gain.setTargetAtTime(targetEngine, t, 0.08);
    const freqs = engineToneFrequencies(speedNorm);
    for (let i = 0; i < this.engineOscs.length; i++) {
      this.engineOscs[i]!.frequency.setTargetAtTime(freqs[i]!, t, 0.05);
    }
    // main tone warms up from triangle to sawtooth
    const mainType = engineOscillatorType(speedNorm);
    if (this.engineOscs[1] && this.engineOscs[1]!.type !== mainType) {
      this.engineOscs[1]!.type = mainType;
    }
    this.engineFilter?.frequency.setTargetAtTime(500 + speedNorm * 1400, t, 0.1);

    const targetNoise = driftGain(lateralSlip, handbrake, onTrack);
    this.noiseGain?.gain.setTargetAtTime(targetNoise, t, 0.06);
  }

  /** One-shot beep. */
  beep(freq: number, duration: number = 0.12, gain: number = 0.25): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  playCountdown(index: number): void {
    const notes = countdownNotes();
    const note = notes[Math.min(index, notes.length - 1)] ?? 440;
    this.beep(note, 0.14, 0.3);
  }

  playLapJingle(): void {
    const notes = lapJingleNotes();
    notes.forEach((freq, i) => {
      setTimeout(() => this.beep(freq, 0.18, 0.28), i * 130);
    });
  }

  stop(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0, t, 0.1);
    this.noiseGain?.gain.setTargetAtTime(0, t, 0.1);
  }
}
