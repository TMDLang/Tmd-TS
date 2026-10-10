import { SheetInstrumentHelper } from "../domain/index.js";
import { PlaybackTimeline, TmdPlaybackRenderer } from "../playback/index.js";
import { Sheet } from "../syntax/index.js";
import {
  MIDIEvent,
  TmdMIDIEncoder,
} from './midi.js';
import { VocaloidPhoneme } from './vocaloid_phoneme.js';
import type { VocaloidExportOptions } from './vocaloid_types.js';
/**
 * Exporter for VOCALOID2 `.vsq` format.
 *
 * A `.vsq` file is a Standard MIDI File (SMF Format 1) containing text meta events (`0xFF 0x01`)
 * that concatenate into a Windows INI text document describing the vocal track and lyric events.
 */
export class TmdVSQGenerator {
  public static readonly ticksPerQuarter: number = 480;

  /**
   * Generates VOCALOID2 `.vsq` binary data from a TMD `Sheet`.
   */
  public static generateVSQ(
    sheet: Sheet,
    options: VocaloidExportOptions = {},
    targetInstrument?: string
  ): Uint8Array {
    const singerName = options.singerName || 'Miku';
    const preMeasure = options.preMeasure !== undefined ? options.preMeasure : 4;
    const defaultLyric = options.defaultLyric || 'a';

    const selectedInstrument = SheetInstrumentHelper.resolveVocalInstrument(sheet, targetInstrument);
    const timeline = TmdPlaybackRenderer.render(sheet, selectedInstrument);

    // Track 0: Conductor Track (Tempo & Time Signature)
    const tempo = sheet.speed && sheet.speed > 0 ? sheet.speed : 120.0;
    const beat = sheet.beat || { count: 4, noteValue: 4 };
    const trackName = sheet.name && sheet.name.length > 0 ? sheet.name : 'TMD VOCALOID Score';

    const conductorTrackData = TmdMIDIEncoder.encodeTrack([
      { tick: 0, message: { type: 'trackName', name: trackName } },
      { tick: 0, message: { type: 'tempo', bpm: tempo } },
      { tick: 0, message: { type: 'timeSignature', beat } },
    ]);

    // Track 1: Vocal Track (MIDI Notes + INI Text chunks)
    const vsqTrackData = this.generateVsqTrack(
      timeline,
      selectedInstrument,
      singerName,
      preMeasure,
      defaultLyric
    );

    return TmdMIDIEncoder.encodeFile([conductorTrackData, vsqTrackData], this.ticksPerQuarter);
  }

  private static generateVsqTrack(
    timeline: PlaybackTimeline,
    instrumentName: string,
    singerName: string,
    preMeasure: number,
    defaultLyric: string
  ): Uint8Array {
    const preMeasureTicks = preMeasure * 4 * this.ticksPerQuarter;
    const noteItems = VocaloidPhoneme.extractNotes(
      timeline,
      preMeasureTicks,
      this.ticksPerQuarter,
      defaultLyric
    );

    // Build INI content
    let ini = '';
    ini += '[Common]\n';
    ini += 'Version=DSB301\n';
    ini += `Name=${instrumentName}\n`;
    ini += 'Color=181,110,147\n';
    ini += 'DynamicsMode=1\n';
    ini += 'PlayMode=1\n\n';

    ini += '[Master]\n';
    ini += `PreMeasure=${preMeasure}\n\n`;

    ini += '[Mixer]\n';
    ini += 'MasterFeder=0\n';
    ini += 'MasterPanpot=0\n';
    ini += 'MasterMute=0\n';
    ini += 'OutputMode=0\n';
    ini += 'Tracks=1\n';
    ini += 'Feder0=0\n';
    ini += 'Panpot0=0\n';
    ini += 'Mute0=0\n';
    ini += 'Solo0=0\n\n';

    // [EventList]
    ini += '[EventList]\n';
    ini += '0=ID#0000\n';
    for (let i = 0; i < noteItems.length; i++) {
      const note = noteItems[i];
      const idString = `ID#${String(i + 1).padStart(4, '0')}`;
      ini += `${note.tick}=${idString}\n`;
    }

    ini += '[ID#0000]\n';
    ini += 'Type=Singer\n';
    ini += 'IconHandle=h#0000\n\n';

    for (let i = 0; i < noteItems.length; i++) {
      const note = noteItems[i];
      const idString = `ID#${String(i + 1).padStart(4, '0')}`;
      const handleString = `h#${String(i + 1).padStart(4, '0')}`;
      ini += `[${idString}]\n`;
      ini += 'Type=Anote\n';
      ini += `Length=${note.dur}\n`;
      ini += `Note#=${note.pitch}\n`;
      ini += 'Dynamics=64\n';
      ini += 'PMBendDepth=0\n';
      ini += 'PMBendLength=0\n';
      ini += 'PMbmd=0\n';
      ini += 'DEMdecGainRate=50\n';
      ini += 'DEMaccent=50\n';
      ini += `LyricHandle=${handleString}\n\n`;
    }

    // Handles
    ini += '[h#0000]\n';
    ini += 'IconID=$07010001\n';
    ini += `IDS=${singerName}\n`;
    ini += 'Original=0\n';
    ini += 'Caption=\n';
    ini += 'Length=1\n';
    ini += 'Language=0\n';
    ini += 'Program=0\n\n';

    for (let i = 0; i < noteItems.length; i++) {
      const note = noteItems[i];
      const handleString = `h#${String(i + 1).padStart(4, '0')}`;
      ini += `[${handleString}]\n`;
      ini += `L0="${note.lyric}","${note.phoneme}",0.000000,0.000000,0\n\n`;
    }

    // Chunk INI string into 119-byte text events at tick 0
    const midiEvents: MIDIEvent[] = [];
    midiEvents.push({ tick: 0, message: { type: 'trackName', name: 'Voice1' } });

    const encoder = new TextEncoder();
    const iniBytes = encoder.encode(ini);
    const chunkSize = 119;
    let offset = 0;
    while (offset < iniBytes.length) {
      const end = Math.min(offset + chunkSize, iniBytes.length);
      const chunkData = iniBytes.slice(offset, end);
      midiEvents.push({
        tick: 0,
        message: {
          type: 'customMeta',
          metaType: 0x01,
          data: chunkData,
        },
      });
      offset += chunkSize;
    }

    // Add standard MIDI Note On / Note Off events
    for (const note of noteItems) {
      midiEvents.push({
        tick: note.tick,
        message: {
          type: 'noteOn',
          channel: 0,
          note: note.pitch,
          velocity: 64,
        },
      });
      const offTick = note.tick + note.dur;
      midiEvents.push({
        tick: offTick,
        message: {
          type: 'noteOff',
          channel: 0,
          note: note.pitch,
        },
      });
    }

    return TmdMIDIEncoder.encodeTrack(midiEvents);
  }
}
