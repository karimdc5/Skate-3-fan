import * as THREE from 'three';
import { World, buildSky } from './world.js';
import { Skater } from './skater.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Score } from './score.js';
import { ControllerTool } from './controllers.js';
import { settings, saveSettings, isTouch } from './storage.js';
import { detectType, typeLabel } from './gamepad.js';

const $ = id => document.getElementById(id);

// ---------- renderer / scene ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe9d8bb, 70, 230);
buildSky(scene);

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 600);

const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6b5a45, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 120;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

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
  camera.fov = w < h ? 85 : (settings.camera === 'far' ? 65 : 72);
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
skater.spawn(world.spawns.plaza.pos, world.spawns.plaza.heading);

// ---------- UI state ----------
let state = 'menu'; // menu | play | pause
const overlays = ['menu', 'pause', 'how', 'settings', 'pads'];
let returnTo = 'menu';
let rotateDismissed = false;

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
  returnTo = state === 'menu' ? 'menu' : 'pause';
  if (state === 'play') state = 'pause';
  show(id);
}

function closeSub() {
  show(returnTo);
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

// main menu
$('mPlay').addEventListener('click', play);
$('mControllers').addEventListener('click', () => openSub('pads'));
$('mHow').addEventListener('click', () => openSub('how'));
$('mSettings').addEventListener('click', () => openSub('settings'));
// pause menu
$('pResume').addEventListener('click', play);
$('pControllers').addEventListener('click', () => openSub('pads'));
$('pHow').addEventListener('click', () => openSub('how'));
$('pSettings').addEventListener('click', () => openSub('settings'));
const spawnAt = name => { skater.spawn(world.spawns[name].pos, world.spawns[name].heading); play(); };
$('pSpawnPlaza').addEventListener('click', () => spawnAt('plaza'));
$('pSpawnHalf').addEventListener('click', () => spawnAt('half'));
$('pSpawnHill').addEventListener('click', () => spawnAt('hill'));
for (const b of document.querySelectorAll('.overlay .close')) b.addEventListener('click', closeSub);
// HUD buttons
$('btnPause').addEventListener('click', pause);
$('btnPad').addEventListener('click', () => openSub('pads'));
$('btnMarker').addEventListener('click', () => setMarker());
$('btnRespawn').addEventListener('click', () => toMarker());
$('rotateDismiss').addEventListener('click', () => { rotateDismissed = true; checkRotate(); });

function setMarker() {
  if (skater.setMarker()) score.toast('📍 Marker set');
  else score.toast('Stand on the ground to set a marker');
}
function toMarker() {
  skater.toMarker(world.spawns.plaza);
}

// settings
const sFlick = $('sFlickMode'), sAuto = $('sAutoPush'), sLefty = $('sLefty'), sSound = $('sSound'), sCam = $('sCamera'), sQ = $('sQuality');
sFlick.value = settings.flickMode;
sAuto.checked = settings.autoPush;
sLefty.checked = settings.lefty;
sSound.checked = settings.sound;
sCam.value = settings.camera;
sQ.value = settings.quality;
const onSetting = () => {
  settings.flickMode = sFlick.value;
  settings.autoPush = sAuto.checked;
  settings.lefty = sLefty.checked;
  settings.sound = sSound.checked;
  settings.camera = sCam.value;
  const qChanged = settings.quality !== sQ.value;
  settings.quality = sQ.value;
  saveSettings();
  sound.setEnabled(settings.sound);
  document.body.classList.toggle('lefty', settings.lefty);
  if (qChanged) applyQuality(); else resize();
};
for (const el of [sFlick, sAuto, sLefty, sSound, sCam, sQ]) el.addEventListener('change', onSetting);
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
  const dist = far ? 6.2 : 3.5;
  const height = far ? 2.6 : 1.15;
  const look = far ? 1.0 : 0.75;

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
  const rate = skater.mode === 'air' ? 1.5 : 2 + Math.min(hs, 8) * 0.5;
  camYaw += diff * (1 - Math.exp(-rate * dt));

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
  camera.lookAt(camTarget.x, camTarget.y + look, camTarget.z);

  // shadows follow the skater
  sun.position.set(p.x + 18, p.y + 30, p.z + 10);
  sun.target.position.copy(p);
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
    }
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
  }

  if (padTool.isOpen) padTool.update();
  speedo.textContent = `${Math.round(skater.speed * 3.6)} km/h`;
  updateCamera(dt);
  renderer.render(scene, camera);
}

applyQuality();
requestAnimationFrame(frame);

// Offline support / install as an app
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// expose for debugging in the console
window.skateFan = { skater, world, input, score };
