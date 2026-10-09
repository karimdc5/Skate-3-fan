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
