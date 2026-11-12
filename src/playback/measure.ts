import { TmdMacroEvaluator } from '../playback/macro.js';
import { PlaybackContent, PlaybackDirectiveEvent, PlaybackEvent, PlaybackLyric, PlaybackState, PlaybackTupletMetadata, TmdPlaybackRenderer } from '../playback/playback.js';
import { Beat, clampTempo, DEFAULT_TEMPO_BPM, effectivePlaybackOrders, Sheet } from '../syntax/types.js';

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
  tuplet?: PlaybackTupletMetadata;
  lyric?: PlaybackLyric;
  stanzaLyrics?: PlaybackLyric[];
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
  sectionName?: string;
  repeatStart?: boolean;
  repeatCount?: number;
  repeatEndCount?: number;
  foldedIntoRepeat?: boolean;
  scoreEnd?: boolean;
  voltaStartNumber?: number;
  voltaEndNumber?: number;
}

interface Interval {
  start: number;
  end: number;
  duration: number;
  beat: Beat;
}

function beatsEqual(a: Beat, b: Beat): boolean {
  return a.count === b.count && a.noteValue === b.noteValue;
}

export class TmdMeasureRenderer {
  public static renderMeasures(inputSheet: Sheet, instrument: string): Measure[] {
    const sheet = TmdMacroEvaluator.expandThrowing(inputSheet);
    const timeline = TmdPlaybackRenderer.render(sheet, instrument);
    const defaultBeat: Beat =
      sheet.beat && sheet.beat.count > 0 && sheet.beat.noteValue > 0 ? sheet.beat : { count: 4, noteValue: 4 };
    const totalDuration = timeline.duration;

    const intervals: Interval[] = [];
    let curStart = 0.0;
    let curBeat = defaultBeat;

    const timeSigDirectives = this.buildScoreTimeSignatures(sheet, defaultBeat);
    let nextDirectiveIndex = 0;

    while (curStart < totalDuration - 1e-6 || intervals.length === 0) {
      while (
        nextDirectiveIndex < timeSigDirectives.length &&
        timeSigDirectives[nextDirectiveIndex].position <= curStart + 1e-6
      ) {
        curBeat = timeSigDirectives[nextDirectiveIndex].beat;
        nextDirectiveIndex++;
      }
      let dur = (Math.max(1, curBeat.count) * 4.0) / Math.max(1, curBeat.noteValue);
      let curEnd = curStart + dur;
      if (nextDirectiveIndex < timeSigDirectives.length) {
        const nextPos = timeSigDirectives[nextDirectiveIndex].position;
        if (nextPos > curStart + 1e-6 && nextPos < curEnd - 1e-6) {
          curEnd = nextPos;
          dur = curEnd - curStart;
        }
      }
      intervals.push({ start: curStart, end: curEnd, duration: dur, beat: curBeat });
      curStart = curEnd;
    }

    const measures: Measure[] = [];
    let activeState: PlaybackState = {
      tempo: sheet.speed > 0 ? clampTempo(sheet.speed) : DEFAULT_TEMPO_BPM,
      keyOffset: sheet.keySignature.semitoneOffset,
      timeSignature: defaultBeat,
      dynamicLevel: 'mf',
    };
    let prevMeasureBeat = defaultBeat;
    const orderedDirectives = [...timeline.directives].sort((a, b) => a.position - b.position);
    const stateAt = (position: number, fallbackState: PlaybackState): PlaybackState => {
      let state = fallbackState;
      for (const directive of orderedDirectives) {
        if (directive.position > position) break;
        if (directive.position >= intervals[0].start) {
          state = {
            ...directive.state,
            timeSignature: fallbackState.timeSignature,
          };
        }
      }
      return state;
    };

    for (let mIdx = 0; mIdx < intervals.length; mIdx++) {
      const interval = intervals[mIdx];
      const mStart = interval.start;
      const mEnd = interval.end;
      const mDuration = interval.duration;
      const mBeat = interval.beat;

      const rawDirectivesInMeasure = timeline.directives.filter(
        (d) => d.position >= mStart && d.position < mEnd
      );

      const epsilon = 1e-4;
      activeState = { ...activeState, timeSignature: mBeat };
      for (const dir of rawDirectivesInMeasure) {
        if (dir.position <= mStart + epsilon) {
          activeState = { ...dir.state, timeSignature: mBeat };
        }
      }

      const directivesInMeasure = rawDirectivesInMeasure.filter((d) => d.kind.type !== 'timeSignature');
      if ((mIdx === 0 && !beatsEqual(mBeat, defaultBeat)) || (mIdx > 0 && !beatsEqual(mBeat, prevMeasureBeat))) {
        directivesInMeasure.unshift({
          position: mStart,
          kind: { type: 'timeSignature', beat: mBeat },
          state: activeState,
        });
      }
      prevMeasureBeat = mBeat;

      const rawMeasureEvents: MeasureEvent[] = [];
      for (const event of timeline.events) {
        if (event.content.type === 'rest') continue;
        const evStart = event.position;
        const evEnd = event.position + event.duration;
        if (evEnd <= mStart + 1e-6 || evStart >= mEnd - 1e-6) {
          continue;
        }

        const clStart = Math.max(mStart, evStart);
        const clEnd = Math.min(mEnd, evEnd);
        const clDur = clEnd - clStart;
        if (clDur <= 1e-6) continue;

        const isNote = event.content.type === 'note';
        const tieStop = isNote && evStart < mStart - 1e-6;
        const tieStart = isNote && evEnd > mEnd + 1e-6;

        let eventLyric: PlaybackLyric | undefined;
        let eventStanzaLyrics: PlaybackLyric[] | undefined;
        if (!tieStop && event.lyric) {
          eventLyric = event.lyric;
          eventStanzaLyrics = event.stanzaLyrics;
        } else if (tieStop && event.lyric) {
          eventLyric = {
            kind: 'tie',
            text: '-',
            rawText: '-',
            cleanWord: '-',
            ...(event.lyric.stanza !== undefined ? { stanza: event.lyric.stanza } : {}),
          };
          if (event.stanzaLyrics) {
            eventStanzaLyrics = event.stanzaLyrics.map((sl) => ({
              kind: 'tie' as const,
              text: '-',
              rawText: '-',
              cleanWord: '-',
              ...(sl.stanza !== undefined ? { stanza: sl.stanza } : {}),
            }));
          }
        }

        rawMeasureEvents.push({
          startOffset: clStart - mStart,
          duration: clDur,
          content: event.content,
          tieStart,
          tieStop,
          state: event.state,
          tuplet: Math.abs(clDur - event.duration) < 1e-6 ? event.tuplet : undefined,
          ...(eventLyric ? { lyric: eventLyric } : {}),
          ...(eventStanzaLyrics ? { stanzaLyrics: eventStanzaLyrics } : {}),
        });
      }

      for (const event of timeline.events) {
        if (event.content.type !== 'rest') continue;
        const evStart = event.position;
        const evEnd = event.position + event.duration;
        if (evEnd <= mStart + 1e-6 || evStart >= mEnd - 1e-6) {
          continue;
        }

        const clStart = Math.max(mStart, evStart);
        const clEnd = Math.min(mEnd, evEnd);
        const clDur = clEnd - clStart;
        if (clDur <= 1e-6) continue;

        const relStart = clStart - mStart;
        const relEnd = relStart + clDur;
        const overlapsExisting = rawMeasureEvents.some((existing) => {
          const exStart = existing.startOffset;
          const exEnd = exStart + existing.duration;
          return relStart < exEnd - epsilon && relEnd > exStart + epsilon;
        });
        if (!overlapsExisting) {
          rawMeasureEvents.push({
            startOffset: relStart,
            duration: clDur,
            content: event.content,
            tieStart: false,
            tieStop: false,
            state: event.state,
            tuplet: Math.abs(clDur - event.duration) < 1e-6 ? event.tuplet : undefined,
            ...(event.lyric ? { lyric: event.lyric } : {}),
            ...(event.stanzaLyrics ? { stanzaLyrics: event.stanzaLyrics } : {}),
          });
        }
      }

      rawMeasureEvents.sort((a, b) => a.startOffset - b.startOffset);
      const hasChordEvent = rawMeasureEvents.some((ev) => ev.content.type === 'chord');
      if (!hasChordEvent) {
        for (let i = 0; i < rawMeasureEvents.length; i++) {
          const ev = rawMeasureEvents[i];
          const nextEv = rawMeasureEvents
            .slice(i + 1)
            .find((candidate) => candidate.startOffset > ev.startOffset + epsilon);
          if (nextEv) {
            const maxDur = nextEv.startOffset - ev.startOffset;
            if (ev.duration > maxDur + epsilon) {
              rawMeasureEvents[i] = {
                ...ev,
                duration: maxDur,
                tieStart: false,
              };
            }
          }
        }
      }

      const paddedEvents: MeasureEvent[] = [];
      let cursor = 0.0;
      if (rawMeasureEvents.length > 0 && rawMeasureEvents[0].startOffset <= epsilon) {
        activeState = { ...rawMeasureEvents[0].state, timeSignature: mBeat };
      }
      const measureState = stateAt(mStart, activeState);

      for (const ev of rawMeasureEvents) {
        const gap = ev.startOffset - cursor;
        if (gap > epsilon) {
          paddedEvents.push({
            startOffset: cursor,
            duration: gap,
            content: { type: 'rest' },
            tieStart: false,
            tieStop: false,
            state: stateAt(mStart + cursor, measureState),
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
          state: stateAt(mStart + cursor, rawMeasureEvents[rawMeasureEvents.length - 1]?.state ?? measureState),
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

      if (rawMeasureEvents.length > 0) {
        activeState = rawMeasureEvents[rawMeasureEvents.length - 1].state;
      }
      if (rawDirectivesInMeasure.length > 0) {
        const lastDirective = rawDirectivesInMeasure[rawDirectivesInMeasure.length - 1];
        const lastEventPos =
          rawMeasureEvents.length > 0
            ? mStart + rawMeasureEvents[rawMeasureEvents.length - 1].startOffset
            : -1.0;
        if (lastDirective.position >= lastEventPos - epsilon) {
          activeState = lastDirective.state;
        }
      }
      activeState = { ...activeState, timeSignature: mBeat };
    }

    return this.annotateEngraving(measures, sheet);
  }

  private static annotateEngraving(measures: Measure[], sheet: Sheet): Measure[] {
    if (measures.length === 0) return measures;
    const result = measures.map((measure) => ({ ...measure }));
    let cursor = 0;
    const occurrences: Array<{ name: string; stanza?: number; start: number; end: number }> = [];
    for (const order of effectivePlaybackOrders(sheet)) {
      if (order.type !== 'name') continue;
      const start = cursor;
      const duration = TmdPlaybackRenderer.durationOf(order.name, sheet);
      const startTime = measures[start]?.startTime ?? 0;
      while (cursor < measures.length && measures[cursor].startTime < startTime + duration - 1e-5) cursor++;
      if (cursor > start) occurrences.push({ name: order.name, stanza: order.stanza, start, end: cursor });
    }
    let i = 0;
    while (i < occurrences.length) {
      const occurrence = occurrences[i];
      for (let m = occurrence.start; m < occurrence.end; m++) {
        result[m] = { ...result[m], sectionName: occurrence.name, scoreEnd: m === measures.length - 1 };
      }
      let count = 1;
      let next = i + 1;
      while (next < occurrences.length && occurrences[next].name === occurrence.name
        && this.engravingEquivalent(measures, occurrence.start, occurrence.end, occurrences[next].start, occurrences[next].end)) {
        count++;
        const later = occurrences[next];
        for (let m = later.start; m < later.end; m++) {
          const base = occurrence.start + (m - later.start);
          if (base < result.length) {
            const lhs = result[base];
            const rhs = result[m];
            const events = lhs.events.map((event, index) => ({
              ...event,
              stanzaLyrics: index < rhs.events.length
                ? [...(event.stanzaLyrics ?? []), ...(rhs.events[index].stanzaLyrics ?? []).filter((lyric) =>
                    !event.stanzaLyrics?.some((existing) => existing.stanza === lyric.stanza))]
                : event.stanzaLyrics,
            }));
            result[base] = { ...lhs, events };
          }
          result[m] = { ...result[m], foldedIntoRepeat: true, repeatStart: false, repeatCount: 0, repeatEndCount: 0 };
        }
        next++;
      }
      if (count > 1) {
        result[occurrence.start] = { ...result[occurrence.start], repeatStart: true, repeatCount: count, repeatEndCount: 0 };
        result[occurrence.end - 1] = { ...result[occurrence.end - 1], repeatEndCount: count };
      } else {
        const stanzaCount = this.stanzaCount(occurrence.name, sheet);
        if (occurrence.stanza === undefined && stanzaCount > 1) {
          let rangeStart: number | undefined;
          for (let m = occurrence.start; m < occurrence.end; m++) {
            const hasMultipleStanzas = result[m].events.some((event) => (event.stanzaLyrics?.length ?? 0) > 1);
            if (hasMultipleStanzas && rangeStart === undefined) rangeStart = m;
            if ((!hasMultipleStanzas || m === occurrence.end - 1) && rangeStart !== undefined) {
              const last = hasMultipleStanzas ? m : m - 1;
              result[rangeStart] = { ...result[rangeStart], repeatStart: true, repeatCount: stanzaCount, repeatEndCount: 0 };
              result[last] = { ...result[last], repeatEndCount: stanzaCount };
              rangeStart = undefined;
            }
          }
        }
      }
      i = next;
    }
    for (let i = 0; i + 3 < occurrences.length; i++) {
      const first = occurrences[i];
      const endingOne = occurrences[i + 1];
      const repeated = occurrences[i + 2];
      const endingTwo = occurrences[i + 3];
      if (first.name !== repeated.name || endingOne.name === endingTwo.name ||
          !this.isQualifiedVoltaName(endingOne.name) || !this.isQualifiedVoltaName(endingTwo.name) ||
          !this.engravingEquivalent(measures, first.start, first.end, repeated.start, repeated.end)) continue;
      result[first.start] = { ...result[first.start], repeatStart: true, repeatCount: 2 };
      this.mergeLyrics(measures, repeated, first, result);
      for (let m = repeated.start; m < repeated.end; m++) result[m] = { ...result[m], foldedIntoRepeat: true };
      result[first.end - 1] = { ...result[first.end - 1], repeatEndCount: 0 };
      result[endingOne.start] = { ...result[endingOne.start], voltaStartNumber: 1 };
      result[endingOne.end - 1] = { ...result[endingOne.end - 1], voltaEndNumber: 1 };
      result[endingTwo.start] = { ...result[endingTwo.start], voltaStartNumber: 2 };
      result[endingTwo.end - 1] = { ...result[endingTwo.end - 1], voltaEndNumber: 2 };
    }
    for (let i = 0; i + 3 < occurrences.length; i++) {
      const first = occurrences[i];
      const second = occurrences[i + 1];
      const repeatedFirst = occurrences[i + 2];
      const repeatedSecond = occurrences[i + 3];
      if (first.name !== repeatedFirst.name || second.name !== repeatedSecond.name ||
          this.isQualifiedVoltaName(second.name) ||
          !this.engravingEquivalent(measures, first.start, first.end, repeatedFirst.start, repeatedFirst.end) ||
          !this.engravingEquivalent(measures, second.start, second.end, repeatedSecond.start, repeatedSecond.end)) continue;
      this.mergeLyrics(measures, repeatedFirst, first, result);
      this.mergeLyrics(measures, repeatedSecond, second, result);
      for (let m = repeatedFirst.start; m < repeatedFirst.end; m++) result[m] = { ...result[m], foldedIntoRepeat: true };
      for (let m = repeatedSecond.start; m < repeatedSecond.end; m++) result[m] = { ...result[m], foldedIntoRepeat: true };
      result[first.start] = { ...result[first.start], repeatStart: true, repeatCount: 2, repeatEndCount: 0 };
      result[second.end - 1] = { ...result[second.end - 1], repeatEndCount: 2 };
    }
    return result;
  }

  private static mergeLyrics(measures: Measure[], source: { start: number; end: number; stanza?: number }, target: { start: number; end: number }, result: Measure[]): void {
    for (let offset = 0; offset < Math.min(source.end - source.start, target.end - target.start); offset++) {
      const sourceEvents = measures[source.start + offset].events;
      const targetIndex = target.start + offset;
      result[targetIndex] = { ...result[targetIndex], events: result[targetIndex].events.map((event, index) => ({
        ...event,
        stanzaLyrics: index < sourceEvents.length
          ? [...(event.stanzaLyrics ?? []), ...(sourceEvents[index].stanzaLyrics ?? []).filter((lyric) =>
              !event.stanzaLyrics?.some((existing) => existing.stanza === lyric.stanza))]
          : event.stanzaLyrics,
      })) };
    }
  }

  private static stanzaCount(name: string, sheet: Sheet): number {
    const stanzas = sheet.entries.filter((entry) => entry.name === name)
      .flatMap((entry) => entry.sections.flatMap((section) => (section.lyrics ?? []).map((line) => line.stanza)))
      .filter((stanza): stanza is number => stanza !== undefined && stanza > 0);
    return new Set(stanzas).size;
  }

  private static isQualifiedVoltaName(name: string): boolean {
    return new Set(['ending1', 'ending2', 'a1', 'a2', 'e1', 'e2', 'volta1', 'volta2']).has(name.toLowerCase());
  }

  private static engravingEquivalent(measures: Measure[], lhsStart: number, lhsEnd: number, rhsStart: number, rhsEnd: number): boolean {
    if (lhsEnd - lhsStart !== rhsEnd - rhsStart) return false;
    for (let offset = 0; offset < lhsEnd - lhsStart; offset++) {
      const left = measures[lhsStart + offset];
      const right = measures[rhsStart + offset];
      if (left.nominalDuration !== right.nominalDuration ||
          left.timeSignature.count !== right.timeSignature.count ||
          left.timeSignature.noteValue !== right.timeSignature.noteValue ||
          left.events.length !== right.events.length ||
          left.directives.map((d) => JSON.stringify(d.kind)).join('|') !== right.directives.map((d) => JSON.stringify(d.kind)).join('|')) return false;
      for (let i = 0; i < left.events.length; i++) {
        const a = left.events[i];
        const b = right.events[i];
        if (a.startOffset !== b.startOffset || a.duration !== b.duration || JSON.stringify(a.content) !== JSON.stringify(b.content) ||
            a.state.tempo !== b.state.tempo || a.state.keyOffset !== b.state.keyOffset || a.state.dynamicLevel !== b.state.dynamicLevel) return false;
      }
    }
    return true;
  }

  private static buildScoreTimeSignatures(sheet: Sheet, defaultBeat: Beat): { position: number; beat: Beat }[] {
    const orders = effectivePlaybackOrders(sheet);
    const globalMin = TmdPlaybackRenderer.globalEarliestPosition(sheet);
    const offset = globalMin < 0.0 ? -globalMin : 0.0;
    const schedule: { position: number; beat: Beat }[] = [];

    const upsertTimeSignature = (position: number, beat: Beat) => {
      const idx = schedule.findIndex((item) => Math.abs(item.position - position) < 1e-4);
      if (idx >= 0) {
        schedule[idx] = { position, beat };
      } else {
        schedule.push({ position, beat });
        schedule.sort((a, b) => a.position - b.position);
      }
    };

    let sectionStart = 0.0;
    let currentBeat = defaultBeat;

    if (offset > 0) {
      for (const order of orders) {
        if (order.type === 'name') {
          const matching = sheet.entries.filter(
            (p) => p.name === order.name && !p.isPrototype && p.start < 0
          );
          if (matching.length > 0) {
            const b = TmdPlaybackRenderer.entryInitialBeat(matching[0], sheet, defaultBeat);
            upsertTimeSignature(0.0, b);
            currentBeat = b;
          }
          break;
        }
      }
    }

    for (const order of orders) {
      if (order.type !== 'name') continue;
      const secName = order.name;
      const secDur = TmdPlaybackRenderer.durationOf(secName, sheet, currentBeat);
      const sectionEnd = sectionStart + secDur;
      const matching = sheet.entries.filter((p) => p.name === secName && !p.isPrototype);
      if (matching.length === 0) {
        sectionStart = sectionEnd;
        continue;
      }

      const paragraphSchedules: { position: number; beat: Beat }[][] = [];
      const explicitSchedules: { position: number; beat: Beat }[][] = [];
      const initialCandidates: Beat[] = [];
      const trailingBeats: Beat[] = [];

      for (const paragraph of matching) {
        const entryBeat = TmdPlaybackRenderer.entryInitialBeat(paragraph, sheet, currentBeat);
        if (!initialCandidates.some((existing) => beatsEqual(existing, entryBeat))) {
          initialCandidates.push(entryBeat);
        }
        const pStart = sectionStart + paragraph.start * TmdPlaybackRenderer.measureDuration(entryBeat);
        const minPos = paragraph.start < 0 && sectionStart > 0 ? sectionStart : pStart;
        let pos = pStart;
        const pSchedule: { position: number; beat: Beat }[] = [];
        let hasExplicitInterior = false;

        for (const section of paragraph.sections) {
          const unitDur = 4.0 / Math.max(1, section.noteLength);
          const totalUnits = section.unitGroups.reduce((sum, g) => sum + Math.max(0, g.length), 0);
          for (const dir of section.directives) {
            if (dir.kind.type === 'timeSignature') {
              const b = dir.kind.beat;
              const rawPos = pos + Math.max(0, dir.position) * unitDur;
              const effectivePos = Math.max(rawPos, minPos);
              const shiftedPos = effectivePos + offset;
              const isTrailing = dir.position >= totalUnits && effectivePos >= sectionEnd - 1e-6;
              if (isTrailing) {
                if (!trailingBeats.some((existing) => beatsEqual(existing, b))) {
                  trailingBeats.push(b);
                }
              } else {
                hasExplicitInterior = true;
                const idx = pSchedule.findIndex((item) => Math.abs(item.position - shiftedPos) < 1e-4);
                if (idx >= 0) {
                  pSchedule[idx] = { position: shiftedPos, beat: b };
                } else {
                  pSchedule.push({ position: shiftedPos, beat: b });
                  pSchedule.sort((a, bItem) => a.position - bItem.position);
                }
              }
            }
          }
          pos += totalUnits * unitDur;
        }

        const startShifted = minPos + offset;
        if (!pSchedule.some((item) => Math.abs(item.position - startShifted) < 1e-4)) {
          pSchedule.unshift({ position: startShifted, beat: entryBeat });
        }
        paragraphSchedules.push(pSchedule);
        if (hasExplicitInterior) {
          explicitSchedules.push(pSchedule);
        }
      }

      const schedulesEqual = (
        lhs: { position: number; beat: Beat }[],
        rhs: { position: number; beat: Beat }[]
      ): boolean => {
        if (lhs.length !== rhs.length) return false;
        for (let i = 0; i < lhs.length; i++) {
          if (Math.abs(lhs[i].position - rhs[i].position) >= 1e-4 || !beatsEqual(lhs[i].beat, rhs[i].beat)) {
            return false;
          }
        }
        return true;
      };

      if (explicitSchedules.length > 0) {
        const firstExplicit = explicitSchedules[0];
        const explicitDisagree = explicitSchedules.slice(1).some((s) => !schedulesEqual(s, firstExplicit));
        if (explicitDisagree) {
          const chosen = this.selectConductorBeat(initialCandidates, secDur);
          upsertTimeSignature(sectionStart + offset, chosen);
          currentBeat = chosen;
        } else {
          for (const item of firstExplicit) {
            upsertTimeSignature(item.position, item.beat);
            currentBeat = item.beat;
          }
        }
      }

      if (trailingBeats.length > 0) {
        const chosenTrailing = trailingBeats[0];
        upsertTimeSignature(sectionEnd + offset, chosenTrailing);
        currentBeat = chosenTrailing;
      }

      sectionStart = sectionEnd;
    }

    return schedule;
  }

  private static selectConductorBeat(candidates: Beat[], sectionDuration: number): Beat {
    if (candidates.length === 0) return { count: 4, noteValue: 4 };
    if (candidates.length === 1) return candidates[0];

    const divisible = candidates.filter((b) => {
      const dur = TmdPlaybackRenderer.measureDuration(b);
      if (dur <= 1e-6 || sectionDuration <= 1e-4) return false;
      const bars = sectionDuration / dur;
      return Math.abs(Math.round(bars) - bars) < 1e-3 && Math.round(bars) >= 1.0;
    });
    const pool = divisible.length > 0 ? divisible : candidates;

    const rank = (b: Beat): [number, number, number] => {
      let tier = 3;
      if (b.noteValue === 4 && b.count >= 2 && b.count <= 6) {
        tier = 0;
      } else if (b.noteValue === 8 && b.count >= 3 && b.count <= 12) {
        tier = 1;
      } else if (b.noteValue === 2 && b.count >= 2 && b.count <= 4) {
        tier = 2;
      }
      const dur = TmdPlaybackRenderer.measureDuration(b);
      return [tier, Math.abs(dur - 4.0), -dur];
    };

    let best = pool[0];
    let bestRank = rank(best);
    for (let i = 1; i < pool.length; i++) {
      const r = rank(pool[i]);
      if (
        r[0] < bestRank[0] ||
        (r[0] === bestRank[0] && r[1] < bestRank[1] - 1e-6) ||
        (r[0] === bestRank[0] && Math.abs(r[1] - bestRank[1]) <= 1e-6 && r[2] < bestRank[2] - 1e-6)
      ) {
        best = pool[i];
        bestRank = r;
      }
    }
    return best;
  }

  public static groupSimultaneousEvents(events: MeasureEvent[]): MeasureEvent[][] {
    const groups: MeasureEvent[][] = [];
    for (const event of events) {
      if (
        groups.length > 0 &&
        Math.abs(event.startOffset - groups[groups.length - 1][0].startOffset) < 1e-4
      ) {
        groups[groups.length - 1].push(event);
      } else {
        groups.push([event]);
      }
    }
    return groups;
  }
}
