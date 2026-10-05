import { SheetInstrumentHelper } from "../domain/index.js";
import { PlaybackDirectiveEvent, TmdMacroEvaluator, TmdMeasureRenderer, TmdPlaybackRenderer } from "../playback/index.js";
import { ChordSymbol, Note, PitchMapping, Sheet } from "../syntax/index.js";

export class TmdMusicXMLGenerator {
  public static generateMusicXML(rawSheet: Sheet): string {
    const sheet = TmdMacroEvaluator.expandThrowing(rawSheet);
    const metaCreators = Object.keys(sheet.metadata)
      .sort()
      .map((key) => {
        const value = sheet.metadata[key];
        const type = key.toLowerCase() === "lyrics" ? "lyricist" : key.toLowerCase() === "arranger" ? "arranger" : "composer";
        return `    <creator type="${type}">${TmdMusicXMLGenerator.escapeXML(value)}</creator>`;
      })
      .join("\n");

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n`;
    xml += `<score-partwise version="4.0">\n`;
    xml += `  <work>\n`;
    xml += `    <work-title>${TmdMusicXMLGenerator.escapeXML(sheet.name || "Untitled Score")}</work-title>\n`;
    xml += `  </work>\n`;
    xml += `  <identification>\n`;
    xml += `    <creator type="composer">TMD</creator>\n`;
    if (metaCreators.length > 0) xml += `${metaCreators}\n`;
    xml += `    <encoding>\n      <software>Tmd-TS MusicXML Exporter</software>\n    </encoding>\n`;
    xml += `  </identification>\n\n`;

    const instruments = SheetInstrumentHelper.distinctInstruments(sheet, false);

    xml += `  <part-list>\n`;
    instruments.forEach((inst, idx) => {
      const partID = `P${idx + 1}`;
      xml += `    <score-part id="${partID}">\n`;
      xml += `      <part-name>${TmdMusicXMLGenerator.escapeXML(inst)}</part-name>\n`;
      xml += `    </score-part>\n`;
    });
    xml += `  </part-list>\n\n`;

    const divisions = 48;
    instruments.forEach((inst, idx) => {
      const partID = `P${idx + 1}`;
      xml += `  <part id="${partID}">\n`;
      xml += TmdMusicXMLGenerator.generatePartMeasures(inst, sheet, divisions);
      xml += `  </part>\n`;
    });

    xml += `</score-partwise>\n`;
    return xml;
  }

  private static generatePartMeasures(instrument: string, sheet: Sheet, divisions: number): string {
    const measures = TmdMeasureRenderer.renderMeasures(sheet, instrument);
    let xml = "";

    for (const measure of measures) {
      let content = "";
      if (measure.index === 0) {
        content += TmdMusicXMLGenerator.generateAttributesXML(sheet, instrument, divisions);
      }
      for (const directive of measure.directives) {
        content += TmdMusicXMLGenerator.generatePlaybackDirectiveXML(directive);
      }

      const expectedMeasureDuration = Math.max(1, Math.round(measure.nominalDuration * divisions));
      const durations: number[] = measure.events.map((event) =>
        Math.max(1, Math.round(event.duration * divisions))
      );
      const totalDur = durations.reduce((acc, d) => acc + d, 0);
      const diff = expectedMeasureDuration - totalDur;
      if (diff !== 0 && durations.length > 0) {
        const lastIdx = durations.length - 1;
        durations[lastIdx] = Math.max(1, durations[lastIdx] + diff);
      }

      measure.events.forEach((event, idx) => {
        const duration = durations[idx];
        const isChord = idx > 0 && Math.abs(event.startOffset - measure.events[idx - 1].startOffset) < 1e-4;
        switch (event.content.type) {
          case "note":
            content += TmdMusicXMLGenerator.generateNoteXML(
              event.content.note,
              duration,
              divisions,
              event.state.keyOffset,
              event.tieStart,
              event.tieStop,
              isChord
            );
            break;
          case "chord":
            content += TmdMusicXMLGenerator.generateChordXML(event.content.chord, duration, divisions, event.state.keyOffset);
            break;
          case "rest":
            content += TmdMusicXMLGenerator.generateRestXML(duration, divisions);
            break;
          case "percussion":
            content += TmdMusicXMLGenerator.generatePercussionXML(event.content.pattern, duration, divisions);
            break;
        }
      });

      xml += `    <measure number="${measure.index + 1}">\n${content}    </measure>\n\n`;
    }

    return xml;
  }


  private static durationInfo(duration: number, divisions: number): { type: string; dots: number; timeModification?: { actualNotes: number; normalNotes: number } } | null {
    const d = divisions;
    // Standard durations
    if (duration === 4 * d) return { type: "whole", dots: 0 };
    if (duration === 3 * d) return { type: "half", dots: 1 };
    if (duration === 2 * d) return { type: "half", dots: 0 };
    if (duration === d + d / 2) return { type: "quarter", dots: 1 };
    if (duration === d) return { type: "quarter", dots: 0 };
    if (duration === d / 2 + d / 4) return { type: "eighth", dots: 1 };
    if (duration === d / 2) return { type: "eighth", dots: 0 };
    if (duration === d / 4 + d / 8) return { type: "16th", dots: 1 };
    if (duration === d / 4) return { type: "16th", dots: 0 };
    if (duration === d / 8) return { type: "32nd", dots: 0 };
    if (duration === d / 16) return { type: "64th", dots: 0 };

    // Triplet (3:2) durations: duration = (normalDur * 2) / 3
    if (duration === (4 * d * 2) / 3) return { type: "whole", dots: 0, timeModification: { actualNotes: 3, normalNotes: 2 } };
    if (duration === (2 * d * 2) / 3) return { type: "half", dots: 0, timeModification: { actualNotes: 3, normalNotes: 2 } };
    if (duration === (d * 2) / 3) return { type: "quarter", dots: 0, timeModification: { actualNotes: 3, normalNotes: 2 } };
    if (duration === (d / 2 * 2) / 3) return { type: "eighth", dots: 0, timeModification: { actualNotes: 3, normalNotes: 2 } };
    if (duration === (d / 4 * 2) / 3) return { type: "16th", dots: 0, timeModification: { actualNotes: 3, normalNotes: 2 } };
    if (duration === (d / 8 * 2) / 3) return { type: "32nd", dots: 0, timeModification: { actualNotes: 3, normalNotes: 2 } };

    return null;
  }

  private static generateDurationElementsXML(duration: number, divisions: number): string {
    const info = TmdMusicXMLGenerator.durationInfo(duration, divisions);
    if (!info) return "";
    let xml = `        <type>${info.type}</type>\n`;
    for (let i = 0; i < info.dots; i++) {
      xml += `        <dot/>\n`;
    }
    if (info.timeModification) {
      xml += `        <time-modification>\n          <actual-notes>${info.timeModification.actualNotes}</actual-notes>\n          <normal-notes>${info.timeModification.normalNotes}</normal-notes>\n        </time-modification>\n`;
    }
    return xml;
  }

  private static generateRestXML(duration: number, divisions: number): string {
    let xml = `      <note>\n        <rest/>\n        <duration>${Math.max(1, duration)}</duration>\n`;
    xml += TmdMusicXMLGenerator.generateDurationElementsXML(duration, divisions);
    xml += `      </note>\n`;
    return xml;
  }

  private static isPercussionInstrument(instrument: string, sheet: Sheet): boolean {
    const lower = instrument.toLowerCase();
    const aliases = ["drum", "drums", "groove", "percussion", "beat", "drumkit", "cajon", "snare", "kick", "hihat"];
    if (aliases.some((a) => lower.includes(a))) return true;
    return sheet.entries
      .filter((p) => p.assignment === instrument)
      .some((p) =>
        p.sections.some((s) =>
          s.unitGroups.some((g) =>
            g.units.some((u) => u.type === "percussion")
          )
        )
      );
  }

  private static isBassClefInstrument(instrument: string): boolean {
    const lower = instrument.toLowerCase();
    const bassKeywords = ["bass", "cello", "tuba", "contrabass", "bassoon", "trombone", "baritone", "timpani"];
    return bassKeywords.some((k) => lower.includes(k));
  }

  private static generateClefXML(instrument: string, sheet: Sheet): string {
    if (TmdMusicXMLGenerator.isPercussionInstrument(instrument, sheet)) {
      return `        <clef>\n          <sign>percussion</sign>\n        </clef>\n`;
    } else if (TmdMusicXMLGenerator.isBassClefInstrument(instrument)) {
      return `        <clef>\n          <sign>F</sign>\n          <line>4</line>\n        </clef>\n`;
    } else {
      return `        <clef>\n          <sign>G</sign>\n          <line>2</line>\n        </clef>\n`;
    }
  }

  public static semitoneOffsetToFifths(semitoneOffset: number): number {
    const normalized = ((semitoneOffset % 12) + 12) % 12;
    switch (normalized) {
      case 0: return 0;    // C
      case 1: return -5;   // Db
      case 2: return 2;    // D
      case 3: return -3;   // Eb
      case 4: return 4;    // E
      case 5: return -1;   // F
      case 6: return 6;    // F#
      case 7: return 1;    // G
      case 8: return -4;   // Ab
      case 9: return 3;    // A
      case 10: return -2;  // Bb
      case 11: return 5;   // B
      default: return 0;
    }
  }

  public static resolveMetronome(beat: { count: number; noteValue: number }, quarterBPM: number): { beatUnit: string; isDotted: boolean; perMinute: number } {
    // Compound meter: denominator is 8 and numerator is a multiple of 3 (> 3, e.g. 6/8, 9/8, 12/8)
    if (beat.noteValue === 8 && beat.count > 3 && beat.count % 3 === 0) {
      // Beat unit is a dotted-quarter note (value = 1.5 quarters)
      const bpm = quarterBPM / 1.5;
      return { beatUnit: "quarter", isDotted: true, perMinute: Math.round(bpm) };
    }
    // Beat unit based on time signature denominator
    switch (beat.noteValue) {
      case 2:
        // Half note (value = 2.0 quarters)
        return { beatUnit: "half", isDotted: false, perMinute: Math.round(quarterBPM / 2.0) };
      case 8:
        // Eighth note (value = 0.5 quarters)
        return { beatUnit: "eighth", isDotted: false, perMinute: Math.round(quarterBPM * 2.0) };
      case 16:
        // 16th note (value = 0.25 quarters)
        return { beatUnit: "16th", isDotted: false, perMinute: Math.round(quarterBPM * 4.0) };
      default:
        // Default: quarter note
        return { beatUnit: "quarter", isDotted: false, perMinute: Math.round(quarterBPM) };
    }
  }

  private static generatePlaybackDirectiveXML(directive: PlaybackDirectiveEvent): string {
    switch (directive.kind.type) {
      case "tempo":
      case "relativeTempo": {
        const metronome = TmdMusicXMLGenerator.resolveMetronome(directive.state.timeSignature, directive.state.tempo);
        const dotTag = metronome.isDotted ? "<beat-unit-dot/>" : "";
        return `      <direction placement="above">\n        <direction-type><metronome><beat-unit>${metronome.beatUnit}</beat-unit>${dotTag}<per-minute>${metronome.perMinute}</per-minute></metronome></direction-type>\n        <sound tempo="${directive.state.tempo}"/>\n      </direction>\n`;
      }
      case "timeSignature":
        return `      <attributes><time><beats>${directive.kind.beat.count}</beats><beat-type>${directive.kind.beat.noteValue}</beat-type></time></attributes>\n`;
      case "absoluteKey":
        return `      <attributes><key><fifths>${TmdMusicXMLGenerator.keySignatureToFifths(directive.kind.key)}</fifths></key></attributes>\n`;
      case "explicitKey": {
        const mode = /(?:m|min|minor)$/i.test(directive.kind.key) ? "minor" : "major";
        return `      <attributes><key><fifths>${TmdMusicXMLGenerator.keySignatureToFifths(directive.kind.key)}</fifths><mode>${mode}</mode></key></attributes>\n`;
      }
      case "dynamics":
        return `      <direction placement="below"><direction-type><dynamics><${directive.kind.mark}/></dynamics></direction-type></direction>\n`;
      case "relativeKey": {
        const fifths = TmdMusicXMLGenerator.semitoneOffsetToFifths(directive.state.keyOffset);
        return `      <attributes><key><fifths>${fifths}</fifths></key></attributes>\n`;
      }
      case "fixedPitch":
        return `      <attributes><key><fifths>0</fifths></key></attributes>\n`;
    }
  }

  private static generatePercussionXML(pattern: string, duration: number, divisions: number): string {
    const notes: [string, number][] = [];
    for (const c of pattern) {
      if (c === "D" || c === "d" || c === "B" || c === "b") notes.push(["F", 4]); // Bass drum (kick)
      else if (c === "S" || c === "s") notes.push(["D", 5]); // Snare
      else if (c === "X" || c === "x") notes.push(["F", 5]); // Closed hi-hat
      else if (c === "O" || c === "o") notes.push(["G", 5]); // Open hi-hat
      else if (c === "T" || c === "t") notes.push(["A", 4]); // Tom
      else if (c === "C" || c === "c") notes.push(["A", 5]); // Crash cymbal
    }
    if (notes.length === 0) {
      return TmdMusicXMLGenerator.generateRestXML(duration, divisions);
    }
    const count = notes.length;
    const base = Math.floor(duration / count);
    const remainder = duration % count;
    let xml = "";
    notes.forEach(([step, octave], i) => {
      const noteDur = base + (i < remainder ? 1 : 0);
      xml += `      <note>\n        <unpitched>\n          <display-step>${step}</display-step>\n          <display-octave>${octave}</display-octave>\n        </unpitched>\n        <duration>${noteDur}</duration>\n`;
      xml += TmdMusicXMLGenerator.generateDurationElementsXML(noteDur, divisions);
      xml += `      </note>\n`;
    });
    return xml;
  }

  private static generateAttributesXML(sheet: Sheet, instrument: string, divisions: number): string {
    const speed = sheet.speed > 0 ? sheet.speed : 120;
    const initialMetronome = TmdMusicXMLGenerator.resolveMetronome(sheet.beat, speed);
    const dotTag = initialMetronome.isDotted ? "\n            <beat-unit-dot/>" : "";
    const key = sheet.declaredKey || sheet.keySignature.toString();
    const modeTag = sheet.declaredKey ? `<mode>${/(?:m|min|minor)$/i.test(key) ? "minor" : "major"}</mode>` : "";
    return `      <attributes>\n        <divisions>${divisions}</divisions>\n        <key>\n          <fifths>${TmdMusicXMLGenerator.keySignatureToFifths(key)}</fifths>${modeTag}\n        </key>\n        <time>\n          <beats>${sheet.beat.count}</beats>\n          <beat-type>${sheet.beat.noteValue}</beat-type>\n        </time>\n${TmdMusicXMLGenerator.generateClefXML(instrument, sheet)}      </attributes>\n      <direction placement="above">\n        <direction-type>\n          <metronome>\n            <beat-unit>${initialMetronome.beatUnit}</beat-unit>${dotTag}\n            <per-minute>${initialMetronome.perMinute}</per-minute>\n          </metronome>\n        </direction-type>\n        <sound tempo="${Math.round(speed)}"/>\n      </direction>\n`;
  }

  private static generateNoteXML(
    note: Note,
    duration: number,
    divisions: number,
    keyOffset: number,
    tieStart = false,
    tieStop = false,
    isChord = false
  ): string {
    const { step, alter, octave } = TmdMusicXMLGenerator.pitchToStepAlterOctave(note, keyOffset);
    let xml = `      <note>\n`;
    if (isChord) {
      xml += `        <chord/>\n`;
    }
    xml += `        <pitch>\n          <step>${step}</step>\n`;
    if (alter !== 0) {
      xml += `          <alter>${alter}</alter>\n`;
    }
    xml += `          <octave>${octave}</octave>\n        </pitch>\n        <duration>${duration}</duration>\n`;
    if (tieStop) {
      xml += `        <tie type="stop"/>\n`;
    }
    if (tieStart) {
      xml += `        <tie type="start"/>\n`;
    }
    xml += TmdMusicXMLGenerator.generateDurationElementsXML(duration, divisions);
    if (tieStart || tieStop) {
      xml += `        <notations>\n`;
      if (tieStop) {
        xml += `          <tied type="stop"/>\n`;
      }
      if (tieStart) {
        xml += `          <tied type="start"/>\n`;
      }
      xml += `        </notations>\n`;
    }
    xml += `      </note>\n`;
    return xml;
  }

  private static generateChordXML(chord: ChordSymbol, duration: number, divisions: number, keyOffset: number): string {
    const semitone = chord.root.isScaleDegree
      ? ((keyOffset + chord.root.semitoneOffset) % 12 + 12) % 12
      : (chord.root.semitoneOffset % 12 + 12) % 12;

    const rootStep = PitchMapping.musicXMLSteps[semitone];
    const rootAlter = PitchMapping.musicXMLAlters[semitone];

    let kindValue = "other";
    const kindText = chord.toString();
    switch (chord.quality) {
      case "major": kindValue = "major"; break;
      case "minor": kindValue = "minor"; break;
      case "dominant7": kindValue = "dominant"; break;
      case "major7": kindValue = "major-seventh"; break;
      case "minor7": kindValue = "minor-seventh"; break;
      case "diminished": kindValue = "diminished"; break;
      case "halfDiminished": kindValue = "half-diminished"; break;
      case "augmented": kindValue = "augmented"; break;
      case "suspended": kindValue = "suspended-fourth"; break;
      case "power": kindValue = "power"; break;
      default: kindValue = "other"; break;
    }

    let xml = `      <harmony>\n        <root>\n          <root-step>${TmdMusicXMLGenerator.escapeXML(rootStep)}</root-step>\n`;
    if (rootAlter !== 0) {
      xml += `          <root-alter>${rootAlter}</root-alter>\n`;
    }
    xml += `        </root>\n        <kind text="${TmdMusicXMLGenerator.escapeXML(kindText)}">${kindValue}</kind>\n`;

    if (chord.bass) {
      const bassSemitone = chord.bass.isScaleDegree
        ? ((keyOffset + chord.bass.semitoneOffset) % 12 + 12) % 12
        : (chord.bass.semitoneOffset % 12 + 12) % 12;
      const bassStep = PitchMapping.musicXMLSteps[bassSemitone];
      const bassAlter = PitchMapping.musicXMLAlters[bassSemitone];
      xml += `        <bass>\n          <bass-step>${TmdMusicXMLGenerator.escapeXML(bassStep)}</bass-step>\n`;
      if (bassAlter !== 0) {
        xml += `          <bass-alter>${bassAlter}</bass-alter>\n`;
      }
      xml += `        </bass>\n`;
    }

    xml += `      </harmony>\n      <note>\n        <rest/>\n        <duration>${duration}</duration>\n`;
    xml += TmdMusicXMLGenerator.generateDurationElementsXML(duration, divisions);
    xml += `      </note>\n`;
    return xml;
  }

  private static pitchToStepAlterOctave(note: Note, keyOffset: number): { step: string; alter: number; octave: number } {
    let midiPitch = 60 + keyOffset + (note.degree === 1 ? 0 : [0, 2, 4, 5, 7, 9, 11][note.degree - 1]);
    if (note.accidental === "sharp") midiPitch += 1;
    else if (note.accidental === "flat") midiPitch -= 1;
    midiPitch += note.octave * 12;

    const semitone = ((midiPitch % 12) + 12) % 12;
    const step = PitchMapping.musicXMLSteps[semitone];
    const alter = PitchMapping.musicXMLAlters[semitone];
    const octave = Math.floor(midiPitch / 12) - 1;

    return { step, alter, octave };
  }

  private static keySignatureToFifths(key: string): number {
    const trimmed = key.trim().toUpperCase();
    switch (trimmed) {
      case "C": return 0;
      case "G": return 1;
      case "D": return 2;
      case "A": return 3;
      case "E": return 4;
      case "B": return 5;
      case "F#":
      case "F'": return 6;
      case "F": return -1;
      case "BB":
      case "B,": return -2;
      case "EB":
      case "E,": return -3;
      case "AB":
      case "A,":
      case "A'": return 3;
      case "DB":
      case "D,": return -5;
      case "GB":
      case "G,": return -6;
      default: return 0;
    }
  }

  private static escapeXML(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
