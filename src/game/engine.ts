import * as THREE from 'three';
import { Track, DEFAULT_TRACK, SPAWN_PROGRESS } from './track';
import { stepKart, createKart, forwardSpeed, DEFAULT_PHYSICS, type KartState, type KartInput } from './physics';
import { RaceTimer, formatTime } from './timer';
import { SoundEngine } from './audio';
import { generateScenery, DEFAULT_SCENERY, type SceneryItem } from './scenery';
import { buildSky, buildGround, buildLights, buildTrackMeshes, buildSceneryGroup, buildSunGlow } from './world';
import { buildKart, updateVisual, type KartParts } from './kart';
import { attachInput, defaultKeys, mapKeysToInput, smoothSteer, type KartKeys } from './input';
import { Hud, type HudSnapshot } from './hud';
import {
  DEFAULT_OPPONENTS,
  DEFAULT_OPPONENT_PHYSICS,
  spawnOpponent,
  opponentInput,
  opponentTargetLateral,
  resolveCollisions,
  pushApart,
  lateralOffset,
  type OpponentSpec,
} from './opponents';

interface OpponentEntry {
  spec: OpponentSpec;
  state: KartState;
  mesh: KartParts;
  lastSteer: number;
  lastThrottle: number;
  lastTargetLateral: number;
}

export interface GameSnapshot {
  status: 'countdown' | 'running' | 'finished';
  countdown: number;
  lap: number;
  raceTime: number;
  currentLapTime: number;
  lastLap: number | null;
  bestLap: number | null;
  speed: number;
  speedKmh: number;
  /** absolute lateral velocity (slip) relative to the heading direction */
  slip: number;
  onTrack: boolean;
  progress: number;
  distance: number;
  x: number;
  z: number;
  heading: number;
  message: string;
  messageKind: 'info' | 'lap' | 'best' | 'countdown';
  steering: number;
  throttle: number;
  handbrake: boolean;
  drawCalls: number;
  triangles: number;
}

const COUNTDOWN_DURATION = 3.6; // 3,2,1 then GO
const GO_THRESHOLD = 0.6; // start running when countdown hits this

export class GameEngine {
  private track = new Track(DEFAULT_TRACK);
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private kartMesh: KartParts;
  private kart: KartState = createKart(0, 0, 0);
  private opponents: OpponentEntry[] = [];
  private timer = new RaceTimer(0);
  private sound = new SoundEngine();
  private hud?: Hud;
  private keys: KartKeys = defaultKeys();
  /** smoothed steering applied to the player's physics (ramped toward the target) */
  private steerSmooth = 0;
  private detachInput: (() => void) | null = null;
  private sceneryItems: SceneryItem[] = [];
  private trackGroup?: THREE.Group;

  private status: 'countdown' | 'running' | 'finished' = 'countdown';
  private countdown = COUNTDOWN_DURATION;
  private lastCountdownStep = -1;
  private raceTime = 0;
  private prevProgress = SPAWN_PROGRESS;
  private message = '';
  private messageKind: 'info' | 'lap' | 'best' | 'countdown' = 'info';
  private messageTimer = 0;
  private shakeAmount = 0;
  private running = false;
  private lastTimestamp = 0;
  private rafId = 0;
  private audioUnlocked = false;
  private onResizeBound: () => void;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.Fog(0xa8cfe6, 210, 780);
    this.scene.background = new THREE.Color(0x87bce0);
    this.camera = new THREE.PerspectiveCamera(62, container.clientWidth / Math.max(1, container.clientHeight), 0.5, 1500);

    this.scene.add(buildSky(900));
    buildLights(this.scene, this.track);
    this.scene.add(buildGround(700));
    const trackGroup = buildTrackMeshes(this.track);
    this.scene.add(trackGroup);
    this.trackGroup = trackGroup;
    this.sceneryItems = generateScenery(this.track, DEFAULT_SCENERY);
    this.scene.add(buildSceneryGroup(this.sceneryItems));

    const sunGlow = buildSunGlow();
    sunGlow.position.set(this.track.centroid.x + 430, 290, this.track.centroid.z + 260);
    sunGlow.scale.setScalar(2.8);
    this.scene.add(sunGlow);

    this.kartMesh = buildKart(0xe0393e);
    this.scene.add(this.kartMesh.group);

    // computer players: separate meshes, distinct colors, distinct lines
    for (const spec of DEFAULT_OPPONENTS) {
      const mesh = buildKart(spec.color);
      this.scene.add(mesh.group);
      this.opponents.push({
        spec,
        state: createKart(0, 0, 0),
        mesh,
        lastSteer: 0,
        lastThrottle: 0,
        lastTargetLateral: spec.preferredLateral,
      });
    }
    this.resetOpponents();

    this.resetKart();

    const hudEl = document.getElementById('hud-time');
    if (hudEl) this.hud = new Hud();

    this.detachInput = attachInput(this.keys, () => this.unlockAudio());
    window.addEventListener('keydown', this.unlockAudioBound, { once: true });

    this.status = 'countdown';
    this.countdown = COUNTDOWN_DURATION;
    this.placeCameraImmediate();

    (window as unknown as Record<string, unknown>).__game = {
      version: 1,
      getSnapshot: () => this.getSnapshot(),
      reset: () => this.reset(),
      /** Browser tests: complete a lap immediately. Returns whether a lap was counted. */
      completeLap: () => this.completeLapNow(),
      /** Browser tests: wheel gimbal state (steer yaw + roll spin per wheel). */
      getKartVisual: () => this.getKartVisual(),
      /** Browser tests: start-banner planes (rotY, world normal, position). */
      getBannerInfo: () => this.getBannerInfo(),
      /** Browser tests: computer player states (position, line, steer). */
      getOpponents: () => this.getOpponents(),
    };

    this.onResizeBound = () => this.onResize();
    window.addEventListener('resize', this.onResizeBound);
  }

  private unlockAudioBound = () => this.unlockAudio();

  private unlockAudio(): void {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    this.sound.init();
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private resetKart(): void {
    const spawn = this.track.pointAt(SPAWN_PROGRESS, 0);
    const tangent = this.track.tangentAt(SPAWN_PROGRESS);
    this.kart = createKart(spawn.x, spawn.z, Math.atan2(tangent.tx, tangent.tz));
    this.prevProgress = SPAWN_PROGRESS;
  }

  private resetOpponents(): void {
    for (const opp of this.opponents) {
      opp.state = spawnOpponent(this.track, opp.spec);
      opp.lastSteer = 0;
      opp.lastThrottle = 0;
      opp.lastTargetLateral = opp.spec.preferredLateral;
    }
    this.updateOpponentVisuals(0);
  }

  /** Computer player states for browser verification. */
  getOpponents(): Array<{
    name: string;
    color: number;
    x: number;
    z: number;
    heading: number;
    speed: number;
    progress: number;
    distance: number;
    onTrack: boolean;
    steer: number;
    throttle: number;
    targetLateral: number;
    lateral: number;
  }> {
    return this.opponents.map((opp) => {
      const nearest = this.track.closestPoint(opp.state.x, opp.state.z);
      return {
        name: opp.spec.name,
        color: opp.spec.color,
        x: opp.state.x,
        z: opp.state.z,
        heading: opp.state.heading,
        speed: forwardSpeed(opp.state),
        progress: nearest.progress,
        distance: nearest.distance,
        onTrack: nearest.distance <= this.track.halfWidth,
        steer: opp.lastSteer,
        throttle: opp.lastThrottle,
        targetLateral: opp.lastTargetLateral,
        lateral: lateralOffset(this.track, opp.state.x, opp.state.z),
      };
    });
  }

  /** Banner state for browser verification: rotation + world normal per banner plane. */
  getBannerInfo(): Array<{ rotY: number; nx: number; nz: number; x: number; z: number }> {
    const banners = (this.trackGroup?.userData?.banners as THREE.Mesh[] | undefined) ?? [];
    return banners.map((m) => ({
      rotY: m.rotation.y,
      nx: Math.sin(m.rotation.y),
      nz: Math.cos(m.rotation.y),
      x: m.position.x,
      z: m.position.z,
    }));
  }

  /** Per-wheel gimbal state for browser verification: steer yaw (front wheels) and roll spin. */
  getKartVisual(): { steer: number[]; roll: number[] } {
    return {
      steer: this.kartMesh.steerGroups.map((g) => g.rotation.y),
      roll: this.kartMesh.wheels.map((w) => w.rotation.x),
    };
  }

  getSnapshot(): GameSnapshot {
    const nearest = this.track.closestPoint(this.kart.x, this.kart.z);
    const fwd = forwardSpeed(this.kart);
    const rx = Math.cos(this.kart.heading);
    const rz = -Math.sin(this.kart.heading);
    const slip = Math.abs(this.kart.vx * rx + this.kart.vz * rz);
    return {
      status: this.status,
      countdown: Math.max(0, this.countdown - GO_THRESHOLD),
      lap: this.timer.laps + 1,
      raceTime: this.raceTime,
      currentLapTime: this.timer.currentLapTime(this.raceTime),
      lastLap: this.timer.lastLap,
      bestLap: this.timer.bestLap,
      speed: fwd,
      speedKmh: Math.abs(fwd) * 2.6,
      slip,
      onTrack: nearest.distance <= this.track.halfWidth,
      progress: nearest.progress,
      distance: nearest.distance,
      x: this.kart.x,
      z: this.kart.z,
      heading: this.kart.heading,
      message: this.message,
      messageKind: this.messageKind,
      steering: this.steerSmooth,
      throttle: this.keys.throttle ? 1 : this.keys.brake ? -1 : 0,
      handbrake: this.keys.handbrake,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }

  /** Browser-test hook: complete a lap by faking the crossing. Returns success. */
  private completeLapNow(): boolean {
    if (this.status !== 'running') return false;
    this.timer.furthest = 0.97; // simulate having driven most of the loop
    const event = this.timer.update(this.raceTime, 0.02, 0.97);
    if (!event) return false;
    this.prevProgress = 0.02;
    this.setMessage(`LAP ${event.lap} — ${formatTime(event.duration)}${event.best ? '  ★ BEST' : ''}`, event.best ? 'best' : 'lap', 3);
    this.sound.playLapJingle();
    return true;
  }

  reset(): void {
    this.resetKart();
    this.resetOpponents();
    this.timer.reset(0);
    this.raceTime = 0;
    this.status = 'countdown';
    this.countdown = COUNTDOWN_DURATION;
    this.lastCountdownStep = -1;
    this.message = 'GET READY';
    this.messageKind = 'countdown';
    this.messageTimer = 0;
    this.shakeAmount = 0;
    this.steerSmooth = 0;
    this.sound.stop();
    this.placeCameraImmediate();
  }

  start(): void {
    this.running = true;
    this.lastTimestamp = performance.now();
    const loop = (ts: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0.0001, (ts - this.lastTimestamp) / 1000));
      this.lastTimestamp = ts;
      this.frame(dt);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.detachInput?.();
    window.removeEventListener('resize', this.onResizeBound);
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
    delete (window as unknown as Record<string, unknown>).__game;
  }

  private setMessage(text: string, kind: 'info' | 'lap' | 'best' | 'countdown', seconds: number = 2.5): void {
    this.message = text;
    this.messageKind = kind;
    this.messageTimer = seconds;
  }

  private frame(dt: number): void {
    if (this.status === 'countdown') {
      this.countdown -= dt;
      const step = this.countdown > 2.6 ? 3 : this.countdown > 1.6 ? 2 : this.countdown > 0.6 ? 1 : 0;
      if (step !== this.lastCountdownStep) {
        this.lastCountdownStep = step;
        if (step > 0) {
          this.setMessage(String(step), 'countdown', 0.7);
          this.sound.playCountdown(step - 1);
        }
      }
      if (this.countdown <= GO_THRESHOLD) {
        this.status = 'running';
        this.raceTime = 0;
        this.timer.reset(0);
        this.prevProgress = SPAWN_PROGRESS;
        this.setMessage('GO!', 'countdown', 1.1);
        this.sound.playCountdown(3);
      }
      // ramp the steering toward the held keys so the kart starts clean
      this.steerSmooth = smoothSteer(this.steerSmooth, mapKeysToInput(this.keys).steer, dt);
      this.updateCamera(dt);
      this.updateKartVisual(0, this.steerSmooth, 0);
      this.updateOpponentVisuals(0);
      this.hud?.update(this.hudSnapshot(0));
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.raceTime += dt;

    const input = mapKeysToInput(this.keys);
    this.steerSmooth = smoothSteer(this.steerSmooth, input.steer, dt);
    stepKart(this.kart, { throttle: input.throttle, steer: this.steerSmooth, handbrake: input.handbrake }, this.track, dt, DEFAULT_PHYSICS);

    // computer players: follow the track, vary their lines, avoid the player
    for (const opp of this.opponents) {
      const opponentInputData = opponentInput(this.track, opp.state, this.kart, opp.spec);
      stepKart(opp.state, opponentInputData, this.track, dt, DEFAULT_OPPONENT_PHYSICS);
      opp.lastSteer = opponentInputData.steer;
      opp.lastThrottle = opponentInputData.throttle;
      opp.lastTargetLateral = opponentTargetLateral(this.track, opp.state, this.kart, opp.spec.preferredLateral).lateral;
    }
    // bounding-box collisions: player vs opponents, plus a light
    // opponent-vs-opponent push so they don't share a lane
    resolveCollisions(this.kart, this.opponents.map((o) => o.state));
    for (let i = 0; i < this.opponents.length; i++) {
      for (let j = i + 1; j < this.opponents.length; j++) {
        pushApart(this.opponents[i]!.state, this.opponents[j]!.state, 0.5);
      }
    }

    const nearest = this.track.closestPoint(this.kart.x, this.kart.z);
    const progress = nearest.progress;
    const onTrack = nearest.distance <= this.track.halfWidth;
    const event = this.timer.update(this.raceTime, progress, this.prevProgress);
    this.prevProgress = progress;
    if (event) {
      this.setMessage(`LAP ${event.lap} — ${formatTime(event.duration)}${event.best ? '  ★ BEST' : ''}`, event.best ? 'best' : 'lap', 3);
      this.sound.playLapJingle();
    }

    const fwd = forwardSpeed(this.kart);
    // lateral slip in actual velocity terms
    const rx = Math.cos(this.kart.heading);
    const rz = -Math.sin(this.kart.heading);
    const lat = Math.abs(this.kart.vx * rx + this.kart.vz * rz);
    this.shakeAmount = onTrack ? Math.max(0, lat - 9) * 0.018 : 0.32;

    this.updateKartVisual(Math.abs(fwd), this.steerSmooth, input.throttle);
    this.updateOpponentVisuals(dt);
    this.sound.update(Math.min(1, Math.abs(fwd) / DEFAULT_PHYSICS.maxForwardSpeed), lat, this.keys.handbrake, onTrack, true);

    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message = '';
    }

    this.updateCamera(dt);
    this.hud?.update(this.hudSnapshot(fwd));
    this.renderer.render(this.scene, this.camera);
  }

  private updateKartVisual(absSpeed: number, steerInput: number, throttle: number): void {
    const group = this.kartMesh.group;
    group.position.set(this.kart.x, 0, this.kart.z);
    group.rotation.y = this.kart.heading;
    // front wheels yaw toward the driver's left (steer input +1 = left);
    // the steer group yaws, the wheel mesh keeps rolling straight inside it
    for (const g of this.kartMesh.steerGroups.slice(0, 2)) {
      g.rotation.y = steerInput * 0.36;
    }
    updateVisual(this.kartMesh, 1 / 60, absSpeed, steerInput, throttle);
  }

  private updateOpponentVisuals(dt: number): void {
    for (const opp of this.opponents) {
      const group = opp.mesh.group;
      group.position.set(opp.state.x, 0, opp.state.z);
      group.rotation.y = opp.state.heading;
      for (const g of opp.mesh.steerGroups.slice(0, 2)) {
        g.rotation.y = opp.lastSteer * 0.36;
      }
      updateVisual(opp.mesh, dt, Math.abs(forwardSpeed(opp.state)), opp.lastSteer, opp.lastThrottle);
    }
  }

  private updateCamera(dt: number): void {
    const k = this.kart;
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    const dist = 9.2;
    const height = 4.4;
    const target = new THREE.Vector3(k.x - fx * dist, height, k.z - fz * dist);
    const lookAt = new THREE.Vector3(k.x + fx * 7, 1.3, k.z + fz * 7);
    const smooth = 1 - Math.exp(-6.5 * dt);
    this.camera.position.lerp(target, smooth);
    if (this.shakeAmount > 0.02) {
      const s = this.shakeAmount;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.55;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(lookAt);
  }

  private placeCameraImmediate(): void {
    const k = this.kart;
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    this.camera.position.set(k.x - fx * 9.2, 4.4, k.z - fz * 9.2);
    this.camera.lookAt(k.x + fx * 7, 1.3, k.z + fz * 7);
  }

  private hudSnapshot(absFwd: number): HudSnapshot {
    const nearest = this.track.closestPoint(this.kart.x, this.kart.z);
    return {
      running: this.status === 'running',
      status: this.status,
      countdown: Math.max(0, this.countdown - GO_THRESHOLD),
      lap: this.timer.laps + 1,
      currentLapTime: this.timer.currentLapTime(this.raceTime),
      lastLap: this.timer.lastLap,
      bestLap: this.timer.bestLap,
      speedKmh: Math.abs(absFwd) * 2.6,
      onTrack: this.status === 'countdown' ? true : nearest.distance <= this.track.halfWidth,
      message: this.message,
      messageKind: this.messageKind,
    };
  }
}
