import { formatTime } from './timer';

export interface HudSnapshot {
  running: boolean;
  status: 'countdown' | 'running' | 'finished';
  countdown: number;
  lap: number;
  currentLapTime: number;
  lastLap: number | null;
  bestLap: number | null;
  speedKmh: number;
  onTrack: boolean;
  message: string;
  messageKind: 'info' | 'lap' | 'best' | 'countdown';
}

function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing HUD element #${id}`);
  return found;
}

export class Hud {
  private timeEl: HTMLElement;
  private lapEl: HTMLElement;
  private bestEl: HTMLElement;
  private lastEl: HTMLElement;
  private speedEl: HTMLElement;
  private msgEl: HTMLElement;
  private noteEl: HTMLElement;

  constructor() {
    this.timeEl = el('hud-time');
    this.lapEl = el('hud-lap');
    this.bestEl = el('hud-best');
    this.lastEl = el('hud-last');
    this.speedEl = el('hud-speed');
    this.msgEl = el('hud-msg');
    this.noteEl = el('hud-note');
  }

  update(s: HudSnapshot): void {
    this.timeEl.textContent = formatTime(s.currentLapTime);
    this.lapEl.textContent = `LAP ${s.lap}`;
    this.bestEl.textContent = `BEST ${s.bestLap === null ? '--:--.--' : formatTime(s.bestLap)}`;
    this.lastEl.textContent = `LAST ${s.lastLap === null ? '--:--.--' : formatTime(s.lastLap)}`;
    this.speedEl.textContent = `${Math.round(s.speedKmh)} km/h`;

    const noteText = !s.onTrack ? 'OFF TRACK' : s.status === 'countdown' ? 'GET READY' : '';
    this.noteEl.textContent = noteText;
    this.noteEl.style.opacity = noteText ? '1' : '0';

    let cls = 'info';
    if (s.messageKind === 'best') cls = 'best';
    else if (s.messageKind === 'lap') cls = 'lap';
    this.msgEl.className = `msg ${cls}`;
    this.msgEl.textContent = s.message;
    this.msgEl.style.opacity = s.message ? '1' : '0';
  }

  /** Read the current HUD text (used by debug hooks / tests). */
  getText(): { time: string; lap: string; best: string; last: string; speed: string; message: string; note: string } {
    return {
      time: this.timeEl.textContent ?? '',
      lap: this.lapEl.textContent ?? '',
      best: this.bestEl.textContent ?? '',
      last: this.lastEl.textContent ?? '',
      speed: this.speedEl.textContent ?? '',
      message: this.msgEl.textContent ?? '',
      note: this.noteEl.textContent ?? '',
    };
  }
}
