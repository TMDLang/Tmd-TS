import { describe, it, expect } from "vitest";
import { TmdParser, formatSectionDirective, TMDPlaybackRenderer, SectionDirective } from "../src/core/index.js";
import { TMDMIDIGenerator } from "../src/exporters/midi.js";
import { TMDABCGenerator } from "../src/exporters/abc.js";
import { TMDLilyPondGenerator } from "../src/exporters/lilypond.js";
import { TMDMusicXMLGenerator } from "../src/exporters/musicxml.js";

describe("Fixed Pitch Section Directive ({?=fixed}) (TDD)", () => {
  it("parses {?=fixed}, {?= fixed}, and {? fixed} as fixedPitch directive", () => {
    const tmd = `
::SCORE::
** Fixed Pitch Parse Test **
!= 120
?= C
<4/4>

verse:Timpani@|0|{
    <4*>
    {?=fixed}
    1 - - -
    {?= fixed}
    2 - - -
    {? fixed}
    3 - - -
}
`;
    const sheet = TmdParser.parse(tmd);
    expect(sheet).not.toBeNull();
    const section = sheet!.paragraphs[0].sections[0];
    expect(section.directives).toHaveLength(3);
    expect(section.directives[0].kind).toEqual({ type: "fixedPitch" });
    expect(section.directives[1].kind).toEqual({ type: "fixedPitch" });
    expect(section.directives[2].kind).toEqual({ type: "fixedPitch" });

    // Format check
    expect(formatSectionDirective(section.directives[0])).toBe("{?=fixed}");
  });

  it("locks keyOffset to 0 in timeline rendering regardless of initial key or order transpositions", () => {
    const tmd = `
::SCORE::
** Fixed Pitch Playback Test **
!= 120
?= G
<4/4>

verse:Timpani@|0|{
    <4*>
    {?=fixed}
    1 2 3 4
}

verse:Piano@|0|{
    <4*>
    1 2 3 4
}

-> {?+3} -> verse ->#
`;
    const sheet = TmdParser.parse(tmd);
    expect(sheet).not.toBeNull();

    // In Timpani track, {?=fixed} forces keyOffset = 0 regardless of initial key G or global transposition {?+3}
    const timpaniTimeline = TMDPlaybackRenderer.render(sheet!, "Timpani");
    expect(timpaniTimeline.events.length).toBeGreaterThan(0);
    for (const event of timpaniTimeline.events) {
      expect(event.state.keyOffset).toBe(0);
    }

    // In Piano track, without {?=fixed}, initial key G (offset 7) + transposition {?+3} results in keyOffset = 10
    const pianoTimeline = TMDPlaybackRenderer.render(sheet!, "Piano");
    expect(pianoTimeline.events.length).toBeGreaterThan(0);
    for (const event of pianoTimeline.events) {
      expect(event.state.keyOffset).toBe(10);
    }
  });

  it("entry pitchMode=fixed ignores playback key modifiers", () => {
    const sheet = TmdParser.parse(`
::SCORE::
?= G
<4/4>
Intro:Timpani[pitchMode=fixed]@|0|{ <4*> 1 2 3 4 }
-> {?+3} -> Intro ->#
`);

    const timeline = TMDPlaybackRenderer.render(sheet, "Timpani");
    expect(timeline.events.length).toBeGreaterThan(0);
    expect(timeline.events.every((event) => event.state.keyOffset === 0)).toBe(true);
  });

  it("exports correctly to MIDI, ABC, LilyPond, and MusicXML", () => {
    const tmd = `
::SCORE::
** Exporter Test **
!= 120
?= D
<4/4>

intro:Timpani@|0|{
    <4*>
    {?=fixed}
    1 2 3 4
}
-> intro ->#
`;
    const sheet = TmdParser.parse(tmd)!;

    // MIDI
    const midiBytes = TMDMIDIGenerator.generateMIDI(sheet);
    expect(midiBytes.length).toBeGreaterThan(0);

    // ABC
    const abc = TMDABCGenerator.generateABC(sheet);
    expect(abc).toContain("K:C");

    // LilyPond
    const ly = TMDLilyPondGenerator.generateLilyPond(sheet);
    expect(ly).toContain("\\key c \\major");

    // MusicXML
    const xml = TMDMusicXMLGenerator.generateMusicXML(sheet);
    expect(xml).toContain("<fifths>0</fifths>");
  });
});
