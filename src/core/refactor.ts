import { Sheet, Entry, ScaleDegree, UnitGroup, KeySignature } from "./types.js";
import { TmdParser } from "./parser.js";
import { formatSheet, formatParagraph } from "./format.js";

export class TMDRefactorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TMDRefactorError";
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatMusicalUnits(text: string): string {
  let output = "";
  const chars = Array.from(text);
  let i = 0;
  let lastWasSpace = false;

  while (i < chars.length) {
    const ch = chars[i];
    if (ch === "|") {
      if (output.length > 0 && !output.endsWith(" ")) {
        output += " ";
      }
      output += "| ";
      lastWasSpace = true;
      while (i + 1 < chars.length && (chars[i + 1] === " " || chars[i + 1] === "\t")) {
        i++;
      }
    } else if (ch === " " || ch === "\t") {
      if (!lastWasSpace && output.length > 0) {
        output += " ";
        lastWasSpace = true;
      }
    } else {
      output += ch;
      lastWasSpace = false;
    }
    i++;
  }

  return output.trim();
}

function reindentBlockComment(lines: string[], indentPrefix: string): string[] {
  if (lines.length === 1) {
    return [indentPrefix + lines[0].trim()];
  }
  const firstLine = lines[0];
  const firstMatch = firstLine.match(/^(\s*)/);
  const baseIndent = firstMatch ? firstMatch[1].length : 0;

  return lines.map((line, idx) => {
    if (idx === 0) {
      return indentPrefix + line.trimStart();
    }
    if (line.trim().length === 0) {
      return "";
    }
    const match = line.match(/^(\s*)/);
    const lineIndent = match ? match[1].length : 0;
    const relIndent = Math.max(0, lineIndent - baseIndent);
    return indentPrefix + " ".repeat(relIndent) + line.trimStart();
  });
}

function formatLine(line: string, indent = 0): string {
  const indentPrefix = "    ".repeat(indent);
  let working = line;
  let commentSuffix = "";

  // Extract inline block comment if present at end of line
  const commentStart = working.indexOf("/*");
  if (commentStart !== -1) {
    const commentText = working.slice(commentStart);
    working = working.slice(0, commentStart);
    commentSuffix = "  " + commentText.trim();
  }

  const trimmed = working.trim();

  // Check if header line
  if (trimmed.startsWith("::SCORE::")) {
    return "::SCORE::" + commentSuffix;
  }
  if (trimmed.startsWith("**") && trimmed.endsWith("**") && trimmed.length > 4) {
    const title = trimmed.slice(2, -2).trim();
    return `** ${title} **` + commentSuffix;
  }
  if (trimmed.startsWith("!=") || trimmed.startsWith("! =")) {
    const value = (trimmed.startsWith("! =") ? trimmed.slice(3) : trimmed.slice(2)).trim();
    return `!= ${value}` + commentSuffix;
  }
  if (trimmed.startsWith("?=") || trimmed.startsWith("? =")) {
    const value = (trimmed.startsWith("? =") ? trimmed.slice(3) : trimmed.slice(2)).trim();
    return `?= ${value}` + commentSuffix;
  }
  if (trimmed.startsWith("<") && trimmed.endsWith(">") && trimmed.includes("/")) {
    return trimmed + commentSuffix;
  }

  // Paragraph header line: e.g. intro:Piano@|0|{
  if (trimmed.includes(":") && trimmed.includes("@") && trimmed.endsWith("{")) {
    const colonIdx = trimmed.indexOf(":");
    const pName = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).trim();
    const atIdx = rest.indexOf("@");
    if (atIdx !== -1) {
      const inst = rest.slice(0, atIdx).trim();
      const timing = rest.slice(atIdx + 1).trim();
      return `${pName}:${inst}@${timing}` + commentSuffix;
    }
  }

  // Section header line: <4*> or <16*>
  if (trimmed.startsWith("<") && trimmed.endsWith("*>")) {
    return indentPrefix + trimmed + commentSuffix;
  }

  // Closing brace
  if (trimmed === "}") {
    return "}" + commentSuffix;
  }

  // Orders line: -> ...
  if (trimmed.startsWith("->")) {
    const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0);
    const orderTokens: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t === "->" || t === "->#") {
        orderTokens.push(t);
      } else if (t.startsWith("->")) {

        orderTokens.push("->");
        const sub = t.slice(2);
        if (sub.length > 0) {
          orderTokens.push(sub);
        }
      } else {
        orderTokens.push(t);
      }
      i++;
    }
    return orderTokens.join(" ") + commentSuffix;
  }

  // Content / measure line
  const formattedContent = formatMusicalUnits(trimmed);
  return indentPrefix + formattedContent + commentSuffix;
}

export class TMDRefactor {
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
    const matchingParagraphs = (sheet.entries ?? sheet.paragraphs).filter((p) => (p.assignment ?? p.instrument) === instrument);
    if (matchingParagraphs.length === 0) {
      throw new TMDRefactorError(`Instrument '${instrument}' not found in score`);
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
    let matching = (sheet.entries ?? sheet.paragraphs).filter((p) => (p.assignment ?? p.instrument) === sourceInstrument);
    if (options?.section) {
      matching = matching.filter((p) => p.name === options.section);
    }
    if (matching.length === 0) {
      if (options?.section) {
        throw new TMDRefactorError(`Track '${options.section}:${sourceInstrument}' not found in score`);
      }
      throw new TMDRefactorError(`Instrument '${sourceInstrument}' not found in score`);
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
        instrument: targetInstrument,
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
    let matching = (sheet.entries ?? sheet.paragraphs).filter((p) => (p.assignment ?? p.instrument) === sourceInstrument);
    if (options?.section) {
      matching = matching.filter((p) => p.name === options.section);
    }
    if (matching.length === 0) {
      if (options?.section) {
        throw new TMDRefactorError(`Track '${options.section}:${sourceInstrument}' not found in score`);
      }
      throw new TMDRefactorError(`Instrument '${sourceInstrument}' not found in score`);
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
        instrument: harmonyInstrument,
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
    if (!sheet.orders || sheet.orders.length === 0) {
      return source;
    }

    // Map instruments -> combined list of sections in linear playback sequence
    const instruments = Array.from(new Set((sheet.entries ?? sheet.paragraphs).map((p) => p.assignment ?? p.instrument)));
    const linearParagraphs: Entry[] = [];

    for (const inst of instruments) {
      const combinedUnitGroups: UnitGroup[] = [];
      let baseNoteLength = 4;

      for (const ord of sheet.orders) {
        if (ord.type !== "name") continue;
      const para = (sheet.entries ?? sheet.paragraphs).find((p) => p.name === ord.name && (p.assignment ?? p.instrument) === inst);
        if (!para) continue;

        for (const sec of para.sections) {
          baseNoteLength = sec.noteLength;
          combinedUnitGroups.push(...sec.unitGroups);
        }
      }

      linearParagraphs.push({
        name: "linear",
        instrument: inst,
        start: 0,
        sections: [
          {
            noteLength: baseNoteLength,
            unitGroups: combinedUnitGroups,
            directives: [],
          },
        ],
      });
    }

    const newSheet: Sheet = {
      name: sheet.name,
      speed: sheet.speed,
      keySignature: sheet.keySignature,
      beat: sheet.beat,
      paragraphs: linearParagraphs,
      orders: [{ type: "name", name: "linear" }],
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
          throw new TMDRefactorError(`Cannot halve odd grid <${currentNoteLength}*>`);
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
      for (const p of (sheet.entries ?? sheet.paragraphs)) {
        let paraCurrent = current;
        while (true) {
          try {
            const next = this.halveGrid(paraCurrent, { section: p.name, instrument: p.instrument });
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
      if (!isFullScore || (insideParagraph && inMatchingPara)) {
        if (trimmed.startsWith("|") || trimmed.includes("|") || /[0-7\[\]\-]/.test(trimmed)) {
          const indent = rawLine.match(/^\s*/)?.[0] || "";
          const transformed = transposeUnitsInLine(trimmed, {
            semitones,
            diatonicSteps,
            keySignature: currentKeySig,
          });
          resultLines.push(indent + transformed);
          continue;
        }
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
  const offsetToKey: Record<number, string> = {
    0: "C",
    1: "C'",
    2: "D",
    3: "E,",
    4: "E",
    5: "F",
    6: "F'",
    7: "G",
    8: "A,",
    9: "A",
    10: "B,",
    11: "B",
  };
  return offsetToKey[newOffset] || "C";
}

const SCALE_DEGREE_SEMITONES: Record<number, number> = {
  1: 0,
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
};

const NOTE_NAMES_12 = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SEMITONE_TO_DEGREE_MAP: Record<number, { degree: number; accidental: string }> = {
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
  const baseDegreeSemitone = SCALE_DEGREE_SEMITONES[deg] + accSemitone;
  const totalSemitonesRelTonic = baseDegreeSemitone + octaveDelta * 12 + options.semitones;

  const semitoneInOct = ((totalSemitonesRelTonic % 12) + 12) % 12;
  const finalOctave = Math.floor(totalSemitonesRelTonic / 12);

  const mapped = SEMITONE_TO_DEGREE_MAP[semitoneInOct];
  let newOctStr = "";
  if (finalOctave > 0) newOctStr = "^".repeat(finalOctave);
  else if (finalOctave < 0) newOctStr = "_".repeat(-finalOctave);

  return `${mapped.degree}${mapped.accidental}${newOctStr}`;
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

  const tokens = tokenizeMeasureLine(working);
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
      const innerTokens = tokenizeMeasureLine(tuplet.inner);
      const transposedInner = innerTokens.map((t) => {
        if (/^[1-7]/.test(t)) {
          return transposeTmdNote(t, options);
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
      outTokens.push(transposeTmdNote(tok, options));
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
  const tokens = tokenizeMeasureLine(working);
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

    // Regular unit: append a tie '-'
    outTokens.push(tok);
    outTokens.push("-");
  }

  return outTokens.join(" ") + commentSuffix;
}

function halveGridInLine(line: string): string {
  let working = line;
  let commentSuffix = "";
  const commentStart = working.indexOf("/*");
  if (commentStart !== -1) {
    commentSuffix = " " + working.slice(commentStart);
    working = working.slice(0, commentStart).trim();
  }

  const tokens = tokenizeMeasureLine(working);
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
          throw new TMDRefactorError(
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
        throw new TMDRefactorError(
          `Cannot halve measure with odd number of units: | ${measureTokens.join(" ")} |`
        );
      }
      const u2 = measureTokens[i + 1];
      if (u2 !== "-") {
        throw new TMDRefactorError(
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

function tokenizeMeasureLine(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if (ch === "|") {
      tokens.push("|");
      i++;
      continue;
    }
    if (ch === "[") {
      // Chord [Am7]
      const end = line.indexOf("]", i);
      if (end !== -1) {
        tokens.push(line.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    if (ch === "(") {
      // Tuplet (1 2 3) or (1 2 3)%(--) or (1 2 3) % (--)
      const endParen = line.indexOf(")", i);
      if (endParen !== -1) {
        let afterParen = endParen + 1;
        while (afterParen < line.length && (line[afterParen] === " " || line[afterParen] === "\t")) {
          afterParen++;
        }
        if (line[afterParen] === "%") {
          let afterPercent = afterParen + 1;
          while (afterPercent < line.length && (line[afterPercent] === " " || line[afterPercent] === "\t")) {
            afterPercent++;
          }
          if (line[afterPercent] === "(") {
            const endDashes = line.indexOf(")", afterPercent + 1);
            if (endDashes !== -1) {
              tokens.push(line.slice(i, endDashes + 1));
              i = endDashes + 1;
              continue;
            }
          }
        }
        tokens.push(line.slice(i, endParen + 1));
        i = endParen + 1;
        continue;
      }
    }
    // Directive {!= 120} etc
    if (ch === "{") {
      const end = line.indexOf("}", i);
      if (end !== -1) {
        tokens.push(line.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }

    // Normal word/note token until whitespace or pipe or bracket or paren
    let word = "";
    while (i < line.length && !/[\s|\[\]\(\)\{\}]/.test(line[i])) {
      word += line[i];
      i++;
    }
    if (word.length > 0) {
      tokens.push(word);
    }
  }
  return tokens;
}
