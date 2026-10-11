import { describe, expect,it } from 'vitest';

import {
  NotationDuration,
  TmdABCGenerator,
  TmdBrailleGenerator,
  TmdLilyPondGenerator,
  TmdMeasureChecker,
  TmdMeasureRenderer,
  TmdMIDIGenerator,
  TmdMusicXMLGenerator,
  TmdParser,
} from '../src/index.js';
import { musicXmlExportFixture } from './conformanceFixtures.js';

describe('NotationDuration and Measure Decomposition', () => {
  it('exposes an AST-first structural path', () => {
    const source = `::SCORE::
<4/4>
intro:Piano@|0|{
  <4*>
  1 2 3 4 5 6 7 1
}
-> intro ->#
`;
    const sheet = TmdParser.parse(source);
    const issues = TmdMeasureChecker.checkSheet(sheet);

    expect(issues.some((issue) => issue.snippet.includes('explicit barlines'))).toBe(true);
  });
  it('decomposes quarter notes into standard notation duration atoms', () => {
    // 1.0 -> 4th note (baseDenominator: 4, isDotted: false)
    const quarter = NotationDuration.decompose(1.0);
    expect(quarter).toEqual([{ baseDenominator: 4, isDotted: false, quarterValue: 1.0 }]);

    // 1.5 -> dotted quarter (baseDenominator: 4, isDotted: true)
    const dottedQuarter = NotationDuration.decompose(1.5);
    expect(dottedQuarter).toEqual([{ baseDenominator: 4, isDotted: true, quarterValue: 1.5 }]);

    // 1.75 -> dotted quarter + sixteenth (1.5 + 0.25)
    const complex = NotationDuration.decompose(1.75);
    expect(complex).toEqual([
      { baseDenominator: 4, isDotted: true, quarterValue: 1.5 },
      { baseDenominator: 16, isDotted: false, quarterValue: 0.25 },
    ]);
  });

  it('renders strictly bounded measures with gaps padded with rests', () => {
    const tmd = `
::SCORE::
** Measure Invariant Test **
!= 120
?= C
<4/4>

A:Piano@|0|{
    <4*>
    1 2 3 -
    1 - - -
    1 2 3 4
}
-> A ->#
`;
    const sheet = TmdParser.parse(tmd)!;
    expect(sheet).not.toBeNull();

    const measures = TmdMeasureRenderer.renderMeasures(sheet, 'Piano');
    expect(measures.length).toBe(3);

    for (const m of measures) {
      expect(m.nominalDuration).toBe(4.0);
      const totalDur = m.events.reduce((acc, ev) => acc + ev.duration, 0);
      expect(Math.abs(totalDur - 4.0)).toBeLessThan(1e-4);
    }
  });

  it('uses the state at the measure boundary for summaries and padded rests', () => {
    const sheet = TmdParser.parse(`
::SCORE::
** Measure State Boundary **
!= 120
?= C
<4/4>

A:Piano@|0|{
    <4*>
    {!=60}
    1 2 3 4
}
-> A ->#
`)!;
    // A fractional start creates a leading gap in the first measure while keeping
    // the source notation valid for the renderer's canonical model.
    sheet.entries[0].start = 0.25;

    const measure = TmdMeasureRenderer.renderMeasures(sheet, 'Piano')[0];
    expect(measure.tempo).toBe(120);
    expect(measure.events[0].content.type).toBe('rest');
    expect(measure.events[0].state.tempo).toBe(120);
  });

  it('splits cross-barline notes into measure events with tieStart and tieStop', () => {
    const tmd = `
::SCORE::
** Cross Barline Tie Test **
!= 120
?= C
<4/4>

A:Piano@|0|{
    <4*>
    - - - 1
    - 0 0 0
}
-> A ->#
`;
    const sheet = TmdParser.parse(tmd)!;
    const measures = TmdMeasureRenderer.renderMeasures(sheet, 'Piano');
    expect(measures.length).toBe(2);

    // Measure 1: 3 beats rest, 1 beat note with tieStart = true
    const m1Last = measures[0].events[measures[0].events.length - 1];
    expect(m1Last.tieStart).toBe(true);
    expect(m1Last.tieStop).toBe(false);

    // Measure 2: 1 beat note with tieStop = true, then rest
    const m2First = measures[1].events[0];
    expect(m2First.tieStop).toBe(true);
  });
});

describe('MusicXML Exporter Invariants', () => {
  it('matches the shared MusicXML exporter fixture', () => {
    const sheet = TmdParser.parse(musicXmlExportFixture);
    const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);

    expect(xml).toContain("<part-name>Piano</part-name>");
    expect(xml).not.toContain("<part-name>Theme</part-name>");
    expect((xml.match(/<note>/g) ?? []).length).toBe(4);
  });
  it('does not create an implicit Piano part for a prototype-only sheet', () => {
    const tmd = `
::SCORE::
** Prototype Only **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 2 3 4
}
`;
    const sheet = TmdParser.parse(tmd)!;
    const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);

    expect(xml).toContain('<score-partwise');
    expect(xml).not.toContain('<score-part id="P1">');
    expect(xml).not.toContain('<part id="P1">');
  });

  it('conserves measure durations and generates proper tie tags', () => {
    const tmd = `
::SCORE::
** MusicXML Measure Test **
!= 120
?= C
<4/4>

A:Piano@|0|{
    <4*>
    1 2 3 4
    - 0 0 0
}
-> A ->#
`;
    const sheet = TmdParser.parse(tmd)!;
    const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);

    expect(xml).toContain('<score-partwise');
    expect(xml).toContain('<measure number="1">');
    expect(xml).toContain('<measure number="2">');
    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tie type="stop"/>');
    expect(xml).toContain('<tied type="start"/>');
    expect(xml).toContain('<tied type="stop"/>');
    expect(xml).toContain('<type>quarter</type>');

    // Divisions = 48 -> 4 beats * 48 = 192 divisions per measure
    const measure1Match = xml.match(/<measure number="1">([\s\S]*?)<\/measure>/);
    expect(measure1Match).not.toBeNull();
    const durations = Array.from(measure1Match![1].matchAll(/<duration>(\d+)<\/duration>/g)).map((m) => parseInt(m[1], 10));
    const totalDivs = durations.reduce((a, b) => a + b, 0);
    expect(totalDivs).toBe(192);
  });

  it('generates time-modification and type for tuplets in MusicXML', () => {
    const tmd = `
::SCORE::
** Triplet Test **
!= 120
?= C
<4/4>

A:Drums@|0|{
    <4*>
    (x-- x-- x--) 0 0 0
}
-> A ->#
`;
    const sheet = TmdParser.parse(tmd)!;
    const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);

    expect(xml).toContain('<time-modification>');
    expect(xml).toContain('<actual-notes>3</actual-notes>');
    expect(xml).toContain('<normal-notes>2</normal-notes>');
    expect(xml).toContain('</time-modification>');
  });
});

describe('MIDI Exporter Invariants', () => {
  it('does not create a playback track for a rest-only assignment', () => {
    const sheet = TmdParser.parse(`::SCORE::
** Rest Only **
!= 120
?= C
<4/4>

Piano:Piano@|0|{
  <4*>
  0 0 0 0
}

-> Piano ->#
`);

    const midi = TmdMIDIGenerator.generateMIDI(sheet);
    const trackCount = (midi[10] << 8) | midi[11];
    expect(trackCount).toBe(1);
  });
});

describe('Percussion assignment identity', () => {
  it('matches lowercase percussion assignments in LilyPond and ABC exporters', () => {
    const sheet = TmdParser.parse(`::SCORE::
** Lowercase Drums **
!= 120
?= C
<4/4>

A:drums@|0|{
  <4*>
  D S X O
}

-> A ->#
`);

    const ly = TmdLilyPondGenerator.generateLilyPond(sheet);
    const abc = TmdABCGenerator.generateABC(sheet);

    expect(ly).toContain('\\drummode');
    expect(ly).toContain('\\new DrumStaff');
    expect(abc).toContain('%%MIDI channel 10');
  });
});

describe('LilyPond Exporter Invariants', () => {
  it('generates only valid power-of-2 duration tokens with bar checks', () => {
    const tmd = `
::SCORE::
** LilyPond Invariant Test **
!= 120
?= C
<4/4>

A:Piano@|0|{
    <4*>
    1 2 3 4
    5 6 7 1^
}
-> A ->#
`;
    const sheet = TmdParser.parse(tmd)!;
    const ly = TmdLilyPondGenerator.generateLilyPond(sheet);

    expect(ly).toContain('\\version "2.24.0"');
    const barCount = (ly.match(/\|/g) || []).length;
    expect(barCount).toBeGreaterThanOrEqual(2);

    // Matches note / rest durations e.g. c'4, r4, hh16
    const tokenRegex = /(?:[a-g][a-z',]*|>|r|hh|sn|toml)(\d+)(\.*)/g;
    const validDurations = new Set([1, 2, 4, 8, 16, 32, 64, 128]);
    let match;
    while ((match = tokenRegex.exec(ly)) !== null) {
      const dur = parseInt(match[1], 10);
      expect(validDurations.has(dur)).toBe(true);
    }
  });
});

describe('ABC Exporter Invariants', () => {
  it('generates barlines and conserved measure unit counts', () => {
    const tmd = `
::SCORE::
** ABC Invariant Test **
!= 120
?= C
<4/4>

A:Piano@|0|{
    <4*>
    1 2 3 4
    5 6 7 1^
}
-> A ->#
`;
    const sheet = TmdParser.parse(tmd)!;
    const abc = TmdABCGenerator.generateABC(sheet);

    expect(abc).toContain('M:4/4');
    expect(abc).toContain('L:1/16');

    // Split V1 section
    const v1Section = abc.split('[V:V1]')[1] || '';
    const measures = v1Section
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    expect(measures.length).toBeGreaterThanOrEqual(2);

    const noteRegex = /(?:[A-Ga-gz\^=_]+|"[^"]*"z)(\d*)/g;
    for (const mStr of measures) {
      let totalUnits = 0;
      let m;
      while ((m = noteRegex.exec(mStr)) !== null) {
        const num = m[1] ? parseInt(m[1], 10) : 1;
        totalUnits += num;
      }
      expect(totalUnits).toBe(16);
    }
  });

  it('correctly handles diatonic key signatures and accidentals', () => {
    const tmdG = `
::SCORE::
** Key G Test **
!= 120
?= G
<4/4>

A:Piano@|0|{
    <4*>
    1 7 7, 1
}
-> A ->#
`;
    const sheetG = TmdParser.parse(tmdG)!;
    const abcG = TmdABCGenerator.generateABC(sheetG);

    expect(abcG).toContain('K:G');
    // Degree 7 in G major is F# -> under K:G written as f4 (not ^f4)
    // Degree 7, in G major is F natural -> under K:G written as =f4
    expect(abcG).toMatch(/[Ff]4/);
    expect(abcG).not.toMatch(/\^[Ff]4/);
    expect(abcG).toMatch(/=[Ff]4/);
  });

  it('expands S-Expression macros so MusicXML, LilyPond, and ABC contain generated parts and notes', () => {
    const macroTmd = `
::SCORE::
** Macro Exporter Test **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 2 3 4
}

-> (canon Theme (Violin1 Violin2) 0) ->#
`;
    const sheet = TmdParser.parse(macroTmd)!;

    // MusicXML
    const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);
    expect(xml).toContain('<part-name>Violin1</part-name>');
    expect(xml).toContain('<part-name>Violin2</part-name>');
    expect(xml).toContain('<step>C</step>');

    // LilyPond
    const ly = TmdLilyPondGenerator.generateLilyPond(sheet);
    expect(ly).toContain('Violin1');
    expect(ly).toContain('Violin2');

    // ABC
    const abc = TmdABCGenerator.generateABC(sheet);
    expect(abc).toContain('name="Violin1"');
    expect(abc).toContain('name="Violin2"');
  });

  it('handles MusicXML clef selection, drum mapping, and slash chord harmony tags', () => {
    const tmd = `
::SCORE::
** Clef & Harmony Test **
!= 120
?= C
<4/4>

A:Drums@|0|{
    <4*>
    (D S X O) (T C B S) - -
}
A:Cello@|0|{
    <4*>
    1 2 3 4
}
A:CHORD@|0|{
    <4*>
    [C] [Am7] [C/E] [1/3]
}
-> A ->#
`;
    const sheet = TmdParser.parse(tmd)!;
    const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);

    // Clefs
    expect(xml).toContain('<sign>percussion</sign>');
    expect(xml).toContain('<sign>F</sign>');
    expect(xml).toContain('<line>4</line>');

    // Percussion display steps
    expect(xml).toContain('<display-step>F</display-step>');
    expect(xml).toContain('<display-step>D</display-step>');
    expect(xml).toContain('<display-step>G</display-step>');
    expect(xml).toContain('<display-step>A</display-step>');

    // Harmony root and bass
    expect(xml).toContain('<root-step>C</root-step>');
    expect(xml).toContain('<root-step>A</root-step>');
    expect(xml).toContain('<bass-step>E</bass-step>');
  });

  it('handles relative key modulation in MusicXML, LilyPond, and ABC', () => {
    const tmd = `
::SCORE::
** Relative Key Test **
!= 120
?= C
<4/4>

A:Drums@|0|{
    <4*>
    | D S X O | T C B S |
}
A:Piano@|0|{
    <4*>
    | 1 2 3 4 |
    {?+2}
    | 1 2 3 4 |
}
-> A ->#
`;
    const sheet = TmdParser.parse(tmd)!;

    // MusicXML
    const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);
    expect(xml).toContain('<fifths>0</fifths>');
    expect(xml).toContain('<fifths>2</fifths>');

    // LilyPond
    const ly = TmdLilyPondGenerator.generateLilyPond(sheet);
    expect(ly).toContain('bd4');
    expect(ly).toContain('sn4');
    expect(ly).toContain('hh4');
    expect(ly).toContain('hho4');
    expect(ly).toContain('toml4');
    expect(ly).toContain('cymc4');
    expect(ly).toContain('\\key d \\major');

    // ABC
    const abc = TmdABCGenerator.generateABC(sheet);
    expect(abc).toContain('K:C');
    expect(abc).toContain('K:D');
  });

  it('counts multi-digit numbers as multiple units in measure checker', () => {
    const code = `
::SCORE::
** Multi-digit Jianpu Test **
!= 120
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    | 1234 | 5671 | 0000 | 1020 |
}
-> intro ->#
`;
    const issues = TmdMeasureChecker.check(code);
    expect(issues).toHaveLength(0);
  });

  it('renders extreme octaves and accidentals across ABC and LilyPond', () => {
    const extremeTmd = `
::SCORE::
** Extreme Range & Accidentals **
!= 100
?= C
<4/4>

A:Piano@|0|{
    <4*>
    1__ 1_ 1 1^ 1^^ 4' 7,
}
-> A ->#
`;
    const sheet = TmdParser.parse(extremeTmd)!;
    const abc = TmdABCGenerator.generateABC(sheet);
    expect(abc).toContain("C,");
    expect(abc).toContain("c'");
    expect(abc).toContain("^f");
    expect(abc).toContain("_b");

    const ly = TmdLilyPondGenerator.generateLilyPond(sheet);
    expect(ly).toContain("c,4");
    expect(ly).toContain("c'''4");
  });

  describe('Tempo and Metronome Resolution for non-quarter meters (Issue #5)', () => {
    it('resolves compound meters (6/8) to dotted quarter metronomes and tempo marks', () => {
      const tmd = `
::SCORE::
** 6/8 Compound Meter Test **
!= 120
?= C
<6/8>

A:Piano@|0|{
    <8*>
    1 2 3 4 5 6
    {!=90}
    1 2 3 4 5 6
}
-> A ->#
`;
      const sheet = TmdParser.parse(tmd)!;

      // MusicXML: 6/8 with quarterBPM 120 -> 120 / 1.5 = 80 bpm with dotted-quarter
      const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);
      expect(xml).toContain('<beat-unit>quarter</beat-unit>\n            <beat-unit-dot/>\n            <per-minute>80</per-minute>');
      // Directive {!=90} -> 90 / 1.5 = 60 bpm
      expect(xml).toContain('<beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>60</per-minute>');

      // LilyPond: \tempo 4. = 80 and \tempo 4. = 60
      const ly = TmdLilyPondGenerator.generateLilyPond(sheet);
      expect(ly).toContain('\\tempo 4. = 80');
      expect(ly).toContain('\\tempo 4. = 60');

      // ABC: Q:3/8=80 and Q:3/8=60
      const abc = TmdABCGenerator.generateABC(sheet);
      expect(abc).toContain('Q:3/8=80');
      expect(abc).toContain('Q:3/8=60');
    });

    it('resolves cut time / half-note meters (2/2) correctly', () => {
      const tmd = `
::SCORE::
** Cut Time Test **
!= 120
?= C
<2/2>

A:Piano@|0|{
    <2*>
    1 2
}
-> A ->#
`;
      const sheet = TmdParser.parse(tmd)!;

      // MusicXML: half note beat-unit, 120 / 2 = 60 bpm
      const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);
      expect(xml).toContain('<beat-unit>half</beat-unit>\n            <per-minute>60</per-minute>');

      // LilyPond: \tempo 2 = 60
      const ly = TmdLilyPondGenerator.generateLilyPond(sheet);
      expect(ly).toContain('\\tempo 2 = 60');

      // ABC: Q:1/2=60
      const abc = TmdABCGenerator.generateABC(sheet);
      expect(abc).toContain('Q:1/2=60');
    });
  });

  describe('Multi-Notes Polyphonic Support in Exporters (Issue #5 & Issue #47)', () => {
    it('outputs <chord/> tag for simultaneous notes in MusicXML without inflating measure duration', () => {
      const tmd = `
::SCORE::
** Multi-Note MusicXML Test **
!= 120
?= C
<4/4>

A:Piano@|0|{
    <4*>
    1+3+5 2 3 4
}
-> A ->#
`;
      const sheet = TmdParser.parse(tmd)!;
      const measures = TmdMeasureRenderer.renderMeasures(sheet, 'Piano');
      const groups = TmdMeasureRenderer.groupSimultaneousEvents(measures[0].events);
      expect(groups).toHaveLength(4);
      expect(groups[0]).toHaveLength(3);

      const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);

      // Must have 2 <chord/> elements for the triad 1+3+5
      const chordTags = (xml.match(/<chord\/>/g) || []).length;
      expect(chordTags).toBe(2);

      // Every note (3 in triad + 3 single quarter notes = 6 <note> elements) must have duration 48 (1 quarter note)
      const measure1Match = xml.match(/<measure number="1">([\s\S]*?)<\/measure>/);
      expect(measure1Match).not.toBeNull();
      const durations = Array.from(measure1Match![1].matchAll(/<duration>(\d+)<\/duration>/g)).map((m) =>
        parseInt(m[1], 10)
      );
      expect(durations).toEqual([48, 48, 48, 48, 48, 48]);
    });

    it('outputs simultaneous chord notation <...> in LilyPond, [...] in ABC, and interval cells in Braille for multiNote', () => {
      const tmd = `
::SCORE::
** Multi-Note Exporters Test **
!= 120
?= C
<4/4>

A:Piano@|0|{
    <4*>
    1+3+5 2+4 3 4
}
-> A ->#
`;
      const sheet = TmdParser.parse(tmd)!;

      // LilyPond: 1+3+5 -> <c' e' g'>4, 2+4 -> <d' f'>4, followed by e'4 f'4 |
      const ly = TmdLilyPondGenerator.generateLilyPond(sheet);
      expect(ly).toContain("<c' e' g'>4 <d' f'>4 e'4 f'4 |");

      // ABC: 1+3+5 -> [ceg]4, 2+4 -> [df]4, followed by e4 f4 |
      const abc = TmdABCGenerator.generateABC(sheet);
      expect(abc).toContain('[ceg]4 [df]4 e4 f4 |');

      // Braille: sighted summary reflects simultaneous chord notes rather than 7 sequential quarter notes
      const braillePreview = TmdBrailleGenerator.generateBraillePreview(sheet);
      expect(braillePreview.tracks[0].measures[0].sightedSummary).toContain('C4+E4+G4');
      expect(braillePreview.tracks[0].measures[0].sightedSummary).toContain('D4+F4');
    });
  });

  describe('PercussionStroke, SheetInstrumentHelper, and Refactor Scanning SSOT (Issue #48)', () => {
    it('resolves all TMD percussion pattern characters through PercussionStroke SSOT', async () => {
      const { PercussionStroke } = await import('../src/index.js');
      expect(PercussionStroke).toBeDefined();

      const strokes = PercussionStroke.parse('DbSxOtCcZ');
      expect(strokes.map((s: { kind: string }) => s.kind)).toEqual([
        'kick',
        'kick',
        'snare',
        'closedHiHat',
        'openHiHat',
        'tom',
        'crashCymbal',
        'crashCymbal',
      ]);

      expect(PercussionStroke.fromCharacter('D')?.midiPitch).toBe(36);
      expect(PercussionStroke.fromCharacter('D')?.defaultVelocity).toBe(118);
      expect(PercussionStroke.fromCharacter('D')?.unpitchedDisplayPosition).toEqual({
        stepIndex: 3,
        step: 'F',
        octave: 4,
      });
      expect(PercussionStroke.fromCharacter('D')?.lilyPondDrumName).toBe('bd');
      expect(PercussionStroke.fromCharacter('D')?.abcPitch).toBeUndefined();

      expect(PercussionStroke.fromCharacter('S')?.midiPitch).toBe(38);
      expect(PercussionStroke.fromCharacter('S')?.defaultVelocity).toBe(105);
      expect(PercussionStroke.fromCharacter('S')?.unpitchedDisplayPosition).toEqual({
        stepIndex: 1,
        step: 'D',
        octave: 5,
      });
      expect(PercussionStroke.fromCharacter('S')?.lilyPondDrumName).toBe('sn');
      expect(PercussionStroke.fromCharacter('S')?.abcPitch).toBe('D');

      expect(PercussionStroke.fromCharacter('X')?.midiPitch).toBe(42);
      expect(PercussionStroke.fromCharacter('X')?.defaultVelocity).toBe(78);
      expect(PercussionStroke.fromCharacter('X')?.lilyPondDrumName).toBe('hh');
      expect(PercussionStroke.fromCharacter('X')?.abcPitch).toBe('^F');

      expect(PercussionStroke.fromCharacter('O')?.midiPitch).toBe(46);
      expect(PercussionStroke.fromCharacter('O')?.defaultVelocity).toBe(90);
      expect(PercussionStroke.fromCharacter('O')?.lilyPondDrumName).toBe('hho');

      expect(PercussionStroke.fromCharacter('T')?.midiPitch).toBe(45);
      expect(PercussionStroke.fromCharacter('T')?.defaultVelocity).toBe(100);
      expect(PercussionStroke.fromCharacter('T')?.lilyPondDrumName).toBe('toml');
      expect(PercussionStroke.fromCharacter('T')?.abcPitch).toBe('A');

      expect(PercussionStroke.fromCharacter('C')?.midiPitch).toBe(49);
      expect(PercussionStroke.fromCharacter('C')?.defaultVelocity).toBe(115);
      expect(PercussionStroke.fromCharacter('C')?.lilyPondDrumName).toBe('cymc');
    });

    it('centralizes instrument track metadata and preparedForExport on SheetInstrumentHelper', async () => {
      const { SheetInstrumentHelper } = await import('../src/index.js');
      const sheet = TmdParser.parse(`::SCORE::
** SSOT Instrument Metadata **
!= 120
?= C
<4/4>

Theme {
  <4*>
  1 2 3 4
}

A:CustomGrooveTrack@|0|{
  <4*>
  D S X O
}

A:Cello@|0|{
  <4*>
  1_ 2_ 3_ 4_
}

-> (play Theme Violin) -> A ->#
`)!;

      const { sheet: prepared, instruments } = SheetInstrumentHelper.preparedForExport(sheet);
      expect(instruments).toEqual(['Cello', 'CustomGrooveTrack', 'Violin']);
      expect(SheetInstrumentHelper.containsPercussionUnits(prepared, 'customgroovetrack')).toBe(true);
      expect(SheetInstrumentHelper.containsPercussionUnits(prepared, 'Cello')).toBe(false);
      expect(SheetInstrumentHelper.isPercussionTrack(prepared, 'Cajon')).toBe(true);
      expect(SheetInstrumentHelper.isPercussionTrack(prepared, 'CustomGrooveTrack')).toBe(true);
      expect(SheetInstrumentHelper.isPercussionTrack(prepared, 'Violin')).toBe(false);
      expect(SheetInstrumentHelper.isBassClefInstrument('Cello')).toBe(true);
      expect(SheetInstrumentHelper.isBassClefInstrument('Violin')).toBe(false);
      expect(SheetInstrumentHelper.isChordSymbolTrack('CHORDS')).toBe(true);
      expect(SheetInstrumentHelper.isChordSymbolTrack('Piano')).toBe(false);
    });

    it('shares paragraph header and grid subdivision scanning helpers across refactoring modules', async () => {
      const {
        parseParagraphHeaderLine,
        parseGridSubdivisionLine,
        matchesRefactorTarget,
      } = await import('../src/refactoring/format_helpers.js');

      expect(parseParagraphHeaderLine('verse:Piano@|0|{')).toEqual({
        section: 'verse',
        instrument: 'Piano',
      });
      expect(parseParagraphHeaderLine('1 2 3 4')).toBeUndefined();
      expect(parseGridSubdivisionLine('<8*>')).toBe(8);
      expect(parseGridSubdivisionLine('<4/4>')).toBeUndefined();
      expect(matchesRefactorTarget({ section: 'verse' }, 'verse', 'Piano')).toBe(true);
      expect(matchesRefactorTarget({ section: 'chorus' }, 'verse', 'Piano')).toBe(false);
      expect(matchesRefactorTarget({ instrument: 'Piano' }, 'verse', 'Piano')).toBe(true);
      expect(matchesRefactorTarget({ instrument: 'Bass' }, 'verse', 'Piano')).toBe(false);
    });

    it('Issue #56: fixes lilyPondKey("bm"), MusicXML erroneous <chord/>, MIDI channel >15 wrap to Ch.9, VSQ non-4/4 preMeasure, ChordPro section fallback, and PercussiveOrgan classification', async () => {
      const {
        MIDIInstrument,
        SheetInstrumentHelper,
        TmdChordProGenerator,
        TmdVSQGenerator,
      } = await import('../src/index.js');

      // 1. lilyPondKey("bm") and "b" should not turn B natural into bes
      const bmSheet = TmdParser.parse(`::SCORE::
!= 120
?= D
key= bm
<4/4>
A:Piano@|0|{
  <4*>
  | [C] . . . |
}
A:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
-> A ->#
`)!;
      const ly = TmdLilyPondGenerator.generateLilyPond(bmSheet);
      expect(ly).toContain('\\key b \\minor');
      expect(ly).not.toContain('\\key bes');
      expect(ly).toContain('<c e g>1');
      expect(ly).toContain("d'4");

      // 2. MusicXML should not emit <chord/> on the first note after <harmony>
      const xml = TmdMusicXMLGenerator.generateMusicXML(bmSheet);
      expect(xml).toContain('<harmony>');
      expect(xml).not.toContain('<chord/>');

      // 3. MIDI channel allocation with programToMelodyChannel should never return channel 9 (percussion)
      const state = { nextMelodicChannel: 0, programToMelodyChannel: new Map<number, number>() };
      const allocatedChannels: number[] = [];
      const instruments = [
        'acousticGrandPiano', 'brightAcousticPiano', 'electricGrandPiano', 'honkyTonkPiano',
        'electricPiano1', 'electricPiano2', 'harpsichord', 'clavinet',
        'celesta', 'glockenspiel', 'musicBox', 'vibraphone',
        'marimba', 'xylophone', 'tubularBells', 'dulcimer',
        'drawbarOrgan', 'percussiveOrgan', 'rockOrgan', 'churchOrgan',
      ] as const;
      for (const inst of instruments) {
        allocatedChannels.push(MIDIInstrument.allocateChannel(inst, state));
      }
      expect(allocatedChannels).not.toContain(9);
      expect(allocatedChannels.every((ch) => ch >= 0 && ch < 16)).toBe(true);

      // 4. VSQ non-4/4 preMeasureTicks (3/4 with preMeasure=4 -> 4 * 3 * 480 = 5760)
      const waltzSheet = TmdParser.parse(`::SCORE::
!= 120
?= C
<3/4>
A:Vocal@|0|{
  <4*>
  | 1 2 3 |
}
-> A ->#
`)!;
      const vsqData = TmdVSQGenerator.generateVSQ(waltzSheet, { preMeasure: 4 });
      let reconstructedIni = '';
      for (let i = 0; i < vsqData.length - 3; i++) {
        if (vsqData[i] === 0xff && vsqData[i + 1] === 0x01) {
          const len = vsqData[i + 2];
          const chunk = vsqData.slice(i + 3, i + 3 + len);
          reconstructedIni += new TextDecoder('latin1').decode(chunk);
        }
      }
      expect(reconstructedIni).toContain('5760=ID#0001');

      // 5. ChordPro section fallback when global targetInstrument is missing in a section
      const multiSectionSheet = TmdParser.parse(`::SCORE::
!= 120
?= C
<4/4>
Intro:Strings@|0|{
  <4*>
  | [Am] - - - |
}
Verse:Guitar@|0|{
  <4*>
  | [C] - - - |
}
-> Intro -> Verse ->#
`)!;
      const cho = TmdChordProGenerator.generateChordPro(multiSectionSheet, { measuresPerLine: 0 });
      expect(cho).toContain('{comment: Intro}');
      expect(cho).toContain('[Am]');
      expect(cho).toContain('{comment: Verse}');
      expect(cho).toContain('[C]');

      // 6. PercussiveOrgan should not be classified as a percussion track
      const organSheet = TmdParser.parse(`::SCORE::
!= 120
?= C
<4/4>
A:PercussiveOrgan@|0|{
  <4*>
  | 1 2 3 4 |
}
-> A ->#
`)!;
      expect(SheetInstrumentHelper.isPercussionTrack(organSheet, 'PercussiveOrgan')).toBe(false);
    });

    it('exports odd-meter pickups, polymeters, quintuplets, and compound durations to MusicXML with aligned measures and valid types (Issues #62-#65)', () => {
      const tmd = `
::SCORE::
** Odd Meter Pickup Polymeter Quintuplets **
!= 120
?= C
key= Am
<4/4>

A:Piano@|0|{
    <8*>
    | 6_ 6_ 1 2 1 7_ 6_ 5_ | [6m] - [6m] - (6 7 1^ 7 6)%(--) 6 6 |
}
A:Clarinet@|0|{
    <4*>
    | 1^ - 7 - | 1^ - 0 0 |
}

M5:Clarinet@|-1|{
    <4*>
    {<5/4>}
    | 0 0 0 {mp} 5_ 5'_ |
    | {f} 6_ 1 2 3 2' |
    {<4/4>}
}
M5:Piano@|0|{
    <4*>
    {<5/4>}
    | 6_ 1 2 3 4 |
    {<4/4>}
}

M7:Flute@|-1|{
    <8*>
    {<7/8>}
    | 0 0 0 0 {mf} 3^ 4'^ 5'^ |
    | {f} 6^ 1^^ 7^ 2^^ 1^^ 7^ 6'^ |
    {<4/4>}
}
M7:Piano@|0|{
    <8*>
    {<7/8>}
    | 6_ 1 7_ 2 1 7_ 6'_ |
    {<4/4>}
}

Poly:Flute@|0|{
    <8*>
    {<5/8>}
    | 6_ 1 3 2' 3 | 6_ 1 3 2' 3 | 5'_ 7_ 2 1 2 | 5'_ 7_ 2 1 2 |
    | 4'_ 6_ 1 7_ 1 | 3_ 5'_ 7_ 2 3 | 6_ 6'_ 6_ 6^ - |
    {<4/4>}
}
Poly:Piano@|0|{
    <8*>
    {<7/8>}
    | 6 5 3 2' 3 1 6_ | 7 6 4' 3 4' 2 7_ | 1^ 7 5' 4' 5' 3 1 |
    | 2^ 1^ 6 5' 4' 3 2' | 6^ 3^ 1^ 6 6' 6 0 |
    {<4/4>}
}

-> A -> M5 -> M7 -> Poly ->#
`;
      const sheet = TmdParser.parseThrowing(tmd);
      const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);

      expect(xml).toContain('<actual-notes>5</actual-notes>');
      expect(xml).toContain('<normal-notes>4</normal-notes>');
      expect(xml).toContain('<words>[5/8]</words>');

      const partMatches = Array.from(xml.matchAll(/<part id="P\d+">([\s\S]*?)<\/part>/g));
      expect(partMatches.length).toBe(3);

      for (const partMatch of partMatches) {
        const partBody = partMatch[1];
        const measureMatches = Array.from(partBody.matchAll(/<measure number="\d+">([\s\S]*?)<\/measure>/g));
        expect(measureMatches.length).toBe(9);

        let currentDivisions = 48;
        let currentBeats = 4;
        let currentBeatType = 4;
        for (const mMatch of measureMatches) {
          const mBody = mMatch[1];
          const timeMatches = Array.from(mBody.matchAll(/<time>[\s\S]*?<\/time>/g));
          expect(timeMatches.length).toBeLessThanOrEqual(1);

          const divMatch = mBody.match(/<divisions>(\d+)<\/divisions>/);
          if (divMatch) {
            currentDivisions = parseInt(divMatch[1], 10);
          }
          const bMatch = mBody.match(/<beats>(\d+)<\/beats>\s*<beat-type>(\d+)<\/beat-type>/);
          if (bMatch) {
            currentBeats = parseInt(bMatch[1], 10);
            currentBeatType = parseInt(bMatch[2], 10);
          }
          const expectedDur = (currentBeats * 4 * currentDivisions) / currentBeatType;
          const noteMatches = Array.from(mBody.matchAll(/<note>([\s\S]*?)<\/note>/g));
          let actualDur = 0;
          for (const nMatch of noteMatches) {
            const nBody = nMatch[1];
            expect(nBody).toContain('<type>');
            if (nBody.includes('<chord/>')) continue;
            const dMatch = nBody.match(/<duration>(\d+)<\/duration>/);
            if (dMatch) {
              actualDur += parseInt(dMatch[1], 10);
            }
          }
          expect(actualDur).toBe(expectedDur);
        }
      }
    });

    it('exports mid-section polymeters, coprime tuplets (5:3, 7:5, 11:7), sub-64th grids (<256*>, <1024*>), and extreme octaves (Issue #67)', () => {
      const oneLine256 = new Array(64).fill('1 2 3 5').join(' ');
      const oneLine1024 = new Array(256).fill('1 2 3 5').join(' ');
      const tmd = `
::SCORE::
** Issue 67 Stress **
!= 68
?= C
<4/4>

TupletLab:Piano@|0| {
    <4*>
    {<4/4>}
    | (6_ 1 3)%(-) (1 2 3 4 5)%(---) |
    <8*>
    | (6_ 7_ 1 2 3 4' 5')%(-----) (6 5' 4' 3 2')%(---) |
    | (6_ 7_ 1 2 3 4' 5' 6 7 1^ 6^)%(-------) 0 |
}

MicroMacro:Flute@|0| {
    <64*>
    {<1/64>}
    | 6_ | 7_ | 1 | 2' | 3 | 5' |
    {<59/64>}
    | ${new Array(59).fill('6').join(' ')} |
    {<127/64>}
    | ${new Array(127).fill('6').join(' ')} |
    <4*>
    {<4/4>}
}

MicroMacro:Piano@|0| {
    <64*>
    {<4/4>}
    | ${new Array(64).fill('1').join(' ')} |
    <256*>
    | ${oneLine256} |
    <1024*>
    | ${oneLine1024} |
    <4*>
}

ExtremeRange:Piano@|0| {
    <4*>
    {<4/4>}
    | 1_____ 5^^^^^ 1^^^^^^ 0 |
}

-> TupletLab
-> MicroMacro
-> ExtremeRange
->#
`;
      const sheet = TmdParser.parseThrowing(tmd);
      const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);

      expect(xml).toContain('<actual-notes>5</actual-notes>\n          <normal-notes>3</normal-notes>');
      expect(xml).toContain('<actual-notes>7</actual-notes>\n          <normal-notes>5</normal-notes>');
      expect(xml).toContain('<actual-notes>11</actual-notes>\n          <normal-notes>7</normal-notes>');
      expect(xml).toContain('<type>256th</type>');
      expect(xml).toContain('<type>1024th</type>');
      expect(xml).not.toContain('<octave>-1</octave>');
      expect(xml).not.toContain('<octave>10</octave>');
      expect(xml).toContain('<words>[1/64]</words>');
      expect(xml).toContain('<words>[59/64]</words>');
      expect(xml).toContain('<words>[127/64]</words>');

      const typeMap: Record<string, number> = {
        whole: 4.0,
        half: 2.0,
        quarter: 1.0,
        eighth: 0.5,
        '16th': 0.25,
        '32nd': 0.125,
        '64th': 0.0625,
        '128th': 0.03125,
        '256th': 0.015625,
        '512th': 0.0078125,
        '1024th': 0.00390625,
      };

      const partMatches = Array.from(xml.matchAll(/<part id="P\d+">([\s\S]*?)<\/part>/g));
      expect(partMatches.length).toBe(2);

      for (const partMatch of partMatches) {
        const partBody = partMatch[1];
        const measureMatches = Array.from(partBody.matchAll(/<measure number="\d+">([\s\S]*?)<\/measure>/g));
        expect(measureMatches.length).toBe(7);

        let currentDivisions = 48;
        let currentBeats = 4;
        let currentBeatType = 4;
        for (const mMatch of measureMatches) {
          const mBody = mMatch[1];
          const divMatch = mBody.match(/<divisions>(\d+)<\/divisions>/);
          if (divMatch) {
            currentDivisions = parseInt(divMatch[1], 10);
          }
          const bMatch = mBody.match(/<beats>(\d+)<\/beats>\s*<beat-type>(\d+)<\/beat-type>/);
          if (bMatch) {
            currentBeats = parseInt(bMatch[1], 10);
            currentBeatType = parseInt(bMatch[2], 10);
          }
          const expectedDur = (currentBeats * 4 * currentDivisions) / currentBeatType;
          const noteMatches = Array.from(mBody.matchAll(/<note>([\s\S]*?)<\/note>/g));
          let actualDur = 0;
          for (const nMatch of noteMatches) {
            const nBody = nMatch[1];
            const dMatch = nBody.match(/<duration>(\d+)<\/duration>/);
            expect(dMatch).not.toBeNull();
            const dur = parseInt(dMatch![1], 10);
            if (!nBody.includes('<chord/>')) {
              actualDur += dur;
            }
            const octMatch = nBody.match(/<octave>(-?\d+)<\/octave>/);
            if (octMatch) {
              const oct = parseInt(octMatch[1], 10);
              expect(oct).toBeGreaterThanOrEqual(0);
              expect(oct).toBeLessThanOrEqual(9);
            }
            const tMatch = nBody.match(/<type>([^<]+)<\/type>/);
            expect(tMatch).not.toBeNull();
            const baseQ = typeMap[tMatch![1]];
            expect(baseQ).toBeDefined();
            const dots = Array.from(nBody.matchAll(/<dot\/>/g)).length;
            let mult = 1.0;
            let add = 0.5;
            for (let i = 0; i < dots; i++) {
              mult += add;
              add /= 2.0;
            }
            let q = baseQ * mult;
            const tmMatch = nBody.match(/<actual-notes>(\d+)<\/actual-notes>\s*<normal-notes>(\d+)<\/normal-notes>/);
            if (tmMatch) {
              q = (q * parseInt(tmMatch[2], 10)) / parseInt(tmMatch[1], 10);
            }
            expect(dur).toBe(Math.round(q * currentDivisions));
          }
          expect(actualDur).toBe(expectedDur);
        }
      }
    });
  });
});

