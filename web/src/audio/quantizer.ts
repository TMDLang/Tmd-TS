import { KeySignature } from "../../../src/syntax/types.js";

export interface TmdNoteEventTime {
  startTimeSeconds: number;
  durationSeconds: number;
  pitchMidi: number;
  amplitude: number;
  pitchBends?: number[];
}

export interface QuantizeOptions {
  sectionName?: string;
  instrument?: string;
  bpm: number;
  grid?: number; // 4 for quarter-note <4*>, 8 for eighth-note <8*>, 16 for <16*>
  key?: string;  // "C", "G", "F", etc.
  beatsPerMeasure?: number; // default 4
  snapToScale?: boolean; // Snap accidental sharps/flats to nearest major diatonic degree (1 2 3 4 5 6 7)
}

// Semitone offset to jianpu string mapping within an octave (0 = tonic)
const SEMITONE_TO_JIANPU: { [semitone: number]: string } = {
  0: "1",
  1: "1'",
  2: "2",
  3: "2'",
  4: "3",
  5: "4",
  6: "4'",
  7: "5",
  8: "5'",
  9: "6",
  10: "6'",
  11: "7",
};

// Map accidental semitones to nearest major scale diatonic semitone
const DIATONIC_SEMITONES: { [semitone: number]: number } = {
  0: 0,   // 1
  1: 0,   // 1' -> 1
  2: 2,   // 2
  3: 2,   // 2' -> 2
  4: 4,   // 3
  5: 5,   // 4
  6: 5,   // 4' -> 4
  7: 7,   // 5
  8: 7,   // 5' -> 5
  9: 9,   // 6
  10: 9,  // 6' -> 6
  11: 11, // 7
};

// Standard Krumhansl-Schmuckler Major Key Profile weights
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];

// 12 root pitch classes
const PITCH_CLASSES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/**
 * Analyzes note events and detects the most likely musical key / tonic
 * using duration and amplitude-weighted Krumhansl-Schmuckler key-finding algorithm.
 */
export function detectTonicAndScale(events: TmdNoteEventTime[]): string {
  if (events.length === 0) return "C";

  // Build 12-semitone pitch-class chroma vector weighted by duration * amplitude
  const chroma = new Array(12).fill(0);
  for (const ev of events) {
    if (ev.amplitude <= 0.05 || ev.durationSeconds <= 0.05) continue;
    const pitchMidi = Math.round(ev.pitchMidi);
    const semitone = ((pitchMidi % 12) + 12) % 12;
    // Weight by duration and amplitude, with slight emphasis on note endings/onsets
    const weight = Math.max(0.1, ev.durationSeconds) * (ev.amplitude || 1.0);
    chroma[semitone] += weight;
  }

  // Calculate correlation with Major profiles for each of the 12 candidate roots
  let bestKey = "C";
  let maxScore = -Infinity;

  // Mean of chroma vector
  const chromaMean = chroma.reduce((sum, v) => sum + v, 0) / 12;
  const majorMean = MAJOR_PROFILE.reduce((sum, v) => sum + v, 0) / 12;

  for (let root = 0; root < 12; root++) {
    let num = 0;
    let denomChroma = 0;
    let denomProfile = 0;

    for (let i = 0; i < 12; i++) {
      const chromaVal = chroma[(root + i) % 12] - chromaMean;
      const profileVal = MAJOR_PROFILE[i] - majorMean;
      num += chromaVal * profileVal;
      denomChroma += chromaVal * chromaVal;
      denomProfile += profileVal * profileVal;
    }

    const denom = Math.sqrt(denomChroma * denomProfile);
    const correlation = denom === 0 ? 0 : num / denom;

    if (correlation > maxScore) {
      maxScore = correlation;
      bestKey = PITCH_CLASSES[root];
    }
  }

  return bestKey;
}

/**
 * Converts a MIDI pitch (e.g. 60 for Middle C) into a Jianpu scale degree relative to the given Key Signature.
 */
export function midiPitchToJianpu(
  pitchMidi: number,
  keyStr: string = "C",
  snapToScale: boolean = false
): string {
  const keySig = KeySignature.parse(keyStr);
  const keyOffset = keySig.semitoneOffset; // C=0, C#=1, D=2, G=7...

  // Normalize pitch relative to Middle C (60) and key offset
  const relativePitch = pitchMidi - 60 - keyOffset;
  // Calculate octave relative to 0
  const octave = Math.floor(relativePitch / 12);
  let semitoneInOctave = ((relativePitch % 12) + 12) % 12;

  if (snapToScale) {
    semitoneInOctave = DIATONIC_SEMITONES[semitoneInOctave] ?? semitoneInOctave;
  }

  const baseJianpu = SEMITONE_TO_JIANPU[semitoneInOctave] || "1";

  let octaveMark = "";
  if (octave > 0) {
    octaveMark = "^".repeat(octave);
  } else if (octave < 0) {
    octaveMark = "_".repeat(-octave);
  }

  // Insert octave mark before accidental if any (e.g. 1'^ or 1^')
  if (baseJianpu.endsWith("'") || baseJianpu.endsWith(",")) {
    const deg = baseJianpu[0];
    const acc = baseJianpu.slice(1);
    return `${deg}${acc}${octaveMark}`;
  }

  return `${baseJianpu}${octaveMark}`;
}

/**
 * Quantizes an array of NoteEventTime into a formatted TMD section.
 */
export function quantizeNoteEventsToTmdSection(
  events: TmdNoteEventTime[],
  options: QuantizeOptions
): string {
  const sectionName = options.sectionName || "hummed";
  const instrument = options.instrument || "Vocal";
  const bpm = Math.max(20, options.bpm || 120);
  const grid = options.grid || 8; // default eighth notes
  const beatsPerMeasure = Math.max(1, options.beatsPerMeasure || 4);

  // Auto-detect key if requested ("AUTO" or omitted)
  let key = options.key || "AUTO";
  if (key === "AUTO" || !key) {
    key = detectTonicAndScale(events);
  }

  // Duration of one quarter note beat in seconds
  const beatDuration = 60.0 / bpm;
  // Duration of one grid slot in seconds (e.g. for grid=4, slot = beat; for grid=8, slot = beat / 2)
  const slotDuration = (4.0 / grid) * beatDuration;

  if (events.length === 0) {
    return `${sectionName}:${instrument}@|0|{\n    <${grid}*>\n    0\n}`;
  }

  // Duration of minimum note threshold (filter out glitched blips < 0.1s)
  const minNoteDuration = Math.max(0.1, slotDuration * 0.4);

  // Filter out ultra-quiet or micro-glitch events
  const validEvents = events
    .filter((e) => e.amplitude > 0.15 && e.durationSeconds >= minNoteDuration)
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

  if (validEvents.length === 0) {
    return `${sectionName}:${instrument}@|0|{\n    <${grid}*>\n    0\n}`;
  }

  // Calculate total slots needed
  const lastEvent = validEvents[validEvents.length - 1];
  const totalDuration = lastEvent.startTimeSeconds + lastEvent.durationSeconds;
  const rawTotalSlots = Math.ceil(totalDuration / slotDuration);
  // Round up to nearest whole measure
  const slotsPerMeasure = Math.round((grid / 4) * beatsPerMeasure);
  const totalSlots = Math.max(
    slotsPerMeasure,
    Math.ceil(rawTotalSlots / slotsPerMeasure) * slotsPerMeasure
  );

  // Initialize timeline slots with null
  interface SlotInfo {
    token: string;
    isNoteStart: boolean;
  }
  const slots: (SlotInfo | null)[] = new Array(totalSlots).fill(null);

  for (const ev of validEvents) {
    const startSlot = Math.max(0, Math.round(ev.startTimeSeconds / slotDuration));
    const durationSlots = Math.max(1, Math.round(ev.durationSeconds / slotDuration));
    const jianpu = midiPitchToJianpu(Math.round(ev.pitchMidi), key, options.snapToScale ?? false);

    if (startSlot < totalSlots) {
      slots[startSlot] = { token: jianpu, isNoteStart: true };
      for (let s = 1; s < durationSlots && startSlot + s < totalSlots; s++) {
        if (!slots[startSlot + s]) {
          slots[startSlot + s] = { token: "-", isNoteStart: false };
        }
      }
    }
  }

  // Fill remaining empty slots with rests ("0")
  const measureTokens: string[][] = [];
  let currentMeasure: string[] = [];

  for (let i = 0; i < totalSlots; i++) {
    const slot = slots[i];
    const tok = slot ? slot.token : "0";
    currentMeasure.push(tok);

    if (currentMeasure.length === slotsPerMeasure) {
      measureTokens.push(currentMeasure);
      currentMeasure = [];
    }
  }
  if (currentMeasure.length > 0) {
    while (currentMeasure.length < slotsPerMeasure) {
      currentMeasure.push("0");
    }
    measureTokens.push(currentMeasure);
  }

  const lines = measureTokens.map((m) => `    | ${m.join(" ")} |`);
  return `${sectionName}:${instrument}@|0|{\n    <${grid}*>\n${lines.join("\n")}\n}`;
}

/**
 * Resamples an AudioBuffer to a target sample rate (e.g. 22050 Hz for Basic Pitch)
 * using OfflineAudioContext.
 */
export async function resampleAudioBuffer(
  audioBuffer: AudioBuffer,
  targetSampleRate: number = 22050
): Promise<AudioBuffer> {
  if (audioBuffer.sampleRate === targetSampleRate) {
    return audioBuffer;
  }

  const OfflineCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const numChannels = 1; // Basic pitch is mono
  const targetLength = Math.ceil((audioBuffer.duration * targetSampleRate));

  const offlineContext = new OfflineCtx(numChannels, targetLength, targetSampleRate);
  const bufferSource = offlineContext.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.connect(offlineContext.destination);
  bufferSource.start(0);

  return await offlineContext.startRendering();
}
