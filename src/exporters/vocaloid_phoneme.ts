import { PlaybackTimeline, TmdPlaybackRenderer } from '../playback/index.js';
import { noteToMIDIPitch } from '../syntax/index.js';

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

  /**
   * Extracts monophonic vocal note items from a `PlaybackTimeline` with pre-measure tick offset and X-SAMPA phoneme resolution.
   */
  public static extractNotes(
    timeline: PlaybackTimeline,
    preMeasureTicks: number,
    ticksPerQuarter: number,
    defaultLyric: string = this.defaultLyric
  ): VocaloidNoteItem[] {
    const items: VocaloidNoteItem[] = [];
    for (const event of TmdPlaybackRenderer.monophonicEvents(timeline)) {
      if (event.content.type !== 'note') continue;
      const pitch = noteToMIDIPitch(event.content.note, event.state.keyOffset);
      if (pitch < 0 || pitch > 127) continue;
      const rawTicks = Math.round(event.position * ticksPerQuarter);
      const tick = preMeasureTicks + Math.max(0, Number.isFinite(rawTicks) ? rawTicks : 0);
      const rawDur = Math.round(event.duration * ticksPerQuarter);
      const dur = Math.max(1, Number.isFinite(rawDur) ? rawDur : 1);
      const lyric = defaultLyric;
      const phoneme = this.resolvePhoneme(lyric);
      items.push({ tick, dur, pitch, lyric, phoneme });
    }
    return items;
  }
}

export interface VocaloidNoteItem {
  tick: number;
  dur: number;
  pitch: number;
  lyric: string;
  phoneme: string;
}
