import { describe, expect, it } from "vitest";

import {
  TmdABCGenerator,
  TmdBrailleGenerator,
  TmdChordProGenerator,
  TmdLilyPondGenerator,
  TmdMIDIGenerator,
  TmdMusicXMLGenerator,
  TmdUSTGenerator,
  TmdVSQGenerator,
  TmdVSQXGenerator,
} from "../src/exporters/index.js";
import { TmdLSPCompletionEngine } from "../src/lsp/completion.js";
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
    | 1 2 2 2 |
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
    // 'free' on same pitch 2 spans 3 quarter notes = 3 * 480 = 1440 ticks
    expect(ust).toContain("Length=1440\r\nLyric=free\r\n");
  });
});

describe("Sheet Engraving Exporters with Lyrics (Issue #80 - Commit 5)", () => {
  const engravingSource = `::SCORE::
** Engraving Lyrics **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1    2    3   0 | 5 -  3 1 |
    L1| 「 yes- ter- day 」 0 | 我 - 很 好？ |
    L2| to-  day  I   0 | 唱 - 首歌 吧！ |
}

-> verse ->#
`;

  it("exports MusicXML <lyric> tags with rawText, syllabic states, multi-stanza numbers, and melisma <extend/> while omitting lyrics on rests", () => {
    const sheet = TmdParser.parse(engravingSource);
    const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);

    expect(xml).toContain('<lyric number="1">');
    expect(xml).toContain("<syllabic>begin</syllabic>");
    expect(xml).toContain("<text>「yes</text>");
    expect(xml).toContain("<syllabic>middle</syllabic>");
    expect(xml).toContain("<text>ter</text>");
    expect(xml).toContain("<syllabic>end</syllabic>");
    expect(xml).toContain("<text>day」</text>");
    expect(xml).toContain("<text>好？</text>");
    expect(xml).toContain('<extend type="start"/>');
    expect(xml).toContain('<lyric number="2">');
    expect(xml).toContain("<text>to</text>");
    expect(xml).toContain("<text>吧！</text>");

    // Also test melisma continuation across separate notes (- on note)
    const melismaNotesScore = `::SCORE::
** Melisma Notes **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 |
    L| I free - - |
}

-> verse ->#
`;
    const melismaXml = TmdMusicXMLGenerator.generateMusicXML(TmdParser.parse(melismaNotesScore));
    expect(melismaXml).toContain('<extend type="start"/>');
    expect(melismaXml).toContain('<extend type="continue"/>');
  });

  it("exports LilyPond \\lyricmode with rawText, -- hyphenation, __ melisma, rest skipping, and multi-stanza labels", () => {
    const sheet = TmdParser.parse(engravingSource);
    const ly = TmdLilyPondGenerator.generateLilyPond(sheet);

    expect(ly).toContain("\\lyricmode");
    expect(ly).toContain("\\addlyrics");
    expect(ly).toContain('\\set stanza = "1."');
    expect(ly).toContain('\\set stanza = "2."');
    expect(ly).toContain('"「yes" -- ter -- "day」"');
    expect(ly).toContain('to -- day');
    expect(ly).toContain('"我" __ "很" "好？"');
  });

  it("exports ABC w: lyric lines with rawText, _ melisma, * unlabelled note skips, and ~ numbered stanzas", () => {
    const sheet = TmdParser.parse(engravingSource);
    const abc = TmdABCGenerator.generateABC(sheet);

    expect(abc).toContain("w: 1.~「yes- ter- day」 | 我 很 好？ |");
    expect(abc).toContain("w: 2.~to- day I | 唱 首歌 吧！ |");
  });

  it("exports ChordPro inline chord-over-lyric temporal intersection", () => {
    const chordProSource = `::SCORE::
** ChordPro Song **
!= 120
?= C
<4/4>

verse:CHORD@|0|{
    <4*>
    | [C] - [G] - |
}

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 |
    L| 你 好 嗎？ 喔 |
}

-> verse ->#
`;
    const sheet = TmdParser.parse(chordProSource);
    const cho = TmdChordProGenerator.generateChordPro(sheet);
    expect(cho).toContain("[C]你 好 [G]嗎？ 喔");
  });

  it("exports Music Braille vocal lyrics with rawText and literary braille encoding", () => {
    const sheet = TmdParser.parse(engravingSource);
    const preview = TmdBrailleGenerator.generateBraillePreview(sheet);
    expect(preview.asciiText).toContain(";;");
    expect(preview.tracks[0].measures[0].sightedSummary).toContain("「yes-");
  });
});

describe("LSP Stanza Selector Auto-Completion (Issue #80 - Commit 6)", () => {
  it("completes stanza selectors L1, L2 after -> verse[ and reuses closing ] when present", () => {
    const source = `::SCORE::
** Completion Song **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 |
    L1| 你 好 嗎 喔 |
    L2| 吃 飽 了 嗎 |
}

-> verse[
`;
    const items = TmdLSPCompletionEngine.complete(source, { line: 13, character: 9 });
    expect(items.map((i) => i.label)).toEqual(["L1", "L2"]);
    expect(items[0].insertText).toBe("L1]");

    const sourceWithClosing = source.replace("-> verse[", "-> verse[]");
    const itemsWithClosing = TmdLSPCompletionEngine.complete(sourceWithClosing, {
      line: 13,
      character: 9,
    });
    expect(itemsWithClosing.map((i) => i.label)).toEqual(["L1", "L2"]);
    expect(itemsWithClosing[0].insertText).toBe("L1");
  });
});

describe("Review Batch 1: Parser, Validator & Playback Edge Cases (Issue #80)", () => {
  it("handles nested or stray closing braces/parens in lyric lines without infinite loop and emits E-LYRIC-DIRECTIVE", () => {
    const source = `::SCORE::
** Stray Brace **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 |
    L| { {mp} } ) A B C D |
}

-> verse ->#
`;
    const diags = TmdScoreValidator.validate(source);
    expect(diags.some((d) => d.rule === "E-LYRIC-DIRECTIVE")).toBe(true);
  });

  it("preserves line and column on Playback order nodes for accurate stanza diagnostics", () => {
    const source = `::SCORE::
** Playback Location **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 |
    L1| A B C D |
}

-> verse[L0] -> verse[L65] ->#
`;
    const diags = TmdScoreValidator.validate(source);
    const zeroDiag = diags.find((d) => d.rule === "E-STANZA-ZERO");
    const rangeDiag = diags.find((d) => d.rule === "E-STANZA-RANGE");
    expect(zeroDiag?.line).toBe(13);
    expect(zeroDiag?.column).toBeGreaterThan(1);
    expect(rangeDiag?.line).toBe(13);
    expect(rangeDiag?.column).toBeGreaterThan(10);
  });

  it("carries pending transparent prefix and trailing punctuation across measure barlines on the same lyric line", () => {
    const source = `::SCORE::
** Cross-Barline Punctuation **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 | 5 6 7 1^ |
    L| A B C D 「 | E F G H 」 |
}

-> verse ->#
`;
    const sheet = TmdParser.parse(source);
    const lLine = sheet.entries[0].sections[0].lyricBlocks![0].lyricLines[0];
    expect(lLine.measures[1].soundingTokens[0].rawText).toBe("「E");
    expect(lLine.measures[1].soundingTokens[3].rawText).toBe("H」");
  });

  it("emits E-LYRIC-SLOT-MISMATCH when lyric rest 0 is paired with a sounding note or syllable is paired with melodic rest 0", () => {
    const source = `::SCORE::
** Rest Kind Mismatch **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 0 4 |
    L| A 0 B C |
}

-> verse ->#
`;
    const diags = TmdScoreValidator.validate(source);
    const mismatches = diags.filter((d) => d.rule === "E-LYRIC-SLOT-MISMATCH");
    expect(mismatches.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves hyphenated syllabic continuity across melisma ties (yes- - day) and across <N*> sections in the same Entry", () => {
    const source = `::SCORE::
** Hyphen Melisma & Cross-Section **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1    2   3   4    |
    L| yes- -   day yes- |
    <8*>
    | 5    6   7   1^  2^ 3^ 4^ 5^ |
    L| ter- -   day ok  a  b  c  d  |
}

-> verse ->#
`;
    const sheet = TmdParser.parse(source);
    const timeline = TmdPlaybackRenderer.render(sheet, "Vocal");
    const syllables = timeline.events
      .filter((e) => e.lyric?.kind === "syllable")
      .map((e) => ({
        rawText: e.lyric!.rawText,
        syllabic: e.lyric!.syllabic,
        melismaStart: e.lyric!.melismaStart,
      }));

    expect(syllables[0]).toEqual({ rawText: "yes-", syllabic: "begin", melismaStart: true });
    expect(syllables[1]).toEqual({ rawText: "day", syllabic: "end", melismaStart: undefined });
    expect(syllables[2]).toEqual({ rawText: "yes-", syllabic: "begin", melismaStart: undefined });
    expect(syllables[3]).toEqual({ rawText: "ter-", syllabic: "middle", melismaStart: true });
    expect(syllables[4]).toEqual({ rawText: "day", syllabic: "end", melismaStart: undefined });
  });
});

describe("Review Batch 2: ABC, LilyPond & UST Exporter Alignment (Issue #80)", () => {
  it("aligns ABC w: lines across unlabelled pitched notes (*), skips rests without *, emits _ only on separate melisma notes, and uses 1.~ stanza prefix", () => {
    const source = `::SCORE::
** ABC Alignment **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 |
    | 1 2 3 0 | 5 - 3 1 |
    L1| sing - it 0 | hold - on now |
    L2| la   - da 0 | go   - on now |
}

-> verse ->#
`;
    const sheet = TmdParser.parse(source);
    const abc = TmdABCGenerator.generateABC(sheet);
    expect(abc).toContain("w: 1.~* * * * | sing _ it | hold on now |");
    expect(abc).toContain("w: 2.~* * * * | la _ da | go on now |");
  });

  it("aligns LilyPond \\addlyrics across unlabelled note attacks (_) and untied melisma continuation notes (__ _)", () => {
    const source = `::SCORE::
** LilyPond Alignment **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 |
    | 1 2 3 4 |
    L| sing - - now |
}

-> verse ->#
`;
    const sheet = TmdParser.parse(source);
    const ly = TmdLilyPondGenerator.generateLilyPond(sheet);
    expect(ly).toContain("_ _ _ _");
    expect(ly).toContain("sing __ _ _ now");
  });

  it("preserves tempo and pitch changes across melisma in UST instead of swallowing them", () => {
    const source = `::SCORE::
** UST Tempo Melisma **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 {!=60} 1 2 2 |
    L| la - - - |
}

-> verse ->#
`;
    const sheet = TmdParser.parse(source);
    const ust = TmdUSTGenerator.generateUST(sheet);
    expect(ust).toContain("Lyric=la\r\n");
    expect(ust).toContain("Tempo=60.00\r\n");
    expect(ust).toContain("Lyric=-\r\nNoteNum=62\r\n");
  });
});

describe("Review Batch 3: ChordPro & Braille Exporter Fixes (Issue #80)", () => {
  it("discovers chords from chord-bearing tracks in ChordPro even when another lead/guitar track precedes it", () => {
    const source = `::SCORE::
** Multi-Track ChordPro **
!= 120
?= C
<4/4>

verse:Guitar@|0|{
    <4*>
    | 5 3 2 1 |
}

verse:Piano@|0|{
    <4*>
    | [C] - [G] - |
}

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 |
    L| 你 好 嗎 喔 |
}

-> verse ->#
`;
    const sheet = TmdParser.parse(source);
    const cho = TmdChordProGenerator.generateChordPro(sheet);
    expect(cho).toContain("[C]你 好 [G]嗎 喔");
  });

  it("supports barOverBar vocal lyrics, effectiveLineWidth wrapping, and ASCII-safe tactile braille without CJK/fullwidth leakage", () => {
    const source = `::SCORE::
** Song **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 2 3 4 | 5 6 7 1^ |
}

verse:Vocal@|0|{
    <4*>
    | 1    2        3        4        | 5        6    7    1^     |
    L| 「hello wonderful beautiful world」 | singing「你 好嗎？」today! |
}

-> verse ->#
`;
    const sheet = TmdParser.parse(source);
    const barOverBarPreview = TmdBrailleGenerator.generateBraillePreview(sheet, {
      layout: "barOverBar",
      lineWidth: 24,
    });

    // 1. barOverBar must include vocal lyric lines (;;)
    expect(barOverBarPreview.asciiText).toContain(";; ");

    // 2. Every line in asciiText must respect lineWidth (24) and continuation lines start with 2 spaces
    const lines = barOverBarPreview.asciiText.trimEnd().split("\n");
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(24);
    }
    const lyricStartIdx = lines.findIndex((l) => l.startsWith(";; "));
    expect(lyricStartIdx).toBeGreaterThanOrEqual(0);
    expect(lines[lyricStartIdx + 1]?.startsWith("  ")).toBe(true);

    // 3. No non-ASCII characters may leak into asciiText (.brf), and unicodeText (.brl) must only contain Braille cells + whitespace
    for (const ch of barOverBarPreview.asciiText) {
      expect(ch.charCodeAt(0)).toBeLessThanOrEqual(0x7f);
    }
    for (const ch of barOverBarPreview.unicodeText) {
      if (ch === "\n" || ch === "\r" || ch === " ") continue;
      const code = ch.charCodeAt(0);
      expect(code).toBeGreaterThanOrEqual(0x2800);
      expect(code).toBeLessThanOrEqual(0x28ff);
    }

    // 4. Sighted summary still preserves original rawText including CJK and fullwidth punctuation
    const vocalTrack = barOverBarPreview.tracks.find((t) => t.instrument === "Vocal");
    expect(vocalTrack?.measures[1].sightedSummary).toContain("「你");
    expect(vocalTrack?.measures[1].sightedSummary).toContain("好嗎？」");
  });
});

describe("Round 2 Review: Directive/Comment Lines Inside Melodic Phrase & Sequential Stanza Unrolling (Issue #80)", () => {
  it("keeps melodic measure open across standalone directive line inside explicit barlines before L|", () => {
    const source = `::SCORE::
** Directive Line in Barlined Measure **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2
    {p}
    3 4 |
    L| 春 風 吹 過 |
}

-> verse ->#
`;
    const diags = TmdScoreValidator.validate(source);
    expect(diags).toEqual([]);

    const sheet = TmdParser.parse(source);
    const timeline = TmdPlaybackRenderer.render(sheet, "Vocal");
    const words = timeline.events
      .filter((e) => e.lyric?.kind === "syllable")
      .map((e) => e.lyric!.cleanWord);
    expect(words).toEqual(["春", "風", "吹", "過"]);
  });

  it("keeps melodic measure open across standalone directive line in barless melodic phrase before L|", () => {
    const source = `::SCORE::
** Directive Line in Barless Phrase **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    1 2
    {p}
    3 4
    L| 春 風 吹 過 |
}

-> verse ->#
`;
    const diags = TmdScoreValidator.validate(source);
    expect(diags).toEqual([]);

    const sheet = TmdParser.parse(source);
    const timeline = TmdPlaybackRenderer.render(sheet, "Vocal");
    const words = timeline.events
      .filter((e) => e.lyric?.kind === "syllable")
      .map((e) => e.lyric!.cleanWord);
    expect(words).toEqual(["春", "風", "吹", "過"]);
  });

  it("keeps melodic measure open across standalone comment line inside explicit barlines before L|", () => {
    const source = `::SCORE::
** Comment Line in Barlined Measure **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2
    /* standalone comment inside open measure */
    3 4 |
    L| 春 風 吹 過 |
}

-> verse ->#
`;
    const diags = TmdScoreValidator.validate(source);
    expect(diags).toEqual([]);

    const sheet = TmdParser.parse(source);
    const timeline = TmdPlaybackRenderer.render(sheet, "Vocal");
    const words = timeline.events
      .filter((e) => e.lyric?.kind === "syllable")
      .map((e) => e.lyric!.cleanWord);
    expect(words).toEqual(["春", "風", "吹", "過"]);
  });

  it("exports sequential stanza selectors (-> verse[L1] -> verse[L2] ->#) cleanly in MusicXML, LilyPond, and ABC without duplicating unselected stanzas", () => {
    const source = `::SCORE::
** Sequential Stanza Unrolling **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 |
    L1| 春 風 吹 過 |
    L2| 秋 雨 落 下 |
}

-> verse[L1] -> verse[L2] ->#
`;
    const sheet = TmdParser.parse(source);
    const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);
    expect(xml).toContain("<text>春</text>");
    expect(xml).toContain("<text>秋</text>");

    const ly = TmdLilyPondGenerator.generateLilyPond(sheet);
    expect(ly).toContain('"春" "風" "吹" "過"');
    expect(ly).toContain('"秋" "雨" "落" "下"');
    expect(ly).not.toContain("_ _ _ _");

    const abc = TmdABCGenerator.generateABC(sheet);
    expect(abc).toContain("|:");
    expect(abc).toContain("w: 1.~春 風 吹 過 |");
    expect(abc).toContain("w: 2.~秋 雨 落 下 |");
    expect(abc).not.toContain("* * * *");
  });

  it("treats standalone '_' as a lyric rest placeholder alongside '0'", () => {
    const source = `::SCORE::
** Underscore Rest Placeholder **
!= 112
?= G
<2/4>

TaiwanKoshinka:Piano@|0|{
    <16*>
    | 5_ - - 5_ 1 - - 2 | 3 - - 2 1 - - 1 | 5 - - 5 3 - - 1 | 2 - - - - - 0 - |
    L1| せ - - ん だ - - ん | の - - - は - - な | か - - ぜ か - - を | る - - - - - _ - |
}

-> TaiwanKoshinka ->#
`;
    const diags = TmdScoreValidator.validate(source);
    expect(diags.filter((d) => d.severity === "error")).toEqual([]);

    const sheet = TmdParser.parse(source);
    const lMeasure = sheet.entries[0].sections[0].lyricBlocks![0].lyricLines[0].measures[3];
    expect(lMeasure.soundingTokens[6].kind).toBe("rest");
    expect(lMeasure.soundingTokens[7].kind).toBe("tie");

    const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);
    expect(xml).toContain("<text>る</text>");
    expect(xml).not.toContain("<text>_</text>");

    const ly = TmdLilyPondGenerator.generateLilyPond(sheet);
    expect(ly).toContain('"る"');
    expect(ly).not.toContain('"_"');

    const abc = TmdABCGenerator.generateABC(sheet);
    expect(abc).toContain("か ぜ か を | る");
    expect(abc).not.toContain("る _");

    const vsqx = TmdVSQXGenerator.generateVSQX(sheet);
    expect(vsqx).toContain("<y><![CDATA[る]]></y>");
    expect(vsqx).not.toContain("<y><![CDATA[_]]></y>");

    const ust = TmdUSTGenerator.generateUST(sheet);
    expect(ust).toContain("Lyric=る\r\n");
    expect(ust).not.toContain("Lyric=_\r\n");

    const midiBytes = TmdMIDIGenerator.generateMIDI(sheet);
    const decodedMidi = new TextDecoder().decode(midiBytes);
    expect(decodedMidi).toContain("る");
    expect(decodedMidi).not.toContain("\xFF\x05\x01_");
  });
});


