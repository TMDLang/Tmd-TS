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

  it("Issue #55: does not emit false W-INSTRUMENT-INCONSISTENT on CJK instruments, exposes TmdParseError.hints, and fixes Tonality/PitchRange analyzers", async () => {
    const cjkScore = `::SCORE::
!= 120
?= C
<4/4>

A:主唱@|0|{
  <4*>
  | 1 2 3 4 |
}

A:木吉他@|0|{
  <4*>
  | 1 3 5 1^ |
}

-> A ->#
`;
    const diags = TmdScoreValidator.validate(cjkScore);
    expect(diags.some((d) => d.rule === "W-INSTRUMENT-INCONSISTENT")).toBe(false);

    const { TmdParser, TmdParseError } = await import("../src/syntax/index.js");
    try {
      TmdParser.parseThrowing("::SCORE::\n!= 120\n?= C\n<4/4>\nA:Piano@|0|{\n  1 2 3 4\n}\n-> A ->#");
      expect.unreachable("Should have thrown TmdParseError");
    } catch (err) {
      expect(err).toBeInstanceOf(TmdParseError);
      const parseErr = err as InstanceType<typeof TmdParseError>;
      expect(Array.isArray(parseErr.hints)).toBe(true);
      expect(parseErr.hints.length).toBeGreaterThan(0);
      expect(parseErr.hints[0]).toContain("time grid directive");
    }

    const { TmdSongInspector } = await import("../src/analysis/index.js");
    const modSheet = TmdParser.parseThrowing(`::SCORE::
!= 120
?= C
<2/4>

secA:Piano [pitchMode=fixed] @|0|{
    <4*>
    | 1 3 | 5 1^ | 1 3 | 5 1^ |
}

secEmpty:Piano [pitchMode=fixed] @|0|{
    <4*>
    | 0 0 |
}

secB:Piano@|0|{
    <4*>
    | {?= G} 1 3 | 5 1^ | 1 3 | 5 1^ |
}

secMeter:Piano@|0|{
    <4*>
    | 1 2 | {<4/4>} 1 2 1^^ 4 |
}

-> secA -> secEmpty -> secB -> secMeter ->#
`);
    const profile = TmdSongInspector.inspect(modSheet);
    expect(profile.tonality?.sections[0].playbackContext.fixedPitch).toBe(true);
    expect(profile.tonality?.narrative?.transitions.some((t) => t.sectionName === "secB" && t.tonic === "G")).toBe(true);
    const pianoRange = profile.instrumentRanges.find((r) => r.assignment === "Piano");
    expect(pianoRange?.highestNote.measure).toBe(11);
  });

  it("Issue #61: resolves entry-local timeSignature for @|-N|/@|+N| start offsets in TmdPlaybackRenderer, TmdMeasureRenderer, and TmdScoreValidator", async () => {
    const { TmdParser } = await import("../src/syntax/index.js");
    const { TmdPlaybackRenderer, TmdMeasureRenderer } = await import("../src/playback/index.js");

    const score = `::SCORE::
** Odd Meter Pickups & Polymeter **
!= 120
?= C
<4/4>

Intro:Flute@|0|{
    <4*>
    | 1 2 3 4 | 1 2 3 4 |
}
Intro:Clarinet@|0|{
    <4*>
    | 1 2 3 4 | 1 2 3 4 |
}

M5:Clarinet@|-1|{
    <4*>
    | {<5/4>} 0 0 0 0 5, |
    | 1 2 3 4 5 | 5 4 3 2 1 |
    | 1 3 5 3 1 | 2 5, 1 - - |
}
M5:Flute@|0|{
    <4*>
    | {<5/4>} 3 4 5 6 7 | 1^ 7 6 5 4 |
    | 3 5 1^ 5 3 | 4 2 3 - - |
}

M7:Flute@|-1|{
    <8*>
    | {<7/8>} 0 0 0 0 5 6 7 |
    | 1 2 3 4 5 6 7 | 1^ 7 6 5 4 3 2 |
    | 1 3 5 1^ 7 5 3 | 2 4 3 2 1 - - |
}
M7:Clarinet@|0|{
    <8*>
    | {<7/8>} 1, - 5, - 1 - 5, | 4, - 1 - 4 - 1 |
    | 5, - 2 - 5 - 2 | 1, - 5, - 1 - - |
}

M11:Oboe@|-1|{
    <8*>
    | {<11/8>} 0 0 0 0 0 0 0 0 5 6 7 |
    | 1 2 3 4 5 6 7 1^ 2^ 3^ 2^ | 1^ 7 6 5 4 3 2 1 2 3 4 |
    | 5 6 7 1^ 2^ 1^ 7 6 5 4 3 | 2 3 4 5 3 1 5, 1 - - - |
}
M11:Flute@|0|{
    <8*>
    | {<11/8>} 3 4 5 6 7 1^ 2^ 3^ 4^ 5^ 4^ | 3^ 2^ 1^ 7 6 5 4 3 4 5 6 |
    | 7 1^ 2^ 3^ 4^ 3^ 2^ 1^ 7 6 5 | 4 5 6 7 5 3 2 3 - - - |
}

M13:Violin@|-1|{
    <8*>
    | {<13/8>} 0 0 0 0 0 0 0 0 0 5 6 7 2^ |
    | 1^ 7 6 5 4 3 2 1 2 3 4 5 6 | 5 6 7 1^ 2^ 3^ 4^ 5^ 4^ 3^ 2^ 1^ 7 |
    | 1^ 5 3 1 6 4 2 7, 5 3 1 2 7, | 1 - - 5, - - 1 - - - - - - |
}
M13:Flute@|0|{
    <8*>
    | {<13/8>} 3^ 2^ 1^ 7 6 5 4 3 4 5 6 7 1^ | 7 1^ 2^ 3^ 4^ 5^ 6^ 7^ 6^ 5^ 4^ 3^ 2^ |
    | 3^ 1^ 5 3 1^ 6 4 2 7 5 3 4 2 | 3 - - 1 - - 3 - - - - - - |
}

Poly:Flute@|0|{
    <8*>
    | {<5/8>} 1 2 3 4 5 | 6 5 4 3 2 | 1 3 5 3 1 | 2 4 6 4 2 |
    | 3 5 1^ 5 3 | 4 6 2^ 6 4 | 5 4 3 2 1 |
}
Poly:Clarinet@|0|{
    <8*>
    | {<7/8>} 1, 5, 1 3 5 3 1 | 4, 1 4 6 1^ 6 4 |
    | 5, 2 5 7 2^ 7 5 | 6, 3 6 1^ 3^ 1^ 6 |
    | 5, 2 5 7 1^ - - |
}

-> Intro -> M5 -> M7 -> M11 -> M13 -> Poly ->#
`;

    // 1. Validator emits 0 errors and 0 W-SECTION-LENGTH-MISMATCH warnings
    const diags = TmdScoreValidator.validate(score);
    expect(diags.filter((d) => d.rule === "W-SECTION-LENGTH-MISMATCH")).toEqual([]);
    expect(diags.filter((d) => d.severity === "error")).toEqual([]);

    // 2. Section durations reflect entry-local time signatures
    const sheet = TmdParser.parseThrowing(score);
    expect(TmdPlaybackRenderer.durationOf("M5", sheet)).toBeCloseTo(20.0, 5);
    expect(TmdPlaybackRenderer.durationOf("M7", sheet)).toBeCloseTo(14.0, 5);
    expect(TmdPlaybackRenderer.durationOf("M11", sheet)).toBeCloseTo(22.0, 5);
    expect(TmdPlaybackRenderer.durationOf("M13", sheet)).toBeCloseTo(26.0, 5);

    // 3. Playback timeline downbeat alignment:
    // Intro (8.0) + M5 (20.0) = 28.0 downbeat for M7. Flute M7 pickup starts at 24.5.
    const fluteTimeline = TmdPlaybackRenderer.render(sheet, "Flute");
    const clarinetTimeline = TmdPlaybackRenderer.render(sheet, "Clarinet");
    expect(fluteTimeline.events.some((e) => Math.abs(e.position - 24.5) < 1e-6)).toBe(true);
    expect(fluteTimeline.events.some((e) => Math.abs(e.position - 28.0) < 1e-6)).toBe(true);
    expect(clarinetTimeline.events.some((e) => Math.abs(e.position - 28.0) < 1e-6)).toBe(true);

    // 4. Measure renderer keeps M5's 4th bar (23.0..<28.0) in 5/4 (containing Flute's pickup in its tail)
    // and switches all tracks (Flute, Clarinet, Oboe, Violin) to 7/8 at 28.0 with identical measure grids.
    const fluteMeasures = TmdMeasureRenderer.renderMeasures(sheet, "Flute");
    const clarinetMeasures = TmdMeasureRenderer.renderMeasures(sheet, "Clarinet");
    const oboeMeasures = TmdMeasureRenderer.renderMeasures(sheet, "Oboe");
    const violinMeasures = TmdMeasureRenderer.renderMeasures(sheet, "Violin");

    expect(fluteMeasures.length).toBe(23);
    expect(clarinetMeasures.length).toBe(23);
    expect(oboeMeasures.length).toBe(23);
    expect(violinMeasures.length).toBe(23);

    for (let idx = 0; idx < fluteMeasures.length; idx++) {
      expect(fluteMeasures[idx].startTime).toBeCloseTo(clarinetMeasures[idx].startTime, 5);
      expect(fluteMeasures[idx].nominalDuration).toBeCloseTo(clarinetMeasures[idx].nominalDuration, 5);
      expect(fluteMeasures[idx].timeSignature).toEqual(clarinetMeasures[idx].timeSignature);
      expect(fluteMeasures[idx].timeSignature).toEqual(oboeMeasures[idx].timeSignature);
      expect(fluteMeasures[idx].timeSignature).toEqual(violinMeasures[idx].timeSignature);
    }

    const m5LastBar = fluteMeasures[5];
    expect(m5LastBar.startTime).toBeCloseTo(23.0, 5);
    expect(m5LastBar.timeSignature).toEqual({ count: 5, noteValue: 4 });
    const m5LastBarTotal = TmdMeasureRenderer.groupSimultaneousEvents(m5LastBar.events).reduce(
      (sum, g) => sum + (g[0]?.duration ?? 0),
      0
    );
    expect(m5LastBarTotal).toBeCloseTo(5.0, 5);

    const m7FirstBar = fluteMeasures[6];
    expect(m7FirstBar.startTime).toBeCloseTo(28.0, 5);
    expect(m7FirstBar.timeSignature).toEqual({ count: 7, noteValue: 8 });
    expect(m7FirstBar.nominalDuration).toBeCloseTo(3.5, 5);
  });

  it("clamps out-of-range tempos to [10, 1000] BPM, bounds MIDI mpqn to 24-bit [1, 0xFFFFFF], and emits W-TEMPO-OUT-OF-RANGE warnings (Issue #66)", async () => {
    const { TmdMIDIEncoder } = await import("../src/exporters/midi_encoder.js");
    const { TmdParser } = await import("../src/syntax/index.js");
    const { TmdPlaybackRenderer, TmdMeasureRenderer } = await import("../src/playback/index.js");
    const score = `::SCORE::
** Extreme Tempo Test **
!= 5
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | 1 {!= 1500} 2 {!- 2000} 3 4 |
}

-> A ->#
`;

    // 1. Validator emits W-TEMPO-OUT-OF-RANGE warnings for != 5, {!= 1500}, and {!- 2000}
    const diags = TmdScoreValidator.validate(score);
    const tempoWarnings = diags.filter((d) => d.rule === "W-TEMPO-OUT-OF-RANGE");
    expect(tempoWarnings.length).toBe(3);
    expect(tempoWarnings.every((d) => d.severity === "warning")).toBe(true);

    // 2. Playback and Measure renderers clamp effective tempos to [10.0, 1000.0] BPM
    const sheet = TmdParser.parseThrowing(score);
    const timeline = TmdPlaybackRenderer.render(sheet, "Piano");
    expect(timeline.events.length).toBe(4);
    expect(timeline.events[0].state.tempo).toBeCloseTo(10.0, 5);
    expect(timeline.events[1].state.tempo).toBeCloseTo(1000.0, 5);
    expect(timeline.events[2].state.tempo).toBeCloseTo(10.0, 5);

    const measures = TmdMeasureRenderer.renderMeasures(sheet, "Piano");
    expect(measures[0].tempo).toBeCloseTo(10.0, 5);

    // 3. MIDI 24-bit mpqn clamps to [1, 0xFFFFFF] without truncating high bytes
    const slowTrack = Array.from(
      TmdMIDIEncoder.encodeTrack([{ tick: 0, message: { type: "tempo", bpm: 1.0 } }])
    );
    expect(slowTrack.slice(0, 7)).toEqual([0x00, 0xff, 0x51, 0x03, 0xff, 0xff, 0xff]);

    const fastTrack = Array.from(
      TmdMIDIEncoder.encodeTrack([{ tick: 0, message: { type: "tempo", bpm: 100_000_000.0 } }])
    );
    expect(fastTrack.slice(0, 7)).toEqual([0x00, 0xff, 0x51, 0x03, 0x00, 0x00, 0x01]);
  });
});
