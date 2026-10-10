import { SheetInstrumentHelper } from "../domain/index.js";
import { MeasureEvent, PlaybackDirectiveEvent, TmdMeasureRenderer } from "../playback/index.js";
import { KeySignature, Note, PercussionStroke, PitchMapping, Sheet } from "../syntax/index.js";

export class TmdABCGenerator {
  public static generateABC(rawSheet: Sheet): string {
    const { sheet, instruments } = SheetInstrumentHelper.preparedForExport(rawSheet);
    let abc = "";

    abc += "X:1\n";
    abc += `T:${sheet.name ? sheet.name : "Untitled"}\n`;
    abc += `C:${sheet.metadata["composer"] || "TMD (Chen, Chih-Han / aguai)"}\n`;
    abc += `M:${sheet.beat.count}/${sheet.beat.noteValue}\n`;
    abc += "L:1/16\n";
    const speed = sheet.speed > 0 ? sheet.speed : 120;
    const tempoField = TmdABCGenerator.resolveTempo(sheet.beat, speed);
    abc += `${tempoField}\n`;
    abc += `K:${TmdABCGenerator.abcKey(sheet.declaredKey || sheet.keySignature.toString())}\n\n`;

    instruments.forEach((inst, idx) => {
      const vId = `V${idx + 1}`;
      abc += `V:${vId} name="${inst}" snm="${inst.slice(0, 3)}"\n`;
    });
    abc += "\n";

    instruments.forEach((inst, idx) => {
      const vId = `V${idx + 1}`;
      abc += `[V:${vId}]\n`;
      if (SheetInstrumentHelper.containsPercussionUnits(sheet, inst)) {
        abc += "%%MIDI channel 10\n";
      }
      abc += TmdABCGenerator.generateTrackMusic(inst, sheet);
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
    const measures = TmdMeasureRenderer.renderMeasures(sheet, instrument);
    let result = "";
    const initialKey = sheet.declaredKey || sheet.keySignature.toString();
    let currentKeyStepAlters = PitchMapping.keySignatureStepAlters(initialKey);

    for (let mIdx = 0; mIdx < measures.length; mIdx++) {
      const measure = measures[mIdx];
      const measureStepAlters = new Map<number, number[]>();

      for (const directive of measure.directives) {
        switch (directive.kind.type) {
          case "absoluteKey":
          case "explicitKey":
            currentKeyStepAlters = PitchMapping.keySignatureStepAlters(directive.kind.key);
            measureStepAlters.clear();
            break;
          case "relativeKey": {
            const key = PitchMapping.tonicScaleInfo(directive.state.keyOffset).name;
            currentKeyStepAlters = PitchMapping.keySignatureStepAlters(key);
            measureStepAlters.clear();
            break;
          }
          case "fixedPitch":
            currentKeyStepAlters = [0, 0, 0, 0, 0, 0, 0];
            measureStepAlters.clear();
            break;
          default:
            break;
        }
        result += TmdABCGenerator.formatDirective(directive);
      }

      const groups = TmdMeasureRenderer.groupSimultaneousEvents(measure.events);

      for (const group of groups) {
        result += TmdABCGenerator.formatEventGroup(group, currentKeyStepAlters, measureStepAlters);
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
        const cmd = TmdABCGenerator.resolveTempo(directive.state.timeSignature, directive.state.tempo);
        return `${cmd} `;
      }
      case "timeSignature":
        return `M:${k.beat.count}/${k.beat.noteValue} `;
      case "absoluteKey":
        return `K:${TmdABCGenerator.abcKey(k.key)} `;
      case "explicitKey":
        return `K:${TmdABCGenerator.abcKey(k.key)} `;
      case "dynamics":
        return `!${k.mark}! `;
      case "relativeKey": {
        const key = PitchMapping.tonicScaleInfo(directive.state.keyOffset).name;
        return `K:${key} `;
      }
      case "fixedPitch":
        return `K:C `;
    }
  }

  private static formatEventGroup(
    group: MeasureEvent[],
    defaultKeyStepAlters: number[],
    measureStepAlters: Map<number, number[]>
  ): string {
    if (group.length === 1) {
      return TmdABCGenerator.formatMeasureEvent(group[0], defaultKeyStepAlters, measureStepAlters);
    }

    // Check if group is composed of multiple simultaneous notes (polyphonic chord/multi-note)
    const noteEvents = group.filter((ev) => ev.content.type === "note");
    if (noteEvents.length === group.length) {
      // Form an ABC chord: [c4e4g4] or [ceg]4
      const duration = group[0].duration;
      const multiplier = Math.max(1, Math.round(duration * 4));
      const suffix = multiplier > 1 ? String(multiplier) : "";
      const pitches = noteEvents.map((ev) => {
        const note = (ev.content as { type: "note"; note: Note }).note;
        return TmdABCGenerator.noteToABCPitch(note, ev.state.keyOffset, defaultKeyStepAlters, measureStepAlters);
      });
      const tie = group.some((ev) => ev.tieStart) ? "-" : "";
      return `[${pitches.join("")}]${suffix}${tie}`;
    }

    // Otherwise format sequentially
    return group.map((ev) => TmdABCGenerator.formatMeasureEvent(ev, defaultKeyStepAlters, measureStepAlters)).join(" ");
  }

  private static formatMeasureEvent(
    event: MeasureEvent,
    defaultKeyStepAlters: number[],
    measureStepAlters: Map<number, number[]>
  ): string {
    const multiplier = Math.max(1, Math.round(event.duration * 4));
    const suffix = multiplier > 1 ? String(multiplier) : "";

    switch (event.content.type) {
      case "note": {
        const tie = event.tieStart ? "-" : "";
        return `${TmdABCGenerator.noteToABCPitch(event.content.note, event.state.keyOffset, defaultKeyStepAlters, measureStepAlters)}${suffix}${tie}`;
      }
      case "chord":
        return `"${event.content.chord.toString()}"z${suffix}`;
      case "rest":
        return `z${suffix}`;
      case "percussion": {
        const pitches = PercussionStroke.parse(event.content.pattern)
          .map((s) => s.abcPitch)
          .filter((p): p is string => Boolean(p));
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

  private static noteToABCPitch(
    note: Note,
    keyOffset: number,
    defaultKeyStepAlters: number[],
    measureStepAlters: Map<number, number[]>
  ): string {
    const spelled = PitchMapping.spellNote(note, keyOffset);
    const octaveAlters = measureStepAlters.get(spelled.octave) ?? [...defaultKeyStepAlters];
    const expectedAlter = octaveAlters[spelled.stepIndex];

    let prefix = "";
    if (spelled.alter === expectedAlter) {
      prefix = "";
    } else {
      octaveAlters[spelled.stepIndex] = spelled.alter;
      measureStepAlters.set(spelled.octave, octaveAlters);
      if (spelled.alter === 0) {
        prefix = "=";
      } else if (spelled.alter === 1) {
        prefix = "^";
      } else if (spelled.alter === -1) {
        prefix = "_";
      } else if (spelled.alter >= 2) {
        prefix = "^^";
      } else if (spelled.alter <= -2) {
        prefix = "__";
      }
    }

    const stepUpper = PitchMapping.stepNames[spelled.stepIndex];
    const stepLower = PitchMapping.stepLowerNames[spelled.stepIndex];
    const octave = spelled.octave;

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
    if (!trimmed) return "C";
    let isMinor = false;
    let root = trimmed;
    if (root.endsWith("m") && !root.toLowerCase().endsWith("maj")) {
      isMinor = true;
      root = root.slice(0, -1).trim();
    } else if (root.toLowerCase().endsWith("minor")) {
      isMinor = true;
      root = root.slice(0, -5).trim();
    } else if (root.toLowerCase().endsWith("min")) {
      isMinor = true;
      root = root.slice(0, -3).trim();
    }
    const keySig = KeySignature.parse(root);
    const normalized = ((keySig.semitoneOffset % 12) + 12) % 12;
    let majorName = PitchMapping.tonicScaleInfo(normalized).name;
    if (root.includes("#") && majorName.includes("b")) {
      const sharps = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
      majorName = sharps[normalized];
    }
    return isMinor ? `${majorName}m` : majorName;
  }
}
