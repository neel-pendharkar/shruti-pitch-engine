// Main Application Controller: Microphone Streaming, Live HUD, and User Controls
let audioCtx = null;
let micStream = null;
let sourceNode = null;
let analyserNode = null;
let pitchDetector = null;
let pitchCanvas = null;
let tanpura = null;

let isListening = false;
let currentRaga = null;
let baseFreq = 277.18; // Default C# (277.18 Hz)
let isCalibrating = false;
let calibrationBuffer = [];
let vocalSmoother = new VocalSmoother(9, 0.85, 0.35); // Enhanced vocal stabilizer: 9-point median + calm EMA
let resonanceThreshold = 10.0; // Default ±10 cents lock tolerance (user adjustable up to ±20 cents)

// Calm HUD State & Damped Interpolation (Eliminates Flittering)
let lastVoicedTime = 0;
let targetDeviation = 0;
let displayedDeviation = 0;
let targetFreq = 0;
let displayedFreq = 0;
let lastMatch = null;
let lastSustain = null;
let lastHudTextTime = 0;

// Standard base tonic frequencies (Middle Octave / Madhya Saptak)
const TONIC_FREQUENCIES = {
  "A": 220.00,
  "A#": 233.08,
  "B": 246.94,
  "C": 261.63,
  "C#": 277.18,
  "D": 293.66,
  "D#": 311.13,
  "E": 329.63,
  "F": 349.23,
  "F#": 369.99,
  "G": 392.00,
  "G#": 415.30
};

// LocalStorage Preferences Key & Baseline Defaults
const PREFS_KEY = "shruti_engine_preferences_v2";

const DEFAULT_PREFS = {
  tonic: "C#",
  raga: "bhoop",
  vocalSmoothing: 0.85,
  adjustmentSpeed: 0.35,
  lockCutoff: 10,
  noiseGate: 0.008,
  timeWindow: 10,
  tanpuraVol: 0.45
};

function getSavedPreferences() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch (err) {
    console.warn("Could not load preferences from localStorage:", err);
    return { ...DEFAULT_PREFS };
  }
}

function saveCurrentPreferences() {
  const prefs = {
    tonic: document.getElementById("tonicSelect")?.value || "C#",
    raga: currentRaga?.id || "bhoop",
    vocalSmoothing: parseFloat(document.getElementById("vocalSmoothingSlider")?.value || 0.85),
    adjustmentSpeed: parseFloat(document.getElementById("adjustmentSpeedSlider")?.value || 0.35),
    lockCutoff: parseFloat(document.getElementById("lockCutoffSlider")?.value || 10),
    noiseGate: parseFloat(document.getElementById("noiseGateSlider")?.value || 0.008),
    timeWindow: parseFloat(document.getElementById("timeWindowSlider")?.value || 10),
    tanpuraVol: parseFloat(document.getElementById("tanpuraVol")?.value || 0.45)
  };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    flashSavedBadge();
  } catch (err) {
    console.warn("Could not save preferences to localStorage:", err);
  }
}

function flashSavedBadge() {
  const badge = document.getElementById("saveBadge");
  if (badge) {
    badge.classList.add("flash");
    setTimeout(() => {
      badge.classList.remove("flash");
    }, 600);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initUI();
});

function initUI() {
  const canvasElement = document.getElementById("pitchCanvas");
  pitchCanvas = new PitchCanvas(canvasElement);

  // Load user preferences or fall back to defaults
  const prefs = getSavedPreferences();

  // Initialize Raga selector with Verified group at the top
  const ragaSelect = document.getElementById("ragaSelect");
  ragaSelect.innerHTML = "";

  const verifiedGroup = document.createElement("optgroup");
  verifiedGroup.label = "✓ Perfected & Verified Ragas";

  const otherGroup = document.createElement("optgroup");
  otherGroup.label = "Classical Exploration";

  RAGAS.forEach(raga => {
    const opt = document.createElement("option");
    opt.value = raga.id;
    if (raga.verified) {
      opt.textContent = `★ ${raga.name} (${raga.thaat})`;
      verifiedGroup.appendChild(opt);
    } else {
      opt.textContent = `${raga.name} (${raga.thaat})`;
      otherGroup.appendChild(opt);
    }
  });

  ragaSelect.appendChild(verifiedGroup);
  ragaSelect.appendChild(otherGroup);

  currentRaga = getRagaById(prefs.raga) || RAGAS[0];
  ragaSelect.value = currentRaga.id;
  pitchCanvas.setRaga(currentRaga);
  updateRagaInfo(currentRaga);

  ragaSelect.addEventListener("change", (e) => {
    currentRaga = getRagaById(e.target.value);
    pitchCanvas.setRaga(currentRaga);
    updateRagaInfo(currentRaga);
    if (tanpura) {
      if (currentRaga.id === "marwa") {
        tanpura.setFirstString("Ni");
      } else if (currentRaga.id === "malkauns") {
        tanpura.setFirstString("Ma");
      } else {
        tanpura.setFirstString("Pa");
      }
    }
    saveCurrentPreferences();
  });

  // Tonic selector
  const tonicSelect = document.getElementById("tonicSelect");
  tonicSelect.value = prefs.tonic || "C#";
  baseFreq = TONIC_FREQUENCIES[tonicSelect.value] || 277.18;
  updateBaseFreq(baseFreq);

  tonicSelect.addEventListener("change", (e) => {
    baseFreq = TONIC_FREQUENCIES[e.target.value] || 277.18;
    updateBaseFreq(baseFreq);
    saveCurrentPreferences();
  });

  // Microphone toggle button
  const micBtn = document.getElementById("micBtn");
  micBtn.addEventListener("click", toggleMicrophone);

  // Calibrate Sa button
  const calibrateBtn = document.getElementById("calibrateBtn");
  calibrateBtn.addEventListener("click", startCalibration);

  // Tanpura toggle & volume controls (synchronized between toolbar and drawer)
  const tanpuraBtn = document.getElementById("tanpuraBtn");
  const tanpuraVol = document.getElementById("tanpuraVol");
  const tanpuraVolDrawer = document.getElementById("tanpuraVolDrawer");
  const tanpuraVolVal = document.getElementById("tanpuraVolVal");

  if (tanpuraVol) tanpuraVol.value = prefs.tanpuraVol;
  if (tanpuraVolDrawer) tanpuraVolDrawer.value = prefs.tanpuraVol;
  if (tanpuraVolVal) tanpuraVolVal.textContent = `${Math.round(prefs.tanpuraVol * 100)}%`;

  tanpuraBtn.addEventListener("click", () => {
    if (!audioCtx) initAudio();
    if (!tanpura) tanpura = new TanpuraDrone(audioCtx);
    tanpura.setBaseFreq(baseFreq);
    tanpura.setVolume(parseFloat(tanpuraVol.value));

    if (tanpura.isPlaying) {
      tanpura.stop();
      tanpuraBtn.textContent = "Start Tanpura";
      tanpuraBtn.classList.remove("active");
    } else {
      tanpura.start();
      tanpuraBtn.textContent = "Stop Tanpura";
      tanpuraBtn.classList.add("active");
    }
  });

  const syncTanpuraVol = (val) => {
    if (tanpuraVol) tanpuraVol.value = val;
    if (tanpuraVolDrawer) tanpuraVolDrawer.value = val;
    if (tanpuraVolVal) tanpuraVolVal.textContent = `${Math.round(val * 100)}%`;
    if (tanpura) tanpura.setVolume(val);
    saveCurrentPreferences();
  };

  if (tanpuraVol) tanpuraVol.addEventListener("input", (e) => syncTanpuraVol(parseFloat(e.target.value)));
  if (tanpuraVolDrawer) tanpuraVolDrawer.addEventListener("input", (e) => syncTanpuraVol(parseFloat(e.target.value)));

  // Expandable Drawer Toggle & Close
  const dialsDrawer = document.getElementById("dialsDrawer");
  const dialsToggleBtn = document.getElementById("dialsToggleBtn");
  const closeDrawerBtn = document.getElementById("closeDrawerBtn");

  if (dialsToggleBtn && dialsDrawer) {
    dialsToggleBtn.addEventListener("click", () => {
      dialsDrawer.classList.toggle("open");
      dialsToggleBtn.classList.toggle("active");
    });
  }

  if (closeDrawerBtn && dialsDrawer) {
    closeDrawerBtn.addEventListener("click", () => {
      dialsDrawer.classList.remove("open");
      if (dialsToggleBtn) dialsToggleBtn.classList.remove("active");
    });
  }

  // Vocal Smoothing slider
  const vocalSmoothingSlider = document.getElementById("vocalSmoothingSlider");
  const vocalSmoothingVal = document.getElementById("vocalSmoothingVal");
  if (vocalSmoothingSlider) {
    vocalSmoothingSlider.value = prefs.vocalSmoothing;
    if (vocalSmoothingVal) vocalSmoothingVal.textContent = prefs.vocalSmoothing.toFixed(2);
    vocalSmoother.setSmoothing(prefs.vocalSmoothing);

    vocalSmoothingSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      vocalSmoother.setSmoothing(val);
      if (vocalSmoothingVal) vocalSmoothingVal.textContent = val.toFixed(2);
      saveCurrentPreferences();
    });
  }

  // Adjustment Speed slider
  const adjustmentSpeedSlider = document.getElementById("adjustmentSpeedSlider");
  const adjustmentSpeedVal = document.getElementById("adjustmentSpeedVal");
  if (adjustmentSpeedSlider) {
    adjustmentSpeedSlider.value = prefs.adjustmentSpeed;
    if (adjustmentSpeedVal) adjustmentSpeedVal.textContent = prefs.adjustmentSpeed.toFixed(2);
    vocalSmoother.setAdjustmentSpeed(prefs.adjustmentSpeed);

    adjustmentSpeedSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      vocalSmoother.setAdjustmentSpeed(val);
      if (adjustmentSpeedVal) adjustmentSpeedVal.textContent = val.toFixed(2);
      saveCurrentPreferences();
    });
  }

  // Resonance Lock Cutoff slider (tolerance for pure harmonic lock)
  const lockCutoffSlider = document.getElementById("lockCutoffSlider");
  const lockCutoffVal = document.getElementById("lockCutoffVal");
  resonanceThreshold = prefs.lockCutoff || 10.0;
  if (lockCutoffSlider) {
    lockCutoffSlider.value = resonanceThreshold;
    if (lockCutoffVal) lockCutoffVal.textContent = `±${resonanceThreshold.toFixed(0)}¢`;

    lockCutoffSlider.addEventListener("input", (e) => {
      resonanceThreshold = parseFloat(e.target.value);
      if (lockCutoffVal) lockCutoffVal.textContent = `±${resonanceThreshold.toFixed(0)}¢`;
      updateArcLockZone(resonanceThreshold);
      saveCurrentPreferences();
    });
  }

  // Initialize Dynamic Arc Gauge Lock Zone to cutoff
  updateArcLockZone(resonanceThreshold);

  // Noise Gate slider
  const noiseGateSlider = document.getElementById("noiseGateSlider");
  const noiseGateVal = document.getElementById("noiseGateVal");
  if (noiseGateSlider) {
    noiseGateSlider.value = prefs.noiseGate;
    if (noiseGateVal) noiseGateVal.textContent = prefs.noiseGate.toFixed(3);
    if (pitchDetector) pitchDetector.minRMS = prefs.noiseGate;

    noiseGateSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      if (pitchDetector) pitchDetector.minRMS = val;
      if (noiseGateVal) noiseGateVal.textContent = val.toFixed(3);
      saveCurrentPreferences();
    });
  }

  // Time Window / Scroll Speed slider
  const timeWindowSlider = document.getElementById("timeWindowSlider");
  const timeWindowVal = document.getElementById("timeWindowVal");
  if (timeWindowSlider) {
    timeWindowSlider.value = prefs.timeWindow;
    if (timeWindowVal) timeWindowVal.textContent = `${prefs.timeWindow}s`;
    pitchCanvas.setTimeWindow(prefs.timeWindow);

    timeWindowSlider.addEventListener("input", (e) => {
      const sec = parseFloat(e.target.value);
      pitchCanvas.setTimeWindow(sec);
      if (timeWindowVal) timeWindowVal.textContent = `${sec}s`;
      saveCurrentPreferences();
    });
  }

  // Reset to Defaults Button
  const resetDefaultsBtn = document.getElementById("resetDefaultsBtn");
  if (resetDefaultsBtn) {
    resetDefaultsBtn.addEventListener("click", () => {
      // Apply baseline defaults
      vocalSmoothingSlider.value = DEFAULT_PREFS.vocalSmoothing;
      if (vocalSmoothingVal) vocalSmoothingVal.textContent = DEFAULT_PREFS.vocalSmoothing.toFixed(2);
      vocalSmoother.setSmoothing(DEFAULT_PREFS.vocalSmoothing);

      adjustmentSpeedSlider.value = DEFAULT_PREFS.adjustmentSpeed;
      if (adjustmentSpeedVal) adjustmentSpeedVal.textContent = DEFAULT_PREFS.adjustmentSpeed.toFixed(2);
      vocalSmoother.setAdjustmentSpeed(DEFAULT_PREFS.adjustmentSpeed);

      lockCutoffSlider.value = DEFAULT_PREFS.lockCutoff;
      resonanceThreshold = DEFAULT_PREFS.lockCutoff;
      if (lockCutoffVal) lockCutoffVal.textContent = `±${resonanceThreshold.toFixed(0)}¢`;
      updateArcLockZone(resonanceThreshold);

      noiseGateSlider.value = DEFAULT_PREFS.noiseGate;
      if (noiseGateVal) noiseGateVal.textContent = DEFAULT_PREFS.noiseGate.toFixed(3);
      if (pitchDetector) pitchDetector.minRMS = DEFAULT_PREFS.noiseGate;

      timeWindowSlider.value = DEFAULT_PREFS.timeWindow;
      if (timeWindowVal) timeWindowVal.textContent = `${DEFAULT_PREFS.timeWindow}s`;
      pitchCanvas.setTimeWindow(DEFAULT_PREFS.timeWindow);

      syncTanpuraVol(DEFAULT_PREFS.tanpuraVol);
      saveCurrentPreferences();
    });
  }

  pitchCanvas.start();
}

// Dynamically updates the green sweet-spot arc path on the SVG dial to match user cutoff
function updateArcLockZone(thresh) {
  const r = 115;
  const clampedThresh = Math.max(1, Math.min(25, thresh));
  const rad = (clampedThresh * Math.PI) / 180;
  const x1 = 160 - r * Math.sin(rad);
  const y1 = 145 - r * Math.cos(rad);
  const x2 = 160 + r * Math.sin(rad);
  const y2 = y1;
  const pathEl = document.getElementById("arcLockZone");
  if (pathEl) {
    pathEl.setAttribute("d", `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`);
  }
}

// Master Acoustic Reasoning & Musicological Context for all 22 Shrutis
const SHRUTI_REASONING = {
  1: "Fundamental reference tonic / immovable anchor (Adhara Shadj). Exact 1/1 ratio defining the harmonic origin (0.0¢).",
  2: "Pythagorean Limma (256/243) generated via descending cycle of 4ths/5ths ((4/3)⁴ / 2 = 256/243). Sits -9.8¢ flatter than piano Db. Key signature in Todi creating deep pathos.",
  3: "Diatonic Just Semitone (16/15), pure major 3rd inversion (4/3 ÷ 5/4 = 16/15). Sits +11.7¢ sharper than piano Db. Forms exact 3/2 fifth with dha₂ (8/5) in Bhairav.",
  4: "Minor Whole Tone (10/9) derived from 5-limit Just Intonation (5/4 ÷ 9/8 = 10/9). Sits -17.6¢ flatter than piano D. Forms pure 3/2 fifth with ma₁ (4/3) in Kafi.",
  5: "Chatushruti Major Whole Tone (9/8), second fifth in Pythagorean progression ((3/2)² / 2 = 9/8). Sits +3.9¢ sharper than piano D. Radiant Vadi anchor in Bhoopali and Sarang.",
  6: "Ati-Komal Grave Minor 3rd (32/27), descending cycle 4th from dha₁ (128/81 × 4/3 ÷ 2 = 32/27). Sits -5.9¢ flatter than piano Eb. Oscillating anchor in Miyan Ki Todi and Darbari.",
  7: "Pure 5-Limit Minor 3rd (6/5), natural harmonic minor third. Sits +15.6¢ sharper than piano Eb. Beatless, tender consonance in Bhimpalasi and Kafi.",
  8: "Pure Just Major 3rd (5/4, 5th harmonic). Sits -13.7¢ flatter than piano E. Blissful, beatless consonant cornerstone of Bhoopali, Yaman, and Bilawal.",
  9: "Pythagorean Major 3rd / Ditone (81/64, (3/2)⁴ / 4 = 81/64). Sits +7.8¢ sharper than piano E. High, bright harmonic resonance in Khamaj.",
  10: "Shuddha Madhyam (4/3), pure reciprocal 4th below Sa (2 ÷ 3/2 = 4/3). Sits -2.0¢ flatter than piano F. Principal Vadi anchor of Bhimpalasi and Yaman descent.",
  11: "Acute Madhyam / Teevra Ma (27/20), 5-limit inflection (9/8 × 6/5 = 27/20). Sits +19.5¢ sharper than piano F. Melodic ascending nuance.",
  12: "Natural Diatonic Tritone (45/32, 5/4 × 9/8 = 45/32). Sits -9.8¢ flatter than piano F#. Tender Tivra Madhyam in Yaman.",
  13: "Pythagorean Sharp 4th (729/512, (3/2)⁶ / 8 = 729/512). Sits +11.7¢ sharper than piano F#. Sharp piercing tritone anchor in Miyan Ki Todi and Marwa.",
  14: "Pancham (3/2, 3rd harmonic), immovable primordial anchor. Sits +2.0¢ sharper than piano G. Consonant pillar of the saptak across all classical ragas.",
  15: "Pythagorean Flat 6th (128/81), descending cycle tone ((4/3)³ / 2 = 128/81). Sits -7.8¢ flatter than piano Ab. Forms an exact beatless 3/2 fifth with re₁ in Miyan Ki Todi.",
  16: "Diatonic Minor 6th (8/5), pure major 3rd inversion (2 ÷ 5/4 = 8/5). Sits +13.7¢ sharper than piano Ab. Forms exact 3/2 fifth with re₂ (16/15) in Bhairav.",
  17: "Pure Just Major 6th (5/3, 5/4 × 4/3 = 5/3). Sits -15.6¢ flatter than piano A. Blissful consonant Samvadi pillar of Bhoopali and Yaman.",
  18: "Pythagorean Major 6th (27/16, (3/2)³ / 2 = 27/16). Sits +5.9¢ sharper than piano A. Bright natural 6th in Bilawal.",
  19: "Grave Minor 7th (16/9, (4/3)² = 16/9). Sits -3.9¢ flatter than piano Bb. Forms pure 4th consonance with Madhyam (4/3) in Bhimpalasi and Darbari.",
  20: "Pure Just Minor 7th (9/5, 3/2 × 6/5 = 9/5). Sits +17.6¢ sharper than piano Bb. Sweet descending contour interval in Vrindavani Sarang.",
  21: "Pure Just Major 7th (15/8, 5/4 × 3/2 = 15/8). Sits -11.7¢ flatter than piano B. Majestic leading tone in Yaman, Bhoopali, and Bhairav.",
  22: "Kakali Nishad (243/128, (3/2)⁵ / 4 = 243/128). Sits +9.8¢ sharper than piano B. High, energetic leading tone in Shankara."
};

const CHROMATIC_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function renderBottomTuningTable(raga, tonicFreq) {
  if (!raga) return;
  const tonicSelect = document.getElementById("tonicSelect");
  const tonicName = tonicSelect ? tonicSelect.value : "C#";
  const tonicIndex = CHROMATIC_NOTES.indexOf(tonicName);

  const tableTitle = document.getElementById("bottomTableTitle");
  const thaatBadge = document.getElementById("bottomRagaThaatBadge");
  const tonicBadge = document.getElementById("bottomTonicBadge");
  const tableBody = document.getElementById("bottomTuningTableBody");
  const citationsBox = document.getElementById("bottomCitationsBox");
  const citationsList = document.getElementById("bottomCitationsList");

  if (tableTitle) tableTitle.textContent = `${raga.name} • 22-Shruti Acoustic Tuning Matrix`;
  if (thaatBadge) thaatBadge.textContent = `${raga.thaat} Thaat`;
  if (tonicBadge) tonicBadge.textContent = `Tonic Sa = ${tonicName} (${tonicFreq.toFixed(1)} Hz)`;

  if (tableBody) {
    tableBody.innerHTML = "";

    raga.activeShrutis.forEach(shrutiId => {
      const shruti = getShrutiById(shrutiId);
      if (!shruti) return;

      const exactFreq = tonicFreq * (shruti.ratio[0] / shruti.ratio[1]);
      const semitones = Math.round(shruti.cents / 100);
      const pianoNote = CHROMATIC_NOTES[(tonicIndex >= 0 ? tonicIndex + semitones : 1 + semitones) % 12];
      const diff = shruti.cents - (semitones * 100);

      let badgeClass = "anchor";
      let badgeText = "0.0¢ (anchor)";
      if (Math.abs(diff) < 0.2) {
        badgeClass = "anchor";
        badgeText = "0.0¢ (anchor)";
      } else if (diff > 0) {
        badgeClass = "sharp";
        badgeText = `+${diff.toFixed(1)}¢ sharp`;
      } else {
        badgeClass = "flat";
        badgeText = `${diff.toFixed(1)}¢ flat`;
      }

      // Check Vadi / Samvadi role
      let swaraBadgeClass = "swara-badge";
      let swaraRoleLabel = "";
      if (raga.vadi && shruti.swara.toLowerCase() === raga.vadi.toLowerCase()) {
        swaraBadgeClass += " vadi";
        swaraRoleLabel = " (Vadi)";
      } else if (raga.samvadi && shruti.swara.toLowerCase() === raga.samvadi.toLowerCase()) {
        swaraBadgeClass += " samvadi";
        swaraRoleLabel = " (Samvadi)";
      }

      const reasoning = SHRUTI_REASONING[shruti.id] || shruti.desc || "Harmonic ratio in 5-limit Just Intonation.";

      const tr = document.createElement("tr");
      tr.id = `bottom-tuning-row-${shruti.id}`;
      tr.innerHTML = `
        <td><span class="${swaraBadgeClass}">${shruti.swara}${swaraRoleLabel}</span></td>
        <td><strong>${shruti.name}</strong></td>
        <td class="mono-cell">${shruti.ratioStr}</td>
        <td class="mono-cell">+${shruti.cents.toFixed(1)}¢</td>
        <td class="mono-cell">${exactFreq.toFixed(1)} Hz</td>
        <td>
          <div class="piano-comparison">
            <span class="piano-note">${pianoNote}</span>
            <span class="diff-badge ${badgeClass}">${badgeText}</span>
          </div>
        </td>
        <td class="reasoning-cell">${reasoning}</td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // Populate academic & treatise citations if present
  if (citationsBox && citationsList) {
    if (raga.citations && raga.citations.length > 0) {
      citationsList.innerHTML = raga.citations.map(c => `<li>${c}</li>`).join("");
      citationsBox.style.display = "block";
    } else {
      citationsBox.style.display = "none";
    }
  }
}

function updateBaseFreq(freq) {
  baseFreq = freq;
  document.getElementById("saFreqDisplay").textContent = `${freq.toFixed(2)} Hz`;
  if (pitchCanvas) pitchCanvas.setBaseFreq(freq);
  if (tanpura) tanpura.setBaseFreq(freq);
  if (currentRaga) renderBottomTuningTable(currentRaga, freq);
}

function updateRagaInfo(raga) {
  document.getElementById("ragaDesc").textContent = raga.description;
  document.getElementById("ragaPrahar").textContent = raga.prahar;
  document.getElementById("ragaVadi").textContent = `Vadi: ${raga.vadi || "—"} | Samvadi: ${raga.samvadi || "—"}`;
  renderBottomTuningTable(raga, baseFreq);
}

async function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    pitchDetector = new PitchDetector(audioCtx.sampleRate, 2048);
  }
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
}

async function toggleMicrophone() {
  const micBtn = document.getElementById("micBtn");
  const statusIndicator = document.getElementById("statusIndicator");

  if (isListening) {
    // Stop listening
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
    isListening = false;
    micBtn.textContent = "Turn ON Microphone";
    micBtn.classList.remove("active");
    statusIndicator.textContent = "Mic Inactive";
    statusIndicator.className = "status-badge inactive";
    lastMatch = null;
    lastSustain = null;
    targetDeviation = 0;
    targetFreq = 0;
    displayedDeviation = 0;
    displayedFreq = 0;
    renderHUD(performance.now());
    return;
  }

  // Start listening
  try {
    await initAudio();

    // Critical: Disable browser speech preprocessing filters that mangle sustained vocal singing!
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    sourceNode = audioCtx.createMediaStreamSource(micStream);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 2048;

    sourceNode.connect(analyserNode);

    isListening = true;
    micBtn.textContent = "Turn OFF Microphone";
    micBtn.classList.add("active");
    statusIndicator.textContent = "Live Listening";
    statusIndicator.className = "status-badge active";

    processAudio();
  } catch (err) {
    console.error("Microphone access error:", err);
    alert(`Could not access microphone: ${err.message}. Please check browser permissions.`);
  }
}

function processAudio() {
  if (!isListening || !analyserNode) return;

  const buffer = new Float32Array(analyserNode.fftSize);
  analyserNode.getFloatTimeDomainData(buffer);

  const result = pitchDetector.detect(buffer);
  const now = performance.now();

  if (result.voiced && result.freq) {
    lastVoicedTime = now;
    const rawCents = PitchDetector.hzToCents(result.freq, baseFreq);
    const smoothedData = vocalSmoother.process(rawCents, currentRaga.activeShrutis, resonanceThreshold);

    if (smoothedData && smoothedData.match) {
      const stableCents = smoothedData.smoothedCents;
      lastMatch = smoothedData.match;
      lastSustain = smoothedData.sustain;
      targetDeviation = lastMatch.deviationCents;
      targetFreq = baseFreq * Math.pow(2, stableCents / 1200);

      pitchCanvas.pushPitch(stableCents, true, lastMatch.isResonating);
      pitchCanvas.setSustainInfo(smoothedData.sustain);
    } else {
      pitchCanvas.pushPitch(rawCents, true, false);
      pitchCanvas.setSustainInfo(null);
    }

    if (isCalibrating) {
      calibrationBuffer.push(result.freq);
    }
  } else {
    pitchCanvas.pushPitch(0, false, false);
    pitchCanvas.setSustainInfo(null);

    const silenceElapsed = now - lastVoicedTime;
    // Only clear the held note after 2.2 seconds of complete silence
    if (silenceElapsed > 2200) {
      lastMatch = null;
      lastSustain = null;
      targetDeviation = 0;
      targetFreq = 0;
    }
  }

  renderHUD(now);
  requestAnimationFrame(processAudio);
}

// Slick, Damped HUD Rendering with Analog Arc Tuner Dial
function renderHUD(now) {
  const hudContainer = document.getElementById("hudContainer");
  const arcNeedleGroup = document.getElementById("arcNeedleGroup");
  const deviationEl = document.getElementById("hudDeviation");
  const lockTag = document.getElementById("hudLockTag");
  const freqEl = document.getElementById("hudFreq");
  const targetCentsEl = document.getElementById("hudTargetCents");
  const swaraNameEl = document.getElementById("hudSwaraName");
  const shrutiNameEl = document.getElementById("hudShrutiName");
  const ratioEl = document.getElementById("hudRatio");

  const silenceElapsed = now - lastVoicedTime;
  const isSilenced = silenceElapsed > 250;

  // 1. Damped Smooth Needle Glide (0.075 damping provides calm, forgiving analog meter response)
  displayedDeviation += (targetDeviation - displayedDeviation) * 0.075;
  const clampedDev = Math.max(-50, Math.min(50, displayedDeviation));
  
  if (arcNeedleGroup) {
    arcNeedleGroup.style.transform = `rotate(${clampedDev.toFixed(2)}deg)`;
  }

  // Visual container hold state (dims gently instead of flashing blank)
  if (hudContainer) {
    if (!isListening) {
      hudContainer.className = "hud-container idle";
    } else if (lastMatch) {
      if (silenceElapsed > 350 && silenceElapsed <= 2200) {
        hudContainer.className = "hud-container holding";
      } else if (silenceElapsed <= 350) {
        hudContainer.className = "hud-container";
      } else {
        hudContainer.className = "hud-container idle";
      }
    } else {
      hudContainer.className = "hud-container idle";
    }
  }

  // 2. Throttled Text Updates (only every 65ms = ~15 fps to prevent visual fatigue)
  if (now - lastHudTextTime < 65) return;
  lastHudTextTime = now;

  if (lastMatch && isListening) {
    const shruti = lastMatch.shruti;
    const isResonating = Math.abs(displayedDeviation) <= resonanceThreshold;

    if (swaraNameEl) swaraNameEl.textContent = shruti.swara;
    
    if (shrutiNameEl) {
      if (lastSustain && lastSustain.isLongHold && !isSilenced) {
        shrutiNameEl.textContent = `${shruti.name} • Held: ${lastSustain.durationSec.toFixed(1)}s (Lock: ${lastSustain.resonancePercent}%)`;
      } else {
        shrutiNameEl.textContent = `${shruti.name} (${shruti.desc || shruti.type})`;
      }
    }
    
    if (ratioEl) ratioEl.textContent = `Ratio: ${shruti.ratioStr}`;
    if (targetCentsEl) targetCentsEl.textContent = `Target: +${Math.round(shruti.cents)}¢`;
    
    // Smooth frequency display
    displayedFreq += (targetFreq - displayedFreq) * 0.15;
    if (freqEl) freqEl.textContent = `${displayedFreq.toFixed(1)} Hz`;

    // Highlight active row in bottom tuning table
    const activeRow = document.getElementById(`bottom-tuning-row-${shruti.id}`);
    if (activeRow && !activeRow.classList.contains("active-singing")) {
      document.querySelectorAll("#bottomTuningTableBody tr.active-singing").forEach(el => el.classList.remove("active-singing"));
      activeRow.classList.add("active-singing");
    }

    // Formatted Deviation readout (+1.2¢)
    const sign = displayedDeviation >= 0 ? "+" : "";
    if (deviationEl) {
      deviationEl.textContent = `${sign}${displayedDeviation.toFixed(1)}¢`;

      if (isResonating) {
        deviationEl.className = "hud-deviation lock";
        if (arcNeedleGroup) arcNeedleGroup.setAttribute("class", "lock");
        if (lockTag) lockTag.className = "hud-lock-tag visible";
      } else if (Math.abs(displayedDeviation) <= resonanceThreshold * 1.6) {
        deviationEl.className = "hud-deviation close";
        if (arcNeedleGroup) arcNeedleGroup.setAttribute("class", "close");
        if (lockTag) lockTag.className = "hud-lock-tag";
      } else {
        deviationEl.className = "hud-deviation off";
        if (arcNeedleGroup) arcNeedleGroup.setAttribute("class", "off");
        if (lockTag) lockTag.className = "hud-lock-tag";
      }
    }
  } else {
    // Clear active row highlight when silent or no match
    document.querySelectorAll("#bottomTuningTableBody tr.active-singing").forEach(el => el.classList.remove("active-singing"));

    if (deviationEl) {
      deviationEl.textContent = "—";
      deviationEl.className = "hud-deviation";
    }
    if (swaraNameEl) swaraNameEl.textContent = "—";
    if (shrutiNameEl) shrutiNameEl.textContent = isListening ? "Listening for voice..." : "Turn ON mic to start";
    if (ratioEl) ratioEl.textContent = "—";
    if (freqEl) freqEl.textContent = "— Hz";
    if (targetCentsEl) targetCentsEl.textContent = "Target: —";
    if (arcNeedleGroup) {
      arcNeedleGroup.style.transform = "rotate(0deg)";
      arcNeedleGroup.removeAttribute("class");
    }
    if (lockTag) lockTag.className = "hud-lock-tag";
  }
}

// "Calibrate Sa": User sings their comfortable Sa for 1.5 seconds, app locks their tonic!
function startCalibration() {
  if (!isListening) {
    alert("Please turn ON the microphone first before calibrating Sa.");
    return;
  }

  isCalibrating = true;
  calibrationBuffer = [];
  const calibrateBtn = document.getElementById("calibrateBtn");
  calibrateBtn.textContent = "Sing Sa steadily...";
  calibrateBtn.classList.add("recording");

  setTimeout(() => {
    isCalibrating = false;
    calibrateBtn.classList.remove("recording");
    calibrateBtn.textContent = "Calibrate Sa";

    if (calibrationBuffer.length > 8) {
      // Sort and take median to reject vocal onset spikes
      calibrationBuffer.sort((a, b) => a - b);
      const medianFreq = calibrationBuffer[Math.floor(calibrationBuffer.length / 2)];
      updateBaseFreq(medianFreq);
      alert(`Sa calibrated successfully to ${medianFreq.toFixed(2)} Hz!`);
    } else {
      alert("Could not detect a steady voice tone. Please hold your Sa clearly and try again.");
    }
  }, 1600);
}
