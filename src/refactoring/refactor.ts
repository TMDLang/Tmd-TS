import { formatParagraph,formatSheet } from "../syntax/format.js";
import { TmdParser } from "../syntax/parser.js";
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
import type { TmdTransposeOptions } from "./transpose.js";
import { transposeSource } from "./transpose.js";
import { measureUnits, parseTupletToken } from "./unit_helpers.js";

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

  public static transpose(source: string, options: TmdTransposeOptions): string {
    return transposeSource(source, options, (formatted) => this.format(formatted));
  }
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
