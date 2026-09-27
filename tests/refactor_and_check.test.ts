import { describe, it, expect } from "vitest";
import {
  TMDRefactor,
  TMDMeasureChecker,
  TMDMeasureIssue,
  TmdParser,
  Lexer,
} from "../src/index.js";

describe("TMDRefactor (TDD)", () => {
  it("formats TMD document preserving comments and normalizing layout", () => {
    const input = `::SCORE::
/* Header Comment */
** My Song **
!=   120
?=  C
<4/4>

intro:Piano@|0|{
<4*>
|[1]  -   |   -  [7,]   |  /* bar comment */
1   2   3   4
(1' 2,  3^ 4_)%(--)
}

-> intro   ->#
`;

    const formatted = TMDRefactor.format(input);
    expect(formatted).toContain("/* Header Comment */");
    expect(formatted).toContain("/* bar comment */");
    expect(formatted).toContain("intro:Piano@|0|{");
    expect(formatted).toContain("    <4*>");
    expect(formatted).toContain("    | [1] - | - [7,] |");
    expect(formatted).toContain("    1 2 3 4");
    expect(formatted).toContain("    (1' 2, 3^ 4_)%(--)");
    expect(formatted).toContain("}");
    expect(formatted).toContain("-> intro ->#");

    const origSheet = TmdParser.parse(input);
    const newSheet = TmdParser.parse(formatted);
    expect(origSheet.name).toBe(newSheet.name);
    expect(origSheet.paragraphs.length).toBe(newSheet.paragraphs.length);
    expect(origSheet.orders.length).toBe(newSheet.orders.length);
  });

  it("formats multi-line block comments with correct indentation on all lines", () => {
    const input = `::SCORE::
/*
 * Header multi-line comment
 * line 2
 */
** My Song **
!= 120
?= C
<4/4>

intro:Piano@|0|{
<4*>
    /*
     * Section multi-line comment
     * line 2
     */
1 2 3 4
}

-> intro ->#
`;

    const formatted = TMDRefactor.format(input);
    // At root level, comments should not have leading indentation on any line
    expect(formatted).toContain("/*\n * Header multi-line comment\n * line 2\n */");

    // Inside paragraph (indentLevel = 1, 4 spaces), every line of comment should be indented with 4 spaces
    expect(formatted).toContain("    /*\n     * Section multi-line comment\n     * line 2\n     */");
  });


  it("renames instrument across paragraphs in TMD document", () => {
    const input = `::SCORE::
** Test Song **
!= 120
?= C
<4/4>

intro:Piano@|0|{
<4*>
1 2 3 4
}

verse:Guitar@|0|{
<4*>
[C] - - -
}

outro:Piano@|0|{
<4*>
5 6 7 1^
}

-> intro -> verse -> outro ->#
`;

    const result = TMDRefactor.renameInstrument(input, "Piano", "GrandPiano");
    expect(result).toContain("intro:GrandPiano@|0|{");
    expect(result).toContain("outro:GrandPiano@|0|{");
    expect(result).toContain("verse:Guitar@|0|{");
    expect(result).not.toContain(":Piano@");

    const sheet = TmdParser.parse(result);
    expect(sheet.paragraphs[0].instrument).toBe("GrandPiano");
    expect(sheet.paragraphs[1].instrument).toBe("Guitar");
    expect(sheet.paragraphs[2].instrument).toBe("GrandPiano");
  });

  it("renames section in TMD document updating paragraphs and orders", () => {
    const input = `::SCORE::
** Test Song **
!= 120
?= C
<4/4>

intro:Piano@|0|{
<4*>
1 2 3 4
}

verse:Piano@|0|{
<4*>
1 3 5 1^
}

verse:Bass@|0|{
<4*>
1_ - - -
}

-> intro -> verse -> {?+2} -> verse ->#
`;

    const result = TMDRefactor.renameSection(input, "verse", "A");
    expect(result).toContain("intro:Piano@|0|{");
    expect(result).toContain("A:Piano@|0|{");
    expect(result).toContain("A:Bass@|0|{");
    expect(result).not.toContain("verse:Piano@");
    expect(result).not.toContain("verse:Bass@");
    expect(result).toContain("-> intro -> A -> {?+2} -> A ->#");

    const sheet = TmdParser.parse(result);
    expect(sheet.paragraphs[1].name).toBe("A");
    expect(sheet.paragraphs[2].name).toBe("A");
    expect(sheet.orders).toEqual([
      { type: "name", name: "intro" },
      { type: "name", name: "A" },
      { type: "relative", value: "+2" },
      { type: "name", name: "A" },
    ]);
  });

  it("extracts instrument tracks into a new TMD document", () => {
    const input = `::SCORE::
** Full Band Song **
!= 130
?= G
<4/4>
~ "Composer: Alice"

intro:Piano@|0|{
<4*>
1 2 3 4
}

intro:Bass@|0|{
<4*>
1_ - - -
}

verse:Piano@|0|{
<4*>
3 4 5 6
}

verse:Drums@|0|{
<4*>
XsTt
}

-> intro -> verse ->#
`;

    const extracted = TMDRefactor.extractInstrument(input, "Piano");
    expect(extracted).toContain("** Full Band Song **");
    expect(extracted).toContain("!= 130");
    expect(extracted).toContain("?= G");
    expect(extracted).toContain("<4/4>");
    expect(extracted).toContain("intro:Piano@|0|{");
    expect(extracted).toContain("verse:Piano@|0|{");
    expect(extracted).not.toContain(":Bass@");
    expect(extracted).not.toContain(":Drums@");
    expect(extracted).toContain("-> intro -> verse ->#");

    const sheet = TmdParser.parse(extracted);
    expect(sheet.name).toBe("Full Band Song");
    expect(sheet.paragraphs.length).toBe(2);
    expect(sheet.paragraphs.every((p) => p.instrument === "Piano")).toBe(true);
    expect(sheet.orders).toEqual([
      { type: "name", name: "intro" },
      { type: "name", name: "verse" },
    ]);
  });

  it("doubles grid resolution (<4*> -> <8*>) padding units with ties", () => {
    const input = `::SCORE::
** Grid Test **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 2 3 4 |
    | [C] - 0 D |
}

-> verse ->#
`;

    const doubled = TMDRefactor.doubleGrid(input);
    expect(doubled).toContain("<8*>");
    expect(doubled).toContain("| 1 - 2 - 3 - 4 - |");
    expect(doubled).toContain("| [C] - - - 0 - D - |");

    // Must be valid TMD and pass measure checks
    const issues = TMDMeasureChecker.check(doubled);
    expect(issues).toHaveLength(0);
  });

  it("doubles and halves grid resolution with tuplets and spaced %(...) syntax", () => {
    const input = `::SCORE::
** Tuplet Grid Test **
!= 120
?= C
<4/4>

Intro:vocal@|0|{
    <4*>
    | 1 2 3 1 | 1 2 (3 1) % (-) 1 |
}

-> Intro ->#
`;

    const doubled = TMDRefactor.doubleGrid(input);
    expect(doubled).toContain("<8*>");
    expect(doubled).toContain("(3 1)%(--)");
    const doubledIssues = TMDMeasureChecker.check(doubled);
    expect(doubledIssues).toHaveLength(0);

    const halved = TMDRefactor.halveGrid(doubled);
    expect(halved).toContain("<4*>");
    expect(halved).toContain("(3 1)%(-)");
    const halvedIssues = TMDMeasureChecker.check(halved);
    expect(halvedIssues).toHaveLength(0);
  });

  it("halves grid resolution (<8*> -> <4*>) when divisible", () => {
    const input = `::SCORE::
** Halve Test **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <8*>
    | 1 - 2 - 3 - 4 - |
    | [C] - - - 0 - D - |
}

-> verse ->#
`;

    const halved = TMDRefactor.halveGrid(input);
    expect(halved).toContain("<4*>");
    expect(halved).toContain("| 1 2 3 4 |");
    expect(halved).toContain("| [C] - 0 D |");

    const issues = TMDMeasureChecker.check(halved);
    expect(issues).toHaveLength(0);
  });

  it("throws error when trying to halve indivisible grid", () => {
    const input = `::SCORE::
** Indivisible Test **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <8*>
    | 1 2 3 4 5 6 7 8 |
}

-> verse ->#
`;

    expect(() => TMDRefactor.halveGrid(input)).toThrow();
  });

  it("optimizes grid resolution repeatedly until minimal noteLength is reached", () => {
    const input = `::SCORE::
** Optimize Grid Test **
!= 120
? = E
<4/4>

b1:Bass@|0| {
    <4*>
    | 4__ - - - | 5__ - - - | 3__ - - - | 6__ - - - |
    | 2__ - - - | 5__ - - - | 1_ - - - | 5__ - - - |
    | 4__ - - - | 5__ - - - | 3__ - - - | 6__ - - - |
    | 2__ - - - | 5__ - - - | 6__ - - - | - - - - |
}

-> b1 ->#
`;

    const optimized = TMDRefactor.optimizeGrid(input);
    expect(optimized).toContain("<1*>");
    expect(optimized).toContain("| 4__ | 5__ | 3__ | 6__ |");
    expect(optimized).toContain("| 2__ | 5__ | 1_ | 5__ |");
    expect(optimized).toContain("| 4__ | 5__ | 3__ | 6__ |");
    expect(optimized).toContain("| 2__ | 5__ | 6__ | - |");

    const issues = TMDMeasureChecker.check(optimized);
    expect(issues).toHaveLength(0);
  });

  it("optimizes grid restricted to a specific section or instrument", () => {
    const input = `::SCORE::
** Multi-Track Optimize Test **
!= 120
?= C
<4/4>

verse:Bass@|0|{
    <4*>
    | 1_ - - - | 5__ - - - |
}

verse:Lead@|0|{
    <4*>
    | 1 2 3 4 | 5 6 7 1^ |
}

-> verse ->#
`;

    // Only optimize Bass in verse
    const optBass = TMDRefactor.optimizeGrid(input, { instrument: "Bass" });
    expect(optBass).toContain("<1*>");
    expect(optBass).toContain("| 1_ | 5__ |");
    // Lead should stay <4*>
    expect(optBass).toContain("<4*>");
    expect(optBass).toContain("| 1 2 3 4 | 5 6 7 1^ |");
    expect(TMDMeasureChecker.check(optBass)).toHaveLength(0);
  });

  it("optimizes entire score across multiple paragraphs with different compressibility", () => {
    const input = `::SCORE::
** Global Optimize Test **
!= 120
?= C
<4/4>

verse:Bass@|0|{
    <4*>
    | 1_ - - - | 5__ - - - |
}

verse:Lead@|0|{
    <4*>
    | 1 2 3 4 | 5 6 7 1^ |
}

-> verse ->#
`;

    const optGlobal = TMDRefactor.optimizeGrid(input);
    expect(optGlobal).toContain("verse:Bass@|0|{");
    expect(optGlobal).toContain("<1*>");
    expect(optGlobal).toContain("| 1_ | 5__ |");
    expect(optGlobal).toContain("verse:Lead@|0|{");
    expect(optGlobal).toContain("<4*>");
    expect(optGlobal).toContain("| 1 2 3 4 | 5 6 7 1^ |");
    expect(TMDMeasureChecker.check(optGlobal)).toHaveLength(0);
  });

  it("duplicates a track with new instrument name and optional octave shift", () => {
    const input = `::SCORE::
** Dup Test **
!= 120
?= C
<4/4>

verse:Lead@|0|{
    <4*>
    | 1 2 3 5 |
}

-> verse ->#
`;

    // Duplicate Lead -> Synth with octave shift -1
    const duped = TMDRefactor.duplicateTrack(input, "Lead", "Synth", { octaveShift: -1 });
    expect(duped).toContain("verse:Lead@|0|{");
    expect(duped).toContain("verse:Synth@|0|{");
    expect(duped).toContain("1_ 2_ 3_ 5_");

    const issues = TMDMeasureChecker.check(duped);
    expect(issues).toHaveLength(0);
  });

  it("duplicates a track restricted to a specific section", () => {
    const input = `::SCORE::
** Multi-Section Dup Test **
!= 120
?= C
<4/4>

verse:Lead@|0|{
    <4*>
    | 1 2 3 4 |
}

chorus:Lead@|0|{
    <4*>
    | 5 6 7 1^ |
}

-> verse -> chorus ->#
`;

    // Duplicate Lead -> Synth only in chorus
    const duped = TMDRefactor.duplicateTrack(input, "Lead", "Synth", { section: "chorus", octaveShift: 1 });
    expect(duped).toContain("chorus:Synth@|0|{");
    expect(duped).toContain("5^ 6^ 7^ 1^^");
    // verse should NOT have Synth
    expect(duped).not.toContain("verse:Synth@");

    const issues = TMDMeasureChecker.check(duped);
    expect(issues).toHaveLength(0);
  });

  it("duplicates a track preserving existing comments in the score and paragraphs", () => {
    const input = `::SCORE::
/* Header comment */
** My Song **
!= 120
?= C
<4/4>

verse:Lead@|0|{
    <4*>
    | 1 2 3 4 | /* bar comment */
}

-> verse -># /* order comment */
`;

    const duped = TMDRefactor.duplicateTrack(input, "Lead", "Synth", { octaveShift: 1 });
    expect(duped).toContain("/* Header comment */");
    expect(duped).toContain("/* bar comment */");
    expect(duped).toContain("/* order comment */");
    expect(duped).toContain("verse:Lead@|0|{");
    expect(duped).toContain("verse:Synth@|0|{");
    expect(duped).toContain("1^ 2^ 3^ 4^");

    const issues = TMDMeasureChecker.check(duped);
    expect(issues).toHaveLength(0);
  });

  it("generates harmony preserving existing comments in the score and paragraphs", () => {
    const input = `::SCORE::
/* Header comment */
** Harmony Song **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 1 | /* bar comment */
}

-> verse -># /* order comment */
`;

    const harmonized = TMDRefactor.generateHarmony(input, "Vocal", "Backing", { intervalSteps: 2 });
    expect(harmonized).toContain("/* Header comment */");
    expect(harmonized).toContain("/* bar comment */");
    expect(harmonized).toContain("/* order comment */");
    expect(harmonized).toContain("verse:Vocal@|0|{");
    expect(harmonized).toContain("verse:Backing@|0|{");
    expect(harmonized).toContain("3 4 5 3");

    const issues = TMDMeasureChecker.check(harmonized);
    expect(issues).toHaveLength(0);
  });

  it("generates diatonic harmony (e.g. parallel 3rd up or down)", () => {
    const input = `::SCORE::
** Harmony Test **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 1 | [C] - - - |
}

-> verse ->#
`;

    // Add parallel third up (+3rd = interval: 2 diatonic steps up: 1 -> 3, 2 -> 4, 3 -> 5)
    const harmonized = TMDRefactor.generateHarmony(input, "Vocal", "Harmony", { intervalSteps: 2 });
    expect(harmonized).toContain("verse:Vocal@|0|{");
    expect(harmonized).toContain("verse:Harmony@|0|{");
    expect(harmonized).toContain("3 4 5 3");
    // Chords / ties are preserved
    expect(harmonized).toContain("[C] - - -");

    const issues = TMDMeasureChecker.check(harmonized);
    expect(issues).toHaveLength(0);
  });

  it("generates diatonic harmony restricted to a specific section", () => {
    const input = `::SCORE::
** Multi-Section Harmony Test **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 1 |
}

chorus:Vocal@|0|{
    <4*>
    | 5 5 6 6 |
}

-> verse -> chorus ->#
`;

    // Generate harmony only in verse
    const harmonized = TMDRefactor.generateHarmony(input, "Vocal", "Harmony", { section: "verse", intervalSteps: 2 });
    expect(harmonized).toContain("verse:Harmony@|0|{");
    expect(harmonized).toContain("3 4 5 3");
    expect(harmonized).not.toContain("chorus:Harmony@");

    const issues = TMDMeasureChecker.check(harmonized);
    expect(issues).toHaveLength(0);
  });

  it("preserves comments across all refactor operations (rename, extract, double, halve, inline)", () => {
    const input = `::SCORE::
/* Header Comment */
** Full Song **
!= 120
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    | 1 2 3 4 | /* piano comment */
}

intro:Bass@|0|{
    <4*>
    | 1_ - - - | /* bass comment */
}

verse:Piano@|0|{
    <4*>
    | 5 6 7 1^ | /* verse piano */
}

-> intro -> verse -># /* order comment */
`;

    // 1. renameInstrument
    const renamedInst = TMDRefactor.renameInstrument(input, "Piano", "GrandPiano");
    expect(renamedInst).toContain("/* Header Comment */");
    expect(renamedInst).toContain("/* piano comment */");
    expect(renamedInst).toContain("/* bass comment */");
    expect(renamedInst).toContain("/* order comment */");

    // 2. renameSection
    const renamedSec = TMDRefactor.renameSection(input, "intro", "IntroA");
    expect(renamedSec).toContain("/* Header Comment */");
    expect(renamedSec).toContain("/* piano comment */");
    expect(renamedSec).toContain("/* bass comment */");
    expect(renamedSec).toContain("/* order comment */");

    // 3. doubleGrid
    const doubled = TMDRefactor.doubleGrid(input);
    expect(doubled).toContain("/* Header Comment */");
    expect(doubled).toContain("/* piano comment */");
    expect(doubled).toContain("/* bass comment */");
    expect(doubled).toContain("/* order comment */");

    // 4. halveGrid
    const halved = TMDRefactor.halveGrid(doubled);
    expect(halved).toContain("/* Header Comment */");
    expect(halved).toContain("/* piano comment */");
    expect(halved).toContain("/* bass comment */");
    expect(halved).toContain("/* order comment */");

    // 5. extractInstrument
    const extracted = TMDRefactor.extractInstrument(input, "Piano");
    expect(extracted).toContain("/* Header Comment */");
    expect(extracted).toContain("/* piano comment */");
    expect(extracted).toContain("/* verse piano */");
    expect(extracted).not.toContain(":Bass@");
    expect(extracted).not.toContain("/* bass comment */");
    expect(extracted).toContain("/* order comment */");
  });

  it("inlines/unrolls orders into a linear score with explicit measures", () => {
    const input = `::SCORE::
** Unroll Test **
!= 120
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    | 1 2 3 4 |
}

verse:Piano@|0|{
    <4*>
    | 5 6 7 1^ |
}

-> intro -> verse -> intro ->#
`;

    const inlined = TMDRefactor.inlineOrders(input);
    expect(inlined).toContain("linear:Piano@|0|{");
    expect(inlined).toContain("-> linear ->#");
    // 3 sections merged in linear playback sequence
    expect(inlined).toContain("| 1 2 3 4 |");
    expect(inlined).toContain("| 5 6 7 1^ |");

    const sheet = TmdParser.parse(inlined);
    expect(sheet.paragraphs).toHaveLength(1);
    expect(sheet.paragraphs[0].sections[0].unitGroups.length).toBe(12); // 4 + 4 + 4
  });

  describe("TMDRefactor.transpose (TDD)", () => {
    it("transposes notes and chords up by semitones (e.g. +2 half steps)", () => {
      const input = `| 1 2 3 4 | [C] - [Am] - |`;
      // In Key C: 1 (C) -> 2 (D), 2 (D) -> 3 (E), 3 (E) -> 4' (F#), 4 (F) -> 5 (G)
      // Chords: [C] -> [D], [Am] -> [Bm]
      const transposed = TMDRefactor.transpose(input, { semitones: 2, keySignature: "C" });
      expect(transposed).toContain("| 2 3 4' 5 |");
      expect(transposed).toContain("[D] - [Bm] -");
    });

    it("transposes notes and chords down by semitones (e.g. -1 half step)", () => {
      const input = `| 1 3 5 1^ | [C] - [G7] - |`;
      // 1 (C) - 1 semitone -> 7_ (B3)
      // 3 (E) - 1 semitone -> 2' (Eb / D#)
      // 5 (G) - 1 semitone -> 4' (F#)
      // 1^ (C5) - 1 semitone -> 7 (B4)
      // [C] -> [B], [G7] -> [F#7]
      const transposed = TMDRefactor.transpose(input, { semitones: -1, keySignature: "C" });
      expect(transposed).toContain("| 7_ 2' 4' 7 |");
      expect(transposed).toContain("[B] - [F#7] -");
    });

    it("transposes movable-do scale degrees diatonically (diatonicSteps: +1 or -1)", () => {
      const input = `| 1 2 3 4 | 5 6 7 1^ | [1] - [4] [5] |`;
      // Shift degree numbers directly: 1->2, 2->3, ..., 7->1^
      // Numbered chords: [1]->[2], [4]->[5], [5]->[6]
      const transposed = TMDRefactor.transpose(input, { diatonicSteps: 1 });
      expect(transposed).toContain("| 2 3 4 5 | 6 7 1^ 2^ |");
      expect(transposed).toContain("[2] - [5] [6]");
    });

    it("transposes complete TMD score and updates score key signature if specified", () => {
      const input = `::SCORE::
/* My intro comment */
** Transpose Song **
!= 120
?= C
<4/4>

verse:Lead@|0|{
    <4*>
    | 1 2 3 1 | /* bar comment */
    | [C] - [G] - |
}

-> verse ->#
`;
      const transposed = TMDRefactor.transpose(input, { semitones: 2, updateKeySignature: true });
      expect(transposed).toContain("?= D");
      expect(transposed).toContain("/* My intro comment */");
      expect(transposed).toContain("/* bar comment */");
      expect(transposed).toContain("verse:Lead@|0|{");
      expect(transposed).toContain("-> verse ->#");

      const issues = TMDMeasureChecker.check(transposed);
      expect(issues).toHaveLength(0);
    });

    it("transposes restricted to a specific section and/or instrument", () => {
      const input = `::SCORE::
** Multi-Track Score **
!= 120
?= C
<4/4>

verse:Lead@|0|{
    <4*>
    | 1 2 3 4 |
}

verse:Bass@|0|{
    <4*>
    | 1_ - 5_ - |
}

chorus:Lead@|0|{
    <4*>
    | 5 6 7 1^ |
}

-> verse -> chorus ->#
`;
      // Transpose only verse Lead up an octave (+12 semitones)
      const transposed = TMDRefactor.transpose(input, {
        semitones: 12,
        section: "verse",
        instrument: "Lead",
      });

      expect(transposed).toContain("verse:Lead@|0|{\n    <4*>\n    | 1^ 2^ 3^ 4^ |");
      expect(transposed).toContain("verse:Bass@|0|{\n    <4*>\n    | 1_ - 5_ - |");
      expect(transposed).toContain("chorus:Lead@|0|{\n    <4*>\n    | 5 6 7 1^ |");
    });
  });
});

describe("TMDMeasureChecker (TDD)", () => {
  it("reports time-signature directives placed mid-measure", () => {
    const input = `::SCORE::
** Mid-Measure Time Signature **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 2 {<3/4>} 3 4 |
}

-> verse ->#
`;

    const issues = TMDMeasureChecker.check(input);
    expect(issues.some((issue) => issue.snippet.includes("Time signature directive"))).toBe(true);
  });

  it("applies a boundary time-signature change to the following measure", () => {
    const input = `::SCORE::
** Boundary Time Signature **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 2 3 4 | {<3/4>} | 1 2 3 |
}

-> verse ->#
`;

    expect(TMDMeasureChecker.check(input)).toHaveLength(0);
  });

  it("allows tempo and dynamics directives within a measure", () => {
    const input = `::SCORE::
** Inline Tempo and Dynamics **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 {!= 140} 2 {p} 3 4 |
}

-> verse ->#
`;

    expect(TMDMeasureChecker.check(input)).toHaveLength(0);
  });

  it("reports no errors for valid measures", () => {
    const input = `::SCORE::
** Valid Song **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 2 3 4 |
    | 1 2 3 4 |
    | [C] - - - |
}

-> verse ->#
`;

    const issues = TMDMeasureChecker.check(input);
    expect(issues).toHaveLength(0);
  });

  it("recognizes percussion tokens and groups like (xxxx) in measure check", () => {
    const input = `::SCORE::
** Drum Song **
!= 120
?= C
<4/4>

v2:Drum-Kick@|0| {
    <4*>
    | D - - - | D - - - | D - - - | D - - - |
    | D - - - | D - - - | D - - - | D - x X |
}

intro:Drum@|0| {
    <4*>
    | - - - - |
    | (xxxx) - - - |
}

-> v2 ->#
`;

    const issues = TMDMeasureChecker.check(input);
    expect(issues).toHaveLength(0);
  });

  it("reports measure issue with incorrect beats", () => {
    const input = `::SCORE::
** Mismatched Measure Song **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 2 3 4 |
    | 1 2 3 |
    | 1 2 3 4 5 |
}

-> verse ->#
`;

    const issues = TMDMeasureChecker.check(input);
    expect(issues).toHaveLength(2);

    expect(issues[0].actualUnits).toBe(3);
    expect(issues[0].expectedUnits).toBe(4);
    expect(issues[0].paragraphName).toBe("verse");
    expect(issues[0].instrument).toBe("Piano");
    expect(issues[0].measureIndex).toBe(2);

    expect(issues[1].actualUnits).toBe(5);
    expect(issues[1].expectedUnits).toBe(4);
    expect(issues[1].measureIndex).toBe(3);
  });

  it("allows pickup measure at start with negative start offset", () => {
    const input = `::SCORE::
** Song with Pickup **
!= 120
?= C
<4/4>

verse:Piano@|-1|{
    <4*>
    | 5 |
    | 1 2 3 4 |
    | 1 2 3 4 |
}

-> verse ->#
`;

    const issues = TMDMeasureChecker.check(input);
    expect(issues).toHaveLength(0);
  });

  it("checks sixteenth note grid measure consistency", () => {
    const input = `::SCORE::
** 16th Note Song **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <16*>
    | 1- 1- 1- 1- 1- 1- 1- 1- |
    | 1 2 3 4 |
}

-> verse ->#
`;

    const issues = TMDMeasureChecker.check(input);
    expect(issues).toHaveLength(1);
    expect(issues[0].expectedUnits).toBe(16);
    expect(issues[0].actualUnits).toBe(4);
    expect(issues[0].measureIndex).toBe(2);
  });

  it("allows section tracks with natural staggered entrances and early exits (implicit rests)", () => {
    const input = `::SCORE::
** Layered Section Song **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 2 3 4 |
    | 1 2 3 4 |
    | 1 2 3 4 |
    | 1 2 3 4 |
}

verse:Bass@|0|{
    <4*>
    | 1 - - - |
    | 1 - - - |
}

verse:Chorus@|+2|{
    <4*>
    | 1 2 3 4 |
}

-> verse ->#
`;

    // Bass exits early (2 measures out of 4), Chorus enters at +2 and exits at 3.
    // In TMD, these are valid staggered entrances / early exits without reporting error.
    const issues = TMDMeasureChecker.check(input);
    expect(issues).toHaveLength(0);
  });

  it("handles section instrument length with delayed start", () => {
    const input = `::SCORE::
** Delayed Start Section Song **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 2 3 4 |
    | 1 2 3 4 |
    | 1 2 3 4 |
    | 1 2 3 4 |
}

verse:Chorus@|+2|{
    <4*>
    | 1 2 3 4 |
    | 1 2 3 4 |
}

-> verse ->#
`;

    const issues = TMDMeasureChecker.check(input);
    expect(issues).toHaveLength(0);
  });

  it("handles section instrument length with pickup start", () => {
    const input = `::SCORE::
** Pickup Section Song **
!= 120
?= C
<4/4>

verse:Vocal@|-1|{
    <4*>
    | 5 |
    | 1 2 3 4 |
    | 1 2 3 4 |
    | 1 2 3 4 |
    | 1 2 3 4 |
}

verse:Piano@|0|{
    <4*>
    | 1 2 3 4 |
    | 1 2 3 4 |
    | 1 2 3 4 |
    | 1 2 3 4 |
}

-> verse ->#
`;

    const issues = TMDMeasureChecker.check(input);
    expect(issues).toHaveLength(0);
  });

  it("reports issue when execution order refers to undefined section", () => {
    const input = `::SCORE::
** Undefined Order Section Song **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 2 3 4 |
}

-> verse -> chorus ->#
`;

    const issues = TMDMeasureChecker.check(input);
    expect(issues).toHaveLength(1);
    const issue = issues[0];
    expect(issue.paragraphName).toBe("chorus");
    expect(issue.measureIndex).toBe(0);
    expect(issue.description).toContain("Undefined section 'chorus' in playback order");
  });

  it("reports issue when execution order refers to undefined section following a directive", () => {
    const input = `::SCORE::
** Undefined Order After Directive Song **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 2 3 4 |
}

-> verse -> {?+3} -> ending ->#
`;

    const issues = TMDMeasureChecker.check(input);
    expect(issues).toHaveLength(1);
    const issue = issues[0];
    expect(issue.paragraphName).toBe("ending");
    expect(issue.description).toContain("Undefined section 'ending' in playback order");
  });

  it("reports issue when playback order is missing", () => {
    const input = `::SCORE::
** No Order Song **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 2 3 4 |
}
`;

    const issues = TMDMeasureChecker.check(input);
    expect(issues).toHaveLength(1);
    const issue = issues[0];
    expect(issue.instrument).toBe("Order");
    expect(issue.description).toContain("Missing playback order");
  });

  it("reports issue when playback order does not terminate with '#'", () => {
    const input = `::SCORE::
** Unterminated Order Song **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 2 3 4 |
}

-> verse
`;

    const issues = TMDMeasureChecker.check(input);
    expect(issues).toHaveLength(1);
    const issue = issues[0];
    expect(issue.instrument).toBe("Order");
    expect(issue.description).toContain("Playback order must terminate with '#'");
  });

  it("reports unclosed paragraph instead of missing playback order when closing brace is omitted before order", () => {
    const input = `::SCORE::
** Missing Paragraph Closing Brace **
!= 120
?= C
<4/4>

Grand_Terminal_Arrival:Piano@|0|{
    <4*>
    | 1 2 3 4 |

-> Concourse_Dawn
-> Double_Train_Depart
-> Rush_Hour_Surge
-> Vaulted_Skywalk
-> Grand_Terminal_Arrival
-> #
`;

    const issues = TMDMeasureChecker.check(input);
    const orderIssues = issues.filter((i) => i.instrument === "Order");
    const unclosedParagraph = issues.find((i) => i.snippet.includes("Unclosed paragraph"));

    expect(unclosedParagraph).toBeDefined();
    expect(unclosedParagraph?.paragraphName).toBe("Grand_Terminal_Arrival");
    expect(unclosedParagraph?.description).toContain("Unclosed paragraph");
    // Should NOT report "Missing playback order" because order is clearly present
    expect(orderIssues.some((i) => i.snippet.includes("Missing playback order"))).toBe(false);
  });
});

describe("TMD CLI subcommands check, format, and refactor (TDD)", () => {
  it("runs check subcommand on valid and invalid TMD files", async () => {
    const { main } = await import("../src/cli.js");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");

    const tempDir = mkdtempSync(join(tmpdir(), "tmd-cli-check-test-"));
    try {
      const goodFile = join(tempDir, "good.tmd");
      writeFileSync(goodFile, `::SCORE::\n** Good **\n!= 120\n?= C\n<4/4>\nverse:Piano@|0|{\n<4*>\n| 1 2 3 4 |\n}\n-> verse ->#\n`);

      const badFile = join(tempDir, "bad.tmd");
      writeFileSync(badFile, `::SCORE::\n** Bad **\n!= 120\n?= C\n<4/4>\nverse:Piano@|0|{\n<4*>\n| 1 2 3 |\n}\n-> verse ->#\n`);

      expect(main(["check", goodFile])).toBe(0);
      expect(main(["check", badFile])).toBe(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("aborts export when measure discrepancies exist unless --force is passed", async () => {
    const { main } = await import("../src/cli.js");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");

    const tempDir = mkdtempSync(join(tmpdir(), "tmd-cli-force-test-"));
    try {
      const badFile = join(tempDir, "bad.tmd");
      const outMidi = join(tempDir, "out.mid");
      writeFileSync(badFile, `::SCORE::\n** Bad **\n!= 120\n?= C\n<4/4>\nverse:Piano@|0|{\n<4*>\n| 1 2 3 |\n}\n-> verse ->#\n`);

      // Without --force: export aborts with exit code 1
      expect(main([badFile, "-m", outMidi])).toBe(1);

      // With --force: export succeeds with exit code 0
      expect(main([badFile, "-m", outMidi, "--force"])).toBe(0);
      expect(main([badFile, "-m", outMidi, "-f"])).toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("runs format subcommand with output option and in-place flag", async () => {
    const { main } = await import("../src/cli.js");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import("node:fs");

    const tempDir = mkdtempSync(join(tmpdir(), "tmd-cli-format-test-"));
    try {
      const file = join(tempDir, "score.tmd");
      const out = join(tempDir, "formatted.tmd");
      const unformatted = `::SCORE::\n** Subcommand Test **\n!=   100\n?=  D\n<4/4>\nverse:Violin@|0|{\n<4*>\n1   2   3   4\n}\n-> verse ->#\n`;
      writeFileSync(file, unformatted);

      expect(main(["format", file, "-o", out])).toBe(0);
      const formatted = readFileSync(out, "utf-8");
      expect(formatted).toContain("!= 100");
      expect(formatted).toContain("1 2 3 4");

      expect(main(["format", file, "-i"])).toBe(0);
      const inPlace = readFileSync(file, "utf-8");
      expect(inPlace).toContain("!= 100");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("runs refactor subcommands: rename-instrument, rename-section, extract-instrument", async () => {
    const { main } = await import("../src/cli.js");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import("node:fs");

    const tempDir = mkdtempSync(join(tmpdir(), "tmd-cli-refactor-test-"));
    try {
      const file = join(tempDir, "score.tmd");
      const outExtract = join(tempDir, "extracted.tmd");
      const score = `::SCORE::\n** Song **\n!= 120\n?= C\n<4/4>\nverse:Violin@|0|{\n<4*>\n1 2 3 4\n}\nverse:Cello@|0|{\n<4*>\n1_ - - -\n}\n-> verse ->#\n`;
      writeFileSync(file, score);

      // rename-instrument
      expect(main(["refactor", "rename-instrument", file, "--from", "Violin", "--to", "Fiddle", "-i"])).toBe(0);
      let content = readFileSync(file, "utf-8");
      expect(content).toContain("verse:Fiddle@|0|{");
      expect(content).not.toContain("verse:Violin@");

      // rename-section
      expect(main(["refactor", "rename-section", file, "--from", "verse", "--to", "Chorus", "-i"])).toBe(0);
      content = readFileSync(file, "utf-8");
      expect(content).toContain("Chorus:Fiddle@|0|{");
      expect(content).toContain("Chorus:Cello@|0|{");
      expect(content).toContain("-> Chorus ->#");

      // extract-instrument
      expect(main(["refactor", "extract-instrument", file, "--instrument", "Cello", "-o", outExtract])).toBe(0);
      const extracted = readFileSync(outExtract, "utf-8");
      expect(extracted).toContain("Chorus:Cello@|0|{");
      expect(extracted).not.toContain("Fiddle");

      // double-grid
      expect(main(["refactor", "double-grid", file, "-i"])).toBe(0);
      content = readFileSync(file, "utf-8");
      expect(content).toContain("<8*>");
      expect(content).toContain("1 - 2 - 3 - 4 -");

      // halve-grid
      expect(main(["refactor", "halve-grid", file, "-i"])).toBe(0);
      content = readFileSync(file, "utf-8");
      expect(content).toContain("<4*>");
      expect(content).toContain("1 2 3 4");

      // optimize-grid (Cello has 1_ - - - at <4*>, should compress to <1*>)
      expect(main(["refactor", "optimize-grid", file, "--instrument", "Cello", "-i"])).toBe(0);
      content = readFileSync(file, "utf-8");
      expect(content).toContain("Chorus:Cello@|0|{\n    <1*>\n    1_\n}");
      expect(content).toContain("Chorus:Fiddle@|0|{\n    <4*>");

      // duplicate-track
      expect(main(["refactor", "duplicate-track", file, "--source", "Fiddle", "--target", "Viola", "--octave", "-1", "-i"])).toBe(0);
      content = readFileSync(file, "utf-8");
      expect(content).toContain("Chorus:Viola@|0|{");
      expect(content).toContain("1_ 2_ 3_ 4_");

      // generate-harmony
      expect(main(["refactor", "generate-harmony", file, "--source", "Fiddle", "--target", "Harmony3rd", "--interval", "2", "-i"])).toBe(0);
      content = readFileSync(file, "utf-8");
      expect(content).toContain("Chorus:Harmony3rd@|0|{");
      expect(content).toContain("3 4 5 6");

      // inline-orders
      const outInlined = join(tempDir, "inlined.tmd");
      expect(main(["refactor", "inline-orders", file, "-o", outInlined])).toBe(0);
      const inlinedContent = readFileSync(outInlined, "utf-8");
      expect(inlinedContent).toContain("linear:Fiddle");
      expect(inlinedContent).toContain("-> linear ->#");

      // transpose
      const outTransposed = join(tempDir, "transposed.tmd");
      expect(main(["refactor", "transpose", file, "-s", "2", "-k", "-o", outTransposed])).toBe(0);
      const transposedContent = readFileSync(outTransposed, "utf-8");
      expect(transposedContent).toContain("?= D");
      expect(transposedContent).toContain("2 3 4' 5");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("accurately computes token line numbers when comments contain token text", () => {
    const code = `/* comment containing v1 inside */
v1:Piano@|0|{
    | 1 2 3 4 |
}
-> v1 ->#
`;
    const lexer = new Lexer(code);
    const tokens = lexer.tokenizeWithRanges();
    const v1Tok = tokens.find((t) => t.text === "v1");
    expect(v1Tok).toBeDefined();
    expect(v1Tok!.range.start.line).toBe(2);
    expect(v1Tok!.token.line).toBe(2);

    const issues = TMDMeasureChecker.check(code);
    expect(issues).toHaveLength(0);
  });

  it("accurately checks pipeless measures and mixed pipe/pipeless paragraphs", () => {
    const code = `::SCORE::
** Pipeless Measure Test **
!= 120
?= C
<4/4>

intro:CHORD@|0|{
<2*>
|[1] - | - [7,] |
|[1] - | - [7,] |
|[1] - | - [7,] |
|[1] - | - [7,] |

<4*>
[1]-----[7,]-
[1]-----[7,]-
}

-> intro ->#
`;
    // intro:CHORD has 8 measures of <2*> (16 half notes = 32 quarter notes = 8 measures)
    // plus 2 measures of <4*> (8 quarter notes = 2 measures)
    // total 10 measures. Should have 0 issues.
    const issues = TMDMeasureChecker.check(code);
    expect(issues).toHaveLength(0);
  });

  it("accepts Aguai's Three Days and Three Nights layered intro pattern without false errors", () => {
    const code = `::SCORE::
** 三天三夜 Intro Test **
!= 133
?= A'
<4/4>

intro:CHORD@|0|{
<2*>
|[1] - | - [7,] |
|[1] - | - [7,] |
|[1] - | - [7,] |
|[1] - | - [7,] |

<4*>
[1]-----[7,]-
[1]-----[7,]-
}
intro:Chorus-1@|+4|{
<16*>
1_- 1_ - 1_ - - 1_ - 1_ - 1_ 1_ - - -
1_- 1_ - 1_ - - 1_ - 1_ - 1_ 1_ - - -
1_- 1_ - 1_ - - 1_ - 1_ - 1_ 1_ - - -
1_- 1_ - 1_ - - 1_ - 1_ - 1_ 1_ - - -
}

intro:Chorus-2@|+6|{
<16*>
3_- 3_ - 3_ - - 3_ - 3_ - 3_ 3_ - - -
3_- 3_ - 3_ - - 3_ - 3_ - 3_ 3_ - - -
3_- 3_ - 3_ - - 3_ - 3_ - 3_ 3_ - - -
}
intro:Chorus-3@|+8|{
<16*>
5_- 5_ - 5_ - - 5_ - 5_ - 5_ 5_ - - -
5_- 5_ - 5_ - - 5_ - 5_ - 5_ 5_ - - -
}

intro:Guitar@{
<16*>
(7,1)%(--) 1 (7,1)%(--) 1 (7,1)%(--)1 (7,1)%(--) 6 7, 6 7, 6 
(7,1)%(--) 1 (7,1)%(--) 1 (7,1)%(--)1 (7,1)%(--) 6 7, 6 7, 6  
(7,1)%(--) 1 (7,1)%(--) 1 (7,1)%(--)1 (7,1)%(--) 6 7, 6 7, 6 
(7,1)%(--) 1 (7,1)%(--) 1 (7,1)%(--)1 (7,1)%(--) 6 7, 6 7, 6 
}

-> intro ->#
`;
    const issues = TMDMeasureChecker.check(code);
    expect(issues).toHaveLength(0);
  });

  it("does not mistake title with colon for paragraph header", () => {
    const code = `::SCORE::
** Movement II: The Snow **
!= 120
?= C
<4/4>

intro:Piano@|0|{
<4*>
1 2 3 4
}

-> intro ->#
`;
    const issues = TMDMeasureChecker.check(code);
    expect(issues).toHaveLength(0);
  });
});
