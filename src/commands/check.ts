import * as fs from "node:fs";
import * as path from "node:path";

import { readUTF8 } from "../io/text_io.js";
import {
  TmdScoreDiagnostic,
  TmdScoreValidator,
} from "../validation/score_validator.js";

function collectTargetFiles(inputPaths: string[], includeMarkdown: boolean): string[] {
  const result: string[] = [];

  function walkDir(dirPath: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (_) {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === ".tmd" || (includeMarkdown && (ext === ".md" || ext === ".markdown"))) {
          result.push(fullPath);
        }
      }
    }
  }

  for (const rawPath of inputPaths) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(rawPath);
    } catch (_) {
      result.push(rawPath);
      continue;
    }
    if (stat.isDirectory()) {
      walkDir(rawPath);
    } else {
      result.push(rawPath);
    }
  }

  return result;
}

export function handleCheckCommand(argv: string[]): number {
  const inputPaths: string[] = [];
  let markdown = false;
  let strict = false;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      console.log(`USAGE: tmd check [--markdown] [--strict] [--json] <input-paths...>

Check syntax, S-expression macros, timeline consistency, measure beats, and semantic lint rules across TMD files, directories, or Markdown code blocks.

OPTIONS:
  --markdown, --md   Also extract and validate \`\`\`tmd ... \`\`\` code blocks inside Markdown (.md) files when scanning directories.
  --strict           Treat warnings as errors (exit code 1 if any warning is emitted).
  --json             Output structured JSON diagnostics instead of human-readable text.
  -h, --help         Show this help.
`);
      return 0;
    } else if (arg === "--markdown" || arg === "--md") {
      markdown = true;
    } else if (arg === "--strict") {
      strict = true;
    } else if (arg === "--json") {
      json = true;
    } else if (!arg.startsWith("-")) {
      inputPaths.push(arg);
    } else {
      console.error(`Unknown option: ${arg}`);
      return 2;
    }
  }

  if (inputPaths.length === 0) {
    console.error("Error: Missing expected argument '<input-paths...>' for check");
    return 2;
  }

  const targetFiles = collectTargetFiles(inputPaths, markdown);
  const allDiagnostics: TmdScoreDiagnostic[] = [];
  let filesChecked = 0;

  for (const filePath of targetFiles) {
    filesChecked++;
    let content: string;
    try {
      content = readUTF8(filePath);
    } catch (error: any) {
      allDiagnostics.push({
        file: filePath,
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 1,
        severity: "error",
        rule: "E-SYNTAX",
        message: `Error reading ${filePath}: ${error.message || String(error)}`,
      });
      continue;
    }

    const ext = path.extname(filePath).toLowerCase();
    const fileDiags =
      ext === ".md" || ext === ".markdown"
        ? TmdScoreValidator.validateMarkdown(content, filePath)
        : TmdScoreValidator.validate(content, { file: filePath });

    allDiagnostics.push(...fileDiags);

    if (!json) {
      const errors = fileDiags.filter((d) => d.severity === "error");
      const warnings = fileDiags.filter((d) => d.severity === "warning");
      if (fileDiags.length === 0) {
        console.log(
          `✅ All checks and measures in ${filePath} conform to expected rules and time signatures.`
        );
      } else {
        if (errors.length > 0) {
          console.log(
            `❌ Found ${errors.length} error${errors.length === 1 ? "" : "s"}${
              warnings.length > 0
                ? ` and ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
                : ""
            } in ${filePath}:\n`
          );
        } else {
          console.log(
            `⚠️ Found ${warnings.length} warning${
              warnings.length === 1 ? "" : "s"
            } in ${filePath}:\n`
          );
        }
        for (const diag of fileDiags) {
          const icon = diag.severity === "error" ? "❌" : "⚠️";
          const loc = diag.file
            ? `${diag.file}:${diag.line}:${diag.column}`
            : `line ${diag.line}:${diag.column}`;
          console.log(`${icon} [${diag.rule}] ${loc}: ${diag.message}`);
          if (diag.suggestion) {
            console.log(`   💡 Suggestion: ${diag.suggestion}`);
          }
          if (diag.codeFrame) {
            console.log(diag.codeFrame);
          }
        }
      }
    }
  }

  const errorCount = allDiagnostics.filter((d) => d.severity === "error").length;
  const warningCount = allDiagnostics.filter((d) => d.severity === "warning").length;

  if (json) {
    const payload = {
      filesChecked,
      errorCount,
      warningCount,
      diagnostics: allDiagnostics.map((d) => ({
        file: d.file ?? "",
        line: d.line,
        column: d.column,
        endLine: d.endLine,
        endColumn: d.endColumn,
        severity: d.severity,
        rule: d.rule,
        message: d.message,
        ...(d.suggestion ? { suggestion: d.suggestion } : {}),
      })),
    };
    console.log(JSON.stringify(payload, null, 2));
  } else if (filesChecked > 1) {
    console.log(
      `\nChecked ${filesChecked} file(s): ${errorCount} error(s), ${warningCount} warning(s).`
    );
  }

  const shouldFail = errorCount > 0 || (strict && warningCount > 0);
  return shouldFail ? 1 : 0;
}
