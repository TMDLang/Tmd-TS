import * as fs from "node:fs";
import * as path from "node:path";

import { TMDRefactor } from "../core/index.js";

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
