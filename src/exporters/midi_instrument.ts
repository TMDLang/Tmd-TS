export enum MIDIInstrument {
  // 0-7: Piano
  Piano = 'piano',
  AcousticGrandPiano = 'acousticGrandPiano',
  BrightAcousticPiano = 'brightAcousticPiano',
  ElectricGrandPiano = 'electricGrandPiano',
  HonkyTonkPiano = 'honkyTonkPiano',
  ElectricPiano = 'electricPiano',
  ElectricPiano2 = 'electricPiano2',
  Harpsichord = 'harpsichord',
  Clavinet = 'clavinet',

  // 8-15: Chromatic Percussion
  Celesta = 'celesta',
  Glockenspiel = 'glockenspiel',
  MusicBox = 'musicBox',
  Vibraphone = 'vibraphone',
  Marimba = 'marimba',
  Xylophone = 'xylophone',
  TubularBells = 'tubularBells',
  Dulcimer = 'dulcimer',

  // 16-23: Organ
  Organ = 'organ',
  DrawbarOrgan = 'drawbarOrgan',
  PercussiveOrgan = 'percussiveOrgan',
  RockOrgan = 'rockOrgan',
  ChurchOrgan = 'churchOrgan',
  ReedOrgan = 'reedOrgan',
  Accordion = 'accordion',
  Harmonica = 'harmonica',
  TangoAccordion = 'tangoAccordion',

  // 24-31: Guitar
  Guitar = 'guitar',
  NylonGuitar = 'nylonGuitar',
  SteelGuitar = 'steelGuitar',
  JazzGuitar = 'jazzGuitar',
  CleanGuitar = 'cleanGuitar',
  MutedGuitar = 'mutedGuitar',
  OverdriveGuitar = 'overdriveGuitar',
  DistortionGuitar = 'distortionGuitar',
  GuitarHarmonics = 'guitarHarmonics',

  // 32-39: Bass
  Bass = 'bass',
  AcousticBass = 'acousticBass',
  FingerBass = 'fingerBass',
  PickBass = 'pickBass',
  FretlessBass = 'fretlessBass',
  SlapBass1 = 'slapBass1',
  SlapBass2 = 'slapBass2',
  SynthBass1 = 'synthBass1',
  SynthBass2 = 'synthBass2',

  // 40-47: Solo Strings
  Violin = 'violin',
  Viola = 'viola',
  Cello = 'cello',
  Contrabass = 'contrabass',
  TremoloStrings = 'tremoloStrings',
  PizzicatoStrings = 'pizzicatoStrings',
  OrchestralHarp = 'orchestralHarp',
  Timpani = 'timpani',

  // 48-55: Ensemble
  Strings = 'strings',
  StringEnsemble1 = 'stringEnsemble1',
  StringEnsemble2 = 'stringEnsemble2',
  SynthStrings1 = 'synthStrings1',
  SynthStrings2 = 'synthStrings2',
  Choir = 'choir',
  ChoirAahs = 'choirAahs',
  VoiceOohs = 'voiceOohs',
  SynthVoice = 'synthVoice',
  OrchestraHit = 'orchestraHit',

  // 56-63: Brass
  Trumpet = 'trumpet',
  Trombone = 'trombone',
  Tuba = 'tuba',
  MutedTrumpet = 'mutedTrumpet',
  FrenchHorn = 'frenchHorn',
  Brass = 'brass',
  BrassSection = 'brassSection',
  SynthBrass1 = 'synthBrass1',
  SynthBrass2 = 'synthBrass2',

  // 64-71: Reed
  SopranoSax = 'sopranoSax',
  AltoSax = 'altoSax',
  Sax = 'sax',
  TenorSax = 'tenorSax',
  BaritoneSax = 'baritoneSax',
  Oboe = 'oboe',
  EnglishHorn = 'englishHorn',
  Bassoon = 'bassoon',
  Clarinet = 'clarinet',

  // 72-79: Pipe
  Piccolo = 'piccolo',
  Flute = 'flute',
  Recorder = 'recorder',
  PanFlute = 'panFlute',
  BlownBottle = 'blownBottle',
  Shakuhachi = 'shakuhachi',
  Whistle = 'whistle',
  Ocarina = 'ocarina',

  // 80-87: Synth Lead
  LeadSquare = 'leadSquare',
  LeadSawtooth = 'leadSawtooth',
  LeadCalliope = 'leadCalliope',
  LeadChiff = 'leadChiff',
  LeadCharang = 'leadCharang',
  LeadVoice = 'leadVoice',
  LeadFifths = 'leadFifths',
  LeadBassAndLead = 'leadBassAndLead',

  // 88-95: Synth Pad
  Pad = 'pad',
  PadNewAge = 'padNewAge',
  PadWarm = 'padWarm',
  PadPolysynth = 'padPolysynth',
  PadChoir = 'padChoir',
  PadBowed = 'padBowed',
  PadMetallic = 'padMetallic',
  PadHalo = 'padHalo',
  PadSweep = 'padSweep',

  // 96-103: Synth Effects
  FxRain = 'fxRain',
  FxSoundtrack = 'fxSoundtrack',
  FxCrystal = 'fxCrystal',
  FxAtmosphere = 'fxAtmosphere',
  FxBrightness = 'fxBrightness',
  FxGoblins = 'fxGoblins',
  FxEchoes = 'fxEchoes',
  FxSciFi = 'fxSciFi',

  // 104-111: Ethnic
  Sitar = 'sitar',
  Banjo = 'banjo',
  Shamisen = 'shamisen',
  Koto = 'koto',
  Kalimba = 'kalimba',
  Bagpipe = 'bagpipe',
  Fiddle = 'fiddle',
  Shanai = 'shanai',

  // 112-119: Percussive
  TinkleBell = 'tinkleBell',
  Agogo = 'agogo',
  SteelDrums = 'steelDrums',
  Woodblock = 'woodblock',
  TaikoDrum = 'taikoDrum',
  MelodicTom = 'melodicTom',
  SynthDrum = 'synthDrum',
  ReverseCymbal = 'reverseCymbal',

  // 120-127: Sound Effects
  GuitarFretNoise = 'guitarFretNoise',
  BreathNoise = 'breathNoise',
  Seashore = 'seashore',
  BirdTweet = 'birdTweet',
  TelephoneRing = 'telephoneRing',
  Helicopter = 'helicopter',
  Applause = 'applause',
  Gunshot = 'gunshot',

  // Special
  Percussion = 'percussion',
  Unknown = 'unknown',
}

export type MIDIInstrumentValue =
  | MIDIInstrument
  | { genericProgram: number };

const GM_PROGRAMS: Record<number, MIDIInstrument> = {
  0: MIDIInstrument.AcousticGrandPiano,
  1: MIDIInstrument.BrightAcousticPiano,
  2: MIDIInstrument.ElectricGrandPiano,
  3: MIDIInstrument.HonkyTonkPiano,
  4: MIDIInstrument.ElectricPiano,
  5: MIDIInstrument.ElectricPiano2,
  6: MIDIInstrument.Harpsichord,
  7: MIDIInstrument.Clavinet,
  8: MIDIInstrument.Celesta,
  9: MIDIInstrument.Glockenspiel,
  10: MIDIInstrument.MusicBox,
  11: MIDIInstrument.Vibraphone,
  12: MIDIInstrument.Marimba,
  13: MIDIInstrument.Xylophone,
  14: MIDIInstrument.TubularBells,
  15: MIDIInstrument.Dulcimer,
  16: MIDIInstrument.DrawbarOrgan,
  17: MIDIInstrument.PercussiveOrgan,
  18: MIDIInstrument.RockOrgan,
  19: MIDIInstrument.ChurchOrgan,
  20: MIDIInstrument.ReedOrgan,
  21: MIDIInstrument.Accordion,
  22: MIDIInstrument.Harmonica,
  23: MIDIInstrument.TangoAccordion,
  24: MIDIInstrument.NylonGuitar,
  25: MIDIInstrument.SteelGuitar,
  26: MIDIInstrument.JazzGuitar,
  27: MIDIInstrument.CleanGuitar,
  28: MIDIInstrument.MutedGuitar,
  29: MIDIInstrument.OverdriveGuitar,
  30: MIDIInstrument.DistortionGuitar,
  31: MIDIInstrument.GuitarHarmonics,
  32: MIDIInstrument.AcousticBass,
  33: MIDIInstrument.FingerBass,
  34: MIDIInstrument.PickBass,
  35: MIDIInstrument.FretlessBass,
  36: MIDIInstrument.SlapBass1,
  37: MIDIInstrument.SlapBass2,
  38: MIDIInstrument.SynthBass1,
  39: MIDIInstrument.SynthBass2,
  40: MIDIInstrument.Violin,
  41: MIDIInstrument.Viola,
  42: MIDIInstrument.Cello,
  43: MIDIInstrument.Contrabass,
  44: MIDIInstrument.TremoloStrings,
  45: MIDIInstrument.PizzicatoStrings,
  46: MIDIInstrument.OrchestralHarp,
  47: MIDIInstrument.Timpani,
  48: MIDIInstrument.StringEnsemble1,
  49: MIDIInstrument.StringEnsemble2,
  50: MIDIInstrument.SynthStrings1,
  51: MIDIInstrument.SynthStrings2,
  52: MIDIInstrument.ChoirAahs,
  53: MIDIInstrument.VoiceOohs,
  54: MIDIInstrument.SynthVoice,
  55: MIDIInstrument.OrchestraHit,
  56: MIDIInstrument.Trumpet,
  57: MIDIInstrument.Trombone,
  58: MIDIInstrument.Tuba,
  59: MIDIInstrument.MutedTrumpet,
  60: MIDIInstrument.FrenchHorn,
  61: MIDIInstrument.BrassSection,
  62: MIDIInstrument.SynthBrass1,
  63: MIDIInstrument.SynthBrass2,
  64: MIDIInstrument.SopranoSax,
  65: MIDIInstrument.AltoSax,
  66: MIDIInstrument.TenorSax,
  67: MIDIInstrument.BaritoneSax,
  68: MIDIInstrument.Oboe,
  69: MIDIInstrument.EnglishHorn,
  70: MIDIInstrument.Bassoon,
  71: MIDIInstrument.Clarinet,
  72: MIDIInstrument.Piccolo,
  73: MIDIInstrument.Flute,
  74: MIDIInstrument.Recorder,
  75: MIDIInstrument.PanFlute,
  76: MIDIInstrument.BlownBottle,
  77: MIDIInstrument.Shakuhachi,
  78: MIDIInstrument.Whistle,
  79: MIDIInstrument.Ocarina,
  80: MIDIInstrument.LeadSquare,
  81: MIDIInstrument.LeadSawtooth,
  82: MIDIInstrument.LeadCalliope,
  83: MIDIInstrument.LeadChiff,
  84: MIDIInstrument.LeadCharang,
  85: MIDIInstrument.LeadVoice,
  86: MIDIInstrument.LeadFifths,
  87: MIDIInstrument.LeadBassAndLead,
  88: MIDIInstrument.PadNewAge,
  89: MIDIInstrument.PadWarm,
  90: MIDIInstrument.PadPolysynth,
  91: MIDIInstrument.PadChoir,
  92: MIDIInstrument.PadBowed,
  93: MIDIInstrument.PadMetallic,
  94: MIDIInstrument.PadHalo,
  95: MIDIInstrument.PadSweep,
  96: MIDIInstrument.FxRain,
  97: MIDIInstrument.FxSoundtrack,
  98: MIDIInstrument.FxCrystal,
  99: MIDIInstrument.FxAtmosphere,
  100: MIDIInstrument.FxBrightness,
  101: MIDIInstrument.FxGoblins,
  102: MIDIInstrument.FxEchoes,
  103: MIDIInstrument.FxSciFi,
  104: MIDIInstrument.Sitar,
  105: MIDIInstrument.Banjo,
  106: MIDIInstrument.Shamisen,
  107: MIDIInstrument.Koto,
  108: MIDIInstrument.Kalimba,
  109: MIDIInstrument.Bagpipe,
  110: MIDIInstrument.Fiddle,
  111: MIDIInstrument.Shanai,
  112: MIDIInstrument.TinkleBell,
  113: MIDIInstrument.Agogo,
  114: MIDIInstrument.SteelDrums,
  115: MIDIInstrument.Woodblock,
  116: MIDIInstrument.TaikoDrum,
  117: MIDIInstrument.MelodicTom,
  118: MIDIInstrument.SynthDrum,
  119: MIDIInstrument.ReverseCymbal,
  120: MIDIInstrument.GuitarFretNoise,
  121: MIDIInstrument.BreathNoise,
  122: MIDIInstrument.Seashore,
  123: MIDIInstrument.BirdTweet,
  124: MIDIInstrument.TelephoneRing,
  125: MIDIInstrument.Helicopter,
  126: MIDIInstrument.Applause,
  127: MIDIInstrument.Gunshot,
};

export namespace MIDIInstrument {
  export function resolve(name: string): MIDIInstrumentValue {
    const trimmed = name.trim().toLowerCase();

    // 1. Direct number check (e.g. "40", "prog:40", "program:40", "prg40", "p40")
    const directProg = parseInt(trimmed, 10);
    if (!isNaN(directProg) && String(directProg) === trimmed && directProg >= 0 && directProg <= 127) {
      return GM_PROGRAMS[directProg] ?? { genericProgram: directProg };
    }

    for (const prefix of ['prog:', 'program:', 'prg:', 'p:', 'prog', 'program', 'prg']) {
      if (trimmed.startsWith(prefix)) {
        const suffix = trimmed.substring(prefix.length).trim();
        const prog = parseInt(suffix, 10);
        if (!isNaN(prog) && String(prog) === suffix && prog >= 0 && prog <= 127) {
          return GM_PROGRAMS[prog] ?? { genericProgram: prog };
        }
      }
    }

    // 2. Percussion channel check
    const drumAliases = ['drum', 'drums', 'groove', 'percussion', 'beat', 'drumkit', 'kit', 'cajon', 'snare', 'kick', 'hihat', '爵士鼓', '打擊', '鼓'];
    if (
      drumAliases.some(d => trimmed.includes(d)) ||
      (trimmed.includes('perc') && !trimmed.includes('percussive'))
    ) {
      return MIDIInstrument.Percussion;
    }

    // 3. Priority ordered aliases table (specific words must come before generic substrings)
    const aliases: [MIDIInstrument, string[]][] = [
      // Sound Effects (120-127)
      [MIDIInstrument.GuitarFretNoise, ['fretnoise', 'guitar_fret', 'fxgret']],
      [MIDIInstrument.BreathNoise, ['breathnoise', 'breath']],
      [MIDIInstrument.Seashore, ['seashore', 'ocean']],
      [MIDIInstrument.BirdTweet, ['birdtweet', 'bird']],
      [MIDIInstrument.TelephoneRing, ['telephonering', 'telephone', 'phone']],
      [MIDIInstrument.Helicopter, ['helicopter', 'chopper']],
      [MIDIInstrument.Applause, ['applause', 'clapping', 'cheer']],
      [MIDIInstrument.Gunshot, ['gunshot', 'gun']],

      // Percussive & Bells (112-119)
      [MIDIInstrument.SteelDrums, ['steeldrum', 'steelpan']],
      [MIDIInstrument.TinkleBell, ['tinklebell', 'tinkle']],
      [MIDIInstrument.TaikoDrum, ['taiko']],
      [MIDIInstrument.MelodicTom, ['melodictom', 'tom']],
      [MIDIInstrument.SynthDrum, ['synthdrum']],
      [MIDIInstrument.ReverseCymbal, ['reversecymbal', 'cymbal']],
      [MIDIInstrument.Woodblock, ['woodblock']],
      [MIDIInstrument.Agogo, ['agogo']],

      // Ethnic (104-111)
      [MIDIInstrument.Shamisen, ['shamisen']],
      [MIDIInstrument.Bagpipe, ['bagpipe', 'bagpipes']],
      [MIDIInstrument.Kalimba, ['kalimba', 'mbira']],
      [MIDIInstrument.Shanai, ['shanai', 'shehnai', 'suona', '嗩吶']],
      [MIDIInstrument.Sitar, ['sitar']],
      [MIDIInstrument.Banjo, ['banjo']],
      [MIDIInstrument.Koto, ['guzheng', 'zheng', 'koto', '古箏', '琵琶']],
      [MIDIInstrument.Fiddle, ['fiddle', 'erhu', '二胡']],

      // Synth Effects (96-103)
      [MIDIInstrument.FxSoundtrack, ['soundtrack']],
      [MIDIInstrument.FxAtmosphere, ['atmosphere']],
      [MIDIInstrument.FxBrightness, ['brightness']],
      [MIDIInstrument.FxGoblins, ['goblins']],
      [MIDIInstrument.FxCrystal, ['crystal']],
      [MIDIInstrument.FxEchoes, ['echoes']],
      [MIDIInstrument.FxSciFi, ['scifi', 'sci-fi']],
      [MIDIInstrument.FxRain, ['fxrain', 'rain']],

      // Synth Pads (88-95)
      [MIDIInstrument.PadPolysynth, ['polysynth']],
      [MIDIInstrument.PadNewAge, ['newage']],
      [MIDIInstrument.PadMetallic, ['metallic']],
      [MIDIInstrument.PadChoir, ['choirpad']],
      [MIDIInstrument.PadBowed, ['bowed']],
      [MIDIInstrument.PadSweep, ['sweep']],
      [MIDIInstrument.PadHalo, ['halo']],
      [MIDIInstrument.PadWarm, ['warm', 'pad']],

      // Guitar (24-31) - Prioritize lead guitar and compound guitar names before generic synth lead
      [MIDIInstrument.GuitarHarmonics, ['guitarharmonics', 'harmonics']],
      [MIDIInstrument.DistortionGuitar, ['distortion', 'dist', 'fuzz', 'heavy', 'metal']],
      [MIDIInstrument.OverdriveGuitar, ['overdrive', 'od', 'rockguitar', 'leadguitar', 'lead-guitar', 'electricguitar', 'electric-guitar', '電吉他']],
      [MIDIInstrument.CleanGuitar, ['cleanguitar', 'electricclean']],
      [MIDIInstrument.MutedGuitar, ['mutedguitar']],
      [MIDIInstrument.JazzGuitar, ['jazzguitar']],
      [MIDIInstrument.NylonGuitar, ['nylon', 'classicalguitar', 'ukulele', 'uke']],
      [MIDIInstrument.SteelGuitar, ['steelguitar', 'steel', 'acousticguitar', 'guitar', 'gtr', 'mandolin', '木吉他', '吉他']],

      // Synth Leads (80-87)
      [MIDIInstrument.LeadBassAndLead, ['basslead']],
      [MIDIInstrument.LeadVoice, ['voicelead']],
      [MIDIInstrument.LeadSawtooth, ['sawtooth', 'sawlead', 'saw']],
      [MIDIInstrument.LeadCalliope, ['calliope']],
      [MIDIInstrument.LeadCharang, ['charang']],
      [MIDIInstrument.LeadChiff, ['chiff']],
      [MIDIInstrument.LeadFifths, ['fifths', 'fifth']],
      [MIDIInstrument.LeadSquare, ['square', 'leadsynth', 'lead_synth', 'lead']],

      // Pipe (72-79)
      [MIDIInstrument.Shakuhachi, ['shakuhachi', 'xiao', '簫']],
      [MIDIInstrument.PanFlute, ['panflute']],
      [MIDIInstrument.BlownBottle, ['bottle']],
      [MIDIInstrument.Recorder, ['recorder']],
      [MIDIInstrument.Ocarina, ['ocarina']],
      [MIDIInstrument.Piccolo, ['piccolo', '短笛']],
      [MIDIInstrument.Flute, ['flute', 'pipe', 'dizi', '長笛', '竹笛']],
      [MIDIInstrument.Whistle, ['whistle']],

      // Reed (64-71) - Put compound names before sax/horn/bass
      [MIDIInstrument.EnglishHorn, ['englishhorn', 'coranglais']],
      [MIDIInstrument.FrenchHorn, ['frenchhorn', '法國號']],
      [MIDIInstrument.Bassoon, ['bassoon', 'fagott', '低音管']],
      [MIDIInstrument.Clarinet, ['clarinet', '單簧管', '豎笛']],
      [MIDIInstrument.Oboe, ['oboe', '雙簧管']],
      [MIDIInstrument.BaritoneSax, ['baritonesax', 'barisax']],
      [MIDIInstrument.SopranoSax, ['sopranosax']],
      [MIDIInstrument.TenorSax, ['tenorsax']],
      [MIDIInstrument.AltoSax, ['altosax']],
      [MIDIInstrument.Sax, ['sax', 'saxophone', '薩克斯風']],

      // Brass (56-63)
      [MIDIInstrument.MutedTrumpet, ['mutedtrumpet']],
      [MIDIInstrument.SynthBrass1, ['synthbrass']],
      [MIDIInstrument.Trumpet, ['trumpet', 'cornet', 'flugelhorn', '小號']],
      [MIDIInstrument.Trombone, ['trombone', 'euphonium', '長號']],
      [MIDIInstrument.Tuba, ['tuba', '低音號']],
      [MIDIInstrument.FrenchHorn, ['horn']],
      [MIDIInstrument.Brass, ['brass', '銅管']],

      // Ensemble & Choir (48-55)
      [MIDIInstrument.OrchestraHit, ['orchestrahit', 'orchhit', 'orchestra', 'hit']],
      [MIDIInstrument.SynthVoice, ['synthvoice']],
      [MIDIInstrument.VoiceOohs, ['voiceooh', 'oohs', 'voice']],
      [MIDIInstrument.Choir, ['choiraah', 'aahs', 'choir', 'vocal', 'singer', 'vox', 'chorus', 'miku', 'utau', 'teto', 'sing', 'soprano', 'alto', 'tenor', 'baritone', '主唱', '人聲', '合唱']],
      [MIDIInstrument.SynthStrings1, ['synthstrings']],
      [MIDIInstrument.StringEnsemble2, ['slowstrings']],
      [MIDIInstrument.StringEnsemble1, ['string', 'strings', 'str', '弦樂']],

      // Solo Strings (40-47)
      [MIDIInstrument.PizzicatoStrings, ['pizzicato', 'pizz', 'pluck']],
      [MIDIInstrument.TremoloStrings, ['tremolo']],
      [MIDIInstrument.Harpsichord, ['harpsichord', 'cembalo']],
      [MIDIInstrument.OrchestralHarp, ['harp']],
      [MIDIInstrument.Timpani, ['timpani', 'kettledrum']],
      [MIDIInstrument.Contrabass, ['contrabass', 'doublebass', 'uprightbass', 'upright', 'stringbass', '低音提琴']],
      [MIDIInstrument.Cello, ['cello', 'violoncello', '大提琴']],
      [MIDIInstrument.Viola, ['viola', '中提琴']],
      [MIDIInstrument.Violin, ['violin', '小提琴']],

      // Bass (32-39)
      [MIDIInstrument.FretlessBass, ['fretless']],
      [MIDIInstrument.SlapBass1, ['slapbass', 'slap']],
      [MIDIInstrument.SynthBass1, ['synthbass']],
      [MIDIInstrument.AcousticBass, ['acousticbass']],
      [MIDIInstrument.PickBass, ['pickbass']],
      [MIDIInstrument.FingerBass, ['fingerbass', 'electricbass']],
      [MIDIInstrument.Bass, ['bass', 'sub', '貝斯']],

      // Organ (16-23)
      [MIDIInstrument.TangoAccordion, ['tangoaccordion', 'bandoneon', 'tango']],
      [MIDIInstrument.PercussiveOrgan, ['percussiveorgan', 'percussive']],
      [MIDIInstrument.RockOrgan, ['rockorgan']],
      [MIDIInstrument.ChurchOrgan, ['churchorgan', 'church']],
      [MIDIInstrument.ReedOrgan, ['reedorgan', 'reed', 'sheng', '笙']],
      [MIDIInstrument.Accordion, ['accordion']],
      [MIDIInstrument.Harmonica, ['harmonica']],
      [MIDIInstrument.Organ, ['organ', 'drawbar', 'b3', 'hammond']],

      // Chromatic Percussion (8-15)
      [MIDIInstrument.Glockenspiel, ['glockenspiel', 'glock']],
      [MIDIInstrument.TubularBells, ['tubularbell', 'tubular', 'chimes', 'bell']],
      [MIDIInstrument.Vibraphone, ['vibraphone', 'vibes', 'vibe']],
      [MIDIInstrument.MusicBox, ['musicbox']],
      [MIDIInstrument.Xylophone, ['xylophone']],
      [MIDIInstrument.Marimba, ['marimba']],
      [MIDIInstrument.Dulcimer, ['dulcimer', 'santur']],
      [MIDIInstrument.Celesta, ['celesta']],
      [MIDIInstrument.Koto, ['pipa', 'lute']],

      // Piano & Generic Role Fallbacks (0-7)
      [MIDIInstrument.ElectricPiano2, ['dx7', 'fmep']],
      [MIDIInstrument.ElectricPiano, ['electricpiano', 'epiano', 'ep', 'rhodes', 'wurlitzer']],
      [MIDIInstrument.HonkyTonkPiano, ['honkytonk', 'honky']],
      [MIDIInstrument.BrightAcousticPiano, ['brightpiano', 'brightacoustic', 'bright']],
      [MIDIInstrument.ElectricGrandPiano, ['electricgrand']],
      [MIDIInstrument.Clavinet, ['clavinet', 'clavi', 'clav']],
      [MIDIInstrument.LeadSquare, ['synth', 'syn', 'arp', 'arpeggio', 'melody', 'motif', '主旋律']],
      [MIDIInstrument.Piano, ['piano', 'pno', 'keyboard', 'keys', 'grand', 'chord', 'chords', 'harmony', 'accompaniment', 'accomp', '鋼琴', '和弦']],
    ];

    for (const [inst, terms] of aliases) {
      if (terms.some(t => trimmed.includes(t))) {
        return inst;
      }
    }
    return MIDIInstrument.Unknown;
  }

  export function isRecognized(name: string): boolean {
    return resolve(name) !== MIDIInstrument.Unknown;
  }

  export function program(instrument: MIDIInstrumentValue): number {
    if (typeof instrument === 'object' && instrument !== null && 'genericProgram' in instrument) {
      return Math.min(127, Math.max(0, instrument.genericProgram));
    }
    switch (instrument) {
      // 0-7: Piano
      case MIDIInstrument.Piano:
      case MIDIInstrument.AcousticGrandPiano:
      case MIDIInstrument.Unknown:
        return 0;
      case MIDIInstrument.BrightAcousticPiano:
        return 1;
      case MIDIInstrument.ElectricGrandPiano:
        return 2;
      case MIDIInstrument.HonkyTonkPiano:
        return 3;
      case MIDIInstrument.ElectricPiano:
        return 4;
      case MIDIInstrument.ElectricPiano2:
        return 5;
      case MIDIInstrument.Harpsichord:
        return 6;
      case MIDIInstrument.Clavinet:
        return 7;

      // 8-15: Chromatic Percussion
      case MIDIInstrument.Celesta:
        return 8;
      case MIDIInstrument.Glockenspiel:
        return 9;
      case MIDIInstrument.MusicBox:
        return 10;
      case MIDIInstrument.Vibraphone:
        return 11;
      case MIDIInstrument.Marimba:
        return 12;
      case MIDIInstrument.Xylophone:
        return 13;
      case MIDIInstrument.TubularBells:
        return 14;
      case MIDIInstrument.Dulcimer:
        return 15;

      // 16-23: Organ
      case MIDIInstrument.Organ:
      case MIDIInstrument.DrawbarOrgan:
        return 16;
      case MIDIInstrument.PercussiveOrgan:
        return 17;
      case MIDIInstrument.RockOrgan:
        return 18;
      case MIDIInstrument.ChurchOrgan:
        return 19;
      case MIDIInstrument.ReedOrgan:
        return 20;
      case MIDIInstrument.Accordion:
        return 21;
      case MIDIInstrument.Harmonica:
        return 22;
      case MIDIInstrument.TangoAccordion:
        return 23;

      // 24-31: Guitar
      case MIDIInstrument.NylonGuitar:
        return 24;
      case MIDIInstrument.Guitar:
      case MIDIInstrument.SteelGuitar:
        return 25;
      case MIDIInstrument.JazzGuitar:
        return 26;
      case MIDIInstrument.CleanGuitar:
        return 27;
      case MIDIInstrument.MutedGuitar:
        return 28;
      case MIDIInstrument.OverdriveGuitar:
        return 29;
      case MIDIInstrument.DistortionGuitar:
        return 30;
      case MIDIInstrument.GuitarHarmonics:
        return 31;

      // 32-39: Bass
      case MIDIInstrument.AcousticBass:
        return 32;
      case MIDIInstrument.Bass:
      case MIDIInstrument.FingerBass:
        return 33;
      case MIDIInstrument.PickBass:
        return 34;
      case MIDIInstrument.FretlessBass:
        return 35;
      case MIDIInstrument.SlapBass1:
        return 36;
      case MIDIInstrument.SlapBass2:
        return 37;
      case MIDIInstrument.SynthBass1:
        return 38;
      case MIDIInstrument.SynthBass2:
        return 39;

      // 40-47: Strings
      case MIDIInstrument.Violin:
        return 40;
      case MIDIInstrument.Viola:
        return 41;
      case MIDIInstrument.Cello:
        return 42;
      case MIDIInstrument.Contrabass:
        return 43;
      case MIDIInstrument.TremoloStrings:
        return 44;
      case MIDIInstrument.PizzicatoStrings:
        return 45;
      case MIDIInstrument.OrchestralHarp:
        return 46;
      case MIDIInstrument.Timpani:
        return 47;

      // 48-55: Ensemble
      case MIDIInstrument.Strings:
      case MIDIInstrument.StringEnsemble1:
        return 48;
      case MIDIInstrument.StringEnsemble2:
        return 49;
      case MIDIInstrument.SynthStrings1:
        return 50;
      case MIDIInstrument.SynthStrings2:
        return 51;
      case MIDIInstrument.Choir:
      case MIDIInstrument.ChoirAahs:
        return 52;
      case MIDIInstrument.VoiceOohs:
        return 53;
      case MIDIInstrument.SynthVoice:
        return 54;
      case MIDIInstrument.OrchestraHit:
        return 55;

      // 56-63: Brass
      case MIDIInstrument.Trumpet:
        return 56;
      case MIDIInstrument.Trombone:
        return 57;
      case MIDIInstrument.Tuba:
        return 58;
      case MIDIInstrument.MutedTrumpet:
        return 59;
      case MIDIInstrument.FrenchHorn:
        return 60;
      case MIDIInstrument.Brass:
      case MIDIInstrument.BrassSection:
        return 61;
      case MIDIInstrument.SynthBrass1:
        return 62;
      case MIDIInstrument.SynthBrass2:
        return 63;

      // 64-71: Reed
      case MIDIInstrument.SopranoSax:
        return 64;
      case MIDIInstrument.Sax:
      case MIDIInstrument.AltoSax:
        return 65;
      case MIDIInstrument.TenorSax:
        return 66;
      case MIDIInstrument.BaritoneSax:
        return 67;
      case MIDIInstrument.Oboe:
        return 68;
      case MIDIInstrument.EnglishHorn:
        return 69;
      case MIDIInstrument.Bassoon:
        return 70;
      case MIDIInstrument.Clarinet:
        return 71;

      // 72-79: Pipe
      case MIDIInstrument.Piccolo:
        return 72;
      case MIDIInstrument.Flute:
        return 73;
      case MIDIInstrument.Recorder:
        return 74;
      case MIDIInstrument.PanFlute:
        return 75;
      case MIDIInstrument.BlownBottle:
        return 76;
      case MIDIInstrument.Shakuhachi:
        return 77;
      case MIDIInstrument.Whistle:
        return 78;
      case MIDIInstrument.Ocarina:
        return 79;

      // 80-87: Synth Lead
      case MIDIInstrument.LeadSquare:
        return 80;
      case MIDIInstrument.LeadSawtooth:
        return 81;
      case MIDIInstrument.LeadCalliope:
        return 82;
      case MIDIInstrument.LeadChiff:
        return 83;
      case MIDIInstrument.LeadCharang:
        return 84;
      case MIDIInstrument.LeadVoice:
        return 85;
      case MIDIInstrument.LeadFifths:
        return 86;
      case MIDIInstrument.LeadBassAndLead:
        return 87;

      // 88-95: Synth Pad
      case MIDIInstrument.PadNewAge:
        return 88;
      case MIDIInstrument.Pad:
      case MIDIInstrument.PadWarm:
        return 89;
      case MIDIInstrument.PadPolysynth:
        return 90;
      case MIDIInstrument.PadChoir:
        return 91;
      case MIDIInstrument.PadBowed:
        return 92;
      case MIDIInstrument.PadMetallic:
        return 93;
      case MIDIInstrument.PadHalo:
        return 94;
      case MIDIInstrument.PadSweep:
        return 95;

      // 96-103: Synth Effects
      case MIDIInstrument.FxRain:
        return 96;
      case MIDIInstrument.FxSoundtrack:
        return 97;
      case MIDIInstrument.FxCrystal:
        return 98;
      case MIDIInstrument.FxAtmosphere:
        return 99;
      case MIDIInstrument.FxBrightness:
        return 100;
      case MIDIInstrument.FxGoblins:
        return 101;
      case MIDIInstrument.FxEchoes:
        return 102;
      case MIDIInstrument.FxSciFi:
        return 103;

      // 104-111: Ethnic
      case MIDIInstrument.Sitar:
        return 104;
      case MIDIInstrument.Banjo:
        return 105;
      case MIDIInstrument.Shamisen:
        return 106;
      case MIDIInstrument.Koto:
        return 107;
      case MIDIInstrument.Kalimba:
        return 108;
      case MIDIInstrument.Bagpipe:
        return 109;
      case MIDIInstrument.Fiddle:
        return 110;
      case MIDIInstrument.Shanai:
        return 111;

      // 112-119: Percussive
      case MIDIInstrument.TinkleBell:
        return 112;
      case MIDIInstrument.Agogo:
        return 113;
      case MIDIInstrument.SteelDrums:
        return 114;
      case MIDIInstrument.Woodblock:
        return 115;
      case MIDIInstrument.TaikoDrum:
        return 116;
      case MIDIInstrument.MelodicTom:
        return 117;
      case MIDIInstrument.SynthDrum:
        return 118;
      case MIDIInstrument.ReverseCymbal:
        return 119;

      // 120-127: Sound Effects
      case MIDIInstrument.GuitarFretNoise:
        return 120;
      case MIDIInstrument.BreathNoise:
        return 121;
      case MIDIInstrument.Seashore:
        return 122;
      case MIDIInstrument.BirdTweet:
        return 123;
      case MIDIInstrument.TelephoneRing:
        return 124;
      case MIDIInstrument.Helicopter:
        return 125;
      case MIDIInstrument.Applause:
        return 126;
      case MIDIInstrument.Gunshot:
        return 127;

      // Special
      case MIDIInstrument.Percussion:
        return 0;
    }
  }

  export function isPercussion(instrument: MIDIInstrumentValue): boolean {
    return instrument === MIDIInstrument.Percussion;
  }

  export type StereoPanPosition = 'left' | 'center' | 'right';

  export function stereoPanHeuristic(instrumentName: string): StereoPanPosition {
    const lower = instrumentName.toLowerCase();
    if (lower.includes('left') || lower.includes('-l')) {
      return 'left';
    }
    if (lower.includes('right') || lower.includes('-r')) {
      return 'right';
    }
    return 'center';
  }

  export function allocateChannel(
    instrument: MIDIInstrumentValue,
    state: { nextMelodicChannel: number; programToMelodyChannel?: Map<number, number> }
  ): number {
    if (isPercussion(instrument)) {
      return 9;
    }
    if (state.programToMelodyChannel) {
      const prog = program(instrument);
      const existing = state.programToMelodyChannel.get(prog);
      if (existing !== undefined) {
        return existing;
      }
      if (state.nextMelodicChannel === 9) {
        state.nextMelodicChannel += 1;
      }
      const channel = state.nextMelodicChannel % 16;
      state.programToMelodyChannel.set(prog, channel);
      state.nextMelodicChannel += 1;
      return channel;
    }
    if (state.nextMelodicChannel === 9) {
      state.nextMelodicChannel += 1;
    }
    const channel = state.nextMelodicChannel % 16;
    state.nextMelodicChannel = (state.nextMelodicChannel + 1) % 16;
    return channel;
  }
}
