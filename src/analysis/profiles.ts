import type { TmdLocale } from "./localization.js";

export interface TmdNotePitchInfo {
  midiPitch: number;
  noteName: string;
  sectionName: string;
  timelinePosition: number;
  sectionOccurrence: number;
  measure: number;
  timeSeconds: number;
}

export namespace TmdNotePitchInfo {
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
export interface TmdPitchRangeProfile {
  /** Canonical assignment represented by this pitch profile. */
  assignment: string;
  lowestNote: TmdNotePitchInfo;
  highestNote: TmdNotePitchInfo;
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
export interface TmdSectionTimingProfile {
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
export interface TmdTimingProfile {
  totalDurationSeconds: number;
  totalMeasures: number;
  sections: TmdSectionTimingProfile[];
}

/**
 * Harmonic content and progression analysis.
 */
export interface TmdHarmonyProfile {
  distinctChords: string[];
  chordCount: number;
  modulations: string[];
}

/**
 * Section arrangement density descriptor.
 */
export interface TmdSectionDensity {
  sectionName: string;
  trackCount: number;
  instruments: string[];
}

/**
 * Arrangement orchestration and concurrent track layering density.
 */
export interface TmdArrangementDensityProfile {
  maxConcurrentTracks: number;
  sectionDensities: TmdSectionDensity[];
}

/**
 * Distribution of the 12 chromatic pitch classes across a section or entire score.
 */
export interface TmdPitchClassDistribution {
  /** Accumulated quarter-note duration weights for each pitch class (0: C, 1: C#, ..., 11: B). */
  weights: number[];
  /** Ratio of diatonic notes to total pitch weight (0.0 ~ 1.0). */
  diatonicRatio: number;
  /** Ratio of non-diatonic (chromatic) notes to total pitch weight (0.0 ~ 1.0). */
  chromaticRatio: number;
  /** Prominent pitch classes ordered by descending weight (e.g. ["C", "G", "E"]). */
  topPitchClasses: string[];
}

export type TmdTonalityMode = "major" | "minor" | "modal" | "ambiguous" | "insufficient";
export type TmdScaleFamily = "major" | "naturalMinor" | "harmonicMinor" | "melodicMinor" | "modal" | "chromatic" | "unknown";
export type TmdKeyStability = "high" | "moderate" | "ambiguous" | "insufficient";

export interface TmdTonalityCandidate {
  tonic: string;
  mode: "major" | "minor";
  scaleFamily: TmdScaleFamily;
  correlation: number;
}

export interface TmdTonalityEvidence {
  noteWeight: number;
  chordWeight: number;
}

export interface TmdTonalityInference {
  tonic: string | null;
  mode: TmdTonalityMode;
  scaleFamily: TmdScaleFamily;
  confidence: number;
  margin: number;
  stability: TmdKeyStability;
  bestCorrelation: number;
  topCandidates: TmdTonalityCandidate[];
  evidence: TmdTonalityEvidence;
}

export interface TmdPlaybackContext {
  movableDoBase: string;
  transpositionOffset: number;
  fixedPitch: boolean;
}

/**
 * Tonality and pitch-class distribution metrics for an individual section.
 */
export interface TmdSectionTonalityProfile {
  sectionName: string;
  occurrenceIndex: number;
  playbackContext: TmdPlaybackContext;
  fifthsPosition: number;
  pitchClasses: TmdPitchClassDistribution;
  inferredTonality: TmdTonalityInference;
  nonDiatonicNotes: string[];
}

export type TmdTonalityMood = "cleanMajor" | "contemporaryMajor" | "cleanMinor" | "contemporaryMinor" | "modal" | "insufficient";

export interface TmdTonalityNarrative {
  tonic: string;
  mood: TmdTonalityMood;
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
export interface TmdTonalityProfile {
  globalPitchClasses: TmdPitchClassDistribution;
  globalInference: TmdTonalityInference;
  /** Explicit `key=` declaration, distinct from movable-do playback context. */
  declaredKey?: string;
  playbackContext: TmdPlaybackContext;
  playbackTranspositionPath: number[];
  inferredModulationPath: TmdTonalityNarrative["transitions"];
  circleOfFifthsPath: number[];
  sections: TmdSectionTonalityProfile[];
  summaryText: string;
  moodDescription: string;
  modulationStory: string;
  narrative?: TmdTonalityNarrative;
  locale: TmdLocale;
}

/**
 * Complete structural, vocal range, harmonic, and temporal profile of a TMD score.
 */
export interface TmdSongProfile {
  title: string;
  initialTempo: number;
  initialKey: string;
  initialTimeSignature: string;
  timing: TmdTimingProfile;
  vocalRange?: TmdPitchRangeProfile;
  instrumentRanges: TmdPitchRangeProfile[];
  harmony: TmdHarmonyProfile;
  density: TmdArrangementDensityProfile;
  tonality?: TmdTonalityProfile;
  locale?: TmdLocale;
}
