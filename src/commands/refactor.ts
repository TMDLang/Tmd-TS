import * as path from "node:path";

import { readUTF8, writeUTF8 } from "../io/text_io.js";
import { TmdRefactor } from "../refactoring/index.js";

function matchOption(
  arg: string,
  argv: string[],
  i: number,
  shortOpt?: string,
  longOpt?: string
): { matched: true; value: string | undefined; nextI: number } | { matched: false } {
  if (shortOpt) {
    if (arg === shortOpt) {
      return { matched: true, value: argv[i + 1], nextI: i + 1 };
    }
    if (arg.startsWith(`${shortOpt}=`)) {
      return { matched: true, value: arg.slice(shortOpt.length + 1), nextI: i };
    }
  }
  if (longOpt) {
    if (arg === longOpt) {
      return { matched: true, value: argv[i + 1], nextI: i + 1 };
    }
    if (arg.startsWith(`${longOpt}=`)) {
      return { matched: true, value: arg.slice(longOpt.length + 1), nextI: i };
    }
  }
  return { matched: false };
}

export function handleRefactorCommand(argv: string[]): number {
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
      let opt = matchOption(arg, rest, i, undefined, "--from");
      if (opt.matched) {
        from = opt.value;
        i = opt.nextI;
        continue;
      }
      opt = matchOption(arg, rest, i, undefined, "--to");
      if (opt.matched) {
        to = opt.value;
        i = opt.nextI;
        continue;
      }
      if (arg === "-i" || arg === "--in-place") {
        inPlace = true;
        continue;
      }
      opt = matchOption(arg, rest, i, "-o", "--output");
      if (opt.matched) {
        outputPath = opt.value;
        i = opt.nextI;
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
      content = readUTF8(inputPath);
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let refactored: string;
    try {
      refactored = TmdRefactor.renameInstrument(content, from, to);
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (inPlace) {
      writeUTF8(inputPath, refactored);
      console.log(`Renamed instrument in ${inputPath} in-place.`);
    } else if (outputPath) {
      writeUTF8(outputPath, refactored);
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
      let opt = matchOption(arg, rest, i, undefined, "--from");
      if (opt.matched) {
        from = opt.value;
        i = opt.nextI;
        continue;
      }
      opt = matchOption(arg, rest, i, undefined, "--to");
      if (opt.matched) {
        to = opt.value;
        i = opt.nextI;
        continue;
      }
      if (arg === "-i" || arg === "--in-place") {
        inPlace = true;
        continue;
      }
      opt = matchOption(arg, rest, i, "-o", "--output");
      if (opt.matched) {
        outputPath = opt.value;
        i = opt.nextI;
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
      content = readUTF8(inputPath);
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let refactored: string;
    try {
      refactored = TmdRefactor.renameSection(content, from, to);
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (inPlace) {
      writeUTF8(inputPath, refactored);
      console.log(`Renamed section in ${inputPath} in-place.`);
    } else if (outputPath) {
      writeUTF8(outputPath, refactored);
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
      let opt = matchOption(arg, rest, i, undefined, "--instrument");
      if (opt.matched) {
        instrument = opt.value;
        i = opt.nextI;
        continue;
      }
      opt = matchOption(arg, rest, i, "-o", "--output");
      if (opt.matched) {
        outputPath = opt.value;
        i = opt.nextI;
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
      content = readUTF8(inputPath);
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let extracted: string;
    try {
      extracted = TmdRefactor.extractInstrument(content, instrument);
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (outputPath) {
      writeUTF8(outputPath, extracted);
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
      let opt = matchOption(arg, rest, i, undefined, "--section");
      if (opt.matched) {
        targetSection = opt.value;
        i = opt.nextI;
        continue;
      }
      opt = matchOption(arg, rest, i, undefined, "--instrument");
      if (opt.matched) {
        targetInstrument = opt.value;
        i = opt.nextI;
        continue;
      }
      if (arg === "-i" || arg === "--in-place") {
        inPlace = true;
        continue;
      }
      opt = matchOption(arg, rest, i, "-o", "--output");
      if (opt.matched) {
        outputPath = opt.value;
        i = opt.nextI;
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
      content = readUTF8(inputPath);
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let transformed: string;
    try {
      const target = targetSection || targetInstrument ? { section: targetSection, instrument: targetInstrument } : undefined;
      if (sub === "double-grid") {
        transformed = TmdRefactor.doubleGrid(content, target);
      } else if (sub === "halve-grid") {
        transformed = TmdRefactor.halveGrid(content, target);
      } else {
        transformed = TmdRefactor.optimizeGrid(content, target);
      }
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (inPlace) {
      writeUTF8(inputPath, transformed);
      console.log(`Transformed grid (${sub}) in ${inputPath} in-place.`);
    } else if (outputPath) {
      writeUTF8(outputPath, transformed);
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
      let opt = matchOption(arg, rest, i, undefined, "--source");
      if (opt.matched) {
        source = opt.value;
        i = opt.nextI;
        continue;
      }
      opt = matchOption(arg, rest, i, undefined, "--target");
      if (opt.matched) {
        target = opt.value;
        i = opt.nextI;
        continue;
      }
      opt = matchOption(arg, rest, i, undefined, "--section");
      if (opt.matched) {
        section = opt.value;
        i = opt.nextI;
        continue;
      }
      opt = matchOption(arg, rest, i, undefined, "--octave");
      if (opt.matched) {
        octaveShift = parseInt(opt.value ?? "", 10) || 0;
        i = opt.nextI;
        continue;
      }
      if (arg === "-i" || arg === "--in-place") {
        inPlace = true;
        continue;
      }
      opt = matchOption(arg, rest, i, "-o", "--output");
      if (opt.matched) {
        outputPath = opt.value;
        i = opt.nextI;
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
      content = readUTF8(inputPath);
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let transformed: string;
    try {
      transformed = TmdRefactor.duplicateTrack(content, source, target, { section, octaveShift });
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (inPlace) {
      writeUTF8(inputPath, transformed);
      console.log(`Duplicated track ${source} -> ${target} in ${inputPath} in-place.`);
    } else if (outputPath) {
      writeUTF8(outputPath, transformed);
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
      let opt = matchOption(arg, rest, i, undefined, "--source");
      if (opt.matched) {
        source = opt.value;
        i = opt.nextI;
        continue;
      }
      opt = matchOption(arg, rest, i, undefined, "--target");
      if (opt.matched) {
        target = opt.value;
        i = opt.nextI;
        continue;
      }
      opt = matchOption(arg, rest, i, undefined, "--section");
      if (opt.matched) {
        section = opt.value;
        i = opt.nextI;
        continue;
      }
      opt = matchOption(arg, rest, i, undefined, "--interval");
      if (opt.matched) {
        intervalSteps = parseInt(opt.value ?? "", 10) || 0;
        i = opt.nextI;
        continue;
      }
      if (arg === "-i" || arg === "--in-place") {
        inPlace = true;
        continue;
      }
      opt = matchOption(arg, rest, i, "-o", "--output");
      if (opt.matched) {
        outputPath = opt.value;
        i = opt.nextI;
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
      content = readUTF8(inputPath);
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let transformed: string;
    try {
      transformed = TmdRefactor.generateHarmony(content, source, target, { section, intervalSteps });
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (inPlace) {
      writeUTF8(inputPath, transformed);
      console.log(`Generated harmony ${source} -> ${target} in ${inputPath} in-place.`);
    } else if (outputPath) {
      writeUTF8(outputPath, transformed);
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
      const opt = matchOption(arg, rest, i, "-o", "--output");
      if (opt.matched) {
        outputPath = opt.value;
        i = opt.nextI;
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
      content = readUTF8(inputPath);
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let transformed: string;
    try {
      transformed = TmdRefactor.inlineOrders(content);
    } catch (error: any) {
      console.error(`Refactor error: ${error.message || String(error)}`);
      return 1;
    }

    if (inPlace) {
      writeUTF8(inputPath, transformed);
      console.log(`Inlined orders in ${inputPath} in-place.`);
    } else if (outputPath) {
      writeUTF8(outputPath, transformed);
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
      let opt = matchOption(arg, rest, i, "-s", "--semitones");
      if (opt.matched) {
        semitones = parseInt(opt.value ?? "", 10) || 0;
        i = opt.nextI;
        continue;
      }
      opt = matchOption(arg, rest, i, "-d", "--diatonic");
      if (opt.matched) {
        diatonicSteps = parseInt(opt.value ?? "", 10) || 0;
        i = opt.nextI;
        continue;
      }
      if (arg === "-k" || arg === "--update-key") {
        updateKeySignature = true;
        continue;
      }
      opt = matchOption(arg, rest, i, undefined, "--section");
      if (opt.matched) {
        section = opt.value;
        i = opt.nextI;
        continue;
      }
      opt = matchOption(arg, rest, i, undefined, "--instrument");
      if (opt.matched) {
        instrument = opt.value;
        i = opt.nextI;
        continue;
      }
      if (arg === "-i" || arg === "--in-place") {
        inPlace = true;
        continue;
      }
      opt = matchOption(arg, rest, i, "-o", "--output");
      if (opt.matched) {
        outputPath = opt.value;
        i = opt.nextI;
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
      content = readUTF8(inputPath);
    } catch (error: any) {
      console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }

    let transformed: string;
    try {
      transformed = TmdRefactor.transpose(content, {
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
      writeUTF8(inputPath, transformed);
      console.log(`Transposed score in ${inputPath} in-place.`);
    } else if (outputPath) {
      writeUTF8(outputPath, transformed);
      console.log(`Transposed output written to ${outputPath}.`);
    } else {
      process.stdout.write(transformed);
    }
    return 0;
  }

  console.error(`Unknown refactor subcommand: ${sub}`);
  return 2;
}
