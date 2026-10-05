import { formatParagraph,formatSheet } from "../syntax/format.js";
import { Lexer, TmdParser } from "../syntax/parser.js";
import {
  Entry,
  KeySignature,
  PitchMapping,
  ScaleDegree,
  scaleDegreeSemitoneOffset,
  Sheet,
  UnitGroup,
} from "../syntax/types.js";
import { escapeRegex, formatLine, formatMusicalUnits, reindentBlockComment } from "./format_helpers.js";

export class TmdRefactorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TmdRefactorError";
  }
}


export class TmdRefactor {
  public static format(source: string): string {
    const resultLines: string[] = [];
    const rawLines = source.split(/\r?\n/);
    let inProgramBlock = false;
    let indentLevel = 0;
    let i = 0;

    while (i < rawLines.length) {
      const line = rawLines[i];
      const trimmed = line.trim();

      if (trimmed.includes('"""')) {
        const occurrences = trimmed.split('"""').length - 1;
        if (occurrences % 2 !== 0) {
          inProgramBlock = !inProgramBlock;
        }
        resultLines.push(line);
        i++;
        continue;
      }

      if (inProgramBlock) {
        resultLines.push(line);
        i++;
        continue;
      }

      if (trimmed.length === 0) {
        resultLines.push("");
        i++;
        continue;
      }

      if (trimmed === "}") {
        indentLevel = Math.max(0, indentLevel - 1);
        resultLines.push(formatLine(line, 0));
        i++;
        continue;
      }

      // If line is starting a standalone block comment
      if (trimmed.startsWith("/*")) {
        const commentLines = [line];
        if (!trimmed.includes("*/") || trimmed === "/*") {
          let j = i + 1;
          while (j < rawLines.length) {
            commentLines.push(rawLines[j]);
            if (rawLines[j].includes("*/")) {
              break;
            }
            j++;
          }
          i = j + 1;
        } else {
          i++;
        }
        const indent = "    ".repeat(indentLevel);
        resultLines.push(...reindentBlockComment(commentLines, indent));
        continue;
      }

      const formattedLine = formatLine(line, indentLevel);
      resultLines.push(formattedLine);

      if (trimmed.endsWith("{")) {
        indentLevel++;
      }
      i++;
    }

    // Clean up excessive empty lines (> 2 consecutive empty lines to 1)
    const finalLines: string[] = [];
    let emptyCount = 0;
    for (const l of resultLines) {
      if (l.trim().length === 0) {
        emptyCount++;
        if (emptyCount <= 1) {
          finalLines.push("");
        }
      } else {
        emptyCount = 0;
        finalLines.push(l);
      }
    }

    return finalLines.join("\n") + "\n";
  }

  public static renameInstrument(
    source: string,
    oldInstrument: string,
    newInstrument: string
  ): string {
    const pattern = new RegExp(
      "([A-Za-z0-9_\\-\\u4e00-\\u9fa5]+)\\s*:\\s*" +
        escapeRegex(oldInstrument) +
        "\\s*@",
      "g"
    );

    const replaced = source.replace(pattern, `$1:${newInstrument}@`);
    if (replaced === source) {
      // Check if score even parses
      TmdParser.parseThrowing(source);
    }
    // Verify valid TMD score after rename
    TmdParser.parseThrowing(replaced);
    return replaced;
  }

  public static renameSection(
    source: string,
    oldSection: string,
    newSection: string
  ): string {
    // 1. Rename in paragraph declarations: <oldSection>:<instrument>@... -> <newSection>:<instrument>@...
    const paraPattern = new RegExp("(^|\\n)\\s*" + escapeRegex(oldSection) + "\\s*:", "g");
    let result = source.replace(paraPattern, `$1${newSection}:`);

    // 2. Rename in orders: `-> <oldSection> ` or `-> <oldSection>\n` or `-> <oldSection>->`
    const orderPattern = new RegExp("(->\\s*)" + escapeRegex(oldSection) + "(?=\\s*(->|->#|\\n|$))", "g");
    result = result.replace(orderPattern, `$1${newSection}`);

    // Verify valid TMD score after rename
    TmdParser.parseThrowing(result);
    return result;
  }

  public static extractInstrument(source: string, instrument: string): string {
    const sheet = TmdParser.parseThrowing(source);
    const matchingParagraphs = sheet.entries.filter((p) => p.assignment === instrument);
    if (matchingParagraphs.length === 0) {
      throw new TmdRefactorError(`Instrument '${instrument}' not found in score`);
    }

    const rawLines = source.split(/\r?\n/);
    const resultLines: string[] = [];
    let insideParagraph = false;
    let keepParagraph = false;

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();

      const paraMatch = trimmed.match(
        /^([a-zA-Z0-9_\u4e00-\u9fa5-]+)\s*:\s*([a-zA-Z0-9_\u4e00-\u9fa5-]+)(@[^{]*)?\s*\{/
      );
      if (paraMatch) {
        insideParagraph = true;
        const pInst = paraMatch[2];
        keepParagraph = pInst === instrument;
        if (keepParagraph) {
          resultLines.push(rawLine);
        }
        continue;
      }

      if (trimmed === "}") {
        if (insideParagraph && keepParagraph) {
          resultLines.push(rawLine);
        }
        insideParagraph = false;
        keepParagraph = false;
        continue;
      }

      if (insideParagraph) {
        if (keepParagraph) {
          resultLines.push(rawLine);
        }
        continue;
      }

      resultLines.push(rawLine);
    }

    const formatted = this.format(resultLines.join("\n"));
    TmdParser.parseThrowing(formatted);
    return formatted;
  }

  public static duplicateTrack(
    source: string,
    sourceInstrument: string,
    targetInstrument: string,
    options?: { section?: string; octaveShift?: number }
  ): string {
    const sheet = TmdParser.parseThrowing(source);
    let matching = sheet.entries.filter((p) => p.assignment === sourceInstrument);
    if (options?.section) {
      matching = matching.filter((p) => p.name === options.section);
    }
    if (matching.length === 0) {
      if (options?.section) {
        throw new TmdRefactorError(`Track '${options.section}:${sourceInstrument}' not found in score`);
      }
      throw new TmdRefactorError(`Instrument '${sourceInstrument}' not found in score`);
    }

    const shift = options?.octaveShift || 0;
    const duplicatedParagraphs: Entry[] = matching.map((orig) => {
      const clonedSections = orig.sections.map((sec) => ({
        noteLength: sec.noteLength,
        barlinePositions: [...(sec.barlinePositions ?? [])],
        directives: [...sec.directives],
        unitGroups: sec.unitGroups.map((g) => ({
          length: g.length,
          units: g.units.map((u) => {
            if (u.type === "note") {
              return {
                type: "note" as const,
                note: {
                  degree: u.note.degree,
                  accidental: u.note.accidental,
                  octave: u.note.octave + shift,
                },
              };
            }
            if (u.type === "multiNote") {
              return {
                type: "multiNote" as const,
                notes: u.notes.map((note) => ({ ...note, octave: note.octave + shift })),
              };
            }
            return u;
          }),
        })),
      }));

      return {
        name: orig.name,
        assignment: targetInstrument,
        start: orig.start,
        sections: clonedSections,
        executionTime: orig.executionTime,
        showProgram: orig.showProgram,
      };
    });

    const newParagraphsText = duplicatedParagraphs
      .map((p) => formatParagraph(p, sheet.beat))
      .join("\n");

    let combined: string;
    const orderMatch = source.search(/(^|\n)\s*->/);
    if (orderMatch !== -1) {
      const insertPos = orderMatch === 0 ? 0 : orderMatch + 1;
      combined = source.slice(0, insertPos) + "\n" + newParagraphsText + "\n" + source.slice(insertPos);
    } else {
      combined = source + "\n\n" + newParagraphsText;
    }

    const formatted = this.format(combined);
    TmdParser.parseThrowing(formatted);
    return formatted;
  }

  public static generateHarmony(
    source: string,
    sourceInstrument: string,
    harmonyInstrument: string,
    options: { section?: string; intervalSteps: number }
  ): string {
    const sheet = TmdParser.parseThrowing(source);
    let matching = sheet.entries.filter((p) => p.assignment === sourceInstrument);
    if (options?.section) {
      matching = matching.filter((p) => p.name === options.section);
    }
    if (matching.length === 0) {
      if (options?.section) {
        throw new TmdRefactorError(`Track '${options.section}:${sourceInstrument}' not found in score`);
      }
      throw new TmdRefactorError(`Instrument '${sourceInstrument}' not found in score`);
    }

    const steps = options.intervalSteps; // e.g. +2 for 3rd up, -2 for 3rd down
    const harmonizedParagraphs: Entry[] = matching.map((orig) => {
      const clonedSections = orig.sections.map((sec) => ({
        noteLength: sec.noteLength,
        barlinePositions: [...(sec.barlinePositions ?? [])],
        directives: [...sec.directives],
        unitGroups: sec.unitGroups.map((g) => ({
          length: g.length,
          units: g.units.map((u) => {
            if (u.type === "note") {
              const currentDeg = u.note.degree as number; // 1..7
              const zeroIndexed = currentDeg - 1; // 0..6
              const newZero = zeroIndexed + steps;
              const newDeg = (((newZero % 7) + 7) % 7) + 1;
              const octaveDelta = Math.floor(newZero / 7);

              return {
                type: "note" as const,
                note: {
                  degree: newDeg as ScaleDegree,
                  accidental: u.note.accidental,
                  octave: u.note.octave + octaveDelta,
                },
              };
            }
            if (u.type === "multiNote") {
              return {
                type: "multiNote" as const,
                notes: u.notes.map((note) => {
                  const currentDeg = note.degree as number;
                  const zeroIndexed = currentDeg - 1;
                  const newZero = zeroIndexed + steps;
                  const newDeg = (((newZero % 7) + 7) % 7) + 1;
                  const octaveDelta = Math.floor(newZero / 7);
                  return { ...note, degree: newDeg as ScaleDegree, octave: note.octave + octaveDelta };
                }),
              };
            }
            return u;
          }),
        })),
      }));

      return {
        name: orig.name,
        assignment: harmonyInstrument,
        start: orig.start,
        sections: clonedSections,
        executionTime: orig.executionTime,
        showProgram: orig.showProgram,
      };
    });

    const newParagraphsText = harmonizedParagraphs
      .map((p) => formatParagraph(p, sheet.beat))
      .join("\n");

    let combined: string;
    const orderMatch = source.search(/(^|\n)\s*->/);
    if (orderMatch !== -1) {
      const insertPos = orderMatch === 0 ? 0 : orderMatch + 1;
      combined = source.slice(0, insertPos) + "\n" + newParagraphsText + "\n" + source.slice(insertPos);
    } else {
      combined = source + "\n\n" + newParagraphsText;
    }

    const formatted = this.format(combined);
    TmdParser.parseThrowing(formatted);
    return formatted;
  }

  public static inlineOrders(source: string): string {
    const sheet = TmdParser.parseThrowing(source);
    if (sheet.playback.length === 0) {
      return source;
    }

    // Map instruments -> combined list of sections in linear playback sequence
    const instruments = Array.from(new Set(sheet.entries.map((p) => p.assignment).filter((value): value is string => Boolean(value))));
    const linearParagraphs: Entry[] = [];

    for (const inst of instruments) {
      const combinedSections: Entry["sections"] = [];
      const sourceEntries: Entry[] = [];

      for (const ord of sheet.playback) {
        if (ord.type !== "name") continue;
        const para = sheet.entries.find((p) => p.name === ord.name && p.assignment === inst);
        if (!para) continue;
        sourceEntries.push(para);

        for (const sec of para.sections) {
          combinedSections.push(JSON.parse(JSON.stringify(sec)) as Entry["sections"][number]);
        }
      }

      const pitchModes = new Set(sourceEntries.map((entry) => entry.pitchMode).filter(Boolean));
      const executionTimes = new Set(sourceEntries.map((entry) => entry.executionTime).filter(Boolean));
      const showPrograms = new Set(sourceEntries.map((entry) => entry.showProgram).filter(Boolean));

      linearParagraphs.push({
        name: "linear",
        assignment: inst,
        start: 0,
        sections: combinedSections,
        ...(pitchModes.size === 1 ? { pitchMode: [...pitchModes][0] } : {}),
        ...(executionTimes.size === 1 ? { executionTime: [...executionTimes][0] } : {}),
        ...(showPrograms.size === 1 ? { showProgram: [...showPrograms][0] } : {}),
      });
    }

    const newSheet: Sheet = {
      name: sheet.name,
      speed: sheet.speed,
      keySignature: sheet.keySignature,
      declaredKey: sheet.declaredKey,
      beat: sheet.beat,
      entries: linearParagraphs,
      playback: [{ type: "name", name: "linear" }],
      metadata: sheet.metadata,
    };

    return this.format(formatSheet(newSheet));
  }

  public static doubleGrid(
    source: string,
    target?: { section?: string; instrument?: string }
  ): string {
    const rawLines = source.split(/\r?\n/);
    const resultLines: string[] = [];

    let inMatchingPara = false;
    let insideParagraph = false;
    let currentNoteLength = 4;

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();

      // Check paragraph header: section:instrument@...{
      const paraMatch = trimmed.match(
        /^([a-zA-Z0-9_\u4e00-\u9fa5-]+)\s*:\s*([a-zA-Z0-9_\u4e00-\u9fa5-]+)(@[^{]*)?\s*\{/
      );
      if (paraMatch) {
        insideParagraph = true;
        const pSec = paraMatch[1];
        const pInst = paraMatch[2];
        inMatchingPara =
          (!target?.section || target.section === pSec) &&
          (!target?.instrument || target.instrument === pInst);
        currentNoteLength = 4;
        resultLines.push(rawLine);
        continue;
      }

      if (trimmed === "}") {
        insideParagraph = false;
        inMatchingPara = false;
        resultLines.push(rawLine);
        continue;
      }

      if (!insideParagraph || !inMatchingPara) {
        resultLines.push(rawLine);
        continue;
      }

      // Check section noteLength header: <4*> -> <8*>
      const gridMatch = trimmed.match(/^<(\d+)\*>/);
      if (gridMatch) {
        currentNoteLength = parseInt(gridMatch[1], 10);
        const newLen = currentNoteLength * 2;
        const indent = rawLine.match(/^\s*/)?.[0] || "";
        resultLines.push(`${indent}<${newLen}*>`);
        continue;
      }

      // If line is measure line / contains units
      if (trimmed.startsWith("|") || trimmed.includes("|") || /[0-7\[\]\-]/.test(trimmed)) {
        const indent = rawLine.match(/^\s*/)?.[0] || "";
        const transformed = doubleGridInLine(trimmed);
        resultLines.push(indent + transformed);
      } else {
        resultLines.push(rawLine);
      }
    }

    return this.format(resultLines.join("\n"));
  }

  public static halveGrid(
    source: string,
    target?: { section?: string; instrument?: string }
  ): string {
    const rawLines = source.split(/\r?\n/);
    const resultLines: string[] = [];

    let inMatchingPara = false;
    let insideParagraph = false;
    let currentNoteLength = 4;

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();

      const paraMatch = trimmed.match(
        /^([a-zA-Z0-9_\u4e00-\u9fa5-]+)\s*:\s*([a-zA-Z0-9_\u4e00-\u9fa5-]+)(@[^{]*)?\s*\{/
      );
      if (paraMatch) {
        insideParagraph = true;
        const pSec = paraMatch[1];
        const pInst = paraMatch[2];
        inMatchingPara =
          (!target?.section || target.section === pSec) &&
          (!target?.instrument || target.instrument === pInst);
        currentNoteLength = 4;
        resultLines.push(rawLine);
        continue;
      }

      if (trimmed === "}") {
        insideParagraph = false;
        inMatchingPara = false;
        resultLines.push(rawLine);
        continue;
      }

      if (!insideParagraph || !inMatchingPara) {
        resultLines.push(rawLine);
        continue;
      }

      const gridMatch = trimmed.match(/^<(\d+)\*>/);
      if (gridMatch) {
        currentNoteLength = parseInt(gridMatch[1], 10);
        if (currentNoteLength % 2 !== 0) {
          throw new TmdRefactorError(`Cannot halve odd grid <${currentNoteLength}*>`);
        }
        const newLen = currentNoteLength / 2;
        const indent = rawLine.match(/^\s*/)?.[0] || "";
        resultLines.push(`${indent}<${newLen}*>`);
        continue;
      }

      if (trimmed.startsWith("|") || trimmed.includes("|") || /[0-7\[\]\-]/.test(trimmed)) {
        const indent = rawLine.match(/^\s*/)?.[0] || "";
        const transformed = halveGridInLine(trimmed);
        resultLines.push(indent + transformed);
      } else {
        resultLines.push(rawLine);
      }
    }

    return this.format(resultLines.join("\n"));
  }

  public static optimizeGrid(
    source: string,
    target?: { section?: string; instrument?: string }
  ): string {
    if (target?.section || target?.instrument) {
      let current = source;
      while (true) {
        try {
          const next = this.halveGrid(current, target);
          if (next === current) break;
          current = next;
        } catch {
          break;
        }
      }
      return current;
    }

    // Optimize each paragraph independently so one indivisible track does not block other tracks
    let current = source;
    try {
      const sheet = TmdParser.parseThrowing(current);
      for (const p of sheet.entries) {
        let paraCurrent = current;
        while (true) {
          try {
            const next = this.halveGrid(paraCurrent, { section: p.name, instrument: p.assignment });
            if (next === paraCurrent) break;
            paraCurrent = next;
          } catch {
            break;
          }
        }
        current = paraCurrent;
      }
    } catch {
      // Fallback to iterative halveGrid if sheet cannot be parsed throwing
      while (true) {
        try {
          const next = this.halveGrid(current);
          if (next === current) break;
          current = next;
        } catch {
          break;
        }
      }
    }
    return current;
  }

  public static transpose(
    source: string,
    options: {
      semitones?: number;
      diatonicSteps?: number;
      keySignature?: string;
      updateKeySignature?: boolean;
      section?: string;
      instrument?: string;
    }
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
      return this.format(output);
    }
    return output;
  }
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

function parseTupletToken(tok: string): { inner: string; dashes: string } | null {
  const matchWithLen = tok.match(/^\(([^)]+)\)\s*%\s*\(([-]+)\)$/);
  if (matchWithLen) {
    return { inner: matchWithLen[1].trim(), dashes: matchWithLen[2] };
  }
  const matchWithoutLen = tok.match(/^\(([^)]+)\)$/);
  if (matchWithoutLen) {
    return { inner: matchWithoutLen[1].trim(), dashes: "-" };
  }
  return null;
}

function doubleGridInLine(line: string): string {
  // Break line into tokens while preserving pipes and comments
  // Extract comment if present
  let working = line;
  let commentSuffix = "";
  const commentStart = working.indexOf("/*");
  if (commentStart !== -1) {
    commentSuffix = " " + working.slice(commentStart);
    working = working.slice(0, commentStart).trim();
  }

  // Tokenize the measure content
  const tokens = measureUnits(working);
  const outTokens: string[] = [];

  for (const tok of tokens) {
    if (tok === "|") {
      outTokens.push("|");
      continue;
    }

    const tuplet = parseTupletToken(tok);
    if (tuplet) {
      const doubledDashes = tuplet.dashes + tuplet.dashes;
      outTokens.push(`(${tuplet.inner})%(${doubledDashes})`);
      continue;
    }

    // The parser accepts compact note runs such as `11` and `1'^2,_3^--`,
    // while this refactor operates on grid units. Split those runs first so
    // every original unit receives its own sustaining tie.
    for (const unit of splitUnspacedUnits(tok)) {
      outTokens.push(unit);
      outTokens.push("-");
    }
  }

  return outTokens.join(" ") + commentSuffix;
}

function splitUnspacedUnits(token: string): string[] {
  if (!/^[0-7]/.test(token)) return [token];

  const units: string[] = [];
  let i = 0;
  while (i < token.length) {
    if (/^[0-7]$/.test(token[i])) {
      let unit = token[i++];
      if (token[i] === "'" || token[i] === ",") unit += token[i++];
      while (token[i] === "^" || token[i] === "_") unit += token[i++];
      units.push(unit);
    } else if (token[i] === "-") {
      units.push(token[i++]);
    } else {
      return [token];
    }
  }
  return units.length > 0 ? units : [token];
}

function halveGridInLine(line: string): string {
  let working = line;
  let commentSuffix = "";
  const commentStart = working.indexOf("/*");
  if (commentStart !== -1) {
    commentSuffix = " " + working.slice(commentStart);
    working = working.slice(0, commentStart).trim();
  }

  const tokens = measureUnits(working);
  const outTokens: string[] = [];

  // Group tokens by measure (between pipes)
  let currentMeasure: string[] = [];

  const processMeasure = (measureTokens: string[]) => {
    let i = 0;
    while (i < measureTokens.length) {
      const u1 = measureTokens[i];
      const tuplet = parseTupletToken(u1);
      if (tuplet) {
        if (tuplet.dashes.length % 2 !== 0) {
          throw new TmdRefactorError(
            `Cannot halve tuplet with odd length: '${u1}' in | ${measureTokens.join(" ")} |`
          );
        }
        const halfLen = tuplet.dashes.length / 2;
        const halvedDashes = "-".repeat(halfLen);
        outTokens.push(`(${tuplet.inner})%(${halvedDashes})`);
        i++;
        continue;
      }

      if (i + 1 >= measureTokens.length) {
        throw new TmdRefactorError(
          `Cannot halve measure with odd number of units: | ${measureTokens.join(" ")} |`
        );
      }
      const u2 = measureTokens[i + 1];
      if (u2 !== "-") {
        throw new TmdRefactorError(
          `Cannot halve grid: unit '${u1} ${u2}' does not sustain with a tie '-'`
        );
      }
      outTokens.push(u1);
      i += 2;
    }
  };

  for (const tok of tokens) {
    if (tok === "|") {
      if (currentMeasure.length > 0) {
        processMeasure(currentMeasure);
        currentMeasure = [];
      }
      outTokens.push("|");
    } else {
      currentMeasure.push(tok);
    }
  }

  if (currentMeasure.length > 0) {
    processMeasure(currentMeasure);
  }

  return outTokens.join(" ") + commentSuffix;
}

/**
 * Groups canonical Lexer tokens into the measure units consumed by refactors.
 * The Lexer remains the only source of token boundaries; this layer only groups
 * adjacent syntax such as a note followed immediately by ties or a complete tuplet.
 */
function measureUnits(line: string): string[] {
  const lexed = new Lexer(line).tokenizeWithRanges().filter(({ token }) => token.type !== "eof");
  const units: string[] = [];
  let index = 0;

  while (index < lexed.length) {
    const current = lexed[index];
    if (current.token.type === "pipe") {
      units.push(current.text);
      index++;
      continue;
    }

    if (current.token.type === "openParen") {
      const innerEnd = lexed.findIndex((item, offset) => offset >= index && item.token.type === "closeParen");
      if (innerEnd >= index) {
        const inner = lexed.slice(index + 1, innerEnd).map(({ text }) => text).join(" ");
        let end = innerEnd + 1;
        let dashes = "";
        if (lexed[end]?.token.type === "percentOpenParen") {
          const dashEnd = lexed.findIndex((item, offset) => offset > end && item.token.type === "closeParen");
          if (dashEnd > end) {
            dashes = lexed.slice(end + 1, dashEnd)
              .filter(({ token }) => token.type === "tie")
              .map(() => "-")
              .join("");
            end = dashEnd + 1;
          }
        }
        units.push(dashes ? `(${inner})%(${dashes})` : `(${inner})`);
        index = end;
        continue;
      }
    }

    let unit = current.text;
    let end = index + 1;
    while (
      end < lexed.length &&
      lexed[end].token.type === "tie" &&
      lexed[end - 1].range.endOffset === lexed[end].range.start.offset
    ) {
      unit += lexed[end].text;
      end++;
    }
    units.push(unit);
    index = end;
  }
  return units;
}

function containsTransposableUnit(line: string): boolean {
  if (line.trimStart().startsWith("<")) return false;
  return new Lexer(line).tokenize().some(({ type }) => type === "note" || type === "chord");
}
