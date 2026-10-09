// The "Controller Connect" tool: pairing help for Xbox / PS5 controllers on
// iPhone, a list of detected controllers, a live button/stick tester,
// deadzone / swap / rumble settings and button remapping.

import {
  ACTIONS, DEFAULT_MAP, padSettings, savePadSettings, listPads, activePad,
  detectType, typeLabel, glyph, rumble,
} from './gamepad.js';

const LAYOUTS = {
  xbox: { ls: [24, 40], dpad: [37, 70], rs: [63, 70], face: [77, 40] },
  ps: { ls: [37, 72], dpad: [23, 40], rs: [63, 72], face: [77, 40] },
};

export class ControllerTool {
  constructor(input) {
    this.input = input;
    this.el = document.getElementById('pads');
    this.listEl = document.getElementById('padList');
    this.tester = document.getElementById('tester');
    this.vis = document.getElementById('padVis');
    this.flickSeen = document.getElementById('flickSeen');
    this.mapList = document.getElementById('mapList');
    this.listening = null;
    this.listenPrev = null;
    this.lastSig = '';
    this.visType = null;
    this.visEls = null;

    // tabs
    for (const tab of this.el.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => this.showTab(tab.dataset.tab));
    }

    // settings
    const dz = document.getElementById('pDeadzone');
    const dzVal = document.getElementById('dzVal');
    dz.value = padSettings.deadzone;
    dzVal.textContent = (+padSettings.deadzone).toFixed(2);
    dz.addEventListener('input', () => {
      padSettings.deadzone = +dz.value;
      dzVal.textContent = (+dz.value).toFixed(2);
      savePadSettings();
    });
    const swap = document.getElementById('pSwap');
    swap.checked = padSettings.swap;
    swap.addEventListener('change', () => { padSettings.swap = swap.checked; savePadSettings(); });
    const rum = document.getElementById('pRumble');
    rum.checked = padSettings.rumble;
    rum.addEventListener('change', () => { padSettings.rumble = rum.checked; savePadSettings(); });
    document.getElementById('pRumbleTest').addEventListener('click', () => {
      const pad = activePad();
      if (!pad) return this.flash('Connect a controller first');
      if (!pad.vibrationActuator) return this.flash('Rumble is not supported by this browser');
      const was = padSettings.rumble;
      padSettings.rumble = true;
      rumble(1, 1, 400);
      padSettings.rumble = was;
    });
    document.getElementById('pMapReset').addEventListener('click', () => {
      padSettings.map = Object.assign({}, DEFAULT_MAP);
      savePadSettings();
      this.renderMap();
    });

    // guess the right tab from the device / last controller
    this.showTab(/playstation|ps5|dualsense/i.test(navigator.userAgent) ? 'ps' : 'xbox');
    this.renderMap();
  }

  flash(text) {
    this.flickSeen.textContent = text;
  }

  showTab(name) {
    for (const t of this.el.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.tab === name);
    document.getElementById('stepsXbox').classList.toggle('hidden', name !== 'xbox');
    document.getElementById('stepsPs').classList.toggle('hidden', name !== 'ps');
  }

  get isOpen() {
    return !this.el.classList.contains('hidden');
  }

  renderList() {
    const pads = listPads();
    const active = activePad();
    const sig = pads.map(p => p.index + p.id).join('|') + (active ? active.index : '');
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    this.listEl.innerHTML = '';
    if (!pads.length) {
      const d = document.createElement('div');
      d.className = 'muted';
      d.textContent = 'No controller yet. Pair it in Bluetooth settings, then press a button on it…';
      this.listEl.append(d);
      this.tester.classList.add('hidden');
      return;
    }
    for (const p of pads) {
      const type = detectType(p.id);
      const card = document.createElement('div');
      card.className = 'pad-card' + (active && active.index === p.index ? ' active' : '');
      const icon = document.createElement('div');
      icon.className = 'pad-icon';
      icon.textContent = '🎮';
      const info = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'pad-name';
      name.textContent = `${typeLabel(type)} · slot ${p.index + 1}`;
      const sub = document.createElement('div');
      sub.className = 'pad-sub';
      sub.textContent = `${p.id}${p.mapping === 'standard' ? ' · standard layout' : ' · non-standard layout (buttons may differ)'}`;
      info.append(name, sub);
      card.append(icon, info);
      if (!active || active.index !== p.index) {
        const use = document.createElement('button');
        use.textContent = 'Use this';
        use.addEventListener('click', () => {
          padSettings.preferred = p.index;
          savePadSettings();
          this.lastSig = '';
        });
        card.append(use);
      } else {
        const tag = document.createElement('span');
        tag.style.marginLeft = 'auto';
        tag.style.color = 'var(--ok)';
        tag.style.fontSize = '13px';
        tag.textContent = 'In use';
        card.append(tag);
      }
      this.listEl.append(card);
    }
    this.tester.classList.remove('hidden');
    if (active) this.showTab(detectType(active.id) === 'ps' ? 'ps' : 'xbox');
    this.renderMap();
  }

  buildVis(type) {
    this.visType = type;
    const L = LAYOUTS[type] || LAYOUTS.xbox;
    const vis = this.vis;
    vis.innerHTML = '';
    const els = { buttons: {}, sticks: {}, trig: {} };
    const btn = (i, x, y, label) => {
      const b = document.createElement('div');
      b.className = 'pv-btn';
      b.style.left = x + '%';
      b.style.top = y + '%';
      b.textContent = label ?? glyph(type, i);
      vis.append(b);
      els.buttons[i] = b;
    };
    const stick = (key, [x, y]) => {
      const s = document.createElement('div');
      s.className = 'pv-stick';
      s.style.left = x + '%';
      s.style.top = y + '%';
      const d = document.createElement('div');
      d.className = 'dot';
      s.append(d);
      vis.append(s);
      els.sticks[key] = { s, d };
    };
    const trig = (i, x, y) => {
      const t = document.createElement('div');
      t.className = 'pv-trig';
      t.style.left = x + '%';
      t.style.top = y + '%';
      const f = document.createElement('div');
      f.className = 'fill';
      t.append(f);
      vis.append(t);
      els.trig[i] = f;
    };
    trig(6, 20, 3); trig(7, 80, 3);
    btn(4, 20, 14); btn(5, 80, 14);
    stick('ls', L.ls); stick('rs', L.rs);
    const [fx, fy] = L.face;
    btn(0, fx, fy + 15); btn(1, fx + 7, fy); btn(2, fx - 7, fy); btn(3, fx, fy - 15);
    const [dx, dy] = L.dpad;
    btn(12, dx, dy - 14, '▲'); btn(13, dx, dy + 14, '▼'); btn(14, dx - 6, dy, '◀'); btn(15, dx + 6, dy, '▶');
    btn(8, 40, 32); btn(9, 60, 32); btn(16, 50, 52);
    if (type === 'ps') btn(17, 50, 20);
    this.visEls = els;
  }

  renderMap() {
    const pad = activePad();
    const type = pad ? detectType(pad.id) : 'xbox';
    this.mapList.innerHTML = '';
    for (const [key, label] of ACTIONS) {
      const row = document.createElement('div');
      row.className = 'map-row' + (this.listening === key ? ' listening' : '');
      const l = document.createElement('span');
      l.textContent = label;
      const g = document.createElement('span');
      g.className = 'glyph';
      g.textContent = this.listening === key ? 'Press…' : glyph(type, padSettings.map[key]);
      const b = document.createElement('button');
      b.textContent = this.listening === key ? 'Cancel' : 'Change';
      b.addEventListener('click', () => {
        if (this.listening === key) this.listening = null;
        else {
          if (!pad) { this.flash('Connect a controller first'); return; }
          this.listening = key;
          this.listenPrev = null;
          this.listenStart = performance.now();
        }
        this.renderMap();
      });
      row.append(l, g, b);
      this.mapList.append(row);
    }
  }

  // Called every frame while the overlay is open.
  update() {
    this.renderList();
    const pad = activePad();
    if (!pad) return;
    const type = detectType(pad.id);
    if (type !== this.visType || !this.visEls) this.buildVis(type);
    const pressed = pad.buttons.map(b => b.pressed || b.value > 0.5);
    for (const [i, el] of Object.entries(this.visEls.buttons)) el.classList.toggle('on', !!pressed[i]);
    for (const [i, f] of Object.entries(this.visEls.trig)) f.style.width = Math.round((pad.buttons[i]?.value || 0) * 100) + '%';
    const ax = pad.axes;
    const place = (key, x, y, click) => {
      const { s, d } = this.visEls.sticks[key];
      d.style.transform = `translate(${x * 22}px, ${y * 22}px)`;
      s.classList.toggle('on', !!click || Math.hypot(x, y) > padSettings.deadzone);
    };
    place('ls', ax[0] || 0, ax[1] || 0, pressed[10]);
    place('rs', ax[2] || 0, ax[3] || 0, pressed[11]);
    this.flickSeen.textContent = this.input.recognizer.lastSeen || '–';

    // remapping: wait for a fresh button press
    if (this.listening) {
      if (!this.listenPrev) this.listenPrev = pressed;
      const idx = pressed.findIndex((p, i) => p && !this.listenPrev[i]);
      this.listenPrev = pressed;
      if (idx >= 0) {
        padSettings.map[this.listening] = idx;
        savePadSettings();
        this.listening = null;
        this.renderMap();
      } else if (performance.now() - this.listenStart > 8000) {
        this.listening = null;
        this.renderMap();
      }
    }
  }
}
