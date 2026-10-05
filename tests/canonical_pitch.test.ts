import { describe, expect, it } from "vitest";

import {
  Accidental,
  Note,
  noteToMIDIPitch,
  PitchMapping,
  ScaleDegree,
} from "../src/syntax/types.js";

describe("canonical pitch domain helpers", () => {
  it("calculates MIDI pitch and chromatic mappings from one domain source", () => {
    const note: Note = { degree: ScaleDegree.F, accidental: Accidental.Natural, octave: 1 };
    expect(noteToMIDIPitch(note, 1)).toBe(78);

    expect(PitchMapping.semitoneToDegreeAccidental(10)).toEqual({
      degree: ScaleDegree.B,
      accidental: Accidental.Flat,
    });
    expect(PitchMapping.keyName(-1)).toBe("B");
  });
});
