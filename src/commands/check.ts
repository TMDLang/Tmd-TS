import { TMDMeasureChecker } from "../core/measure_check.js";
import { readUTF8 } from "../core/text_io.js";

export function handleCheckCommand(argv: string[]): number {
  let inputPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      console.log(`USAGE: tmd check <input-path>

Check measure consistency and report incorrect beat counts between bar lines '|'.
`);
      return 0;
    }
    if (!arg.startsWith("-")) {
      inputPath = arg;
    } else {
      console.error(`Unknown option: ${arg}`);
      return 2;
    }
  }

  if (!inputPath) {
    console.error("Error: Missing expected argument '<input-path>' for check");
    return 2;
  }

  let content: string;
  try {
    content = readUTF8(inputPath);
  } catch (error: any) {
    console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
    return 1;
  }

  const issues = TMDMeasureChecker.check(content);
  if (issues.length === 0) {
    console.log(`✅ All measures in ${inputPath} conform to expected time signatures.`);
    return 0;
  } else {
    console.log(
      `❌ Found ${issues.length} measure discrepancy issue${
        issues.length === 1 ? "" : "s"
      } in ${inputPath}:\n`
    );
    for (const issue of issues) {
      console.log(issue.description);
    }
    return 1;
  }
}
