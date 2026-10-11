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
  });
});
