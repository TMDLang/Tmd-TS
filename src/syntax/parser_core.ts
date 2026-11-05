import { Lexer } from "./lexer.js";
import { TmdParseError } from "./parse_diagnostics.js";
import { type LexedToken, type Token, tokenExpectedDescription, type TokenType } from "./tokens.js";
import {
  Accidental,
  Beat,
  ChordSymbol,
  DEFAULT_TEMPO_BPM,
  Entry,
  KeySignature,
  LyricBlock,
  LyricElement,
  LyricGroup,
  LyricLine,
  LyricMeasure,
  LyricSlot,
  LyricSoundingToken,
  LyricTransparentToken,
  MelodicMeasureSpan,
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

export { Lexer } from "./lexer.js";
export { TmdParseError } from "./parse_diagnostics.js";
export type { LexedToken, SourcePosition, SourceRange, Token, TokenType } from "./tokens.js";

export class TmdParserCore {
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
    const parser = new TmdParserCore(lexedTokens.map(lt => lt.token));
    const sheet = parser.parseSheet();

    const diagnosticIndex = (idx: number, tokenCount: number): number => {
      if (tokenCount <= 1) return 0;
      return Math.min(idx === tokenCount - 1 ? idx - 1 : idx, tokenCount - 1);
    };

    if (!sheet) {
      const index = diagnosticIndex(parser.failureIndex ?? parser.pos, lexedTokens.length);
      const offending = lexedTokens[index];
      throw new TmdParseError(
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
      throw new TmdParseError(
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
          } else if (currType === "note") {
            speed = Number((this.advance().value as Note).degree);
          }
          break;
        }

        case "keySignaturePrefix": {
          this.advance();
          let key = "";
          const currType = this.currentToken().type as string;
          if (currType === "identifier") {
            key = this.advance().value;
            if ((this.currentToken().type as string) === "identifier" && String(this.currentToken().value).startsWith(",")) {
              key += String(this.advance().value);
              if ((this.currentToken().type as string) === "identifier" && String(this.currentToken().value) === "m") {
                key += String(this.advance().value);
              }
            }
          } else if (currType === "note") key = String(this.advance().value.degree);
          keySignature = KeySignature.parse(key);
          break;
        }

        case "explicitKeyPrefix": {
          this.advance();
          let key = "";
          if (this.current.type === "identifier") {
            key = String(this.advance().value);
            if (this.current.type === "identifier" && String(this.current.value).startsWith(",")) {
              key += String(this.advance().value);
              if (this.current.type === "identifier" && String(this.current.value) === "m") {
                key += String(this.advance().value);
              }
            }
          } else if (this.current.type === "note") key = String((this.advance().value as Note).degree);
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
            const idTok = this.advance();
            const idVal = idTok.value;
            if (idVal === "#") {
              break;
            }
            let stanza: number | undefined;
            let rawStanzaTag: string | undefined;
            if (this.currentToken().type === "chord") {
              const bracketVal = String(this.currentToken().value).trim();
              rawStanzaTag = bracketVal;
              const stanzaMatch = bracketVal.match(/^L(\d+)$/);
              if (stanzaMatch) {
                stanza = parseInt(stanzaMatch[1], 10);
              }
              this.advance();
            }
            const orderNode: Playback = {
              type: "name",
              name: idVal,
              ...(stanza !== undefined ? { stanza } : {}),
              ...(rawStanzaTag !== undefined
                ? { rawStanzaTag, line: idTok.line, column: idTok.column }
                : {}),
            };
            if (rawStanzaTag === undefined) {
              Object.defineProperties(orderNode, {
                line: { value: idTok.line, enumerable: false },
                column: { value: idTok.column, enumerable: false },
              });
            }
            orders.push(orderNode);
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
        const lyricBlocks: LyricBlock[] = [];
        const lyrics: LyricLine[] = [];

        let totalSectionMeasures = 0;
        let currentMelodicLineMeasures: MelodicMeasureSpan[] = [];
        let currentMeasureStartGroup: number | undefined;
        let currentMeasureStartUnitPos: number | undefined;
        let currentMeasureLine: number | undefined;
        let currentMeasureCol: number | undefined;
        let lastMelodicTokenLine: number | undefined;

        const closeCurrentMelodicMeasure = () => {
          if (currentMeasureStartGroup !== undefined && unitGroups.length > currentMeasureStartGroup) {
            currentMelodicLineMeasures.push({
              measureIndex: totalSectionMeasures++,
              startGroupIndex: currentMeasureStartGroup,
              endGroupIndex: unitGroups.length,
              startUnitPosition: currentMeasureStartUnitPos ?? 0,
              endUnitPosition: unitGroups.reduce((acc, g) => acc + g.length, 0),
              line: currentMeasureLine,
              column: currentMeasureCol,
            });
          }
          currentMeasureStartGroup = undefined;
          currentMeasureStartUnitPos = undefined;
        };

        const ensureMelodicMeasureOpen = (line: number, col: number) => {
          if (lastMelodicTokenLine !== undefined && line !== lastMelodicTokenLine) {
            closeCurrentMelodicMeasure();
            currentMelodicLineMeasures = [];
          }
          lastMelodicTokenLine = line;
          if (currentMeasureStartGroup === undefined) {
            currentMeasureStartGroup = unitGroups.length;
            currentMeasureStartUnitPos = unitGroups.reduce((acc, g) => acc + g.length, 0);
            currentMeasureLine = line;
            currentMeasureCol = col;
          }
        };

        while (this.current.type !== "openAngle" && this.current.type !== "closeBrace" && this.current.type !== "eof") {
          while (this.current.type === "pipe") {
            const pipeTok = this.current;
            if (lastMelodicTokenLine !== undefined && pipeTok.line !== lastMelodicTokenLine) {
              closeCurrentMelodicMeasure();
              currentMelodicLineMeasures = [];
              lastMelodicTokenLine = pipeTok.line;
            }
            if (currentMeasureStartGroup !== undefined && unitGroups.length > currentMeasureStartGroup) {
              closeCurrentMelodicMeasure();
            }
            ensureMelodicMeasureOpen(pipeTok.line, pipeTok.column);
            barlinePositions.push(unitGroups.reduce((acc, group) => acc + group.length, 0));
            this.advance();
          }
          if (this.current.type === "openAngle" || this.current.type === "closeBrace" || this.current.type === "eof") break;

          if (this.current.type === "lyricLine") {
            closeCurrentMelodicMeasure();
            const blockLyricLines: LyricLine[] = [];
            while (this.current.type === "lyricLine") {
              const lyricTok = this.advance();
              const parsedLine = this.parseLyricLineToken(lyricTok);
              blockLyricLines.push(parsedLine);
              lyrics.push(parsedLine);
            }
            lyricBlocks.push({
              melodicMeasures: [...currentMelodicLineMeasures],
              lyricLines: blockLyricLines,
              line: blockLyricLines[0]?.line,
            });
            currentMelodicLineMeasures = [];
            lastMelodicTokenLine = undefined;
            continue;
          }

          if (
            this.current.type === "openBrace" ||
            this.current.type === "relativeOrderPrefix" ||
            this.current.type === "absoluteOrderPrefix" ||
            this.current.type === "keySignaturePrefix" ||
            this.current.type === "relativeTempoPrefix" ||
            this.current.type === "explicitKeyPrefix"
          ) {
            ensureMelodicMeasureOpen(this.current.line, this.current.column);
            const dirPos = unitGroups.reduce((acc, g) => acc + g.length, 0);
            const directive = this.parseSectionDirective(dirPos);
            if (directive) directives.push(directive);
            else this.advance();
            continue;
          }

          const unitTokLine = this.current.line;
          const unitTokCol = this.current.column;
          if (this.match("openParen")) {
            ensureMelodicMeasureOpen(unitTokLine, unitTokCol);
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
            ensureMelodicMeasureOpen(unitTokLine, unitTokCol);
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
        closeCurrentMelodicMeasure();
        sections.push({
          noteLength,
          unitGroups,
          directives,
          barlinePositions,
          ...(lyricBlocks.length > 0 ? { lyricBlocks, lyrics } : {}),
        });
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
      let sign = 1;
      if ((this.currentToken().type as string) === "tie") {
        this.advance();
        sign = -1;
      }
      const nextType = this.currentToken().type as string;
      if (nextType === "number" || nextType === "double") {
        result = { position, kind: { type: "relativeTempo", deltaBpm: sign * Number(this.advance().value) } };
      } else if (nextType === "note") {
        result = { position, kind: { type: "relativeTempo", deltaBpm: sign * Number((this.advance().value as Note).degree) } };
      }
    } else if (type === "identifier" && this.current.value === "!") {
      this.advance();
      if ((this.currentToken().type as string) === "tie") {
        this.advance();
        const nextType = this.currentToken().type as string;
        if (nextType === "number" || nextType === "double") {
          result = { position, kind: { type: "relativeTempo", deltaBpm: -Number(this.advance().value) } };
        } else if (nextType === "note") {
          result = { position, kind: { type: "relativeTempo", deltaBpm: -Number((this.advance().value as Note).degree) } };
        }
      }
    } else if (type === "speedPrefix") {
      this.advance();
      if (this.current.type === "double" || this.current.type === "number") {
        result = { position, kind: { type: "tempo", bpm: Number(this.advance().value) } };
      } else if (this.current.type === "positiveNumber") {
        result = { position, kind: { type: "relativeTempo", deltaBpm: Number(this.advance().value) } };
      } else if (this.current.type === "note") {
        result = { position, kind: { type: "tempo", bpm: Number((this.advance().value as Note).degree) } };
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
      while (this.current.type !== "closeBrace" && this.current.type !== "eof") {
        const t = this.advance();
        if (t.type === "note") key += String((t.value as Note).degree);
        else if (typeof t.value === "string" || typeof t.value === "number") key += String(t.value);
        else key += t.text;
      }
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

  private parseLyricLineToken(tok: Token): LyricLine {
    const { stanza, rawPrefix, content } = tok.value as {
      stanza?: number;
      rawPrefix: string;
      content: string;
    };
    const rawParts = content.split("|");
    if (content.trimEnd().endsWith("|") && rawParts.length > 0) {
      rawParts.pop();
    }

    const lineState: {
      inStraightQuote: boolean;
      pendingPrefix: string;
      lastSounding?: LyricSoundingToken;
    } = {
      inStraightQuote: false,
      pendingPrefix: "",
    };
    const measures: LyricMeasure[] = [];
    let currentCol = tok.column + rawPrefix.length;

    for (const part of rawParts) {
      measures.push(this.parseLyricMeasureString(part, tok.line, currentCol, lineState));
      currentCol += part.length + 1;
    }

    return {
      ...(stanza !== undefined ? { stanza } : {}),
      rawPrefix,
      measures,
      line: tok.line,
      column: tok.column,
    };
  }

  private parseLyricMeasureString(
    rawMeasure: string,
    line: number,
    baseColumn: number,
    lineState: {
      inStraightQuote: boolean;
      pendingPrefix: string;
      lastSounding?: LyricSoundingToken;
    }
  ): LyricMeasure {
    const LEADING_TRANSPARENT = new Set(["「", "『", "“", "（", "【"]);
    const TRAILING_TRANSPARENT = new Set(["」", "』", "”", "）", "】", "——", "……"]);

    let pos = 0;
    const directives: string[] = [];

    const classifyWord = (word: string, col: number): LyricSoundingToken | LyricTransparentToken => {
      if (LEADING_TRANSPARENT.has(word)) {
        lineState.pendingPrefix += word;
        return { type: "transparent", text: word, position: "leading", line, column: col };
      }
      if (TRAILING_TRANSPARENT.has(word)) {
        if (lineState.lastSounding) {
          lineState.lastSounding.rawText += word;
        } else {
          lineState.pendingPrefix += word;
        }
        return { type: "transparent", text: word, position: "trailing", line, column: col };
      }
      if (word === '"') {
        if (!lineState.inStraightQuote) {
          lineState.inStraightQuote = true;
          lineState.pendingPrefix += word;
          return { type: "transparent", text: word, position: "leading", line, column: col };
        } else {
          lineState.inStraightQuote = false;
          if (lineState.lastSounding) {
            lineState.lastSounding.rawText += word;
          } else {
            lineState.pendingPrefix += word;
          }
          return { type: "transparent", text: word, position: "trailing", line, column: col };
        }
      }
      if (word === "-") {
        const tieTok: LyricSoundingToken = {
          type: "sounding",
          kind: "tie",
          text: "-",
          rawText: "-",
          cleanWord: "-",
          line,
          column: col,
        };
        return tieTok;
      }
      if (word === "0") {
        const restTok: LyricSoundingToken = {
          type: "sounding",
          kind: "rest",
          text: "0",
          rawText: "0",
          cleanWord: "0",
          line,
          column: col,
        };
        return restTok;
      }

      const isHyphenated =
        word.length > 1 &&
        word.endsWith("-") &&
        !word.endsWith("--") &&
        !word.endsWith("——");
      const coreWithoutHyphen = isHyphenated ? word.slice(0, -1) : word;
      const rawText = `${lineState.pendingPrefix}${word}`;
      lineState.pendingPrefix = "";
      const stripped = coreWithoutHyphen.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
      const cleanWord = stripped.length > 0 ? stripped : coreWithoutHyphen;

      const sylTok: LyricSoundingToken = {
        type: "sounding",
        kind: "syllable",
        text: word,
        rawText,
        cleanWord,
        ...(isHyphenated ? { isHyphenated: true } : {}),
        line,
        column: col,
      };
      lineState.lastSounding = sylTok;
      return sylTok;
    };

    const parseSequence = (stopAtCloseParen: boolean): {
      elements: LyricElement[];
      slots: LyricSlot[];
      soundingTokens: LyricSoundingToken[];
    } => {
      const elements: LyricElement[] = [];
      const slots: LyricSlot[] = [];
      const soundingTokens: LyricSoundingToken[] = [];

      while (pos < rawMeasure.length) {
        while (pos < rawMeasure.length && (rawMeasure[pos] === " " || rawMeasure[pos] === "\t")) {
          pos++;
        }
        if (pos >= rawMeasure.length) break;

        const ch = rawMeasure[pos];
        const col = baseColumn + pos;

        if (stopAtCloseParen && ch === ")") {
          pos++;
          break;
        }

        if (ch === "{") {
          const start = pos;
          pos++;
          let braceDepth = 1;
          while (pos < rawMeasure.length && braceDepth > 0) {
            if (rawMeasure[pos] === "{") braceDepth++;
            else if (rawMeasure[pos] === "}") braceDepth--;
            pos++;
          }
          directives.push(rawMeasure.slice(start, pos));
          continue;
        }

        if (ch === "}") {
          pos++;
          directives.push("}");
          continue;
        }

        if (ch === "(") {
          pos++;
          const inner = parseSequence(true);
          let hasInvalidRatio = false;
          const restSlice = rawMeasure.slice(pos);
          const ratioMatch = restSlice.match(/^\s*%\s*\([^)]*\)/);
          if (ratioMatch) {
            hasInvalidRatio = true;
            pos += ratioMatch[0].length;
          }
          const group: LyricGroup = {
            type: "group",
            elements: inner.elements,
            soundingTokens: inner.soundingTokens,
            ...(hasInvalidRatio ? { hasInvalidRatio: true } : {}),
            line,
            column: col,
          };
          elements.push(group);
          slots.push(group);
          soundingTokens.push(...inner.soundingTokens);
          continue;
        }

        if (ch === ")") {
          pos++;
          continue;
        }

        const start = pos;
        while (
          pos < rawMeasure.length &&
          rawMeasure[pos] !== " " &&
          rawMeasure[pos] !== "\t" &&
          rawMeasure[pos] !== "(" &&
          rawMeasure[pos] !== ")" &&
          rawMeasure[pos] !== "{" &&
          rawMeasure[pos] !== "}"
        ) {
          pos++;
        }
        if (pos === start) {
          pos++;
          continue;
        }
        const word = rawMeasure.slice(start, pos);
        if (word.length > 0) {
          const item = classifyWord(word, col);
          elements.push(item);
          if (item.type === "sounding") {
            slots.push(item);
            soundingTokens.push(item);
          }
        }
      }

      return { elements, slots, soundingTokens };
    };

    const parsed = parseSequence(false);
    return {
      elements: parsed.elements,
      slots: parsed.slots,
      soundingTokens: parsed.soundingTokens,
      ...(directives.length > 0 ? { directives } : {}),
      line,
      column: baseColumn,
    };
  }
}
