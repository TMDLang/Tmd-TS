import { readUTF8, writeUTF8 } from "../io/text_io.js";
import { TmdRefactor } from "../refactoring/index.js";

export function matchOption(
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

export interface CliFileTransformOptions {
  inputPath: string;
  inPlace?: boolean;
  outputPath?: string;
  inPlaceMessage?: (inputPath: string) => string;
  outputMessage?: (outputPath: string) => string;
  transform: (content: string) => string;
}

export function executeCliFileTransform(options: CliFileTransformOptions): number {
  const {
    inputPath,
    inPlace = false,
    outputPath,
    inPlaceMessage = (p) => `Refactored ${p} in-place.`,
    outputMessage = (p) => `Refactored score written to ${p}.`,
    transform,
  } = options;

  let content: string;
  try {
    content = readUTF8(inputPath);
  } catch (error: any) {
    console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
    return 1;
  }

  let transformed: string;
  try {
    transformed = transform(content);
  } catch (error: any) {
    console.error(`Refactor error: ${error.message || String(error)}`);
    return 1;
  }

  if (inPlace) {
    try {
      writeUTF8(inputPath, transformed);
      console.log(inPlaceMessage(inputPath));
      return 0;
    } catch (error: any) {
      console.error(`Error writing ${inputPath}: ${error.message || String(error)}`);
      return 1;
    }
  }

  if (outputPath) {
    try {
      writeUTF8(outputPath, transformed);
      console.log(outputMessage(outputPath));
      return 0;
    } catch (error: any) {
      console.error(`Error writing ${outputPath}: ${error.message || String(error)}`);
      return 1;
    }
  }

  process.stdout.write(transformed);
  return 0;
}

interface ParsedCommonArgs {
  status: "ok" | "help" | "error";
  inputPath?: string;
  inPlace: boolean;
  outputPath?: string;
}

function parseSubcommandArgs(
  rest: string[],
  usageText: string,
  allowInPlace: boolean,
  onCustomArg?: (arg: string, rest: string[], i: number) => { matched: boolean; nextI: number }
): ParsedCommonArgs {
  let inputPath: string | undefined;
  let inPlace = false;
  let outputPath: string | undefined;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "-h" || arg === "--help") {
      console.log(usageText);
      return { status: "help", inPlace, outputPath };
    }
    if (onCustomArg) {
      const custom = onCustomArg(arg, rest, i);
      if (custom.matched) {
        i = custom.nextI;
        continue;
      }
    }
    if (allowInPlace && (arg === "-i" || arg === "--in-place")) {
      inPlace = true;
      continue;
    }
    const outOpt = matchOption(arg, rest, i, "-o", "--output");
    if (outOpt.matched) {
      outputPath = outOpt.value;
      i = outOpt.nextI;
      continue;
    }
    if (!arg.startsWith("-")) {
      inputPath = arg;
    } else {
      console.error(`Unknown option: ${arg}`);
      return { status: "error", inPlace, outputPath };
    }
  }

  return { status: "ok", inputPath, inPlace, outputPath };
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

  if (sub === "rename-instrument" || sub === "rename-section") {
    let from: string | undefined;
    let to: string | undefined;
    const parsed = parseSubcommandArgs(
      rest,
      `USAGE: tmd refactor ${sub} [<options>] <input-path>`,
      true,
      (arg, args, i) => {
        let opt = matchOption(arg, args, i, undefined, "--from");
        if (opt.matched) {
          from = opt.value;
          return { matched: true, nextI: opt.nextI };
        }
        opt = matchOption(arg, args, i, undefined, "--to");
        if (opt.matched) {
          to = opt.value;
          return { matched: true, nextI: opt.nextI };
        }
        return { matched: false, nextI: i };
      }
    );
    if (parsed.status === "help") return 0;
    if (parsed.status === "error") return 2;
    if (!parsed.inputPath || !from || !to) {
      console.error(`Error: ${sub} requires <input-path>, --from, and --to`);
      return 2;
    }

    const label = sub === "rename-instrument" ? "instrument" : "section";
    return executeCliFileTransform({
      inputPath: parsed.inputPath,
      inPlace: parsed.inPlace,
      outputPath: parsed.outputPath,
      inPlaceMessage: (p) => `Renamed ${label} in ${p} in-place.`,
      transform: (content) =>
        sub === "rename-instrument"
          ? TmdRefactor.renameInstrument(content, from!, to!)
          : TmdRefactor.renameSection(content, from!, to!),
    });
  }

  if (sub === "extract-instrument") {
    let instrument: string | undefined;
    const parsed = parseSubcommandArgs(
      rest,
      `USAGE: tmd refactor extract-instrument [<options>] <input-path>`,
      false,
      (arg, args, i) => {
        const opt = matchOption(arg, args, i, undefined, "--instrument");
        if (opt.matched) {
          instrument = opt.value;
          return { matched: true, nextI: opt.nextI };
        }
        return { matched: false, nextI: i };
      }
    );
    if (parsed.status === "help") return 0;
    if (parsed.status === "error") return 2;
    if (!parsed.inputPath || !instrument) {
      console.error("Error: extract-instrument requires <input-path> and --instrument");
      return 2;
    }

    return executeCliFileTransform({
      inputPath: parsed.inputPath,
      outputPath: parsed.outputPath,
      outputMessage: (p) => `Extracted instrument '${instrument}' to ${p}.`,
      transform: (content) => TmdRefactor.extractInstrument(content, instrument!),
    });
  }

  if (sub === "double-grid" || sub === "halve-grid" || sub === "optimize-grid") {
    let targetSection: string | undefined;
    let targetInstrument: string | undefined;
    const parsed = parseSubcommandArgs(
      rest,
      `USAGE: tmd refactor ${sub} [<options>] <input-path>`,
      true,
      (arg, args, i) => {
        let opt = matchOption(arg, args, i, undefined, "--section");
        if (opt.matched) {
          targetSection = opt.value;
          return { matched: true, nextI: opt.nextI };
        }
        opt = matchOption(arg, args, i, undefined, "--instrument");
        if (opt.matched) {
          targetInstrument = opt.value;
          return { matched: true, nextI: opt.nextI };
        }
        return { matched: false, nextI: i };
      }
    );
    if (parsed.status === "help") return 0;
    if (parsed.status === "error") return 2;
    if (!parsed.inputPath) {
      console.error(`Error: ${sub} requires <input-path>`);
      return 2;
    }

    const target =
      targetSection || targetInstrument
        ? { section: targetSection, instrument: targetInstrument }
        : undefined;
    return executeCliFileTransform({
      inputPath: parsed.inputPath,
      inPlace: parsed.inPlace,
      outputPath: parsed.outputPath,
      inPlaceMessage: (p) => `Transformed grid (${sub}) in ${p} in-place.`,
      outputMessage: (p) => `Transformed score written to ${p}.`,
      transform: (content) => {
        if (sub === "double-grid") return TmdRefactor.doubleGrid(content, target);
        if (sub === "halve-grid") return TmdRefactor.halveGrid(content, target);
        return TmdRefactor.optimizeGrid(content, target);
      },
    });
  }

  if (sub === "duplicate-track" || sub === "generate-harmony") {
    let source: string | undefined;
    let target: string | undefined;
    let section: string | undefined;
    let octaveShift = 0;
    let intervalSteps = 2;

    const parsed = parseSubcommandArgs(
      rest,
      `USAGE: tmd refactor ${sub} [<options>] <input-path>`,
      true,
      (arg, args, i) => {
        let opt = matchOption(arg, args, i, undefined, "--source");
        if (opt.matched) {
          source = opt.value;
          return { matched: true, nextI: opt.nextI };
        }
        opt = matchOption(arg, args, i, undefined, "--target");
        if (opt.matched) {
          target = opt.value;
          return { matched: true, nextI: opt.nextI };
        }
        opt = matchOption(arg, args, i, undefined, "--section");
        if (opt.matched) {
          section = opt.value;
          return { matched: true, nextI: opt.nextI };
        }
        if (sub === "duplicate-track") {
          opt = matchOption(arg, args, i, undefined, "--octave");
          if (opt.matched) {
            octaveShift = parseInt(opt.value ?? "", 10) || 0;
            return { matched: true, nextI: opt.nextI };
          }
        } else {
          opt = matchOption(arg, args, i, undefined, "--interval");
          if (opt.matched) {
            intervalSteps = parseInt(opt.value ?? "", 10) || 0;
            return { matched: true, nextI: opt.nextI };
          }
        }
        return { matched: false, nextI: i };
      }
    );
    if (parsed.status === "help") return 0;
    if (parsed.status === "error") return 2;
    if (!parsed.inputPath || !source || !target) {
      console.error(`Error: ${sub} requires <input-path>, --source, and --target`);
      return 2;
    }

    return executeCliFileTransform({
      inputPath: parsed.inputPath,
      inPlace: parsed.inPlace,
      outputPath: parsed.outputPath,
      inPlaceMessage: (p) =>
        sub === "duplicate-track"
          ? `Duplicated track ${source} -> ${target} in ${p} in-place.`
          : `Generated harmony ${source} -> ${target} in ${p} in-place.`,
      outputMessage: (p) =>
        sub === "duplicate-track"
          ? `Duplicated track output written to ${p}.`
          : `Harmony output written to ${p}.`,
      transform: (content) =>
        sub === "duplicate-track"
          ? TmdRefactor.duplicateTrack(content, source!, target!, { section, octaveShift })
          : TmdRefactor.generateHarmony(content, source!, target!, { section, intervalSteps }),
    });
  }

  if (sub === "inline-orders") {
    const parsed = parseSubcommandArgs(
      rest,
      `USAGE: tmd refactor inline-orders [<options>] <input-path>`,
      true
    );
    if (parsed.status === "help") return 0;
    if (parsed.status === "error") return 2;
    if (!parsed.inputPath) {
      console.error("Error: inline-orders requires <input-path>");
      return 2;
    }

    return executeCliFileTransform({
      inputPath: parsed.inputPath,
      inPlace: parsed.inPlace,
      outputPath: parsed.outputPath,
      inPlaceMessage: (p) => `Inlined orders in ${p} in-place.`,
      outputMessage: (p) => `Inlined output written to ${p}.`,
      transform: (content) => TmdRefactor.inlineOrders(content),
    });
  }

  if (sub === "transpose") {
    let semitones = 0;
    let diatonicSteps = 0;
    let updateKeySignature = false;
    let section: string | undefined;
    let instrument: string | undefined;

    const transposeUsage = `USAGE: tmd refactor transpose [<options>] <input-path>

Transpose notes and chords up/down by semitones or diatonic steps.

OPTIONS:
  -s, --semitones N       Number of semitones to transpose (+1, -1, +2, -5, etc.).
  -d, --diatonic N        Number of diatonic scale steps to shift (+1, -1, +2, etc.).
  -k, --update-key        Update global key signature '?= ...' line in score.
      --section NAME      Restrict transposition to a specific section.
      --instrument NAME   Restrict transposition to a specific instrument.
  -i, --in-place          Modify the file in-place.
  -o, --output PATH       Write result to output path.
`;

    const parsed = parseSubcommandArgs(rest, transposeUsage, true, (arg, args, i) => {
      let opt = matchOption(arg, args, i, "-s", "--semitones");
      if (opt.matched) {
        semitones = parseInt(opt.value ?? "", 10) || 0;
        return { matched: true, nextI: opt.nextI };
      }
      opt = matchOption(arg, args, i, "-d", "--diatonic");
      if (opt.matched) {
        diatonicSteps = parseInt(opt.value ?? "", 10) || 0;
        return { matched: true, nextI: opt.nextI };
      }
      if (arg === "-k" || arg === "--update-key") {
        updateKeySignature = true;
        return { matched: true, nextI: i };
      }
      opt = matchOption(arg, args, i, undefined, "--section");
      if (opt.matched) {
        section = opt.value;
        return { matched: true, nextI: opt.nextI };
      }
      opt = matchOption(arg, args, i, undefined, "--instrument");
      if (opt.matched) {
        instrument = opt.value;
        return { matched: true, nextI: opt.nextI };
      }
      return { matched: false, nextI: i };
    });

    if (parsed.status === "help") return 0;
    if (parsed.status === "error") return 2;
    if (!parsed.inputPath) {
      console.error("Error: transpose requires <input-path>");
      return 2;
    }

    return executeCliFileTransform({
      inputPath: parsed.inputPath,
      inPlace: parsed.inPlace,
      outputPath: parsed.outputPath,
      inPlaceMessage: (p) => `Transposed score in ${p} in-place.`,
      outputMessage: (p) => `Transposed output written to ${p}.`,
      transform: (content) =>
        TmdRefactor.transpose(content, {
          semitones,
          diatonicSteps,
          updateKeySignature,
          section,
          instrument,
        }),
    });
  }

  console.error(`Unknown refactor subcommand: ${sub}`);
  return 2;
}
