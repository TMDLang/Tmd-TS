import { PlaybackContent, PlaybackDirectiveEvent, PlaybackEvent, PlaybackState, TMDPlaybackRenderer } from '../playback/playback.js';
import { Beat, DEFAULT_TEMPO_BPM, Sheet } from './types.js';

export interface NotationDurationAtom {
  baseDenominator: number; // 1, 2, 4, 8, 16, 32, 64
  isDotted: boolean;
  quarterValue: number;
}

export class NotationDuration {
  public static readonly standardValues: NotationDurationAtom[] = [
    { baseDenominator: 1, isDotted: false, quarterValue: 4.0 },
    { baseDenominator: 2, isDotted: true, quarterValue: 3.0 },
    { baseDenominator: 2, isDotted: false, quarterValue: 2.0 },
    { baseDenominator: 4, isDotted: true, quarterValue: 1.5 },
    { baseDenominator: 4, isDotted: false, quarterValue: 1.0 },
    { baseDenominator: 8, isDotted: true, quarterValue: 0.75 },
    { baseDenominator: 8, isDotted: false, quarterValue: 0.5 },
    { baseDenominator: 16, isDotted: true, quarterValue: 0.375 },
    { baseDenominator: 16, isDotted: false, quarterValue: 0.25 },
    { baseDenominator: 32, isDotted: true, quarterValue: 0.1875 },
    { baseDenominator: 32, isDotted: false, quarterValue: 0.125 },
    { baseDenominator: 64, isDotted: false, quarterValue: 0.0625 },
  ];

  public static decompose(quarterNotes: number): NotationDurationAtom[] {
    let remaining = quarterNotes;
    const result: NotationDurationAtom[] = [];
    const epsilon = 1e-4;

    while (remaining > epsilon) {
      let matched = false;
      for (const standard of this.standardValues) {
        if (remaining >= standard.quarterValue - epsilon) {
          result.push({ ...standard });
          remaining -= standard.quarterValue;
          matched = true;
          break;
        }
      }
      if (!matched) {
        if (remaining > 0) {
          result.push({ baseDenominator: 64, isDotted: false, quarterValue: 0.0625 });
        }
        break;
      }
    }
    return result.length === 0 ? [{ baseDenominator: 4, isDotted: false, quarterValue: 1.0 }] : result;
  }
}

export interface MeasureEvent {
  startOffset: number;
  duration: number;
  content: PlaybackContent;
  tieStart: boolean;
  tieStop: boolean;
  state: PlaybackState;
}

export interface Measure {
  index: number;
  startTime: number;
  nominalDuration: number;
  timeSignature: Beat;
  tempo: number;
  keyOffset: number;
  events: MeasureEvent[];
  directives: PlaybackDirectiveEvent[];
}

interface Interval {
  start: number;
  end: number;
  duration: number;
  beat: Beat;
}

export class TMDMeasureRenderer {
  public static renderMeasures(sheet: Sheet, instrument: string): Measure[] {
    const timeline = TMDPlaybackRenderer.render(sheet, instrument);
    const defaultBeat: Beat =
      sheet.beat && sheet.beat.count > 0 && sheet.beat.noteValue > 0 ? sheet.beat : { count: 4, noteValue: 4 };
    const initialMeasureDuration = (defaultBeat.count * 4.0) / defaultBeat.noteValue;

    const totalDuration = Math.max(timeline.duration, initialMeasureDuration);
    const measureCount = Math.max(1, Math.ceil(totalDuration / initialMeasureDuration));

    const intervals: Interval[] = [];
    let curStart = 0.0;
    let curBeat = defaultBeat;

    const timeSigDirectives = timeline.directives
      .filter((d) => d.kind.type === 'timeSignature')
      .sort((a, b) => a.position - b.position);

    let nextDirectiveIndex = 0;

    while (curStart < totalDuration || intervals.length < measureCount) {
      while (
        nextDirectiveIndex < timeSigDirectives.length &&
        timeSigDirectives[nextDirectiveIndex].position <= curStart
      ) {
        const d = timeSigDirectives[nextDirectiveIndex];
        if (d.kind.type === 'timeSignature') {
          curBeat = d.kind.beat;
        }
        nextDirectiveIndex++;
      }
      const dur = (Math.max(1, curBeat.count) * 4.0) / Math.max(1, curBeat.noteValue);
      const curEnd = curStart + dur;
      intervals.push({ start: curStart, end: curEnd, duration: dur, beat: curBeat });
      curStart = curEnd;
    }

    const measures: Measure[] = [];
    const initialState: PlaybackState = {
      tempo: sheet.speed > 0 ? sheet.speed : DEFAULT_TEMPO_BPM,
      keyOffset: sheet.keySignature.semitoneOffset,
      timeSignature: defaultBeat,
      dynamicLevel: 'mf',
    };
    const orderedDirectives = [...timeline.directives].sort((a, b) => a.position - b.position);
    const stateAt = (position: number): PlaybackState => {
      let state = initialState;
      for (const directive of orderedDirectives) {
        if (directive.position > position) break;
        state = directive.state;
      }
      return state;
    };

    for (let mIdx = 0; mIdx < intervals.length; mIdx++) {
      const interval = intervals[mIdx];
      const mStart = interval.start;
      const mEnd = interval.end;
      const mDuration = interval.duration;
      const mBeat = interval.beat;

      const directivesInMeasure = timeline.directives.filter(
        (d) => d.position >= mStart && d.position < mEnd
      );

      const rawMeasureEvents: MeasureEvent[] = [];
      for (const event of timeline.events) {
        const evStart = event.position;
        const evEnd = event.position + event.duration;
        if (evEnd <= mStart || evStart >= mEnd) {
          continue;
        }

        const clStart = Math.max(mStart, evStart);
        const clEnd = Math.min(mEnd, evEnd);
        const clDur = clEnd - clStart;
        if (clDur <= 0) continue;

        const isNote = event.content.type === 'note';
        const tieStop = isNote && evStart < mStart;
        const tieStart = isNote && evEnd > mEnd;

        rawMeasureEvents.push({
          startOffset: clStart - mStart,
          duration: clDur,
          content: event.content,
          tieStart,
          tieStop,
          state: event.state,
        });
      }

      rawMeasureEvents.sort((a, b) => a.startOffset - b.startOffset);

      const paddedEvents: MeasureEvent[] = [];
      let cursor = 0.0;
      const measureState = stateAt(mStart);

      const epsilon = 1e-4;
      for (const ev of rawMeasureEvents) {
        const gap = ev.startOffset - cursor;
        if (gap > epsilon) {
          paddedEvents.push({
            startOffset: cursor,
            duration: gap,
            content: { type: 'rest' },
          tieStart: false,
          tieStop: false,
          state: stateAt(mStart + cursor),
          });
        }
        paddedEvents.push(ev);
        cursor = Math.max(cursor, ev.startOffset + ev.duration);
      }

      const trailingGap = mDuration - cursor;
      if (trailingGap > epsilon) {
        paddedEvents.push({
          startOffset: cursor,
          duration: trailingGap,
          content: { type: 'rest' },
            tieStart: false,
            tieStop: false,
            state: stateAt(mStart + cursor),
        });
      }

      measures.push({
        index: mIdx,
        startTime: mStart,
        nominalDuration: mDuration,
        timeSignature: mBeat,
        tempo: measureState.tempo,
        keyOffset: measureState.keyOffset,
        events: paddedEvents,
        directives: directivesInMeasure,
      });
    }

    return measures;
  }
}
