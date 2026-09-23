// Real-Time DSP Pitch Detection Engine (McLeod Pitch Method / NSDF with Parabolic Interpolation)
class PitchDetector {
  constructor(sampleRate = 44100, bufferSize = 2048) {
    this.sampleRate = sampleRate;
    this.bufferSize = bufferSize;
    this.nsdfBuffer = new Float32Array(bufferSize);
    
    // Voicing and detection thresholds
    this.minFreq = 65;   // ~C2 (low male vocal range / bass kharaj)
    this.maxFreq = 1200; // ~D6 (high female vocal range / tara saptak)
    this.minRMS = 0.008; // Noise floor gate
    this.clarityThreshold = 0.72; // Confidence threshold
    
    this.maxLag = Math.floor(sampleRate / this.minFreq);
    this.minLag = Math.floor(sampleRate / this.maxFreq);
  }

  setSampleRate(rate) {
    this.sampleRate = rate;
    this.maxLag = Math.floor(rate / this.minFreq);
    this.minLag = Math.floor(rate / this.maxFreq);
  }

  // Calculate RMS energy of buffer
  calculateRMS(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  // Normalized Square Difference Function (NSDF)
  computeNSDF(buffer) {
    const n = buffer.length;
    const maxTau = Math.min(this.maxLag, Math.floor(n / 2));
    
    for (let tau = 0; tau < maxTau; tau++) {
      let acf = 0;
      let divisorM = 0;
      
      for (let i = 0; i < n - tau; i++) {
        acf += buffer[i] * buffer[i + tau];
        divisorM += buffer[i] * buffer[i] + buffer[i + tau] * buffer[i + tau];
      }
      
      this.nsdfBuffer[tau] = divisorM > 0 ? (2 * acf) / divisorM : 0;
    }
  }

  // Detect pitch using MPM peak picking & parabolic interpolation
  detect(buffer) {
    const rms = this.calculateRMS(buffer);
    if (rms < this.minRMS) {
      return { freq: null, clarity: 0, rms, voiced: false };
    }

    this.computeNSDF(buffer);

    const maxTau = Math.min(this.maxLag, Math.floor(buffer.length / 2));
    const peaks = [];
    let isPositive = false;

    // Find local maxima in positive regions
    for (let tau = this.minLag; tau < maxTau - 1; tau++) {
      if (this.nsdfBuffer[tau] > 0) {
        isPositive = true;
        if (
          this.nsdfBuffer[tau] > this.nsdfBuffer[tau - 1] &&
          this.nsdfBuffer[tau] >= this.nsdfBuffer[tau + 1]
        ) {
          // Local peak found
          peaks.push({ tau, val: this.nsdfBuffer[tau] });
        }
      } else {
        isPositive = false;
      }
    }

    if (peaks.length === 0) {
      return { freq: null, clarity: 0, rms, voiced: false };
    }

    // Find highest peak
    let maxVal = -1;
    for (const p of peaks) {
      if (p.val > maxVal) {
        maxVal = p.val;
      }
    }

    // MPM heuristic: pick the first peak that is at least 80% as high as the maximum peak
    // (prevents octave jumps / period doubling)
    const threshold = maxVal * 0.82;
    let chosenPeak = null;
    for (const p of peaks) {
      if (p.val >= threshold && p.val >= this.clarityThreshold) {
        chosenPeak = p;
        break;
      }
    }

    if (!chosenPeak) {
      return { freq: null, clarity: maxVal, rms, voiced: false };
    }

    // 3-point parabolic interpolation for sub-sample accuracy
    const k = chosenPeak.tau;
    const alpha = this.nsdfBuffer[k - 1];
    const beta = this.nsdfBuffer[k];
    const gamma = this.nsdfBuffer[k + 1];

    const denom = 2 * (alpha - 2 * beta + gamma);
    let delta = 0;
    if (Math.abs(denom) > 1e-6) {
      delta = (alpha - gamma) / denom;
    }

    const exactTau = k + delta;
    const freq = this.sampleRate / exactTau;

    if (freq < this.minFreq || freq > this.maxFreq) {
      return { freq: null, clarity: chosenPeak.val, rms, voiced: false };
    }

    return {
      freq,
      clarity: chosenPeak.val,
      rms,
      voiced: true
    };
  }

  // Convert Hz to cents relative to base tonic frequency
  static hzToCents(freq, baseFreq) {
    if (!freq || !baseFreq || freq <= 0 || baseFreq <= 0) return 0;
    return 1200 * Math.log2(freq / baseFreq);
  }

  // Find matching swara and deviation in active raga
  static matchSwara(rawCents, activeShrutiIds) {
    // Normalize cents into 0-1200 range (Madhya Saptak)
    let octave = Math.floor(rawCents / 1200);
    let centsInOctave = rawCents - (octave * 1200);
    if (centsInOctave < 0) {
      centsInOctave += 1200;
      octave -= 1;
    }

    let closestShruti = null;
    let minDiff = Infinity;

    // Check all active shrutis in this octave plus octave wraparounds (Sa at 0 and 1200)
    for (const id of activeShrutiIds) {
      const shruti = getShrutiById(id);
      if (!shruti) continue;

      const diff = Math.abs(centsInOctave - shruti.cents);
      if (diff < minDiff) {
        minDiff = diff;
        closestShruti = shruti;
      }
      
      // Also check against higher octave Sa (1200 cents)
      if (shruti.cents === 0) {
        const wrapDiff = Math.abs(centsInOctave - 1200);
        if (wrapDiff < minDiff) {
          minDiff = wrapDiff;
          closestShruti = shruti;
        }
      }
    }

    if (!closestShruti) return null;

    let targetCents = closestShruti.cents;
    if (Math.abs(centsInOctave - 1200) < Math.abs(centsInOctave - 0) && closestShruti.cents === 0) {
      targetCents = 1200;
    }

    const deviationCents = centsInOctave - targetCents;
    const isResonating = Math.abs(deviationCents) <= 3.5; // Within 3.5 cents of pure ratio

    return {
      shruti: closestShruti,
      octave,
      centsInOctave,
      deviationCents,
      isResonating
    };
  }
}

// Adaptive Vocal Smoother: Median filter + adaptive EMA to kill vocal jitter without lag
class VocalSmoother {
  constructor(windowSize = 5, smoothingFactor = 0.70, adjustmentSpeed = 0.50) {
    this.windowSize = windowSize;
    this.smoothingFactor = smoothingFactor; // 0 = raw, 0.95 = very smooth
    this.adjustmentSpeed = adjustmentSpeed; // 0.05 = slow/gradual, 1.0 = instant tracking
    this.centsBuffer = [];
    this.smoothedCents = null;
    this.currentMatch = null;
    this.matchCandidate = null;
    this.matchCount = 0;
    this.hysteresisThreshold = 3;

    // Long sustain tracking for note holds
    this.sustainFrames = 0;
    this.sustainDevSum = 0;
    this.sustainResonantFrames = 0;
    this.lastFrameTime = performance.now();
  }

  setSmoothing(factor) {
    this.smoothingFactor = Math.max(0, Math.min(0.95, factor));
  }

  setAdjustmentSpeed(speed) {
    this.adjustmentSpeed = Math.max(0.05, Math.min(1.0, speed));
  }

  reset() {
    this.centsBuffer = [];
    this.smoothedCents = null;
    this.currentMatch = null;
    this.matchCandidate = null;
    this.matchCount = 0;
    this.sustainFrames = 0;
    this.sustainDevSum = 0;
    this.sustainResonantFrames = 0;
  }

  process(rawCents, activeShrutiIds) {
    if (rawCents === null || isNaN(rawCents)) {
      this.reset();
      return null;
    }

    const now = performance.now();
    this.lastFrameTime = now;

    // 1. Maintain running window for median filtering (outlier / vocal fry rejection)
    this.centsBuffer.push(rawCents);
    if (this.centsBuffer.length > this.windowSize) {
      this.centsBuffer.shift();
    }

    // Calculate median
    const sorted = [...this.centsBuffer].sort((a, b) => a - b);
    const medianCents = sorted[Math.floor(sorted.length / 2)];

    // 2. Adaptive Exponential Smoothing modulated by adjustmentSpeed
    if (this.smoothedCents === null) {
      this.smoothedCents = medianCents;
    } else {
      const diff = Math.abs(medianCents - this.smoothedCents);

      // If difference is large (> 70 cents), user made a deliberate vocal leap to a new note.
      // Adaptively drop smoothing to zero so there is zero transition lag!
      if (diff > 70) {
        this.smoothedCents = medianCents;
        this.sustainFrames = 0;
        this.sustainDevSum = 0;
        this.sustainResonantFrames = 0;
      } else {
        // Modulate alpha by both smoothingFactor and adjustmentSpeed
        // Higher adjustmentSpeed -> higher alpha -> faster tracking of pitch shifts
        // Lower adjustmentSpeed -> lower alpha -> slower, long-term steady average
        const baseAlpha = 1.0 - (this.smoothingFactor * 0.88);
        const alpha = Math.max(0.02, Math.min(1.0, baseAlpha * (this.adjustmentSpeed * 1.8)));
        this.smoothedCents = (alpha * medianCents) + ((1.0 - alpha) * this.smoothedCents);
      }
    }

    // 3. Match Swara on the stabilized pitch
    const match = PitchDetector.matchSwara(this.smoothedCents, activeShrutiIds);
    if (!match) return null;

    // 4. Swara Hysteresis & Long Sustain Metrics
    if (!this.currentMatch || match.shruti.id === this.currentMatch.shruti.id) {
      this.currentMatch = match;
      this.matchCandidate = null;
      this.matchCount = 0;

      // Accumulate sustain statistics for long note holding
      this.sustainFrames++;
      this.sustainDevSum += Math.abs(match.deviationCents);
      if (match.isResonating) this.sustainResonantFrames++;
    } else {
      // Transition candidate
      if (this.matchCandidate && this.matchCandidate.shruti.id === match.shruti.id) {
        this.matchCount++;
        if (this.matchCount >= this.hysteresisThreshold) {
          this.currentMatch = match;
          this.matchCandidate = null;
          this.matchCount = 0;
          this.sustainFrames = 1;
          this.sustainDevSum = Math.abs(match.deviationCents);
          this.sustainResonantFrames = match.isResonating ? 1 : 0;
        }
      } else {
        this.matchCandidate = match;
        this.matchCount = 1;
      }
    }

    const durationSec = this.sustainFrames * 0.025; // Approx frame step in ms
    const avgDev = this.sustainFrames > 0 ? (this.sustainDevSum / this.sustainFrames) : 0;
    const resonancePercent = this.sustainFrames > 0 ? Math.round((this.sustainResonantFrames / this.sustainFrames) * 100) : 0;

    return {
      smoothedCents: this.smoothedCents,
      match: this.currentMatch || match,
      sustain: {
        frames: this.sustainFrames,
        durationSec,
        avgDev,
        resonancePercent,
        isLongHold: durationSec >= 1.2
      }
    };
  }
}

