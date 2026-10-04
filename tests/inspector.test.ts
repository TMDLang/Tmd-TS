import { describe, expect,it } from "vitest";

import { TMDSongHarmonyAnalyzer } from "../src/core/harmony_analyzer.js";
import { TMDSongInspector } from "../src/core/inspector.js";
import { TmdParser } from "../src/core/parser.js";
import { TMDSongPitchRangeAnalyzer } from "../src/core/pitch_range_analyzer.js";
import { TMDPlaybackRenderer } from "../src/core/playback.js";
import { TMDSongTimingAnalyzer } from "../src/core/timing_analyzer.js";
import { TMDSongTonalityAnalyzer } from "../src/core/tonality_analyzer.js";
import { inspectorBasicFixture } from "./conformanceFixtures.js";

describe("TMDSongInspector (TDD port from TmdSwift)", () => {
  it("runs timing analysis independently from the Inspector facade", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Timing Analyzer **
!= 120
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    1 2 3 4
}

-> intro ->#
`);
    const directives = TMDPlaybackRenderer.render(sheet, "Piano").directives;
    const timing = TMDSongTimingAnalyzer.analyze(sheet, directives);

    expect(timing.totalMeasures).toBe(1);
    expect(timing.totalDurationSeconds).toBeCloseTo(2, 5);
    expect(timing.sections[0].name).toBe("intro");
  });

  it("runs pitch-range analysis independently from the Inspector facade", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Pitch Analyzer **
!= 120
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    1 3 5 1^
}

-> intro ->#
`);
    const timeline = TMDPlaybackRenderer.render(sheet, "Piano");
    const timing = TMDSongTimingAnalyzer.analyze(sheet, timeline.directives);
    const profile = TMDSongPitchRangeAnalyzer.analyze("Piano", sheet, timing, timeline.directives);

    expect(profile).not.toBeNull();
    expect(profile?.totalNotes).toBe(4);
    expect(profile?.lowestNote.midiPitch).toBe(60);
    expect(profile?.highestNote.midiPitch).toBe(72);
    expect(profile?.spanSemitones).toBe(12);
  });

  it("runs harmony analysis independently from the Inspector facade", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Harmony Analyzer **
!= 120
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    [C] - [G] -
}

-> intro ->#
`);
    const profile = TMDSongHarmonyAnalyzer.analyze(sheet);

    expect(profile.distinctChords).toEqual(["[C]", "[G]"]);
    expect(profile.chordCount).toBe(2);
    expect(profile.modulations).toEqual([]);
  });

  it("runs tonality analysis independently from the Inspector facade", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Tonality Analyzer **
!= 120
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    1 3 5 1^
}

-> intro ->#
`);
    const timeline = TMDPlaybackRenderer.render(sheet, "Piano");
    const timing = TMDSongTimingAnalyzer.analyze(sheet, timeline.directives);
    const profile = TMDSongTonalityAnalyzer.analyze(sheet, timing, "zh-Hant");

    expect(profile.globalPitchClasses.weights[0]).toBeGreaterThan(0);
    expect(profile.globalInference.tonic).not.toBeNull();
    expect(profile.sections).toHaveLength(1);
  });

  it("matches the shared Inspector fixture's stable profile fields", () => {
    const sheet = TmdParser.parse(inspectorBasicFixture);
    const profile = TMDSongInspector.inspect(sheet);

    expect(profile.timing.totalMeasures).toBe(1);
    expect(profile.timing.totalDurationSeconds).toBeCloseTo(2, 5);
    expect(profile.timing.sections).toHaveLength(1);
    expect(profile.instrumentRanges).toHaveLength(1);
    expect(profile.instrumentRanges[0].assignment).toBe("Piano");
    expect(profile.instrumentRanges[0].totalNotes).toBe(4);
    expect(profile.density.maxConcurrentTracks).toBe(1);
    expect(profile.density.sectionDensities.map((section) => section.trackCount)).toEqual([1]);
  });

  it("localizes vocal range report labels in Traditional Chinese", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Vocal Report **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    1 2 3 4
}
-> verse ->#
`);

    const report = TMDSongInspector.generateReport(TMDSongInspector.inspect(sheet, "Vocal", "zh-Hant"));
    expect(report).not.toContain("Vocal Range");
    expect(report).not.toContain("Lowest Note");
    expect(report).not.toContain("Highest Note");
    expect(report).not.toContain("Suitable For");
  });

  it("does not create an Inspector Piano track for a prototype-only score", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Prototype Only **
!= 120
?= C
<4/4>

Theme{
  <4*>
  1 2 3 4
}
`);

    const profile = TMDSongInspector.inspect(sheet);

    expect(profile.instrumentRanges).toHaveLength(0);
    expect(profile.density.sectionDensities.every((section) => !section.instruments.includes(""))).toBe(true);
  });

  it("uses section tempo directives for timing duration and note timestamps", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Inspector Tempo **
!= 60
?= C
<4/4>

A:Vocal@|0|{
    <4*>
    1 2 3 4
    {!=120}
    5 6 7 1^
}

-> A ->#
`);

    const profile = TMDSongInspector.inspect(sheet, "Vocal");
    expect(profile.timing.totalDurationSeconds).toBeCloseTo(6, 5);
    expect(profile.timing.sections[0].durationSeconds).toBeCloseTo(6, 5);
    expect(profile.vocalRange?.highestNote.timeSeconds).toBeCloseTo(5.5, 5);
  });

  it("inspects song basic profile, timing, pitch ranges, harmony, and density", () => {
    const tmd = `::SCORE::
** Inspector Test Song **
!= 120.0
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    1 2 3 4
    [C] - [G] -
}

verse:Vocal@|0|{
    <4*>
    1 3 5 1^
    [Am] - [F] -
}

verse:Bass@|0|{
    <4*>
    1_ - 5_ -
    6_ - 4_ -
}

chorus:Vocal@|0|{
    <4*>
    5 1^ 3^ 5^
    [C] - [G] -
}

chorus:Bass@|0|{
    <4*>
    1_ - - -
    5_ - - -
}

-> intro -> verse -> {?+2} -> chorus ->#
`;

    const sheet = TmdParser.parse(tmd);
    expect(sheet).toBeDefined();

    const profile = TMDSongInspector.inspect(sheet);

    // 1. Basic Metadata & Keys
    expect(profile.title).toBe("Inspector Test Song");
    expect(profile.initialTempo).toBe(120.0);
    expect(profile.initialKey).toBe("C");
    expect(profile.initialTimeSignature).toBe("4/4");

    // 2. Playback Timing
    // intro: 2 bars @ 4/4 @ 120bpm = 4.0s
    // verse: 2 bars @ 4/4 @ 120bpm = 4.0s
    // chorus: 2 bars @ 4/4 @ 120bpm = 4.0s
    // Total = 6 bars = 12.0s
    expect(profile.timing.totalMeasures).toBe(6);
    expect(Math.abs(profile.timing.totalDurationSeconds - 12.0)).toBeLessThan(0.01);
    expect(profile.timing.sections.length).toBe(3);
    expect(profile.timing.sections[0].name).toBe("intro");
    expect(Math.abs(profile.timing.sections[0].durationSeconds - 4.0)).toBeLessThan(0.01);
    expect(profile.timing.sections[1].name).toBe("verse");
    expect(profile.timing.sections[2].name).toBe("chorus");

    // 3. Vocal Pitch Range & Tessitura (under {?+2} modulation)
    // Vocal appears in:
    // - verse in key C (keyOffset = 0): notes 1, 3, 5, 1^ -> MIDI 60 (C4), 64 (E4), 67 (G4), 72 (C5)
    // - chorus in key C + 2 semitones = D (keyOffset = 2): notes 5, 1^, 3^, 5^
    //   5 in D = 67 + 2 = 69 (A4)
    //   1^ in D = 72 + 2 = 74 (D5)
    //   3^ in D = 76 + 2 = 78 (F#5)
    //   5^ in D = 79 + 2 = 81 (A5)
    expect(profile.vocalRange).toBeDefined();
    const vocal = profile.vocalRange!;
    expect(vocal.assignment).toBe("Vocal");
    expect(vocal.lowestNote.midiPitch).toBe(60); // C4
    expect(vocal.lowestNote.noteName).toBe("C4");
    expect(vocal.highestNote.midiPitch).toBe(81); // A5
    expect(vocal.highestNote.noteName).toBe("A5");
    expect(vocal.spanSemitones).toBe(21); // 81 - 60 = 21 semitones
    expect(vocal.highestNote.sectionName).toBe("chorus");
    expect(vocal.difficulty).toBe("difficult");
    expect(vocal.suitableVoiceTypes).toContain("soprano");
    expect(vocal.suitableVoiceTypes).toContain("tenor");

    // 4. Track Ranges
    expect(profile.instrumentRanges.length).toBeGreaterThanOrEqual(2);
    const bassRange = profile.instrumentRanges.find((r) => r.assignment === "Bass");
    expect(bassRange).toBeDefined();
    expect(bassRange!.lowestNote.midiPitch).toBeLessThan(60);

    // 5. Harmony & Chords
    expect(profile.harmony.distinctChords).toContain("[C]");
    expect(profile.harmony.distinctChords).toContain("[G]");
    expect(profile.harmony.distinctChords).toContain("[Am]");
    expect(profile.harmony.distinctChords).toContain("[F]");
    expect(profile.harmony.modulations.length).toBe(1);
    expect(profile.harmony.modulations[0]).toContain("+2");

    // 6. Arrangement Energy & Density
    expect(profile.density.maxConcurrentTracks).toBe(2);
    const verseDensity = profile.density.sectionDensities.find((s) => s.sectionName === "verse");
    expect(verseDensity).toBeDefined();
    expect(verseDensity!.trackCount).toBe(2);
    expect(verseDensity!.instruments).toContain("Vocal");
    expect(verseDensity!.instruments).toContain("Bass");

    // 7. Human-readable Report
    const report = TMDSongInspector.generateReport(profile);
    expect(report).toContain("TMD Song Profile: [ Inspector Test Song ]");
    expect(report).toContain("Duration:");
    expect(report).toContain("人聲音域:");
    expect(report).toMatch(/(和聲:|Harmony:)/);
  });

  it("expands macro orders into concrete instruments and avoids empty instruments in pitch analysis", () => {
    const tmd = `::SCORE::
** Canon Macro Pitch Test **
!= 60
?= D
<4/4>

/* Abstract pattern: no instrument */
Theme {
    <4*>
    1 2 3 4 |
}

Bass {
    <4*>
    1_ 5__ 6__ 3__ |
}

-> (canon Theme (V1 V2) 0) -> (loop Bass Cello 2) ->#
`;

    const sheet = TmdParser.parse(tmd);
    expect(sheet).toBeDefined();

    const profile = TMDSongInspector.inspect(sheet!);

    // Should not contain empty string instrument
    const instruments = profile.instrumentRanges.map(r => r.assignment);
    expect(instruments).not.toContain("");

    // Should contain expanded instruments V1, V2, Cello
    expect(instruments).toContain("V1");
    expect(instruments).toContain("V2");
    expect(instruments).toContain("Cello");

    // V1 range should be calculated
    const v1Range = profile.instrumentRanges.find(r => r.assignment === "V1");
    expect(v1Range).toBeDefined();
    expect(v1Range!.totalNotes).toBeGreaterThan(0);
    expect(v1Range!.lowestNote.noteName).toBe("D4");
    expect(v1Range!.highestNote.noteName).toBe("G4");

    // Cello range should be calculated
    const celloRange = profile.instrumentRanges.find(r => r.assignment === "Cello");
    expect(celloRange).toBeDefined();
    expect(celloRange!.totalNotes).toBeGreaterThan(0);
  });

  it("supports CLI inspect subcommand with human-readable and --json output", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const { main } = await import("../src/cli.js");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tmd-inspect-test-"));
    const tmpFile = path.join(tmpDir, "test.tmd");
    fs.writeFileSync(
      tmpFile,
      `::SCORE::
** CLI Inspect Song **
!= 100
?= G
<4/4>

intro:Piano@|0|{
<4*>
1 2 3 4 |
}
-> intro ->#
`,
      "utf-8"
    );

    let output = "";
    const originalLog = console.log;
    console.log = (msg: any) => {
      output += msg + "\n";
    };

    try {
      // 1. Text report
      let exitCode = main(["inspect", tmpFile]);
      expect(exitCode).toBe(0);
      expect(output).toContain("TMD Song Profile: [ CLI Inspect Song ]");

      // 2. JSON report
      output = "";
      exitCode = main(["inspect", "--json", tmpFile]);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(output);
      expect(parsed.title).toBe("CLI Inspect Song");
      expect(parsed.initialTempo).toBe(100);
      expect(parsed.initialKey).toBe("G");
      expect(parsed.timing).toBeDefined();

      // 3. SVG report
      output = "";
      exitCode = main(["inspect", "--svg", tmpFile]);
      expect(exitCode).toBe(0);
      expect(output).toContain("<svg");
      expect(output).toContain("Circle of Fifths");

      // 4. HTML report
      output = "";
      exitCode = main(["inspect", "--html", tmpFile]);
      expect(exitCode).toBe(0);
      expect(output).toContain("<!DOCTYPE html>");
      expect(output).toContain("<svg");
    } finally {
      console.log = originalLog;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("tracks section occurrence, measure number, timestamp, and spanOctaves in pitch analysis", () => {
    const tmd = `::SCORE::
** Modulation & Repeated Verse Song **
!= 120.0
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    1 2 3 4
    [C] - - -
}

chorus:Vocal@|0|{
    <4*>
    5 1^ 3^ 5^
    [G] - - -
}

-> verse -> chorus -> {?+2} -> verse -> chorus ->#
`;

    const sheet = TmdParser.parse(tmd);
    expect(sheet).toBeDefined();
    const profile = TMDSongInspector.inspect(sheet);

    expect(profile.vocalRange).toBeDefined();
    const vocal = profile.vocalRange!;

    // Lowest note: C4 (60) in verse #1 at m.1, 0:00 (0.0s)
    expect(vocal.lowestNote.midiPitch).toBe(60);
    expect(vocal.lowestNote.sectionName).toBe("verse");
    expect(vocal.lowestNote.sectionOccurrence).toBe(1);
    expect(vocal.lowestNote.measure).toBe(1);
    expect(Math.abs(vocal.lowestNote.timeSeconds - 0.0)).toBeLessThan(0.01);

    // Highest note: A5 (81) in chorus #2 at m.7, 0:13 (13.5s)
    expect(vocal.highestNote.midiPitch).toBe(81);
    expect(vocal.highestNote.sectionName).toBe("chorus");
    expect(vocal.highestNote.sectionOccurrence).toBe(2);
    expect(vocal.highestNote.measure).toBe(7);
    expect(Math.abs(vocal.highestNote.timeSeconds - 13.5)).toBeLessThan(0.01);

    expect(vocal.spanOctaves).toBeCloseTo(21 / 12.0, 2);

    const report = TMDSongInspector.generateReport(profile);
    expect(report).toContain("in [verse #1 @ m.1, 0:00]");
    expect(report).toContain("in [chorus #2 @ m.7, 0:13]");
    expect(report).toContain("/ 1.8 個八度");
  });

  it("inspects song tonality and key profile accurately using K-S correlation", () => {
    const tmd = `::SCORE::
** Tonality Test Song **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    1 3 5 1^
    [C] - [G] -
}

chorus:Piano@|0|{
    <4*>
    1 4 5 1^
    [D] - [A] -
}

-> verse -> {?+2} -> chorus ->#
`;

    const sheet = TmdParser.parse(tmd);
    expect(sheet).toBeDefined();
    const profile = TMDSongInspector.inspect(sheet!);

    expect(profile.tonality).toBeDefined();
    const tonality = profile.tonality!;

    // 1. Sections Tonality
    expect(tonality.sections.length).toBe(2);

    const verseSec = tonality.sections[0];
    expect(verseSec.sectionName).toBe("verse");
    expect(verseSec.inferredTonality.tonic).toBe("C");
    expect(verseSec.playbackContext.transpositionOffset).toBe(0);
    expect(verseSec.fifthsPosition).toBe(0);
    expect(verseSec.pitchClasses.diatonicRatio).toBeGreaterThan(0.99);
    expect(verseSec.inferredTonality.bestCorrelation).toBeGreaterThan(0.8);
    expect(verseSec.inferredTonality.stability).toBe("ambiguous");
    expect(verseSec.nonDiatonicNotes).toEqual([]);

    const chorusSec = tonality.sections[1];
    expect(chorusSec.sectionName).toBe("chorus");
    expect(chorusSec.inferredTonality.tonic).toBe("D");
    expect(chorusSec.playbackContext.transpositionOffset).toBe(2);
    expect(chorusSec.fifthsPosition).toBe(2);
    expect(chorusSec.pitchClasses.diatonicRatio).toBeGreaterThan(0.99);
    expect(chorusSec.inferredTonality.bestCorrelation).toBeGreaterThan(0.8);

    // 2. Global Fifths Path
    expect(tonality.circleOfFifthsPath).toEqual([0, 2]);

    // 3. Human-readable Producer Report
    const report = TMDSongInspector.generateReport(profile);
    expect(report).toContain("調性診斷：");
    expect(report).toContain("由實際發聲的音符與和弦推測調性");
    expect(report).toContain("五度圈歷程:");
    expect(report).toContain("+0 -> +2");
    expect(tonality.inferredModulationPath).toEqual([]);
    expect(tonality.moodDescription).toContain("大調");
  });

  it("evaluates chromaticism, non-diatonic notes, and ambiguous tonality in blues progression", () => {
    const tmd = `::SCORE::
** Blues Chromatic Song **
!= 100
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    1 3, 4 4' 5 7,
    [C7] - [F7] -
}

-> verse ->#
`;

    const sheet = TmdParser.parse(tmd);
    expect(sheet).toBeDefined();
    const profile = TMDSongInspector.inspect(sheet!);

    expect(profile.tonality).toBeDefined();
    const tonality = profile.tonality!;
    const verseSec = tonality.sections[0];

    // Contains flat-3 (Eb/D#), sharp-4 (F#), flat-7 (Bb/A#)
    expect(verseSec.nonDiatonicNotes.length).toBeGreaterThan(0);
    const hasAccidentals =
      verseSec.nonDiatonicNotes.includes("D#") ||
      verseSec.nonDiatonicNotes.includes("F#") ||
      verseSec.nonDiatonicNotes.includes("A#");
    expect(hasAccidentals).toBe(true);
    expect(verseSec.pitchClasses.chromaticRatio).toBeGreaterThan(0.1);

    const report = TMDSongInspector.generateReport(profile);
    expect(report).toContain("調外音:");
  });

  it("applies initial key offset only once during tonality section inspection", () => {
    const tmd = `::SCORE::
** Initial D Tonality **
!= 120
?= D
<4/4>

verse:Piano@|0|{
    <4*>
    1 3 5 1^
    [D] - [A] -
}

-> verse ->#
`;

    const sheet = TmdParser.parse(tmd);
    expect(sheet).toBeDefined();
    const profile = TMDSongInspector.inspect(sheet!);
    expect(profile.tonality).toBeDefined();
    const tonality = profile.tonality!;
    const section = tonality.sections[0];

    expect(section.inferredTonality.tonic).toBe("D");
    expect(section.playbackContext.transpositionOffset).toBe(2);
    expect(section.fifthsPosition).toBe(2);
    expect(section.nonDiatonicNotes).toEqual([]);
    expect(tonality.modulationStory).toBe("全曲維持單一調性（未轉調）");
  });

  it("reports relative modulation from non-C initial key correctly", () => {
    const tmd = `::SCORE::
** D To E Tonality **
!= 120
?= D
<4/4>

verse:Piano@|0|{
    <4*>
    1 3 5 1^
    [D] - [A] -
}

chorus:Piano@|0|{
    <4*>
    1 3 5 1^
    [E] - [B] -
}

-> verse -> {?+2} -> chorus ->#
`;

    const sheet = TmdParser.parse(tmd);
    expect(sheet).toBeDefined();
    const profile = TMDSongInspector.inspect(sheet!);
    expect(profile.tonality).toBeDefined();
    const tonality = profile.tonality!;

    expect(tonality.sections.map(s => s.inferredTonality.tonic)).toEqual(["D", "E"]);
    expect(tonality.sections.map(s => s.playbackContext.transpositionOffset)).toEqual([2, 4]);
    expect(tonality.inferredModulationPath).toEqual([]);
    expect(tonality.playbackTranspositionPath).toEqual([2, 4]);
  });

  it("generates standalone SVG and HTML visualizer reports using TMDTonalityVisualizer", async () => {
    const tmd = `::SCORE::
** Visualizer Test Song **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    1 3 5 1^
    [C] - [G] -
}

chorus:Piano@|0|{
    <4*>
    1 4 5 1^
    [D] - [A] -
}

-> verse -> {?+2} -> chorus ->#
`;

    const sheet = TmdParser.parse(tmd);
    expect(sheet).toBeDefined();
    const profile = TMDSongInspector.inspect(sheet!);

    const { TMDTonalityVisualizer } = await import("../src/core/tonality_visualizer.js");

    // 1. SVG Generation
    const svg = TMDTonalityVisualizer.generateSVG(profile, "en");
    expect(svg).toContain("<svg");
    expect(svg).toContain("Circle of Fifths Trajectory");
    expect(svg).toContain("12-Tone Pitch Class Distribution");
    expect(svg).toContain("Playback Keyscape Ribbon");
    expect(svg).toContain("Visualizer Test Song");

    // 2. HTML Generation
    const html = TMDTonalityVisualizer.generateHTML(profile, "en");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<svg");
    expect(html).toContain("Detailed Text Analysis");
  });

  it("supports English locale for SongInspector report", () => {
    const tmd = `::SCORE::
** Localized Inspector **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    1 3 5 1^
}

-> verse ->#
`;

    const sheet = TmdParser.parse(tmd);
    expect(sheet).toBeDefined();
    const profile = TMDSongInspector.inspect(sheet!, undefined, "en");
    const report = TMDSongInspector.generateReport(profile);

    expect(profile.locale).toBe("en");
    expect(report).toContain("TMD Song Profile");
    expect(report).toContain("Analysis scope");
    expect(report).toContain("Inferred tonality from sounding note and chord evidence");
    expect(report).not.toContain("調性診斷");

    const zhProfile = TMDSongInspector.inspect(sheet!);
    const overriddenReport = TMDSongInspector.generateReport(zhProfile, "en");
    expect(overriddenReport).toContain("no modulation");
    expect(overriddenReport).not.toContain("全曲無轉調");
  });
});
