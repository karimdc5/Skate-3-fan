// Procedural sound effects with WebAudio (no audio files needed).
// iOS only allows audio after a user gesture, so unlock() is called on the
// first tap / key / button press.

import { settings } from './storage.js';

export class Sound {
  constructor() {
    this.ctx = null;
    this.ready = false;
  }

  unlock() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = settings.sound ? 0.8 : 0;
    this.master.connect(ctx.destination);

    // white noise buffer shared by all noise voices
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // continuous rolling sound
    this.roll = this.loopNoise('lowpass', 400);
    // continuous grind sound
    this.grind = this.loopNoise('bandpass', 2600, 6);
    this.ready = true;
    if (ctx.state === 'suspended') ctx.resume();
    if (this.station) this.setRadio(this.station);
  }

  setEnabled(on) {
    if (this.master) this.master.gain.value = on ? 0.8 : 0;
  }

  loopNoise(type, freq, q = 1) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    return { filter, gain };
  }

  // speed in m/s; grounded/grinding flags
  update(speed, grounded, grinding) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const rollVol = grounded && !grinding ? Math.min(1, speed / 12) * 0.35 : 0;
    this.roll.gain.gain.setTargetAtTime(rollVol, t, 0.05);
    this.roll.filter.frequency.setTargetAtTime(250 + speed * 70, t, 0.1);
    this.grind.gain.gain.setTargetAtTime(grinding ? 0.22 : 0, t, 0.03);
    this.grind.filter.frequency.setTargetAtTime(2000 + speed * 120, t, 0.1);
  }

  burst(type, freq, dur, vol) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  thump(freq, dur, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  pop() {
    if (!this.ready) return;
    this.burst('highpass', 1800, 0.06, 0.9);
    this.thump(180, 0.12, 0.6);
  }

  land(hard = 1) {
    if (!this.ready) return;
    this.burst('lowpass', 900, 0.12, 0.7 * hard);
    this.thump(90, 0.2, 0.8 * hard);
  }

  bail() {
    if (!this.ready) return;
    this.burst('lowpass', 600, 0.5, 0.9);
    this.thump(70, 0.35, 0.9);
    setTimeout(() => this.ready && this.burst('highpass', 2500, 0.15, 0.4), 180);
  }

  // ---------- radio: little procedural loops (no copyrighted music) ----------
  setRadio(station) {
    this.station = station;
    if (!this.ready) return;
    if (!this.musicBus) {
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.22;
      this.musicBus.connect(this.ctx.destination);
    }
    clearInterval(this.musicTimer);
    if (!station || station === 'off') return;
    const bpm = station === 'punk' ? 168 : 88;
    this.stepDur = 60 / bpm / 4;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.schedule(), 25);
  }

  schedule() {
    const ctx = this.ctx;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      const swing = this.station === 'boombap' && this.step % 2 === 0 ? 1.12 : this.station === 'boombap' ? 0.88 : 1;
      this.nextTime += this.stepDur * swing;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, t) {
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    if (this.station === 'boombap') {
      if ([0, 7, 10].includes(s16)) this.drum('kick', t);
      if (s16 === 4 || s16 === 12) this.drum('snare', t);
      if (s16 % 2 === 0) this.drum('hat', t, s16 % 4 === 2 ? 0.5 : 0.3);
      const roots = [45, 45, 41, 43];
      if ([0, 3, 8, 11].includes(s16)) this.note(roots[bar], t, this.stepDur * 2.5, 'triangle', 0.5);
      if (s16 === 0 || s16 === 8) for (const iv of [12, 15, 19]) this.note(roots[bar] + iv, t, this.stepDur * 3, 'sine', 0.12);
    } else {
      if (s16 === 0 || s16 === 6 || s16 === 8 || s16 === 10) this.drum('kick', t);
      if (s16 === 4 || s16 === 12) this.drum('snare', t);
      if (s16 % 2 === 0) this.drum('hat', t, 0.35);
      const roots = [40, 36, 43, 38];
      if (s16 % 2 === 0) {
        this.note(roots[bar], t, this.stepDur * 1.8, 'sawtooth', 0.18, 900);
        this.note(roots[bar] + 7, t, this.stepDur * 1.8, 'sawtooth', 0.12, 900);
      }
    }
  }

  note(midi, t, dur, type, vol, cutoff = 2000) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  drum(kind, t, vol = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.connect(this.musicBus);
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(1.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g);
      o.start(t); o.stop(t + 0.32);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = kind === 'hat' ? 7000 : 1800;
      const dur = kind === 'hat' ? 0.04 : 0.18;
      g.gain.setValueAtTime((kind === 'hat' ? 0.25 : 0.7) * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f).connect(g);
      src.start(t, Math.random()); src.stop(t + dur + 0.02);
    }
  }

  blip(freq = 880) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime;
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.15);
  }
}
