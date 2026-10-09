// Small localStorage wrapper. Storage can be unavailable (private mode), so
// every access is guarded and the game still works without it.

const PREFIX = 'skatefan.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const isTouch = typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export const settings = Object.assign({
  flickMode: 'simple',   // touch trick input: 'simple' swipes or 'pro' flick-it
  autoPush: false,
  lefty: false,
  sound: true,
  camera: 'skate',
  quality: isTouch ? 'low' : 'high',
  radio: 'off',
  npcs: true,
}, load('settings', {}));

export function saveSettings() {
  save('settings', settings);
}

export { isTouch };
