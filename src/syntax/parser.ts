import * as fs from "node:fs";

import { FilePathNormalizer, TextEncodingDetector } from "../utils/index.js";
import {
  Accidental,
  Beat,
  ChordSymbol,
  DEFAULT_TEMPO_BPM,
  Entry,
  KeySignature,
  Note,
  Playback,
  ScaleDegree,
  Section,
  SectionDirective,
  SExpr,
  Sheet,
  Unit,
  UnitGroup
} from "./types.js";

export type TokenType =
  | "scoreHeader"
  | "doubleAsterisk"
  | "speedPrefix"
  | "relativeTempoPrefix"
  | "keySignaturePrefix"
  | "explicitKeyPrefix"
  | "openAngle"
  | "slash"
  | "asterisk"
  | "closeAngle"
  | "colon"
  | "at"
  | "pipe"
  | "openBrace"
  | "closeBrace"
  | "openParen"
  | "closeParen"
  | "percentOpenParen"
  | "arrow"
  | "arrowEnd"
  | "relativeOrderPrefix"
  | "absoluteOrderPrefix"
  | "number"
  | "positiveNumber"
  | "double"
  | "note"
  | "plus"
  | "chord"
  | "percussion"
  | "metadata"
  | "programText"
  | "tie"
  | "identifier"
  | "eof";

export interface Token {
  type: TokenType;
  value?: any;
  text: string;
  line: number;
  column: number;
}

export function tokenExpectedDescription(type: TokenType): string {
  switch (type) {
    case "scoreHeader": return "::SCORE::";
    case "doubleAsterisk": return "**";
    case "speedPrefix": return "!=";
    case "relativeTempoPrefix": return "!+";
    case "keySignaturePrefix": return "?=";
    case "explicitKeyPrefix": return "key=";
    case "openAngle": return "<";
    case "slash": return "/";
    case "asterisk": return "*";
    case "closeAngle": return ">";
    case "colon": return ":";
    case "at": return "@";
    case "pipe": return "|";
    case "openBrace": return "{";
    case "closeBrace": return "}";
    case "openParen": return "(";
    case "closeParen": return ")";
    case "percentOpenParen": return "%(";
    case "arrow": return "->";
    case "arrowEnd": return "->#";
    case "relativeOrderPrefix": return "{?";
    case "absoluteOrderPrefix": return "{?=";
    case "number": return "number";
    case "positiveNumber": return "positive number";
    case "double": return "decimal number";
    case "note": return "note";
    case "plus": return "+";
    case "chord": return "chord";
    case "percussion": return "percussion";
    case "metadata": return "metadata";
    case "programText": return "program block";
    case "tie": return "-";
    case "identifier": return "identifier";
    case "eof": return "end of input";
  }
}

export interface SourcePosition { offset: number; line: number; column: number; }
export interface SourceRange { start: SourcePosition; length: number; endOffset: number; }
export interface LexedToken { token: Token; text: string; range: SourceRange; }
export const FULLWIDTH_PUNCT_MAP: Record<string, string> = {
  "（": "(",
  "）": ")",
  "｛": "{",
  "｝": "}",
  "【": "[",
  "】": "]",
  "：": ":",
  "｜": "|",
  "－": "-",
  "，": ",",
  "、": ",",
  "？": "?",
  "！": "!",
  "＊": "*",
  "／": "/",
  "＜": "<",
  "＞": ">",
};

export class TMDParseError extends Error {
  public readonly expectedTokens: string[];
  public readonly source?: string;

  constructor(
    public readonly rawMessage: string,
    public readonly token: Token,
    public readonly text: string,
    public readonly range: SourceRange,
    expectedTokens: string[] = [],
    source?: string
  ) {
    let fullMessage = `${rawMessage} at ${range.start.line}:${range.start.column}: \`${text}\``;
    if (expectedTokens.length > 0) {
      fullMessage += ` (expected ${expectedTokens.join(", ")})`;
    }

    // Diagnostic Hint 1: Fullwidth punctuation typo
    const fullwidthMatch = Object.keys(FULLWIDTH_PUNCT_MAP).find((fw) => text.includes(fw));
    if (fullwidthMatch) {
      const half = FULLWIDTH_PUNCT_MAP[fullwidthMatch];
      fullMessage += `\nHint: Fullwidth punctuation detected: \`${fullwidthMatch}\` -> replace with halfwidth \`${half}\``;
    }

    // Diagnostic Hint 2: Accidental typo like 1#, 7b, #, b
    if (
      expectedTokens.includes("note") ||
      expectedTokens.includes("chord") ||
      expectedTokens.includes("percussion")
    ) {
      if (
        text === "#" ||
        /^[1-7]#$/.test(text) ||
        /^[1-7][bB]$/.test(text) ||
        text === "b"
      ) {
        fullMessage += `\nHint: For sharp/flat accidentals in TMD, use \`'\` for sharp (e.g. \`1'\`) and \`,\` for flat (e.g. \`7,\`)`;
      }
    }

    // Diagnostic Hint 3: Missing time grid directive like <4*>
    if (
      expectedTokens.length === 1 &&
      expectedTokens[0] === "<" &&
      (token.type === "number" || token.type === "note" || text === "1" || token.type === "identifier")
    ) {
      fullMessage += `\nHint: Each section inside \`{ ... }\` must start with a time grid directive like \`<4*>\` or \`<8*>\` before note events`;
    }

    // Diagnostic Hint 4: Percussion / drum valid symbols
    if (expectedTokens.includes("percussion") && /[A-Za-z]/.test(text)) {
      fullMessage += `\nHint: If writing percussion/drums, valid symbols are: X/x (Hi-Hat), S/s (Snare), B/b/D/d (Bass Drum), T/t (Tom), C/c (Crash), O/o (Open Hi-Hat)`;
    }

    super(fullMessage);
    this.name = "TMDParseError";
    this.expectedTokens = expectedTokens;
    this.source = source;
  }

  get description(): string {
    return this.message;
  }

  public formatCodeFrame(sourceCode?: string, options?: { color?: boolean }): string {
    const src = sourceCode ?? this.source ?? "";
    if (!src) return "";
    const lines = src.split(/\r?\n/);
    const errLine = this.range.start.line;
    const errCol = this.range.start.column;
    const tokenLen = Math.max(1, this.range.length || this.text.length || 1);

    const startLine = Math.max(1, errLine - 1);
    const endLine = Math.min(lines.length, errLine + 1);

    const maxLineNumWidth = String(endLine).length;
    const pad = (n: number) => String(n).padStart(maxLineNumWidth, " ");

    const out: string[] = [];

    for (let l = startLine; l <= endLine; l++) {
      const lineStr = lines[l - 1] ?? "";
      if (l === errLine) {
        out.push(`${pad(l)} | ${lineStr}`);
        const caretIndent = " ".repeat(Math.max(0, errCol - 1));
        const carets = "^".repeat(tokenLen);
        out.push(`${" ".repeat(maxLineNumWidth)} | ${caretIndent}${carets}`);
      } else {
        out.push(`${pad(l)} | ${lineStr}`);
      }
    }

    return out.join("\n");
  }
}

export class Lexer {
  private input: string;
  private pos = 0;
  private line = 1;
  private col = 1;

  constructor(input: string) {
    this.input = input;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.input.length;
  }

  private peek(offset = 0): string {
    const idx = this.pos + offset;
    if (idx >= this.input.length || idx < 0) return "";
    return this.input[idx];
  }

  private advance(): string {
    if (this.isAtEnd()) return "";
    const ch = this.input[this.pos++];
    if (ch === "\n") {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  private skipWhitespaceAndComments(): void {
    while (!this.isAtEnd()) {
      const c = this.peek();
      if (c === " " || c === "\t" || c === "\r" || c === "\n") {
        this.advance();
      } else if (c === "/" && this.peek(1) === "*") {
        this.advance();
        this.advance();
        while (!this.isAtEnd()) {
          if (this.peek() === "*" && this.peek(1) === "/") {
            this.advance();
            this.advance();
            break;
          }
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];
    while (true) {
      const tok = this.nextToken();
      tokens.push(tok);
      if (tok.type === "eof") break;
    }
    return tokens;
  }

  public tokenizeWithRanges(): LexedToken[] {
    const tokens = this.tokenize();
    let offset = 0;
    return tokens.map((token) => {
      const line = token.line;
      const column = token.column;
      let start = offset;
      if (token.text) {
        const index = this.input.indexOf(token.text, offset);
        start = index < 0 ? offset : index;
        offset = start + token.text.length;
      }
      return {
        token,
        text: token.text,
        range: {
          start: { offset: start, line, column },
          length: token.text.length,
          endOffset: start + token.text.length,
        },
      };
    });
  }

  private nextToken(): Token {
    this.skipWhitespaceAndComments();
    const line = this.line;
    const col = this.col;

    if (this.isAtEnd()) {
      return { type: "eof", text: "", line, column: col };
    }

    const c = this.peek();

    // Triple quotes showProgram text
    if (c === '"' && this.peek(1) === '"' && this.peek(2) === '"') {
      this.advance(); this.advance(); this.advance();
      let body = "";
      while (!this.isAtEnd() && !(this.peek() === '"' && this.peek(1) === '"' && this.peek(2) === '"')) {
        body += this.advance();
      }
      if (!this.isAtEnd()) {
        this.advance(); this.advance(); this.advance();
      }
      return { type: "programText", value: body, text: body, line, column: col };
    }

    // ::SCORE::
    if (c === ":" && this.peek(1) === ":") {
      const sub = this.input.slice(this.pos, this.pos + 9);
      if (sub === "::SCORE::") {
        for (let i = 0; i < 9; i++) this.advance();
        return { type: "scoreHeader", text: "::SCORE::", line, column: col };
      }
    }

    // Song metadata (~ "..." or =~:__KEY__= "...")
    if (c === "~" || (c === "=" && this.peek(1) === "~")) {
      const metaStartPos = this.pos;
      const named = c === "=";
      if (named) { this.advance(); this.advance(); } else { this.advance(); }
      while (this.peek() === " " || this.peek() === "\t") this.advance();
      let key = "credit";
      if (named) {
        if (this.peek() === ":") this.advance();
        while (this.peek() === " " || this.peek() === "\t") this.advance();
        if (this.peek() === "_") {
          while (this.peek() === "_") this.advance();
          key = "";
          while (!this.isAtEnd() && !["_", "=", " ", "\t", '"'].includes(this.peek())) {
            key += this.advance();
          }
          while (this.peek() === "_") this.advance();
          if (this.peek() === "=") this.advance();
        }
      }
      while (this.peek() === " " || this.peek() === "\t") this.advance();
      if (this.peek() === '"') {
        this.advance();
        let value = "";
        while (!this.isAtEnd() && this.peek() !== '"') {
          value += this.advance();
        }
        if (this.peek() === '"') this.advance();
        if (key === "credit") {
          if (value.startsWith("詞：")) key = "lyrics";
          else if (value.startsWith("曲：")) key = "composer";
          else if (value.startsWith("編：")) key = "arranger";
        }
        const rawText = this.input.slice(metaStartPos, this.pos);
        return { type: "metadata", value: { key, value }, text: rawText, line, column: col };
      }
      this.pos = metaStartPos;
    }

    // -># or ->
    if (c === "-" && this.peek(1) === ">") {
      if (this.peek(2) === "#") {
        this.advance(); this.advance(); this.advance();
        return { type: "arrowEnd", text: "->#", line, column: col };
      } else {
        this.advance(); this.advance();
        return { type: "arrow", text: "->", line, column: col };
      }
    }

    // {?= or {?
    if (c === "{" && this.peek(1) === "?") {
      if (this.peek(2) === "=") {
        this.advance(); this.advance(); this.advance();
        return { type: "absoluteOrderPrefix", text: "{?=", line, column: col };
      } else {
        this.advance(); this.advance();
        return { type: "relativeOrderPrefix", text: "{?", line, column: col };
      }
    }

    // %(
    if (c === "%") {
      let offset = 1;
      while (this.peek(offset) === " " || this.peek(offset) === "\t") offset++;
      if (this.peek(offset) === "(") {
        for (let i = 0; i <= offset; i++) this.advance();
        return { type: "percentOpenParen", text: "%(", line, column: col };
      }
    }

    // != or !+
    if (c === "!") {
      let offset = 1;
      while (this.peek(offset) === " " || this.peek(offset) === "\t") offset++;
      if (this.peek(offset) === "=") {
        for (let i = 0; i <= offset; i++) this.advance();
        return { type: "speedPrefix", text: "!=", line, column: col };
      }
      if (this.peek(offset) === "+") {
        for (let i = 0; i <= offset; i++) this.advance();
        return { type: "relativeTempoPrefix", text: "!+", line, column: col };
      }
    }

    // ?=
    if (c === "?") {
      let offset = 1;
      while (this.peek(offset) === " " || this.peek(offset) === "\t") offset++;
      if (this.peek(offset) === "=") {
        for (let i = 0; i <= offset; i++) this.advance();
        return { type: "keySignaturePrefix", text: "?=", line, column: col };
      }
    }

    // key= or Key= (optional whitespace is part of the directive)
    if ((c === "k" || c === "K") && this.peek(1).toLowerCase() === "e" && this.peek(2).toLowerCase() === "y") {
      let offset = 3;
      while (this.peek(offset) === " " || this.peek(offset) === "\t") offset++;
      if (this.peek(offset) === "=") {
        for (let i = 0; i <= offset; i++) this.advance();
        return { type: "explicitKeyPrefix", text: "key=", line, column: col };
      }
    }

    // **
    if (c === "*" && this.peek(1) === "*") {
      this.advance(); this.advance();
      return { type: "doubleAsterisk", text: "**", line, column: col };
    }

    // Single chars
    switch (c) {
      case ":": this.advance(); return { type: "colon", text: ":", line, column: col };
      case "@": this.advance(); return { type: "at", text: "@", line, column: col };
      case "|": this.advance(); return { type: "pipe", text: "|", line, column: col };
      case "{": this.advance(); return { type: "openBrace", text: "{", line, column: col };
      case "}": this.advance(); return { type: "closeBrace", text: "}", line, column: col };
      case "(": this.advance(); return { type: "openParen", text: "(", line, column: col };
      case ")": this.advance(); return { type: "closeParen", text: ")", line, column: col };
      case "<": this.advance(); return { type: "openAngle", text: "<", line, column: col };
      case ">": this.advance(); return { type: "closeAngle", text: ">", line, column: col };
      case "/": this.advance(); return { type: "slash", text: "/", line, column: col };
      case "*": this.advance(); return { type: "asterisk", text: "*", line, column: col };
      case "-": this.advance(); return { type: "tie", text: "-", line, column: col };
      case "+":
        // A plus immediately following a pitch is a connected multi-note
        // separator; otherwise it belongs to a positive number such as +2.
        if (this.pos > 0 && /[0-7'_,^]/.test(this.input[this.pos - 1])) {
          this.advance();
          return { type: "plus", text: "+", line, column: col };
        }
        break;
      case "[": {
        this.advance();
        let chordContent = "";
        while (!this.isAtEnd() && this.peek() !== "]") {
          chordContent += this.advance();
        }
        if (this.peek() === "]") this.advance();
        return { type: "chord", value: chordContent.trim(), text: `[${chordContent}]`, line, column: col };
      }
    }

    // Note (1..7 with accidental and octave)
    if (c >= "1" && c <= "7") {
      const next = this.peek(1);
      const isModifier = next === "'" || next === "," || next === "^" || next === "_";
      const isDigit = next >= "0" && next <= "9";

      if (isModifier || !isDigit) {
        this.advance();
        const degree = parseInt(c, 10) as ScaleDegree;
        let accidental = Accidental.Natural;
        let octave = 0;
        let text = c;
        while (!this.isAtEnd()) {
          const mod = this.peek();
          if (mod === "'") { accidental = Accidental.Sharp; text += this.advance(); }
          else if (mod === ",") { accidental = Accidental.Flat; text += this.advance(); }
          else if (mod === "^") { octave++; text += this.advance(); }
          else if (mod === "_") { octave--; text += this.advance(); }
          else break;
        }
        return { type: "note", value: { degree, accidental, octave } as Note, text, line, column: col };
      }
    }

    // Number or positive number (+4)
    if ((c >= "0" && c <= "9") || (c === "+" && (this.peek(1) >= "0" && this.peek(1) <= "9"))) {
      let numStr = "";
      const isPos = c === "+";
      if (isPos) numStr += this.advance();
      let hasDot = false;
      while (!this.isAtEnd()) {
        const cur = this.peek();
        if (cur >= "0" && cur <= "9") {
          numStr += this.advance();
        } else if (cur === "." && !hasDot) {
          if (this.peek(1) >= "0" && this.peek(1) <= "9") {
            hasDot = true;
            numStr += this.advance();
          } else break;
        } else break;
      }
      if (hasDot) {
        return { type: "double", value: parseFloat(numStr), text: numStr, line, column: col };
      } else {
        const val = parseInt(numStr, 10);
        return { type: isPos ? "positiveNumber" : "number", value: val, text: numStr, line, column: col };
      }
    }

    // Identifier
    let idStr = "";
    const stops = new Set(" \t\r\n:!=?*<>/|{}()[]@,");
    while (!this.isAtEnd()) {
      const cur = this.peek();
      if (stops.has(cur)) break;
      if (cur === "-" && (this.peek(1) === ">" || this.peek(1) === " ")) break;
      idStr += this.advance();
    }
    if (idStr.length > 0) {
      return { type: "identifier", value: idStr, text: idStr, line, column: col };
    }

    // Fallback single char
    const ch = this.advance();
    return { type: "identifier", value: ch, text: ch, line, column: col };
  }
}

export class TmdParser {
  private tokens: Token[];
  private pos = 0;
  public failureIndex?: number;
  public expectedTokens: string[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  public static parse(input: string): Sheet {
    return this.parseThrowing(input);
  }

  public static parseThrowing(input: string): Sheet {
    const lexedTokens = new Lexer(input).tokenizeWithRanges();
    const parser = new TmdParser(lexedTokens.map(lt => lt.token));
    const sheet = parser.parseSheet();

    const diagnosticIndex = (idx: number, tokenCount: number): number => {
      if (tokenCount <= 1) return 0;
      return Math.min(idx === tokenCount - 1 ? idx - 1 : idx, tokenCount - 1);
    };

    if (!sheet) {
      const index = diagnosticIndex(parser.failureIndex ?? parser.pos, lexedTokens.length);
      const offending = lexedTokens[index];
      throw new TMDParseError(
        "Unexpected token",
        offending.token,
        offending.text,
        offending.range,
        parser.expectedTokens,
        input
      );
    }

    if (parser.failureIndex !== undefined) {
      const index = diagnosticIndex(parser.failureIndex, lexedTokens.length);
      const offending = lexedTokens[index];
      throw new TMDParseError(
        "Unexpected token",
        offending.token,
        offending.text,
        offending.range,
        parser.expectedTokens,
        input
      );
    }

    return sheet;
  }

  public static parseData(data: Uint8Array): Sheet {
    const result = TextEncodingDetector.detectAndDecode(data);
    if (!result) throw new Error("Could not decode TMD input");
    return this.parseThrowing(result.content);
  }
  public static parseFile(filePathOrURL: string): Sheet {
    const location = FilePathNormalizer.parseLocation(filePathOrURL);
    return this.parseData(fs.readFileSync(location.filePath));
  }
  public static parseURL(fileURL: string): Sheet { return this.parseFile(fileURL); }

  private currentToken(): Token {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : { type: "eof", text: "", line: 0, column: 0 };
  }

  private get current(): Token {
    return this.currentToken();
  }

  private advance(): Token {
    const tok = this.currentToken();
    if (this.pos < this.tokens.length) this.pos++;
    return tok;
  }

  private recordFailure(index: number, expected: string[]): void {
    if (this.failureIndex === undefined || index >= this.failureIndex) {
      this.failureIndex = index;
      this.expectedTokens = expected;
    }
  }

  private match(type: TokenType): boolean {
    if ((this.currentToken().type as string) === type) {
      this.advance();
      return true;
    }
    return false;
  }

  private require(type: TokenType): boolean {
    if (this.match(type)) {
      return true;
    }
    this.recordFailure(this.pos, [tokenExpectedDescription(type)]);
    return false;
  }

  private skipPipes(): void {
    while (this.current.type === "pipe") this.advance();
  }

  public parseSheet(): Sheet | null {
    if (!this.require("scoreHeader")) {
      return null;
    }

    let name = "";
    let speed = DEFAULT_TEMPO_BPM;
    let keySignature = new KeySignature();
    let declaredKey: string | undefined;
    let beat: Beat = { count: 4, noteValue: 4 };
    const paragraphs: Entry[] = [];
    const orders: Playback[] = [];
    const metadata: Record<string, string> = {};

    while (this.current.type !== "eof") {
      const tokenType: TokenType = this.current.type;
      switch (tokenType) {
        case "doubleAsterisk": {
          this.advance();
          const nameParts: string[] = [];
          while ((this.currentToken().type as string) !== "doubleAsterisk" && (this.currentToken().type as string) !== "eof") {
            const tok = this.advance();
            if (tok.value !== undefined) nameParts.push(String(tok.value));
            else nameParts.push(tok.text);
          }
          this.match("doubleAsterisk");
          name = nameParts.join(" ").trim();
          break;
        }

        case "metadata": {
          const { key, value } = this.advance().value;
          metadata[key] = value;
          break;
        }

        case "speedPrefix": {
          this.advance();
          const currType = this.currentToken().type as string;
          if (currType === "double" || currType === "number" || currType === "positiveNumber") {
            speed = Number(this.advance().value);
          }
          break;
        }

        case "keySignaturePrefix": {
          this.advance();
          let key = "";
          const currType = this.currentToken().type as string;
          if (currType === "identifier") key = this.advance().value;
          else if (currType === "note") key = String(this.advance().value.degree);
          keySignature = KeySignature.parse(key);
          break;
        }

        case "explicitKeyPrefix": {
          this.advance();
          let key = "";
          if (this.current.type === "identifier") key = String(this.advance().value);
          else if (this.current.type === "note") key = String((this.advance().value as Note).degree);
          if (key) declaredKey = key;
          break;
        }

        case "openAngle": {
          this.advance();
          let count = 4;
          let noteValue = 4;
          let currType = this.currentToken().type as string;
          if (currType === "number" || currType === "note") {
            count = this.currentToken().type === "number" ? this.advance().value : this.advance().value.degree;
          }
          this.match("slash");
          currType = this.currentToken().type as string;
          if (currType === "number" || currType === "note") {
            noteValue = this.currentToken().type === "number" ? this.advance().value : this.advance().value.degree;
          }
          this.match("closeAngle");
          beat = { count, noteValue };
          break;
        }

        case "arrow": {
          this.advance();
          const currType = this.currentToken().type as string;
          if (currType === "arrowEnd") {
            this.advance();
            const entries = paragraphs.map((entry) => ({
              ...entry,
              isPrototype: !entry.assignment,
              pitchMode: entry.pitchMode ?? "transposing"
            }));
            return {
              name,
              speed,
              keySignature,
              declaredKey,
              beat,
              entries,
              playback: orders,
              metadata,
              distinctAssignments: () => {
                const canonical = new Map<string, string>();
                for (const assignment of entries.map((entry) => entry.assignment).filter((value): value is string => Boolean(value))) {
                  const key = assignment.toLowerCase();
                  if (!canonical.has(key)) canonical.set(key, assignment);
                }
                return Array.from(canonical.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
              }
            };
          } else if (currType === "relativeOrderPrefix") {
            this.advance();
            let val = "";
            while ((this.currentToken().type as string) !== "closeBrace" && (this.currentToken().type as string) !== "eof") {
              const t = this.advance();
              if (t.type === "positiveNumber") {
                val += `+${t.value}`;
              } else if (t.type === "note") {
                val += String(t.value.degree);
              } else if (typeof t.value === "number" || typeof t.value === "string") {
                val += String(t.value);
              } else {
                val += t.text;
              }
            }
            this.match("closeBrace");
            orders.push({ type: "relative", value: val });
          } else if (currType === "absoluteOrderPrefix") {
            this.advance();
            let val = "";
            while ((this.currentToken().type as string) !== "closeBrace" && (this.currentToken().type as string) !== "eof") {
              const t = this.advance();
              if (t.type === "positiveNumber") {
                val += `+${t.value}`;
              } else if (t.type === "note") {
                val += String(t.value.degree);
              } else if (typeof t.value === "number" || typeof t.value === "string") {
                val += String(t.value);
              } else {
                val += t.text;
              }
            }
            this.match("closeBrace");
            orders.push({ type: "absolute", value: val });
          } else if (currType === "openParen") {
            const tok = this.currentToken();
            const sexpr = this.parseSExpr();
            if (!sexpr || !Array.isArray(sexpr)) {
              return null;
            }
            orders.push({ type: "macro", expr: sexpr as SExpr[], line: tok.line, column: tok.column });
          } else if (currType === "identifier") {
            const idVal = this.advance().value;
            if (idVal === "#") {
              break;
            }
            orders.push({ type: "name", name: idVal });
          } else {
            this.advance();
          }
          break;
        }

        case "arrowEnd":
          this.advance();
          break;

        default: {
          const para = this.parseEntry();
          if (para) {
            paragraphs.push(para);
          } else {
            if (this.failureIndex === undefined) {
              this.recordFailure(this.pos, [tokenExpectedDescription("colon")]);
            }
            return null;
          }
          break;
        }
      }
    }

    const entries = paragraphs.map((entry) => ({
      ...entry,
      isPrototype: !entry.assignment,
      pitchMode: entry.pitchMode ?? "transposing"
    }));
    return {
      name, speed, keySignature, declaredKey, beat, entries, playback: orders, metadata,
      distinctAssignments: () => {
        const canonical = new Map<string, string>();
        for (const assignment of entries.map((entry) => entry.assignment).filter((value): value is string => Boolean(value))) {
          const key = assignment.toLowerCase();
          if (!canonical.has(key)) canonical.set(key, assignment);
        }
        return Array.from(canonical.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      }
    };
  }

  private parseEntry(): Entry | null {
    const startLine = this.current.line;
    const startCol = this.current.column;
    let name = "";
    if (this.current.type === "identifier") {
      name = this.advance().value;
    }

    let assignment: string | undefined;
    let pitchMode: "transposing" | "fixed" = "transposing";
    let start = 0;
    let executionTime: string | undefined;

    if ((this.currentToken().type as string) === "colon") {
      this.advance();
      if ((this.currentToken().type as string) === "identifier") {
        assignment = this.advance().value;
      }

      if (this.currentToken().type === "chord" && this.currentToken().value.trim().toLowerCase() === "pitchmode=fixed") {
        pitchMode = "fixed";
        this.advance();
      }

      if (!this.require("at")) {
        return null;
      }

      if (this.match("pipe")) {
        const currType = this.currentToken().type as string;
        if (currType === "tie") {
          this.advance();
          const nextType = this.currentToken().type as string;
          if (nextType === "number") start = -this.advance().value;
          else if (nextType === "note") start = -this.advance().value.degree;
        } else if (currType === "number" || currType === "positiveNumber") {
          const value = this.advance().value;
          if (currType === "positiveNumber" && value === 0) {
            this.recordFailure(this.pos, ["positive non-zero entry offset"]);
            return null;
          }
          start = value;
        } else if (currType === "note") {
          start = this.advance().value.degree;
        }
        this.match("pipe");
      } else if (["identifier", "number", "positiveNumber", "double", "note"].includes(this.currentToken().type as string)) {
        if (["number", "positiveNumber", "double"].includes(this.currentToken().type as string) && Number(this.currentToken().value) === 0) {
          this.recordFailure(this.pos, ["entry offset in pipe form or execution-time identifier"]);
          return null;
        }
        const value = this.advance().value;
        executionTime = typeof value === "object" ? String(value.degree) : String(value);
      }

      if (!this.require("openBrace")) {
        return null;
      }
    } else {
      if ((this.currentToken().type as string) !== "openBrace") {
        this.recordFailure(this.pos, [tokenExpectedDescription("colon")]);
        return null;
      }
      this.advance();
    }

    if (this.current.type === "programText") {
      const showProgram = this.advance().value;
      this.match("closeBrace");
      return { name, assignment, isPrototype: !assignment, pitchMode, start, sections: [], executionTime, showProgram, line: startLine, column: startCol };
    }

    const sections: Section[] = [];
    while (this.current.type !== "closeBrace" && this.current.type !== "eof") {
      this.skipPipes();
      if (this.current.type === "openAngle") {
        this.advance();
        let noteLength = 4;
        let cType = this.currentToken().type as string;
        if (cType === "number" || cType === "note") {
          noteLength = (this.currentToken().type as string) === "number" ? this.advance().value : this.advance().value.degree;
        } else if (cType === "asterisk") {
          this.advance();
          cType = this.currentToken().type as string;
          if (cType === "number" || cType === "note") {
            noteLength = (this.currentToken().type as string) === "number" ? this.advance().value : this.advance().value.degree;
          }
        }
        this.match("asterisk");
        this.match("closeAngle");

        const unitGroups: UnitGroup[] = [];
        const directives: SectionDirective[] = [];
        const barlinePositions: number[] = [];

        while (this.current.type !== "openAngle" && this.current.type !== "closeBrace" && this.current.type !== "eof") {
          while (this.current.type === "pipe") {
            barlinePositions.push(unitGroups.reduce((acc, group) => acc + group.length, 0));
            this.advance();
          }
          if (this.current.type === "openAngle" || this.current.type === "closeBrace" || this.current.type === "eof") break;

          if (
            this.current.type === "openBrace" ||
            this.current.type === "relativeOrderPrefix" ||
            this.current.type === "absoluteOrderPrefix" ||
            this.current.type === "keySignaturePrefix" ||
            this.current.type === "relativeTempoPrefix" ||
            this.current.type === "explicitKeyPrefix"
          ) {
            const dirPos = unitGroups.reduce((acc, g) => acc + g.length, 0);
            const directive = this.parseSectionDirective(dirPos);
            if (directive) directives.push(directive);
            else this.advance();
            continue;
          }

          if (this.match("openParen")) {
            this.skipPipes();
            const groupUnits: Unit[] = [];
            while (this.current.type !== "closeParen" && this.current.type !== "eof") {
              this.skipPipes();
              if (this.current.type === "closeParen") break;
              const units = this.parseUnits();
              if (units.length > 0) {
                groupUnits.push(...units);
              } else {
                this.recordFailure(this.pos, ["note", "chord", "tie", "rest", "percussion", ")"]);
                return null;
              }
            }
            this.match("closeParen");
            let length = 1;
            if (this.match("percentOpenParen")) {
              length = 0;
              while (this.current.type === "tie") {
                length++;
                this.advance();
              }
              this.match("closeParen");
            }
            unitGroups.push({ units: groupUnits, length });
          } else {
            const units = this.parseUnits();
            if (units.length > 0) {
              for (const u of units) {
                unitGroups.push({ units: [u], length: 1 });
              }
            } else {
              this.recordFailure(this.pos, ["note", "chord", "tie", "rest", "percussion", "tuplet", "directive", "}"]);
              return null;
            }
          }
        }
        sections.push({ noteLength, unitGroups, directives, barlinePositions });
      } else {
        this.recordFailure(this.pos, [tokenExpectedDescription("openAngle")]);
        return null;
      }
    }
    this.match("closeBrace");

    if (!assignment && sections.some((section) => section.directives.length > 0)) {
      this.recordFailure(this.pos, ["prototype without modifiers"]);
      return null;
    }

    return { name, assignment, isPrototype: !assignment, pitchMode, start, sections, executionTime, line: startLine, column: startCol };
  }

  private parseUnits(): Unit[] {
    this.skipPipes();
    const first = this.parsePitchUnit();
    if (first && (this.current.type === "plus")) {
      const notes = [first];
      while (this.match("plus")) {
        const next = this.parsePitchUnit();
        if (!next) {
          this.recordFailure(this.pos, ["note"]);
          return [];
        }
        notes.push(next);
      }
      return [{ type: "multiNote", notes }];
    }
    if (first) return [{ type: "note", note: first }];

    if (this.current.type === "number") {
      const text = this.current.text;
      const units: Unit[] = [];
      let allValid = true;
      for (const ch of text) {
        if (ch >= "1" && ch <= "7") {
          const degree = parseInt(ch, 10) as ScaleDegree;
          units.push({
            type: "note",
            note: { degree, accidental: Accidental.Natural, octave: 0 }
          });
        } else if (ch === "0") {
          units.push({ type: "rest" });
        } else {
          allValid = false;
          break;
        }
      }
      if (allValid && units.length > 0) {
        this.advance();
        return units;
      }
    }
    if (this.current.type === "identifier") {
      const val = this.current.value as string;
      if (val && /^[XxTtSsDdBbOoCc-]+$/.test(val) && val.includes("-") && !val.startsWith("-")) {
        this.advance();
        const units: Unit[] = [];
        let percBuf = "";
        for (const ch of val) {
          if (ch === "-") {
            if (percBuf.length > 0) {
              units.push({ type: "percussion", pattern: percBuf });
              percBuf = "";
            }
            units.push({ type: "tie" });
          } else {
            percBuf += ch;
          }
        }
        if (percBuf.length > 0) {
          units.push({ type: "percussion", pattern: percBuf });
        }
        return units;
      }
      if (val && /^\.+$/.test(val)) {
        this.advance();
        return Array.from({ length: val.length }, () => ({ type: "tie" as const }));
      }
    }
    const single = this.parseUnit();
    return single ? [single] : [];
  }

  private parsePitchUnit(): Note | null {
    if (this.current.type === "note") {
      return this.advance().value as Note;
    }
    if (this.current.type === "number" && /^[1-7]$/.test(this.current.text)) {
      const degree = this.advance().value as ScaleDegree;
      return { degree, accidental: Accidental.Natural, octave: 0 };
    }
    return null;
  }

  private parseUnit(): Unit | null {
    this.skipPipes();
    switch (this.current.type) {
      case "note":
        return { type: "note", note: this.advance().value as Note };
      case "chord":
        return { type: "chord", chord: ChordSymbol.parse(this.advance().value) };
      case "tie":
        this.advance();
        return { type: "tie" };
      case "number":
        if (this.current.value === 0) {
          this.advance();
          return { type: "rest" };
        }
        return null;
      case "percussion":
        return { type: "percussion", pattern: this.advance().value };
      case "identifier": {
        const val = this.current.value as string;
        if (val.length > 0 && /^[XxTtSsDdBbOoCc]+$/.test(val)) {
          this.advance();
          return { type: "percussion", pattern: val };
        }
        if (val.length > 0 && /^\.+$/.test(val)) {
          this.advance();
          return { type: "tie" };
        }
        return null;
      }
      default:
        return null;
    }
  }

  private parseSectionDirective(position: number): SectionDirective | null {
    const startsWithBrace = this.match("openBrace");
    const allowed = ["relativeOrderPrefix", "absoluteOrderPrefix", "keySignaturePrefix", "relativeTempoPrefix", "explicitKeyPrefix"];
    if (!startsWithBrace && !allowed.includes(this.current.type)) return null;

    let result: SectionDirective | null = null;
    const type = this.current.type;

    if (type === "relativeTempoPrefix") {
      this.advance();
      if (this.current.type === "number" || this.current.type === "double") {
        result = { position, kind: { type: "relativeTempo", deltaBpm: Number(this.advance().value) } };
      }
    } else if (type === "speedPrefix") {
      this.advance();
      if (this.current.type === "double" || this.current.type === "number") {
        result = { position, kind: { type: "tempo", bpm: Number(this.advance().value) } };
      } else if (this.current.type === "positiveNumber") {
        result = { position, kind: { type: "relativeTempo", deltaBpm: Number(this.advance().value) } };
      }
    } else if (type === "relativeOrderPrefix") {
      this.advance();
      let val = "";
      while (this.current.type !== "closeBrace" && this.current.type !== "eof") {
        const t = this.advance();
        if (t.type === "positiveNumber") {
          val += `+${t.value}`;
        } else if (t.type === "note") {
          val += String(t.value.degree);
        } else if (typeof t.value === "number" || typeof t.value === "string") {
          val += String(t.value);
        } else {
          val += t.text;
        }
      }
      const trimmed = val.trim().toLowerCase();
      if (trimmed === "fixed") {
        this.recordFailure(this.pos, ["entry attribute [pitchMode=fixed]"]);
      } else {
        const num = parseInt(val, 10);
        if (!isNaN(num)) {
          result = { position, kind: { type: "relativeKey", semitones: num } };
        }
      }
    } else if (type === "absoluteOrderPrefix" || type === "keySignaturePrefix") {
      this.advance();
      let val = "";
      while (this.current.type !== "closeBrace" && this.current.type !== "eof") {
        const t = this.advance();
        if (t.type === "positiveNumber") {
          val += `+${t.value}`;
        } else if (t.type === "note") {
          val += String(t.value.degree);
        } else if (typeof t.value === "number" || typeof t.value === "string") {
          val += String(t.value);
        } else {
          val += t.text;
        }
      }
      const trimmed = val.trim().toLowerCase();
      if (trimmed === "fixed") {
        this.recordFailure(this.pos, ["entry attribute [pitchMode=fixed]"]);
      } else {
        result = { position, kind: { type: "absoluteKey", key: val } };
      }
    } else if (type === "explicitKeyPrefix") {
      this.advance();
      let key = "";
      if (this.current.type === "identifier") key = String(this.advance().value);
      else if (this.current.type === "note") key = String((this.advance().value as Note).degree);
      if (key) result = { position, kind: { type: "explicitKey", key } };
    } else if (type === "identifier") {
      const mark = String(this.current.value).toLowerCase();
      if (["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"].includes(mark)) {
        this.advance();
        result = { position, kind: { type: "dynamics", mark: mark as import("./types.js").DynamicMark } };
      }
    } else if ((this.current.type as string) === "openAngle") {
      this.advance();
      let count = 4;
      let noteValue = 4;
      let cType = this.current.type as string;
      if (cType === "number" || cType === "note") {
        count = this.current.type === "number" ? this.advance().value : this.advance().value.degree;
      }
      this.match("slash");
      cType = this.current.type as string;
      if (cType === "number" || cType === "note") {
        noteValue = this.current.type === "number" ? this.advance().value : this.advance().value.degree;
      }
      this.match("closeAngle");
      result = { position, kind: { type: "timeSignature", beat: { count, noteValue } } };
    }

    this.match("closeBrace");
    return result;
  }

  private parseSExpr(): SExpr | null {
    if (!this.require("openParen")) return null;
    const items: SExpr[] = [];
    while (this.current.type !== "closeParen" && this.current.type !== "eof") {
      if (this.current.type === "arrow" || this.current.type === "arrowEnd") {
        this.recordFailure(this.pos, [tokenExpectedDescription("closeParen")]);
        return null;
      }
      if (this.current.type === "openParen") {
        const sub = this.parseSExpr();
        if (sub === null) return null;
        items.push(sub);
      } else {
        const tok = this.advance();
        if (tok.type === "number" || tok.type === "positiveNumber") {
          items.push(tok.value);
        } else if (tok.type === "identifier") {
          items.push(tok.value);
        } else if (tok.type === "note") {
          // If pure digit with no accidental/octave modifiers, treat as number in SExpr
          if (tok.value.accidental === Accidental.Natural && tok.value.octave === 0 && !tok.text.includes("^") && !tok.text.includes("_") && !tok.text.includes("'") && !tok.text.includes(",")) {
            items.push(tok.value.degree);
          } else {
            items.push(tok.text);
          }
        } else if (tok.type === "tie") {
          // Negative number like -12 or signed number
          if (this.current.type === "number" || this.current.type === "note") {
            const numTok = this.advance();
            const val = numTok.type === "number" ? numTok.value : numTok.value.degree;
            items.push(-val);
          } else {
            items.push(tok.text);
          }
        } else if (tok.text) {
          items.push(tok.text);
        }
      }
    }
    if (!this.require("closeParen")) return null;
    return items;
  }
}
