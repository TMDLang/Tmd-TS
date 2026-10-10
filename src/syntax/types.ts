export interface Beat {
  count: number;
  noteValue: number;
}

export enum Accidental {
  Natural = "natural",
  Sharp = "sharp",
  Flat = "flat"
}

export function accidentalToSemitone(acc: Accidental): number {
  switch (acc) {
    case Accidental.Natural: return 0;
    case Accidental.Sharp: return 1;
    case Accidental.Flat: return -1;
  }
}

export enum ScaleDegree {
  C = 1,
  D = 2,
  E = 3,
  F = 4,
  G = 5,
  A = 6,
  B = 7
}

export function scaleDegreeLetter(degree: ScaleDegree): string {
  switch (degree) {
    case ScaleDegree.C: return "C";
    case ScaleDegree.D: return "D";
    case ScaleDegree.E: return "E";
    case ScaleDegree.F: return "F";
    case ScaleDegree.G: return "G";
    case ScaleDegree.A: return "A";
    case ScaleDegree.B: return "B";
  }
}

export function letterToScaleDegree(letter: string): ScaleDegree | null {
  switch (letter.toUpperCase()) {
    case "C": return ScaleDegree.C;
    case "D": return ScaleDegree.D;
    case "E": return ScaleDegree.E;
    case "F": return ScaleDegree.F;
    case "G": return ScaleDegree.G;
    case "A": return ScaleDegree.A;
    case "B": return ScaleDegree.B;
    default: return null;
  }
}

export function scaleDegreeSemitoneOffset(degree: ScaleDegree): number {
  return [0, 2, 4, 5, 7, 9, 11][degree - 1];
}

export class KeySignature {
  tonic: ScaleDegree;
  accidental: Accidental;

  constructor(tonic: ScaleDegree = ScaleDegree.C, accidental: Accidental = Accidental.Natural) {
    this.tonic = tonic;
    this.accidental = accidental;
  }

  static parse(str: string): KeySignature {
    const trimmed = str.trim();
    if (!trimmed.length) return new KeySignature();
    const tonic = letterToScaleDegree(trimmed[0]);
    if (!tonic) return new KeySignature();

    let accidental = Accidental.Natural;
    if (trimmed.includes("'") || trimmed.includes("#")) {
      accidental = Accidental.Sharp;
    } else if (trimmed.includes(",") || trimmed.includes("b")) {
      accidental = Accidental.Flat;
    }
    return new KeySignature(tonic, accidental);
  }

  get semitoneOffset(): number {
    return scaleDegreeSemitoneOffset(this.tonic) + accidentalToSemitone(this.accidental);
  }

  toString(): string {
    const letName = scaleDegreeLetter(this.tonic);
    switch (this.accidental) {
      case Accidental.Natural: return letName;
      case Accidental.Sharp: return `${letName}'`;
      case Accidental.Flat: return `${letName},`;
    }
  }
}

export class ChordRoot {
  degree: ScaleDegree;
  accidental: Accidental;
  octave: number;
  isScaleDegree: boolean;

  constructor(
    degree: ScaleDegree = ScaleDegree.C,
    accidental: Accidental = Accidental.Natural,
    octave: number = 0,
    isScaleDegree: boolean = false
  ) {
    this.degree = degree;
    this.accidental = accidental;
    this.octave = octave;
    this.isScaleDegree = isScaleDegree;
  }

  get semitoneOffset(): number {
    return scaleDegreeSemitoneOffset(this.degree) + accidentalToSemitone(this.accidental) + (this.octave * 12);
  }

  toString(): string {
    const base = this.isScaleDegree ? String(this.degree) : scaleDegreeLetter(this.degree);
    const acc = this.accidental === Accidental.Sharp ? "'" : this.accidental === Accidental.Flat ? "," : "";
    const oct = this.octave > 0 ? "^".repeat(this.octave) : this.octave < 0 ? "_".repeat(-this.octave) : "";
    return `${base}${acc}${oct}`;
  }
}

export type ChordQualityKind =
  | "major"
  | "minor"
  | "dominant7"
  | "major7"
  | "minor7"
  | "diminished"
  | "halfDiminished"
  | "augmented"
  | "suspended"
  | "power"
  | string;

export function chordQualityIntervals(quality: ChordQualityKind): number[] {
  switch (quality) {
    case "major": return [0, 4, 7];
    case "minor": return [0, 3, 7];
    case "dominant7": return [0, 4, 7, 10];
    case "major7": return [0, 4, 7, 11];
    case "minor7": return [0, 3, 7, 10];
    case "diminished": return [0, 3, 6];
    case "halfDiminished": return [0, 3, 6, 10];
    case "augmented": return [0, 4, 8];
    case "suspended": return [0, 5, 7];
    case "power": return [0, 7];
    default: return [0, 4, 7];
  }
}

export class ChordSymbol {
  root: ChordRoot;
  quality: ChordQualityKind;
  bass?: ChordRoot;

  constructor(root: ChordRoot, quality: ChordQualityKind = "major", bass?: ChordRoot) {
    this.root = root;
    this.quality = quality;
    this.bass = bass;
  }

  static parseRoot(str: string): { root: ChordRoot; remaining: string } | null {
    if (!str.length) return null;
    const first = str[0];
    const isDegree = first >= "1" && first <= "7";
    const degree = isDegree ? (parseInt(first, 10) as ScaleDegree) : letterToScaleDegree(first);
    if (!degree) return null;

    let accidental = Accidental.Natural;
    let idx = 1;
    if (idx < str.length && ["'", "#", ",", "b"].includes(str[idx])) {
      accidental = (str[idx] === "'" || str[idx] === "#") ? Accidental.Sharp : Accidental.Flat;
      idx++;
    }

    let octave = 0;
    while (idx < str.length && (str[idx] === "_" || str[idx] === "^")) {
      if (str[idx] === "^") octave++;
      else if (str[idx] === "_") octave--;
      idx++;
    }

    const remaining = str.slice(idx);
    return { root: new ChordRoot(degree, accidental, octave, isDegree), remaining };
  }

  static parseQuality(suffix: string): ChordQualityKind {
    switch (suffix.toLowerCase()) {
      case "": return "major";
      case "m": return "minor";
      case "7": return "dominant7";
      case "maj7": return "major7";
      case "m7": return "minor7";
      case "dim": return "diminished";
      case "m7-5":
      case "ø": return "halfDiminished";
      case "aug":
      case "+": return "augmented";
      case "sus":
      case "sus4": return "suspended";
      case "5": return "power";
      default: return suffix;
    }
  }

  static parse(value: string): ChordSymbol {
    const str = value.trim();
    if (!str.length) {
      return new ChordSymbol(new ChordRoot(ScaleDegree.C), "");
    }

    if (str.includes("/")) {
      const parts = str.split("/");
      const mainPart = parts[0];
      const bassPart = parts.slice(1).join("/");

      const parsedMain = ChordSymbol.parseRoot(mainPart);
      if (parsedMain) {
        const parsedBass = ChordSymbol.parseRoot(bassPart);
        return new ChordSymbol(
          parsedMain.root,
          ChordSymbol.parseQuality(parsedMain.remaining),
          parsedBass?.root
        );
      }
    }

    const parsed = ChordSymbol.parseRoot(str);
    if (parsed) {
      return new ChordSymbol(parsed.root, ChordSymbol.parseQuality(parsed.remaining));
    }

    return new ChordSymbol(new ChordRoot(ScaleDegree.C), str);
  }

  toString(): string {
    let suffix = "";
    switch (this.quality) {
      case "major": suffix = ""; break;
      case "minor": suffix = "m"; break;
      case "dominant7": suffix = "7"; break;
      case "major7": suffix = "maj7"; break;
      case "minor7": suffix = "m7"; break;
      case "diminished": suffix = "dim"; break;
      case "halfDiminished": suffix = "m7-5"; break;
      case "augmented": suffix = "aug"; break;
      case "suspended": suffix = "sus"; break;
      case "power": suffix = "5"; break;
      default: suffix = this.quality; break;
    }
    const bassText = this.bass ? `/${this.bass.toString()}` : "";
    return `${this.root.toString()}${suffix}${bassText}`;
  }
}

export interface Note {
  accidental: Accidental;
  degree: ScaleDegree;
  octave: number;
}

export type Unit =
  | { type: "note"; note: Note }
  | { type: "multiNote"; notes: Note[] }
  | { type: "chord"; chord: ChordSymbol }
  | { type: "tie" }
  | { type: "rest" }
  | { type: "percussion"; pattern: string };

export interface UnitGroup {
  units: Unit[];
  length: number;
}

export type SectionDirectiveKind =
  | { type: "tempo"; bpm: number }
  | { type: "relativeTempo"; deltaBpm: number }
  | { type: "absoluteKey"; key: string }
  | { type: "relativeKey"; semitones: number }
  | { type: "explicitKey"; key: string }
  | { type: "dynamics"; mark: DynamicMark }
  | { type: "fixedPitch" }
  | { type: "timeSignature"; beat: Beat };

export type DynamicMark = "ppp" | "pp" | "p" | "mp" | "mf" | "f" | "ff" | "fff";

export interface SectionDirective {
  position: number;
  kind: SectionDirectiveKind;
}

export interface Section {
  noteLength: number;
  unitGroups: UnitGroup[];
  directives: SectionDirective[];
  barlinePositions?: number[];
}

export type EntryPitchMode = "transposing" | "fixed";

export const DEFAULT_INSTRUMENT = "Piano";
export const DEFAULT_TEMPO_BPM = 120;

export interface Entry {
  name: string;
  /** Canonical assignment name; undefined identifies a prototype. */
  assignment?: string;
  isPrototype?: boolean;
  pitchMode?: EntryPitchMode;
  start: number;
  sections: Section[];
  executionTime?: string;
  showProgram?: string;
  line?: number;
  column?: number;
}

export type SExprAtom = string | number;
export type SExpr = SExprAtom | SExpr[];

/** Canonical playback expression used to sequence sections and modifiers. */
export type Playback =
  | { type: "name"; name: string; line?: number; column?: number }
  | { type: "relative"; value: string; line?: number; column?: number }
  | { type: "absolute"; value: string; line?: number; column?: number }
  | { type: "macro"; expr: SExpr[]; line?: number; column?: number };

export interface Sheet {
  name: string;
  speed: number;
  keySignature: KeySignature;
  declaredKey?: string;
  beat: Beat;
  /** Canonical source entries. */
  entries: Entry[];
  /** Canonical playback expressions. */
  playback: Playback[];
  metadata: Record<string, string>;
  distinctAssignments?: () => string[];
}

export interface SpelledPitch {
  stepIndex: number;
  step: string;
  alter: number;
  octave: number;
  midiPitch: number;
}

export interface TonicScaleInfo {
  name: string;
  stepAccidentals: number[];
  degreeSteps: number[];
}

export const PitchMapping = {
  tmdKeyNames: ["C", "C'", "D", "E,", "E", "F", "F'", "G", "A,", "A", "B,", "B"],
  stepNames: ["C", "D", "E", "F", "G", "A", "B"],
  stepLowerNames: ["c", "d", "e", "f", "g", "a", "b"],
  naturalStepSemitones: [0, 2, 4, 5, 7, 9, 11],
  musicXMLSteps: ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"],
  musicXMLAlters: [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0],
  lilyPondNames: ["c", "cis", "d", "dis", "e", "f", "fis", "g", "gis", "a", "ais", "b"],
  abcUpperNames: ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"],
  abcLowerNames: ["c", "^c", "d", "^d", "e", "f", "^f", "g", "^g", "a", "^a", "b"],
  normalizedSemitone(semitone: number): number {
    return ((semitone % 12) + 12) % 12;
  },
  keyName(semitone: number): string {
    return this.tmdKeyNames[this.normalizedSemitone(semitone)];
  },
  tonicScaleInfo(keyOffset: number): TonicScaleInfo {
    switch (this.normalizedSemitone(keyOffset)) {
      case 0:
        return { name: "C", stepAccidentals: [0, 0, 0, 0, 0, 0, 0], degreeSteps: [0, 1, 2, 3, 4, 5, 6] };
      case 1:
        return { name: "Db", stepAccidentals: [0, -1, -1, 0, -1, -1, -1], degreeSteps: [1, 2, 3, 4, 5, 6, 0] };
      case 2:
        return { name: "D", stepAccidentals: [1, 0, 0, 1, 0, 0, 0], degreeSteps: [1, 2, 3, 4, 5, 6, 0] };
      case 3:
        return { name: "Eb", stepAccidentals: [0, 0, -1, 0, 0, -1, -1], degreeSteps: [2, 3, 4, 5, 6, 0, 1] };
      case 4:
        return { name: "E", stepAccidentals: [1, 1, 0, 1, 1, 0, 0], degreeSteps: [2, 3, 4, 5, 6, 0, 1] };
      case 5:
        return { name: "F", stepAccidentals: [0, 0, 0, 0, 0, 0, -1], degreeSteps: [3, 4, 5, 6, 0, 1, 2] };
      case 6:
        return { name: "F#", stepAccidentals: [1, 1, 1, 1, 1, 1, 0], degreeSteps: [3, 4, 5, 6, 0, 1, 2] };
      case 7:
        return { name: "G", stepAccidentals: [0, 0, 0, 1, 0, 0, 0], degreeSteps: [4, 5, 6, 0, 1, 2, 3] };
      case 8:
        return { name: "Ab", stepAccidentals: [0, -1, -1, 0, 0, -1, -1], degreeSteps: [5, 6, 0, 1, 2, 3, 4] };
      case 9:
        return { name: "A", stepAccidentals: [1, 0, 0, 1, 1, 0, 0], degreeSteps: [5, 6, 0, 1, 2, 3, 4] };
      case 10:
        return { name: "Bb", stepAccidentals: [0, 0, -1, 0, 0, 0, -1], degreeSteps: [6, 0, 1, 2, 3, 4, 5] };
      case 11:
        return { name: "B", stepAccidentals: [1, 1, 0, 1, 1, 1, 0], degreeSteps: [6, 0, 1, 2, 3, 4, 5] };
      default:
        return { name: "C", stepAccidentals: [0, 0, 0, 0, 0, 0, 0], degreeSteps: [0, 1, 2, 3, 4, 5, 6] };
    }
  },
  spellNote(note: Note, keyOffset: number): SpelledPitch {
    const info = this.tonicScaleInfo(keyOffset);
    const degIdx = Math.max(0, Math.min(6, note.degree - 1));
    const stepIndex = info.degreeSteps[degIdx];
    const alter = info.stepAccidentals[stepIndex] + accidentalToSemitone(note.accidental);
    const midiPitch = noteToMIDIPitch(note, keyOffset);
    const naturalSemitone = this.naturalStepSemitones[stepIndex];
    const octave = Math.round((midiPitch - naturalSemitone - alter) / 12) - 1;
    return {
      stepIndex,
      step: this.stepNames[stepIndex],
      alter,
      octave,
      midiPitch,
    };
  },
  spellChordRoot(
    chordRoot: ChordRoot,
    keyOffset: number,
    defaultLetterOctave = 3,
    defaultDegreeOctave = 4
  ): SpelledPitch {
    if (chordRoot.isScaleDegree) {
      return this.spellNote(
        {
          accidental: chordRoot.accidental,
          degree: chordRoot.degree,
          octave: chordRoot.octave + (defaultDegreeOctave - 4),
        },
        keyOffset
      );
    } else {
      const stepIndex = Math.max(0, Math.min(6, chordRoot.degree - 1));
      const alter = accidentalToSemitone(chordRoot.accidental);
      const octave = defaultLetterOctave + chordRoot.octave;
      const naturalSemitone = this.naturalStepSemitones[stepIndex];
      const midiPitch = (octave + 1) * 12 + naturalSemitone + alter;
      return {
        stepIndex,
        step: this.stepNames[stepIndex],
        alter,
        octave,
        midiPitch,
      };
    }
  },
  spellChordVoicing(chord: ChordSymbol, keyOffset: number): SpelledPitch[] {
    const rootPitch = this.spellChordRoot(chord.root, keyOffset, 3, 4);
    let intervals: Array<[number, number]>;
    switch (chord.quality) {
      case "minor":
        intervals = [[0, 0], [2, 3], [4, 7]];
        break;
      case "dominant7":
        intervals = [[0, 0], [2, 4], [4, 7], [6, 10]];
        break;
      case "major7":
        intervals = [[0, 0], [2, 4], [4, 7], [6, 11]];
        break;
      case "minor7":
        intervals = [[0, 0], [2, 3], [4, 7], [6, 10]];
        break;
      case "diminished":
        intervals = [[0, 0], [2, 3], [4, 6]];
        break;
      case "halfDiminished":
        intervals = [[0, 0], [2, 3], [4, 6], [6, 10]];
        break;
      case "augmented":
        intervals = [[0, 0], [2, 4], [4, 8]];
        break;
      case "suspended":
        intervals = [[0, 0], [3, 5], [4, 7]];
        break;
      case "power":
        intervals = [[0, 0], [4, 7]];
        break;
      case "major":
      default:
        intervals = [[0, 0], [2, 4], [4, 7]];
        break;
    }

    const pitches: SpelledPitch[] = intervals.map(([diatonicSteps, semitones]) => {
      const totalSteps = rootPitch.stepIndex + diatonicSteps;
      const memberStepIndex = totalSteps % 7;
      const memberOctave = rootPitch.octave + Math.floor(totalSteps / 7);
      const memberMidi = rootPitch.midiPitch + semitones;
      const naturalMidi = (memberOctave + 1) * 12 + this.naturalStepSemitones[memberStepIndex];
      const memberAlter = memberMidi - naturalMidi;
      return {
        stepIndex: memberStepIndex,
        step: this.stepNames[memberStepIndex],
        alter: memberAlter,
        octave: memberOctave,
        midiPitch: memberMidi,
      };
    });

    if (chord.bass) {
      const bassPitch = this.spellChordRoot(chord.bass, keyOffset, 2, 2);
      if (!pitches.some((p) => p.midiPitch === bassPitch.midiPitch)) {
        pitches.unshift(bassPitch);
      }
    }
    return pitches;
  },
  lilyPondPitch(spelled: SpelledPitch): string {
    const base = this.stepLowerNames[Math.max(0, Math.min(6, spelled.stepIndex))];
    let acc = "";
    if (spelled.alter === 1) acc = "is";
    else if (spelled.alter >= 2) acc = "isis";
    else if (spelled.alter === -1) acc = "es";
    else if (spelled.alter <= -2) acc = "eses";

    let oct = "";
    if (spelled.octave > 3) {
      oct = "'".repeat(spelled.octave - 3);
    } else if (spelled.octave < 3) {
      oct = ",".repeat(3 - spelled.octave);
    }
    return `${base}${acc}${oct}`;
  },
  keySignatureToFifths(key: string): number {
    const trimmed = key.trim().toUpperCase();
    switch (trimmed) {
      case "C": return 0;
      case "G": return 1;
      case "D": return 2;
      case "A": return 3;
      case "E": return 4;
      case "B": return 5;
      case "F#":
      case "F'": return 6;
      case "C#":
      case "C'": return 7;
      case "F": return -1;
      case "BB":
      case "B,":
      case "A#":
      case "A'": return -2;
      case "EB":
      case "E,": return -3;
      case "AB":
      case "A,": return -4;
      case "DB":
      case "D,": return -5;
      case "GB":
      case "G,": return -6;
      case "CB":
      case "C,": return -7;
      default: return 0;
    }
  },
  parseKeyModeAndFifths(key: string): { fifths: number; mode: "major" | "minor" } {
    let root = key.trim();
    let isMinor = false;
    if (root.endsWith("m") && !root.toLowerCase().endsWith("maj")) {
      isMinor = true;
      root = root.slice(0, -1).trim();
    } else if (root.toLowerCase().endsWith("minor")) {
      isMinor = true;
      root = root.slice(0, -5).trim();
    } else if (root.toLowerCase().endsWith("min")) {
      isMinor = true;
      root = root.slice(0, -3).trim();
    } else if (root.toLowerCase().endsWith("major")) {
      root = root.slice(0, -5).trim();
    }

    if (isMinor) {
      const normalizedRoot = root.toUpperCase();
      let minorFifths: number;
      switch (normalizedRoot) {
        case "A": minorFifths = 0; break;
        case "E": minorFifths = 1; break;
        case "B": minorFifths = 2; break;
        case "F#":
        case "F'": minorFifths = 3; break;
        case "C#":
        case "C'": minorFifths = 4; break;
        case "G#":
        case "G'": minorFifths = 5; break;
        case "D#":
        case "D'": minorFifths = 6; break;
        case "A#":
        case "A'": minorFifths = 7; break;
        case "D": minorFifths = -1; break;
        case "G": minorFifths = -2; break;
        case "C": minorFifths = -3; break;
        case "F": minorFifths = -4; break;
        case "BB":
        case "B,": minorFifths = -5; break;
        case "EB":
        case "E,": minorFifths = -6; break;
        case "AB":
        case "A,": minorFifths = -7; break;
        default:
          minorFifths = this.keySignatureToFifths(root) - 3;
          break;
      }
      return { fifths: minorFifths, mode: "minor" };
    }
    return { fifths: this.keySignatureToFifths(root), mode: "major" };
  },
  keySignatureStepAlters(key: string): number[] {
    const { fifths } = this.parseKeyModeAndFifths(key);
    const alters = [0, 0, 0, 0, 0, 0, 0];
    if (fifths > 0) {
      const sharpOrder = [3, 0, 4, 1, 5, 2, 6]; // F, C, G, D, A, E, B
      for (let i = 0; i < Math.min(7, fifths); i++) {
        alters[sharpOrder[i]] = 1;
      }
    } else if (fifths < 0) {
      const flatOrder = [6, 2, 5, 1, 4, 0, 3]; // B, E, A, D, G, C, F
      for (let i = 0; i < Math.min(7, -fifths); i++) {
        alters[flatOrder[i]] = -1;
      }
    }
    return alters;
  },
  semitoneToDegreeAccidental(semitone: number): { degree: ScaleDegree; accidental: Accidental } {
    switch (this.normalizedSemitone(semitone)) {
      case 0: return { degree: ScaleDegree.C, accidental: Accidental.Natural };
      case 1: return { degree: ScaleDegree.C, accidental: Accidental.Sharp };
      case 2: return { degree: ScaleDegree.D, accidental: Accidental.Natural };
      case 3: return { degree: ScaleDegree.D, accidental: Accidental.Sharp };
      case 4: return { degree: ScaleDegree.E, accidental: Accidental.Natural };
      case 5: return { degree: ScaleDegree.F, accidental: Accidental.Natural };
      case 6: return { degree: ScaleDegree.F, accidental: Accidental.Sharp };
      case 7: return { degree: ScaleDegree.G, accidental: Accidental.Natural };
      case 8: return { degree: ScaleDegree.G, accidental: Accidental.Sharp };
      case 9: return { degree: ScaleDegree.A, accidental: Accidental.Natural };
      case 10: return { degree: ScaleDegree.B, accidental: Accidental.Flat };
      case 11: return { degree: ScaleDegree.B, accidental: Accidental.Natural };
      default: throw new Error("Normalized semitone must be between 0 and 11");
    }
  },
  accidentalSymbol(accidental: Accidental): string {
    switch (accidental) {
      case Accidental.Natural: return "";
      case Accidental.Sharp: return "'";
      case Accidental.Flat: return ",";
    }
  }
};

export function noteToMIDIPitch(note: Note, keyOffset: number): number {
  return 60 + keyOffset + scaleDegreeSemitoneOffset(note.degree) + accidentalToSemitone(note.accidental) + note.octave * 12;
}

export function noteToTotalSemitones(note: Note): number {
  return scaleDegreeSemitoneOffset(note.degree) + accidentalToSemitone(note.accidental) + note.octave * 12;
}

