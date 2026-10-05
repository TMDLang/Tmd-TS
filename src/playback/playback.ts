import {
  Beat,
  ChordSymbol,
  DEFAULT_INSTRUMENT,
  DEFAULT_TEMPO_BPM,
  DynamicMark,
  Entry,
  KeySignature,
  Note,
  Playback,
  SectionDirective,
  SectionDirectiveKind,
  Sheet,
  Unit,
} from "../syntax/types.js";
import { TMDMacroEvaluator } from "./macro.js";

export type PlaybackContent =
  | { type: "note"; note: Note }
  | { type: "chord"; chord: ChordSymbol }
  | { type: "rest" }
  | { type: "percussion"; pattern: string };

export interface PlaybackState {
  tempo: number;
  keyOffset: number;
  timeSignature: Beat;
  dynamicLevel: DynamicMark;
}

export interface PlaybackEvent {
  position: number;
  duration: number;
  content: PlaybackContent;
  state: PlaybackState;
}

export interface PlaybackDirectiveEvent {
  position: number;
  kind: SectionDirectiveKind;
  state: PlaybackState;
}

export interface PlaybackTimeline {
  events: PlaybackEvent[];
  directives: PlaybackDirectiveEvent[];
  duration: number;
  assignment?: string;
  track?: PlaybackTrack;
}

export interface PlaybackTrack {
  assignment: string;
  events: PlaybackEvent[];
  directives: PlaybackDirectiveEvent[];
  duration: number;
}

export interface PlaybackValidationIssue {
  sectionName: string;
  assignment: string;
  firstOffset: number;
  secondOffset: number;
  description: string;
}

export interface PlaybackTempoConflict {
  position: number;
  tempos: number[];
}

export interface TMDPlaybackRendererOptions {
  startOrderIndex?: number;
}

export class TMDPlaybackRenderer {
  private static visitOrder(order: Playback, state: PlaybackState): { state: PlaybackState; name?: string } {
    if (order.type === "relative") {
      const delta = parseInt(order.value.replace("+", ""), 10);
      return Number.isNaN(delta) ? { state } : { state: { ...state, keyOffset: state.keyOffset + delta } };
    }
    if (order.type === "absolute") {
      return { state: { ...state, keyOffset: KeySignature.parse(order.value).semitoneOffset } };
    }
    return order.type === "name" ? { state, name: order.name } : { state };
  }

  private static ordersFor(sheet: Sheet): Playback[] {
    if (sheet.playback.length > 0) return sheet.playback;
    return Array.from(new Set(sheet.entries.map((entry) => entry.name)))
      .map((name) => ({ type: "name" as const, name }));
  }

  private static initialStateFor(sheet: Sheet): PlaybackState {
    return {
      tempo: sheet.speed > 0 ? sheet.speed : DEFAULT_TEMPO_BPM,
      keyOffset: sheet.keySignature.semitoneOffset,
      timeSignature: sheet.beat,
      dynamicLevel: "mf"
    };
  }

  public static validateTempoConflicts(inputSheet: Sheet): PlaybackTempoConflict[] {
    const sheet = TMDMacroEvaluator.expandThrowing(inputSheet);
    const assignments = Array.from(new Set(
      sheet.entries
        .map((entry) => entry.assignment)
        .filter((assignment): assignment is string => Boolean(assignment))
    ));
    const directives = assignments.flatMap((assignment) => this.render(sheet, assignment).directives);
    const grouped = new Map<number, PlaybackDirectiveEvent[]>();
    for (const directive of directives) {
      const values = grouped.get(directive.position) ?? [];
      values.push(directive);
      grouped.set(directive.position, values);
    }
    return Array.from(grouped.entries())
      .map(([position, values]) => ({
        position,
        tempos: Array.from(new Set(values.flatMap((value) => value.kind.type === "tempo" ? [value.kind.bpm] : []))).sort((a, b) => a - b)
      }))
      .filter((conflict) => conflict.tempos.length > 1)
      .sort((a, b) => a.position - b.position);
  }

  public static validate(inputSheet: Sheet): PlaybackValidationIssue[] {
    const sheet = TMDMacroEvaluator.expandThrowing(inputSheet);
    const grouped = new Map<string, Entry[]>();
    for (const entry of sheet.entries.filter((paragraph) => paragraph.assignment)) {
      const assignment = entry.assignment!;
      const key = `${entry.name.toLowerCase()}\u0000${assignment.toLowerCase()}`;
      const values = grouped.get(key) ?? [];
      values.push(entry);
      grouped.set(key, values);
    }

    const issues: PlaybackValidationIssue[] = [];
    for (const entries of grouped.values()) {
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const first = this.entryRange(entries[i], sheet.beat);
          const second = this.entryRange(entries[j], sheet.beat);
          if (Math.max(first.start, second.start) < Math.min(first.end, second.end)) {
            const entry = entries[i];
            const assignment = entry.assignment!;
            issues.push({
              sectionName: entry.name,
              assignment,
              firstOffset: entries[i].start,
              secondOffset: entries[j].start,
              description: `Overlapping entries for assignment ${entry.assignment} in section ${entry.name} at offsets ${entries[i].start} and ${entries[j].start}`
            });
          }
        }
      }
    }
    return issues;
  }

  private static entryRange(entry: Entry, beat: Beat): { start: number; end: number } {
    const duration = entry.sections.reduce((total, section) => {
      const unitDuration = 4.0 / Math.max(1, section.noteLength);
      return total + section.unitGroups.reduce((sum, group) => sum + Math.max(0, group.length) * unitDuration, 0);
    }, 0);
    const start = entry.start * this.measureDuration(beat);
    return { start, end: start + duration };
  }

  public static render(
    inputSheet: Sheet,
    instrument: string,
    options?: TMDPlaybackRendererOptions
  ): PlaybackTimeline {
    const sheet = TMDMacroEvaluator.expandThrowing(inputSheet);
    const targetInst = instrument || DEFAULT_INSTRUMENT;
      const paragraphs = sheet.entries.filter((p) => {
      const pInst = p.assignment || DEFAULT_INSTRUMENT;
      return pInst.toLocaleLowerCase() === targetInst.toLocaleLowerCase()
        || p.assignment?.toLocaleLowerCase() === instrument.toLocaleLowerCase();
    });
    const orders = this.ordersFor(sheet);
    let state = this.initialStateFor(sheet);

    let events: PlaybackEvent[] = [];
    let directives: PlaybackDirectiveEvent[] = [];
    let timelinePosition = 0.0;
    const startIndex = options?.startOrderIndex ?? 0;

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const visited = this.visitOrder(order, state);
      state = visited.state;
      if (visited.name !== undefined) {
        const matchingParagraphs = paragraphs.filter((p) => p.name === visited.name);
        const paragraphDuration = TMDPlaybackRenderer.durationOf(visited.name, sheet, state.timeSignature);
        if (i < startIndex) {
          // If before startOrderIndex, accumulate directives and key/tempo/meter state from paragraph
          for (const paragraph of matchingParagraphs) {
            const start = timelinePosition + paragraph.start * TMDPlaybackRenderer.measureDuration(state.timeSignature);
            const paragraphState = paragraph.pitchMode === "fixed" ? { ...state, keyOffset: 0 } : state;
            const rendered = TMDPlaybackRenderer.renderParagraph(paragraph, start, paragraphState, paragraph.pitchMode === "fixed");
            state = {
              ...rendered.state,
              keyOffset: paragraph.pitchMode === "fixed" ? state.keyOffset : rendered.state.keyOffset,
              timeSignature: state.timeSignature
            };
          }
          continue;
        }

        if (matchingParagraphs.length === 0) {
          timelinePosition += paragraphDuration;
          continue;
        }

        for (const paragraph of matchingParagraphs) {
          const start = timelinePosition + paragraph.start * TMDPlaybackRenderer.measureDuration(state.timeSignature);
          const paragraphState = paragraph.pitchMode === "fixed" ? { ...state, keyOffset: 0 } : state;
          const rendered = TMDPlaybackRenderer.renderParagraph(paragraph, start, paragraphState, paragraph.pitchMode === "fixed");
          events.push(...rendered.events);
          directives.push(...rendered.directives);
          state = {
            ...rendered.state,
            keyOffset: paragraph.pitchMode === "fixed" ? state.keyOffset : rendered.state.keyOffset,
            timeSignature: state.timeSignature
          };
        }
        timelinePosition += paragraphDuration;
      }
    }

    const minEventPos = events.length > 0 ? Math.min(...events.map((e) => e.position)) : 0.0;
    const minDirPos = directives.length > 0 ? Math.min(...directives.map((d) => d.position)) : 0.0;
    const earliestPosition = Math.min(
      TMDPlaybackRenderer.globalEarliestPosition(sheet),
      minEventPos,
      minDirPos
    );
    const offset = earliestPosition < 0.0 ? -earliestPosition : 0.0;

    const adjustedEvents: PlaybackEvent[] = events.map((e) => ({
      ...e,
      position: e.position + offset
    }));

    const adjustedDirectives: PlaybackDirectiveEvent[] = directives.map((d) => ({
      ...d,
      position: d.position + offset
    }));

    adjustedEvents.sort((a, b) => a.position - b.position);
    adjustedDirectives.sort((a, b) => a.position - b.position);

    const timeline: PlaybackTimeline = {
      events: adjustedEvents,
      directives: adjustedDirectives,
      duration: timelinePosition + offset
    };
    if (paragraphs.length > 0 || instrument) {
      timeline.assignment = paragraphs[0]?.assignment || instrument;
      timeline.track = {
        assignment: timeline.assignment,
        events: timeline.events,
        directives: timeline.directives,
        duration: timeline.duration
      };
    }
    return timeline;
  }

  /** Renders a score-level conductor timeline by merging directives from every concrete instrument. */
  public static renderConductor(inputSheet: Sheet, options?: TMDPlaybackRendererOptions): PlaybackTimeline {
    const sheet = TMDMacroEvaluator.expandThrowing(inputSheet);
    const instruments = Array.from(new Set(
      sheet.entries.map((p) => p.assignment).filter((assignment): assignment is string => Boolean(assignment && assignment.trim()))
    )).sort();
    const sourceTimelines = instruments.map((instrument) => this.render(sheet, instrument, options));
    const merged: PlaybackDirectiveEvent[] = [];

    for (const timeline of sourceTimelines) {
      for (const directive of timeline.directives) {
        if (merged.some((existing) => existing.position === directive.position &&
          JSON.stringify(existing.kind) === JSON.stringify(directive.kind))) {
          continue;
        }
        merged.push(directive);
      }
    }

    let state: PlaybackState = {
      tempo: sheet.speed > 0 ? sheet.speed : DEFAULT_TEMPO_BPM,
      keyOffset: sheet.keySignature.semitoneOffset,
      timeSignature: sheet.beat,
      dynamicLevel: "mf",
    };
    const directives = merged
      .map((directive, index) => ({ directive, index }))
      .sort((a, b) => a.directive.position - b.directive.position || a.index - b.index)
      .map(({ directive }) => directive)
      .map((directive) => {
        state = this.applyDirective(directive.kind, state);
        return { position: directive.position, kind: directive.kind, state };
      });

    return {
      events: [],
      directives,
      duration: Math.max(0, ...sourceTimelines.map((timeline) => timeline.duration)),
    };
  }

  private static renderParagraph(
    paragraph: Entry,
    start: number,
    initialState: PlaybackState,
    fixedPitch = false
  ): { events: PlaybackEvent[]; directives: PlaybackDirectiveEvent[]; state: PlaybackState; duration: number } {
    let state = { ...initialState };
    const events: PlaybackEvent[] = [];
    const directives: PlaybackDirectiveEvent[] = [];
    let position = start;

    for (const section of paragraph.sections) {
      const unitDuration = 4.0 / Math.max(1, section.noteLength);
      const sortedDirectives = [...section.directives].sort((a, b) => a.position - b.position);
      let directiveIndex = 0;
      let sectionPosition = 0;

      for (const group of section.unitGroups) {
        while (directiveIndex < sortedDirectives.length && sortedDirectives[directiveIndex].position <= sectionPosition) {
          const dir = sortedDirectives[directiveIndex];
          state = TMDPlaybackRenderer.applyDirective(dir.kind, state, fixedPitch);
          directives.push({ position, kind: dir.kind, state });
          directiveIndex++;
        }

        const groupDuration = Math.max(0, group.length) * unitDuration;
        const activeUnits = group.units.filter((u) => u.type !== "tie");

        if (activeUnits.length === 0) {
          if (events.length > 0) {
            const lastPosition = events[events.length - 1].position;
            for (let i = events.length - 1; i >= 0 && Math.abs(events[i].position - lastPosition) < 1e-6; i--) {
              events[i] = { ...events[i], duration: events[i].duration + groupDuration };
            }
          } else {
            events.push({ position, duration: groupDuration, content: { type: "rest" }, state });
          }
        } else {
          // If the group contains internal ties (e.g. (1 2 3 -)%(--)), calculate slots based on total units
          // Each slot in the tuplet has baseSlotDuration = groupDuration / group.units.length
          const baseSlotDuration = groupDuration / Math.max(1, group.units.length);
          let currentEventIndices: number[] = [];

          group.units.forEach((unit, idx) => {
            if (unit.type === "tie") {
              if (currentEventIndices.length > 0) {
                for (const index of currentEventIndices) events[index].duration += baseSlotDuration;
              } else if (events.length > 0) {
                // Leading tie inside group extends last event from preceding group
                const last = events[events.length - 1];
                last.duration += baseSlotDuration;
              } else {
                events.push({ position: position + idx * baseSlotDuration, duration: baseSlotDuration, content: { type: "rest" }, state });
                currentEventIndices = [events.length - 1];
              }
            } else {
              const content = TMDPlaybackRenderer.contentOf(unit);
              if (unit.type === "multiNote") {
                currentEventIndices = [];
                for (const note of unit.notes) {
                  events.push({ position: position + idx * baseSlotDuration, duration: baseSlotDuration, content: { type: "note", note }, state });
                  currentEventIndices.push(events.length - 1);
                }
              } else if (content) {
                events.push({ position: position + idx * baseSlotDuration, duration: baseSlotDuration, content, state });
                currentEventIndices = [events.length - 1];
              }
            }
          });
        }

        position += groupDuration;
        sectionPosition += group.length;
      }

      while (directiveIndex < sortedDirectives.length) {
        const dir = sortedDirectives[directiveIndex];
        state = TMDPlaybackRenderer.applyDirective(dir.kind, state, fixedPitch);
        directives.push({ position, kind: dir.kind, state });
        directiveIndex++;
      }
    }

    return { events, directives, state, duration: position - start };
  }

  private static contentOf(unit: Unit): PlaybackContent | null {
    switch (unit.type) {
      case "note": return { type: "note", note: unit.note };
      case "multiNote": return null;
      case "chord": return { type: "chord", chord: unit.chord };
      case "rest": return { type: "rest" };
      case "percussion": return { type: "percussion", pattern: unit.pattern };
      case "tie": return null;
    }
  }

  private static applyDirective(kind: SectionDirectiveKind, state: PlaybackState, fixedPitch = false): PlaybackState {
    if (fixedPitch && (kind.type === "absoluteKey" || kind.type === "relativeKey" || kind.type === "explicitKey" || kind.type === "fixedPitch")) {
      return state;
    }
    switch (kind.type) {
      case "tempo":
        return { ...state, tempo: Math.max(1, kind.bpm) };
      case "relativeTempo":
        return { ...state, tempo: Math.max(1, state.tempo + kind.deltaBpm) };
      case "absoluteKey":
        return { ...state, keyOffset: KeySignature.parse(kind.key).semitoneOffset };
      case "relativeKey":
        return { ...state, keyOffset: state.keyOffset + kind.semitones };
      case "explicitKey":
        // `key=` is notation metadata only; it must not alter sounding pitch.
        return state;
      case "dynamics":
        return { ...state, dynamicLevel: kind.mark };
      case "fixedPitch":
        return { ...state, keyOffset: 0 };
      case "timeSignature":
        return { ...state, timeSignature: kind.beat };
    }
  }

  public static durationOf(name: string, sheet: Sheet, beat: Beat = sheet.beat): number {
    const matching = sheet.entries.filter((p) => p.name === name);
    if (matching.length === 0) return 0;

    return Math.max(
      ...matching.map((p) => {
        const lead = p.start * TMDPlaybackRenderer.measureDuration(beat);
        const sectionsDuration = p.sections.reduce((tot, sec) => {
          const unitDuration = 4.0 / Math.max(1, sec.noteLength);
          return tot + sec.unitGroups.reduce((acc, g) => acc + Math.max(0, g.length) * unitDuration, 0);
        }, 0);
        return lead + sectionsDuration;
      })
    );
  }

  public static globalEarliestPosition(inputSheet: Sheet): number {
    const sheet = TMDMacroEvaluator.expandThrowing(inputSheet);
    let state = this.initialStateFor(sheet);
    let timelinePosition = 0;
    let earliest = 0;
    const orders = this.ordersFor(sheet);
    for (const order of orders) {
      const visited = this.visitOrder(order, state);
      state = visited.state;
      if (visited.name === undefined) continue;
      const matching = sheet.entries.filter((p) => p.name === visited.name);
      for (const paragraph of matching) {
        earliest = Math.min(earliest, timelinePosition + paragraph.start * TMDPlaybackRenderer.measureDuration(state.timeSignature));
        state = TMDPlaybackRenderer.renderParagraph(paragraph, timelinePosition, state).state;
      }
      timelinePosition += TMDPlaybackRenderer.durationOf(visited.name, sheet, state.timeSignature);
    }
    return earliest;
  }

  public static measureDuration(beat: Beat): number {
    return (Math.max(1, beat.count) * 4.0) / Math.max(1, beat.noteValue);
  }
}
