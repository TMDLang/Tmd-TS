import { SheetInstrumentHelper } from "../domain/index.js";
import { MeasureEvent, PlaybackDirectiveEvent, TmdMeasureRenderer } from "../playback/index.js";
import { KeySignature, metronomeTempoForBeat, Note, PercussionStroke, PitchMapping, Sheet } from "../syntax/index.js";

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
    const m = metronomeTempoForBeat(beat, quarterBPM);
    return `Q:${m.abcUnit}=${m.perMinute}`;
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
        return `[${cmd}] `;
      }
      case "timeSignature":
        return `[M:${k.beat.count}/${k.beat.noteValue}] `;
      case "absoluteKey":
        return `[K:${TmdABCGenerator.abcKey(k.key)}] `;
      case "explicitKey":
        return `[K:${TmdABCGenerator.abcKey(k.key)}] `;
      case "dynamics":
        return `!${k.mark}! `;
      case "relativeKey": {
        const key = PitchMapping.tonicScaleInfo(directive.state.keyOffset).name;
        return `[K:${key}] `;
      }
      case "fixedPitch":
        return `[K:C] `;
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
      const suffix = TmdABCGenerator.formatDurationSuffix(group[0].duration);
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
    const suffix = TmdABCGenerator.formatDurationSuffix(event.duration);

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
        const strokeDuration = event.duration / count;
        const strokeSuffix = TmdABCGenerator.formatDurationSuffix(strokeDuration);
        return pitches.map((p) => `${p}${strokeSuffix}`).join(" ");
      }
    }
  }

  private static gcd(a: number, b: number): number {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y !== 0) {
      const t = x % y;
      x = y;
      y = t;
    }
    return Math.max(1, x);
  }

  private static formatDurationSuffix(quarterNotes: number): string {
    const units = Math.max(0, quarterNotes * 4);
    let bestNum = Math.max(1, Math.round(units));
    let bestDen = 1;
    let bestErr = Math.abs(units - bestNum);

    if (bestErr > 1e-4) {
      for (let den = 2; den <= 64; den++) {
        const num = Math.round(units * den);
        if (num < 1) continue;
        const err = Math.abs(units - num / den);
        if (err + 1e-7 < bestErr) {
          bestNum = num;
          bestDen = den;
          bestErr = err;
          if (err < 1e-5) break;
        }
      }
    }

    const divisor = TmdABCGenerator.gcd(bestNum, bestDen);
    const num = Math.floor(bestNum / divisor);
    const den = Math.floor(bestDen / divisor);

    if (den === 1) {
      return num === 1 ? "" : String(num);
    } else if (num === 1) {
      return `/${den}`;
    } else {
      return `${num}/${den}`;
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
    const lowerRoot = root.toLowerCase();
    if (lowerRoot.endsWith("minor")) {
      isMinor = true;
      root = root.slice(0, -5).trim();
    } else if (lowerRoot.endsWith("min")) {
      isMinor = true;
      root = root.slice(0, -3).trim();
    } else if (lowerRoot.endsWith("major")) {
      root = root.slice(0, -5).trim();
    } else if (lowerRoot.endsWith("maj")) {
      root = root.slice(0, -3).trim();
    } else if (root.endsWith("m")) {
      isMinor = true;
      root = root.slice(0, -1).trim();
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
