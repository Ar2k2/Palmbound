import { COLS, ROWS, tileAt, AIR, SLICK, SPIKE, CHECKPOINTS } from './world.js';

// which tiles the hand has seen (1 = explored)
export const explored = new Uint8Array(COLS * ROWS);
let lastKey = -1;

// Reveal by flood fill through open space, so you only learn rooms you can actually see into
// (not rooms behind a thin wall). Solid tiles touching revealed space are revealed too.
export function reveal(c, r, radius) {
  const key = r * COLS + c;
  if (key === lastKey && radius === reveal.radius) return false;
  lastKey = key;
  reveal.radius = radius;
  const seen = new Set([key]);
  const queue = [[c, r]];
  while (queue.length) {
    const [x, y] = queue.pop();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        explored[ny * COLS + nx] = 1;
        const k = ny * COLS + nx;
        if (seen.has(k) || (dx && dy)) continue;
        if (Math.hypot(nx - c, ny - r) > radius) continue;
        const t = tileAt(nx, ny);
        if (t === AIR || t === SPIKE) { seen.add(k); queue.push([nx, ny]); }
      }
    }
  }
  return true;
}

const COLOR = { 0: '#1b2033', 1: '#4a5170', 2: '#5ec8e8', 3: '#e0443a', 4: '#b98a45', 5: '#7fa8e0' };

// Draw part of the map. (c0, r0) is the top-left tile shown, px = pixels per tile.
export function drawMap(ctx, c0, r0, cols, rows, px, ox, oy, playerTile, itemsLeft, markers) {
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let y = r0; y < r0 + rows; y++) {
    for (let x = c0; x < c0 + cols; x++) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS || !explored[y * COLS + x]) continue;
      ctx.fillStyle = COLOR[tileAt(x, y)];
      ctx.fillRect(ox + (x - c0) * px, oy + (y - r0) * px, px, px);
    }
  }
  const dot = (c, r, color, size) => {
    if (c < c0 || r < r0 || c >= c0 + cols || r >= r0 + rows || !explored[r * COLS + c]) return;
    ctx.fillStyle = color;
    const s = Math.max(2, px * size);
    ctx.fillRect(ox + (c - c0 + 0.5) * px - s / 2, oy + (r - r0 + 0.5) * px - s / 2, s, s);
  };
  CHECKPOINTS.forEach(([c, r]) => dot(c, r, '#5cf08a', 0.9));
  itemsLeft.forEach(({ c, r }) => dot(c, r, '#ffd24a', 1.1));
  ctx.fillStyle = '#fff';
  const s = Math.max(3, px * 1.3);
  ctx.fillRect(ox + (playerTile[0] - c0 + 0.5) * px - s / 2, oy + (playerTile[1] - r0 + 0.5) * px - s / 2, s, s);
}

export const exploredPercent = () => {
  let open = 0, seen = 0;
  for (let i = 0; i < COLS * ROWS; i++) if (grid0(i)) { open++; if (explored[i]) seen++; }
  return Math.round((100 * seen) / open);
};
const grid0 = (i) => tileAt(i % COLS, Math.floor(i / COLS)) !== 1 && tileAt(i % COLS, Math.floor(i / COLS)) !== SLICK;
