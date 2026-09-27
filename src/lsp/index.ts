import {
  TmdParser,
  TMDMeasureChecker,
  TMDRefactor,
  TMDOutlineGenerator,
  TMDOutlineNode,
} from "../core/index.js";

// MARK: - LSP Data Structures

export class TMDLSPPosition {
  constructor(public line: number, public character: number) {}
}

export class TMDLSPRange {
  constructor(public start: TMDLSPPosition, public end: TMDLSPPosition) {}
}

export enum TMDLSPCompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
}

export enum TMDLSPSymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

export function fromOutlineKind(outlineKind: string): TMDLSPSymbolKind {
  switch (outlineKind.toLowerCase()) {
    case "file": return TMDLSPSymbolKind.File;
    case "namespace": return TMDLSPSymbolKind.Namespace;
    case "class": return TMDLSPSymbolKind.Class;
    case "method": return TMDLSPSymbolKind.Method;
    case "property": return TMDLSPSymbolKind.Property;
    case "field": return TMDLSPSymbolKind.Field;
    case "event": return TMDLSPSymbolKind.Event;
    case "operator": return TMDLSPSymbolKind.Operator;
    case "string": return TMDLSPSymbolKind.String;
    case "number": return TMDLSPSymbolKind.Number;
    default: return TMDLSPSymbolKind.Variable;
  }
}

export interface TMDLSPCompletionItem {
  label: string;
  kind: TMDLSPCompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: number; // 1: PlainText, 2: Snippet
}

export interface TMDLSPDiagnostic {
  range: TMDLSPRange;
  severity: number; // 1: Error, 2: Warning, 3: Information, 4: Hint
  source?: string;
  message: string;
}

// MARK: - JSON-RPC Frame & Codec

export interface TMDJSONRPCFrame {
  id?: number | string | null;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

export interface TMDJSONRPCResponse {
  id?: number | string | null;
  result?: any;
  error?: any;
}

export class TMDJSONRPCCodec {
  public static decode(input: string): TMDJSONRPCFrame[] {
    const res = this.decodeBuffer(new TextEncoder().encode(input));
    return res.frames;
  }

  public static decodeBuffer(buffer: Uint8Array): { frames: TMDJSONRPCFrame[]; remaining: Uint8Array } {
    const frames: TMDJSONRPCFrame[] = [];
    let current = buffer;
    const separator = new TextEncoder().encode("\r\n\r\n");
    const decoder = new TextDecoder();

    while (true) {
      let sepIndex = -1;
      for (let i = 0; i <= current.length - separator.length; i++) {
        let matches = true;
        for (let j = 0; j < separator.length; j++) {
          if (current[i + j] !== separator[j]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          sepIndex = i;
          break;
        }
      }
      if (sepIndex === -1) break;

      const headerStr = decoder.decode(current.subarray(0, sepIndex));
      let contentLength: number | null = null;
      for (const line of headerStr.split("\r\n")) {
        const parts = line.split(":");
        if (parts.length >= 2 && parts[0].trim().toLowerCase() === "content-length") {
          contentLength = parseInt(parts[1].trim(), 10);
        }
      }

      if (contentLength === null || isNaN(contentLength)) {
        break;
      }

      const bodyStart = sepIndex + separator.length;
      const bodyEnd = bodyStart + contentLength;
      if (current.length < bodyEnd) {
        // Incomplete body chunk, wait for next buffer data
        break;
      }

      const bodyBuffer = current.subarray(bodyStart, bodyEnd);
      current = current.subarray(bodyEnd);

      try {
        const obj = JSON.parse(decoder.decode(bodyBuffer));
        frames.push({
          id: obj.id,
          method: obj.method,
          params: obj.params,
          result: obj.result,
          error: obj.error,
        });
      } catch (_) {}
    }

    return { frames, remaining: current };
  }

  public static encode(response: TMDJSONRPCResponse): string {
    const payload: Record<string, any> = {
      jsonrpc: "2.0",
      id: response.id !== undefined ? response.id : null,
    };
    if (response.result !== undefined) payload.result = response.result;
    if (response.error !== undefined) payload.error = response.error;
    return this.encodePayload(payload);
  }

  public static encodeNotification(method: string, params: any): string {
    const payload = {
      jsonrpc: "2.0",
      method,
      params,
    };
    return this.encodePayload(payload);
  }

  private static encodePayload(dict: Record<string, any>): string {
    const jsonStr = JSON.stringify(dict);
    const length = new TextEncoder().encode(jsonStr).byteLength;
    return `Content-Length: ${length}\r\n\r\n${jsonStr}`;
  }
}

// MARK: - Completion Engine

export class TMDLSPCompletionEngine {
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
    { label: "loop", insertText: "(loop ${1:Theme} ${2:Cello} ${3:4})", detail: "Sequential Loop: (loop <theme> <instrument> <times>) or (loop <section> <times>)" },
    { label: "layer", insertText: "(layer\n\t${1:expr1}\n\t${2:expr2})", detail: "Parallel Concurrency: (layer <expr1> <expr2> ...)" },
    { label: "seq", insertText: "(seq\n\t${1:expr1}\n\t${2:expr2})", detail: "Sequential Chain: (seq <expr1> <expr2> ...)" },
    { label: "reverse", insertText: "(reverse ${1:Theme})", detail: "Retrograde Inversion: (reverse <theme|expr>)" },
    { label: "flip", insertText: "(flip ${1:Theme})", detail: "Melodic Inversion: (flip <theme|expr> [axis])" },
    { label: "transpose", insertText: "(transpose ${1:Theme} ${2:7})", detail: "Semitone Transposition: (transpose <theme|expr> <semitones>)" },
    { label: "vary", insertText: "(vary ${1:Theme} ${2:reverse} ${3:12})", detail: "Chained Transformations: (vary <theme> <trans1> ...)" },
    { label: "minor", insertText: "(minor ${1:Theme})", detail: "Parallel Minor Modal Transform: (minor <theme>)" },
    { label: "major", insertText: "(major ${1:Theme})", detail: "Parallel Major Modal Transform: (major <theme>)" },
    { label: "play", insertText: "(play ${1:Theme} ${2:Violin})", detail: "Track Binding: (play <theme> <instrument>)" }
  ];

  public static readonly sectionDirectiveCompletions: TMDLSPCompletionItem[] = [
    { label: "!= 120", kind: TMDLSPCompletionItemKind.Snippet, detail: "Absolute Tempo (BPM)", insertText: "!= ${1:120}}", insertTextFormat: 2 },
    { label: "!+ 10", kind: TMDLSPCompletionItemKind.Snippet, detail: "Relative Tempo Change (+BPM)", insertText: "!+ ${1:10}}", insertTextFormat: 2 },
    { label: "?= C", kind: TMDLSPCompletionItemKind.Snippet, detail: "Movable-do Base", insertText: "?= ${1:C}}", insertTextFormat: 2 },
    { label: "?+ 2", kind: TMDLSPCompletionItemKind.Snippet, detail: "Relative Movable-do Transposition (+semitones)", insertText: "?+ ${1:2}}", insertTextFormat: 2 },
    { label: "?- 2", kind: TMDLSPCompletionItemKind.Snippet, detail: "Relative Movable-do Transposition (-semitones)", insertText: "?- ${1:2}}", insertTextFormat: 2 },
    { label: "?= fixed", kind: TMDLSPCompletionItemKind.Value, detail: "Fixed Pitch (Immune to song transpositions)", insertText: "?= fixed}" },
    { label: "key= Bm", kind: TMDLSPCompletionItemKind.Snippet, detail: "Explicit Tonality (B minor)", insertText: "key= ${1:Bm}}", insertTextFormat: 2 },
    ...["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"].map((mark) => ({
      label: mark,
      kind: TMDLSPCompletionItemKind.Value,
      detail: `Dynamics (${mark})`,
      insertText: `${mark}}`,
    })),
    { label: "<4/4>", kind: TMDLSPCompletionItemKind.Snippet, detail: "Time Signature Change", insertText: "<${1:4}/${2:4}>}", insertTextFormat: 2 },
  ];

  public static complete(source: string, position: TMDLSPPosition): TMDLSPCompletionItem[] {
    const lines = source.split("\n");
    if (position.line >= lines.length) return [];
    const currentLine = lines[position.line] || "";
    const prefix = currentLine.slice(0, position.character);

    // 1. S-Expression macro completion: inside "-> (", "->(", "(", or "(<word>"
    const isInsideMacro = /(?:->\s*\(|\()\s*([a-zA-Z0-9_-]*)$/.test(prefix);

    const remainder = currentLine.slice(position.character);
    const nextChar = remainder.length > 0 ? remainder[0] : "";

    if (isInsideMacro) {
      return this.macroSnippets.map((m) => {
        let cleanInsert = m.insertText.startsWith("(") ? m.insertText.slice(1) : m.insertText;
        if (nextChar === ")" && cleanInsert.endsWith(")")) {
          cleanInsert = cleanInsert.slice(0, -1);
        }
        return {
          label: m.label,
          kind: TMDLSPCompletionItemKind.Snippet,
          detail: m.detail,
          documentation: m.detail,
          insertText: cleanInsert,
          insertTextFormat: 2, // Snippet
        };
      });
    }

    // 2. Playback Order section completion: after "->"
    if (prefix.includes("->")) {
      const sectionNames = TMDOutlineGenerator.extractSectionNames(source);
      return sectionNames.map((name) => ({
        label: name,
        kind: TMDLSPCompletionItemKind.Field,
        detail: `TMD Section: ${name}`,
        documentation: "Playback section or abstract theme",
      }));
    }

    // 3. Instrument completion: after ":" (e.g. "verse:" or "verse:Pi")
    const lastColonIndex = prefix.lastIndexOf(":");
    if (lastColonIndex !== -1) {
      const afterColon = prefix.slice(lastColonIndex + 1);
      // Valid if after colon has no space, bracket or brace
      if (!/[\s\[\{]/.test(afterColon)) {
        return this.standardInstruments.map((inst) => ({
          label: inst,
          kind: TMDLSPCompletionItemKind.Keyword,
          detail: `General MIDI Instrument: ${inst}`,
          documentation: "Standard instrument sound assignment",
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
          if (sheet?.keySignature) {
            keyStr = sheet.keySignature.toString();
          }
        } catch (_) {}

        const chords = [...this.scaleDegreeChords, ...this.getDiatonicChords(keyStr)];
        const appendClosingBracket = nextChar !== "]";
        return chords.map((chord) => ({
          label: chord,
          kind: TMDLSPCompletionItemKind.Value,
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
    "5/4", "4/5", "1/3", "5/7", "1/5",
  ];
}

// MARK: - Diagnostic Engine

export class TMDLSPDiagnosticEngine {
  public static diagnose(source: string): TMDLSPDiagnostic[] {
    const diagnostics: TMDLSPDiagnostic[] = [];

    // 1. Measure consistency check
    try {
      const issues = TMDMeasureChecker.check(source);
      for (const issue of issues) {
        const line = Math.max(0, issue.lineNumber - 1);
        const range = new TMDLSPRange(
          new TMDLSPPosition(line, 0),
          new TMDLSPPosition(line, 80)
        );
        diagnostics.push({
          range,
          severity: 1, // Error
          source: "tmd-measure-checker",
          message: issue.description,
        });
      }
    } catch (_) {}

    // 2. Syntax / Parser check
    try {
      TmdParser.parseThrowing(source);
    } catch (err: any) {
      if (err?.range) {
        const line = Math.max(0, (err.range.start?.line ?? 1) - 1);
        const col = Math.max(0, (err.range.start?.column ?? 1) - 1);
        const len = Math.max(1, err.range.length ?? 1);
        diagnostics.push({
          range: new TMDLSPRange(
            new TMDLSPPosition(line, col),
            new TMDLSPPosition(line, col + len)
          ),
          severity: 1,
          source: "tmd-parser",
          message: err.message || "Parse error",
        });
      } else {
        diagnostics.push({
          range: new TMDLSPRange(
            new TMDLSPPosition(0, 0),
            new TMDLSPPosition(0, 80)
          ),
          severity: 1,
          source: "tmd-parser",
          message: err?.message || "Parse error",
        });
      }
    }

    return diagnostics;
  }
}

// MARK: - LSP Server Handler & Event Loop

export class TMDLSPServer {
  public documents: Map<string, string> = new Map();
  public isRunning: boolean = true;

  constructor(public sendOutput?: (data: string) => void) {}

  public handle(message: TMDJSONRPCFrame): void {
    if (!message.method) return;

    switch (message.method) {
      case "initialize": {
        const capabilities = {
          capabilities: {
            textDocumentSync: 1, // Full document sync
            completionProvider: {
              resolveProvider: false,
              triggerCharacters: [">", "(", ":", "[", "{"],
            },
            documentFormattingProvider: true,
            documentSymbolProvider: true,
          },
          serverInfo: {
            name: "tmd-lsp",
            version: "0.1.5",
          },
        };
        const resp = TMDJSONRPCCodec.encode({ id: message.id, result: capabilities });
        this.send(resp);
        break;
      }

      case "initialized":
        break;

      case "shutdown": {
        const resp = TMDJSONRPCCodec.encode({ id: message.id, result: null });
        this.send(resp);
        break;
      }

      case "exit": {
        this.isRunning = false;
        break;
      }

      case "textDocument/didOpen": {
        const params = message.params;
        const textDocument = params?.textDocument;
        if (textDocument?.uri && typeof textDocument.text === "string") {
          this.documents.set(textDocument.uri, textDocument.text);
          this.publishDiagnostics(textDocument.uri, textDocument.text);
        }
        break;
      }

      case "textDocument/didChange": {
        const params = message.params;
        const uri = params?.textDocument?.uri;
        const changes = params?.contentChanges;
        if (uri && Array.isArray(changes) && changes.length > 0) {
          const lastChange = changes[changes.length - 1];
          if (typeof lastChange.text === "string") {
            this.documents.set(uri, lastChange.text);
            this.publishDiagnostics(uri, lastChange.text);
          }
        }
        break;
      }

      case "textDocument/didClose": {
        const uri = message.params?.textDocument?.uri;
        if (uri) {
          this.documents.delete(uri);
          this.sendDiagnosticsNotification(uri, []);
        }
        break;
      }

      case "textDocument/completion": {
        if (message.id === undefined || message.id === null) return;
        const uri = message.params?.textDocument?.uri;
        const pos = message.params?.position;
        let completionItems: any[] = [];

        if (uri && pos && this.documents.has(uri)) {
          const source = this.documents.get(uri)!;
          const position = new TMDLSPPosition(pos.line, pos.character);
          const items = TMDLSPCompletionEngine.complete(source, position);
          completionItems = items.map((item) => ({
            label: item.label,
            kind: item.kind,
            detail: item.detail,
            documentation: item.documentation,
            insertText: item.insertText,
            insertTextFormat: item.insertTextFormat,
          }));
        }

        const resp = TMDJSONRPCCodec.encode({ id: message.id, result: completionItems });
        this.send(resp);
        break;
      }

      case "textDocument/formatting": {
        if (message.id === undefined || message.id === null) return;
        const uri = message.params?.textDocument?.uri;
        const edits: any[] = [];

        if (uri && this.documents.has(uri)) {
          const source = this.documents.get(uri)!;
          const formatted = TMDRefactor.format(source);
          const lines = source.split("\n");
          const lastLineIndex = Math.max(0, lines.length - 1);
          const lastLineChar = (lines[lastLineIndex] || "").length;

          edits.push({
            range: {
              start: { line: 0, character: 0 },
              end: { line: lastLineIndex, character: lastLineChar },
            },
            newText: formatted,
          });
        }

        const resp = TMDJSONRPCCodec.encode({ id: message.id, result: edits });
        this.send(resp);
        break;
      }

      case "textDocument/documentSymbol": {
        if (message.id === undefined || message.id === null) return;
        const uri = message.params?.textDocument?.uri;
        let symbols: any[] = [];

        if (uri && this.documents.has(uri)) {
          const source = this.documents.get(uri)!;
          const nodes = TMDOutlineGenerator.generate(source);
          symbols = nodes.map((node) => this.nodeToLSPDocumentSymbol(node));
        }

        const resp = TMDJSONRPCCodec.encode({ id: message.id, result: symbols });
        this.send(resp);
        break;
      }

      default: {
        if (message.id !== undefined && message.id !== null) {
          const resp = TMDJSONRPCCodec.encode({ id: message.id, result: null });
          this.send(resp);
        }
      }
    }
  }

  private send(encoded: string): void {
    if (this.sendOutput) {
      this.sendOutput(encoded);
    }
  }

  private publishDiagnostics(uri: string, source: string): void {
    const diags = TMDLSPDiagnosticEngine.diagnose(source);
    const diagDicts = diags.map((d) => ({
      range: {
        start: { line: d.range.start.line, character: d.range.start.character },
        end: { line: d.range.end.line, character: d.range.end.character },
      },
      severity: d.severity,
      source: d.source,
      message: d.message,
    }));
    this.sendDiagnosticsNotification(uri, diagDicts);
  }

  private sendDiagnosticsNotification(uri: string, diagnostics: any[]): void {
    const encoded = TMDJSONRPCCodec.encodeNotification("textDocument/publishDiagnostics", {
      uri,
      diagnostics,
    });
    this.send(encoded);
  }

  private nodeToLSPDocumentSymbol(node: TMDOutlineNode): any {
    const symbolKind = fromOutlineKind(node.kind);
    const dict: Record<string, any> = {
      name: node.name,
      kind: symbolKind,
      range: {
        start: { line: Math.max(0, node.range.startLine - 1), character: Math.max(0, node.range.startColumn - 1) },
        end: { line: Math.max(0, node.range.endLine - 1), character: Math.max(0, node.range.endColumn - 1) },
      },
      selectionRange: {
        start: { line: Math.max(0, node.selectionRange.startLine - 1), character: Math.max(0, node.selectionRange.startColumn - 1) },
        end: { line: Math.max(0, node.selectionRange.endLine - 1), character: Math.max(0, node.selectionRange.endColumn - 1) },
      },
    };
    if (node.detail) dict.detail = node.detail;
    if (node.children && node.children.length > 0) {
      dict.children = node.children.map((child) => this.nodeToLSPDocumentSymbol(child));
    }
    return dict;
  }
}
