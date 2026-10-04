import { SheetInstrumentHelper } from "./instruments.js";
import { PlaybackEvent, TMDPlaybackRenderer } from "./playback.js";
import { chordQualityIntervals, ChordSymbol, noteToMIDIPitch, Sheet } from "./types.js";
import { TMDLocalizationKey, TMDLocalizer } from "./localization.js";
import type { TMDLocale } from "./localization.js";
import type {
  TMDTimingProfile,
  TMDPitchClassDistribution,
  TMDTonalityCandidate,
  TMDTonalityEvidence,
  TMDTonalityInference,
  TMDTonalityMode,
  TMDTonalityMood,
  TMDTonalityNarrative,
  TMDTonalityProfile,
  TMDScaleFamily,
  TMDSectionTonalityProfile,
  TMDKeyStability,
} from "./inspector.js";

export class TMDSongTonalityAnalyzer {
private static readonly KS_MAJOR_PROFILE: number[] = [
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88
  ];
  private static readonly KS_MINOR_PROFILE: number[] = [
    6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17
  ];
  public static analyze(
    sheet: Sheet,
    timingProfile: TMDTimingProfile,
    locale: TMDLocale
  ): TMDTonalityProfile {
    const localizer = new TMDLocalizer(locale);
    const distinctInsts = SheetInstrumentHelper.distinctInstruments(sheet, false);
    const allEvents: PlaybackEvent[] = [];
    for (const inst of distinctInsts) {
      const timeline = TMDPlaybackRenderer.render(sheet, inst);
      allEvents.push(...timeline.events);
    }

    const globalWeights = new Array<number>(12).fill(0.0);
    let noteWeight = 0.0;
    let chordWeight = 0.0;
    const sectionWeights: Record<number, number[]> = {};
    for (let idx = 0; idx < timingProfile.sections.length; idx++) {
      sectionWeights[idx] = new Array<number>(12).fill(0.0);
    }

    // 1. Accumulate melody notes
    for (const event of allEvents) {
      if (event.content.type !== "note") continue;
      const note = event.content.note;
      const pitch = noteToMIDIPitch(note, event.state.keyOffset);

      const pc = ((pitch % 12) + 12) % 12;
      const dur = event.duration;

      globalWeights[pc] += dur;
      noteWeight += dur;

      for (let secIdx = 0; secIdx < timingProfile.sections.length; secIdx++) {
        const sec = timingProfile.sections[secIdx];
        const overlap = this.overlapDuration(
          event.position,
          dur,
          sec.startPositionQuarterNotes,
          sec.durationQuarterNotes
        );
        if (overlap > 0.0) {
          sectionWeights[secIdx][pc] += overlap;
        }
      }
    }

    // 2. Accumulate chord symbol constituents
    for (const event of allEvents) {
      if (event.content.type !== "chord") continue;
      const chord = event.content.chord;
      const dur = event.duration;
      const chordPCs = this.chordPitchClasses(chord, event.state.keyOffset);
      for (const item of chordPCs) {
        const w = dur * item.weight;
        globalWeights[item.pc] += w;
        chordWeight += w;

        for (let secIdx = 0; secIdx < timingProfile.sections.length; secIdx++) {
          const sec = timingProfile.sections[secIdx];
          const overlap = this.overlapDuration(
            event.position,
            dur,
            sec.startPositionQuarterNotes,
            sec.durationQuarterNotes
          );
          if (overlap > 0.0) {
            sectionWeights[secIdx][item.pc] += item.weight * overlap;
          }
        }
      }
    }

    const pitchClassNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const baseKey = sheet.keySignature ? sheet.keySignature.toString() : "C";
    const initialTonicOffset = sheet.keySignature ? sheet.keySignature.semitoneOffset : 0;

    // Infer tonality from sounding evidence. The movable-do base is only playback context.
    const globalInference = this.evaluateTonality(globalWeights, { noteWeight, chordWeight });
    const globalTonicOffset = globalInference.tonic === null
      ? initialTonicOffset
      : this.pitchClassOffset(globalInference.tonic);
    const globalDisplayMode = globalInference.mode === "ambiguous" ? (globalInference.topCandidates[0]?.mode ?? "major") : globalInference.mode;
    const globalDist = this.makePitchClassDistribution(globalWeights, globalTonicOffset, globalDisplayMode);

    // Sections
    const sectionProfiles: TMDSectionTonalityProfile[] = [];
    const circleOfFifthsPath: number[] = [];

    for (let secIdx = 0; secIdx < timingProfile.sections.length; secIdx++) {
      const sec = timingProfile.sections[secIdx];
      const weights = sectionWeights[secIdx] || new Array<number>(12).fill(0.0);
      const fixedPitch = sheet.entries
        .filter((paragraph) => paragraph.name === sec.name)
        .some((paragraph) => paragraph.sections.some((section) => section.directives.some((directive) => directive.kind.type === "fixedPitch")));
      const secInference = this.evaluateTonality(weights);
      const secTonicOffset = secInference.tonic === null
        ? ((sec.keyOffset % 12) + 12) % 12
        : this.pitchClassOffset(secInference.tonic);
      const secDisplayMode = secInference.mode === "ambiguous" ? (secInference.topCandidates[0]?.mode ?? "major") : secInference.mode;
      const secDist = this.makePitchClassDistribution(weights, secTonicOffset, secDisplayMode);

      const diatonicMask = this.diatonicPitchClassMask(secTonicOffset, secDisplayMode);
      const nonDiatonic: string[] = [];
      for (let pc = 0; pc < 12; pc++) {
        if (!diatonicMask.has(pc) && weights[pc] > 0.001) {
          nonDiatonic.push(pitchClassNames[pc]);
        }
      }

      const fifthsStep = this.circleOfFifthsStep(secTonicOffset);
      circleOfFifthsPath.push(fifthsStep);

      sectionProfiles.push({
        sectionName: sec.name,
        occurrenceIndex: sec.occurrenceIndex,
        playbackContext: {
          movableDoBase: baseKey,
          transpositionOffset: sec.keyOffset,
          fixedPitch,
        },
        fifthsPosition: fifthsStep,
        pitchClasses: secDist,
        inferredTonality: secInference,
        nonDiatonicNotes: nonDiatonic,
      });
    }

    // Human-friendly producer narrative synthesis
    const diatonicRatio = globalDist.diatonicRatio;
    let mood: TMDTonalityMood;
    if (globalInference.mode === "insufficient") {
      mood = "insufficient";
    } else if (globalInference.mode === "minor" && diatonicRatio >= 0.95) {
      mood = "cleanMinor";
    } else if (globalInference.mode === "minor" && diatonicRatio >= 0.80) {
      mood = "contemporaryMinor";
    } else if (diatonicRatio >= 0.95) {
      mood = "cleanMajor";
    } else if (diatonicRatio >= 0.80) {
      mood = "contemporaryMajor";
    } else {
      mood = "modal";
    }
    const moodDescription = localizer.text(this.moodLocalizationKey(mood));

    // Modulation story
    const modTransitions: string[] = [];
    const modulationTransitions: TMDTonalityNarrative["transitions"] = [];
    let previousInference: TMDTonalityInference | undefined;
    let previousTonicOffset = globalTonicOffset;
    let previousFifths = this.circleOfFifthsStep(previousTonicOffset);

    for (const sec of sectionProfiles) {
      const current = sec.inferredTonality;
      if (previousInference && this.isStableInference(previousInference) && this.isStableInference(current)
        && (current.tonic !== previousInference.tonic || current.mode !== previousInference.mode)) {
        const currentOffset = this.pitchClassOffset(current.tonic!);
        const diff = currentOffset - previousTonicOffset;
        const semitoneDiff = diff >= 0 ? `+${diff}` : `${diff}`;
        let stepDiff = this.circleOfFifthsStep(currentOffset) - previousFifths;
        if (stepDiff > 6) stepDiff -= 12;
        if (stepDiff < -6) stepDiff += 12;
        const stepStr = stepDiff >= 0 ? `+${stepDiff}` : `${stepDiff}`;
        modulationTransitions.push({
          sectionName: sec.sectionName,
          tonic: current.tonic!,
          mode: current.mode as "major" | "minor",
          semitoneDiff: diff,
          fifthsStepDiff: stepDiff,
        });
        modTransitions.push(
          localizer.text(TMDLocalizationKey.modulationStep, [
            sec.sectionName,
            `${current.tonic} ${this.modeLabel(current.mode, localizer)}`,
            semitoneDiff,
            stepStr,
          ])
        );
      }
      if (this.isStableInference(current)) {
        previousTonicOffset = this.pitchClassOffset(current.tonic!);
        previousFifths = this.circleOfFifthsStep(previousTonicOffset);
      }
      previousInference = current;
    }

    let modulationStory: string;
    if (modTransitions.length === 0) {
      modulationStory = localizer.text(TMDLocalizationKey.modulationNone);
    } else {
      modulationStory =
        localizer.text(TMDLocalizationKey.modulationStart, [globalInference.tonic ?? "?", this.modeLabel(globalInference.mode, localizer)]) +
        " ➔ " +
        modTransitions.join(" ➔ ");
    }

    let summaryText: string;
    if (modTransitions.length === 0) {
      const moodSummary =
        mood === "cleanMinor"
          ? localizer.text(TMDLocalizationKey.summaryCleanMinor)
          : mood === "contemporaryMinor"
            ? localizer.text(TMDLocalizationKey.summaryColorMinor)
            : diatonicRatio >= 0.95
              ? localizer.text(TMDLocalizationKey.summaryClean)
              : localizer.text(TMDLocalizationKey.summaryColor);
      summaryText = localizer.text(TMDLocalizationKey.summaryStable, [globalInference.tonic ?? "?", this.modeLabel(globalInference.mode, localizer), moodSummary]);
    } else {
      summaryText = localizer.text(TMDLocalizationKey.summaryModulating, [
        globalInference.tonic ?? "?",
        this.modeLabel(globalInference.mode, localizer),
        String(modTransitions.length),
      ]);
    }

    return {
      globalPitchClasses: globalDist,
      globalInference,
      ...(sheet.declaredKey ? { declaredKey: sheet.declaredKey } : {}),
      playbackContext: {
        movableDoBase: baseKey,
        transpositionOffset: initialTonicOffset,
        fixedPitch: false,
      },
      playbackTranspositionPath: sectionProfiles.map((section) => section.playbackContext.transpositionOffset),
      inferredModulationPath: modulationTransitions,
      circleOfFifthsPath,
      sections: sectionProfiles,
      summaryText,
      moodDescription,
      modulationStory,
      narrative: {
        tonic: globalInference.tonic ?? "?",
        mood,
        transitions: modulationTransitions,
      },
      locale,
    };
  }

  private static moodLocalizationKey(mood: TMDTonalityMood): TMDLocalizationKey {
    switch (mood) {
    case "cleanMajor": return TMDLocalizationKey.moodCleanMajor;
    case "contemporaryMajor": return TMDLocalizationKey.moodContemporaryMajor;
    case "cleanMinor": return TMDLocalizationKey.moodCleanMinor;
    case "contemporaryMinor": return TMDLocalizationKey.moodContemporaryMinor;
    case "insufficient": return TMDLocalizationKey.moodInsufficient;
    case "modal": return TMDLocalizationKey.moodModal;
    }
  }

  private static isStableInference(inference: TMDTonalityInference): inference is TMDTonalityInference & { tonic: string; mode: "major" | "minor" } {
    return inference.tonic !== null && (inference.mode === "major" || inference.mode === "minor")
      && inference.stability !== "ambiguous" && inference.stability !== "insufficient";
  }

  public static modeLabel(mode: TMDTonalityMode, localizer: TMDLocalizer): string {
    switch (mode) {
    case "major": return localizer.text(TMDLocalizationKey.major);
    case "minor": return localizer.text(TMDLocalizationKey.minor);
    case "ambiguous": return localizer.text(TMDLocalizationKey.modeAmbiguous);
    case "modal": return localizer.text(TMDLocalizationKey.modeModal);
    case "insufficient": return localizer.text(TMDLocalizationKey.modeInsufficient);
    }
  }

  public static localizeTonalityNarrative(
    tonality: TMDTonalityProfile,
    locale: TMDLocale,
  ): Pick<TMDTonalityProfile, "summaryText" | "moodDescription" | "modulationStory"> {
    const localizer = new TMDLocalizer(locale);
    if (!tonality.narrative) {
      return {
        summaryText: tonality.summaryText,
        moodDescription: tonality.moodDescription,
        modulationStory: tonality.modulationStory,
      };
    }
    const { tonic, mood, transitions } = tonality.narrative;
    const moodDescription = localizer.text(this.moodLocalizationKey(mood));
    const modulationParts = transitions.map((transition) => localizer.text(TMDLocalizationKey.modulationStep, [
      transition.sectionName,
      `${transition.tonic} ${this.modeLabel(transition.mode, localizer)}`,
      transition.semitoneDiff >= 0 ? `+${transition.semitoneDiff}` : `${transition.semitoneDiff}`,
      transition.fifthsStepDiff >= 0 ? `+${transition.fifthsStepDiff}` : `${transition.fifthsStepDiff}`,
    ]));
    const modulationStory = transitions.length === 0
      ? localizer.text(TMDLocalizationKey.modulationNone)
      : localizer.text(TMDLocalizationKey.modulationStart, [tonic, this.modeLabel(tonality.globalInference.mode, localizer)]) + " ➔ " + modulationParts.join(" ➔ ");
    const summaryText = transitions.length === 0
      ? localizer.text(TMDLocalizationKey.summaryStable, [
        tonic,
        this.modeLabel(tonality.globalInference.mode, localizer),
        localizer.text(mood === "cleanMinor" ? TMDLocalizationKey.summaryCleanMinor : mood === "contemporaryMinor" ? TMDLocalizationKey.summaryColorMinor : mood === "cleanMajor" ? TMDLocalizationKey.summaryClean : TMDLocalizationKey.summaryColor),
      ])
      : localizer.text(TMDLocalizationKey.summaryModulating, [tonic, this.modeLabel(tonality.globalInference.mode, localizer), String(transitions.length)]);
    return { summaryText, moodDescription, modulationStory };
  }

  private static overlapDuration(
    eventPosition: number,
    eventDuration: number,
    sectionStart: number,
    sectionDuration: number
  ): number {
    const eventEnd = eventPosition + Math.max(0.0, eventDuration);
    const sectionEnd = sectionStart + Math.max(0.0, sectionDuration);
    return Math.max(0.0, Math.min(eventEnd, sectionEnd) - Math.max(eventPosition, sectionStart));
  }

  private static chordPitchClasses(
    chord: ChordSymbol,
    keyOffset: number
  ): { pc: number; weight: number }[] {
    const rootOffset = chord.root.isScaleDegree
      ? (keyOffset + chord.root.semitoneOffset) % 12
      : chord.root.semitoneOffset % 12;
    const tonic = ((rootOffset % 12) + 12) % 12;
    const result: { pc: number; weight: number }[] = [];

    const intervals = chordQualityIntervals(chord.quality);
    for (let i = 0; i < intervals.length; i++) {
      const interval = intervals[i];
      const pc = (tonic + interval) % 12;
      let w = 0.6;
      if (i === 0) w = 1.0;      // Root
      else if (i === 1) w = 0.8; // Third
      else if (i === 2) w = 0.8; // Fifth
      result.push({ pc, weight: w });
    }

    if (chord.bass) {
      const bassOffset = chord.bass.isScaleDegree
        ? (keyOffset + chord.bass.semitoneOffset) % 12
        : chord.bass.semitoneOffset % 12;
      const bassPC = ((bassOffset % 12) + 12) % 12;
      result.push({ pc: bassPC, weight: 0.8 });
    }

    return result;
  }

  private static diatonicPitchClassMask(tonicOffset: number, mode: TMDTonalityMode = "major"): Set<number> {
    const steps = mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [];
    const mask = new Set<number>();
    for (const step of steps) {
      mask.add((tonicOffset + step) % 12);
    }
    return mask;
  }

  private static makePitchClassDistribution(
    weights: number[],
    tonicOffset: number,
    mode: TMDTonalityMode = "major"
  ): TMDPitchClassDistribution {
    const pitchClassNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const total = weights.reduce((acc, w) => acc + w, 0.0);
    if (total <= 0.0001) {
      return {
        weights,
        diatonicRatio: 1.0,
        chromaticRatio: 0.0,
        topPitchClasses: [],
      };
    }

    const diatonicMask = this.diatonicPitchClassMask(tonicOffset, mode);
    let diatonicSum = 0.0;
    for (let pc = 0; pc < 12; pc++) {
      if (diatonicMask.has(pc)) {
        diatonicSum += weights[pc];
      }
    }

    const diatonicRatio = diatonicSum / total;
    const chromaticRatio = Math.max(0.0, 1.0 - diatonicRatio);

    const indexed: { name: string; weight: number }[] = [];
    for (let i = 0; i < 12; i++) {
      if (weights[i] > 0.0001) {
        indexed.push({ name: pitchClassNames[i], weight: weights[i] });
      }
    }
    indexed.sort((a, b) => b.weight - a.weight);
    const topNames = indexed.map((item) => item.name);

    return {
      weights,
      diatonicRatio,
      chromaticRatio,
      topPitchClasses: topNames,
    };
  }

  private static pearsonCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0.0;
    const n = x.length;
    const meanX = x.reduce((acc, v) => acc + v, 0.0) / n;
    const meanY = y.reduce((acc, v) => acc + v, 0.0) / n;

    let num = 0.0;
    let denomX = 0.0;
    let denomY = 0.0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      num += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    if (denom < 1e-9) return 0.0;
    return num / denom;
  }

  private static evaluateTonality(weights: number[], evidence: TMDTonalityEvidence = { noteWeight: 0, chordWeight: 0 }): TMDTonalityInference {
    const pitchClassNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const total = weights.reduce((acc, w) => acc + w, 0.0);
    if (total <= 0.0001) {
      return {
        tonic: null,
        mode: "insufficient",
        scaleFamily: "unknown",
        confidence: 0,
        margin: 0,
        stability: "insufficient",
        bestCorrelation: 0,
        topCandidates: [],
        evidence,
      };
    }
    const candidates: TMDTonalityCandidate[] = [];

    // Evaluate all 12 Major and 12 Minor keys
    for (let tonic = 0; tonic < 12; tonic++) {
      const rotWeights = new Array<number>(12).fill(0.0);
      for (let i = 0; i < 12; i++) {
        rotWeights[i] = weights[(tonic + i) % 12];
      }

      const rMajor = this.pearsonCorrelation(rotWeights, this.KS_MAJOR_PROFILE);
      candidates.push({ tonic: pitchClassNames[tonic], mode: "major", scaleFamily: "major", correlation: rMajor });

      const rMinor = this.pearsonCorrelation(rotWeights, this.KS_MINOR_PROFILE);
      const seventhWeight = weights[(tonic + 11) % 12] / total;
      const sixthWeight = weights[(tonic + 9) % 12] / total;
      const scaleFamily: TMDScaleFamily = seventhWeight > 0.08 && sixthWeight > 0.08
        ? "melodicMinor" : seventhWeight > 0.08 ? "harmonicMinor" : "naturalMinor";
      candidates.push({ tonic: pitchClassNames[tonic], mode: "minor", scaleFamily, correlation: rMinor });
    }

    candidates.sort((a, b) => b.correlation - a.correlation);

    const best = candidates[0];
    const second = candidates[1];
    const margin = best.correlation - second.correlation;
    const confidence = Math.max(0, Math.min(1, ((best.correlation + 1) / 2) * (0.5 + Math.min(1, margin / 0.20) * 0.5)));
    const stability: TMDKeyStability = confidence >= 0.75 && margin >= 0.08 ? "high" : confidence >= 0.50 && margin >= 0.03 ? "moderate" : "ambiguous";
    const mode: TMDTonalityMode = stability === "ambiguous" ? "ambiguous" : best.mode;
    return {
      tonic: best.tonic,
      mode,
      scaleFamily: mode === "ambiguous" ? "unknown" : best.scaleFamily,
      confidence,
      margin,
      stability,
      bestCorrelation: best.correlation,
      topCandidates: candidates.slice(0, 4),
      evidence,
    };
  }

  private static pitchClassOffset(tonic: string): number {
    return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].indexOf(tonic);
  }

  private static keyName(tonic: number): string {
    const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    return names[((tonic % 12) + 12) % 12];
  }

  private static circleOfFifthsStep(tonicOffset: number): number {
    switch (((tonicOffset % 12) + 12) % 12) {
      case 0: return 0;   // C
      case 7: return 1;   // G
      case 2: return 2;   // D
      case 9: return 3;   // A
      case 4: return 4;   // E
      case 11: return 5;  // B
      case 6: return 6;   // F# / Gb
      case 1: return -5;  // Db / C#
      case 8: return -4;  // Ab / G#
      case 3: return -3;  // Eb
      case 10: return -2; // Bb
      case 5: return -1;  // F
      default: return 0;
    }
  }
}
