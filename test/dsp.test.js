const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PitchDetector } = require('../js/dsp.js');
const { getRagaById } = require('../data/ragas.js');

describe('PitchDetector DSP & Microtonal Math Engine', () => {
  describe('hzToCents', () => {
    const baseFreq = 277.18; // C#

    it('should return 0 cents when frequency equals base tonic frequency', () => {
      assert.equal(PitchDetector.hzToCents(baseFreq, baseFreq), 0.0);
    });

    it('should return +1200 cents for one octave above', () => {
      const cents = PitchDetector.hzToCents(baseFreq * 2, baseFreq);
      assert.ok(Math.abs(cents - 1200.0) < 0.001);
    });

    it('should return -1200 cents for one octave below', () => {
      const cents = PitchDetector.hzToCents(baseFreq / 2, baseFreq);
      assert.ok(Math.abs(cents - (-1200.0)) < 0.001);
    });

    it('should return +701.96 cents for a pure harmonic fifth (3/2 ratio)', () => {
      const cents = PitchDetector.hzToCents(baseFreq * 1.5, baseFreq);
      assert.ok(Math.abs(cents - 701.955) < 0.01);
    });

    it('should return +386.31 cents for a pure harmonic major third (5/4 ratio)', () => {
      const cents = PitchDetector.hzToCents(baseFreq * 1.25, baseFreq);
      assert.ok(Math.abs(cents - 386.313) < 0.01);
    });

    it('should handle zero, negative, null, or invalid frequencies safely without throwing', () => {
      assert.equal(PitchDetector.hzToCents(0, baseFreq), 0);
      assert.equal(PitchDetector.hzToCents(-100, baseFreq), 0);
      assert.equal(PitchDetector.hzToCents(null, baseFreq), 0);
      assert.equal(PitchDetector.hzToCents(undefined, baseFreq), 0);
      assert.equal(PitchDetector.hzToCents(200, 0), 0);
      assert.equal(PitchDetector.hzToCents(200, -200), 0);
    });
  });

  describe('matchSwara', () => {
    const bhoop = getRagaById('bhoop'); // Sa(1), Re2(5), Ga1(8), Pa(14), Dha1(17)

    it('should match Sa with zero deviation and resonating lock', () => {
      const match = PitchDetector.matchSwara(0.0, bhoop.activeShrutis, 10.0);
      assert.ok(match);
      assert.equal(match.shruti.swara, 'Sa');
      assert.equal(match.deviationCents, 0.0);
      assert.equal(match.isResonating, true);
    });

    it('should match Ga1 (386.31 cents) in Bhoopali', () => {
      const match = PitchDetector.matchSwara(386.31, bhoop.activeShrutis, 10.0);
      assert.ok(match);
      assert.equal(match.shruti.swara, 'Ga₁');
      assert.ok(Math.abs(match.deviationCents) < 0.05);
      assert.equal(match.isResonating, true);
    });

    it('should correctly flag in-tolerance pitch as resonating', () => {
      // 392 cents is +5.69 cents above Ga1 (386.31). Within 10 cents cutoff.
      const match = PitchDetector.matchSwara(392.0, bhoop.activeShrutis, 10.0);
      assert.ok(match);
      assert.equal(match.shruti.swara, 'Ga₁');
      assert.ok(Math.abs(match.deviationCents - 5.69) < 0.05);
      assert.equal(match.isResonating, true);
    });

    it('should correctly flag out-of-tolerance pitch as not resonating', () => {
      // 405 cents is +18.69 cents above Ga1. Outside 10 cents cutoff.
      const match = PitchDetector.matchSwara(405.0, bhoop.activeShrutis, 10.0);
      assert.ok(match);
      assert.equal(match.shruti.swara, 'Ga₁');
      assert.ok(Math.abs(match.deviationCents - 18.69) < 0.05);
      assert.equal(match.isResonating, false);
    });

    it('should correctly handle octave wraparound for upper Sa (+1200 cents)', () => {
      const match = PitchDetector.matchSwara(1200.0, bhoop.activeShrutis, 10.0);
      assert.ok(match);
      assert.equal(match.shruti.swara, 'Sa');
      assert.equal(match.deviationCents, 0.0);
      assert.equal(match.isResonating, true);
    });

    it('should correctly handle negative octave notes (Mandra Saptak)', () => {
      // Mandra Pa: -498.04 cents (which is 1200 - 498.04 = 701.96 cents in base octave)
      const match = PitchDetector.matchSwara(-498.04, bhoop.activeShrutis, 10.0);
      assert.ok(match);
      assert.equal(match.shruti.swara, 'Pa');
      assert.ok(Math.abs(match.deviationCents) < 0.05);
      assert.equal(match.isResonating, true);
    });

    it('should correctly handle Ati-Mandra Pa (-1698 cents)', () => {
      // -1698 cents: -2400 + 702 cents -> maps to Pa!
      const match = PitchDetector.matchSwara(-1698.04, bhoop.activeShrutis, 10.0);
      assert.ok(match);
      assert.equal(match.shruti.swara, 'Pa');
      assert.ok(Math.abs(match.deviationCents) < 0.05);
      assert.equal(match.isResonating, true);
    });
  });

  describe('Synthetic Audio Signal Processing', () => {
    const sampleRate = 44100;
    const bufferSize = 2048;
    const detector = new PitchDetector(sampleRate, bufferSize);

    function generateSineWave(freq, sampleRate, numSamples, amplitude = 0.8) {
      const buffer = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        buffer[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
      }
      return buffer;
    }

    it('should detect a 440 Hz pure sine wave with high precision', () => {
      const buffer = generateSineWave(440.0, sampleRate, bufferSize);
      const result = detector.detect(buffer);

      assert.equal(result.voiced, true);
      assert.ok(result.freq !== null);
      // Autocorrelation with parabolic interpolation should be within +/- 1.5 Hz
      const diff = Math.abs(result.freq - 440.0);
      assert.ok(
        diff < 1.5,
        `Expected ~440.0 Hz, detected ${result.freq.toFixed(2)} Hz (delta ${diff.toFixed(2)} Hz)`
      );
    });

    it('should detect a 277.18 Hz (C#) vocal fundamental accurately', () => {
      const buffer = generateSineWave(277.18, sampleRate, bufferSize);
      const result = detector.detect(buffer);

      assert.equal(result.voiced, true);
      assert.ok(result.freq !== null);
      const diff = Math.abs(result.freq - 277.18);
      assert.ok(
        diff < 1.0,
        `Expected ~277.18 Hz, detected ${result.freq.toFixed(2)} Hz (delta ${diff.toFixed(2)} Hz)`
      );
    });

    it('should reject pure silence (zero signal)', () => {
      const silentBuffer = new Float32Array(bufferSize);
      const result = detector.detect(silentBuffer);
      assert.equal(result.voiced, false);
      assert.equal(result.freq, null);
    });

    it('should reject low-level background noise below minRMS threshold', () => {
      // Noise with very small amplitude (0.002, below default minRMS of 0.008)
      const lowNoiseBuffer = new Float32Array(bufferSize);
      for (let i = 0; i < bufferSize; i++) {
        lowNoiseBuffer[i] = (Math.random() * 2 - 1) * 0.002;
      }
      const result = detector.detect(lowNoiseBuffer);
      assert.equal(result.voiced, false);
      assert.equal(result.freq, null);
    });
  });
});
