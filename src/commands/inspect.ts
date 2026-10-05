import {
  TmdParser,
  TMDSongInspector,
  TMDTonalityVisualizer,
} from "../core/index.js";
import { readUTF8 } from "../io/text_io.js";

export function handleInspectCommand(argv: string[]): number {
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
    if (arg === "--json") { json = true; continue; }
    if (arg === "--svg") { svg = true; continue; }
    if (arg === "--html") { html = true; continue; }
    if (arg === "--locale") { locale = argv[++i] || "zh-Hant"; continue; }
    if (arg.startsWith("--locale=")) { locale = arg.slice("--locale=".length) || "zh-Hant"; continue; }
    if (!arg.startsWith("-")) inputPath = arg;
    else { console.error(`Unknown option: ${arg}`); return 2; }
  }

  if (!inputPath) {
    console.error("Error: Missing expected argument '<input-path>' for inspect");
    return 2;
  }
  let content: string;
  try { content = readUTF8(inputPath); }
  catch (error: any) {
    console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
    return 1;
  }
  let sheet;
  try { sheet = TmdParser.parse(content); }
  catch (error: any) {
    console.error(`Parse error in ${inputPath}: ${error.message || String(error)}`);
    return 1;
  }
  if (!sheet) {
    console.error(`Failed to parse TMD score: ${inputPath}`);
    return 1;
  }
  const normalizedLocale = locale.toLowerCase().startsWith("zh") ? "zh-Hant" : "en";
  const profile = TMDSongInspector.inspect(sheet, undefined, normalizedLocale);
  if (json) console.log(JSON.stringify(profile, null, 2));
  else if (svg) console.log(TMDTonalityVisualizer.generateSVG(profile, normalizedLocale));
  else if (html) console.log(TMDTonalityVisualizer.generateHTML(profile, normalizedLocale));
  else console.log(TMDSongInspector.generateReport(profile, normalizedLocale));
  return 0;
}
