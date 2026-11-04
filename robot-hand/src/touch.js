// On-screen controls for phones. They feed the same key set the keyboard uses, so no game code knows the difference.
// Left: a slide-anywhere pad (arrows, diagonals for climbing). Right: Jump, Dash, Fire. Top: Map.
const DEAD = 16; // px from the pad centre before a direction counts

export function setupTouch(keyDown, keyUp) {
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div class="pad"><b class="u">▲</b><b class="l">◀</b><b class="r">▶</b><b class="d">▼</b></div>
    <button data-k="KeyF" class="act fire">FIRE</button>
    <button data-k="KeyX" class="act dash">DASH</button>
    <button data-k="Space" class="act jump">JUMP</button>
    <button data-k="KeyM" class="act map">MAP</button>`;
  document.body.appendChild(root);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  // action buttons: held while a finger is on them, each finger independent
  for (const btn of root.querySelectorAll('button')) {
    const code = btn.dataset.k;
    const up = (e) => { if (btn.classList.contains('on')) { btn.classList.remove('on'); keyUp(code); } e.preventDefault(); };
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch { /* pointer already gone: still press */ } btn.classList.add('on'); keyDown(code); });
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  }

  // the pad: direction from where the finger is relative to the pad's centre
  const pad = root.querySelector('.pad');
  const arrows = { ArrowLeft: pad.querySelector('.l'), ArrowRight: pad.querySelector('.r'), ArrowUp: pad.querySelector('.u'), ArrowDown: pad.querySelector('.d') };
  let active = new Set();
  const apply = (next) => {
    for (const k of active) if (!next.has(k)) { keyUp(k); arrows[k].classList.remove('on'); }
    for (const k of next) if (!active.has(k)) { keyDown(k); arrows[k].classList.add('on'); }
    active = next;
  };
  const aim = (e) => {
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const next = new Set();
    if (dx < -DEAD) next.add('ArrowLeft'); else if (dx > DEAD) next.add('ArrowRight');
    if (dy < -DEAD) next.add('ArrowUp'); else if (dy > DEAD) next.add('ArrowDown');
    apply(next);
  };
  let finger = null; // the one pointer steering the pad
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); if (finger !== null) return; finger = e.pointerId; try { pad.setPointerCapture(e.pointerId); } catch { /* see above */ } aim(e); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === finger) aim(e); });
  const release = (e) => { if (e.pointerId !== finger) return; finger = null; apply(new Set()); e.preventDefault(); };
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);
}
