import { describe, expect,it } from "vitest";

import {
  detectTonicAndScale,
  midiPitchToJianpu,
  quantizeNoteEventsToTmdSection,
  TmdNoteEventTime,
} from "../web/src/audio/quantizer.js";

describe("Humming to TMD Quantizer (TDD)", () => {
  it("converts MIDI pitch to Jianpu scale degree relative to Key Signature", () => {
    // Key = C (tonic 60 = 1)
    expect(midiPitchToJianpu(60, "C")).toBe("1");
    expect(midiPitchToJianpu(62, "C")).toBe("2");
    expect(midiPitchToJianpu(64, "C")).toBe("3");
    expect(midiPitchToJianpu(65, "C")).toBe("4");
    expect(midiPitchToJianpu(67, "C")).toBe("5");
    expect(midiPitchToJianpu(69, "C")).toBe("6");
    expect(midiPitchToJianpu(71, "C")).toBe("7");
    expect(midiPitchToJianpu(72, "C")).toBe("1^");
    expect(midiPitchToJianpu(48, "C")).toBe("1_");
    expect(midiPitchToJianpu(61, "C")).toBe("1'"); // C#

    // Key = G (tonic 67 = 1)
    expect(midiPitchToJianpu(67, "G")).toBe("1");
    expect(midiPitchToJianpu(69, "G")).toBe("2");
    expect(midiPitchToJianpu(71, "G")).toBe("3");
    expect(midiPitchToJianpu(72, "G")).toBe("4");
  });

  it("quantizes simple 4-quarter note humming into a valid 4/4 TMD section", () => {
    // 120 BPM => 1 beat = 0.5s
    // Notes: C4, D4, E4, C4 (0.5s each)
    const mockEvents: TmdNoteEventTime[] = [
      { startTimeSeconds: 0.0, durationSeconds: 0.48, pitchMidi: 60, amplitude: 0.8 },
      { startTimeSeconds: 0.5, durationSeconds: 0.49, pitchMidi: 62, amplitude: 0.8 },
      { startTimeSeconds: 1.0, durationSeconds: 0.47, pitchMidi: 64, amplitude: 0.8 },
      { startTimeSeconds: 1.5, durationSeconds: 0.48, pitchMidi: 60, amplitude: 0.8 },
    ];

    const tmd = quantizeNoteEventsToTmdSection(mockEvents, {
      sectionName: "hummed",
      instrument: "Vocal",
      bpm: 120,
      grid: 4, // quarter-note grid <4*>
      key: "C",
      beatsPerMeasure: 4,
    });

    expect(tmd).toContain("hummed:Vocal@|0|{");
    expect(tmd).toContain("<4*>");
    expect(tmd).toContain("1 2 3 1");
  });

  it("handles rests and sustained notes with ties in 8th note grid", () => {
    // 120 BPM => 1 beat = 0.5s, 8th note slot = 0.25s
    // Note 1 (starts 0.0, dur 0.5s = 2 slots -> 1 -)
    // Rest (0.5 to 0.75 -> 0)
    // Note 5 (0.75 to 1.0 -> 5)
    const mockEvents: TmdNoteEventTime[] = [
      { startTimeSeconds: 0.0, durationSeconds: 0.5, pitchMidi: 60, amplitude: 0.9 },
      { startTimeSeconds: 0.75, durationSeconds: 0.25, pitchMidi: 67, amplitude: 0.9 },
    ];

    const tmd = quantizeNoteEventsToTmdSection(mockEvents, {
      sectionName: "verse",
      instrument: "Vocal",
      bpm: 120,
      grid: 8, // <8*>
      key: "C",
      beatsPerMeasure: 4,
    });

    expect(tmd).toContain("verse:Vocal@|0|{");
    expect(tmd).toContain("<8*>");
    expect(tmd).toContain("1 - 0 5");
  });

  it("handles empty note events by producing an empty rest measure", () => {
    const tmd = quantizeNoteEventsToTmdSection([], {
      sectionName: "empty",
      bpm: 100,
      grid: 4,
    });
    expect(tmd).toContain("empty:Vocal@|0|{");
    expect(tmd).toContain("0");
  });

  it("handles chromatic notes with sharps/flats and octaves in Jianpu", () => {
    // 61 = C#4 -> 1'
    expect(midiPitchToJianpu(61, "C")).toBe("1'");
    // 73 = C#5 -> 1'^
    expect(midiPitchToJianpu(73, "C")).toBe("1'^");
    // 59 = B3 -> 7_ in C
    expect(midiPitchToJianpu(59, "C")).toBe("7_");
  });

  it("supports snapToScale to eliminate pitch drifts/flutter into natural diatonic notes", () => {
    // In key of C, semitone 1 (C# / 61) will snap to nearest diatonic degree (C: 60 or D: 62)
    // When snapToScale is enabled, microtonal/drifting notes don't produce accidental sharps
    expect(midiPitchToJianpu(61, "C", true)).toBe("1"); // 61 snaps to 60
    expect(midiPitchToJianpu(63, "C", true)).toBe("2"); // 63 (D#) snaps to 62 (D)
  });

  it("detects key / tonic from note event distribution (Auto-Detect Key)", () => {
    // A singer hums in G major: G4(67), A4(69), B4(71), C5(72), D5(74)
    // weighted by duration
    const gMajorEvents: TmdNoteEventTime[] = [
      { startTimeSeconds: 0.0, durationSeconds: 1.0, pitchMidi: 67, amplitude: 0.9 }, // G
      { startTimeSeconds: 1.0, durationSeconds: 0.5, pitchMidi: 69, amplitude: 0.8 }, // A
      { startTimeSeconds: 1.5, durationSeconds: 0.5, pitchMidi: 71, amplitude: 0.8 }, // B
      { startTimeSeconds: 2.0, durationSeconds: 0.5, pitchMidi: 72, amplitude: 0.8 }, // C
      { startTimeSeconds: 2.5, durationSeconds: 1.0, pitchMidi: 74, amplitude: 0.9 }, // D
      { startTimeSeconds: 3.5, durationSeconds: 1.5, pitchMidi: 67, amplitude: 0.9 }, // G (tonic resolution)
    ];

    const detectedKey = detectTonicAndScale(gMajorEvents);
    expect(detectedKey).toBe("G");

    // When quantizing with detectedKey "G", degrees become natural 1 2 3 4 5 instead of #4 etc.
    const tmd = quantizeNoteEventsToTmdSection(gMajorEvents, {
      bpm: 120,
      grid: 4,
      key: detectedKey,
      snapToScale: true,
    });
    expect(tmd).toContain("1 - 2 3");
    expect(tmd).toContain("4 5 - 1");
    expect(tmd).not.toContain("4'");
  });
});
