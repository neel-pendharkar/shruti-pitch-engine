// Synthesized Acoustic Tanpura Drone with Overtone Modeling & Shimmering Jawari
class TanpuraDrone {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.isPlaying = false;
    this.baseFreq = 277.18; // C# default
    this.volume = 0.45;
    this.firstStringSwara = "Pa"; // "Pa", "Ma", or "Ni"
    
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
    
    this.pluckTimer = null;
    this.currentString = 0;
    this.tempoMs = 1200; // milliseconds between plucks
  }

  setBaseFreq(freq) {
    this.baseFreq = freq;
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  setFirstString(swara) {
    this.firstStringSwara = swara;
  }

  // Synthesize an individual plucked string with rich overtones & exponential decay
  pluckString(freq, duration = 4.5) {
    if (!this.isPlaying || !this.ctx) return;
    const now = this.ctx.currentTime;

    // We build 4 partials (harmonics) to simulate the acoustic buzzing bridge (Jawari)
    const partials = [
      { mult: 1.0,  gain: 0.70 }, // Fundamental
      { mult: 2.0,  gain: 0.45 }, // Octave
      { mult: 3.0,  gain: 0.30 }, // 12th
      { mult: 4.0,  gain: 0.20 }, // 2nd Octave
      { mult: 5.0,  gain: 0.15 }  // Major 3rd overtone
    ];

    const stringGain = this.ctx.createGain();
    stringGain.gain.setValueAtTime(0.001, now);
    stringGain.gain.linearRampToValueAtTime(0.35, now + 0.04); // Soft attack of fingertip
    stringGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    // Warm low-pass filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq * 7, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 2.5, now + duration);
    filter.Q.value = 4.0; // Resonant body of the gourd (Tumba)

    partials.forEach(p => {
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      // Slight chorus detune for organic shimmering
      const detune = (Math.random() - 0.5) * 4;
      osc.frequency.setValueAtTime(freq * p.mult + detune, now);

      const pGain = this.ctx.createGain();
      pGain.gain.value = p.gain;

      osc.connect(pGain);
      pGain.connect(filter);

      osc.start(now);
      osc.stop(now + duration + 0.1);
    });

    filter.connect(stringGain);
    stringGain.connect(this.masterGain);
  }

  // Calculate frequency of the 4 tanpura strings
  getStringFrequencies() {
    let firstFreq = this.baseFreq * 1.5; // Pa = 3/2
    if (this.firstStringSwara === "Ma") {
      firstFreq = this.baseFreq * (4 / 3); // Ma = 4/3
    } else if (this.firstStringSwara === "Ni") {
      firstFreq = this.baseFreq * (15 / 8); // Ni = 15/8
    }

    return [
      firstFreq,                  // String 1: Pa / Ma / Ni
      this.baseFreq,              // String 2: Middle Sa
      this.baseFreq * 1.002,      // String 3: Middle Sa (+ subtle beating/jawari)
      this.baseFreq * 0.5         // String 4: Kharaj Sa (bass octave down)
    ];
  }

  step() {
    if (!this.isPlaying) return;
    const freqs = this.getStringFrequencies();
    this.pluckString(freqs[this.currentString]);

    this.currentString = (this.currentString + 1) % 4;
    this.pluckTimer = setTimeout(() => this.step(), this.tempoMs);
  }

  start() {
    if (this.isPlaying) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    this.isPlaying = true;
    this.currentString = 0;
    this.step();
  }

  stop() {
    this.isPlaying = false;
    if (this.pluckTimer) {
      clearTimeout(this.pluckTimer);
      this.pluckTimer = null;
    }
  }
}
