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

  it("keeps presentation consumers outside the syntax core", () => {
    expect(existsSync(join(sourceRoot, "formatting", "format.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "presentation", "outline.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "presentation", "tonality_visualizer.ts"))).toBe(true);
  });

  it("keeps macro expansion inside the playback boundary", () => {
    expect(existsSync(join(sourceRoot, "playback", "macro.ts"))).toBe(true);
  });

  it("keeps the canonical source model inside the syntax boundary", () => {
    expect(existsSync(join(sourceRoot, "syntax", "types.ts"))).toBe(true);
  });

  it("keeps domain models and generators outside the legacy core directory", () => {
    for (const file of ["canon_gen.ts", "instruments.ts", "measure.ts"]) {
      expect(existsSync(join(sourceRoot, "domain", file))).toBe(true);
      expect(existsSync(join(sourceRoot, "core", file))).toBe(false);
    }
  });

  it("keeps localization owned by the analysis boundary", () => {
    expect(existsSync(join(sourceRoot, "analysis", "localization.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "core", "localization.ts"))).toBe(false);
  });
});
