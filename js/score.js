// Trick lines, scoring, challenges and the HUD text that goes with them.

import { load, save } from './storage.js';

const CHALLENGES = [
  { id: 'ollie', text: 'Land an Ollie' },
  { id: 'kickflip', text: 'Land a Kickflip' },
  { id: 'heelflip', text: 'Land a Heelflip' },
  { id: 'flip360', text: 'Land a 360 Flip' },
  { id: 'manual', text: 'Do a Manual' },
  { id: 'grind2', text: 'Grind for 2 seconds' },
  { id: 'spin360', text: 'Land a 360 spin' },
  { id: 'grab1', text: 'Hold a grab for 1 second' },
  { id: 'air3', text: 'Get 3 m of air' },
  { id: 'combo5', text: 'Land a 5-trick line' },
  { id: 'line2k', text: 'Bank a 2,000 point line' },
  { id: 'line10k', text: 'Bank a 10,000 point line' },
];

export class Score {
  constructor(sound) {
    this.sound = sound;
    this.total = 0;
    this.best = load('best', 0);
    this.done = new Set(load('challenges', []));
    this.line = [];
    this.linePts = 0;
    this.pending = new Set();   // challenge ids waiting for a clean landing
    this.idle = 0;
    this.els = {
      score: document.getElementById('score'),
      best: document.getElementById('best'),
      line: document.getElementById('line'),
      pop: document.getElementById('trickPop'),
      toast: document.getElementById('toast'),
      list: document.getElementById('challenges'),
      count: document.getElementById('chCount'),
    };
    this.popTimer = 0;
    this.toastTimer = 0;
    this.renderScore();
    this.renderChallenges();
  }

  reset() {
    this.line = [];
    this.linePts = 0;
    this.pending.clear();
    this.renderLine();
  }

  addTrick(name, pts, continuous = false) {
    this.line.push({ name, pts, continuous });
    this.linePts += pts;
    this.idle = 0;
    this.renderLine();
  }

  addBonus(pts) {
    this.linePts += pts;
    this.renderLine();
  }

  tickContinuous(dt, rate) {
    const last = this.line[this.line.length - 1];
    if (!last) return;
    const add = rate * dt;
    last.pts += add;
    this.linePts += add;
    this.idle = 0;
    this.renderLineThrottled();
  }

  // Challenge progress counts only if the line is not bailed.
  challenge(kind, value) {
    let id = null;
    if (kind === 'trick') id = value;
    else if (kind === 'spin') id = value >= 360 ? 'spin360' : null;
    else id = kind;
    if (id && !this.done.has(id) && CHALLENGES.some(c => c.id === id)) this.pending.add(id);
  }

  landed() {
    this.idle = 0;
    if (this.line.length >= 5) this.pending.add('combo5');
    // tricks done in the air are now confirmed
    for (const id of this.pending) this.complete(id);
    this.pending.clear();
  }

  update(dt, busy) {
    this.popTimer -= dt;
    this.toastTimer -= dt;
    if (this.popTimer <= 0) this.els.pop.classList.remove('show');
    if (this.toastTimer <= 0) this.els.toast.classList.remove('show');
    if (!this.line.length) return;
    if (busy) { this.idle = 0; return; }
    this.idle += dt;
    if (this.idle > 0.9) this.bank();
  }

  bank() {
    const mult = this.line.length;
    const pts = Math.round(this.linePts * mult);
    this.total += pts;
    if (pts >= 2000) this.complete('line2k');
    if (pts >= 10000) this.complete('line10k');
    for (const id of this.pending) this.complete(id);
    this.pending.clear();
    this.showPop(`+${pts.toLocaleString()}`, 'land');
    this.line = [];
    this.linePts = 0;
    if (this.total > this.best) {
      this.best = this.total;
      save('best', this.best);
    }
    this.renderLine();
    this.renderScore();
    this.sound.blip(1320);
  }

  bail(reason) {
    this.line = [];
    this.linePts = 0;
    this.pending.clear();
    this.renderLine();
    this.showPop('BAILED', 'bail', reason);
  }

  complete(id) {
    if (this.done.has(id)) return;
    const c = CHALLENGES.find(c => c.id === id);
    if (!c) return;
    this.done.add(id);
    save('challenges', [...this.done]);
    this.toast(`✔ Challenge: ${c.text}`);
    this.renderChallenges();
    this.sound.blip(990);
  }

  resetAll() {
    this.total = 0;
    this.best = 0;
    this.done.clear();
    save('best', 0);
    save('challenges', []);
    this.renderScore();
    this.renderChallenges();
  }

  toast(text, secs = 2.5) {
    this.els.toast.textContent = text;
    this.els.toast.classList.add('show');
    this.toastTimer = secs;
  }

  showPop(text, cls, sub) {
    const el = this.els.pop;
    el.className = 'trick-pop show ' + (cls || '');
    el.innerHTML = '';
    el.append(text);
    if (sub) {
      const s = document.createElement('div');
      s.style.fontSize = '14px';
      s.style.fontStyle = 'normal';
      s.textContent = sub;
      el.append(s);
    }
    this.popTimer = 1.3;
  }

  renderScore() {
    this.els.score.textContent = this.total.toLocaleString();
    this.els.best.textContent = 'BEST ' + this.best.toLocaleString();
  }

  renderLineThrottled() {
    const now = performance.now();
    if (now - (this._lastRender || 0) > 100) this.renderLine();
  }

  renderLine() {
    this._lastRender = performance.now();
    const el = this.els.line;
    if (!this.line.length) { el.textContent = ''; return; }
    const names = this.line.map(t => t.name).join(' + ');
    el.textContent = names;
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = `${Math.round(this.linePts).toLocaleString()} × ${this.line.length}`;
    el.append(pts);
  }

  renderChallenges() {
    const list = this.els.list;
    list.innerHTML = '';
    for (const c of CHALLENGES) {
      const li = document.createElement('li');
      li.textContent = c.text;
      if (this.done.has(c.id)) li.className = 'done';
      list.append(li);
    }
    this.els.count.textContent = `${this.done.size}/${CHALLENGES.length}`;
  }
}
