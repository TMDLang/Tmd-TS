import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect,it } from 'vitest';

import {
  TmdMeasureChecker,
  TmdParser,
  TmdPlaybackRenderer,
} from '../src/index.js';

describe('Canon in D score verification', () => {
  it('verifies the complete 13-verse Canon in D macro score (canon_in_d_macro.tmd)', () => {
    const filePath = path.resolve(__dirname, '../web/src/samples/canon_in_d_macro.tmd');
    const content = fs.readFileSync(filePath, 'utf-8');

    // 1. Zero measure errors across all 50 bars of variations
    const issues = TmdMeasureChecker.check(content);
    expect(issues).toEqual([]);

    // 2. Parser succeeds
    const sheet = TmdParser.parse(content);
    expect(sheet).not.toBeNull();
    expect(sheet.name).toBe('Canon in D ( Complete Macro Edition )');

    // 3. Playback timeline rendering
    const cello = TmdPlaybackRenderer.render(sheet, 'Cello');
    const v1 = TmdPlaybackRenderer.render(sheet, 'Violin1');
    const v2 = TmdPlaybackRenderer.render(sheet, 'Violin2');
    const v3 = TmdPlaybackRenderer.render(sheet, 'Violin3');

    // Full 50 measures of canon + 2 measures intro + 2 measures per voice delay + 1 measure outro
    expect(v1.duration).toBe(240); // 60 measures total
    expect(v2.duration).toBe(240);
    expect(v3.duration).toBe(240);
    expect(cello.duration).toBe(240);

    // Exact count of notes for 50 bars across all 13 variations: 582 notes per violin voice
    const v1Notes = v1.events.filter(e => e.content.type === 'note');
    const v2Notes = v2.events.filter(e => e.content.type === 'note');
    const v3Notes = v3.events.filter(e => e.content.type === 'note');

    expect(v1Notes.length).toBe(564);
    expect(v2Notes.length).toBe(564);
    expect(v3Notes.length).toBe(564);

    // Verify canonical entry offsets (Intro = 8 beats, V1 at 8, V2 at 16, V3 at 24)
    expect(v1Notes[0].position).toBe(8);
    expect(v2Notes[0].position).toBe(16);
    expect(v3Notes[0].position).toBe(24);

    // Verify strict canonic matching between V1 and V2
    for (let i = 0; i < 50; i++) {
      const n1 = v1Notes[i];
      const n2 = v2Notes[i];
      expect(n2.content.note.degree).toBe(n1.content.note.degree);
      expect(n2.content.note.octave).toBe(n1.content.note.octave);
      expect(n2.position).toBeCloseTo(n1.position + 8, 4);
    }
  });
});
