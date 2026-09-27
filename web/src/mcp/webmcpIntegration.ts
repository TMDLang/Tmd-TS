import { TmdParser } from "../../../src/core/parser.js";
import { Sheet, scaleDegreeLetter, accidentalToSemitone } from "../../../src/core/types.js";
import { TMDMeasureChecker } from "../../../src/core/measure_check.js";
import {
  TMDMIDIGenerator,
  TMDMusicXMLGenerator,
  TMDLilyPondGenerator,
  TMDABCGenerator,
  TMDReaperGenerator,
  TMDChordProGenerator,
} from "../../../src/exporters/index.js";
import { TmdSkill } from "../../../src/skill.js";

export interface TmdWebMcpContext {
  getCurrentScore: () => string;
  loadScoreToEditor: (text: string) => void;
  startPlayback?: () => void;
}

export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any) => Promise<{
    content: Array<{ type: "text"; text: string }>;
  }>;
}

const textContent = (text: string) => ({
  content: [
    {
      type: "text" as const,
      text,
    },
  ],
});

export const buildTmdWebMcpTools = (ctx: TmdWebMcpContext): WebMcpTool[] => [
  {
    name: "getTmdSkill",
    description:
      "Get comprehensive TMD (Timebase Mark Down) language specification, syntax rules, and prompt engineering skill.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => textContent(TmdSkill.skillMarkdown),
  },
  {
    name: "parseTmd",
    description:
      "Parse and validate TMD score text. Returns AST summary, metadata (title, BPM, key, time signature), tracks, or syntax errors.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "TMD score source code text",
        },
      },
      required: ["text"],
    },
    handler: async ({ text }) => {
      try {
        const sheet = TmdParser.parse(text);
        if (!sheet) {
          return textContent(
            JSON.stringify({
              valid: false,
              error: "Missing ::SCORE:: header or invalid score structure",
            })
          );
        }

        let tonic = "C";
        if (sheet.keySignature) {
          const letter = scaleDegreeLetter(sheet.keySignature.tonic);
          const semitone = accidentalToSemitone(sheet.keySignature.accidental);
          const acc = semitone === 1 ? "#" : semitone === -1 ? "b" : "";
          tonic = `${letter}${acc}`;
        }

        const entries = sheet.entries.map((p) => ({
          name: p.name,
          assignment: p.assignment,
          start: p.start || 0,
          sectionCount: p.sections.length,
        }));

        return textContent(
          JSON.stringify(
            {
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
            },
            null,
            2
          )
        );
      } catch (err: any) {
        return textContent(
          JSON.stringify({
            valid: false,
            error: err.message || String(err),
          })
        );
      }
    },
  },
  {
    name: "checkTmd",
    description:
      "Check and validate TMD score measures, beat consistency, and section lengths. Identifies measure-level rhythm discrepancies.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "TMD score source code text",
        },
      },
      required: ["text"],
    },
    handler: async ({ text }) => {
      try {
        const issues = TMDMeasureChecker.check(text);
        return textContent(
          JSON.stringify(
            {
              valid: issues.length === 0,
              issueCount: issues.length,
              issues: issues.map((i) => ({
                paragraph: i.paragraphName,
                instrument: i.instrument,
                line: i.lineNumber,
                measureIndex: i.measureIndex,
                expectedUnits: i.expectedUnits,
                actualUnits: i.actualUnits,
                deltaUnits: i.deltaUnits,
                snippet: i.snippet,
                description: i.description,
              })),
            },
            null,
            2
          )
        );
      } catch (err: any) {
        return textContent(
          JSON.stringify({
            valid: false,
            error: err.message || String(err),
          })
        );
      }
    },
  },
  {
    name: "convertTmd",
    description:
      "Convert TMD score text to target music formats: midi (base64 encoded), reaper (.rpp), musicxml, lilypond, abc, or chordpro (.cho).",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "TMD score source code text",
        },
        format: {
          type: "string",
          enum: ["midi", "musicxml", "lilypond", "abc", "reaper", "rpp", "chordpro", "cho"],
          description: "Target export format: midi (base64), reaper (rpp), musicxml, lilypond, abc, chordpro (cho)",
        },
      },
      required: ["text", "format"],
    },
    handler: async ({ text, format }) => {
      const sheet = TmdParser.parse(text);
      if (!sheet) {
        throw new Error("Invalid TMD score text");
      }

      const fmt = (format || "musicxml").toLowerCase();
      switch (fmt) {
        case "midi": {
          const uint8 = TMDMIDIGenerator.generateMIDI(sheet);
          let binary = "";
          const len = uint8.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          const base64 = typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(uint8).toString("base64");
          return textContent(base64);
        }
        case "reaper":
        case "rpp": {
          return textContent(TMDReaperGenerator.generateRPP(sheet));
        }
        case "musicxml": {
          return textContent(TMDMusicXMLGenerator.generateMusicXML(sheet));
        }
        case "lilypond": {
          return textContent(TMDLilyPondGenerator.generateLilyPond(sheet));
        }
        case "abc": {
          return textContent(TMDABCGenerator.generateABC(sheet));
        }
        case "chordpro":
        case "cho": {
          return textContent(TMDChordProGenerator.generateChordPro(sheet));
        }
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    },
  },
  {
    name: "getCurrentScore",
    description: "Get the current TMD score text currently open in the TMD Studio browser editor.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => textContent(ctx.getCurrentScore()),
  },
  {
    name: "loadScoreToEditor",
    description:
      "Push generated or edited TMD score text into the TMD Studio web editor, and optionally start playback.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "TMD score text to load into the web editor",
        },
        play: {
          type: "boolean",
          description: "Whether to immediately start playback after loading",
        },
      },
      required: ["text"],
    },
    handler: async ({ text, play }) => {
      ctx.loadScoreToEditor(text);
      if (play && ctx.startPlayback) {
        ctx.startPlayback();
      }
      return textContent("TMD score loaded into editor successfully.");
    },
  },
];

export const registerNativeWebMcp = (globalScope: any, tools: WebMcpTool[]): boolean => {
  const modelContext = globalScope.navigator?.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    return false;
  }

  tools.forEach((tool) => {
    modelContext.registerTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: tool.handler,
    });
  });
  return true;
};

export const registerBridgeWebMcp = (globalScope: any, tools: WebMcpTool[]): boolean => {
  if (typeof globalScope.WebMCP !== "function") {
    return false;
  }

  const mcp =
    globalScope.tmdWebMcp ||
    new globalScope.WebMCP({
      color: "#58a6ff",
      position: "bottom-right",
    });

  tools.forEach((tool) => {
    mcp.registerTool(tool.name, tool.description, tool.inputSchema.properties, tool.handler);
  });
  globalScope.tmdWebMcp = mcp;
  return true;
};

export const initTmdWebMcp = (globalScope: any, ctx: TmdWebMcpContext) => {
  const tools = buildTmdWebMcpTools(ctx);
  return {
    nativeRegistered: registerNativeWebMcp(globalScope, tools),
    bridgeRegistered: registerBridgeWebMcp(globalScope, tools),
    toolCount: tools.length,
    tools,
  };
};
