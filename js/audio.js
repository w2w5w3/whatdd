/* ============================================================
 * 烬契 · EMBER PACT
 * audio.js — 轻量 WebAudio 音效（无外部素材）
 * ============================================================ */
(function (global) {
  'use strict';
  const CG = (global.CG = global.CG || {});

  const Audio = {
    ctx: null,
    master: null,
    muted: false,
    ready: false,
    init() {
      if (this.ready) return;
      try {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.18;
        this.master.connect(this.ctx.destination);
        this.ready = true;
      } catch (e) { /* 静默失败 */ }
      try {
        this.muted = global.localStorage.getItem('emberpact_muted') === '1';
      } catch (e) { this.muted = false; }
    },
    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    setMuted(m) {
      this.muted = !!m;
      try { global.localStorage.setItem('emberpact_muted', m ? '1' : '0'); } catch (e) {}
    },
    toggle() {
      this.setMuted(!this.muted);
      if (!this.muted) this.play('click');
      return this.muted;
    },
    tone(freq, dur, type, gain, when, slideTo) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + (when || 0);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain || 0.2), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    },
    noise(dur, gain, when, filterFreq) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + (when || 0);
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain || 0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter).connect(g).connect(this.master);
      src.start(t);
    },
    play(name) {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      switch (name) {
        case 'click': this.tone(520, 0.07, 'sine', 0.1, 0, 380); break;
        case 'hover': this.tone(880, 0.035, 'sine', 0.025); break;
        case 'draw':
          this.noise(0.12, 0.09, 0, 2600);
          this.tone(420, 0.08, 'triangle', 0.05, 0.02, 720);
          break;
        case 'play':
          this.noise(0.22, 0.13, 0, 900);
          this.tone(180, 0.22, 'triangle', 0.12, 0, 80);
          break;
        case 'hit':
          this.noise(0.18, 0.3, 0, 420);
          this.tone(96, 0.25, 'sawtooth', 0.24, 0, 46);
          break;
        case 'heavy':
          this.noise(0.32, 0.42, 0, 320);
          this.tone(62, 0.5, 'sine', 0.36, 0, 28);
          this.tone(128, 0.28, 'sawtooth', 0.16, 0.01, 40);
          break;
        case 'armor':
          this.tone(1320, 0.16, 'triangle', 0.08, 0, 1560);
          this.tone(880, 0.22, 'sine', 0.06, 0.03, 760);
          break;
        case 'heal':
          this.tone(523.25, 0.2, 'sine', 0.09, 0);
          this.tone(659.25, 0.22, 'sine', 0.08, 0.08);
          this.tone(783.99, 0.3, 'sine', 0.07, 0.16);
          break;
        case 'poison':
          this.tone(180, 0.18, 'sawtooth', 0.08, 0, 90);
          this.noise(0.2, 0.08, 0.04, 600);
          break;
        case 'turn':
          this.tone(196, 0.6, 'sine', 0.08, 0, 196);
          this.tone(293.66, 0.7, 'sine', 0.045, 0.06, 293.66);
          break;
        case 'win':
          [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, 0.85, 'triangle', 0.12, i * 0.13));
          break;
        case 'lose':
          [220, 196, 164.81, 130.81].forEach((f, i) => this.tone(f, 0.8, 'sine', 0.12, i * 0.16));
          break;
        case 'error':
          this.tone(160, 0.16, 'square', 0.07, 0, 120);
          break;
        case 'shieldBreak':
          this.noise(0.24, 0.22, 0, 2200);
          this.tone(320, 0.22, 'triangle', 0.1, 0, 120);
          break;
        case 'skill':
          this.tone(660, 0.18, 'triangle', 0.07, 0, 990);
          this.tone(990, 0.3, 'sine', 0.05, 0.08);
          break;
        default: this.tone(600, 0.05, 'sine', 0.05);
      }
    },
  };

  CG.Audio = Audio;
})(typeof window !== 'undefined' ? window : globalThis);
