import { describe, expect, it } from "vitest";

import { MIDIInstrument, TmdMIDIGenerator } from "../src/exporters/midi.js";
import { formatSectionDirective, formatSheet, TmdABCGenerator, TmdLilyPondGenerator, TmdMusicXMLGenerator,TmdParser, TmdPlaybackRenderer } from "../src/index.js";

describe("explicit key and dynamics syntax", () => {
  const score = `
::SCORE::
** Explicit Key and Dynamics **
!= 120
?= D
key= Bm
<4/4>

main:Piano@|0|{
  <4*>
  | {key= F#m} {ppp} 1 {pp} 2 {p} 3 {mp} 4 |
  | {mf} 1 {f} 2 {ff} 3 {fff} 4 |
}

-> main ->#
`;

  it("keeps movable-do base separate from the declared key and parses inline directives", () => {
    const sheet = TmdParser.parse(score);

    expect(sheet.keySignature.toString()).toBe("D");
    expect(sheet.declaredKey).toBe("Bm");

    const directives = sheet.entries[0].sections[0].directives;
    expect(directives.map((directive) => directive.kind)).toEqual([
      { type: "explicitKey", key: "F#m" },
      { type: "dynamics", mark: "ppp" },
      { type: "dynamics", mark: "pp" },
      { type: "dynamics", mark: "p" },
      { type: "dynamics", mark: "mp" },
      { type: "dynamics", mark: "mf" },
      { type: "dynamics", mark: "f" },
      { type: "dynamics", mark: "ff" },
      { type: "dynamics", mark: "fff" },
    ]);
  });

  it("formats explicit key and dynamics directives without changing their meaning", () => {
    const sheet = TmdParser.parse(score);
    const directives = sheet.entries[0].sections[0].directives;

    expect(formatSectionDirective(directives[0])).toBe("{key= F#m}");
    expect(formatSectionDirective(directives[1])).toBe("{ppp}");
    expect(formatSheet(sheet)).toContain("key= Bm");
    expect(formatSheet(sheet)).toContain("{key= F#m}");
    expect(formatSheet(sheet)).toContain("{fff}");
  });

  it("propagates explicit key and dynamic state to subsequent playback events", () => {
    const sheet = TmdParser.parse(score);
    const timeline = TmdPlaybackRenderer.render(sheet, "Piano");
    const notes = timeline.events.filter((event) => event.content.type === "note");

    expect(notes.map((event) => event.state.keyOffset)).toEqual([
      2, 2, 2, 2, 2, 2, 2, 2,
    ]);
    expect(notes.map((event) => event.state.dynamicLevel)).toEqual([
      "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff",
    ]);
  });

  it("uses the declared key and dynamics in notation and MIDI exporters", () => {
    const sheet = TmdParser.parse(score);
    const abc = TmdABCGenerator.generateABC(sheet);
    const lily = TmdLilyPondGenerator.generateLilyPond(sheet);
    const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);
    const timeline = TmdPlaybackRenderer.render(sheet, "Piano");
    const midiEvents = TmdMIDIGenerator.instrumentEvents(
      timeline,
      "Piano",
      MIDIInstrument.Piano,
      0,
      480,
    );
    const velocities = midiEvents
      .filter((event) => event.message.type === "noteOn")
      .map((event) => event.message.type === "noteOn" ? event.message.velocity : null);

    expect(abc).toContain("K:Bm");
    expect(abc).toContain("!ppp!");
    // Under inline {key= F#m} (3 sharps: F#, C#, G#), degree 4 in ?= D is G4 natural -> must emit =g4
    expect(abc).toContain("=g4");
    expect(lily).toContain("\\key b \\minor");
    expect(lily).toContain("\\ppp");
    expect(xml).toContain("<mode>minor</mode>");
    expect(xml).toContain("<ppp/>");
    expect(velocities.slice(0, 8)).toEqual([20, 35, 50, 65, 80, 95, 110, 125]);
  });

  it("spells flat-key notes, chord roots, and boundary accidentals diatonically in MusicXML and LilyPond", () => {
    const flatScore = `
::SCORE::
** Flat Key Spelling **
!= 120
?= F
key= F
<4/4>

A:Piano@|0|{
  <4*>
  | 1 2 3 4 |
  | [4] - [Bb/D] - |
}
-> A ->#
`;
    const sheetF = TmdParser.parse(flatScore);
    const xmlF = TmdMusicXMLGenerator.generateMusicXML(sheetF);
    const lyF = TmdLilyPondGenerator.generateLilyPond(sheetF);

    expect(xmlF).toContain("<fifths>-1</fifths>");
    expect(xmlF).toContain("<step>B</step>\n          <alter>-1</alter>\n          <octave>4</octave>");
    expect(xmlF).not.toContain("<step>A</step>\n          <alter>1</alter>");
    expect(xmlF).toContain("<root-step>B</root-step>\n          <root-alter>-1</root-alter>");
    expect(xmlF).not.toContain("<root-step>A</root-step>\n          <root-alter>1</root-alter>");

    expect(lyF).toContain("\\key f \\major");
    expect(lyF).toContain("f'4 g'4 a'4 bes'4");
    expect(lyF).not.toContain("ais'4");
    expect(lyF).toContain("bes");
    expect(lyF).not.toContain("ais");

    const boundaryScore = `
::SCORE::
** Octave Boundary Accidentals **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | 1, 3, 7, 7' |
}
-> A ->#
`;
    const sheetB = TmdParser.parse(boundaryScore);
    const xmlB = TmdMusicXMLGenerator.generateMusicXML(sheetB);
    const lyB = TmdLilyPondGenerator.generateLilyPond(sheetB);

    expect(xmlB).toContain("<step>C</step>\n          <alter>-1</alter>\n          <octave>4</octave>");
    expect(xmlB).toContain("<step>B</step>\n          <alter>-1</alter>\n          <octave>4</octave>");
    expect(xmlB).toContain("<step>B</step>\n          <alter>1</alter>\n          <octave>4</octave>");
    expect(lyB).toContain("ces'4");
    expect(lyB).toContain("es'4");
    expect(lyB).toContain("bes'4");
    expect(lyB).toContain("bis'4");
  });

  it("preserves octave and intra-measure accidental memory in ABC notation", () => {
    const scoreD = `
::SCORE::
** ABC Octave in D **
!= 120
?= D
<4/4>

A:Piano@|0|{
  <4*>
  | 7_ 7,_ 7_ 1 |
}
-> A ->#
`;
    const abcD = TmdABCGenerator.generateABC(TmdParser.parse(scoreD));
    expect(abcD).toContain("c4 =c4 ^c4 d4");

    const scoreC = `
::SCORE::
** ABC Intra-Measure Memory **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | 1' 1 1, 7' |
}
-> A ->#
`;
    const abcC = TmdABCGenerator.generateABC(TmdParser.parse(scoreC));
    expect(abcC).toContain("^c4 =c4 _c4 ^b4");
  });

  it("emits MusicXML <accidental> tags using intra-measure accidental state machine", () => {
    const scoreC = `
::SCORE::
** MusicXML Accidental State Machine **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | 1' 1 1, 7' |
}
-> A ->#
`;
    const xmlC = TmdMusicXMLGenerator.generateMusicXML(TmdParser.parse(scoreC));
    expect(xmlC).toContain("<accidental>sharp</accidental>");
    expect(xmlC).toContain("<accidental>natural</accidental>");
    expect(xmlC).toContain("<accidental>flat</accidental>");

    const scoreD = `
::SCORE::
** MusicXML Key Cancellation and Re-sharp **
!= 120
?= D
key= D
<4/4>

A:Piano@|0|{
  <4*>
  | 7_ 7,_ 7_ 1 |
}
-> A ->#
`;
    const xmlD = TmdMusicXMLGenerator.generateMusicXML(TmdParser.parse(scoreD));
    expect((xmlD.match(/<accidental>natural<\/accidental>/g) || []).length).toBe(1);
    expect((xmlD.match(/<accidental>sharp<\/accidental>/g) || []).length).toBe(1);

    const scoreDiverge = `
::SCORE::
** MusicXML Key Divergence **
!= 120
?= D
<4/4>

A:Piano@|0|{
  <4*>
  | {key= F#m} 1 2 3 4 |
}
-> A ->#
`;
    const xmlDiverge = TmdMusicXMLGenerator.generateMusicXML(TmdParser.parse(scoreDiverge));
    expect(xmlDiverge).toContain("<accidental>natural</accidental>");
  });
});

