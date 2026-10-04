import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { TMDWAVRenderer } from "./audio.js";
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
import { readUTF8, writeUTF8 } from "./core/text_io.js";
import { handleCheckCommand } from "./commands/check.js";

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

function handleLSPCommand(argv: string[]): number {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      console.log(`USAGE: tmd lsp

Run the TMD Language Server Protocol (LSP) daemon communicating over standard I/O (JSON-RPC).
`);
      return 0;
    }
  }
  return runLSPServer();
}

function runLSPServer(): number {
  const server = new TMDLSPServer((data) => {
    process.stdout.write(data);
  });

  let buffer = Buffer.alloc(0);

  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    const { frames, remaining } = TMDJSONRPCCodec.decodeBuffer(buffer);
    buffer = Buffer.from(remaining);
    for (const frame of frames) {
      server.handle(frame);
    }
    if (!server.isRunning) {
      process.exit(0);
    }
  });

  process.stdin.on("end", () => {
    process.exit(0);
  });

  return 0;
}

function handleOutlineCommand(argv: string[]): number {
  let inputPath: string | undefined;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      console.log(`USAGE: tmd outline [--json] <input-path>

Generate a document symbol outline of a TMD score.

OPTIONS:
  --json                  Output outline as JSON.
`);
      return 0;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (!arg.startsWith("-")) {
      inputPath = arg;
    } else {
      console.error(`Unknown option: ${arg}`);
      return 2;
    }
  }

  if (!inputPath) {
    console.error("Error: Missing expected argument '<input-path>' for outline");
    return 2;
  }

  let content: string;
  try {
    content = readUTF8(inputPath);
  } catch (error: any) {
    console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
    return 1;
  }

  const nodes = TMDOutlineGenerator.generate(content);

  if (json) {
    console.log(JSON.stringify(nodes, null, 2));
  } else {
    function printNode(node: TMDOutlineNode, indent: number) {
      const pad = "  ".repeat(indent);
      let line = `${pad}- [${node.kind}] ${node.name}`;
      if (node.detail) {
        line += ` (${node.detail})`;
      }
      line += ` [L${node.range.startLine}:C${node.range.startColumn} - L${node.range.endLine}:C${node.range.endColumn}]`;
      console.log(line);
      if (node.children) {
        for (const child of node.children) {
          printNode(child, indent + 1);
        }
      }
    }

    for (const node of nodes) {
      printNode(node, 0);
    }
  }
  return 0;
}

function handleInspectCommand(argv: string[]): number {
  let inputPath: string | undefined;
  let json = false;
  let svg = false;
  let html = false;
  let locale = "zh-Hant";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      console.log(`USAGE: tmd inspect [--json | --svg | --html] [--locale LOCALE] <input-path>

Inspect full song musical profile, vocal tessitura, key modulations, and arrangement density.

OPTIONS:
  --json                  Output song profile as JSON.
  --svg                   Output tonality visualizer dashboard as SVG.
  --html                  Output tonality report and dashboard as HTML.
  --locale LOCALE         Localization for generated output (en or zh-Hant).
`);
      return 0;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--svg") {
      svg = true;
      continue;
    }
    if (arg === "--html") {
      html = true;
      continue;
    }
    if (arg === "--locale") {
      locale = argv[++i] || "zh-Hant";
      continue;
    }
    if (arg.startsWith("--locale=")) {
      locale = arg.slice("--locale=".length) || "zh-Hant";
      continue;
    }
    if (!arg.startsWith("-")) {
      inputPath = arg;
    } else {
      console.error(`Unknown option: ${arg}`);
      return 2;
    }
  }

  if (!inputPath) {
    console.error("Error: Missing expected argument '<input-path>' for inspect");
    return 2;
  }

  let content: string;
  try {
    content = readUTF8(inputPath);
  } catch (error: any) {
    console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
    return 1;
  }

  let sheet;
  try {
    sheet = TmdParser.parse(content);
  } catch (error: any) {
    console.error(`Parse error in ${inputPath}: ${error.message || String(error)}`);
    return 1;
  }

  if (!sheet) {
    console.error(`Failed to parse TMD score: ${inputPath}`);
    return 1;
  }

  const normalizedLocale = locale.toLowerCase().startsWith("zh") ? "zh-Hant" : "en";
  const profile = TMDSongInspector.inspect(sheet, undefined, normalizedLocale);

  if (json) {
    console.log(JSON.stringify(profile, null, 2));
  } else if (svg) {
    console.log(TMDTonalityVisualizer.generateSVG(profile, normalizedLocale));
  } else if (html) {
    console.log(TMDTonalityVisualizer.generateHTML(profile, normalizedLocale));
  } else {
    console.log(TMDSongInspector.generateReport(profile, normalizedLocale));
  }
  return 0;
}

function handleFormatCommand(argv: string[]): number {
  let inputPath: string | undefined;
  let inPlace = false;
  let outputPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      console.log(`USAGE: tmd format [<options>] <input-path>

Format a TMD file with standardized indentation, spacing, and comments preserved.

OPTIONS:
  -i, --in-place          Modify the file in-place.
  -o, --output PATH       Output formatted score to the specified path.
`);
      return 0;
    }
    if (arg === "-i" || arg === "--in-place") {
      inPlace = true;
      continue;
    }
    if (arg === "-o" || arg === "--output") {
      outputPath = argv[++i];
      continue;
    }
    if (!arg.startsWith("-")) {
      inputPath = arg;
    } else {
      console.error(`Unknown option: ${arg}`);
      return 2;
    }
  }

  if (!inputPath) {
    console.error("Error: Missing expected argument '<input-path>' for format");
    return 2;
  }

  let content: string;
  try {
    content = fs.readFileSync(inputPath, "utf-8");
  } catch (error: any) {
    console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
    return 1;
  }

  const formatted = TMDRefactor.format(content);

  if (inPlace) {
    try {
      writeUTF8(inputPath, formatted);
      console.log(`Formatted ${inputPath} in-place.`);
      return 0;
    } catch (error: any) {
      console.error(`Error writing ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }
  } else if (outputPath) {
    try {
      writeUTF8(outputPath, formatted);
      console.log(`Formatted output written to ${outputPath}.`);
      return 0;
    } catch (error: any) {
      console.error(`Error writing ${outputPath}: ${error.message || String(error)}`);
      return 1;
    }
  } else {
    process.stdout.write(formatted);
    return 0;
  }
}

function handleRefactorCommand(argv: string[]): number {
  const sub = argv[0];
  if (!sub || sub === "-h" || sub === "--help") {
    console.log(`USAGE: tmd refactor <subcommand> [<options>] <input-path>

Music score refactoring tools.

SUBCOMMANDS:
  rename-instrument       Rename all occurrences of an instrument in a score.
  rename-section          Rename all occurrences of a section in a score.
  extract-instrument      Extract all tracks belonging to an instrument into a separate document.
  double-grid             Double grid resolution (<4*> -> <8*>) with ties.
  halve-grid              Halve grid resolution (<8*> -> <4*>) when divisible.
  optimize-grid           Optimize and compress grid resolution (<4*> -> <1*>) where possible.
  duplicate-track         Duplicate an instrument track with optional octave shift.
  generate-harmony        Generate diatonic parallel harmony track (e.g. 3rd, 6th).
  inline-orders           Unroll order sequence into a single linear section.
  transpose               Transpose pitch notes and chords up/down by semitones or diatonic steps.
`);
    return 0;
  }

  const rest = argv.slice(1);
  if (sub === "rename-instrument") {
    let inputPath: string | undefined;
    let from: string | undefined;
    let to: string | undefined;
    let inPlace = false;
    let outputPath: string | undefined;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "-h" || arg === "--help") {
        console.log(`USAGE: tmd refactor rename-instrument [<options>] <input-path>`);
        return 0;
      }
      if (arg === "--from") {
        from = rest[++i];
        continue;
      }
      if (arg === "--to") {
        to = rest[++i];
        continue;
      }
      if (arg === "-i" || arg === "--in-place") {
        inPlace = true;
        continue;
      }
      if (arg === "-o" || arg === "--output") {
        outputPath = rest[++i];
        continue;
      }
      if (!arg.startsWith("-")) {
        inputPath = arg;
      } else {
        console.error(`Unknown option: ${arg}`);
        return 2;
      }
    }

    if (!inputPath || !from || !to) {
      console.error("Error: rename-instrument requires <input-path>, --from, and --to");
      return 2;
    }

    let content: string;
    try {
      content = fs.readFileSync(inputPath, "utf-8");
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let refactored: string;
    try {
      refactored = TMDRefactor.renameInstrument(content, from, to);
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (inPlace) {
      fs.writeFileSync(inputPath, refactored, "utf-8");
      console.log(`Renamed instrument in ${inputPath} in-place.`);
    } else if (outputPath) {
      fs.writeFileSync(outputPath, refactored, "utf-8");
      console.log(`Refactored score written to ${outputPath}.`);
    } else {
      process.stdout.write(refactored);
    }
    return 0;
  }

  if (sub === "rename-section") {
    let inputPath: string | undefined;
    let from: string | undefined;
    let to: string | undefined;
    let inPlace = false;
    let outputPath: string | undefined;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "-h" || arg === "--help") {
        console.log(`USAGE: tmd refactor rename-section [<options>] <input-path>`);
        return 0;
      }
      if (arg === "--from") {
        from = rest[++i];
        continue;
      }
      if (arg === "--to") {
        to = rest[++i];
        continue;
      }
      if (arg === "-i" || arg === "--in-place") {
        inPlace = true;
        continue;
      }
      if (arg === "-o" || arg === "--output") {
        outputPath = rest[++i];
        continue;
      }
      if (!arg.startsWith("-")) {
        inputPath = arg;
      } else {
        console.error(`Unknown option: ${arg}`);
        return 2;
      }
    }

    if (!inputPath || !from || !to) {
      console.error("Error: rename-section requires <input-path>, --from, and --to");
      return 2;
    }

    let content: string;
    try {
      content = fs.readFileSync(inputPath, "utf-8");
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let refactored: string;
    try {
      refactored = TMDRefactor.renameSection(content, from, to);
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (inPlace) {
      fs.writeFileSync(inputPath, refactored, "utf-8");
      console.log(`Renamed section in ${inputPath} in-place.`);
    } else if (outputPath) {
      fs.writeFileSync(outputPath, refactored, "utf-8");
      console.log(`Refactored score written to ${outputPath}.`);
    } else {
      process.stdout.write(refactored);
    }
    return 0;
  }

  if (sub === "extract-instrument") {
    let inputPath: string | undefined;
    let instrument: string | undefined;
    let outputPath: string | undefined;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "-h" || arg === "--help") {
        console.log(`USAGE: tmd refactor extract-instrument [<options>] <input-path>`);
        return 0;
      }
      if (arg === "--instrument") {
        instrument = rest[++i];
        continue;
      }
      if (arg === "-o" || arg === "--output") {
        outputPath = rest[++i];
        continue;
      }
      if (!arg.startsWith("-")) {
        inputPath = arg;
      } else {
        console.error(`Unknown option: ${arg}`);
        return 2;
      }
    }

    if (!inputPath || !instrument) {
      console.error("Error: extract-instrument requires <input-path> and --instrument");
      return 2;
    }

    let content: string;
    try {
      content = fs.readFileSync(inputPath, "utf-8");
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let extracted: string;
    try {
      extracted = TMDRefactor.extractInstrument(content, instrument);
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (outputPath) {
      fs.writeFileSync(outputPath, extracted, "utf-8");
      console.log(`Extracted instrument '${instrument}' to ${outputPath}.`);
    } else {
      process.stdout.write(extracted);
    }
    return 0;
  }

  if (sub === "double-grid" || sub === "halve-grid" || sub === "optimize-grid") {
    let inputPath: string | undefined;
    let targetSection: string | undefined;
    let targetInstrument: string | undefined;
    let inPlace = false;
    let outputPath: string | undefined;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "-h" || arg === "--help") {
        console.log(`USAGE: tmd refactor ${sub} [<options>] <input-path>`);
        return 0;
      }
      if (arg === "--section") {
        targetSection = rest[++i];
        continue;
      }
      if (arg === "--instrument") {
        targetInstrument = rest[++i];
        continue;
      }
      if (arg === "-i" || arg === "--in-place") {
        inPlace = true;
        continue;
      }
      if (arg === "-o" || arg === "--output") {
        outputPath = rest[++i];
        continue;
      }
      if (!arg.startsWith("-")) {
        inputPath = arg;
      } else {
        console.error(`Unknown option: ${arg}`);
        return 2;
      }
    }

    if (!inputPath) {
      console.error(`Error: ${sub} requires <input-path>`);
      return 2;
    }

    let content: string;
    try {
      content = fs.readFileSync(inputPath, "utf-8");
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let transformed: string;
    try {
      const target = targetSection || targetInstrument ? { section: targetSection, instrument: targetInstrument } : undefined;
      if (sub === "double-grid") {
        transformed = TMDRefactor.doubleGrid(content, target);
      } else if (sub === "halve-grid") {
        transformed = TMDRefactor.halveGrid(content, target);
      } else {
        transformed = TMDRefactor.optimizeGrid(content, target);
      }
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (inPlace) {
      fs.writeFileSync(inputPath, transformed, "utf-8");
      console.log(`Transformed grid (${sub}) in ${inputPath} in-place.`);
    } else if (outputPath) {
      fs.writeFileSync(outputPath, transformed, "utf-8");
      console.log(`Transformed score written to ${outputPath}.`);
    } else {
      process.stdout.write(transformed);
    }
    return 0;
  }

  if (sub === "duplicate-track") {
    let inputPath: string | undefined;
    let source: string | undefined;
    let target: string | undefined;
    let section: string | undefined;
    let octaveShift = 0;
    let inPlace = false;
    let outputPath: string | undefined;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "-h" || arg === "--help") {
        console.log(`USAGE: tmd refactor duplicate-track [<options>] <input-path>`);
        return 0;
      }
      if (arg === "--source") {
        source = rest[++i];
        continue;
      }
      if (arg === "--target") {
        target = rest[++i];
        continue;
      }
      if (arg === "--section") {
        section = rest[++i];
        continue;
      }
      if (arg === "--octave") {
        octaveShift = parseInt(rest[++i], 10) || 0;
        continue;
      }
      if (arg === "-i" || arg === "--in-place") {
        inPlace = true;
        continue;
      }
      if (arg === "-o" || arg === "--output") {
        outputPath = rest[++i];
        continue;
      }
      if (!arg.startsWith("-")) {
        inputPath = arg;
      } else {
        console.error(`Unknown option: ${arg}`);
        return 2;
      }
    }

    if (!inputPath || !source || !target) {
      console.error("Error: duplicate-track requires <input-path>, --source, and --target");
      return 2;
    }

    let content: string;
    try {
      content = fs.readFileSync(inputPath, "utf-8");
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let transformed: string;
    try {
      transformed = TMDRefactor.duplicateTrack(content, source, target, { section, octaveShift });
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (inPlace) {
      fs.writeFileSync(inputPath, transformed, "utf-8");
      console.log(`Duplicated track ${source} -> ${target} in ${inputPath} in-place.`);
    } else if (outputPath) {
      fs.writeFileSync(outputPath, transformed, "utf-8");
      console.log(`Duplicated track output written to ${outputPath}.`);
    } else {
      process.stdout.write(transformed);
    }
    return 0;
  }

  if (sub === "generate-harmony") {
    let inputPath: string | undefined;
    let source: string | undefined;
    let target: string | undefined;
    let section: string | undefined;
    let intervalSteps = 2; // Default parallel 3rd
    let inPlace = false;
    let outputPath: string | undefined;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "-h" || arg === "--help") {
        console.log(`USAGE: tmd refactor generate-harmony [<options>] <input-path>`);
        return 0;
      }
      if (arg === "--source") {
        source = rest[++i];
        continue;
      }
      if (arg === "--target") {
        target = rest[++i];
        continue;
      }
      if (arg === "--section") {
        section = rest[++i];
        continue;
      }
      if (arg === "--interval") {
        intervalSteps = parseInt(rest[++i], 10) || 0;
        continue;
      }
      if (arg === "-i" || arg === "--in-place") {
        inPlace = true;
        continue;
      }
      if (arg === "-o" || arg === "--output") {
        outputPath = rest[++i];
        continue;
      }
      if (!arg.startsWith("-")) {
        inputPath = arg;
      } else {
        console.error(`Unknown option: ${arg}`);
        return 2;
      }
    }

    if (!inputPath || !source || !target) {
      console.error("Error: generate-harmony requires <input-path>, --source, and --target");
      return 2;
    }

    let content: string;
    try {
      content = fs.readFileSync(inputPath, "utf-8");
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let transformed: string;
    try {
      transformed = TMDRefactor.generateHarmony(content, source, target, { section, intervalSteps });
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (inPlace) {
      fs.writeFileSync(inputPath, transformed, "utf-8");
      console.log(`Generated harmony ${source} -> ${target} in ${inputPath} in-place.`);
    } else if (outputPath) {
      fs.writeFileSync(outputPath, transformed, "utf-8");
      console.log(`Harmony output written to ${outputPath}.`);
    } else {
      process.stdout.write(transformed);
    }
    return 0;
  }

  if (sub === "inline-orders") {
    let inputPath: string | undefined;
    let inPlace = false;
    let outputPath: string | undefined;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "-h" || arg === "--help") {
        console.log(`USAGE: tmd refactor inline-orders [<options>] <input-path>`);
        return 0;
      }
      if (arg === "-i" || arg === "--in-place") {
        inPlace = true;
        continue;
      }
      if (arg === "-o" || arg === "--output") {
        outputPath = rest[++i];
        continue;
      }
      if (!arg.startsWith("-")) {
        inputPath = arg;
      } else {
        console.error(`Unknown option: ${arg}`);
        return 2;
      }
    }

    if (!inputPath) {
      console.error("Error: inline-orders requires <input-path>");
      return 2;
    }

    let content: string;
    try {
      content = fs.readFileSync(inputPath, "utf-8");
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let transformed: string;
    try {
      transformed = TMDRefactor.inlineOrders(content);
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (inPlace) {
      fs.writeFileSync(inputPath, transformed, "utf-8");
      console.log(`Inlined orders in ${inputPath} in-place.`);
    } else if (outputPath) {
      fs.writeFileSync(outputPath, transformed, "utf-8");
      console.log(`Inlined output written to ${outputPath}.`);
    } else {
      process.stdout.write(transformed);
    }
    return 0;
  }

  if (sub === "transpose") {
    let inputPath: string | undefined;
    let semitones = 0;
    let diatonicSteps = 0;
    let updateKeySignature = false;
    let section: string | undefined;
    let instrument: string | undefined;
    let inPlace = false;
    let outputPath: string | undefined;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "-h" || arg === "--help") {
        console.log(`USAGE: tmd refactor transpose [<options>] <input-path>

Transpose notes and chords up/down by semitones or diatonic steps.

OPTIONS:
  -s, --semitones N       Number of semitones to transpose (+1, -1, +2, -5, etc.).
  -d, --diatonic N        Number of diatonic scale steps to shift (+1, -1, +2, etc.).
  -k, --update-key        Update global key signature '?= ...' line in score.
      --section NAME      Restrict transposition to a specific section.
      --instrument NAME   Restrict transposition to a specific instrument.
  -i, --in-place          Modify the file in-place.
  -o, --output PATH       Write result to output path.
`);
        return 0;
      }
      if (arg === "-s" || arg === "--semitones") {
        semitones = parseInt(rest[++i], 10) || 0;
        continue;
      }
      if (arg === "-d" || arg === "--diatonic") {
        diatonicSteps = parseInt(rest[++i], 10) || 0;
        continue;
      }
      if (arg === "-k" || arg === "--update-key") {
        updateKeySignature = true;
        continue;
      }
      if (arg === "--section") {
        section = rest[++i];
        continue;
      }
      if (arg === "--instrument") {
        instrument = rest[++i];
        continue;
      }
      if (arg === "-i" || arg === "--in-place") {
        inPlace = true;
        continue;
      }
      if (arg === "-o" || arg === "--output") {
        outputPath = rest[++i];
        continue;
      }
      if (!arg.startsWith("-")) {
        inputPath = arg;
      } else {
        console.error(`Unknown option: ${arg}`);
        return 2;
      }
    }

    if (!inputPath) {
      console.error("Error: transpose requires <input-path>");
      return 2;
    }

    let content: string;
    try {
      content = fs.readFileSync(inputPath, "utf-8");
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let transformed: string;
    try {
      transformed = TMDRefactor.transpose(content, {
        semitones,
        diatonicSteps,
        updateKeySignature,
        section,
        instrument,
      });
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (inPlace) {
      fs.writeFileSync(inputPath, transformed, "utf-8");
      console.log(`Transposed score in ${inputPath} in-place.`);
    } else if (outputPath) {
      fs.writeFileSync(outputPath, transformed, "utf-8");
      console.log(`Transposed output written to ${outputPath}.`);
    } else {
      process.stdout.write(transformed);
    }
    return 0;
  }

  console.error(`Unknown refactor subcommand: ${sub}`);
  return 2;
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
