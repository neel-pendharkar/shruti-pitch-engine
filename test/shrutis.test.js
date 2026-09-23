const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { SHRUTIS, getShrutiById } = require('../data/shrutis.js');

describe('22 Shrutis Database & Mathematical Integrity', () => {
  it('should contain exactly 22 shrutis', () => {
    assert.equal(SHRUTIS.length, 22);
  });

  it('should have continuous sequential IDs from 1 to 22', () => {
    SHRUTIS.forEach((shruti, index) => {
      assert.equal(shruti.id, index + 1);
    });
  });

  it('should have strictly increasing cents values across the octave', () => {
    for (let i = 1; i < SHRUTIS.length; i++) {
      assert.ok(
        SHRUTIS[i].cents > SHRUTIS[i - 1].cents,
        `Shruti ${SHRUTIS[i].name} (${SHRUTIS[i].cents}¢) must be greater than ${SHRUTIS[i - 1].name} (${SHRUTIS[i - 1].cents}¢)`
      );
    }
  });

  it('should have valid rational fraction ratios [n, d] where 1 <= n/d < 2', () => {
    SHRUTIS.forEach(shruti => {
      assert.ok(Array.isArray(shruti.ratio) && shruti.ratio.length === 2, `${shruti.name} ratio must be [n, d] array`);
      const [n, d] = shruti.ratio;
      assert.ok(Number.isInteger(n) && n > 0, `${shruti.name} numerator must be positive integer`);
      assert.ok(Number.isInteger(d) && d > 0, `${shruti.name} denominator must be positive integer`);
      const val = n / d;
      assert.ok(val >= 1.0 && val < 2.0, `${shruti.name} ratio value ${val} must be in [1.0, 2.0)`);
    });
  });

  it('should mathematically match exact 1200 * log2(n/d) within 0.05 cents tolerance', () => {
    SHRUTIS.forEach(shruti => {
      const [n, d] = shruti.ratio;
      const expectedCents = 1200 * Math.log2(n / d);
      const diff = Math.abs(expectedCents - shruti.cents);
      assert.ok(
        diff < 0.05,
        `${shruti.name}: expected ${expectedCents.toFixed(2)}¢ but found ${shruti.cents}¢ (delta ${diff.toFixed(4)}¢ exceeds 0.05¢)`
      );
    });
  });

  it('should verify foundational just intervals', () => {
    const sa = getShrutiById(1);
    assert.equal(sa.swara, 'Sa');
    assert.equal(sa.cents, 0.0);
    assert.deepEqual(sa.ratio, [1, 1]);

    const ga1 = getShrutiById(8);
    assert.equal(ga1.swara, 'Ga₁');
    assert.deepEqual(ga1.ratio, [5, 4]); // 5-limit pure major third
    assert.equal(ga1.cents, 386.31);

    const ma1 = getShrutiById(10);
    assert.equal(ma1.swara, 'ma₁');
    assert.deepEqual(ma1.ratio, [4, 3]); // Pure 4th
    assert.equal(ma1.cents, 498.04);

    const pa = getShrutiById(14);
    assert.equal(pa.swara, 'Pa');
    assert.deepEqual(pa.ratio, [3, 2]); // Pure 5th
    assert.equal(pa.cents, 701.96);

    const dha1 = getShrutiById(17);
    assert.equal(dha1.swara, 'Dha₁');
    assert.deepEqual(dha1.ratio, [5, 3]); // Pure 6th
    assert.equal(dha1.cents, 884.36);

    const ni1 = getShrutiById(21);
    assert.equal(ni1.swara, 'Ni₁');
    assert.deepEqual(ni1.ratio, [15, 8]); // Pure major 7th
    assert.equal(ni1.cents, 1088.27);
  });

  it('should verify acoustic fifth consonances (3/2 harmonic pairings)', () => {
    // Bhairav: re2 (16/15) * 3/2 = dha2 (8/5)
    // Cross multiply: (16 * 3) / (15 * 2) = 48 / 30 = 8 / 5
    const re2 = getShrutiById(3);
    const dha2 = getShrutiById(16);
    assert.equal(re2.ratio[0] * 3 * dha2.ratio[1], re2.ratio[1] * 2 * dha2.ratio[0]);

    // Todi: re1 (256/243) * 3/2 = dha1 (128/81)
    // Cross multiply: (256 * 3) * 81 = 243 * 2 * 128 = 62208
    const re1 = getShrutiById(2);
    const dha1 = getShrutiById(15);
    assert.equal(re1.ratio[0] * 3 * dha1.ratio[1], re1.ratio[1] * 2 * dha1.ratio[0]);

    // Bhoopali: Ga1 (5/4) * 3/2 = Ni1 (15/8)
    const ga1 = getShrutiById(8);
    const ni1 = getShrutiById(21);
    assert.equal(ga1.ratio[0] * 3 * ni1.ratio[1], ga1.ratio[1] * 2 * ni1.ratio[0]);
  });

  it('getShrutiById helper should look up correctly and handle invalid IDs', () => {
    assert.equal(getShrutiById(1).name, 'Kshiti');
    assert.equal(getShrutiById(14).name, 'Marjani');
    assert.equal(getShrutiById(999), undefined);
    assert.equal(getShrutiById(0), undefined);
    assert.equal(getShrutiById(-5), undefined);
  });
});
