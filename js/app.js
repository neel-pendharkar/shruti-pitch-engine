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

window.addEventListener("DOMContentLoaded", () => {
  initUI();
});

function initUI() {
  const canvasElement = document.getElementById("pitchCanvas");
  pitchCanvas = new PitchCanvas(canvasElement);

  // Initialize Raga selector
  const ragaSelect = document.getElementById("ragaSelect");
  RAGAS.forEach(raga => {
    const opt = document.createElement("option");
    opt.value = raga.id;
    opt.textContent = `${raga.name} (${raga.thaat})`;
    ragaSelect.appendChild(opt);
  });

  currentRaga = RAGAS[0];
  pitchCanvas.setRaga(currentRaga);
  updateRagaInfo(currentRaga);

  ragaSelect.addEventListener("change", (e) => {
    currentRaga = getRagaById(e.target.value);
    pitchCanvas.setRaga(currentRaga);
    updateRagaInfo(currentRaga);
    if (tanpura) {
      // If raga omits Pa (like Marwa), switch tanpura 1st string to Ni or Ma
      if (currentRaga.id === "marwa") {
        tanpura.setFirstString("Ni");
      } else if (currentRaga.id === "malkauns") {
        tanpura.setFirstString("Ma");
      } else {
        tanpura.setFirstString("Pa");
      }
    }
  });

  // Tonic selector
  const tonicSelect = document.getElementById("tonicSelect");
  tonicSelect.value = "C#";
  tonicSelect.addEventListener("change", (e) => {
    baseFreq = TONIC_FREQUENCIES[e.target.value] || 277.18;
    updateBaseFreq(baseFreq);
  });

  // Microphone toggle button
  const micBtn = document.getElementById("micBtn");
  micBtn.addEventListener("click", toggleMicrophone);

  // Calibrate Sa button
  const calibrateBtn = document.getElementById("calibrateBtn");
  calibrateBtn.addEventListener("click", startCalibration);

  // Tanpura toggle
  const tanpuraBtn = document.getElementById("tanpuraBtn");
  const tanpuraVol = document.getElementById("tanpuraVol");
  tanpuraBtn.addEventListener("click", () => {
    if (!audioCtx) initAudio();
    if (!tanpura) tanpura = new TanpuraDrone(audioCtx);
    tanpura.setBaseFreq(baseFreq);

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

  tanpuraVol.addEventListener("input", (e) => {
    if (tanpura) tanpura.setVolume(parseFloat(e.target.value));
  });

  // Sensitivity / Noise Gate slider
  const noiseGateSlider = document.getElementById("noiseGateSlider");
  noiseGateSlider.addEventListener("input", (e) => {
    if (pitchDetector) {
      pitchDetector.minRMS = parseFloat(e.target.value);
    }
  });

  // Vocal Smoothing slider
  const vocalSmoothingSlider = document.getElementById("vocalSmoothingSlider");
  if (vocalSmoothingSlider) {
    vocalSmoothingSlider.addEventListener("input", (e) => {
      vocalSmoother.setSmoothing(parseFloat(e.target.value));
    });
  }

  // Adjustment Speed slider (speed of adaptation / response time)
  const adjustmentSpeedSlider = document.getElementById("adjustmentSpeedSlider");
  if (adjustmentSpeedSlider) {
    adjustmentSpeedSlider.addEventListener("input", (e) => {
      vocalSmoother.setAdjustmentSpeed(parseFloat(e.target.value));
    });
  }

  // Resonance Lock Cutoff slider (tolerance for pure harmonic lock)
  const lockCutoffSlider = document.getElementById("lockCutoffSlider");
  const lockCutoffVal = document.getElementById("lockCutoffVal");
  if (lockCutoffSlider) {
    lockCutoffSlider.addEventListener("input", (e) => {
      resonanceThreshold = parseFloat(e.target.value);
      if (lockCutoffVal) lockCutoffVal.textContent = `±${resonanceThreshold.toFixed(0)}¢`;
      updateArcLockZone(resonanceThreshold);
    });
  }

  // Initialize Dynamic Arc Gauge Lock Zone to default cutoff (±10¢)
  updateArcLockZone(resonanceThreshold);

  // Time Window / Scroll Speed slider (holding notes over time)
  const timeWindowSlider = document.getElementById("timeWindowSlider");
  const timeWindowVal = document.getElementById("timeWindowVal");
  if (timeWindowSlider) {
    timeWindowSlider.addEventListener("input", (e) => {
      const sec = parseFloat(e.target.value);
      pitchCanvas.setTimeWindow(sec);
      if (timeWindowVal) timeWindowVal.textContent = `${sec}s`;
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

function updateBaseFreq(freq) {
  baseFreq = freq;
  document.getElementById("saFreqDisplay").textContent = `${freq.toFixed(2)} Hz`;
  if (pitchCanvas) pitchCanvas.setBaseFreq(freq);
  if (tanpura) tanpura.setBaseFreq(freq);
}

function updateRagaInfo(raga) {
  document.getElementById("ragaDesc").textContent = raga.description;
  document.getElementById("ragaPrahar").textContent = raga.prahar;
  document.getElementById("ragaVadi").textContent = `Vadi: ${raga.vadi || "—"} | Samvadi: ${raga.samvadi || "—"}`;
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
