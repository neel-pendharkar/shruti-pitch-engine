const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { RAGAS, getRagaById } = require('../data/ragas.js');
const { getShrutiById } = require('../data/shrutis.js');

describe('Ragas Database & Musicological Integrity', () => {
  it('should contain a valid catalog of classical ragas', () => {
    assert.ok(RAGAS.length >= 10, `Expected at least 10 ragas, found ${RAGAS.length}`);
  });

  it('every raga must have required metadata fields', () => {
    RAGAS.forEach(raga => {
      assert.ok(raga.id && typeof raga.id === 'string', `${raga.name} missing valid id`);
      assert.ok(raga.name && typeof raga.name === 'string', `${raga.id} missing valid name`);
      assert.ok(raga.thaat && typeof raga.thaat === 'string', `${raga.name} missing valid thaat`);
      assert.ok(raga.prahar && typeof raga.prahar === 'string', `${raga.name} missing valid prahar`);
      assert.ok(Array.isArray(raga.activeShrutis), `${raga.name} activeShrutis must be an array`);
      assert.ok(raga.activeShrutis.length >= 5, `${raga.name} must have at least 5 notes (audav minimum)`);
    });
  });

  it('every raga must include Adhara Shadj (Sa, Shruti ID 1)', () => {
    RAGAS.forEach(raga => {
      assert.ok(
        raga.activeShrutis.includes(1),
        `Raga ${raga.name} must include Sa (Shruti ID 1) as its fundamental anchor`
      );
    });
  });

  it('no raga should contain duplicate shruti IDs', () => {
    RAGAS.forEach(raga => {
      const set = new Set(raga.activeShrutis);
      assert.equal(
        set.size,
        raga.activeShrutis.length,
        `Raga ${raga.name} contains duplicate shruti IDs: ${raga.activeShrutis}`
      );
    });
  });

  it('every active shruti ID must point to a legitimate 22-shruti database node', () => {
    RAGAS.forEach(raga => {
      raga.activeShrutis.forEach(id => {
        const shruti = getShrutiById(id);
        assert.ok(
          shruti !== undefined,
          `Raga ${raga.name} references invalid shruti ID ${id}`
        );
      });
    });
  });

  it('should verify specific raga configurations and varjya notes', () => {
    // Bhoopali: Audava scale (Sa, Re2, Ga1, Pa, Dha1)
    const bhoop = getRagaById('bhoop');
    assert.deepEqual(bhoop.activeShrutis, [1, 5, 8, 14, 17]);
    // Bhoopali strictly varjya notes: Ma (10, 11, 12, 13) and Ni (19, 20, 21, 22)
    assert.ok(!bhoop.activeShrutis.includes(10), 'Bhoopali must not contain Shuddha Ma');
    assert.ok(!bhoop.activeShrutis.includes(21), 'Bhoopali must not contain Shuddha Ni');

    // Bhairav: Diatonic semitones re2 (3) and dha2 (16)
    const bhairav = getRagaById('bhairav');
    assert.ok(bhairav.activeShrutis.includes(3), 'Bhairav must contain Kumudvati (re2, 16/15)');
    assert.ok(bhairav.activeShrutis.includes(16), 'Bhairav must contain Rakta (dha2, 8/5)');
    assert.ok(bhairav.activeShrutis.includes(8), 'Bhairav must contain Ga1 (5/4)');

    // Miyan Ki Todi: Ati-Komal re1 (2), ga1 (6), dha1 (15), and sharp Ma'2 (13)
    const todi = getRagaById('todi');
    assert.ok(todi.activeShrutis.includes(2), 'Todi must contain Teevra re1 (256/243)');
    assert.ok(todi.activeShrutis.includes(6), 'Todi must contain Dayavati ga1 (32/27)');
    assert.ok(todi.activeShrutis.includes(13), 'Todi must contain Preeti Ma\'2 (729/512)');
    assert.ok(todi.activeShrutis.includes(15), 'Todi must contain Kshiti_dha dha1 (128/81)');

    // Marwa: Pa (14) is strictly varjya (omitted)
    const marwa = getRagaById('marwa');
    assert.ok(!marwa.activeShrutis.includes(14), 'Marwa must strictly omit Pancham (Pa)');

    // Malkauns: Pa (14) and Re (3, 4, 5) are strictly varjya
    const malkauns = getRagaById('malkauns');
    assert.ok(!malkauns.activeShrutis.includes(14), 'Malkauns must strictly omit Pancham (Pa)');
    assert.ok(!malkauns.activeShrutis.some(id => [2, 3, 4, 5].includes(id)), 'Malkauns must omit all Rishabhs');
  });

  it('verified ragas must have valid academic & treatise citations', () => {
    const verifiedRagas = RAGAS.filter(r => r.verified || ['bhoop', 'bhimpalasi', 'bhairav', 'vrindavani_sarang', 'todi'].includes(r.id));
    assert.ok(verifiedRagas.length >= 5, 'Must have at least 5 verified classical ragas');

    verifiedRagas.forEach(raga => {
      assert.ok(
        Array.isArray(raga.citations) && raga.citations.length >= 3,
        `Verified raga ${raga.name} must have at least 3 authoritative academic citations`
      );
    });
  });

  it('getRagaById helper returns correct raga or falls back gracefully', () => {
    assert.equal(getRagaById('bhoop').name, 'Raga Bhoop (Bhoopali)');
    assert.equal(getRagaById('yaman').name, 'Raga Yaman (Kalyan)');
    assert.equal(getRagaById('unknown_xyz').id, 'bhoop'); // fallback to default
  });
});
