import { describe, expect, it, vi } from "vitest";

import { printHelp } from "../src/cli.js";
import { handleCheckCommand } from "../src/commands/check.js";
import { handleFormatCommand } from "../src/commands/format.js";
import { handleInspectCommand } from "../src/commands/inspect.js";
import { handleOutlineCommand } from "../src/commands/outline.js";
import { handleRefactorCommand } from "../src/commands/refactor.js";
import { handleStudioURLCommand } from "../src/commands/studio_url.js";
import { TmdSkill } from "../src/skill.js";

function captureHelp(callback: () => unknown): string {
  const output: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
    output.push(args.join(" "));
  });
  try {
    callback();
  } finally {
    spy.mockRestore();
  }
  return output.join("\n");
}

function optionNames(help: string): string[] {
  return [...help.matchAll(/^\s+(--[a-z][a-z0-9-]*)\b/gm)].map((match) => match[1]);
}

describe("TMD skill and CLI drift", () => {
  it("documents every long option exposed by CLI help", () => {
    const help = [
      captureHelp(() => printHelp()),
      captureHelp(() => handleCheckCommand(["--help"])),
      captureHelp(() => handleFormatCommand(["--help"])),
      captureHelp(() => handleInspectCommand(["--help"])),
      captureHelp(() => handleOutlineCommand(["--help"])),
      captureHelp(() => handleRefactorCommand(["--help"])),
      captureHelp(() => handleRefactorCommand(["transpose", "--help"])),
      captureHelp(() => handleStudioURLCommand(["--help"])),
    ].join("\n");

    const missing = [...new Set(optionNames(help))].filter(
      (option) => !TmdSkill.skillMarkdown.includes(option)
    );
    expect(missing).toEqual([]);
  });

  it("keeps the semantic and MCP coverage checklist in the embedded skill", () => {
    for (const required of [
      "Formatter and repeat semantics",
      "Show-program and execution-time entries",
      "Global option matrix",
      "MCP tools and payloads",
      "AI authoring workflow",
      "Export verification matrix",
      "Swift and TypeScript platform boundary",
      "get_tmd_skill",
      "parse_tmd",
      "check_tmd",
      "convert_tmd",
      "tmd_export_braille",
    ]) {
      expect(TmdSkill.skillMarkdown).toContain(required);
    }
  });
});
