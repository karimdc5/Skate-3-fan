import * as THREE from 'three';

// Replay editor: the last 20 seconds of your session are always recorded.
// Open it to scrub, slow down, change camera, and take a magazine cover photo.

const SECONDS = 20;
const tmpQ = new THREE.Vector3();
const fwd = new THREE.Vector3();

export class Replay {
  constructor(skater, camera, canvas) {
    this.skater = skater;
    this.camera = camera;
    this.size = skater.snapshotSize;
    this.cap = 60 * SECONDS;
    this.buf = new Float32Array(this.cap * this.size);
    this.times = new Float64Array(this.cap);
    this.head = 0;
    this.count = 0;
    this.clock = 0;
    this.active = false;
    this.playing = true;
    this.speed = 1;
    this.cam = 'follow';
    this.orbit = { yaw: 0.8, pitch: 0.35 };
    this.tmp = new Float32Array(this.size);
    this.saved = new Float32Array(this.size);
    this.onExit = null;

    const $ = id => document.getElementById(id);
    this.ui = $('replayUI');
    this.frame = $('photoFrame');
    this.scrub = $('rScrub');
    this.timeEl = $('rTime');
    this.playBtn = $('rPlay');
    this.playBtn.addEventListener('click', () => { this.playing = !this.playing; this.playBtn.textContent = this.playing ? '❚❚' : '▶'; });
    this.scrub.addEventListener('input', () => {
      this.playing = false;
      this.playBtn.textContent = '▶';
      this.playT = this.start + (this.end - this.start) * (+this.scrub.value / 1000);
    });
    $('rSpeed').addEventListener('change', e => { this.speed = +e.target.value; });
    $('rCam').addEventListener('change', e => { this.cam = e.target.value; this.setTripod(); });
    $('rPhoto').addEventListener('click', () => this.photo(true));
    this.frame.addEventListener('click', () => this.photo(false));
    $('rExit').addEventListener('click', () => this.close());

    // drag to orbit
    let drag = null;
    canvas.addEventListener('pointerdown', e => { if (this.active) drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointermove', e => {
      if (!drag || !this.active) return;
      this.orbit.yaw -= (e.clientX - drag.x) * 0.01;
      this.orbit.pitch = Math.max(-0.1, Math.min(1.3, this.orbit.pitch + (e.clientY - drag.y) * 0.01));
      drag = { x: e.clientX, y: e.clientY };
      if (this.cam !== 'orbit') { this.cam = 'orbit'; $('rCam').value = 'orbit'; }
    });
    window.addEventListener('pointerup', () => { drag = null; });
  }

  get duration() {
    return this.count ? this.end - this.start : 0;
  }

  record(dt) {
    if (this.active) return;
    this.clock += dt;
    this.skater.snapshot(this.buf.subarray(this.head * this.size, (this.head + 1) * this.size));
    this.times[this.head] = this.clock;
    this.head = (this.head + 1) % this.cap;
    this.count = Math.min(this.cap, this.count + 1);
  }

  index(k) {
    // k-th oldest frame -> ring buffer slot
    return (this.head - this.count + k + this.cap) % this.cap;
  }

  open() {
    if (this.count < 10) return false;
    this.active = true;
    this.skater.snapshot(this.saved);
    this.start = this.times[this.index(0)];
    this.end = this.times[this.index(this.count - 1)];
    this.playT = this.start;
    this.playing = true;
    this.playBtn.textContent = '❚❚';
    this.ui.classList.remove('hidden');
    this.setTripod();
    return true;
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.photo(false);
    this.ui.classList.add('hidden');
    this.skater.restore(this.saved);
    this.camera.fov = 72;
    this.camera.updateProjectionMatrix();
    if (this.onExit) this.onExit();
  }

  photo(on) {
    this.frame.classList.toggle('hidden', !on);
    this.ui.classList.toggle('hidden', on || !this.active);
    if (on) {
      this.playing = false;
      this.playBtn.textContent = '▶';
      const line = document.getElementById('line').textContent.split(/\d/)[0].trim();
      document.getElementById('magCover').textContent = this.coverText || line || 'SESSION KING';
    }
  }

  setTripod() {
    const r = this.skater.root.position;
    this.tripod = new THREE.Vector3(r.x + 5, r.y + 1.6, r.z + 5);
  }

  // binary search the frame at time t
  frameAt(t) {
    let lo = 0, hi = this.count - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.times[this.index(mid)] <= t) lo = mid; else hi = mid;
    }
    return lo;
  }

  update(dt) {
    if (!this.active) return;
    if (this.playing) {
      this.playT += dt * this.speed;
      if (this.playT > this.end) this.playT = this.start;
    }
    const k = this.frameAt(this.playT);
    const a = this.index(k), b = this.index(Math.min(this.count - 1, k + 1));
    const ta = this.times[a], tb = this.times[b];
    const f = tb > ta ? Math.min(1, Math.max(0, (this.playT - ta) / (tb - ta))) : 0;
    const A = a * this.size, B = b * this.size;
    for (let i = 0; i < this.size; i += 7) {
      for (let j = 0; j < 3; j++) this.tmp[i + j] = this.buf[A + i + j] + (this.buf[B + i + j] - this.buf[A + i + j]) * f;
      THREE.Quaternion.slerpFlat(this.tmp, i + 3, this.buf, A + i + 3, this.buf, B + i + 3, f);
    }
    this.skater.restore(this.tmp);
    this.scrub.value = Math.round((this.playT - this.start) / Math.max(0.001, this.end - this.start) * 1000);
    this.timeEl.textContent = `${(this.playT - this.start).toFixed(1)}s / ${(this.end - this.start).toFixed(1)}s`;
    this.placeCamera();
  }

  placeCamera() {
    const cam = this.camera;
    const root = this.skater.root;
    const p = root.position;
    fwd.set(0, 0, 1).applyQuaternion(root.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, 1);
    fwd.normalize();
    let fov = 70;
    if (this.cam === 'follow') {
      cam.position.set(p.x - fwd.x * 3.6, p.y + 1.3, p.z - fwd.z * 3.6);
    } else if (this.cam === 'orbit') {
      const { yaw, pitch } = this.orbit;
      cam.position.set(p.x + Math.sin(yaw) * Math.cos(pitch) * 4, p.y + 0.8 + Math.sin(pitch) * 4, p.z + Math.cos(yaw) * Math.cos(pitch) * 4);
    } else if (this.cam === 'tripod') {
      cam.position.copy(this.tripod);
      fov = 55;
    } else if (this.cam === 'low') {
      // classic skate-video fisheye: low and close
      tmpQ.set(-fwd.z, 0, fwd.x);
      cam.position.set(p.x + tmpQ.x * 1.3 - fwd.x * 0.6, p.y + 0.25, p.z + tmpQ.z * 1.3 - fwd.z * 0.6);
      fov = 105;
    }
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.lookAt(p.x, p.y + 0.8, p.z);
  }
}
