import type { TmdHarmonyProfile } from "../analysis/inspector.js";
import type { Sheet } from "../syntax/types.js";

/** Extracts harmonic content and playback key changes from a parsed score. */
export class TmdSongHarmonyAnalyzer {
  static analyze(sheet: Sheet): TmdHarmonyProfile {
    const chords: string[] = [];
    for (const paragraph of sheet.entries) {
      for (const section of paragraph.sections) {
        for (const group of section.unitGroups) {
          for (const unit of group.units) {
            if (unit.type === "chord") {
              const raw = `[${unit.chord.toString()}]`;
              if (!chords.includes(raw)) {
                chords.push(raw);
              }
            }
          }
        }
      }
    }

    const modulations: string[] = [];
    for (const order of sheet.playback) {
      if (order.type === "relative") {
        modulations.push(`Relative: ${order.value} semitones`);
      } else if (order.type === "absolute") {
        modulations.push(`Key: ${order.value}`);
      }
    }

    return {
      distinctChords: chords,
      chordCount: chords.length,
      modulations,
    };
  }
}
