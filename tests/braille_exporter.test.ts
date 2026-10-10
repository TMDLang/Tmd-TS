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
});
