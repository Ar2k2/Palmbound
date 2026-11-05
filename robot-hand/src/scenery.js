import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, COLS, ROWS, AIR, ROCK, SLICK, SPIKE, CRACK, BRICK, tileAt, TINTS } from './world.js';
import { glowTexture, makeGlow } from './fx.js';

const toY = (y) => -y;
const isSolid = (c, r) => { const t = tileAt(c, r); return t === ROCK || t === SLICK || t === CRACK || t === BRICK; };

// one look per TINTS entry: a rock colour multiplier and the colour of the crystals / moss
const PALETTE = [
  { rock: [0.85, 0.92, 1.12], glow: 0x6fa8ff },  // start + hub
  { rock: [1.18, 0.86, 0.8],  glow: 0xff8a3d },  // dash wing: embers
  { rock: [0.82, 1.1, 0.88],  glow: 0x7dff9a },  // glide wing: mossy
  { rock: [0.8, 1.02, 1.18],  glow: 0x5ee6ff },  // suction wing: ice
  { rock: [1.02, 0.84, 1.22], glow: 0xc77dff },  // hop wing: violet
  { rock: [1.22, 1.0, 0.72],  glow: 0xffd24a },  // core: gold
  { rock: [0.85, 0.92, 1.12], glow: 0x6fa8ff },
  { rock: [1.18, 0.82, 0.92], glow: 0xff5a6e },  // citadel: crimson
  { rock: [1.2, 0.92, 0.76],  glow: 0xff9a3d },  // foundry: forge orange
  { rock: [0.82, 0.9, 1.25],  glow: 0x8a7dff },  // underworks: deep indigo
  { rock: [1.15, 1.0, 0.75],  glow: 0xffc24a },  // sprocket yard: brass
  { rock: [1.1, 0.85, 1.15],  glow: 0xff7ad8 },  // rumble pit: magenta
  { rock: [0.8, 1.1, 1.1],    glow: 0x4affd0 },  // cellar: teal
  { rock: [0.9, 1.15, 0.85],  glow: 0x9aff6a },  // hollows: lime moss
  { rock: [1.2, 1.02, 0.8],   glow: 0xffd89a },  // escape tunnel: warm, daylight ahead
];

let seed = 1234;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const range = (a, b) => a + rnd() * (b - a);

// which TINTS rectangle a tile belongs to (later ones paint over earlier ones)
function regionOf(c, r) {
  for (let i = TINTS.length - 1; i >= 0; i--) {
    const [c0, r0, c1, r1] = TINTS[i];
    if (c >= c0 && c < c1 && r >= r0 && r < r1) return i;
  }
  return 0;
}

// Colour fields: per-tile values blurred together so regions fade into each other instead of cutting hard.
function blurField(src, radius) {
  let a = src;
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(a.length);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        for (let k = 0; k < 3; k++) {
          let sum = 0, n = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const x = c + dx, y = r + dy;
              if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
              sum += a[(y * COLS + x) * 3 + k]; n++;
            }
          }
          b[(r * COLS + c) * 3 + k] = sum / n;
        }
      }
    }
    a = b;
  }
  return a;
}

const regionGrid = new Uint8Array(COLS * ROWS);
const rockRaw = new Float32Array(COLS * ROWS * 3);
const tintRaw = new Float32Array(COLS * ROWS * 3);
const tmpCol = new THREE.Color();
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const i = regionOf(c, r);
    regionGrid[r * COLS + c] = i;
    rockRaw.set(PALETTE[i].rock, (r * COLS + c) * 3);
    tmpCol.set(TINTS[i][4]);
    tintRaw.set([tmpCol.r, tmpCol.g, tmpCol.b], (r * COLS + c) * 3);
  }
}
const rockField = blurField(rockRaw, 3);
const tintField = blurField(tintRaw, 3);

// How far each tile is from open air (0 = air). Rock deep inside a mass is shaded darker and rock at a cave edge catches the
// light, so tunnels read as lit hollows instead of one flat slab.
const airDist = new Uint8Array(COLS * ROWS).fill(255);
{
  const queue = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const t = tileAt(i % COLS, Math.floor(i / COLS));
    if (t === AIR || t === SPIKE) { airDist[i] = 0; queue.push(i); }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi], c = i % COLS, r = Math.floor(i / COLS);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c + dx, y = r + dy;
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS || airDist[y * COLS + x] !== 255) continue;
      airDist[y * COLS + x] = airDist[i] + 1;
      queue.push(y * COLS + x);
    }
  }
}
// brightness at a corner point (pixels, game y-down): the mean distance of the four tiles that meet there
function edgeLight(px, py) {
  const c = Math.floor(px / TILE), r = Math.floor(py / TILE);
  let sum = 0;
  for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
    const x = Math.min(COLS - 1, Math.max(0, c + dx)), y = Math.min(ROWS - 1, Math.max(0, r + dy));
    sum += Math.min(airDist[y * COLS + x], 6);
  }
  return 0.4 + 0.85 * Math.exp(-(sum / 4) * 0.6);
}

// bilinear sample of a field at a world position (pixels, game y-down)
function sample(field, px, py, out) {
  const fx = Math.min(COLS - 1.001, Math.max(0, px / TILE - 0.5));
  const fy = Math.min(ROWS - 1.001, Math.max(0, py / TILE - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  for (let k = 0; k < 3; k++) {
    const g = (x, y) => field[(y * COLS + x) * 3 + k];
    out[k] = (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
  }
  return out;
}

// ---------------------------------------------------------------
// TEXTURES
// ---------------------------------------------------------------
// draws a shape at four wrapped offsets so the texture tiles without seams
function wrapped(size, draw) {
  for (const ox of [0, -size]) for (const oy of [0, -size]) draw(ox, oy);
}

function makeRockTexture(base, speck, crackColor) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  // soft cloudy patches
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S, y = rnd() * S, rad = 14 + rnd() * 50;
    wrapped(S, (ox, oy) => {
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      grd.addColorStop(0, speck[i % speck.length]);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.18 + rnd() * 0.2;
      g.fillStyle = grd;
      g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    });
  }
  // grit
  for (let i = 0; i < 3200; i++) {
    const x = rnd() * S, y = rnd() * S, w = 1 + rnd() * 4, h = 1 + rnd() * 3;
    g.fillStyle = speck[i % speck.length];
    g.globalAlpha = 0.15 + rnd() * 0.4;
    wrapped(S, (ox, oy) => g.fillRect(x + ox, y + oy, w, h));
  }
  // faint strata lines
  g.strokeStyle = crackColor;
  for (let i = 0; i < 18; i++) {
    const y = rnd() * S;
    g.globalAlpha = 0.12 + rnd() * 0.12;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= S; x += 32) g.lineTo(x, y + (rnd() - 0.5) * 18);
    g.stroke();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// the cracked wall: crumbly brown rock with glowing orange fissures (separate emissive map)
function makeCrackTextures() {
  const S = 128;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const a = mk(), e = mk();
  const g = a.getContext('2d'), h = e.getContext('2d');
  g.fillStyle = '#6f5436';
  g.fillRect(0, 0, S, S);
  h.fillStyle = '#000';
  h.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = ['#8a6a42', '#5a432a', '#4a3622'][i % 3];
    g.globalAlpha = 0.5;
    g.fillRect(rnd() * S, rnd() * S, 3 + rnd() * 9, 2 + rnd() * 6);
  }
  g.globalAlpha = 1;
  for (let k = 0; k < 4; k++) {
    let x = rnd() * S, y = rnd() * S;
    const path = [[x, y]];
    for (let s = 0; s < 6; s++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 50; path.push([x, y]); }
    for (const [ctx2, col, w] of [[g, '#1a0e04', 5], [h, '#ff7a1c', 3], [h, '#ffd070', 1]]) {
      ctx2.strokeStyle = col;
      ctx2.lineWidth = w;
      ctx2.lineJoin = 'round';
      ctx2.beginPath();
      path.forEach(([px, py], i) => (i ? ctx2.lineTo(px, py) : ctx2.moveTo(px, py)));
      ctx2.stroke();
    }
  }
  const map = new THREE.CanvasTexture(a);
  const emi = new THREE.CanvasTexture(e);
  map.colorSpace = emi.colorSpace = THREE.SRGBColorSpace;
  return { map, emi };
}

// ---------------------------------------------------------------
// SOLID GEOMETRY: only the faces you can actually see, coloured per region
// ---------------------------------------------------------------
function solidGeometry(types, D) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const UVS = TILE * 3; // the texture spans three tiles, continuous across neighbours
  const rc = [0, 0, 0];
  const quad = (corners, normal, uvOf, backShade = 1, tint = null) => {
    const base = pos.length / 3;
    for (const [x, y, z] of corners) {
      pos.push(x, y, z);
      nor.push(...normal);
      uv.push(...uvOf(x, y, z));
      sample(rockField, x, toY(y), rc);
      const s = (z < 0 ? backShade : 1) * edgeLight(x, toY(y));
      if (tint) col.push(rc[0] * s * 0.6 + tint.r * 0.35 * s, rc[1] * s * 0.6 + tint.g * 0.35 * s, rc[2] * s * 0.6 + tint.b * 0.35 * s);
      else col.push(rc[0] * s, rc[1] * s, rc[2] * s);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const zF = D / 2, zB = -D / 2;
  const glowOf = new THREE.Color();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!types.includes(tileAt(c, r))) continue;
      const x0 = c * TILE, x1 = x0 + TILE, yT = toY(r * TILE), yB = toY((r + 1) * TILE);
      quad([[x0, yB, zF], [x1, yB, zF], [x1, yT, zF], [x0, yT, zF]], [0, 0, 1], (x, y) => [x / UVS, y / UVS]);
      if (!isSolid(c, r - 1)) {
        quad([[x0, yT, zF], [x1, yT, zF], [x1, yT, zB], [x0, yT, zB]], [0, 1, 0], (x, y, z) => [x / UVS, z / UVS], 0.5, glowOf.setHex(PALETTE[regionGrid[r * COLS + c]].glow));
      }
      if (!isSolid(c, r + 1)) quad([[x0, yB, zB], [x1, yB, zB], [x1, yB, zF], [x0, yB, zF]], [0, -1, 0], (x, y, z) => [x / UVS, z / UVS], 0.4);
      if (!isSolid(c - 1, r)) quad([[x0, yB, zB], [x0, yB, zF], [x0, yT, zF], [x0, yT, zB]], [-1, 0, 0], (x, y, z) => [z / UVS, y / UVS], 0.4);
      if (!isSolid(c + 1, r)) quad([[x1, yB, zF], [x1, yB, zB], [x1, yT, zB], [x1, yT, zF]], [1, 0, 0], (x, y, z) => [z / UVS, y / UVS], 0.4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// A thin glowing trim along every rock edge that faces open air: moss, frost or ember dust depending on the region,
// so each tunnel is outlined. Plain quads with vertex colours, all in one mesh.
function trimGeometry(D) {
  const pos = [], col = [], idx = [];
  const z = D / 2 + 0.4;
  const c3 = new THREE.Color();
  const add = (x0, y0, x1, y1, zz, color, k, fade = 1) => {
    const base = pos.length / 3;
    pos.push(x0, y0, zz, x1, y0, zz, x1, y1, zz, x0, y1, zz);
    for (let i = 0; i < 4; i++) col.push(color.r * k * (i < 2 ? 1 : fade), color.g * k * (i < 2 ? 1 : fade), color.b * k * (i < 2 ? 1 : fade));
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = tileAt(c, r);
      if (t !== ROCK && t !== SLICK) continue;
      const x0 = c * TILE, x1 = x0 + TILE, yT = toY(r * TILE), yB = toY((r + 1) * TILE);
      c3.setHex(PALETTE[regionGrid[r * COLS + c]].glow);
      const ice = t === SLICK ? 1.4 : 1;
      if (!isSolid(c, r - 1)) {
        const h = 3.5 + rnd() * 3.5;
        add(x0, yT - h, x1, yT, z, c3, 0.38 * ice, 0.25);       // moss / frost lip, fading downward
      }
      if (!isSolid(c, r + 1)) add(x0, yB, x1, yB + 3, z, c3, 0.22 * ice, 0.2);
      if (!isSolid(c - 1, r)) add(x0, yB, x0 + 2.5, yT, z, c3, 0.3 * ice, 1);
      if (!isSolid(c + 1, r)) add(x1 - 2.5, yB, x1, yT, z, c3, 0.3 * ice, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------
// DECOR: crystals, stalactites, mushrooms
// ---------------------------------------------------------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);

// a cone that grows out of a surface; vertex colours run from base to tip
function spike(geos, x, y, z, radius, height, tiltZ, tiltX, baseCol, tipCol, sides = 5) {
  const g = new THREE.ConeGeometry(radius, height, sides, 1);
  g.translate(0, height / 2, 0);
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / height;
    colors[i * 3] = baseCol.r + (tipCol.r - baseCol.r) * t;
    colors[i * 3 + 1] = baseCol.g + (tipCol.g - baseCol.g) * t;
    colors[i * 3 + 2] = baseCol.b + (tipCol.b - baseCol.b) * t;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  _q.setFromEuler(_e.set(tiltX, 0, tiltZ));
  g.applyMatrix4(_m.compose(new THREE.Vector3(x, y, z), _q, _s));
  geos.push(g);
}

function buildDecor(scene) {
  seed = 777;
  const glowGeos = [], rockGeos = [], capGeos = [];
  const rockBase = new THREE.Color(), rockTip = new THREE.Color(), cb = new THREE.Color(), ct = new THREE.Color();
  const rc = [0, 0, 0];

  const crystals = (x, y, z, dirTilt, glow, big) => {
    cb.setHex(glow).multiplyScalar(0.3);
    ct.setHex(glow).multiplyScalar(1.25);
    const n = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      spike(glowGeos, x + range(-7, 7), y, z + range(-5, 5), range(1.6, 3.4) * big, range(8, 22) * big,
        dirTilt + range(-0.5, 0.5), range(-0.3, 0.3), cb, ct, 5);
    }
  };

  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (tileAt(c, r) !== AIR) continue;
      const reg = regionGrid[r * COLS + c];
      const glow = PALETTE[reg].glow;
      const cx = (c + 0.5) * TILE;
      const floor = isSolid(c, r + 1), ceil = isSolid(c, r - 1);
      const wallL = isSolid(c - 1, r), wallR = isSolid(c + 1, r);
      const mush = reg === 2;

      if (floor) {
        const yF = toY((r + 1) * TILE);
        if (rnd() < 0.3) crystals(cx, yF, range(-40, -10), 0, glow, 1);
        else if (mush && rnd() < 0.5) {
          const h = range(6, 15), rad = range(3.5, 7);
          const x = cx + range(-12, 12), z = range(-40, -8);
          const stem = new THREE.CylinderGeometry(1.1, 1.6, h, 6);
          stem.translate(x, yF + h / 2, z);
          const sc = new THREE.Color(0xd9f7e0);
          stem.setAttribute('color', new THREE.BufferAttribute(new Float32Array(stem.attributes.position.count * 3).map((_, i) => [sc.r, sc.g, sc.b][i % 3] * 0.8), 3));
          capGeos.push(stem);
          const cap = new THREE.SphereGeometry(rad, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
          cap.translate(x, yF + h, z);
          const cc = new THREE.Color(glow).multiplyScalar(1.5);
          cap.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap.attributes.position.count * 3).map((_, i) => [cc.r, cc.g, cc.b][i % 3]), 3));
          capGeos.push(cap);
        } else if (rnd() < 0.12) {
          sample(rockField, cx, (r + 1) * TILE, rc);
          rockBase.setRGB(rc[0] * 0.03, rc[1] * 0.03, rc[2] * 0.035);
          rockTip.setRGB(rc[0] * 0.12, rc[1] * 0.12, rc[2] * 0.14);
          spike(rockGeos, cx + range(-10, 10), yF, range(-40, -12), range(3, 7), range(14, 34), range(-0.08, 0.08), 0, rockBase, rockTip, 6);
        }
      }
      if (ceil) {
        const yC = toY(r * TILE);
        if (rnd() < 0.22) crystals(cx, yC, range(-40, -10), Math.PI, glow, 0.9);
        else if (rnd() < 0.2) {
          sample(rockField, cx, r * TILE, rc);
          rockBase.setRGB(rc[0] * 0.03, rc[1] * 0.03, rc[2] * 0.035);
          rockTip.setRGB(rc[0] * 0.12, rc[1] * 0.12, rc[2] * 0.14);
          spike(rockGeos, cx + range(-10, 10), yC, range(-40, -12), range(3, 8), range(14, 40), range(-0.08, 0.08) + Math.PI, 0, rockBase, rockTip, 6);
        }
      }
      if (!floor && !ceil && wallL && rnd() < 0.12) crystals((c) * TILE + 1, toY((r + 0.5 + range(-0.3, 0.3)) * TILE), range(-30, 10), -Math.PI / 2, glow, 0.8);
      if (!floor && !ceil && wallR && rnd() < 0.12) crystals((c + 1) * TILE - 1, toY((r + 0.5 + range(-0.3, 0.3)) * TILE), range(-30, 10), Math.PI / 2, glow, 0.8);
    }
  }

  const rockMesh = new THREE.Mesh(mergeGeometries(rockGeos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
  rockMesh.castShadow = rockMesh.receiveShadow = true;
  scene.add(rockMesh);
  scene.add(new THREE.Mesh(mergeGeometries(glowGeos), new THREE.MeshBasicMaterial({ vertexColors: true })));
  if (capGeos.length) scene.add(new THREE.Mesh(mergeGeometries(capGeos), new THREE.MeshBasicMaterial({ vertexColors: true })));
}

// ---------------------------------------------------------------
// BACK WALL: tinted per region, darkened near the rock (fake ambient occlusion), grainy
// ---------------------------------------------------------------
function buildBackWall(scene, D, worldW, worldH) {
  const RES = 5; // field pixels per tile
  const W = COLS * RES, H = ROWS * RES;
  // how close each pixel is to solid rock: a blurred solid mask
  let mask = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = isSolid(Math.floor(x / RES), Math.floor(y / RES)) ? 1 : 0;
  const R = 12;
  for (let pass = 0; pass < 3; pass++) {
    const tmp = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      let sum = 0;
      for (let x = -R; x <= R; x++) sum += mask[y * W + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) {
        tmp[y * W + x] = sum / (2 * R + 1);
        sum += mask[y * W + Math.min(W - 1, x + R + 1)] - mask[y * W + Math.max(0, x - R)];
      }
    }
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let y = -R; y <= R; y++) sum += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) {
        mask[y * W + x] = sum / (2 * R + 1);
        sum += tmp[Math.min(H - 1, y + R + 1) * W + x] - tmp[Math.max(0, y - R) * W + x];
      }
    }
  }
  const small = document.createElement('canvas');
  small.width = W; small.height = H;
  const sg = small.getContext('2d');
  const img = sg.createImageData(W, H);
  const col = [0, 0, 0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      sample(tintField, (x + 0.5) * TILE / RES, (y + 0.5) * TILE / RES, col);
      const ao = 1 - 0.55 * Math.min(1, mask[y * W + x] * 1.5);
      const lift = 4; // the tints are very dark, lift them so the shading shows
      const i = (y * W + x) * 4;
      const dither = (Math.random() - 0.5) * 4; // the dark tints are lifted 4x, which bands without a little noise
      img.data[i] = Math.min(255, col[0] * 255 * ao * lift + dither);
      img.data[i + 1] = Math.min(255, col[1] * 255 * ao * lift + dither);
      img.data[i + 2] = Math.min(255, col[2] * 255 * ao * lift + dither);
      img.data[i + 3] = 255;
    }
  }
  sg.putImageData(img, 0, 0);

  const big = document.createElement('canvas');
  big.width = COLS * 16; big.height = ROWS * 16;
  const g = big.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, big.width, big.height);
  // grain and big soft rock blotches over the top
  for (let i = 0; i < 900; i++) {
    const x = rnd() * big.width, y = rnd() * big.height, rad = 20 + rnd() * 70;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const light = rnd() > 0.5;
    grd.addColorStop(0, light ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)';
    g.fillRect(rnd() * big.width, rnd() * big.height, 2 + rnd() * 6, 1 + rnd() * 4);
  }
  const tex = new THREE.CanvasTexture(big);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.75 }));
  wall.position.set(worldW / 2, toY(worldH / 2), -D / 2 - 20);
  wall.receiveShadow = true;
  scene.add(wall);
}

// ---------------------------------------------------------------
// everything together
// ---------------------------------------------------------------
export function buildScenery(scene, D) {
  const worldW = COLS * TILE, worldH = ROWS * TILE;
  seed = 42;

  const rockMat = new THREE.MeshStandardMaterial({
    map: makeRockTexture('#4d5470', ['#3a4059', '#6a728f', '#2c3248'], '#1c2033'), roughness: 0.92, vertexColors: true,
  });
  rockMat.bumpMap = rockMat.map;
  rockMat.bumpScale = 1.6;
  const slickMat = new THREE.MeshStandardMaterial({
    map: makeRockTexture('#7fc4e0', ['#bff0ff', '#4f98b4', '#e2fbff'], '#3a7a96'), roughness: 0.1, metalness: 0.35,
    emissive: 0x1a6070, emissiveIntensity: 0.55, vertexColors: true,
  });

  const addSolid = (types, mat) => {
    const m = new THREE.Mesh(solidGeometry(types, D), mat);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  };
  addSolid([ROCK], rockMat);
  addSolid([SLICK], slickMat);
  scene.add(new THREE.Mesh(trimGeometry(D), new THREE.MeshBasicMaterial({ vertexColors: true })));

  // spikes: a steel base with hot red tips, two staggered rows so they look dense
  const spikeGeos = [];
  const steel = new THREE.Color(0x3b4150), hot = new THREE.Color(0xff3b2e);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (tileAt(c, r) !== SPIKE) continue;
      const yF = toY((r + 1) * TILE);
      for (let k = 0; k < 3; k++) spike(spikeGeos, (c + (k + 0.5) / 3) * TILE, yF, 6, TILE / 7, TILE * 0.66, 0, 0, steel, hot, 6);
      for (let k = 0; k < 2; k++) spike(spikeGeos, (c + (k + 1) / 3) * TILE, yF, -10, TILE / 8, TILE * 0.5, 0, 0, steel, hot, 6);
    }
  }
  if (spikeGeos.length) {
    const m = new THREE.Mesh(mergeGeometries(spikeGeos), new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.3, metalness: 0.75, emissive: 0x3a0808, flatShading: true,
    }));
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }

  // cracked rock: one mesh per tile so a dash can remove it
  const { map, emi } = makeCrackTextures();
  const crackMat = new THREE.MeshStandardMaterial({ map, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.85 });
  const brickMat = new THREE.MeshStandardMaterial({ map, emissiveMap: emi, emissive: 0x55ccff, emissiveIntensity: 0.9, roughness: 0.6, color: 0x9ab4d8 });
  const crackMeshes = new Map();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (tileAt(c, r) !== CRACK && tileAt(c, r) !== BRICK) continue;
      const g = new THREE.BoxGeometry(TILE, TILE, D);
      g.translate((c + 0.5) * TILE, toY((r + 0.5) * TILE), 0);
      const mesh = new THREE.Mesh(g, tileAt(c, r) === BRICK ? brickMat : crackMat);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      crackMeshes.set(r * COLS + c, mesh);
    }
  }

  buildBackWall(scene, D, worldW, worldH);
  buildDecor(scene);

  // drifting dust motes that stay around the camera
  const N = 220;
  const dp = new Float32Array(N * 3);
  const dv = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    dp[i * 3] = range(-450, 450); dp[i * 3 + 1] = range(-260, 260); dp[i * 3 + 2] = range(-50, 50);
    dv[i * 2] = range(-6, 6); dv[i * 2 + 1] = range(2, 9);
  }
  const dg = new THREE.BufferGeometry();
  const placed = new Float32Array(N * 3);
  dg.setAttribute('position', new THREE.BufferAttribute(placed, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({
    size: 3, map: glowTexture(), color: 0xaac4ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  dust.frustumCulled = false;
  const dustTint = new THREE.Color();
  scene.add(dust);

  // big soft fog banks that drift through the open rooms (hidden behind rock by the depth test)
  const CLOUDS = 34;
  const clouds = [];
  for (let i = 0; i < CLOUDS; i++) {
    const sp = makeGlow(0x6fa8ff, range(200, 380), range(0.05, 0.09));
    sp.userData = { x: range(-520, 520), y: range(-300, 300), z: range(-45, 20), vx: range(-9, 9) };
    scene.add(sp);
    clouds.push(sp);
  }

  return {
    crackMeshes,
    update(time, dt, cx, cy) {
      crackMat.emissiveIntensity = 0.8 + Math.sin(time * 0.003) * 0.3;
      const reg = regionGrid[Math.min(ROWS - 1, Math.max(0, Math.floor(-cy / TILE))) * COLS + Math.min(COLS - 1, Math.max(0, Math.floor(cx / TILE)))];
      dust.material.color.lerp(dustTint.setHex(PALETTE[reg].glow), Math.min(1, dt * 1.5));
      for (let i = 0; i < N; i++) {
        dp[i * 3] += (dv[i * 2] + Math.sin(time * 0.0007 + i) * 4) * dt;
        dp[i * 3 + 1] += dv[i * 2 + 1] * dt;
        if (dp[i * 3] > 450) dp[i * 3] -= 900; else if (dp[i * 3] < -450) dp[i * 3] += 900;
        if (dp[i * 3 + 1] > 260) dp[i * 3 + 1] -= 520;
        placed[i * 3] = cx + dp[i * 3];
        placed[i * 3 + 1] = cy + dp[i * 3 + 1];
        placed[i * 3 + 2] = dp[i * 3 + 2];
      }
      dg.attributes.position.needsUpdate = true;
      for (const sp of clouds) {
        const u = sp.userData;
        u.x += u.vx * dt;
        if (u.x > 520) u.x -= 1040; else if (u.x < -520) u.x += 1040;
        sp.position.set(cx + u.x, cy + u.y + Math.sin(time * 0.0003 + u.x * 0.01) * 14, u.z);
        sp.material.color.lerp(dustTint, Math.min(1, dt));
      }
    },
  };
}
