(function (root) {
  'use strict';

  class CalmAudioEngine {
    constructor() {
      this.ctx = null;
      this.ambientGain = null;
      this.activeAmbientType = 'none';
      this.activeNodes = [];
      this.ambientVolume = 0.35;
      this.chimeVolume = 0.65;
      this.isMuted = false;
    }

    ensureContext() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    setVolumes({ chimeVolume, ambientVolume, isMuted }) {
      if (typeof chimeVolume === 'number') this.chimeVolume = chimeVolume;
      if (typeof ambientVolume === 'number') this.ambientVolume = ambientVolume;
      if (typeof isMuted === 'boolean') this.isMuted = isMuted;

      if (this.ambientGain && this.ctx) {
        const target = this.isMuted ? 0 : this.ambientVolume * 0.45;
        this.ambientGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.12);
      }
    }

    playChime(kind = 'focusComplete') {
      if (this.isMuted || this.chimeVolume <= 0) return;
      const ctx = this.ensureContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(Math.max(0.01, this.chimeVolume * 0.45), now + 0.04);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
      master.connect(ctx.destination);

      // Warm singing-bowl harmonic intervals
      const baseFreqs = kind === 'focusComplete'
        ? [396, 528, 792] // calm G4 - C5 - G5 resonance
        : [330, 495, 660]; // soft E4 - B4 - E5 cue

      baseFreqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const partialGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        const partialAmp = idx === 0 ? 0.55 : idx === 1 ? 0.35 : 0.16;
        const startOffset = idx * 0.14;
        partialGain.gain.setValueAtTime(0.0001, now + startOffset);
        partialGain.gain.exponentialRampToValueAtTime(partialAmp, now + startOffset + 0.05);
        partialGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.1);

        osc.connect(partialGain);
        partialGain.connect(master);

        osc.start(now + startOffset);
        osc.stop(now + 3.5);
      });
    }

    createNoiseBuffer(ctx, type) {
      const bufferSize = ctx.sampleRate * 4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);

      if (type === 'brown') {
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          output[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = output[i];
          output[i] *= 3.2;
        }
      } else {
        // Pink noise via Voss-McCartney approximation
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
          b6 = white * 0.115926;
        }
      }
      return buffer;
    }

    stopAmbient() {
      if (this.ambientGain && this.ctx) {
        const gainNode = this.ambientGain;
        const nodesToStop = [...this.activeNodes];
        gainNode.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15);
        setTimeout(() => {
          nodesToStop.forEach((node) => {
            try {
              if (typeof node.stop === 'function') node.stop();
              node.disconnect();
            } catch (_) {}
          });
        }, 450);
      } else {
        this.activeNodes.forEach((node) => {
          try {
            if (typeof node.stop === 'function') node.stop();
            node.disconnect();
          } catch (_) {}
        });
      }
      this.activeNodes = [];
      this.ambientGain = null;
      this.activeAmbientType = 'none';
    }

    setAmbient(type) {
      if (type === this.activeAmbientType) return;
      this.stopAmbient();

      if (!type || type === 'none') {
        this.activeAmbientType = 'none';
        return;
      }

      const ctx = this.ensureContext();
      if (!ctx) return;

      this.activeAmbientType = type;
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      const target = this.isMuted ? 0.0001 : this.ambientVolume * 0.45;
      master.gain.setTargetAtTime(target, now, 0.35);
      master.connect(ctx.destination);
      this.ambientGain = master;

      if (type === 'rain') {
        const src = ctx.createBufferSource();
        src.buffer = this.createNoiseBuffer(ctx, 'pink');
        src.loop = true;

        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(1650, now);

        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(220, now);

        src.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(master);
        src.start(now);

        this.activeNodes.push(src, highpass, lowpass, master);
      } else if (type === 'warmth') {
        const src = ctx.createBufferSource();
        src.buffer = this.createNoiseBuffer(ctx, 'brown');
        src.loop = true;

        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(420, now);

        src.connect(lowpass);
        lowpass.connect(master);
        src.start(now);

        this.activeNodes.push(src, lowpass, master);
      } else if (type === 'breeze') {
        const src = ctx.createBufferSource();
        src.buffer = this.createNoiseBuffer(ctx, 'pink');
        src.loop = true;

        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.setValueAtTime(480, now);
        bandpass.Q.setValueAtTime(1.4, now);

        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.09, now);

        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(220, now);

        lfo.connect(lfoGain);
        lfoGain.connect(bandpass.frequency);

        src.connect(bandpass);
        bandpass.connect(master);

        src.start(now);
        lfo.start(now);

        this.activeNodes.push(src, bandpass, lfo, lfoGain, master);
      } else if (type === 'hum') {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(420, now);
        filter.connect(master);

        const freqs = [130.81, 196.0, 261.63]; // C3, G3, C4 warm pad
        freqs.forEach((f, i) => {
          const osc = ctx.createOscillator();
          const oscGain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f + (i === 1 ? 0.25 : 0), now);
          oscGain.gain.setValueAtTime(i === 0 ? 0.22 : 0.12, now);
          osc.connect(oscGain);
          oscGain.connect(filter);
          osc.start(now);
          this.activeNodes.push(osc, oscGain);
        });
        this.activeNodes.push(filter, master);
      }
    }
  }

  root.CalmAudioEngine = CalmAudioEngine;
}(typeof globalThis !== 'undefined' ? globalThis : this));
