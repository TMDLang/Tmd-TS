import { describe, expect,it } from 'vitest';

import {
  NotationDuration,
  TMDABCGenerator,
  TMDLilyPondGenerator,
  TMDMeasureChecker,
  TMDMeasureRenderer,
  TMDMIDIGenerator,
  TMDMusicXMLGenerator,
  TmdParser,
} from '../src/index.js';
import { musicXmlExportFixture } from './conformanceFixtures.js';

describe('NotationDuration and Measure Decomposition', () => {
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

    const measures = TMDMeasureRenderer.renderMeasures(sheet, 'Piano');
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

    const measure = TMDMeasureRenderer.renderMeasures(sheet, 'Piano')[0];
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
    const measures = TMDMeasureRenderer.renderMeasures(sheet, 'Piano');
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
    const xml = TMDMusicXMLGenerator.generateMusicXML(sheet);

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
    const xml = TMDMusicXMLGenerator.generateMusicXML(sheet);

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
    const xml = TMDMusicXMLGenerator.generateMusicXML(sheet);

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
    const xml = TMDMusicXMLGenerator.generateMusicXML(sheet);

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

    const midi = TMDMIDIGenerator.generateMIDI(sheet);
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

    const ly = TMDLilyPondGenerator.generateLilyPond(sheet);
    const abc = TMDABCGenerator.generateABC(sheet);

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
    const ly = TMDLilyPondGenerator.generateLilyPond(sheet);

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
    const abc = TMDABCGenerator.generateABC(sheet);

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
    const abcG = TMDABCGenerator.generateABC(sheetG);

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
    const xml = TMDMusicXMLGenerator.generateMusicXML(sheet);
    expect(xml).toContain('<part-name>Violin1</part-name>');
    expect(xml).toContain('<part-name>Violin2</part-name>');
    expect(xml).toContain('<step>C</step>');

    // LilyPond
    const ly = TMDLilyPondGenerator.generateLilyPond(sheet);
    expect(ly).toContain('Violin1');
    expect(ly).toContain('Violin2');

    // ABC
    const abc = TMDABCGenerator.generateABC(sheet);
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
    const xml = TMDMusicXMLGenerator.generateMusicXML(sheet);

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
    const xml = TMDMusicXMLGenerator.generateMusicXML(sheet);
    expect(xml).toContain('<fifths>0</fifths>');
    expect(xml).toContain('<fifths>2</fifths>');

    // LilyPond
    const ly = TMDLilyPondGenerator.generateLilyPond(sheet);
    expect(ly).toContain('bd4');
    expect(ly).toContain('sn4');
    expect(ly).toContain('hh4');
    expect(ly).toContain('hho4');
    expect(ly).toContain('toml4');
    expect(ly).toContain('cymc4');
    expect(ly).toContain('\\key d \\major');

    // ABC
    const abc = TMDABCGenerator.generateABC(sheet);
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
    const issues = TMDMeasureChecker.check(code);
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
    const abc = TMDABCGenerator.generateABC(sheet);
    expect(abc).toContain("C,");
    expect(abc).toContain("c'");
    expect(abc).toContain("^f");
    expect(abc).toContain("_b");

    const ly = TMDLilyPondGenerator.generateLilyPond(sheet);
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
      const xml = TMDMusicXMLGenerator.generateMusicXML(sheet);
      expect(xml).toContain('<beat-unit>quarter</beat-unit>\n            <beat-unit-dot/>\n            <per-minute>80</per-minute>');
      // Directive {!=90} -> 90 / 1.5 = 60 bpm
      expect(xml).toContain('<beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>60</per-minute>');

      // LilyPond: \tempo 4. = 80 and \tempo 4. = 60
      const ly = TMDLilyPondGenerator.generateLilyPond(sheet);
      expect(ly).toContain('\\tempo 4. = 80');
      expect(ly).toContain('\\tempo 4. = 60');

      // ABC: Q:3/8=80 and Q:3/8=60
      const abc = TMDABCGenerator.generateABC(sheet);
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
      const xml = TMDMusicXMLGenerator.generateMusicXML(sheet);
      expect(xml).toContain('<beat-unit>half</beat-unit>\n            <per-minute>60</per-minute>');

      // LilyPond: \tempo 2 = 60
      const ly = TMDLilyPondGenerator.generateLilyPond(sheet);
      expect(ly).toContain('\\tempo 2 = 60');

      // ABC: Q:1/2=60
      const abc = TMDABCGenerator.generateABC(sheet);
      expect(abc).toContain('Q:1/2=60');
    });
  });

  describe('Multi-Notes Polyphonic Support in Exporters (Issue #5)', () => {
    it('outputs <chord/> tag for simultaneous notes in MusicXML', () => {
      const tmd = `
::SCORE::
** Multi-Note MusicXML Test **
!= 120
?= C
<4/4>

A:Piano@|0|{
    <4*>
    1+3 2+4 3+5 4+6
}
-> A ->#
`;
      const sheet = TmdParser.parse(tmd)!;
      const xml = TMDMusicXMLGenerator.generateMusicXML(sheet);

      // Must have <chord/> elements for the second note of each dyad
      expect(xml).toContain('<chord/>');
      const chordTags = (xml.match(/<chord\/>/g) || []).length;
      expect(chordTags).toBe(4);
    });

    it('outputs chord bracket notation [...] for simultaneous notes in ABC', () => {
      const tmd = `
::SCORE::
** Multi-Note ABC Test **
!= 120
?= C
<4/4>

A:Piano@|0|{
    <4*>
    1+3 2 0 0
}
-> A ->#
`;
      const sheet = TmdParser.parse(tmd)!;
      const abc = TMDABCGenerator.generateABC(sheet);

      // 1+3 in C major is C4 and E4, 1 beat = 4 16ths -> [CE]4 or [C4E4]
      expect(abc).toMatch(/\[[A-Ga-g\^=_0-9]+\]/);
    });
  });
});
