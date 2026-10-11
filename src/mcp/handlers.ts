import { TmdWAVRenderer } from "../audio.js";
import {
  TmdABCGenerator,
  TmdBrailleEncoding,
  TmdBrailleGenerator,
  TmdChordProGenerator,
  TmdLilyPondGenerator,
  TmdMIDIGenerator,
  TmdMusicXMLGenerator,
  TmdReaperGenerator,
  TmdVSQGenerator,
  TmdVSQXGenerator,
} from "../exporters/index.js";
import { accidentalToSemitone, Playback, scaleDegreeLetter, TmdParser } from "../syntax/index.js";
import { TmdMeasureChecker, TmdScoreDiagnostic, TmdScoreValidator } from "../validation/index.js";

export interface TmdMcpEntrySummary {
  name: string;
  assignment?: string;
  start: number;
  sectionCount: number;
}

export type TmdParseMcpResult =
  | {
      valid: true;
      name: string;
      speed: number;
      tonic: string;
      declaredKey: string | null;
      timeSignature: string;
      playback: Playback[];
      entryCount: number;
      entries: TmdMcpEntrySummary[];
      paragraphs: TmdMcpEntrySummary[];
    }
  | {
      valid: false;
      error: string;
      line: number;
      column: number;
      snippet: string;
      expectedTokens: string[];
    };

export interface TmdMcpMeasureIssueSummary {
  paragraph: string;
  instrument: string;
  line: number;
  measureIndex: number;
  expectedUnits: number;
  actualUnits: number;
  deltaUnits: number;
  snippet: string;
  description: string;
}

export interface TmdCheckMcpResult {
  valid: boolean;
  syntaxValid?: boolean;
  syntaxError?: {
    message: string;
    line: number;
    column: number;
    snippet: string;
    expectedTokens: string[];
  };
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issues: TmdMcpMeasureIssueSummary[];
  diagnostics: TmdScoreDiagnostic[];
}

export type TmdConvertMcpResult =
  | {
      kind: "text";
      text: string;
      label: string;
    }
  | {
      kind: "binary";
      bytes: Uint8Array;
      base64: string;
      label: string;
    };

export interface TmdConvertMcpOptions {
  format?: string;
  defaultFormat?: string;
  section?: string;
  instrument?: string;
  outputPath?: string;
}

export class TmdMcpCore {
  public static uint8ToBase64(uint8: Uint8Array): string {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(uint8).toString("base64");
    }
    let binary = "";
    const len = uint8.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    return btoa(binary);
  }

  public static parseTmdText(content: string): TmdParseMcpResult {
    if (!content || !content.trim()) {
      return {
        valid: false,
        error: "TMD score is empty",
        line: 1,
        column: 1,
        snippet: "",
        expectedTokens: ["::SCORE::"],
      };
    }

    try {
      const sheet = TmdParser.parseThrowing(content);
      if (!sheet) {
        const lines = content.split("\n");
        return {
          valid: false,
          error: "Missing ::SCORE:: header or invalid score structure",
          line: 1,
          column: 1,
          snippet: (lines[0] || "").trim(),
          expectedTokens: ["::SCORE::"],
        };
      }

      let tonic = "C";
      if (sheet.keySignature) {
        const letter = scaleDegreeLetter(sheet.keySignature.tonic);
        const semitone = accidentalToSemitone(sheet.keySignature.accidental);
        const acc = semitone === 1 ? "#" : semitone === -1 ? "b" : "";
        tonic = `${letter}${acc}`;
      }

      const entries: TmdMcpEntrySummary[] = sheet.entries.map((p) => ({
        name: p.name,
        assignment: p.assignment,
        start: p.start || 0,
        sectionCount: p.sections.length,
      }));

      return {
        valid: true,
        name: sheet.name || "Untitled",
        speed: sheet.speed || 120,
        tonic,
        declaredKey: sheet.declaredKey ?? null,
        timeSignature: sheet.beat
          ? `${sheet.beat.count}/${sheet.beat.noteValue}`
          : "4/4",
        playback: sheet.playback,
        entryCount: sheet.entries.length,
        entries,
        paragraphs: entries,
      };
    } catch (err: any) {
      const lines = content ? content.split("\n") : [];
      const line = err?.range?.start?.line ?? 1;
      const column = err?.range?.start?.column ?? 1;
      const expectedTokens = err?.expectedTokens ?? [];
      const lineIdx = Math.max(0, line - 1);
      const snippet = lines[lineIdx] !== undefined ? lines[lineIdx].trim() : "";

      return {
        valid: false,
        error: err?.message || String(err),
        line,
        column,
        snippet,
        expectedTokens,
      };
    }
  }

  public static checkTmdText(
    content: string,
    options?: { includeSyntaxCheck?: boolean }
  ): TmdCheckMcpResult {
    const issues = TmdMeasureChecker.check(content);
    const diagnostics = TmdScoreValidator.validate(content);
    const errorCount = diagnostics.filter((d) => d.severity === "error").length;
    const warningCount = diagnostics.filter((d) => d.severity === "warning").length;
    const mappedIssues: TmdMcpMeasureIssueSummary[] = issues.map((i) => ({
      paragraph: i.paragraphName,
      instrument: i.instrument,
      line: i.lineNumber,
      measureIndex: i.measureIndex,
      expectedUnits: i.expectedUnits,
      actualUnits: i.actualUnits,
      deltaUnits: i.deltaUnits,
      snippet: i.snippet,
      description: i.description,
    }));

    if (options?.includeSyntaxCheck) {
      const parsed = this.parseTmdText(content);
      const syntaxError = !parsed.valid
        ? {
            message: parsed.error,
            line: parsed.line,
            column: parsed.column,
            snippet: parsed.snippet,
            expectedTokens: parsed.expectedTokens,
          }
        : undefined;
      return {
        valid: parsed.valid && errorCount === 0 && issues.length === 0,
        syntaxValid: parsed.valid,
        ...(syntaxError ? { syntaxError } : {}),
        issueCount: issues.length,
        errorCount,
        warningCount,
        issues: mappedIssues,
        diagnostics,
      };
    }

    return {
      valid: errorCount === 0 && issues.length === 0,
      issueCount: issues.length,
      errorCount,
      warningCount,
      issues: mappedIssues,
      diagnostics,
    };
  }

  public static convertTmdText(
    content: string,
    options: TmdConvertMcpOptions
  ): TmdConvertMcpResult {
    const sheet = TmdParser.parse(content);
    if (!sheet) {
      throw new Error("Invalid TMD score content");
    }

    const fmt = (options.format || options.defaultFormat || "midi").toLowerCase();
    switch (fmt) {
      case "midi": {
        const bytes = TmdMIDIGenerator.generateMIDI(
          sheet,
          TmdMIDIGenerator.defaultTicksPerQuarterNote,
          {
            targetParagraph: options.section,
            targetInstrument: options.instrument,
          }
        );
        return {
          kind: "binary",
          bytes,
          base64: this.uint8ToBase64(bytes),
          label: "MIDI",
        };
      }
      case "musicxml": {
        return {
          kind: "text",
          text: TmdMusicXMLGenerator.generateMusicXML(sheet),
          label: "MusicXML",
        };
      }
      case "lilypond": {
        return {
          kind: "text",
          text: TmdLilyPondGenerator.generateLilyPond(sheet),
          label: "LilyPond source",
        };
      }
      case "abc": {
        return {
          kind: "text",
          text: TmdABCGenerator.generateABC(sheet),
          label: "ABC notation",
        };
      }
      case "wav": {
        const bytes = TmdWAVRenderer.renderWAV(sheet, 44100, {
          targetParagraph: options.section,
          targetInstrument: options.instrument,
        });
        return {
          kind: "binary",
          bytes,
          base64: this.uint8ToBase64(bytes),
          label: "WAV audio",
        };
      }
      case "reaper":
      case "rpp": {
        return {
          kind: "text",
          text: TmdReaperGenerator.generateRPP(sheet),
          label: "REAPER project",
        };
      }
      case "vsq": {
        const bytes = TmdVSQGenerator.generateVSQ(sheet);
        return {
          kind: "binary",
          bytes,
          base64: this.uint8ToBase64(bytes),
          label: "VOCALOID2 (.vsq)",
        };
      }
      case "vsqx": {
        return {
          kind: "text",
          text: TmdVSQXGenerator.generateVSQX(sheet),
          label: "VOCALOID3/4 (.vsqx)",
        };
      }
      case "chordpro":
      case "cho": {
        return {
          kind: "text",
          text: TmdChordProGenerator.generateChordPro(sheet),
          label: "ChordPro lead sheet",
        };
      }
      case "braille":
      case "brl":
      case "brf": {
        const encoding: TmdBrailleEncoding =
          fmt === "brf" ||
          Boolean(options.outputPath && options.outputPath.toLowerCase().endsWith(".brf"))
            ? "ascii"
            : "unicode";
        return {
          kind: "text",
          text: TmdBrailleGenerator.generateBraille(sheet, {
            encoding,
            targetSection: options.section,
            targetInstrument: options.instrument,
          }),
          label: "Music Braille",
        };
      }
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }
  }
}
