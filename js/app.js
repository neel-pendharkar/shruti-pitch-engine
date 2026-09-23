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
let vocalSmoother = new VocalSmoother(6, 0.75); // Adaptive vocal stabilizer

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
    clearLiveHUD();
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

  if (result.voiced && result.freq) {
    const rawCents = PitchDetector.hzToCents(result.freq, baseFreq);
    const smoothedData = vocalSmoother.process(rawCents, currentRaga.activeShrutis);

    if (smoothedData && smoothedData.match) {
      const stableCents = smoothedData.smoothedCents;
      const match = smoothedData.match;
      // Derive stable frequency from smoothed cents for calm HUD display
      const stableFreq = baseFreq * Math.pow(2, stableCents / 1200);

      pitchCanvas.pushPitch(stableCents, true, match.isResonating);
      pitchCanvas.setSustainInfo(smoothedData.sustain);
      updateLiveHUD(stableFreq, stableCents, match, smoothedData.sustain);
    } else {
      pitchCanvas.pushPitch(rawCents, true, false);
      pitchCanvas.setSustainInfo(null);
      updateLiveHUDPartial(result.freq, rawCents);
    }

    if (isCalibrating) {
      calibrationBuffer.push(result.freq);
    }
  } else {
    vocalSmoother.reset();
    pitchCanvas.pushPitch(0, false, false);
    pitchCanvas.setSustainInfo(null);
    clearLiveHUD();
  }

  requestAnimationFrame(processAudio);
}

// Update the large, prominent Live Display HUD
function updateLiveHUD(freq, rawCents, match, sustain) {
  const shruti = match.shruti;
  const dev = match.deviationCents;

  const swaraNameEl = document.getElementById("hudSwaraName");
  const shrutiNameEl = document.getElementById("hudShrutiName");
  const ratioEl = document.getElementById("hudRatio");
  const freqEl = document.getElementById("hudFreq");
  const deviationEl = document.getElementById("hudDeviation");
  const meterFill = document.getElementById("hudMeterFill");
  const lockBeacon = document.getElementById("hudLockBeacon");

  // Display Swara & Traditional Sanskrit Shruti name
  swaraNameEl.textContent = shruti.swara;
  
  if (sustain && sustain.isLongHold) {
    shrutiNameEl.textContent = `${shruti.name} • Held: ${sustain.durationSec.toFixed(1)}s (Lock: ${sustain.resonancePercent}%)`;
  } else {
    shrutiNameEl.textContent = `${shruti.name} (${shruti.desc || shruti.type})`;
  }
  ratioEl.textContent = `Ratio: ${shruti.ratioStr} [Target: +${Math.round(shruti.cents)}¢]`;
  freqEl.textContent = `${freq.toFixed(1)} Hz`;

  // Deviation formatting (+2.1¢ or -1.4¢)
  const sign = dev >= 0 ? "+" : "";
  deviationEl.textContent = `${sign}${dev.toFixed(1)} cents`;

  // Deviation Meter Fill (-50 to +50 cents range)
  const clampedDev = Math.max(-50, Math.min(50, dev));
  const percent = 50 + (clampedDev / 50) * 50;
  meterFill.style.left = `${Math.min(50, percent)}%`;
  meterFill.style.width = `${Math.abs(percent - 50)}%`;

  if (match.isResonating) {
    // Pure harmonic lock!
    deviationEl.className = "hud-deviation lock";
    meterFill.className = "meter-fill lock";
    lockBeacon.classList.add("visible");
  } else if (Math.abs(dev) < 15) {
    deviationEl.className = "hud-deviation close";
    meterFill.className = "meter-fill close";
    lockBeacon.classList.remove("visible");
  } else {
    deviationEl.className = "hud-deviation off";
    meterFill.className = "meter-fill off";
    lockBeacon.classList.remove("visible");
  }
}

function updateLiveHUDPartial(freq, rawCents) {
  document.getElementById("hudFreq").textContent = `${freq.toFixed(1)} Hz`;
  document.getElementById("hudDeviation").textContent = "Off-scale";
}

function clearLiveHUD() {
  document.getElementById("hudSwaraName").textContent = "—";
  document.getElementById("hudShrutiName").textContent = "Waiting for singing voice...";
  document.getElementById("hudRatio").textContent = "—";
  document.getElementById("hudFreq").textContent = "— Hz";
  document.getElementById("hudDeviation").textContent = "—";
  document.getElementById("hudDeviation").className = "hud-deviation";
  document.getElementById("hudMeterFill").style.width = "0%";
  document.getElementById("hudLockBeacon").classList.remove("visible");
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
