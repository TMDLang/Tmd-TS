import { TmdOutlineGenerator } from "../presentation/index.js";
import { TmdParser } from "../syntax/index.js";
import {
  TmdLSPCompletionItem,
  TmdLSPCompletionItemKind,
  TmdLSPPosition,
} from "./types.js";

export class TmdLSPCompletionEngine {
  public static readonly standardInstruments: string[] = [
    // Keyboard & Piano
    "Piano", "AcousticGrandPiano", "BrightAcousticPiano", "ElectricGrandPiano", "HonkyTonkPiano", "ElectricPiano", "Harpsichord", "Clavinet",
    // Strings
    "Violin", "Viola", "Cello", "Contrabass", "Strings", "StringEnsemble", "PizzicatoStrings", "OrchestralHarp",
    // Guitars & Bass
    "AcousticGuitar", "NylonGuitar", "SteelGuitar", "CleanGuitar", "OverdrivenGuitar", "DistortionGuitar",
    "Bass", "AcousticBass", "ElectricBass", "ElectricBassFinger", "ElectricBassPick", "SlapBass", "SynthBass",
    // Brass & Woodwinds
    "Trumpet", "Trombone", "Tuba", "MutedTrumpet", "FrenchHorn", "BrassSection",
    "SopranoSax", "AltoSax", "TenorSax", "BaritoneSax", "Oboe", "EnglishHorn", "Bassoon", "Clarinet", "Piccolo", "Flute", "PanFlute",
    // Voices
    "Vocal", "Choir", "VoiceOohs", "SynthVoice",
    // Percussion
    "Drums", "Percussion", "Timpani", "SteelDrums", "TaikoDrum", "MelodicTom"
  ];

  public static readonly macroSnippets: Array<{ label: string; insertText: string; detail: string }> = [
    { label: "canon", insertText: "(canon ${1:Theme} (${2:Violin1 Violin2}) ${3:2})", detail: "Polyphonic Canon: (canon <theme> (<instruments...>) <offset_bars>)" },
    { label: "loop", insertText: "(loop ${1:Theme} ${2:Cello} ${3:4})", detail: "Sequential Loop: (loop <theme> <assignment> <times>) or (loop <section> <times>)" },
    { label: "layer", insertText: "(layer\n\t${1:expr1}\n\t${2:expr2})", detail: "Parallel Concurrency: (layer <expr1> <expr2> ...)" },
    { label: "seq", insertText: "(seq\n\t${1:expr1}\n\t${2:expr2})", detail: "Sequential Chain: (seq <expr1> <expr2> ...)" },
    { label: "reverse", insertText: "(reverse ${1:Theme})", detail: "Retrograde Inversion: (reverse <theme|expr>)" },
    { label: "flip", insertText: "(flip ${1:Theme})", detail: "Melodic Inversion: (flip <theme|expr> [axis])" },
    { label: "transpose", insertText: "(transpose ${1:Theme} ${2:7})", detail: "Semitone Transposition: (transpose <theme|expr> <semitones>)" },
    { label: "vary", insertText: "(vary ${1:Theme} ${2:reverse} ${3:12})", detail: "Chained Transformations: (vary <theme> <trans1> ...)" },
    { label: "minor", insertText: "(minor ${1:Theme})", detail: "Parallel Minor Modal Transform: (minor <theme>)" },
    { label: "major", insertText: "(major ${1:Theme})", detail: "Parallel Major Modal Transform: (major <theme>)" },
    { label: "play", insertText: "(play ${1:Theme} ${2:Violin})", detail: "Track Binding: (play <theme> <assignment>)" }
  ];

  public static readonly sectionDirectiveCompletions: TmdLSPCompletionItem[] = [
    { label: "!= 120", kind: TmdLSPCompletionItemKind.Snippet, detail: "Absolute Tempo (BPM)", insertText: "!= ${1:120}}", insertTextFormat: 2 },
    { label: "!+ 10", kind: TmdLSPCompletionItemKind.Snippet, detail: "Relative Tempo Change (+BPM)", insertText: "!+ ${1:10}}", insertTextFormat: 2 },
    { label: "?= C", kind: TmdLSPCompletionItemKind.Snippet, detail: "Movable-do Base", insertText: "?= ${1:C}}", insertTextFormat: 2 },
    { label: "?+ 2", kind: TmdLSPCompletionItemKind.Snippet, detail: "Relative Movable-do Transposition (+semitones)", insertText: "?+ ${1:2}}", insertTextFormat: 2 },
    { label: "?- 2", kind: TmdLSPCompletionItemKind.Snippet, detail: "Relative Movable-do Transposition (-semitones)", insertText: "?- ${1:2}}", insertTextFormat: 2 },
    { label: "key= Bm", kind: TmdLSPCompletionItemKind.Snippet, detail: "Explicit Tonality (B minor)", insertText: "key= ${1:Bm}}", insertTextFormat: 2 },
    ...["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"].map((mark) => ({
      label: mark,
      kind: TmdLSPCompletionItemKind.Value,
      detail: `Dynamics (${mark})`,
      insertText: `${mark}}`,
    })),
    { label: "<4/4>", kind: TmdLSPCompletionItemKind.Snippet, detail: "Time Signature Change", insertText: "<${1:4}/${2:4}>}", insertTextFormat: 2 },
  ];

  public static complete(source: string, position: TmdLSPPosition): TmdLSPCompletionItem[] {
    const lines = source.split("\n");
    if (position.line >= lines.length) return [];
    const currentLine = lines[position.line] || "";
    const prefix = currentLine.slice(0, position.character);

    // 1. S-Expression macro completion: inside "-> (", "->(", "(", or "(<word>"
    const isInsideMacro = /(?:->\s*\(|\()\s*([a-zA-Z0-9_-]*)$/.test(prefix);

    const remainder = currentLine.slice(position.character);
    const nextChar = remainder.length > 0 ? remainder[0] : "";

    if (/:\s*[A-Za-z][A-Za-z0-9_-]*\[$/.test(prefix)) {
      return [{
        label: "pitchMode=fixed",
        kind: TmdLSPCompletionItemKind.Value,
        detail: "Fixed Pitch Entry Attribute",
        documentation: "Keep this entry at its written pitch during playback transposition.",
        insertText: "pitchMode=fixed]",
      }];
    }

    if (isInsideMacro) {
      return this.macroSnippets.map((m) => {
        let cleanInsert = m.insertText.startsWith("(") ? m.insertText.slice(1) : m.insertText;
        if (nextChar === ")" && cleanInsert.endsWith(")")) {
          cleanInsert = cleanInsert.slice(0, -1);
        }
        return {
          label: m.label,
          kind: TmdLSPCompletionItemKind.Snippet,
          detail: m.detail,
          documentation: m.detail,
          insertText: cleanInsert,
          insertTextFormat: 2, // Snippet
        };
      });
    }

    // 2. Playback section completion: after "->"
    if (prefix.includes("->")) {
      const sectionNames = TmdOutlineGenerator.extractSectionNames(source);
      return sectionNames.map((name) => ({
        label: name,
        kind: TmdLSPCompletionItemKind.Field,
        detail: `TMD Section: ${name}`,
        documentation: "Playback section or abstract theme",
      }));
    }

    // 3. Assignment completion: after ":" (e.g. "verse:" or "verse:Pi")
    const lastColonIndex = prefix.lastIndexOf(":");
    if (lastColonIndex !== -1) {
      const afterColon = prefix.slice(lastColonIndex + 1);
      // Valid if after colon has no space, bracket or brace
      if (!/[\s\[\{]/.test(afterColon)) {
        return this.standardInstruments.map((inst) => ({
          label: inst,
          kind: TmdLSPCompletionItemKind.Keyword,
          detail: `General MIDI Assignment: ${inst}`,
          documentation: "Standard assignment sound",
        }));
      }
    }

    // 4. Chord completion: after "[" (e.g. "[" or "[D")
    const lastBracketIndex = prefix.lastIndexOf("[");
    if (lastBracketIndex !== -1) {
      const afterBracket = prefix.slice(lastBracketIndex + 1);
      if (!afterBracket.includes("]") && !/[\s\{\}]/.test(afterBracket)) {
        let keyStr = "C";
        try {
          const sheet = TmdParser.parse(source);
          if (sheet?.declaredKey) {
            keyStr = sheet.declaredKey;
          } else if (sheet?.keySignature) {
            keyStr = sheet.keySignature.toString();
          }
        } catch (_) {
          const keyMatch = source.match(/(?:key=|\?=)\s*([A-Ga-g][#b]?(?:m|maj|min)?)/i);
          if (keyMatch) {
            keyStr = keyMatch[1];
          }
        }



        const chords = [...this.scaleDegreeChords, ...this.getDiatonicChords(keyStr)];
        const appendClosingBracket = nextChar !== "]";
        return chords.map((chord) => ({
          label: chord,
          kind: TmdLSPCompletionItemKind.Value,
          detail: this.scaleDegreeChords.includes(chord) ? `Scale Degree Chord: [${chord}]` : `Diatonic Chord in ${keyStr}`,
          insertText: appendClosingBracket ? `${chord}]` : chord,
        }));
      }
    }

    // 5. Section Directives: after "{" (e.g. "{" or "{!" or "{?")
    const lastBraceIndex = prefix.lastIndexOf("{");
    if (lastBraceIndex !== -1) {
      const afterBrace = prefix.slice(lastBraceIndex + 1);
      if (!afterBrace.includes("}") && afterBrace.length <= 16) {
        const typed = afterBrace.trim().toLowerCase();
        return this.sectionDirectiveCompletions.filter((item) =>
          typed.length === 0 || item.label.toLowerCase().startsWith(typed)
        );
      }
    }

    return [];
  }

  private static getDiatonicChords(keyStr: string): string[] {
    if (keyStr.includes("m")) {
      return ["Am", "Bdim", "C", "Dm", "Em", "F", "G", "Am7", "Dm7", "E7", "Cmaj7", "Fmaj7"];
    }
    switch (keyStr) {
      case "G": return ["G", "Am", "Bm", "C", "D", "Em", "F#dim", "Gmaj7", "Am7", "Bm7", "Cmaj7", "D7", "Em7", "Dsus4", "G/B", "D/F#", "C/D"];
      case "D": return ["D", "Em", "F#m", "G", "A", "Bm", "C#dim", "Dmaj7", "Em7", "F#m7", "Gmaj7", "A7", "Bm7", "Asus4"];
      case "A": return ["A", "Bm", "C#m", "D", "E", "F#m", "G#dim", "Amaj7", "Bm7", "C#m7", "Dmaj7", "E7", "F#m7", "Esus4"];
      case "F": return ["F", "Gm", "Am", "Bb", "C", "Dm", "Edim", "Fmaj7", "Gm7", "Am7", "Bbmaj7", "C7", "Dm7", "Csus4", "F/A", "C/E", "Bb/C"];
      case "Bb": return ["Bb", "Cm", "Dm", "Eb", "F", "Gm", "Adim", "Bbmaj7", "Cm7", "Dm7", "Ebmaj7", "F7", "Gm7", "Fsus4"];
      default: return ["C", "Dm", "Em", "F", "G", "Am", "Bdim", "Cmaj7", "Dm7", "Em7", "Fmaj7", "G7", "Am7", "Gsus4", "C/E", "G/B", "F/G"];
    }
  }

  private static readonly scaleDegreeChords: string[] = [
    "1", "2m", "3m", "4", "5", "6m", "7dim",
    "1maj7", "2m7", "3m7", "4maj7", "57", "6m7", "5sus4",
    "3", "37", "2", "27", "6", "67", "4m", "17",
    "5/4", "4/5", "1/3", "5/7", "1/5",
  ];
}

// MARK: - Diagnostic Engine
