import * as THREE from 'three';
import { TRICKS, FINGERFLIPS, trickLabel } from './tricks.js';
import { rumble } from './gamepad.js';

const G = 14;              // gravity (a bit stronger than real for snappy air)
const POP = 5.6;           // ollie pop speed
const MAX_PUSH_SPEED = 10.5;
const MAX_SPEED = 24;
const STEP_UP = 0.22;      // highest curb you can roll up
const WALK_STEP = 0.55;    // highest step you can walk up
const THIGH = 0.42;
const SHIN = 0.42;
const DEG = 180 / Math.PI;

const BONES = ['Skull', 'Jaw', 'Collarbone', 'Left Wrist', 'Right Wrist', 'Left Forearm', 'Right Forearm',
  'Ribs', 'Pelvis', 'Tailbone', 'Left Femur', 'Right Femur', 'Left Kneecap', 'Right Kneecap', 'Left Ankle',
  'Right Ankle', 'Spine', 'Nose', 'Left Shoulder', 'Right Shoulder'];

export const DEFAULT_LOOK = {
  shirt: '#d62828', pants: '#1d3557', skin: '#e0ac69', shoes: '#f1f1f1', cap: '#111111', deck: '#ffcc00', stance: 'regular',
};

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const mtx = new THREE.Matrix4();
const qTarget = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();
const qRoll = new THREE.Quaternion();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8 }, extra));
}

export class Skater {
  constructor(scene, world, sound, score, { npc = false } = {}) {
    this.world = world;
    this.sound = sound;
    this.score = score;
    this.isNpc = npc;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.heading = 0;
    this.mode = 'ground';   // ground | air | grind | walk | bail
    this.fakie = false;

    this.flip = null;
    this.grab = null;
    this.grind = null;
    this.manual = null;
    this.wallride = null;
    this.airSpin = 0;
    this.airTime = 0;
    this.takeoffY = 0;
    this.takeoffPos = new THREE.Vector3();
    this.maxY = 0;
    this.vertAir = false;
    this.grindBlock = 0;
    this.pushCooldown = 0;
    this.pushAnim = 0;
    this.crouch = 0;
    this.landSquash = 0;
    this.sinceLand = 9;
    this.visYaw = 0;
    this.bailT = 0;
    this.bailReason = '';
    this.safeTimer = 0;
    this.lastSafe = { pos: new THREE.Vector3(), heading: 0 };
    this.marker = null;
    this.powerslide = 0;
    this.slideScored = false;
    this.touchMode = false;
    this.walkPhase = 0;
    this.walkSpeed = 0;
    this.shake = 0;
    this.onGrindFx = null;
    this.onBail = null;

    this.buildModel();
    scene.add(this.root);
  }

  // ---------------- model ----------------
  buildModel() {
    this.root = new THREE.Group();
    this.mats = {
      shirt: mat(0xd62828), pants: mat(0x1d3557), skin: mat(0xe0ac69), shoes: mat(0xf1f1f1),
      cap: mat(0x111111), deck: mat(0xffcc00), grip: mat(0x1b1b1b),
    };
    const M = this.mats;

    // board
    this.boardPivot = new THREE.Group();
    this.boardPivot.rotation.order = 'YXZ';
    this.boardPivot.position.y = 0.11;
    const board = new THREE.Group();
    const deckMats = [M.deck, M.deck, M.grip, M.deck, M.deck, M.deck];
    board.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.6), deckMats));
    for (const s of [1, -1]) {
      const kick = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.13), deckMats);
      kick.position.set(0, 0.022, s * 0.355);
      kick.rotation.x = -s * 0.35;
      board.add(kick);
      const truck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.05), mat(0xcfd3da, { metalness: 0.8, roughness: 0.3 }));
      truck.position.set(0, -0.03, s * 0.21);
      board.add(truck);
      for (const x of [0.085, -0.085]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 10), mat(0xf5f0e1));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, -0.072, s * 0.21);
        board.add(wheel);
      }
    }
    board.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.boardPivot.add(board);
    this.root.add(this.boardPivot);

    // body (faces local -x, board nose is +z; goofy mirrors it)
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.hips = new THREE.Group();
    this.body.add(this.hips);
    this.hips.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.34), M.pants));

    this.legs = [];
    for (const side of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.set(0, 0, side * 0.11);
      this.body.add(hip);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, THIGH, 0.13), M.pants);
      thigh.position.y = -THIGH / 2;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      hip.add(knee);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.11, SHIN, 0.11), M.pants);
      shin.position.y = -SHIN / 2;
      knee.add(shin);
      const foot = new THREE.Group();
      foot.position.y = -SHIN;
      knee.add(foot);
      const shoeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.11), M.shoes);
      shoeMesh.position.set(-0.03, -0.03, 0);
      foot.add(shoeMesh);
      this.legs.push({ side, hip, knee, foot, z: side * 0.21 });
    }

    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.52, 0.38), M.shirt);
    chest.position.y = 0.3;
    this.torso.add(chest);
    this.head = new THREE.Group();
    this.head.position.y = 0.7;
    this.torso.add(this.head);
    this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), M.skin));
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.cap);
    capTop.position.y = 0.02;
    this.head.add(capTop);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.015, 0.2), M.cap);
    brim.position.set(-0.15, 0.03, 0);
    this.head.add(brim);

    this.arms = [];
    for (const side of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0, 0.52, side * 0.23);
      this.torso.add(shoulder);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.09), M.shirt);
      upper.position.y = -0.15;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), M.skin);
      fore.position.y = -0.14;
      elbow.add(fore);
      this.arms.push({ side, shoulder, elbow });
    }
    this.body.traverse(o => { if (o.isMesh) o.castShadow = true; });

    // nodes recorded for replays
    this.nodes = [this.root, this.boardPivot, this.body, this.hips, this.torso, this.head];
    for (const l of this.legs) this.nodes.push(l.hip, l.knee, l.foot);
    for (const a of this.arms) this.nodes.push(a.shoulder, a.elbow);
  }

  applyLook(look) {
    const L = Object.assign({}, DEFAULT_LOOK, look);
    for (const k of ['shirt', 'pants', 'skin', 'shoes', 'cap', 'deck']) this.mats[k].color.set(L[k]);
    this.goofy = L.stance === 'goofy';
    this.body.scale.x = this.goofy ? -1 : 1;
  }

  // Replay support: copy every animated node's transform into an array.
  snapshot(out) {
    let i = 0;
    for (const n of this.nodes) {
      out[i++] = n.position.x; out[i++] = n.position.y; out[i++] = n.position.z;
      out[i++] = n.quaternion.x; out[i++] = n.quaternion.y; out[i++] = n.quaternion.z; out[i++] = n.quaternion.w;
    }
    return out;
  }

  restore(arr) {
    let i = 0;
    for (const n of this.nodes) {
      n.position.set(arr[i], arr[i + 1], arr[i + 2]);
      n.quaternion.set(arr[i + 3], arr[i + 4], arr[i + 5], arr[i + 6]);
      i += 7;
    }
  }

  get snapshotSize() {
    return this.nodes.length * 7;
  }

  // ---------------- state helpers ----------------
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  surfaceForward(n, out = new THREE.Vector3()) {
    this.forward(out);
    out.addScaledVector(n, -out.dot(n));
    return out.normalize();
  }

  spawn(pos, heading) {
    this.pos.copy(pos);
    this.pos.y = this.world.heightAt(pos.x, pos.z);
    this.vel.set(0, 0, 0);
    this.heading = heading;
    this.mode = 'ground';
    this.fakie = false;
    this.flip = this.grab = this.grind = this.manual = this.wallride = null;
    this.bailT = 0;
    this.visYaw = 0;
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.boardPivot.rotation.set(0, 0, 0);
    this.boardPivot.position.set(0, 0.11, 0);
    this.world.normalAt(this.pos.x, this.pos.z, this.normal);
    this.up.copy(this.normal);
    this.lastSafe.pos.copy(this.pos);
    this.lastSafe.heading = heading;
    this.score.reset();
  }

  setMarker() {
    if (this.mode !== 'ground' && this.mode !== 'walk') return false;
    this.marker = { pos: this.pos.clone(), heading: this.heading };
    return true;
  }

  toMarker(fallback) {
    const m = this.marker || fallback;
    this.spawn(m.pos, m.heading);
  }

  get speed() {
    return this.vel.length();
  }

  vibrate(s, w, ms) {
    if (!this.isNpc) rumble(s, w, ms);
  }

  // ---------------- main update ----------------
  update(dt, input) {
    this.touchMode = input.source === 'touch';
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.visYaw *= Math.exp(-14 * dt);
    if (Math.abs(this.visYaw) < 0.01) this.visYaw = 0;

    const ev = input.events || new Set();
    if (ev.has('bail') && this.mode !== 'bail' && this.mode !== 'walk') this.bail('Bailed on purpose', Math.max(4, this.speed));
    if (ev.has('offBoard')) this.toggleWalk();

    if (this.mode === 'bail') {
      this.updateBail(dt);
      this.animate(dt, input);
      return;
    }
    if (this.mode === 'walk') {
      this.updateWalk(dt, input);
      this.animate(dt, input);
      return;
    }

    this.pushCooldown -= dt;
    this.pushAnim = Math.max(0, this.pushAnim - dt);
    this.grindBlock -= dt;
    this.sinceLand += dt;
    this.landSquash = Math.max(0, this.landSquash - dt * 3);

    // --- discrete actions ---
    if (input.trick) this.handleTrick(input.trick, input);
    if (ev.has('revert')) this.revert();

    if (this.mode === 'ground') {
      const n = this.normal;
      const fs = this.surfaceForward(n, v1);
      const sp = this.vel.dot(fs);
      const sgn = this.speed < 0.3 ? (this.fakie ? -1 : 1) : Math.sign(sp) || 1;
      const wantPush = input.push || (input.autoPush && this.speed < 7);
      if (wantPush && !this.manual && this.pushCooldown <= 0 && this.speed < MAX_PUSH_SPEED) {
        this.vel.addScaledVector(fs, sgn * (this.speed < 1 ? 3.2 : 2.4));
        this.pushCooldown = 0.5;
        this.pushAnim = 0.45;
      }
      if (input.manualHold && this.speed > 1) {
        if (!this.manual) {
          this.manual = input.manualHold;
          this.score.addTrick(this.manual === 'manual' ? 'Manual' : 'Nose Manual', 50, true);
          this.score.challenge('manual');
        }
      } else if (this.manual) {
        this.manual = null;
      }
    } else {
      this.manual = null;
    }

    if (this.mode === 'air') this.updateGrab(dt, input);

    // --- physics sub-steps ---
    const steps = Math.min(8, Math.ceil(dt / 0.008));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (this.mode === 'ground') this.stepGround(h, input);
      else if (this.mode === 'air') this.stepAir(h, input);
      else if (this.mode === 'grind') this.stepGrind(h, input);
      if (this.mode === 'bail') break;
    }

    if (this.flip && !this.flip.done) {
      this.flip.t += dt;
      if (this.flip.t >= this.flip.dur) this.flip.done = true;
    }

    if (this.mode === 'grind') {
      this.score.tickContinuous(dt, 140);
      if (this.onGrindFx) this.onGrindFx(this.pos, this.grind.rail.kind, this.grind.s);
    } else if (this.manual) this.score.tickContinuous(dt, 110);
    else if (this.grab) this.score.tickContinuous(dt, 160);
    else if (this.wallride) this.score.tickContinuous(dt, 200);
    const busy = this.mode !== 'ground' || !!this.manual || this.powerslide > 0.5;
    this.score.update(dt, busy);

    this.sound.update(this.speed, this.mode === 'ground', this.mode === 'grind');
    this.animate(dt, input);
  }

  handleTrick(ev, input) {
    let key = ev.key;
    const grabHeld = input.grabL > 0.5 || input.grabR > 0.5;
    if (key === 'ollie' && grabHeld && this.mode === 'ground') key = 'boneless';
    const t = TRICKS[key];
    if (!t) return;
    const fakie = this.fakie && this.speed > 1;
    let label = key === 'boneless' ? (fakie ? 'Fakie Boneless' : 'Boneless') : trickLabel(key, ev.nollie, fakie);
    const pts = Math.round(t.pts * (ev.nollie || fakie ? 1.2 : 1));
    const power = ev.power || 1;

    if (this.mode === 'ground' || this.mode === 'grind') {
      if (this.mode === 'ground') {
        this.vel.addScaledVector(this.normal, POP * power * (key === 'boneless' ? 1.2 : 1));
        this.vertAir = false;
      } else {
        this.vel.y = Math.max(this.vel.y, 0) + POP * 0.85 * power;
        this.grindBlock = 0.3;
        this.grind = null;
        if (key === 'ollie') label = 'Ollie Out';
      }
      this.manual = null;
      this.enterAir();
      this.startFlip(t);
      this.score.addTrick(label, pts);
      this.score.challenge('trick', key);
      this.sound.pop();
    } else if (this.mode === 'air' && this.wallride) {
      // wallie: pop off the wall
      const w = this.wallride;
      this.vel.x += w.nx * 3.5;
      this.vel.z += w.nz * 3.5;
      this.vel.y = Math.max(this.vel.y, 0) + POP * 0.8;
      this.wallride = null;
      this.startFlip(t);
      this.score.addTrick(key === 'ollie' ? 'Wallie' : 'Wallie ' + t.name, pts + 200);
      this.sound.pop();
    } else if (this.mode === 'air' && (!this.flip || this.flip.done)) {
      if (this.grab) {
        // flick while grabbing = fingerflip
        this.startFlip(TRICKS[key === 'ollie' ? 'kickflip' : key]);
        this.score.addTrick(FINGERFLIPS[key] || 'Fingerflip', 600);
        this.score.challenge('fingerflip');
      } else if (key !== 'ollie') {
        this.startFlip(t);
        this.score.addTrick('Late ' + label, Math.round(pts * 1.25));
        this.score.challenge('trick', key);
      }
    }
  }

  startFlip(t) {
    this.flip = { roll: t.roll, yaw: t.yaw, pitch: t.pitch || 0, dur: t.dur, t: 0, done: !t.roll && !t.yaw && !t.pitch };
    this.crouch = 1;
  }

  enterAir() {
    this.mode = 'air';
    this.airSpin = 0;
    this.airTime = 0;
    this.takeoffY = this.pos.y;
    this.takeoffPos.copy(this.pos);
    this.maxY = this.pos.y;
    this.wallride = null;
  }

  revert() {
    if (this.mode !== 'ground' || this.speed < 1.5) return;
    if (this.sinceLand > 0.6 && this.normal.y > 0.97) return; // revert as you land or on a transition
    this.heading += Math.PI;
    this.fakie = !this.fakie;
    this.visYaw = -Math.PI;
    this.score.addTrick('Revert', 150);
    this.score.challenge('revert');
    this.sound.land(0.4);
  }

  toggleWalk() {
    if (this.mode === 'walk') {
      // hop back on the board facing the way we were walking
      const dir = this.walkDir || this.forward(v1);
      this.heading = Math.atan2(dir.x, dir.z);
      this.mode = 'ground';
      this.vel.set(dir.x, 0, dir.z).multiplyScalar(Math.min(4, this.walkSpeed));
      this.world.normalAt(this.pos.x, this.pos.z, this.normal);
      this.fakie = false;
      this.sound.land(0.3);
    } else if (this.mode === 'ground' && this.speed < 6) {
      this.mode = 'walk';
      this.manual = null;
      this.walkDir = this.forward(new THREE.Vector3());
      this.walkSpeed = 0;
      this.vel.set(0, 0, 0);
      this.score.landed();
    }
  }

  updateGrab(dt, input) {
    const l = input.grabL > 0.5, r = input.grabR > 0.5;
    if (this.grab) {
      this.grab.time += dt;
      if (!l && !r) {
        if (this.grab.time >= 1) this.score.challenge('grab1');
        this.grab = null;
      }
      return;
    }
    if ((l || r) && (!this.flip || this.flip.done) && !this.wallride) {
      const y = input.move.y, x = input.move.x;
      let name;
      if (r) name = y < -0.5 ? 'Nosegrab' : y > 0.5 ? 'Tailgrab' : Math.abs(x) > 0.5 ? 'Stalefish' : 'Indy';
      else name = y < -0.5 ? 'Crail' : y > 0.5 ? 'Roast Beef' : Math.abs(x) > 0.5 ? 'Method' : 'Melon';
      this.grab = { name, time: 0, hand: r ? 1 : -1 };
      this.score.addTrick(name, 200, true);
    }
  }

  // ---------------- walking (off the board) ----------------
  updateWalk(dt, input) {
    const mx = input.move.x, my = input.move.y;
    const m = Math.min(1, Math.hypot(mx, my));
    const cy = input.camYaw || 0;
    // stick relative to the camera: up = away from camera
    const fwd = v1.set(Math.sin(cy), 0, Math.cos(cy));
    const right = v2.set(-Math.cos(cy), 0, Math.sin(cy));
    const want = v3.set(0, 0, 0).addScaledVector(fwd, -my).addScaledVector(right, mx);
    const run = input.push ? 5.2 : 2.6;
    const target = m > 0.15 ? run * m : 0;
    this.walkSpeed += (target - this.walkSpeed) * (1 - Math.exp(-8 * dt));
    if (m > 0.15) {
      want.normalize();
      this.walkDir.lerp(want, 1 - Math.exp(-10 * dt)).normalize();
    }
    this.walkPhase += dt * this.walkSpeed * 3.2;
    const air = this.pos.y > this.world.heightAt(this.pos.x, this.pos.z) + 0.02;
    if (input.trick && !air) this.vel.y = 4.6; // jump
    this.vel.x = this.walkDir.x * this.walkSpeed;
    this.vel.z = this.walkDir.z * this.walkSpeed;
    this.vel.y -= G * dt;
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const gh = this.world.heightAt(nx, nz);
    if (gh - this.pos.y <= WALK_STEP) {
      this.pos.x = nx; this.pos.z = nz;
    } else {
      this.walkSpeed *= 0.3;
    }
    this.pos.y += this.vel.y * dt;
    const g2 = this.world.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= g2) { this.pos.y = g2; this.vel.y = 0; }
    this.normal.set(0, 1, 0);
    // body faces the walking direction (local -x = walkDir)
    this.heading = Math.atan2(this.walkDir.z, -this.walkDir.x);
    this.score.update(dt, false);
    this.sound.update(0, false, false);
  }

  // ---------------- ground ----------------
  stepGround(h, input) {
    const world = this.world;
    const n = this.normal;
    const sp0 = this.speed;
    const rate = (this.manual ? 1.4 : 2.6) / (1 + sp0 * 0.04);
    this.heading -= input.move.x * rate * h;

    const fs = this.surfaceForward(n, v1);
    v2.set(0, -G, 0);
    v2.addScaledVector(n, -v2.dot(n));
    this.vel.addScaledVector(v2, h);

    // wheel grip: kill sideways motion
    let along = this.vel.dot(fs);
    const lateral = v2.copy(this.vel).addScaledVector(fs, -along);
    lateral.addScaledVector(n, -lateral.dot(n));
    const grip = this.powerslide > 0.3 ? 2 : 14;
    this.vel.addScaledVector(lateral, -(1 - Math.exp(-grip * h)));
    along = this.vel.dot(fs);
    if (Math.abs(along) > 0.5) this.fakie = along < 0;

    // friction, brake / powerslide, drag
    let decel = 0.2 + 0.0016 * along * along;
    if (this.manual) decel += 0.5;
    if (input.brake) {
      const fast = Math.abs(along) > 5;
      decel += fast ? 6 : 8;
      this.powerslide = fast ? Math.min(1, this.powerslide + h * 6) : Math.max(0, this.powerslide - h * 4);
      if (this.powerslide > 0.9 && !this.slideScored) {
        this.slideScored = true;
        this.score.addTrick('Powerslide', 100);
        this.score.challenge('powerslide');
      }
    } else {
      this.powerslide = Math.max(0, this.powerslide - h * 4);
      if (this.powerslide === 0) this.slideScored = false;
    }
    const s = this.vel.length();
    if (s > 0) {
      const ns = Math.max(0, s - decel * h);
      this.vel.multiplyScalar(Math.min(ns, MAX_SPEED) / s);
    }

    const nx = this.pos.x + this.vel.x * h;
    const ny = this.pos.y + this.vel.y * h;
    const nz = this.pos.z + this.vel.z * h;
    const gnd = world.ground(nx, nz);
    if (gnd.h - this.pos.y > STEP_UP) {
      this.collideWall(h, true);
      return;
    }
    if (this.hitRail(nx, this.pos.y, nz)) return;
    // launch when the ground falls away, or when our motion leaves the new
    // surface fast enough (e.g. going up past a quarter-pipe lip)
    const leaving = (this.vel.x * -gnd.gx + this.vel.y - this.vel.z * gnd.gz) / Math.sqrt(gnd.gx * gnd.gx + 1 + gnd.gz * gnd.gz);
    if (ny > gnd.h + 0.06 || (leaving > 3 && n.y < 0.9)) {
      if (n.y < 0.57) this.pos.y = ny; // off a steep lip: stay over the ramp
      else this.pos.set(nx, ny, nz);
      this.launch();
      return;
    }
    this.pos.set(nx, gnd.h, nz);
    n.set(-gnd.gx, 1, -gnd.gz).normalize();
    const mag = this.vel.length();
    this.vel.addScaledVector(n, -this.vel.dot(n));
    const tm = this.vel.length();
    if (tm > 1e-4) this.vel.multiplyScalar(mag / tm);

    this.safeTimer -= h;
    if (this.safeTimer <= 0 && n.y > 0.995 && this.speed < 12) {
      this.safeTimer = 0.5;
      const p = this.pos;
      const flat = [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].every(([dx, dz]) => Math.abs(world.heightAt(p.x + dx, p.z + dz) - p.y) < 0.05);
      if (flat) {
        this.lastSafe.pos.copy(p);
        this.lastSafe.heading = this.heading;
      }
    }
  }

  hitRail(x, y, z) {
    const nr = this.world.nearestRail(v3.set(x, y, z));
    if (!nr || nr.rail.kind !== 'rail') return false;
    const above = nr.point.y - y;
    if (nr.dh < 0.22 && above > 0.25 && above < 1.5 && this.speed > 1.5) {
      this.bail('Hit the rail', this.speed);
      return true;
    }
    return false;
  }

  collideWall(h, grounded) {
    const world = this.world;
    const lim = grounded ? STEP_UP : 0.45;
    const okX = world.heightAt(this.pos.x + this.vel.x * h, this.pos.z) - this.pos.y <= lim;
    const okZ = world.heightAt(this.pos.x, this.pos.z + this.vel.z * h) - this.pos.y <= lim;
    let impact = 0;
    if (!okX) { impact += Math.abs(this.vel.x); this.vel.x *= -0.3; }
    if (!okZ) { impact += Math.abs(this.vel.z); this.vel.z *= -0.3; }
    if (okX && okZ) { impact = Math.hypot(this.vel.x, this.vel.z); this.vel.x *= -0.3; this.vel.z *= -0.3; }
    if (impact > 7) this.bail('Slammed into a wall', impact);
  }

  launch() {
    const n = this.normal;
    if (n.y < 0.57) {
      // straight up off a steep lip so you come back down the ramp
      const ul = Math.hypot(n.x, n.z) || 1;
      const dx = -n.x / ul, dz = -n.z / ul;
      const out = this.vel.x * dx + this.vel.z * dz;
      if (out > 0) {
        this.vel.x -= dx * (out + 0.35);
        this.vel.z -= dz * (out + 0.35);
      }
      this.pos.x -= dx * 0.05;
      this.pos.z -= dz * 0.05;
      this.vertAir = true;
    } else {
      this.vertAir = false;
    }
    this.enterAir();
  }

  // ---------------- air ----------------
  stepAir(h, input) {
    this.airTime += h;
    if (this.wallride) {
      const w = this.wallride;
      w.t += h;
      this.vel.y -= G * 0.3 * h;
      const wh = this.world.heightAt(this.pos.x - w.nx * 1.0, this.pos.z - w.nz * 1.0);
      if (w.t > 0.9 || wh - this.pos.y < 0.5) this.wallride = null;
    } else {
      this.vel.y -= G * h;
      const spin = -input.move.x * 6.4 * h;
      this.heading += spin;
      this.airSpin += spin;
    }

    const nx = this.pos.x + this.vel.x * h;
    const ny = this.pos.y + this.vel.y * h;
    const nz = this.pos.z + this.vel.z * h;
    this.maxY = Math.max(this.maxY, ny);

    // grinds
    if (this.grindBlock <= 0 && this.vel.y < 1.5 && !this.wallride) {
      const nr = this.world.nearestRail(v2.set(nx, ny, nz));
      if (nr && nr.dh < 0.42 && nr.dy > -0.2 && nr.dy < 0.35 + Math.max(0, -this.vel.y * h)) {
        const along = this.vel.x * nr.rail.dir.x + this.vel.z * nr.rail.dir.z;
        const hs = Math.hypot(this.vel.x, this.vel.z);
        const okCoping = nr.rail.kind !== 'coping' || Math.abs(along) > 2.5;
        if (hs > 1 && okCoping) {
          this.startGrind(nr, input);
          return;
        }
      }
    }

    // wallrides: riding along a tall wall in the air
    if (!this.wallride && !this.vertAir && this.airTime > 0.12 && !this.grab) {
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > 4) {
        const px = -this.vel.z / hs, pz = this.vel.x / hs;
        const here = this.world.heightAt(nx, nz);
        for (const side of [1, -1]) {
          const wh = this.world.heightAt(nx + px * side * 0.9, nz + pz * side * 0.9);
          if (wh - ny > 0.9 && wh - here > 1.2) {
            this.wallride = { nx: -px * side, nz: -pz * side, t: 0 };
            this.vel.y = Math.max(this.vel.y, 1.5);
            this.score.addTrick('Wallride', 300, true);
            this.score.challenge('wallride');
            this.sound.land(0.3);
            break;
          }
        }
      }
    }

    const gnd = this.world.ground(nx, nz);
    if (ny <= gnd.h) {
      if (gnd.h - this.pos.y > 0.45) {
        this.pos.y = ny;
        this.collideWall(h, false);
        return;
      }
      this.pos.set(nx, gnd.h, nz);
      this.normal.set(-gnd.gx, 1, -gnd.gz).normalize();
      this.land(input);
      return;
    }
    this.pos.set(nx, ny, nz);
    if (this.pos.y < -5) this.bail('Fell out of the world', 10);
  }

  land() {
    const n = this.normal;
    const vn = this.vel.dot(n);
    const vt = v1.copy(this.vel).addScaledVector(n, -vn);
    const tl = vt.length();
    const keepVert = Math.max(0, -vn) * Math.max(0, 1 - n.y) * 0.9;
    const newSpeed = Math.min(MAX_SPEED, tl * 0.97 + keepVert);
    if (tl > 0.01) this.vel.copy(vt).multiplyScalar(newSpeed / tl);
    else this.vel.set(0, 0, 0);
    this.wallride = null;

    const prog = this.flip && !this.flip.done ? this.flip.t / this.flip.dur : 1;
    if (prog < 0.8) return this.bail("Didn't finish the flip", Math.abs(vn) + newSpeed * 0.5);
    if (this.grab && !this.touchMode) return this.bail('Still grabbing', Math.abs(vn) + newSpeed * 0.5);
    this.grab = null;
    if (-vn > 20) return this.bail('Too much impact', -vn);

    const fs = this.surfaceForward(n, v2);
    const sp = this.vel.length();
    let align = 1;
    if (sp > 1.0) {
      const dir = v1.copy(this.vel).divideScalar(sp);
      const c = dir.dot(fs);
      align = Math.abs(c);
      if (c > 0.6) {
        this.fakie = false;
        if (Math.hypot(dir.x, dir.z) > 0.05) this.heading = Math.atan2(dir.x, dir.z);
      } else if (c < -0.6) {
        this.fakie = true;
        if (Math.hypot(dir.x, dir.z) > 0.05) this.heading = Math.atan2(-dir.x, -dir.z);
      } else {
        return this.bail('Landed sideways', sp);
      }
    }

    // ---- score the air ----
    const deg = Math.round(Math.abs(this.airSpin) * DEG / 180) * 180;
    if (deg >= 180) {
      const name = (this.airSpin > 0 ? 'BS ' : 'FS ') + deg;
      this.score.addTrick(name, Math.round(deg * 1.6));
      this.score.challenge('spin', deg);
    }
    if (this.airTime > 0.9) this.score.addBonus(Math.round(this.airTime * 120));
    const gap = this.world.findGap(this.takeoffPos, this.pos);
    if (gap) {
      this.score.addTrick(gap.name, gap.pts);
      this.score.challenge('gap', gap.name);
    }
    if (this.maxY - this.takeoffY > 3) this.score.challenge('air3');

    const sketchy = prog < 0.97 || align < 0.85;
    this.flip = null;
    this.mode = 'ground';
    this.vertAir = false;
    this.sinceLand = 0;
    this.landSquash = sketchy ? 1.5 : 1;
    this.score.landed({ sketchy, clean: !sketchy && this.airTime > 0.45 });
    const hard = Math.min(1.3, 0.4 + Math.abs(vn) / 12);
    this.shake = Math.max(this.shake, Math.min(1, Math.abs(vn) / 18));
    this.sound.land(hard);
    this.vibrate(0.3 * hard, 0.5 * hard, 90);
  }

  // ---------------- grind ----------------
  startGrind(nr, input) {
    if (this.flip && !this.flip.done && this.flip.t / this.flip.dur < 0.8) {
      this.bail("Didn't finish the flip", this.speed);
      return;
    }
    this.grab = null;
    const rail = nr.rail;
    let s = this.vel.dot(rail.dir);
    if (Math.abs(s) < 2) s = (Math.sign(s) || 1) * 2;
    const f = this.forward(v1);
    const dh = Math.hypot(rail.dir.x, rail.dir.z) || 1;
    const c = Math.abs((f.x * rail.dir.x + f.z * rail.dir.z) / dh);
    const y = input.move.y;
    let name, slide;
    if (c > 0.8) {
      name = y < -0.5 ? 'Nosegrind' : y > 0.5 ? '5-0 Grind' : '50-50 Grind';
      if (rail.kind === 'coping' && y > 0.5) name = 'Smith Grind';
      slide = false;
    } else if (c < 0.45) {
      name = rail.kind === 'rail' ? (y > 0.5 ? 'Lipslide' : 'Boardslide') : (y < -0.5 ? 'Noseslide' : y > 0.5 ? 'Tailslide' : 'Lipslide');
      slide = true;
    } else {
      name = y > 0.5 ? 'Feeble Grind' : y < -0.5 ? 'Overcrook' : 'Crooked Grind';
      slide = false;
    }
    if (this.fakie && this.speed > 1) name = 'Fakie ' + name;
    const rh = Math.atan2(rail.dir.x, rail.dir.z);
    if (slide) this.heading = rh + (Math.sin(this.heading - rh) > 0 ? Math.PI / 2 : -Math.PI / 2);
    else this.heading = Math.cos(this.heading - rh) > 0 ? rh : rh + Math.PI;
    this.grind = { rail, s, t: nr.t, name, slide, time: 0 };
    this.mode = 'grind';
    this.flip = null;
    this.wallride = null;
    this.pos.copy(nr.point);
    this.score.addTrick(name, 150, true);
    this.score.challenge('grind');
    this.sound.land(0.6);
    this.vibrate(0.2, 0.6, 80);
  }

  stepGrind(h) {
    const g = this.grind;
    let r = g.rail;
    g.time += h;
    g.s += -G * r.dir.y * h;
    g.s -= Math.sign(g.s) * (g.slide ? 1.4 : 0.9) * h;
    g.t += (g.s * h) / r.len;
    if (g.time >= 2) this.score.challenge('grind2');
    if (g.t < 0 || g.t > 1) {
      // kinked rails: carry on onto the connected segment
      const next = this.world.connectedRail(r, g.t > 1);
      if (next) {
        const speed = Math.abs(g.s);
        g.rail = r = next.rail;
        g.s = next.t === 0 ? speed : -speed;
        g.t = next.t;
        if (!g.kinked) { g.kinked = true; this.score.addBonus(150); }
      }
    }
    if (g.t < 0 || g.t > 1 || Math.abs(g.s) < 0.35) {
      this.vel.copy(r.dir).multiplyScalar(g.s);
      this.vel.y = Math.max(this.vel.y, 0.6);
      this.grind = null;
      this.grindBlock = 0.35;
      this.enterAir();
      return;
    }
    this.pos.copy(r.a).addScaledVector(r.dir, g.t * r.len);
    this.vel.copy(r.dir).multiplyScalar(g.s);
  }

  // ---------------- bail (Hall of Meat) ----------------
  bail(reason, impact = 6) {
    if (this.mode === 'bail') return;
    const wasAir = this.mode === 'air';
    this.mode = 'bail';
    this.bailT = 0;
    this.bailReason = reason;
    this.grind = this.grab = this.flip = this.manual = this.wallride = null;
    // Hall of Meat damage: harder slams break more bones
    const damage = Math.round(impact * impact * 18 + this.speed * 40);
    const count = Math.min(6, Math.floor(impact / 4.5));
    const bones = [];
    while (bones.length < count) {
      const b = BONES[Math.floor(Math.random() * BONES.length)];
      if (!bones.includes(b)) bones.push(b);
    }
    this.score.bail(reason, damage, bones);
    if (this.onBail) this.onBail(damage, bones);
    this.sound.bail();
    this.vibrate(1, 1, 350);
    this.shake = 1;
    this.bailSpinVel = wasAir ? 6 + impact * 0.4 : 2 + impact * 0.3;
    this.bailSpin = 0;
    this.flailSeed = Math.random() * 10;
    this.bailBoardVel = new THREE.Vector3((Math.random() - 0.5) * 2, 3 + Math.random() * 2, 2 + Math.random() * 2);
    this.bailBoardSpin = new THREE.Vector3(Math.random() * 10, Math.random() * 6, Math.random() * 10);
  }

  updateBail(dt) {
    this.bailT += dt;
    this.vel.y -= G * dt;
    const onGround = this.pos.y <= this.world.heightAt(this.pos.x, this.pos.z) + 0.02;
    const fr = onGround ? 2.5 : 0.2;
    this.vel.x *= Math.exp(-fr * dt);
    this.vel.z *= Math.exp(-fr * dt);
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    const gh = this.world.heightAt(nx, nz);
    if (gh - this.pos.y < 0.45) { this.pos.x = nx; this.pos.z = nz; }
    else { this.vel.x *= -0.3; this.vel.z *= -0.3; }
    this.pos.y += this.vel.y * dt;
    const gy = this.world.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y < gy) { this.pos.y = gy; this.vel.y = Math.abs(this.vel.y) > 3 ? -this.vel.y * 0.25 : 0; }
    // tumble while flying / sliding, then settle
    this.bailSpin += this.bailSpinVel * dt;
    this.bailSpinVel *= Math.exp(-(onGround ? 2.5 : 0.3) * dt);
    this.sound.update(0, false, false);

    if (this.bailT > 2.4) {
      const n = this.world.normalAt(this.pos.x, this.pos.z, v1);
      const p = this.pos.clone();
      const safeHere = n.y > 0.99 && [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]].every(([dx, dz]) => Math.abs(this.world.heightAt(p.x + dx, p.z + dz) - gy) < 0.05);
      if (safeHere) this.spawn(p, this.heading);
      else this.spawn(this.lastSafe.pos, this.lastSafe.heading);
    }
  }

  // ---------------- animation ----------------
  animate(dt, input) {
    const k = 1 - Math.exp(-12 * dt);
    let targetUp = WORLD_UP;
    if (this.mode === 'ground') targetUp = this.normal;
    this.up.lerp(targetUp, this.mode === 'air' ? 1 - Math.exp(-3 * dt) : k).normalize();
    const fwd = this.forward(v1);
    fwd.addScaledVector(this.up, -fwd.dot(this.up)).normalize();
    const x = v2.crossVectors(this.up, fwd).normalize();
    mtx.makeBasis(x, this.up, fwd);
    qTarget.setFromRotationMatrix(mtx);
    if (this.visYaw) qTarget.multiply(qYaw.setFromAxisAngle(WORLD_UP, this.visYaw));
    if (this.wallride) {
      // lean the board into the wall
      const side = Math.sign(this.wallride.nx * x.x + this.wallride.nz * x.z) || 1;
      qTarget.multiply(qRoll.setFromAxisAngle(Z_AXIS, side * 1.1));
    }
    this.root.quaternion.copy(qTarget);
    this.root.position.copy(this.pos);

    if (this.mode === 'walk') return this.animateWalk();
    this.body.scale.x = this.goofy ? -1 : 1;

    let target = 0.15;
    if (this.mode === 'air') target = this.grab ? 1 : 0.55;
    else if (this.mode === 'grind') target = 0.45;
    else if (this.manual) target = 0.25;
    else if (this.powerslide > 0.3) target = 0.6;
    else if (input.recognizer && input.recognizer.state === 'armed') target = 0.85;
    if (this.pushAnim > 0) target = 0.35;
    target = Math.max(target, Math.min(1, this.landSquash) * 0.9);
    this.crouch += (target - this.crouch) * (1 - Math.exp(-10 * dt));

    // board
    const bp = this.boardPivot;
    let by = 0.11, bz = 0, rollA = 0, yawA = 0, pitch = 0;
    if (this.flip && !this.flip.done) {
      const p = Math.min(1, this.flip.t / this.flip.dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      rollA = this.flip.roll * Math.PI * 2 * e;
      yawA = this.flip.yaw * Math.PI * 2 * e;
      pitch = -this.flip.pitch * Math.PI * 2 * e;
      by += Math.sin(p * Math.PI) * 0.32;
    }
    if (this.mode === 'air' && this.grab) by += 0.22;
    if (this.mode === 'air' && !this.flip) by += 0.05;
    if (this.manual) {
      pitch = this.manual === 'manual' ? -0.26 : 0.26;
      by += 0.08;
      bz = this.manual === 'manual' ? 0.02 : -0.02;
    }
    if (this.powerslide > 0) yawA = this.powerslide * 1.2;
    // sketchy landing wobble
    if (this.landSquash > 1) rollA += Math.sin(performance.now() / 40) * 0.12 * (this.landSquash - 1);
    if (this.mode !== 'bail') {
      bp.position.set(0, by, bz);
      bp.rotation.set(pitch, yawA, rollA);
    } else {
      bp.position.addScaledVector(this.bailBoardVel, dt);
      this.bailBoardVel.y -= G * dt;
      if (bp.position.y < 0.11) { bp.position.y = 0.11; this.bailBoardVel.multiplyScalar(0.5); this.bailBoardVel.y = Math.abs(this.bailBoardVel.y) * 0.4; }
      bp.rotation.x += this.bailBoardSpin.x * dt;
      bp.rotation.y += this.bailBoardSpin.y * dt;
      bp.rotation.z += this.bailBoardSpin.z * dt;
      this.bailBoardSpin.multiplyScalar(Math.exp(-1.5 * dt));
    }

    // body pose: 2-bone IK for each leg
    const hipY = 0.98 - this.crouch * 0.38;
    this.hips.position.set(0, hipY, 0);
    const flipLift = this.flip && !this.flip.done ? Math.sin(Math.min(1, this.flip.t / this.flip.dur) * Math.PI) * 0.12 : 0;
    const boardTop = (this.mode === 'bail' ? 0.11 : by) + 0.06 + flipLift;
    for (const leg of this.legs) {
      let footY = boardTop;
      let footZ = leg.z;
      if (this.pushAnim > 0 && leg.side < 0 && this.mode === 'ground') {
        const ph = Math.sin((1 - this.pushAnim / 0.45) * Math.PI);
        footY = 0.04 + (1 - ph) * 0.1;
        footZ = leg.z - ph * 0.35;
      }
      if (this.manual) footY += (this.manual === 'manual' ? -leg.side : leg.side) * 0.05;
      const hipZ = leg.side * 0.11;
      leg.hip.position.set(0, hipY, hipZ);
      const dy = hipY - footY;
      const dz = footZ - hipZ;
      const D = Math.min(THIGH + SHIN - 0.001, Math.hypot(dy, dz));
      const a = Math.acos(Math.min(1, D / (2 * THIGH)));
      leg.hip.rotation.set(-Math.asin(dz / Math.max(D, 0.01)), 0, -a);
      leg.knee.rotation.set(0, 0, 2 * a);
      leg.foot.rotation.set(0, 0, -a);
    }
    this.torso.rotation.set(0, 0.25, this.crouch * 0.35);
    this.head.rotation.set(0, 1.1, -this.crouch * 0.3);

    const t = performance.now() / 1000;
    for (const arm of this.arms) {
      let rx = -arm.side * (0.35 + this.crouch * 0.3 + Math.sin(t * 2 + arm.side) * 0.04);
      let rz = 0.15;
      let elbow = -0.4;
      if (this.mode === 'air' && this.grab && this.grab.hand === arm.side) { rx = -arm.side * 0.1; rz = 0.9; elbow = -0.2; }
      if (this.mode === 'grind' || this.manual) { rx = -arm.side * 0.9; elbow = -0.2; }
      if (this.wallride) rx = -arm.side * 1.2;
      arm.shoulder.rotation.set(rx, 0, rz);
      arm.elbow.rotation.set(0, 0, elbow);
    }

    if (this.mode === 'bail') {
      // ragdoll-ish tumble with flailing limbs
      const p = Math.min(1, this.bailT * 2.2);
      this.body.rotation.set(-p * Math.PI / 2 - this.bailSpin, this.bailSpin * 0.3, 0);
      this.body.position.set(0, 0.15 * Math.min(1, this.bailSpinVel / 4), p * 0.4);
      const amp = Math.min(1.2, 0.3 + this.bailSpinVel * 0.15);
      const s = this.flailSeed;
      for (const arm of this.arms) {
        arm.shoulder.rotation.set(Math.sin(t * 9 + s + arm.side) * amp * 1.4, 0, Math.cos(t * 7 + s * arm.side) * amp + 0.5);
        arm.elbow.rotation.set(0, 0, -0.3 - Math.abs(Math.sin(t * 11 + s)) * amp);
      }
      for (const leg of this.legs) {
        leg.hip.rotation.set(Math.sin(t * 8 + s * leg.side) * amp * 0.6, 0, Math.cos(t * 6 + s + leg.side) * amp * 0.8);
        leg.knee.rotation.set(0, 0, 0.3 + Math.abs(Math.sin(t * 10 + leg.side)) * amp);
      }
    } else {
      this.body.rotation.set(0, 0, 0);
      this.body.position.set(0, 0, 0);
    }
  }

  animateWalk() {
    this.crouch = 0;
    this.body.scale.x = 1;
    const ph = this.walkPhase;
    const amt = Math.min(1, this.walkSpeed / 2.6) * 0.6;
    this.hips.position.set(0, 0.92 + Math.abs(Math.sin(ph)) * 0.03 * amt, 0);
    for (const leg of this.legs) {
      const sw = Math.sin(ph + (leg.side > 0 ? 0 : Math.PI)) * amt;
      leg.hip.position.set(0, this.hips.position.y, leg.side * 0.11);
      leg.hip.rotation.set(0, 0, sw);
      leg.knee.rotation.set(0, 0, Math.max(0, -sw) * 1.2 + 0.05);
      leg.foot.rotation.set(0, 0, 0);
    }
    for (const arm of this.arms) {
      const sw = Math.sin(ph + (arm.side > 0 ? Math.PI : 0)) * amt;
      if (arm.side > 0) {
        // carrying the board on this side
        arm.shoulder.rotation.set(-0.15, 0, 0.1);
        arm.elbow.rotation.set(0, 0, -0.6);
      } else {
        arm.shoulder.rotation.set(0.12, 0, sw);
        arm.elbow.rotation.set(0, 0, -0.3);
      }
    }
    this.torso.rotation.set(0, 0, 0.08);
    this.head.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    // board tucked under the arm
    const side = this.goofy ? -1 : 1;
    this.boardPivot.position.set(-0.02 * side, 0.82, 0.36);
    this.boardPivot.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  }
}
