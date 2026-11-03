// All sound is synthesised with WebAudio, so there are no audio files to load.
// Browsers only allow sound after a key press, so start() is called from the first input.

let ctx, master, musicBus, sfxBus, reverbIn, pluckBus, windGain, humGain, humPan;
let noiseBuf;
let musicOn = true;
let sfxOn = true;
let intensity = 0.3; // 0..1, rises as you collect upgrades
let started = false;

const now = () => ctx.currentTime;
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function noiseBuffer(seconds) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function reverbImpulse(seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

// one shaped oscillator note. f2 = slide to this pitch, vib = {rate, depth} wobble, rev = reverb amount
function tone({ type = 'sine', f = 440, f2, t = 0, dur = 0.2, vol = 0.2, attack = 0.004, bus, vib, rev = 0, curve = 'exp' }) {
  const t0 = now() + t;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency[curve === 'exp' ? 'exponentialRampToValueAtTime' : 'linearRampToValueAtTime'](f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(bus || sfxBus);
  if (rev) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(reverbIn); }
  if (vib) {
    const l = ctx.createOscillator();
    const lg = ctx.createGain();
    l.frequency.value = vib.rate;
    lg.gain.value = vib.depth;
    l.connect(lg);
    lg.connect(o.frequency);
    l.start(t0);
    l.stop(t0 + dur + 0.05);
  }
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// a burst of filtered noise. f2 = filter sweep target
function noise({ type = 'bandpass', f = 1000, f2, q = 1, t = 0, dur = 0.2, vol = 0.2, attack = 0.003, bus, rev = 0 }) {
  const t0 = now() + t;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t0);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl);
  fl.connect(g);
  g.connect(bus || sfxBus);
  if (rev) { const r = ctx.createGain(); r.gain.value = rev; g.connect(r); r.connect(reverbIn); }
  s.start(t0, Math.random() * 1.5);
  s.stop(t0 + dur + 0.05);
}

// ---------------------------------------------------------------
// SOUND EFFECTS
// ---------------------------------------------------------------
const SFX = {
  tap: (kind = 'ground', v = 1) => {
    const hi = kind === 'ground' ? 0 : kind === 'grip' ? 500 : 250;
    noise({ type: 'highpass', f: 3200 + Math.random() * 1500, dur: 0.035, vol: 0.05 * v });
    tone({ type: 'triangle', f: 520 + hi + Math.random() * 120, f2: 240, dur: 0.045, vol: 0.05 * v });
  },
  hop: () => {
    tone({ type: 'sine', f: 190, f2: 560, dur: 0.24, vol: 0.2, vib: { rate: 30, depth: 40 } });
    tone({ type: 'triangle', f: 380, f2: 1100, dur: 0.16, vol: 0.06 });
    noise({ type: 'highpass', f: 4000, dur: 0.05, vol: 0.05 });
  },
  airhop: () => {
    tone({ type: 'sine', f: 330, f2: 900, dur: 0.22, vol: 0.17, vib: { rate: 36, depth: 60 } });
    tone({ type: 'sine', f: 1500, f2: 2400, dur: 0.18, vol: 0.05, rev: 0.4 });
  },
  walljump: () => {
    SFX.hop();
    noise({ type: 'bandpass', f: 1800, dur: 0.08, vol: 0.1 });
  },
  land: (v = 1) => {
    tone({ type: 'sine', f: 120, f2: 45, dur: 0.18, vol: 0.28 * v });
    noise({ type: 'lowpass', f: 1400, f2: 200, dur: 0.14, vol: 0.2 * v });
  },
  grip: () => {
    noise({ type: 'bandpass', f: 1800, dur: 0.05, vol: 0.12 });
    tone({ type: 'square', f: 330, f2: 110, dur: 0.07, vol: 0.05 });
  },
  dash: () => {
    noise({ type: 'bandpass', f: 400, f2: 3200, q: 0.8, dur: 0.3, vol: 0.28, attack: 0.02 });
    tone({ type: 'sawtooth', f: 110, f2: 340, dur: 0.28, vol: 0.09 });
    tone({ type: 'sine', f: 70, f2: 40, dur: 0.3, vol: 0.2 });
  },
  crack: () => {
    noise({ type: 'lowpass', f: 2200, f2: 120, dur: 0.7, vol: 0.55 });
    tone({ type: 'sine', f: 90, f2: 28, dur: 0.6, vol: 0.4 });
    for (let k = 0; k < 6; k++) noise({ type: 'bandpass', f: 800 + Math.random() * 2500, dur: 0.06, vol: 0.18, t: 0.05 + k * 0.07 + Math.random() * 0.05, q: 2 });
  },
  zap: () => {
    tone({ type: 'square', f: 1000, f2: 90, dur: 0.26, vol: 0.14 });
    noise({ type: 'bandpass', f: 2600, dur: 0.22, vol: 0.16, q: 3 });
  },
  droneDie: () => {
    noise({ type: 'lowpass', f: 3500, f2: 160, dur: 0.55, vol: 0.4 });
    tone({ type: 'sawtooth', f: 320, f2: 38, dur: 0.5, vol: 0.18 });
    tone({ type: 'sine', f: 1800, f2: 300, dur: 0.12, vol: 0.1 });
  },
  die: () => {
    tone({ type: 'sawtooth', f: 440, f2: 36, dur: 0.55, vol: 0.2 });
    noise({ type: 'lowpass', f: 2000, f2: 100, dur: 0.5, vol: 0.3 });
    tone({ type: 'square', f: 90, f2: 30, dur: 0.4, vol: 0.18, t: 0.05 });
  },
  respawn: () => {
    tone({ type: 'sine', f: 220, f2: 880, dur: 0.35, vol: 0.12, rev: 0.4 });
    tone({ type: 'triangle', f: 660, f2: 1320, dur: 0.3, vol: 0.05, t: 0.08, rev: 0.4 });
  },
  plating: () => {
    noise({ type: 'bandpass', f: 3200, dur: 0.12, vol: 0.2, q: 2 });
    tone({ type: 'triangle', f: 700, f2: 330, dur: 0.25, vol: 0.18, rev: 0.25 });
    tone({ type: 'square', f: 1180, f2: 600, dur: 0.12, vol: 0.05 });
  },
  station: () => {
    [880, 1318.5].forEach((f, k) => tone({ type: 'sine', f, dur: 1.2, vol: 0.13, t: k * 0.14, rev: 0.6 }));
    tone({ type: 'sine', f: 110, f2: 220, dur: 0.9, vol: 0.12 });
  },
  pickup: () => {
    [0, 4, 7, 12, 16].forEach((s, k) => tone({ type: 'triangle', f: hz(76 + s), dur: 0.5, vol: 0.12, t: k * 0.07, rev: 0.5 }));
  },
  ability: () => {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, k) => {
      tone({ type: 'triangle', f: hz(64 + s), dur: 0.9, vol: 0.13, t: k * 0.09, rev: 0.6 });
      tone({ type: 'sine', f: hz(76 + s), dur: 1.3, vol: 0.05, t: k * 0.09, rev: 0.7 });
    });
    tone({ type: 'sawtooth', f: hz(40), dur: 1.6, vol: 0.1, attack: 0.3 });
  },
  core: () => {
    [0, 7, 12, 16, 19, 24, 28].forEach((s, k) => tone({ type: 'sawtooth', f: hz(48 + s), dur: 5, vol: 0.07, attack: 1.2, t: k * 0.15, rev: 0.8 }));
    [0, 4, 7, 12, 16, 19, 24, 28].forEach((s, k) => tone({ type: 'sine', f: hz(72 + s), dur: 2.5, vol: 0.09, t: 0.4 + k * 0.12, rev: 0.9 }));
  },
  map: (open = true) => {
    tone({ type: 'sine', f: open ? 440 : 660, f2: open ? 660 : 440, dur: 0.12, vol: 0.1 });
  },
  drip: () => {
    const f = 1200 + Math.random() * 1200;
    tone({ type: 'sine', f, f2: f * 0.55, dur: 0.12, vol: 0.05, rev: 0.7 });
  },
};

export function sfx(name, ...args) {
  if (!ctx || !sfxOn || ctx.state !== 'running') return;
  SFX[name]?.(...args);
}

// continuous sounds, steered every frame: gliding wind and the buzz of the nearest drone
export function ambient({ gliding, droneDist, dronePan }) {
  if (!ctx) return;
  windGain.gain.setTargetAtTime(sfxOn && gliding ? 0.09 : 0, now(), 0.12);
  const near = sfxOn && droneDist < 340 ? Math.pow(1 - droneDist / 340, 1.6) * 0.1 : 0;
  humGain.gain.setTargetAtTime(near, now(), 0.1);
  humPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, dronePan)), now(), 0.1);
}

export function setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); }

export function toggleMusic() {
  musicOn = !musicOn;
  if (ctx) musicBus.gain.setTargetAtTime(musicOn ? 0.55 : 0, now(), 0.3);
  return musicOn;
}
export function toggleSfx() {
  sfxOn = !sfxOn;
  return sfxOn;
}

// ---------------------------------------------------------------
// MUSIC: a slow minor-key loop. Pad + bass change chords every two bars; a plucked arpeggio
// echoes over the top and gets busier as you collect upgrades.
// ---------------------------------------------------------------
const BPM = 80;
const STEP = 60 / BPM / 2; // an eighth note
const CHORDS = [
  { bass: 38, pad: [50, 53, 57, 60], arp: [62, 65, 69, 72, 74, 77] },  // D minor
  { bass: 34, pad: [50, 53, 57, 58], arp: [58, 62, 65, 69, 74, 77] },  // B-flat major 7
  { bass: 43, pad: [53, 55, 58, 62], arp: [58, 62, 65, 67, 70, 74] },  // G minor 7
  { bass: 36, pad: [52, 55, 59, 62], arp: [60, 64, 67, 71, 72, 76] },  // C major 9
];
const PHRASE = [0, -1, 2, -1, 1, -1, 3, 2, 4, -1, 2, -1, 5, 3, 2, -1];
let nextTime = 0;
let step = 0;

function pad(chord, t, len) {
  chord.pad.forEach((m) => {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.value = hz(m);
      o.detune.value = det;
      f.type = 'lowpass';
      f.frequency.value = 650 + intensity * 500;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.028, t + 1.6);
      g.gain.setValueAtTime(0.028, t + len - 1.2);
      g.gain.linearRampToValueAtTime(0.0001, t + len + 1.8);
      o.connect(f); f.connect(g); g.connect(musicBus);
      o.start(t); o.stop(t + len + 2);
    }
  });
}

function musicNote({ type, f, t, dur, vol, bus }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + 0.05);
}

function playStep(s, t) {
  const inChord = s % 16;
  const chord = CHORDS[Math.floor(s / 16) % CHORDS.length];
  if (inChord === 0) {
    pad(chord, t, STEP * 16);
    musicNote({ type: 'sine', f: hz(chord.bass), t, dur: STEP * 14, vol: 0.22, bus: musicBus });
    musicNote({ type: 'triangle', f: hz(chord.bass + 12), t, dur: STEP * 6, vol: 0.05, bus: musicBus });
  }
  const idx = PHRASE[inChord];
  if (idx >= 0 && Math.random() < 0.55 + intensity * 0.4) {
    const m = chord.arp[idx];
    const v = (0.05 + intensity * 0.06) * (0.7 + Math.random() * 0.5);
    musicNote({ type: 'triangle', f: hz(m), t, dur: 0.5, vol: v, bus: pluckBus });
    musicNote({ type: 'sine', f: hz(m + 12), t, dur: 0.25, vol: v * 0.4, bus: pluckBus });
  }
  if (inChord % 8 === 0) { // soft heartbeat on every bar
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    g.gain.setValueAtTime(0.18 * (0.4 + intensity * 0.6), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + 0.35);
  }
  if (intensity > 0.45 && s % 2 === 1) { // little hat once things pick up
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    f.type = 'highpass';
    f.frequency.value = 7500;
    g.gain.setValueAtTime(0.025 * intensity, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f); f.connect(g); g.connect(musicBus);
    src.start(t, Math.random()); src.stop(t + 0.06);
  }
  if (Math.random() < 0.05) { // a rare high bell
    const m = chord.arp[Math.floor(Math.random() * chord.arp.length)] + 12;
    musicNote({ type: 'sine', f: hz(m), t, dur: 2.2, vol: 0.04, bus: pluckBus });
  }
}

function tick() {
  if (ctx.state !== 'running') return;
  if (nextTime < now()) nextTime = now() + 0.05;
  while (nextTime < now() + 1.2) {
    playStep(step++, nextTime);
    nextTime += STEP;
  }
  if (Math.random() < 0.03 && sfxOn) SFX.drip();
}

export function start() {
  if (started) { if (ctx.state === 'suspended') ctx.resume(); return; }
  started = true;
  ctx = new (window.AudioContext || window.webkitAudioContext)();

  const comp = ctx.createDynamicsCompressor();
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(comp);
  comp.connect(ctx.destination);

  noiseBuf = noiseBuffer(2);

  const verb = ctx.createConvolver();
  verb.buffer = reverbImpulse(3.2, 2.6);
  reverbIn = ctx.createGain();
  reverbIn.gain.value = 1;
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.7;
  reverbIn.connect(verb); verb.connect(verbOut); verbOut.connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = musicOn ? 0.55 : 0;
  const musicSend = ctx.createGain();
  musicSend.gain.value = 0.5;
  musicBus.connect(master); musicBus.connect(musicSend); musicSend.connect(reverbIn);

  // the arpeggio gets its own bus with a dotted-eighth echo
  pluckBus = ctx.createGain();
  pluckBus.connect(musicBus);
  const delay = ctx.createDelay(2);
  delay.delayTime.value = STEP * 3;
  const fb = ctx.createGain();
  fb.gain.value = 0.42;
  const dl = ctx.createBiquadFilter();
  dl.type = 'lowpass';
  dl.frequency.value = 2400;
  pluckBus.connect(delay); delay.connect(dl); dl.connect(fb); fb.connect(delay); dl.connect(musicBus);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.9;
  const sfxSend = ctx.createGain();
  sfxSend.gain.value = 0.18;
  sfxBus.connect(master); sfxBus.connect(sfxSend); sfxSend.connect(reverbIn);

  // glide wind: looping noise through a band filter
  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuf; wind.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = 'bandpass'; wf.frequency.value = 700; wf.Q.value = 0.5;
  windGain = ctx.createGain(); windGain.gain.value = 0;
  wind.connect(wf); wf.connect(windGain); windGain.connect(sfxBus);
  wind.start();

  // drone buzz: two detuned saws with a wobble
  const hum = ctx.createGain();
  humGain = ctx.createGain(); humGain.gain.value = 0;
  humPan = ctx.createStereoPanner();
  const hf = ctx.createBiquadFilter();
  hf.type = 'lowpass'; hf.frequency.value = 900;
  [140, 143.5].forEach((f) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f;
    o.connect(hum); o.start();
  });
  const lfo = ctx.createOscillator();
  const lg = ctx.createGain();
  lfo.frequency.value = 9; lg.gain.value = 0.35;
  lfo.connect(lg); lg.connect(hum.gain); hum.gain.value = 0.65; lfo.start();
  hum.connect(hf); hf.connect(humGain); humGain.connect(humPan); humPan.connect(sfxBus);

  nextTime = now() + 0.2;
  setInterval(tick, 100);
  tick();
}
