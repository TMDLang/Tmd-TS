import { SheetInstrumentHelper } from "../domain/index.js";
import { PlaybackTimeline, TmdPlaybackRenderer } from "../playback/index.js";
import { Sheet } from "../syntax/index.js";
import {
  MIDIEvent,
  TmdMIDIEncoder,
  TmdMIDIGenerator,
} from './midi.js';
import { VocaloidPhoneme } from './vocaloid_phoneme.js';
import type { VocaloidExportOptions } from './vocaloid_types.js';
/**
 * Exporter for VOCALOID3 / VOCALOID4 `.vsqx` XML format.
 *
 * `.vsqx` is an XML-based format compatible with VOCALOID3, VOCALOID4, VOCALOID5, VOCALOID6,
 * and Crypton's Piapro Studio.
 */
export class TmdVSQXGenerator {
  public static readonly ticksPerQuarter: number = 480;

  /**
   * Generates VOCALOID4 `.vsqx` XML string from a TMD `Sheet`.
   */
  public static generateVSQX(
    sheet: Sheet,
    options: VocaloidExportOptions = {},
    targetInstrument?: string
  ): string {
    const singerName = options.singerName || 'Miku';
    const preMeasure = options.preMeasure !== undefined ? options.preMeasure : 4;
    const defaultLyric = options.defaultLyric || 'a';

    const selectedInstrument = SheetInstrumentHelper.resolveVocalInstrument(sheet, targetInstrument);
    const timeline = TmdPlaybackRenderer.render(sheet, selectedInstrument);

    const bpm = sheet.speed && sheet.speed > 0 ? sheet.speed : 120.0;
    const tempoVal = Math.round(bpm * 100); // VSQX tempo is scaled by 100 (e.g. 120 BPM = 12000)
    const beatCount = sheet.beat && sheet.beat.count > 0 ? sheet.beat.count : 4;
    const beatNoteVal = sheet.beat && sheet.beat.noteValue > 0 ? sheet.beat.noteValue : 4;

    // PreMeasure ticks: preMeasure bars of time signature
    // 1 bar in ticks = (beatCount * 4 * ticksPerQuarter) / beatNoteVal
    const ticksPerBar = Math.floor((beatCount * 4 * this.ticksPerQuarter) / beatNoteVal);
    const preMeasureTicks = preMeasure * ticksPerBar;

    interface VSQXNote {
      posTick: number;
      durTick: number;
      noteNum: number;
      lyric: string;
      phnm: string;
    }

    const notes: VSQXNote[] = [];
    let maxTick = 0;
    let i = 0;
    while (i < timeline.events.length) {
      const event = timeline.events[i];
      if (event.content.type !== 'note') {
        i++;
        continue;
      }
      let bestEvent = event;
      let bestPitch = TmdMIDIGenerator.noteToMIDIPitch(event.content.note, event.state.keyOffset);
      let j = i + 1;
      while (j < timeline.events.length && Math.abs(timeline.events[j].position - event.position) < 1e-4) {
        const nextEv = timeline.events[j];
        if (nextEv.content.type === 'note') {
          const p = TmdMIDIGenerator.noteToMIDIPitch(nextEv.content.note, nextEv.state.keyOffset);
          if (p > bestPitch) {
            bestPitch = p;
            bestEvent = nextEv;
          }
        }
        j++;
      }
      i = j;

      if (bestPitch < 0 || bestPitch > 127) continue;
      const tick = preMeasureTicks + Math.round(bestEvent.position * this.ticksPerQuarter);
      const dur = Math.max(1, Math.round(bestEvent.duration * this.ticksPerQuarter));
      const lyric = defaultLyric;
      const phnm = VocaloidPhoneme.resolvePhoneme(lyric);
      notes.push({ posTick: tick, durTick: dur, noteNum: bestPitch, lyric, phnm });
      maxTick = Math.max(maxTick, tick + dur);
    }

    const totalPartDuration = Math.max(ticksPerBar * 4, maxTick + ticksPerBar);

    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<vsq4 xmlns="http://www.yamaha.co.jp/vocaloid/schema/vsq4/"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.yamaha.co.jp/vocaloid/schema/vsq4/ vsq4.xsd">
  <vender><![CDATA[Yamaha corporation]]></vender>
  <version><![CDATA[4.0.0.3]]></version>
  <vVoiceTable>
    <vVoice>
      <bs>0</bs>
      <pc>0</pc>
      <id><![CDATA[BCLRA48FS2TRCPC6]]></id>
      <name><![CDATA[${this.escapeCDATA(singerName)}]]></name>
      <vPrm>
        <bre>0</bre>
        <bri>0</bri>
        <cle>0</cle>
        <gen>0</gen>
        <ope>0</ope>
      </vPrm>
    </vVoice>
  </vVoiceTable>
  <mixer>
    <masterUnit>
      <oDev>0</oDev>
      <rLvl>0</rLvl>
      <vol>0</vol>
    </masterUnit>
    <vsUnit>
      <tNo>0</tNo>
      <iGin>0</iGin>
      <sLvl>-898</sLvl>
      <sEnable>0</sEnable>
      <m>0</m>
      <s>0</s>
      <pan>64</pan>
      <vol>0</vol>
    </vsUnit>
    <monoUnit>
      <iGin>0</iGin>
      <sLvl>-898</sLvl>
      <sEnable>0</sEnable>
      <m>0</m>
      <s>0</s>
      <pan>64</pan>
      <vol>0</vol>
    </monoUnit>
    <stUnit>
      <iGin>0</iGin>
      <m>0</m>
      <s>0</s>
      <vol>0</vol>
    </stUnit>
  </mixer>
  <masterTrack>
    <seqName><![CDATA[${this.escapeCDATA(sheet.name && sheet.name.length > 0 ? sheet.name : 'TMD Score')}]]></seqName>
    <comment><![CDATA[Exported by Tmd-TS]]></comment>
    <resolution>480</resolution>
    <preMeasure>${preMeasure}</preMeasure>
    <timeSig>
      <m>0</m>
      <nu>${beatCount}</nu>
      <de>${beatNoteVal}</de>
    </timeSig>
    <tempo>
      <t>0</t>
      <v>${tempoVal}</v>
    </tempo>
  </masterTrack>
  <vsTrack>
    <tNo>0</tNo>
    <name><![CDATA[${this.escapeCDATA(selectedInstrument)}]]></name>
    <comment><![CDATA[Track 1]]></comment>
    <vsPart>
      <t>0</t>
      <playTime>${totalPartDuration}</playTime>
      <name><![CDATA[${this.escapeCDATA(selectedInstrument)}]]></name>
      <comment><![CDATA[Part 1]]></comment>
      <sPlug>
        <id><![CDATA[GLB1Q310S0000000]]></id>
        <name><![CDATA[VOCALOID2 Compatibility]]></name>
        <version><![CDATA[1.0.0.1]]></version>
      </sPlug>
      <pStyle>
        <v id="accent">50</v>
        <v id="bendDep">0</v>
        <v id="bendLen">0</v>
        <v id="decay">50</v>
        <v id="fallPort">0</v>
        <v id="opening">127</v>
        <v id="risePort">0</v>
      </pStyle>
      <singer>
        <t>0</t>
        <bs>0</bs>
        <pc>0</pc>
      </singer>
`;

    for (const note of notes) {
      xml += `      <note>
        <t>${note.posTick}</t>
        <dur>${note.durTick}</dur>
        <n>${note.noteNum}</n>
        <v>64</v>
        <y><![CDATA[${this.escapeCDATA(note.lyric)}]]></y>
        <p><![CDATA[${this.escapeCDATA(note.phnm)}]]></p>
        <nStyle>
          <v id="accent">50</v>
          <v id="bendDep">0</v>
          <v id="bendLen">0</v>
          <v id="decay">50</v>
          <v id="fallPort">0</v>
          <v id="opening">127</v>
          <v id="risePort">0</v>
        </nStyle>
      </note>
`;
    }

    xml += `      <plane>0</plane>
    </vsPart>
  </vsTrack>
</vsq4>
`;

    return xml;
  }

  private static escapeCDATA(text: string): string {
    return text.replace(/]]>/g, ']]]]><![CDATA[>');
  }
}
