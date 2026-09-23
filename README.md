# 🎵 22-Shruti Real-Time Pitch Engine

A zero-dependency, microtonal real-time pitch recognition and visualization web application engineered specifically for **Indian Classical Music (Hindustani & Carnatic)**.

Unlike Western tuners locked to 12-TET (Equal Temperament), this engine uses mathematically exact **5-Limit Just Intonation ratios of the 22 Shrutis** and dynamically retunes its pitch grid to the selected Raga.

---

## ✨ Features

- **Microphone Pitch Tracking:** Real-time sub-cent $f_0$ extraction using the **McLeod Pitch Method (MPM)** with parabolic peak interpolation.
- **Adaptive Vocal Stabilizer:** Eliminates physiological vocal tremor and vocal fry jitter while maintaining zero-latency response on deliberate note leaps.
- **Dynamic 22-Shruti Raga Grid:** 
  - In **Raga Bhairav**, $\text{re}_2$ locks to the Diatonic Semitone ($16/15 \approx 111.73¢$).
  - In **Miyan Ki Todi**, $\text{re}_1$ drops by $21.5¢$ to the Pythagorean Limma ($256/243 \approx 90.22¢$).
  - In **Raga Bhimpalasi**, $\text{ni}_1$ locks to the grave 4th-consonant ($16/9 \approx 996.09¢$).
  - In **Darbari Kanada**, displays an animated *andolan* sinusoidal corridor.
- **Live Display HUD:** Displays detected Swara, traditional Sanskrit Shruti name, harmonic fraction, and deviation meter $(-50¢ \text{ to } +50¢)$.
- **Resonance Lock:** Visual indicator when vocal sustain enters pure integer resonance ($\le \pm 3.5¢$).
- **Acoustic Tanpura Synthesizer:** Pure harmonic overtone drone generator to sing against.
- **Custom Tonic (Sa) Calibration:** Hum your comfortable tonic for 1.5s to calibrate the engine to your voice.
- **Time Span Control:** Zoom timeline from $3\text{s}$ to $25\text{s}$ for analyzing long note holds.

---

## 🚀 Running Locally

No build tools or package managers required. Simply serve the directory with any local static server:

```bash
# Using Python
python -m http.server 8080

# Or using Node
npx serve .
```

Open `http://localhost:8080` in Chrome, Edge, or Firefox and allow microphone access.

---

## 📜 License
MIT
