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
    expect(parser.includes("export class TmdParseError")).toBe(false);
  });

  it("moves source loading out of the syntax parser", () => {
    expect(existsSync(join(sourceRoot, "io", "parser_io.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "syntax", "parser_core.ts"))).toBe(true);
    const parser = readFileSync(join(sourceRoot, "syntax", "parser.ts"), "utf8");
    expect(parser.includes('from "node:fs"')).toBe(false);
    expect(parser.includes("TextEncodingDetector")).toBe(false);
    expect(parser.includes("FilePathNormalizer")).toBe(false);
    expect(parser.includes('from "../io/parser_io.js"')).toBe(false);
    expect(parser.includes("parseData(data:")).toBe(false);
    expect(parser.includes("parseFile(filePathOrURL:")).toBe(false);
    expect(parser.includes("parseURL(fileURL:")).toBe(false);
    const core = readFileSync(join(sourceRoot, "syntax", "parser_core.ts"), "utf8");
    expect(core.includes('from "../io/parser_io.js"')).toBe(false);
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

  it("gives inspector profiles an explicit source boundary", () => {
    expect(existsSync(join(sourceRoot, "analysis", "profiles.ts"))).toBe(true);
    const inspector = readFileSync(join(sourceRoot, "analysis", "inspector.ts"), "utf8");
    expect(inspector.includes("export interface TmdSongProfile")).toBe(false);
  });

  it("keeps text I/O and source refactoring outside the syntax core", () => {
    expect(existsSync(join(sourceRoot, "io", "text_io.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "refactoring", "refactor.ts"))).toBe(true);
  });

  it("gives refactoring formatting helpers an explicit responsibility boundary", () => {
    expect(existsSync(join(sourceRoot, "refactoring", "format_helpers.ts"))).toBe(true);
  });

  it("gives refactoring transposition an explicit responsibility boundary", () => {
    expect(existsSync(join(sourceRoot, "refactoring", "transpose.ts"))).toBe(true);
    const facade = readFileSync(join(sourceRoot, "refactoring", "refactor.ts"), "utf8");
    expect(facade.includes("const semitones = options.semitones")).toBe(false);
  });

  it("gives refactoring grid operations an explicit responsibility boundary", () => {
    expect(existsSync(join(sourceRoot, "refactoring", "grid.ts"))).toBe(true);
    const facade = readFileSync(join(sourceRoot, "refactoring", "refactor.ts"), "utf8");
    expect(facade.includes("currentNoteLength = 4")).toBe(false);
  });

  it("gives refactoring track operations an explicit responsibility boundary", () => {
    expect(existsSync(join(sourceRoot, "refactoring", "tracks.ts"))).toBe(true);
    const facade = readFileSync(join(sourceRoot, "refactoring", "refactor.ts"), "utf8");
    expect(facade.includes("const clonedSections = orig.sections.map")).toBe(false);
  });

  it("gives MIDI instrument mapping an explicit exporter boundary", () => {
    expect(existsSync(join(sourceRoot, "exporters", "midi_instrument.ts"))).toBe(true);
    const midi = readFileSync(join(sourceRoot, "exporters", "midi.ts"), "utf8");
    expect(midi.includes("export enum MIDIInstrument")).toBe(false);
  });

  it("gives macro transformations an explicit playback boundary", () => {
    expect(existsSync(join(sourceRoot, "playback", "macro_transformations.ts"))).toBe(true);
    const evaluator = readFileSync(join(sourceRoot, "playback", "macro.ts"), "utf8");
    expect(evaluator.includes("function transposeSections")).toBe(false);
  });

  it("gives canon presets an explicit domain boundary", () => {
    expect(existsSync(join(sourceRoot, "domain", "canon_presets.ts"))).toBe(true);
    const generator = readFileSync(join(sourceRoot, "domain", "canon_gen.ts"), "utf8");
    expect(generator.includes("PENTATONIC_BASS_PATTERNS = {")).toBe(false);
  });

  it("gives measure issue descriptions a single validation boundary", () => {
    expect(existsSync(join(sourceRoot, "validation", "measure_issue.ts"))).toBe(true);
    const checker = readFileSync(join(sourceRoot, "validation", "measure_check.ts"), "utf8");
    const fallback = readFileSync(join(sourceRoot, "validation", "measure_lexer_fallback.ts"), "utf8");
    expect(checker.includes("function formatIssueDescription")).toBe(false);
    expect(fallback.includes("function formatIssueDescription")).toBe(false);
  });

  it("uses one shared vocal instrument resolver across Vocaloid exporters", () => {
    const vsq = readFileSync(join(sourceRoot, "exporters", "vsq.ts"), "utf8");
    const vsqx = readFileSync(join(sourceRoot, "exporters", "vsqx.ts"), "utf8");
    expect(vsq.match(/private static resolveTargetInstrument\(/g)).toBeNull();
    expect(vsqx.match(/private static resolveTargetInstrument\(/g)).toBeNull();
    expect(vsq.match(/SheetInstrumentHelper\.resolveVocalInstrument\(/g)).toHaveLength(1);
    expect(vsqx.match(/SheetInstrumentHelper\.resolveVocalInstrument\(/g)).toHaveLength(1);
  });

  it("separates Vocaloid format exporters from shared phoneme mapping", () => {
    for (const file of ["vocaloid_phoneme.ts", "vsq.ts", "vsqx.ts"]) {
      expect(existsSync(join(sourceRoot, "exporters", file))).toBe(true);
    }
    const facade = readFileSync(join(sourceRoot, "exporters", "vocaloid.ts"), "utf8");
    expect(facade.includes("export class TmdVSQGenerator")).toBe(false);
    expect(facade.includes("export class TmdVSQXGenerator")).toBe(false);
  });

  it("keeps presentation consumers outside the syntax core", () => {
    expect(existsSync(join(sourceRoot, "presentation", "outline.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "presentation", "tonality_visualizer.ts"))).toBe(true);
  });

  it("gives LSP data models an explicit source boundary", () => {
    expect(existsSync(join(sourceRoot, "lsp", "types.ts"))).toBe(true);
    const implementation = readFileSync(join(sourceRoot, "lsp", "index.ts"), "utf8");
    expect(implementation.includes("export class TmdLSPPosition")).toBe(false);
  });

  it("gives the LSP JSON-RPC codec an explicit source boundary", () => {
    expect(existsSync(join(sourceRoot, "lsp", "codec.ts"))).toBe(true);
    const implementation = readFileSync(join(sourceRoot, "lsp", "index.ts"), "utf8");
    expect(implementation.includes("class TmdJSONRPCCodec")).toBe(false);
  });

  it("gives the LSP completion engine an explicit source boundary", () => {
    expect(existsSync(join(sourceRoot, "lsp", "completion.ts"))).toBe(true);
    const implementation = readFileSync(join(sourceRoot, "lsp", "index.ts"), "utf8");
    expect(implementation.includes("class TmdLSPCompletionEngine")).toBe(false);
  });

  it("gives the LSP diagnostic engine an explicit source boundary", () => {
    expect(existsSync(join(sourceRoot, "lsp", "diagnostics.ts"))).toBe(true);
    const implementation = readFileSync(join(sourceRoot, "lsp", "index.ts"), "utf8");
    expect(implementation.includes("class TmdLSPDiagnosticEngine")).toBe(false);
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

  it("keeps the lexer fallback independent from the parser facade", () => {
    const fallback = readFileSync(join(sourceRoot, "validation", "measure_lexer_fallback.ts"), "utf8");
    expect(fallback.includes('from "../syntax/parser.js"')).toBe(false);
    expect(fallback.includes('from "../syntax/lexer.js"')).toBe(true);
    expect(fallback.includes('from "../syntax/tokens.js"')).toBe(true);
  });

  it("separates MCP server runtime from configuration installation", () => {
    expect(existsSync(join(sourceRoot, "mcp", "server.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "mcp", "installer.ts"))).toBe(true);
    const facade = readFileSync(join(sourceRoot, "mcp", "index.ts"), "utf8");
    expect(facade.includes("export class TmdMCPServer")).toBe(false);
    expect(facade.includes("export class TmdMCPInstaller")).toBe(false);
  });

  it("keeps localization owned by the analysis boundary", () => {
    expect(existsSync(join(sourceRoot, "analysis", "localization.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "core", "localization.ts"))).toBe(false);
  });
});
