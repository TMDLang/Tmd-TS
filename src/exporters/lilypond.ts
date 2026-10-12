import { SheetInstrumentHelper } from "../domain/index.js";
import { MeasureEvent, PlaybackDirectiveEvent, TmdMeasureRenderer } from "../playback/index.js";
import { ChordSymbol, metronomeTempoForBeat, Note, PercussionStroke, PitchMapping, Sheet } from "../syntax/index.js";

export class TmdLilyPondGenerator {
  public static generateLilyPond(rawSheet: Sheet): string {
    const { sheet, instruments } = SheetInstrumentHelper.preparedForExport(rawSheet);
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
      const isDrum = SheetInstrumentHelper.containsPercussionUnits(sheet, inst);
      ly += `${varName} = ${isDrum ? "\\drummode " : ""}{\n  \\global\n`;
      ly += TmdLilyPondGenerator.generateTrackMusic(inst, sheet, isDrum);
      ly += `}\n\n`;
    });

    ly += `\\score {\n  <<\n`;
    instruments.forEach((inst) => {
      const varName = identifierMap.get(inst) || "Track";
      const isDrum = SheetInstrumentHelper.containsPercussionUnits(sheet, inst);
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
      const pendingDirectives: Array<{ offset: number; directive: PlaybackDirectiveEvent }> = [];
      for (const directive of measure.directives) {
        if (directive.kind.type === "timeSignature") {
          result += TmdLilyPondGenerator.formatDirective(directive);
        } else {
          const relOffset = Math.max(0.0, directive.position - measure.startTime);
          pendingDirectives.push({ offset: relOffset, directive });
        }
      }
      const groups = TmdMeasureRenderer.groupSimultaneousEvents(measure.events);
      let dirIdx = 0;
      for (let gIdx = 0; gIdx < groups.length; gIdx++) {
        const group = groups[gIdx];
        const nextGroupStart =
          gIdx + 1 < groups.length
            ? (groups[gIdx + 1][0]?.startOffset ?? Number.POSITIVE_INFINITY)
            : Number.POSITIVE_INFINITY;
        let activeDynamic: string | undefined;
        while (dirIdx < pendingDirectives.length && pendingDirectives[dirIdx].offset < nextGroupStart - 1e-4) {
          const d = pendingDirectives[dirIdx].directive;
          if (d.kind.type === "dynamics") {
            activeDynamic = d.kind.mark;
          } else {
            result += TmdLilyPondGenerator.formatDirective(d);
          }
          dirIdx += 1;
        }
        result += TmdLilyPondGenerator.formatEventGroup(group, percussion, activeDynamic);
        result += " ";
      }
      while (dirIdx < pendingDirectives.length) {
        const d = pendingDirectives[dirIdx].directive;
        if (d.kind.type !== "dynamics") {
          result += TmdLilyPondGenerator.formatDirective(d);
        }
        dirIdx += 1;
      }
      result += "|\n  ";
    }

    return result.trim() + "\n";
  }

  public static resolveTempo(beat: { count: number; noteValue: number }, quarterBPM: number): string {
    const m = metronomeTempoForBeat(beat, quarterBPM);
    return `\\tempo ${m.lilyPondUnit} = ${m.perMinute}`;
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

  private static formatEventGroup(group: MeasureEvent[], percussion: boolean, dynamic?: string): string {
    if (group.length === 1) {
      return TmdLilyPondGenerator.formatMeasureEvent(group[0], percussion, dynamic);
    }

    const noteEvents = group.filter((ev) => ev.content.type === "note");
    if (noteEvents.length === group.length && noteEvents.length > 1) {
      const pitches = noteEvents.map((ev) => {
        const note = (ev.content as { type: "note"; note: Note }).note;
        return TmdLilyPondGenerator.noteToLilyPondPitch(note, ev.state.keyOffset);
      });
      const chordBody = `<${pitches.join(" ")}>`;
      const tieStart = group.some((ev) => ev.tieStart);
      return TmdLilyPondGenerator.formatLilyPondTokens(group[0].duration, chordBody, tieStart, dynamic);
    }

    return group
      .map((ev, idx) => TmdLilyPondGenerator.formatMeasureEvent(ev, percussion, idx === 0 ? dynamic : undefined))
      .join(" ");
  }

  private static formatMeasureEvent(event: MeasureEvent, percussion: boolean, dynamic?: string): string {
    switch (event.content.type) {
      case "note": {
        const pitch = TmdLilyPondGenerator.noteToLilyPondPitch(event.content.note, event.state.keyOffset);
        return TmdLilyPondGenerator.formatLilyPondTokens(event.duration, pitch, event.tieStart, dynamic);
      }
      case "chord": {
        const pitches = TmdLilyPondGenerator.chordToLilyPondPitches(event.content.chord, event.state.keyOffset);
        const chordBody = `<${pitches.join(" ")}>`;
        return TmdLilyPondGenerator.formatLilyPondTokens(event.duration, chordBody, event.tieStart, dynamic);
      }
      case "rest":
        return TmdLilyPondGenerator.formatLilyPondTokens(event.duration, "r", false, dynamic, false);
      case "percussion": {
        const names = PercussionStroke.parse(event.content.pattern).map((s) => s.lilyPondDrumName);
        if (names.length === 0) {
          return TmdLilyPondGenerator.formatLilyPondTokens(event.duration, "r", false, dynamic, false);
        }
        const strokeDuration = event.duration / names.length;
        return names
          .map((n, idx) =>
            TmdLilyPondGenerator.formatLilyPondTokens(
              strokeDuration,
              n,
              false,
              idx === 0 ? dynamic : undefined,
              false
            )
          )
          .join(" ");
      }
    }
  }

  private static formatLilyPondTokens(
    quarterNotes: number,
    body: string,
    tieStart: boolean,
    dynamic?: string,
    tieInternal = true
  ): string {
    const durations = TmdLilyPondGenerator.decomposeLilyPondDurations(quarterNotes);
    const dynSuffix = dynamic ? `\\${dynamic}` : "";
    return durations
      .map((durStr, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === durations.length - 1;
        const tie = isLast ? (tieStart ? "~" : "") : tieInternal ? "~" : "";
        return `${body}${durStr}${isFirst ? dynSuffix : ""}${tie}`;
      })
      .join(" ");
  }

  private static decomposeLilyPondDurations(quarterNotes: number): string[] {
    if (quarterNotes <= 0) return ["64"];
    const candidates: Array<{ den: number; dotted: boolean; q: number }> = [
      { den: 1, dotted: false, q: 4.0 },
      { den: 2, dotted: true, q: 3.0 },
      { den: 2, dotted: false, q: 2.0 },
      { den: 4, dotted: true, q: 1.5 },
      { den: 4, dotted: false, q: 1.0 },
      { den: 8, dotted: true, q: 0.75 },
      { den: 8, dotted: false, q: 0.5 },
      { den: 16, dotted: true, q: 0.375 },
      { den: 16, dotted: false, q: 0.25 },
      { den: 32, dotted: true, q: 0.1875 },
      { den: 32, dotted: false, q: 0.125 },
      { den: 64, dotted: false, q: 0.0625 },
      { den: 128, dotted: false, q: 0.03125 },
      { den: 256, dotted: false, q: 0.015625 },
      { den: 512, dotted: false, q: 0.0078125 },
      { den: 1024, dotted: false, q: 0.00390625 },
    ];
    const atoms: string[] = [];
    let remaining = quarterNotes;
    const epsilon = 1e-6;
    while (remaining >= 0.00390625 - epsilon) {
      let matched = false;
      for (const c of candidates) {
        if (remaining >= c.q - epsilon) {
          atoms.push(`${c.den}${c.dotted ? "." : ""}`);
          remaining -= c.q;
          matched = true;
          break;
        }
      }
      if (!matched) break;
    }
    if (atoms.length > 0 && Math.abs(remaining) <= 1e-5) {
      return atoms;
    }

    let qNum = 1;
    let qDen = 1;
    let foundRational = false;
    for (let den = 1; den <= 2048; den++) {
      const approxNum = Math.round(quarterNotes * den);
      if (approxNum > 0 && Math.abs(quarterNotes - approxNum / den) <= 1e-5) {
        const g = TmdLilyPondGenerator.gcd(approxNum, den);
        qNum = Math.trunc(approxNum / g);
        qDen = Math.trunc(den / g);
        foundRational = true;
        break;
      }
    }
    if (!foundRational) {
      const scaled = Math.max(1, Math.round(quarterNotes * 1920));
      const g = TmdLilyPondGenerator.gcd(scaled, 1920);
      qNum = Math.trunc(scaled / g);
      qDen = Math.trunc(1920 / g);
    }

    const powerDenominators = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
    let baseDen = 4;
    for (const d of powerDenominators) {
      if (4.0 / d >= quarterNotes - 1e-6) {
        baseDen = d;
      } else {
        break;
      }
    }
    const rawNum = qNum * baseDen;
    const rawDen = qDen * 4;
    const g = TmdLilyPondGenerator.gcd(rawNum, rawDen);
    const mNum = Math.trunc(rawNum / g);
    const mDen = Math.trunc(rawDen / g);
    if (mNum === mDen) {
      return [`${baseDen}`];
    } else if (mDen === 1) {
      return [`${baseDen}*${mNum}`];
    } else {
      return [`${baseDen}*${mNum}/${mDen}`];
    }
  }

  private static gcd(a: number, b: number): number {
    let x = Math.abs(Math.trunc(a));
    let y = Math.abs(Math.trunc(b));
    while (y !== 0) {
      const t = y;
      y = x % y;
      x = t;
    }
    return Math.max(1, x);
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
    const rest = trimmed.slice(1).replace(/(?:minor|min|major|maj|m)$/i, "");
    if (rest.includes("'") || rest.includes("#")) {
      pitch += "is";
    } else if (rest.includes(",") || rest.includes("b")) {
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
}
