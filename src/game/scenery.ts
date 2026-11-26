import { mulberry32 } from './rng';
import type { Track } from './track';

export type SceneryType = 'tree' | 'pine' | 'rock' | 'bush' | 'mountain' | 'cloud' | 'lake';

export interface SceneryItem {
  type: SceneryType;
  x: number;
  z: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface SceneryParams {
  seed: number;
  treeCount: number;
  pineCount: number;
  rockCount: number;
  bushCount: number;
  mountainCount: number;
  cloudCount: number;
  minTrackDistance: number;
  maxTrackDistance: number;
  mountainMinRadius: number;
  mountainMaxRadius: number;
  lakePosition: [number, number] | null;
}

export const DEFAULT_SCENERY: SceneryParams = {
  seed: 20240613,
  treeCount: 90,
  pineCount: 55,
  rockCount: 28,
  bushCount: 70,
  mountainCount: 14,
  cloudCount: 10,
  minTrackDistance: 14,
  maxTrackDistance: 120,
  mountainMinRadius: 300,
  mountainMaxRadius: 430,
  lakePosition: [0, 0], // infield center-ish; validated against the track below
};

function distanceToTrack(track: Track, x: number, z: number): number {
  return track.closestPoint(x, z).distance;
}

/**
 * Deterministically place scenery around the track.
 * Pure: same seed => same layout, so tests can validate clearance and determinism.
 */
export function generateScenery(track: Track, params: SceneryParams = DEFAULT_SCENERY): SceneryItem[] {
  const rng = mulberry32(params.seed);
  const items: SceneryItem[] = [];
  const { centroid } = track; // used for mountain ring

  const groundItems = () => items.filter((i) => i.type === 'tree' || i.type === 'pine' || i.type === 'rock' || i.type === 'bush');
  const minDist = (type: string) => (type === 'bush' ? 2.6 : 3.4);

  const scatterFar = (type: 'tree' | 'pine' | 'rock' | 'bush', count: number, minScale: number, maxScale: number) => {
    let attempts = 0;
    let placed = 0;
    while (placed < count && attempts < count * 60) {
      attempts++;
      const t = rng() * track.samples.length;
      const s = track.getSample(t);
      const side = rng() < 0.5 ? -1 : 1;
      const lateral = params.minTrackDistance + rng() * (params.maxTrackDistance - params.minTrackDistance);
      const jitter = (rng() - 0.5) * 30;
      const x = s.x + s.nx * lateral * side + jitter;
      const z = s.z + s.nz * lateral * side;
      const d = distanceToTrack(track, x, z);
      if (d < params.minTrackDistance) continue;
      // keep ground items from overlapping: reject if a ground item is too close
      const minD = minDist(type);
      let tooClose = false;
      for (const other of groundItems()) {
        const dd = Math.hypot(other.x - x, other.z - z);
        if (dd < minD) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      items.push({
        type,
        x,
        z,
        y: 0,
        scale: minScale + rng() * (maxScale - minScale),
        rotation: rng() * Math.PI * 2,
      });
      placed++;
    }
  };

  scatterFar('tree', params.treeCount, 0.8, 1.6);
  scatterFar('pine', params.pineCount, 0.9, 1.9);
  scatterFar('rock', params.rockCount, 0.6, 1.7);
  scatterFar('bush', params.bushCount, 0.7, 1.5);

  // mountains ring around the whole track
  for (let i = 0; i < params.mountainCount; i++) {
    const angle = (i / params.mountainCount) * Math.PI * 2 + rng() * 0.35;
    const radius = params.mountainMinRadius + rng() * (params.mountainMaxRadius - params.mountainMinRadius);
    const x = centroid.x + Math.sin(angle) * radius;
    const z = centroid.z + Math.cos(angle) * radius;
    items.push({
      type: 'mountain',
      x,
      z,
      y: 0,
      scale: 0.9 + rng() * 1.6,
      rotation: rng() * Math.PI * 2,
    });
  }

  // clouds far above (no ground distance requirement)
  for (let i = 0; i < params.cloudCount; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 60 + rng() * 260;
    const x = centroid.x + Math.sin(angle) * radius;
    const z = centroid.z + Math.cos(angle) * radius;
    items.push({
      type: 'cloud',
      x,
      z,
      y: 70 + rng() * 40,
      scale: 0.8 + rng() * 1.4,
      rotation: rng() * Math.PI * 2,
    });
  }

  // lake in the infield, provided it is clear of the track
  if (params.lakePosition) {
    const [lx, lz] = params.lakePosition;
    const d = distanceToTrack(track, lx, lz);
    if (d > track.halfWidth + 30) {
      items.push({ type: 'lake', x: lx, z: lz, y: 0.02, scale: 1, rotation: 0 });
    }
  }

  return items;
}

/** Minimum clear distance a scenery item must keep from the drivable ribbon. */
