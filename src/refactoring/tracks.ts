import { formatParagraph, formatSheet } from "../syntax/format.js";
import { TmdParser } from "../syntax/parser.js";
import {
  Entry,
  ScaleDegree,
  Sheet,
} from "../syntax/types.js";
import { TmdRefactorError } from "./errors.js";
import { escapeRegex } from "./format_helpers.js";

export interface TmdDuplicateTrackOptions {
  section?: string;
  octaveShift?: number;
}

export interface TmdHarmonyOptions {
  section?: string;
  intervalSteps: number;
}

export function renameInstrument(
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

export function renameSection(
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

export function extractInstrument(
  source: string,
  instrument: string,
  formatSource: (source: string) => string,
): string {
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

    const formatted = formatSource(resultLines.join("\n"));
    TmdParser.parseThrowing(formatted);
    return formatted;
}

export function duplicateTrack(
  source: string,
  sourceInstrument: string,
  targetInstrument: string,
  options: TmdDuplicateTrackOptions | undefined,
  formatSource: (source: string) => string,
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

    const formatted = formatSource(combined);
    TmdParser.parseThrowing(formatted);
    return formatted;
}

export function generateHarmony(
  source: string,
  sourceInstrument: string,
  harmonyInstrument: string,
  options: TmdHarmonyOptions,
  formatSource: (source: string) => string,
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

    const formatted = formatSource(combined);
    TmdParser.parseThrowing(formatted);
    return formatted;
}

export function inlineOrders(source: string, formatSource: (source: string) => string): string {
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

    return formatSource(formatSheet(newSheet));
}
