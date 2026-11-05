import * as THREE from 'three';
import { TILE, AIR, SPIKE, tileAt, ENEMIES, BOSSES } from './world.js';
import { makeGlow } from './fx.js';
import { buildBoss, buildRoller, ROLLER_R, buildCrawler, animateCrawler, buildTurret, buildDiver, animateDiver } from './models.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const toY = (y) => -y;

// Your blaster, the enemies, enemy bolts and the bosses. main.js hands in what it owns (ctx); this file never touches the loop.
export function createCombat(ctx) {
  const { scene, camera, body, game, owned, stat, items, drones, particles, audio, showMessage, hurt, isHeld, touch } = ctx;

// ---------------------------------------------------------------
// COMBAT: your blaster, the enemies, enemy bolts and the bosses
// ---------------------------------------------------------------
const clearLine = (x0, y0, x1, y1) => { // no rock between two points
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 16);
  for (let i = 1; i < n; i++) {
    const t = tileAt(Math.floor((x0 + ((x1 - x0) * i) / n) / TILE), Math.floor((y0 + ((y1 - y0) * i) / n) / TILE));
    if (t !== AIR && t !== SPIKE) return false;
  }
  return true;
};
const openAt = (x, y) => { const t = tileAt(Math.floor(x / TILE), Math.floor(y / TILE)); return t === AIR || t === SPIKE; };

// enemy bolts (from turrets and bosses). A dash destroys them.
const bolts = [];
const boltGeo = new THREE.SphereGeometry(5, 10, 8);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xff7a6a });
const boltGlow = makeGlow(0xff3a2a, 34, 0.7).material; // one shared sprite material: a fresh one per bolt was never freed
const pboltGlow = makeGlow(0xff5ad8, 26, 0.7).material;
const glowSprite = (mat, size) => { const sp = new THREE.Sprite(mat); sp.scale.setScalar(size); return sp; };
function fireBolt(x, y, vx, vy) {
  const m = new THREE.Mesh(boltGeo, boltMat);
  m.add(glowSprite(boltGlow, 34));
  scene.add(m);
  bolts.push({ m, x, y, vx, vy, life: 7 });
}
function clearBolts() {
  for (const bt of bolts) scene.remove(bt.m);
  bolts.length = 0;
}

// --- the blaster: aim with the mouse, click or hold F to shoot ---
const mouse = { x: 0, y: 0, down: false, moved: false };
const crossEl = document.getElementById('cross');
window.addEventListener('mousemove', (e) => {
  if (touch) return; // a tap also sends a fake mouse move: on a phone you aim with the pad instead
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; crossEl.style.left = `${e.clientX}px`; crossEl.style.top = `${e.clientY}px`;
});
window.addEventListener('mousedown', () => { if (!touch) mouse.down = true; });
window.addEventListener('mouseup', () => { mouse.down = false; });
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const hit3 = new THREE.Vector3();
function mouseWorld() { // the point on the gameplay plane under the cursor, in game coordinates
  ray.setFromCamera(new THREE.Vector2((mouse.x / window.innerWidth) * 2 - 1, -((mouse.y / window.innerHeight) * 2 - 1)), camera);
  ray.ray.intersectPlane(plane, hit3);
  return { x: hit3.x, y: -hit3.y };
}
const pbolts = [];
const pboltGeo = new THREE.SphereGeometry(3.2, 8, 6);
const pboltMat = new THREE.MeshBasicMaterial({ color: 0xffb0f0 });
function firePlayerBolt(x, y, vx, vy) {
  const m = new THREE.Mesh(pboltGeo, pboltMat);
  m.add(glowSprite(pboltGlow, 26));
  scene.add(m);
  pbolts.push({ m, x, y, vx, vy, life: 1.1 });
}
function updatePlayerGun(time, dt) {
  const b = body;
  game.gunCd = Math.max(0, (game.gunCd || 0) - dt);
  if (!owned.has('blaster') || ctx.mapOpen || game.dead) return;
  if (!(mouse.down || isHeld('KeyF')) || game.gunCd > 0) return;
  // no mouse: shoot the way you face, or straight up / down / diagonally when those keys are held
  const vy = (isHeld('ArrowUp', 'KeyW') ? -1 : 0) + (isHeld('ArrowDown', 'KeyS') ? 1 : 0);
  const sideways = isHeld('ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD') || !vy;
  const aim = mouse.moved ? mouseWorld() : { x: b.x + (sideways ? game.facing * 100 : 0), y: b.y + vy * 100 };
  const a = Math.atan2(aim.y - b.y, aim.x - b.x);
  const n = stat.triple ? 3 : 1;
  for (let k = 0; k < n; k++) {
    const ang = a + (k - (n - 1) / 2) * 0.17;
    firePlayerBolt(b.x + Math.cos(ang) * 22, b.y + Math.sin(ang) * 22 - 2, Math.cos(ang) * 680, Math.sin(ang) * 680);
  }
  game.gunCd = stat.fireCd;
  audio.sfx('airhop');
  particles.burst(b.x + Math.cos(a) * 24, b.y + Math.sin(a) * 24, 0xff7ae0, 4, 80, 0.2);
}

// --- enemies ---
const ENEMY_BOX = { crawler: [13, 10], turret: [10, 11], diver: [8, 8] };
const enemies = ENEMIES.map(([type, c, r, range]) => {
  const fx = type === 'crawler' ? buildCrawler() : type === 'turret' ? buildTurret() : buildDiver();
  scene.add(fx.g);
  const x = (c + 0.5) * TILE;
  const y = type === 'diver' ? r * TILE + 9 : (r + 1) * TILE - ENEMY_BOX[type][1];
  return { type, c, r, fx, g: fx.g, x, y, hx: x, hy: y, range: (range || 0) * TILE, hp: type === 'turret' ? 2 : 1, dir: 1, mode: 'sleep', t: 0, shotT: 1 + Math.random() * 1.5, vx: 0, vy: 0, deadUntil: 0, dead: false };
});
function killEnemy(e, time) {
  e.dead = true;
  e.deadUntil = time + 22000; // they come back, so a cleared room is never permanently empty
  e.g.visible = false;
  audio.sfx('droneDie');
  particles.burst(e.x, e.y, 0xffb84a, 24, 200, 0.7, 300);
  particles.burst(e.x, e.y, 0xff5a3a, 10, 140, 0.5, 300);
}
function damageEnemy(e, time, dmg = 1) {
  e.hp -= dmg;
  if (e.hp <= 0) killEnemy(e, time);
  else particles.burst(e.x, e.y, 0xffe08a, 6, 100, 0.3);
}
function updateEnemies(time, dt) {
  const b = body;
  for (const e of enemies) {
    if (e.dead) {
      if (time < e.deadUntil) continue;
      e.dead = false; e.g.visible = true; e.hp = e.type === 'turret' ? 2 : 1; e.x = e.hx; e.y = e.hy; e.mode = 'sleep';
    }
    const dx = b.x - e.x, dy = b.y - e.y;
    if (Math.abs(dx) > 700 || Math.abs(dy) > 520) continue; // far away: frozen
    if (e.type === 'crawler') {
      const nx = e.x + e.dir * 56 * dt;
      const ahead = nx + e.dir * 13;
      const row = Math.floor(e.y / TILE);
      if (!openAt(ahead, e.y) || openAt(ahead, e.y + 14) || tileAt(Math.floor(ahead / TILE), row + 1) === SPIKE || Math.abs(nx - e.hx) > e.range) e.dir = -e.dir;
      else e.x = nx;
      animateCrawler(e, time);
    } else if (e.type === 'turret') {
      const near = Math.abs(dx) < 520 && Math.abs(dy) < 420 && clearLine(e.x, e.y - 10, b.x, b.y);
      e.fx.barrel.rotation.z += (Math.atan2(-dx, -dy) - e.fx.barrel.rotation.z) * Math.min(1, dt * 6);
      e.fx.tip.material = near ? enemyEyeOn : enemyEyeOff;
      e.shotT -= dt;
      if (near && e.shotT <= 0) {
        e.shotT = 2.1;
        const a = Math.atan2(dy, dx), tx = e.x + Math.cos(a) * 16, ty = e.y - 8 + Math.sin(a) * 16;
        fireBolt(tx, ty, Math.cos(a) * 175, Math.sin(a) * 175);
        audio.sfx('zap');
      }
    } else { // diver
      const awake = e.mode !== 'sleep';
      if (e.mode === 'sleep') {
        e.y = e.hy + Math.sin(time * 0.003 + e.c) * 1.5;
        if (dy > 20 && dy < 320 && Math.abs(dx) < 190 && clearLine(e.x, e.y, b.x, b.y)) { e.mode = 'dive'; e.t = 0; audio.sfx('zap'); }
      } else if (e.mode === 'dive') {
        e.t += dt;
        const a = Math.atan2(dy, dx), sp = 270;
        e.vx += (Math.cos(a) * sp - e.vx) * Math.min(1, dt * 3.5);
        e.vy += (Math.sin(a) * sp - e.vy) * Math.min(1, dt * 3.5);
        const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
        if (openAt(nx, ny)) { e.x = nx; e.y = ny; } else e.t = 9;
        if (e.t > 1.3) e.mode = 'return';
      } else {
        const hx = e.hx - e.x, hy = e.hy - e.y, d = Math.hypot(hx, hy);
        if (d < 4) { e.mode = 'sleep'; e.x = e.hx; e.y = e.hy; e.vx = e.vy = 0; }
        else { const nx = e.x + (hx / d) * 150 * dt, ny = e.y + (hy / d) * 150 * dt; if (openAt(nx, ny)) { e.x = nx; e.y = ny; } else { e.x = e.hx; e.y = e.hy; e.mode = 'sleep'; } }
      }
      animateDiver(e, time, awake);
    }
    e.g.position.set(e.x, toY(e.y), 2);
    const [hw, hh] = ENEMY_BOX[e.type];
    if (Math.abs(b.x - e.x) < b.w / 2 + hw && Math.abs(b.y - e.y) < b.h / 2 + hh) {
      if (ctx.dashing) killEnemy(e, time);
      else hurt(time, e.type === 'turret' ? 'Zapped by a turret.' : e.type === 'diver' ? 'Pounced on by a bat-bot.' : 'Nipped by a crawler.');
    }
  }
}
const enemyEyeOn = new THREE.MeshBasicMaterial({ color: 0xffd24a });
const enemyEyeOff = new THREE.MeshBasicMaterial({ color: 0xff5a2a });


// --- bosses ---
// Each boss sleeps until you walk into its arena. Flyers hover and fire, telegraph, dive and lie stunned: a Dash into one then does
// damage. The roller charges along the floor and shrugs off a Dash: it takes blaster hits. Damage is kept if you die.
const bossBar = document.getElementById('bossbar');
const bosses = BOSSES.map((def) => {
  const a = { x0: def.x0 * TILE, x1: def.x1 * TILE, top: def.top * TILE, floor: def.floor * TILE };
  const roller = def.kind === 'roller';
  const fx = roller ? buildRoller(def) : buildBoss(def);
  scene.add(fx.g);
  const reward = items.find((i) => i.id === def.reward);
  reward.locked = true;
  reward.group.visible = false;
  const R = roller ? ROLLER_R : 40;
  return { def, a, fx, roller, R, reward, max: def.hp, hp: def.hp, state: 'asleep', t: 0, x: (a.x0 + a.x1) / 2, y: roller ? a.floor - R : a.top + 80, vx: 0, flash: 0, invuln: 0, shotT: 0, dir: 1, dead: false };
});
const bossActive = () => bosses.some((B) => B.state !== 'asleep' && !B.dead);
function resetBosses() { // you died: they go back to sleep, keeping the damage
  for (const B of bosses) {
    if (B.dead) continue;
    B.state = 'asleep';
    B.x = (B.a.x0 + B.a.x1) / 2;
    B.y = B.roller ? B.a.floor - B.R : B.a.top + 80;
    B.invuln = 0;
  }
  clearBolts();
  bossBar.style.opacity = 0;
}

function hitBoss(B, amt, strong) {
  if (B.dead || B.state === 'asleep') return;
  if (strong) { // a Dash
    if (B.roller || B.invuln > 0 || B.state === 'dive') return;
    B.invuln = 1.2;
    if (B.state === 'stun') { B.state = 'rise'; B.t = 0; } // one hit per stun: it wrenches itself off the floor
    ctx.shake(0.4);
    particles.burst(B.x, B.y, 0xffe08a, 20, 200, 0.8, 200);
  } else if (B.roller && B.state === 'stun') amt *= 2;
  B.hp -= amt;
  B.flash = 1;
  audio.sfx('droneDie');
  particles.burst(B.x, B.y, 0xff4a4a, strong ? 40 : 6, strong ? 280 : 140, strong ? 1 : 0.4, 200);
  if (B.hp > 0.001) return;
  B.dead = true;
  B.fx.g.visible = false;
  clearBolts();
  bossBar.style.opacity = 0;
  ctx.shake(0.8);
  for (let k = 0; k < 6; k++) particles.burst(B.x + (Math.random() - 0.5) * 80, B.y + (Math.random() - 0.5) * 60, k % 2 ? 0xffe08a : 0xff5a4a, 50, 330, 1.6, 150);
  audio.sfx('ability');
  B.reward.locked = false;
  B.reward.group.visible = true;
  ctx.markMap();
  showMessage(B.def.win, 5000);
}

function updateBoss(B, time, dt) {
  const b = body, a = B.a, hard = !!B.def.hard;
  if (B.dead) return;
  B.invuln = Math.max(0, B.invuln - dt);
  B.flash = Math.max(0, B.flash - dt * 2.5);
  const phase2 = B.hp <= B.max / 2, phase3 = hard && B.hp <= B.max / 3;
  const prevX = B.x;
  let eye = 0x5a1a1a;

  if (B.state === 'asleep') {
    if (b.x > a.x0 + 40 && b.x < a.x1 && b.y > a.top - 20 && b.y < a.floor) {
      B.state = B.roller ? 'idle' : 'hover'; B.t = 0; B.shotT = 1.4;
      bossBar.dataset.name = B.def.name;
      bossBar.style.opacity = 1;
      audio.sfx('zap');
      showMessage(B.def.intro, 5000);
    }
  } else if (B.roller) {
    eye = 0xffa13d;
    if (B.state === 'idle') {
      B.t += dt;
      B.dir = Math.sign(b.x - B.x) || 1;
      B.x += B.dir * 70 * dt;
      if (B.t > (phase2 ? 1.6 : 2.4)) { B.state = 'rev'; B.t = 0; }
    } else if (B.state === 'rev') {
      B.t += dt;
      eye = Math.sin(B.t * 30) > 0 ? 0xffffff : 0xff5a2a;
      B.x += Math.sin(B.t * 60) * 1.2; // it shudders
      if (B.t > 1) { // if you are off the floor it rolls the long way round: up one wall, across the ceiling, down the other
        B.state = 'charge'; B.t = 0; B.dir = Math.sign(b.x - B.x) || 1;
        B.left = (B.dir < 0 ? B.x - (a.x0 + B.R + 4) : a.x1 - B.R - 4 - B.x) + (b.y < a.floor - 70 ? 2 * (a.floor - a.top - 2 * B.R - 8) + (a.x1 - a.x0 - 2 * B.R - 8) : 0);
      }
    } else if (B.state === 'charge') {
      eye = 0xffffff;
      const step = Math.min(B.left, (phase2 ? 540 : 440) * dt);
      B.left -= step;
      const X0 = a.x0 + B.R + 4, X1 = a.x1 - B.R - 4, Y0 = a.top + B.R + 4, Y1 = a.floor - B.R - 4, W = X1 - X0, H = Y1 - Y0;
      // distance travelled along the loop (bottom edge right to left, up the left wall, across the top, down the right wall)
      let s = B.y >= Y1 ? X1 - B.x : B.x <= X0 ? W + Y1 - B.y : B.y <= Y0 ? W + H + B.x - X0 : 2 * W + H + (B.y - Y0);
      s = (s + (B.dir < 0 ? step : -step) + 2 * (W + H)) % (2 * (W + H));
      if (s < W) { B.x = X1 - s; B.y = Y1; } else if (s < W + H) { B.x = X0; B.y = Y1 - (s - W); } else if (s < 2 * W + H) { B.x = X0 + (s - W - H); B.y = Y0; } else { B.x = X1; B.y = Y0 + (s - 2 * W - H); }
      B.ds = B.dir < 0 ? step : -step;
      if (B.left <= 0) {
        B.state = 'stun'; B.t = 0;
        ctx.shake(0.6);
        audio.sfx('crack');
        particles.burst(B.x, a.floor - 20, 0xb4bed8, 30, 240, 0.8, 300, 0.4);
        for (let k = 0; k < 3; k++) fireBolt(a.x0 + 100 + Math.random() * (a.x1 - a.x0 - 200), a.top + 10, 0, 200); // rubble falls from the ceiling
      }
    } else if (B.state === 'stun') {
      B.t += dt;
      eye = 0x4ab0ff;
      if (B.t > (phase2 ? 2.4 : 3.2)) { B.state = 'idle'; B.t = 0; }
    }
  } else if (B.state === 'hover') {
    B.t += dt;
    eye = hard ? 0xb08aff : 0xff3a3a;
    const mid = (a.x0 + a.x1) / 2, span = (a.x1 - a.x0) / 2 - 90;
    B.x += (mid + Math.sin(B.t * (phase2 ? 1.3 : 0.9)) * span - B.x) * Math.min(1, dt * 4);
    B.y = a.top + 80 + Math.sin(B.t * 1.7) * 16;
    B.shotT -= dt;
    if (B.shotT <= 0) {
      B.shotT = (phase2 ? 1.1 : 1.6) * (phase3 ? 0.8 : 1);
      const n = (phase2 ? 5 : 3) + (hard ? 2 : 0), aim = Math.atan2(b.y - B.y, b.x - B.x), sp = (phase2 ? 240 : 195) + (hard ? 25 : 0);
      for (let k = 0; k < n; k++) {
        const an = aim + (k - (n - 1) / 2) * 0.3;
        fireBolt(B.x, B.y + 20, Math.cos(an) * sp, Math.sin(an) * sp);
      }
      audio.sfx('zap');
    }
    if (B.t > (phase2 ? 4.2 : 5.5)) { B.state = 'telegraph'; B.t = 0; }
  } else if (B.state === 'telegraph') {
    B.t += dt;
    eye = Math.sin(B.t * 30) > 0 ? 0xffffff : 0xff3a3a;
    if (B.t < 0.7) B.x += (clamp(b.x, a.x0 + 60, a.x1 - 60) - B.x) * Math.min(1, dt * 3.5); // then it stops tracking you: get out of the way
    B.y += (a.top + 60 - B.y) * Math.min(1, dt * 5);
    if (B.t > 1.3) { B.state = 'dive'; B.t = 0; }
  } else if (B.state === 'dive') {
    eye = 0xffffff;
    B.y += 720 * dt;
    if (B.y >= a.floor - B.R - 4) {
      B.y = a.floor - B.R - 4;
      B.state = 'stun'; B.t = 0;
      ctx.shake(0.5);
      audio.sfx('crack');
      particles.burst(B.x, a.floor, 0xb4bed8, 30, 220, 0.8, 300, 0.4);
      for (const s of [-1, 1]) fireBolt(B.x + s * 40, a.floor - 10, s * 270, 0); // shockwaves along the floor: hop them or dash through
      if (phase3) for (let k = 0; k < 6; k++) { const an = -Math.PI * (0.1 + 0.16 * k); fireBolt(B.x, B.y, Math.cos(an) * 230, Math.sin(an) * 230); }
    }
  } else if (B.state === 'stun') {
    B.t += dt;
    eye = 0x4ab0ff;
    if (B.t > (phase2 ? 2.4 : 3.2)) { B.state = 'rise'; B.t = 0; }
  } else if (B.state === 'rise') {
    eye = hard ? 0xb08aff : 0xff3a3a;
    B.y -= 170 * dt;
    if (B.y <= a.top + 80) { B.state = 'hover'; B.t = 0; B.shotT = 0.8; }
  }

  B.vx = B.roller && B.state === 'charge' ? -(B.ds || 0) / Math.max(dt, 0.001) : (B.x - prevX) / Math.max(dt, 0.001); // a roller on a wall or ceiling still spins
  B.fx.g.position.set(B.x, toY(B.y), 0);
  B.fx.animate(dt, time, B.vx, B.flash, eye);
  if (B.state !== 'asleep') {
    bossBar.firstElementChild.style.width = `${(100 * Math.max(0, B.hp)) / B.max}%`;
    const touching = Math.abs(b.x - B.x) < b.w / 2 + B.R * 0.85 && Math.abs(b.y - B.y) < b.h / 2 + B.R * 0.85;
    if (touching && ctx.dashing) hitBoss(B, 1, true);
    else if (touching && !ctx.dashing && B.state !== 'stun') hurt(time, `Bumped by ${B.def.name.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase())}.`);
  }
}

function updateCombat(time, dt) {
  const b = body;
  updatePlayerGun(time, dt);
  updateEnemies(time, dt);
  for (const B of bosses) updateBoss(B, time, dt);

  for (let i = pbolts.length - 1; i >= 0; i--) { // your bolts
    const p = pbolts[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    p.m.position.set(p.x, toY(p.y), 6);
    let gone = p.life <= 0 || !openAt(p.x, p.y);
    if (!gone) {
      for (const e of enemies) if (!e.dead && Math.abs(p.x - e.x) < ENEMY_BOX[e.type][0] + 4 && Math.abs(p.y - e.y) < ENEMY_BOX[e.type][1] + 4) { damageEnemy(e, time); gone = true; break; }
    }
    if (!gone) for (const d of drones) if (time >= d.deadUntil && Math.abs(p.x - d.x) < 14 && Math.abs(p.y - d.y) < 14) {
      d.deadUntil = time + 8000; gone = true; audio.sfx('droneDie');
      particles.burst(d.x, d.y, 0xff4a4a, 24, 220, 0.7, 300);
    }
    if (!gone) for (const B of bosses) if (!B.dead && B.state !== 'asleep' && Math.hypot(p.x - B.x, p.y - B.y) < B.R + 4) { hitBoss(B, B.def.hard || B.roller ? 0.2 : 0.25, false); gone = true; break; }
    if (!gone) for (let j = bolts.length - 1; j >= 0; j--) if (Math.abs(p.x - bolts[j].x) < 9 && Math.abs(p.y - bolts[j].y) < 9) { scene.remove(bolts[j].m); bolts.splice(j, 1); gone = true; break; }
    if (gone) { particles.burst(p.x, p.y, 0xff7ae0, 5, 100, 0.3); scene.remove(p.m); pbolts.splice(i, 1); }
  }

  for (let i = bolts.length - 1; i >= 0; i--) { // enemy bolts
    const bt = bolts[i];
    bt.x += bt.vx * dt; bt.y += bt.vy * dt; bt.life -= dt;
    bt.m.position.set(bt.x, toY(bt.y), 6);
    let gone = bt.life <= 0 || !openAt(bt.x, bt.y);
    if (!gone && Math.abs(b.x - bt.x) < b.w / 2 + 5 && Math.abs(b.y - bt.y) < b.h / 2 + 5) {
      gone = true;
      if (!ctx.dashing) hurt(time, 'Zapped by a spark.');
      particles.burst(bt.x, bt.y, 0xff7a6a, 8, 120, 0.4);
    }
    if (gone) { scene.remove(bt.m); bolts.splice(i, 1); }
  }
}


  // the shockwave of a Slam landing: kills ground enemies and drones nearby, and rattles a stunned roller
  function slamShock(time) {
    const b = body, R = stat.quake;
    for (const e of enemies) if (!e.dead && e.type !== 'diver' && Math.abs(e.x - b.x) < R && Math.abs(e.y - b.y) < 50) killEnemy(e, time);
    for (const d of drones) if (time >= d.deadUntil && Math.abs(d.x - b.x) < R && Math.abs(d.y - b.y) < 50) { d.deadUntil = time + 8000; particles.burst(d.x, d.y, 0xff4a4a, 24, 220, 0.7, 300); }
    for (const B of bosses) if (B.roller && B.state === 'stun' && Math.abs(B.x - b.x) < R) hitBoss(B, 0.5, false);
  }
  const syncCrosshair = () => { crossEl.style.display = owned.has('blaster') && mouse.moved ? 'block' : 'none'; };

  return { update: updateCombat, resetBosses, bossActive, slamShock, syncCrosshair, enemies, bosses };
}
