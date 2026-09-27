import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect,it } from 'vitest';

import { main } from '../src/cli.js';
import {
  TmdParser,
  TMDReaperGenerator,
} from '../src/index.js';

describe('TMDReaperGenerator (.rpp export)', () => {
  it('does not create a REAPER track for a rest-only assignment', () => {
    const sheet = TmdParser.parse(`::SCORE::
** Rest Only Reaper **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  0 0 0 0
}
-> A ->#
`)!;
    const rpp = TMDReaperGenerator.generateRPP(sheet);

    expect(rpp).not.toContain('NAME "Piano"');
  });

  it('generates a valid REAPER project header, tempo envelope, and section markers', () => {
    const tmd = `
::SCORE::
** REAPER Demo **
!= 120
?= C
<4/4>

Intro:Piano@|0|{
    <4*>
    1 - - -
}

Verse:Piano@|0|{
    <4*>
    3 - - -
}
-> Intro -> Verse ->#
`;
    const sheet = TmdParser.parse(tmd)!;
    const rpp = TMDReaperGenerator.generateRPP(sheet);

    // Project structure
    expect(rpp).toContain('<REAPER_PROJECT');
    expect(rpp.trim().endsWith('>')).toBe(true);

    // Tempo envelope with 120 BPM and 4/4 time signature ((4 << 16) | 4 = 262148)
    expect(rpp).toContain('<TEMPOENVEX');
    expect(rpp).toMatch(/PT 0\.00000000 120(\.0+)? 0 262148/);

    // Section markers on timeline
    // Intro at 0s, Verse at measure 1 (4 quarter notes at 120 BPM = 2.0s)
    expect(rpp).toMatch(/MARKER 1 0\.00000000 "Intro" 0/);
    expect(rpp).toMatch(/MARKER 2 2\.00000000 "Verse" 0/);
  });

  it('accurately calculates dynamic tempo changes into tempo envelope points without hardcoded BPM', () => {
    const tmd = `
::SCORE::
** Dynamic Tempo Demo **
!= 60
?= C
<4/4>

A:Piano@|0|{
    <4*>
    1 - - -
    {!=120} 2 - - -
}
-> A ->#
`;
    const sheet = TmdParser.parse(tmd)!;
    const rpp = TMDReaperGenerator.generateRPP(sheet);

    // Initial tempo: 60 BPM at 0.0s
    expect(rpp).toMatch(/PT 0\.00000000 60(\.0+)? 0 262148/);

    // Measure 1 is 4 quarter notes at 60 BPM = 4.0 seconds
    // At 4.0s, tempo changes to 120 BPM
    expect(rpp).toMatch(/PT 4\.00000000 120(\.0+)? 0 262148/);
  });

  it('uses the active meter when calculating paragraph marker offsets', () => {
    const tmd = `
::SCORE::
** Meter-Aware Markers **
!= 120
?= C
<4/4>

A:Piano@|0|{
    <4*>
    1 - - -
    {<3/4>}
}

B:Piano@|1|{
    <4*>
    1 - - -
}

C:Piano@|0|{
    <4*>
    1 - - -
}
-> A -> B -> C ->#
`;
    const sheet = TmdParser.parse(tmd)!;
    const rpp = TMDReaperGenerator.generateRPP(sheet);

    // A = 4 quarters, B starts one active 3/4 bar later and lasts 4 quarters.
    // C therefore starts at 11 quarters = 5.5 seconds at 120 BPM.
    expect(rpp).toMatch(/MARKER 3 5\.50000000 "C" 0/);
  });

  it('configures track names, panning (-L / -R), colors, and inline MIDI data', () => {
    const tmd = `
::SCORE::
** Multi-track Demo **
!= 120
?= C
<4/4>

A:Piano-L@|0|{
    <4*>
    1 2 3 4
}

A:Piano-R@|0|{
    <4*>
    5 6 7 1'
}

A:Drums@|0|{
    <4*>
    D S - -
}
-> A ->#
`;
    const sheet = TmdParser.parse(tmd)!;
    const rpp = TMDReaperGenerator.generateRPP(sheet);

    // Tracks exist
    expect(rpp).toContain('NAME "Piano-L"');
    expect(rpp).toContain('NAME "Piano-R"');
    expect(rpp).toContain('NAME "Drums"');

    // Stereo Panning
    // Piano-L should have negative pan (left)
    expect(rpp).toMatch(/NAME "Piano-L"[\s\S]*?VOLPAN 1(\.0+)? -0\.80*/);
    // Piano-R should have positive pan (right)
    expect(rpp).toMatch(/NAME "Piano-R"[\s\S]*?VOLPAN 1(\.0+)? 0\.80*/);
    // Drums should have center pan
    expect(rpp).toMatch(/NAME "Drums"[\s\S]*?VOLPAN 1(\.0+)? 0(\.0+)? 1 -1 1/);

    // Instrument colors (PEAKCOL)
    expect(rpp).toMatch(/NAME "Drums"[\s\S]*?PEAKCOL \d+/);
    expect(rpp).toMatch(/NAME "Piano-L"[\s\S]*?PEAKCOL \d+/);

    // Inline MIDI item chunks with 960 PPQ
    expect(rpp).toContain('<SOURCE MIDI');
    expect(rpp).toContain('HASDATA 1 960 QN');

    // Pitch assertions:
    // C key, Note 1 = C4 = MIDI 60 (0x3c)
    // Note On channel 0: 90 3c
    expect(rpp).toMatch(/E \d+ 90 3c [0-9a-f]{2}/);
    // Drums: D (Kick) = MIDI 36 (0x24) on channel 9 (0x99)
    expect(rpp).toMatch(/E \d+ 99 24 [0-9a-f]{2}/);
    // Drums: S (Snare) = MIDI 38 (0x26) on channel 9 (0x99)
    expect(rpp).toMatch(/E \d+ 99 26 [0-9a-f]{2}/);
  });

  it('supports CLI export with -r and --reaper-output', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmd-reaper-test-'));
    const tmdPath = path.join(tempDir, 'test.tmd');
    const rppPath = path.join(tempDir, 'output.rpp');

    fs.writeFileSync(tmdPath, `::SCORE::
** CLI Test **
!= 120
?= C
<4/4>
A:Piano@|0|{
    <4*>
    1 2 3 4
}
-> A ->#
`);

    try {
      const exitCode = main(['-r', rppPath, tmdPath]);
      expect(exitCode).toBe(0);
      expect(fs.existsSync(rppPath)).toBe(true);
      const content = fs.readFileSync(rppPath, 'utf8');
      expect(content).toContain('<REAPER_PROJECT');
      expect(content).toContain('NAME "Piano"');
      expect(content).toContain('HASDATA 1 960 QN');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('supports S-Expression macros and exports all generated instrument tracks', () => {
    const tmd = `::SCORE::
** REAPER Macro Demo **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 2 3 4
}

-> (canon Theme (Violin1 Violin2) 2) ->#
`;
    const sheet = TmdParser.parse(tmd)!;
    const rpp = TMDReaperGenerator.generateRPP(sheet);

    expect(rpp).toContain('NAME "Violin1"');
    expect(rpp).toContain('NAME "Violin2"');
  });
});
