import { KeySignature, PitchMapping, ScaleDegree, scaleDegreeSemitoneOffset } from "../syntax/types.js";
import { containsTransposableUnit, measureUnits, parseTupletToken } from "./unit_helpers.js";

export interface TmdTransposeOptions {
  semitones?: number;
  diatonicSteps?: number;
  keySignature?: string;
  updateKeySignature?: boolean;
  section?: string;
  instrument?: string;
}

export function transposeSource(
  source: string,
  options: TmdTransposeOptions,
  formatSource: (source: string) => string,
): string {
    const semitones = options.semitones ?? 0;
    const diatonicSteps = options.diatonicSteps ?? 0;
    if (semitones === 0 && diatonicSteps === 0 && !options.updateKeySignature) {
      return source;
    }

    // Determine current key signature if present
    let currentKeySig = options.keySignature || "C";
    const keyMatch = source.match(/(?:^|\n)\s*\?=\s*([A-Ga-g0-9',#b]+)/);
    if (keyMatch) {
      currentKeySig = keyMatch[1];
    }

    const rawLines = source.split(/\r?\n/);
    const resultLines: string[] = [];

    let insideParagraph = false;
    let inMatchingPara = true;

    // Check if source is a snippet (no ::SCORE:: and no paragraph header)
    const isFullScore = source.includes("::SCORE::") || /(^|\n)\s*[a-zA-Z0-9_\u4e00-\u9fa5-]+:[a-zA-Z0-9_\u4e00-\u9fa5-]+@/.test(source);

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();

      // If full score and updateKeySignature is requested, update global ?= line
      if (options.updateKeySignature && (trimmed.startsWith("?=") || trimmed.startsWith("? ="))) {
        const indent = rawLine.match(/^\s*/)?.[0] || "";
        const oldKeyStr = (trimmed.startsWith("? =") ? trimmed.slice(3) : trimmed.slice(2)).trim();
        const newKeyStr = transposeKeySignature(oldKeyStr, semitones);
        resultLines.push(`${indent}?= ${newKeyStr}`);
        currentKeySig = newKeyStr;
        continue;
      }

      // Paragraph Header
      const paraMatch = trimmed.match(
        /^([a-zA-Z0-9_\u4e00-\u9fa5-]+)\s*:\s*([a-zA-Z0-9_\u4e00-\u9fa5-]+)(@[^{]*)?\s*\{/
      );
      if (paraMatch) {
        insideParagraph = true;
        const pSec = paraMatch[1];
        const pInst = paraMatch[2];
        inMatchingPara =
          (!options.section || options.section === pSec) &&
          (!options.instrument || options.instrument === pInst);
        resultLines.push(rawLine);
        continue;
      }

      if (trimmed === "}") {
        insideParagraph = false;
        inMatchingPara = true;
        resultLines.push(rawLine);
        continue;
      }

      // Transpose measure / unit lines if within target scope
      if ((!isFullScore || (insideParagraph && inMatchingPara)) && containsTransposableUnit(trimmed)) {
        const indent = rawLine.match(/^\s*/)?.[0] || "";
        const transformed = transposeUnitsInLine(trimmed, {
          semitones,
          diatonicSteps,
          keySignature: currentKeySig,
        });
        resultLines.push(indent + transformed);
        continue;
      }

      resultLines.push(rawLine);
    }

    const output = resultLines.join("\n");
    if (isFullScore) {
      return formatSource(output);
    }
    return output;
  }

function transposeKeySignature(keyStr: string, semitones: number): string {
  const currentKey = KeySignature.parse(keyStr || "C");
  const oldOffset = currentKey.semitoneOffset;
  const newOffset = ((oldOffset + semitones) % 12 + 12) % 12;
  return PitchMapping.keyName(newOffset);
}

function transposeTmdNote(
  noteStr: string,
  options: { semitones: number; diatonicSteps: number; keySignature: string }
): string {
  // Parse noteStr e.g. "1", "1'", "1'^", "7,_", "3^^"
  const match = noteStr.match(/^([1-7])(['#,]*)(\^*|_*)?$/);
  if (!match) return noteStr;

  const deg = parseInt(match[1], 10);
  const acc = match[2] || "";
  const oct = match[3] || "";

  let octaveDelta = 0;
  if (oct.startsWith("^")) {
    octaveDelta = oct.length;
  } else if (oct.startsWith("_")) {
    octaveDelta = -oct.length;
  }

  // Case 1: Pure diatonic scale degree transpose (e.g. diatonicSteps: +1)
  if (options.diatonicSteps !== 0 && options.semitones === 0) {
    const zeroIndexed = deg - 1;
    const newZero = zeroIndexed + options.diatonicSteps;
    const newDeg = (((newZero % 7) + 7) % 7) + 1;
    const addedOctaves = Math.floor(newZero / 7);
    const finalOctave = octaveDelta + addedOctaves;

    let newOctStr = "";
    if (finalOctave > 0) newOctStr = "^".repeat(finalOctave);
    else if (finalOctave < 0) newOctStr = "_".repeat(-finalOctave);

    return `${newDeg}${acc}${newOctStr}`;
  }

  // Case 2: Semitone chromatic transposition
  let accSemitone = 0;
  if (acc.includes("'") || acc.includes("#")) accSemitone = 1;
  else if (acc.includes(",")) accSemitone = -1;

  // Semitone position relative to tonic of key
  const baseDegreeSemitone = scaleDegreeSemitoneOffset(deg as ScaleDegree) + accSemitone;
  const totalSemitonesRelTonic = baseDegreeSemitone + octaveDelta * 12 + options.semitones;

  const semitoneInOct = ((totalSemitonesRelTonic % 12) + 12) % 12;
  const finalOctave = Math.floor(totalSemitonesRelTonic / 12);

  const mapped = PitchMapping.semitoneToDegreeAccidental(semitoneInOct);
  let newOctStr = "";
  if (finalOctave > 0) newOctStr = "^".repeat(finalOctave);
  else if (finalOctave < 0) newOctStr = "_".repeat(-finalOctave);

  return `${mapped.degree}${PitchMapping.accidentalSymbol(mapped.accidental)}${newOctStr}`;
}

function transposeTmdNoteUnit(
  unit: string,
  options: { semitones: number; diatonicSteps: number; keySignature: string }
): string {
  const tieStart = unit.indexOf("-");
  if (tieStart < 0) return transposeTmdNote(unit, options);
  return transposeTmdNote(unit.slice(0, tieStart), options) + unit.slice(tieStart);
}

function transposeChordToken(
  chordStr: string,
  options: { semitones: number; diatonicSteps: number }
): string {
  // chordStr like "[C]", "[Cmaj7]", "[1]", "[6m]"
  const inner = chordStr.slice(1, -1).trim();
  if (inner.length === 0) return chordStr;

  const firstChar = inner[0];
  const isNumbered = firstChar >= "1" && firstChar <= "7";

  if (isNumbered) {
    if (options.diatonicSteps !== 0 && options.semitones === 0) {
      const match = inner.match(/^([1-7])(.*)$/);
      if (!match) return chordStr;
      const deg = parseInt(match[1], 10);
      const suffix = match[2];
      const newDeg = ((((deg - 1 + options.diatonicSteps) % 7) + 7) % 7) + 1;
      return `[${newDeg}${suffix}]`;
    }
    // For semitone transposition on numbered chords, convert to letter chord or diatonic shift
    return chordStr;
  }

  // Letter chord: e.g. C, C#, Db, Am, G7, F#m7
  const match = inner.match(/^([A-Ga-g][',#b]?)(.*)$/);
  if (!match) return chordStr;

  const rootLetter = match[1];
  const suffix = match[2];

  let letter = rootLetter[0].toUpperCase();
  let acc = rootLetter.slice(1);
  let semitoneOffset = [0, 2, 4, 5, 7, 9, 11][["C", "D", "E", "F", "G", "A", "B"].indexOf(letter)];
  if (acc === "'" || acc === "#") semitoneOffset += 1;
  else if (acc === "," || acc === "b") semitoneOffset -= 1;

  const newOffset = ((semitoneOffset + options.semitones) % 12 + 12) % 12;
  const offsetToLetter: Record<number, string> = {
    0: "C",
    1: "C#'",
    2: "D",
    3: "Eb",
    4: "E",
    5: "F",
    6: "F#'",
    7: "G",
    8: "Ab",
    9: "A",
    10: "Bb",
    11: "B",
  };
  // Normalize C#' -> C#
  let newRoot = offsetToLetter[newOffset].replace("'", "");
  return `[${newRoot}${suffix}]`;
}

function transposeUnitsInLine(
  line: string,
  options: { semitones: number; diatonicSteps: number; keySignature: string }
): string {
  let working = line;
  let commentSuffix = "";
  const commentStart = working.indexOf("/*");
  if (commentStart !== -1) {
    commentSuffix = " " + working.slice(commentStart);
    working = working.slice(0, commentStart).trim();
  }

  const tokens = measureUnits(working);
  const outTokens: string[] = [];

  for (const tok of tokens) {
    if (tok === "|") {
      outTokens.push("|");
      continue;
    }

    if (tok.startsWith("[") && tok.endsWith("]")) {
      outTokens.push(transposeChordToken(tok, options));
      continue;
    }

    const tuplet = parseTupletToken(tok);
    if (tuplet) {
      // Tuplet inner units: (1 2 3)%(--)
      const innerTokens = measureUnits(tuplet.inner);
      const transposedInner = innerTokens.map((t) => {
        if (/^[1-7]/.test(t)) {
          return transposeTmdNoteUnit(t, options);
        }
        if (t.startsWith("[") && t.endsWith("]")) {
          return transposeChordToken(t, options);
        }
        return t;
      });
      const dashSuffix = tuplet.dashes ? `%(${tuplet.dashes})` : "";
      outTokens.push(`(${transposedInner.join(" ")})${dashSuffix}`);
      continue;
    }

    if (/^[1-7]/.test(tok)) {
      outTokens.push(transposeTmdNoteUnit(tok, options));
      continue;
    }

    outTokens.push(tok);
  }

  return outTokens.join(" ") + commentSuffix;
}
