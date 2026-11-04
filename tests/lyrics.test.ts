import { describe, expect, it } from "vitest";
import {
  TmdMIDIGenerator,
  TmdUSTGenerator,
  TmdVSQGenerator,
  TmdVSQXGenerator,
} from "../src/exporters/index.js";
import { TmdMeasureRenderer, TmdPlaybackRenderer } from "../src/playback/index.js";
import { formatSheet } from "../src/syntax/format.js";
import { TmdParser } from "../src/syntax/parser.js";
import { TmdScoreValidator } from "../src/validation/score_validator.js";

describe("Vocal Lyrics AST, Parser & formatSheet (Issue #80 - Commit 1)", () => {
  it("parses single-stanza L| lyrics with syllables, ties (-), and rests (0)", () => {
    const source = `::SCORE::
** Vocal Song **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 | 5 - 3 0 |
    L| 你 好 嗎 喔 | 我 - 很 0 |
}

-> verse ->#
`;
    const sheet = TmdParser.parse(source);
    const section = sheet.entries[0].sections[0];
    expect(section.lyricBlocks).toBeDefined();
    expect(section.lyricBlocks).toHaveLength(1);

    const block = section.lyricBlocks![0];
    expect(block.melodicMeasures).toHaveLength(2);
    expect(block.lyricLines).toHaveLength(1);

    const lyricLine = block.lyricLines[0];
    expect(lyricLine.stanza).toBeUndefined();
    expect(lyricLine.measures).toHaveLength(2);

    const m1 = lyricLine.measures[0];
    expect(m1.soundingTokens.map((t) => t.rawText)).toEqual(["你", "好", "嗎", "喔"]);
    expect(m1.soundingTokens.map((t) => t.cleanWord)).toEqual(["你", "好", "嗎", "喔"]);
    expect(m1.soundingTokens.map((t) => t.kind)).toEqual([
      "syllable",
      "syllable",
      "syllable",
      "syllable",
    ]);

    const m2 = lyricLine.measures[1];
    expect(m2.soundingTokens.map((t) => t.rawText)).toEqual(["我", "-", "很", "0"]);
    expect(m2.soundingTokens.map((t) => t.kind)).toEqual([
      "syllable",
      "tie",
      "syllable",
      "rest",
    ]);
  });

  it("classifies standalone transparent punctuation as 0-slot tokens and merges into adjacent rawText while stripping from cleanWord", () => {
    const source = `::SCORE::
** Quotes & Punctuation **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 0 | 5 6 5 0 |
    L| 「 我 愛 你 」 0 | “ yes- ter- day, ” 0 |
}

-> verse ->#
`;
    const sheet = TmdParser.parse(source);
    const lyricLine = sheet.entries[0].sections[0].lyricBlocks![0].lyricLines[0];

    const m1 = lyricLine.measures[0];
    expect(m1.elements.filter((e) => e.type === "transparent")).toHaveLength(2);
    expect(m1.soundingTokens).toHaveLength(4);
    expect(m1.soundingTokens.map((t) => t.rawText)).toEqual(["「我", "愛", "你」", "0"]);
    expect(m1.soundingTokens.map((t) => t.cleanWord)).toEqual(["我", "愛", "你", "0"]);

    const m2 = lyricLine.measures[1];
    expect(m2.elements.filter((e) => e.type === "transparent")).toHaveLength(2);
    expect(m2.soundingTokens).toHaveLength(4);
    expect(m2.soundingTokens.map((t) => t.rawText)).toEqual(["“yes-", "ter-", "day,”", "0"]);
    expect(m2.soundingTokens.map((t) => t.cleanWord)).toEqual(["yes", "ter", "day", "0"]);
    expect(m2.soundingTokens.map((t) => Boolean(t.isHyphenated))).toEqual([true, true, false, false]);
  });

  it("parses parenthesized lyric groups (你 好) mirroring melodic unit groups (1 1)%(--)", () => {
    const source = `::SCORE::
** Subdivisions **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | (1 1)%(--) 3 4 |
    L| (你 好) 嗎 喔 |
}

-> verse ->#
`;
    const sheet = TmdParser.parse(source);
    const m1 = sheet.entries[0].sections[0].lyricBlocks![0].lyricLines[0].measures[0];
    expect(m1.slots).toHaveLength(3);
    expect(m1.slots[0].type).toBe("group");
    if (m1.slots[0].type === "group") {
      expect(m1.slots[0].soundingTokens.map((t) => t.rawText)).toEqual(["你", "好"]);
    }
    expect(m1.soundingTokens.map((t) => t.rawText)).toEqual(["你", "好", "嗎", "喔"]);
  });

  it("parses multi-stanza L1|..L64|, lenient L | prefixes, omitted outer barlines, and playback stanza selectors verse[L1]", () => {
    const source = `::SCORE::
** Multi-Stanza & Lenient **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    1 1 2 2 | 2 3 4 5
    L1 | A A A A | U U U U
    L2 | B B B B | V V V V
}

TigerTheme {
    <4*>
    | 1 2 3 1 |
    L| 兩 隻 老 虎 |
}

-> verse[L1] -> verse[L2] ->#
`;
    const sheet = TmdParser.parse(source);
    const verseSection = sheet.entries[0].sections[0];
    expect(verseSection.lyricBlocks).toHaveLength(1);
    const block = verseSection.lyricBlocks![0];
    expect(block.melodicMeasures).toHaveLength(2);
    expect(block.lyricLines).toHaveLength(2);
    expect(block.lyricLines[0].stanza).toBe(1);
    expect(block.lyricLines[0].measures[0].soundingTokens.map((t) => t.rawText)).toEqual(["A", "A", "A", "A"]);
    expect(block.lyricLines[0].measures[1].soundingTokens.map((t) => t.rawText)).toEqual(["U", "U", "U", "U"]);
    expect(block.lyricLines[1].stanza).toBe(2);
    expect(block.lyricLines[1].measures[0].soundingTokens.map((t) => t.rawText)).toEqual(["B", "B", "B", "B"]);
    expect(block.lyricLines[1].measures[1].soundingTokens.map((t) => t.rawText)).toEqual(["V", "V", "V", "V"]);

    const protoSection = sheet.entries[1].sections[0];
    expect(protoSection.lyricBlocks).toHaveLength(1);
    expect(protoSection.lyricBlocks![0].lyricLines[0].measures[0].soundingTokens.map((t) => t.rawText)).toEqual([
      "兩",
      "隻",
      "老",
      "虎",
    ]);

    expect(sheet.playback).toHaveLength(2);
    expect(sheet.playback[0]).toMatchObject({ type: "name", name: "verse", stanza: 1 });
    expect(sheet.playback[1]).toMatchObject({ type: "name", name: "verse", stanza: 2 });

    const formatted = formatSheet(sheet);
    expect(formatted).toContain("    | 1 1 2 2 | 2 3 4 5 |\n    L1| A A A A | U U U U |\n    L2| B B B B | V V V V |");
    expect(formatted).toContain("    | 1 2 3 1 |\n    L| 兩 隻 老 虎 |");
    expect(formatted).toContain("-> verse[L1] -> verse[L2] ->#");
  });
});

describe("Semantic Validation & Checker Diagnostics for Lyrics (Issue #80 - Commit 2)", () => {
  it("passes validation for valid 1:1 aligned lyrics including dyads (1+3), tuplets, and transparent punctuation", () => {
    const validScore = `::SCORE::
** Valid Vocal Score **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1+3 (3 4)%(--) 0 | 5 - 3 1 |
    L1| 「 哈 (嗎 喔) 」 0 | 我 - 很 好 |
    L2| 「 嘿 (走 吧) 」 0 | 還 - 不 錯 |
}

-> verse[L1] -> verse[L2] ->#
`;
    const diags = TmdScoreValidator.validate(validScore);
    expect(diags).toEqual([]);
  });

  it("emits E-LYRIC-SLOT-MISMATCH when lyric sounding token count does not match melodic slot count", () => {
    const mismatchScore = `::SCORE::
** Slot Mismatch **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 |
    L| 你 好 嗎 |
}

-> verse ->#
`;
    const diags = TmdScoreValidator.validate(mismatchScore);
    expect(diags.some((d) => d.rule === "E-LYRIC-SLOT-MISMATCH" && d.severity === "error")).toBe(true);
  });

  it("emits E-LYRIC-GROUP when melodic tuplet subdivision is not mirrored by parenthesized lyric group", () => {
    const groupMismatch = `::SCORE::
** Group Mismatch **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | (1 1)%(--) 3 4 |
    L| 你 好 嗎 喔 |
}

-> verse ->#
`;
    const diags = TmdScoreValidator.validate(groupMismatch);
    expect(diags.some((d) => d.rule === "E-LYRIC-GROUP" && d.severity === "error")).toBe(true);
  });

  it("emits E-LYRIC-DIRECTIVE and E-LYRIC-TOKEN-UNSEPARATED for forbidden directives and unseparated CJK tokens", () => {
    const score = `::SCORE::
** Directive and Unseparated **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 |
    L| {mp} 我們 走 吧 0 |
}

-> verse ->#
`;
    const diags = TmdScoreValidator.validate(score);
    expect(diags.some((d) => d.rule === "E-LYRIC-DIRECTIVE" && d.severity === "error")).toBe(true);
    expect(diags.some((d) => d.rule === "E-LYRIC-TOKEN-UNSEPARATED" && d.severity === "error")).toBe(true);
  });

  it("emits E-STANZA-ZERO (L0|), E-STANZA-RANGE (> 64), E-STANZA-DUPLICATE, E-STANZA-INCONSISTENT, W-STANZA-GAP, and W-STANZA-FALLBACK", () => {
    const stanzaErrors = `::SCORE::
** Stanza Diagnostics **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 |
    L0| A A A A |
    L1| B B B B |
    L1| C C C C |
    L3| D D D D |
    L65| E E E E |

    | 5 6 7 1^ |
    L1| F F F F |
}

-> verse ->#
`;
    const diags = TmdScoreValidator.validate(stanzaErrors);
    expect(diags.some((d) => d.rule === "E-STANZA-ZERO" && d.severity === "error")).toBe(true);
    expect(diags.some((d) => d.rule === "E-STANZA-RANGE" && d.severity === "error")).toBe(true);
    expect(diags.some((d) => d.rule === "E-STANZA-DUPLICATE" && d.severity === "error")).toBe(true);
    expect(diags.some((d) => d.rule === "E-STANZA-INCONSISTENT" && d.severity === "error")).toBe(true);
    expect(diags.some((d) => d.rule === "W-STANZA-GAP" && d.severity === "warning")).toBe(true);
    expect(diags.some((d) => d.rule === "W-STANZA-FALLBACK" && d.severity === "warning")).toBe(true);
  });
});

describe("Playback Timeline & Multi-Stanza Broadcast Routing (Issue #80 - Commit 3)", () => {
  it("routes verse[L1] and verse[L2] across playback timeline and broadcasts to tracks with default L| fallback", () => {
    const source = `::SCORE::
** Multi-Stanza Broadcast **
!= 120
?= C
<4/4>

verse:LeadVocal@|0|{
    <4*>
    | 1 2 3 4 |
    L1| 春 天 來 了 |
    L2| 秋 天 到 了 |
}

verse:BackingVocal@|0|{
    <4*>
    | 5 - 5 - |
    L| 啦 - 啦 - |
}

chorus:LeadVocal@|0|{
    <4*>
    | 1^ 7 6 5 |
    L| 唱 首歌 吧 - |
}

-> verse[L1] -> chorus -> verse[L2] ->#
`;
    const sheet = TmdParser.parse(source);
    const leadTimeline = TmdPlaybackRenderer.render(sheet, "LeadVocal");
    const leadNoteEvents = leadTimeline.events.filter((e) => e.content.type === "note");
    expect(leadNoteEvents.map((e) => e.lyric?.cleanWord)).toEqual([
      "春",
      "天",
      "來",
      "了",
      "唱",
      "首歌",
      "吧",
      "-",
      "秋",
      "天",
      "到",
      "了",
    ]);

    const backingTimeline = TmdPlaybackRenderer.render(sheet, "BackingVocal");
    const backingNoteEvents = backingTimeline.events.filter((e) => e.content.type === "note");
    // BackingVocal has 2 sustained notes per verse (duration 2.0 each), played in verse[L1] and verse[L2]
    expect(backingNoteEvents).toHaveLength(4);
    expect(backingNoteEvents.map((e) => e.lyric?.cleanWord)).toEqual(["啦", "啦", "啦", "啦"]);
    expect(backingNoteEvents.map((e) => e.duration)).toEqual([2, 2, 2, 2]);
  });

  it("preserves and shifts prototype lyrics across canon macro voices and attaches syllabic/melisma metadata in TmdMeasureRenderer", () => {
    const source = `::SCORE::
** Canon Lyrics **
!= 120
?= C
<4/4>

TigerTheme {
    <4*>
    | 1 2 3 1 | 3 4 5 - |
    L| yes- ter- day once | more - - - |
}

-> (canon TigerTheme (Soprano Alto) 1) ->#
`;
    const sheet = TmdParser.parse(source);
    const sopranoTimeline = TmdPlaybackRenderer.render(sheet, "Soprano");
    const altoTimeline = TmdPlaybackRenderer.render(sheet, "Alto");

    expect(sopranoTimeline.events.map((e) => e.lyric?.cleanWord)).toEqual([
      "yes",
      "ter",
      "day",
      "once",
      "more",
      "-",
      "-",
    ]);
    expect(sopranoTimeline.events.map((e) => e.lyric?.syllabic)).toEqual([
      "begin",
      "middle",
      "end",
      "single",
      "single",
      undefined,
      undefined,
    ]);
    expect(sopranoTimeline.events[4].lyric?.melismaStart).toBe(true);

    // Alto enters 1 measure (4 beats) later with identical lyrics
    expect(altoTimeline.events[0].position).toBeCloseTo(4.0, 5);
    expect(altoTimeline.events.map((e) => e.lyric?.cleanWord)).toEqual([
      "yes",
      "ter",
      "day",
      "once",
      "more",
      "-",
      "-",
    ]);

    const sopranoMeasures = TmdMeasureRenderer.renderMeasures(sheet, "Soprano");
    expect(sopranoMeasures[0].events.map((e) => e.lyric?.rawText)).toEqual([
      "yes-",
      "ter-",
      "day",
      "once",
    ]);
  });
});

describe("Voice Synthesis Exporters with Lyrics (Issue #80 - Commit 4)", () => {
  const synthSource = `::SCORE::
** Synth Lyrics **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 - | 5 - 3 0 |
    L| 「 か 」 き, く - | け - こ 0 |
}

-> verse ->#
`;

  it("emits MIDI 0xFF 0x05 Lyric Meta Events using cleanWord and omits melisma tie events", () => {
    const sheet = TmdParser.parse(synthSource);
    const timeline = TmdPlaybackRenderer.render(sheet, "Vocal");
    const midiEvents = TmdMIDIGenerator.instrumentEvents(
      timeline,
      "Vocal",
      { type: "standard", name: "Voice Oohs", program: 53 },
      0,
      480
    );

    const lyricEvents = midiEvents.filter((e) => e.message.type === "lyric");
    expect(lyricEvents.map((e) => ({
      tick: e.tick,
      text: e.message.type === "lyric" ? e.message.text : "",
    }))).toEqual([
      { tick: 0, text: "か" },
      { tick: 480, text: "き" },
      { tick: 960, text: "く" },
      { tick: 1920, text: "け" },
      { tick: 2880, text: "こ" },
    ]);

    const midiBinary = TmdMIDIGenerator.generateMIDI(sheet);
    // Verify 0xFF 0x05 meta event marker exists in encoded binary
    let foundLyricMeta = false;
    for (let i = 0; i < midiBinary.length - 1; i++) {
      if (midiBinary[i] === 0xff && midiBinary[i + 1] === 0x05) {
        foundLyricMeta = true;
        break;
      }
    }
    expect(foundLyricMeta).toBe(true);
  });

  it("exports VOCALOID .vsqx and .vsq with cleanWord lyrics, phonemes, and merged melisma durations", () => {
    const sheet = TmdParser.parse(synthSource);
    const vsqx = TmdVSQXGenerator.generateVSQX(sheet);

    expect(vsqx).toContain("<y><![CDATA[か]]></y>");
    expect(vsqx).toContain("<p><![CDATA[k a]]></p>");
    expect(vsqx).toContain("<y><![CDATA[き]]></y>");
    expect(vsqx).toContain("<p><![CDATA[k' i]]></p>");
    expect(vsqx).toContain("<y><![CDATA[く]]></y>");
    expect(vsqx).toContain("<dur>960</dur>");
    expect(vsqx).not.toContain("「");
    expect(vsqx).not.toContain(",");

    const vsqBytes = TmdVSQGenerator.generateVSQ(sheet);
    const iniBytes: number[] = [];
    for (let i = 0; i < vsqBytes.length - 3; i++) {
      if (vsqBytes[i] === 0xff && vsqBytes[i + 1] === 0x01) {
        const len = vsqBytes[i + 2];
        for (let j = 0; j < len; j++) {
          iniBytes.push(vsqBytes[i + 3 + j]);
        }
        i += 2 + len;
      }
    }
    const vsqText = new TextDecoder().decode(new Uint8Array(iniBytes));
    expect(vsqText).toContain('L0="か","k a"');
    expect(vsqText).toContain('L0="き","k\' i"');
  });

  it("exports UTAU .ust with cleanWord lyrics and merged melisma durations", () => {
    const melismaScore = `::SCORE::
** UTAU Melisma **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 |
    L| I free! - - |
}

-> verse ->#
`;
    const sheet = TmdParser.parse(melismaScore);
    const ust = TmdUSTGenerator.generateUST(sheet);
    expect(ust).toContain("Lyric=I\r\n");
    expect(ust).toContain("Lyric=free\r\n");
    expect(ust).not.toContain("Lyric=free!");
    expect(ust).not.toContain("Lyric=-");
    // 'free' spans 3 quarter notes = 3 * 480 = 1440 ticks
    expect(ust).toContain("Length=1440\r\nLyric=free\r\n");
  });
});
