import {
  chordQualityIntervals,
  ChordSymbol,
  Entry,
  MeasureEvent,
  NotationDuration,
  Note,
  PitchMapping,
  PlaybackDirectiveEvent,
  Sheet,
  SheetInstrumentHelper,
  TMDMacroEvaluator,
  TMDMeasureRenderer,
} from "../core";

export class TMDLilyPondGenerator {
  public static generateLilyPond(rawSheet: Sheet): string {
    const sheet = TMDMacroEvaluator.expand(rawSheet);
    const composer = sheet.metadata["composer"] || "TMD";
    let ly = `\\version "2.24.0"\n\n`;
    ly += `\\header {\n`;
    ly += `  title = "${TMDLilyPondGenerator.escapeLilyPond(sheet.name || "Untitled")}"\n`;
    ly += `  composer = "${TMDLilyPondGenerator.escapeLilyPond(composer)}"\n`;
    ly += `  tagline = "Engraved by Tmd-TS LilyPond Exporter"\n`;
    ly += `}\n\n`;

    ly += `\\paper {\n  indent = 1.5\\cm\n  short-indent = 0.5\\cm\n}\n\n`;
    ly += `global = {\n`;
    ly += `  \\time ${sheet.beat.count}/${sheet.beat.noteValue}\n`;
    ly += `  ${TMDLilyPondGenerator.resolveTempo(sheet.beat, sheet.speed > 0 ? sheet.speed : 120)}\n`;
    ly += `  \\key ${TMDLilyPondGenerator.lilyPondKey(sheet.declaredKey || sheet.keySignature.toString())}\n`;
    ly += `}\n\n`;

    const instruments = SheetInstrumentHelper.distinctInstruments(sheet, false);

    const identifierMap = new Map<string, string>();
    const usedNames = new Set<string>();

    instruments.forEach((inst, idx) => {
      let name = TMDLilyPondGenerator.sanitizeIdentifier(inst, idx);
      if (usedNames.has(name)) {
        const numberWords = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
        const suffix = idx < 10 ? numberWords[idx] : `N${idx}`;
        name += suffix;
      }
      usedNames.add(name);
      identifierMap.set(inst, name);
    });

    instruments.forEach((inst) => {
      const varName = identifierMap.get(inst) || "Track";
      const isDrum = TMDLilyPondGenerator.paragraphsContainPercussion(sheet.entries, inst);
      ly += `${varName} = ${isDrum ? "\\drummode " : ""}{\n  \\global\n`;
      ly += TMDLilyPondGenerator.generateTrackMusic(inst, sheet, isDrum);
      ly += `}\n\n`;
    });

    ly += `\\score {\n  <<\n`;
    instruments.forEach((inst) => {
      const varName = identifierMap.get(inst) || "Track";
      const isDrum = TMDLilyPondGenerator.paragraphsContainPercussion(sheet.entries, inst);
      const staffType = isDrum ? "DrumStaff" : "Staff";
      ly += `    \\new ${staffType} = "${TMDLilyPondGenerator.escapeLilyPond(inst)}" \\with {\n`;
      ly += `      instrumentName = "${TMDLilyPondGenerator.escapeLilyPond(inst)}"\n`;
      ly += `      shortInstrumentName = "${TMDLilyPondGenerator.escapeLilyPond(inst.slice(0, 3))}"\n`;
      ly += `    } {\n      \\${varName}\n    }\n\n`;
    });
    ly += `  >>\n  \\layout { }\n  \\midi { }\n}\n`;

    return ly;
  }

  private static generateTrackMusic(instrument: string, sheet: Sheet, percussion: boolean): string {
    const measures = TMDMeasureRenderer.renderMeasures(sheet, instrument);
    let result = "  ";

    for (const measure of measures) {
      for (const directive of measure.directives) {
        result += TMDLilyPondGenerator.formatDirective(directive);
      }
      for (const event of measure.events) {
        result += TMDLilyPondGenerator.formatMeasureEvent(event, percussion);
        result += " ";
      }
      result += "|\n  ";
    }

    return result.trim() + "\n";
  }

  public static resolveTempo(beat: { count: number; noteValue: number }, quarterBPM: number): string {
    // Compound meter: denominator is 8 and numerator is a multiple of 3 (> 3, e.g. 6/8, 9/8, 12/8)
    if (beat.noteValue === 8 && beat.count > 3 && beat.count % 3 === 0) {
      // Beat unit is a dotted-quarter note (4.)
      const bpm = Math.round(quarterBPM / 1.5);
      return `\\tempo 4. = ${bpm}`;
    }
    switch (beat.noteValue) {
      case 2: {
        const bpm = Math.round(quarterBPM / 2.0);
        return `\\tempo 2 = ${bpm}`;
      }
      case 8: {
        const bpm = Math.round(quarterBPM * 2.0);
        return `\\tempo 8 = ${bpm}`;
      }
      case 16: {
        const bpm = Math.round(quarterBPM * 4.0);
        return `\\tempo 16 = ${bpm}`;
      }
      default: {
        const bpm = Math.round(quarterBPM);
        return `\\tempo 4 = ${bpm}`;
      }
    }
  }

  private static formatDirective(directive: PlaybackDirectiveEvent): string {
    const k = directive.kind;
    switch (k.type) {
      case "tempo":
      case "relativeTempo": {
        const cmd = TMDLilyPondGenerator.resolveTempo(directive.state.timeSignature, directive.state.tempo);
        return `${cmd} `;
      }
      case "timeSignature":
        return `\\time ${k.beat.count}/${k.beat.noteValue} `;
      case "absoluteKey":
        return `\\key ${TMDLilyPondGenerator.lilyPondKey(k.key)} `;
      case "explicitKey":
        return `\\key ${TMDLilyPondGenerator.lilyPondKey(k.key)} `;
      case "dynamics":
        return `\\${k.mark} `;
      case "relativeKey": {
        const semitone = ((directive.state.keyOffset % 12) + 12) % 12;
        const keyTonic = PitchMapping.lilyPondNames[semitone];
        return `\\key ${keyTonic} \\major `;
      }
      case "fixedPitch":
        return `\\key c \\major `;
    }
  }

  private static formatMeasureEvent(event: MeasureEvent, percussion: boolean): string {
    const decomposed = NotationDuration.decompose(event.duration);
    switch (event.content.type) {
      case "note": {
        const pitch = TMDLilyPondGenerator.noteToLilyPondPitch(event.content.note, event.state.keyOffset);
        const parts: string[] = [];
        decomposed.forEach((d, idx) => {
          const durStr = `${d.baseDenominator}${d.isDotted ? "." : ""}`;
          const isLast = idx === decomposed.length - 1;
          const tie = isLast ? (event.tieStart ? "~" : "") : "~";
          parts.push(`${pitch}${durStr}${tie}`);
        });
        return parts.join(" ");
      }
      case "chord": {
        const pitches = TMDLilyPondGenerator.chordToLilyPondPitches(event.content.chord, event.state.keyOffset);
        const chordBody = `<${pitches.join(" ")}>`;
        const parts: string[] = [];
        decomposed.forEach((d, idx) => {
          const durStr = `${d.baseDenominator}${d.isDotted ? "." : ""}`;
          const isLast = idx === decomposed.length - 1;
          const tie = isLast ? (event.tieStart ? "~" : "") : "~";
          parts.push(`${chordBody}${durStr}${tie}`);
        });
        return parts.join(" ");
      }
      case "rest":
        return decomposed.map((d) => `r${d.baseDenominator}${d.isDotted ? "." : ""}`).join(" ");
      case "percussion": {
        const pattern = event.content.pattern;
        const mapping: Record<string, string> = {
          X: "hh", x: "hh",
          O: "hho", o: "hho",
          T: "toml", t: "toml",
          S: "sn", s: "sn",
          D: "bd", d: "bd",
          B: "bd", b: "bd",
          C: "cymc", c: "cymc"
        };
        const names = Array.from(pattern).map((c) => mapping[c]).filter(Boolean);
        if (names.length === 0) {
          return decomposed.map((d) => `r${d.baseDenominator}${d.isDotted ? "." : ""}`).join(" ");
        }
        return decomposed
          .map((d) => {
            const durStr = `${d.baseDenominator}${d.isDotted ? "." : ""}`;
            return names.map((n) => `${n}${durStr}`).join(" ");
          })
          .join(" ");
      }
    }
  }

  private static noteToLilyPondPitch(note: Note, keyOffset: number): string {
    let midiPitch = 60 + keyOffset + (note.degree === 1 ? 0 : [0, 2, 4, 5, 7, 9, 11][note.degree - 1]);
    if (note.accidental === "sharp") midiPitch += 1;
    else if (note.accidental === "flat") midiPitch -= 1;
    midiPitch += note.octave * 12;

    return TMDLilyPondGenerator.midiPitchToLilyPond(midiPitch);
  }

  private static chordToLilyPondPitches(chord: ChordSymbol, keyOffset: number): string[] {
    let root = 0;
    if (chord.root.isScaleDegree) {
      root = 60 + keyOffset + (chord.root.degree === 1 ? 0 : [0, 2, 4, 5, 7, 9, 11][chord.root.degree - 1]);
      if (chord.root.accidental === "sharp") root += 1;
      else if (chord.root.accidental === "flat") root -= 1;
      root += chord.root.octave * 12;
    } else {
      root = 48 + chord.root.semitoneOffset;
    }
    const intervals = chordQualityIntervals(chord.quality);
    const pitches: number[] = intervals.map((i) => root + i);
    if (chord.bass) {
      let bassPitch: number;
      if (chord.bass.isScaleDegree) {
        bassPitch = 36 + keyOffset + (chord.bass.degree === 1 ? 0 : [0, 2, 4, 5, 7, 9, 11][chord.bass.degree - 1]);
        if (chord.bass.accidental === "sharp") bassPitch += 1;
        else if (chord.bass.accidental === "flat") bassPitch -= 1;
        bassPitch += chord.bass.octave * 12;
      } else {
        bassPitch = 36 + chord.bass.semitoneOffset;
      }
      if (!pitches.includes(bassPitch)) {
        pitches.unshift(bassPitch);
      }
    }
    return pitches.map((p) => TMDLilyPondGenerator.midiPitchToLilyPond(p));
  }

  private static midiPitchToLilyPond(pitch: number): string {
    const semitone = ((pitch % 12) + 12) % 12;
    const octave = Math.floor(pitch / 12) - 1;

    let name = PitchMapping.lilyPondNames[semitone];
    if (octave > 3) {
      name += "'".repeat(octave - 3);
    } else if (octave < 3) {
      name += ",".repeat(3 - octave);
    }
    return name;
  }

  private static lilyPondKey(key: string): string {
    const trimmed = key.trim();
    if (!trimmed.length) return "c \\major";
    let pitch = trimmed[0].toLowerCase();
    if (trimmed.includes("'") || trimmed.includes("#")) {
      pitch += "is";
    } else if (trimmed.includes(",") || trimmed.includes("b")) {
      pitch += "es";
    }
    const mode = /(?:m|min|minor)$/i.test(trimmed) ? "minor" : "major";
    return `${pitch} \\${mode}`;
  }

  private static sanitizeIdentifier(str: string, idx: number): string {
    const numberWords = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    let converted = "";
    for (const ch of str) {
      if (/[a-zA-Z]/.test(ch)) {
        converted += ch;
      } else if (/[0-9]/.test(ch)) {
        const digit = parseInt(ch, 10);
        converted += numberWords[digit] || "";
      }
    }
    return converted.length > 0 ? converted : `Track${idx + 1}`;
  }

  private static escapeLilyPond(str: string): string {
    return str.replace(/"/g, '\\"');
  }

  private static paragraphsContainPercussion(paragraphs: Entry[], instrument: string): boolean {
    return paragraphs
      .filter((p) => p.assignment?.toLocaleLowerCase() === instrument.toLocaleLowerCase())
      .some((p) =>
        p.sections.some((s) =>
          s.unitGroups.some((g) => g.units.some((u) => u.type === "percussion"))
        )
      );
  }
}
