import * as THREE from 'three';
import type { Track, TrackSample } from './track';
import type { SceneryItem } from './scenery';

/* ---------------- sky ---------------- */

export function buildSky(radius: number = 900): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0.0, '#1f4e79');
  gradient.addColorStop(0.35, '#3d7ab5');
  gradient.addColorStop(0.62, '#8fc3e8');
  gradient.addColorStop(0.8, '#cfe8f6');
  gradient.addColorStop(1.0, '#eaf6ee');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.SphereGeometry(radius, 32, 24);
  const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  return mesh;
}

/* ---------------- ground / grass ---------------- */

export function buildGround(radius: number = 700): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 64);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x4d9a45, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.08;
  mesh.receiveShadow = true;
  return mesh;
}

/* ---------------- lights ---------------- */

export function buildLights(scene: THREE.Scene, track: Track): THREE.DirectionalLight {
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x3f7a37, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d9, 1.6);
  sun.position.set(track.centroid.x + 140, 190, track.centroid.z + 90);
  sun.target.position.set(track.centroid.x, 0, track.centroid.z);
  scene.add(sun);
  scene.add(sun.target);

  sun.castShadow = true;
  const d = 260;
  sun.shadow.camera.left = -d;
  sun.shadow.camera.right = d;
  sun.shadow.camera.top = d;
  sun.shadow.camera.bottom = -d;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 600;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;

  return sun;
}

/* ---------------- track ribbon ---------------- */

const ASPHALT = 0x3b4048;
const EDGE_LINE = 0xf4f6f8;

function ribbon(
  track: Track,
  opts: { lateralOffset: number; width: number; y: number; color: number | number[] },
): THREE.Mesh {
  const n = track.samples.length;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    const s = track.getSample(i % n);
    const lx = s.x + s.nx * (opts.lateralOffset - opts.width / 2);
    const lz = s.z + s.nz * (opts.lateralOffset - opts.width / 2);
    const rx = s.x + s.nx * (opts.lateralOffset + opts.width / 2);
    const rz = s.z + s.nz * (opts.lateralOffset + opts.width / 2);
    positions.push(lx, opts.y, lz, rx, opts.y, rz);
    const col = Array.isArray(opts.color) ? opts.color : [opts.color];
    // alternate along the track if colors are supplied (curbs)
    const pick = Array.isArray(opts.color) ? (Math.floor(i / 6) % 2 === 0 ? col[0]! : col[1]!) : col[0]!;
    c.set(pick);
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** Center dashes (white, short segments). */
function centerDashes(track: Track, y: number): THREE.Mesh {
  const n = track.samples.length;
  const positions: number[] = [];
  const indices: number[] = [];
  const dashLen = 3; // samples per dash
  const gap = 3;
  let quad = 0;
  for (let i = 0; i < n; i += dashLen + gap) {
    const s0 = track.getSample(i);
    const s1 = track.getSample(Math.min(i + dashLen, n));
    const half = 0.28;
    // left/right perpendicular of the centerline
    positions.push(
      s0.x - s0.nx * half, y, s0.z - s0.nz * half,
      s0.x + s0.nx * half, y, s0.z + s0.nz * half,
      s1.x - s1.nx * half, y, s1.z - s1.nz * half,
      s1.x + s1.nx * half, y, s1.z + s1.nz * half,
    );
    const b = quad * 4;
    indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    quad++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8e6da, roughness: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function checkeredTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#111' : '#f4f4f4';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function bannerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#151a22';
  ctx.fillRect(0, 0, 512, 96);
  // checkered top/bottom bands
  for (let x = 0; x < 16; x++) {
    ctx.fillStyle = x % 2 === 0 ? '#f4f4f4' : '#111111';
    ctx.fillRect(x * 32, 0, 32, 10);
    ctx.fillStyle = x % 2 === 0 ? '#111111' : '#f4f4f4';
    ctx.fillRect(x * 32, 86, 32, 10);
  }
  ctx.fillStyle = '#f4f4f4';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S T A R T', 256, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildTrackMeshes(track: Track): THREE.Group {
  const group = new THREE.Group();
  const geoSampleScale = 1; // geometry density 1 sample per track sample (720)
  void geoSampleScale;

  // asphalt
  const asphalt = ribbon(track, { lateralOffset: 0, width: track.width, y: 0.12, color: ASPHALT });
  group.add(asphalt);

  // white edge lines
  const edge = 0.42;
  const lineOffset = track.halfWidth - 0.75;
  group.add(ribbon(track, { lateralOffset: -lineOffset, width: edge, y: 0.16, color: EDGE_LINE }));
  group.add(ribbon(track, { lateralOffset: lineOffset, width: edge, y: 0.16, color: EDGE_LINE }));

  // red/white curbs on both edges
  group.add(ribbon(track, { lateralOffset: -(track.halfWidth + 0.62), width: 1.25, y: 0.085, color: [0xd8372f, 0xf2f4f6] }));
  group.add(ribbon(track, { lateralOffset: track.halfWidth + 0.62, width: 1.25, y: 0.085, color: [0xd8372f, 0xf2f4f6] }));

  // center dashes
  group.add(centerDashes(track, 0.155));

  // start line (checkered strip across the track, just behind the spawn line)
  const spawnSample = track.getSample(0);
  const headingAngle = Math.atan2(spawnSample.tx, spawnSample.tz);
  const startLineGroup = new THREE.Group();
  startLineGroup.position.set(spawnSample.x, 0.185, spawnSample.z);
  startLineGroup.rotation.y = headingAngle;
  const lineGeo = new THREE.PlaneGeometry(track.width, 1.6);
  const lineMat = new THREE.MeshStandardMaterial({ map: checkeredTexture(), roughness: 0.9 });
  const startLine = new THREE.Mesh(lineGeo, lineMat);
  startLine.rotation.x = -Math.PI / 2;
  startLine.receiveShadow = true;
  startLineGroup.add(startLine);
  group.add(startLineGroup);

  // start gantry
  const postMat = new THREE.MeshStandardMaterial({ color: 0x232a34, roughness: 0.6, metalness: 0.4 });
  const postGeo = new THREE.CylinderGeometry(0.35, 0.42, 7.2, 10);
  const postOffset = track.halfWidth + 1.5;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    const px = spawnSample.x + spawnSample.nx * postOffset * side;
    const pz = spawnSample.z + spawnSample.nz * postOffset * side;
    post.position.set(px, 3.6, pz);
    post.castShadow = true;
    group.add(post);
  }
  // Two front-facing planes back-to-back: the kart approaches this line from
  // the -tangent side, so that plane faces the kart, and the other faces the
  // way the kart drives away — text reads correctly on both sides.
  const bannerTex = bannerTexture();
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.6, side: THREE.FrontSide });
  const bannerGeo = new THREE.PlaneGeometry(postOffset * 2 + 0.6, 1.7);
  const banners: THREE.Mesh[] = [];
  for (const rotY of [headingAngle + Math.PI, headingAngle]) {
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    const nx = Math.sin(rotY);
    const nz = Math.cos(rotY);
    banner.position.set(spawnSample.x + nx * 0.06, 6.6, spawnSample.z + nz * 0.06);
    banner.rotation.y = rotY;
    group.add(banner);
    banners.push(banner);
  }
  // exposed for in-browser verification (see GameEngine.getBannerInfo)
  group.userData.banners = banners;

  return group;
}

/* ---------------- scenery meshes ---------------- */

const materials: Record<string, THREE.MeshStandardMaterial> = {};
function mat(key: string, params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  if (!materials[key]) materials[key] = new THREE.MeshStandardMaterial(params);
  return materials[key];
}

function treeGeo(): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 2.4, 7), mat('trunk', { color: 0x6b4423, roughness: 1 }));
  trunk.position.y = 1.2;
  trunk.castShadow = true;
  const leafMat = mat('leaf', { color: 0x2e6f33, roughness: 0.95, flatShading: true });
  const blob1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 1), leafMat);
  blob1.position.y = 3.3;
  blob1.castShadow = true;
  const blob2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 1), leafMat);
  blob2.position.set(0.6, 4.45, 0.35);
  blob2.castShadow = true;
  g.add(trunk, blob1, blob2);
  return g;
}

function pineGeo(): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 2.0, 7), mat('trunk2', { color: 0x5c3a1e, roughness: 1 }));
  trunk.position.y = 1.0;
  trunk.castShadow = true;
  const pineMat = mat('pine', { color: 0x1f5c2c, roughness: 0.95, flatShading: true });
  const cone1 = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.4, 9), pineMat);
  cone1.position.y = 2.9;
  cone1.castShadow = true;
  const cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.35, 2.0, 9), pineMat);
  cone2.position.y = 4.3;
  cone2.castShadow = true;
  const cone3 = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.5, 9), pineMat);
  cone3.position.y = 5.5;
  cone3.castShadow = true;
  g.add(trunk, cone1, cone2, cone3);
  return g;
}

function rockGeo(): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.25, 0),
    mat('rock', { color: 0x8d8f8b, roughness: 1, flatShading: true }),
  );
  rock.scale.set(1.15, 0.75, 1.0);
  rock.position.y = 0.55;
  rock.castShadow = true;
  g.add(rock);
  return g;
}

function bushGeo(): THREE.Group {
  const g = new THREE.Group();
  const bushMat = mat('bush', { color: 0x3f7d35, roughness: 1, flatShading: true });
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), bushMat);
  bush.scale.set(1.25, 0.72, 1.0);
  bush.position.y = 0.5;
  bush.castShadow = true;
  g.add(bush);
  return g;
}

function mountainGeo(): THREE.Group {
  const g = new THREE.Group();
  const rockMat = mat('mountain', { color: 0x6f7c8a, roughness: 1, flatShading: true });
  const snowMat = mat('snow', { color: 0xf2f6fa, roughness: 0.9, flatShading: true });
  const body = new THREE.Mesh(new THREE.ConeGeometry(34, 72, 7), rockMat);
  body.position.y = 36;
  const peak = new THREE.Mesh(new THREE.ConeGeometry(11, 20, 7), snowMat);
  peak.position.y = 63;
  g.add(body, peak);
  return g;
}

function cloudGeo(): THREE.Group {
  const g = new THREE.Group();
  const cloudMat = mat('cloud', { color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
  const puffs: Array<[number, number, number, number]> = [
    [0, 0, 0, 3.4],
    [2.8, 0.4, 0.6, 2.4],
    [-2.7, 0.3, 0.4, 2.3],
    [0.7, 1.6, -0.5, 2.0],
  ];
  for (const [x, y, z, r] of puffs) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cloudMat);
    puff.position.set(x, y, z);
    puff.scale.set(1.35, 0.7, 1.0);
    g.add(puff);
  }
  return g;
}

function lakeGeo(): THREE.Group {
  const g = new THREE.Group();
  const waterMat = mat('lake', { color: 0x2f7fc4, roughness: 0.15, metalness: 0.15 });
  const water = new THREE.Mesh(new THREE.CircleGeometry(24, 36), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.02;
  water.receiveShadow = true;
  const rimMat = mat('rim', { color: 0x8a7a4a, roughness: 1 });
  const rim = new THREE.Mesh(new THREE.RingGeometry(23.6, 26.4, 36), rimMat);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.015;
  g.add(rim, water);
  return g;
}

export function buildSceneryGroup(items: SceneryItem[]): THREE.Group {
  const group = new THREE.Group();
  const shared: Record<string, THREE.Group> = {};
  const getTemplate = (type: SceneryItem['type']): THREE.Group => {
    if (type === 'lake') return lakeGeo();
    if (type === 'cloud') return cloudGeo();
    if (!shared[type]) {
      if (type === 'tree') shared[type] = treeGeo();
      else if (type === 'pine') shared[type] = pineGeo();
      else if (type === 'rock') shared[type] = rockGeo();
      else if (type === 'bush') shared[type] = bushGeo();
      else shared[type] = mountainGeo();
    }
    return shared[type];
  };

  for (const item of items) {
    const template = getTemplate(item.type);
    const instance = template.clone(true);
    instance.position.set(item.x, item.y, item.z);
    instance.scale.setScalar(item.scale);
    instance.rotation.y = item.rotation;
    // heavy shadows only for near scenery
    if (item.type !== 'mountain' && item.type !== 'cloud' && item.type !== 'lake') {
      instance.traverse((child) => {
        if (child instanceof THREE.Mesh) child.castShadow = true;
      });
    }
    group.add(instance);
  }
  return group;
}

export function buildSunGlow(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,244,200,1)');
  grad.addColorStop(0.35, 'rgba(255,232,150,0.55)');
  grad.addColorStop(1, 'rgba(255,224,130,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), mat);
  return mesh;
}
