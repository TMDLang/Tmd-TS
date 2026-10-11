import { TmdMacroEvaluator } from '../playback/macro.js';
import { PlaybackContent, PlaybackDirectiveEvent, PlaybackEvent, PlaybackState, TmdPlaybackRenderer } from '../playback/playback.js';
import { Beat, DEFAULT_TEMPO_BPM, effectivePlaybackOrders, Sheet } from '../syntax/types.js';

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
      tempo: sheet.speed > 0 ? sheet.speed : DEFAULT_TEMPO_BPM,
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

        rawMeasureEvents.push({
          startOffset: clStart - mStart,
          duration: clDur,
          content: event.content,
          tieStart,
          tieStop,
          state: event.state,
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

    return measures;
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

      const interiorByPos: { position: number; beats: Beat[] }[] = [];
      const trailingBeats: Beat[] = [];

      for (const paragraph of matching) {
        const entryBeat = TmdPlaybackRenderer.entryInitialBeat(paragraph, sheet, currentBeat);
        const pStart = sectionStart + paragraph.start * TmdPlaybackRenderer.measureDuration(entryBeat);
        const minPos = paragraph.start < 0 && sectionStart > 0 ? sectionStart : pStart;
        let pos = pStart;

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
                const idx = interiorByPos.findIndex((item) => Math.abs(item.position - shiftedPos) < 1e-4);
                if (idx >= 0) {
                  if (!interiorByPos[idx].beats.some((existing) => beatsEqual(existing, b))) {
                    interiorByPos[idx].beats.push(b);
                  }
                } else {
                  interiorByPos.push({ position: shiftedPos, beats: [b] });
                }
              }
            }
          }
          pos += totalUnits * unitDur;
        }
      }

      interiorByPos.sort((a, b) => a.position - b.position);
      for (const group of interiorByPos) {
        const remDur = Math.max(0.0, sectionEnd + offset - group.position);
        const chosen = this.selectConductorBeat(group.beats, remDur);
        upsertTimeSignature(group.position, chosen);
        currentBeat = chosen;
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
