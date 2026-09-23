// Master 22 Shrutis Database with exact rational fractions, cents, and traditional names
const SHRUTIS = [
  { id: 1,  name: "Kshiti",      swara: "Sa",  ratioStr: "1/1",     ratio: [1, 1],     cents: 0.0,    western: "C",  type: "achala" },
  { id: 2,  name: "Teevra",      swara: "re₁", ratioStr: "256/243", ratio: [256, 243], cents: 90.22,  western: "Db-",type: "ati-komal", desc: "Pythagorean Limma (Todi, Shree, Marwa)" },
  { id: 3,  name: "Kumudvati",   swara: "re₂", ratioStr: "16/15",   ratio: [16, 15],   cents: 111.73, western: "Db+",type: "komal",     desc: "Diatonic Semitone (Bhairav, Kalingada)" },
  { id: 4,  name: "Manda",       swara: "Re₁", ratioStr: "10/9",    ratio: [10, 9],    cents: 182.40, western: "D-", type: "shuddha",   desc: "Minor Tone (Kafi, Bageshri)" },
  { id: 5,  name: "Chandovati",  swara: "Re₂", ratioStr: "9/8",     ratio: [9, 8],     cents: 203.91, western: "D+", type: "shuddha",   desc: "Major Tone (Yaman, Bilawal, Bhoopali)" },
  { id: 6,  name: "Dayavati",    swara: "ga₁", ratioStr: "32/27",   ratio: [32, 27],   cents: 294.13, western: "Eb-",type: "ati-komal", desc: "Grave Minor 3rd (Darbari Kanada, Todi)" },
  { id: 7,  name: "Ranjani",     swara: "ga₂", ratioStr: "6/5",     ratio: [6, 5],     cents: 315.64, western: "Eb+",type: "komal",     desc: "Pure Minor 3rd (Bhairavi, Kafi, Asavari)" },
  { id: 8,  name: "Raktika",     swara: "Ga₁", ratioStr: "5/4",     ratio: [5, 4],     cents: 386.31, western: "E-", type: "shuddha",   desc: "Pure Major 3rd (Yaman, Bhoopali, Bilawal)" },
  { id: 9,  name: "Raudri",      swara: "Ga₂", ratioStr: "81/64",   ratio: [81, 64],   cents: 407.82, western: "E+", type: "shuddha",   desc: "Pythagorean Major 3rd (Khamaj)" },
  { id: 10, name: "Krodha",      swara: "ma₁", ratioStr: "4/3",     ratio: [4, 3],     cents: 498.04, western: "F",  type: "shuddha",   desc: "Pure Perfect 4th (Bhairav, Kafi, Bilawal)" },
  { id: 11, name: "Vajrika",     swara: "ma₂", ratioStr: "27/20",   ratio: [27, 20],   cents: 519.55, western: "F+", type: "shuddha",   desc: "Acute 4th (transitional inflection)" },
  { id: 12, name: "Prasarini",   swara: "Ma'₁",ratioStr: "45/32",   ratio: [45, 32],   cents: 590.22, western: "F#-",type: "tivra",     desc: "Natural Tritone (Yaman, Kamod)" },
  { id: 13, name: "Preeti",      swara: "Ma'₂",ratioStr: "729/512", ratio: [729, 512], cents: 611.73, western: "F#+",type: "tivra",     desc: "Pythagorean Sharp 4th (Todi, Puriya, Marwa)" },
  { id: 14, name: "Marjani",     swara: "Pa",  ratioStr: "3/2",     ratio: [3, 2],     cents: 701.96, western: "G",  type: "achala",    desc: "Pure Perfect 5th (Invariant Anchor)" },
  { id: 15, name: "Kshiti_dha",  swara: "dha₁",ratioStr: "128/81",  ratio: [128, 81],  cents: 792.18, western: "Ab-",type: "ati-komal", desc: "Pythagorean Flat 6th (Todi, Asavari)" },
  { id: 16, name: "Rakta",       swara: "dha₂",ratioStr: "8/5",     ratio: [8, 5],     cents: 813.69, western: "Ab+",type: "komal",     desc: "Pure Minor 6th (Bhairav, Bhairavi)" },
  { id: 17, name: "Sandipani",   swara: "Dha₁",ratioStr: "5/3",     ratio: [5, 3],     cents: 884.36, western: "A-", type: "shuddha",   desc: "Pure Major 6th (Bhoopali, Yaman, Desh)" },
  { id: 18, name: "Alapini",     swara: "Dha₂",ratioStr: "27/16",   ratio: [27, 16],   cents: 905.87, western: "A+", type: "shuddha",   desc: "Pythagorean Major 6th (Bilawal)" },
  { id: 19, name: "Madanti",     swara: "ni₁", ratioStr: "16/9",    ratio: [16, 9],    cents: 996.09, western: "Bb-",type: "ati-komal", desc: "Grave Minor 7th (Darbari, Jaunpuri)" },
  { id: 20, name: "Rohini",      swara: "ni₂", ratioStr: "9/5",     ratio: [9, 5],     cents: 1017.60,western: "Bb+",type: "komal",     desc: "Pure Minor 7th (Bhairavi, Kafi, Khamaj)" },
  { id: 21, name: "Ramya",       swara: "Ni₁", ratioStr: "15/8",    ratio: [15, 8],    cents: 1088.27,western: "B-", type: "shuddha",   desc: "Pure Major 7th (Yaman, Bihag, Bhairav)" },
  { id: 22, name: "Ugra",        swara: "Ni₂", ratioStr: "243/128", ratio: [243, 128], cents: 1109.78,western: "B+", type: "shuddha",   desc: "Kakali Ni / Leading Tone (Shankara)" }
];

// Helper to look up a shruti by ID
function getShrutiById(id) {
  return SHRUTIS.find(s => s.id === id);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { SHRUTIS, getShrutiById };
}
