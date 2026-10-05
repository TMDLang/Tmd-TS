import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect,it } from 'vitest';

import { main } from '../src/cli.js';
import { TMDChordProGenerator } from '../src/exporters/chordpro.js';
import { TMDParser } from '../src/syntax/index.js';

describe('TMDChordProGenerator', () => {
  it('generates standard ChordPro metadata directives', () => {
    const tmd = `
::SCORE::
** Amazing Grace **
!= 80
?= G
<3/4>
~ "詞：John Newton"
~ "曲：Traditional"

A:Guitar@|0|{
    <4*>
    [G] . .
}
-> A ->#
`;
    const sheet = TMDParser.parse(tmd)!;
    const cho = TMDChordProGenerator.generateChordPro(sheet);

    expect(cho).toContain('{title: Amazing Grace}');
    expect(cho).toContain('{tempo: 80}');
    expect(cho).toContain('{time: 3/4}');
    expect(cho).toContain('{key: G}');
    expect(cho).toContain('{composer: Traditional}');
    expect(cho).toContain('{lyricist: John Newton}');
  });

  it('renders chord progression with measure bars', () => {
    const tmd = `
::SCORE::
** 12 Bar Blues **
!= 120
?= C
<4/4>

Verse:Guitar@|0|{
    <4*>
    [C] - - -
    [F] - - -
    [C] - [G] -
}
-> Verse ->#
`;
    const sheet = TMDParser.parse(tmd)!;
    const cho = TMDChordProGenerator.generateChordPro(sheet);

    expect(cho).toContain('{comment: Verse}');
    expect(cho).toContain('| [C] | [F] | [C] [G] |');
  });

  it('handles sections and order sequencing correctly', () => {
    const tmd = `
::SCORE::
** Structure Demo **
!= 100
?= D
<4/4>

Intro:Guitar@|0|{
    <4*>
    [D] . . .
}

Chorus:Guitar@|0|{
    <4*>
    [G] . [A] .
}

-> Intro -> Chorus -> Intro ->#
`;
    const sheet = TMDParser.parse(tmd)!;
    const cho = TMDChordProGenerator.generateChordPro(sheet);

    // Intro appears twice according to order
    const introMatches = cho.match(/\{comment: Intro\}/g);
    expect(introMatches).toHaveLength(2);
    const chorusMatches = cho.match(/\{comment: Chorus\}/g);
    expect(chorusMatches).toHaveLength(1);
  });

  it('renders repeated section chords using the order modulation state', () => {
    const tmd = `
::SCORE::
** Modulated ChordPro **
!= 120
?= C
<4/4>

Verse:Guitar@|0|{
    <4*>
    [1] - - -
}
-> Verse -> {?+2} -> Verse ->#
`;
    const sheet = TMDParser.parse(tmd)!;
    const cho = TMDChordProGenerator.generateChordPro(sheet);

    expect((cho.match(/\[C\]/g) || []).length).toBe(1);
    expect((cho.match(/\[D\]/g) || []).length).toBe(1);
  });

  it('handles custom line wrapping for measures', () => {
    const tmd = `
::SCORE::
** Long Progression **
!= 120
?= C
<4/4>

Verse:Guitar@|0|{
    <4*>
    [C] - - -
    [Dm] - - -
    [Em] - - -
    [F] - - -
    [G] - - -
}
-> Verse ->#
`;
    const sheet = TMDParser.parse(tmd)!;
    const cho = TMDChordProGenerator.generateChordPro(sheet, { measuresPerLine: 4 });

    // After 4 measures, there should be a newline before the 5th measure
    const lines = cho.split('\n').filter(l => l.startsWith('|'));
    expect(lines).toHaveLength(2);
    expect(lines[0].trim()).toBe('| [C] | [Dm] | [Em] | [F] |');
    expect(lines[1].trim()).toBe('| [G] |');
  });

  it('supports CLI export with -c, --chordpro-output, --cho-output', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmd-chordpro-test-'));
    const tmdPath = path.join(tmpDir, 'test.tmd');
    const choPath = path.join(tmpDir, 'test.cho');

    try {
      fs.writeFileSync(tmdPath, `
::SCORE::
** CLI Test Song **
!= 90
?= F
<4/4>
Verse:Guitar@|0|{
    <4*>
    [F] . [C] .
}
-> Verse ->#
`);
      const exitCode = main(['--chordpro-output', choPath, tmdPath]);
      expect(exitCode).toBe(0);
      expect(fs.existsSync(choPath)).toBe(true);
      const content = fs.readFileSync(choPath, 'utf8');
      expect(content).toContain('{title: CLI Test Song}');
      expect(content).toContain('{key: F}');
      expect(content).toContain('| [F] [C] |');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
