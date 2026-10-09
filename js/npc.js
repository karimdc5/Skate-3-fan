import * as THREE from 'three';
import { Skater } from './skater.js';

// Other skaters cruising the park, like the locals in Skate 3.
// Each one is a full Skater driven by a tiny AI instead of a controller.

const noop = new Proxy({}, { get: () => () => {} });
const ROUTE = [[-60, -45], [72, -45], [72, 62], [-62, 62]];
const TRICKS = ['ollie', 'ollie', 'kickflip', 'heelflip', 'popShove', 'flip360', 'varialKick'];
const LOOKS = [
  { shirt: '#2f6d3a', pants: '#3b3b3b', cap: '#e9c46a', deck: '#e76f51', skin: '#8d5524', top: 'tee', hat: 'none' },
  { shirt: '#f1faee', pants: '#2b3d5c', cap: '#e63946', deck: '#457b9d', skin: '#f1c27d', top: 'tee', hat: 'cap' },
  { shirt: '#5b5f66', pants: '#222222', cap: '#2c2c2c', deck: '#8ac926', skin: '#c68642', stance: 'goofy', top: 'hoodie', hat: 'beanie' },
];
const PED_LOOKS = [
  { shirt: '#c94f4f', pants: '#2d3e50', skin: '#e0ac69', top: 'tee', hat: 'none', hair: '#3b2414' },
  { shirt: '#3d7ab8', pants: '#c8b48a', skin: '#8d5524', top: 'tee', hat: 'cap', cap: '#ffffff' },
  { shirt: '#e8d36a', pants: '#384048', skin: '#f1c27d', top: 'hoodie', hat: 'none', hair: '#d9b26a' },
  { shirt: '#ffffff', pants: '#6b6b6b', skin: '#c68642', top: 'tank', hat: 'beanie', cap: '#a33' },
];
const PED_ROUTE = [[-70, -70], [70, -70], [70, 70], [-70, 70]];

export class Npcs {
  constructor(scene, world, count = 3) {
    this.list = [];
    this.enabled = true;
    for (let i = 0; i < count; i++) {
      const sk = new Skater(scene, world, noop, noop, { npc: true });
      sk.applyLook(LOOKS[i % LOOKS.length]);
      const wp = i % ROUTE.length;
      const [x, z] = ROUTE[wp];
      const [nx, nz] = ROUTE[(wp + 1) % ROUTE.length];
      sk.spawn(new THREE.Vector3(x, 0, z), Math.atan2(nx - x, nz - z));
      this.list.push({
        sk, wp: (wp + 1) % ROUTE.length, trickT: 2 + Math.random() * 5,
        input: { move: { x: 0, y: 0 }, flick: { x: 0, y: 0 }, push: false, brake: false, grabL: 0, grabR: 0, events: new Set(), trick: null, manualHold: null, source: 'npc', recognizer: {} },
      });
    }

    // pedestrians strolling around the plaza (Skate 3 is full of them)
    this.peds = [];
    for (let i = 0; i < 4; i++) {
      const sk = new Skater(scene, world, noop, noop, { npc: true });
      sk.applyLook(PED_LOOKS[i]);
      const wp = i % PED_ROUTE.length;
      const [x, z] = PED_ROUTE[wp];
      sk.spawn(new THREE.Vector3(x + (i * 7) % 20, 0, z), 0);
      sk.toggleWalk();
      this.peds.push({ sk, wp: (wp + 1) % PED_ROUTE.length, speed: 0.55 + Math.random() * 0.3,
        input: { move: { x: 0, y: 0 }, push: false, grabL: 0, grabR: 0, events: new Set(), trick: null, camYaw: 0, source: 'npc' } });
    }
  }

  setEnabled(on) {
    this.enabled = on;
    for (const n of [...this.list, ...this.peds]) n.sk.root.visible = on;
  }

  update(dt, player) {
    if (!this.enabled) return;
    for (const n of this.peds) {
      const sk = n.sk;
      if (sk.mode !== 'walk' && sk.mode !== 'bail') sk.toggleWalk();
      const [tx, tz] = PED_ROUTE[n.wp];
      let dx = tx - sk.pos.x, dz = tz - sk.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2) n.wp = (n.wp + 1) % PED_ROUTE.length;
      dx /= d || 1; dz /= d || 1;
      // camYaw 0: stick up = +z, stick right = -x
      n.input.move.x = -dx * n.speed;
      n.input.move.y = -dz * n.speed;
      sk.update(dt, n.input);
      if (player.mode !== 'bail' && player.mode !== 'walk' && sk.mode === 'walk') {
        const pd = Math.hypot(player.pos.x - sk.pos.x, player.pos.z - sk.pos.z);
        if (pd < 0.6 && Math.abs(player.pos.y - sk.pos.y) < 1.2 && player.speed > 3) {
          player.bail('Ran into a pedestrian', player.speed + 2);
          sk.bail('', player.speed);
        }
      }
    }
    for (const n of this.list) {
      const sk = n.sk, inp = n.input;
      inp.trick = null;
      const [tx, tz] = ROUTE[n.wp];
      const dx = tx - sk.pos.x, dz = tz - sk.pos.z;
      if (Math.hypot(dx, dz) < 5) n.wp = (n.wp + 1) % ROUTE.length;
      const want = Math.atan2(dx, dz);
      const travel = sk.heading + (sk.fakie ? Math.PI : 0);
      let diff = want - travel;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      inp.move.x = sk.mode === 'air' ? 0 : Math.max(-1, Math.min(1, -diff * 2));
      inp.push = sk.speed < 6.5 && Math.abs(diff) < 0.6;
      n.trickT -= dt;
      if (n.trickT <= 0 && sk.mode === 'ground' && sk.speed > 4 && Math.abs(diff) < 0.2) {
        inp.trick = { key: TRICKS[Math.floor(Math.random() * TRICKS.length)], nollie: false, power: 1 };
        n.trickT = 3 + Math.random() * 6;
      }
      sk.update(dt, inp);

      // collisions with the player
      if (player.mode !== 'bail' && sk.mode !== 'bail' && player.mode !== 'walk') {
        const d = Math.hypot(player.pos.x - sk.pos.x, player.pos.z - sk.pos.z);
        const dy = Math.abs(player.pos.y - sk.pos.y);
        if (d < 0.7 && dy < 1.2) {
          const rel = Math.hypot(player.vel.x - sk.vel.x, player.vel.z - sk.vel.z);
          if (rel > 3) {
            player.bail('Ran into a local', rel + 2);
            sk.bail('', rel);
          }
        }
      }
    }
  }
}
