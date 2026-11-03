import * as THREE from 'three';

// soft round blob used for glows, sparks and dust
let blob;
export function glowTexture() {
  if (blob) return blob;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  blob = new THREE.CanvasTexture(c);
  blob.colorSpace = THREE.SRGBColorSpace;
  return blob;
}

// an additive halo sprite: cheap light that the bloom pass turns into a proper glow
export function makeGlow(color, size, opacity = 0.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.setScalar(size);
  return s;
}

// A pool of sparks. Positions are in game coordinates (y down), so call sites match the physics.
export function makeParticles(scene, max = 500) {
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const base = new Float32Array(max * 3);
  const vel = new Float32Array(max * 2);
  const life = new Float32Array(max);
  const total = new Float32Array(max).fill(1);
  const grav = new Float32Array(max);
  let next = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 5, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  scene.add(points);

  const tmp = new THREE.Color();
  function burst(x, y, color, n, speed, seconds, gravity = 0, spreadY = 1) {
    tmp.set(color);
    for (let k = 0; k < n; k++) {
      const i = next;
      next = (next + 1) % max;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      pos[i * 3] = x + (Math.random() - 0.5) * 6;
      pos[i * 3 + 1] = -(y + (Math.random() - 0.5) * 6);
      pos[i * 3 + 2] = 16 + Math.random() * 14;
      vel[i * 2] = Math.cos(a) * s;
      vel[i * 2 + 1] = Math.sin(a) * s * spreadY; // game space: +y is down
      life[i] = total[i] = seconds * (0.6 + Math.random() * 0.4);
      grav[i] = gravity;
      base.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
  }

  function update(dt) {
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
      life[i] -= dt;
      vel[i * 2 + 1] += grav[i] * dt;
      pos[i * 3] += vel[i * 2] * dt;
      pos[i * 3 + 1] -= vel[i * 2 + 1] * dt;
      const f = Math.max(0, life[i] / total[i]);
      col[i * 3] = base[i * 3] * f;
      col[i * 3 + 1] = base[i * 3 + 1] * f;
      col[i * 3 + 2] = base[i * 3 + 2] * f;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return { burst, update };
}
