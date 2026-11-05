import * as THREE from 'three';
import { makeGlow } from './fx.js';

// The big robot the hand plugs into (loosely a yellow and grey underwater mech). Units are game px, origin = centre of the feet,
// front faces +z. Everything hangs under `face`, which the game turns about Y to face left or right.
export const ROBOT_H = 130;

const lerp = (a, b, t) => a + (b - a) * t;
const M = (color, rough = 0.45, metal = 0.35, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const put = (parent, geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};
const node = (parent, x = 0, y = 0, z = 0) => {
  const n = new THREE.Group();
  n.position.set(x, y, z);
  parent.add(n);
  return n;
};
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);

export function buildRobot() {
  const mat = {
    yellow: M(0xf2c218, 0.45, 0.25), grey: M(0x4a5262, 0.4, 0.6), dark: M(0x2a2e38, 0.5, 0.6), black: M(0x15171c, 0.55, 0.45),
    steel: M(0xaab2c0, 0.25, 0.9), white: M(0xe8ecf4, 0.5, 0.2), podRed: M(0x7a1620, 0.5, 0.3),
    glass: M(0xcfe6ff, 0.05, 0.1, { transparent: true, opacity: 0.28, depthWrite: false }),
    // the lights: all dark until setPower
    eye: M(0xff8a2a, 0.3, 0.2, { emissive: 0xff7a1a, emissiveIntensity: 0 }),
    drillRed: M(0xd23a1a, 0.4, 0.3, { emissive: 0xff3a10, emissiveIntensity: 0 }),
    vent: M(0x1a0f08, 0.6, 0.3, { emissive: 0xff8a2a, emissiveIntensity: 0 }),
    core: new THREE.MeshBasicMaterial({ color: 0xc8f8ff }),
  };

  const g = new THREE.Group();
  const face = node(g);

  // ---------------- pelvis and legs ----------------
  const hips = node(face, 0, 50, 0);
  put(hips, box(38, 14, 30), mat.yellow, 0, 4, 0);
  put(hips, box(30, 6, 24), mat.dark, 0, -3, 0);
  const legs = [1, -1].map((sg) => {
    const leg = node(hips, sg * 12, -2, 0);
    put(leg, box(17, 24, 20), mat.yellow, 0, -12, 0);
    put(leg, box(18.5, 4, 21.5), mat.grey, 0, -4, 0);
    const knee = node(leg, 0, -24, 0);
    const pin = put(knee, cyl(7, 7, 19), mat.dark);
    pin.rotation.z = Math.PI / 2;
    put(knee, box(15, 18, 18), mat.yellow, 0, -11, 0);
    put(knee, box(16.5, 4, 19.5), mat.grey, 0, -3, 0);
    const foot = node(knee, 0, -20, 0);
    put(foot, box(20, 8, 30), mat.yellow, 0, 0, 4);
    put(foot, box(20, 3, 10), mat.dark, 0, -2.5, 17);
    for (const x of [-6, 0, 6]) put(foot, box(3, 5, 1), mat.vent, x, -0.5, 19.3);
    return { leg, knee, sg };
  });

  // ---------------- torso ----------------
  const torso = node(hips, 0, 11, 0);
  put(torso, box(30, 8, 26), mat.dark, 0, 4, 0);
  put(torso, cyl(24, 22, 34, 14), mat.yellow, 0, 25, 0);
  put(torso, cyl(24.6, 24.6, 5, 14), mat.grey, 0, 14, 0);
  put(torso, cyl(24.6, 24.6, 5, 14), mat.grey, 0, 36, 0);
  put(torso, box(28, 22, 8), mat.grey, 0, 24, 22);        // chest plate: vents, gauges, the core slot
  for (let i = 0; i < 4; i++) put(torso, box(2, 14, 1.5), mat.black, -11 + i * 3, 24, 26.2);
  put(torso, box(12, 12, 3), mat.black, 7, 21, 26);       // the slot
  for (const x of [4, 10]) put(torso, cyl(3, 3, 1.5, 10), mat.white, x, 31, 26.4).rotation.x = Math.PI / 2;
  const coreCube = put(torso, box(7, 7, 7), mat.core, 7, 21, 28);
  const coreGlow = makeGlow(0x9ff4ff, 38, 0.8);
  coreGlow.position.set(7, 21, 30);
  torso.add(coreGlow);
  coreCube.visible = coreGlow.visible = false;

  // coiled hoses from the back of the neck to the shoulders: a dark tube with steel rings along it
  const ringGeo = new THREE.TorusGeometry(2.9, 0.9, 5, 8);
  const zAxis = new THREE.Vector3(0, 0, 1);
  for (const sg of [1, -1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sg * 9, 40, -14), new THREE.Vector3(sg * 20, 54, -14), new THREE.Vector3(sg * 34, 50, -8), new THREE.Vector3(sg * 34, 38, -2),
    ]);
    put(torso, new THREE.TubeGeometry(curve, 24, 2.4, 6), mat.black);
    for (let i = 0; i <= 13; i++) {
      const ring = put(torso, ringGeo, mat.steel);
      ring.position.copy(curve.getPointAt(i / 13));
      ring.quaternion.setFromUnitVectors(zAxis, curve.getTangentAt(i / 13));
    }
    put(torso, box(16, 5, 16), mat.yellow, sg * 32, 41, 0).rotation.z = -sg * 0.3; // shoulder flap
  }

  // ---------------- head: yellow collar, glass dome, the eye ----------------
  const head = node(torso, 0, 44, 0);
  put(head, cyl(23, 24, 4, 14), mat.yellow);
  put(head, cyl(23.5, 23.5, 2, 14), mat.grey, 0, 2, 0);
  for (const x of [-13, 13]) put(head, cyl(4, 4, 14, 8), mat.podRed, x, 9, -2);
  put(head, new THREE.SphereGeometry(8.5, 14, 10), mat.eye, 0, 9, 6);
  put(head, new THREE.TorusGeometry(8.5, 1.8, 6, 14), mat.dark, 0, 9, 11);
  put(head, new THREE.SphereGeometry(22, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.glass, 0, 2, 0);
  const eyeGlow = makeGlow(0xff8a2a, 70, 0);
  eyeGlow.position.set(0, 9, 12);
  head.add(eyeGlow);

  // ---------------- arms: [0] big black claw with the drill, [1] small blocky claw ----------------
  const arms = [1, -1].map((sg, i) => {
    const shoulder = node(torso, sg * 30, 33, 0);
    put(shoulder, new THREE.SphereGeometry(6.5, 10, 8), mat.dark);
    put(shoulder, box(11, 20, 11), mat.yellow, 0, -10, 0);
    put(shoulder, box(12.5, 4, 12.5), mat.grey, 0, -3, 0);
    const elbow = node(shoulder, 0, -20, 0);
    put(elbow, cyl(5.5, 5.5, 13, 10), mat.dark).rotation.z = Math.PI / 2;
    put(elbow, box(10, 20, 10), i === 0 ? mat.grey : mat.yellow, 0, -10, 0);
    const wrist = node(elbow, 0, -20, 0);
    put(wrist, cyl(6.5, 7, 5, 8), mat.black, 0, -2, 0);
    const claw = { shoulder, elbow, sg, prongs: [], drill: null };
    if (i === 0) {
      put(wrist, cyl(8.5, 8.5, 5, 8), mat.black, 0, -7.5, 0);
      put(wrist, cyl(6, 6, 3, 12), mat.drillRed, 0, -10.5, 0);
      claw.drill = node(wrist, 0, -12, 0);
      put(claw.drill, new THREE.ConeGeometry(3.5, 11, 8), mat.drillRed, 0, -5, 0).rotation.x = Math.PI;
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI * 2) / 3;
        const pv = node(wrist, Math.cos(a) * 8.5, -8, Math.sin(a) * 8.5);
        pv.rotation.y = -a; // local +x points away from the hub, so rotation.z > 0 opens the prong
        put(pv, box(3, 13, 3.5), mat.black, 0, -6.5, 0);
        const tip = node(pv, 0, -13, 0);
        tip.rotation.z = -0.9;
        put(tip, box(2.6, 12, 3), mat.steel, 0, -6, 0);
        claw.prongs.push(pv);
      }
    } else {
      put(wrist, box(11, 8, 12), mat.black, 0, -6, 0);
      for (const z of [-4, 4]) {
        const pv = node(wrist, 0, -9, z);
        pv.userData.z = z;
        put(pv, box(4, 12, 3), mat.black, 0, -6, 0);
        claw.prongs.push(pv);
      }
    }
    return claw;
  });

  // ---------------- state and pose ----------------
  let slump = 0, power = 0, phase = 0, amp = 0, tuck = 0, punchT = 1, coreOn = false, time = 0;

  const light = (p) => {
    mat.eye.emissiveIntensity = p * 1.8;
    mat.drillRed.emissiveIntensity = p * 1.6;
    mat.vent.emissiveIntensity = p * 1.4;
    eyeGlow.material.opacity = 0.7 * p;
  };

  function pose() {
    const t = slump, u = 1 - t;
    const s = Math.sin(phase) * amp * u, c = Math.cos(phase) * amp * u;
    hips.position.y = lerp(50, 12, t) - Math.abs(c) * 3 + Math.sin(time * 0.002) * 0.6 * u;
    for (const { leg, knee, sg } of legs) {
      leg.rotation.x = lerp(0, -Math.PI / 2, t) - sg * s * 0.65 - tuck * 0.45 * u;
      knee.rotation.x = 0.3 * t + 0.9 * Math.max(0, sg * c) + tuck * 0.9 * u;
    }
    torso.rotation.x = 0.45 * t + 0.06 * amp * u;
    head.rotation.x = 0.6 * t;
    head.rotation.z = 0.25 * t;
    const p = punchT < 1 ? Math.sin(Math.PI * punchT) : 0;
    for (let i = 0; i < arms.length; i++) {
      const { shoulder, elbow, sg, prongs } = arms[i];
      const punching = i === 0 ? p : 0;
      shoulder.rotation.x = lerp(i === 0 ? -0.3 : -0.2, -0.35, t) + sg * s * 0.5 * 0.8 - punching * 1.1 - tuck * 0.5 * u;
      shoulder.rotation.z = sg * lerp(0.2, 0.12, t) + tuck * sg * 0.3 * u;
      elbow.rotation.x = lerp(-1.1, -0.1, t) + punching * 0.9;
      const open = t > 0.9 ? 0.15 : i === 0 && punchT < 1 ? (punchT < 0.6 ? 0.9 : 0.05) : 0.45 + 0.1 * Math.sin(time * 0.003 + i);
      if (i === 0) for (const pv of prongs) pv.rotation.z = open;
      else for (const pv of prongs) pv.rotation.x = Math.sign(pv.userData.z) * open;
    }
  }

  return {
    g, face,
    setSlump(v) { slump = Math.max(0, Math.min(1, v)); pose(); },
    setPower(v) { power = Math.max(0, Math.min(1, v)); light(power); },
    setCore(on) { coreOn = on; coreCube.visible = coreGlow.visible = on; },
    punch() { punchT = 0; },
    update(ms, dt, vx, grounded) {
      time = ms;
      const k = Math.min(1, dt * 10);
      const moving = grounded && slump < 0.5 ? Math.min(1, Math.abs(vx) / 260) : 0;
      amp += (moving - amp) * k;
      phase += dt * 14 * moving;
      tuck += ((grounded ? 0 : 1) - tuck) * k;
      if (punchT < 1) punchT = Math.min(1, punchT + dt / 0.25);
      arms[0].drill.rotation.y += dt * (2 + 10 * power);
      // a dead robot's dome only gives the odd faint flicker
      const flicker = slump > 0.9 && Math.sin(ms * 0.013) * Math.sin(ms * 0.0071) > 0.93 ? 0.35 : 0;
      light(Math.max(power, flicker));
      if (coreOn) coreGlow.material.opacity = 0.6 + 0.2 * Math.sin(ms * 0.006);
      pose();
    },
  };
}
