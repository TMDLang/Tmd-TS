export type PercussionStrokeKind =
  | "kick"
  | "snare"
  | "closedHiHat"
  | "openHiHat"
  | "tom"
  | "crashCymbal";

export interface UnpitchedDisplayPosition {
  stepIndex: number;
  step: string;
  octave: number;
}

/**
 * Canonical percussion stroke represented by TMD's single-character drum pattern vocabulary.
 *
 * Serves as the Single Source of Truth (SSOT) for percussion character resolution,
 * General MIDI Channel 10 pitches and velocities, unpitched staff display positions
 * (used by MusicXML and Music Braille), LilyPond `\drummode` tokens, and ABC percussion pitches.
 */
export class PercussionStroke {
  public static readonly kick = new PercussionStroke("kick");
  public static readonly snare = new PercussionStroke("snare");
  public static readonly closedHiHat = new PercussionStroke("closedHiHat");
  public static readonly openHiHat = new PercussionStroke("openHiHat");
  public static readonly tom = new PercussionStroke("tom");
  public static readonly crashCymbal = new PercussionStroke("crashCymbal");

  public static readonly allCases: readonly PercussionStroke[] = [
    PercussionStroke.kick,
    PercussionStroke.snare,
    PercussionStroke.closedHiHat,
    PercussionStroke.openHiHat,
    PercussionStroke.tom,
    PercussionStroke.crashCymbal,
  ];

  public readonly kind: PercussionStrokeKind;

  public constructor(kind: PercussionStrokeKind) {
    this.kind = kind;
  }

  /** Resolves a single TMD percussion pattern character into a typed `PercussionStroke`. */
  public static fromCharacter(character: string): PercussionStroke | undefined {
    switch (character) {
      case "D":
      case "d":
      case "B":
      case "b":
        return PercussionStroke.kick;
      case "S":
      case "s":
        return PercussionStroke.snare;
      case "X":
      case "x":
        return PercussionStroke.closedHiHat;
      case "O":
      case "o":
        return PercussionStroke.openHiHat;
      case "T":
      case "t":
        return PercussionStroke.tom;
      case "C":
      case "c":
        return PercussionStroke.crashCymbal;
      default:
        return undefined;
    }
  }

  /** Parses all valid percussion strokes from a TMD percussion pattern string. */
  public static parse(pattern: string): PercussionStroke[] {
    const strokes: PercussionStroke[] = [];
    for (const ch of pattern) {
      const stroke = PercussionStroke.fromCharacter(ch);
      if (stroke) {
        strokes.push(stroke);
      }
    }
    return strokes;
  }

  /** General MIDI Channel 10 note number. */
  public get midiPitch(): number {
    switch (this.kind) {
      case "kick":
        return 36;
      case "snare":
        return 38;
      case "closedHiHat":
        return 42;
      case "openHiHat":
        return 46;
      case "tom":
        return 45;
      case "crashCymbal":
        return 49;
    }
  }

  /** Default MIDI velocity for this percussion stroke. */
  public get defaultVelocity(): number {
    switch (this.kind) {
      case "kick":
        return 118;
      case "crashCymbal":
        return 115;
      case "snare":
        return 105;
      case "tom":
        return 100;
      case "openHiHat":
        return 90;
      case "closedHiHat":
        return 78;
    }
  }

  /**
   * Unpitched staff display position (`stepIndex`: 0=C..6=B, `step`: `"C"`..`"B"`, `octave`: scientific octave)
   * used by MusicXML `<unpitched>` and Music Braille unpitched percussion encoding.
   */
  public get unpitchedDisplayPosition(): UnpitchedDisplayPosition {
    switch (this.kind) {
      case "kick":
        return { stepIndex: 3, step: "F", octave: 4 };
      case "tom":
        return { stepIndex: 5, step: "A", octave: 4 };
      case "snare":
        return { stepIndex: 1, step: "D", octave: 5 };
      case "closedHiHat":
        return { stepIndex: 3, step: "F", octave: 5 };
      case "openHiHat":
        return { stepIndex: 4, step: "G", octave: 5 };
      case "crashCymbal":
        return { stepIndex: 5, step: "A", octave: 5 };
    }
  }

  /** LilyPond `\drummode` drum pitch token. */
  public get lilyPondDrumName(): string {
    switch (this.kind) {
      case "closedHiHat":
        return "hh";
      case "openHiHat":
        return "hho";
      case "tom":
        return "toml";
      case "snare":
        return "sn";
      case "kick":
        return "bd";
      case "crashCymbal":
        return "cymc";
    }
  }

  /** ABC notation percussion pitch string (for hi-hat, tom, and snare). */
  public get abcPitch(): string | undefined {
    switch (this.kind) {
      case "closedHiHat":
        return "^F";
      case "tom":
        return "A";
      case "snare":
        return "D";
      case "kick":
      case "openHiHat":
      case "crashCymbal":
        return undefined;
    }
  }
}
