import { describe, expect, it } from "vitest";

import { TmdBrailleGenerator } from "../src/exporters/braille.js";
import { TmdMCPServer } from "../src/mcp/server.js";
import { TmdParser } from "../src/syntax/parser.js";
import { renderSightedBreakdownHtml } from "../web/src/ui/modals/brailleModal.js";

describe("TmdBrailleGenerator & Music Braille Integration", () => {
  it("matches Section 9.2 Worked Example 1 (Canon Excerpt) in both Unicode (.brl) and Braille ASCII (.brf)", () => {
    const source = `::SCORE::
** Canon Excerpt **
!= 56
?= D
key= D
<4/4>

intro:Violin1@|0|{
    <4*>
    {mf} 3^ 2^ 1^ 7 | 1+3+5 - - - |
}

intro:Cello@|0|{
    <4*>
    {p} 1_ 5__ 6__ 3__ | 4__ - 5__ - |
}

-> intro ->#
`;
    const sheet = TmdParser.parse(source);
    expect(sheet).not.toBeNull();

    const unicodeOutput = TmdBrailleGenerator.generateBraille(sheet!);
    const expectedUnicode = [
      "⠠⠉⠁⠝⠕⠝ ⠠⠑⠭⠉⠑⠗⠏⠞",
      "⠹⠶⠼⠑⠋ ⠩⠩⠼⠙⠲",
      "⠜⠧⠇⠂⠄ ⠜⠍⠋⠨⠻⠫⠱⠹ ⠐⠵⠬⠔⠣⠅",
      "⠜⠧⠉⠄ ⠜⠏⠸⠱⠘⠪⠺⠻ ⠗⠎⠣⠅",
      "",
    ].join("\n");
    expect(unicodeOutput).toBe(expectedUnicode);

    const brfOutput = TmdBrailleGenerator.generateBraille(sheet!, {
      encoding: "ascii",
      layout: "partByPart",
    });
    const expectedBrf = [
      ",CANON ,EXCERPT",
      "?7#EF %%#D4",
      ">VL1' >MF.]$:? \"Z+9<K",
      ">VC' >P_:^[W] RS<K",
      "",
    ].join("\n");
    expect(brfOutput).toBe(expectedBrf);
  });

  it("matches Section 9.3 Worked Example 2 (Playback Demo with Canon, Modulation, Fixed Pitch, and Show Filtering)", () => {
    const source = `::SCORE::
** Playback Demo **
!= 120
?= C
<4/4>

/* Unbound prototype (excluded unless bound by playback) */
Theme {
    <2*>
    1 3 |
}

outro:Violin1@|0|{
    <1*>
    1 |
}

outro:Chord@|+1|{
    <1*>
    [1] |
}

outro:Timpani[pitchMode=fixed]@|0|{
    <1*>
    1_ - |
}

show:Lighting@outro{
"""
cue blackout
"""
}

-> (canon Theme (Violin1 Violin2) 1)
-> {?+2}
-> outro
->#
`;
    const sheet = TmdParser.parse(source);
    expect(sheet).not.toBeNull();

    const unicodeOutput = TmdBrailleGenerator.generateBraille(sheet!);
    const expectedUnicode = [
      "⠠⠏⠇⠁⠽⠃⠁⠉⠅ ⠠⠙⠑⠍⠕",
      "⠹⠶⠼⠁⠃⠚ ⠼⠙⠲",
      "⠜⠧⠇⠂⠄ ⠐⠝⠏ ⠍ ⠩⠩ ⠐⠵ ⠍⠣⠅",
      "⠜⠧⠇⠆⠄ ⠍ ⠐⠝⠏ ⠍⠍⠣⠅",
      "⠒⠜ ⠍⠍⠍ ⠠⠙⠸⠄⠣⠅",
      "⠜⠞⠊⠍⠄ ⠍⠍ ⠸⠽⠈⠉⠽⠣⠅",
      "",
    ].join("\n");
    expect(unicodeOutput).toBe(expectedUnicode);

    const brfOutput = TmdBrailleGenerator.generateBraille(sheet!, {
      encoding: "ascii",
      layout: "partByPart",
    });
    const expectedBrf = [
      ",PLAYBACK ,DEMO",
      "?7#ABJ #D4",
      ">VL1' \"NP M %% \"Z M<K",
      ">VL2' M \"NP MM<K",
      "3> MMM ,D_'<K",
      ">TIM' MM _Y@CY<K",
      "",
    ].join("\n");
    expect(brfOutput).toBe(expectedBrf);
    expect(unicodeOutput).not.toContain("Lighting");
  });

  it("supports Bar-over-Bar layout, intra-measure accidentals, flat keys, and sighted preview rendering", async () => {
    const source = `::SCORE::
** Flat Key Demo **
!= 100
?= F
<4/4>

verse:Piano@|0|{
    <4*>
    1+3+5 4' 7, 0 |
}

verse:Bass@|0|{
    <4*>
    1_ - 5_ - |
}

-> verse ->#
`;
    const sheet = TmdParser.parse(source)!;
    const barOverBar = TmdBrailleGenerator.generateBraille(sheet, {
      encoding: "unicode",
      layout: "barOverBar",
    });
    expect(barOverBar).toContain("⠣⠼⠙⠲");
    expect(barOverBar).toContain("⠼⠁");
    expect(barOverBar).toContain("  ⠜⠏⠝⠄ ");
    expect(barOverBar).toContain("  ⠜⠃⠎⠄ ");
    expect(barOverBar).toContain("⠐⠻⠬⠔");
    expect(barOverBar).toContain("⠡");

    const preview = TmdBrailleGenerator.generateBraillePreview(sheet);
    expect(preview.tracks).toHaveLength(2);
    expect(preview.tracks[0].instrument).toBe("Piano");
    expect(preview.tracks[0].measures[0].sightedSummary).toContain("F4+A4+C5");

    const html = renderSightedBreakdownHtml(preview);
    expect(html).toContain("Piano");
    expect(html).toContain("m1");
    expect(html).toContain("F4+A4+C5");

    const mcpRes = await TmdMCPServer.handleExportBraille({
      tmdCode: source,
      encoding: "ascii",
      layout: "partByPart",
    });
    expect(mcpRes.content[0].text).toContain(">PN'");
  });

  it("Issue #75: Solo treble vs bass chord interval direction, #A prefix, centered headers, and single .C chord tie", () => {
    const soloTrebleSource = `::SCORE::
** Test Score **
!= 120
?= C
<4/4>

A:Piano@|0|{
    <4*>
    | 1 2 3 4 |
    | 1+3+5 - - - | - 0 0 - |
}
-> A ->#
`;
    const soloTrebleSheet = TmdParser.parse(soloTrebleSource)!;
    const soloBrf = TmdBrailleGenerator.generateBraille(soloTrebleSheet, {
      encoding: "ascii",
      layout: "partByPart",
    });
    const soloLines = soloBrf.trimEnd().split("\n");
    expect(soloLines.length).toBeGreaterThanOrEqual(4);
    expect(soloLines[0].startsWith("   ")).toBe(true);
    expect(soloLines[0].trim()).toBe(",TEST ,SCORE");
    expect(soloLines[1]).toBe("");
    expect(soloLines[2].startsWith("   ")).toBe(true);
    expect(soloLines[2].trim()).toBe("?7#ABJ #D4");
    expect(soloLines[3]).toBe("#A \"?:$] (+9.C\\+9VU<K");

    const soloBassSource = `::SCORE::
** Bass Solo **
!= 120
?= C
<4/4>

A:Cello@|0|{
    <4*>
    | 1_+3_+5_ - - - | - 0 0 - |
}
-> A ->#
`;
    const soloBassSheet = TmdParser.parse(soloBassSource)!;
    const soloBassBrf = TmdBrailleGenerator.generateBraille(soloBassSheet, {
      encoding: "ascii",
      layout: "partByPart",
    });
    expect(soloBassBrf).toContain("#A _Y+9.C?+9VU<K");
  });

  it("Issue #75: Tuplets (2 and _n'), 16th-note beat grouping (Par. 8.1), value distinction signs (,<1 / ^<1), and inline key naturals (*)", () => {
    const tupletSource = `::SCORE::
!= 120
?= C
<4/4>

A:Flute@|0|{
    <4*>
    | (1 2 3)%(--) 1 2 |
    | (1 2 3 4 5)%(--) 1 2 |
}
-> A ->#
`;
    const tupletSheet = TmdParser.parse(tupletSource)!;
    const tupletBrf = TmdBrailleGenerator.generateBraille(tupletSheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: null,
    });
    expect(tupletBrf).toContain("#A 2\"?:$?: _5'DEFGH?:<K");

    const groupingSource = `::SCORE::
!= 120
?= C
<4/4>

A:Violin@|0|{
    <16*>
    | 1 2 3 4 <4*> 5 4 3 |
}
-> A ->#
`;
    const groupingSheet = TmdParser.parse(groupingSource)!;
    const groupingBrf = TmdBrailleGenerator.generateBraille(groupingSheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: null,
    });
    expect(groupingBrf).toContain("#A \"YEFG\\]$<K");

    const distinctionSource = `::SCORE::
!= 120
?= C
<4/4>

A:Violin@|0|{
    <2*>
    | 1 <32*> 1 2 3 4 5 6 7 1^ 2^ 3^ 4^ 5^ 6^ 7^ 1^^ 2^^ |
}
-> A ->#
`;
    const distinctionSheet = TmdParser.parse(distinctionSource)!;
    const distinctionBrf = TmdBrailleGenerator.generateBraille(distinctionSheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: null,
    });
    expect(distinctionBrf).toContain(",<1\"");

    const keyModSource = `::SCORE::
!= 120
?= D
key= D
<4/4>

A:Violin@|0|{
    <1*>
    | 1 |
    | {key= G} 1 |
    | {key= C} 1 |
}
-> A ->#
`;
    const keyModSheet = TmdParser.parse(keyModSource)!;
    const keyModBrf = TmdBrailleGenerator.generateBraille(keyModSheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: null,
    });
    expect(keyModBrf).toContain("#A \"Z *% \"Z * \"Z<K");
  });

  it("Issue #75: 40-cell line wrapping with 2-space continuation indent and mandatory octave mark on new line (Par. CN-4)", () => {
    const longSource = `::SCORE::
** Long Solo **
!= 120
?= C
<4/4>

A:Piano@|0|{
    <4*>
    | 1 2 3 4 | 5 4 3 2 | 1 2 3 4 | 5 4 3 2 |
    | 1 2 3 4 | 5 4 3 2 | 1 2 3 4 | 1 - - - |
}
-> A ->#
`;
    const sheet = TmdParser.parse(longSource)!;
    const wrappedBrf = TmdBrailleGenerator.generateBraille(sheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: 40,
    });
    const lines = wrappedBrf.trimEnd().split("\n").filter((l) => l.length > 0);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
    const musicLines = lines.filter(
      (l) => l.startsWith("#A ") || (l.startsWith("  ") && !l.startsWith("   "))
    );
    expect(musicLines.length).toBeGreaterThanOrEqual(2);
    expect(musicLines[1]).toBe('  "Y<K');

    const unwrappedBrf = TmdBrailleGenerator.generateBraille(sheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: null,
    });
    const unwrappedMusicLines = unwrappedBrf
      .trimEnd()
      .split("\n")
      .filter((l) => l.startsWith("#A "));
    expect(unwrappedMusicLines.length).toBe(1);
  });

  it("Issue #75: Duplets (_2'), quadruplets (_4'), sextuplets (_6'), triplets adjacent to non-3 tuplets (_3'), and tuplets with internal ties", () => {
    // 1. Compound 6/8 duplet (2 in 3 eighth notes -> _2'DE) and quadruplet (4 in 3 eighth notes -> _4'DEFG)
    const compoundTupletSource = `::SCORE::
!= 120
?= C
<6/8>

A:Flute@|0|{
    <8*>
    | (1 2)%(- - -) (1 2 3 4)%(- - -) |
}
-> A ->#
`;
    const compoundSheet = TmdParser.parse(compoundTupletSource)!;
    const compoundBrf = TmdBrailleGenerator.generateBraille(compoundSheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: null,
    });
    expect(compoundBrf).toContain("#A _2'\"DE_4'DEFG<K");

    // 2. Sextuplet (_6'), triplet adjacent to quintuplet (_3'), and tuplet with internal tie ((1 - 3)%(--))
    const advancedTupletSource = `::SCORE::
!= 120
?= C
<4/4>

A:Flute@|0|{
    <4*>
    | (1 2 3 4 5 6)%(--) 1 2 |
    | (1 2 3 4 5)%(--) (1 2 3)%(--) |
    | (1 - 3)%(--) (1 2 3)%(--) |
}
-> A ->#
`;
    const advancedSheet = TmdParser.parse(advancedTupletSource)!;
    const advancedBrf = TmdBrailleGenerator.generateBraille(advancedSheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: null,
    });
    // Note: in measure 1, 6 (A4 = I) to 1 (C4 = ?) is a 6th (delta = 5 >= 5), requiring octave mark `"`
    expect(advancedBrf).toContain('#A _6\'"DEFGHI"?: _5\'DEFGH_3\'?:$ 2N$2?:$<K');
  });

  it("Issue #75: Mid-measure tempo changes (Par. 14-8), Section 8 canonical sign ordering, and BANA Par. 8.1 grouping suppression", () => {
    // 1. Mid-measure tempo change interrupts measure with `" ?7#<BPM> ` and forces octave mark
    const midTempoSource = `::SCORE::
!= 120
?= C
<4/4>

A:Violin@|0|{
    <4*>
    | 1 2 {!=140} 3 4 |
}
-> A ->#
`;
    const midTempoSheet = TmdParser.parse(midTempoSource)!;
    const midTempoBrf = TmdBrailleGenerator.generateBraille(midTempoSheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: null,
    });
    expect(midTempoBrf).toContain('#A "?: " ?7#ADJ "$]<K');

    // 2. Section 8 canonical order: [Value Distinction Sign] BEFORE [Dynamic / Nuance] BEFORE [Tuplet / Accidental / Octave]
    const orderSource = `::SCORE::
!= 120
?= C
<4/4>

A:Violin@|0|{
    <1*>
    | 1 |
    <2*>
    | 1 <32*> {f} 1' 2 3 4 5 6 7 1^ 2^ 3^ 4^ 5^ 6^ 7^ 1^^ 2^^ |
}
-> A ->#
`;
    const orderSheet = TmdParser.parse(orderSource)!;
    const orderBrf = TmdBrailleGenerator.generateBraille(orderSheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: null,
    });
    // Value distinction sign `,<1` must precede dynamic `>F'` (with dot-3 separator before `%`) and accidental/octave `%"N`
    expect(orderBrf).toContain(",<1>F'%\"N");

    // 3. BANA Par. 8.1 suppression when an ungrouped 8th note occurs later in the measure
    const suppressedByLaterEighthSource = `::SCORE::
!= 120
?= C
<4/4>

A:Violin@|0|{
    <16*>
    | 1 2 3 4 <4*> 5 <8*> 4 3 <4*> 2 |
}
-> A ->#
`;
    const suppressedSheet = TmdParser.parse(suppressedByLaterEighthSource)!;
    const suppressedBrf = TmdBrailleGenerator.generateBraille(suppressedSheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: null,
    });
    // Because 8th notes `GF` occur later in the measure, the first beat `1 2 3 4` must NOT use 8th cells `EFG`; must stay 16th `YZ&=`
    expect(suppressedBrf).toContain('#A "YZ&=\\GF:<K');
  });

  it("Issue #75: Sub-128th duration conservation, SlapBass bottom-up intervals, Table 12A chord symbols, and simultaneous percussion", () => {
    // 1. Sub-128th (<256*>) accumulates pairs into exact 128th cells without doubling measure duration
    const sub128Source = `::SCORE::
!= 120
?= C
<4/4>

A:Flute@|0|{
    <256*>
    | 1 1 2 2 <4*> 3 - - - |
}
-> A ->#
`;
    const sub128Sheet = TmdParser.parse(sub128Source)!;
    const sub128Brf = TmdBrailleGenerator.generateBraille(sub128Sheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: null,
    });
    // Four <256*> notes equal two 128th notes ("DE), not four 128th notes
    expect(sub128Brf).toContain('#A "DE');
    expect(sub128Brf).not.toContain('#A "DDEE');

    // 2. Solo SlapBass uses ascending (bottom-up) chord intervals
    const slapBassSource = `::SCORE::
!= 120
?= C
<4/4>

A:SlapBass@|0|{
    <1*>
    | 1_+3_+5_ |
}
-> A ->#
`;
    const slapBassSheet = TmdParser.parse(slapBassSource)!;
    const slapBassBrf = TmdBrailleGenerator.generateBraille(slapBassSheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: null,
    });
    expect(slapBassBrf).toContain("#A _Y+9<K");

    // 3. Table 12A extended chord symbols: [F#dim7], [C7sus4], [B7-9], [G6/D]
    const chordSymSource = `::SCORE::
!= 120
?= C
<4/4>

A:Chord@|0|{
    <4*>
    | [F'dim7] [C7sus4] [B7-9] [G6/D] |
}
-> A ->#
`;
    const chordSymSheet = TmdParser.parse(chordSymSource)!;
    const chordSymBrf = TmdBrailleGenerator.generateBraille(chordSymSheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: null,
    });
    expect(chordSymBrf).toContain(",F%DIM#G_A,C#GSUS#D_A,B#G-#I_A,G#F/,D_A<K");

    // 4. Simultaneous percussion hits (layered D and C at same offset) encoded with ascending interval sign
    const percSource = `::SCORE::
!= 120
?= C
<4/4>

Kicks {
    <4*>
    | (D) - - - |
}
Crashes {
    <4*>
    | (C) - - - |
}
-> (layer (play Kicks Drums) (play Crashes Drums)) ->#
`;
    const percSheet = TmdParser.parse(percSource)!;
    const percBrf = TmdBrailleGenerator.generateBraille(percSheet, {
      encoding: "ascii",
      layout: "partByPart",
      lineWidth: null,
    });
    // D = F4 (step 3, oct 4), C = A5 (step 5, oct 5), delta = 9 steps (10th -> octave . + 3rd +): "=.+<K
    expect(percBrf).toContain('"=.+<K');
  });
});
