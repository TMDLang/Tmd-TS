import {
  Note,
  Entry,
  PlaybackDirectiveEvent,
  Sheet,
  TMDMeasureRenderer,
  MeasureEvent,
  KeySignature,
  SheetInstrumentHelper,
  TMDMacroEvaluator,
} from "../core";

interface ABCKeyInfo {
  name: string;
  stepAccidentals: number[];
  degreeSteps: number[];
}

export class TMDABCGenerator {
  public static generateABC(rawSheet: Sheet): string {
    const sheet = TMDMacroEvaluator.expand(rawSheet);
    let abc = "";

    abc += "X:1\n";
    abc += `T:${sheet.name ? sheet.name : "Untitled"}\n`;
    abc += `C:${sheet.metadata["composer"] || "TMD (Chen, Chih-Han / aguai)"}\n`;
    abc += `M:${sheet.beat.count}/${sheet.beat.noteValue}\n`;
    abc += "L:1/16\n";
    const speed = sheet.speed > 0 ? sheet.speed : 120;
    const tempoField = TMDABCGenerator.resolveTempo(sheet.beat, speed);
    abc += `${tempoField}\n`;
    abc += `K:${TMDABCGenerator.abcKey(sheet.declaredKey || sheet.keySignature.toString())}\n\n`;

    const instruments = SheetInstrumentHelper.distinctInstruments(sheet, false);

    instruments.forEach((inst, idx) => {
      const vId = `V${idx + 1}`;
      abc += `V:${vId} name="${inst}" snm="${inst.slice(0, 3)}"\n`;
    });
    abc += "\n";

    instruments.forEach((inst, idx) => {
      const vId = `V${idx + 1}`;
      abc += `[V:${vId}]\n`;
      if (TMDABCGenerator.paragraphsContainPercussion(sheet.entries, inst)) {
        abc += "%%MIDI channel 10\n";
      }
      abc += TMDABCGenerator.generateTrackMusic(inst, sheet);
      abc += "\n\n";
    });

    return abc;
  }

  public static resolveTempo(beat: { count: number; noteValue: number }, quarterBPM: number): string {
    // Compound meter: denominator is 8 and numerator is a multiple of 3 (> 3, e.g. 6/8, 9/8, 12/8)
    if (beat.noteValue === 8 && beat.count > 3 && beat.count % 3 === 0) {
      // Beat unit is a dotted-quarter note (in ABC represented as 3/8)
      const bpm = Math.round(quarterBPM / 1.5);
      return `Q:3/8=${bpm}`;
    }
    switch (beat.noteValue) {
      case 2: {
        const bpm = Math.round(quarterBPM / 2.0);
        return `Q:1/2=${bpm}`;
      }
      case 8: {
        const bpm = Math.round(quarterBPM * 2.0);
        return `Q:1/8=${bpm}`;
      }
      case 16: {
        const bpm = Math.round(quarterBPM * 4.0);
        return `Q:1/16=${bpm}`;
      }
      default: {
        const bpm = Math.round(quarterBPM);
        return `Q:1/4=${bpm}`;
      }
    }
  }

  private static generateTrackMusic(instrument: string, sheet: Sheet): string {
    const measures = TMDMeasureRenderer.renderMeasures(sheet, instrument);
    let result = "";

    for (let mIdx = 0; mIdx < measures.length; mIdx++) {
      const measure = measures[mIdx];
      for (const directive of measure.directives) {
        result += TMDABCGenerator.formatDirective(directive);
      }

      // Group simultaneous events sharing the same startOffset
      const groups: MeasureEvent[][] = [];
      for (const event of measure.events) {
        if (groups.length > 0 && Math.abs(event.startOffset - groups[groups.length - 1][0].startOffset) < 1e-4) {
          groups[groups.length - 1].push(event);
        } else {
          groups.push([event]);
        }
      }

      for (const group of groups) {
        result += TMDABCGenerator.formatEventGroup(group);
        result += " ";
      }
      result += "|";
      if ((mIdx + 1) % 4 === 0 && mIdx < measures.length - 1) {
        result += "\n";
      } else {
        result += " ";
      }
    }

    return result.trim() + "\n";
  }

  private static formatDirective(directive: PlaybackDirectiveEvent): string {
    const k = directive.kind;
    switch (k.type) {
      case "tempo":
      case "relativeTempo": {
        const cmd = TMDABCGenerator.resolveTempo(directive.state.timeSignature, directive.state.tempo);
        return `${cmd} `;
      }
      case "timeSignature":
        return `M:${k.beat.count}/${k.beat.noteValue} `;
      case "absoluteKey":
        return `K:${TMDABCGenerator.abcKey(k.key)} `;
      case "explicitKey":
        return `K:${TMDABCGenerator.abcKey(k.key)} `;
      case "dynamics":
        return `!${k.mark}! `;
      case "relativeKey": {
        const key = TMDABCGenerator.keyInfo(directive.state.keyOffset).name;
        return `K:${key} `;
      }
      case "fixedPitch":
        return `K:C `;
    }
  }

  private static formatEventGroup(group: MeasureEvent[]): string {
    if (group.length === 1) {
      return TMDABCGenerator.formatMeasureEvent(group[0]);
    }

    // Check if group is composed of multiple simultaneous notes (polyphonic chord/multi-note)
    const noteEvents = group.filter((ev) => ev.content.type === "note");
    if (noteEvents.length === group.length) {
      // Form an ABC chord: [c4e4g4] or [ceg]4
      const duration = group[0].duration;
      const multiplier = Math.max(1, Math.round(duration * 4));
      const suffix = multiplier > 1 ? String(multiplier) : "";
      const pitches = noteEvents.map((ev) => {
        const note = (ev.content as { type: "note"; note: any }).note;
        return TMDABCGenerator.noteToABCPitch(note, ev.state.keyOffset);
      });
      const tie = group.some((ev) => ev.tieStart) ? "-" : "";
      return `[${pitches.join("")}]${suffix}${tie}`;
    }

    // Otherwise format sequentially
    return group.map((ev) => TMDABCGenerator.formatMeasureEvent(ev)).join(" ");
  }

  private static formatMeasureEvent(event: MeasureEvent): string {
    const multiplier = Math.max(1, Math.round(event.duration * 4));
    const suffix = multiplier > 1 ? String(multiplier) : "";

    switch (event.content.type) {
      case "note": {
        const tie = event.tieStart ? "-" : "";
        return `${TMDABCGenerator.noteToABCPitch(event.content.note, event.state.keyOffset)}${suffix}${tie}`;
      }
      case "chord":
        return `"${event.content.chord.toString()}"z${suffix}`;
      case "rest":
        return `z${suffix}`;
      case "percussion": {
        const pattern = event.content.pattern;
        const mapping: Record<string, string> = {
          X: "^F", x: "^F", T: "A", t: "A", S: "D", s: "D"
        };
        const pitches = Array.from(pattern).map((c) => mapping[c]).filter(Boolean);
        if (pitches.length === 0) return `z${suffix}`;
        const count = pitches.length;
        const base = Math.floor(multiplier / count);
        const remainder = multiplier % count;
        return pitches
          .map((p, i) => {
            const dur = base + (i < remainder ? 1 : 0);
            const s = dur > 1 ? String(dur) : "";
            return `${p}${s}`;
          })
          .join(" ");
      }
    }
  }

  private static keyInfo(keyOffset: number): ABCKeyInfo {
    const normalized = ((keyOffset % 12) + 12) % 12;
    switch (normalized) {
      case 0: // C
        return { name: "C", stepAccidentals: [0, 0, 0, 0, 0, 0, 0], degreeSteps: [0, 1, 2, 3, 4, 5, 6] };
      case 1: // Db
        return { name: "Db", stepAccidentals: [0, -1, -1, 0, -1, -1, -1], degreeSteps: [1, 2, 3, 4, 5, 6, 0] };
      case 2: // D
        return { name: "D", stepAccidentals: [1, 0, 0, 1, 0, 0, 0], degreeSteps: [1, 2, 3, 4, 5, 6, 0] };
      case 3: // Eb
        return { name: "Eb", stepAccidentals: [0, 0, -1, 0, 0, -1, -1], degreeSteps: [2, 3, 4, 5, 6, 0, 1] };
      case 4: // E
        return { name: "E", stepAccidentals: [1, 1, 0, 1, 1, 0, 0], degreeSteps: [2, 3, 4, 5, 6, 0, 1] };
      case 5: // F
        return { name: "F", stepAccidentals: [0, 0, 0, 0, 0, 0, -1], degreeSteps: [3, 4, 5, 6, 0, 1, 2] };
      case 6: // F#
        return { name: "F#", stepAccidentals: [1, 1, 1, 1, 1, 1, 0], degreeSteps: [3, 4, 5, 6, 0, 1, 2] };
      case 7: // G
        return { name: "G", stepAccidentals: [0, 0, 0, 1, 0, 0, 0], degreeSteps: [4, 5, 6, 0, 1, 2, 3] };
      case 8: // Ab
        return { name: "Ab", stepAccidentals: [0, -1, -1, 0, 0, -1, -1], degreeSteps: [5, 6, 0, 1, 2, 3, 4] };
      case 9: // A
        return { name: "A", stepAccidentals: [1, 0, 0, 1, 1, 0, 0], degreeSteps: [5, 6, 0, 1, 2, 3, 4] };
      case 10: // Bb
        return { name: "Bb", stepAccidentals: [0, 0, -1, 0, 0, 0, -1], degreeSteps: [6, 0, 1, 2, 3, 4, 5] };
      case 11: // B
        return { name: "B", stepAccidentals: [1, 1, 0, 1, 1, 1, 0], degreeSteps: [6, 0, 1, 2, 3, 4, 5] };
      default:
        return { name: "C", stepAccidentals: [0, 0, 0, 0, 0, 0, 0], degreeSteps: [0, 1, 2, 3, 4, 5, 6] };
    }
  }

  private static noteToABCPitch(note: Note, keyOffset: number): string {
    const info = TMDABCGenerator.keyInfo(keyOffset);
    const degIdx = Math.max(0, Math.min(6, note.degree - 1));
    const stepIdx = info.degreeSteps[degIdx];
    const keyAcc = info.stepAccidentals[stepIdx];

    let delta = 0;
    if (note.accidental === "sharp") delta = 1;
    else if (note.accidental === "flat") delta = -1;

    const noteAlter = keyAcc + delta;
    let prefix = "";
    if (noteAlter === keyAcc) {
      prefix = "";
    } else if (noteAlter === 0 && keyAcc !== 0) {
      prefix = "=";
    } else if (noteAlter === 1 && keyAcc !== 1) {
      prefix = "^";
    } else if (noteAlter === -1 && keyAcc !== -1) {
      prefix = "_";
    } else if (noteAlter >= 2) {
      prefix = "^^";
    } else if (noteAlter <= -2) {
      prefix = "__";
    }

    const stepUpper = ["C", "D", "E", "F", "G", "A", "B"][stepIdx];
    const stepLower = ["c", "d", "e", "f", "g", "a", "b"][stepIdx];

    const semitones = [0, 2, 4, 5, 7, 9, 11][note.degree - 1];
    const midiPitch = 60 + keyOffset + semitones + delta + note.octave * 12;
    const octave = Math.floor(midiPitch / 12) - 1;

    let letter = "";
    if (octave >= 5) {
      const apostrophes = "'".repeat(octave - 5);
      letter = `${stepLower}${apostrophes}`;
    } else if (octave === 4) {
      letter = stepLower;
    } else if (octave === 3) {
      letter = stepUpper;
    } else {
      const commas = ",".repeat(Math.max(0, 3 - octave));
      letter = `${stepUpper}${commas}`;
    }

    return `${prefix}${letter}`;
  }

  private static abcKey(key: string): string {
    const trimmed = key.trim();
    const match = trimmed.match(/^([A-Ga-g])([#b']?)(m|min|minor)?$/i);
    if (match) {
      const letter = match[1].toUpperCase();
      const accidental = match[2] === "'" ? "#" : match[2];
      const mode = match[3] ? "m" : "";
      return `${letter}${accidental}${mode}`;
    }
    const keySig = KeySignature.parse(trimmed);
    return TMDABCGenerator.keyInfo(keySig.semitoneOffset).name;
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
