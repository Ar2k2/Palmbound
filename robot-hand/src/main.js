import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import {
  TILE, COLS, ROWS, AIR, SLICK, SPIKE, CRACK, BRICK, grid, tileAt,
  SPAWN as SPAWN_TILE, CHECKPOINTS, ITEMS, FLOATERS, HINTS,
} from './world.js';
import { explored, reveal, drawMap, exploredPercent } from './map.js';
import * as audio from './audio.js';
import { makeParticles } from './fx.js';
import { createCombat } from './combat.js';
import { buildScenery } from './scenery.js';
import { buildDrone, animateDrone, buildStation, setStation, animateStation, buildPickup } from './models.js';

// ---------------------------------------------------------------
// TUNING: change these numbers to adjust how the hand feels
// ---------------------------------------------------------------
const T = {
  crawlSpeed: 140,      // max run speed on the ground
  groundAccel: 1300,    // how fast you reach crawl speed
  airAccel: 900,        // steering while in the air
  groundDrag: 1500,     // how fast you stop on the ground
  airDrag: 250,         // how fast you slow down in the air
  gravity: 900,
  maxFall: 520,
  hopVelocity: 330,     // jump strength (once unlocked)
  hopCut: 0.45,         // releasing jump early cuts upward speed by this much
  coyoteMs: 90,         // can still jump this long after leaving a ledge
  bufferMs: 110,        // jump pressed slightly early still counts
  climbSpeed: 110,      // up/down speed while gripping a wall
  ceilingSpeed: 100,    // left/right speed while hanging upside down
  wallJumpX: 220,
  wallJumpY: 320,
  wallJumpLockMs: 160,  // ignore left/right briefly after a wall jump
  ledgeHopX: 90,        // little boost when you climb off the top of a wall
  ledgeHopY: 230,
  dashSpeed: 520,
  dashMs: 270,
  glideAccel: 1100,
  invulnMs: 1200,
};

// ---------------------------------------------------------------
// ABILITIES AND UPGRADES. You begin with one random ability; the other three
// are each guarded by a gate that needs the one before it, so your start decides your route.
// ---------------------------------------------------------------
const UPGRADES = {
  blaster:   { name: 'Blaster',          ability: true, color: 0xff7ae0, desc: 'Aim with the mouse · click or F to shoot' },
  slam:      { name: 'Piston Slam',      ability: true, color: 0xff6a5a, desc: 'Press Down in mid-air to slam · breaks bricks' },
  hop:       { name: 'Spring Joints',    ability: true, color: 0x6fe3ff, desc: 'Space / Z to hop · Space on a wall to wall jump' },
  dash:      { name: 'Thruster Burst',   ability: true, color: 0xff8a3d, desc: 'X / Shift to dash · shatters cracked rock · one dash per air time' },
  glide:     { name: 'Glider Fins',      ability: true, color: 0x9dff7a, desc: 'Hold Space / Z while falling to glide' },
  suction:   { name: 'Suction Pads',     ability: true, color: 0xc77dff, desc: 'You can now grip slick (icy) surfaces' },
  overclock: { name: 'Overclock',        color: 0xffd24a, desc: 'Run 20% faster' },
  gripgel:   { name: 'Grip Gel',         color: 0xffd24a, desc: 'Climb 40% faster' },
  magnet:    { name: 'Magnet Feet',      color: 0xffd24a, desc: 'Crawl along ceilings 50% faster' },
  knees:     { name: 'Hydraulic Knees',  color: 0xffd24a, needs: 'hop', desc: 'Hop higher' },
  airhop:    { name: 'Spare Spring',     color: 0xffd24a, needs: 'hop', desc: 'One extra hop in mid-air' },
  dashcharge:{ name: 'Twin Thrusters',   color: 0xffd24a, needs: 'dash', desc: 'Two dashes before you must land' },
  capacitor: { name: 'Quick Capacitor',  color: 0xffd24a, needs: 'dash', desc: 'Dash recharges much faster' },
  longfins:  { name: 'Long Fins',        color: 0xffd24a, needs: 'glide', desc: 'Glide falls much slower' },
  scanner:   { name: 'Scanner',          color: 0xffd24a, desc: 'Your map fills in from further away' },
  afterburner:{ name: 'Afterburner',     color: 0xffd24a, needs: 'dash', desc: 'Dashes go 35% further' },
  coil:      { name: 'Coil Springs',     color: 0xffd24a, needs: 'hop', desc: 'Wall jumps launch you harder' },
  widefins:  { name: 'Delta Wings',      color: 0xffd24a, needs: 'glide', desc: 'Glide much faster sideways' },
  rapid:     { name: 'Rapid Fire',      color: 0xffd24a, needs: 'blaster', desc: 'The blaster fires twice as fast' },
  triple:    { name: 'Triple Shot',      color: 0xffd24a, needs: 'blaster', desc: 'The blaster fires three bolts at once' },
  quake:     { name: 'Quake Plates',     color: 0xffd24a, needs: 'slam', desc: 'Slam shockwaves reach much further' },
  core:      { name: 'The Core',         color: 0xffffff, desc: 'The hand is whole again.' },
};

// four plating pickups, one template
for (const id of ['armor1', 'armor2', 'armor3', 'armor4']) UPGRADES[id] = { name: 'Plating Upgrade', color: 0xffd24a, desc: 'One more plate of armour (recharges at stations)' };

const owned = new Set();
const stat = {};
function recalc() {
  const has = (id) => owned.has(id);
  stat.speed = T.crawlSpeed * (has('overclock') ? 1.2 : 1);
  stat.climb = T.climbSpeed * (has('gripgel') ? 1.4 : 1);
  stat.ceil = T.ceilingSpeed * (has('magnet') ? 1.5 : 1);
  stat.hop = T.hopVelocity * (has('knees') ? 1.22 : 1);
  stat.airJumps = has('airhop') ? 1 : 0;
  stat.dashes = has('dashcharge') ? 2 : 1;
  stat.dashCd = has('capacitor') ? 120 : 420;
  stat.glideFall = has('longfins') ? 28 : 55;
  stat.fireCd = has('rapid') ? 0.16 : 0.34;
  stat.triple = has('triple');
  stat.quake = has('quake') ? 280 : 140;
  stat.shield = 1 + (has('armor4') ? 1 : 0) + (has('armor1') ? 1 : 0) + (has('armor2') ? 1 : 0) + (has('armor3') ? 1 : 0);
  stat.dashMs = T.dashMs * (has('afterburner') ? 1.35 : 1);
  stat.wallX = T.wallJumpX * (has('coil') ? 1.25 : 1);
  stat.wallY = T.wallJumpY * (has('coil') ? 1.12 : 1);
  stat.glideSpeed = T.crawlSpeed * (has('widefins') ? 1.7 : 1);
  stat.scan = has('scanner') ? 8 : 5;
}

// ---------------------------------------------------------------
// WORLD (game coordinates: x right, y DOWN, in pixels). The tiles live in world.js
// ---------------------------------------------------------------
const WORLD_W = COLS * TILE;
const WORLD_H = ROWS * TILE;
const HAND_SCALE = 1.4;              // overall size of the hand model
const PLAYER_W = 30 * HAND_SCALE;    // hitbox
const PLAYER_H = 20 * HAND_SCALE;
const SPAWN = { x: (SPAWN_TILE.c + 0.5) * TILE, y: (SPAWN_TILE.r + 1) * TILE - PLAYER_H / 2 - 0.5 };
const BLOCK_DEPTH = 90;
const CAM_DIST = 460 * (Number(new URLSearchParams(location.search).get('zoom')) || 1); // ?zoom=0.3 for a close-up

// ---------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const toY = (y) => -y; // game y (down) -> three.js y (up)

// ---------------------------------------------------------------
// RENDERER, SCENE, CAMERA, LIGHTS
// ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
const LOW = new URLSearchParams(location.search).get('quality') === 'low'; // ?quality=low for slower graphics cards
renderer.setPixelRatio(LOW ? 1 : Math.min(window.devicePixelRatio, 1.75)); // the bloom buffers are 16-bit, so a full 2x retina canvas can need over 1GB of GPU memory
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c14);
scene.fog = new THREE.Fog(0x0a0c14, 700, 1500);
// a soft studio environment gives the metal on the hand, drones and ice something to reflect
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 4000);

// bloom makes everything bright (crystals, pickups, sparks, eyes) glow
const composer = new EffectComposer(renderer);
composer.renderTarget1.samples = composer.renderTarget2.samples = LOW ? 0 : 4;
composer.addPass(new RenderPass(scene, camera));
// The hand is drawn a second time on top of the level (layer 1, depth cleared) so tight tunnels can never hide it behind rock.
const overlayCam = camera.clone();
overlayCam.layers.set(1);
const overlay = new RenderPass(scene, overlayCam);
overlay.clear = false;
overlay.clearDepth = true;
const overlayRender = overlay.render.bind(overlay);
overlay.render = (...args) => { // a scene background would repaint the whole screen, wiping the level
  const bg = scene.background;
  scene.background = null;
  overlayRender(...args);
  scene.background = bg;
};
composer.addPass(overlay);
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.7, 0.9));
composer.addPass(new OutputPass());
// final grade in display space: a touch of colour, gentle contrast, fringing at the edges, film grain and a vignette
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * 0.012;
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.12);
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.4);
      c += (hash(vUv * 900.0 + fract(time)) - 0.5) * 0.022;
      c *= 1.0 - r2 * 0.45;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
grade.enabled = !LOW;
composer.addPass(grade);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  overlayCam.aspect = camera.aspect;
  overlayCam.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

const hemi = new THREE.HemisphereLight(0x9fb2f0, 0x1c1828, 0.8);
hemi.layers.enable(1);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff0dc, 1.7);
sun.castShadow = true;
sun.layers.enable(1);
sun.shadow.mapSize.set(LOW ? 1024 : 3072, LOW ? 1024 : 3072);
sun.shadow.camera.left = -500;
sun.shadow.camera.right = 500;
sun.shadow.camera.top = 400;
sun.shadow.camera.bottom = -400;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 1600;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

const particles = makeParticles(scene);

// ---------------------------------------------------------------
// LEVEL MESHES (rock, ice, spikes, cracked walls, back wall, crystals: see scenery.js)
// ---------------------------------------------------------------
const scenery = buildScenery(scene, BLOCK_DEPTH);
const crackMeshes = scenery.crackMeshes;

// hint text painted on the back wall
function makeLabel(text) {
  const lines = text.split('\n');
  const fs = 28;
  const pad = 8;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${fs}px monospace`;
  canvas.width = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2);
  canvas.height = Math.ceil(lines.length * fs * 1.3 + pad * 2);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = '#b4c0e4';
  ctx.shadowColor = '#6fa8ff';
  ctx.shadowBlur = 8;
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, pad, pad + i * fs * 1.3));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const w = canvas.width / 2;
  const h = canvas.height / 2;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8 }),
  );
  return { mesh, w, h };
}
HINTS.forEach(([c, r, text]) => {
  const { mesh, w, h } = makeLabel(text);
  mesh.position.set(c * TILE + w / 2, toY(r * TILE + h / 2), -BLOCK_DEPTH / 2 - 18);
  scene.add(mesh);
});

// ---------------------------------------------------------------
// THE HAND (built from simple shapes so it can bend its fingers)
// ---------------------------------------------------------------
// Finger layout, based on the real crawling robot hand from ETH Zurich: it stands on
// all five fingertips (thumb included), palm lifted off the ground and resting at a
// lopsided tilt, walking fingers-first. Knuckle = [forward, up, side] on the palm,
// splay = how far the finger points outward, lengths = [base, middle, tip] bones.
const FINGERS = [
  { knuckle: [10, -1, 5.6], splay: -0.28, lengths: [7, 5.5, 4.5], width: 3.0 },  // index
  { knuckle: [10.6, -1, 1.9], splay: -0.08, lengths: [7.6, 6, 4.8], width: 3.1 }, // middle
  { knuckle: [10, -1, -1.9], splay: 0.1, lengths: [7, 5.5, 4.5], width: 3.0 },    // ring
  { knuckle: [9, -1, -5.6], splay: 0.32, lengths: [6, 4.8, 4], width: 2.7 },     // pinky
  { knuckle: [4, -2.2, 10.8], splay: -0.35, lengths: [7, 5.5, 4.8], width: 3.3 },   // thumb (steps forward like the others)
];
const DIP_BEND = -0.35;   // fingertip joint curls down a bit
const GROUND = -10;       // where the fingertips touch, in hand space
const GAIT = {
  strideHalf: 4.5,        // how far a finger reaches forward when it steps
  maxBack: 7.5,           // furthest a planted finger can trail behind
  lift: 3.5,              // how high a stepping finger lifts
};

// a little circuit board for the back of the hand: glowing traces, pads and chips
function makeCircuitTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#0a1e22';
  g.fillRect(0, 0, S, S);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let i = 0; i < 26; i++) {
    let x = Math.floor(Math.random() * 16) * 16 + 8, y = Math.floor(Math.random() * 16) * 16 + 8;
    g.strokeStyle = Math.random() > 0.2 ? '#2fe0d0' : '#ffd24a';
    g.lineWidth = 2;
    g.globalAlpha = 0.55 + Math.random() * 0.4;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      if (Math.random() > 0.5) x += (Math.random() > 0.5 ? 1 : -1) * (16 + Math.random() * 48);
      else y += (Math.random() > 0.5 ? 1 : -1) * (16 + Math.random() * 48);
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = g.strokeStyle;
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  for (const [x, y, w, h] of [[40, 50, 56, 40], [150, 140, 70, 56], [60, 170, 40, 34]]) {
    g.fillStyle = '#05090b';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#2fe0d0';
    g.lineWidth = 1.5;
    g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    g.fillStyle = '#c8d2d8';
    for (let p = 6; p < w - 4; p += 9) { g.fillRect(x + p, y - 5, 3, 5); g.fillRect(x + p, y + h, 3, 5); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildHand() {
  const M = (color, rough, metal, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const shell = M(0x2f343f, 0.35, 0.6);
  const plate = M(0x4a5262, 0.3, 0.65);
  const black = M(0x1a1d24, 0.5, 0.45);
  const steel = M(0xaab2c0, 0.22, 0.95);
  const yellow = M(0xf2c218, 0.45, 0.25);
  const rubber = M(0x15171c, 0.95, 0);
  const dark = M(0x0e1014, 0.8, 0.1);
  const red = M(0xe0443a, 0.6, 0.1);
  const blue = M(0x4aa8ff, 0.6, 0.1);
  const green = M(0x6fe06a, 0.6, 0.1);
  const cyan = new THREE.MeshBasicMaterial({ color: 0x59e7ff });
  const led = new THREE.MeshBasicMaterial({ color: 0xff4a3a });
  const circuit = makeCircuitTexture();
  const board = M(0xffffff, 0.5, 0.2, { map: circuit, emissiveMap: circuit, emissive: 0xffffff, emissiveIntensity: 0.9 });

  const root = new THREE.Group(); // follows the player
  const pose = new THREE.Group(); // rotates onto walls and ceilings
  const face = new THREE.Group(); // turns left / right
  root.add(pose);
  pose.add(face);

  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const cache = new Map();
  const shared = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
  const rbox = (w, h, d, r, seg = 2) => shared(`r${w}_${h}_${d}_${r}`, () => new RoundedBoxGeometry(w, h, d, seg, r));
  // a finger bone hangs down from its top, so it rotates like a finger bone: armoured body, side plates, yellow band
  const bone = (parent, len, w, piston) => {
    add(parent, shared(`b${len}_${w}`, () => rbox(w, len, w, w * 0.28).clone().translate(0, -len / 2, 0)), shell);
    for (const s of [1, -1]) add(parent, rbox(w * 0.62, len * 0.66, 0.35, 0.12, 1), plate, 0, -len * 0.5, s * w * 0.5);
    add(parent, rbox(w * 1.04, 0.7, w * 1.04, 0.25, 1), yellow, 0, -len * 0.16, 0);
    if (piston) { // a hydraulic ram along the back of the bone
      add(parent, shared(`ps${len}`, () => new THREE.CylinderGeometry(0.55, 0.55, len * 0.42, 8)), black, -w * 0.78, -len * 0.3, 0);
      add(parent, shared(`pr${len}`, () => new THREE.CylinderGeometry(0.28, 0.28, len * 0.5, 6)), steel, -w * 0.78, -len * 0.62, 0);
    }
  };
  // a joint hub: steel barrel on the bend axis with a dark axle cap
  const hub = (parent, w) => {
    add(parent, shared(`h${w}`, () => new THREE.CylinderGeometry(w * 0.55, w * 0.55, w * 1.1, 14).rotateX(Math.PI / 2)), steel);
    add(parent, shared(`hc${w}`, () => new THREE.CylinderGeometry(w * 0.26, w * 0.26, w * 1.28, 8).rotateX(Math.PI / 2)), dark);
  };

  // back of the hand: lifted up, tilted down toward the pinky side
  const palm = new THREE.Group();
  palm.position.set(0, 4, 0);
  palm.rotation.x = -0.2;
  palm.rotation.z = -0.38; // wrist end raised up, knuckles down toward the ground
  face.add(palm);
  add(palm, rbox(17, 5, 19, 1.1, 3), shell);
  add(palm, rbox(12.6, 1, 12.6, 0.4, 1), plate, -1, 3, 0);
  const pcb = add(palm, new THREE.PlaneGeometry(10.8, 10.8), board, -1, 3.55, 0);
  pcb.rotation.x = -Math.PI / 2;
  pcb.castShadow = false;
  for (const [x, z] of [[-6.5, -5.4], [-6.5, 5.4], [4.5, -5.4], [4.5, 5.4]]) add(palm, new THREE.CylinderGeometry(0.55, 0.55, 0.5, 8), steel, x, 3.6, z);
  for (const s of [1, -1]) {
    add(palm, rbox(13, 0.9, 0.4, 0.15, 1), yellow, -0.5, 1.2, s * 9.6);   // side stripe
    add(palm, rbox(7, 0.4, 0.4, 0.15, 1), cyan, 2.5, -0.6, s * 9.6).castShadow = false;   // light strip
  }
  add(palm, rbox(0.8, 0.7, 13, 0.25, 1), black, 6.4, 2.8, 0);   // ribs at the knuckle end
  add(palm, rbox(0.8, 0.7, 13, 0.25, 1), black, 7.6, 2.5, 0);
  add(palm, rbox(2.8, 3.8, 17, 0.9, 2), plate, 9.1, -0.2, 0);   // knuckle guard the fingers hang from
  add(palm, rbox(6.4, 4.4, 4.8, 1, 2), shell, 4.2, -1.2, 9.7);  // thumb mount
  const warn = add(palm, new THREE.SphereGeometry(0.65, 8, 6), led, -6.5, 3.6, 6.4);
  warn.castShadow = false;

  // broken wrist: grey joint ring, ribbed yellow arm, jagged break, loose wires, spark
  const wrist = new THREE.Group();
  wrist.position.set(-8.5, 1.5, 0);
  wrist.rotation.z = -0.25;
  palm.add(wrist);
  const alongX = (geo) => geo.rotateZ(Math.PI / 2);
  add(wrist, alongX(new THREE.CylinderGeometry(4.6, 4.6, 3, 20)), steel, -1.5);
  add(wrist, alongX(new THREE.CylinderGeometry(5.2, 5.2, 7, 20)), yellow, -6.5);
  for (const x of [-4.3, -6.5, -8.7]) add(wrist, new THREE.TorusGeometry(5.25, 0.38, 6, 22).rotateY(Math.PI / 2), black, x);
  add(wrist, alongX(new THREE.CylinderGeometry(4.5, 4.5, 0.6, 20)), dark, -10.2);
  for (let k = 0; k < 7; k++) { // jagged shards around the torn edge
    const a = (k / 7) * Math.PI * 2 + 0.3;
    const sh = add(wrist, new THREE.BoxGeometry(2.6 + Math.random() * 2, 0.7, 1.4), yellow, -10.3 - Math.random() * 1.2, Math.cos(a) * 5, Math.sin(a) * 5);
    sh.rotation.set(Math.random() * 0.6, Math.random() * 0.6 - 0.3, a + Math.PI / 2 + (Math.random() - 0.5) * 0.7);
  }
  [[red, 1.2, 1.5, 2.5, 3.5], [blue, -0.8, -1.3, -2.2, -3.4], [green, 0.4, -2.4, -1.2, -2]].forEach(([mat, y0, z0, droop, reach], i) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-10.2, y0, z0),
      new THREE.Vector3(-12.5, y0 + 1.2, z0 + reach * 0.2),
      new THREE.Vector3(-14.6, y0 - 0.4, z0 + reach * 0.35),
      new THREE.Vector3(-15.8 - i * 0.5, y0 - 1.5 - Math.abs(droop) * 0.4, z0 + reach * 0.5),
    ]);
    add(wrist, new THREE.TubeGeometry(curve, 16, 0.38, 6), mat);
  });
  const spark = add(wrist, new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe08a }), -15.6, -0.4, 2.2);
  spark.castShadow = false;

  // fingers: knuckle -> base bone -> middle joint -> middle bone -> tip joint -> tip bone
  root.updateMatrixWorld(true);
  const fingers = FINGERS.map((cfg, i) => {
    const [L1, Lm, Ld] = cfg.lengths;
    const w = cfg.width;

    const knuckle = new THREE.Group();
    knuckle.position.set(...cfg.knuckle);
    knuckle.rotation.y = cfg.splay;
    palm.add(knuckle);
    hub(knuckle, w * 1.05);

    const prox = new THREE.Group();
    knuckle.add(prox);
    bone(prox, L1, w, true);

    const pip = new THREE.Group();
    pip.position.y = -L1;
    prox.add(pip);
    hub(pip, w * 0.95);
    bone(pip, Lm, w * 0.92, false);

    const dip = new THREE.Group();
    dip.position.y = -Lm;
    dip.rotation.z = DIP_BEND;
    pip.add(dip);
    hub(dip, w * 0.85);
    bone(dip, Ld, w * 0.84, false);
    // rubber fingertip
    add(dip, new THREE.SphereGeometry(w * 0.52, 12, 10), rubber, 0, -Ld, 0).scale.set(1, 1.15, 1);
    add(dip, new THREE.TorusGeometry(w * 0.46, 0.28, 6, 14).rotateX(Math.PI / 2), yellow, 0, -Ld + w * 0.42, 0);

    // the middle + tip bones act as one bent link for the leg solver
    const ex = Math.sin(DIP_BEND) * Ld;
    const ey = Lm + Math.cos(DIP_BEND) * Ld;
    const L2 = Math.hypot(ex, ey);
    const bendOffset = Math.atan2(ex, ey);

    // where this fingertip rests when standing: out along the finger's own direction
    root.updateMatrixWorld(true);
    const k = face.worldToLocal(knuckle.getWorldPosition(new THREE.Vector3()));
    const dirW = new THREE.Vector3(1, 0, 0).transformDirection(knuckle.matrixWorld);
    const dir = dirW.clone().transformDirection(face.matrixWorld.clone().invert());
    dir.y = 0;
    dir.normalize();
    const reach = 0.7 * (L1 + L2);
    const drop = k.y - GROUND;
    const horiz = Math.sqrt(Math.max(1, reach * reach - drop * drop));
    const home = new THREE.Vector3(k.x + dir.x * horiz, GROUND, k.z + dir.z * horiz);

    return {
      knuckle, prox, pip, L1, L2, bendOffset, home,
      offset: 0, lift: 0, swing: null, order: i,
    };
  });

  // the hand lights up the cave a little around itself
  const glow = new THREE.PointLight(0xbfe4ff, 900, 260, 2);
  glow.position.set(0, 16, 30);
  root.add(glow);

  return { root, pose, face, palm, fingers, spark, warn, led };
}

// Two-bone leg solver: bends a finger so its tip lands on a target point.
// Angles: 0 = pointing straight down, positive = swinging forward.
const _w = new THREE.Vector3();
function solveFinger(f, targetFace, face) {
  _w.copy(targetFace);
  face.localToWorld(_w);
  f.knuckle.worldToLocal(_w);
  const tx = _w.x;
  const ty = _w.y;
  const d = clamp(Math.hypot(tx, ty), Math.abs(f.L1 - f.L2) + 0.01, f.L1 + f.L2 - 0.01);
  const toTarget = Math.atan2(tx, -ty);
  const a = Math.acos(clamp((f.L1 * f.L1 + d * d - f.L2 * f.L2) / (2 * f.L1 * d), -1, 1));
  const phi1 = toTarget + a; // knuckle arches up, like a spider leg
  const jx = Math.sin(phi1) * f.L1;
  const jy = -Math.cos(phi1) * f.L1;
  const phi2 = Math.atan2(tx - jx, -(ty - jy));
  f.prox.rotation.z = phi1;
  f.pip.rotation.z = phi2 - phi1 - f.bendOffset;
}

const hand = buildHand();
hand.root.scale.setScalar(HAND_SCALE);
hand.root.updateMatrixWorld(true);
hand.root.traverse((o) => o.layers.enable(1)); // also drawn in the overlay pass
scene.add(hand.root);

// ---------------------------------------------------------------
// ITEMS, CHECKPOINT STATIONS AND DRONES
// ---------------------------------------------------------------
const tileCenter = (c, r) => [(c + 0.5) * TILE, (r + 0.5) * TILE];

// you start with no abilities; ?start=dash etc. is only for testing
const ABILITY_IDS = ['hop', 'dash', 'glide', 'suction', 'blaster', 'slam'];
const forced = import.meta.env.DEV ? new URLSearchParams(location.search).get('start') : null; // dev only: ?start=dash
const startAbility = ABILITY_IDS.includes(forced) ? forced : null; // normally you start with nothing but one plate of armour
if (startAbility) owned.add(startAbility);
recalc();

const items = [];
ITEMS.forEach(([id, c, r]) => {
  if (id === startAbility) return; // you already have it, so its shrine stays empty
  const info = UPGRADES[id];
  const { group, model, anim } = buildPickup(id, info.color, info.ability);
  const [x, y] = tileCenter(c, r);
  group.position.set(x, toY(y), 0);
  scene.add(group);
  items.push({ id, c, r, x, y, group, model, anim, taken: false });
});

const stations = CHECKPOINTS.map(([c, r]) => {
  const st = buildStation();
  const x = (c + 0.5) * TILE;
  st.g.position.set(x, toY((r + 1) * TILE), -10);
  scene.add(st.g);
  st.x = x;
  st.y = (r + 1) * TILE - PLAYER_H / 2 - 0.5;
  return st;
});

const drones = FLOATERS.map(([c, r, axis, amp, speed]) => {
  const fx = buildDrone();
  scene.add(fx.g);
  const [bx, by] = tileCenter(c, r);
  return { g: fx.g, fx, bx, by, axis, amp: amp * TILE, speed, x: bx, y: by, vx: 0, deadUntil: 0 };
});

// ---------------------------------------------------------------
// INPUT
// ---------------------------------------------------------------
const held = new Set();
const pressed = new Set();
const released = new Set();
window.addEventListener('pointerdown', () => audio.start());
window.addEventListener('keydown', (e) => {
  audio.start(); // browsers only allow sound after a key press or click
  if (!held.has(e.code)) pressed.add(e.code);
  held.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  held.delete(e.code);
  released.add(e.code);
});
const isHeld = (...codes) => codes.some((c) => held.has(c));
const justDown = (...codes) => codes.some((c) => pressed.has(c));
const justUp = (...codes) => codes.some((c) => released.has(c));

// ---------------------------------------------------------------
// PHYSICS (tile collisions in the 2D gameplay plane)
// ---------------------------------------------------------------
const body = {
  x: SPAWN.x, y: SPAWN.y, w: PLAYER_W, h: PLAYER_H,
  vx: 0, vy: 0, ax: 0, dragX: T.groundDrag, allowGravity: true,
  maxSpeed: T.crawlSpeed, maxFall: T.maxFall,
  blocked: { up: false, down: false, left: false, right: false },
  // what we pressed against this frame: null = nothing, true = only slick, false = some plain rock
  touch: { up: null, left: null, right: null },
};

const EPS = 0.01;
let dashing = false, slamming = false; // set by updateGame, read by the collision code so a dash can break cracked rock
const sim = { active: false, broken: [] }; // the playtest bot (bot.js) steps the physics headlessly through this

// the whole connected cracked wall shatters at once
function breakCrack(c, r) {
  const kind = tileAt(c, r);
  const todo = [[c, r]];
  while (todo.length) {
    const [x, y] = todo.pop();
    if (tileAt(x, y) !== kind) continue;
    grid[y * COLS + x] = AIR;
    todo.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    if (sim.active) { sim.broken.push((y * COLS + x) * 8 + kind); continue; } // index and tile kind, so restore can put it back
    particles.burst((x + 0.5) * TILE, (y + 0.5) * TILE, 0xffa04a, 7, 170, 0.9, 520);
    particles.burst((x + 0.5) * TILE, (y + 0.5) * TILE, 0xb08a58, 4, 120, 0.9, 520);
    const mesh = crackMeshes.get(y * COLS + x);
    if (mesh) { scene.remove(mesh); crackMeshes.delete(y * COLS + x); }
  }
  if (sim.active) return;
  shake = 0.35;
  mapDirty = true;
  audio.sfx('crack');
  showMessage(kind === BRICK ? 'The bricks give way' : 'The wall shatters');
}

// resolve the body against solid tiles on one axis
function collide(b, axis) {
  const c0 = Math.floor((b.x - b.w / 2 + EPS) / TILE), c1 = Math.floor((b.x + b.w / 2 - EPS) / TILE);
  const r0 = Math.floor((b.y - b.h / 2 + EPS) / TILE), r1 = Math.floor((b.y + b.h / 2 - EPS) / TILE);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const t = tileAt(c, r);
      if (t === AIR || t === SPIKE) continue;
      if (t === CRACK && dashing) { breakCrack(c, r); continue; }
      if (t === BRICK && slamming && axis === 'y' && b.vy > 0) { breakCrack(c, r); continue; }
      const slickTile = t === SLICK;
      const note = (side) => { b.touch[side] = b.touch[side] === null ? slickTile : b.touch[side] && slickTile; };
      if (axis === 'x') {
        // several tiles can overlap: take the nearest edge (min going right/down, max going left/up), not the last tile scanned
        if (b.vx > 0) { b.x = Math.min(b.x, c * TILE - b.w / 2); b.blocked.right = true; note('right'); }
        else if (b.vx < 0) { b.x = Math.max(b.x, (c + 1) * TILE + b.w / 2); b.blocked.left = true; note('left'); }
      } else if (b.vy > 0) {
        b.y = Math.min(b.y, r * TILE - b.h / 2); b.blocked.down = true;
      } else if (b.vy < 0) {
        b.y = Math.max(b.y, (r + 1) * TILE + b.h / 2); b.blocked.up = true; note('up');
      }
    }
  }
  if (axis === 'x') { if (b.blocked.left || b.blocked.right) b.vx = 0; }
  else if (b.blocked.up || b.blocked.down) b.vy = 0;
}

function physicsStep(b, dt) {
  if (b.ax !== 0) {
    b.vx += b.ax * dt;
  } else if (b.dragX > 0) {
    const d = b.dragX * dt;
    b.vx = Math.abs(b.vx) <= d ? 0 : b.vx - Math.sign(b.vx) * d;
  }
  if (b.allowGravity) b.vy += T.gravity * dt;
  b.vx = clamp(b.vx, -b.maxSpeed, b.maxSpeed);
  b.vy = clamp(b.vy, -T.maxFall, b.maxFall);

  b.blocked = { up: false, down: false, left: false, right: false };
  b.touch = { up: null, left: null, right: null };

  b.x += b.vx * dt;
  collide(b, 'x');
  b.x = clamp(b.x, b.w / 2, WORLD_W - b.w / 2);

  b.y += b.vy * dt;
  collide(b, 'y');
  b.y = clamp(b.y, b.h / 2, WORLD_H - b.h / 2);
}

// spikes only hurt on their lower part, so brushing the tip of a tile is forgiving
function touchingSpike(b) {
  const c0 = Math.floor((b.x - b.w / 2) / TILE), c1 = Math.floor((b.x + b.w / 2) / TILE);
  const r0 = Math.floor((b.y - b.h / 2) / TILE), r1 = Math.floor((b.y + b.h / 2) / TILE);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (tileAt(c, r) !== SPIKE) continue;
      if (b.y + b.h / 2 - 4 > r * TILE + TILE * 0.4 && b.x + b.w / 2 - 4 > c * TILE && b.x - b.w / 2 + 4 < (c + 1) * TILE) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------
// MOVEMENT STATES
// ---------------------------------------------------------------
const game = {
  state: 'ground',  // 'ground' | 'air' | 'grip' | 'ceiling'
  gripDir: 0,       // 1 = wall on the right, -1 = wall on the left
  facing: 1,
  climbSign: 1,     // 1 = last climbed up, -1 = last climbed down
  lastGrounded: -Infinity,
  jumpBufferedAt: -Infinity,
  lockUntil: 0,
  dashUntil: 0, dashDir: 1, dashesLeft: 1, dashReadyAt: 0,
  airJumps: 0,
  checkpoint: stations[0],
  shields: stat.shield, invulnUntil: 0,
  dead: false, deaths: 0, won: false,
  startedAt: performance.now(),
};
stations.forEach((st) => setStation(st, false));
setStation(stations[0], true);
let shake = 0;
let mapDirty = true;

// combat (blaster, enemies, bosses) lives in combat.js
const combat = createCombat({
  scene, camera, body, game, owned, stat, items, drones, particles, audio, showMessage, hurt, isHeld,
  get dashing() { return dashing; },
  get mapOpen() { return mapOpen; },
  shake: (v) => { shake = v; },
  markMap: () => { mapDirty = true; },
});

function endSlam(time) {
  game.slamming = false;
  slamming = false;
  shake = 0.35;
  audio.sfx('crack');
  particles.burst(body.x, body.y + body.h / 2, 0xffb08a, 26, 260, 0.6, 300, 0.3);
  combat.slamShock(time);
}

function releaseSurface() {
  game.slamming = false;
  game.state = 'air';
  game.gripDir = 0;
  body.allowGravity = true;
  body.dragX = T.airDrag;
}

function respawn() {
  const b = body;
  b.x = game.checkpoint.x; b.y = game.checkpoint.y; b.vx = 0; b.vy = 0;
  releaseSurface();
  game.shields = stat.shield;
  game.dashUntil = 0;
  audio.sfx('respawn');
  particles.burst(b.x, b.y, 0x6fe3ff, 24, 150, 0.7, -80);
  combat.resetBosses();
}

function die(why) {
  if (game.dead) return;
  game.dead = true;
  game.deaths++;
  audio.sfx('die');
  if (why.includes('drone')) audio.sfx('zap');
  particles.burst(body.x, body.y, 0xffe08a, 30, 260, 0.9, 400);
  particles.burst(body.x, body.y, 0x6fe3ff, 20, 180, 0.9, 400);
  fadeEl.style.opacity = 1;
  showMessage(why);
  setTimeout(() => { respawn(); game.dead = false; fadeEl.style.opacity = 0; }, 450);
}

function hurt(time, why) {
  if (time < game.invulnUntil || game.dead) return;
  if (game.shields > 0) {
    game.shields--;
    game.invulnUntil = time + T.invulnMs;
    body.vy = -200;
    shake = 0.3;
    audio.sfx('plating');
    particles.burst(body.x, body.y, 0xffd24a, 18, 220, 0.5, 300);
    showMessage('Plating absorbed the hit');
  } else {
    die(why);
  }
}

function updateGame(time) {
  const b = body;
  const has = (id) => owned.has(id);

  if (game.dead) { b.vx = 0; b.vy = 0; b.ax = 0; b.allowGravity = false; return; }
  if (justDown('KeyR')) { respawn(); game.rDownAt = time; }
  if (!isHeld('KeyR')) game.rDownAt = 0;
  else if (game.rDownAt && time - game.rDownAt > 1200) { // holding R is the way out of any trap: back to the very first station
    setStation(game.checkpoint, false);
    game.checkpoint = stations[0];
    setStation(stations[0], true);
    respawn();
    game.rDownAt = 0;
    showMessage('Back at the first station');
  }

  const left = isHeld('ArrowLeft', 'KeyA');
  const right = isHeld('ArrowRight', 'KeyD');
  const up = isHeld('ArrowUp', 'KeyW');
  const down = isHeld('ArrowDown', 'KeyS');
  const jumpDown = justDown('Space', 'KeyZ');
  const jumpUp = justUp('Space', 'KeyZ');
  const jumpHeld = isHeld('Space', 'KeyZ');

  // slick surfaces only count as something to grip once you have Suction
  const wallR = b.blocked.right && (!b.touch.right || has('suction'));
  const wallL = b.blocked.left && (!b.touch.left || has('suction'));
  const ceil = b.blocked.up && (!b.touch.up || has('suction'));

  let dir = (right ? 1 : 0) - (left ? 1 : 0);
  if (dir !== 0) game.facing = dir;

  const grounded = b.blocked.down;
  if (grounded) game.lastGrounded = time;
  if (grounded || game.state === 'grip' || game.state === 'ceiling') {
    game.dashesLeft = stat.dashes;
    game.airJumps = stat.airJumps;
  }
  if (jumpDown && has('hop')) game.jumpBufferedAt = time;
  const jumpBuffered = time - game.jumpBufferedAt <= T.bufferMs;

  // --- dash: a short burst in any direction you face, from the ground or the air ---
  if (has('dash') && justDown('KeyX', 'ShiftLeft', 'ShiftRight') && time >= game.dashUntil && time >= game.dashReadyAt &&
      game.dashesLeft > 0 && (game.state === 'ground' || game.state === 'air')) {
    game.dashDir = dir !== 0 ? dir : game.facing;
    game.facing = game.dashDir;
    game.dashUntil = time + stat.dashMs;
    game.dashReadyAt = time + stat.dashMs + stat.dashCd;
    game.dashesLeft--;
    audio.sfx('dash');
  }
  dashing = time < game.dashUntil;
  if (dashing) {
    particles.burst(b.x - game.dashDir * 18, b.y, 0xffa04a, 2, 60, 0.35);
    b.allowGravity = false;
    b.ax = 0;
    b.dragX = 0;
    b.vx = game.dashDir * T.dashSpeed;
    b.vy = 0;
    b.maxSpeed = T.dashSpeed;
    b.maxFall = T.maxFall;
    game.state = grounded ? 'ground' : 'air';
    if (game.dashDir === 1 ? b.blocked.right : b.blocked.left) game.dashUntil = 0; // hit a wall
    return;
  }

  // --- slam: press Down in mid-air to drop like a hammer; the landing is a shockwave and brick gives way ---
  if (has('slam') && !game.slamming && game.state === 'air' && !grounded && justDown('ArrowDown', 'KeyS')) { game.slamming = true; audio.sfx('dash'); }
  if (game.slamming) {
    if (grounded) endSlam(time);
    else {
      b.allowGravity = false; b.ax = 0; b.vy = 760; b.maxFall = 760; b.maxSpeed = 60;
      slamming = true;
      return;
    }
  }
  slamming = false;

  if (game.state === 'grip') {
    b.allowGravity = false;
    b.ax = 0;
    b.dragX = 0;
    b.vy = up ? -stat.climb : down ? stat.climb : 0;
    b.vx = game.gripDir * 30; // keep pressed into the wall
    if (up) game.climbSign = 1;
    if (down) game.climbSign = -1;

    const stillOnWall = game.gripDir === 1 ? wallR : wallL;

    if (up && ceil) {
      // climbed into an inside corner: flip onto the ceiling
      game.facing = -game.gripDir;
      game.state = 'ceiling';
      game.gripDir = 0;
      b.vx = 0; b.vy = -30;
    } else if (jumpBuffered) {
      const away = -game.gripDir;
      audio.sfx('walljump');
      particles.burst(b.x - away * 16, b.y, 0xc9d6ff, 8, 90, 0.4);
      releaseSurface();
      b.vx = away * stat.wallX;
      b.vy = -stat.wallY;
      game.facing = away;
      game.lockUntil = time + T.wallJumpLockMs;
      game.jumpBufferedAt = -Infinity;
    } else if (dir === -game.gripDir) {
      releaseSurface();
    } else if (!stillOnWall) {
      const ledgeDir = game.gripDir;
      releaseSurface();
      if (up) { b.vx = ledgeDir * T.ledgeHopX; b.vy = -T.ledgeHopY; game.facing = ledgeDir; }
    } else if (down && grounded) {
      releaseSurface();
    }
  } else if (game.state === 'ceiling') {
    b.allowGravity = false;
    b.ax = 0;
    b.dragX = 0;
    b.vx = dir * stat.ceil;
    b.vy = -30; // keep pressed into the ceiling

    // crawling into a wall moves you onto it (unless you're holding up to stay on the ceiling)
    const wallAhead = !up && (dir === 1 ? wallR : dir === -1 ? wallL : false);

    if (down) {
      releaseSurface();
    } else if (wallAhead) {
      game.state = 'grip';
      game.gripDir = dir;
      game.climbSign = -1;
      b.vx = 0; b.vy = 0;
    } else if (!ceil) {
      releaseSurface();
    }
  } else {
    b.allowGravity = true;
    if (time < game.lockUntil) dir = 0;

    b.ax = dir * (grounded ? T.groundAccel : T.airAccel);
    b.dragX = grounded ? T.groundDrag : T.airDrag;

    if (jumpBuffered && time - game.lastGrounded <= T.coyoteMs) {
      audio.sfx('hop');
      particles.burst(b.x, b.y + b.h / 2, 0x9fe8ff, 8, 90, 0.4, 0, 0.3);
      b.vy = -stat.hop;
      game.jumpBufferedAt = -Infinity;
      game.lastGrounded = -Infinity;
    } else if (jumpBuffered && !grounded && game.airJumps > 0) {
      audio.sfx('airhop');
      particles.burst(b.x, b.y + b.h / 2, 0x9fe8ff, 12, 120, 0.4, 0, 0.3);
      b.vy = -stat.hop;
      game.airJumps--;
      game.jumpBufferedAt = -Infinity;
    }
    if (jumpUp && b.vy < 0) b.vy *= T.hopCut;

    const wallDir = wallR ? 1 : wallL ? -1 : 0;

    if (!grounded && ceil && up) {
      game.state = 'ceiling';
      b.vx = 0; b.vy = -30;
    } else if (wallDir !== 0 && dir === wallDir && time >= game.lockUntil && (!grounded || up)) {
      game.state = 'grip';
      game.gripDir = wallDir;
      game.climbSign = 1;
      b.vx = 0; b.vy = 0;
    } else {
      game.state = grounded ? 'ground' : 'air';
    }
  }

  // --- glide: hold jump while falling ---
  const gliding = has('glide') && game.state === 'air' && jumpHeld && b.vy > 0;
  b.maxFall = gliding ? stat.glideFall : T.maxFall;
  if (gliding) b.ax = dir * T.glideAccel;
  game.gliding = gliding;
  b.maxSpeed = game.state === 'ceiling' ? Math.max(stat.speed, stat.ceil) : gliding ? Math.max(stat.speed, stat.glideSpeed) : stat.speed;
}

// hazards, pickups, stations and drones: runs after the physics step
function updateWorld(time, dt) {
  const b = body;
  if (game.dead) return;

  if (touchingSpike(b)) { die('Spiked.'); return; }

  for (const st of stations) {
    if (Math.abs(b.x - st.x) < 36 && Math.abs(b.y - st.y) < 40 && game.checkpoint !== st) {
      setStation(game.checkpoint, false);
      game.checkpoint = st;
      game.shields = stat.shield;
      setStation(st, true);
      audio.sfx('station');
      particles.burst(st.x, st.y - 20, 0x5cf08a, 26, 110, 1.1, -120);
      showMessage('Charging station\nProgress saved' + (stat.shield ? ' · plating restored' : ''));
    }
  }

  for (const it of items) {
    if (it.taken || it.locked || Math.abs(b.x - it.x) > b.w / 2 + 12 || Math.abs(b.y - it.y) > b.h / 2 + 16) continue;
    const need = UPGRADES[it.id].needs;
    if (need && !owned.has(need)) { // an upgrade for something you do not have yet stays where it is
      if (time - (it.warnedAt || -1e9) > 4000) { it.warnedAt = time; showMessage(`${UPGRADES[it.id].name}\nYou need ${UPGRADES[need].name} first`, 2500); }
      continue;
    }
    it.taken = true;
    it.group.visible = false;
    owned.add(it.id);
    recalc();
    audio.sfx(it.id === 'core' ? 'core' : UPGRADES[it.id].ability ? 'ability' : 'pickup');
    audio.setIntensity(0.3 + (0.7 * owned.size) / ITEMS.length);
    particles.burst(it.x, it.y, UPGRADES[it.id].color, 44, 200, 1.1, 120);
    particles.burst(it.x, it.y, 0xffffff, 14, 120, 0.8);
    if (stat.shield > game.shields && it.id.startsWith('armor')) game.shields++;
    mapDirty = true;
    const info = UPGRADES[it.id];
    if (it.id === 'core') {
      game.won = true;
      const secs = Math.round((time - game.startedAt) / 1000);
      showMessage(`THE CORE\nThe hand is whole again.\n${Math.floor(secs / 60)}m ${secs % 60}s · ${game.deaths} deaths · ${owned.size}/${ITEMS.length} upgrades`, 12000);
    } else {
      showMessage(`${info.name}\n${info.desc}`);
    }
  }

  combat.update(time, dt);

  for (const d of drones) {
    if (time < d.deadUntil) { d.g.visible = false; continue; }
    d.g.visible = true;
    const o = Math.sin(time * 0.001 * d.speed + d.bx) * d.amp;
    d.x = d.bx + (d.axis === 'x' ? o : 0);
    d.y = d.by + (d.axis === 'y' ? o : 0);
    d.vx = (d.x - d.g.position.x) / Math.max(dt, 0.001);
    d.g.position.set(d.x, toY(d.y), 0);
    animateDrone(d, dt, time, d.vx);
    if (Math.abs(b.x - d.x) < b.w / 2 + 11 && Math.abs(b.y - d.y) < b.h / 2 + 11) {
      if (dashing) { // dashing through a drone destroys it for a while
        d.deadUntil = time + 8000;
        shake = 0.2;
        audio.sfx('droneDie');
        particles.burst(d.x, d.y, 0xff4a4a, 34, 260, 0.9, 300);
        particles.burst(d.x, d.y, 0xffe08a, 16, 180, 0.6, 300);
      }
      else hurt(time, 'Zapped by a drone.');
    }
  }
}

// ---------------------------------------------------------------
// VISUALS
// ---------------------------------------------------------------
const hudEl = document.getElementById('hud');
const messageEl = document.getElementById('message');
const fadeEl = document.getElementById('fade');
let messageTimer = null;
// the plating bar: one little shield per plate, bright when it is still on, dark once it has been knocked off
const platingEl = document.getElementById('plating');
let platingKey = '';
function setPlating(have, max) {
  const key = `${have}/${max}`;
  if (key === platingKey) return;
  platingKey = key;
  platingEl.innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < have ? 'on' : ''}"></i>`).join('');
}
function showMessage(text, ms = 3500) {
  messageEl.textContent = text;
  messageEl.style.opacity = 1;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { messageEl.style.opacity = 0; }, ms);
}

const _target = new THREE.Vector3();

function updateHand(dt, time) {
  const b = body;
  let poseTarget = 0;
  let faceSign = game.facing;
  let ox = 0;

  if (game.state === 'grip') {
    poseTarget = game.gripDir === 1 ? Math.PI / 2 : -Math.PI / 2;
    faceSign = game.gripDir * game.climbSign;
    ox = game.gripDir * 5 * HAND_SCALE; // fingertips reach the wall
  } else if (game.state === 'ceiling') {
    poseTarget = Math.PI;
    faceSign = -game.facing;
  } else if (game.state === 'air') {
    poseTarget = clamp(-b.vx * 0.0015, -0.2, 0.2);
  }

  const k = 1 - Math.pow(0.0001, dt); // smoothing
  hand.pose.rotation.z = lerpAngle(hand.pose.rotation.z, poseTarget, k);
  // turned a bit toward the camera so you can see the fingers and thumb
  hand.face.rotation.y = lerpAngle(hand.face.rotation.y, faceSign === 1 ? -0.55 : Math.PI + 0.55, k);
  hand.root.position.set(b.x + ox, toY(b.y), 0);

  // --- walking: planted fingertips stay put while the hand moves over them ---
  const onSurface = game.state !== 'air';
  const surfaceSpeed = game.state === 'grip' ? Math.abs(b.vy) : onSurface ? Math.abs(b.vx) : 0;
  const speed = surfaceSpeed / HAND_SCALE; // in hand units per second
  const walking = speed > 2;
  const ease = (rate) => Math.min(1, dt * rate);

  let stepping = 0;
  let planted = 0;
  for (const f of hand.fingers) {
    if (!onSurface) {
      // in the air: fingers pull in and curl up a little
      f.swing = null;
      f.offset += (0 - f.offset) * ease(10);
      f.lift += (4 - f.lift) * ease(10);
      continue;
    }
    if (f.swing) {
      f.swing.t = Math.min(1, f.swing.t + dt / f.swing.dur);
      const t = f.swing.t;
      f.offset = f.swing.from + (f.swing.to - f.swing.from) * t;
      f.lift = Math.sin(Math.PI * t) * GAIT.lift;
      if (t >= 1) { f.swing = null; f.lift = 0; planted++; }
      else stepping++;
    } else {
      f.offset = Math.max(-GAIT.maxBack, f.offset - speed * dt);
      f.lift += (0 - f.lift) * ease(20);
    }
  }

  if (onSurface) {
    // pick which finger steps next: the one trailing furthest behind
    const ready = hand.fingers
      .filter((f) => !f.swing && (walking ? f.offset < -GAIT.strideHalf : Math.abs(f.offset) > 1.2))
      .sort((a, c) => a.offset - c.offset);
    for (const f of ready) {
      const limit = !walking ? 1 : f.offset <= -GAIT.maxBack + 0.1 ? 3 : 2;
      if (stepping >= limit) break;
      const to = walking ? GAIT.strideHalf : 0;
      const dur = walking ? clamp((to - f.offset) / (speed * 2.5), 0.07, 0.2) : 0.15;
      f.swing = { from: f.offset, to, t: 0, dur };
      stepping++;
    }
  }

  // body dips a little while fingers are stepping, and gently breathes when still
  hand.palm.position.y = 4 - 0.5 * stepping + Math.sin(time * 0.002) * 0.25;
  hand.palm.rotation.x = -0.2 + (walking ? Math.sin(time * 0.02) * 0.04 : 0);

  hand.root.updateMatrixWorld(true);
  for (const f of hand.fingers) {
    _target.copy(f.home);
    _target.x += f.offset;
    _target.y += f.lift;
    solveFinger(f, _target, hand.face);
  }

  if (planted && walking) audio.sfx('tap', game.state, Math.min(1, speed / 90));

  // flickering spark from the broken wrist, with the odd real spark flying off it
  hand.spark.visible = Math.random() > 0.55;
  hand.spark.scale.setScalar(0.6 + Math.random() * 0.8);
  if (Math.random() < 0.06) {
    hand.spark.getWorldPosition(_target);
    particles.burst(_target.x, -_target.y, 0xffe08a, 3, 70, 0.5, 260);
  }
  hand.led.color.setHex(Math.sin(time * 0.006) > 0.2 ? 0xff4a3a : 0x3a0f0c);
}

let camDist = CAM_DIST;
const camTarget = new THREE.Vector3(SPAWN.x, toY(SPAWN.y), 0);
const camGoal = new THREE.Vector3();

function updateCamera(dt) {
  camDist += (CAM_DIST * (combat.bossActive() ? 1.55 : 1) - camDist) * Math.min(1, dt * 2);
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camDist;
  const halfW = halfH * camera.aspect;
  const gx = WORLD_W > halfW * 2 ? clamp(body.x, halfW, WORLD_W - halfW) : WORLD_W / 2;
  const gy = WORLD_H > halfH * 2 ? clamp(body.y - 20, halfH, WORLD_H - halfH) : WORLD_H / 2;
  camGoal.set(gx, toY(gy), 0);
  camTarget.lerp(camGoal, 1 - Math.pow(0.002, dt));
  shake = Math.max(0, shake - dt);
  const sx = (Math.random() - 0.5) * shake * 40, sy = (Math.random() - 0.5) * shake * 40;
  camera.position.set(camTarget.x + sx, camTarget.y + 70 + sy, camDist);
  camera.lookAt(camTarget.x + sx, camTarget.y + sy, 0);

  sun.position.set(camTarget.x - 200, camTarget.y + 450, 650);
  sun.target.position.set(camTarget.x, camTarget.y, 0);
}

const ABILITY_NAMES = { hop: 'Hop', dash: 'Dash', glide: 'Glide', suction: 'Suction', blaster: 'Blaster', slam: 'Slam' };
function updateHud() {
  const abil = ABILITY_IDS.map((id) => (owned.has(id) ? ABILITY_NAMES[id] : '—')).join(' · ');
  const passives = [...owned].filter((id) => !UPGRADES[id].ability && id !== 'core').length;
  setPlating(game.shields, stat.shield);
  const keys = ['move ← →   climb ↑ ↓'];
  if (owned.has('hop')) keys.push('hop Space/Z');
  if (owned.has('glide')) keys.push(owned.has('hop') ? 'hold Space to glide' : 'hold Space/Z to glide');
  if (owned.has('dash')) keys.push('dash X/Shift');
  if (owned.has('blaster')) keys.push('shoot click/F');
  if (owned.has('slam')) keys.push('slam ↓ in air');
  combat.syncCrosshair();
  const hudText = [
    `abilities: ${abil}`,
    `upgrades: ${owned.size - (owned.has('core') ? 1 : 0)}/${ITEMS.length - 1}  (${passives} extras)`,
    keys.join('   '),
    'M map   R back to station (hold: to the start)   N music   B sound',
  ].join('\n');
  if (hudText !== hudEl.dataset.last) { hudEl.dataset.last = hudText; hudEl.textContent = hudText; }
}

// ---------------------------------------------------------------
// MAPS: a corner minimap and a full map (M), both showing only what you have explored
// ---------------------------------------------------------------
const miniCtx = document.getElementById('mini').getContext('2d');
const bigEl = document.getElementById('bigmap');
const bigCanvas = document.getElementById('bigcanvas');
const mapInfoEl = document.getElementById('mapinfo');
let mapOpen = false;

const playerTile = () => [Math.floor(body.x / TILE), Math.floor(body.y / TILE)];
const itemsLeft = () => items.filter((i) => !i.taken && i.id !== 'core');

function drawMaps() {
  const [pc, pr] = playerTile();
  drawMap(miniCtx, pc - 16, pr - 10, 33, 20, 6, 0, 0, [pc, pr], itemsLeft());
  if (!mapOpen) return;
  const px = Math.max(3, Math.floor(Math.min((window.innerWidth * 0.92) / COLS, (window.innerHeight * 0.78) / ROWS)));
  bigCanvas.width = COLS * px;
  bigCanvas.height = ROWS * px;
  drawMap(bigCanvas.getContext('2d'), 0, 0, COLS, ROWS, px, 0, 0, [pc, pr], itemsLeft());
  mapInfoEl.textContent = `explored ${exploredPercent()}%  ·  upgrades ${owned.size - (owned.has('core') ? 1 : 0)}/${ITEMS.length - 1}  ·  ` +
    'white = you · green = stations · gold = unclaimed upgrade you have seen · M / Esc to close';
}

function toggleMap(open = !mapOpen) {
  mapOpen = open;
  bigEl.style.display = open ? 'flex' : 'none';
  mapDirty = true;
}

// ---------------------------------------------------------------
// MAIN LOOP
// ---------------------------------------------------------------
showMessage('A broken hand with one plate of armour left.\nFour abilities are scattered through these caves.\nFind them.', 7000);
let last = performance.now();
let mapTick = 0;
function frame(now) {
  document.getElementById('loading')?.remove();
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;

  if (justDown('KeyM', 'Tab')) { toggleMap(); audio.sfx('map', mapOpen); }
  if (mapOpen && justDown('Escape')) toggleMap(false);
  if (justDown('KeyN')) showMessage(audio.toggleMusic() ? 'Music on' : 'Music off', 1200);
  if (justDown('KeyB')) showMessage(audio.toggleSfx() ? 'Sound effects on' : 'Sound effects off', 1200);

  if (!mapOpen && !sim.active) {
    const wasGrounded = body.blocked.down;
    const stateBefore = game.state;
    updateGame(now);
    const vyBefore = body.vy;
    physicsStep(body, dt);
    if (body.blocked.down && !wasGrounded && vyBefore > 140) {
      audio.sfx('land', Math.min(1, vyBefore / 450));
      particles.burst(body.x, body.y + body.h / 2, 0xaab4d0, Math.round(4 + vyBefore / 60), 90 + vyBefore / 4, 0.5, 250, 0.3);
    }
    if ((game.state === 'grip' || game.state === 'ceiling') && game.state !== stateBefore) audio.sfx('grip');
    updateWorld(now, dt);
    updateHand(dt, now);

    // ambient loops: glide wind and the buzz of the nearest drone
    let near = Infinity, pan = 0;
    for (const d of drones) {
      if (now < d.deadUntil) continue;
      const dd = Math.hypot(d.x - body.x, d.y - body.y);
      if (dd < near) { near = dd; pan = (d.x - body.x) / 300; }
    }
    audio.ambient({ gliding: game.gliding && !game.dead, droneDist: near, dronePan: pan });

    const [pc, pr] = playerTile();
    if (reveal(pc, pr, stat.scan)) mapDirty = true;

    for (const it of items) {
      if (it.taken) continue;
      it.model.rotation.y = Math.sin(now * 0.0016 + it.c) * 0.9; // sways instead of spinning so flat shapes stay readable
      it.group.position.y = toY(it.y) + Math.sin(now * 0.003 + it.c) * 4;
      it.anim(now);
    }
    for (const st of stations) animateStation(st, dt, now);
    scenery.update(now, dt, camTarget.x, camTarget.y);
    particles.update(dt);

    updateCamera(dt);
    updateHud();
  }
  if (mapDirty || (++mapTick % 20 === 0 && mapOpen)) { drawMaps(); mapDirty = false; }
  overlayCam.position.copy(camera.position);
  overlayCam.quaternion.copy(camera.quaternion);
  grade.uniforms.time.value = now * 0.001;
  composer.render();

  pressed.clear();
  released.clear();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) Object.assign(sim, {
  // body.blocked / touch are replaced (never edited) by each physics step, so a shallow copy is a safe snapshot
  snap: () => ({ b: { ...body }, g: { ...game, checkpoint: null }, dashing, broken: sim.broken.slice() }),
  restore(s) {
    held.clear(); // the bot's last keys must not leak into the real game
    Object.assign(body, s.b);
    Object.assign(game, s.g, { checkpoint: game.checkpoint });
    dashing = s.dashing;
    for (const i of sim.broken) if (!s.broken.includes(i)) grid[i >> 3] = i & 7;
    for (const i of s.broken) grid[i >> 3] = AIR;
    sim.broken = s.broken.slice();
  },
  // one fixed frame with exactly these keys held (prev = keys held the frame before); true if the hand touched a spike
  step(keys, time, prev, dt = 1 / 60) {
    held.clear();
    keys.forEach((k) => { held.add(k); if (!prev.has(k)) pressed.add(k); });
    for (const k of prev) if (!keys.has(k)) released.add(k);
    updateGame(time);
    physicsStep(body, dt);
    pressed.clear();
    released.clear();
    return touchingSpike(body);
  },
  world: (time, dt = 1 / 60) => updateWorld(time, dt), // hazards, pickups and the boss, for scripted fights
});
if (import.meta.env.DEV) window.__game = { bosses: combat.bosses, enemies: combat.enemies, body, game, owned, recalc, stat, items, explored, renderer, scene, drones, stations, camTarget, sim, ABILITY_IDS }; // for poking around in the console
if (import.meta.env.DEV && new URLSearchParams(location.search).has('bot')) import('./bot.js');
