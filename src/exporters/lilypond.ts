import { SheetInstrumentHelper } from "../domain/index.js";
import { MeasureEvent, NotationDuration, PlaybackDirectiveEvent, TmdMacroEvaluator, TmdMeasureRenderer } from "../playback/index.js";
import { chordQualityIntervals, ChordSymbol, Entry, Note, PitchMapping, Sheet } from "../syntax/index.js";

export class TmdLilyPondGenerator {
  public static generateLilyPond(rawSheet: Sheet): string {
    const sheet = TmdMacroEvaluator.expandThrowing(rawSheet);
    const composer = sheet.metadata["composer"] || "TMD";
    let ly = `\\version "2.24.0"\n\n`;
    ly += `\\header {\n`;
    ly += `  title = "${TmdLilyPondGenerator.escapeLilyPond(sheet.name || "Untitled")}"\n`;
    ly += `  composer = "${TmdLilyPondGenerator.escapeLilyPond(composer)}"\n`;
    ly += `  tagline = "Engraved by Tmd-TS LilyPond Exporter"\n`;
    ly += `}\n\n`;

    ly += `\\paper {\n  indent = 1.5\\cm\n  short-indent = 0.5\\cm\n}\n\n`;
    ly += `global = {\n`;
    ly += `  \\time ${sheet.beat.count}/${sheet.beat.noteValue}\n`;
    ly += `  ${TmdLilyPondGenerator.resolveTempo(sheet.beat, sheet.speed > 0 ? sheet.speed : 120)}\n`;
    ly += `  \\key ${TmdLilyPondGenerator.lilyPondKey(sheet.declaredKey || sheet.keySignature.toString())}\n`;
    ly += `}\n\n`;

    const instruments = SheetInstrumentHelper.distinctInstruments(sheet, false);

    const identifierMap = new Map<string, string>();
    const usedNames = new Set<string>();

    instruments.forEach((inst, idx) => {
      let name = TmdLilyPondGenerator.sanitizeIdentifier(inst, idx);
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
      const isDrum = TmdLilyPondGenerator.paragraphsContainPercussion(sheet.entries, inst);
      ly += `${varName} = ${isDrum ? "\\drummode " : ""}{\n  \\global\n`;
      ly += TmdLilyPondGenerator.generateTrackMusic(inst, sheet, isDrum);
      ly += `}\n\n`;
    });

    ly += `\\score {\n  <<\n`;
    instruments.forEach((inst) => {
      const varName = identifierMap.get(inst) || "Track";
      const isDrum = TmdLilyPondGenerator.paragraphsContainPercussion(sheet.entries, inst);
      const staffType = isDrum ? "DrumStaff" : "Staff";
      ly += `    \\new ${staffType} = "${TmdLilyPondGenerator.escapeLilyPond(inst)}" \\with {\n`;
      ly += `      instrumentName = "${TmdLilyPondGenerator.escapeLilyPond(inst)}"\n`;
      ly += `      shortInstrumentName = "${TmdLilyPondGenerator.escapeLilyPond(inst.slice(0, 3))}"\n`;
      ly += `    } {\n      \\${varName}\n    }\n\n`;
    });
    ly += `  >>\n  \\layout { }\n  \\midi { }\n}\n`;

    return ly;
  }

  private static generateTrackMusic(instrument: string, sheet: Sheet, percussion: boolean): string {
    const measures = TmdMeasureRenderer.renderMeasures(sheet, instrument);
    let result = "  ";

    for (const measure of measures) {
      for (const directive of measure.directives) {
        result += TmdLilyPondGenerator.formatDirective(directive);
      }
      for (const event of measure.events) {
        result += TmdLilyPondGenerator.formatMeasureEvent(event, percussion);
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
        const cmd = TmdLilyPondGenerator.resolveTempo(directive.state.timeSignature, directive.state.tempo);
        return `${cmd} `;
      }
      case "timeSignature":
        return `\\time ${k.beat.count}/${k.beat.noteValue} `;
      case "absoluteKey":
        return `\\key ${TmdLilyPondGenerator.lilyPondKey(k.key)} `;
      case "explicitKey":
        return `\\key ${TmdLilyPondGenerator.lilyPondKey(k.key)} `;
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
        const pitch = TmdLilyPondGenerator.noteToLilyPondPitch(event.content.note, event.state.keyOffset);
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
        const pitches = TmdLilyPondGenerator.chordToLilyPondPitches(event.content.chord, event.state.keyOffset);
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
    const spelled = PitchMapping.spellNote(note, keyOffset);
    return PitchMapping.lilyPondPitch(spelled);
  }

  private static chordToLilyPondPitches(chord: ChordSymbol, keyOffset: number): string[] {
    return PitchMapping.spellChordVoicing(chord, keyOffset).map((spelled) =>
      PitchMapping.lilyPondPitch(spelled)
    );
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
