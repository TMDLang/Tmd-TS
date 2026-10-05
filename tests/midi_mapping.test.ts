import { describe, expect,it } from 'vitest';

import {
  MIDIInstrument,
  TmdMIDIGenerator,
} from '../src/index.js';

describe('MIDIInstrument and GM Mapping (TDD)', () => {
  it('resolves unknown to unknown with program 0', () => {
    const inst = MIDIInstrument.resolve('Unknown');
    expect(inst).toBe(MIDIInstrument.Unknown);
    expect(MIDIInstrument.program(inst)).toBe(0);
    expect(MIDIInstrument.isPercussion(inst)).toBe(false);
  });

  it('resolves numeric strings and prog prefixes to generic or matching program', () => {
    expect(MIDIInstrument.program(MIDIInstrument.resolve('40'))).toBe(40);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('73'))).toBe(73);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Prog:40'))).toBe(40);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('program:40'))).toBe(40);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('prg:40'))).toBe(40);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('p:40'))).toBe(40);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('prog40'))).toBe(40);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('program40'))).toBe(40);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('prg40'))).toBe(40);
  });

  it('covers all 128 General MIDI programs (0-127)', () => {
    for (let prog = 0; prog <= 127; prog++) {
      const instFromNum = MIDIInstrument.resolve(`${prog}`);
      expect(MIDIInstrument.program(instFromNum)).toBe(prog);

      const instFromProg = MIDIInstrument.resolve(`program:${prog}`);
      expect(MIDIInstrument.program(instFromProg)).toBe(prog);
    }
  });

  it('identifies percussion instruments', () => {
    const drums = ['drum', 'drums', 'groove', 'percussion', 'beat', 'drumkit', 'cajon', 'snare', 'kick', 'hihat'];
    for (const d of drums) {
      const inst = MIDIInstrument.resolve(d);
      expect(MIDIInstrument.isPercussion(inst)).toBe(true);
      expect(MIDIInstrument.program(inst)).toBe(0);
    }
  });

  it('matches all TMDSwift test instrument cases', () => {
    expect(MIDIInstrument.resolve('Chorus-1')).toBe(MIDIInstrument.Choir);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Viola'))).toBe(41);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Oboe'))).toBe(68);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Clarinet'))).toBe(71);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Harpsichord'))).toBe(6);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Timpani'))).toBe(47);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Marimba'))).toBe(12);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Harmonica'))).toBe(22);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Harp'))).toBe(46);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('FrenchHorn'))).toBe(60);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Bassoon'))).toBe(70);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Piccolo'))).toBe(72);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Sitar'))).toBe(104);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Taiko'))).toBe(116);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Gunshot'))).toBe(127);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Prog:40'))).toBe(40);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('73'))).toBe(73);
    expect(MIDIInstrument.isPercussion(MIDIInstrument.resolve('Groove'))).toBe(true);
    expect(MIDIInstrument.isPercussion(MIDIInstrument.resolve('Drums'))).toBe(true);
  });

  it('resolves detailed instrument families identical to TMDSwift priority', () => {
    // Sound effects (120-127)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('fretnoise'))).toBe(120);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('breathnoise'))).toBe(121);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('seashore'))).toBe(122);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('birdtweet'))).toBe(123);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('telephonering'))).toBe(124);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('helicopter'))).toBe(125);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('applause'))).toBe(126);

    // Percussive & Bells (112-119)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('steelpan'))).toBe(114);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('tinklebell'))).toBe(112);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('woodblock'))).toBe(115);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('agogo'))).toBe(113);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('reversecymbal'))).toBe(119);

    // Ethnic (104-111)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('shamisen'))).toBe(106);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('bagpipe'))).toBe(109);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('kalimba'))).toBe(108);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('koto'))).toBe(107);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('banjo'))).toBe(105);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('fiddle'))).toBe(110);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('shanai'))).toBe(111);

    // Synth Effects (96-103)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('soundtrack'))).toBe(97);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('crystal'))).toBe(98);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('atmosphere'))).toBe(99);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('brightness'))).toBe(100);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('goblins'))).toBe(101);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('echoes'))).toBe(102);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('scifi'))).toBe(103);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('fxrain'))).toBe(96);

    // Synth Pads (88-95)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('polysynth'))).toBe(90);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('newage'))).toBe(88);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('metallic'))).toBe(93);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('choirpad'))).toBe(91);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('bowed'))).toBe(92);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('sweep'))).toBe(95);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('halo'))).toBe(94);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('warm'))).toBe(89);

    // Synth Leads (80-87)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('square'))).toBe(80);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('sawtooth'))).toBe(81);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('calliope'))).toBe(82);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('charang'))).toBe(84);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('chiff'))).toBe(83);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('fifths'))).toBe(86);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('basslead'))).toBe(87);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('voicelead'))).toBe(85);

    // Pipe (72-79)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('shakuhachi'))).toBe(77);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('panflute'))).toBe(75);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('bottle'))).toBe(76);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('recorder'))).toBe(74);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('ocarina'))).toBe(79);

    // Reed (64-71)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('englishhorn'))).toBe(69);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('sopranosax'))).toBe(64);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('altosax'))).toBe(65);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('tenorsax'))).toBe(66);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('baritonesax'))).toBe(67);

    // Brass (56-63)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('mutedtrumpet'))).toBe(59);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('synthbrass'))).toBe(62);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('trombone'))).toBe(57);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('tuba'))).toBe(58);

    // Strings & Ensemble (40-55)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('pizzicato'))).toBe(45);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('tremolo'))).toBe(44);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('contrabass'))).toBe(43);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('synthstrings'))).toBe(50);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('slowstrings'))).toBe(49);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('orchestrahit'))).toBe(55);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('synthvoice'))).toBe(54);

    // Bass (32-39)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('fretless'))).toBe(35);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('slapbass'))).toBe(36);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('synthbass'))).toBe(38);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('acousticbass'))).toBe(32);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('pickbass'))).toBe(34);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('fingerbass'))).toBe(33);

    // Guitar (24-31)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('guitarharmonics'))).toBe(31);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('mutedguitar'))).toBe(28);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('jazzguitar'))).toBe(26);

    // Organ (16-23)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('tangoaccordion'))).toBe(23);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('percussiveorgan'))).toBe(17);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('rockorgan'))).toBe(18);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('churchorgan'))).toBe(19);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('reedorgan'))).toBe(20);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('accordion'))).toBe(21);

    // Chromatic Percussion (8-15)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('glockenspiel'))).toBe(9);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('tubularbells'))).toBe(14);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('vibes'))).toBe(11);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('musicbox'))).toBe(10);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('dulcimer'))).toBe(15);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('celesta'))).toBe(8);

    // Piano (0-7)
    expect(MIDIInstrument.program(MIDIInstrument.resolve('dx7'))).toBe(5);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('honkytonk'))).toBe(3);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('brightacoustic'))).toBe(1);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('electricgrand'))).toBe(2);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('clavinet'))).toBe(7);
  });

  it('exposes generalMidiProgram on TmdMIDIGenerator matching MIDIInstrument', () => {
    expect(TmdMIDIGenerator.generalMidiProgram('Viola')).toBe(41);
    expect(TmdMIDIGenerator.generalMidiProgram('Unknown')).toBe(0);
    expect(TmdMIDIGenerator.generalMidiProgram('prog:60')).toBe(60);
  });

  it('resolves guzheng, koto, lead, and lead-guitar aliases correctly', () => {
    expect(MIDIInstrument.program(MIDIInstrument.resolve('guzheng'))).toBe(107);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('zheng'))).toBe(107);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('Lead'))).toBe(80);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('lead_synth'))).toBe(80);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('lead-guitar'))).toBe(29);
    expect(MIDIInstrument.program(MIDIInstrument.resolve('leadguitar'))).toBe(29);
  });
});

