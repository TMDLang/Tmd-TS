import { type LexedToken, type Token } from "./tokens.js";
import { Accidental, Note, ScaleDegree } from "./types.js";

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
