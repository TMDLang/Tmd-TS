import { describe, expect,it } from 'vitest';

import {
  formatOrder,
  formatSheet,
  TMDMacroError,
  TMDMacroEvaluator,
  TMDMeasureChecker,
  TMDMIDIGenerator,
  TmdParser,
  TMDPlaybackRenderer,
  TMDWAVRenderer,
} from '../src/index.js';
import { macroPlayFixture } from './conformanceFixtures.js';

describe('TMD Macro S-Expression & Abstract Paragraphs (TDD - Red Phase)', () => {
  it('matches the shared prototype-binding macro fixture', () => {
    const sheet = TmdParser.parse(macroPlayFixture);
    const playback = TMDPlaybackRenderer.render(sheet, 'Violin');

    expect(sheet.entries?.[0].isPrototype).toBe(true);
    expect(playback.events.map((event) => event.position)).toEqual([0, 1, 2, 3]);
    expect(playback.duration).toBe(4);
  });

  describe('Lexer & Parser AST Integration', () => {
    it('parses abstract paragraphs declared without instrument bindings (Theme { ... })', () => {
      const input = `::SCORE::
** Abstract Prototype **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 2 3 4
}

-> Theme ->#
`;
      const sheet = TmdParser.parse(input);
      expect(sheet).not.toBeNull();
      expect(sheet.entries.length).toBe(1);
      const p = sheet.entries[0];
      expect(p.name).toBe('Theme');
      expect(p.assignment).toBeUndefined(); // Missing assignment indicates abstract prototype
      expect(p.start).toBe(0);
      expect(p.sections.length).toBe(1);
      expect(p.sections[0].unitGroups.length).toBe(4);
    });

    it('parses S-expressions in playback orders (-> (canon Theme (V1 V2) 2) ->#)', () => {
      const input = `::SCORE::
** S-Expression Order **
!= 120
?= C
<4/4>

Theme:Piano@|0|{
    <4*>
    1 2 3 4
}

-> (canon Theme (Violin1 Violin2) 2) ->#
`;
      const sheet = TmdParser.parse(input);
      expect(sheet).not.toBeNull();
      expect(sheet.playback.length).toBe(1);
      const order = sheet.playback[0];
      expect(order.type).toBe('macro');
      if (order.type === 'macro') {
        expect(order.expr).toEqual([
          'canon',
          'Theme',
          ['Violin1', 'Violin2'],
          2,
        ]);
      }
    });

    it('formats S-expression macro orders back to string', () => {
      const input = `::SCORE::
** Format Macro Test **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 2 3 4
}

-> (canon Theme (Violin1 Violin2) 2) ->#
`;
      const sheet = TmdParser.parse(input);
      const formattedOrder = formatOrder(sheet.playback[0]);
      expect(formattedOrder).toBe('(canon Theme (Violin1 Violin2) 2)');

      const formatted = formatSheet(sheet);
      expect(formatted).toContain('-> (canon Theme (Violin1 Violin2) 2) ->#');
    });
  });

  describe('TMDMacroEvaluator (Desugaring AST Expansion)', () => {
    it('evaluates (play Theme Violin) by binding abstract theme to instrument', () => {
      const input = `::SCORE::
** Play Combinator **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 2 3 4
}

-> (play Theme Violin) ->#
`;
      const sheet = TmdParser.parse(input);
      const playback = TMDPlaybackRenderer.render(sheet, 'Violin');
      expect(playback.events.length).toBe(4);
      expect(playback.events[0].position).toBe(0);
      expect(playback.duration).toBe(4);
    });

    it('evaluates (loop Theme Cello 3) by repeating theme sequentially', () => {
      const input = `::SCORE::
** Loop Combinator **
!= 120
?= C
<4/4>

Bass {
    <4*>
    1 5, 6, 3,
}

-> (loop Bass Cello 3) ->#
`;
      const sheet = TmdParser.parse(input);
      const playback = TMDPlaybackRenderer.render(sheet, 'Cello');
      // 4 beats * 3 iterations = 12 events across 12 beats
      expect(playback.events.length).toBe(12);
      expect(playback.duration).toBe(12);
    });

    it('evaluates (canon Theme (Violin1 Violin2 Violin3) 2) with exact staggered entries', () => {
      const input = `::SCORE::
** Canon Combinator **
!= 120
?= D
<4/4>

Theme {
    <4*>
    3^ 2^ 1^ 7 | 6 5 6 7
}

-> (canon Theme (Violin1 Violin2 Violin3) 2) ->#
`;
      const sheet = TmdParser.parse(input);
      const v1 = TMDPlaybackRenderer.render(sheet, 'Violin1');
      const v2 = TMDPlaybackRenderer.render(sheet, 'Violin2');
      const v3 = TMDPlaybackRenderer.render(sheet, 'Violin3');

      expect(v1.events[0].position).toBe(0);
      expect(v2.events[0].position).toBe(8);  // 2 measures * 4 beats
      expect(v3.events[0].position).toBe(16); // 4 measures * 4 beats

      expect(v1.events.length).toBe(8);
      expect(v2.events.length).toBe(8);
      expect(v3.events.length).toBe(8);
    });

    it('evaluates nested canon (canon (canon Theme (Violin1 Violin2) 1) (Flute1 Flute2) 4)', () => {
      const input = `::SCORE::
** Nested Canon Test **
!= 120
?= D
<4/4>

Theme {
    <4*>
    1' - 7 - | 6 - 5 -
}

-> (canon
     (canon Theme (Violin1 Violin2) 1)
     (Flute1 Flute2)
     4
   ) ->#
`;
      const sheet = TmdParser.parse(input);
      const v1 = TMDPlaybackRenderer.render(sheet, 'Violin1');
      const v2 = TMDPlaybackRenderer.render(sheet, 'Violin2');
      const f1 = TMDPlaybackRenderer.render(sheet, 'Flute1');
      const f2 = TMDPlaybackRenderer.render(sheet, 'Flute2');

      // Inner canon: Violin1 enters at 0, Violin2 enters at 1 bar (4 beats)
      expect(v1.events.length).toBe(4);
      expect(v1.events[0].position).toBe(0);
      expect(v2.events.length).toBe(4);
      expect(v2.events[0].position).toBe(4);

      // Outer canon: Flute1 enters at 4 bars (16 beats), Flute2 enters at 4 + 1 = 5 bars (20 beats)
      expect(f1.events.length).toBe(4);
      expect(f1.events[0].position).toBe(16);
      expect(f2.events.length).toBe(4);
      expect(f2.events[0].position).toBe(20);
    });

    it('evaluates (layer (canon ...) (loop ...)) combining polyphonic canon with ground bass', () => {
      const input = `::SCORE::
** Pachelbel Canon Macro Demo **
!= 56
?= D
<4/4>

Bass {
    <4*>
    1_ 5__ 6__ 3__ | 4__ 1__ 4__ 5__
}

Theme {
    <4*>
    3^ 2^ 1^ 7 | 6 5 6 7 | 1^ 7 6 5 | 4 3 4 2
}

-> (layer
     (canon Theme (Violin1 Violin2 Violin3) 2)
     (loop Bass Cello 4)) ->#
`;
      const sheet = TmdParser.parse(input);

      const cello = TMDPlaybackRenderer.render(sheet, 'Cello');
      const v1 = TMDPlaybackRenderer.render(sheet, 'Violin1');
      const v2 = TMDPlaybackRenderer.render(sheet, 'Violin2');
      const v3 = TMDPlaybackRenderer.render(sheet, 'Violin3');

      // Cello: 4 iterations * 2 measures * 4 beats = 32 beats
      expect(cello.duration).toBe(32);
      expect(cello.events.length).toBe(32);

      // Violin 1 enters at 0, plays 16 beats
      expect(v1.events[0].position).toBe(0);
      expect(v1.events.length).toBe(16);

      // Violin 2 enters at 8, plays 16 beats
      expect(v2.events[0].position).toBe(8);
      expect(v2.events.length).toBe(16);

      // Violin 3 enters at 16, plays 16 beats
      expect(v3.events[0].position).toBe(16);
      expect(v3.events.length).toBe(16);
    });

    it('evaluates (layer A (loop B 10)) with concrete paragraphs without requiring explicit instrument arguments', () => {
      const input = `::SCORE::
** Layer Bare Concrete Paragraph & 2-arg Loop **
!= 120
?= C
<4/4>

A:Piano@|0|{
    <4*>
    1 2 3 4
}

B:Bass@|0|{
    <4*>
    1_ - 5_ -
}

-> (layer
     A
     (loop B 10)) ->#
`;
      const sheet = TmdParser.parse(input);
      const expanded = TMDMacroEvaluator.expand(sheet);

      expect(expanded.playback).toHaveLength(1);
      const orderName = (expanded.playback[0] as any).name;
      expect(orderName).toMatch(/^__layer_/);

      const piano = TMDPlaybackRenderer.render(expanded, 'Piano');
      const bass = TMDPlaybackRenderer.render(expanded, 'Bass');

      // In TMD, all concurrent tracks in a layer block span the duration of the longest track (40 beats)
      expect(piano.duration).toBe(40);
      expect(piano.events.length).toBe(4);

      // Bass loops 10 times * 4 beats = 40 beats
      expect(bass.duration).toBe(40);
      expect(bass.events.length).toBe(20);
    });

    it('passes TMDMeasureChecker and exports MIDI / WAV seamlessly', () => {
      const input = `::SCORE::
** Macro Export & Check **
!= 120
?= D
<4/4>

Bass {
    <4*>
    1_ 5__ 6__ 3__ | 4__ 1__ 4__ 5__
}

Theme {
    <4*>
    3^ 2^ 1^ 7 | 6 5 6 7 | 1^ 7 6 5 | 4 3 4 2
}

-> (layer
     (canon Theme (Violin1 Violin2) 2)
     (loop Bass Cello 3)) ->#
`;
      // 1. Measure check passes with 0 issues
      const issues = TMDMeasureChecker.check(input);
      expect(issues).toEqual([]);

      // 2. MIDI generation produces valid bytes without throwing
      const sheet = TmdParser.parse(input);
      const midiBytes = TMDMIDIGenerator.generateMIDI(sheet);
      expect(midiBytes.length).toBeGreaterThan(50);

      // 3. WAV synthesis produces valid RIFF WAV data
      const wavBytes = TMDWAVRenderer.renderWAV(sheet);
      expect(wavBytes.length).toBeGreaterThan(44);
      const header = String.fromCharCode(...wavBytes.slice(0, 4));
      expect(header).toBe('RIFF');
    });

    it('supports multiple sequential themes in canon and loop: (canon (Theme1 Theme2) ...) and (loop (Bass1 Bass2) ...)', () => {
      const input = `::SCORE::
** Multi-Theme Sequential Canon & Loop **
!= 120
?= C
<4/4>

ThemeA {
    <4*>
    1 2 3 4 |
}

ThemeB {
    <4*>
    5 6 7 1^ |
}

BassA {
    <4*>
    1_ 5_ 6_ 3_ |
}

BassB {
    <4*>
    4_ 1_ 4_ 5_ |
}

-> (layer
     (canon (ThemeA ThemeB) (Violin1 Violin2) 2)
     (loop (BassA BassB) Cello 2)) ->#
`;
      const sheet = TmdParser.parse(input);
      expect(sheet).not.toBeNull();

      // TMDPlaybackRenderer verifies the concatenated sections
      const v1 = TMDPlaybackRenderer.render(sheet, 'Violin1');
      const v2 = TMDPlaybackRenderer.render(sheet, 'Violin2');
      const cello = TMDPlaybackRenderer.render(sheet, 'Cello');

      // Each theme is 1 measure = 4 beats. ThemeA + ThemeB = 8 beats total per voice.
      // Violin1 starts at 0, has 8 note events
      expect(v1.events.length).toBe(8);
      expect(v1.events[0].position).toBe(0);
      expect(v1.events[4].position).toBe(4); // ThemeB starts at beat 4

      // Violin2 starts at 2 bars (8 beats), has 8 note events, ends at beat 16
      expect(v2.events[0].position).toBe(8);
      expect(v2.events[4].position).toBe(12);

      // The layer block duration spans the entire layer timeline (16 beats)
      expect(v1.duration).toBe(16);
      expect(v2.duration).toBe(16);

      // Cello loops (BassA + BassB) 2 times: (4 + 4) * 2 = 16 beats
      expect(cello.duration).toBe(16);
      expect(cello.events.length).toBe(16);
    });

    it('evaluates (transpose Theme semitones) shifting pitch chromatically', () => {
      const input = `::SCORE::
** Transpose Variation **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 2 3 4
}

-> (play (transpose Theme 2) Violin) ->#
`;
      const sheet = TmdParser.parse(input);
      const v = TMDPlaybackRenderer.render(sheet, 'Violin');
      expect(v.events.length).toBe(4);
      // In C major: 1 is C (MIDI 60), +2 semitones is D (MIDI 62).
      // 2 is D (MIDI 62), +2 is E (MIDI 64).
      // 3 is E (MIDI 64), +2 is F# (MIDI 66).
      // 4 is F (MIDI 65), +2 is G (MIDI 67).
      const pitches = v.events.map((e) => {
        if (e.content.type === 'note') {
          return TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset);
        }
        return -1;
      });
      expect(pitches).toEqual([62, 64, 66, 67]);
    });

    it('evaluates pitch transposition with +12 / -12 shifting octave up or down', () => {
      const input = `::SCORE::
** Octave Transpose Variation **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 3 5 1^
}

-> (play (transpose Theme 12) Flute)
-> (play (transpose Theme -12) Cello) ->#
`;
      const sheet = TmdParser.parse(input);
      const flute = TMDPlaybackRenderer.render(sheet, 'Flute');
      const cello = TMDPlaybackRenderer.render(sheet, 'Cello');

      const flutePitches = flute.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );
      const celloPitches = cello.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );

      // C major: 1 3 5 1^ = 60, 64, 67, 72.
      // Flute (+12 semitones): 72, 76, 79, 84
      expect(flutePitches).toEqual([72, 76, 79, 84]);
      // Cello (-12 semitones): 48, 52, 55, 60
      expect(celloPitches).toEqual([48, 52, 55, 60]);
    });

    it('evaluates (reverse Theme) reversing note sequence within bars', () => {
      const input = `::SCORE::
** Reverse Variation **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 2 3 4 | 5 6 7 1^
}

-> (play (reverse Theme) Violin) ->#
`;
      const sheet = TmdParser.parse(input);
      const v = TMDPlaybackRenderer.render(sheet, 'Violin');

      const vPitches = v.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );

      // Original: 1 2 3 4 (60, 62, 64, 65) | 5 6 7 1^ (67, 69, 71, 72)
      // Reversed: 1^ 7 6 5 (72, 71, 69, 67) | 4 3 2 1 (65, 64, 62, 60)
      expect(vPitches).toEqual([72, 71, 69, 67, 65, 64, 62, 60]);
    });

    it('evaluates (flip Theme) inverting melodic contours around the first note or axis', () => {
      const input = `::SCORE::
** Flip (Inversion) Variation **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 3 5 1^
}

-> (play (flip Theme) Violin) ->#
`;
      const sheet = TmdParser.parse(input);
      const v = TMDPlaybackRenderer.render(sheet, 'Violin');
      const vPitches = v.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );

      // Original: 1(60), 3(64, +4), 5(67, +7), 1^(72, +12)
      // Inverted around first note 60:
      // 60 -> 60 (diff 0 -> 60)
      // 64 -> 60 - 4 = 56 (G#3 / Ab3)
      // 67 -> 60 - 7 = 53 (F3)
      // 72 -> 60 - 12 = 48 (C3)
      expect(vPitches).toEqual([60, 56, 53, 48]);
    });

    it('evaluates (vary Theme ...) composing multiple variations seamlessly into canon & layer', () => {
      const input = `::SCORE::
** Variation Suite Demo **
!= 120
?= C
<4/4>

Subject {
    <4*>
    1 2 3 5 |
}

-> (layer
     (play Subject SoloViolin)
     (play (vary Subject +19) Flute)
     (canon (vary Subject reverse -12) (Cello Bass) 2)) ->#
`;
      const sheet = TmdParser.parse(input);
      expect(sheet).not.toBeNull();

      const violin = TMDPlaybackRenderer.render(sheet, 'SoloViolin');
      const flute = TMDPlaybackRenderer.render(sheet, 'Flute');
      const cello = TMDPlaybackRenderer.render(sheet, 'Cello');
      const bass = TMDPlaybackRenderer.render(sheet, 'Bass');

      // Subject: 1(60), 2(62), 3(64), 5(67)
      const violinPitches = violin.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );
      expect(violinPitches).toEqual([60, 62, 64, 67]);

      // Flute: transpose +7, octave +1 -> +19 semitones
      // 60+19=79, 62+19=81, 64+19=83, 67+19=86
      const flutePitches = flute.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );
      expect(flutePitches).toEqual([79, 81, 83, 86]);

      // Cello & Bass: reverse (5 3 2 1: 67, 64, 62, 60), octave -1 (-12 semitones: 55, 52, 50, 48)
      // Cello at 0, Bass at 2 bars (8 beats)
      const celloPitches = cello.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );
      expect(celloPitches).toEqual([55, 52, 50, 48]);
      expect(cello.events[0].position).toBe(0);

      const bassPitches = bass.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );
      expect(bassPitches).toEqual([55, 52, 50, 48]);
      expect(bass.events[0].position).toBe(8);
    });

    it('evaluates flat vary: (vary Theme flip reverse) and (vary Theme +2)', () => {
      const input = `::SCORE::
** Flat Vary Demo **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 3 5 1^
}

-> (play (vary Theme +2) Violin)
-> (play (vary Theme reverse flip) Cello) ->#
`;
      const sheet = TmdParser.parse(input);
      const v = TMDPlaybackRenderer.render(sheet, 'Violin');
      const cello = TMDPlaybackRenderer.render(sheet, 'Cello');

      // Theme: 1(60), 3(64), 5(67), 1^(72)
      // Violin (+2): 62, 66, 69, 74
      const vPitches = v.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );
      expect(vPitches).toEqual([62, 66, 69, 74]);

      // Cello (vary Theme reverse flip):
      // Reversed: 1^(72), 5(67), 3(64), 1(60)
      // Inverted around first note of reversed (72):
      // 72 -> 72 (diff 0)
      // 67 -> 72 - (67 - 72) = 72 - (-5) = 77
      // 64 -> 72 - (-8) = 80
      // 60 -> 72 - (-12) = 84
      const celloPitches = cello.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );
      expect(celloPitches).toEqual([72, 77, 80, 84]);
    });

    it('evaluates (canon (reverse (canon Theme (Violin1 Violin2) 1)) (Flute1 Flute2) 4)', () => {
      const input = `::SCORE::
** Retrograde Canon in Canon **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 2 3 4 |
}

-> (canon
     (reverse (canon Theme (Violin1 Violin2) 1))
     (Flute1 Flute2)
     4
   ) ->#
`;
      const sheet = TmdParser.parse(input);
      const v1 = TMDPlaybackRenderer.render(sheet, 'Violin1');
      const v2 = TMDPlaybackRenderer.render(sheet, 'Violin2');
      const f1 = TMDPlaybackRenderer.render(sheet, 'Flute1');
      const f2 = TMDPlaybackRenderer.render(sheet, 'Flute2');

      // Theme: 1 2 3 4 (60, 62, 64, 65)
      // Inner canon:
      // Violin1 starts at 0, plays 1 bar (4 beats). In reversed form, it plays 4 3 2 1:
      const v1Pitches = v1.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );
      expect(v1Pitches).toEqual([65, 64, 62, 60]);

      // Flute1 is outer counterpart of Violin1, offset by 4 bars (16 beats)
      expect(f1.events[0].position).toBe(16);
      const f1Pitches = f1.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );
      expect(f1Pitches).toEqual([65, 64, 62, 60]);
    });

    it('evaluates (canon (flip (canon Theme (Violin1 Violin2) 1)) (Flute1 Flute2) 4)', () => {
      const input = `::SCORE::
** Flipped Canon in Canon **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 3 5 1^ |
}

-> (canon
     (flip (canon Theme (Violin1 Violin2) 1))
     (Flute1 Flute2)
     4
   ) ->#
`;
      const sheet = TmdParser.parse(input);
      const v1 = TMDPlaybackRenderer.render(sheet, 'Violin1');
      const f1 = TMDPlaybackRenderer.render(sheet, 'Flute1');

      // Theme: 1(60), 3(64), 5(67), 1^(72)
      // Inverted around 60: 60, 56, 53, 48
      const v1Pitches = v1.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );
      expect(v1Pitches).toEqual([60, 56, 53, 48]);

      // Flute1 starts at 16 beats with inverted pitches
      expect(f1.events[0].position).toBe(16);
      const f1Pitches = f1.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );
      expect(f1Pitches).toEqual([60, 56, 53, 48]);
    });

    it('evaluates (seq ...) chronologically chaining expressions', () => {
      const input = `::SCORE::
** Seq Combinator Test **
!= 120
?= C
<4/4>

ThemeA {
    <4*>
    1 2 3 4
}
ThemeB {
    <4*>
    5 6 7 1^
}

-> (seq (play ThemeA Piano) (play ThemeB Piano)) ->#
`;
      const sheet = TmdParser.parse(input);
      const playback = TMDPlaybackRenderer.render(sheet, 'Piano');
      expect(playback.events.length).toBe(8);
      expect(playback.events[0].position).toBe(0);
      expect(playback.events[4].position).toBe(4);
      expect(playback.duration).toBe(8);
    });

    it('evaluates flat vary multi-transform with modal switch (vary Theme -2 reverse minor)', () => {
      const input = `::SCORE::
** Flat Vary Chained Test **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 2 3 4 | 5 6 7 1^
}

-> (play (vary Theme -2 reverse minor) Viola) ->#
`;
      const sheet = TmdParser.parse(input);
      const va = TMDPlaybackRenderer.render(sheet, 'Viola');

      // In (vary Theme -2 reverse minor):
      // 1. -2 semitones: all notes shifted by -2 semitones
      // 2. reverse: notes sequence reversed
      // 3. minor: notes with degree 3, 6, 7 that are Natural are flattened.
      // After -2 semitones, C(1)->Bb(7), D(2)->C(1), E(3)->D(2), F(4)->Eb(b3), G(5)->F(4), A(6)->G(5), B(7)->A(6), C(1^)->Bb(7)
      // When minor runs, it flattens notes whose *degrees* are 3, 6, 7.
      // Therefore, the resulting pitches match [70, 68, 67, 65, 63, 62, 60, 58].
      const vaPitches = va.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );
      expect(vaPitches).toEqual([70, 68, 67, 65, 63, 62, 60, 58]);
    });

    it('evaluates (minor Theme) converting natural major 3, 6, 7 to minor degrees', () => {
      const input = `::SCORE::
** Parallel Minor Test **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 2 3 4 | 5 6 7 1^
}

-> (play (minor Theme) Piano) ->#
`;
      const sheet = TmdParser.parse(input);
      const playback = TMDPlaybackRenderer.render(sheet, 'Piano');
      const pitches = playback.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );
      // Original C major: 1(60), 2(62), 3(64), 4(65), 5(67), 6(69), 7(71), 1^(72)
      // Parallel C minor: 1(60), 2(62), 3,(63, Eb), 4(65), 5(67), 6,(68, Ab), 7,(70, Bb), 1^(72)
      expect(pitches).toEqual([60, 62, 63, 65, 67, 68, 70, 72]);
    });

    it('evaluates (major Theme) converting minor 3, 6, 7 to natural major degrees', () => {
      const input = `::SCORE::
** Parallel Major Test **
!= 120
?= C
<4/4>

ThemeMinor {
    <4*>
    1 2 3, 4 | 5 6, 7, 1^
}

-> (play (major ThemeMinor) Piano) ->#
`;
      const sheet = TmdParser.parse(input);
      const playback = TMDPlaybackRenderer.render(sheet, 'Piano');
      const pitches = playback.events.map((e) =>
        e.content.type === 'note' ? TMDMIDIGenerator.noteToMIDIPitch(e.content.note, e.state.keyOffset) : 0
      );
      // Converted to C major: 1(60), 2(62), 3(64), 4(65), 5(67), 6(69), 7(71), 1^(72)
      expect(pitches).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    });

    describe('Macro Parameter Validation & Error Handling', () => {
      const expandMacro = (macroStr: string) => {
        const input = `::SCORE::
Theme { <4*> 1 2 3 4 }
-> ${macroStr} ->#`;
        const sheet = TmdParser.parse(input);
        return TMDMacroEvaluator.expand(sheet);
      };

      it('validates play arguments', () => {
        expect(() => expandMacro("(play)")).toThrow(/Macro error.*: 'play' requires theme and instrument/);
        expect(() => expandMacro("(play Theme)")).toThrow(/Macro error.*: 'play' requires theme and instrument/);
      });

      it('validates loop arguments', () => {
        expect(() => expandMacro("(loop)")).toThrow(/Macro error.*: 'loop' requires theme and instrument/);
        expect(() => expandMacro("(loop Theme)")).toThrow(/Macro error.*: 'loop' requires theme and instrument/);
      });

      it('validates canon arguments', () => {
        expect(() => expandMacro("(canon)")).toThrow(/Macro error.*: 'canon' requires theme and instruments/);
        expect(() => expandMacro("(canon Theme)")).toThrow(/Macro error.*: 'canon' requires theme and instruments/);
      });

      it('validates transpose arguments (top-level and nested theme)', () => {
        expect(() => expandMacro("(transpose)")).toThrow(/Macro error.*: 'transpose' requires theme and semitones offset/);
        expect(() => expandMacro("(transpose Theme)")).toThrow(/Macro error.*: 'transpose' requires theme and semitones offset/);
        expect(() => expandMacro("(play (transpose) Violin)")).toThrow(/Macro error.*: 'transpose' requires theme and semitones offset/);
        expect(() => expandMacro("(play (transpose Theme) Violin)")).toThrow(/Macro error.*: 'transpose' requires theme and semitones offset/);
      });

      it('validates reverse arguments (top-level and nested theme)', () => {
        expect(() => expandMacro("(reverse)")).toThrow(/Macro error.*: 'reverse' requires a target theme/);
        expect(() => expandMacro("(play (reverse) Violin)")).toThrow(/Macro error.*: 'reverse' requires a target theme/);
      });

      it('validates flip arguments (top-level and nested theme)', () => {
        expect(() => expandMacro("(flip)")).toThrow(/Macro error.*: 'flip' requires a target theme/);
        expect(() => expandMacro("(play (flip) Violin)")).toThrow(/Macro error.*: 'flip' requires a target theme/);
      });

      it('validates minor arguments (top-level and nested theme)', () => {
        expect(() => expandMacro("(minor)")).toThrow(/Macro error.*: 'minor' requires a target theme/);
        expect(() => expandMacro("(play (minor) Violin)")).toThrow(/Macro error.*: 'minor' requires a target theme/);
      });

      it('validates major arguments (top-level and nested theme)', () => {
        expect(() => expandMacro("(major)")).toThrow(/Macro error.*: 'major' requires a target theme/);
        expect(() => expandMacro("(play (major) Violin)")).toThrow(/Macro error.*: 'major' requires a target theme/);
      });

      it('validates vary arguments (top-level and nested theme)', () => {
        expect(() => expandMacro("(vary)")).toThrow(/Macro error.*: 'vary' requires a target theme/);
        expect(() => expandMacro("(play (vary) Violin)")).toThrow(/Macro error.*: 'vary' requires a target theme/);
      });

      it('validates unknown theme reference', () => {
        expect(() => expandMacro("(play NonExistent Violin)")).toThrow(/Macro error.*: Theme 'NonExistent' not found/);
      });

      it('attaches exact line and column to TMDMacroError', () => {
        const input = `::SCORE::
Theme { <4*> 1 2 3 4 }

-> (play Theme) ->#`;
        const sheet = TmdParser.parse(input);
        try {
          TMDMacroEvaluator.expand(sheet);
          expect.unreachable('Should have thrown TMDMacroError');
        } catch (err: any) {
          expect(err).toBeInstanceOf(TMDMacroError);
          expect(err.line).toBe(4);
          expect(err.column).toBe(4);
          expect(err.message).toMatch(/Macro error at line 4, col 4: 'play' requires theme and instrument/);
        }
      });

      it('throws syntax error when opening parenthesis is not closed before ->', () => {
        const input = `::SCORE::
Theme { <4*> 1 2 3 4 }

-> (play Theme Violin ->#`;
        expect(() => TmdParser.parse(input)).toThrow(/expected \)/);
      });

      it('throws syntax error when nested opening parenthesis is not closed', () => {
        const input = `::SCORE::
Theme { <4*> 1 2 3 4 }

-> (layer (canon Theme (Violin1 Violin2) 2) ->#`;
        expect(() => TmdParser.parse(input)).toThrow(/expected \)/);
      });
    });
  });
});
