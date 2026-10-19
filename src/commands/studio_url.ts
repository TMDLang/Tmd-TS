import { execFileSync, spawnSync } from "node:child_process";

import { TmdStudioShare } from "../io/studio_share.js";
import { readUTF8 } from "../io/text_io.js";
import { FilePathNormalizer } from "../utils/path.js";

export function handleStudioURLCommand(argv: string[]): number {
  let inputPath: string | undefined;
  let baseURL: string = TmdStudioShare.defaultBaseURL;
  let openInBrowser = false;
  let copyToClipboard = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      console.log(`USAGE: tmd studio-url [--base-url <url>] [--open] [--copy] <input-path>

Generate a shareable TMD Studio URL (#tmd=...) for a TMD score.

OPTIONS:
  --base-url <url>        Base URL of TMD Studio (defaults to ${TmdStudioShare.defaultBaseURL}).
  --open                  Open the generated TMD Studio URL in the default web browser.
  --copy                  Copy the generated TMD Studio URL to the system clipboard.
`);
      return 0;
    }
    if (arg === "--base-url") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        console.error("Error: Missing value for '--base-url'");
        return 2;
      }
      baseURL = next;
      i++;
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      baseURL = arg.slice("--base-url=".length);
      continue;
    }
    if (arg === "--open") {
      openInBrowser = true;
      continue;
    }
    if (arg === "--copy") {
      copyToClipboard = true;
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
    console.error("Error: Missing expected argument '<input-path>' for studio-url");
    return 2;
  }

  let content: string;
  try {
    content = readUTF8(FilePathNormalizer.fileURLToPath(inputPath));
  } catch (error: any) {
    console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
    return 1;
  }

  let studioURL: string;
  try {
    studioURL = TmdStudioShare.generateStudioURL(content, baseURL);
  } catch (error: any) {
    console.error(`Error generating TMD Studio URL: ${error.message || String(error)}`);
    return 1;
  }

  console.log(studioURL);

  if (copyToClipboard) {
    if (process.platform === "darwin") {
      const result = spawnSync("/usr/bin/pbcopy", [], { input: studioURL, encoding: "utf-8" });
      if (result.status !== 0) {
        console.error(`Error: pbcopy exited with status ${result.status ?? 1}.`);
        return 1;
      }
    } else {
      console.error("Error: --copy is currently supported only on macOS.");
      return 1;
    }
  }

  if (openInBrowser) {
    try {
      if (process.platform === "darwin") {
        execFileSync("/usr/bin/open", [studioURL], { stdio: "ignore" });
      } else if (process.platform === "linux") {
        execFileSync("xdg-open", [studioURL], { stdio: "ignore" });
      } else {
        console.error("Error: --open is not supported on this platform.");
        return 1;
      }
    } catch (error: any) {
      console.error(`Error opening URL in browser: ${error.message || String(error)}`);
      return 1;
    }
  }

  return 0;
}
