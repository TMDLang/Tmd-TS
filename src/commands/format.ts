import { readUTF8, writeUTF8 } from "../io/text_io.js";
import { TmdRefactor } from "../refactoring/index.js";

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
    if (arg === "-i" || arg === "--in-place") { inPlace = true; continue; }
    if (arg === "-o" || arg === "--output") { outputPath = argv[++i]; continue; }
    if (arg.startsWith("-o=")) { outputPath = arg.slice("-o=".length); continue; }
    if (arg.startsWith("--output=")) { outputPath = arg.slice("--output=".length); continue; }
    if (!arg.startsWith("-")) inputPath = arg;
    else { console.error(`Unknown option: ${arg}`); return 2; }
  }
  if (!inputPath) {
    console.error("Error: Missing expected argument '<input-path>' for format");
    return 2;
  }
  let content: string;
  try { content = readUTF8(inputPath); }
  catch (error: any) {
    console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
    return 1;
  }
  const formatted = TmdRefactor.format(content);
  if (inPlace) {
    try { writeUTF8(inputPath, formatted); console.log(`Formatted ${inputPath} in-place.`); return 0; }
    catch (error: any) { console.error(`Error writing ${inputPath}: ${error.message || String(error)}`); return 1; }
  }
  if (outputPath) {
    try { writeUTF8(outputPath, formatted); console.log(`Formatted output written to ${outputPath}.`); return 0; }
    catch (error: any) { console.error(`Error writing ${outputPath}: ${error.message || String(error)}`); return 1; }
  }
  process.stdout.write(formatted);
  return 0;
}
