import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sourceRoot = join(import.meta.dirname, "..", "src");

describe("core architecture boundaries", () => {
  it("keeps syntax, validation, analysis, and playback in explicit boundaries", () => {
    const canonicalFiles = [
      ["syntax", "parser.ts"],
      ["validation", "measure_check.ts"],
      ["analysis", "inspector.ts"],
      ["playback", "playback.ts"],
    ];

    for (const [boundary, file] of canonicalFiles) {
      expect(existsSync(join(sourceRoot, boundary, file))).toBe(true);
    }
  });

  it("keeps inspector analyzers inside the analysis boundary", () => {
    for (const file of [
      "harmony_analyzer.ts",
      "pitch_range_analyzer.ts",
      "timing_analyzer.ts",
      "tonality_analyzer.ts",
    ]) {
      expect(existsSync(join(sourceRoot, "analysis", file))).toBe(true);
    }
  });

  it("keeps text I/O and source refactoring outside the syntax core", () => {
    expect(existsSync(join(sourceRoot, "io", "text_io.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "refactoring", "refactor.ts"))).toBe(true);
  });
});
