// Trick lines, scoring, Hall of Meat, challenges and the HUD text for them.

import { load, save } from './storage.js';

export const CHALLENGES = [
  { id: 'ollie', text: 'Land an Ollie' },
  { id: 'kickflip', text: 'Land a Kickflip' },
  { id: 'heelflip', text: 'Land a Heelflip' },
  { id: 'varialKick', text: 'Land a Varial Kickflip' },
  { id: 'hardflip', text: 'Land a Hardflip' },
  { id: 'flip360', text: 'Land a 360 Flip' },
  { id: 'laserFlip', text: 'Land a Laser Flip' },
  { id: 'doubleKick', text: 'Land a Double Kickflip (fast flick)' },
  { id: 'impossible', text: 'Land an Impossible' },
  { id: 'boneless', text: 'Land a Boneless (grab + ollie)' },
  { id: 'manual', text: 'Do a Manual' },
  { id: 'grind', text: 'Grind a rail, ledge or coping' },
  { id: 'grind2', text: 'Grind for 2 seconds' },
  { id: 'revert', text: 'Revert out of a landing' },
  { id: 'powerslide', text: 'Do a Powerslide' },
  { id: 'wallride', text: 'Do a Wallride' },
  { id: 'fingerflip', text: 'Flick while grabbing for a Fingerflip' },
  { id: 'spin360', text: 'Land a 360 spin' },
  { id: 'spin540', text: 'Land a 540 spin' },
  { id: 'grab1', text: 'Hold a grab for 1 second' },
  { id: 'air3', text: 'Get 3 m of air' },
  { id: 'gap:5 Stair', text: 'Jump the 5 Stair' },
  { id: 'gap:Funbox Gap', text: 'Clear the Funbox Gap' },
  { id: 'gap:Halfpipe Transfer', text: 'Transfer across the halfpipe' },
  { id: 'gap:Mega Ramp Gap', text: 'Clear the Mega Ramp Gap' },
  { id: 'combo5', text: 'Land a 5-trick line' },
  { id: 'line2k', text: 'Bank a 2,000 point line' },
  { id: 'line10k', text: 'Bank a 10,000 point line' },
  { id: 'line50k', text: 'Bank a 50,000 point line' },
  { id: 'meat10k', text: 'Hall of Meat: 10,000 damage in one bail' },
  { id: 'bones5', text: 'Hall of Meat: break 5 bones at once' },
];

export class Score {
  constructor(sound) {
    this.sound = sound;
    this.total = 0;
    this.best = load('best', 0);
    this.bestMeat = load('bestMeat', 0);
    this.done = new Set(load('challenges', []));
    this.line = [];
    this.linePts = 0;
    this.pending = new Set();   // challenge ids waiting for a clean landing
    this.idle = 0;
    this.onLine = null;         // game modes listen for finished lines
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
    else if (kind === 'spin') id = value >= 540 ? 'spin540' : value >= 360 ? 'spin360' : null;
    else if (kind === 'gap') id = 'gap:' + value;
    else id = kind;
    if (kind === 'spin' && value >= 540) this.pending.add('spin360');
    if (id && !this.done.has(id) && CHALLENGES.some(c => c.id === id)) this.pending.add(id);
  }

  landed(q = {}) {
    this.idle = 0;
    const last = this.line[this.line.length - 1];
    if (q.sketchy && last && !last.sketchy) {
      last.sketchy = true;
      this.linePts -= last.pts * 0.5;
      last.pts *= 0.5;
      this.showPop('Sketchy', 'bail');
    } else if (q.clean && last) {
      this.linePts += 50;
      this.showPop('Clean!', 'land');
    }
    if (this.line.length >= 5) this.pending.add('combo5');
    for (const id of this.pending) this.complete(id);
    this.pending.clear();
    this.renderLine();
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
    if (pts >= 50000) this.complete('line50k');
    for (const id of this.pending) this.complete(id);
    this.pending.clear();
    this.showPop(`+${pts.toLocaleString()}`, 'land');
    const tricks = this.line.map(t => t.name);
    this.line = [];
    this.linePts = 0;
    if (this.total > this.best) {
      this.best = this.total;
      save('best', this.best);
    }
    this.renderLine();
    this.renderScore();
    this.sound.blip(1320);
    if (this.onLine) this.onLine({ landed: true, tricks, points: pts });
  }

  bail(reason, damage = 0, bones = []) {
    const tricks = this.line.map(t => t.name);
    this.line = [];
    this.linePts = 0;
    this.pending.clear();
    this.renderLine();
    let sub = reason;
    if (damage) {
      sub += ` · Hall of Meat ${damage.toLocaleString()}`;
      if (bones.length) sub += ` · Broken: ${bones.join(', ')}`;
      if (damage > this.bestMeat) { this.bestMeat = damage; save('bestMeat', damage); }
      if (damage >= 10000) this.complete('meat10k');
      if (bones.length >= 5) this.complete('bones5');
    }
    this.showPop('BAILED', 'bail', sub);
    if (this.onLine) this.onLine({ landed: false, tricks, points: 0, damage, bones });
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
    this.bestMeat = 0;
    this.done.clear();
    save('best', 0);
    save('bestMeat', 0);
    save('challenges', []);
    this.renderScore();
    this.renderChallenges();
  }

  toast(text, secs = 2.5) {
    this.els.toast.textContent = text;
    this.els.toast.classList.add('show');
    this.toastTimer = secs;
  }

  showPop(text, cls, sub, secs = 1.3) {
    const el = this.els.pop;
    el.className = 'trick-pop show ' + (cls || '');
    el.innerHTML = '';
    el.append(text);
    if (sub) {
      const s = document.createElement('div');
      s.className = 'pop-sub';
      s.textContent = sub;
      el.append(s);
    }
    this.popTimer = sub ? Math.max(secs, 2.2) : secs;
  }

  renderScore() {
    this.els.score.textContent = this.total.toLocaleString();
    this.els.best.textContent = 'BEST ' + this.best.toLocaleString() + (this.bestMeat ? ' · MEAT ' + this.bestMeat.toLocaleString() : '');
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
