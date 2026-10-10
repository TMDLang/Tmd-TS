import { SheetInstrumentHelper } from "../domain/index.js";
import { PlaybackTimeline, TmdMacroEvaluator, TmdPlaybackRenderer } from "../playback/index.js";
import { Accidental, Beat, chordQualityIntervals, ChordSymbol, DEFAULT_INSTRUMENT, Note, noteToMIDIPitch, PercussionStroke, Sheet } from "../syntax/index.js";
import { type MIDIEvent, type MIDIMessage,TmdMIDIEncoder } from './midi_encoder.js';
import type { MIDIInstrumentValue } from './midi_instrument.js';
import { MIDIInstrument } from './midi_instrument.js';

export type { MIDIEvent,MIDIMessage } from './midi_encoder.js';
export { TmdMIDIEncoder } from './midi_encoder.js';
export type { MIDIInstrumentValue } from './midi_instrument.js';
export { MIDIInstrument } from './midi_instrument.js';

export interface TmdMIDIGeneratorOptions {
  targetParagraph?: string;
  targetInstrument?: string;
  startOrderIndex?: number;
}

export class TmdMIDIGenerator {
  public static readonly defaultTicksPerQuarterNote = 480;

  public static generateMIDI(
    rawSheet: Sheet,
    ticksPerQuarter: number = TmdMIDIGenerator.defaultTicksPerQuarterNote,
    options?: TmdMIDIGeneratorOptions
  ): Uint8Array {
    let effectiveSheet = TmdMacroEvaluator.expandThrowing(rawSheet);
    if (options?.targetParagraph) {
      const filteredParagraphs = effectiveSheet.entries.filter(p => p.name === options.targetParagraph);
      effectiveSheet = {
        ...effectiveSheet,
        entries: filteredParagraphs,
        playback: [{ type: 'name', name: options.targetParagraph }],
      };
    }

    let distinctInstruments = SheetInstrumentHelper.distinctInstruments(effectiveSheet, false);

    if (options?.targetInstrument) {
      const target = options.targetInstrument === "" ? DEFAULT_INSTRUMENT : options.targetInstrument;
      distinctInstruments = distinctInstruments.filter(inst => inst === target);
      if (distinctInstruments.length === 0 && (options.targetInstrument === DEFAULT_INSTRUMENT || options.targetInstrument === "")) {
        distinctInstruments = [DEFAULT_INSTRUMENT];
      }
    }

    const renderOpts = { startOrderIndex: options?.startOrderIndex };
    const timeline = TmdPlaybackRenderer.renderConductor(effectiveSheet, renderOpts);
    const trackData: Uint8Array[] = [
      TmdMIDIEncoder.encodeTrack(
        this.conductorEvents(effectiveSheet, timeline, ticksPerQuarter)
      ),
    ];

    const programToMelodyChannel = new Map<number, number>();
    let nextMelodyChannel = 0;

    for (const instrument of distinctInstruments) {
      const instTimeline = TmdPlaybackRenderer.render(effectiveSheet, instrument, renderOpts);
      if (!instTimeline.events.some((event) => event.content.type !== 'rest')) continue;
      const midiInst = MIDIInstrument.resolve(instrument);
      let channel: number;
      if (MIDIInstrument.isPercussion(midiInst)) {
        channel = 9;
      } else {
        const prog = MIDIInstrument.program(midiInst);
        if (programToMelodyChannel.has(prog)) {
          channel = programToMelodyChannel.get(prog)!;
        } else {
          if (nextMelodyChannel === 9) {
            nextMelodyChannel += 1;
          }
          channel = nextMelodyChannel % 16;
          programToMelodyChannel.set(prog, channel);
          nextMelodyChannel += 1;
        }
      }

      trackData.push(
        TmdMIDIEncoder.encodeTrack(
          this.instrumentEvents(
            instTimeline,
            instrument,
            midiInst,
            channel,
            ticksPerQuarter
          )
        )
      );
    }

    return TmdMIDIEncoder.encodeFile(trackData, ticksPerQuarter);
  }

  private static conductorEvents(
    sheet: Sheet,
    timeline: PlaybackTimeline,
    ticksPerQuarter: number
  ): MIDIEvent[] {
    const initial: MIDIEvent[] = [
      {
        tick: 0,
        message: {
          type: 'trackName',
          name: sheet.name.length > 0 ? sheet.name : 'TMD Score',
        },
      },
      {
        tick: 0,
        message: {
          type: 'tempo',
          bpm: sheet.speed > 0 ? sheet.speed : 120,
        },
      },
      {
        tick: 0,
        message: {
          type: 'timeSignature',
          beat: sheet.beat,
        },
      },
    ];

    const directives: MIDIEvent[] = [];
    for (const directive of timeline.directives) {
      const tick = this.midiTick(directive.position, ticksPerQuarter);
      switch (directive.kind.type) {
        case 'tempo':
        case 'relativeTempo':
          directives.push({
            tick,
            message: { type: 'tempo', bpm: directive.state.tempo },
          });
          break;
        case 'timeSignature':
          directives.push({
            tick,
            message: {
              type: 'timeSignature',
              beat: directive.state.timeSignature,
            },
          });
          break;
        case 'absoluteKey':
        case 'relativeKey':
          break;
      }
    }

    return [...initial, ...directives];
  }

  public static instrumentEvents(
    timeline: PlaybackTimeline,
    instrument: string,
    midiInstrument: MIDIInstrumentValue,
    channel: number,
    ticksPerQuarter: number
  ): MIDIEvent[] {
    const events: MIDIEvent[] = [
      { tick: 0, message: { type: 'trackName', name: instrument } },
    ];

    if (!MIDIInstrument.isPercussion(midiInstrument)) {
      events.push({
        tick: 0,
        message: {
          type: 'programChange',
          channel,
          program: MIDIInstrument.program(midiInstrument),
        },
      });
    }

    const lower = instrument.toLowerCase();
    if (lower.includes('left') || lower.includes('-l')) {
      events.push({
        tick: 0,
        message: {
          type: 'controlChange',
          channel,
          controller: 10,
          value: 20,
        },
      });
    } else if (lower.includes('right') || lower.includes('-r')) {
      events.push({
        tick: 0,
        message: {
          type: 'controlChange',
          channel,
          controller: 10,
          value: 108,
        },
      });
    }

    for (const event of timeline.events) {
      const start = this.midiTick(event.position, ticksPerQuarter);
      const duration = Math.max(1, this.midiTick(event.duration, ticksPerQuarter));

      switch (event.content.type) {
        case 'note': {
          const pitch = this.noteToMIDIPitch(
            event.content.note,
            event.state.keyOffset
          );
          this.appendNote(events, start, duration, channel, pitch, this.dynamicVelocity(event.state.dynamicLevel));
          break;
        }
        case 'chord': {
          const pitches = this.chordToMIDIPitches(
            event.content.chord,
            event.state.keyOffset
          );
          for (const p of pitches) {
            this.appendNote(events, start, duration, channel, p, Math.max(1, this.dynamicVelocity(event.state.dynamicLevel) - 8));
          }
          break;
        }
        case 'percussion': {
          const pattern = event.content.pattern;
          const step = Math.max(1, Math.floor(duration / Math.max(1, pattern.length)));
          for (let index = 0; index < pattern.length; index++) {
            const stroke = PercussionStroke.fromCharacter(pattern[index]);
            if (stroke !== undefined) {
              const noteStart = start + index * step;
              this.appendNote(events, noteStart, step, 9, stroke.midiPitch, stroke.defaultVelocity);
            }
          }
          break;
        }
        case 'rest':
          break;
      }
    }

    return events;
  }

  private static appendNote(
    events: MIDIEvent[],
    start: number,
    duration: number,
    channel: number,
    pitch: number,
    velocity: number
  ): void {
    if (pitch < 0 || pitch > 127) return;
    events.push({
      tick: start,
      message: {
        type: 'noteOn',
        channel,
        note: pitch,
        velocity,
      },
    });
    const noteOffOffset = duration > 2 ? duration - 2 : 1;
    const noteOffTick = start + noteOffOffset;
    events.push({
      tick: noteOffTick,
      message: {
        type: 'noteOff',
        channel,
        note: pitch,
      },
    });
  }

  private static dynamicVelocity(mark: string): number {
    const velocities: Record<string, number> = {
      ppp: 20, pp: 35, p: 50, mp: 65,
      mf: 80, f: 95, ff: 110, fff: 125,
    };
    return velocities[mark] ?? velocities.mf;
  }

  private static midiTick(quarterNotes: number, ticksPerQuarter: number): number {
    const ticks = Math.round(quarterNotes * ticksPerQuarter);
    if (!Number.isFinite(ticks)) return 0;
    return Math.max(0, ticks);
  }

  public static noteToMIDIPitch(note: Note, keyOffset: number): number {
    return noteToMIDIPitch(note, keyOffset);
  }

  public static chordToMIDIPitches(
    chord: string | ChordSymbol,
    keyOffset: number
  ): number[] {
    const symbol =
      typeof chord === 'string' ? ChordSymbol.parse(chord) : chord;
    let rootPitch: number;
    if (symbol.root.isScaleDegree) {
      const note: Note = {
        accidental: symbol.root.accidental,
        degree: symbol.root.degree,
        octave: symbol.root.octave,
      };
      rootPitch = this.noteToMIDIPitch(note, keyOffset) - 12;
    } else {
      rootPitch = 48 + symbol.root.semitoneOffset;
    }
    const intervals = chordQualityIntervals(symbol.quality);
    const pitches = intervals.map(i => rootPitch + i);
    if (symbol.bass) {
      let bassPitch: number;
      if (symbol.bass.isScaleDegree) {
        const bassNote: Note = {
          accidental: symbol.bass.accidental,
          degree: symbol.bass.degree,
          octave: symbol.bass.octave,
        };
        bassPitch = this.noteToMIDIPitch(bassNote, keyOffset) - 24;
      } else {
        bassPitch = 36 + symbol.bass.semitoneOffset;
      }
      if (!pitches.includes(bassPitch)) {
        pitches.unshift(bassPitch);
      }
    }
    return pitches;
  }

  public static generalMidiProgram(instrument: string): number {
    return MIDIInstrument.program(MIDIInstrument.resolve(instrument));
  }
}
