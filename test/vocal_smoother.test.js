const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { VocalSmoother } = require('../js/dsp.js');
const { getRagaById } = require('../data/ragas.js');

describe('VocalSmoother Stability, Hysteresis & Sustain Engine', () => {
  const bhoop = getRagaById('bhoop'); // Sa(1), Re2(5), Ga1(8), Pa(14), Dha1(17)

  it('should reject isolated single-frame vocal fry / octave glitches using median filtering', () => {
    const smoother = new VocalSmoother(9, 0.85, 0.35);

    // Feed steady Ga1 (386 cents) for 5 frames
    for (let i = 0; i < 5; i++) {
      smoother.process(386.31, bhoop.activeShrutis, 10.0);
    }

    // Now inject a sudden single-frame octave glitch (1200 cents, Taar Sa)
    const glitchedOutput = smoother.process(1200.0, bhoop.activeShrutis, 10.0);

    // The median of [386, 386, 386, 386, 386, 1200] is still 386.
    // The smoothed output must NOT jump to 1200!
    assert.ok(glitchedOutput);
    assert.equal(glitchedOutput.match.shruti.swara, 'Ga₁');
    assert.ok(
      Math.abs(glitchedOutput.smoothedCents - 386.31) < 15.0,
      `Expected output near 386.31¢, got ${glitchedOutput.smoothedCents.toFixed(2)}¢`
    );
  });

  it('should adaptively bypass smoothing during a deliberate vocal leap (> 55 cents)', () => {
    const smoother = new VocalSmoother(9, 0.85, 0.35);

    // Steady on Sa (0 cents)
    for (let i = 0; i < 9; i++) {
      smoother.process(0.0, bhoop.activeShrutis, 10.0);
    }
    assert.equal(smoother.smoothedCents, 0.0);

    // Singer makes a deliberate leap to Pancham (+702 cents)
    // Over 9 frames of Pa, the smoother should snap quickly rather than sluggishly gliding
    let lastOut = null;
    for (let i = 0; i < 9; i++) {
      lastOut = smoother.process(701.96, bhoop.activeShrutis, 10.0);
    }

    assert.ok(lastOut);
    assert.equal(lastOut.match.shruti.swara, 'Pa');
    assert.ok(
      Math.abs(lastOut.smoothedCents - 701.96) < 1.0,
      `Expected quick lock to Pa (701.96¢), got ${lastOut.smoothedCents.toFixed(2)}¢`
    );
  });

  it('should track sustained note metrics and flag long holds (>= 1.2s)', () => {
    const smoother = new VocalSmoother(9, 0.85, 0.35);

    // Feed steady Pa for 60 frames (~1.5 seconds)
    let lastOut = null;
    for (let i = 0; i < 60; i++) {
      lastOut = smoother.process(701.96, bhoop.activeShrutis, 10.0);
    }

    assert.ok(lastOut);
    assert.equal(lastOut.sustain.isLongHold, true);
    assert.ok(lastOut.sustain.durationSec >= 1.2);
    assert.equal(lastOut.sustain.resonancePercent, 100);
    assert.ok(lastOut.sustain.avgDev < 0.1);
  });

  it('should reset state cleanly when receiving null/silence', () => {
    const smoother = new VocalSmoother(9, 0.85, 0.35);

    for (let i = 0; i < 10; i++) {
      smoother.process(386.31, bhoop.activeShrutis, 10.0);
    }
    assert.ok(smoother.smoothedCents !== null);

    // Silence input
    const out = smoother.process(null, bhoop.activeShrutis, 10.0);
    assert.equal(out, null);
    assert.equal(smoother.smoothedCents, null);
    assert.equal(smoother.centsBuffer.length, 0);
  });
});
