import { TmdRefactor } from "../refactoring/index.js";
import { executeCliFileTransform, matchOption } from "./refactor.js";

export function handleFormatCommand(argv: string[]): number {
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
    const outOpt = matchOption(arg, argv, i, "-o", "--output");
    if (outOpt.matched) {
      outputPath = outOpt.value;
      i = outOpt.nextI;
      continue;
    }
    if (!arg.startsWith("-")) inputPath = arg;
    else {
      console.error(`Unknown option: ${arg}`);
      return 2;
    }
  }
  if (!inputPath) {
    console.error("Error: Missing expected argument '<input-path>' for format");
    return 2;
  }
  return executeCliFileTransform({
    inputPath,
    inPlace,
    outputPath,
    inPlaceMessage: (p) => `Formatted ${p} in-place.`,
    outputMessage: (p) => `Formatted output written to ${p}.`,
    transform: (content) => TmdRefactor.format(content),
  });
}
