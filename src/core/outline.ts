import { LexedToken,Lexer, SourcePosition } from "../syntax/parser.js";

export interface TMDOutlineRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface TMDOutlineNode {
  name: string;
  detail?: string;
  kind: "file" | "class" | "namespace" | "field" | "method" | "event" | "string" | "number";
  range: TMDOutlineRange;
  selectionRange: TMDOutlineRange;
  children?: TMDOutlineNode[];
}

interface TrackOccurrence {
  sectionName: string;
  assignment: string;
  range: TMDOutlineRange;
  selectionRange: TMDOutlineRange;
  detail?: string;
}

export class TMDOutlineGenerator {
  public static generate(source: string): TMDOutlineNode[] {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenizeWithRanges();
    if (tokens.length === 0) return [];

    let pos = 0;
    const current = (): LexedToken | undefined => tokens[pos];
    const advance = (): LexedToken | undefined => tokens[pos++];

    let scoreName = "";
    let scoreSpeed: number | undefined;
    let scoreKey: string | undefined;
    let scoreBeat: string | undefined;
    let scoreHeaderStart: SourcePosition | undefined;
    let scoreHeaderEnd: SourcePosition | undefined;

    const trackOccurrences: TrackOccurrence[] = [];

    interface OrderItem {
      name: string;
      range: TMDOutlineRange;
      detail?: string;
    }
    const orderItems: OrderItem[] = [];
    let orderStartPos: SourcePosition | undefined;
    let orderEndPos: SourcePosition | undefined;
    const orderSnippet: string[] = [];

    while (pos < tokens.length) {
      const tok = current();
      if (!tok) break;

      if (tok.token.type === "scoreHeader") {
        scoreHeaderStart = tok.range.start;
        advance();
        continue;
      }

      if (tok.token.type === "doubleAsterisk" && !scoreName) {
        advance();
        const parts: string[] = [];
        while (pos < tokens.length && current()?.token.type !== "doubleAsterisk" && current()?.token.type !== "eof") {
          const t = advance();
          if (t) parts.push(t.text);
        }
        if (current()?.token.type === "doubleAsterisk") {
          const endTok = advance();
          scoreHeaderEnd = endTok?.range.start;
        }
        scoreName = parts.join(" ").trim();
        continue;
      }

      if (tok.token.type === "speedPrefix") {
        advance();
        const next = advance();
        if (next && (next.token.type === "double" || next.token.type === "number" || next.token.type === "positiveNumber")) {
          scoreSpeed = Number(next.token.value ?? next.text);
        }
        continue;
      }

      if (tok.token.type === "keySignaturePrefix") {
        advance();
        const next = advance();
        if (next) {
          scoreKey = next.text;
        }
        continue;
      }

      if (tok.token.type === "openAngle") {
        if (pos + 4 < tokens.length && tokens[pos + 2].token.type === "slash" && tokens[pos + 4].token.type === "closeAngle") {
          const c = tokens[pos + 1].text;
          const n = tokens[pos + 3].text;
          scoreBeat = `${c}/${n}`;
          pos += 5;
          continue;
        }
      }

      // Paragraph header:
      // 1. Concrete track: identifier:identifier@...{ ... }
      // 2. Abstract pattern: identifier { ... }
      if (tok.token.type === "identifier") {
        const isConcrete = pos + 1 < tokens.length && tokens[pos + 1].token.type === "colon";
        const isAbstract = pos + 1 < tokens.length && tokens[pos + 1].token.type === "openBrace";

        if (isConcrete || isAbstract) {
          const paraStartTok = tok;
          const secName = tok.text;
          advance(); // secName

          let instName = "Pattern";
          let instTok: LexedToken | undefined;
          let startOffsetStr: string | undefined;

          if (isConcrete) {
            advance(); // :
            instTok = current();
            if (instTok && instTok.token.type === "identifier") {
              instName = instTok.text;
              advance();
            } else {
              instName = "Track";
            }

            // Advance until {
            while (pos < tokens.length && current()?.token.type !== "openBrace") {
              if (current()?.token.type === "at") {
                advance();
                if (current()?.token.type === "pipe") {
                  advance();
                  let offStr = "";
                  while (pos < tokens.length && current()?.token.type !== "pipe") {
                    const offTok = advance();
                    if (offTok) offStr += offTok.text;
                  }
                  if (current()?.token.type === "pipe") advance();
                  startOffsetStr = offStr;
                }
              } else {
                advance();
              }
            }
          }

          let braceCount = 0;
          let paraEndTok = paraStartTok;

          if (current()?.token.type === "openBrace") {
            advance();
            braceCount = 1;

            while (pos < tokens.length && braceCount > 0) {
              const bodyTok = advance();
              if (!bodyTok) break;
              paraEndTok = bodyTok;

              if (bodyTok.token.type === "openBrace") {
                braceCount++;
              } else if (bodyTok.token.type === "closeBrace") {
                braceCount--;
                if (braceCount === 0) break;
              }
            }
          }

          const pStart = paraStartTok.range.start;
          const pEnd: SourcePosition = {
            offset: paraEndTok.range.endOffset,
            line: paraEndTok.range.start.line,
            column: paraEndTok.range.start.column + paraEndTok.range.length,
          };
          const range: TMDOutlineRange = {
            startLine: pStart.line,
            startColumn: pStart.column,
            endLine: pEnd.line,
            endColumn: pEnd.column,
          };

          const selStart = instTok?.range.start ?? pStart;
          const selEnd: SourcePosition = {
            offset: instTok?.range.endOffset ?? (pStart.offset + paraStartTok.range.length),
            line: instTok?.range.start.line ?? pStart.line,
            column: (instTok?.range.start.column ?? pStart.column) + (instTok?.range.length ?? paraStartTok.range.length),
          };
          const selectionRange: TMDOutlineRange = {
            startLine: selStart.line,
            startColumn: selStart.column,
            endLine: selEnd.line,
            endColumn: selEnd.column,
          };

          const detail = startOffsetStr ? `@|${startOffsetStr}|` : undefined;

          trackOccurrences.push({
            sectionName: secName,
            assignment: instName,
            range,
            selectionRange,
            detail,
          });

          continue;
        }
      }

      // Order lines: -> secName -> ...
      if (tok.token.type === "arrow") {
        if (!orderStartPos) {
          orderStartPos = tok.range.start;
        }
        orderSnippet.push("->");
        advance();

        const next = current();
        if (next) {
          if (next.token.type === "arrowEnd") {
            orderSnippet.push("#");
            const arrowEndTok = advance()!;
            const oRange: TMDOutlineRange = {
              startLine: arrowEndTok.range.start.line,
              startColumn: arrowEndTok.range.start.column,
              endLine: arrowEndTok.range.start.line,
              endColumn: arrowEndTok.range.start.column + arrowEndTok.range.length,
            };
            orderItems.push({ name: "#", range: oRange });
            orderEndPos = {
              offset: arrowEndTok.range.endOffset,
              line: arrowEndTok.range.start.line,
              column: arrowEndTok.range.start.column + arrowEndTok.range.length,
            };
          } else if (next.token.type === "openParen") {
            // S-Expression Macro in Orders: (canon Theme ...) or (layer ...)
            const parenStartTok = advance()!;
            let parenDepth = 1;
            const macroTokens: LexedToken[] = [];
            let macroEndTok = parenStartTok;

            while (pos < tokens.length && parenDepth > 0) {
              const mTok = advance();
              if (!mTok) break;
              macroEndTok = mTok;
              if (mTok.token.type === "openParen") {
                parenDepth++;
                macroTokens.push(mTok);
              } else if (mTok.token.type === "closeParen") {
                parenDepth--;
                if (parenDepth === 0) break;
                macroTokens.push(mTok);
              } else {
                macroTokens.push(mTok);
              }
            }

            const opName = macroTokens.length > 0 ? macroTokens[0].text : "macro";
            const detailStr = macroTokens.map(t => t.text).join(" ");
            orderSnippet.push(`(${opName})`);

            const oRange: TMDOutlineRange = {
              startLine: parenStartTok.range.start.line,
              startColumn: parenStartTok.range.start.column,
              endLine: macroEndTok.range.start.line,
              endColumn: macroEndTok.range.start.column + macroEndTok.range.length,
            };

            orderItems.push({
              name: opName,
              range: oRange,
              detail: detailStr,
            });

            orderEndPos = {
              offset: macroEndTok.range.endOffset,
              line: macroEndTok.range.start.line,
              column: macroEndTok.range.start.column + macroEndTok.range.length,
            };
          } else if (next.token.type === "identifier") {
            const orderSec = next.text;
            const secTok = advance()!;
            const oRange: TMDOutlineRange = {
              startLine: secTok.range.start.line,
              startColumn: secTok.range.start.column,
              endLine: secTok.range.start.line,
              endColumn: secTok.range.start.column + secTok.range.length,
            };
            orderItems.push({ name: orderSec, range: oRange });
            orderEndPos = {
              offset: secTok.range.endOffset,
              line: secTok.range.start.line,
              column: secTok.range.start.column + secTok.range.length,
            };
          } else if (next.token.type === "relativeOrderPrefix" || next.token.type === "absoluteOrderPrefix") {
            let bracketStr = next.token.type === "relativeOrderPrefix" ? "{?" : "{?=";
            advance();
            while (pos < tokens.length && current()?.token.type !== "closeBrace" && current()?.token.type !== "eof") {
              const piece = advance();
              if (piece) bracketStr += piece.text;
            }
            if (current()?.token.type === "closeBrace") {
              bracketStr += "}";
              const braceTok = advance()!;
              orderEndPos = {
                offset: braceTok.range.endOffset,
                line: braceTok.range.start.line,
                column: braceTok.range.start.column + braceTok.range.length,
              };
            }
            orderSnippet.push(bracketStr);
          } else {
            orderSnippet.push(next.text);
            advance();
          }
        }
        continue;
      }

      if (tok.token.type === "arrowEnd") {
        if (!orderStartPos) {
          orderStartPos = tok.range.start;
        }
        orderSnippet.push("->#");
        const arrowEndTok = advance()!;
        const oRange: TMDOutlineRange = {
          startLine: arrowEndTok.range.start.line,
          startColumn: arrowEndTok.range.start.column,
          endLine: arrowEndTok.range.start.line,
          endColumn: arrowEndTok.range.start.column + arrowEndTok.range.length,
        };
        orderItems.push({ name: "#", range: oRange });
        orderEndPos = {
          offset: arrowEndTok.range.endOffset,
          line: arrowEndTok.range.start.line,
          column: arrowEndTok.range.start.column + arrowEndTok.range.length,
        };
        continue;
      }

      advance();
    }

    const result: TMDOutlineNode[] = [];

    // 1. Score Node
    const songName = scoreName.length > 0 ? scoreName : "Untitled";
    const scoreDetails: string[] = [];
    if (scoreSpeed !== undefined) {
      scoreDetails.push(`!= ${Number.isInteger(scoreSpeed) ? scoreSpeed : scoreSpeed}`);
    }
    if (scoreKey) {
      scoreDetails.push(`?= ${scoreKey}`);
    }
    if (scoreBeat) {
      scoreDetails.push(`<${scoreBeat}>`);
    }
    const scoreDetailStr = scoreDetails.length > 0 ? scoreDetails.join(", ") : undefined;

    const scoreStart = scoreHeaderStart ?? { offset: 0, line: 1, column: 1 };
    const scoreEnd = scoreHeaderEnd ?? { offset: 0, line: 1, column: 1 };
    const scoreRange: TMDOutlineRange = {
      startLine: scoreStart.line,
      startColumn: scoreStart.column,
      endLine: scoreEnd.line,
      endColumn: scoreEnd.column,
    };

    result.push({
      name: `Score: ${songName}`,
      detail: scoreDetailStr,
      kind: "class",
      range: scoreRange,
      selectionRange: scoreRange,
    });

    // 2. Sections Node
    const sectionOrder: string[] = [];
    const tracksBySection = new Map<string, TrackOccurrence[]>();
    for (const track of trackOccurrences) {
      if (!tracksBySection.has(track.sectionName)) {
        sectionOrder.push(track.sectionName);
        tracksBySection.set(track.sectionName, []);
      }
      tracksBySection.get(track.sectionName)!.push(track);
    }

    const sectionNodes: TMDOutlineNode[] = [];
    for (const secName of sectionOrder) {
      const tracks = tracksBySection.get(secName);
      if (!tracks || tracks.length === 0) continue;

      const minLine = Math.min(...tracks.map((t) => t.range.startLine));
      const minCol = tracks[0].range.startColumn;
      const maxLine = Math.max(...tracks.map((t) => t.range.endLine));
      const maxCol = tracks[tracks.length - 1].range.endColumn;
      const secRange: TMDOutlineRange = {
        startLine: minLine,
        startColumn: minCol,
        endLine: maxLine,
        endColumn: maxCol,
      };

      const trackNodes: TMDOutlineNode[] = tracks.map((track) => ({
        name: track.assignment,
        detail: track.detail,
        kind: "field",
        range: track.range,
        selectionRange: track.selectionRange,
      }));

      sectionNodes.push({
        name: secName,
        detail: `${trackNodes.length} track${trackNodes.length === 1 ? "" : "s"}`,
        kind: "namespace",
        range: secRange,
        selectionRange: secRange,
        children: trackNodes,
      });
    }

    if (sectionNodes.length > 0) {
      const sRange: TMDOutlineRange = {
        startLine: sectionNodes[0].range.startLine,
        startColumn: sectionNodes[0].range.startColumn,
        endLine: sectionNodes[sectionNodes.length - 1].range.endLine,
        endColumn: sectionNodes[sectionNodes.length - 1].range.endColumn,
      };
      result.push({
        name: "Sections",
        detail: `${sectionNodes.length} section${sectionNodes.length === 1 ? "" : "s"}`,
        kind: "namespace",
        range: sRange,
        selectionRange: sRange,
        children: sectionNodes,
      });
    }

    // 3. Playback Node
    if (orderItems.length > 0 || orderSnippet.length > 0) {
      const oStart = orderStartPos ?? { offset: 0, line: 1, column: 1 };
      const oEnd = orderEndPos ?? oStart;
      const oRange: TMDOutlineRange = {
        startLine: oStart.line,
        startColumn: oStart.column,
        endLine: oEnd.line,
        endColumn: oEnd.column,
      };

      const itemNodes: TMDOutlineNode[] = orderItems.map((item) => ({
        name: item.name,
        detail: item.detail,
        kind: "method",
        range: item.range,
        selectionRange: item.range,
      }));

      result.push({
        name: "Playback",
        detail: orderSnippet.join(" "),
        kind: "event",
        range: oRange,
        selectionRange: oRange,
        children: itemNodes.length > 0 ? itemNodes : undefined,
      });
    }

    return result;
  }

  public static extractSectionNames(source: string): string[] {
    const names = new Set<string>();
    try {
      const nodes = this.generate(source);
      const sectionsNode = nodes.find((n) => n.name === "Sections");
      if (sectionsNode && sectionsNode.children) {
        for (const c of sectionsNode.children) {
          names.add(c.name);
        }
      }
    } catch {
      // Fallback to regex below
    }

    // Fallback: extract section names even if AST parse fails due to incomplete syntax while typing
    const regex = /^\s*([a-zA-Z0-9_\u4e00-\u9fa5-]+)(?::[a-zA-Z0-9_\u4e00-\u9fa5-]+)?(?:@\|?[+-]?\d+\|?)?\s*\{/gm;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      const name = match[1];
      if (name !== "instruments") {
        names.add(name);
      }
    }

    return Array.from(names);
  }
}
