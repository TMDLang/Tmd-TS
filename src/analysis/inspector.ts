import { SheetInstrumentHelper } from "../domain/instruments.js";
import { TmdMacroEvaluator } from "../playback/macro.js";
import { PlaybackDirectiveEvent,PlaybackEvent, PlaybackState, TmdPlaybackRenderer } from "../playback/playback.js";
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
} from "../syntax/types.js";
export type { TmdLocale } from "./localization.js";
export { TmdLocalizationKey,TmdLocalizer } from "./localization.js";
import { TmdSongHarmonyAnalyzer } from "./harmony_analyzer.js";
import type { TmdLocale } from "./localization.js";
import { TmdLocalizationKey, TmdLocalizer } from "./localization.js";
import { TmdSongPitchRangeAnalyzer } from "./pitch_range_analyzer.js";
import {
  type PitchRangeDifficulty,
  type TmdArrangementDensityProfile,
  type TmdHarmonyProfile,
  type TmdNotePitchInfo,
  type TmdPitchClassDistribution,
  type TmdPitchRangeProfile,
  type TmdPlaybackContext,
  type TmdSectionDensity,
  type TmdSectionTimingProfile,
  type TmdSectionTonalityProfile,
  type TmdSongProfile,
  type TmdTimingProfile,
  type TmdTonalityCandidate,
  type TmdTonalityEvidence,
  type TmdTonalityInference,
  type TmdTonalityMode,
  type TmdTonalityNarrative,
  type TmdTonalityProfile,
  type VocalClassification,
} from "./profiles.js";
import { TmdSongTimingAnalyzer } from "./timing_analyzer.js";
import { TmdSongTonalityAnalyzer } from "./tonality_analyzer.js";
export * from "./profiles.js";

export class TmdSongInspector {
  // Krumhansl-Schmuckler 12-pitch-class profiles for Major and Minor
  private static readonly KS_MAJOR_PROFILE: number[] = [
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88
  ];
  private static readonly KS_MINOR_PROFILE: number[] = [
    6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17
  ];

  /**
   * Inspects a parsed TMD Sheet and produces an in-depth TmdSongProfile.
   */
  public static inspect(
    sheet: Sheet,
    targetInstrument?: string,
    locale: TmdLocale = "zh-Hant"
  ): TmdSongProfile {
    const effectiveSheet = TmdMacroEvaluator.expandThrowing(sheet);
    const title = effectiveSheet.name || "Untitled";
    const initialTempo = effectiveSheet.speed && effectiveSheet.speed > 0 ? effectiveSheet.speed : DEFAULT_TEMPO_BPM;
    const initialKey = effectiveSheet.keySignature ? effectiveSheet.keySignature.toString() : "C";
    const initialMeter = effectiveSheet.beat ? `${effectiveSheet.beat.count}/${effectiveSheet.beat.noteValue}` : "4/4";

    // 1. Timing Profile
    const timelineDirectives = this.collectTimelineDirectives(effectiveSheet);
    const timingProfile = this.buildTimingProfile(effectiveSheet, timelineDirectives);

    // 2. Instrument Ranges
    const distinctInsts = SheetInstrumentHelper.distinctInstruments(effectiveSheet, false);
    const instrumentRanges: TmdPitchRangeProfile[] = [];
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

  private static buildTimingProfile(sheet: Sheet, timelineDirectives: PlaybackDirectiveEvent[]): TmdTimingProfile {
    return TmdSongTimingAnalyzer.analyze(sheet, timelineDirectives);
  }

  private static buildPitchProfile(
    instrument: string,
    sheet: Sheet,
    timingProfile: TmdTimingProfile,
    timelineDirectives: PlaybackDirectiveEvent[]
  ): TmdPitchRangeProfile | null {
    return TmdSongPitchRangeAnalyzer.analyze(instrument, sheet, timingProfile, timelineDirectives);

  }

  private static collectTimelineDirectives(sheet: Sheet): PlaybackDirectiveEvent[] {
    const instruments = new Set(sheet.entries.map((paragraph) => paragraph.assignment).filter((instrument): instrument is string => Boolean(instrument && instrument.trim().length > 0)));
    const directives: PlaybackDirectiveEvent[] = [];
    for (const instrument of instruments) {
      directives.push(...TmdPlaybackRenderer.render(sheet, instrument).directives);
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
    return TmdSongPitchRangeAnalyzer.evaluateDifficulty(spanSemitones);
  }

  public static evaluateSuitableVoiceTypes(lowestMidi: number, highestMidi: number): VocalClassification[] {
    return TmdSongPitchRangeAnalyzer.evaluateSuitableVoiceTypes(lowestMidi, highestMidi);
  }

  private static buildHarmonyProfile(sheet: Sheet): TmdHarmonyProfile {
    return TmdSongHarmonyAnalyzer.analyze(sheet);
  }

  private static buildDensityProfile(sheet: Sheet): TmdArrangementDensityProfile {
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

    const sectionDensities: TmdSectionDensity[] = [];
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

  private static formatNoteLocation(note: TmdNotePitchInfo): string {
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
    timingProfile: TmdTimingProfile,
    locale: TmdLocale
  ): TmdTonalityProfile {
    return TmdSongTonalityAnalyzer.analyze(sheet, timingProfile, locale);
  }

  private static modeLabel(mode: TmdTonalityMode, localizer: TmdLocalizer): string {
    return TmdSongTonalityAnalyzer.modeLabel(mode, localizer);
  }

  public static localizeTonalityNarrative(
    tonality: TmdTonalityProfile,
    locale: TmdLocale,
  ): Pick<TmdTonalityProfile, "summaryText" | "moodDescription" | "modulationStory"> {
    return TmdSongTonalityAnalyzer.localizeTonalityNarrative(tonality, locale);
  }

  /**
   * Generates a human-readable plain text / ASCII inspection report.
   */
  public static generateReport(profile: TmdSongProfile, locale?: TmdLocale): string {
    const activeLocale = locale || profile.locale || "zh-Hant";
    const localizer = new TmdLocalizer(activeLocale);
    const localizedTonality = profile.tonality
      ? this.localizeTonalityNarrative(profile.tonality, activeLocale)
      : undefined;
    const mins = Math.floor(profile.timing.totalDurationSeconds / 60);
    const secs = Math.floor(profile.timing.totalDurationSeconds % 60);
    const timeFormatted = `${mins}:${secs.toString().padStart(2, "0")} (${profile.timing.totalDurationSeconds.toFixed(1)}s)`;

    const lines: string[] = [];
    lines.push("================================================================================");
    lines.push(`📊 ${localizer.text(TmdLocalizationKey.reportTitle)}: [ ${profile.title} ]`);
    lines.push("================================================================================");
    lines.push(`⏱  ${localizer.text(TmdLocalizationKey.duration)}:       ${timeFormatted}, ${profile.timing.totalMeasures} ${localizer.text(TmdLocalizationKey.measuresTotal)}`);
    lines.push(
      `🎼 ${localizer.text(TmdLocalizationKey.keyAndTempo)}:    ${localizer.text(TmdLocalizationKey.playbackBase)} ${profile.initialKey}, != ${profile.initialTempo} BPM, <${profile.initialTimeSignature}>`
    );
    lines.push(`   - ${localizer.text(TmdLocalizationKey.analysisScope)}`);

    if (profile.vocalRange) {
      const vocal = profile.vocalRange;
      const octaves = vocal.spanOctaves.toFixed(1);
      lines.push(
        `🎤 ${localizer.text(TmdLocalizationKey.vocalRange)}:    ${vocal.lowestNote.noteName} (MIDI ${vocal.lowestNote.midiPitch}) – ${vocal.highestNote.noteName} (MIDI ${vocal.highestNote.midiPitch}) [${localizer.text(TmdLocalizationKey.span)}: ${vocal.spanSemitones} ${localizer.text(TmdLocalizationKey.semitones)} / ${octaves} ${localizer.text(TmdLocalizationKey.octaves)}, ${localizer.text(TmdLocalizationKey.difficulty)}: ${vocal.difficulty}]`
      );
      lines.push(`   - ${localizer.text(TmdLocalizationKey.lowestNote)}:  ${vocal.lowestNote.noteName} in ${TmdSongInspector.formatNoteLocation(vocal.lowestNote)}`);
      lines.push(`   - ${localizer.text(TmdLocalizationKey.highestNote)}: ${vocal.highestNote.noteName} in ${TmdSongInspector.formatNoteLocation(vocal.highestNote)}`);
      if (vocal.suitableVoiceTypes.length > 0) {
        lines.push(`   - ${localizer.text(TmdLocalizationKey.suitableFor)}: ${vocal.suitableVoiceTypes.join(", ")}`);
      }
    }

    lines.push(
      `🏛  ${localizer.text(TmdLocalizationKey.structure)}:      ` +
        profile.timing.sections
          .map((s) => `${s.name} (${s.durationSeconds.toFixed(1)}s)`)
          .join(" -> ")
    );
    lines.push(`⚡ ${localizer.text(TmdLocalizationKey.density)}:        Peak ${profile.density.maxConcurrentTracks} ${localizer.text(TmdLocalizationKey.tracksConcurrently)}`);

    if (profile.harmony.distinctChords.length > 0) {
      lines.push(`🎹 ${localizer.text(TmdLocalizationKey.harmony)}:        ` + profile.harmony.distinctChords.join(" "));
    }

    if (profile.tonality) {
      const tonality = profile.tonality;
      const stabStr = tonality.globalInference.stability.charAt(0).toUpperCase() + tonality.globalInference.stability.slice(1);
      const corrStr = tonality.globalInference.bestCorrelation.toFixed(2);
      const diatonicPct = `${(tonality.globalPitchClasses.diatonicRatio * 100.0).toFixed(1)}%`;
      const topPitches = tonality.globalPitchClasses.topPitchClasses.slice(0, 5).join(", ");

      lines.push(`🗝  ${localizer.text(TmdLocalizationKey.tonalityDiagnosis)}       ${localizedTonality?.summaryText ?? tonality.summaryText}`);
      lines.push(`   - ${localizer.text(TmdLocalizationKey.mood)}:    ${localizedTonality?.moodDescription ?? tonality.moodDescription}`);
      lines.push(`   - ${localizer.text(TmdLocalizationKey.modulationJourney)}:    ${localizedTonality?.modulationStory ?? tonality.modulationStory}`);
      lines.push(`   - ${localizer.text(TmdLocalizationKey.tonalCore)}:  ${topPitches}`);
      lines.push(
        `   - ${localizer.text(TmdLocalizationKey.tonalMetrics)}:    ${tonality.globalInference.tonic ?? "?"} ${this.modeLabel(tonality.globalInference.mode, localizer)} [${localizer.text(TmdLocalizationKey.correlation)}: ${corrStr}, ${localizer.text(TmdLocalizationKey.stability)}: ${stabStr}, ${localizer.text(TmdLocalizationKey.diatonicPurity)}: ${diatonicPct}]`
      );

      const candidateStr = tonality.globalInference.topCandidates
        .slice(0, 3)
        .map((c) => `${c.tonic} ${this.modeLabel(c.mode, localizer)} (${c.correlation.toFixed(2)})`)
        .join(", ");
      if (candidateStr.length > 0) {
        lines.push(`   - ${localizer.text(TmdLocalizationKey.candidateKeys)}: ${candidateStr}`);
      }

      const pathStr = tonality.circleOfFifthsPath
        .map((step) => `${step >= 0 ? "+" : ""}${step}`)
        .join(" -> ");
      if (pathStr.length > 0) {
        lines.push(`   - ${localizer.text(TmdLocalizationKey.circleOfFifths)}:   ${pathStr}`);
      }

      if (tonality.sections.length > 0) {
        lines.push(`   - ${localizer.text(TmdLocalizationKey.sectionDetails)}:`);
        for (const sec of tonality.sections) {
          const secCorr = sec.inferredTonality.bestCorrelation.toFixed(2);
          const secDiatonic = `${(sec.pitchClasses.diatonicRatio * 100.0).toFixed(1)}%`;
          let secLine = `     • [${sec.sectionName} #${sec.occurrenceIndex}]: ${sec.inferredTonality.tonic ?? "?"} ${this.modeLabel(sec.inferredTonality.mode, localizer)} (r: ${secCorr}, ${localizer.text(TmdLocalizationKey.diatonicPurity)}: ${secDiatonic}`;
          if (sec.nonDiatonicNotes.length > 0) {
            secLine += `, ${localizer.text(TmdLocalizationKey.nonDiatonic)}: ${sec.nonDiatonicNotes.join(", ")}`;
          }
          secLine += ")";
          lines.push(secLine);
        }
      }

      // ASCII Visualizations
      lines.push("");
      lines.push(`  [ ${localizer.text(TmdLocalizationKey.circleOfFifthsTitle)} ]`);
      lines.push(this.renderAsciiCircleOfFifths(tonality));
      lines.push("");
      lines.push(`  [ ${localizer.text(TmdLocalizationKey.pitchClassDistributionTitle)} ]`);
      lines.push(this.renderPitchClassHistogram(tonality));
    }

    lines.push("--------------------------------------------------------------------------------");
    lines.push(localizer.text(TmdLocalizationKey.instrumentRanges));
    for (const inst of profile.instrumentRanges) {
      const padded = inst.assignment.padEnd(14, " ");
      const octaves = inst.spanOctaves.toFixed(1);
      lines.push(
        `  - ${padded}: ${inst.lowestNote.noteName} – ${inst.highestNote.noteName} (${inst.spanSemitones} ${localizer.text(TmdLocalizationKey.semitones)} / ${octaves} ${localizer.text(TmdLocalizationKey.octaves)}, ${inst.totalNotes} ${localizer.text(TmdLocalizationKey.notes)})`
      );
    }
    lines.push("================================================================================");

    return lines.join("\n");
  }

  private static renderAsciiCircleOfFifths(tonality: TmdTonalityProfile): string {
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

  private static renderPitchClassHistogram(tonality: TmdTonalityProfile): string {
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
