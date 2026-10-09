// Unified input: touch (pointer events), keyboard and gamepad.

import { readPad, padSettings } from './gamepad.js';
import { FlickRecognizer } from './tricks.js';
import { settings } from './storage.js';

const SIMPLE_DIRS = [
  // [angle centre, trick key]; angle 0 = up, 90 = right
  [0, 'ollie'], [45, 'heelflip'], [90, 'fsShove'], [135, 'laserFlip'],
  [180, 'manual'], [-135, 'flip360'], [-90, 'popShove'], [-45, 'kickflip'],
];

export class Input {
  constructor() {
    this.move = { x: 0, y: 0 };
    this.flick = { x: 0, y: 0 };
    this.push = false;
    this.brake = false;
    this.grabL = 0;
    this.grabR = 0;
    this.events = new Set();
    this.trick = null;
    this.manualHold = null;
    this.source = 'touch';
    this.padConnected = false;
    this.padType = null;
    this.enabled = true;

    this.recognizer = new FlickRecognizer();
    this.keys = new Set();
    this.prevPadButtons = [];
    this.pendingTricks = [];
    this.pendingEvents = new Set();

    this.touch = {
      left: null,  // {id, ox, oy, x, y}
      right: null, // {id, ox, oy, x, y, t0, fired, manual}
      push: false, grab: false, brake: false,
    };

    this.bindKeyboard();
    this.bindTouch();
  }

  // ---------- keyboard ----------
  bindKeyboard() {
    const direct = { Space: 'ollie', KeyQ: 'kickflip', KeyE: 'heelflip', KeyR: 'popShove', KeyF: 'flip360', KeyX: 'laserFlip' };
    const evts = { KeyT: 'respawn', KeyG: 'marker', KeyV: 'camera', Escape: 'pause', KeyP: 'pause' };
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      this.source = 'keyboard';
      if (!e.repeat) {
        if (direct[e.code]) this.pendingTricks.push({ key: direct[e.code], nollie: e.shiftKey });
        if (evts[e.code]) this.pendingEvents.add(evts[e.code]);
      }
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // ---------- touch ----------
  bindTouch() {
    const zl = document.getElementById('zoneLeft');
    const zr = document.getElementById('zoneRight');
    const stickL = document.getElementById('stickL');
    const stickR = document.getElementById('stickR');
    this.stickEls = { stickL, stickR };

    const start = (side) => (e) => {
      e.preventDefault();
      this.source = 'touch';
      const t = this.touch;
      if (t[side]) return;
      t[side] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), fired: false, manual: false };
      const el = side === 'left' ? stickL : stickR;
      el.style.left = e.clientX + 'px';
      el.style.top = e.clientY + 'px';
      el.classList.add('active');
      el.firstElementChild.style.transform = '';
      try { e.target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      document.getElementById('flickHint').classList.add('hidden');
    };
    const move = (side) => (e) => {
      const s = this.touch[side];
      if (!s || s.id !== e.pointerId) return;
      e.preventDefault();
      s.x = e.clientX; s.y = e.clientY;
      const dx = s.x - s.ox, dy = s.y - s.oy;
      const max = 55;
      const m = Math.hypot(dx, dy);
      const k = m > max ? max / m : 1;
      const el = side === 'left' ? stickL : stickR;
      el.firstElementChild.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      if (side === 'right' && settings.flickMode === 'simple' && !s.fired && m > 38) {
        s.fired = true;
        const ang = Math.atan2(dx, -dy) * 180 / Math.PI;
        let best = SIMPLE_DIRS[0], bestD = 999;
        for (const d of SIMPLE_DIRS) {
          let diff = Math.abs(ang - d[0]); if (diff > 180) diff = 360 - diff;
          if (diff < bestD) { bestD = diff; best = d; }
        }
        if (best[1] === 'manual') s.manual = true;
        else this.pendingTricks.push({ key: best[1], nollie: false });
      }
    };
    const end = (side) => (e) => {
      const s = this.touch[side];
      if (!s || s.id !== e.pointerId) return;
      if (side === 'right' && settings.flickMode === 'simple' && !s.fired) {
        const quick = performance.now() - s.t0 < 300;
        if (quick && Math.hypot(s.x - s.ox, s.y - s.oy) < 30) this.pendingTricks.push({ key: 'ollie', nollie: false });
      }
      this.touch[side] = null;
      (side === 'left' ? stickL : stickR).classList.remove('active');
    };
    for (const [el, side] of [[zl, 'left'], [zr, 'right']]) {
      el.addEventListener('pointerdown', start(side));
      el.addEventListener('pointermove', move(side));
      el.addEventListener('pointerup', end(side));
      el.addEventListener('pointercancel', end(side));
      el.addEventListener('lostpointercapture', end(side));
    }

    const hold = (id, key) => {
      const el = document.getElementById(id);
      const on = e => { e.preventDefault(); this.source = 'touch'; this.touch[key] = true; el.classList.add('held'); };
      const off = e => { e.preventDefault(); this.touch[key] = false; el.classList.remove('held'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    };
    hold('tPush', 'push');
    hold('tGrab', 'grab');
    hold('tBrake', 'brake');
  }

  sendEvent(name) {
    this.pendingEvents.add(name);
  }

  // ---------- per frame ----------
  update(dt) {
    const k = this.keys;
    const t = this.touch;
    this.events = this.pendingEvents;
    this.pendingEvents = new Set();
    let trick = this.pendingTricks.shift() || null;
    this.pendingTricks.length = 0;

    // keyboard
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let my = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
    let fx = (k.has('KeyL') ? 1 : 0) - (k.has('KeyJ') ? 1 : 0);
    let fy = (k.has('KeyK') ? 1 : 0) - (k.has('KeyI') ? 1 : 0);
    let push = k.has('KeyW') || k.has('ShiftLeft');
    let brake = k.has('KeyS');
    let grabL = k.has('KeyZ') ? 1 : 0;
    let grabR = k.has('KeyC') ? 1 : 0;

    // touch
    if (t.left) {
      const dx = (t.left.x - t.left.ox) / 55, dy = (t.left.y - t.left.oy) / 55;
      mx += Math.max(-1, Math.min(1, dx));
      my += Math.max(-1, Math.min(1, dy));
    }
    let touchManual = null;
    if (t.right) {
      if (settings.flickMode === 'pro') {
        const dx = (t.right.x - t.right.ox) / 55, dy = (t.right.y - t.right.oy) / 55;
        const m = Math.hypot(dx, dy), s = m > 1 ? 1 / m : 1;
        fx += dx * s; fy += dy * s;
      } else if (t.right.manual) {
        touchManual = 'manual';
      }
    }
    if (t.push) push = true;
    if (t.brake) brake = true;
    if (t.grab) grabR = 1;
    if (settings.autoPush && this.source === 'touch') this.autoPush = true; else this.autoPush = false;

    // gamepad
    const pad = readPad();
    this.padConnected = !!pad;
    this.padType = pad ? pad.type : null;
    if (pad) {
      const map = padSettings.map;
      const b = pad.buttons;
      const any = b.some(Boolean) || Math.hypot(pad.ls.x, pad.ls.y) > 0.3 || Math.hypot(pad.rs.x, pad.rs.y) > 0.3;
      if (any) this.source = 'gamepad';
      mx += pad.ls.x; my += pad.ls.y;
      fx += pad.rs.x; fy += pad.rs.y;
      if (b[map.push]) push = true;
      if (b[map.brake]) brake = true;
      grabL = Math.max(grabL, pad.values[map.grabL] || 0);
      grabR = Math.max(grabR, pad.values[map.grabR] || 0);
      // shoulder buttons also grab
      if (b[4]) grabL = 1;
      if (b[5]) grabR = 1;
      const edge = (name) => b[map[name]] && !this.prevPadButtons[map[name]];
      for (const name of ['respawn', 'marker', 'camera', 'pause', 'pads']) if (edge(name)) this.events.add(name);
      this.prevPadButtons = b.slice();
    } else {
      this.prevPadButtons = [];
    }

    const clamp = v => Math.max(-1, Math.min(1, v));
    this.move.x = clamp(mx); this.move.y = clamp(my);
    const fm = Math.hypot(fx, fy);
    this.flick.x = fm > 1 ? fx / fm : fx;
    this.flick.y = fm > 1 ? fy / fm : fy;
    this.push = push;
    this.brake = brake;
    this.grabL = grabL;
    this.grabR = grabR;

    const flickEvent = this.recognizer.update(this.flick.x, this.flick.y, dt);
    if (!trick && flickEvent) trick = flickEvent;
    this.trick = trick;
    this.manualHold = this.recognizer.manualHold || touchManual;
  }
}
