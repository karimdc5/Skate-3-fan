import * as THREE from 'three';
import { TRICKS, trickLabel } from './tricks.js';
import { rumble } from './gamepad.js';

const G = 14;              // gravity (arcade-strong for snappy air)
const POP = 5.6;           // ollie pop speed
const MAX_PUSH_SPEED = 10.5;
const MAX_SPEED = 22;
const STEP_UP = 0.22;      // highest curb you can roll up
const THIGH = 0.42;
const SHIN = 0.42;
const DEG = 180 / Math.PI;

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const mtx = new THREE.Matrix4();
const qTarget = new THREE.Quaternion();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8 }, extra));
}

export class Skater {
  constructor(scene, world, sound, score) {
    this.world = world;
    this.sound = sound;
    this.score = score;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.heading = 0;
    this.mode = 'ground';
    this.fakie = false;

    this.flip = null;
    this.grab = null;
    this.grind = null;
    this.manual = null;
    this.airSpin = 0;
    this.airTime = 0;
    this.takeoffY = 0;
    this.maxY = 0;
    this.vertAir = false;
    this.grindBlock = 0;
    this.pushCooldown = 0;
    this.pushAnim = 0;
    this.crouch = 0;
    this.landSquash = 0;
    this.bailT = 0;
    this.bailReason = '';
    this.safeTimer = 0;
    this.lastSafe = { pos: new THREE.Vector3(), heading: 0 };
    this.marker = null;
    this.powerslide = 0;
    this.touchMode = false;
    this.airLateFlip = false;

    this.buildModel();
    scene.add(this.root);
  }

  // ---------------- model ----------------
  buildModel() {
    this.root = new THREE.Group();

    // board
    this.boardPivot = new THREE.Group();
    this.boardPivot.rotation.order = 'YXZ';
    this.boardPivot.position.y = 0.11;
    const board = new THREE.Group();
    const grip = mat(0x1b1b1b);
    const deckMat = mat(0xffcc00);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.6), [deckMat, deckMat, grip, deckMat, deckMat, deckMat]);
    board.add(deck);
    for (const s of [1, -1]) {
      const kick = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.13), [deckMat, deckMat, grip, deckMat, deckMat, deckMat]);
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

    // body (faces local -x, board nose is +z)
    this.body = new THREE.Group();
    this.root.add(this.body);
    const shirt = mat(0xd62828), pants = mat(0x1d3557), skin = mat(0xe0ac69), shoe = mat(0xf1f1f1), cap = mat(0x111111);

    this.hips = new THREE.Group();
    this.body.add(this.hips);
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.34), pants);
    this.hips.add(pelvis);

    this.legs = [];
    for (const side of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.set(0, 0, side * 0.11);
      this.body.add(hip);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, THIGH, 0.13), pants);
      thigh.position.y = -THIGH / 2;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      hip.add(knee);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.11, SHIN, 0.11), pants);
      shin.position.y = -SHIN / 2;
      knee.add(shin);
      const foot = new THREE.Group();
      foot.position.y = -SHIN;
      knee.add(foot);
      const shoeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.11), shoe);
      shoeMesh.position.set(-0.03, -0.03, 0);
      foot.add(shoeMesh);
      this.legs.push({ side, hip, knee, foot, z: side * 0.21 });
    }

    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.52, 0.38), shirt);
    chest.position.y = 0.3;
    this.torso.add(chest);
    this.head = new THREE.Group();
    this.head.position.y = 0.7;
    this.torso.add(this.head);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), skin);
    this.head.add(headMesh);
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap);
    capTop.position.y = 0.02;
    this.head.add(capTop);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.015, 0.2), cap);
    brim.position.set(-0.15, 0.03, 0);
    this.head.add(brim);

    this.arms = [];
    for (const side of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0, 0.52, side * 0.23);
      this.torso.add(shoulder);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.09), shirt);
      upper.position.y = -0.15;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), skin);
      fore.position.y = -0.14;
      elbow.add(fore);
      this.arms.push({ side, shoulder, elbow });
    }
    this.body.traverse(o => { if (o.isMesh) o.castShadow = true; });
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
    this.flip = this.grab = this.grind = this.manual = null;
    this.bailT = 0;
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
    if (this.mode !== 'ground') return false;
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

  // ---------------- main update ----------------
  update(dt, input) {
    this.touchMode = input.source === 'touch';
    if (this.mode === 'bail') {
      this.updateBail(dt);
      this.animate(dt, input);
      return;
    }

    this.pushCooldown -= dt;
    this.pushAnim = Math.max(0, this.pushAnim - dt);
    this.grindBlock -= dt;
    this.landSquash = Math.max(0, this.landSquash - dt * 3);

    // --- discrete actions ---
    if (input.trick) this.handleTrick(input.trick, input);

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
      // manuals
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

    // scoring tick for continuous tricks
    if (this.mode === 'grind') this.score.tickContinuous(dt, 140);
    else if (this.manual) this.score.tickContinuous(dt, 110);
    else if (this.grab) this.score.tickContinuous(dt, 160);
    const busy = this.mode !== 'ground' || !!this.manual;
    this.score.update(dt, busy);

    this.sound.update(this.speed, this.mode === 'ground', this.mode === 'grind');
    this.animate(dt, input);
  }

  handleTrick(ev, input) {
    const t = TRICKS[ev.key];
    if (!t) return;
    const label = trickLabel(ev.key, ev.nollie);
    const pts = Math.round(t.pts * (ev.nollie ? 1.2 : 1));
    if (this.mode === 'ground' || this.mode === 'grind') {
      if (this.mode === 'ground') {
        this.vel.addScaledVector(this.normal, POP);
        this.vertAir = false;
      } else {
        this.vel.y = Math.max(this.vel.y, 0) + POP * 0.85;
        this.grindBlock = 0.3;
        this.grind = null;
      }
      this.manual = null;
      this.enterAir();
      this.startFlip(t);
      this.score.addTrick(label, pts);
      this.score.challenge('trick', ev.key);
      this.sound.pop();
    } else if (this.mode === 'air' && (!this.flip || this.flip.done) && !this.grab && ev.key !== 'ollie') {
      // late flip
      this.startFlip(t);
      this.score.addTrick('Late ' + label, Math.round(pts * 1.25));
      this.score.challenge('trick', ev.key);
    }
  }

  startFlip(t) {
    this.flip = { roll: t.roll, yaw: t.yaw, dur: t.dur, t: 0, done: t.roll === 0 && t.yaw === 0 };
    this.crouch = 1;
  }

  enterAir() {
    this.mode = 'air';
    this.airSpin = 0;
    this.airTime = 0;
    this.takeoffY = this.pos.y;
    this.maxY = this.pos.y;
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
    if ((l || r) && (!this.flip || this.flip.done)) {
      const y = input.move.y, x = input.move.x;
      let name;
      if (r) name = y < -0.5 ? 'Nosegrab' : y > 0.5 ? 'Tailgrab' : Math.abs(x) > 0.5 ? 'Stalefish' : 'Indy';
      else name = y < -0.5 ? 'Crail' : y > 0.5 ? 'Roast Beef' : Math.abs(x) > 0.5 ? 'Method' : 'Melon';
      this.grab = { name, time: 0, hand: r ? 1 : -1 };
      this.score.addTrick(name, 200, true);
    }
  }

  // ---------------- ground ----------------
  stepGround(h, input) {
    const world = this.world;
    const n = this.normal;
    // steering
    const sp0 = this.speed;
    const rate = (this.manual ? 1.4 : 2.6) / (1 + sp0 * 0.04);
    this.heading -= input.move.x * rate * h;

    const fs = this.surfaceForward(n, v1);
    // gravity along the surface
    v2.set(0, -G, 0);
    v2.addScaledVector(n, -v2.dot(n));
    this.vel.addScaledVector(v2, h);

    // wheel grip: kill sideways motion
    let along = this.vel.dot(fs);
    const lateral = v2.copy(this.vel).addScaledVector(fs, -along);
    lateral.addScaledVector(n, -lateral.dot(n));
    const grip = this.powerslide > 0 ? 2 : 14;
    const keep = Math.exp(-grip * h);
    this.vel.addScaledVector(lateral, -(1 - keep));
    along = this.vel.dot(fs);
    if (Math.abs(along) > 0.5) this.fakie = along < 0;

    // friction, brake, drag
    let decel = 0.22 + 0.004 * along * along;
    if (this.manual) decel += 0.5;
    if (input.brake) {
      decel += 8;
      this.powerslide = Math.abs(along) > 5 ? Math.min(1, this.powerslide + h * 6) : Math.max(0, this.powerslide - h * 4);
    } else {
      this.powerslide = Math.max(0, this.powerslide - h * 4);
    }
    const s = this.vel.length();
    if (s > 0) {
      const ns = Math.max(0, s - decel * h);
      this.vel.multiplyScalar(Math.min(ns, MAX_SPEED) / s);
    }

    // move
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
    const leaving = this.vel.x * -gnd.gx + this.vel.y - this.vel.z * gnd.gz;
    const nLen = Math.sqrt(gnd.gx * gnd.gx + 1 + gnd.gz * gnd.gz);
    if (ny > gnd.h + 0.06 || (leaving / nLen > 3 && n.y < 0.9)) {
      // the ground fell away below us: launch. Off a steep lip, stay over
      // the ramp so we come back down onto it.
      if (n.y < 0.57) this.pos.y = ny;
      else this.pos.set(nx, ny, nz);
      this.launch();
      return;
    }
    this.pos.set(nx, gnd.h, nz);
    v2.set(-gnd.gx, 1, -gnd.gz).normalize();
    n.copy(v2);
    const mag = this.vel.length();
    this.vel.addScaledVector(n, -this.vel.dot(n));
    const tm = this.vel.length();
    if (tm > 1e-4) this.vel.multiplyScalar(mag / tm);

    // remember safe spots for respawns after a bail
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
    const p = v2.set(x, y, z);
    const nr = this.world.nearestRail(p);
    if (!nr || nr.rail.kind !== 'rail') return false;
    const above = nr.point.y - y;
    if (nr.dh < 0.22 && above > 0.25 && above < 1.5 && this.speed > 1.5) {
      this.bail('Hit the rail');
      return true;
    }
    return false;
  }

  collideWall(h, grounded) {
    const world = this.world;
    const okX = world.heightAt(this.pos.x + this.vel.x * h, this.pos.z) - this.pos.y <= (grounded ? STEP_UP : 0.45);
    const okZ = world.heightAt(this.pos.x, this.pos.z + this.vel.z * h) - this.pos.y <= (grounded ? STEP_UP : 0.45);
    let impact = 0;
    if (!okX) { impact += Math.abs(this.vel.x); this.vel.x *= -0.3; }
    if (!okZ) { impact += Math.abs(this.vel.z); this.vel.z *= -0.3; }
    if (okX && okZ) { impact = Math.hypot(this.vel.x, this.vel.z); this.vel.x *= -0.3; this.vel.z *= -0.3; }
    if (impact > 7) this.bail('Slammed into a wall');
  }

  launch() {
    const n = this.normal;
    // Off a steep quarter-pipe lip: go straight up so you come back down the ramp.
    if (n.y < 0.57) {
      const ux = -n.x, uz = -n.z;
      const ul = Math.hypot(ux, uz) || 1;
      const dx = ux / ul, dz = uz / ul;
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
    this.vel.y -= G * h;
    const spin = -input.move.x * 6.4 * h;
    this.heading += spin;
    this.airSpin += spin;

    const nx = this.pos.x + this.vel.x * h;
    const ny = this.pos.y + this.vel.y * h;
    const nz = this.pos.z + this.vel.z * h;
    this.maxY = Math.max(this.maxY, ny);

    // grind check
    if (this.grindBlock <= 0 && this.vel.y < 1.5) {
      const p = v2.set(nx, ny, nz);
      const nr = this.world.nearestRail(p);
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

    const gnd = this.world.ground(nx, nz);
    if (ny <= gnd.h) {
      if (gnd.h - this.pos.y > 0.45) {
        // hit the side of something
        this.pos.y = ny;
        this.collideWall(h, false);
        return;
      }
      this.pos.set(nx, gnd.h, nz);
      this.normal.set(-gnd.gx, 1, -gnd.gz).normalize();
      this.land(input);
      return;
    }
    // keep out of ceilings/walls: slide along if blocked horizontally above ground
    this.pos.set(nx, ny, nz);
    if (this.pos.y < -5) this.bail('Fell out of the world');
  }

  land(input) {
    const n = this.normal;
    const vn = this.vel.dot(n);
    const vt = v1.copy(this.vel).addScaledVector(n, -vn);
    const tl = vt.length();
    const keepVert = Math.max(0, -vn) * Math.max(0, 1 - n.y) * 0.9;
    const newSpeed = Math.min(MAX_SPEED, tl * 0.97 + keepVert);
    if (tl > 0.01) this.vel.copy(vt).multiplyScalar(newSpeed / tl);
    else this.vel.set(0, 0, 0);

    // ---- did we land it? ----
    if (this.flip && !this.flip.done && this.flip.t / this.flip.dur < 0.8) return this.bail("Didn't finish the flip");
    if (this.grab && !this.touchMode) return this.bail('Still grabbing');
    this.grab = null;
    if (-vn > 20) return this.bail('Too much impact');

    const fs = this.surfaceForward(n, v2);
    const sp = this.vel.length();
    if (sp > 1.0) {
      const dir = v1.copy(this.vel).divideScalar(sp);
      const c = dir.dot(fs);
      if (c > 0.6) {
        this.fakie = false;
        if (Math.hypot(dir.x, dir.z) > 0.05) this.heading = Math.atan2(dir.x, dir.z);
      } else if (c < -0.6) {
        this.fakie = true;
        if (Math.hypot(dir.x, dir.z) > 0.05) this.heading = Math.atan2(-dir.x, -dir.z);
      } else {
        return this.bail('Landed sideways');
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
    const height = this.maxY - this.takeoffY;
    if (height > 3) this.score.challenge('air3');

    this.flip = null;
    this.mode = 'ground';
    this.vertAir = false;
    this.landSquash = 1;
    this.score.landed();
    const hard = Math.min(1.3, 0.4 + Math.abs(vn) / 12);
    this.sound.land(hard);
    rumble(0.3 * hard, 0.5 * hard, 90);
  }

  // ---------------- grind ----------------
  startGrind(nr, input) {
    if (this.flip && !this.flip.done && this.flip.t / this.flip.dur < 0.8) {
      this.bail("Didn't finish the flip");
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
      slide = false;
    } else if (c < 0.45) {
      name = rail.kind === 'rail' ? 'Boardslide' : (y < -0.5 ? 'Noseslide' : y > 0.5 ? 'Tailslide' : 'Lipslide');
      slide = true;
    } else {
      name = y > 0.5 ? 'Feeble Grind' : 'Crooked Grind';
      slide = false;
    }
    // snap board to the rail
    const rh = Math.atan2(rail.dir.x, rail.dir.z);
    if (slide) {
      this.heading = rh + (Math.sin(this.heading - rh) > 0 ? Math.PI / 2 : -Math.PI / 2);
    } else {
      const fw = Math.cos(this.heading - rh) > 0;
      this.heading = fw ? rh : rh + Math.PI;
    }
    this.grind = { rail, s, t: nr.t, name, slide, time: 0 };
    this.mode = 'grind';
    this.flip = null;
    this.pos.copy(nr.point);
    this.score.addTrick(name, 150, true);
    this.sound.land(0.6);
    rumble(0.2, 0.6, 80);
  }

  stepGrind(h) {
    const g = this.grind;
    const r = g.rail;
    g.time += h;
    g.s += -G * r.dir.y * h;
    g.s -= Math.sign(g.s) * (g.slide ? 1.4 : 0.9) * h;
    g.t += (g.s * h) / r.len;
    if (g.time >= 2) this.score.challenge('grind2');
    if (g.t < 0 || g.t > 1 || Math.abs(g.s) < 0.35) {
      // ride off the end
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

  // ---------------- bail ----------------
  bail(reason) {
    if (this.mode === 'bail') return;
    this.mode = 'bail';
    this.bailT = 0;
    this.bailReason = reason;
    this.grind = this.grab = this.flip = this.manual = null;
    this.score.bail(reason);
    this.sound.bail();
    rumble(1, 1, 350);
    this.bailBoardVel = new THREE.Vector3((Math.random() - 0.5) * 2, 3 + Math.random() * 2, 2 + Math.random() * 2);
    this.bailBoardSpin = new THREE.Vector3(Math.random() * 10, Math.random() * 6, Math.random() * 10);
  }

  updateBail(dt) {
    this.bailT += dt;
    // body slides / falls
    this.vel.y -= G * dt;
    this.vel.x *= Math.exp(-2.5 * dt);
    this.vel.z *= Math.exp(-2.5 * dt);
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    const gh = this.world.heightAt(nx, nz);
    if (gh - this.pos.y < 0.45) { this.pos.x = nx; this.pos.z = nz; }
    else { this.vel.x = this.vel.z = 0; }
    this.pos.y += this.vel.y * dt;
    const gy = this.world.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y < gy) { this.pos.y = gy; this.vel.y = 0; }
    this.sound.update(0, false, false);

    if (this.bailT > 2.0) {
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
    // orientation: align to ground normal on the ground, drift back upright in air
    let targetUp = WORLD_UP;
    if (this.mode === 'ground') targetUp = this.normal;
    this.up.lerp(targetUp, this.mode === 'air' ? 1 - Math.exp(-3 * dt) : k).normalize();
    const fwd = this.forward(v1);
    fwd.addScaledVector(this.up, -fwd.dot(this.up)).normalize();
    const x = v2.crossVectors(this.up, fwd).normalize();
    mtx.makeBasis(x, this.up, fwd);
    qTarget.setFromRotationMatrix(mtx);
    this.root.quaternion.copy(qTarget);
    this.root.position.copy(this.pos);

    // crouch target
    let target = 0.15;
    if (this.mode === 'air') target = this.grab ? 1 : 0.55;
    else if (this.mode === 'grind') target = 0.45;
    else if (this.manual) target = 0.25;
    else if (input.recognizer && input.recognizer.state === 'armed') target = 0.85;
    if (this.pushAnim > 0) target = 0.35;
    target = Math.max(target, this.landSquash * 0.9);
    this.crouch += (target - this.crouch) * (1 - Math.exp(-10 * dt));

    // board
    const bp = this.boardPivot;
    let by = 0.11, bx = 0, bz = 0, rollA = 0, yawA = 0, pitch = 0;
    if (this.flip && !this.flip.done) {
      const p = Math.min(1, this.flip.t / this.flip.dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      rollA = this.flip.roll * Math.PI * 2 * e;
      yawA = this.flip.yaw * Math.PI * 2 * e;
      by += Math.sin(p * Math.PI) * 0.32;
    }
    if (this.mode === 'air' && this.grab) by += 0.22;
    if (this.mode === 'air' && !this.flip) by += 0.05;
    if (this.manual) {
      pitch = this.manual === 'manual' ? -0.26 : 0.26;
      by += 0.08;
      bz = this.manual === 'manual' ? 0.02 : -0.02;
    }
    if (this.grind && this.grind.slide) yawA = 0;
    if (this.powerslide > 0) yawA = this.powerslide * 1.2;
    if (this.mode !== 'bail') {
      bp.position.set(bx, by, bz);
      bp.rotation.set(pitch, yawA, rollA);
    } else {
      // board flies away
      bp.position.addScaledVector(this.bailBoardVel, dt);
      this.bailBoardVel.y -= G * dt;
      if (bp.position.y < 0.11) { bp.position.y = 0.11; this.bailBoardVel.multiplyScalar(0.5); this.bailBoardVel.y = Math.abs(this.bailBoardVel.y) * 0.4; }
      bp.rotation.x += this.bailBoardSpin.x * dt;
      bp.rotation.y += this.bailBoardSpin.y * dt;
      bp.rotation.z += this.bailBoardSpin.z * dt;
      this.bailBoardSpin.multiplyScalar(Math.exp(-1.5 * dt));
    }

    // body pose (2-bone IK for each leg)
    const hipY = 0.98 - this.crouch * 0.38;
    this.hips.position.set(0, hipY, 0);
    const flipLift = this.flip && !this.flip.done ? Math.sin(Math.min(1, this.flip.t / this.flip.dur) * Math.PI) * 0.12 : 0;
    const boardTop = (this.mode === 'bail' ? 0.11 : by) + 0.06 + flipLift;
    for (const leg of this.legs) {
      let footY = boardTop;
      let footZ = leg.z;
      if (this.pushAnim > 0 && leg.side < 0 && this.mode === 'ground') {
        // back foot pushes on the ground
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
      leg.knee.rotation.z = 2 * a;
      leg.foot.rotation.z = -a;
    }
    this.torso.rotation.z = this.crouch * 0.35;
    this.torso.rotation.y = 0.25;
    this.head.rotation.y = 1.1;
    this.head.rotation.z = -this.crouch * 0.3;

    // arms
    const t = performance.now() / 1000;
    for (const arm of this.arms) {
      let rx = -arm.side * (0.35 + this.crouch * 0.3 + Math.sin(t * 2 + arm.side) * 0.04);
      let rz = 0.15;
      let elbow = -0.4;
      if (this.mode === 'air' && this.grab && this.grab.hand === arm.side) {
        rx = -arm.side * 0.1;
        rz = 0.9;
        elbow = -0.2;
      }
      if (this.mode === 'grind' || this.manual) { rx = -arm.side * 0.9; elbow = -0.2; }
      arm.shoulder.rotation.set(rx, 0, rz);
      arm.elbow.rotation.z = elbow;
    }

    // bail tumble
    if (this.mode === 'bail') {
      const p = Math.min(1, this.bailT * 2.2);
      this.body.rotation.x = -p * Math.PI / 2;
      this.body.position.z = p * 0.4;
    } else {
      this.body.rotation.set(0, 0, 0);
      this.body.position.set(0, 0, 0);
    }
  }
}
