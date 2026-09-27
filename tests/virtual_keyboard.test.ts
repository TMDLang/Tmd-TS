import { describe, expect,it } from "vitest";

import {
  calculateWhiteKeyCountForWidth,
  generateDynamicKeyboardKeys,
  generateKeyboardKeys,
  midiToNoteLabel,
  midiToTmdNote,
  type VirtualKeyInfo,
} from "../web/src/ui/virtualKeyboardHelper.js";

describe("Virtual Keyboard Helpers (TDD)", () => {
  describe("midiToTmdNote & midiToNoteLabel", () => {
    it("converts MIDI pitch to standard note name and octave", () => {
      expect(midiToNoteLabel(60, "C")).toEqual({
        noteName: "C4",
        degreeLabel: "1",
        isBlack: false,
      });
      expect(midiToNoteLabel(61, "C")).toEqual({
        noteName: "C#4",
        degreeLabel: "1'",
        isBlack: true,
      });
      expect(midiToNoteLabel(62, "C")).toEqual({
        noteName: "D4",
        degreeLabel: "2",
        isBlack: false,
      });
      expect(midiToNoteLabel(71, "C")).toEqual({
        noteName: "B4",
        degreeLabel: "7",
        isBlack: false,
      });
      expect(midiToNoteLabel(72, "C")).toEqual({
        noteName: "C5",
        degreeLabel: "1^",
        isBlack: false,
      });
    });

    it("converts MIDI pitch to TMD note string relative to Key C", () => {
      // Middle C (60) in Key C is 1
      expect(midiToTmdNote(60, "C")).toBe("1");
      // C#4 (61) in Key C is 1'
      expect(midiToTmdNote(61, "C")).toBe("1'");
      // D4 (62) is 2
      expect(midiToTmdNote(62, "C")).toBe("2");
      // D#4 (63) is 2'
      expect(midiToTmdNote(63, "C")).toBe("2'");
      // E4 (64) is 3
      expect(midiToTmdNote(64, "C")).toBe("3");
      // F4 (65) is 4
      expect(midiToTmdNote(65, "C")).toBe("4");
      // F#4 (66) is 4'
      expect(midiToTmdNote(66, "C")).toBe("4'");
      // G4 (67) is 5
      expect(midiToTmdNote(67, "C")).toBe("5");
      // G#4 (68) is 5'
      expect(midiToTmdNote(68, "C")).toBe("5'");
      // A4 (69) is 6
      expect(midiToTmdNote(69, "C")).toBe("6");
      // A#4 / Bb4 (70) is 7, (flat 7 in jianpu)
      expect(midiToTmdNote(70, "C")).toBe("7,");
      // B4 (71) is 7
      expect(midiToTmdNote(71, "C")).toBe("7");

      // Octave up: C5 (72) is 1^
      expect(midiToTmdNote(72, "C")).toBe("1^");
      // Octave down: C3 (48) is 1_
      expect(midiToTmdNote(48, "C")).toBe("1_");
      // Two octaves down: C2 (36) is 1__
      expect(midiToTmdNote(36, "C")).toBe("1__");
      // Sharp with octave up: C#5 (73) is 1'^
      expect(midiToTmdNote(73, "C")).toBe("1'^");
      // Sharp with octave down: C#3 (49) is 1'_
      expect(midiToTmdNote(49, "C")).toBe("1'_");
    });

    // In Key G test, natural F (semitone 10 relative to G) was tested as 7,
    // For Key C, interval 10 is Bb, which is commonly flat 7 (7,) in jianpu/blues/pop!
    // But either 7, or 6' can represent Bb/A#. Let's check consistency.

    it("converts MIDI pitch to TMD note string relative to Key F (semitoneOffset = 5)", () => {
      // In Key F:
      // F4 (65) is 1
      expect(midiToTmdNote(65, "F")).toBe("1");
      // Bb4 (70) is 4
      expect(midiToTmdNote(70, "F")).toBe("4");
      // B4 (71) is 4' (raised fourth)
      expect(midiToTmdNote(71, "F")).toBe("4'");
      // C5 (72) is 5
      expect(midiToTmdNote(72, "F")).toBe("5");
    });

    it("handles flat and sharp key notations (e.g. Eb, F#, Bb)", () => {
      // Key Eb (offset 3): Eb4 (63) is 1
      expect(midiToTmdNote(63, "Eb")).toBe("1");
      // Key F# (offset 6): F#4 (66) is 1
      expect(midiToTmdNote(66, "F#")).toBe("1");
    });
  });

  describe("generateKeyboardKeys", () => {
    it("generates 25 keys spanning 2 octaves (e.g. C4 to C6)", () => {
      const keys = generateKeyboardKeys(4, 2, "C");
      expect(keys.length).toBe(25);
      expect(keys[0].midi).toBe(60); // C4
      expect(keys[0].noteName).toBe("C4");
      expect(keys[0].isBlack).toBe(false);

      expect(keys[1].midi).toBe(61); // C#4
      expect(keys[1].isBlack).toBe(true);

      expect(keys[12].midi).toBe(72); // C5
      expect(keys[12].noteName).toBe("C5");
      expect(keys[12].isBlack).toBe(false);

      expect(keys[24].midi).toBe(84); // C6
      expect(keys[24].noteName).toBe("C6");
      expect(keys[24].isBlack).toBe(false);
    });

    it("correctly shifts start octave when baseOctave changes", () => {
      const keys = generateKeyboardKeys(3, 2, "C");
      expect(keys[0].midi).toBe(48); // C3
      expect(keys[24].midi).toBe(72); // C5
    });

    it("calculates how many white keys fit into given width", () => {
      // White key width is approx 38px (36px + 2px margin)
      // 800px width -> ~21 white keys
      const count = calculateWhiteKeyCountForWidth(800);
      expect(count).toBeGreaterThanOrEqual(15);
      expect(count).toBeLessThanOrEqual(25);
    });

    it("generates dynamic keys fitting white key count starting from baseOctave", () => {
      // If we ask for 15 white keys starting at C4:
      const keys = generateDynamicKeyboardKeys(4, 15, "C");
      const whiteKeys = keys.filter((k) => !k.isBlack);
      expect(whiteKeys.length).toBe(15);
      expect(whiteKeys[0].noteName).toBe("C4");
      // First key is C4
      expect(keys[0].midi).toBe(60);
      // 15 white keys from C4: C4, D4, E4, F4, G4, A4, B4, C5, D5, E5, F5, G5, A5, B5, C6
      const lastKey = keys[keys.length - 1];
      expect(lastKey.noteName).toBe("C6");
    });

    it("generates dynamic keys across different baseOctaves", () => {
      const keysOctave3 = generateDynamicKeyboardKeys(3, 10, "C");
      expect(keysOctave3[0].noteName).toBe("C3");
      const keysOctave5 = generateDynamicKeyboardKeys(5, 10, "C");
      expect(keysOctave5[0].noteName).toBe("C5");
    });

    it("accurately reports start and end note range when octave or width changes", () => {
      // Range for baseOctave 4 with 10 white keys: C4 to E5
      const keys1 = generateDynamicKeyboardKeys(4, 10, "C");
      expect(keys1[0].noteName).toBe("C4");
      expect(keys1[keys1.length - 1].noteName).toBe("E5");

      // Range for baseOctave 2 with 15 white keys: C2 to C4
      const keys2 = generateDynamicKeyboardKeys(2, 15, "C");
      expect(keys2[0].noteName).toBe("C2");
      expect(keys2[keys2.length - 1].noteName).toBe("C4");

      // Range for baseOctave 5 with 8 white keys: C5 to C6
      const keys3 = generateDynamicKeyboardKeys(5, 8, "C");
      expect(keys3[0].noteName).toBe("C5");
      expect(keys3[keys3.length - 1].noteName).toBe("C6");

      // Range for baseOctave 5 with 22 white keys: C5 to C8
      const keys4 = generateDynamicKeyboardKeys(5, 22, "C");
      expect(keys4[0].noteName).toBe("C5");
      expect(keys4[keys4.length - 1].noteName).toBe("C8");
    });
  });
});

