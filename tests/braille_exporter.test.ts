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
});
