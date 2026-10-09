import * as THREE from 'three';
import { World } from './world.js';
import { buildSkyDome } from './env.js';
import { Skater, DEFAULT_LOOK } from './skater.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Score } from './score.js';
import { ControllerTool } from './controllers.js';
import { Particles } from './fx.js';
import { Npcs } from './npc.js';
import { Replay } from './replay.js';
import { Modes, MODES } from './modes.js';
import { settings, saveSettings, isTouch, load, save } from './storage.js';
import { detectType, typeLabel } from './gamepad.js';

const $ = id => document.getElementById(id);

// ---------- renderer / scene ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd8e6f0, 90, 420);
buildSkyDome(scene);

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1200);

const hemi = new THREE.HemisphereLight(0xd4e6ff, 0x8b7d5c, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3df, 2.3);
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 120;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

let baseFov = 72;
function applyQuality() {
  const high = settings.quality === 'high';
  renderer.shadowMap.enabled = high;
  sun.castShadow = high;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.5));
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  resize();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  baseFov = w < h ? 85 : (settings.camera === 'far' ? 65 : 72);
  camera.fov = baseFov;
  camera.updateProjectionMatrix();
  checkRotate();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------- game objects ----------
const world = new World(scene);
const sound = new Sound();
const score = new Score(sound);
const skater = new Skater(scene, world, sound, score);
const input = new Input();
const padTool = new ControllerTool(input);
const fx = new Particles(scene);
const npcs = new Npcs(scene, world, 3);
const replay = new Replay(skater, camera, canvas);
const look = Object.assign({}, DEFAULT_LOOK, load('look', {}));
skater.applyLook(look);
skater.onGrindFx = (p, kind, s) => fx.sparks(p, kind, s);
skater.spawn(world.spawns.plaza.pos, world.spawns.plaza.heading);
npcs.setEnabled(settings.npcs !== false);
sound.setRadio(settings.radio || 'off');

// ---------- UI state ----------
let state = 'menu'; // menu | play | pause | replay
const overlays = ['menu', 'pause', 'how', 'settings', 'pads', 'modes', 'modeResult', 'custom', 'dropper'];
let returnTo = 'menu';
let rotateDismissed = false;
let lastModeId = null;

const modes = new Modes({
  skater, world, score, scene, sound,
  onEnd: (result) => {
    $('pQuitMode').classList.add('hidden');
    if (!result) return;
    state = 'pause';
    $('mrTitle').textContent = result.title;
    $('mrMedal').textContent = result.medal;
    $('mrText').textContent = result.text;
    show('modeResult');
  },
});

function show(id) {
  for (const o of overlays) $(o).classList.toggle('hidden', o !== id);
}

function play() {
  sound.unlock();
  state = 'play';
  show(null);
  $('hud').classList.remove('hidden');
  updateTouchVisibility();
}

function pause() {
  if (state !== 'play') return;
  state = 'pause';
  show('pause');
}

function openSub(id) {
  if (state === 'menu') returnTo = 'menu';
  else returnTo = 'pause';
  if (state === 'play') state = 'pause';
  show(id);
}

function closeSub() {
  if (returnTo === 'menu') show('menu');
  else play();
}

function updateTouchVisibility() {
  const showTouch = state === 'play' && (input.source === 'touch' || (isTouch && !input.padConnected));
  $('touch').classList.toggle('hidden', !showTouch);
  document.body.classList.toggle('lefty', settings.lefty);
}

function checkRotate() {
  const portrait = window.innerHeight > window.innerWidth;
  $('rotate').classList.toggle('hidden', !(isTouch && portrait && !rotateDismissed));
}

function openReplay() {
  if (state !== 'play' && state !== 'pause') return;
  if (!replay.open()) { score.toast('Skate a bit first, then open the replay'); return; }
  state = 'replay';
  show(null);
  $('hud').classList.add('hidden');
  $('touch').classList.add('hidden');
}
replay.onExit = () => {
  $('hud').classList.remove('hidden');
  resize();
  play();
};

function startMode(id) {
  lastModeId = id;
  modes.start(id);
  $('pQuitMode').classList.remove('hidden');
  play();
}

// main menu
$('mPlay').addEventListener('click', () => { modes.stop(true); $('pQuitMode').classList.add('hidden'); play(); });
$('mModes').addEventListener('click', () => { renderModes(); openSub('modes'); });
$('mCustom').addEventListener('click', () => openSub('custom'));
$('mControllers').addEventListener('click', () => openSub('pads'));
$('mHow').addEventListener('click', () => openSub('how'));
$('mSettings').addEventListener('click', () => openSub('settings'));
// pause menu
$('pResume').addEventListener('click', play);
$('pControllers').addEventListener('click', () => openSub('pads'));
$('pHow').addEventListener('click', () => openSub('how'));
$('pSettings').addEventListener('click', () => openSub('settings'));
$('pCustom').addEventListener('click', () => openSub('custom'));
$('pModes').addEventListener('click', () => { renderModes(); openSub('modes'); });
$('pDropper').addEventListener('click', () => openSub('dropper'));
$('pReplay').addEventListener('click', openReplay);
$('pQuitMode').addEventListener('click', () => { modes.stop(true); $('pQuitMode').classList.add('hidden'); play(); });
for (const b of document.querySelectorAll('[data-spawn]')) {
  b.addEventListener('click', () => {
    const s = world.spawns[b.dataset.spawn];
    skater.spawn(s.pos, s.heading);
    play();
  });
}
for (const b of document.querySelectorAll('.overlay .close')) b.addEventListener('click', closeSub);
// mode result
$('mrRetry').addEventListener('click', () => startMode(lastModeId));
$('mrExit').addEventListener('click', play);
// HUD buttons
$('btnPause').addEventListener('click', pause);
$('btnPad').addEventListener('click', () => openSub('pads'));
$('btnMarker').addEventListener('click', () => setMarker());
$('btnRespawn').addEventListener('click', () => toMarker());
$('btnWalk').addEventListener('click', () => input.sendEvent('offBoard'));
$('btnReplay').addEventListener('click', openReplay);
$('rotateDismiss').addEventListener('click', () => { rotateDismissed = true; checkRotate(); });

function renderModes() {
  const list = $('modeList');
  list.innerHTML = '';
  for (const m of MODES) {
    const b = document.createElement('button');
    b.className = 'mode-card';
    const t = document.createElement('b'); t.textContent = m.name;
    const d = document.createElement('span'); d.textContent = m.desc;
    const r = document.createElement('span'); r.textContent = modes.bestText(m);
    b.append(t, d, r);
    b.addEventListener('click', () => startMode(m.id));
    list.append(b);
  }
}

function setMarker() {
  if (skater.setMarker()) score.toast('📍 Session marker set');
  else score.toast('Stand on the ground to set a marker');
}
function toMarker() {
  skater.toMarker(world.spawns.plaza);
}

// object dropper
for (const b of document.querySelectorAll('[data-drop]')) {
  b.addEventListener('click', () => {
    const travel = skater.heading + (skater.fakie && skater.mode !== 'walk' ? Math.PI : 0);
    const h = skater.mode === 'walk' ? Math.atan2(skater.walkDir.x, skater.walkDir.z) : travel;
    world.drop(b.dataset.drop, skater.pos, h);
    score.toast('📦 Object dropped');
    play();
  });
}
$('dClear').addEventListener('click', () => { world.clearDropped(); score.toast('Dropped objects removed'); play(); });

// create-a-skater
const lookInputs = { cShirt: 'shirt', cPants: 'pants', cSkin: 'skin', cShoes: 'shoes', cCap: 'cap', cDeck: 'deck', cHair: 'hair' };
function syncLookUI() {
  for (const [id, key] of Object.entries(lookInputs)) $(id).value = look[key];
  $('cStance').value = look.stance;
  $('cTop').value = look.top;
  $('cHat').value = look.hat;
}
function lookChanged() {
  skater.applyLook(look);
  save('look', look);
}
for (const [id, key] of Object.entries(lookInputs)) {
  $(id).addEventListener('input', e => { look[key] = e.target.value; lookChanged(); });
}
$('cStance').addEventListener('change', e => { look.stance = e.target.value; lookChanged(); });
$('cTop').addEventListener('change', e => { look.top = e.target.value; lookChanged(); });
$('cHat').addEventListener('change', e => { look.hat = e.target.value; lookChanged(); });
$('cRandom').addEventListener('click', () => {
  const rc = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  Object.assign(look, { shirt: rc(), pants: rc(), shoes: rc(), cap: rc(), deck: rc(), skin: pick(skins), hair: pick(['#141010', '#3b2414', '#7a5230', '#d9b26a']), top: pick(['tank', 'tee', 'hoodie']), hat: pick(['none', 'cap', 'beanie']) });
  syncLookUI();
  lookChanged();
});
$('cDefault').addEventListener('click', () => { Object.assign(look, DEFAULT_LOOK); syncLookUI(); lookChanged(); });
syncLookUI();

// settings
const sFlick = $('sFlickMode'), sAuto = $('sAutoPush'), sLefty = $('sLefty'), sSound = $('sSound'), sCam = $('sCamera'), sQ = $('sQuality'), sRadio = $('sRadio'), sNpcs = $('sNpcs');
sFlick.value = settings.flickMode;
sAuto.checked = settings.autoPush;
sLefty.checked = settings.lefty;
sSound.checked = settings.sound;
sCam.value = settings.camera;
sQ.value = settings.quality;
sRadio.value = settings.radio || 'off';
sNpcs.checked = settings.npcs !== false;
const onSetting = () => {
  settings.flickMode = sFlick.value;
  settings.autoPush = sAuto.checked;
  settings.lefty = sLefty.checked;
  settings.sound = sSound.checked;
  settings.camera = sCam.value;
  settings.radio = sRadio.value;
  settings.npcs = sNpcs.checked;
  const qChanged = settings.quality !== sQ.value;
  settings.quality = sQ.value;
  saveSettings();
  sound.unlock();
  sound.setEnabled(settings.sound);
  sound.setRadio(settings.radio);
  npcs.setEnabled(settings.npcs);
  document.body.classList.toggle('lefty', settings.lefty);
  if (qChanged) applyQuality(); else resize();
};
for (const el of [sFlick, sAuto, sLefty, sSound, sCam, sQ, sRadio, sNpcs]) el.addEventListener('change', onSetting);
$('sReset').addEventListener('click', () => {
  if (confirm('Reset your score and challenges?')) score.resetAll();
});

// audio unlock on first interaction (required on iOS)
const unlock = () => sound.unlock();
window.addEventListener('pointerdown', unlock, { passive: true });
window.addEventListener('keydown', unlock);

// controller connect / disconnect messages
window.addEventListener('gamepadconnected', e => {
  score.toast(`🎮 ${typeLabel(detectType(e.gamepad.id))} connected`);
  input.source = 'gamepad';
});
window.addEventListener('gamepaddisconnected', e => {
  score.toast(`🎮 ${typeLabel(detectType(e.gamepad.id))} disconnected`);
  if (state === 'play') pause();
});

// ---------- camera ----------
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
let camYaw = 0;
let camInit = false;

function updateCamera(dt) {
  const far = settings.camera === 'far';
  const walk = skater.mode === 'walk';
  const dist = far ? 6.2 : walk ? 3.2 : 3.3;
  const height = far ? 2.6 : walk ? 1.6 : 1.45;
  const look = far ? 1.0 : walk ? 1.2 : 0.95;

  const p = skater.pos;
  if (!camInit) {
    camTarget.copy(p);
    camYaw = skater.heading;
  }
  const kx = 1 - Math.exp(-12 * dt), ky = 1 - Math.exp(-6 * dt);
  camTarget.x += (p.x - camTarget.x) * kx;
  camTarget.z += (p.z - camTarget.z) * kx;
  camTarget.y += (p.y - camTarget.y) * ky;

  const hs = Math.hypot(skater.vel.x, skater.vel.z);
  let want = camYaw;
  if (skater.mode === 'grind' && skater.grind) {
    const d = skater.grind.rail.dir;
    want = Math.atan2(d.x * Math.sign(skater.grind.s), d.z * Math.sign(skater.grind.s));
  } else if (hs > 1.2 && skater.mode !== 'bail') {
    want = Math.atan2(skater.vel.x, skater.vel.z);
  } else if (skater.mode === 'ground' && hs < 0.3) {
    want = skater.heading + (skater.fakie ? Math.PI : 0);
  }
  let diff = want - camYaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const rate = skater.mode === 'air' ? 1.5 : walk ? 1.2 : 2 + Math.min(hs, 8) * 0.5;
  camYaw += diff * (1 - Math.exp(-rate * dt));
  input.camYaw = camYaw;

  const desired = new THREE.Vector3(
    camTarget.x - Math.sin(camYaw) * dist,
    camTarget.y + height,
    camTarget.z - Math.cos(camYaw) * dist
  );
  const gh = world.heightAt(desired.x, desired.z);
  if (desired.y < gh + 0.5) desired.y = gh + 0.5;
  if (!camInit) { camPos.copy(desired); camInit = true; }
  camPos.lerp(desired, 1 - Math.exp(-10 * dt));
  camera.position.copy(camPos);
  // screen shake on hard landings and slams
  if (skater.shake > 0) {
    const s = skater.shake * 0.12;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }
  camera.lookAt(camTarget.x, camTarget.y + look, camTarget.z);
  // the skate cam widens with speed for that fisheye feel
  const fov = baseFov + (far ? 0 : Math.min(18, skater.speed) * 0.6);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-4 * dt));
    camera.updateProjectionMatrix();
  }

  sun.position.set(p.x + 22, p.y + 40, p.z + 14);
  sun.target.position.copy(p);
}

// ---------- Skate 3 style HUD: compass, Coach tips, distance meter ----------
const needle = $('compassNeedle');
const compassLabel = $('compassLabel');
const coachBox = $('coachBox');
const coachText = $('coachText');
const distMeter = $('distMeter');
const TIPS = [
  'Pull back on the right stick, then flick it up to Ollie.',
  'Flick up-left after pulling back for a Kickflip.',
  'Roll the right stick around to the top for a 360 Flip.',
  'Land your board straight, forwards or fakie, or you will bail.',
  'Hold a trigger in the air to grab. Let go before you land!',
  'Ollie onto a rail and you will lock into a grind.',
  'Hit the Mega Ramp from the top for huge air. Pause → Mega Ramp.',
  'Set a session marker with D-pad up and go back to it with D-pad down.',
  'Tap Revert (B / ○) as you land in a transition to spin back around.',
  'Want to see that line again? Open the Replay Editor.',
  'Get off your board with Y / △ to walk around the plaza.',
  'Drop your own kickers and rails with the Object Dropper.',
  'Try S.K.A.T.E. against me in Game Modes.',
];
let tipTimer = 6, tipShown = 0, tipIndex = 0;
let distShow = 0, wasAir = false;

function coachSay(text, secs = 6) {
  coachText.textContent = text;
  coachBox.classList.add('show');
  tipShown = secs;
}

function updateHud(dt) {
  // compass points to the next race checkpoint, your marker, or north
  let tx = null, tz = null, label = 'N';
  const race = modes.active && modes.active.mode.id === 'race' && modes.raceTarget && modes.raceTarget();
  if (race) { [tx, tz] = race; label = '🏁'; }
  else if (skater.marker) { tx = skater.marker.pos.x; tz = skater.marker.pos.z; label = '📍'; }
  const yaw = tx == null ? 0 : Math.atan2(tx - skater.pos.x, tz - skater.pos.z);
  needle.style.transform = `rotate(${(-(yaw - camYaw)) * 180 / Math.PI}deg)`;
  if (compassLabel.textContent !== label) compassLabel.textContent = label;

  // Coach tips every so often
  if (tipShown > 0) {
    tipShown -= dt;
    if (tipShown <= 0) coachBox.classList.remove('show');
  } else if ((tipTimer -= dt) <= 0) {
    coachSay(TIPS[tipIndex++ % TIPS.length]);
    tipTimer = 28;
  }

  // jump distance meter
  const air = skater.mode === 'air';
  if (air) {
    const d = Math.hypot(skater.pos.x - skater.takeoffPos.x, skater.pos.z - skater.takeoffPos.z);
    if (d > 1.5) { distMeter.textContent = `${d.toFixed(1)} m`; distMeter.classList.add('show'); }
  } else if (wasAir) {
    distShow = skater.mode === 'ground' ? 1.8 : 0;
  }
  wasAir = air;
  if (!air) {
    distShow -= dt;
    if (distShow <= 0) distMeter.classList.remove('show');
  }
}

// ---------- loop ----------
const speedo = $('speedo');
const padDot = $('padDot');
let last = performance.now();
let lastSource = null;
let lastPad = null;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;

  input.update(dt);
  const ev = padTool.listening ? new Set() : input.events;
  input.events = ev;

  if (input.padConnected !== lastPad) {
    lastPad = input.padConnected;
    padDot.classList.toggle('on', lastPad);
  }
  if (input.source !== lastSource) {
    lastSource = input.source;
    updateTouchVisibility();
  }
  if (ev.size || input.push) sound.unlock();

  if (state === 'play') {
    if (ev.has('pause')) pause();
    else if (ev.has('pads')) openSub('pads');
    else if (ev.has('replay')) openReplay();
    else if (ev.has('dropper')) openSub('dropper');
    else {
      if (ev.has('respawn')) toMarker();
      if (ev.has('marker')) setMarker();
      if (ev.has('camera')) {
        settings.camera = settings.camera === 'far' ? 'skate' : 'far';
        sCam.value = settings.camera;
        saveSettings();
        resize();
      }
      skater.update(dt, input);
      npcs.update(dt, skater);
      modes.update(dt);
      replay.record(dt);
    }
    updateHud(dt);
    fx.update(dt);
    updateCamera(dt);
  } else if (state === 'replay') {
    if (ev.has('pause') || ev.has('replay')) replay.close();
    replay.update(dt);
  } else {
    // simple controller navigation of menus
    if (ev.has('pause')) {
      if (!$('menu').classList.contains('hidden') || !$('pause').classList.contains('hidden')) play();
      else closeSub();
    } else if (ev.has('pads')) {
      if (padTool.isOpen) closeSub(); else openSub('pads');
    } else if (input.push && !$('menu').classList.contains('hidden')) {
      play();
    }
    updateCamera(dt);
  }

  if (padTool.isOpen) padTool.update();
  speedo.textContent = `${Math.round(skater.speed * 3.6)} km/h${skater.fakie && skater.mode === 'ground' && skater.speed > 1 ? ' · FAKIE' : ''}${skater.mode === 'walk' ? ' · ON FOOT' : ''}`;
  renderer.render(scene, camera);
}

applyQuality();
requestAnimationFrame(frame);

// Offline support / install as an app
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// expose for debugging in the console
window.skateFan = { skater, world, input, score, modes, replay, npcs };
