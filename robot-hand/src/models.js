import * as THREE from 'three';
import { makeGlow } from './fx.js';

const M = (color, rough = 0.4, metal = 0.5, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const glowMat = (color, k = 1) => M(color, 0.3, 0.3, { emissive: color, emissiveIntensity: k });
const put = (parent, geo, mat, x = 0, y = 0, z = 0, shadow = false) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  parent.add(m);
  return m;
};

// ---------------------------------------------------------------
// DRONE: a quadcopter sentry. Armoured pod, four arms with spinning rotors, one big red eye, landing skids.
// ---------------------------------------------------------------
const droneMats = {
  hull: M(0x2c313c, 0.35, 0.7),
  armor: M(0xc23a46, 0.35, 0.5, { emissive: 0x3a0a10, emissiveIntensity: 0.6 }),
  dark: M(0x14161b, 0.6, 0.3),
  steel: M(0xaab2c0, 0.25, 0.9),
  eye: new THREE.MeshBasicMaterial({ color: 0xff3a3a }),
  rotor: M(0xd8dde8, 0.3, 0.6),
  disc: new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  led: new THREE.MeshBasicMaterial({ color: 0xff3a3a }),
};

export function buildDrone() {
  const g = new THREE.Group();     // positioned by the game
  const inner = new THREE.Group(); // tilts and sways
  g.add(inner);
  inner.rotation.x = 0.4;          // nose toward the camera so the rotors read from above

  put(inner, new THREE.SphereGeometry(6.5, 16, 12), droneMats.hull).scale.set(1, 0.72, 1);
  const shell = put(inner, new THREE.SphereGeometry(6.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.3), droneMats.armor, 0, 1.2, 0);
  shell.scale.set(1, 0.8, 1);
  put(inner, new THREE.TorusGeometry(6.6, 0.55, 6, 20), droneMats.steel, 0, 0, 0).rotation.x = Math.PI / 2;

  // the eye: a lens ringed in black on the front of the pod
  const eyeRing = put(inner, new THREE.TorusGeometry(3.1, 0.9, 8, 16), droneMats.dark, 0, -0.5, 5.4);
  eyeRing.scale.set(1, 1, 0.6);
  const eye = put(inner, new THREE.SphereGeometry(2.4, 12, 10), droneMats.eye, 0, -0.5, 5.7);
  eye.scale.set(1, 1, 0.6);

  // antenna with a blinking light
  put(inner, new THREE.CylinderGeometry(0.3, 0.3, 6, 5), droneMats.steel, -2.5, 8, -1.5);
  const led = put(inner, new THREE.SphereGeometry(0.9, 8, 6), droneMats.led, -2.5, 11.2, -1.5);

  // skids
  for (const s of [-1, 1]) {
    put(inner, new THREE.CylinderGeometry(0.35, 0.35, 11, 5), droneMats.steel, s * 4.5, -6.2, 0).rotation.x = Math.PI / 2;
    for (const z of [-3.5, 3.5]) put(inner, new THREE.CylinderGeometry(0.3, 0.3, 4, 5), droneMats.steel, s * 4.5, -4.4, z);
  }

  // four arms, each with a motor and a spinning rotor
  const rotors = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const arm = new THREE.Group();
    arm.rotation.y = Math.atan2(sx, sz);
    inner.add(arm);
    const len = 12;
    put(arm, new THREE.BoxGeometry(1.7, 1.4, len), droneMats.hull, 0, 0.4, len / 2 + 2);
    const tip = new THREE.Group();
    tip.position.set(0, 1.4, len + 2);
    arm.add(tip);
    put(tip, new THREE.CylinderGeometry(1.9, 2.2, 2.6, 10), droneMats.dark, 0, 0, 0);
    put(tip, new THREE.CylinderGeometry(0.4, 0.4, 1.4, 6), droneMats.steel, 0, 2, 0);
    const spin = new THREE.Group();
    spin.position.y = 2.7;
    tip.add(spin);
    put(spin, new THREE.BoxGeometry(13, 0.25, 1.5), droneMats.rotor);
    put(spin, new THREE.BoxGeometry(1.5, 0.25, 13), droneMats.rotor);
    put(tip, new THREE.CylinderGeometry(7.2, 7.2, 0.1, 20), droneMats.disc, 0, 2.7, 0);
    rotors.push(spin);
  }

  g.add(makeGlow(0xff2a3a, 34, 0.3));
  return { g, inner, rotors, led, eye };
}

export function animateDrone(d, dt, time, vx) {
  const f = d.fx;
  f.rotors.forEach((r, i) => { r.rotation.y += dt * (i % 2 ? 46 : -46); });
  const tilt = Math.max(-0.35, Math.min(0.35, vx * 0.006));
  f.inner.rotation.z += (-tilt - f.inner.rotation.z) * Math.min(1, dt * 6);
  f.inner.rotation.y = Math.sin(time * 0.0013 + d.bx) * 0.5;
  f.inner.position.y = Math.sin(time * 0.004 + d.bx) * 1.6;
  const blink = Math.sin(time * 0.008 + d.bx) > 0.3;
  f.led.visible = blink;
  const p = 0.75 + Math.sin(time * 0.01 + d.bx) * 0.25;
  f.eye.scale.set(p, p, 0.6);
}

// ---------------------------------------------------------------
// BIG SPROCKET: the drone design blown up into a guardian. A crimson shell, a ring of fins and one huge eye that
// shows what it is about to do: red = shooting, white = about to dive, blue = stunned and open to a dash.
// ---------------------------------------------------------------
const WHITE = new THREE.Color(0xffffff);
export function buildBoss(def = {}) {
  const fx = buildDrone();
  if (def.hue) { // give this boss its own shell colour (the drone materials are shared)
    const shellMat = droneMats.armor.clone();
    shellMat.color.setHex(def.hue);
    shellMat.emissive.setHex(def.hue).multiplyScalar(0.25);
    fx.g.traverse((o) => { if (o.isMesh && o.material === droneMats.armor) o.material = shellMat; });
  }
  const g = new THREE.Group();
  g.add(fx.g);
  fx.g.scale.setScalar(5);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3a3a });
  fx.eye.material = eyeMat;
  fx.eye.scale.set(1.7, 1.7, 1);
  fx.eye.position.z += 2;

  const plate = M(def.hue ? new THREE.Color(def.hue).multiplyScalar(0.4).getHex() : 0x3a2028, 0.35, 0.8, { emissive: 0x401018, emissiveIntensity: 0.5 });
  const ring = new THREE.Group();
  g.add(ring);
  put(ring, new THREE.TorusGeometry(41, 3, 8, 40), droneMats.steel).rotation.x = Math.PI / 2;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const fin = put(ring, new THREE.ConeGeometry(5.5, 21, 5), plate, Math.cos(a) * 45, 0, Math.sin(a) * 45);
    fin.rotation.set(Math.sin(a) * Math.PI / 2, 0, -Math.cos(a) * Math.PI / 2);
  }
  ring.rotation.x = 1.15;
  const aura = makeGlow(def.aura || 0xff2a3a, 190, 0.3);
  g.add(aura);
  // three cannons under the shell
  for (const s of [-1, 0, 1]) put(g, new THREE.CylinderGeometry(2.4, 3.2, 14, 8), droneMats.dark, s * 12, -32, 5).rotation.x = 0.1;

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return {
    g, ring, aura, eyeMat, fx,
    // k: 0..1 hit flash
    animate(dt, time, vx, flash, eyeColor) {
      ring.rotation.y += dt * 1.2;
      ring.rotation.x = 1.15 + Math.sin(time * 0.002) * 0.1;
      fx.rotors.forEach((r, i) => { r.rotation.y += dt * (i % 2 ? 40 : -40); });
      fx.inner.rotation.z += (-Math.max(-0.3, Math.min(0.3, vx * 0.002)) - fx.inner.rotation.z) * Math.min(1, dt * 5);
      fx.led.visible = Math.sin(time * 0.012) > 0;
      eyeMat.color.setHex(eyeColor).lerp(WHITE, flash);
      aura.material.color.setHex(eyeColor);
      aura.material.opacity = 0.25 + flash * 0.5;
    },
  };
}

// OLD RUMBLE: a huge armoured wheel that charges along the floor
export function buildRoller(def = {}) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const shell = M(def.hue || 0x5a6a8a, 0.35, 0.8);
  const dark = M(0x1a1d26, 0.5, 0.5);
  put(spin, new THREE.SphereGeometry(30, 24, 18), shell, 0, 0, 0, true);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const sp = put(spin, new THREE.ConeGeometry(6, 18, 6), dark, Math.cos(a) * 33, Math.sin(a) * 33, 0, true);
    sp.rotation.z = a - Math.PI / 2;
  }
  put(spin, new THREE.TorusGeometry(30, 3, 8, 32), droneMats.steel, 0, 0, 0).rotation.y = Math.PI / 2;
  put(spin, new THREE.TorusGeometry(30, 3, 8, 32), droneMats.steel, 0, 0, 0);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffa13d });
  const face = new THREE.Group(); // the face stays upright while the wheel turns
  g.add(face);
  put(face, new THREE.SphereGeometry(8, 14, 10), dark, 0, 4, 26).scale.set(1.5, 1, 0.5);
  put(face, new THREE.SphereGeometry(5, 12, 10), eyeMat, 0, 4, 29).scale.set(1.4, 1, 0.5);
  const aura = makeGlow(def.aura || 0xffa13d, 130, 0.25);
  g.add(aura);
  return {
    g, eyeMat,
    animate(dt, time, vx, flash, eyeColor) {
      spin.rotation.z -= (vx * dt) / 30;
      eyeMat.color.setHex(eyeColor).lerp(WHITE, flash);
      aura.material.color.setHex(eyeColor);
      aura.material.opacity = 0.2 + flash * 0.5;
    },
  };
}

// ---------------------------------------------------------------
// ENEMIES
// ---------------------------------------------------------------
const enemyMats = {
  shell: M(0x7a3a2a, 0.4, 0.5, { emissive: 0x2a0a06, emissiveIntensity: 0.6 }),
  dark: M(0x15171c, 0.6, 0.3),
  steel: M(0xaab2c0, 0.25, 0.9),
  eye: new THREE.MeshBasicMaterial({ color: 0xff5a2a }),
  teal: M(0x2a8a8a, 0.35, 0.6, { emissive: 0x0a3a3a, emissiveIntensity: 0.6 }),
  bat: M(0x4a2a6a, 0.4, 0.5, { emissive: 0x200a3a, emissiveIntensity: 0.7 }),
  batEye: new THREE.MeshBasicMaterial({ color: 0xff3aff }),
};

// a little beetle that patrols the floor
export function buildCrawler() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  put(body, new THREE.SphereGeometry(9, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), enemyMats.shell, 0, 0, 0, true).scale.set(1.3, 1, 0.9);
  put(body, new THREE.CylinderGeometry(11, 11, 1.4, 14), enemyMats.dark, 0, 0, 0);
  put(body, new THREE.SphereGeometry(2.6, 10, 8), enemyMats.eye, 9, 4, 3);
  put(body, new THREE.ConeGeometry(2, 6, 5), enemyMats.steel, 4, 9, 0);
  const legs = [];
  for (const z of [-4, 0, 4]) for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 6, 0, z);
    body.add(leg);
    put(leg, new THREE.CylinderGeometry(0.8, 0.6, 7, 5), enemyMats.steel, s * 2, -3, 0).rotation.z = -s * 0.5;
    legs.push(leg);
  }
  return { g, body, legs };
}
export function animateCrawler(e, time) {
  const f = e.fx;
  f.legs.forEach((l, i) => { l.rotation.z = Math.sin(time * 0.02 + i * 1.7) * 0.5; });
  f.body.scale.x = e.dir || 1;
  f.body.position.y = 4 + Math.abs(Math.sin(time * 0.02)) * 0.8;
}

// a stationary cannon that tracks you
export function buildTurret() {
  const g = new THREE.Group();
  put(g, new THREE.CylinderGeometry(9, 11, 5, 12), enemyMats.dark, 0, 2.5, 0, true);
  put(g, new THREE.SphereGeometry(8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), enemyMats.teal, 0, 5, 0, true);
  const barrel = new THREE.Group();
  barrel.position.set(0, 11, 0);
  g.add(barrel);
  put(barrel, new THREE.CylinderGeometry(2.2, 2.6, 13, 8), enemyMats.steel, 0, 6, 0, true);
  const tip = put(barrel, new THREE.SphereGeometry(2.4, 8, 6), enemyMats.eye, 0, 13, 0);
  return { g, barrel, tip };
}

// a bat-drone that hangs from the ceiling until you walk under it
export function buildDiver() {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  put(inner, new THREE.SphereGeometry(5, 12, 8), enemyMats.bat, 0, 0, 0, true).scale.set(1, 1.2, 1);
  put(inner, new THREE.SphereGeometry(1.7, 8, 6), enemyMats.batEye, 0, -1, 4);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 4, 1, 0);
    inner.add(w);
    put(w, new THREE.BoxGeometry(11, 0.5, 6), enemyMats.bat, s * 5.5, 0, 0);
    wings.push([w, s]);
  }
  g.add(makeGlow(0xff3aff, 22, 0.25));
  return { g, inner, wings };
}
export function animateDiver(e, time, awake) {
  const f = e.fx;
  const flap = Math.sin(time * (awake ? 0.05 : 0.004) + e.c) * (awake ? 0.9 : 0.12);
  f.wings.forEach(([w, s]) => { w.rotation.z = -s * (awake ? flap : 1.1 + flap); });
  f.inner.rotation.x = awake ? 0.3 : 0;
}

// ---------------------------------------------------------------
// CHARGING STATION: a pad, a pylon and a floating orb inside two turning rings
// ---------------------------------------------------------------
export function buildStation() {
  const g = new THREE.Group();
  const metal = M(0x4a5166, 0.35, 0.7);
  const orbMat = glowMat(0x2a6a66, 0.5);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x3a8a88 });

  put(g, new THREE.CylinderGeometry(13, 15, 3, 20), metal, 0, 1.5, 0, true);
  const padRing = put(g, new THREE.TorusGeometry(11, 0.6, 6, 28), ringMat, 0, 3.2, 0);
  padRing.rotation.x = Math.PI / 2;
  put(g, new THREE.CylinderGeometry(2, 3.4, 20, 8), metal, 0, 13, -2, true);
  for (const s of [-1, 1]) put(g, new THREE.BoxGeometry(1.6, 12, 1.6), metal, s * 7, 9, -3, true).rotation.z = -s * 0.2;
  const orb = put(g, new THREE.SphereGeometry(4.2, 16, 12), orbMat, 0, 30, -2);
  const rings = [0, 1].map((k) => {
    const r = put(g, new THREE.TorusGeometry(8 + k * 2.6, 0.45, 6, 24), ringMat, 0, 30, -2);
    r.rotation.x = k ? 0.9 : -0.6;
    return r;
  });
  const beam = put(g, new THREE.CylinderGeometry(2.5, 8, 30, 16, 1, true), new THREE.MeshBasicMaterial({
    color: 0x5cf08a, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }), 0, 18, -2);
  const glow = makeGlow(0x2a6a66, 22, 0.25);
  glow.position.set(0, 30, -2);
  g.add(glow);
  return { g, orbMat, ringMat, rings, beam, glow, orb };
}

export function setStation(st, on) {
  const c = on ? 0x5cf08a : 0x2a6a66;
  st.orbMat.color.setHex(c);
  st.orbMat.emissive.setHex(on ? 0x2aaa55 : 0x0a2a2a);
  st.orbMat.emissiveIntensity = on ? 1.6 : 0.5;
  st.ringMat.color.setHex(on ? 0x7dffa8 : 0x3a8a88);
  st.glow.material.color.setHex(c);
  st.glow.material.opacity = on ? 0.7 : 0.25;
  st.beam.material.opacity = on ? 0.16 : 0;
}

export function animateStation(st, dt, time) {
  st.rings[0].rotation.y += dt * 1.4;
  st.rings[1].rotation.y -= dt * 1.1;
  st.rings[1].rotation.z += dt * 0.6;
  st.orb.position.y = 30 + Math.sin(time * 0.003) * 1.2;
}

// ---------------------------------------------------------------
// PICKUPS: each upgrade is a small model of what it does
// ---------------------------------------------------------------
class Helix extends THREE.Curve {
  constructor(r, h, turns) { super(); this.r = r; this.h = h; this.turns = turns; }
  getPoint(t, out = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    return out.set(Math.cos(a) * this.r, (t - 0.5) * this.h, Math.sin(a) * this.r);
  }
}

function spring(parent, mat, steel, r, h, turns) {
  const g = new THREE.Group();
  put(g, new THREE.TubeGeometry(new Helix(r, h, turns), 72, 0.9, 6), mat);
  put(g, new THREE.CylinderGeometry(r + 1.5, r + 1.5, 1.2, 14), steel, 0, -h / 2 - 0.4, 0);
  put(g, new THREE.CylinderGeometry(r + 1.5, r + 1.5, 1.2, 14), steel, 0, h / 2 + 0.4, 0);
  parent.add(g);
  return g;
}

// a thruster pointing right with a flame trailing left; returns the flame so it can flicker
function thruster(parent, steel, mat, scale = 1, y = 0) {
  const t = new THREE.Group();
  t.position.y = y;
  t.scale.setScalar(scale);
  put(t, new THREE.CylinderGeometry(3.6, 3.6, 9, 12), steel).rotation.z = Math.PI / 2;
  put(t, new THREE.CylinderGeometry(3, 5.4, 5, 12), mat, 6.5).rotation.z = -Math.PI / 2;
  put(t, new THREE.TorusGeometry(3.7, 0.7, 6, 14), mat, -2.5).rotation.y = Math.PI / 2;
  const flame = put(t, new THREE.ConeGeometry(3.4, 11, 10), new THREE.MeshBasicMaterial({
    color: 0xffb84a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
  }), -10, 0, 0);
  flame.rotation.z = Math.PI / 2;
  parent.add(t);
  return flame;
}

function wingShape(sx, len) {
  const s = new THREE.Shape();
  s.moveTo(0, 1);
  s.lineTo(8 * len, -1);
  s.lineTo(14 * len, -6);
  s.lineTo(7 * len, -6.2);
  s.lineTo(0, -4);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: false });
  g.translate(0, 0, -0.45);
  g.scale(sx, 1, 1);
  return g;
}

function shieldGeo(scale, depth) {
  const s = new THREE.Shape();
  s.moveTo(-6, 8); s.lineTo(6, 8); s.lineTo(6, 0);
  s.quadraticCurveTo(6, -6.5, 0, -10);
  s.quadraticCurveTo(-6, -6.5, -6, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.7, bevelSize: 0.7, bevelSegments: 2 });
  g.translate(0, 0, -depth / 2);
  g.scale(scale, scale, 1);
  return g;
}

export function buildPickup(id, color, ability) {
  const group = new THREE.Group();
  const model = new THREE.Group();
  group.add(model);
  const mat = glowMat(color, 0.55);
  const steel = M(0xc8cfdd, 0.22, 0.95);
  const dark = M(0x20242d, 0.5, 0.5);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const anims = [];

  switch (id) {
    case 'hop': spring(model, mat, steel, 5, 16, 4.2); break;
    case 'airhop': {
      spring(model, mat, steel, 3.6, 9, 3).position.y = -3;
      const arrow = put(model, new THREE.ConeGeometry(4.5, 6, 4), glowMat(0x9ff1ff, 1.4), 0, 9, 0);
      anims.push((t) => { arrow.position.y = 9 + Math.sin(t * 0.008) * 1.4; });
      break;
    }
    case 'dash': {
      const flame = thruster(model, steel, mat, 1.1);
      anims.push((t) => flame.scale.set(1, 0.8 + Math.random() * 0.4, 0.8 + Math.random() * 0.4));
      break;
    }
    case 'dashcharge': {
      const f1 = thruster(model, steel, mat, 0.8, 5.5);
      const f2 = thruster(model, steel, mat, 0.8, -5.5);
      anims.push(() => { f1.scale.y = f2.scale.y = 0.8 + Math.random() * 0.4; });
      break;
    }
    case 'blaster': {
      put(model, new THREE.CylinderGeometry(3, 3.6, 16, 12), steel).rotation.z = Math.PI / 2;
      put(model, new THREE.BoxGeometry(7, 7, 6), dark, -6, -1, 0);
      put(model, new THREE.CylinderGeometry(1.6, 1.6, 6, 8), steel, -6, -6, 0);
      const tip = put(model, new THREE.SphereGeometry(3.2, 10, 8), glowMat(0xff9aee, 1.8), 9, 0, 0);
      anims.push((t) => tip.scale.setScalar(0.8 + Math.sin(t * 0.01) * 0.25));
      break;
    }
    case 'slam': {
      put(model, new THREE.CylinderGeometry(1.8, 1.8, 14, 10), steel, 0, 6, 0);
      put(model, new THREE.BoxGeometry(14, 6, 8), mat, 0, -3, 0);
      const arrow = put(model, new THREE.ConeGeometry(4, 6, 4), glowMat(0xffd0d0, 1.4), 0, -10, 0);
      arrow.rotation.x = Math.PI;
      anims.push((t) => { arrow.position.y = -10 - Math.abs(Math.sin(t * 0.006)) * 3; });
      break;
    }
    case 'rapid': {
      for (const y of [-6, 0, 6]) put(model, new THREE.CapsuleGeometry(1.8, 6, 4, 8), mat, 0, y, 0).rotation.z = Math.PI / 2;
      break;
    }
    case 'triple': {
      for (const a of [-0.45, 0, 0.45]) {
        const b = put(model, new THREE.CylinderGeometry(1.6, 1.9, 14, 8), steel);
        b.rotation.z = Math.PI / 2 + a;
        put(model, new THREE.SphereGeometry(1.8, 8, 6), mat, Math.cos(a) * 8, Math.sin(a) * 8, 0);
      }
      break;
    }
    case 'quake': {
      const ring = put(model, new THREE.TorusGeometry(8, 1.2, 8, 24), mat);
      ring.rotation.x = Math.PI / 2;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const c = put(model, new THREE.ConeGeometry(2, 7, 5), steel, Math.cos(a) * 11, -3, Math.sin(a) * 11);
        c.rotation.x = Math.PI;
      }
      anims.push((t) => ring.scale.setScalar(1 + Math.sin(t * 0.006) * 0.12));
      break;
    }
    case 'afterburner': {
      const f1 = thruster(model, steel, mat, 1.5, 0);
      const ring = put(model, new THREE.TorusGeometry(8, 0.7, 6, 24), glowMat(0xff6a2a, 1.6), 3, 0, 0);
      ring.rotation.y = Math.PI / 2;
      anims.push((t) => { f1.scale.set(1.4, 0.8 + Math.random() * 0.5, 0.8 + Math.random() * 0.5); ring.scale.setScalar(1 + Math.sin(t * 0.01) * 0.08); });
      break;
    }
    case 'coil': {
      spring(model, mat, steel, 7, 11, 5.5);
      const inner = spring(model, glowMat(0xffffff, 0.8), steel, 3.2, 8, 4);
      anims.push((t) => { inner.scale.y = 0.85 + Math.sin(t * 0.006) * 0.15; });
      break;
    }
    case 'widefins':
    case 'glide':
    case 'longfins': {
      const long = id === 'longfins';
      const wide = id === 'widefins';
      const m = M(color, 0.35, 0.4, { emissive: color, emissiveIntensity: 0.7, side: THREE.DoubleSide });
      put(model, new THREE.CapsuleGeometry(2.2, 8, 4, 10), steel).rotation.z = Math.PI / 2;
      const n = long ? 3 : wide ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const len = wide ? 1.55 : long ? 1.25 - k * 0.12 : 1;
        for (const sx of [1, -1]) {
          const w = put(model, wingShape(sx, len), m, sx * 1.5, 0, 0);
          w.rotation.z = sx * (0.12 + k * 0.1) * -1;
          w.position.y = -k * 1.8;
        }
      }
      model.rotation.x = 0.35;
      break;
    }
    case 'suction': {
      const cup = new THREE.LatheGeometry([[7.5, 0], [7.2, 1.4], [5.4, 3.2], [2.6, 4.2], [0.01, 4.4]].map(([x, y]) => new THREE.Vector2(x, y)), 24);
      const cm = M(color, 0.2, 0.2, { emissive: color, emissiveIntensity: 0.7, side: THREE.DoubleSide });
      const cupMesh = put(model, cup, cm);
      cupMesh.rotation.x = -Math.PI / 2;
      cupMesh.position.z = 1;
      const rim = put(model, new THREE.TorusGeometry(7.4, 0.8, 8, 24), steel, 0, 0, 1);
      put(model, new THREE.CylinderGeometry(1.2, 1.2, 8, 8), steel, 0, 0, -5).rotation.x = Math.PI / 2;
      put(model, new THREE.SphereGeometry(2.6, 10, 8), mat, 0, 0, -9.5);
      model.rotation.x = 0.2;
      break;
    }
    case 'overclock': {
      const s = new THREE.Shape();
      [[5, 10], [2, 10], [-5, -1], [-0.5, -1], [-3, -10], [6, 3], [1.5, 3]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 3, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2 });
      g.translate(0, 0, -1.5);
      put(model, g, mat);
      break;
    }
    case 'gripgel': {
      const pts = [[0.01, -7], [3, -6.3], [5, -3.5], [5.6, 0], [4.6, 3.2], [3, 6], [1.5, 8.4], [0.01, 11]];
      const drop = put(model, new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 18), M(color, 0.05, 0.1, {
        emissive: color, emissiveIntensity: 0.55, transparent: true, opacity: 0.82,
      }));
      drop.position.y = -2;
      put(model, new THREE.SphereGeometry(1.2, 8, 6), white, 2.2, 0, 4.5);
      put(model, new THREE.TorusGeometry(6.5, 0.7, 6, 20), mat, 0, -9, 0).rotation.x = Math.PI / 2;
      break;
    }
    case 'magnet': {
      const red = M(0xe0443a, 0.35, 0.5, { emissive: 0x501010, emissiveIntensity: 0.6 });
      put(model, new THREE.TorusGeometry(6, 2.3, 10, 22, Math.PI), red, 0, 1, 0);
      for (const s of [-1, 1]) {
        put(model, new THREE.CylinderGeometry(2.3, 2.3, 6, 12), red, s * 6, -2, 0);
        put(model, new THREE.CylinderGeometry(2.4, 2.4, 3.6, 12), steel, s * 6, -6.8, 0);
      }
      break;
    }
    case 'knees': {
      put(model, new THREE.CylinderGeometry(3.6, 3.6, 10, 14), mat, 0, 3, 0);
      put(model, new THREE.CylinderGeometry(1.6, 1.6, 10, 10), steel, 0, -5, 0);
      put(model, new THREE.TorusGeometry(3.7, 0.7, 6, 14), steel, 0, 6, 0).rotation.x = Math.PI / 2;
      put(model, new THREE.SphereGeometry(3.4, 12, 10), steel, 0, 8.5, 0);
      put(model, new THREE.SphereGeometry(3, 12, 10), steel, 0, -10, 0);
      model.rotation.z = 0.4;
      break;
    }
    case 'capacitor': {
      put(model, new THREE.CylinderGeometry(4.4, 4.4, 13, 16), M(0x2a3a8a, 0.35, 0.4), 0, 0, 0);
      put(model, new THREE.CylinderGeometry(4.5, 4.5, 2.2, 16), mat, 0, 4, 0);
      put(model, new THREE.CylinderGeometry(4.5, 4.5, 2.2, 16), mat, 0, -4, 0);
      for (const s of [-1, 1]) put(model, new THREE.CylinderGeometry(0.7, 0.7, 6, 6), steel, s * 2, -9.5, 0);
      put(model, new THREE.BoxGeometry(4, 1, 1), white, 0, 0, 4.5);
      put(model, new THREE.BoxGeometry(1, 4, 1), white, 0, 0, 4.5);
      const arc = put(model, new THREE.TorusGeometry(7.5, 0.35, 6, 20), mat);
      anims.push((t) => { arc.rotation.x = t * 0.004; arc.rotation.y = t * 0.003; });
      break;
    }
    case 'armor1':
    case 'armor2':
    case 'armor3':
    case 'armor4': {
      put(model, shieldGeo(1, 2.5), mat);
      put(model, shieldGeo(0.72, 1.4), dark, 0, 0, 1.4);
      const bars = [0];
      bars.forEach((x) => put(model, new THREE.BoxGeometry(1.5, 8, 1), white, x, 0, 2.3));
      break;
    }
    case 'scanner': {
      put(model, new THREE.SphereGeometry(8, 20, 8, 0, Math.PI * 2, Math.PI - 0.9, 0.9), M(0xdfe5ef, 0.25, 0.8, { side: THREE.DoubleSide }), 0, 3, 0);
      put(model, new THREE.CylinderGeometry(0.5, 0.5, 9, 6), steel, 0, -0.5, 0);
      put(model, new THREE.SphereGeometry(1.3, 8, 6), mat, 0, 4.5, 0);
      put(model, new THREE.CylinderGeometry(1.4, 2.6, 6, 8), steel, 0, -8, 0);
      const ring = put(model, new THREE.TorusGeometry(6, 0.3, 6, 24), new THREE.MeshBasicMaterial({ color, transparent: true }), 0, 4.5, 0);
      ring.rotation.x = Math.PI / 2;
      anims.push((t) => { const k = (t * 0.0012) % 1; ring.scale.setScalar(0.3 + k * 1.2); ring.material.opacity = 1 - k; });
      model.rotation.x = 0.3;
      break;
    }
    case 'core': {
      put(model, new THREE.IcosahedronGeometry(7, 1), M(0xffffff, 0.2, 0.2, { emissive: 0xfff2c0, emissiveIntensity: 1.6 }));
      put(model, new THREE.IcosahedronGeometry(11, 1), new THREE.MeshBasicMaterial({ color: 0xffe9a0, wireframe: true, transparent: true, opacity: 0.7 }));
      const r1 = put(model, new THREE.TorusGeometry(15, 0.7, 8, 40), mat);
      const r2 = put(model, new THREE.TorusGeometry(18, 0.5, 8, 40), mat);
      anims.push((t) => { r1.rotation.set(t * 0.0011, t * 0.0017, 0); r2.rotation.set(t * -0.0013, 0, t * 0.0019); });
      break;
    }
    default: put(model, new THREE.OctahedronGeometry(7), mat);
  }
  model.traverse((m) => { if (m.isMesh) m.castShadow = false; });

  // halo so every pickup reads from across a room
  const big = ability || id === 'core';
  group.add(makeGlow(color, big ? 54 : 34, big ? 0.3 : 0.25));
  if (big) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(15, 0.5, 6, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }));
    halo.position.z = -4;
    group.add(halo);
    anims.push((t) => { halo.rotation.z = t * 0.001; halo.rotation.x = Math.sin(t * 0.0013) * 0.5; });
    model.scale.setScalar(1.3);
    group.add(new THREE.PointLight(color, 140, 170));
  }
  return { group, model, anim: (t) => anims.forEach((a) => a(t)) };
}
