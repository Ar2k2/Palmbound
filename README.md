# Palmbound
Greatness abounds from my generous hands

## Palmbound

A browser game: a broken robot hand crawls through a cave map, collects abilities and fights three bosses. three.js + Vite.

```bash
cd robot-hand
npm install
npm run dev      # play at http://localhost:5173  (add ?quality=low on a slow graphics card)
npm test         # sanity checks on the hand-made world data
npm run build
```

**Controls:** arrows / WASD move and climb · Space or Z hop and glide · X or Shift dash · click or F shoot (aim with the mouse) · Down in mid-air slam · M map · R back to the last station (hold R to go to the start).

**Playtest bot (dev server only):** open `http://localhost:5173/?bot`, then in the console run `await __bot.gates()` to re-check that every progression gate is still reachable after a map change (`__bot.gates('hollows')` runs one). `?start=dash` starts with an ability for testing.
