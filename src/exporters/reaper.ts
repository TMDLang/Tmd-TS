import { SheetInstrumentHelper } from "../domain/index.js";
import { PlaybackTimeline, TmdMacroEvaluator, TmdPlaybackRenderer } from "../playback/index.js";
import { Playback, Sheet } from "../syntax/index.js";
import {
  MIDIEvent,
  MIDIInstrument,
  MIDIInstrumentValue,
  TmdMIDIGenerator,
} from './midi.js';

export class TmdReaperGenerator {
  public static readonly defaultPPQ = 960;

  public static generateRPP(
    rawSheet: Sheet,
    ppq: number = TmdReaperGenerator.defaultPPQ
  ): string {
    const sheet = TmdMacroEvaluator.expandThrowing(rawSheet);
    const distinctInstruments = SheetInstrumentHelper.distinctInstruments(sheet, false);

    const conductorTimeline = TmdPlaybackRenderer.renderConductor(sheet);

    const sortedDirectives = [...conductorTimeline.directives].sort(
      (a, b) => a.position - b.position
    );
    const segments = TmdPlaybackRenderer.buildTempoSegments(
      sheet.speed > 0 ? sheet.speed : 120,
      sheet.beat,
      sortedDirectives
    );
    const quarterToSeconds = (quarter: number): number =>
      TmdPlaybackRenderer.quarterToSeconds(quarter, segments);

    // Calculate section markers
    const orders = SheetInstrumentHelper.effectivePlaybackOrders(sheet);

    let currentQuarter = 0.0;
    let markerId = 1;
    const markerLines: string[] = [];
    let markerTimeSignature = sheet.beat;
    let markerDirectiveIndex = 0;

    for (const order of orders) {
      if (order.type === 'name') {
        while (
          markerDirectiveIndex < sortedDirectives.length &&
          sortedDirectives[markerDirectiveIndex].position <= currentQuarter
        ) {
          const directive = sortedDirectives[markerDirectiveIndex];
          if (directive.kind.type === 'timeSignature') {
            markerTimeSignature = directive.kind.beat;
          }
          markerDirectiveIndex++;
        }
        const paragraphDuration = TmdPlaybackRenderer.durationOf(order.name, sheet, markerTimeSignature);
        const secondPos = quarterToSeconds(currentQuarter);
        markerLines.push(`  MARKER ${markerId} ${secondPos.toFixed(8)} "${order.name}" 0`);
        markerId++;
        currentQuarter += paragraphDuration;
      }
    }

    // Build Tempo Envelope Points (PT)
    const ptLines: string[] = [];
    for (const seg of segments) {
      const timesigEncoded = (seg.timeSignature.noteValue << 16) | seg.timeSignature.count;
      ptLines.push(
        `    PT ${seg.secondStart.toFixed(8)} ${seg.bpm.toFixed(8)} 0 ${timesigEncoded}`
      );
    }

    // Build Tracks
    const trackChunks: string[] = [];
    const channelState = { nextMelodicChannel: 0 };

    for (const instrument of distinctInstruments) {
      const instTimeline = TmdPlaybackRenderer.render(sheet, instrument);
      if (!instTimeline.events.some((event) => event.content.type !== 'rest')) continue;
      const midiInst = MIDIInstrument.resolve(instrument);
      const channel = MIDIInstrument.allocateChannel(midiInst, channelState);

      // Pan
      const panPos = MIDIInstrument.stereoPanHeuristic(instrument);
      const pan = panPos === 'left' ? -0.8 : panPos === 'right' ? 0.8 : 0.0;

      // Color
      const color = this.getTrackColor(midiInst);

      // Render track events
      const events: MIDIEvent[] = TmdMIDIGenerator.instrumentEvents(
        instTimeline,
        instrument,
        midiInst,
        channel,
        ppq
      );

      const totalDurationQuarters = Math.max(instTimeline.duration, currentQuarter);
      const totalTrackSeconds = Math.max(1.0, quarterToSeconds(totalDurationQuarters));

      // Serialize inline MIDI events
      const sortedEvents = [...events].sort((a, b) => a.tick - b.tick);
      let lastTick = 0;
      const eventLines: string[] = [];
      const toHex2 = (n: number) => (n & 0xff).toString(16).padStart(2, '0');

      for (const evt of sortedEvents) {
        const delta = Math.max(0, evt.tick - lastTick);
        lastTick = evt.tick;
        const msg = evt.message;
        switch (msg.type) {
          case 'noteOn': {
            const status = toHex2(0x90 | (msg.channel & 0x0f));
            const data1 = toHex2(msg.note & 0x7f);
            const data2 = toHex2(msg.velocity & 0x7f);
            eventLines.push(`        E ${delta} ${status} ${data1} ${data2}`);
            break;
          }
          case 'noteOff': {
            const status = toHex2(0x80 | (msg.channel & 0x0f));
            const data1 = toHex2(msg.note & 0x7f);
            eventLines.push(`        E ${delta} ${status} ${data1} 00`);
            break;
          }
          case 'programChange': {
            const status = toHex2(0xc0 | (msg.channel & 0x0f));
            const data1 = toHex2(msg.program & 0x7f);
            eventLines.push(`        E ${delta} ${status} ${data1}`);
            break;
          }
          case 'controlChange': {
            const status = toHex2(0xb0 | (msg.channel & 0x0f));
            const data1 = toHex2(msg.controller & 0x7f);
            const data2 = toHex2(msg.value & 0x7f);
            eventLines.push(`        E ${delta} ${status} ${data1} ${data2}`);
            break;
          }
        }
      }

      if (events.length > 0) {
        const status = toHex2(0xb0 | (channel & 0x0f));
        eventLines.push(`        E 0 ${status} 7b 00`);
      }

      const trackChunk = [
        `  <TRACK`,
        `    NAME "${instrument}"`,
        `    PEAKCOL ${color}`,
        `    VOLPAN 1.00000000 ${pan.toFixed(8)} 1 -1 1`,
        `    <ITEM`,
        `      POSITION 0.00000000`,
        `      SNAPOFFS 0.00000000`,
        `      LENGTH ${totalTrackSeconds.toFixed(8)}`,
        `      LOOP 0`,
        `      ALLTAKES 0`,
        `      NAME "${instrument}"`,
        `      <SOURCE MIDI`,
        `        HASDATA 1 ${ppq} QN`,
        ...eventLines,
        `      >`,
        `    >`,
        `  >`,
      ].join('\n');

      trackChunks.push(trackChunk);
    }

    const lines: string[] = [
      `<REAPER_PROJECT 0.1 "7.0" 0 0`,
      `  <TEMPOENVEX`,
      `    ACT 1`,
      `    VIS 1 0 1`,
      `    LANEHEIGHT 0 0`,
      `    ARM 1`,
      `    DEFSHAPE 0 -1 -1`,
      ...ptLines,
      `  >`,
      ...markerLines,
      ...trackChunks,
      `>`,
      ``,
    ];

    return lines.join('\n');
  }

  private static getTrackColor(midiInst: MIDIInstrumentValue): number {
    let r = 120, g = 140, b = 160;
    if (MIDIInstrument.isPercussion(midiInst)) {
      r = 230; g = 80; b = 50;
    } else {
      const prog = MIDIInstrument.program(midiInst);
      if (prog >= 0 && prog <= 7) {
        // Piano & Keys
        r = 150; g = 70; b = 210;
      } else if ((prog >= 8 && prog <= 15) || (prog >= 112 && prog <= 119)) {
        // Chromatic Percussion & Percussive
        r = 230; g = 80; b = 50;
      } else if (prog >= 16 && prog <= 23) {
        // Organ
        r = 150; g = 70; b = 210;
      } else if (prog >= 24 && prog <= 31) {
        // Guitar
        r = 50; g = 180; b = 80;
      } else if (prog >= 32 && prog <= 39) {
        // Bass
        r = 30; g = 130; b = 230;
      } else if (prog >= 40 && prog <= 51) {
        // Strings & Ensemble
        r = 230; g = 160; b = 30;
      } else if (prog >= 52 && prog <= 55) {
        // Choir & Voices
        r = 220; g = 100; b = 180;
      } else if (prog >= 56 && prog <= 63) {
        // Brass
        r = 230; g = 200; b = 30;
      } else if (prog >= 64 && prog <= 71) {
        // Reeds
        r = 30; g = 180; b = 180;
      } else if (prog >= 72 && prog <= 79) {
        // Pipes
        r = 30; g = 180; b = 180;
      } else if (prog >= 80 && prog <= 87) {
        // Synth Lead
        r = 240; g = 80; b = 160;
      } else if (prog >= 88 && prog <= 95) {
        // Synth Pad
        r = 220; g = 100; b = 180;
      } else if ((prog >= 96 && prog <= 103) || (prog >= 120 && prog <= 127)) {
        // FX & Sound FX
        r = 100; g = 200; b = 220;
      } else if (prog >= 104 && prog <= 111) {
        // Ethnic
        r = 200; g = 140; b = 60;
      }
    }
    const native = (r & 0xff) | ((g & 0xff) << 8) | ((b & 0xff) << 16);
    return 0x1000000 | native;
  }
}
