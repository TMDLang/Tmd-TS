import { describe, expect, it } from "vitest";

import { formatSheet } from "../src/syntax/format.js";
import { TmdParser } from "../src/syntax/parser.js";

describe("Phase 1 canonical source model", () => {
  it("exposes only canonical source-model fields", () => {
    const entry: import("../src/syntax/types.js").Entry = {
      name: "Theme",
      assignment: undefined,
      isPrototype: true,
      pitchMode: "transposing",
      start: 0,
      sections: [],
    };
    expect(entry.name).toBe("Theme");
    expect(entry.isPrototype).toBe(true);
  });

  it("does not expose removed compatibility fields at runtime", () => {
    const sheet = TmdParser.parse(`::SCORE::
Theme{
  <4*> 1 2 3 4
}`);

    expect(sheet.entries[0]).not.toHaveProperty("instrument");
    expect(sheet).not.toHaveProperty("paragraphs");
    expect(sheet).not.toHaveProperty("orders");
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

  it("uses the canonical assignment field when building playback", async () => {
    const sheet = TmdParser.parse(`::SCORE::
Theme:Piano@|0|{
  <4*> 1 2 3 4
    }`);
    const entry = sheet.entries[0];
    entry.assignment = "Guitar";
    const { TMDPlaybackRenderer } = await import("../src/playback/playback.js");
    expect(TMDPlaybackRenderer.render(sheet, "Guitar").assignment).toBe("Guitar");
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

    expect(sheet.playback).toEqual([{ type: "name", name: "Intro" }]);
    expect(sheet.entries?.[0].assignment).toBe("Piano");
    expect(sheet.entries?.[0].isPrototype).toBe(false);
  });
});
