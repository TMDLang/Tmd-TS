import * as fs from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  TmdBrailleEncoding,
  TmdBrailleGenerator,
  TmdBrailleLayout,
} from "../exporters/index.js";
import { TmdSkill } from "../skill.js";
import { TmdParser } from "../syntax/index.js";
import { TMD_VERSION } from "../version.js";
import { TmdMcpCore } from "./handlers.js";

const textContent = (text: string) => ({
  content: [
    {
      type: "text" as const,
      text,
    },
  ],
});

export class TmdMCPServer {
  public static async handleGetSkill() {
    return textContent(TmdSkill.skillMarkdown);
  }

  public static async handleParseTmd({ text, filePath }: { text?: string; filePath?: string }) {
    try {
      let content = text;
      if (!content && filePath) {
        content = fs.readFileSync(filePath, "utf-8");
      }
      if (!content) {
        return textContent(
          JSON.stringify({
            valid: false,
            error: "Either 'text' or 'filePath' must be provided",
          })
        );
      }
      return textContent(JSON.stringify(TmdMcpCore.parseTmdText(content), null, 2));
    } catch (err: any) {
      return textContent(
        JSON.stringify(
          {
            valid: false,
            error: err?.message || String(err),
            line: 1,
            column: 1,
            snippet: "",
            expectedTokens: [],
          },
          null,
          2
        )
      );
    }
  }

  public static async handleCheckTmd({
    text,
    filePath,
  }: {
    text?: string;
    filePath?: string;
  }) {
    let content = text;
    if (!content && filePath) {
      content = fs.readFileSync(filePath, "utf-8");
    }
    if (!content) {
      throw new Error("Either 'text' or 'filePath' must be provided");
    }

    return textContent(JSON.stringify(TmdMcpCore.checkTmdText(content), null, 2));
  }

  public static async handleConvertTmd({
    text,
    filePath,
    format,
    outputPath,
    section,
    instrument,
  }: {
    text?: string;
    filePath?: string;
    format:
      | "midi"
      | "musicxml"
      | "lilypond"
      | "abc"
      | "wav"
      | "reaper"
      | "rpp"
      | "vsq"
      | "vsqx"
      | "chordpro"
      | "cho"
      | "braille"
      | "brl"
      | "brf";
    outputPath?: string;
    section?: string;
    instrument?: string;
  }) {
    let content = text;
    if (!content && filePath) {
      content = fs.readFileSync(filePath, "utf-8");
    }
    if (!content) {
      throw new Error("Either 'text' or 'filePath' must be provided");
    }

    const converted = TmdMcpCore.convertTmdText(content, {
      format,
      defaultFormat: "midi",
      outputPath,
      section,
      instrument,
    });
    if (outputPath) {
      if (converted.kind === "binary") {
        fs.writeFileSync(outputPath, converted.bytes);
      } else {
        fs.writeFileSync(outputPath, converted.text, "utf-8");
      }
      return textContent(`${converted.label} successfully written to ${outputPath}`);
    }
    return textContent(converted.kind === "binary" ? converted.base64 : converted.text);
  }

  public static async handleExportBraille({
    text,
    tmdCode,
    filePath,
    encoding,
    layout,
    outputPath,
    section,
    instrument,
  }: {
    text?: string;
    tmdCode?: string;
    filePath?: string;
    encoding?: TmdBrailleEncoding;
    layout?: TmdBrailleLayout;
    outputPath?: string;
    section?: string;
    instrument?: string;
  }) {
    let content = text || tmdCode;
    if (!content && filePath) {
      content = fs.readFileSync(filePath, "utf-8");
    }
    if (!content) {
      throw new Error("Either 'text', 'tmdCode', or 'filePath' must be provided");
    }

    const sheet = TmdParser.parse(content);
    if (!sheet) {
      throw new Error("Invalid TMD score content");
    }

    const resolvedEncoding: TmdBrailleEncoding =
      encoding || (outputPath && outputPath.toLowerCase().endsWith(".brf") ? "ascii" : "unicode");
    const braille = TmdBrailleGenerator.generateBraille(sheet, {
      encoding: resolvedEncoding,
      layout: layout || "partByPart",
      targetSection: section,
      targetInstrument: instrument,
    });
    if (outputPath) {
      fs.writeFileSync(outputPath, braille, "utf-8");
      return textContent(`Music Braille successfully written to ${outputPath}`);
    }
    return textContent(braille);
  }

  public static createServer(): McpServer {
    const server = new McpServer({
      name: "tmd-mcp-server",
      title: "TMD (Timebase Mark Down) Music Compiler",
      version: TMD_VERSION,
    });

    server.registerTool(
      "get_tmd_skill",
      {
        description:
          "Get comprehensive TMD (Timebase Mark Down) language specification, prompt guidelines, and musical notation grammar.",
        inputSchema: z.object({}),
      },
      async () => TmdMCPServer.handleGetSkill()
    );

    server.registerTool(
      "parse_tmd",
      {
        description:
          "Parse and validate TMD score text or file. Returns metadata (BPM, key, meter, tracks) or syntax error details.",
        inputSchema: z.object({
          text: z.string().optional().describe("TMD score code text"),
          filePath: z.string().optional().describe("Path to .tmd file on filesystem"),
        }),
      },
      async ({ text, filePath }) => TmdMCPServer.handleParseTmd({ text, filePath })
    );

    server.registerTool(
      "check_tmd",
      {
        description:
          "Check and validate TMD score measures, beat consistency, section lengths, and playback order integrity. Identifies rhythmic discrepancies and measure errors.",
        inputSchema: z.object({
          text: z.string().optional().describe("TMD score code text"),
          filePath: z.string().optional().describe("Path to .tmd file on filesystem"),
        }),
      },
      async ({ text, filePath }) => TmdMCPServer.handleCheckTmd({ text, filePath })
    );

    server.registerTool(
      "convert_tmd",
      {
        description:
          "Convert TMD score to target format: midi (base64 or file), musicxml, lilypond, abc, wav audio, reaper project, vsq (VOCALOID2), vsqx (VOCALOID3/4), chordpro (.cho), or braille (.brl/.brf).",
        inputSchema: z.object({
          text: z.string().optional().describe("TMD score code text"),
          filePath: z.string().optional().describe("Path to .tmd file on filesystem"),
          format: z
            .enum([
              "midi",
              "musicxml",
              "lilypond",
              "abc",
              "wav",
              "reaper",
              "rpp",
              "vsq",
              "vsqx",
              "chordpro",
              "cho",
              "braille",
              "brl",
              "brf",
            ])
            .describe("Target format"),
          outputPath: z
            .string()
            .optional()
            .describe("Optional filesystem destination path to write output"),
          section: z
            .string()
            .optional()
            .describe("Optional section filter for MIDI, WAV, or Braille export"),
          instrument: z
            .string()
            .optional()
            .describe("Optional instrument filter for MIDI, WAV, or Braille export"),
        }),
      },
      async ({ text, filePath, format, outputPath, section, instrument }) =>
        TmdMCPServer.handleConvertTmd({ text, filePath, format, outputPath, section, instrument })
    );

    server.registerTool(
      "tmd_export_braille",
      {
        description:
          "Export TMD score to International Music Braille (.brl Unicode or .brf North American Braille ASCII) in Part-by-Part or Bar-over-Bar layout.",
        inputSchema: z.object({
          text: z.string().optional().describe("TMD score code text"),
          tmdCode: z.string().optional().describe("Alias for TMD score code text"),
          filePath: z.string().optional().describe("Path to .tmd file on filesystem"),
          encoding: z
            .enum(["unicode", "ascii"])
            .optional()
            .describe("Braille encoding: unicode (.brl, default) or ascii (.brf)"),
          layout: z
            .enum(["partByPart", "barOverBar"])
            .optional()
            .describe("Score layout: partByPart (default) or barOverBar"),
          outputPath: z
            .string()
            .optional()
            .describe("Optional filesystem destination path to write output"),
          section: z.string().optional().describe("Optional section filter"),
          instrument: z.string().optional().describe("Optional instrument filter"),
        }),
      },
      async ({ text, tmdCode, filePath, encoding, layout, outputPath, section, instrument }) =>
        TmdMCPServer.handleExportBraille({
          text,
          tmdCode,
          filePath,
          encoding,
          layout,
          outputPath,
          section,
          instrument,
        })
    );

    return server;
  }

  public static async run(): Promise<void> {
    const server = TmdMCPServer.createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}
