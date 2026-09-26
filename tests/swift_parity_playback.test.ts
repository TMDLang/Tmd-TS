import { describe, expect, it } from "vitest";
import { TmdParser } from "../src/core/parser.js";
import { formatSheet } from "../src/core/format.js";
import { TMDPlaybackRenderer } from "../src/core/playback.js";

describe("Swift playback parity", () => {
  it("merges conductor directives from all instruments", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Conductor Directives **
!= 120
?= C
<4/4>

A:Piano@|0|{
<4*>
1 {!=90}
}
A:Violin@|0|{
<4*>
3 {<3/4>}
}
-> A ->#
`);

    const timeline = TMDPlaybackRenderer.renderConductor(sheet);
    expect(timeline.directives.map((d) => d.kind)).toEqual([
      { type: "tempo", bpm: 90 },
      { type: "timeSignature", beat: { count: 3, noteValue: 4 } },
    ]);
  });

  it("parses and plays + connected notes at the same position", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Multi-note **
!= 120
?= C
<4/4>

A:Piano@|0|{
<4*>
| 1+3 2+4 5 0 |
}

-> A ->#
`);

    const units = sheet.paragraphs[0].sections[0].unitGroups.map((g) => g.units);
    expect(units[0]).toHaveLength(1);
    expect(units[0][0]).toMatchObject({ type: "multiNote" });
    expect(formatSheet(sheet)).toContain("1+3");

    const timeline = TMDPlaybackRenderer.render(sheet, "Piano");
    expect(timeline.track?.assignment).toBe("Piano");
    expect(timeline.track?.events).toEqual(timeline.events);
    const notes = timeline.events.filter((event) => event.content.type === "note");
    expect(notes).toHaveLength(5);
    expect(notes.filter((event) => event.position === 0)).toHaveLength(2);
    expect(notes.filter((event) => event.position === 1)).toHaveLength(2);
  });

  it("merges all same-section paragraphs and preserves staggered starts", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Merged sections **
!= 120
?= C
<4/4>

A:Piano@|0|{
<4*>
| 1 1 1 1 |
}

A:Piano@|1|{
<4*>
| 5 5 5 5 |
}

-> A ->#
`);

    const timeline = TMDPlaybackRenderer.render(sheet, "Piano");
    const notes = timeline.events.filter((event) => event.content.type === "note");
    expect(notes).toHaveLength(8);
    expect(notes.slice(0, 4).map((event) => event.position)).toEqual([0, 1, 2, 3]);
    expect(notes.slice(4).map((event) => event.position)).toEqual([4, 5, 6, 7]);
  });

  it("matches assignment names case-insensitively when rendering playback", () => {
    const sheet = TmdParser.parse(`::SCORE::
A:Piano@|0|{
<4*>
| 1 2 3 4 |
}

-> A ->#
`);

    const timeline = TMDPlaybackRenderer.render(sheet, "pIaNo");
    expect(timeline.events.filter((event) => event.content.type === "note")).toHaveLength(4);
  });

  it("reports conflicting absolute tempo directives at one position", () => {
    const sheet = TmdParser.parse(`::SCORE::
Intro:Piano@|0|{
<4*>
{!=90}{!=100} 1 2 3 4
}
-> Intro ->#
`);

    const conflicts = TMDPlaybackRenderer.validateTempoConflicts(sheet);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].position).toBe(0);
    expect(conflicts[0].tempos).toEqual([90, 100]);
  });

  it("normalizes a negative pickup globally while retaining later section content", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Pickup **
!= 120
?= C
<4/4>

A:Piano@|-1|{
<4*>
| 1 1 1 1 |
}

A:Piano@|0|{
<4*>
| 5 5 5 5 |
}

-> A ->#
`);

    const timeline = TMDPlaybackRenderer.render(sheet, "Piano");
    const notes = timeline.events.filter((event) => event.content.type === "note");
    expect(notes).toHaveLength(8);
    expect(notes.slice(0, 4).map((event) => event.position)).toEqual([0, 1, 2, 3]);
    expect(notes.slice(4).map((event) => event.position)).toEqual([4, 5, 6, 7]);
  });

  it("reports overlapping entries for one assignment", () => {
    const sheet = TmdParser.parse(`::SCORE::
A:Piano@|0|{ <4*> 1 2 3 4 }
A:piano@|0|{ <4*> 5 6 7 1^ }`);

    const issues = TMDPlaybackRenderer.validate(sheet);
    expect(issues).toHaveLength(1);
    expect(issues[0].assignment.toLowerCase()).toBe("piano");
  });

  it("allows adjacent entries for one assignment", () => {
    const sheet = TmdParser.parse(`::SCORE::
A:Piano@|0|{ <4*> 1 2 3 4 }
A:piano@|1|{ <4*> 5 6 7 1^ }`);

    expect(TMDPlaybackRenderer.validate(sheet)).toEqual([]);
  });
});
