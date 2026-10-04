import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { TMDWAVRenderer } from "./audio.js";
import { handleCheckCommand } from "./commands/check.js";
import { handleFormatCommand } from "./commands/format.js";
import { handleInspectCommand } from "./commands/inspect.js";
import { handleLSPCommand } from "./commands/lsp.js";
import { runLSPServer } from "./commands/lsp.js";
import { handleOutlineCommand } from "./commands/outline.js";
import { handleRefactorCommand } from "./commands/refactor.js";
import {
  formatSummary,
  TMDMeasureChecker,
  TMDOutlineGenerator,
  TMDOutlineNode,
  TmdParser,
  TMDRefactor,
  TMDSongInspector,
  TMDTonalityVisualizer,
} from "./core/index.js";
import { readUTF8, writeUTF8 } from "./core/text_io.js";
import {
  TMDABCGenerator,
  TMDChordProGenerator,
  TMDLilyPondGenerator,
  TMDMIDIGenerator,
  TMDMusicXMLGenerator,
  TMDReaperGenerator,
  TMDUSTGenerator,
  TMDVSQGenerator,
  TMDVSQXGenerator,
} from "./exporters/index.js";
import { TMDJSONRPCCodec,TMDLSPServer } from "./lsp/index.js";
import { TmdMcpInstaller,TmdMcpServer } from "./mcp/index.js";
import { TmdSkill } from "./skill.js";
import { TMD_VERSION } from "./version.js";

export function printHelp(): void {
  console.log(`OVERVIEW: A compiler and toolkit for TMD (Timebase Mark Down) music notation.

USAGE: tmd [<subcommand>] [<options>] [<input-path>]

SUBCOMMANDS:
  check <input-path>       Check measure consistency and report incorrect beat counts.
  format [<options>] <input-path> Format TMD file with standardized indentation and spacing.
  outline [--json] <input-path> Generate a document symbol outline of a TMD score.
  inspect [--json | --svg | --html] [--locale LOCALE] <input-path> Inspect full song musical profile, vocal tessitura, and arrangement density.
  refactor <subcommand>    Refactor TMD score (rename-instrument, rename-section, extract-instrument).
  lsp                      Run Language Server Protocol (LSP) daemon over stdio (JSON-RPC).

OPTIONS:
  -p, --parse-only        Parse and display the score summary.
  -f, --force             Ignore measure consistency errors during export.
  -m, --midi-output PATH  Export Standard MIDI.
  -x, --musicxml-output PATH  Export MusicXML 4.0.
  -l, --lilypond-output PATH  Export LilyPond source.
  -a, --abc-output PATH   Export ABC notation.
  -r, --reaper-output PATH Export REAPER project (.rpp).
      --rpp-output PATH   Export REAPER project (.rpp).
  -c, --chordpro-output PATH Export ChordPro lead sheet (.cho/.chordpro).
      --cho-output PATH   Export ChordPro lead sheet (.cho/.chordpro).
      --vsq-output PATH   Export vocal track to VOCALOID2 (.vsq) file.
      --vsqx-output PATH  Export vocal track to VOCALOID3/4 (.vsqx) XML file.
  -u, --ust-output PATH   Export vocal track to UTAU / OpenUtau (.ust) file.
      --singer NAME       Vocaloid singer name (defaults to Miku).
      --soundfont PATH    SoundFont/DLS path for WAV rendering (not supported by the portable renderer).
      --section NAME      Optional section filter for MIDI export or playback.
      --instrument NAME   Optional instrument filter for MIDI export or playback.
  -w, --wav-output PATH   Render portable 16-bit stereo WAV.
      --pdf-output PATH   Render PDF through lilypond.
      --play              Render and play through afplay/aplay.
      --lsp               Run Language Server Protocol (LSP) daemon over stdio.
      --mcp               Run as a stdio Model Context Protocol (MCP) server.
      --install-mcp       Register TMD MCP server in Claude, Cursor, and Gemini configs.
      --install-skills    Install the TMD AI-agent skill.
      --version           Show the version.
  -h, --help              Show this help.
`);
}


export function main(argv = process.argv.slice(2)): number {
  if (argv.length > 0) {
    const first = argv[0];
    if (first === "check") {
      return handleCheckCommand(argv.slice(1));
    }
    if (first === "format") {
      return handleFormatCommand(argv.slice(1));
    }
    if (first === "outline") {
      return handleOutlineCommand(argv.slice(1));
    }
    if (first === "inspect") {
      return handleInspectCommand(argv.slice(1));
    }
    if (first === "refactor") {
      return handleRefactorCommand(argv.slice(1));
    }
    if (first === "lsp") {
      return handleLSPCommand(argv.slice(1));
    }
  }

  let input: string | undefined,
    parseOnly = false,
    inspectSong = false,
    force = false,
    play = false,
    installSkills = false,
    installMcp = false,
    runMcp = false,
    runLsp = false,
    singer = "Miku",
    soundfont: string | undefined,
    section: string | undefined,
    instrument: string | undefined;
  const outputs: Record<string, string | undefined> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      printHelp();
      return 0;
    }
    if (arg === "--version") {
      console.log(`tmd-ts ${TMD_VERSION}`);
      return 0;
    }
    if (arg === "-p" || arg === "--parse-only") {
      parseOnly = true;
      continue;
    }
    if (arg === "--inspect") {
      inspectSong = true;
      continue;
    }
    if (arg === "-f" || arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--play") {
      play = true;
      continue;
    }
    if (arg === "--mcp") {
      runMcp = true;
      continue;
    }
    if (arg === "--lsp") {
      runLsp = true;
      continue;
    }
    if (arg === "--install-mcp") {
      installMcp = true;
      continue;
    }
    if (arg === "--install-skills") {
      installSkills = true;
      continue;
    }
    if (arg === "--singer") {
      singer = argv[++i] || "Miku";
      continue;
    }
    if (arg === "--soundfont") {
      soundfont = argv[++i];
      continue;
    }
    if (arg.startsWith("--soundfont=")) {
      soundfont = arg.slice("--soundfont=".length);
      continue;
    }
    if (arg === "--section") {
      section = argv[++i];
      continue;
    }
    if (arg.startsWith("--section=")) {
      section = arg.slice("--section=".length);
      continue;
    }
    if (arg === "--instrument") {
      instrument = argv[++i];
      continue;
    }
    if (arg.startsWith("--instrument=")) {
      instrument = arg.slice("--instrument=".length);
      continue;
    }
    const option: Record<string, string> = {
      "-m": "midi",
      "--midi-output": "midi",
      "-x": "musicxml",
      "--musicxml-output": "musicxml",
      "-l": "lilypond",
      "--lilypond-output": "lilypond",
      "-a": "abc",
      "--abc-output": "abc",
      "-r": "reaper",
      "--reaper-output": "reaper",
      "--rpp-output": "reaper",
      "-c": "chordpro",
      "--chordpro-output": "chordpro",
      "--cho-output": "chordpro",
      "--vsq-output": "vsq",
      "--vsqx-output": "vsqx",
      "-u": "ust",
      "--ust-output": "ust",
      "-w": "wav",
      "--wav-output": "wav",
      "--pdf-output": "pdf",
    };
    if (option[arg]) {
      outputs[option[arg]] = argv[++i];
      continue;
    }
    if (!arg.startsWith("-")) input = arg;
    else {
      console.error(`Unknown option: ${arg}`);
      return 2;
    }
  }

  if (runLsp) {
    return runLSPServer();
  }
  if (runMcp) {
    TmdMcpServer.run().catch((err) => {
      console.error("Fatal error running TMD MCP Server:", err);
      process.exit(1);
    });
    return 0;
  }
  if (installMcp) {
    const results = TmdMcpInstaller.installAll();
    results.forEach((result) =>
      console.log(
        `${result.installed ? "Installed" : "Failed"} TMD MCP config: ${result.path}${
          result.error ? ` (${result.error})` : ""
        }`
      )
    );
    if (!input) return results.every((result) => result.installed) ? 0 : 1;
  }
  if (installSkills) {
    const results = TmdSkill.installSkills();
    results.forEach((result) =>
      console.log(
        `${result.installed ? "Installed" : "Failed"} TMD skill: ${result.path}${
          result.error ? ` (${result.error})` : ""
        }`
      )
    );
    if (!input) return results.every((result) => result.installed) ? 0 : 1;
  }
  if (!input) {
    console.error("Error: Missing expected argument '<input-path>'");
    return 2;
  }
  let fileContent: string;
  try {
    fileContent = fs.readFileSync(input, "utf-8");
  } catch (error) {
    console.error(
      `Error reading ${input}: ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }
  let sheet;
  try {
    sheet = TmdParser.parse(fileContent);
  } catch (error) {
    console.error(
      `Error: Could not parse TMD file at ${input}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return 1;
  }

  const isExporting = Object.values(outputs).some((v) => v !== undefined) || play;
  if (isExporting && !force) {
    const issues = TMDMeasureChecker.check(fileContent);
    if (issues.length > 0) {
      console.error(
        `❌ Export aborted: Found ${issues.length} measure discrepancy issue${
          issues.length === 1 ? "" : "s"
        } in ${input}:`
      );
      for (const issue of issues.slice(0, 10)) {
        console.error(`  - ${issue.description}`);
      }
      if (issues.length > 10) {
        console.error(
          `  ... and ${issues.length - 10} more issues. Run \`tmd check ${input}\` to see all.`
        );
      }
      console.error("\nUse --force (-f) to ignore measure errors and force export.");
      return 1;
    }
  }

  console.log(`tmd-ts ${TMD_VERSION} - In memory of Chen, Chih-Han / aguai (阿怪, 1974–2019).`);
  console.log(
    `Successfully parsed TMD file: ${input}\n----------------------------------------\n${formatSummary(
      sheet
    )}\n----------------------------------------`
  );
  if (inspectSong) {
    const profile = TMDSongInspector.inspect(sheet);
    console.log(TMDSongInspector.generateReport(profile));
    return 0;
  }
  if (parseOnly) return 0;
  if (soundfont && !outputs.wav && !play) {
    console.error("Error: --soundfont is only applicable to WAV rendering or --play.");
    return 1;
  }
  try {
    if (outputs.midi)
      fs.writeFileSync(
        outputs.midi,
        TMDMIDIGenerator.generateMIDI(sheet, TMDMIDIGenerator.defaultTicksPerQuarterNote, {
          targetParagraph: section,
          targetInstrument: instrument,
        })
      );
    if (outputs.musicxml)
      fs.writeFileSync(outputs.musicxml, TMDMusicXMLGenerator.generateMusicXML(sheet));
    if (outputs.lilypond)
      fs.writeFileSync(outputs.lilypond, TMDLilyPondGenerator.generateLilyPond(sheet));
    if (outputs.abc) fs.writeFileSync(outputs.abc, TMDABCGenerator.generateABC(sheet));
    if (outputs.reaper)
      fs.writeFileSync(outputs.reaper, TMDReaperGenerator.generateRPP(sheet));
    if (outputs.chordpro)
      fs.writeFileSync(outputs.chordpro, TMDChordProGenerator.generateChordPro(sheet));
    if (outputs.vsq)
      fs.writeFileSync(outputs.vsq, TMDVSQGenerator.generateVSQ(sheet, { singerName: singer }));
    if (outputs.vsqx)
      fs.writeFileSync(outputs.vsqx, TMDVSQXGenerator.generateVSQX(sheet, { singerName: singer }));
    if (outputs.ust)
      fs.writeFileSync(outputs.ust, TMDUSTGenerator.generateUST(sheet));
    if (outputs.pdf) {
      const temp = path.join(os.tmpdir(), `tmd-${Date.now()}.ly`);
      fs.writeFileSync(temp, TMDLilyPondGenerator.generateLilyPond(sheet));
      execFileSync("lilypond", ["--pdf", "-o", outputs.pdf.replace(/\.pdf$/, ""), temp], {
        stdio: "inherit",
      });
      fs.rmSync(temp, { force: true });
    }
    if (outputs.wav || play) {
      const temp = outputs.wav || path.join(os.tmpdir(), `tmd-${Date.now()}.wav`);
      fs.writeFileSync(
        temp,
        TMDWAVRenderer.renderWAV(sheet, 44100, {
          targetParagraph: section,
          targetInstrument: instrument,
          soundfont,
        })
      );
      if (play)
        execFileSync(process.platform === "darwin" ? "afplay" : "aplay", [temp], {
          stdio: "inherit",
        });
      if (!outputs.wav) fs.rmSync(temp, { force: true });
    }
  } catch (error) {
    console.error(
      `Error exporting TMD: ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }
  return 0;
}
