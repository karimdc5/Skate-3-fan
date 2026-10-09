import * as THREE from 'three';

// Grind sparks and landing dust as a small pooled particle system.
export class Particles {
  constructor(scene, max = 300) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.07, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -999;
  }

  emit(p, n, { speed = 2, up = 1.5, color = [1, 0.7, 0.2], life = 0.4, spread = 1 } = {}) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y + 0.05; this.pos[i * 3 + 2] = p.z;
      this.vel[i * 3] = (Math.random() - 0.5) * speed * spread;
      this.vel[i * 3 + 1] = Math.random() * up;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * speed * spread;
      this.col[i * 3] = color[0]; this.col[i * 3 + 1] = color[1]; this.col[i * 3 + 2] = color[2];
      this.life[i] = life * (0.5 + Math.random() * 0.5);
    }
  }

  sparks(p, railKind, s) {
    if (railKind === 'rail' || railKind === 'coping') this.emit(p, 2, { speed: 2.5 + Math.abs(s) * 0.2, up: 1.6 });
    else if (Math.random() < 0.4) this.emit(p, 1, { speed: 1, up: 0.5, color: [0.5, 0.48, 0.44], life: 0.5 });
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.vel[i * 3 + 1] -= 9 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = Math.min(1, this.life[i] * 3);
      this.col[i * 3] *= 0.98 + 0.02 * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
