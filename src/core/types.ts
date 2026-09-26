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

export interface Paragraph {
  name: string;
  instrument: string;
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

export type Entry = Paragraph;

export function entryAssignment(entry: Entry): string | undefined {
  return entry.instrument || undefined;
}

export type SExprAtom = string | number;
export type SExpr = SExprAtom | SExpr[];

export type Order =
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
  paragraphs: Paragraph[];
  orders: Order[];
  metadata: Record<string, string>;
  entries?: Entry[];
  distinctAssignments?: () => string[];
}

export const PitchMapping = {
  musicXMLSteps: ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"],
  musicXMLAlters: [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0],
  lilyPondNames: ["c", "cis", "d", "dis", "e", "f", "fis", "g", "gis", "a", "ais", "b"],
  abcUpperNames: ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"],
  abcLowerNames: ["c", "^c", "d", "^d", "e", "f", "^f", "g", "^g", "a", "^a", "b"]
};
