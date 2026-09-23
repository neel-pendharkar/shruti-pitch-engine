// 60 FPS Canvas Real-Time Scrolling Pitch Ribbon & Dynamic Shruti Grid
class PitchCanvas {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext("2d");
    
    // Viewport configuration: covers lower notes (Mandra Saptak down to Pa) through Taar Sa
    this.minCents = -650;  // Below Mandra Pa
    this.maxCents = 1350;  // Above Tara Sa
    this.timeWindowSec = 10; // Default 10 seconds history
    this.historyLength = Math.round(this.timeWindowSec * 45); // Timeline frames
    this.history = []; // Array of { cents, voiced, isResonating, time }
    
    this.activeRaga = null;
    this.baseFreq = 277.18;
    this.animationId = null;
    this.currentSustain = null;
    
    // Resize handling
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  setTimeWindow(seconds) {
    this.timeWindowSec = Math.max(3, Math.min(30, seconds));
    this.historyLength = Math.round(this.timeWindowSec * 45);
    while (this.history.length > this.historyLength) {
      this.history.shift();
    }
  }

  setSustainInfo(sustain) {
    this.currentSustain = sustain;
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = Math.max(480, rect.height || 540);
    
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    
    this.ctx.scale(dpr, dpr);
  }

  setRaga(raga) {
    this.activeRaga = raga;
  }

  setBaseFreq(freq) {
    this.baseFreq = freq;
  }

  // Map cents value to vertical canvas Y coordinate
  centsToY(cents) {
    const range = this.maxCents - this.minCents;
    const norm = (cents - this.minCents) / range;
    return this.height - (norm * this.height);
  }

  // Push a new audio frame into scrolling history
  pushPitch(cents, voiced, isResonating) {
    this.history.push({
      cents: voiced ? cents : null,
      voiced: voiced,
      isResonating: isResonating || false,
      time: performance.now()
    });

    if (this.history.length > this.historyLength) {
      this.history.shift();
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // 1. Draw Background & Vignette
    this.ctx.fillStyle = "#0c1017";
    this.ctx.fillRect(0, 0, this.width, this.height);

    // 2. Draw Active Raga Swara Gridlines
    if (this.activeRaga) {
      this.drawShrutiGrid();
    }

    // 3. Draw Pitch Trajectory Ribbon
    this.drawPitchRibbon();

    // 4. Draw Right-Edge Swara Legend HUD
    this.drawSwaraLegend();

    // 5. Draw Long Note Sustain Badge if active
    if (this.currentSustain && this.currentSustain.isLongHold) {
      this.drawSustainHUD();
    }

    this.animationId = requestAnimationFrame(() => this.draw());
  }

  drawSustainHUD() {
    const s = this.currentSustain;
    this.ctx.save();
    
    // Glowing hold card in upper-left
    this.ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    this.ctx.strokeStyle = s.resonancePercent > 70 ? "rgba(16, 185, 129, 0.6)" : "rgba(56, 189, 248, 0.4)";
    this.ctx.lineWidth = 1.2;
    
    const cardW = 220;
    const cardH = 46;
    const cardX = 20;
    const cardY = 20;
    
    this.ctx.beginPath();
    this.ctx.roundRect(cardX, cardY, cardW, cardH, 8);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = s.resonancePercent > 70 ? "#10b981" : "#38bdf8";
    this.ctx.font = "bold 12px -apple-system, sans-serif";
    this.ctx.fillText(`HOLD: ${s.durationSec.toFixed(1)}s`, cardX + 14, cardY + 20);

    this.ctx.fillStyle = "#cbd5e1";
    this.ctx.font = "10px monospace";
    this.ctx.fillText(`Avg Drift: ±${s.avgDev.toFixed(1)}¢ | Lock: ${s.resonancePercent}%`, cardX + 14, cardY + 36);
    this.ctx.restore();
  }

  drawShrutiGrid() {
    const activeIds = this.activeRaga.activeShrutis;

    // Draw Mandra (-1200), Madhya (0), and Taar (1200) octaves
    const octaves = [-1200, 0, 1200];

    for (const octaveOffset of octaves) {
      for (const id of activeIds) {
        const shruti = getShrutiById(id);
        if (!shruti) continue;

        const noteCents = shruti.cents + octaveOffset;
        if (noteCents < this.minCents || noteCents > this.maxCents) continue;

        const y = this.centsToY(noteCents);
        const isSa = shruti.cents === 0;
        const isPa = shruti.ratioStr === "3/2";
        const isVadi = this.activeRaga.vadi && (shruti.swara === this.activeRaga.vadi || shruti.swara.startsWith(this.activeRaga.vadi));

        // Line styling
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(this.width - 150, y);

        if (isSa) {
          this.ctx.strokeStyle = "rgba(255, 215, 0, 0.55)"; // Glowing gold for Sa
          this.ctx.lineWidth = 2.0;
        } else if (isPa) {
          this.ctx.strokeStyle = "rgba(56, 189, 248, 0.45)"; // Cyan for Pa
          this.ctx.lineWidth = 1.6;
        } else if (isVadi) {
          this.ctx.strokeStyle = "rgba(244, 63, 94, 0.40)"; // Ruby for Vadi
          this.ctx.lineWidth = 1.4;
        } else {
          this.ctx.strokeStyle = "rgba(148, 163, 184, 0.16)"; // Subtle guide
          this.ctx.lineWidth = 0.9;
        }
        this.ctx.stroke();

        // If this note has an andolan (like Darbari's ga or dha), draw the wave corridor!
        if (this.activeRaga.andolanNotes && this.activeRaga.andolanNotes.includes(shruti.swara)) {
          this.drawAndolanCorridor(y, noteCents);
        }
      }
    }
  }

  // Visual oscillatory guide corridor for Ragas with heavy Andolan
  drawAndolanCorridor(baseY, noteCents) {
    const time = performance.now() * 0.002;
    this.ctx.beginPath();
    const ampY = (22 / (this.maxCents - this.minCents)) * this.height * 0.6;

    for (let x = 0; x < this.width - 150; x += 6) {
      const wave = Math.sin((x * 0.02) + time) * ampY;
      if (x === 0) this.ctx.moveTo(x, baseY + wave);
      else this.ctx.lineTo(x, baseY + wave);
    }

    this.ctx.strokeStyle = "rgba(236, 72, 153, 0.22)";
    this.ctx.setLineDash([4, 4]);
    this.ctx.lineWidth = 1.2;
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  drawPitchRibbon() {
    if (this.history.length < 2) return;

    const stepX = (this.width - 150) / this.historyLength;

    // Draw continuous, organic vocal contour using smooth quadratic curve segments
    this.ctx.lineWidth = 3.2;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";

    // Gather voiced segments
    let segment = [];
    for (let i = 0; i < this.history.length; i++) {
      const p = this.history[i];
      if (p.voiced && p.cents !== null) {
        segment.push({
          x: i * stepX,
          y: this.centsToY(p.cents),
          isResonating: p.isResonating
        });
      } else {
        if (segment.length > 0) {
          this.renderSegment(segment);
          segment = [];
        }
      }
    }
    if (segment.length > 0) {
      this.renderSegment(segment);
    }

    // Draw live singing cursor head
    const last = this.history[this.history.length - 1];
    if (last && last.voiced && last.cents !== null) {
      const curX = (this.history.length - 1) * stepX;
      const curY = this.centsToY(last.cents);

      this.ctx.beginPath();
      this.ctx.arc(curX, curY, last.isResonating ? 7.0 : 4.8, 0, Math.PI * 2);
      this.ctx.fillStyle = last.isResonating ? "#10b981" : "#38bdf8";
      this.ctx.shadowColor = last.isResonating ? "#34d399" : "#38bdf8";
      this.ctx.shadowBlur = 16;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }
  }

  // Render a continuous voiced vocal segment with smooth curves
  renderSegment(pts) {
    if (pts.length < 2) return;

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];

      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);

      // Smooth midpoint interpolation
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      this.ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
      this.ctx.lineTo(p2.x, p2.y);

      if (p2.isResonating) {
        this.ctx.strokeStyle = "#10b981"; // Pure harmonic resonance lock
        this.ctx.shadowColor = "#34d399";
        this.ctx.shadowBlur = 12;
      } else {
        this.ctx.strokeStyle = "#38bdf8"; // Luminous sky blue
        this.ctx.shadowColor = "rgba(56, 189, 248, 0.4)";
        this.ctx.shadowBlur = 5;
      }

      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }
  }

  drawSwaraLegend() {
    const legendX = this.width - 142;
    
    // Draw right sidebar background
    this.ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
    this.ctx.fillRect(legendX - 8, 0, 150, this.height);
    this.ctx.strokeStyle = "rgba(51, 65, 85, 0.4)";
    this.ctx.strokeRect(legendX - 8, 0, 150, this.height);

    if (!this.activeRaga) return;

    const activeIds = this.activeRaga.activeShrutis;
    this.ctx.font = "11px 'Inter', system-ui, sans-serif";
    this.ctx.textBaseline = "middle";

    const octaves = [-1200, 0, 1200];
    for (const octaveOffset of octaves) {
      for (const id of activeIds) {
        const shruti = getShrutiById(id);
        if (!shruti) continue;

        const noteCents = shruti.cents + octaveOffset;
        const y = this.centsToY(noteCents);
        if (y < 12 || y > this.height - 12) continue;

        const isSa = shruti.cents === 0;
        const isPa = shruti.ratioStr === "3/2";

        // Color code labels
        if (isSa) {
          this.ctx.fillStyle = "#fbbf24"; // Gold
        } else if (isPa) {
          this.ctx.fillStyle = "#38bdf8"; // Cyan
        } else {
          this.ctx.fillStyle = "#cbd5e1"; // Slate
        }

        // Swara notation: dot below for Mandra, apostrophe for Taar
        let swaraName = shruti.swara;
        if (octaveOffset === -1200) swaraName = `.${shruti.swara}`;
        else if (octaveOffset === 1200) swaraName = `${shruti.swara}'`;

        const text = `${swaraName} [${shruti.ratioStr}]`;
        const sign = noteCents >= 0 ? "+" : "";
        const centsText = `${sign}${Math.round(noteCents)}¢`;

        this.ctx.fillText(text, legendX, y - 4);
        this.ctx.font = "9px 'Inter', monospace";
        this.ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
        this.ctx.fillText(centsText, legendX + 80, y - 4);
        this.ctx.font = "11px 'Inter', system-ui, sans-serif";
      }
    }
  }

  start() {
    if (!this.animationId) {
      this.draw();
    }
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
}
