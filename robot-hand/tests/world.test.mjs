// Sanity checks on the hand-made world data. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE, AIR, SPIKE, tileAt, CHECKPOINTS, ITEMS, ENEMIES, BOSSES, FLOATERS, SPAWN } from '../src/world.js';

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
