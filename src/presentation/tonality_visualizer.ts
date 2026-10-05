import { TmdSongInspector,TmdSongProfile, TmdTonalityProfile } from "../analysis/inspector.js";
import type { TmdLocale } from "../analysis/localization.js";
import { TmdLocalizationKey, TmdLocalizer } from "../analysis/localization.js";

/**
 * SVG and HTML interactive dashboard visualizer for TMD tonality profiles.
 * Ported faithfully from TmdSwift (TonalityVisualizer.swift).
 */
export class TmdTonalityVisualizer {
  /**
   * Generates a standalone, beautifully styled SVG dashboard containing:
   * 1. Circle of Fifths dial with active nodes and curved trajectory paths.
   * 2. Section Keyscape Timeline ribbon.
   * 3. 12-Tone Pitch Class Distribution radar chart.
   */
  public static generateSVG(profile: TmdSongProfile, locale?: TmdLocale): string {
    const activeLocale = locale || profile.locale || "zh-Hant";
    const localizer = new TmdLocalizer(activeLocale);
    if (!profile.tonality) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><text x="20" y="40" fill="#888">No tonality data available</text></svg>';
    }
    const tonality = profile.tonality;

    const width = 900;
    const height = 560;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" style="background:#0f172a; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <radialGradient id="nodeActive" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </radialGradient>
  </defs>

  <!-- Background Card -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="16"/>

  <!-- Title Bar -->
  <text x="32" y="44" fill="#f8fafc" font-size="20" font-weight="bold">🎼 TMD Tonality Visualizer: ${this.xmlEscape(profile.title)}</text>
  <text x="32" y="68" fill="#94a3b8" font-size="13">${this.xmlEscape(localizer.text(TmdLocalizationKey.visualizerInferredTonality))}: ${this.xmlEscape(`${tonality.globalInference.tonic ?? "?"} ${this.modeLabel(tonality.globalInference.mode, localizer)}`)} | ${this.xmlEscape(localizer.text(TmdLocalizationKey.visualizerConfidence))}: ${(tonality.globalInference.confidence * 100).toFixed(0)}% | ${this.xmlEscape(localizer.text(TmdLocalizationKey.visualizerDiatonicEvidence))}: ${(tonality.globalPitchClasses.diatonicRatio * 100.0).toFixed(1)}%</text>
`;

    // 1. Circle of Fifths (Left, Center (220, 260), Radius 130)
    svg += this.renderCircleOfFifthsSVG(tonality, localizer, 220, 260, 130);

    // 2. Pitch Class Radar Chart (Right, Center (660, 260), Radius 110)
    svg += this.renderRadarChartSVG(tonality, localizer, 660, 260, 110);

    // 3. Section Keyscape Ribbon (Bottom, x: 32, y: 450, width: 836, height: 44)
    svg += this.renderTimelineRibbonSVG(profile, localizer, 32, 450, 836, 44);

    svg += "\n</svg>";
    return svg;
  }

  /**
   * Generates a complete, responsive HTML report containing the embedded SVG dashboard,
   * inspection summary metrics, and section-by-section tonality breakdown.
   */
  public static generateHTML(profile: TmdSongProfile, locale?: TmdLocale): string {
    const activeLocale = locale || profile.locale || "zh-Hant";
    const localizer = new TmdLocalizer(activeLocale);
    const svg = this.generateSVG(profile, activeLocale);
    const textReport = profile.tonality ? (await_textReport(profile, activeLocale)) : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${this.xmlEscape(localizer.text(TmdLocalizationKey.htmlTitle))} - ${this.xmlEscape(profile.title)}</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #131c2e;
      --border: #233047;
      --text: #f1f5f9;
      --sub: #94a3b8;
      --accent: #38bdf8;
    }
    body {
      margin: 0;
      padding: 24px;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 24px;
    }
    h1 {
      margin: 0 0 8px 0;
      font-size: 26px;
      font-weight: 700;
      color: var(--text);
    }
    .subtitle {
      color: var(--sub);
      font-size: 14px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 24px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    .viz-wrap {
      padding: 16px;
    }
    pre {
      background: #0b1120;
      padding: 20px;
      border-radius: 8px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
      font-size: 13px;
      line-height: 1.5;
      overflow-x: auto;
      color: #cbd5e1;
      border: 1px solid var(--border);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${this.xmlEscape(localizer.text(TmdLocalizationKey.htmlTitle))}</h1>
      <div class="subtitle">${this.xmlEscape(localizer.text(TmdLocalizationKey.htmlSong))}: <strong>${this.xmlEscape(profile.title)}</strong> | ${this.xmlEscape(localizer.text(TmdLocalizationKey.htmlTempo))}: ${profile.initialTempo} BPM | ${this.xmlEscape(localizer.text(TmdLocalizationKey.htmlKey))}: ${profile.initialKey} ${this.xmlEscape(localizer.text(TmdLocalizationKey.major))}</div>
    </header>

    <div class="card">
      <div class="viz-wrap">
        ${svg}
      </div>
    </div>

    <div class="card" style="padding: 20px;">
      <h2 style="font-size: 18px; margin-top:0; color:var(--accent);">${this.xmlEscape(localizer.text(TmdLocalizationKey.htmlDetailedReport))}</h2>
      <pre>${this.xmlEscape(textReport)}</pre>
    </div>
  </div>
</body>
</html>`;
  }

  // MARK: - Private SVG Sub-Renderers

  private static renderCircleOfFifthsSVG(
    tonality: TmdTonalityProfile,
    localizer: TmdLocalizer,
    cx: number,
    cy: number,
    r: number
  ): string {
    const fifthsCircle: { name: string; step: number }[] = [
      { name: "C", step: 0 },
      { name: "G", step: 1 },
      { name: "D", step: 2 },
      { name: "A", step: 3 },
      { name: "E", step: 4 },
      { name: "B", step: 5 },
      { name: "F#", step: 6 },
      { name: "Db", step: -5 },
      { name: "Ab", step: -4 },
      { name: "Eb", step: -3 },
      { name: "Bb", step: -2 },
      { name: "F", step: -1 },
    ];

    const activeSteps = new Set<number>(tonality.sections.map((s) => s.fifthsPosition));

    let s = "\n  <!-- Circle of Fifths -->\n";
    s += `  <text x="${cx}" y="${cy - r - 30}" fill="#e2e8f0" font-size="14" font-weight="600" text-anchor="middle">${this.xmlEscape(localizer.text(TmdLocalizationKey.circleOfFifthsTitle))}</text>\n`;
    s += `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#334155" stroke-width="2" stroke-dasharray="4,4"/>\n`;

    const coordsByStep: Record<number, { x: number; y: number }> = {};
    for (let i = 0; i < fifthsCircle.length; i++) {
      const item = fifthsCircle[i];
      const angle = ((i * 30.0 - 90.0) * Math.PI) / 180.0;
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);
      coordsByStep[item.step] = { x: px, y: py };
    }

    const path = tonality.circleOfFifthsPath;
    if (path.length > 1) {
      let pathData = "";
      for (let idx = 0; idx < path.length; idx++) {
        const pt = coordsByStep[path[idx]];
        if (pt) {
          pathData += idx === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
        }
      }
      s += `  <path d="${pathData}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" opacity="0.8"/>\n`;
    }

    // Draw 12 nodes
    for (let i = 0; i < fifthsCircle.length; i++) {
      const item = fifthsCircle[i];
      const angle = ((i * 30.0 - 90.0) * Math.PI) / 180.0;
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);
      const isActive = activeSteps.has(item.step);

      const fill = isActive ? "url(#nodeActive)" : "#1e293b";
      const stroke = isActive ? "#7dd3fc" : "#475569";
      const textFill = isActive ? "#ffffff" : "#94a3b8";
      const nodeRadius = isActive ? 18 : 13;
      const weight = isActive ? "bold" : "normal";
      const filter = isActive ? ' filter="url(#glow)"' : "";

      s += `  <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${nodeRadius}" fill="${fill}" stroke="${stroke}" stroke-width="2"${filter}/>\n`;
      s += `  <text x="${px.toFixed(1)}" y="${(py + 4.5).toFixed(1)}" fill="${textFill}" font-size="11" font-weight="${weight}" text-anchor="middle">${item.name}</text>\n`;
    }

    return s;
  }

  private static renderRadarChartSVG(
    tonality: TmdTonalityProfile,
    localizer: TmdLocalizer,
    cx: number,
    cy: number,
    r: number
  ): string {
    const pitchClassNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const weights = tonality.globalPitchClasses.weights;
    const maxWeight = Math.max(0.001, ...weights);

    let s = "\n  <!-- Pitch Class Radar Chart -->\n";
    s += `  <text x="${cx}" y="${cy - r - 30}" fill="#e2e8f0" font-size="14" font-weight="600" text-anchor="middle">${this.xmlEscape(localizer.text(TmdLocalizationKey.pitchClassDistributionTitle))}</text>\n`;

    // Concentric web circles
    for (const step of [0.25, 0.5, 0.75, 1.0]) {
      s += `  <circle cx="${cx}" cy="${cy}" r="${r * step}" fill="none" stroke="#1e293b" stroke-width="1"/>\n`;
    }

    // Spokes and labels
    for (let i = 0; i < 12; i++) {
      const angle = ((i * 30.0 - 90.0) * Math.PI) / 180.0;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const labelX = cx + (r + 18) * Math.cos(angle);
      const labelY = cy + (r + 18) * Math.sin(angle) + 4.0;

      s += `  <line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#24324d" stroke-width="1"/>\n`;
      s += `  <text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" fill="#94a3b8" font-size="10" text-anchor="middle">${pitchClassNames[i]}</text>\n`;
    }

    // Polygon points
    const points: string[] = [];
    for (let i = 0; i < 12; i++) {
      const angle = ((i * 30.0 - 90.0) * Math.PI) / 180.0;
      const normalized = weights[i] / maxWeight;
      const dist = r * normalized;
      const px = cx + dist * Math.cos(angle);
      const py = cy + dist * Math.sin(angle);
      points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }

    const polyStr = points.join(" ");
    s += `  <polygon points="${polyStr}" fill="#38bdf8" fill-opacity="0.35" stroke="#38bdf8" stroke-width="2" filter="url(#glow)"/>\n`;

    return s;
  }

  private static renderTimelineRibbonSVG(
    profile: TmdSongProfile,
    localizer: TmdLocalizer,
    x: number,
    y: number,
    width: number,
    height: number
  ): string {
    const sections = profile.timing.sections;
    const totalDuration = Math.max(0.001, profile.timing.totalDurationSeconds);

    let s = "\n  <!-- Section Keyscape Timeline Ribbon -->\n";
    s += `  <text x="${x}" y="${y - 12}" fill="#e2e8f0" font-size="14" font-weight="600">${this.xmlEscape(localizer.text(TmdLocalizationKey.timelineTitle))}</text>\n`;
    s += `  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#1e293b" rx="8"/>\n`;

    const keyColors = [
      "#38bdf8", // C
      "#60a5fa", // G
      "#818cf8", // D
      "#a78bfa", // A
      "#c084fc", // E
      "#e879f9", // B
      "#f472b6", // F#
      "#fb7185", // Db
      "#f87171", // Ab
      "#fb923c", // Eb
      "#fbbf24", // Bb
      "#34d399", // F
    ];

    let currentX = x;
    for (let idx = 0; idx < sections.length; idx++) {
      const sec = sections[idx];
      const secWidth = (sec.durationSeconds / totalDuration) * width;
      const colorIdx = ((sec.keyOffset % 12) + 12) % 12;
      const color = keyColors[colorIdx];

      s += `  <rect x="${currentX.toFixed(1)}" y="${y}" width="${secWidth.toFixed(1)}" height="${height}" fill="${color}" fill-opacity="0.85" stroke="#0f172a" stroke-width="1.5" rx="4"/>\n`;
      if (secWidth > 40) {
        const textX = currentX + secWidth / 2.0;
        let keyLabel = `${sec.keyOffset}`;
        if (profile.tonality && idx < profile.tonality.sections.length) {
          const section = profile.tonality.sections[idx];
          keyLabel = section.inferredTonality.tonic
            ? `${section.inferredTonality.tonic} ${this.modeLabel(section.inferredTonality.mode, localizer)}`
            : localizer.text(TmdLocalizationKey.visualizerAmbiguous);
        }
        s += `  <text x="${textX.toFixed(1)}" y="${(y + height / 2 + 5).toFixed(1)}" fill="#ffffff" font-size="11" font-weight="bold" text-anchor="middle">${this.xmlEscape(sec.name)} [${keyLabel}]</text>\n`;
      }
      currentX += secWidth;
    }

    return s;
  }

  private static xmlEscape(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private static modeLabel(mode: TmdTonalityProfile["globalInference"]["mode"], localizer: TmdLocalizer): string {
    switch (mode) {
    case "major": return localizer.text(TmdLocalizationKey.major);
    case "minor": return localizer.text(TmdLocalizationKey.minor);
    case "ambiguous": return localizer.text(TmdLocalizationKey.modeAmbiguous);
    case "modal": return localizer.text(TmdLocalizationKey.modeModal);
    case "insufficient": return localizer.text(TmdLocalizationKey.modeInsufficient);
    }
  }
}

function await_textReport(profile: TmdSongProfile, locale: TmdLocale): string {
  // Direct helper calling TmdSongInspector.generateReport
  return TmdSongInspector.generateReport(profile, locale);
}
