import { SheetInstrumentHelper } from "./instruments.js";
import { TMDMacroEvaluator } from "./macro.js";
import { PlaybackDirectiveEvent,PlaybackEvent, PlaybackState, TMDPlaybackRenderer } from "./playback.js";
import {
  chordQualityIntervals,
  ChordSymbol,
  DEFAULT_TEMPO_BPM,
  Entry,
  KeySignature,
  noteToMIDIPitch,
  Playback,
  ScaleDegree,
  scaleDegreeLetter,
  Sheet,
} from "./types.js";
export type { TMDLocale } from "./localization.js";
export { TMDLocalizationKey,TMDLocalizer } from "./localization.js";
import { TMDSongHarmonyAnalyzer } from "./harmony_analyzer.js";
import type { TMDLocale } from "./localization.js";
import { TMDLocalizationKey, TMDLocalizer } from "./localization.js";
import { TMDSongPitchRangeAnalyzer } from "./pitch_range_analyzer.js";
import { TMDSongTimingAnalyzer } from "./timing_analyzer.js";
import { TMDSongTonalityAnalyzer } from "./tonality_analyzer.js";

/**
 * Pitch descriptor with MIDI note number, canonical note name (e.g. "C4", "A5"), and source section context.
 */
export interface TMDNotePitchInfo {
  midiPitch: number;
  noteName: string;
  sectionName: string;
  timelinePosition: number;
  sectionOccurrence: number;
  measure: number;
  timeSeconds: number;
}

export namespace TMDNotePitchInfo {
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  /**
   * Converts MIDI note number (0~127) to standard note name string (e.g. 60 -> "C4", 69 -> "A4").
   */
  export function name(midiPitch: number): string {
    const octave = Math.floor(midiPitch / 12) - 1;
    const noteIndex = ((midiPitch % 12) + 12) % 12;
    return `${NOTE_NAMES[noteIndex]}${octave}`;
  }
}

export type PitchRangeDifficulty = "easy" | "moderate" | "challenging" | "difficult";

export type VocalClassification = "soprano" | "mezzo-soprano" | "contralto" | "tenor" | "baritone" | "bass";

/**
 * Vocal or instrument pitch range and tessitura summary.
 */
export interface TMDPitchRangeProfile {
  /** Canonical assignment represented by this pitch profile. */
  assignment: string;
  lowestNote: TMDNotePitchInfo;
  highestNote: TMDNotePitchInfo;
  spanSemitones: number;
  spanOctaves: number;
  totalNotes: number;
  averageMidiPitch: number;
  difficulty: PitchRangeDifficulty;
  suitableVoiceTypes: VocalClassification[];
}

/**
 * Timing span descriptor for a section in the song's playback timeline.
 */
export interface TMDSectionTimingProfile {
  name: string;
  orderIndex: number;
  occurrenceIndex: number;
  startMeasure: number;
  startPositionQuarterNotes: number;
  durationQuarterNotes: number;
  startSeconds: number;
  durationSeconds: number;
  measures: number;
  keyOffset: number;
  tempo: number;
}

/**
 * Song playback timeline timing and duration breakdown.
 */
export interface TMDTimingProfile {
  totalDurationSeconds: number;
  totalMeasures: number;
  sections: TMDSectionTimingProfile[];
}

/**
 * Harmonic content and progression analysis.
 */
export interface TMDHarmonyProfile {
  distinctChords: string[];
  chordCount: number;
  modulations: string[];
}

/**
 * Section arrangement density descriptor.
 */
export interface TMDSectionDensity {
  sectionName: string;
  trackCount: number;
  instruments: string[];
}

/**
 * Arrangement orchestration and concurrent track layering density.
 */
export interface TMDArrangementDensityProfile {
  maxConcurrentTracks: number;
  sectionDensities: TMDSectionDensity[];
}

/**
 * Distribution of the 12 chromatic pitch classes across a section or entire score.
 */
export interface TMDPitchClassDistribution {
  /** Accumulated quarter-note duration weights for each pitch class (0: C, 1: C#, ..., 11: B). */
  weights: number[];
  /** Ratio of diatonic notes to total pitch weight (0.0 ~ 1.0). */
  diatonicRatio: number;
  /** Ratio of non-diatonic (chromatic) notes to total pitch weight (0.0 ~ 1.0). */
  chromaticRatio: number;
  /** Prominent pitch classes ordered by descending weight (e.g. ["C", "G", "E"]). */
  topPitchClasses: string[];
}

export type TMDTonalityMode = "major" | "minor" | "modal" | "ambiguous" | "insufficient";
export type TMDScaleFamily = "major" | "naturalMinor" | "harmonicMinor" | "melodicMinor" | "modal" | "chromatic" | "unknown";
export type TMDKeyStability = "high" | "moderate" | "ambiguous" | "insufficient";

export interface TMDTonalityCandidate {
  tonic: string;
  mode: "major" | "minor";
  scaleFamily: TMDScaleFamily;
  correlation: number;
}

export interface TMDTonalityEvidence {
  noteWeight: number;
  chordWeight: number;
}

export interface TMDTonalityInference {
  tonic: string | null;
  mode: TMDTonalityMode;
  scaleFamily: TMDScaleFamily;
  confidence: number;
  margin: number;
  stability: TMDKeyStability;
  bestCorrelation: number;
  topCandidates: TMDTonalityCandidate[];
  evidence: TMDTonalityEvidence;
}

export interface TMDPlaybackContext {
  movableDoBase: string;
  transpositionOffset: number;
  fixedPitch: boolean;
}

/**
 * Tonality and pitch-class distribution metrics for an individual section.
 */
export interface TMDSectionTonalityProfile {
  sectionName: string;
  occurrenceIndex: number;
  playbackContext: TMDPlaybackContext;
  fifthsPosition: number;
  pitchClasses: TMDPitchClassDistribution;
  inferredTonality: TMDTonalityInference;
  nonDiatonicNotes: string[];
}

export type TMDTonalityMood = "cleanMajor" | "contemporaryMajor" | "cleanMinor" | "contemporaryMinor" | "modal" | "insufficient";

export interface TMDTonalityNarrative {
  tonic: string;
  mood: TMDTonalityMood;
  transitions: Array<{
    sectionName: string;
    tonic: string;
    mode: "major" | "minor";
    semitoneDiff: number;
    fifthsStepDiff: number;
  }>;
}

/**
 * Holistic tonality profile across sections and the full song.
 */
export interface TMDTonalityProfile {
  globalPitchClasses: TMDPitchClassDistribution;
  globalInference: TMDTonalityInference;
  /** Explicit `key=` declaration, distinct from movable-do playback context. */
  declaredKey?: string;
  playbackContext: TMDPlaybackContext;
  playbackTranspositionPath: number[];
  inferredModulationPath: TMDTonalityNarrative["transitions"];
  circleOfFifthsPath: number[];
  sections: TMDSectionTonalityProfile[];
  summaryText: string;
  moodDescription: string;
  modulationStory: string;
  narrative?: TMDTonalityNarrative;
  locale: TMDLocale;
}

/**
 * Complete structural, vocal range, harmonic, and temporal profile of a TMD score.
 */
export interface TMDSongProfile {
  title: string;
  initialTempo: number;
  initialKey: string;
  initialTimeSignature: string;
  timing: TMDTimingProfile;
  vocalRange?: TMDPitchRangeProfile;
  instrumentRanges: TMDPitchRangeProfile[];
  harmony: TMDHarmonyProfile;
  density: TMDArrangementDensityProfile;
  tonality?: TMDTonalityProfile;
  locale?: TMDLocale;
}

/**
 * Inspector engine extracting holistic musical metrics, vocal tessitura, and arrangement profiles from a TMD Sheet.
 * Ported faithfully from TmdSwift.
 */
export class TMDSongInspector {
  // Krumhansl-Schmuckler 12-pitch-class profiles for Major and Minor
  private static readonly KS_MAJOR_PROFILE: number[] = [
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88
  ];
  private static readonly KS_MINOR_PROFILE: number[] = [
    6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17
  ];

  /**
   * Inspects a parsed TMD Sheet and produces an in-depth TMDSongProfile.
   */
  public static inspect(
    sheet: Sheet,
    targetInstrument?: string,
    locale: TMDLocale = "zh-Hant"
  ): TMDSongProfile {
    const effectiveSheet = TMDMacroEvaluator.expandThrowing(sheet);
    const title = effectiveSheet.name || "Untitled";
    const initialTempo = effectiveSheet.speed && effectiveSheet.speed > 0 ? effectiveSheet.speed : DEFAULT_TEMPO_BPM;
    const initialKey = effectiveSheet.keySignature ? effectiveSheet.keySignature.toString() : "C";
    const initialMeter = effectiveSheet.beat ? `${effectiveSheet.beat.count}/${effectiveSheet.beat.noteValue}` : "4/4";

    // 1. Timing Profile
    const timelineDirectives = this.collectTimelineDirectives(effectiveSheet);
    const timingProfile = this.buildTimingProfile(effectiveSheet, timelineDirectives);

    // 2. Instrument Ranges
    const distinctInsts = SheetInstrumentHelper.distinctInstruments(effectiveSheet, false);
    const instrumentRanges: TMDPitchRangeProfile[] = [];
    for (const inst of distinctInsts) {
      const profile = this.buildPitchProfile(inst, effectiveSheet, timingProfile, timelineDirectives);
      if (profile) {
        instrumentRanges.push(profile);
      }
    }

    // 3. Target Range (picks target instrument or auto resolves)
    const targetInst = targetInstrument && distinctInsts.includes(targetInstrument)
      ? targetInstrument
      : SheetInstrumentHelper.resolveVocalInstrument(effectiveSheet);
    const vocalRange = instrumentRanges.find((r) => r.assignment === targetInst);

    // 4. Harmony & Chord Profile
    const harmonyProfile = this.buildHarmonyProfile(effectiveSheet);

    // 5. Arrangement & Density Profile
    const densityProfile = this.buildDensityProfile(effectiveSheet);

    // 6. Tonality & Pitch-Class Profile
    const tonality = this.buildTonalityProfile(effectiveSheet, timingProfile, locale);

    return {
      title,
      initialTempo,
      initialKey,
      initialTimeSignature: initialMeter,
      timing: timingProfile,
      vocalRange,
      instrumentRanges,
      harmony: harmonyProfile,
      density: densityProfile,
      tonality,
      locale,
    };
  }

  private static buildTimingProfile(sheet: Sheet, timelineDirectives: PlaybackDirectiveEvent[]): TMDTimingProfile {
    return TMDSongTimingAnalyzer.analyze(sheet, timelineDirectives);
  }

  private static buildPitchProfile(
    instrument: string,
    sheet: Sheet,
    timingProfile: TMDTimingProfile,
    timelineDirectives: PlaybackDirectiveEvent[]
  ): TMDPitchRangeProfile | null {
    return TMDSongPitchRangeAnalyzer.analyze(instrument, sheet, timingProfile, timelineDirectives);

  }

  private static collectTimelineDirectives(sheet: Sheet): PlaybackDirectiveEvent[] {
    const instruments = new Set(sheet.entries.map((paragraph) => paragraph.assignment).filter((instrument): instrument is string => Boolean(instrument && instrument.trim().length > 0)));
    const directives: PlaybackDirectiveEvent[] = [];
    for (const instrument of instruments) {
      directives.push(...TMDPlaybackRenderer.render(sheet, instrument).directives);
    }
    return directives
      .sort((a, b) => a.position - b.position)
      .filter((directive, index, all) => {
        const previous = all[index - 1];
        return !previous || previous.position !== directive.position || previous.state.tempo !== directive.state.tempo || previous.state.timeSignature.count !== directive.state.timeSignature.count || previous.state.timeSignature.noteValue !== directive.state.timeSignature.noteValue;
      });
  }

  private static measureDuration(beat: { count: number; noteValue: number }): number {
    return Math.max(1, beat.count) * 4 / Math.max(1, beat.noteValue);
  }

  public static evaluateDifficulty(spanSemitones: number): PitchRangeDifficulty {
    return TMDSongPitchRangeAnalyzer.evaluateDifficulty(spanSemitones);
  }

  public static evaluateSuitableVoiceTypes(lowestMidi: number, highestMidi: number): VocalClassification[] {
    return TMDSongPitchRangeAnalyzer.evaluateSuitableVoiceTypes(lowestMidi, highestMidi);
  }

  private static buildHarmonyProfile(sheet: Sheet): TMDHarmonyProfile {
    return TMDSongHarmonyAnalyzer.analyze(sheet);
  }

  private static buildDensityProfile(sheet: Sheet): TMDArrangementDensityProfile {
    const sectionDict: Record<string, string[]> = {};
    for (const p of sheet.entries) {
      const assignment = p.assignment;
      if (!assignment) continue;
      if (!assignment.trim()) continue;
      if (!sectionDict[p.name]) {
        sectionDict[p.name] = [];
      }
      sectionDict[p.name].push(assignment);
    }

    const sectionDensities: TMDSectionDensity[] = [];
    let maxTracks = 0;

    for (const [secName, instList] of Object.entries(sectionDict)) {
      const uniqueInst = Array.from(new Set(instList)).sort();
      if (uniqueInst.length > maxTracks) {
        maxTracks = uniqueInst.length;
      }
      sectionDensities.push({
        sectionName: secName,
        trackCount: uniqueInst.length,
        instruments: uniqueInst,
      });
    }

    sectionDensities.sort((a, b) => a.sectionName.localeCompare(b.sectionName));

    return {
      maxConcurrentTracks: maxTracks,
      sectionDensities,
    };
  }

  private static formatNoteLocation(note: TMDNotePitchInfo): string {
    const mins = Math.floor(note.timeSeconds / 60);
    const secs = Math.floor(note.timeSeconds % 60);
    const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;
    if (note.sectionName && note.sectionName.length > 0) {
      return `[${note.sectionName} #${note.sectionOccurrence} @ m.${note.measure}, ${timeStr}]`;
    } else {
      return `[@ m.${note.measure}, ${timeStr}]`;
    }
  }

  // MARK: - Tonality & Key Profile Analysis Engine

  private static buildTonalityProfile(
    sheet: Sheet,
    timingProfile: TMDTimingProfile,
    locale: TMDLocale
  ): TMDTonalityProfile {
    return TMDSongTonalityAnalyzer.analyze(sheet, timingProfile, locale);
  }

  private static modeLabel(mode: TMDTonalityMode, localizer: TMDLocalizer): string {
    return TMDSongTonalityAnalyzer.modeLabel(mode, localizer);
  }

  public static localizeTonalityNarrative(
    tonality: TMDTonalityProfile,
    locale: TMDLocale,
  ): Pick<TMDTonalityProfile, "summaryText" | "moodDescription" | "modulationStory"> {
    return TMDSongTonalityAnalyzer.localizeTonalityNarrative(tonality, locale);
  }

  /**
   * Generates a human-readable plain text / ASCII inspection report.
   */
  public static generateReport(profile: TMDSongProfile, locale?: TMDLocale): string {
    const activeLocale = locale || profile.locale || "zh-Hant";
    const localizer = new TMDLocalizer(activeLocale);
    const localizedTonality = profile.tonality
      ? this.localizeTonalityNarrative(profile.tonality, activeLocale)
      : undefined;
    const mins = Math.floor(profile.timing.totalDurationSeconds / 60);
    const secs = Math.floor(profile.timing.totalDurationSeconds % 60);
    const timeFormatted = `${mins}:${secs.toString().padStart(2, "0")} (${profile.timing.totalDurationSeconds.toFixed(1)}s)`;

    const lines: string[] = [];
    lines.push("================================================================================");
    lines.push(`📊 ${localizer.text(TMDLocalizationKey.reportTitle)}: [ ${profile.title} ]`);
    lines.push("================================================================================");
    lines.push(`⏱  ${localizer.text(TMDLocalizationKey.duration)}:       ${timeFormatted}, ${profile.timing.totalMeasures} ${localizer.text(TMDLocalizationKey.measuresTotal)}`);
    lines.push(
      `🎼 ${localizer.text(TMDLocalizationKey.keyAndTempo)}:    ${localizer.text(TMDLocalizationKey.playbackBase)} ${profile.initialKey}, != ${profile.initialTempo} BPM, <${profile.initialTimeSignature}>`
    );
    lines.push(`   - ${localizer.text(TMDLocalizationKey.analysisScope)}`);

    if (profile.vocalRange) {
      const vocal = profile.vocalRange;
      const octaves = vocal.spanOctaves.toFixed(1);
      lines.push(
        `🎤 ${localizer.text(TMDLocalizationKey.vocalRange)}:    ${vocal.lowestNote.noteName} (MIDI ${vocal.lowestNote.midiPitch}) – ${vocal.highestNote.noteName} (MIDI ${vocal.highestNote.midiPitch}) [${localizer.text(TMDLocalizationKey.span)}: ${vocal.spanSemitones} ${localizer.text(TMDLocalizationKey.semitones)} / ${octaves} ${localizer.text(TMDLocalizationKey.octaves)}, ${localizer.text(TMDLocalizationKey.difficulty)}: ${vocal.difficulty}]`
      );
      lines.push(`   - ${localizer.text(TMDLocalizationKey.lowestNote)}:  ${vocal.lowestNote.noteName} in ${TMDSongInspector.formatNoteLocation(vocal.lowestNote)}`);
      lines.push(`   - ${localizer.text(TMDLocalizationKey.highestNote)}: ${vocal.highestNote.noteName} in ${TMDSongInspector.formatNoteLocation(vocal.highestNote)}`);
      if (vocal.suitableVoiceTypes.length > 0) {
        lines.push(`   - ${localizer.text(TMDLocalizationKey.suitableFor)}: ${vocal.suitableVoiceTypes.join(", ")}`);
      }
    }

    lines.push(
      `🏛  ${localizer.text(TMDLocalizationKey.structure)}:      ` +
        profile.timing.sections
          .map((s) => `${s.name} (${s.durationSeconds.toFixed(1)}s)`)
          .join(" -> ")
    );
    lines.push(`⚡ ${localizer.text(TMDLocalizationKey.density)}:        Peak ${profile.density.maxConcurrentTracks} ${localizer.text(TMDLocalizationKey.tracksConcurrently)}`);

    if (profile.harmony.distinctChords.length > 0) {
      lines.push(`🎹 ${localizer.text(TMDLocalizationKey.harmony)}:        ` + profile.harmony.distinctChords.join(" "));
    }

    if (profile.tonality) {
      const tonality = profile.tonality;
      const stabStr = tonality.globalInference.stability.charAt(0).toUpperCase() + tonality.globalInference.stability.slice(1);
      const corrStr = tonality.globalInference.bestCorrelation.toFixed(2);
      const diatonicPct = `${(tonality.globalPitchClasses.diatonicRatio * 100.0).toFixed(1)}%`;
      const topPitches = tonality.globalPitchClasses.topPitchClasses.slice(0, 5).join(", ");

      lines.push(`🗝  ${localizer.text(TMDLocalizationKey.tonalityDiagnosis)}       ${localizedTonality?.summaryText ?? tonality.summaryText}`);
      lines.push(`   - ${localizer.text(TMDLocalizationKey.mood)}:    ${localizedTonality?.moodDescription ?? tonality.moodDescription}`);
      lines.push(`   - ${localizer.text(TMDLocalizationKey.modulationJourney)}:    ${localizedTonality?.modulationStory ?? tonality.modulationStory}`);
      lines.push(`   - ${localizer.text(TMDLocalizationKey.tonalCore)}:  ${topPitches}`);
      lines.push(
        `   - ${localizer.text(TMDLocalizationKey.tonalMetrics)}:    ${tonality.globalInference.tonic ?? "?"} ${this.modeLabel(tonality.globalInference.mode, localizer)} [${localizer.text(TMDLocalizationKey.correlation)}: ${corrStr}, ${localizer.text(TMDLocalizationKey.stability)}: ${stabStr}, ${localizer.text(TMDLocalizationKey.diatonicPurity)}: ${diatonicPct}]`
      );

      const candidateStr = tonality.globalInference.topCandidates
        .slice(0, 3)
        .map((c) => `${c.tonic} ${this.modeLabel(c.mode, localizer)} (${c.correlation.toFixed(2)})`)
        .join(", ");
      if (candidateStr.length > 0) {
        lines.push(`   - ${localizer.text(TMDLocalizationKey.candidateKeys)}: ${candidateStr}`);
      }

      const pathStr = tonality.circleOfFifthsPath
        .map((step) => `${step >= 0 ? "+" : ""}${step}`)
        .join(" -> ");
      if (pathStr.length > 0) {
        lines.push(`   - ${localizer.text(TMDLocalizationKey.circleOfFifths)}:   ${pathStr}`);
      }

      if (tonality.sections.length > 0) {
        lines.push(`   - ${localizer.text(TMDLocalizationKey.sectionDetails)}:`);
        for (const sec of tonality.sections) {
          const secCorr = sec.inferredTonality.bestCorrelation.toFixed(2);
          const secDiatonic = `${(sec.pitchClasses.diatonicRatio * 100.0).toFixed(1)}%`;
          let secLine = `     • [${sec.sectionName} #${sec.occurrenceIndex}]: ${sec.inferredTonality.tonic ?? "?"} ${this.modeLabel(sec.inferredTonality.mode, localizer)} (r: ${secCorr}, ${localizer.text(TMDLocalizationKey.diatonicPurity)}: ${secDiatonic}`;
          if (sec.nonDiatonicNotes.length > 0) {
            secLine += `, ${localizer.text(TMDLocalizationKey.nonDiatonic)}: ${sec.nonDiatonicNotes.join(", ")}`;
          }
          secLine += ")";
          lines.push(secLine);
        }
      }

      // ASCII Visualizations
      lines.push("");
      lines.push(`  [ ${localizer.text(TMDLocalizationKey.circleOfFifthsTitle)} ]`);
      lines.push(this.renderAsciiCircleOfFifths(tonality));
      lines.push("");
      lines.push(`  [ ${localizer.text(TMDLocalizationKey.pitchClassDistributionTitle)} ]`);
      lines.push(this.renderPitchClassHistogram(tonality));
    }

    lines.push("--------------------------------------------------------------------------------");
    lines.push(localizer.text(TMDLocalizationKey.instrumentRanges));
    for (const inst of profile.instrumentRanges) {
      const padded = inst.assignment.padEnd(14, " ");
      const octaves = inst.spanOctaves.toFixed(1);
      lines.push(
        `  - ${padded}: ${inst.lowestNote.noteName} – ${inst.highestNote.noteName} (${inst.spanSemitones} ${localizer.text(TMDLocalizationKey.semitones)} / ${octaves} ${localizer.text(TMDLocalizationKey.octaves)}, ${inst.totalNotes} ${localizer.text(TMDLocalizationKey.notes)})`
      );
    }
    lines.push("================================================================================");

    return lines.join("\n");
  }

  private static renderAsciiCircleOfFifths(tonality: TMDTonalityProfile): string {
    const activeSteps = new Set<number>(tonality.sections.map((sec) => sec.fifthsPosition));

    function node(name: string, step: number): string {
      const padded = name.padEnd(2, " ");
      return activeSteps.has(step) ? `[${padded}]*` : ` ${padded} `;
    }

    const c = node("C", 0);
    const g = node("G", 1);
    const d = node("D", 2);
    const a = node("A", 3);
    const e = node("E", 4);
    const b = node("B", 5);
    const fs = node("F#", 6);
    const db = node("Db", -5);
    const ab = node("Ab", -4);
    const eb = node("Eb", -3);
    const bb = node("Bb", -2);
    const f = node("F", -1);

    const lines: string[] = [];
    lines.push(`              ${c}`);
    lines.push(`        ${f}         ${g}`);
    lines.push(`     ${bb}             ${d}`);
    lines.push(`     ${eb}             ${a}`);
    lines.push(`        ${ab}         ${e}`);
    lines.push(`           ${db}     ${b}`);
    lines.push(`              ${fs}`);
    lines.push("     (* = active key center)");
    return lines.join("\n");
  }

  private static renderPitchClassHistogram(tonality: TMDTonalityProfile): string {
    const pitchClassNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const weights = tonality.globalPitchClasses.weights;
    const maxWeight = Math.max(...weights);
    if (maxWeight <= 0.0001) return "     (no pitch data)";

    const barMaxWidth = 24;
    const totalWeight = weights.reduce((acc, w) => acc + w, 0.0) + 1e-9;
    const lines: string[] = [];
    for (let pc = 0; pc < 12; pc++) {
      const w = weights[pc];
      const ratio = w / maxWeight;
      const barLen = Math.round(ratio * barMaxWidth);
      const bar = "█".repeat(barLen).padEnd(barMaxWidth, " ");
      const name = pitchClassNames[pc].padEnd(3, " ");
      const pct = `${((w / totalWeight) * 100.0).toFixed(1)}%`.padStart(6, " ");
      lines.push(`     ${name}: ${bar} ${pct}`);
    }
    return lines.join("\n");
  }
}
