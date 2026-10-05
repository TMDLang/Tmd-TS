import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { TmdWAVRenderer } from "../audio.js";
import {
  TmdABCGenerator,
  TmdChordProGenerator,
  TmdLilyPondGenerator,
  TmdMIDIGenerator,
  TmdMusicXMLGenerator,
  TmdReaperGenerator,
  TmdVSQGenerator,
  TmdVSQXGenerator,
} from "../exporters/index.js";
import { TmdSkill } from "../skill.js";
import { accidentalToSemitone, scaleDegreeLetter, TmdParser } from "../syntax/index.js";
import { TmdMeasureChecker } from "../validation/index.js";
import { TMD_VERSION } from "../version.js";

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

      const sheet = TmdParser.parse(content);
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

      const paragraphs = sheet.entries.map((p) => ({
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
            timeSignature: sheet.beat
              ? `${sheet.beat.count}/${sheet.beat.noteValue}`
              : "4/4",
            playback: sheet.playback,
            entryCount: sheet.entries.length,
            paragraphs,
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

    const issues = TmdMeasureChecker.check(content);
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
    format: "midi" | "musicxml" | "lilypond" | "abc" | "wav" | "reaper" | "rpp" | "vsq" | "vsqx" | "chordpro" | "cho";
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

    const sheet = TmdParser.parse(content);
    if (!sheet) {
      throw new Error("Invalid TMD score content");
    }

    const fmt = (format || "midi").toLowerCase();
    switch (fmt) {
      case "midi": {
        const uint8 = TmdMIDIGenerator.generateMIDI(sheet, TmdMIDIGenerator.defaultTicksPerQuarterNote, {
          targetParagraph: section,
          targetInstrument: instrument,
        });
        if (outputPath) {
          fs.writeFileSync(outputPath, uint8);
          return textContent(`MIDI successfully written to ${outputPath}`);
        }
        return textContent(Buffer.from(uint8).toString("base64"));
      }
      case "musicxml": {
        const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);
        if (outputPath) {
          fs.writeFileSync(outputPath, xml, "utf-8");
          return textContent(`MusicXML successfully written to ${outputPath}`);
        }
        return textContent(xml);
      }
      case "lilypond": {
        const ly = TmdLilyPondGenerator.generateLilyPond(sheet);
        if (outputPath) {
          fs.writeFileSync(outputPath, ly, "utf-8");
          return textContent(`LilyPond source successfully written to ${outputPath}`);
        }
        return textContent(ly);
      }
      case "abc": {
        const abc = TmdABCGenerator.generateABC(sheet);
        if (outputPath) {
          fs.writeFileSync(outputPath, abc, "utf-8");
          return textContent(`ABC notation successfully written to ${outputPath}`);
        }
        return textContent(abc);
      }
      case "wav": {
        const wav = TmdWAVRenderer.renderWAV(sheet, 44100, {
          targetParagraph: section,
          targetInstrument: instrument,
        });
        if (outputPath) {
          fs.writeFileSync(outputPath, wav);
          return textContent(`WAV audio successfully written to ${outputPath}`);
        }
        return textContent(Buffer.from(wav).toString("base64"));
      }
      case "reaper":
      case "rpp": {
        const rpp = TmdReaperGenerator.generateRPP(sheet);
        if (outputPath) {
          fs.writeFileSync(outputPath, rpp, "utf-8");
          return textContent(`REAPER project successfully written to ${outputPath}`);
        }
        return textContent(rpp);
      }
      case "vsq": {
        const uint8 = TmdVSQGenerator.generateVSQ(sheet);
        if (outputPath) {
          fs.writeFileSync(outputPath, uint8);
          return textContent(`VOCALOID2 (.vsq) successfully written to ${outputPath}`);
        }
        return textContent(Buffer.from(uint8).toString("base64"));
      }
      case "vsqx": {
        const xml = TmdVSQXGenerator.generateVSQX(sheet);
        if (outputPath) {
          fs.writeFileSync(outputPath, xml, "utf-8");
          return textContent(`VOCALOID3/4 (.vsqx) successfully written to ${outputPath}`);
        }
        return textContent(xml);
      }
      case "chordpro":
      case "cho": {
        const cho = TmdChordProGenerator.generateChordPro(sheet);
        if (outputPath) {
          fs.writeFileSync(outputPath, cho, "utf-8");
          return textContent(`ChordPro lead sheet successfully written to ${outputPath}`);
        }
        return textContent(cho);
      }
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
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
          "Convert TMD score to target format: midi (base64 or file), musicxml, lilypond, abc, wav audio, reaper project, vsq (VOCALOID2), vsqx (VOCALOID3/4), or chordpro (.cho).",
        inputSchema: z.object({
          text: z.string().optional().describe("TMD score code text"),
          filePath: z.string().optional().describe("Path to .tmd file on filesystem"),
          format: z
            .enum(["midi", "musicxml", "lilypond", "abc", "wav", "reaper", "rpp", "vsq", "vsqx", "chordpro", "cho"])
            .describe("Target format"),
          outputPath: z
            .string()
            .optional()
            .describe("Optional filesystem destination path to write output"),
          section: z
            .string()
            .optional()
            .describe("Optional section filter for MIDI or WAV export"),
          instrument: z
            .string()
            .optional()
            .describe("Optional instrument filter for MIDI or WAV export"),
        }),
      },
      async ({ text, filePath, format, outputPath, section, instrument }) =>
        TmdMCPServer.handleConvertTmd({ text, filePath, format, outputPath, section, instrument })
    );

    return server;
  }

  public static async run(): Promise<void> {
    const server = TmdMCPServer.createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

export interface McpServerConfigEntry {
  command: string;
  args: string[];
}

export class TmdMCPInstaller {
  public static defaultConfigPaths(): string[] {
    const home = os.homedir();
    const isMac = process.platform === "darwin";

    const paths: string[] = [];

    // Claude Desktop
    if (isMac) {
      paths.push(
        path.join(
          home,
          "Library",
          "Application Support",
          "Claude",
          "claude_desktop_config.json"
        )
      );
    } else if (process.platform === "win32") {
      const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
      paths.push(path.join(appData, "Claude", "claude_desktop_config.json"));
    } else {
      paths.push(
        path.join(home, ".config", "claude", "claude_desktop_config.json")
      );
    }

    // Cursor
    paths.push(path.join(home, ".cursor", "mcp.json"));

    // Gemini / Antigravity
    paths.push(path.join(home, ".gemini", "config", "mcp_config.json"));
    paths.push(path.join(home, ".gemini", "antigravity-cli", "mcp_config.json"));

    // Windsurf / VSCode
    paths.push(path.join(home, ".codeium", "windsurf", "mcp_config.json"));

    return paths;
  }

  public static installToConfigPath(
    configPath: string,
    serverEntry: McpServerConfigEntry = { command: "tmd", args: ["--mcp"] }
  ): { path: string; installed: boolean; error?: string } {
    try {
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let config: any = {};
      if (fs.existsSync(configPath)) {
        try {
          const raw = fs.readFileSync(configPath, "utf-8");
          config = JSON.parse(raw);
        } catch {
          config = {};
        }
      }

      if (!config.mcpServers || typeof config.mcpServers !== "object") {
        config.mcpServers = {};
      }

      config.mcpServers.tmd = serverEntry;

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      return { path: configPath, installed: true };
    } catch (err: any) {
      return { path: configPath, installed: false, error: err.message || String(err) };
    }
  }

  public static installAll(
    paths: string[] = TmdMCPInstaller.defaultConfigPaths(),
    serverEntry?: McpServerConfigEntry
  ): { path: string; installed: boolean; error?: string }[] {
    return paths.map((p) => TmdMCPInstaller.installToConfigPath(p, serverEntry));
  }
}
