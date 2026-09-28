/**
 * TMDCanonGenerator (Algorithmic Counterpoint Canon Engine)
 * 
 * Algorithmic Counterpoint Architecture & Design Principles:
 * --------------------------------------------------------------------------------
 * 1. Basso Ostinato / Ground Bass Foundation
 *    - Tonal Mode: Employs the classical Pachelbel Romanesca progression
 *      (I - V - vi - iii - IV - I - IV - V), providing Renaissance and Baroque
 *      descending-fourth / ascending-second harmonic drive.
 *    - Pentatonic Mode: Utilizes Gong (major) or Yu (minor) cyclic bass lines.
 *      Formed exclusively from scale degrees 1, 2, 3, 5, and 6, which inherently
 *      eliminates minor-second semitone friction and the tritone, yielding
 *      pure, consonant, and ethereal textures.
 *
 * 2. Melodic Generation & Probability Engineering (Voice Leading Heuristics)
 *    - Strong-Beat Chord Tone Gravity:
 *      On downbeats and secondary strong beats (beats 1 and 3), pitches are
 *      strictly selected from the triad chord tones (Root, 3rd, 5th) corresponding
 *      to the active bass note, anchoring vertical counterpoint even through dense delays.
 *    - Stepwise Cantabile Preference:
 *      Melodic step distribution favors stepwise motion (±1 scale degree ~75%),
 *      repeated notes (~10%), and small thirds (±2 scale degrees ~15%),
 *      emulating vocal breathing and instrumental phrasing.
 *    - Gap-Fill Heuristics:
 *      Following any leap of 2 or more scale degrees, the subsequent motion
 *      has an 80% probability to resolve in the opposite direction by step,
 *      maintaining balanced melodic contour and preventing erratic jumps.
 *
 * 3. Baroque Stylistic Variation Library
 *    - Style 0: Lyrical Cantabile (<4*>) - Broad, vocal lines with alternating half and quarter notes.
 *    - Style 1: Baroque Lilt (<8*>) - Dotted figures and rolling 8th-note scalar runs.
 *    - Style 2: Virtuosic Flourish (<16*>) - Anchor-led 16th-note arpeggiated wave figures.
 *    - Style 3: Staccato Dialogue (<8*>) - Playful 8th-note rests and syncopated rhythmic interplay.
 *    - Style 4: Pastoral Sicilienne (<8*>) - Dotted lilting compound-feel rhythms.
 *
 * 4. Symmetrical Canon Forms & Transformations
 *    - Standard Staggered Canon:
 *      The dux (leader) theme is chased by comes (follower) voices delayed by a fixed measure offset.
 *    - Crab Canon (Cancrizans):
 *      The second voice renders the retrograde (reversed) theme, meeting at the temporal midpoint.
 *    - Mirror Canon (Inversion):
 *      The second voice flips pitch intervals vertically over a modal axis (ascending becomes descending).
 *    - Table Canon (Tafelkanon / Retrograde Inversion):
 *      Combines retrograde and inversion (flip (reverse ...)), as if two musicians read the score
 *      from opposite sides of a shared table.
 *
 * 5. High-Level TMD DSL Integration
 *    - S-Expression Macros: Generates expressive, high-level AST orders like
 *      `(canon ...)`, `(layer ...)`, `(reverse ...)`, and `(flip ...)`.
 *    - Unrolled Score: Computes exact voice lead-in rests and measure offsets,
 *      compatible with all standard TMD compilers and exporters.
 * --------------------------------------------------------------------------------
 */

export interface CanonGeneratorOptions {
  title?: string;
  tempo?: number;
  key?: string;
  timeSig?: string;
  numVoices?: number;
  offsetBars?: number;
  numVariations?: number;
  canonType?: "standard" | "crab" | "mirror" | "table";
  mode?: "tonal" | "pentatonic";
  useMacro?: boolean;
  seed?: number;
  /** Probability that an eligible variation becomes an eighth-note violin arpeggio texture. */
  arpeggioProbability?: number;
}

export class TMDCanonGenerator {
  public static readonly MAX_VOICES = 16;
  public static readonly MAX_VARIATIONS = 128;
  public static readonly MAX_OFFSET_BARS = 64;

  public static readonly MAJOR_PENTATONIC_SCALE = [
    "1_", "2_", "3_", "5_", "6_",
    "1", "2", "3", "5", "6",
    "1^", "2^", "3^", "5^", "6^",
    "1^^"
  ];

  public static readonly MINOR_PENTATONIC_SCALE = [
    "6__", "1_", "2_", "3_", "5_",
    "6_", "1", "2", "3", "5",
    "6", "1^", "2^", "3^", "5^",
    "6^"
  ];

  public static readonly PENTATONIC_BASS_PATTERNS = {
    minor: [
      ["6__", "1_", "2_", "3_", "5_", "3_", "2_", "1_"],
      ["6__", "5__", "3__", "2__", "1__", "2__", "3__", "5__"],
      ["6__", "2__", "3__", "6__"],
      ["6__", "1_", "5__", "6__"],
    ],
    major: [
      ["1_", "5__", "6__", "3__", "2__", "1__", "5__", "1_"],
      ["1_", "2_", "3_", "5_", "6_", "5_", "3_", "2_"],
      ["1_", "6__", "5__", "1_"],
      ["1_", "3_", "5_", "2_"],
    ]
  };

  public static readonly PENTATONIC_CHORD_TONES_MAJOR: Record<string, string[]> = {
    "1_": ["1", "3", "5", "1^"],
    "2_": ["2", "5", "6", "2^"],
    "3_": ["3", "5", "1^", "3^"],
    "5_": ["5", "2^", "5^", "1^"],
    "6_": ["6", "1^", "3^", "6^"],
    "1__": ["1_", "3_", "5_", "1"],
    "2__": ["2_", "5_", "6_", "2"],
    "3__": ["3_", "5_", "1", "3"],
    "5__": ["5_", "2", "5", "1"],
    "6__": ["6_", "1", "3", "6"],
  };

  public static readonly PENTATONIC_CHORD_TONES_MINOR: Record<string, string[]> = {
    "6__": ["6_", "1", "3", "6"],
    "1_": ["1", "3", "5", "1^"],
    "2_": ["2", "5", "6", "2^"],
    "3_": ["3", "5", "1^", "3^"],
    "5_": ["5", "1^", "3^", "5^"],
    "1__": ["1_", "3_", "5_", "1"],
    "2__": ["2_", "5_", "6_", "2"],
    "3__": ["3_", "5_", "1", "3"],
    "5__": ["5_", "1", "3", "5"],
  };

  public static readonly DIATONIC_MAJOR_SCALE = [
    "1_", "2_", "3_", "4_", "5_", "6_", "7_",
    "1", "2", "3", "4", "5", "6", "7",
    "1^", "2^", "3^", "4^", "5^", "6^", "7^",
    "1^^"
  ];

  public static readonly DIATONIC_MINOR_SCALE = [
    "6__", "7__", "1_", "2_", "3_", "4_", "5_",
    "6_", "7_", "1", "2", "3", "4", "5",
    "6", "7", "1^", "2^", "3^", "4^", "5^",
    "6^"
  ];

  public static readonly TONAL_BASS_PATTERNS = {
    major: [
      ["1_", "5__", "6__", "3__", "4__", "1__", "4__", "5__"],
      ["1_", "4__", "5__", "1_"],
      ["1_", "6__", "4__", "5__"],
      ["4__", "5__", "3__", "6__"],
    ],
    minor: [
      ["6__", "3__", "4__", "1_", "2__", "6__", "2__", "3__"],
      ["6__", "5__", "4__", "3__"],
      ["6__", "2__", "3__", "6__"],
    ]
  };

  public static readonly TONAL_CHORD_TONES_MAJOR: Record<string, string[]> = {
    "1_": ["1", "3", "5", "1^"],
    "1__": ["1_", "3_", "5_", "1"],
    "5_": ["5", "7", "2^", "5^"],
    "5__": ["5_", "7_", "2", "5"],
    "6_": ["6", "1^", "3^", "6^"],
    "6__": ["6_", "1", "3", "6"],
    "3_": ["3", "5", "7", "3^"],
    "3__": ["3_", "5_", "7_", "3"],
    "4_": ["4", "6", "1^", "4^"],
    "4__": ["4_", "6_", "1", "4"],
    "2_": ["2", "4", "6", "2^"],
    "2__": ["2_", "4_", "6_", "2"],
  };

  public static readonly TONAL_CHORD_TONES_MINOR: Record<string, string[]> = {
    "6__": ["6_", "1", "3", "6"],
    "6_": ["6", "1^", "3^", "6^"],
    "3__": ["3_", "5_", "7_", "3"],
    "3_": ["3", "5", "7", "3^"],
    "4__": ["4_", "6_", "1", "4"],
    "4_": ["4", "6", "1^", "4^"],
    "1_": ["1", "3", "5", "1^"],
    "1__": ["1_", "3_", "5_", "1"],
    "2__": ["2_", "4_", "6_", "2"],
    "2_": ["2", "4", "6", "2^"],
    "5__": ["5_", "7_", "2", "5"],
    "5_": ["5", "7", "2^", "5^"],
  };

  private title: string;
  private tempo: number;
  private key: string;
  private timeSig: string;
  private numVoices: number;
  private offsetBars: number;
  private numVariations: number;
  private canonType: "standard" | "crab" | "mirror" | "table";
  private mode: "tonal" | "pentatonic";
  private useMacro: boolean;
  private isMinor: boolean;
  private scale: string[];
  private voiceInstruments: string[];
  private bassInstrument: string;
  private rng: () => number;
  private arpeggioProbability: number;

  constructor(options: CanonGeneratorOptions = {}) {
    this.validateDimension("numVoices", options.numVoices ?? 3, 1, TMDCanonGenerator.MAX_VOICES);
    this.validateDimension("numVariations", options.numVariations ?? 3, 1, TMDCanonGenerator.MAX_VARIATIONS);
    this.validateDimension("offsetBars", options.offsetBars ?? 2, 0, TMDCanonGenerator.MAX_OFFSET_BARS);

    this.title = options.title ?? "Canon";
    this.tempo = options.tempo ?? 64;
    this.key = options.key ?? "C";
    this.timeSig = options.timeSig ?? "4/4";
    this.numVoices = options.numVoices ?? 3;
    this.offsetBars = options.offsetBars ?? 2;
    this.numVariations = options.numVariations ?? 3;
    this.canonType = options.canonType ?? "standard";
    this.mode = options.mode ?? "tonal";
    this.useMacro = options.useMacro ?? true;
    this.arpeggioProbability = Math.max(0, Math.min(1, options.arpeggioProbability ?? 0.25));

    if (options.seed !== undefined) {
      this.rng = this.createSeededRng(options.seed);
    } else {
      this.rng = Math.random;
    }

    this.isMinor = this.key.includes("m");
    if (this.mode === "tonal") {
      this.scale = this.isMinor
        ? TMDCanonGenerator.DIATONIC_MINOR_SCALE
        : TMDCanonGenerator.DIATONIC_MAJOR_SCALE;
    } else {
      this.scale = this.isMinor
        ? TMDCanonGenerator.MINOR_PENTATONIC_SCALE
        : TMDCanonGenerator.MAJOR_PENTATONIC_SCALE;
    }

    this.voiceInstruments = Array.from({ length: this.numVoices }, (_, i) => `Violin${i + 1}`);
    this.bassInstrument = "Cello";
  }

  private validateDimension(name: string, value: number, minimum: number, maximum: number): void {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${name} must be finite`);
    }
    if (!Number.isInteger(value) || value < minimum) {
      const kind = minimum === 0 ? "a non-negative integer" : "a positive integer";
      throw new RangeError(`${name} must be ${kind}`);
    }
    if (value > maximum) {
      throw new RangeError(`${name} must be at most ${maximum}`);
    }
  }

  private createSeededRng(seed: number): () => number {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  private randomChoice<T>(arr: T[]): T {
    const idx = Math.floor(this.rng() * arr.length);
    return arr[idx];
  }

  public generateHeader(): string {
    let modeDesc = "";
    if (this.mode === "tonal") {
      modeDesc = this.isMinor
        ? "自然小調 (Diatonic Minor)"
        : "自然大調 (Diatonic Major / Functional Tonal)";
    } else {
      modeDesc = this.isMinor
        ? "羽調式 (Minor Pentatonic)"
        : "宮調式 (Major Pentatonic)";
    }

    const typeDescMap: Record<string, string> = {
      standard: "Standard Polyphonic Canon (輪唱卡農)",
      crab: "Crab Canon / Cancrizans (螃蟹卡農 / 逆行卡農)",
      mirror: "Mirror Canon / Inversion (倒影卡農 / 鏡像卡農)",
      table: "Table Canon / Retrograde Inversion (桌子卡農 / 雙倒影逆行卡農)",
    };
    const typeDesc = typeDescMap[this.canonType] || "Standard Polyphonic Canon";

    const capMode = this.mode.charAt(0).toUpperCase() + this.mode.slice(1);
    const algoSummary = this.mode === "tonal"
      ? "Pachelbel Romanesca Ground Bass with Stepwise Voice Leading & Strong-beat Chord Tone Constraints"
      : "Anhemitonic Pentatonic Ground Bass with Constant Concord & Voice Leading Heuristics";

    return `::SCORE::
** ${this.title} **
~ "composer: CanonGenerator (${capMode} Algorithmic Engine)"
~ "style: ${modeDesc}, Form: ${typeDesc}"
~ "algorithm: ${algoSummary}"
!= ${this.tempo}
?= ${this.key}
<${this.timeSig}>
`;
  }

  public selectOrGenBass(): string[] {
    const category = this.isMinor ? "minor" : "major";
    const patterns = this.mode === "tonal"
      ? TMDCanonGenerator.TONAL_BASS_PATTERNS[category]
      : TMDCanonGenerator.PENTATONIC_BASS_PATTERNS[category];
    return [...this.randomChoice(patterns)];
  }

  public formatBassMacro(bassNotes: string[]): { code: string; totalMeasures: number } {
    const modeLabel = this.mode === "tonal" ? "Tonal Functional" : "Pentatonic";
    const lines = [
      `/* ${modeLabel} Ground Bass Prototype (Basso Ostinato - Authentic Half-Note Pairs) */`,
      "Bass {",
      "    <4*>",
    ];

    // Authentic Pachelbel rhythm: 2 half-notes per 4/4 measure (| n1 - n2 - |)
    const barChunks: string[] = [];
    for (let i = 0; i < bassNotes.length; i += 2) {
      if (i + 1 < bassNotes.length) {
        barChunks.push(`${bassNotes[i]} - ${bassNotes[i + 1]} -`);
      } else {
        barChunks.push(`${bassNotes[i]} - - -`);
      }
    }

    const totalMeasures = barChunks.length;
    for (let i = 0; i < barChunks.length; i += 2) {
      lines.push(`    | ${barChunks.slice(i, i + 2).join(" | ")} |`);
    }
    lines.push("}\n");
    return { code: lines.join("\n"), totalMeasures };
  }

  private getChordTones(bassDegree: string): string[] {
    let mapping: Record<string, string[]>;
    if (this.mode === "tonal") {
      mapping = this.isMinor
        ? TMDCanonGenerator.TONAL_CHORD_TONES_MINOR
        : TMDCanonGenerator.TONAL_CHORD_TONES_MAJOR;
    } else {
      mapping = this.isMinor
        ? TMDCanonGenerator.PENTATONIC_CHORD_TONES_MINOR
        : TMDCanonGenerator.PENTATONIC_CHORD_TONES_MAJOR;
    }

    if (mapping[bassDegree]) {
      return mapping[bassDegree];
    }
    return this.mode === "tonal"
      ? this.scale.slice(7, 12)
      : this.scale.slice(5, 10);
  }

  /**
   * Probability Engineering (RTP / Heuristics):
   * Selects melodic motion based on voice leading rules:
   * 1. High stepwise bias (~75% ±1 step).
   * 2. Gap-fill rule: If previous motion was a leap (|prevStep| >= 2),
   *    force/strongly bias next motion in the opposite direction.
   */
  public pickStepWithHeuristics(prevStep = 0, maxSteps = 2): number {
    // If previous was a leap (|prevStep| >= 2), perform Gap-Fill (counter-motion)
    if (Math.abs(prevStep) >= 2) {
      const counterDirection = prevStep > 0 ? -1 : 1;
      // 80% chance of stepwise counter-motion (-1 or +1 opposite to leap), 20% stay/step further
      if (this.rng() < 0.8) {
        return counterDirection;
      }
    }

    // Weighted selection for natural melodiousness:
    // ±1 (stepwise): 75%
    // 0 (repeated tone): 10%
    // ±2 (small leap/third): 15%
    const r = this.rng();
    if (maxSteps < 2 || r < 0.75) {
      return this.randomChoice([-1, 1]);
    } else if (r < 0.85) {
      return 0;
    } else {
      return this.randomChoice([-2, 2]);
    }
  }

  private stepInScale(currentTone: string, maxSteps = 2, prevStep = 0): string {
    let idx = this.scale.indexOf(currentTone);
    if (idx === -1) {
      idx = Math.floor(this.scale.length / 2);
    }
    const step = this.pickStepWithHeuristics(prevStep, maxSteps);
    const newIdx = Math.max(0, Math.min(this.scale.length - 1, idx + step));
    return this.scale[newIdx];
  }

  private generateArpeggioBar(tones1: string[], tones2: string[]): string {
    const makeHalf = (tones: string[]): string[] => {
      const start = Math.floor(this.rng() * tones.length);
      const direction = this.rng() < 0.5 ? 1 : -1;
      return Array.from({ length: 4 }, (_, index) => tones[(start + direction * index + tones.length * 2) % tones.length]);
    };
    return `${makeHalf(tones1).join(" ")}  ${makeHalf(tones2).join(" ")}`;
  }

  public generateThemeBars(bassNotes: string[], variationIdx: number): Array<[string, string[]]> {
    const style = variationIdx % 5;
    const measures: string[] = [];
    const useArpeggioTexture = style !== 2 && this.rng() < this.arpeggioProbability;

    // Authentic Pachelbel rhythm: Each measure covers 2 bass chords (beats 1-2 and beats 3-4)
    for (let b = 0; b < bassNotes.length; b += 2) {
      const b1 = bassNotes[b];
      const b2 = b + 1 < bassNotes.length ? bassNotes[b + 1] : b1;
      const tones1 = this.getChordTones(b1);
      const tones2 = this.getChordTones(b2);

      if (useArpeggioTexture) {
        measures.push(this.generateArpeggioBar(tones1, tones2));
        continue;
      }

      if (style === 0) {
        // Style 0: Lyrical Cantabile (<4*>) - 4 beats per measure:
        // Beats 1-2 over chord b1, beats 3-4 over chord b2
        const t1 = this.randomChoice(tones1);
        const t2 = this.stepInScale(t1, 1, 0);
        const t3 = this.randomChoice(tones2);
        const t4 = this.stepInScale(t3, 1, 0);

        const patternChoice = this.randomChoice(["two_halves", "half_quarters", "quarters"]);
        if (patternChoice === "two_halves") {
          measures.push(`${t1} - ${t3} -`);
        } else if (patternChoice === "half_quarters") {
          measures.push(`${t1} - ${t3} ${t4}`);
        } else {
          measures.push(`${t1} ${t2} ${t3} ${t4}`);
        }
      } else if (style === 1) {
        // Style 1: Baroque Lilt (<8*>) - 8 sub-beats: 4 over b1, 4 over b2
        const t1 = this.randomChoice(tones1);
        const t1_step = this.stepInScale(t1, 1, 0);
        const t1_step2 = this.stepInScale(t1_step, 1, 1);
        const t2 = this.randomChoice(tones2);
        const t2_step = this.stepInScale(t2, 1, 0);
        const t2_step2 = this.stepInScale(t2_step, 1, 1);

        const patternChoice = this.randomChoice([1, 2, 3]);
        if (patternChoice === 1) {
          measures.push(`${t1} - ${t1_step} ${t1_step2}  ${t2} - ${t2_step} ${t2_step2}`);
        } else if (patternChoice === 2) {
          measures.push(`${t1} ${t1_step} ${t1_step2} ${t1_step}  ${t2} ${t2_step} ${t2_step2} ${t2_step}`);
        } else {
          measures.push(`${t1} - - ${t1_step}  ${t2} - - ${t2_step}`);
        }
      } else if (style === 2) {
        // Style 2: Virtuosic Flourish (<16*>) - 16 sub-beats: 8 over b1, 8 over b2
        let curr1 = this.randomChoice(tones1);
        const g1: string[] = [curr1];
        let prevStep = 0;
        for (let i = 0; i < 7; i++) {
          const next = this.stepInScale(curr1, 1, prevStep);
          prevStep = this.scale.indexOf(next) - this.scale.indexOf(curr1);
          curr1 = next;
          g1.push(curr1);
        }

        let curr2 = this.randomChoice(tones2);
        const g2: string[] = [curr2];
        prevStep = 0;
        for (let i = 0; i < 7; i++) {
          const next = this.stepInScale(curr2, 1, prevStep);
          prevStep = this.scale.indexOf(next) - this.scale.indexOf(curr2);
          curr2 = next;
          g2.push(curr2);
        }

        measures.push(`${g1.slice(0, 4).join(" ")}  ${g1.slice(4).join(" ")}  ${g2.slice(0, 4).join(" ")}  ${g2.slice(4).join(" ")}`);
      } else if (style === 3) {
        // Style 3: Staccato Dialogue (<8*>) - Rhythmic syncopation & rests
        const t1 = this.randomChoice(tones1);
        const t1_next = this.stepInScale(t1, 1, 0);
        const t2 = this.randomChoice(tones2);
        const t2_next = this.stepInScale(t2, 1, 0);

        const choice = this.randomChoice(["rest_leaps", "staccato_steps"]);
        if (choice === "rest_leaps") {
          measures.push(`${t1} 0 ${t1_next} 0  ${t2} 0 ${t2_next} 0`);
        } else {
          measures.push(`0 ${t1}  ${t1_next} -  0 ${t2}  ${t2_next} -`);
        }
      } else {
        // Style 4: Pastoral Sicilienne (<8*>) - Dotted lilting rhythm
        const t1 = this.randomChoice(tones1);
        const t1_next = this.stepInScale(t1, 1, 0);
        const t2 = this.randomChoice(tones2);
        const t2_next = this.stepInScale(t2, 1, 0);

        measures.push(`${t1} - - ${t1_next}  ${t2} - - ${t2_next}`);
      }
    }

    const grid = useArpeggioTexture ? "<8*>" : style === 2 ? "<16*>" : style === 0 ? "<4*>" : "<8*>";
    return [[grid, measures]];
  }

  public generateThemeSectionMacro(bassNotes: string[], variationIdx: number): string {
    const varName = variationIdx === 0 ? "Theme" : `Var${variationIdx}`;
    const modeLabel = this.mode === "tonal" ? "Tonal" : "Pentatonic";
    const lines = [
      `/* ${modeLabel} Variation ${variationIdx} (${varName}) */`,
      `${varName} {`,
    ];
    const subsections = this.generateThemeBars(bassNotes, variationIdx);
    for (const [grid, bars] of subsections) {
      lines.push(`    ${grid}`);
      for (const bar of bars) {
        lines.push(`    | ${bar} |`);
      }
    }
    lines.push("}\n");
    return lines.join("\n");
  }

  public generateConcreteSections(bassNotes: string[]): string {
    // Format intro bars as half-note pairs (| n1 - n2 - |)
    const introBarChunks: string[] = [];
    for (let i = 0; i < bassNotes.length && introBarChunks.length < this.offsetBars; i += 2) {
      if (i + 1 < bassNotes.length) {
        introBarChunks.push(`${bassNotes[i]} - ${bassNotes[i + 1]} -`);
      } else {
        introBarChunks.push(`${bassNotes[i]} - - -`);
      }
    }
    const introBars = introBarChunks.join(" | ") + " |";
    const modeLabel = this.mode === "tonal" ? "Tonal" : "Pentatonic";
    const outroLines = [
      `/* Concrete ${modeLabel} Intro & Outro */`,
      `intro:${this.bassInstrument}@|0|{`,
      "    <4*>",
      `    | ${introBars}`,
      "}\n",
    ];

    const tonicBass = this.isMinor ? "6__" : "1_";
    const tonicHigh = this.isMinor ? "6" : "1^";
    const tonicMid = this.isMinor ? "1" : "5";
    const tonicThird = "3";

    outroLines.push(`outro:${this.bassInstrument}@|0|{ <1*> ${tonicBass}--- | }`);
    const cadenceNotes = [tonicHigh, tonicMid, tonicThird];
    for (let i = 0; i < this.voiceInstruments.length; i++) {
      const voice = this.voiceInstruments[i];
      const note = cadenceNotes[i % cadenceNotes.length];
      outroLines.push(`outro:${voice}@|0|{ <1*> ${note}--- | }`);
    }
    outroLines.push("");
    return outroLines.join("\n");
  }

  public generatePlaybackFlowMacro(varNames: string[], bassMeasures: number): string {
    const themeSequence = varNames.length > 1 ? `(${varNames.join(" ")})` : varNames[0];
    const voiceSequence = `(${this.voiceInstruments.join(" ")})`;
    const totalThemeBars = varNames.length * bassMeasures;

    if (this.canonType === "crab") {
      const loopCount = varNames.length;
      const v1 = this.voiceInstruments[0];
      const v2 = this.voiceInstruments.length > 1 ? this.voiceInstruments[1] : "Violin2";
      return [
        "/* S-Expression Playback Flow: Crab Canon (Cancrizans / Retrograde) */",
        "-> intro",
        "-> (layer",
        `     (play ${themeSequence} ${v1})`,
        `     (play (reverse ${themeSequence}) ${v2})`,
        `     (loop Bass ${this.bassInstrument} ${loopCount}))`,
        "-> outro",
        "->#\n",
      ].join("\n");
    } else if (this.canonType === "mirror") {
      const loopCount = varNames.length;
      const v1 = this.voiceInstruments[0];
      const v2 = this.voiceInstruments.length > 1 ? this.voiceInstruments[1] : "Violin2";
      return [
        "/* S-Expression Playback Flow: Mirror Canon (Inversion) */",
        "-> intro",
        "-> (layer",
        `     (play ${themeSequence} ${v1})`,
        `     (play (flip ${themeSequence}) ${v2})`,
        `     (loop Bass ${this.bassInstrument} ${loopCount}))`,
        "-> outro",
        "->#\n",
      ].join("\n");
    } else if (this.canonType === "table") {
      const loopCount = varNames.length;
      const v1 = this.voiceInstruments[0];
      const v2 = this.voiceInstruments.length > 1 ? this.voiceInstruments[1] : "Violin2";
      return [
        "/* S-Expression Playback Flow: Table Canon (Tafelkanon / Retrograde Inversion) */",
        "-> intro",
        "-> (layer",
        `     (play ${themeSequence} ${v1})`,
        `     (play (flip (reverse ${themeSequence})) ${v2})`,
        `     (loop Bass ${this.bassInstrument} ${loopCount}))`,
        "-> outro",
        "->#\n",
      ].join("\n");
    } else {
      const totalCanonBars = totalThemeBars + (this.numVoices - 1) * this.offsetBars;
      const loopCount = Math.floor((totalCanonBars + bassMeasures - 1) / bassMeasures);
      return [
        "/* S-Expression Playback Flow: Standard Staggered Polyphonic Canon */",
        "-> intro",
        "-> (layer",
        `     (canon ${themeSequence} ${voiceSequence} ${this.offsetBars})`,
        `     (loop Bass ${this.bassInstrument} ${loopCount}))`,
        "-> outro",
        "->#\n",
      ].join("\n");
    }
  }

  public generateUnrolledScore(bassNotes: string[]): string {
    const parts = [this.generateHeader()];
    const varData: Array<Array<[string, string[]]>> = [];
    for (let v = 0; v < this.numVariations; v++) {
      varData.push(this.generateThemeBars(bassNotes, v));
    }

    // Authentic Pachelbel rhythm: 2 half-notes per 4/4 measure
    const halfNoteChunks: string[] = [];
    for (let i = 0; i < bassNotes.length; i += 2) {
      if (i + 1 < bassNotes.length) {
        halfNoteChunks.push(`${bassNotes[i]} - ${bassNotes[i + 1]} -`);
      } else {
        halfNoteChunks.push(`${bassNotes[i]} - - -`);
      }
    }

    const bassMeasures = halfNoteChunks.length;
    const totalThemeBars = this.numVariations * bassMeasures;
    const totalCanonBars = totalThemeBars + (this.numVoices - 1) * this.offsetBars;
    const loopCount = Math.floor((totalCanonBars + bassMeasures - 1) / bassMeasures);
    const sectionTotalMeasures = loopCount * bassMeasures;

    // Intro
    parts.push(this.generateConcreteSections(bassNotes));

    // Canon section: Cello Ground Bass
    const celloLines = [
      `canon:${this.bassInstrument}@|0|{`,
      "    <4*>",
    ];
    for (let l = 0; l < loopCount; l++) {
      for (let i = 0; i < halfNoteChunks.length; i += 2) {
        celloLines.push(`    | ${halfNoteChunks.slice(i, i + 2).join(" | ")} |`);
      }
    }
    celloLines.push("}\n");
    parts.push(celloLines.join("\n"));

    // Canon voices
    for (let vIdx = 0; vIdx < this.voiceInstruments.length; vIdx++) {
      const voice = this.voiceInstruments[vIdx];
      const offset = vIdx * this.offsetBars;
      const offsetText = offset === 0 ? "0" : `+${offset}`;
      const voiceLines = [`canon:${voice}@|${offsetText}|{`];
      for (let vNum = 0; vNum < varData.length; vNum++) {
        voiceLines.push(`    /* Variation ${vNum} */`);
        for (const [grid, bars] of varData[vNum]) {
          voiceLines.push(`    ${grid}`);
          for (const bar of bars) {
            voiceLines.push(`    | ${bar} |`);
          }
        }
      }

      const playedMeasures = offset + totalThemeBars;
      const remainingMeasures = sectionTotalMeasures - playedMeasures;
      if (remainingMeasures > 0) {
        voiceLines.push("    <4*>");
        for (let r = 0; r < remainingMeasures; r++) {
          voiceLines.push("    | 0 - - - |");
        }
      }

      voiceLines.push("}\n");
      parts.push(voiceLines.join("\n"));
    }

    parts.push("-> intro -> canon -> outro ->#\n");
    return parts.join("\n");
  }

  public generate(): string {
    const bassNotes = this.selectOrGenBass();
    if (!this.useMacro) {
      return this.generateUnrolledScore(bassNotes);
    }

    const parts = [this.generateHeader()];
    const { code: bassCode, totalMeasures: bassMeasures } = this.formatBassMacro(bassNotes);
    parts.push(bassCode);

    const varNames: string[] = [];
    for (let v = 0; v < this.numVariations; v++) {
      const name = v === 0 ? "Theme" : `Var${v}`;
      varNames.push(name);
      parts.push(this.generateThemeSectionMacro(bassNotes, v));
    }

    parts.push(this.generateConcreteSections(bassNotes));
    parts.push(this.generatePlaybackFlowMacro(varNames, bassMeasures));

    return parts.join("\n");
  }
}
