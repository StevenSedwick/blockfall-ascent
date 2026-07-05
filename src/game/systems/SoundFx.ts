// Zero-asset sound effects via WebAudio. Each method synthesizes a short
// tone (or chirp) on the fly. Initialization is lazy because mobile browsers
// require a user gesture before an AudioContext can resume - the first
// .play* call after a pointer event will succeed.
export class SoundFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  // 1..5 - zone tier. Higher = more layers, louder mix, tier 5 drops in
  // full percussion + snare backbeat.
  private musicIntensity = 1;
  public muted = false;
  public masterVolume = 0.4;
  public musicVolume = 0.18;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const Ctor = (window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    });
    const Impl = Ctor.AudioContext ?? Ctor.webkitAudioContext;
    if (!Impl) return null;
    this.ctx = new Impl();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  // Simple oscillator-and-envelope helper. Frequency can sweep from f0 to f1
  // over the note duration for chirps.
  private blip(
    f0: number,
    f1: number,
    durationMs: number,
    type: OscillatorType = 'square',
    volume = 1
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + durationMs / 1000);
    // ADSR-ish envelope. Short attack, exponential release.
    const peak = 0.6 * volume;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + durationMs / 1000 + 0.02);
  }

  // Short noise burst for impacts (block break / hurt).
  private noise(durationMs: number, lowpass: number, volume = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const length = Math.max(1, Math.floor((durationMs / 1000) * ctx.sampleRate));
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lowpass;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5 * volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
    src.connect(lp).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + durationMs / 1000 + 0.02);
  }

  jump(): void {
    this.blip(360, 720, 110, 'square', 0.7);
  }

  wallJump(): void {
    this.blip(520, 820, 95, 'triangle', 0.8);
  }

  shoot(): void {
    this.blip(1500, 600, 50, 'square', 0.35);
  }

  coin(): void {
    // Two-note chime.
    this.blip(880, 880, 70, 'triangle', 0.9);
    setTimeout(() => this.blip(1320, 1320, 90, 'triangle', 0.9), 60);
  }

  blockBreak(): void {
    this.noise(110, 1800, 0.7);
    this.blip(220, 110, 80, 'sawtooth', 0.5);
  }

  hurt(): void {
    this.blip(220, 70, 320, 'sawtooth', 0.9);
    this.noise(180, 700, 0.6);
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.masterVolume;
  }

  // --- Music ---
  //
  // Procedural chiptune loop: a plodding square-wave bassline plus a
  // triangle-wave arpeggio in A minor pentatonic. Scheduled 16 sixteenth
  // notes at a time, ahead of the audio clock, so timing is sample-accurate
  // and immune to browser tab throttling. Cheap enough to run continuously.
  //
  // Layered by musicIntensity (1-5):
  //   1: bass + arp only (calm intro)
  //   2: + warm sub-bass pad on beats 1 & 3 (thickens without adding percussion)
  //   3: + bass fifth harmony (fuller low end)
  //   4: + kick on downbeats + soft hi-hat on offbeats + slightly louder mix
  //   5: DROP - kick every beat, snare on 2 & 4, arp jumps octave, louder
  startMusic(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (this.musicTimer !== null) return;
    if (!this.musicGain) {
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.master);
    }
    // A minor pentatonic starting at A2. Bass repeats every 4 steps.
    const bassPattern = [110.0, 110.0, 146.83, 130.81]; // A2 A2 D3 C3
    const arpPattern = [
      220.0, 261.63, 329.63, 392.0, // A3 C4 E4 G4
      329.63, 261.63, 220.0, 195.998, // E4 C4 A3 G3
      220.0, 293.66, 329.63, 440.0, // A3 D4 E4 A4
      329.63, 261.63, 220.0, 195.998  // E4 C4 A3 G3
    ];
    const stepSec = 0.14; // ~107 bpm at 4 steps/beat
    let nextTime = ctx.currentTime + 0.05;
    const scheduleAhead = () => {
      if (!this.ctx || !this.musicGain) return;
      // Schedule until we're ~0.5s ahead of the audio clock.
      while (nextTime < this.ctx.currentTime + 0.5) {
        const step = this.musicStep % arpPattern.length;
        const level = this.musicIntensity;
        // Bass on every other step (eighth notes).
        if (step % 2 === 0) {
          const bassFreq = bassPattern[(step / 2) % bassPattern.length];
          this.playNote(bassFreq, nextTime, stepSec * 1.8, 'square', 0.35);
          // Tier 3+: add a perfect fifth for thicker low end.
          if (level >= 3) {
            this.playNote(bassFreq * 1.4983, nextTime, stepSec * 1.8, 'square', 0.22);
          }
        }
        // Tier 2+: warm sub-bass pad on beats 1 and 3 (steps 0 and 8 of a
        // 16-step bar). Long sine tail sits under the arp without adding
        // any percussive edge.
        if (level >= 2 && (step === 0 || step === 8)) {
          const rootFreq = bassPattern[(step / 2) % bassPattern.length];
          this.playNote(rootFreq * 0.5, nextTime, stepSec * 7, 'sine', 0.28);
        }
        // Arpeggio on every step. Tier 5 jumps up an octave for lift.
        const arpFreq = arpPattern[step] * (level >= 5 ? 2 : 1);
        this.playNote(arpFreq, nextTime, stepSec * 0.9, 'triangle', level >= 5 ? 0.28 : 0.22);
        // Percussion layers.
        // Tier 4+: soft hi-hat on offbeats (odd steps).
        if (level >= 4 && step % 2 === 1) {
          this.playHat(nextTime, level >= 5 ? 0.18 : 0.12);
        }
        // Tier 4+: kick on downbeats (every 4 steps).
        // Tier 5: kick on every beat (every 2 steps).
        const kickEvery = level >= 5 ? 2 : 4;
        if (level >= 4 && step % kickEvery === 0) {
          this.playKick(nextTime, level >= 5 ? 0.5 : 0.4);
        }
        // Tier 5: snare on beats 2 and 4 (steps 4 and 12 of the 16-step bar).
        if (level >= 5 && (step === 4 || step === 12)) {
          this.playSnare(nextTime, 0.35);
        }
        nextTime += stepSec;
        this.musicStep += 1;
      }
    };
    scheduleAhead();
    this.musicTimer = window.setInterval(scheduleAhead, 120);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicGain) {
      const ctx = this.ctx;
      if (ctx) {
        // Quick fade to zero to avoid a click.
        this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, ctx.currentTime);
        this.musicGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
      }
    }
    this.musicStep = 0;
  }

  // Set music tier 1..5. Ramps overall music volume slightly at higher
  // tiers so the drop feels bigger.
  setMusicIntensity(level: number): void {
    const clamped = Math.max(1, Math.min(5, Math.floor(level)));
    if (clamped === this.musicIntensity) return;
    this.musicIntensity = clamped;
    if (this.musicGain && this.ctx && !this.muted) {
      // Volume curve: 1.0x at tier 1..3, 1.15x at tier 4, 1.4x at tier 5.
      const mul = clamped >= 5 ? 1.4 : clamped >= 4 ? 1.15 : 1.0;
      const target = this.musicVolume * mul;
      const now = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
      this.musicGain.gain.linearRampToValueAtTime(target, now + 0.25);
    }
  }

  // Schedule a single music note at a specific audio-clock time. Separate
  // from blip() because it takes an explicit start time (blip() uses "now").
  private playNote(
    freq: number,
    startTime: number,
    durationSec: number,
    type: OscillatorType,
    volume: number
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    const peak = 0.5 * volume;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);
    osc.connect(gain).connect(this.musicGain);
    osc.start(startTime);
    osc.stop(startTime + durationSec + 0.02);
  }

  // Short low-pitched sine thump. Sub-oscillator style kick drum.
  private playKick(startTime: number, volume: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, startTime);
    osc.frequency.exponentialRampToValueAtTime(45, startTime + 0.1);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.16);
    osc.connect(gain).connect(this.musicGain);
    osc.start(startTime);
    osc.stop(startTime + 0.18);
  }

  // Short high-passed noise burst. Hi-hat.
  private playHat(startTime: number, volume: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const dur = 0.05;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
    src.connect(hp).connect(gain).connect(this.musicGain);
    src.start(startTime);
    src.stop(startTime + dur + 0.01);
  }

  // Band-passed noise burst layered with a short tonal thwack. Snare.
  private playSnare(startTime: number, volume: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const dur = 0.12;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
    src.connect(bp).connect(gain).connect(this.musicGain);
    src.start(startTime);
    src.stop(startTime + dur + 0.01);
    // Add a short tonal blip for body.
    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, startTime);
    osc.frequency.exponentialRampToValueAtTime(140, startTime + 0.06);
    oGain.gain.setValueAtTime(volume * 0.4, startTime);
    oGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.08);
    osc.connect(oGain).connect(this.musicGain);
    osc.start(startTime);
    osc.stop(startTime + 0.1);
  }
}
