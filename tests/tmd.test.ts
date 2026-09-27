import { mkdtempSync, readFileSync, rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';

import { describe, expect,it } from 'vitest';

import { Lexer } from '../src/core/parser.js';
import {
  Accidental,
  ChordRoot,
  ChordSymbol,
  FilePathNormalizer,
  formatSheet,
  formatSummary,
  ScaleDegree,
  SheetInstrumentHelper,
  TextEncodingDetector,
  TMD_VERSION,
  TMDABCGenerator,
  TMDLilyPondGenerator,
  TMDMIDIGenerator,
  TMDMusicXMLGenerator,
  TmdParser,
  TMDPlaybackRenderer,
  TmdSkill,
  TMDWAVRenderer,
} from '../src/index.js';

const sampleTMD = `
::SCORE::
/* Comment block */
** Sample Song **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    1 2 3 1
    1 2 3 1
    3 4 5 -
    3 4 5 -
}

verse:Guitar@|0|{
    <4*>
    [C] . . .
    [C] . . .
    [C] . [G] .
    [C] . [G] .
}

chorus:Piano@|0|{
    <4*>
    5 6 5 4
    3 1 2 -
}

chorus:Guitar@|0|{
    <4*>
    [G] . [F] .
    [C] . [G] .
}

-> verse -> chorus ->#
`;

describe('TmdParser and Format', () => {
  it('parses header correctly', () => {
    const sheet = TmdParser.parse(sampleTMD);
    expect(sheet.name).toBe('Sample Song');
    expect(sheet.speed).toBe(120);
    expect(sheet.keySignature.toString()).toBe('C');
    expect(sheet.beat.count).toBe(4);
    expect(sheet.beat.noteValue).toBe(4);
    expect(sheet.entries.length).toBe(4);
    expect(sheet.entries[0].line).toBe(9);
    expect(sheet.entries[1].line).toBe(17);
    expect(sheet.entries[2].line).toBe(25);
    expect(sheet.entries[3].line).toBe(31);
    expect(sheet.playback).toEqual([
      { type: 'name', name: 'verse' },
      { type: 'name', name: 'chorus' }
    ]);
  });

  it('formats sheet back to string without loss of structure', () => {
    const sheet = TmdParser.parse(sampleTMD);
    const formatted = formatSheet(sheet);
    expect(formatted).toContain('::SCORE::');
    expect(formatted).toContain('** Sample Song **');
    expect(formatted).toContain('-> verse -> chorus ->#');
    const reParsed = TmdParser.parse(formatted);
    expect(reParsed.name).toBe(sheet.name);
    expect(reParsed.entries.length).toBe(sheet.entries.length);
  });

  it('generates summary', () => {
    const sheet = TmdParser.parse(sampleTMD);
    const summary = formatSummary(sheet);
    expect(summary).toContain('Name:         Sample Song');
    expect(summary).toContain('KeySignature: C');
    expect(summary).toContain('Entries:      4');
  });

  it('includes an explicit declared key separately from the key signature', () => {
    const sheet = TmdParser.parse(sampleTMD.replace('?= C', '?= D\nkey= Bm'));
    const summary = formatSummary(sheet);
    expect(summary).toContain('DeclaredKey:  Bm');
    expect(summary).toContain('KeySignature: D');
  });
});

describe('TMDPlaybackRenderer', () => {
  it('renders playback events with timeline offsets', () => {
    const sheet = TmdParser.parse(sampleTMD);
    const timeline = TMDPlaybackRenderer.render(sheet, 'Piano');
    expect(timeline.events.length).toBeGreaterThan(0);
    expect(timeline.duration).toBeGreaterThan(0);
  });
});

describe('Exporters', () => {
  it('generates valid ABC notation', () => {
    const sheet = TmdParser.parse(sampleTMD);
    const abc = TMDABCGenerator.generateABC(sheet);
    expect(abc).toContain('X:1');
    expect(abc).toContain('T:Sample Song');
    expect(abc).toContain('M:4/4');
    expect(abc).toContain('K:C');
    expect(abc).toContain('V:V1');
  });

  it('generates valid LilyPond score', () => {
    const sheet = TmdParser.parse(sampleTMD);
    const ly = TMDLilyPondGenerator.generateLilyPond(sheet);
    expect(ly).toContain('\\version "2.24.0"');
    expect(ly).toContain('title = "Sample Song"');
    expect(ly).toContain('\\time 4/4');
  });

  it('generates valid MusicXML', () => {
    const sheet = TmdParser.parse(sampleTMD);
    const xml = TMDMusicXMLGenerator.generateMusicXML(sheet);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<score-partwise version="4.0">');
    expect(xml).toContain('<work-title>Sample Song</work-title>');
    expect(xml).toContain('</score-partwise>');
  });

  it('generates valid Standard MIDI binary data', () => {
    const sheet = TmdParser.parse(sampleTMD);
    const midiBytes = TMDMIDIGenerator.generateMIDI(sheet);
    expect(midiBytes.length).toBeGreaterThan(0);
    // MIDI magic header 'MThd'
    expect(midiBytes[0]).toBe(0x4d);
    expect(midiBytes[1]).toBe(0x54);
    expect(midiBytes[2]).toBe(0x68);
    expect(midiBytes[3]).toBe(0x64);
  });
});

describe('Input utilities and platform features', () => {
  it('normalizes file URLs and editor locations', () => {
    expect(FilePathNormalizer.isFileURL('file:///tmp/a%20b.tmd')).toBe(true);
    expect(FilePathNormalizer.fileURLToPath('file:///tmp/a%20b.tmd')).toBe(normalize('/tmp/a b.tmd'));
    expect(FilePathNormalizer.parseLocation('song.tmd:42:7')).toEqual({ filePath: 'song.tmd', line: 42, column: 7 });
    expect(FilePathNormalizer.parseLocation('song.tmd#L42C7')).toEqual({ filePath: 'song.tmd', line: 42, column: 7 });
  });

  it('decodes UTF-8 and UTF-16 input', () => {
    const utf8 = TextEncodingDetector.detectAndDecode(new TextEncoder().encode('測試'));
    expect(utf8).toEqual({ content: '測試', encoding: 'UTF-8' });
    const utf16 = new Uint8Array([0xff, 0xfe, 0x2c, 0x6e, 0x66, 0x8a]);
    expect(TextEncodingDetector.detectAndDecode(utf16)?.content).toBe('測試');
    expect(TextEncodingDetector.detectAndDecode(new Uint8Array([0xb4, 0xfa, 0xb8, 0xd5]))?.content).toBe('測試');
  });

  it('parses data and files, and reports token ranges', () => {
    const input = '::SCORE::\n** File **\n->#';
    expect(TmdParser.parseData(new TextEncoder().encode(input)).name).toBe('File');
    const dir = mkdtempSync(join(tmpdir(), 'tmd-ts-'));
    const file = join(dir, 'score.tmd');
    writeFileSync(file, input);
    expect(TmdParser.parseFile(file).name).toBe('File');
    expect(new Lexer(input).tokenizeWithRanges()[0].range.start.line).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it('renders a valid WAV and installs the skill to a custom directory', () => {
    const sheet = TmdParser.parse(sampleTMD);
    const wav = TMDWAVRenderer.renderWAV(sheet, 8000);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    const dir = mkdtempSync(join(tmpdir(), 'tmd-skill-'));
    expect(TmdSkill.installSkills([dir])[0].installed).toBe(true);
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toContain('# TMD');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('TMD language edge cases', () => {
  it('parses directives, tuplets, percussion, program text, and arrangement modifiers', () => {
    const source = `::SCORE::\n** Edge **\n!= 100\n?= F'\n<6/8>\n~ "詞：測試"\npart:Drum@|-1|{\n<8*>\n{!=140} XxTS (1' 2, 3^)%(--) {!+10} {?+2} [Dm7-5] -\n}\nscript:Program@1{\n"""echo hi\n"""\n}\n-> part -> {?+2} -> {?=G} ->#`;
    const sheet = TmdParser.parse(source);
    expect(sheet.keySignature.toString()).toBe("F'");
    expect(sheet.beat).toEqual({ count: 6, noteValue: 8 });
    expect(sheet.metadata.lyrics).toBe('詞：測試');
    expect(sheet.entries[0].start).toBe(-1);
    expect(sheet.entries[0].sections[0].directives.length).toBe(3);
    expect(sheet.entries[0].sections[0].unitGroups.some(group => group.units[0].type === 'percussion')).toBe(true);
    expect(sheet.entries[1].showProgram).toContain('echo hi');
    expect(sheet.playback).toEqual([{ type: 'name', name: 'part' }, { type: 'relative', value: '+2' }, { type: 'absolute', value: 'G' }]);
  });

  it('rejects malformed input with a useful error', () => {
    expect(() => TmdParser.parse('not a score')).toThrow(/Unexpected token at 1:1: `not` \(expected ::SCORE::\)/);
    expect(() => TmdParser.parse('::SCORE::\npart')).toThrow(/Unexpected token at 2:1: `part` \(expected :\)/);
  });

  it('tracks tempo/key/time changes in playback state', () => {
    const sheet = TmdParser.parse(`::SCORE::\n** Changes **\n!=100\n?=C\n<4/4>\npart:Piano@|0|{\n<4*>\n1 {!+20} 2 {?+2} 3 {<3/4>} 4\n}\n-> part ->#`);
    const timeline = TMDPlaybackRenderer.render(sheet, 'Piano');
    expect(timeline.events).toHaveLength(4);
    expect(timeline.events[1].state.tempo).toBe(120);
    expect(timeline.events[2].state.keyOffset).toBe(2);
    expect(timeline.events[3].state.timeSignature).toEqual({ count: 3, noteValue: 4 });
    expect(timeline.duration).toBeGreaterThan(0);
  });

  describe('Issue #1: spacing forms from original TMD syntax', () => {
    const makeScore = (body: string) => `::SCORE::\n** Repro **\n!= 100\n<4/4>\n\nm:piano@|0|{\n    <4*>\n    ${body}\n}\n\n-> m ->#\n`;

    it('parses tuplets with whitespace between % and ( correctly (length = 2 beats)', () => {
      const sheet = TmdParser.parse(makeScore('(1 2 5 1 2 5) % (--) 4 3'));
      const groups = sheet.entries[0].sections[0].unitGroups;
      const beats = groups.reduce((sum, g) => sum + g.length, 0);
      expect(beats).toBe(4);
      expect(groups).toHaveLength(3);
      // First group should be tuplet with 6 units and length 2
      expect(groups[0].units).toHaveLength(6);
      expect(groups[0].length).toBe(2);
      expect(groups[1].length).toBe(1);
      expect(groups[2].length).toBe(1);
    });

    it('parses unspaced digits inside and outside tuplets as individual notes', () => {
      const sheet = TmdParser.parse(makeScore('(125125)%(--) 43'));
      const groups = sheet.entries[0].sections[0].unitGroups;
      const beats = groups.reduce((sum, g) => sum + g.length, 0);
      expect(beats).toBe(4);
      expect(groups).toHaveLength(3);
      expect(groups[0].units).toHaveLength(6);
      expect(groups[0].length).toBe(2);
      // groups[1] should be note '4', groups[2] should be note '3'
      expect(groups[1].units[0].type).toBe('note');
      if (groups[1].units[0].type === 'note') {
        expect(groups[1].units[0].note.degree).toBe(4);
      }
      expect(groups[2].units[0].type).toBe('note');
      if (groups[2].units[0].type === 'note') {
        expect(groups[2].units[0].note.degree).toBe(3);
      }
    });

    it('parses unspaced digits with spaces in tuplet: (125125) % (--) 43', () => {
      const sheet = TmdParser.parse(makeScore('(125125) % (--) 43'));
      const groups = sheet.entries[0].sections[0].unitGroups;
      const beats = groups.reduce((sum, g) => sum + g.length, 0);
      expect(beats).toBe(4);
      expect(groups).toHaveLength(3);
      expect(groups[0].units).toHaveLength(6);
      expect(groups[0].length).toBe(2);
    });

    it('parses consecutive unspaced ties (---, ----) following notes and rests', () => {
      // 1--- is a whole note (1 beat of note + 3 beats of ties)
      // 0--- is a whole rest (1 beat of rest + 3 beats of ties)
      const sheet = TmdParser.parse(makeScore('1--- 0--- 5-- 1-'));
      const groups = sheet.entries[0].sections[0].unitGroups;
      const beats = groups.reduce((sum, g) => sum + g.length, 0);
      expect(beats).toBe(13); // 1--- (4) + 0--- (4) + 5-- (3) + 1- (2) = 13
      expect(groups).toHaveLength(13);
      expect(groups[0].units[0]).toEqual({ type: 'note', note: { degree: 1, accidental: Accidental.Natural, octave: 0 } });
      expect(groups[1].units[0]).toEqual({ type: 'tie' });
      expect(groups[2].units[0]).toEqual({ type: 'tie' });
      expect(groups[3].units[0]).toEqual({ type: 'tie' });
      expect(groups[4].units[0]).toEqual({ type: 'rest' });
      expect(groups[5].units[0]).toEqual({ type: 'tie' });
      expect(groups[6].units[0]).toEqual({ type: 'tie' });
      expect(groups[7].units[0]).toEqual({ type: 'tie' });
    });

    it('parses tuplets with various dash lengths and internal consecutive ties or notes', () => {
      // (1 2 3)% (---) -> 3-tuplet over 3 beats
      // (123)%(----) -> 3-tuplet over 4 beats
      const sheet = TmdParser.parse(makeScore('(1 2 3)% (---) (123)%(----)'));
      const groups = sheet.entries[0].sections[0].unitGroups;
      expect(groups).toHaveLength(2);
      expect(groups[0].units).toHaveLength(3);
      expect(groups[0].length).toBe(3);
      expect(groups[1].units).toHaveLength(3);
      expect(groups[1].length).toBe(4);
    });

    it('parses unspaced notes with octave and accidental modifiers mixed with consecutive ties', () => {
      // 1'^2,_3^-- 43-
      // 1'^ : sharp do, octave up (1 beat)
      // 2,_ : flat re, octave down (1 beat)
      // 3^ : mi, octave up (1 beat)
      // -- : two ties (2 beats)
      // 4 : fa (1 beat)
      // 3 : mi (1 beat)
      // - : one tie (1 beat)
      const sheet = TmdParser.parse(makeScore("1'^2,_3^-- 43-"));
      const groups = sheet.entries[0].sections[0].unitGroups;
      const beats = groups.reduce((sum, g) => sum + g.length, 0);
      expect(beats).toBe(8);
      expect(groups).toHaveLength(8);
      expect(groups[0].units[0]).toEqual({ type: 'note', note: { degree: 1, accidental: Accidental.Sharp, octave: 1 } });
      expect(groups[1].units[0]).toEqual({ type: 'note', note: { degree: 2, accidental: Accidental.Flat, octave: -1 } });
      expect(groups[2].units[0]).toEqual({ type: 'note', note: { degree: 3, accidental: Accidental.Natural, octave: 1 } });
      expect(groups[3].units[0]).toEqual({ type: 'tie' });
      expect(groups[4].units[0]).toEqual({ type: 'tie' });
      expect(groups[5].units[0]).toEqual({ type: 'note', note: { degree: 4, accidental: Accidental.Natural, octave: 0 } });
      expect(groups[6].units[0]).toEqual({ type: 'note', note: { degree: 3, accidental: Accidental.Natural, octave: 0 } });
      expect(groups[7].units[0]).toEqual({ type: 'tie' });
    });

    it('parses negative transposition {?-1} correctly in orders and applies playback shift', () => {
      const score = `::SCORE::
** Transpose Repro **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    1 2 3 4
}

-> verse -> {?-1} -> verse -> {?+2} -> verse ->#
`;
      const sheet = TmdParser.parse(score);
      expect(sheet.playback).toHaveLength(5);
      expect(sheet.playback[1]).toEqual({ type: 'relative', value: '-1' });
      expect(sheet.playback[3]).toEqual({ type: 'relative', value: '+2' });

      const timeline = TMDPlaybackRenderer.render(sheet, 'Piano');
      expect(timeline.events).toHaveLength(12);
      // First verse (C major: keyOffset = 0)
      expect(timeline.events[0].state.keyOffset).toBe(0);
      // Second verse after {?-1} (B: keyOffset = -1)
      expect(timeline.events[4].state.keyOffset).toBe(-1);
      // Third verse after {?+2} (C#: keyOffset = 1)
      expect(timeline.events[8].state.keyOffset).toBe(1);
    });

    it('extends duration of last note in tuplet when followed by tie outside tuplet', () => {
      // (1 2 3 4 5 6)%(--) - : 6 notes over 2 beats (each 2/6 = 1/3 beat), followed by 1-beat tie.
      // The last note (6) should have duration 1/3 + 1 = 4/3 beats!
      const score = `::SCORE::
** Tuplet Tie Test **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    (1 2 3 4 5 6)%(--) - 1 -
}

-> verse ->#
`;
      const sheet = TmdParser.parse(score);
      const timeline = TMDPlaybackRenderer.render(sheet, 'Piano');
      // Should have 6 notes from tuplet + 1 note from '1', total 7 notes (no extra note from tie)
      expect(timeline.events).toHaveLength(7);
      // Note 6 (index 5) should have duration 1/3 + 1 = 4/3 beats
      expect(timeline.events[5].duration).toBeCloseTo(4.0 / 3.0, 4);
      // Note 1 (index 6) starts at position 3.0 with duration 2.0 (1 beat + 1 tie)
      expect(timeline.events[6].position).toBeCloseTo(3.0, 4);
      expect(timeline.events[6].duration).toBeCloseTo(2.0, 4);
    });

    it('supports generating MIDI for a single target paragraph and/or instrument', () => {
      const sheet = TmdParser.parse(sampleTMD);
      // Full score has 1 conductor track + 2 instrument tracks (Piano, Guitar) = 3 tracks
      const fullMidi = TMDMIDIGenerator.generateMIDI(sheet);
      const fullTracks = (fullMidi[10] << 8) | fullMidi[11];
      expect(fullTracks).toBe(3);

      // Generate MIDI for only verse: 1 conductor track + 2 instrument tracks = 3 tracks
      const verseMidi = TMDMIDIGenerator.generateMIDI(sheet, undefined, { targetParagraph: 'verse' });
      const verseTracks = (verseMidi[10] << 8) | verseMidi[11];
      expect(verseTracks).toBe(3);

      // Generate MIDI for only verse with Piano: 1 conductor track + 1 instrument track = 2 tracks
      const versePianoMidi = TMDMIDIGenerator.generateMIDI(sheet, undefined, {
        targetParagraph: 'verse',
        targetInstrument: 'Piano',
      });
      const versePianoTracks = (versePianoMidi[10] << 8) | versePianoMidi[11];
      expect(versePianoTracks).toBe(2);
    });

    it('supports generating MIDI starting from a specific order index with accumulated key offset', () => {
      const input = `::SCORE::
** Key Change Test **
!= 120
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    1 2 3 4
}

verse:Piano@|0|{
    <4*>
    1 2 3 4
}

bridge:Piano@|0|{
    <4*>
    5 5 5 5
}

outro:Piano@|0|{
    <4*>
    1 - - -
}

-> intro -> verse -> {?+3} -> bridge -> outro ->#
`;
      const sheet = TmdParser.parse(input);
      // intro (4 beats) + verse (4 beats) = 8 beats precede index 2 ({?+3})
      // Start playback directly on {?+3} (order index 2)
      const timelineFromDirective = TMDPlaybackRenderer.render(sheet, 'Piano', { startOrderIndex: 2 });
      expect(timelineFromDirective.events.length).toBe(5); // 4 notes in bridge + 1 note in outro
      // First note should start immediately at 0
      expect(timelineFromDirective.events[0].position).toBe(0);
      expect(timelineFromDirective.events[0].state.keyOffset).toBe(3);
      // Duration should be remaining duration (bridge: 4 beats + outro: 4 beats = 8 beats), NOT 16 beats!
      expect(timelineFromDirective.duration).toBe(8);

      const midiFromDirective = TMDMIDIGenerator.generateMIDI(sheet, undefined, { startOrderIndex: 2 });
      expect(midiFromDirective).toBeInstanceOf(Uint8Array);
      expect(midiFromDirective.length).toBeGreaterThan(0);
    });
  });

  describe("SheetInstrumentHelper (TDD)", () => {
    it("extracts distinct sorted instrument names and resolves vocal tracks consistently", () => {
      const input = `::SCORE::
** Multitrack Song **
!= 120
?= C
<4/4>

intro:Piano@|0|{
<4*>
1 2 3 4
}
intro:LeadVocal@|0|{
<4*>
5 5 5 5
}
intro:Bass@|0|{
<4*>
1 1 1 1
}

-> intro ->#
`;
      const sheet = TmdParser.parse(input);
      const instruments = SheetInstrumentHelper.distinctInstruments(sheet);
      expect(instruments).toEqual(["Bass", "LeadVocal", "Piano"]);

      // Vocal resolution
      expect(SheetInstrumentHelper.resolveVocalInstrument(sheet)).toBe("LeadVocal");
      // Requested instrument priority
      expect(SheetInstrumentHelper.resolveVocalInstrument(sheet, "Piano")).toBe("Piano");
    });
  });

  describe("Explicit Track / Instrument Handling (TDD)", () => {
    const pianoTrackTMD = `::SCORE::
** Default Track Score **
!= 120
?= C
<4/4>

theme:Piano@|0|{
    <4*>
    1 2 3 4
}

-> theme ->#
`;

    it("renders an explicitly assigned Piano track", () => {
      const sheet = TmdParser.parse(pianoTrackTMD)!;
      expect(sheet).not.toBeNull();
      expect(sheet.entries[0].assignment).toBe("Piano");

      // Rendering with "Piano" should play the theme notes
      const pianoTimeline = TMDPlaybackRenderer.render(sheet, "Piano");
      expect(pianoTimeline.events).toHaveLength(4);
      expect(pianoTimeline.events[0].position).toBe(0);
      expect(pianoTimeline.duration).toBe(4);

      const emptyTimeline = TMDPlaybackRenderer.render(sheet, "");
      expect(emptyTimeline.events).toHaveLength(4);
    });

    it("generates playable MIDI with Piano track and program 0", () => {
      const sheet = TmdParser.parse(pianoTrackTMD)!;
      const midi = TMDMIDIGenerator.generateMIDI(sheet);
      expect(midi.length).toBeGreaterThan(0);

      // Track count: 1 conductor + 1 Piano track = 2 tracks
      const tracks = (midi[10] << 8) | midi[11];
      expect(tracks).toBe(2);

      // Single section preview targeting "theme" with "Piano"
      const sectionMidi = TMDMIDIGenerator.generateMIDI(sheet, undefined, {
        targetParagraph: "theme",
        targetInstrument: "Piano",
      });
      const sectionTracks = (sectionMidi[10] << 8) | sectionMidi[11];
      expect(sectionTracks).toBe(2);
    });

    it("exports MusicXML and ABC with notes for an explicitly assigned track", () => {
      const sheet = TmdParser.parse(pianoTrackTMD)!;
      const instruments = SheetInstrumentHelper.distinctInstruments(sheet);
      expect(instruments).toEqual(["Piano"]);

      const musicxml = TMDMusicXMLGenerator.generateMusicXML(sheet);
      expect(musicxml).toContain("<step>C</step>");

      const abc = TMDABCGenerator.generateABC(sheet);
      expect(abc).toContain('V:V1 name="Piano"');
    });
  });

  describe("ChordSymbol parsing and slash chords", () => {
    it("correctly parses roots, qualities, and slash chord bass", () => {
      const cMajor = ChordSymbol.parse("C");
      expect(cMajor.root).toEqual(new ChordRoot(ScaleDegree.C, Accidental.Natural, 0, false));
      expect(cMajor.quality).toBe("major");
      expect(cMajor.bass).toBeUndefined();
      expect(cMajor.toString()).toBe("C");

      const slashLetter = ChordSymbol.parse("C/E");
      expect(slashLetter.root).toEqual(new ChordRoot(ScaleDegree.C, Accidental.Natural, 0, false));
      expect(slashLetter.quality).toBe("major");
      expect(slashLetter.bass).toEqual(new ChordRoot(ScaleDegree.E, Accidental.Natural, 0, false));
      expect(slashLetter.toString()).toBe("C/E");

      const slashDegree = ChordSymbol.parse("1/3");
      expect(slashDegree.root).toEqual(new ChordRoot(ScaleDegree.C, Accidental.Natural, 0, true));
      expect(slashDegree.quality).toBe("major");
      expect(slashDegree.bass).toEqual(new ChordRoot(ScaleDegree.E, Accidental.Natural, 0, true));
      expect(slashDegree.toString()).toBe("1/3");

      const slashMinorSeventh = ChordSymbol.parse("Am7/G");
      expect(slashMinorSeventh.root).toEqual(new ChordRoot(ScaleDegree.A, Accidental.Natural, 0, false));
      expect(slashMinorSeventh.quality).toBe("minor7");
      expect(slashMinorSeventh.bass).toEqual(new ChordRoot(ScaleDegree.G, Accidental.Natural, 0, false));
      expect(slashMinorSeventh.toString()).toBe("Am7/G");
    });
  });
});
