import type { TmdTimingProfile } from "../analysis/inspector.js";
import { PlaybackDirectiveEvent, PlaybackState,TmdPlaybackRenderer } from "../playback/playback.js";
import { DEFAULT_TEMPO_BPM, KeySignature, Playback, Sheet } from "../syntax/types.js";

/** Computes score timing independently from the Inspector facade. */
export class TmdSongTimingAnalyzer {
  public static analyze(sheet: Sheet, timelineDirectives: PlaybackDirectiveEvent[]): TmdTimingProfile {
    const orders: Playback[] = sheet.playback.length > 0
      ? sheet.playback
      : Array.from(new Set(sheet.entries.map((entry) => entry.name)))
        .map((name) => ({ type: "name" as const, name }));

    let state: PlaybackState = {
      tempo: sheet.speed > 0 ? sheet.speed : DEFAULT_TEMPO_BPM,
      keyOffset: sheet.keySignature.semitoneOffset,
      timeSignature: sheet.beat,
      dynamicLevel: "mf",
    };
    const sections: TmdTimingProfile["sections"] = [];
    let currentQuarterPosition = 0;
    let currentSeconds = 0;
    let currentMeasure = 1;
    let totalMeasures = 0;
    const occurrences = new Map<string, number>();

    for (let index = 0; index < orders.length; index++) {
      const order = orders[index];
      if (order.type === "relative") {
        const delta = parseInt(order.value.replace(/\+/g, ""), 10);
        if (!Number.isNaN(delta)) state = { ...state, keyOffset: state.keyOffset + delta };
        continue;
      }
      if (order.type === "absolute") {
        state = { ...state, keyOffset: KeySignature.parse(order.value).semitoneOffset };
        continue;
      }
      if (order.type !== "name") continue;

      const duration = TmdPlaybackRenderer.durationOf(order.name, sheet);
      const startPosition = currentQuarterPosition;
      const endPosition = startPosition + duration;
      let cursor = startPosition;
      let tempo = state.tempo;
      let meter = state.timeSignature;
      let durationSeconds = 0;
      let measureCount = 0;

      for (const directive of timelineDirectives) {
        if (directive.position < startPosition || directive.position >= endPosition) continue;
        if (directive.position > cursor) {
          const segment = directive.position - cursor;
          durationSeconds += segment * 60 / tempo;
          measureCount += segment / this.measureDuration(meter);
          cursor = directive.position;
        }
        tempo = directive.state.tempo;
        meter = directive.state.timeSignature;
      }
      if (endPosition > cursor) {
        const segment = endPosition - cursor;
        durationSeconds += segment * 60 / tempo;
        measureCount += segment / this.measureDuration(meter);
      }

      const occurrence = (occurrences.get(order.name) ?? 0) + 1;
      occurrences.set(order.name, occurrence);
      const sectionMeasures = Math.max(1, Math.round(measureCount));
      sections.push({
        name: order.name,
        orderIndex: index,
        occurrenceIndex: occurrence,
        startMeasure: currentMeasure,
        startPositionQuarterNotes: currentQuarterPosition,
        durationQuarterNotes: duration,
        startSeconds: currentSeconds,
        durationSeconds,
        measures: sectionMeasures,
        keyOffset: state.keyOffset,
        tempo: state.tempo,
      });

      currentQuarterPosition += duration;
      currentSeconds += durationSeconds;
      currentMeasure += sectionMeasures;
      totalMeasures += sectionMeasures;
      state = { ...state, tempo, timeSignature: meter };
    }

    return { totalDurationSeconds: currentSeconds, totalMeasures, sections };
  }

  private static measureDuration(beat: { count: number; noteValue: number }): number {
    return Math.max(1, beat.count) * 4 / Math.max(1, beat.noteValue);
  }
}
