// Gamepad support for Xbox and PlayStation (DualSense / DualShock) controllers
// through the standard Gamepad API, which iPhone Safari supports once a
// controller is paired over Bluetooth.

import { load, save } from './storage.js';

export const ACTIONS = [
  ['push', 'Push'],
  ['brake', 'Brake / powerslide'],
  ['grabL', 'Grab (left hand)'],
  ['grabR', 'Grab (right hand)'],
  ['respawn', 'Back to marker'],
  ['marker', 'Set marker'],
  ['camera', 'Switch camera'],
  ['pause', 'Pause'],
  ['pads', 'Controller screen'],
];

export const DEFAULT_MAP = {
  push: 0, brake: 2, grabL: 6, grabR: 7, respawn: 3, marker: 12, camera: 1, pause: 9, pads: 8,
};

const GLYPHS = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'D↑', 'D↓', 'D←', 'D→', 'Xbox', 'Share'],
  ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→', 'PS', 'Pad'],
  generic: ['B0', 'B1', 'B2', 'B3', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→', 'Home', 'B17'],
};

export const padSettings = Object.assign(
  { deadzone: 0.18, swap: false, rumble: true, preferred: null },
  load('pad', {})
);
padSettings.map = Object.assign({}, DEFAULT_MAP, padSettings.map || {});

export function savePadSettings() {
  save('pad', padSettings);
}

export function detectType(id = '') {
  const s = id.toLowerCase();
  if (/xbox|xinput|045e|microsoft/.test(s)) return 'xbox';
  if (/dualsense|dualshock|playstation|054c|wireless controller|ps5|ps4/.test(s)) return 'ps';
  return 'generic';
}

export function typeLabel(type) {
  return type === 'xbox' ? 'Xbox controller' : type === 'ps' ? 'PlayStation controller' : 'Game controller';
}

export function glyph(type, index) {
  const g = GLYPHS[type] || GLYPHS.generic;
  return g[index] ?? 'B' + index;
}

export function listPads() {
  let pads = [];
  try {
    pads = Array.from(navigator.getGamepads ? navigator.getGamepads() : []);
  } catch {
    pads = [];
  }
  return pads.filter(p => p && p.connected !== false);
}

export function activePad() {
  const pads = listPads();
  if (!pads.length) return null;
  if (padSettings.preferred != null) {
    const p = pads.find(p => p.index === padSettings.preferred);
    if (p) return p;
  }
  return pads[0];
}

function radial(x, y, dz) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const s = Math.min(1, (m - dz) / (1 - dz)) / m;
  return { x: x * s, y: y * s };
}

// Reads the active pad into a plain object: sticks with deadzone, button states.
export function readPad() {
  const pad = activePad();
  if (!pad) return null;
  const ax = pad.axes || [];
  const dz = padSettings.deadzone;
  let ls = radial(ax[0] || 0, ax[1] || 0, dz);
  let rs = radial(ax[2] || 0, ax[3] || 0, dz);
  if (padSettings.swap) [ls, rs] = [rs, ls];
  const buttons = (pad.buttons || []).map(b => (typeof b === 'object' ? b.pressed || b.value > 0.5 : b === 1));
  const values = (pad.buttons || []).map(b => (typeof b === 'object' ? b.value : b));
  return { pad, type: detectType(pad.id), ls, rs, buttons, values };
}

export function rumble(strong = 0.6, weak = 0.4, ms = 120) {
  if (!padSettings.rumble) return;
  const pad = activePad();
  const act = pad && pad.vibrationActuator;
  if (!act || !act.playEffect) return;
  try {
    act.playEffect(act.type || 'dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak, startDelay: 0 })
      .catch(() => {});
  } catch {
    /* unsupported */
  }
}
