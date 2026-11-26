/**
 * Lap timing for the solo time trial.
 * Pure logic: the engine supplies the current clock time and the track progress,
 * so the behavior is fully deterministic and unit-testable.
 */
export interface LapEvent {
  lap: number;
  duration: number;
  best: boolean;
  raceTime: number;
}

export class RaceTimer {
  /** number of completed laps */
  laps = 0;
  /** clock time at which the current lap started */
  currentLapStart = 0;
  lastLap: number | null = null;
  bestLap: number | null = null;
  /** furthest progress reached since the last crossing (0..1) */
  furthest = 0;

  constructor(startTime: number = 0) {
    this.currentLapStart = startTime;
  }

  reset(now: number = 0): void {
    this.laps = 0;
    this.currentLapStart = now;
    this.lastLap = null;
    this.bestLap = null;
    this.furthest = 0;
  }

  currentLapTime(now: number): number {
    return Math.max(0, now - this.currentLapStart);
  }

  /**
   * Feed the current track progress (0..1, wrapping across the line).
   * Returns a LapEvent when a valid lap completes, else null.
   */
  update(now: number, progress: number, prevProgress: number): LapEvent | null {
    const wrapped = prevProgress > 0.85 && progress < 0.15;
    // track furthest useful progress (only meaningful moving forward)
    if (progress > this.furthest && !wrapped) this.furthest = progress;

    if (!wrapped) return null;

    // ignore crossing if the kart never made it halfway around (e.g. bounced at the line)
    if (this.furthest < 0.5) {
      this.furthest = progress;
      return null;
    }

    const lap = this.laps + 1;
    const duration = Math.max(0, now - this.currentLapStart);
    this.laps = lap;
    this.currentLapStart = now;
    this.lastLap = duration;
    const best = this.bestLap === null || duration < this.bestLap;
    if (best) this.bestLap = duration;
    this.furthest = progress;
    return { lap, duration, best, raceTime: now };
  }
}

/** Format seconds like `1:23.45` for the HUD. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--.--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds - mins * 60;
  const whole = Math.floor(secs);
  const frac = Math.floor((secs - whole) * 100);
  const secPart = whole.toString().padStart(2, '0');
  const fracPart = frac.toString().padStart(2, '0');
  return `${mins}:${secPart}.${fracPart}`;
}
