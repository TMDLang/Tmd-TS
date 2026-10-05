import { existsSync, readFileSync } from "node:fs";
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

  it("separates syntax lexer, parser, and diagnostics responsibilities", () => {
    for (const file of ["lexer.ts", "parser.ts", "parse_diagnostics.ts"]) {
      expect(existsSync(join(sourceRoot, "syntax", file))).toBe(true);
    }
    const parser = readFileSync(join(sourceRoot, "syntax", "parser.ts"), "utf8");
    expect(parser.includes("export class Lexer")).toBe(false);
    expect(parser.includes("export class TMDParseError")).toBe(false);
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
    expect(existsSync(join(sourceRoot, "presentation", "outline.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "presentation", "tonality_visualizer.ts"))).toBe(true);
  });

  it("keeps source formatting inside the syntax boundary", () => {
    expect(existsSync(join(sourceRoot, "syntax", "format.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "formatting", "format.ts"))).toBe(false);
  });

  it("keeps macro expansion inside the playback boundary", () => {
    expect(existsSync(join(sourceRoot, "playback", "macro.ts"))).toBe(true);
  });

  it("keeps the canonical source model inside the syntax boundary", () => {
    expect(existsSync(join(sourceRoot, "syntax", "types.ts"))).toBe(true);
  });

  it("keeps domain models and generators outside the legacy core directory", () => {
    for (const file of ["canon_gen.ts", "instruments.ts"]) {
      expect(existsSync(join(sourceRoot, "domain", file))).toBe(true);
      expect(existsSync(join(sourceRoot, "core", file))).toBe(false);
    }
  });

  it("keeps measure rendering inside the playback boundary", () => {
    expect(existsSync(join(sourceRoot, "playback", "measure.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "domain", "measure.ts"))).toBe(false);
    expect(existsSync(join(sourceRoot, "core", "measure.ts"))).toBe(false);
  });

  it("separates AST measure checking from the lexer fallback", () => {
    expect(existsSync(join(sourceRoot, "validation", "measure_lexer_fallback.ts"))).toBe(true);
    const checker = readFileSync(join(sourceRoot, "validation", "measure_check.ts"), "utf8");
    expect(checker.includes("private static checkWithLexer")).toBe(false);
  });

  it("keeps localization owned by the analysis boundary", () => {
    expect(existsSync(join(sourceRoot, "analysis", "localization.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "core", "localization.ts"))).toBe(false);
  });
});
