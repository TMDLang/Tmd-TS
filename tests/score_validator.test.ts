import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { main } from "../src/cli.js";
import { handleCheckCommand } from "../src/commands/check.js";
import { TmdLSPDiagnosticEngine } from "../src/lsp/index.js";
import { TmdScoreValidator } from "../src/validation/index.js";

describe("TmdScoreValidator & Semantic Linter", () => {
  it("catches syntax errors (including invalid ?= Am) and measure beat discrepancies", () => {
    const invalidSyntax = `::SCORE::
** Invalid Key **
!= 120
?= Am
<4/4>

A:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
-> A ->#
`;
    const syntaxDiags = TmdScoreValidator.validate(invalidSyntax);
    expect(syntaxDiags.some((d) => d.rule === "E-SYNTAX" && d.severity === "error")).toBe(true);

    const invalidMeasure = `::SCORE::
** Bad Measure **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | 1 2 3 |
}
-> A ->#
`;
    const measureDiags = TmdScoreValidator.validate(invalidMeasure);
    expect(
      measureDiags.some((d) => d.rule === "E-MEASURE-BEAT" && d.severity === "error")
    ).toBe(true);
  });

  it("catches macro expansion errors, timeline overlaps, and simultaneous tempo conflicts", () => {
    const badMacro = `::SCORE::
** Bad Macro **
!= 120
?= C
<4/4>

Theme {
  <4*>
  | 1 2 3 4 |
}
-> (canon NonExistent (Piano Violin) 1 0) ->#
`;
    const macroDiags = TmdScoreValidator.validate(badMacro);
    expect(
      macroDiags.some((d) => d.rule === "E-MACRO-EXPAND" && d.severity === "error")
    ).toBe(true);

    const overlapScore = `::SCORE::
** Overlap **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | 1 2 3 4 | 5 6 7 1^ |
}
A:Piano@|+1|{
  <4*>
  | 1 2 3 4 |
}
-> A ->#
`;
    const overlapDiags = TmdScoreValidator.validate(overlapScore);
    expect(
      overlapDiags.some((d) => d.rule === "E-TIMELINE-OVERLAP" && d.severity === "error")
    ).toBe(true);

    const tempoConflictScore = `::SCORE::
** Tempo Conflict **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | {!= 140} 1 2 3 4 |
}
A:Violin@|0|{
  <4*>
  | {!= 100} 1 2 3 4 |
}
-> A ->#
`;
    const tempoDiags = TmdScoreValidator.validate(tempoConflictScore);
    expect(
      tempoDiags.some((d) => d.rule === "E-TEMPO-CONFLICT" && d.severity === "error")
    ).toBe(true);
  });

  it("catches multi-note bracket misuse ([1 3 5]) as error and unknown custom chord quality as warning", () => {
    const multiNoteChordScore = `::SCORE::
** MultiNote Chord Typo **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | [1 3 5] - - - |
}
-> A ->#
`;
    const multiDiags = TmdScoreValidator.validate(multiNoteChordScore);
    const chordErr = multiDiags.find((d) => d.rule === "E-CHORD-MULTINOTE");
    expect(chordErr).toBeDefined();
    expect(chordErr?.severity).toBe("error");
    expect(chordErr?.suggestion).toContain("1+3+5");

    const customChordScore = `::SCORE::
** Custom Chord Warning **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | [Cadd9] - [Cweirdquality] - |
}
-> A ->#
`;
    const customDiags = TmdScoreValidator.validate(customChordScore);
    expect(customDiags.some((d) => d.message.includes("Cadd9"))).toBe(false);
    expect(
      customDiags.some(
        (d) =>
          d.rule === "W-CHORD-CUSTOM" &&
          d.severity === "warning" &&
          d.message.includes("Cweirdquality")
      )
    ).toBe(true);
  });

  it("emits warnings for unused entries/prototypes, instrument naming issues, and section length mismatches", () => {
    const score = `::SCORE::
** Unused and Instrument Warnings **
!= 120
?= C
<4/4>

UnusedProto {
  <4*>
  | 1 2 3 4 |
}

A:nylonGuitar@|0|{
  <4*>
  | 1 2 3 4 |
}

A:UnknownMartianZorg@|0|{
  <4*>
  | 1 2 3 4 | 5 6 7 1^ |
}

Bridge:Nylon_Guitar@|0|{
  <4*>
  | 1 2 3 4 |
}

-> A ->#
`;
    const diags = TmdScoreValidator.validate(score);
    expect(
      diags.some(
        (d) =>
          d.rule === "W-UNUSED-ENTRY" &&
          d.severity === "warning" &&
          d.message.includes("Bridge")
      )
    ).toBe(true);
    expect(
      diags.some(
        (d) =>
          d.rule === "W-UNUSED-PROTOTYPE" &&
          d.severity === "warning" &&
          d.message.includes("UnusedProto")
      )
    ).toBe(true);
    expect(
      diags.some(
        (d) => d.rule === "W-INSTRUMENT-INCONSISTENT" && d.severity === "warning"
      )
    ).toBe(true);
    expect(
      diags.some(
        (d) =>
          d.rule === "W-INSTRUMENT-UNKNOWN" &&
          d.severity === "warning" &&
          d.message.includes("UnknownMartianZorg")
      )
    ).toBe(true);
    expect(
      diags.some(
        (d) => d.rule === "W-SECTION-LENGTH-MISMATCH" && d.severity === "warning"
      )
    ).toBe(true);
  });

  it("extracts and validates Markdown ```tmd code blocks, CLI flags, and LSP severities", () => {
    const markdown = `# TMD Guide

Here is a full score:
\`\`\`tmd
::SCORE::
** Embedded Score **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | [1 3 5] - - - |
}
-> A ->#
\`\`\`

And a partial snippet without header:
\`\`\`tmd
A:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
\`\`\`
`;
    const mdDiags = TmdScoreValidator.validateMarkdown(markdown, "guide.md");
    expect(mdDiags.length).toBe(1);
    expect(mdDiags[0].rule).toBe("E-CHORD-MULTINOTE");
    expect(mdDiags[0].line).toBe(13);

    // LSP maps error -> 1 and warning -> 2
    const lspDiags = TmdLSPDiagnosticEngine.diagnose(`::SCORE::
** LSP Check **
!= 120
?= C
<4/4>
A:Piano@|0|{
  <4*>
  | [1 3 5] - - - |
}
Unused:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
-> A ->#
`);
    expect(lspDiags.some((d) => d.severity === 1)).toBe(true);
    expect(lspDiags.some((d) => d.severity === 2)).toBe(true);

    // CLI directory, --markdown, --strict, --json
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tmd-check-test-"));
    try {
      const warnFile = path.join(tmpDir, "warn.tmd");
      fs.writeFileSync(
        warnFile,
        `::SCORE::
** Warn Only **
!= 120
?= C
<4/4>
A:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
Unused:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
-> A ->#
`,
        "utf8"
      );

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      // Default mode returns 0 on warnings
      expect(handleCheckCommand([warnFile])).toBe(0);
      // --strict returns 1 on warnings
      expect(handleCheckCommand(["--strict", warnFile])).toBe(1);
      // --json outputs JSON structure
      logSpy.mockClear();
      expect(handleCheckCommand(["--json", tmpDir])).toBe(0);
      const jsonOut = JSON.parse(String(logSpy.mock.calls[0]?.[0] ?? "{}"));
      expect(jsonOut.filesChecked).toBe(1);
      expect(jsonOut.errorCount).toBe(0);
      expect(jsonOut.warningCount).toBe(1);
      expect(jsonOut.diagnostics[0].rule).toBe("W-UNUSED-ENTRY");
      logSpy.mockRestore();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("aborts CLI export on TmdScoreValidator Stage 2–6 errors unless --force is passed, while allowing warnings", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tmd-cli-val-test-"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      // Score with valid measure beats (passes TmdMeasureChecker) but has E-TIMELINE-OVERLAP error
      const overlapFile = path.join(tmpDir, "overlap.tmd");
      const outMidi = path.join(tmpDir, "overlap.mid");
      fs.writeFileSync(
        overlapFile,
        `::SCORE::
** Voice Overlap Error **
!= 120
?= C
<4/4>
A:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
A:Piano@|0|{
  <4*>
  | 5 6 7 1^ |
}
-> A ->#
`,
        "utf8"
      );

      // Without --force: must abort with exit code 1 and not create the MIDI file
      expect(main([overlapFile, "-m", outMidi])).toBe(1);
      expect(fs.existsSync(outMidi)).toBe(false);
      expect(errSpy.mock.calls.map((c) => String(c[0])).join("\n")).toContain("E-TIMELINE-OVERLAP");

      // With --force: succeeds and writes MIDI file
      expect(main([overlapFile, "-m", outMidi, "--force"])).toBe(0);
      expect(fs.existsSync(outMidi)).toBe(true);
    } finally {
      errSpy.mockRestore();
      logSpy.mockRestore();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("shares canonical SSOT for chord qualities (ChordSymbol) and instruments (MIDIInstrument) (#43)", async () => {
    const {
      ChordSymbol,
      STANDARD_CHORD_QUALITIES,
      EXTENDED_CHORD_QUALITIES,
    } = await import("../src/syntax/index.js");
    const { MIDIInstrument } = await import("../src/exporters/midi_instrument.js");

    expect(STANDARD_CHORD_QUALITIES.has("major7")).toBe(true);
    expect(EXTENDED_CHORD_QUALITIES.has("add9")).toBe(true);
    expect(ChordSymbol.isStandardQuality("halfDiminished")).toBe(true);
    expect(ChordSymbol.isStandardQuality("add9")).toBe(false);
    expect(ChordSymbol.isRecognizedExtendedQuality("add9")).toBe(true);
    expect(ChordSymbol.isRecognizedExtendedQuality("m7b5")).toBe(true);
    expect(ChordSymbol.isRecognizedExtendedQuality("7#11")).toBe(true);
    expect(ChordSymbol.isRecognizedExtendedQuality("7b13")).toBe(true);
    expect(ChordSymbol.isRecognizedExtendedQuality("maj7#11")).toBe(true);
    expect(ChordSymbol.isRecognizedExtendedQuality("maj7#5")).toBe(true);
    expect(ChordSymbol.isRecognizedExtendedQuality("m6/9")).toBe(true);
    expect(ChordSymbol.isRecognizedExtendedQuality("weirdquality")).toBe(false);

    expect(MIDIInstrument.isRecognized("Piano")).toBe(true);
    expect(MIDIInstrument.isRecognized("prog:40")).toBe(true);
    expect(MIDIInstrument.isRecognized("Perc")).toBe(true);
    expect(MIDIInstrument.isRecognized("Gtr")).toBe(true);
    expect(MIDIInstrument.isRecognized("Uke")).toBe(true);
    expect(MIDIInstrument.isRecognized("Vox")).toBe(true);
    expect(MIDIInstrument.isRecognized("Miku")).toBe(true);
    expect(MIDIInstrument.isRecognized("鋼琴")).toBe(true);
    expect(MIDIInstrument.isRecognized("電吉他")).toBe(true);
    expect(MIDIInstrument.isRecognized("古箏")).toBe(true);
    expect(MIDIInstrument.isRecognized("Unknown")).toBe(false);
    expect(MIDIInstrument.isRecognized("UnknownMartianZorg")).toBe(false);

    const { mapSectionsNotes, TmdParser } = await import("../src/syntax/index.js");
    const { transposeNoteDiatonicSteps } = await import("../src/refactoring/transpose.js");
    const parsed = TmdParser.parseThrowing(
      "::SCORE::\n!= 120\n?= C\n<4/4>\nA:Piano@|0|{\n<4*>\n| 1 2+4 [C] 0 |\n}\n-> A ->#"
    );
    const transformed = mapSectionsNotes(parsed.entries[0].sections, (note) =>
      transposeNoteDiatonicSteps(note, 2)
    );
    expect(transformed[0].unitGroups[0].units[0]).toEqual({
      type: "note",
      note: { degree: 3, accidental: "natural", octave: 0 },
    });

    const validatorSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/validation/score_validator.ts"),
      "utf8"
    );
    expect(validatorSrc).not.toContain("const KNOWN_INSTRUMENT_KEYWORDS");
    expect(validatorSrc).not.toContain("const STANDARD_CHORD_QUALITIES");
    expect(validatorSrc).not.toContain("const EXTENDED_CHORD_QUALITIES");
  });

  it("shares canonical SSOT for monophonic vocal extraction, effectivePlaybackOrders, channel/pan, and metronome tempo (#51)", async () => {
    const { TmdParser, metronomeTempoForBeat } = await import("../src/syntax/index.js");
    const { SheetInstrumentHelper } = await import("../src/domain/index.js");
    const { TmdPlaybackRenderer } = await import("../src/playback/index.js");
    const { MIDIInstrument } = await import("../src/exporters/midi_instrument.js");
    const { VocaloidPhoneme } = await import("../src/exporters/vocaloid_phoneme.js");

    // 1. effectivePlaybackOrders
    const sheetNoOrders = TmdParser.parseThrowing(
      "::SCORE::\n!= 120\n?= C\n<4/4>\nIntro:Piano@|0|{\n<4*>\n| 1 2 3 4 |\n}\nVerse:Piano@|0|{\n<4*>\n| 5 6 7 1^ |\n}\n->#"
    );
    expect(SheetInstrumentHelper.effectivePlaybackOrders(sheetNoOrders)).toEqual([
      { type: "name", name: "Intro" },
      { type: "name", name: "Verse" },
    ]);

    // 2. TmdPlaybackRenderer.monophonicEvents & VocaloidPhoneme.extractNotes
    const chordSheet = TmdParser.parseThrowing(
      "::SCORE::\n!= 120\n?= C\n<4/4>\nA:Vocal@|0|{\n<4*>\n| 1+3+5 2 3 4 |\n}\n-> A ->#"
    );
    const timeline = TmdPlaybackRenderer.render(chordSheet, "Vocal");
    const mono = TmdPlaybackRenderer.monophonicEvents(timeline);
    expect(mono).toHaveLength(4);
    const extracted = VocaloidPhoneme.extractNotes(timeline, 0, 480, "la");
    expect(extracted).toHaveLength(4);
    expect(extracted[0].pitch).toBe(67); // 5 in C = G4 = 67

    // 3. MIDIInstrument.allocateChannel & stereoPanHeuristic
    const state = { nextMelodicChannel: 8 };
    const ch1 = MIDIInstrument.allocateChannel(MIDIInstrument.Piano, state);
    const ch2 = MIDIInstrument.allocateChannel(MIDIInstrument.Violin, state);
    const chPerc = MIDIInstrument.allocateChannel(MIDIInstrument.Percussion, state);
    expect(ch1).toBe(8);
    expect(ch2).toBe(10); // Skips channel 9
    expect(chPerc).toBe(9);
    expect(MIDIInstrument.stereoPanHeuristic("Guitar-L")).toBe("left");
    expect(MIDIInstrument.stereoPanHeuristic("Piano_Right")).toBe("right");
    expect(MIDIInstrument.stereoPanHeuristic("Lead")).toBe("center");

    // 4. metronomeTempoForBeat
    const compound = metronomeTempoForBeat({ count: 6, noteValue: 8 }, 120);
    expect(compound).toEqual({
      beatUnit: "quarter",
      lilyPondUnit: "4.",
      abcUnit: "3/8",
      isDotted: true,
      perMinute: 80,
    });
  });
});
