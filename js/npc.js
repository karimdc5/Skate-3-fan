import * as THREE from 'three';
import { Skater } from './skater.js';

// Other skaters cruising the park, like the locals in Skate 3.
// Each one is a full Skater driven by a tiny AI instead of a controller.

const noop = new Proxy({}, { get: () => () => {} });
const ROUTE = [[-60, -45], [72, -45], [72, 62], [-62, 62]];
const TRICKS = ['ollie', 'ollie', 'kickflip', 'heelflip', 'popShove', 'flip360', 'varialKick'];
const LOOKS = [
  { shirt: '#2a9d8f', pants: '#264653', cap: '#e9c46a', deck: '#e76f51', skin: '#8d5524' },
  { shirt: '#f1faee', pants: '#1d3557', cap: '#e63946', deck: '#457b9d', skin: '#f1c27d' },
  { shirt: '#6a4c93', pants: '#222222', cap: '#ffca3a', deck: '#8ac926', skin: '#c68642', stance: 'goofy' },
];

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
  }

  setEnabled(on) {
    this.enabled = on;
    for (const n of this.list) n.sk.root.visible = on;
  }

  update(dt, player) {
    if (!this.enabled) return;
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
