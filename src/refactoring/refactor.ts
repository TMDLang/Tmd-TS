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
import { TmdRefactorError } from "./errors.js";
import { escapeRegex, formatLine, formatMusicalUnits, reindentBlockComment } from "./format_helpers.js";
import type { TmdGridTarget } from "./grid.js";
import { doubleGrid, halveGrid, optimizeGrid } from "./grid.js";
import type { TmdDuplicateTrackOptions, TmdHarmonyOptions } from "./tracks.js";
import {
  duplicateTrack,
  extractInstrument,
  generateHarmony,
  inlineOrders,
  renameInstrument,
  renameSection,
} from "./tracks.js";
import type { TmdTransposeOptions } from "./transpose.js";
import { transposeSource } from "./transpose.js";
export { TmdRefactorError } from "./errors.js";


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


  public static renameInstrument(source: string, oldInstrument: string, newInstrument: string): string {
    return renameInstrument(source, oldInstrument, newInstrument);
  }

  public static renameSection(source: string, oldSection: string, newSection: string): string {
    return renameSection(source, oldSection, newSection);
  }

  public static extractInstrument(source: string, instrument: string): string {
    return extractInstrument(source, instrument, (formatted) => this.format(formatted));
  }

  public static duplicateTrack(
    source: string,
    sourceInstrument: string,
    targetInstrument: string,
    options?: TmdDuplicateTrackOptions,
  ): string {
    return duplicateTrack(source, sourceInstrument, targetInstrument, options, (formatted) => this.format(formatted));
  }

  public static generateHarmony(
    source: string,
    sourceInstrument: string,
    harmonyInstrument: string,
    options: TmdHarmonyOptions,
  ): string {
    return generateHarmony(source, sourceInstrument, harmonyInstrument, options, (formatted) => this.format(formatted));
  }

  public static inlineOrders(source: string): string {
    return inlineOrders(source, (formatted) => this.format(formatted));
  }
  public static doubleGrid(source: string, target: TmdGridTarget = {}): string {
    return doubleGrid(source, target, (formatted) => this.format(formatted));
  }

  public static halveGrid(source: string, target: TmdGridTarget = {}): string {
    return halveGrid(source, target, (formatted) => this.format(formatted));
  }

  public static optimizeGrid(source: string, target: TmdGridTarget = {}): string {
    return optimizeGrid(source, target, (formatted) => this.format(formatted));
  }
  public static transpose(source: string, options: TmdTransposeOptions): string {
    return transposeSource(source, options, (formatted) => this.format(formatted));
  }
}
