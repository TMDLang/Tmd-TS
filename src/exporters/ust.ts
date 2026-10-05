import { SheetInstrumentHelper } from "../domain/index.js";
import { TmdPlaybackRenderer } from "../playback/index.js";
import { Sheet } from "../syntax/index.js";
import { TmdMIDIGenerator } from "./midi.js";

/** Options for configuring UTAU .ust exports. */
export interface USTExportOptions {
  /** Title of the project. If empty, falls back to the sheet's name. */
  projectName?: string;
  /** Voice directory path to embed in UST settings. */
  voiceDir?: string;
  /** Default lyric to use if none is provided for a note. */
  defaultLyric?: string;
  /** Optional sequence of lyrics to apply to consecutive notes. */
  lyrics?: string[];
  /** Ticks per quarter note (standard UTAU PPQ is 480). */
  ticksPerQuarter?: number;
}

/**
 * Exporter for UTAU sequence text (.ust) format, fully compatible with
 * original UTAU and modern cross-platform OpenUtau.
 */
export class TmdUSTGenerator {
  /**
   * Generates a .ust formatted string from a parsed TMD Sheet.
   */
  public static generateUST(
    sheet: Sheet,
    targetInstrument?: string,
    options: USTExportOptions = {}
  ): string {
    const selectedInstrument = this.resolveTargetInstrument(sheet, targetInstrument);
    const timeline = TmdPlaybackRenderer.render(sheet, selectedInstrument);

    const initialTempo = sheet.speed > 0 ? sheet.speed : 120.0;
    const title =
      options.projectName && options.projectName.length > 0
        ? options.projectName
        : sheet.name && sheet.name.length > 0
        ? sheet.name
        : "TMD UTAU Score";
    const voiceDir = options.voiceDir || "";
    const defaultLyric = options.defaultLyric || "a";
    const lyrics = options.lyrics || [];
    const ticksPerQuarter = options.ticksPerQuarter || 480;

    const lines: string[] = [
      "[#SETTING]",
      `Tempo=${initialTempo.toFixed(2)}`,
      "Tracks=1",
      `ProjectName=${title}`,
      `VoiceDir=${voiceDir}`,
      "OutFile=",
      "CacheDir=",
      "Tool1=",
      "Tool2=",
      "Mode2=True",
      "Charset=UTF-8",
      "",
    ];

    let currentPosition = 0.0;
    let currentTempo = initialTempo;
    let noteIndex = 0;
    let lyricIndex = 0;

    // Filter and resolve monophonic degradation: if multiple note events start at the same position, pick the highest pitch
    const monophonicEvents: typeof timeline.events = [];
    let i = 0;
    while (i < timeline.events.length) {
      const ev = timeline.events[i];
      if (ev.content.type === "note") {
        let bestNoteEvent = ev;
        let bestPitch = TmdMIDIGenerator.noteToMIDIPitch(ev.content.note, ev.state.keyOffset);
        let j = i + 1;
        while (j < timeline.events.length && Math.abs(timeline.events[j].position - ev.position) < 1e-4) {
          const nextEv = timeline.events[j];
          if (nextEv.content.type === "note") {
            const p = TmdMIDIGenerator.noteToMIDIPitch(nextEv.content.note, nextEv.state.keyOffset);
            if (p > bestPitch) {
              bestPitch = p;
              bestNoteEvent = nextEv;
            }
          }
          j++;
        }
        monophonicEvents.push(bestNoteEvent);
        i = j;
      } else {
        monophonicEvents.push(ev);
        i++;
      }
    }

    for (const event of monophonicEvents) {
      // Fill any timeline gap prior to this event with a Rest (Lyric=R)
      if (event.position > currentPosition) {
        const gapDuration = event.position - currentPosition;
        const gapTicks = Math.round(gapDuration * ticksPerQuarter);
        if (gapTicks > 0) {
          lines.push(...this.formatRestNote(noteIndex, gapTicks));
          noteIndex += 1;
        }
        currentPosition = event.position;
      }

      if (event.content.type === "note") {
        const ticks = Math.max(1, Math.round(event.duration * ticksPerQuarter));
        const pitch = TmdMIDIGenerator.noteToMIDIPitch(event.content.note, event.state.keyOffset);
        const lyric = lyricIndex < lyrics.length ? lyrics[lyricIndex++] : defaultLyric;

        const noteLines: string[] = [
          `[#${String(noteIndex).padStart(4, "0")}]`,
          `Length=${ticks}`,
          `Lyric=${lyric}`,
          `NoteNum=${pitch}`,
          "PreUtterance=",
          "Intensity=100",
          "Modulation=0",
        ];

        if (Math.abs(event.state.tempo - currentTempo) > 0.001) {
          noteLines.push(`Tempo=${event.state.tempo.toFixed(2)}`);
          currentTempo = event.state.tempo;
        }

        noteLines.push("");
        lines.push(...noteLines);
        noteIndex += 1;
        currentPosition = event.position + event.duration;
      } else if (event.content.type === "rest") {
        const ticks = Math.max(1, Math.round(event.duration * ticksPerQuarter));
        lines.push(...this.formatRestNote(noteIndex, ticks));
        noteIndex += 1;
        currentPosition = event.position + event.duration;
      }
    }

    lines.push("[#TRACKEND]", "");
    return lines.join("\r\n");
  }

  private static formatRestNote(index: number, ticks: number): string[] {
    return [
      `[#${String(index).padStart(4, "0")}]`,
      `Length=${ticks}`,
      "Lyric=R",
      "NoteNum=60",
      "PreUtterance=",
      "",
    ];
  }

  public static resolveTargetInstrument(sheet: Sheet, requested?: string): string {
    return SheetInstrumentHelper.resolveVocalInstrument(sheet, requested);
  }
}
