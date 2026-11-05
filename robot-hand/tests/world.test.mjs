// Sanity checks on the hand-made world data. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE, AIR, SPIKE, BRICK, CRACK, COLS, ROWS, tileAt, CHECKPOINTS, ITEMS, ENEMIES, BOSSES, FLOATERS, SPAWN, ESCAPE } from '../src/world.js';

const isAir = (c, r) => tileAt(c, r) === AIR || tileAt(c, r) === SPIKE;
const solid = (c, r) => !isAir(c, r);
const PW = 42, PH = 28; // the hand's hitbox

// the same forgiving rule main.js uses for spikes: only the lower part of the tile hurts
function spikeAt(x, y) {
  for (let r = Math.floor((y - PH / 2) / TILE); r <= Math.floor((y + PH / 2) / TILE); r++) {
    for (let c = Math.floor((x - PW / 2) / TILE); c <= Math.floor((x + PW / 2) / TILE); c++) {
      if (tileAt(c, r) === SPIKE && y + PH / 2 - 4 > r * TILE + TILE * 0.4 && x + PW / 2 - 4 > c * TILE && x - PW / 2 + 4 < (c + 1) * TILE) return true;
    }
  }
  return false;
}

test('spawn and every station: open space, on a floor, not touching spikes', () => {
  for (const [c, r] of [[SPAWN.c, SPAWN.r], ...CHECKPOINTS]) {
    assert.ok(isAir(c, r), `station ${c},${r} is inside rock`);
    assert.ok(solid(c, r + 1), `station ${c},${r} has no floor`);
    assert.ok(!spikeAt((c + 0.5) * TILE, (r + 1) * TILE - PH / 2 - 0.5), `station ${c},${r} respawns you on spikes`);
  }
});

test('items, drones and enemies sit in open space', () => {
  for (const [id, c, r] of ITEMS) assert.ok(isAir(c, r), `item ${id} at ${c},${r} is inside rock`);
  for (const [c, r] of FLOATERS) assert.ok(isAir(c, r), `drone at ${c},${r} is inside rock`);
  for (const [type, c, r] of ENEMIES) {
    assert.ok(isAir(c, r), `${type} at ${c},${r} is inside rock`);
    if (type === 'diver') assert.ok(solid(c, r - 1), `diver at ${c},${r} has no ceiling to hang from`);
    else assert.ok(tileAt(c, r + 1) !== AIR && tileAt(c, r + 1) !== SPIKE, `${type} at ${c},${r} has no floor`);
  }
});

test('every boss guards an item that exists, and its arena is open', () => {
  const ids = new Set(ITEMS.map(([id]) => id));
  for (const b of BOSSES) {
    assert.ok(ids.has(b.reward), `${b.id} guards ${b.reward}, which is not in ITEMS`);
    assert.ok(isAir((b.x0 + b.x1) >> 1, b.floor - 1), `${b.id}'s arena floor row is not open`);
    assert.ok(solid((b.x0 + b.x1) >> 1, b.floor), `${b.id}'s arena has no floor`);
  }
});

test('item ids are unique', () => {
  const ids = ITEMS.map(([id]) => id);
  assert.equal(new Set(ids).size, ids.length);
});

// the Hollows are late-game: nothing you can walk, climb or fall through from the start may lead into them
test('the Hollows cannot be entered from the start without breaking the brick plug', () => {
  for (const r of [52, 57]) for (const c of [22, 23]) assert.equal(tileAt(c, r), BRICK, `brick plug missing at ${c},${r}`); // 52: ceiling of the start tunnel (keeps the G wing shut), 57: its floor (keeps the Hollows shut)
  const seen = new Uint8Array(COLS * ROWS), todo = [[SPAWN.c, SPAWN.r]];
  while (todo.length) {
    const [c, r] = todo.pop();
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS || seen[r * COLS + c] || !isAir(c, r)) continue;
    seen[r * COLS + c] = 1;
    todo.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  assert.ok(seen[56 * COLS + 4], 'flood fill never left the spawn');
  assert.ok(!seen[66 * COLS + 24], 'open air leads from the spawn into the Hollows');
  assert.ok(!seen[38 * COLS + 12], 'open air leads from the spawn into the glide shrine room');
});

// the ending: the robot sleeps in the Keeper's arena and the sealed tunnel east of it (cracked walls only) leads to the exit
test('the escape tunnel connects the robot to the exit through cracked walls only', () => {
  const walk = [[ESCAPE.robotC, 9]], seen = new Set();
  assert.ok(isAir(ESCAPE.robotC, 9), 'the robot is not standing in open air');
  assert.ok(solid(ESCAPE.robotC, 10), 'the robot has no floor');
  while (walk.length) {
    const [c, r] = walk.pop();
    const k = r * COLS + c;
    if (seen.has(k) || !(isAir(c, r) || tileAt(c, r) === CRACK)) continue;
    seen.add(k);
    walk.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  assert.ok(seen.has(3 * COLS + ESCAPE.exitC), 'the exit is not reachable from the robot');
  const [sc, sr, sw, sh] = ESCAPE.seal;
  for (let y = sr; y < sr + sh; y++) for (let x = sc; x < sc + sw; x++) assert.equal(tileAt(x, y), CRACK, `seal missing at ${x},${y}`);
});
