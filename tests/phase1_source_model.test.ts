import { describe, expect, it } from "vitest";
import { TmdParser } from "../src/core/parser.js";

describe("Phase 1 canonical source model", () => {
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
});
