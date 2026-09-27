import { describe, expect, it } from "vitest";
import { TmdParser } from "../src/core/parser.js";
import { formatSheet } from "../src/core/format.js";

describe("Phase 1 canonical source model", () => {
  it("exposes Entry as the primary source-model type with Paragraph compatibility", () => {
    const entry: import("../src/core/types.js").Entry = {
      name: "Theme",
      instrument: "",
      assignment: undefined,
      isPrototype: true,
      pitchMode: "transposing",
      start: 0,
      sections: [],
    };
    const paragraph: import("../src/core/types.js").Paragraph = entry;
    expect(paragraph.name).toBe("Theme");
    expect(paragraph.isPrototype).toBe(true);
  });

  it("exposes assignments, prototypes, and fixed-pitch entry attributes", () => {
    const sheet = TmdParser.parse(`::SCORE::
Intro:Timpani[pitchMode=fixed]@|0|{
  <4*> 2__ - - -
}
Theme{
  <4*> 1 2 3 4
}`);

    const entries = sheet.entries ?? [];
    const timpani = entries.find((entry) => entry.assignment === "Timpani");
    const prototype = entries.find((entry) => entry.name === "Theme");

    expect(timpani?.isPrototype).toBe(false);
    expect(timpani?.pitchMode).toBe("fixed");
    expect(prototype?.isPrototype).toBe(true);
    expect(prototype?.assignment).toBeUndefined();
    expect(sheet.distinctAssignments?.()).toEqual(["Timpani"]);
  });

  it("treats assignment identity as case-insensitive", () => {
    const sheet = TmdParser.parse(`::SCORE::
A:Piano@|0|{ <4*> 1 2 3 4 }
B:piano@|0|{ <4*> 5 6 7 1^ }`);

    expect(sheet.distinctAssignments?.().map((name) => name.toLowerCase())).toEqual(["piano"]);
  });

  it("preserves explicit barline positions through formatting", () => {
    const sheet = TmdParser.parse(`::SCORE::
intro:Piano@|0|{
<4*>
| 1 2 3 4 | 5 6 7 1 |
}
-> intro ->#
`);

    expect(sheet.entries?.[0].sections[0].barlinePositions).toEqual([0, 4, 8]);
    expect(formatSheet(sheet)).toContain("| 1 2 3 4 | 5 6 7 1 |");
  });

  it("preserves canonical fixed-pitch entry attributes through formatting", () => {
    const sheet = TmdParser.parse(`::SCORE::
Intro:Timpani[pitchMode=fixed]@|0|{ <4*> 2__ - - - }`);

    const formatted = formatSheet(sheet);
    const reparsed = TmdParser.parse(formatted);
    const timpani = reparsed.entries?.[0];

    expect(formatted).toContain("Intro:Timpani[pitchMode=fixed]");
    expect(timpani?.assignment).toBe("Timpani");
    expect(timpani?.pitchMode).toBe("fixed");
  });

  it("exposes the score playback sequence through the canonical view", () => {
    const sheet = TmdParser.parse(`::SCORE::
Intro:Piano@|0|{ <4*> 1 2 3 4 }
-> Intro ->#`);

    expect(sheet.playback).toEqual(sheet.orders);
    expect(sheet.playback).toEqual([{ type: "name", name: "Intro" }]);
    expect(sheet.entries?.[0].assignment).toBe("Piano");
    expect(sheet.entries?.[0].isPrototype).toBe(false);
  });
});
