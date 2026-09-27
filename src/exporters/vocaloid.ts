import {
  PlaybackTimeline,
  Sheet,
  SheetInstrumentHelper,
  TMDPlaybackRenderer,
} from '../core/index.js';
import {
  MIDIEvent,
  TMDMIDIEncoder,
  TMDMIDIGenerator,
} from './midi.js';

/**
 * Options for configuring VOCALOID format exports.
 */
export interface VocaloidExportOptions {
  /** Name of singer to embed in the file (default: "Miku"). */
  singerName?: string;
  /** Pre-measure count in 4/4 bars (default: 4 measures = 7680 ticks at 480 PPQ). */
  preMeasure?: number;
  /** Default lyric to use if none is specified for a note. */
  defaultLyric?: string;
}

/**
 * Provides conversion between Japanese lyrics (Hiragana / Katakana / Romaji) and VOCALOID X-SAMPA phonemes.
 */
export class VocaloidPhoneme {
  public static readonly defaultLyric = 'a';
  public static readonly defaultPhoneme = 'a';

  private static readonly table: Record<string, string> = {
    // Vowels
    あ: 'a', い: 'i', う: 'M', え: 'e', お: 'o',
    ア: 'a', イ: 'i', ウ: 'M', エ: 'e', オ: 'o',
    a: 'a', i: 'i', u: 'M', e: 'e', o: 'o',

    // K-row
    か: 'k a', き: "k' i", く: 'k M', け: 'k e', こ: 'k o',
    カ: 'k a', キ: "k' i", ク: 'k M', ケ: 'k e', コ: 'k o',
    ka: 'k a', ki: "k' i", ku: 'k M', ke: 'k e', ko: 'k o',
    きゃ: "k' a", きゅ: "k' M", きょ: "k' o",
    キャ: "k' a", キュ: "k' M", キョ: "k' o",
    kya: "k' a", kyu: "k' M", kyo: "k' o",

    // S-row
    さ: 's a', し: 'S i', す: 's M', せ: 's e', そ: 's o',
    サ: 's a', シ: 'S i', ス: 's M', セ: 's e', ソ: 's o',
    sa: 's a', shi: 'S i', si: 'S i', su: 's M', se: 's e', so: 's o',
    しゃ: 'S a', しゅ: 'S M', しょ: 'S o',
    シャ: 'S a', シュ: 'S M', ショ: 'S o',
    sha: 'S a', shu: 'S M', sho: 'S o', sya: 'S a', syu: 'S M', syo: 'S o',

    // T-row
    た: 't a', ち: 'tS i', つ: 'ts M', て: 't e', と: 't o',
    タ: 't a', チ: 'tS i', ツ: 'ts M', テ: 't e', ト: 't o',
    ta: 't a', chi: 'tS i', tsu: 'ts M', tu: 'ts M', te: 't e', to: 't o',
    ちゃ: 'tS a', ちゅ: 'tS M', ちょ: 'tS o',
    チャ: 'tS a', チュ: 'tS M', チョ: 'tS o',
    cha: 'tS a', chu: 'tS M', cho: 'tS o', tya: 'tS a', tyu: 'tS M', tyo: 'tS o',

    // N-row
    な: 'n a', に: 'J i', ぬ: 'n M', ね: 'n e', の: 'n o',
    ナ: 'n a', ニ: 'J i', ヌ: 'n M', ネ: 'n e', ノ: 'n o',
    na: 'n a', ni: 'J i', nu: 'n M', ne: 'n e', no: 'n o',
    にゃ: 'J a', にゅ: 'J M', にょ: 'J o',
    ニャ: 'J a', ニュ: 'J M', ニョ: 'J o',
    nya: 'J a', nyu: 'J M', nyo: 'J o',

    // H-row
    は: 'h a', ひ: 'C i', ふ: 'p\\ M', へ: 'h e', ほ: 'h o',
    ハ: 'h a', ヒ: 'C i', フ: 'p\\ M', ヘ: 'h e', ホ: 'h o',
    ha: 'h a', hi: 'C i', fu: 'p\\ M', hu: 'p\\ M', he: 'h e', ho: 'h o',
    ひゃ: 'C a', ひゅ: 'C M', ひょ: 'C o',
    ヒャ: 'C a', ヒュ: 'C M', ヒョ: 'C o',
    hya: 'C a', hyu: 'C M', hyo: 'C o',

    // M-row
    ま: 'm a', み: "m' i", む: 'm M', め: 'm e', も: 'm o',
    マ: 'm a', ミ: "m' i", ム: 'm M', メ: 'm e', モ: 'm o',
    ma: 'm a', mi: "m' i", mu: 'm M', me: 'm e', mo: 'm o',
    みゃ: "m' a", みゅ: "m' M", みょ: "m' o",
    ミャ: "m' a", ミュ: "m' M", ミョ: "m' o",
    mya: "m' a", myu: "m' M", myo: "m' o",

    // Y-row
    や: 'j a', ゆ: 'j M', よ: 'j o',
    ヤ: 'j a', ユ: 'j M', ヨ: 'j o',
    ya: 'j a', yu: 'j M', yo: 'j o',

    // R-row
    ら: '4 a', り: "4' i", る: '4 M', れ: '4 e', ろ: '4 o',
    ラ: '4 a', リ: "4' i", ル: '4 M', レ: '4 e', ロ: '4 o',
    ra: '4 a', ri: "4' i", ru: '4 M', re: '4 e', ro: '4 o',
    りゃ: "4' a", りゅ: "4' M", りょ: "4' o",
    リャ: "4' a", リュ: "4' M", リョ: "4' o",
    rya: "4' a", ryu: "4' M", ryo: "4' o",

    // W-row
    わ: 'w a', を: 'o', ん: 'N\\',
    ワ: 'w a', ヲ: 'o', ン: 'N\\',
    wa: 'w a', wo: 'o', n: 'N\\', nn: 'N\\',

    // G-row
    が: 'g a', ぎ: "g' i", ぐ: 'g M', げ: 'g e', ご: 'g o',
    ガ: 'g a', ギ: "g' i", グ: 'g M', ゲ: 'g e', ゴ: 'g o',
    ga: 'g a', gi: "g' i", gu: 'g M', ge: 'g e', go: 'g o',
    ぎゃ: "g' a", ぎゅ: "g' M", ぎょ: "g' o",
    ギャ: "g' a", ギュ: "g' M", ギョ: "g' o",
    gya: "g' a", gyu: "g' M", gyo: "g' o",

    // Z/J-row
    ざ: 'dz a', じ: 'dZ i', ず: 'dz M', ぜ: 'dz e', ぞ: 'dz o',
    ザ: 'dz a', ジ: 'dZ i', ズ: 'dz M', ゼ: 'dz e', ゾ: 'dz o',
    za: 'dz a', ji: 'dZ i', zi: 'dZ i', zu: 'dz M', ze: 'dz e', zo: 'dz o',
    じゃ: 'dZ a', じゅ: 'dZ M', じょ: 'dZ o',
    ジャ: 'dZ a', ジュ: 'dZ M', ジョ: 'dZ o',
    ja: 'dZ a', ju: 'dZ M', jo: 'dZ o', zya: 'dZ a', zyu: 'dZ M', zyo: 'dZ o',

    // D-row
    だ: 'd a', ぢ: 'dZ i', づ: 'dz M', で: 'd e', ど: 'd o',
    ダ: 'd a', ヂ: 'dZ i', ヅ: 'dz M', デ: 'd e', ド: 'd o',
    da: 'd a', du: 'd M', de: 'd e', do: 'd o',

    // B-row
    ば: 'b a', び: "b' i", ぶ: 'b M', べ: 'b e', ぼ: 'b o',
    バ: 'b a', ビ: "b' i", ブ: 'b M', ベ: 'b e', ボ: 'b o',
    ba: 'b a', bi: "b' i", bu: 'b M', be: 'b e', bo: 'b o',
    びゃ: "b' a", びゅ: "b' M", びょ: "b' o",
    ビャ: "b' a", ビュ: "b' M", ビョ: "b' o",
    bya: "b' a", byu: "b' M", byo: "b' o",

    // P-row
    ぱ: 'p a', ぴ: "p' i", ぷ: 'p M', ぺ: 'p e', ぽ: 'p o',
    パ: 'p a', ピ: "p' i", プ: 'p M', ペ: 'p e', ポ: 'p o',
    pa: 'p a', pi: "p' i", pu: 'p M', pe: 'p e', po: 'p o',
    ぴゃ: "p' a", ぴゅ: "p' M", ぴょ: "p' o",
    ピャ: "p' a", ピュ: "p' M", ピョ: "p' o",
    pya: "p' a", pyu: "p' M", pyo: "p' o",

    // Small / extended
    ふぁ: 'p\\ a', ふぃ: "p\\' i", ふぇ: 'p\\ e', ふぉ: 'p\\ o',
    ファ: 'p\\ a', フィ: "p\\' i", フェ: 'p\\ e', フォ: 'p\\ o',
    fa: 'p\\ a', fi: "p\\' i", fe: 'p\\ e', fo: 'p\\ o',
    てぃ: "t' i", ティ: "t' i", ti: "t' i",
    でぃ: "d' i", ディ: "d' i", di: "d' i",
  };

  /**
   * Resolves phonetic representation for a lyric string.
   * Defaults to 'a' if unresolved or empty.
   */
  public static resolvePhoneme(lyric: string): string {
    const trimmed = lyric.trim().toLowerCase();
    if (!trimmed) return this.defaultPhoneme;
    if (this.table[trimmed]) return this.table[trimmed];
    const raw = lyric.trim();
    if (this.table[raw]) return this.table[raw];
    return this.defaultPhoneme;
  }
}

/**
 * Exporter for VOCALOID2 `.vsq` format.
 *
 * A `.vsq` file is a Standard MIDI File (SMF Format 1) containing text meta events (`0xFF 0x01`)
 * that concatenate into a Windows INI text document describing the vocal track and lyric events.
 */
export class TMDVSQGenerator {
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

    const selectedInstrument = this.resolveTargetInstrument(sheet, targetInstrument);
    const timeline = TMDPlaybackRenderer.render(sheet, selectedInstrument);

    // Track 0: Conductor Track (Tempo & Time Signature)
    const tempo = sheet.speed && sheet.speed > 0 ? sheet.speed : 120.0;
    const beat = sheet.beat || { count: 4, noteValue: 4 };
    const trackName = sheet.name && sheet.name.length > 0 ? sheet.name : 'TMD VOCALOID Score';

    const conductorTrackData = TMDMIDIEncoder.encodeTrack([
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

    return TMDMIDIEncoder.encodeFile([conductorTrackData, vsqTrackData], this.ticksPerQuarter);
  }

  private static resolveTargetInstrument(sheet: Sheet, requested?: string): string {
    return SheetInstrumentHelper.resolveVocalInstrument(sheet, requested);
  }

  private static generateVsqTrack(
    timeline: PlaybackTimeline,
    instrumentName: string,
    singerName: string,
    preMeasure: number,
    defaultLyric: string
  ): Uint8Array {
    const preMeasureTicks = preMeasure * 4 * this.ticksPerQuarter;

    interface NoteItem {
      tick: number;
      dur: number;
      pitch: number;
      lyric: string;
      phoneme: string;
    }

    const noteItems: NoteItem[] = [];
    let i = 0;
    while (i < timeline.events.length) {
      const event = timeline.events[i];
      if (event.content.type !== 'note') {
        i++;
        continue;
      }
      let bestEvent = event;
      let bestPitch = TMDMIDIGenerator.noteToMIDIPitch(event.content.note, event.state.keyOffset);
      let j = i + 1;
      while (j < timeline.events.length && Math.abs(timeline.events[j].position - event.position) < 1e-4) {
        const nextEv = timeline.events[j];
        if (nextEv.content.type === 'note') {
          const p = TMDMIDIGenerator.noteToMIDIPitch(nextEv.content.note, nextEv.state.keyOffset);
          if (p > bestPitch) {
            bestPitch = p;
            bestEvent = nextEv;
          }
        }
        j++;
      }
      i = j;

      if (bestPitch < 0 || bestPitch > 127) continue;
      const tick = preMeasureTicks + this.midiTick(bestEvent.position);
      const dur = Math.max(1, this.midiTick(bestEvent.duration));
      const lyric = defaultLyric;
      const phoneme = VocaloidPhoneme.resolvePhoneme(lyric);
      noteItems.push({ tick, dur, pitch: bestPitch, lyric, phoneme });
    }

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

    return TMDMIDIEncoder.encodeTrack(midiEvents);
  }

  private static midiTick(quarterNotes: number): number {
    const ticks = Math.round(quarterNotes * this.ticksPerQuarter);
    return Math.max(0, Number.isFinite(ticks) ? ticks : 0);
  }
}

/**
 * Exporter for VOCALOID3 / VOCALOID4 `.vsqx` XML format.
 *
 * `.vsqx` is an XML-based format compatible with VOCALOID3, VOCALOID4, VOCALOID5, VOCALOID6,
 * and Crypton's Piapro Studio.
 */
export class TMDVSQXGenerator {
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

    const selectedInstrument = this.resolveTargetInstrument(sheet, targetInstrument);
    const timeline = TMDPlaybackRenderer.render(sheet, selectedInstrument);

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
      let bestPitch = TMDMIDIGenerator.noteToMIDIPitch(event.content.note, event.state.keyOffset);
      let j = i + 1;
      while (j < timeline.events.length && Math.abs(timeline.events[j].position - event.position) < 1e-4) {
        const nextEv = timeline.events[j];
        if (nextEv.content.type === 'note') {
          const p = TMDMIDIGenerator.noteToMIDIPitch(nextEv.content.note, nextEv.state.keyOffset);
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

  private static resolveTargetInstrument(sheet: Sheet, requested?: string): string {
    const distinct = Array.from(new Set(
      sheet.entries.map((p) => p.assignment).filter((assignment): assignment is string => Boolean(assignment && assignment.trim().length > 0))
    )).sort();
    if (requested) {
      const matched = distinct.find((instrument) => instrument.toLocaleLowerCase() === requested.toLocaleLowerCase());
      if (matched) return matched;
    }
    const regex = /vocal|voice|miku|sing|lead|melody/i;
    const matched = distinct.find((inst) => regex.test(inst));
    if (matched) {
      return matched;
    }
    return distinct[0] || 'Vocal';
  }

  private static escapeCDATA(text: string): string {
    return text.replace(/]]>/g, ']]]]><![CDATA[>');
  }
}
