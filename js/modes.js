import * as THREE from 'three';
import { TRICKS } from './tricks.js';
import { load, save } from './storage.js';

// Skate 3 style game modes: Own the Spot, S.K.A.T.E., Hall of Meat, Death Race.

export const MODES = [
  { id: 'spot', name: 'Own the Spot', desc: 'Score as many points as you can in 60 seconds.', unit: 'pts', tiers: [5000, 15000, 30000] },
  { id: 'skate', name: 'S.K.A.T.E.', desc: 'Trade tricks with the Coach. Miss a trick and you get a letter. Spell SKATE and you lose.' },
  { id: 'meat', name: 'Hall of Meat', desc: 'Three bails off the Mega Ramp. Break as many bones as you can.', unit: 'dmg', tiers: [3000, 8000, 16000] },
  { id: 'race', name: 'Death Race', desc: 'Bomb the Big Hill and hit every checkpoint as fast as you can.', unit: 's', tiers: [26, 20, 16], lowerBetter: true },
];

const MEDALS = ['🥉 Bronze', '🥈 Silver', '🥇 Gold'];
const AI_TRICKS = ['Kickflip', 'Heelflip', 'Pop Shove-it', 'FS Pop Shove-it', 'Varial Kickflip', 'Hardflip', '360 Flip', '360 Shove-it', 'Nollie', 'Nollie Kickflip', 'Fakie Ollie', 'Laser Flip'];
const RACE = [[40, -24], [18, -24], [-4, -38], [-30, -48], [-60, -40], [-66, -10]];

function trickDiff(name) {
  let d = 1;
  for (const t of Object.values(TRICKS)) if (name.endsWith(t.name)) d = Math.max(d, t.diff);
  if (/^(Nollie|Fakie|Switch)/.test(name)) d += 1;
  return d;
}

export class Modes {
  constructor({ skater, world, score, scene, sound, onEnd }) {
    this.skater = skater;
    this.world = world;
    this.score = score;
    this.scene = scene;
    this.sound = sound;
    this.onEnd = onEnd;
    this.active = null;
    this.best = load('modeBest', {});
    this.hud = document.getElementById('modeHud');
    this.rings = [];
  }

  raceTarget() {
    const a = this.active;
    return a && a.mode.id === 'race' && a.cp < RACE.length ? RACE[a.cp] : null;
  }

  medal(mode, value) {
    if (!mode.tiers) return -1;
    let m = -1;
    mode.tiers.forEach((t, i) => { if (mode.lowerBetter ? value <= t : value >= t) m = i; });
    return m;
  }

  bestText(mode) {
    const b = this.best[mode.id];
    if (b == null) return 'Not played yet';
    if (mode.id === 'skate') return `Wins: ${b}`;
    const m = this.medal(mode, b);
    return `Best: ${mode.id === 'race' ? b.toFixed(2) + ' s' : b.toLocaleString() + ' ' + mode.unit}${m >= 0 ? ' · ' + MEDALS[m] : ''}`;
  }

  start(id) {
    this.stop(true);
    const mode = MODES.find(m => m.id === id);
    this.active = { mode, t: 0, done: false };
    this.hud.classList.remove('hidden');
    const s = this.skater, w = this.world;
    if (id === 'spot') {
      this.active.left = 60;
      this.active.startTotal = this.score.total;
      this.active.base = this.score.total;
    } else if (id === 'meat') {
      s.spawn(w.spawns.mega.pos, w.spawns.mega.heading);
      this.active.tries = 3;
      this.active.bestDmg = 0;
      this.active.lastBones = [];
    } else if (id === 'race') {
      s.spawn(w.spawns.hill.pos, w.spawns.hill.heading);
      this.active.cp = 0;
      this.active.countdown = 3;
      this.buildRings();
    } else if (id === 'skate') {
      Object.assign(this.active, { you: 0, coach: 0, phase: 'coachSet', wait: 1.5, target: null, msg: 'Coach is setting a trick…' });
    }
    this.score.onLine = (line) => this.onLine(line);
    this.render();
  }

  stop(silent = false) {
    if (!this.active) return;
    this.active = null;
    this.score.onLine = null;
    this.hud.classList.add('hidden');
    this.clearRings();
    if (!silent && this.onEnd) this.onEnd(null);
  }

  finish(value, title, text, medal) {
    const a = this.active;
    const mode = a.mode;
    a.done = true;
    let isBest = false;
    if (mode.id === 'skate') {
      if (value) { this.best.skate = (this.best.skate || 0) + 1; isBest = true; }
    } else {
      const prev = this.best[mode.id];
      if (prev == null || (mode.lowerBetter ? value < prev : value > prev)) { this.best[mode.id] = value; isBest = true; }
    }
    save('modeBest', this.best);
    const m = medal != null ? medal : this.medal(mode, value);
    const result = { mode, title, text: text + (isBest && mode.id !== 'skate' ? ' · New personal best!' : ''), medal: m >= 0 ? MEDALS[m] : (mode.id === 'skate' ? (value ? '🏆' : '💀') : 'No medal') };
    this.stop(true);
    if (this.onEnd) this.onEnd(result);
  }

  // ---------- events ----------
  onLine(line) {
    const a = this.active;
    if (!a || a.done) return;
    const id = a.mode.id;
    if (id === 'meat' && !line.landed && line.damage != null) {
      a.tries--;
      a.bestDmg = Math.max(a.bestDmg, line.damage);
      a.lastBones = line.bones || [];
      if (a.tries <= 0) {
        setTimeout(() => this.active && this.finish(a.bestDmg, 'Hall of Meat', `Worst slam: ${a.bestDmg.toLocaleString()} damage`), 1800);
      } else {
        setTimeout(() => { if (this.active) this.skater.spawn(this.world.spawns.mega.pos, this.world.spawns.mega.heading); }, 2600);
      }
    }
    if (id === 'skate') this.skateLine(line);
    this.render();
  }

  skateLine(line) {
    const a = this.active;
    if (a.phase === 'youMatch') {
      const ok = line.landed && line.tricks.includes(a.target);
      if (ok) a.msg = `Matched the ${a.target}! Your turn to set.`;
      else { a.you++; a.msg = `Missed the ${a.target}. You get a letter.`; }
      a.phase = 'youSet';
      a.target = null;
      this.sound.blip(ok ? 1200 : 300);
      if (this.checkSkateEnd()) return;
      if (!ok) { a.phase = 'coachSet'; a.wait = 2; a.msg += ' Coach sets next…'; }
    } else if (a.phase === 'youSet') {
      const flips = line.landed ? line.tricks.filter(n => trickDiff(n) >= 1 && !/Grind|slide|Manual|Revert|Gap|Stair|Transfer|Powerslide|Wallride|BS |FS \d/.test(n)) : [];
      if (!flips.length) {
        a.msg = line.landed ? 'Set a flip trick for the Coach to match!' : 'You bailed your set. Coach sets next…';
        if (!line.landed) { a.phase = 'coachSet'; a.wait = 2; }
        return;
      }
      const hardest = flips.reduce((x, y) => (trickDiff(y) > trickDiff(x) ? y : x));
      a.target = hardest;
      a.phase = 'coachTry';
      a.wait = 2.2;
      a.msg = `You set: ${hardest}. Coach is trying it…`;
    }
  }

  checkSkateEnd() {
    const a = this.active;
    if (a.you >= 5) { this.finish(0, 'S.K.A.T.E.', 'The Coach wins this one.', -1); return true; }
    if (a.coach >= 5) { this.finish(1, 'S.K.A.T.E.', 'You beat the Coach!', 2); return true; }
    return false;
  }

  // ---------- per frame ----------
  update(dt) {
    const a = this.active;
    if (!a || a.done) return;
    a.t += dt;
    const id = a.mode.id;
    if (id === 'spot') {
      a.left -= dt;
      const pts = this.score.total - a.base;
      if (a.left <= 0 && this.score.line.length === 0) return this.finish(pts, 'Own the Spot', `You scored ${pts.toLocaleString()} points`);
    } else if (id === 'race') {
      if (a.countdown > 0) {
        a.countdown -= dt;
        this.skater.vel.set(0, 0, 0);
        this.skater.pos.copy(this.world.spawns.hill.pos);
        this.skater.pos.y = this.world.heightAt(this.skater.pos.x, this.skater.pos.z);
        a.t = 0;
      } else {
        const [x, z] = RACE[a.cp];
        if (Math.hypot(this.skater.pos.x - x, this.skater.pos.z - z) < 4) {
          this.rings[a.cp].visible = false;
          a.cp++;
          this.sound.blip(1100 + a.cp * 80);
          if (a.cp >= RACE.length) return this.finish(+a.t.toFixed(2), 'Death Race', `Time: ${a.t.toFixed(2)} s`);
          this.rings[a.cp].material.color.set(0xffcc00);
        }
      }
      for (let i = 0; i < RACE.length && i < this.rings.length; i++) this.rings[i].rotation.y += dt;
    } else if (id === 'skate') {
      if (a.wait > 0) {
        a.wait -= dt;
        if (a.wait <= 0) {
          if (a.phase === 'coachSet') {
            const pick = AI_TRICKS[Math.floor(Math.random() * Math.min(AI_TRICKS.length, 4 + a.t / 20))];
            const lands = Math.random() < 0.8 - trickDiff(pick) * 0.08;
            if (lands) { a.target = pick; a.phase = 'youMatch'; a.msg = `Coach landed a ${pick}. Match it!`; }
            else { a.phase = 'youSet'; a.msg = `Coach missed his ${pick}. Your turn to set!`; }
          } else if (a.phase === 'coachTry') {
            const lands = Math.random() < 0.85 - trickDiff(a.target) * 0.12;
            if (lands) { a.msg = `Coach landed your ${a.target}. Coach sets next…`; }
            else { a.coach++; a.msg = `Coach missed your ${a.target}! He gets a letter.`; }
            this.sound.blip(lands ? 300 : 1200);
            if (this.checkSkateEnd()) return;
            a.phase = 'coachSet';
            a.wait = 2.2;
          }
        }
      }
    }
    this.render();
  }

  render() {
    const a = this.active;
    if (!a) return;
    const id = a.mode.id;
    let html = '';
    if (id === 'spot') {
      html = `OWN THE SPOT <span class="big-num">${Math.max(0, Math.ceil(a.left))}s · ${(this.score.total - a.base).toLocaleString()}</span>`;
    } else if (id === 'meat') {
      html = `HALL OF MEAT · ${a.tries} bail${a.tries === 1 ? '' : 's'} left <span class="big-num">${a.bestDmg.toLocaleString()}</span>Drop in and slam hard (D-pad ← / B key to bail)`;
    } else if (id === 'race') {
      html = a.countdown > 0 ? `DEATH RACE <span class="big-num">${Math.ceil(a.countdown)}</span>` :
        `DEATH RACE · checkpoint ${a.cp + 1}/${RACE.length} <span class="big-num">${a.t.toFixed(1)}s</span>`;
    } else if (id === 'skate') {
      const word = 'SKATE';
      const letters = n => word.split('').map((c, i) => (i < n ? `<b>${c}</b>` : '·')).join('');
      html = `<span class="letters">YOU ${letters(a.you)} &nbsp; COACH ${letters(a.coach)}</span><br>${a.msg}`;
    }
    this.hud.innerHTML = html;
  }

  buildRings() {
    this.clearRings();
    RACE.forEach(([x, z], i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.4, 0.12, 8, 32),
        new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffcc00 : 0x44aaff, transparent: true, opacity: 0.85 })
      );
      ring.position.set(x, this.world.heightAt(x, z) + 2.4, z);
      this.scene.add(ring);
      this.rings.push(ring);
    });
    // glowing blue guide line along the route, like Skate 3's challenge lines
    const pts = [this.world.spawns.hill.pos, ...RACE.map(([x, z]) => new THREE.Vector3(x, 0, z))].map(p => new THREE.Vector3(p.x, 0, p.z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const samples = curve.getSpacedPoints(300).map(p => new THREE.Vector3(p.x, this.world.heightAt(p.x, p.z) + 0.12, p.z));
    const path = new THREE.CatmullRomCurve3(samples);
    for (const [r, o] of [[0.06, 0.95], [0.22, 0.25]]) {
      const tube = new THREE.Mesh(new THREE.TubeGeometry(path, 600, r, 6, false),
        new THREE.MeshBasicMaterial({ color: 0x6cc4ff, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.scene.add(tube);
      this.rings.push(tube);
    }
  }

  clearRings() {
    for (const r of this.rings) { this.scene.remove(r); r.geometry.dispose(); }
    this.rings = [];
  }
}
