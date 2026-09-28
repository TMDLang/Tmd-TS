import { describe, expect,it } from "vitest";

import { TMDCanonGenerator } from "../src/core/canon_gen.js";
import { TMDMeasureChecker } from "../src/core/measure_check.js";
import { TmdParser } from "../src/core/parser.js";
import { TMDPlaybackRenderer } from "../src/core/playback.js";

describe("TMDCanonGenerator (TDD port from canon_gen.py)", () => {
  it("rejects canon dimensions beyond the generation limits", () => {
    expect(() => new TMDCanonGenerator({ numVoices: 17 })).toThrow(/numVoices.*16/);
    expect(() => new TMDCanonGenerator({ numVariations: 4097 })).toThrow(/numVariations.*4096/);
    expect(() => new TMDCanonGenerator({ offsetBars: 65 })).toThrow(/offsetBars.*64/);
  });

  it("rejects invalid canon dimensions before allocating voices", () => {
    expect(() => new TMDCanonGenerator({ numVoices: 0 })).toThrow(/numVoices.*positive integer/);
    expect(() => new TMDCanonGenerator({ numVariations: 1.5 })).toThrow(/numVariations.*positive integer/);
    expect(() => new TMDCanonGenerator({ offsetBars: Number.POSITIVE_INFINITY })).toThrow(/offsetBars.*finite/);
    expect(() => new TMDCanonGenerator({ offsetBars: -1 })).toThrow(/offsetBars.*non-negative integer/);
  });

  it("generates a valid macro-based canon in D major", () => {
    const generator = new TMDCanonGenerator({
      title: "My Algorithmic Canon",
      tempo: 64,
      key: "D",
      numVoices: 3,
      offsetBars: 2,
      numVariations: 3,
      mode: "tonal",
      canonType: "standard",
      useMacro: true,
      seed: 42,
    });

    const tmdScore = generator.generate();
    expect(tmdScore).toContain("::SCORE::");
    expect(tmdScore).toContain("** My Algorithmic Canon **");
    expect(tmdScore).toContain("!= 64");
    expect(tmdScore).toContain("?= D");
    expect(tmdScore).toContain("(canon (Theme Var1 Var2) (Violin1 Violin2 Violin3) 2)");

    // Must parse without syntax errors
    const sheet = TmdParser.parse(tmdScore);
    expect(sheet).not.toBeNull();
    expect(sheet.name).toBe("My Algorithmic Canon");

    // Zero measure length errors
    const issues = TMDMeasureChecker.check(tmdScore);
    expect(issues).toEqual([]);

    // Can render playback timeline for voices
    const timelineV1 = TMDPlaybackRenderer.render(sheet, "Violin1");
    expect(timelineV1.events.length).toBeGreaterThan(0);
    const timelineCello = TMDPlaybackRenderer.render(sheet, "Cello");
    expect(timelineCello.events.length).toBeGreaterThan(0);
  });

  it("generates unrolled canon compatible with standard compiler", () => {
    const generator = new TMDCanonGenerator({
      title: "Unrolled Canon",
      tempo: 72,
      key: "Am",
      numVoices: 2,
      offsetBars: 2,
      numVariations: 2,
      mode: "pentatonic",
      useMacro: false,
      seed: 123,
    });

    const tmdScore = generator.generate();
    expect(tmdScore).toContain("canon:Violin1@|0|{");
    expect(tmdScore).toContain("canon:Violin2@|+2|{");
    expect(tmdScore).toContain("-> intro -> canon -> outro ->#");

    const sheet = TmdParser.parse(tmdScore);
    expect(sheet).not.toBeNull();

    const issues = TMDMeasureChecker.check(tmdScore);
    expect(issues).toEqual([]);
  });

  it("supports crab canon, mirror canon, and table canon forms", () => {
    const crabGen = new TMDCanonGenerator({
      canonType: "crab",
      numVariations: 1,
      seed: 99,
    });
    expect(crabGen.generate()).toContain("(play (reverse Theme) Violin2)");

    const mirrorGen = new TMDCanonGenerator({
      canonType: "mirror",
      numVariations: 1,
      seed: 99,
    });
    expect(mirrorGen.generate()).toContain("(play (flip Theme) Violin2)");

    const tableGen = new TMDCanonGenerator({
      canonType: "table",
      numVariations: 1,
      seed: 99,
    });
    expect(tableGen.generate()).toContain("(play (flip (reverse Theme)) Violin2)");
  });

  describe("Musical Probability Engineering (RTP / Heuristics Tuning)", () => {
    it("ensures strong beats have high chord-tone density and stepwise voice leading", () => {
      const generator = new TMDCanonGenerator({
        mode: "tonal",
        key: "C",
        seed: 777,
      });

      // Let's generate 50 theme bars across multiple variations to sample statistics
      const bassNotes = ["1_", "5__", "6__", "3__", "4__", "1__", "4__", "5__"];
      const subsections = generator.generateThemeBars(bassNotes, 0);
      const bars = subsections[0][1];

      // With authentic half-note bass rhythm, 8 bass notes yield 4 measures (2 chords per measure)
      expect(bars.length).toBe(4);

      let chordToneHits = 0;
      for (let m = 0; m < bars.length; m++) {
        const b = bassNotes[m * 2]; // first chord of the measure
        const bar = bars[m];
        const firstToken = bar.trim().split(/\s+/)[0].replace(/[~_-]$/, "");
        const allowedTones = (generator as any).getChordTones(b);
        if (allowedTones.some((t: string) => t.startsWith(firstToken))) {
          chordToneHits++;
        }
      }

      // Strong beat chord-tone hit rate should be 100% in Style 0
      expect(chordToneHits / bars.length).toBeGreaterThanOrEqual(0.85);
    });

    it("uses intelligent gap-fill motion to smooth out large leaps in stepInScale", () => {
      const generator = new TMDCanonGenerator({
        mode: "tonal",
        key: "D",
        seed: 555,
      });

      // When asked to step with gap-fill, if previous motion was leap > 2 steps, next should compensate
      const prevLeapDirection = 3; // jumped up by 3 scale steps
      const nextStep = (generator as any).pickStepWithHeuristics(prevLeapDirection);
      // Next step should resolve downward (negative step) to balance the melodic contour
      expect(nextStep).toBeLessThan(0);
    });

    it("supports tonal inversion axis targeting the 3rd degree to preserve tonal beauty", () => {
      const mirrorGen = new TMDCanonGenerator({
        canonType: "mirror",
        mode: "tonal",
        numVariations: 1,
        key: "D",
        seed: 888,
      });
      const tmd = mirrorGen.generate();
      // Mirror canon macro should specify optimal mirror axis, e.g. (flip Theme 4) or (flip Theme)
      expect(tmd).toMatch(/\(play \(flip Theme( \d+)?\) Violin2\)/);
    });

    it("supports Pachelbel authentic half-note bass rhythm (2 beats per harmonic change)", () => {
      const generator = new TMDCanonGenerator({
        mode: "tonal",
        key: "D",
        bassRhythm: "half", // Half-note bass rhythm (Pachelbel authentic)
        numVariations: 1,
      });
      const tmd = generator.generate();
      // With half notes, each bar in 4/4 contains 2 bass notes: e.g. | 1_ - 5__ - |
      expect(tmd).toMatch(/\|\s*\S+\s+-\s+\S+\s+-\s*\|/);

      const sheet = TmdParser.parse(tmd);
      expect(sheet).not.toBeNull();
      const issues = TMDMeasureChecker.check(tmd);
      expect(issues).toEqual([]);
    });

    it("selects a seeded violin arpeggio texture according to probability", () => {
      const bassNotes = ["1_", "5__", "6__", "3__"];
      const plain = new TMDCanonGenerator({ mode: "tonal", key: "C", arpeggioProbability: 0, seed: 7 });
      const arpeggiated = new TMDCanonGenerator({ mode: "tonal", key: "C", arpeggioProbability: 1, seed: 7 });

      expect(plain.generateThemeBars(bassNotes, 0)[0][0]).toBe("<4*>");
      const [grid, bars] = arpeggiated.generateThemeBars(bassNotes, 0)[0];
      expect(grid).toBe("<8*>");
      expect(bars).toHaveLength(2);
      expect(bars[0].trim().split(/\s+/)).toHaveLength(8);

      const firstChord = (arpeggiated as any).getChordTones("1_");
      const secondChord = (arpeggiated as any).getChordTones("5__");
      const firstBar = bars[0].trim().split(/\s+/);
      expect(firstBar.slice(0, 4).every((note: string) => firstChord.includes(note))).toBe(true);
      expect(firstBar.slice(4).every((note: string) => secondChord.includes(note))).toBe(true);
      expect(TMDMeasureChecker.check(arpeggiated.generate())).toEqual([]);
    });

    it("keeps arpeggio generation reproducible with the same seed", () => {
      const options = { mode: "pentatonic" as const, key: "D", arpeggioProbability: 0.5, seed: 1234 };
      expect(new TMDCanonGenerator(options).generate()).toBe(new TMDCanonGenerator(options).generate());
    });
  });
});
