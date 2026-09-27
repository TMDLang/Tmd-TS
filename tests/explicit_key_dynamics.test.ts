import { describe, expect, it } from "vitest";
import { TMDPlaybackRenderer, TmdParser, formatSectionDirective, formatSheet, TMDABCGenerator, TMDLilyPondGenerator, TMDMusicXMLGenerator } from "../src/index.js";
import { MIDIInstrument, TMDMIDIGenerator } from "../src/exporters/midi.js";

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
    const timeline = TMDPlaybackRenderer.render(sheet, "Piano");
    const notes = timeline.events.filter((event) => event.content.type === "note");

    expect(notes.map((event) => event.state.keyOffset)).toEqual([
      6, 6, 6, 6, 6, 6, 6, 6,
    ]);
    expect(notes.map((event) => event.state.dynamicLevel)).toEqual([
      "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff",
    ]);
  });

  it("uses the declared key and dynamics in notation and MIDI exporters", () => {
    const sheet = TmdParser.parse(score);
    const abc = TMDABCGenerator.generateABC(sheet);
    const lily = TMDLilyPondGenerator.generateLilyPond(sheet);
    const xml = TMDMusicXMLGenerator.generateMusicXML(sheet);
    const timeline = TMDPlaybackRenderer.render(sheet, "Piano");
    const midiEvents = TMDMIDIGenerator.instrumentEvents(
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
    expect(lily).toContain("\\key b \\minor");
    expect(lily).toContain("\\ppp");
    expect(xml).toContain("<mode>minor</mode>");
    expect(xml).toContain("<ppp/>");
    expect(velocities.slice(0, 8)).toEqual([20, 35, 50, 65, 80, 95, 110, 125]);
  });
});
