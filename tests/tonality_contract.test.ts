import { describe, expect, it } from "vitest";

import { TMDSongInspector } from "../src/core/inspector.js";
import { TmdParser } from "../src/core/parser.js";

const inferentialScore = (movableDoBase: string, playback = "", declaredKey = "") => TmdParser.parse(`::SCORE::
** Inference Contract **
!= 120
?= ${movableDoBase}
${declaredKey ? `key= ${declaredKey}` : ""}
<4/4>

verse:Vocal@|0|{
    <4*>
    6 1 3 6
    6 1 3 6
}

verse:CHORD@|0|{
    <4*>
    [Am] - [Dm] -
    [E] - [Am] -
}

${playback} -> verse ->#
`);

describe("tonality inference contract", () => {
  it("keeps ?= as playback context and infers A minor from sounding evidence", () => {
    const sheet = inferentialScore("C");
    const profile = TMDSongInspector.inspect(sheet);
    const tonality = profile.tonality!;

    expect(sheet.keySignature.toString()).toBe("C");
    expect(tonality.playbackContext.movableDoBase).toBe("C");
    expect(tonality.globalInference.tonic).toBe("A");
    expect(tonality.globalInference.mode).toBe("minor");
    expect(tonality.globalInference.confidence).toBeGreaterThan(0);
    expect("declaredKey" in tonality).toBe(false);
  });

  it("preserves an explicit key declaration separately from playback context", () => {
    const sheet = inferentialScore("D", "", "Bm");
    const tonality = TMDSongInspector.inspect(sheet).tonality!;

    expect(tonality.playbackContext.movableDoBase).toBe("D");
    expect(tonality.declaredKey).toBe("Bm");
  });

  it("reports insufficient evidence instead of forcing a major key", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Empty Tonality **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    0 - - -
}

-> verse ->#
`);
    const tonality = TMDSongInspector.inspect(sheet).tonality!;

    expect(tonality.globalInference.mode).toBe("insufficient");
    expect(tonality.globalInference.tonic).toBeNull();
    expect(tonality.globalInference.confidence).toBe(0);
  });

  it("keeps playback transposition separate from inferred modulation", () => {
    const sheet = inferentialScore("C", "-> verse -> {?+2}");
    const tonality = TMDSongInspector.inspect(sheet).tonality!;

    expect(tonality.playbackTranspositionPath).toEqual([0, 2]);
    expect(tonality.inferredModulationPath).toEqual([]);
  });

  it("reports a modulation only when independent section inference changes", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Inferred Section Change **
!= 120
?= C
<4/4>

major:Vocal@|0|{
    <4*>
    1 2 3 4
    5 6 7 1^
    1 2 3 4
    5 6 7 1^
}

major:CHORD@|0|{
    <4*>
    [C] - [F] -
    [G] - [C] -
    [C] - [F] -
    [G] - [C] -
}

minor:Vocal@|0|{
    <4*>
    6 7 1 2
    3 4 5 6
    6 7 1 2
    3 4 5 6
}

minor:CHORD@|0|{
    <4*>
    [Am] - [Dm] -
    [E] - [Am] -
    [Am] - [Dm] -
    [E] - [Am] -
}

-> major -> minor ->#
`);
    const tonality = TMDSongInspector.inspect(sheet).tonality!;

    expect(tonality.sections.map((section) => section.inferredTonality.mode)).toEqual(["major", "minor"]);
    expect(tonality.inferredModulationPath).toHaveLength(1);
    expect(tonality.inferredModulationPath[0].tonic).toBe("A");
  });
});
