import { TmdParser } from "../syntax/parser.js";
import { TmdRefactorError } from "./errors.js";
import {
  matchesRefactorTarget,
  parseGridSubdivisionLine,
  parseParagraphHeaderLine,
} from "./format_helpers.js";
import { measureUnits, parseTupletToken } from "./unit_helpers.js";

export interface TmdGridTarget {
  section?: string;
  instrument?: string;
}

export function doubleGrid(
  source: string,
  target: TmdGridTarget,
  formatSource: (source: string) => string,
): string {
    const rawLines = source.split(/\r?\n/);
    const resultLines: string[] = [];

    let inMatchingPara = false;
    let insideParagraph = false;
    let currentNoteLength = 4;

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();

      // Check paragraph header: section:instrument@...{
      const header = parseParagraphHeaderLine(trimmed);
      if (header) {
        insideParagraph = true;
        inMatchingPara = matchesRefactorTarget(target, header.section, header.instrument);
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
      const gridValue = parseGridSubdivisionLine(trimmed);
      if (gridValue !== undefined) {
        currentNoteLength = gridValue;
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

    return formatSource(resultLines.join("\n"));
}

export function halveGrid(
  source: string,
  target: TmdGridTarget,
  formatSource: (source: string) => string,
): string {
    const rawLines = source.split(/\r?\n/);
    const resultLines: string[] = [];

    let inMatchingPara = false;
    let insideParagraph = false;
    let currentNoteLength = 4;

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();

      const header = parseParagraphHeaderLine(trimmed);
      if (header) {
        insideParagraph = true;
        inMatchingPara = matchesRefactorTarget(target, header.section, header.instrument);
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

      const gridValue = parseGridSubdivisionLine(trimmed);
      if (gridValue !== undefined) {
        currentNoteLength = gridValue;
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

    return formatSource(resultLines.join("\n"));
}

export function optimizeGrid(
  source: string,
  target: TmdGridTarget,
  formatSource: (source: string) => string,
): string {
    if (target?.section || target?.instrument) {
      let current = source;
      while (true) {
        try {
          const next = halveGrid(current, target, formatSource);
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
            const next = halveGrid(paraCurrent, { section: p.name, instrument: p.assignment }, formatSource);
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
          const next = halveGrid(current, {}, formatSource);
          if (next === current) break;
          current = next;
        } catch {
          break;
        }
      }
    }
    return current;
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
