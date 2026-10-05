import { KeySignature } from "../../../src/syntax/types.js";

export interface VirtualKeyInfo {
  midi: number;
  noteName: string;
  degreeLabel: string;
  tmdNote: string;
  isBlack: boolean;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const IS_BLACK_KEY = [false, true, false, true, false, false, true, false, true, false, true, false];

/**
 * Maps scale degree interval (0..11) in major scale to TMD scale degree + accidental.
 * Standard major scale intervals:
 * 0 -> 1
 * 1 -> 1'
 * 2 -> 2
 * 3 -> 2' (or 3,)
 * 4 -> 3
 * 5 -> 4
 * 6 -> 4'
 * 7 -> 5
 * 8 -> 5'
 * 9 -> 6
 * 10 -> 7, (flat 7) or 6'
 * 11 -> 7
 */
interface DegreeAccidental {
  degree: number; // 1..7
  accidental: string; // "", "'", or ","
}

const INTERVAL_TO_DEGREE: Record<number, DegreeAccidental> = {
  0: { degree: 1, accidental: "" },
  1: { degree: 1, accidental: "'" },
  2: { degree: 2, accidental: "" },
  3: { degree: 2, accidental: "'" },
  4: { degree: 3, accidental: "" },
  5: { degree: 4, accidental: "" },
  6: { degree: 4, accidental: "'" },
  7: { degree: 5, accidental: "" },
  8: { degree: 5, accidental: "'" },
  9: { degree: 6, accidental: "" },
  10: { degree: 7, accidental: "," },
  11: { degree: 7, accidental: "" },
};

export function parseKeyOffset(keySignatureStr: string): number {
  try {
    const keySig = KeySignature.parse(keySignatureStr || "C");
    return keySig.semitoneOffset;
  } catch {
    return 0;
  }
}

/**
 * Converts a MIDI pitch (e.g. 60) and key signature (e.g. "C") to a TMD note string.
 * TMD syntax rules:
 * - Accidental comes FIRST, then octave displacement (e.g. 1'^, 7,_, 1__)
 * - Middle C (60) in Key C is degree 1, octave 0.
 * - Higher octaves: ^, ^^ ... Lower octaves: _, __ ...
 */
export function midiToTmdNote(midi: number, keySignatureStr: string = "C"): string {
  const keyOffset = parseKeyOffset(keySignatureStr);
  // Base MIDI pitch of Key 1 in octave 4 is 60 + keyOffset
  const baseTonicMidi = 60 + keyOffset;
  const relativePitch = midi - baseTonicMidi;

  // Semitones within octave [0..11]
  const semitoneInOctave = ((relativePitch % 12) + 12) % 12;
  // Octave difference relative to base tonic
  const octaveDiff = Math.floor(relativePitch / 12);

  const mapping = INTERVAL_TO_DEGREE[semitoneInOctave];
  let octaveStr = "";
  if (octaveDiff > 0) {
    octaveStr = "^".repeat(octaveDiff);
  } else if (octaveDiff < 0) {
    octaveStr = "_".repeat(-octaveDiff);
  }

  return `${mapping.degree}${mapping.accidental}${octaveStr}`;
}

/**
 * Formats note name and degree label for display on a virtual key.
 */
export function midiToNoteLabel(
  midi: number,
  keySignatureStr: string = "C"
): { noteName: string; degreeLabel: string; isBlack: boolean } {
  const semitone = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const noteName = `${NOTE_NAMES[semitone]}${octave}`;
  const isBlack = IS_BLACK_KEY[semitone];
  const tmdNote = midiToTmdNote(midi, keySignatureStr);

  return {
    noteName,
    degreeLabel: tmdNote,
    isBlack,
  };
}

/**
 * Generates an array of keys spanning the specified number of octaves from baseOctave.
 * E.g., baseOctave = 4, octaves = 2 -> C4 to C6 (25 keys total: 24 keys + top C).
 */
export function generateKeyboardKeys(
  baseOctave: number = 4,
  octaves: number = 2,
  keySignatureStr: string = "C"
): VirtualKeyInfo[] {
  const startMidi = (baseOctave + 1) * 12; // C4 is MIDI 60 ( (4 + 1) * 12 = 60 )
  const totalKeys = octaves * 12 + 1; // inclusive of highest C

  const keys: VirtualKeyInfo[] = [];
  for (let i = 0; i < totalKeys; i++) {
    const midi = startMidi + i;
    const { noteName, degreeLabel, isBlack } = midiToNoteLabel(midi, keySignatureStr);
    const tmdNote = midiToTmdNote(midi, keySignatureStr);
    keys.push({
      midi,
      noteName,
      degreeLabel,
      tmdNote,
      isBlack,
    });
  }

  return keys;
}

/**
 * Calculates how many white keys comfortably fit in a container of containerWidth px.
 * Uses ~38px per white key (36px width + 2px margin) with padding.
 * Minimum 8 white keys, maximum 52 white keys (full 88-key piano has 52 white keys).
 */
export function calculateWhiteKeyCountForWidth(containerWidth: number): number {
  const availableWidth = Math.max(0, containerWidth - 24); // Account for side padding
  const keyWidth = 38;
  const count = Math.floor(availableWidth / keyWidth);
  return Math.max(8, Math.min(52, count));
}

/**
 * Generates keys covering targetWhiteKeyCount white keys starting at baseOctave C.
 */
export function generateDynamicKeyboardKeys(
  baseOctave: number = 4,
  targetWhiteKeyCount: number = 15,
  keySignatureStr: string = "C"
): VirtualKeyInfo[] {
  const startMidi = (baseOctave + 1) * 12; // C of baseOctave
  const keys: VirtualKeyInfo[] = [];

  let currentMidi = startMidi;
  let whiteCount = 0;

  while (whiteCount < targetWhiteKeyCount && currentMidi <= 108) {
    const { noteName, degreeLabel, isBlack } = midiToNoteLabel(currentMidi, keySignatureStr);
    const tmdNote = midiToTmdNote(currentMidi, keySignatureStr);

    keys.push({
      midi: currentMidi,
      noteName,
      degreeLabel,
      tmdNote,
      isBlack,
    });

    if (!isBlack) {
      whiteCount++;
    }
    currentMidi++;
  }

  return keys;
}
