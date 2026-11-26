import * as THREE from 'three';

export interface KartParts {
  /** outer group positioned/rotated at the kart state */
  group: THREE.Group;
  /** visual body group (tilted by lateral G) */
  body: THREE.Group;
  /** spinning wheel meshes (front two are steered via steerGroups) */
  wheels: THREE.Mesh[];
  /** one yaw group per wheel; the front two are rotated to steer */
  steerGroups: THREE.Group[];
  /** full car scale for reference: ~1.3 wide, ~2.6 long */
}

const WHEEL_RADIUS = 0.36;
const WHEEL_WIDTH = 0.32;

/** Build the kart meshes. Geometry/material count is kept low. */
export function buildKart(color: number = 0xe0393e): KartParts {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.85, metalness: 0.1 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcfd4dc, roughness: 0.25, metalness: 0.8 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95, metalness: 0.0 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.3, metalness: 0.7 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf6e23b, roughness: 0.35, metalness: 0.15 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.15, metalness: 0.6 });

  // chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.34, 2.25), bodyMat);
  chassis.position.set(0, 0.46, 0.05);
  chassis.castShadow = true;
  body.add(chassis);

  // nose cone
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.24, 0.75), bodyMat);
  nose.position.set(0, 0.42, 1.28);
  body.add(nose);

  // cockpit opening
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.3, 1.05), darkMat);
  cockpit.position.set(0, 0.68, -0.28);
  body.add(cockpit);

  // seat
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.52, 0.22), darkMat);
  seat.position.set(0, 0.8, -0.62);
  body.add(seat);

  // driver torso + helmet
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 4, 10), new THREE.MeshStandardMaterial({ color: 0x27405c, roughness: 0.8 }));
  torso.position.set(0, 0.88, -0.25);
  torso.castShadow = true;
  body.add(torso);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 14), helmetMat);
  helmet.position.set(0, 1.18, -0.25);
  helmet.castShadow = true;
  body.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.18), visorMat);
  visor.position.set(0, 1.16, -0.02);
  body.add(visor);

  // side pods
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 1.15), bodyMat);
    pod.position.set(side * 0.62, 0.44, -0.45);
    pod.castShadow = true;
    body.add(pod);
  }

  // rear spoiler
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.1, 0.34), bodyMat);
  spoiler.position.set(0, 1.12, -1.28);
  spoiler.castShadow = true;
  body.add(spoiler);
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), darkMat);
    strut.position.set(side * 0.62, 0.9, -1.28);
    body.add(strut);
  }

  // exhausts
  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.32, 10), chromeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(side * 0.22, 0.42, -1.22);
    body.add(pipe);
  }

  // headlights
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c0,
    emissive: 0xffedb0,
    emissiveIntensity: 0.9,
    roughness: 0.3,
  });
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), lightMat);
    lamp.position.set(side * 0.22, 0.5, 1.62);
    body.add(lamp);
  }

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, WHEEL_WIDTH + 0.04, 12);
  hubGeo.rotateZ(Math.PI / 2);
  // Each wheel sits in its own steer group: the group yaws for steering,
  // the wheel mesh spins inside it, so rolling stays a clean straight roll.
  const wheels: THREE.Mesh[] = [];
  const steerGroups: THREE.Group[] = [];
  const wheelPos: Array<[number, number, number]> = [
    [-0.72, WHEEL_RADIUS, 0.8],
    [0.72, WHEEL_RADIUS, 0.8],
    [-0.72, WHEEL_RADIUS, -0.78],
    [0.72, WHEEL_RADIUS, -0.78],
  ];
  for (const [x, y, z] of wheelPos) {
    const steer = new THREE.Group();
    steer.position.set(x, y, z);
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    wheel.add(hub);
    steer.add(wheel);
    group.add(steer);
    wheels.push(wheel);
    steerGroups.push(steer);
  }

  return { group, body, wheels, steerGroups };
}

/**
 * Roll/pitch the visual body, and spin the wheels.
 * `steer`: +1 toward driver's left. `throttle`: -1 brake .. +1 throttle.
 */
export function updateVisual(
  parts: KartParts,
  dt: number,
  absSpeed: number,
  steer: number,
  throttle: number,
): void {
  const spin = (absSpeed * dt) / WHEEL_RADIUS;
  for (const w of parts.wheels) w.rotation.x += spin;

  // bank into turns: left turn lifts the left side (centrifugal pushes the right side down)
  const targetRoll = steer * Math.min(1, absSpeed / 40) * 0.15;
  parts.body.rotation.z += (targetRoll - parts.body.rotation.z) * Math.min(1, 10 * dt);

  // squat under throttle (nose up), dive under braking (nose down)
  const targetPitch = throttle > 0 ? -0.05 : throttle < 0 ? 0.065 : 0;
  parts.body.rotation.x += (targetPitch - parts.body.rotation.x) * Math.min(1, 8 * dt);
}

export const KART_WHEEL_RADIUS = WHEEL_RADIUS;
