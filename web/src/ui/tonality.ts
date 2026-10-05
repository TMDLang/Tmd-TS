import { TMDLocale, TMDSectionTimingProfile, TMDSongInspector,TMDTonalityProfile } from "../../../src/analysis/inspector.js";
import { TMDLocalizationKey, TMDLocalizer } from "../../../src/core/localization.js";
import { escapeHtml } from "../html.js";
import { en } from "../locales/en.js";
import { zhTW } from "../locales/zh-TW.js";

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KEY_OFFSETS: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};
const SOLFEGE: Record<number, string> = { 0: "Do", 2: "Re", 4: "Mi", 5: "Fa", 7: "Sol", 9: "La", 11: "Ti" };

type TonalityLabelKey =
  | "tonalityStabilityHigh" | "tonalityStabilityModerate" | "tonalityStabilityAmbiguous" | "tonalityStabilityInsufficient"
  | "tonalityMoodLabel" | "tonalityModulationLabel" | "tonalityPitchDistribution"
  | "tonalityStructureTimeline" | "tonalityDetailedAnalysis"
  | "tonalityCorrelation" | "tonalityDiatonicPurity" | "tonalityDiatonicChromatic"
  | "tonalityBestFitKeys" | "tonalityCircleOfFifths" | "tonalityInferred" | "tonalityConfidence"
  | "tonalityPlaybackContext" | "tonalityAmbiguous" | "tonalityDeclaredKey";


function label(locale: TMDLocale, key: TonalityLabelKey, fallback: string): string {
  const dictionary = locale === "zh-Hant" || locale === "zh-TW" ? zhTW : en;
  return dictionary[key] || fallback;
}

function stabilityLabel(stability: string, locale: TMDLocale): string {
  const key = stability === "high"
    ? "tonalityStabilityHigh"
    : stability === "moderate" ? "tonalityStabilityModerate" : stability === "insufficient" ? "tonalityStabilityInsufficient" : "tonalityStabilityAmbiguous";
  return label(locale, key, stability);
}

function modeLabel(mode: TMDTonalityProfile["globalInference"]["mode"], locale: TMDLocale): string {
  const localizer = new TMDLocalizer(locale);
  switch (mode) {
  case "major": return localizer.text(TMDLocalizationKey.major);
  case "minor": return localizer.text(TMDLocalizationKey.minor);
  case "ambiguous": return localizer.text(TMDLocalizationKey.modeAmbiguous);
  case "modal": return localizer.text(TMDLocalizationKey.modeModal);
  case "insufficient": return localizer.text(TMDLocalizationKey.modeInsufficient);
  }
}

/**
 * Renders the inspector-level tonality panel shared conceptually with the VSCode webview.
 * The output intentionally keeps the same information hierarchy: diagnosis, histogram,
 * and expandable theoretical details.
 */
export function renderTonalityProfileHtml(
  tonality: TMDTonalityProfile,
  locale: TMDLocale = "en",
  timingSections: TMDSectionTimingProfile[] = []
): string {
  const stability = tonality.globalInference.stability || "insufficient";
  const stabilityClass = stability === "high" ? "valid" : stability === "moderate" ? "warn" : "error";
  const diatonicPct = (tonality.globalPitchClasses.diatonicRatio * 100).toFixed(1);
  const correlation = tonality.globalInference.bestCorrelation.toFixed(2);
  const candidates = (tonality.globalInference.topCandidates || [])
    .slice(0, 3)
    .map((candidate) => `${escapeHtml(`${candidate.tonic} ${modeLabel(candidate.mode, locale)}`)} (${candidate.correlation.toFixed(2)})`)
    .join(", ");
  const fifthsPath = (tonality.circleOfFifthsPath || [])
    .map((position) => (position >= 0 ? `+${position}` : `${position}`))
    .join(" → ");

  const rootName = tonality.globalInference.tonic || "C";
  const rootOffset = KEY_OFFSETS[rootName] ?? 0;
  const weights = tonality.globalPitchClasses.weights || [];
  const maxWeight = Math.max(0.001, ...weights);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;

  const bars = PITCH_NAMES.map((pitchName, index) => {
    const weight = weights[index] || 0;
    const barPercent = ((weight / maxWeight) * 100).toFixed(1);
    const weightPercent = ((weight / totalWeight) * 100).toFixed(0);
    const degreeOffset = (index - rootOffset + 12) % 12;
    const solfege = SOLFEGE[degreeOffset] || "•";
    const diatonic = SOLFEGE[degreeOffset] !== undefined;
    return `<div class="pitch-bar-col" title="${escapeHtml(`${pitchName} (${solfege}): ${weightPercent}% (${weight.toFixed(1)} beats)`)}">
      <div class="pitch-bar-fill-wrap"><div class="pitch-bar-fill${diatonic ? "" : " fill-chromatic"}" style="height: ${barPercent}%;"></div></div>
      <div class="pitch-bar-label">${pitchName}</div>
      <div class="pitch-degree-label ${diatonic ? "degree-diatonic" : "degree-chromatic"}">${solfege}</div>
    </div>`;
  }).join("");

  const narrative = TMDSongInspector.localizeTonalityNarrative(tonality, locale);
  const summary = narrative.summaryText || `${rootName} ${modeLabel(tonality.globalInference.mode, locale)}`;
  const mood = narrative.moodDescription || (tonality.globalPitchClasses.diatonicRatio >= 0.95
    ? label(locale, "tonalityMoodLabel", "Musical Character & Mood")
    : label(locale, "tonalityMoodLabel", "Musical Character & Mood"));
  const journey = narrative.modulationStory || "";
  const timeline = timingSections.length > 0
    ? `<div class="tonality-timeline">
        <div class="stat-label">${escapeHtml(label(locale, "tonalityStructureTimeline", "Structure & Conductor Timeline"))}</div>
        <div class="timeline-bar-wrapper tonality-timeline-bar">${timingSections.map((section, index) => {
          const width = timingSections.reduce((sum, item) => sum + item.durationSeconds, 0) > 0
            ? Math.max(4, section.durationSeconds / timingSections.reduce((sum, item) => sum + item.durationSeconds, 0) * 100)
            : 100 / timingSections.length;
          return `<button type="button" class="timeline-segment" data-tonality-section="${escapeHtml(section.name)}" style="width: ${width.toFixed(2)}%;" title="${escapeHtml(`${section.name} · ${section.durationSeconds.toFixed(1)}s · ${section.measures}m`)}"><span>${index + 1}</span></button>`;
        }).join("")}</div>
        <div class="tonality-timeline-list">${timingSections.map((section, index) => {
          const tonalSection = tonality.sections[index];
          return `<button type="button" class="timeline-item tonality-timeline-item" data-tonality-section="${escapeHtml(section.name)}">
            <span class="timeline-item-index">#${index + 1}</span>
            <span class="timeline-item-name">${escapeHtml(section.name)}${tonalSection ? ` · ${escapeHtml(tonalSection.inferredTonality.tonic ? `${tonalSection.inferredTonality.tonic} ${modeLabel(tonalSection.inferredTonality.mode, locale)}` : label(locale, "tonalityAmbiguous", "ambiguous"))}` : ""}</span>
            <span class="timeline-item-time">${section.durationSeconds.toFixed(1)}s (${section.measures}m)</span>
          </button>`;
        }).join("")}</div>
      </div>`
    : "";

  return `<div class="tonality-profile" data-tonality-profile>
    <div class="tonality-profile-header">
      <div class="producer-headline"><span class="producer-icon">🎵</span><span class="producer-title">${escapeHtml(summary)}</span></div>
      <span id="tonality-stability-badge" class="tonality-stability-badge ${stabilityClass}">${escapeHtml(stabilityLabel(stability, locale))}</span>
    </div>
    <div class="producer-detail-item"><span class="producer-label">${escapeHtml(label(locale, "tonalityMoodLabel", "Musical Character & Mood"))}:</span> <span class="producer-value">${escapeHtml(mood)}</span></div>
    <div class="producer-detail-item"><span class="producer-label">${escapeHtml(label(locale, "tonalityModulationLabel", "Modulation Journey"))}:</span> <span class="producer-value">${escapeHtml(journey)}</span></div>

    ${timeline}

    <div class="tonality-histogram-wrap">
      <div class="stat-label">${escapeHtml(label(locale, "tonalityPitchDistribution", "12-Tone Pitch Class Weight Distribution"))}</div>
      <div class="pitch-bar-chart">${bars}</div>
    </div>

    <details class="tonality-advanced-details">
      <summary class="tonality-advanced-summary">${escapeHtml(label(locale, "tonalityDetailedAnalysis", "Detailed Theoretical Analysis"))}</summary>
      <div class="tonality-details-content">
        <div class="tonality-summary-row">
          <div class="tonality-stat-box"><span class="stat-label">${escapeHtml(label(locale, "tonalityInferred", "Inferred Tonality"))}</span><span class="stat-value">${escapeHtml(`${rootName} ${modeLabel(tonality.globalInference.mode, locale)}`)}</span><span class="stat-sub">${escapeHtml(label(locale, "tonalityConfidence", "Confidence"))}: ${(tonality.globalInference.confidence * 100).toFixed(0)}% · ${escapeHtml(label(locale, "tonalityCorrelation", "Correlation"))}: ${correlation}</span></div>
          <div class="tonality-stat-box"><span class="stat-label">${escapeHtml(label(locale, "tonalityDiatonicPurity", "Diatonic Purity"))}</span><span class="stat-value">${diatonicPct}%</span><span class="stat-sub">${escapeHtml(label(locale, "tonalityDiatonicChromatic", "Diatonic / Chromatic"))}</span></div>
        </div>
        ${tonality.declaredKey ? `<div class="pitch-metric-row"><span class="stat-label">${escapeHtml(label(locale, "tonalityDeclaredKey", "Declared Tonality"))}</span><span class="pitch-metric-value mono">${escapeHtml(tonality.declaredKey)}</span></div>` : ""}
        ${candidates ? `<div class="pitch-metric-row"><span class="stat-label">${escapeHtml(label(locale, "tonalityBestFitKeys", "Best Fit Tonalities (K-S)"))}</span><span class="pitch-metric-value">${candidates}</span></div>` : ""}
        <div class="pitch-metric-row"><span class="stat-label">${escapeHtml(label(locale, "tonalityPlaybackContext", "Playback Context"))}</span><span class="pitch-metric-value mono">${escapeHtml(`${tonality.playbackContext.movableDoBase} · ${tonality.playbackTranspositionPath.join(" → ") || "+0"}`)}</span></div>
        ${fifthsPath ? `<div class="pitch-metric-row"><span class="stat-label">${escapeHtml(label(locale, "tonalityCircleOfFifths", "Circle of Fifths Trajectory"))}</span><span class="pitch-metric-value mono">${escapeHtml(fifthsPath)}</span></div>` : ""}
      </div>
    </details>
  </div>`;
}
