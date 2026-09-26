import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TmdParser } from '../src/core/index.js';
import {
  VocaloidPhoneme,
  TMDVSQGenerator,
  TMDVSQXGenerator,
  VocaloidExportOptions,
} from '../src/exporters/vocaloid.js';
import { main } from '../src/cli.js';
import { TmdMcpServer } from '../src/mcp/index.js';

describe('VocaloidPhoneme (Japanese to X-SAMPA)', () => {
  it('resolves basic vowels in Romaji, Hiragana, and Katakana', () => {
    expect(VocaloidPhoneme.resolvePhoneme('a')).toBe('a');
    expect(VocaloidPhoneme.resolvePhoneme('あ')).toBe('a');
    expect(VocaloidPhoneme.resolvePhoneme('ア')).toBe('a');
    expect(VocaloidPhoneme.resolvePhoneme('u')).toBe('M');
    expect(VocaloidPhoneme.resolvePhoneme('う')).toBe('M');
    expect(VocaloidPhoneme.resolvePhoneme('ウ')).toBe('M');
    expect(VocaloidPhoneme.resolvePhoneme('o')).toBe('o');
    expect(VocaloidPhoneme.resolvePhoneme('お')).toBe('o');
  });

  it('resolves consonants and palatalized kana for Miku lyrics', () => {
    expect(VocaloidPhoneme.resolvePhoneme('mi')).toBe("m' i");
    expect(VocaloidPhoneme.resolvePhoneme('み')).toBe("m' i");
    expect(VocaloidPhoneme.resolvePhoneme('ミ')).toBe("m' i");
    expect(VocaloidPhoneme.resolvePhoneme('ku')).toBe('k M');
    expect(VocaloidPhoneme.resolvePhoneme('く')).toBe('k M');
    expect(VocaloidPhoneme.resolvePhoneme('ク')).toBe('k M');
    expect(VocaloidPhoneme.resolvePhoneme('ra')).toBe('4 a');
    expect(VocaloidPhoneme.resolvePhoneme('ら')).toBe('4 a');
    expect(VocaloidPhoneme.resolvePhoneme('shi')).toBe('S i');
    expect(VocaloidPhoneme.resolvePhoneme('し')).toBe('S i');
    expect(VocaloidPhoneme.resolvePhoneme('tsu')).toBe('ts M');
    expect(VocaloidPhoneme.resolvePhoneme('つ')).toBe('ts M');
    expect(VocaloidPhoneme.resolvePhoneme('kya')).toBe("k' a");
    expect(VocaloidPhoneme.resolvePhoneme('きゃ')).toBe("k' a");
  });

  it('falls back to default "a" phoneme for empty, unknown, or whitespace lyrics', () => {
    expect(VocaloidPhoneme.resolvePhoneme('')).toBe('a');
    expect(VocaloidPhoneme.resolvePhoneme('   ')).toBe('a');
    expect(VocaloidPhoneme.resolvePhoneme('unknown_xyz_123')).toBe('a');
  });
});

describe('TMDVSQGenerator (VOCALOID2 .vsq SMF Format 1)', () => {
  const tmdSource = `::SCORE::
** Miku Song **
!= 120
?= C
<4/4>
Intro:Vocal@|0|{
    <4*>
    1 2 3 4
}
`;

  it('generates valid SMF Format 1 binary with 2 tracks (conductor + vocal)', () => {
    const sheet = TmdParser.parse(tmdSource)!;
    expect(sheet).toBeDefined();

    const vsqData = TMDVSQGenerator.generateVSQ(sheet, { singerName: 'Miku' });
    expect(vsqData).toBeInstanceOf(Uint8Array);
    expect(vsqData.length).toBeGreaterThan(100);

    // Verify MIDI Header 'MThd'
    const headerStr = String.fromCharCode(...vsqData.slice(0, 4));
    expect(headerStr).toBe('MThd');

    // Format 1: bytes 8..9 should be 0x00, 0x01
    expect(vsqData[8]).toBe(0x00);
    expect(vsqData[9]).toBe(0x01);

    // Track count: bytes 10..11 should be 2
    const trackCount = (vsqData[10] << 8) | vsqData[11];
    expect(trackCount).toBe(2);

    // PPQ: bytes 12..13 should be 480
    const ppq = (vsqData[12] << 8) | vsqData[13];
    expect(ppq).toBe(480);
  });

  it('embeds INI structure, singer name, preMeasure, and note events', () => {
    const sheet = TmdParser.parse(tmdSource)!;
    const vsqData = TMDVSQGenerator.generateVSQ(sheet, {
      singerName: 'Hatsune Miku',
      preMeasure: 4,
    });

    // Extract and concatenate all text meta event payloads (0xFF 0x01 <len>)
    let reconstructedIni = '';
    for (let i = 0; i < vsqData.length - 3; i++) {
      if (vsqData[i] === 0xff && vsqData[i + 1] === 0x01) {
        const len = vsqData[i + 2];
        const chunk = vsqData.slice(i + 3, i + 3 + len);
        reconstructedIni += new TextDecoder('latin1').decode(chunk);
      }
    }

    // INI Header structures
    expect(reconstructedIni).toContain('[Common]');
    expect(reconstructedIni).toContain('Version=DSB301');
    expect(reconstructedIni).toContain('[Master]');
    expect(reconstructedIni).toContain('PreMeasure=4');
    expect(reconstructedIni).toContain('[Mixer]');
    expect(reconstructedIni).toContain('[EventList]');

    // Singer handle
    expect(reconstructedIni).toContain('IDS=Hatsune Miku');
    expect(reconstructedIni).toContain('Type=Singer');

    // Note events and handles
    expect(reconstructedIni).toContain('Type=Anote');
    expect(reconstructedIni).toContain('LyricHandle=h#0001');

    // First note tick with 4 preMeasure bars in 4/4 at 480 PPQ is 7680 (4 * 4 * 480)
    expect(reconstructedIni).toContain('7680=ID#0001');
  });

  it('selects vocal instrument automatically if multi-track score provided', () => {
    const multiTrackTmd = `::SCORE::
** Multi-Track Miku Test **
!= 120
?= C
<4/4>
Intro:Piano@|0|{
    <4*>
    1 1 1 1
}
Intro:MikuVoice@|0|{
    <4*>
    3 4 5 6
}
`;
    const sheet = TmdParser.parse(multiTrackTmd)!;
    const vsqData = TMDVSQGenerator.generateVSQ(sheet);
    const binaryStr = new TextDecoder('latin1').decode(vsqData);
    expect(binaryStr).toContain('Name=MikuVoice');
  });
});

describe('TMDVSQXGenerator (VOCALOID3/4 .vsqx XML)', () => {
  const tmdSource = `::SCORE::
** Miku Vocaloid Song **
!= 135
?= D
<4/4>
Verse:Vocal@|0|{
    <4*>
    1 3 5 1^
}
`;

  it('does not select a prototype as the vocal assignment', () => {
    const sheet = TmdParser.parse(`::SCORE::
** Prototype Before Bass **
!= 120
?= C
<4/4>
Theme{
  <4*>
  1 2 3 4
}
Verse:Bass@|0|{
  <4*>
  1 2 3 4
}
`)!;

    const vsqx = TMDVSQXGenerator.generateVSQX(sheet);

    expect(vsqx).toContain('<note>');
  });

  it('generates valid VOCALOID4 XML document with correct root and schema', () => {
    const sheet = TmdParser.parse(tmdSource)!;
    const vsqx = TMDVSQXGenerator.generateVSQX(sheet, { singerName: 'Hatsune Miku' });

    expect(vsqx).toContain('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
    expect(vsqx).toContain('<vsq4 xmlns="http://www.yamaha.co.jp/vocaloid/schema/vsq4/"');
    expect(vsqx).toContain('<vender><![CDATA[Yamaha corporation]]></vender>');
    expect(vsqx).toContain('<version><![CDATA[4.0.0.3]]></version>');
    expect(vsqx).toContain('<masterTrack>');
    expect(vsqx).toContain('<vsTrack>');
    expect(vsqx).toContain('<name><![CDATA[Hatsune Miku]]></name>');
  });

  it('correctly calculates tempo (scaled x100), time signature, and note ticks', () => {
    const sheet = TmdParser.parse(tmdSource)!;
    const vsqx = TMDVSQXGenerator.generateVSQX(sheet, {
      singerName: 'Hatsune Miku',
      preMeasure: 4,
    });

    // 135 BPM * 100 = 13500
    expect(vsqx).toContain('<tempo>');
    expect(vsqx).toContain('<v>13500</v>');

    // PreMeasure = 4
    expect(vsqx).toContain('<preMeasure>4</preMeasure>');
    expect(vsqx).toContain('<nu>4</nu>');
    expect(vsqx).toContain('<de>4</de>');

    // Notes: 4 notes of 1 beat (480 ticks) each starting at 4 bars premeasure (7680 ticks)
    expect(vsqx).toContain('<note>');
    expect(vsqx).toContain('<t>7680</t>');
    expect(vsqx).toContain('<dur>480</dur>');
    // Key is D: 1 is D4 = 62 MIDI pitch
    expect(vsqx).toContain('<n>62</n>');
    expect(vsqx).toContain('<y><![CDATA[a]]></y>');
    expect(vsqx).toContain('<p><![CDATA[a]]></p>');
  });
});

describe('CLI & MCP Integration for VOCALOID Export', () => {
  it('supports CLI flags --vsq-output, --vsqx-output, and --singer', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmd-vocaloid-test-'));
    const tmdFile = path.join(tmpDir, 'test.tmd');
    const vsqFile = path.join(tmpDir, 'test.vsq');
    const vsqxFile = path.join(tmpDir, 'test.vsqx');

    const score = `::SCORE::
** Miku CLI Song **
!= 128
?= C
<4/4>
Intro:Vocal@|0|{
    <4*>
    1 2 3 4
}
-> Intro ->#
`;
    fs.writeFileSync(tmdFile, score, 'utf-8');

    const exitCode = main([
      tmdFile,
      '--vsq-output',
      vsqFile,
      '--vsqx-output',
      vsqxFile,
      '--singer',
      'Hatsune Miku',
    ]);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(vsqFile)).toBe(true);
    expect(fs.existsSync(vsqxFile)).toBe(true);

    const vsqData = fs.readFileSync(vsqFile);
    expect(vsqData.length).toBeGreaterThan(100);

    const vsqxContent = fs.readFileSync(vsqxFile, 'utf-8');
    expect(vsqxContent).toContain('Hatsune Miku');
    expect(vsqxContent).toContain('<vsq4');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('supports MCP convert_tmd tool with format "vsq" and "vsqx"', async () => {
    const score = `::SCORE::
** Miku MCP Song **
!= 120
?= C
<4/4>
Intro:Vocal@|0|{
    <4*>
    1 2 3 4
}
`;
    // Base64 VSQ
    const resVsq = await TmdMcpServer.handleConvertTmd({
      text: score,
      format: 'vsq' as any,
    });
    expect(resVsq.content[0].type).toBe('text');
    const vsqBuffer = Buffer.from(resVsq.content[0].text, 'base64');
    expect(vsqBuffer.slice(0, 4).toString('ascii')).toBe('MThd');

    // XML VSQX
    const resVsqx = await TmdMcpServer.handleConvertTmd({
      text: score,
      format: 'vsqx' as any,
    });
    expect(resVsqx.content[0].type).toBe('text');
    expect(resVsqx.content[0].text).toContain('<vsq4');
  });
});
