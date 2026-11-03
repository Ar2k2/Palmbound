// Playtest bot (dev only: open the game with ?bot). It steps the real movement code headlessly and searches
// everything the hand can reach with a given set of abilities, then adds any ability it finds and searches again.
//   await __bot.closure('glide')   -> stages, what each start can reach, and an ASCII map of the final reach
// Passives are ignored on purpose: the game has to be finishable without them.
import { TILE, COLS, ROWS, ITEMS, FLOATERS, SPAWN as ST, tileAt } from './world.js';

const { body, game, owned, recalc, sim, ABILITY_IDS } = window.__game;
const FRAME_MS = 1000 / 60;
// drones patrol on a clock, so a state is only safe at the right moment (same formula as updateWorld in main.js)
const droneAt = ([c, r, axis, amp, speed], t) => {
  const o = Math.sin(t * 0.001 * speed + (c + 0.5) * TILE) * amp * TILE;
  return [(c + 0.5) * TILE + (axis === 'x' ? o : 0), (r + 0.5) * TILE + (axis === 'y' ? o : 0)];
};
const droneHit = (t) => {
  if (t < game.dashUntil) return false; // dashing through a drone destroys it
  for (const f of FLOATERS) {
    const [x, y] = droneAt(f, t);
    if (Math.abs(body.x - x) < body.w / 2 + 11 && Math.abs(body.y - y) < body.h / 2 + 11) return true;
  }
  return false;
};
const droneNear = (t) => FLOATERS.some((f) => { const [x, y] = droneAt(f, t); return Math.abs(body.x - x) < 260 && Math.abs(body.y - y) < 200; });
const K = { L: 'ArrowLeft', R: 'ArrowRight', U: 'ArrowUp', D: 'ArrowDown', J: 'Space', X: 'KeyX' };
// MessageChannel instead of setTimeout: a hidden browser pane throttles timers to one per second
const mc = new MessageChannel();
const tick = () => new Promise((r) => { mc.port1.onmessage = r; mc.port2.postMessage(0); });
let lastYield = 0;

// macros: hold some keys for a few frames
function actionsFor(abil) {
  const out = [];
  const jumps = abil.has('hop') || abil.has('glide');
  for (const h of [null, K.L, K.R]) {
    for (const v of [null, K.U, K.D]) {
      const base = [h, v].filter(Boolean);
      const nm = [h && h.slice(5), v && v.slice(5)].filter(Boolean).join('+') || 'idle';
      out.push({ name: nm, plan: [[new Set(base), 12]] });
      if (jumps) {
        out.push({ name: `${nm}+J`, plan: [[new Set([...base, K.J]), 12]] });
        if (abil.has('hop')) out.push({ name: `${nm}+tap`, plan: [[new Set([...base, K.J]), 4], [new Set(base), 8]] });
      }
      if (abil.has('dash')) out.push({ name: `${nm}+X`, plan: [[new Set([...base, K.X]), 12]] });
      if (abil.has('dash') && jumps) out.push({ name: `${nm}+J+X`, plan: [[new Set([...base, K.J, K.X]), 12]] });
    }
  }
  return out;
}

const root = (() => {
  for (let i = 0; i < 4; i++) sim.step(new Set(), 1000 + i * FRAME_MS, new Set()); // land on the floor
  return { s: sim.snap(), t: 2000, keys: new Set(), parent: -1, act: 'start' };
})();

const keyOf = (t) => {
  const vb = (v) => (v < -60 ? -1 : v > 60 ? 1 : 0);
  return [
    Math.floor(body.x / 10), Math.floor(body.y / 10), game.state, game.gripDir, vb(body.vx), vb(body.vy),
    game.dashesLeft, game.airJumps, t < game.dashUntil ? 1 : 0, game.gliding ? 1 : 0, sim.broken.length, DRONES && droneNear(t) ? Math.floor(t / 250) % 25 : -1,
  ].join(',');
};

let DRONES = true; // set __bot.setDrones(false) to ignore them
export async function explore(abil, cap = 250000, from = null, bounds = null) {
  owned.clear();
  abil.forEach((a) => owned.add(a));
  recalc();
  sim.active = true;
  sim.restore(root.s);
  let start = root;
  if (from) { // begin standing on the floor of tile (col, row) instead of at the spawn
    Object.assign(body, { x: (from[0] + 0.5) * TILE, y: (from[1] + 1) * TILE - body.h / 2 - 0.5, vx: 0, vy: 0 });
    for (let i = 0; i < 4; i++) sim.step(new Set(), 1000 + i * FRAME_MS, new Set());
    start = { s: sim.snap(), t: 2000, keys: new Set(), parent: -1, act: 'start' };
  }
  const acts = actionsFor(abil);
  const HOP = abil.has('hop');
  const SLAM = abil.has('slam');
  const nodes = [start];
  const seen = new Set();
  const reached = new Uint8Array(COLS * ROWS);
  const found = new Map(); // item id -> node index that touched it
  const touch = (qi) => {
    reached[Math.floor(body.y / TILE) * COLS + Math.floor(body.x / TILE)] = 1;
    for (const [id, c, r] of ITEMS) {
      if (found.has(id)) continue;
      const x = (c + 0.5) * TILE, y = (r + 0.5) * TILE;
      if (Math.abs(body.x - x) <= body.w / 2 + 12 && Math.abs(body.y - y) <= body.h / 2 + 16) found.set(id, qi);
    }
  };
  for (let qi = 0; qi < nodes.length && nodes.length < cap; qi++) {
    const n = nodes[qi];
    const st = n.s.g.state;
    for (const a of acts) {
      // skip macros that cannot do anything from this state: it keeps the search small
      if (a.name.includes('Down') && st !== 'grip' && st !== 'ceiling' && !(SLAM && st === 'air')) continue;
      if (a.name.includes('J') && !HOP && st !== 'air') continue;
      sim.restore(n.s);
      let t = n.t, prev = n.keys, dead = false;
      outer: for (const [keys, cnt] of a.plan) {
        for (let f = 0; f < cnt; f++) {
          dead = sim.step(keys, t, prev) || (DRONES && droneHit(t));
          prev = keys;
          t += FRAME_MS;
          touch(qi);
          if (dead) break outer;
        }
      }
      if (dead) continue;
      if (bounds && (body.x < bounds[0] * TILE || body.y < bounds[1] * TILE || body.x > bounds[2] * TILE || body.y > bounds[3] * TILE)) continue;
      const k = keyOf(t);
      if (seen.has(k)) continue;
      seen.add(k);
      nodes.push({ s: sim.snap(), t, keys: prev, parent: qi, act: a.name });
    }
    if (performance.now() - lastYield > 80) { lastYield = performance.now(); window.__bot.progress = `${qi}/${nodes.length}`; await tick(); }
  }
  sim.restore(root.s);
  sim.active = false;
  return { nodes, found, reached, abil: [...abil] };
}

const ITEM_CH = { dash: 'D', glide: 'G', suction: 'S', hop: 'H', core: 'C' };
export function ascii(res) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let line = '';
    for (let c = 0; c < COLS; c++) {
      const t = tileAt(c, r);
      line += t === 1 ? '#' : t === 2 ? '~' : t === 3 ? '^' : t === 4 ? 'x' : res.reached[r * COLS + c] ? '.' : ' ';
    }
    rows.push(line.split(''));
  }
  for (const [id, c, r] of ITEMS) {
    const ch = ITEM_CH[id] || '*';
    rows[r][c] = res.found.has(id) ? ch : ch.toLowerCase() === ch ? '+' : ch.toLowerCase();
  }
  return rows.map((l, i) => String(i).padStart(2) + ' ' + l.join('')).join('\n');
}

// run-length encoded route (macro names) from the start to the node that touched an item
export function route(res, id) {
  let i = res.found.get(id);
  const out = [];
  while (i > 0) { out.push(res.nodes[i].act); i = res.nodes[i].parent; }
  out.reverse();
  const rle = [];
  for (const a of out) (rle.length && rle[rle.length - 1][0] === a ? rle[rle.length - 1][1]++ : rle.push([a, 1]));
  return rle.map(([a, n]) => (n > 1 ? `${a}x${n}` : a)).join(' ');
}

// start with one ability, keep adding whatever it can reach until nothing new turns up
export async function closure(start) {
  const abil = new Set(Array.isArray(start) ? start : [start]);
  const log = [];
  for (;;) {
    const res = await explore(abil);
    const gained = ABILITY_IDS.filter((a) => !abil.has(a) && res.found.has(a));
    log.push(`have [${[...abil]}] -> ${res.nodes.length} states, items: ${[...res.found.keys()].join(' ') || '-'}`);
    if (!gained.length) {
      const items = ITEMS.map(([id]) => id).filter((id) => !res.found.has(id) && !abil.has(id));
      return { log, missing: items, res, map: ascii(res) };
    }
    gained.forEach((a) => abil.add(a));
  }
}

window.__bot = { setDrones: (v) => { DRONES = v; }, explore, closure, ascii, route, root, SPAWN: ST };
