import { Beat } from "./types.js";
import { Lexer, Token, LexedToken } from "./parser.js";

export interface TMDMeasureIssue {
  paragraphName: string;
  instrument: string;
  lineNumber: number;
  measureIndex: number;
  expectedUnits: number;
  actualUnits: number;
  deltaUnits: number;
  noteLength: number;
  beat: Beat;
  snippet: string;
  description: string;
}

interface ParagraphSpanInfo {
  paragraphName: string;
  instrument: string;
  startLine: number;
  startOffset: number;
  measures: number;
  endMeasure: number;
  quarterNotes: number;
  endQuarterNotes: number;
}

function intValueOfToken(token: Token): number | undefined {
  if (token.type === "number" || token.type === "positiveNumber") {
    return token.value as number;
  }
  if (token.type === "note") {
    return token.value.degree as number;
  }
  return undefined;
}

function formatIssueDescription(issue: {
  paragraphName: string;
  instrument: string;
  lineNumber: number;
  measureIndex: number;
  expectedUnits: number;
  actualUnits: number;
  deltaUnits: number;
  noteLength: number;
  beat: Beat;
  snippet: string;
}): string {
  if (issue.instrument === "Order") {
    if (issue.paragraphName) {
      return `Order (line ${issue.lineNumber}): Undefined section '${issue.paragraphName}' in playback order (${issue.snippet})`;
    } else {
      return `Order (line ${issue.lineNumber}): ${issue.snippet}`;
    }
  }
  if (issue.snippet.startsWith("Unclosed paragraph")) {
    return `${issue.paragraphName}:${issue.instrument} (line ${issue.lineNumber}): ${issue.snippet}`;
  }
  const diffStr = issue.deltaUnits > 0 ? `+${issue.deltaUnits}` : `${issue.deltaUnits}`;
  if (issue.measureIndex === 0) {
    return `${issue.paragraphName}:${issue.instrument} (line ${issue.lineNumber}): Expected ${issue.expectedUnits} measures (${issue.snippet}), found ${issue.actualUnits} measures (${diffStr} measures)`;
  } else {
    let desc = `${issue.paragraphName}:${issue.instrument} (line ${issue.lineNumber}, measure ${issue.measureIndex}): Expected ${issue.expectedUnits} units (${issue.beat.count}/${issue.beat.noteValue} at <${issue.noteLength}*>), found ${issue.actualUnits} units (${diffStr} units)`;
    if (issue.snippet) {
      desc += `\n  --> | ${issue.snippet} |`;
    }
    return desc;
  }
}

export class TMDMeasureChecker {
  public static check(source: string): TMDMeasureIssue[] {
    const lexer = new Lexer(source);
    const tokensWithRanges = lexer.tokenizeWithRanges();

    // First, extract song-level default beat (<4/4>)
    let beat: Beat = { count: 4, noteValue: 4 };
    for (let i = 0; i < tokensWithRanges.length; i++) {
      if (tokensWithRanges[i].token.type === "openAngle") {
        if (
          i + 4 < tokensWithRanges.length &&
          tokensWithRanges[i + 2].token.type === "slash" &&
          tokensWithRanges[i + 4].token.type === "closeAngle"
        ) {
          const c = intValueOfToken(tokensWithRanges[i + 1].token) ?? 4;
          const n = intValueOfToken(tokensWithRanges[i + 3].token) ?? 4;
          beat = { count: c, noteValue: n };
          break;
        }
      }
    }

    const issues: TMDMeasureIssue[] = [];
    const paragraphInfos: ParagraphSpanInfo[] = [];
    const orderSections: { name: string; line: number }[] = [];
    let hasOrder = false;
    let terminatedWithHash = false;
    let lastOrderTokenLine = 1;
    let pos = 0;

    function current(): LexedToken | undefined {
      return pos < tokensWithRanges.length ? tokensWithRanges[pos] : undefined;
    }

    function advance(): LexedToken | undefined {
      if (pos < tokensWithRanges.length) {
        const tok = tokensWithRanges[pos];
        pos++;
        return tok;
      }
      return undefined;
    }

    while (pos < tokensWithRanges.length) {
      const tok = current();
      if (!tok) break;

      // Score title block: ** Title **
      if (tok.token.type === "doubleAsterisk") {
        advance();
        while (pos < tokensWithRanges.length && current()?.token.type !== "doubleAsterisk") {
          advance();
        }
        if (current()?.token.type === "doubleAsterisk") {
          advance();
        }
        continue;
      }

      // Paragraph header: identifier:identifier@...{ OR abstract paragraph: identifier{
      if (
        tok.token.type === "identifier" &&
        pos + 1 < tokensWithRanges.length &&
        ((tokensWithRanges[pos + 1].token.type === "colon" &&
          pos + 3 < tokensWithRanges.length &&
          tokensWithRanges[pos + 2].token.type === "identifier" &&
          tokensWithRanges[pos + 3].token.type === "at") ||
         tokensWithRanges[pos + 1].token.type === "openBrace")
      ) {
        const pName = tok.token.value as string;
        const paraStartLine = tok.range.start.line;
        advance(); // pName

        let instName = "";
        if (current()?.token.type === "colon") {
          advance(); // :
          const instTok = advance();
          if (instTok && instTok.token.type === "identifier") {
            instName = instTok.token.value as string;
          }
        }

        // Extract start offset from @|start| if present
        let startOffset = 0;
        while (pos < tokensWithRanges.length && current()?.token.type !== "openBrace") {
          if (current()?.token.type === "at") {
            advance(); // @
            if (current()?.token.type === "pipe") {
              advance(); // |
              let sign = 1;
              if (current()?.token.type === "tie") {
                sign = -1;
                advance(); // -
              }
              const numTok = current();
              if (numTok) {
                if (numTok.token.type === "number" || numTok.token.type === "positiveNumber") {
                  startOffset = sign * (numTok.token.value as number);
                  advance();
                } else if (numTok.token.type === "note") {
                  startOffset = sign * (numTok.token.value.degree as number);
                  advance();
                }
              }
              if (current()?.token.type === "pipe") {
                advance(); // |
              }
            }
            break;
          }
          advance();
        }

        // Advance until `{`
        while (pos < tokensWithRanges.length && current()?.token.type !== "openBrace") {
          advance();
        }
        if (current()?.token.type !== "openBrace") continue;
        advance(); // {

        // Parse inside paragraph
        let noteLength = 4;
        let currentBeat = beat;
        let currentMeasureUnits = 0;
        let currentMeasureSnippet: string[] = [];
        let measureCount = 0;
        let insideBar = false;
        let measureStartLine = paraStartLine;
        let paragraphQuarterNotes = 0.0;

        function expectedUnitsForMeasure(): number {
          const numerator = currentBeat.count * noteLength;
          return Math.max(1, Math.floor(numerator / currentBeat.noteValue));
        }

        let unclosedParagraph = false;
        while (pos < tokensWithRanges.length && current()?.token.type !== "closeBrace") {
          const item = current();
          if (!item) break;

          // If we hit an order arrow (->) or arrowEnd (->#) or another paragraph header,
          // the current paragraph was not properly closed with '}'. Break out to avoid swallowing orders!
          if (
            item.token.type === "arrow" ||
            item.token.type === "arrowEnd" ||
            (item.token.type === "identifier" &&
              pos + 1 < tokensWithRanges.length &&
              tokensWithRanges[pos + 1].token.type === "colon")
          ) {
            unclosedParagraph = true;
            break;
          }

          // Check for Section subdivision header: < noteLength * >
          if (item.token.type === "openAngle") {
            if (
              pos + 2 < tokensWithRanges.length &&
              tokensWithRanges[pos + 2].token.type === "asterisk"
            ) {
              advance(); // <
              const lenTok = advance();
              if (lenTok) {
                const val = intValueOfToken(lenTok.token);
                if (val !== undefined) {
                  noteLength = val;
                }
              }
              advance(); // *
              if (current()?.token.type === "closeAngle") {
                advance(); // >
              }
              continue;
            }
          }

          if (item.token.type === "pipe") {
            const pipeLine = item.range.start.line;
            advance(); // |

            if (insideBar && currentMeasureUnits > 0) {
              measureCount++;
              const expected = expectedUnitsForMeasure();
              const isPickup =
                startOffset < 0 &&
                measureCount === 1 &&
                currentMeasureUnits < expected &&
                currentMeasureUnits > 0;
              if (currentMeasureUnits !== expected && !isPickup) {
                const delta = currentMeasureUnits - expected;
                const snippetStr = currentMeasureSnippet.join(" ");
                const issueObj = {
                  paragraphName: pName,
                  instrument: instName,
                  lineNumber: measureStartLine,
                  measureIndex: measureCount,
                  expectedUnits: expected,
                  actualUnits: currentMeasureUnits,
                  deltaUnits: delta,
                  noteLength,
                  beat,
                  snippet: snippetStr,
                };
                issues.push({
                  ...issueObj,
                  description: formatIssueDescription(issueObj),
                });
              }
              currentMeasureUnits = 0;
              currentMeasureSnippet = [];
              measureStartLine = pipeLine;
            } else {
              insideBar = true;
              currentMeasureUnits = 0;
              currentMeasureSnippet = [];
              measureStartLine = pipeLine;
            }
            continue;
          }

          // Section directives do not consume musical time. Tempo and dynamics
          // may occur anywhere; a time signature must begin at a measure
          // boundary so all consumers agree on the following meter.
          if (item.token.type === "openBrace") {
            const directiveLine = item.range.start.line;
            advance(); // {

            let timeSignature: Beat | undefined;
            if (current()?.token.type === "openAngle") {
              advance(); // <
              const count = current() ? intValueOfToken(current()!.token) : undefined;
              if (count !== undefined) advance();
              if (current()?.token.type === "slash") advance();
              const noteValue = current() ? intValueOfToken(current()!.token) : undefined;
              if (noteValue !== undefined) advance();
              if (current()?.token.type === "closeAngle") advance();
              if (count !== undefined && noteValue !== undefined && count > 0 && noteValue > 0) {
                timeSignature = { count, noteValue };
              }
            }

            while (pos < tokensWithRanges.length && current()?.token.type !== "closeBrace") {
              advance();
            }
            if (current()?.token.type === "closeBrace") advance();

            if (timeSignature) {
              if (currentMeasureUnits !== 0) {
                const issueObj = {
                  paragraphName: pName,
                  instrument: instName,
                  lineNumber: directiveLine,
                  measureIndex: measureCount + 1,
                  expectedUnits: expectedUnitsForMeasure(),
                  actualUnits: currentMeasureUnits,
                  deltaUnits: currentMeasureUnits - expectedUnitsForMeasure(),
                  noteLength,
                  beat: currentBeat,
                  snippet: `Time signature directive must occur at a measure boundary: <${timeSignature.count}/${timeSignature.noteValue}>`,
                };
                issues.push({ ...issueObj, description: formatIssueDescription(issueObj) });
              } else {
                currentBeat = timeSignature;
              }
            }
            continue;
          }

          // Count unit duration
          const unitQuarterNotes = 4.0 / Math.max(1, noteLength);

          if (item.token.type === "openParen") {
            // Tuplet / unit group: ( ... ) % ( -- )
            advance(); // (
            const innerUnits: string[] = [];
            while (pos < tokensWithRanges.length && current()?.token.type !== "closeParen") {
              const inner = advance();
              if (inner) {
                innerUnits.push(inner.text);
              }
            }
            if (current()?.token.type === "closeParen") advance(); // )

            let length = 1;
            if (current()?.token.type === "percentOpenParen") {
              advance(); // %(
              let dashes = 0;
              while (pos < tokensWithRanges.length && current()?.token.type === "tie") {
                dashes++;
                advance();
              }
              if (current()?.token.type === "closeParen") advance(); // )
              length = Math.max(1, dashes);
            }

            paragraphQuarterNotes += length * unitQuarterNotes;
            if (insideBar) {
              currentMeasureUnits += length;
              currentMeasureSnippet.push(`(${innerUnits.join(" ")})`);
            }
            continue;
          }

          // Check for standard units: note, chord, tie, percussion, rest, drum identifiers
          switch (item.token.type) {
            case "note":
            case "chord":
            case "tie":
            case "percussion":
              advance();
              if (item.token.type === "note") {
                while (current()?.token.type === "plus") {
                  advance();
                  if (current()?.token.type === "note" || current()?.token.type === "number") advance();
                }
              }
              paragraphQuarterNotes += unitQuarterNotes;
              if (insideBar) {
                currentMeasureUnits += 1;
                currentMeasureSnippet.push(item.text);
              }
              break;
            case "identifier": {
              const val = typeof item.token.value === "string" ? item.token.value : item.text;
              if (val.length > 0 && /^[XxTtSsDdBbOoCc]+$/.test(val)) {
                advance();
                paragraphQuarterNotes += unitQuarterNotes;
                if (insideBar) {
                  currentMeasureUnits += 1;
                  currentMeasureSnippet.push(item.text);
                }
              } else {
                advance();
              }
              break;
            }
            case "number": {
              advance();
              const digitCount = Math.max(1, (item.text.match(/\d/g) || []).length);
              if (digitCount === 1 && /^[1-7]$/.test(item.text)) {
                while (current()?.token.type === "plus") {
                  advance();
                  if (current()?.token.type === "note" || current()?.token.type === "number") advance();
                }
              }
              paragraphQuarterNotes += digitCount * unitQuarterNotes;
              if (insideBar) {
                currentMeasureUnits += digitCount;
                currentMeasureSnippet.push(String(item.token.value));
              }
              break;
            }
            default:
              advance();
              break;
          }
        }

        if (current()?.token.type === "closeBrace") {
          advance(); // }
        } else {
          unclosedParagraph = true;
        }

        if (unclosedParagraph) {
          const issueObj = {
            paragraphName: pName,
            instrument: instName,
            lineNumber: paraStartLine,
            measureIndex: 0,
            expectedUnits: 0,
            actualUnits: 0,
            deltaUnits: 0,
            noteLength,
            beat,
            snippet: `Unclosed paragraph '{' for ${pName}:${instName}`,
          };
          issues.push({
            ...issueObj,
            description: formatIssueDescription(issueObj),
          });
        }

        const nominalMeasureDur = (Math.max(1, currentBeat.count) * 4.0) / Math.max(1, currentBeat.noteValue);
        const calculatedMeasures = Math.round(paragraphQuarterNotes / nominalMeasureDur);
        const actualMeasures = Math.max(measureCount, calculatedMeasures, 1);

        const endMeasure =
          startOffset < 0 ? Math.max(0, startOffset + actualMeasures) : startOffset + actualMeasures;
        const positiveQuarterNotes =
          startOffset < 0
            ? Math.max(0, paragraphQuarterNotes + startOffset * nominalMeasureDur)
            : startOffset * nominalMeasureDur + paragraphQuarterNotes;

        paragraphInfos.push({
          paragraphName: pName,
          instrument: instName,
          startLine: paraStartLine,
          startOffset,
          measures: actualMeasures,
          endMeasure,
          quarterNotes: paragraphQuarterNotes,
          endQuarterNotes: positiveQuarterNotes,
        });
      } else if (tok.token.type === "arrow") {
        const arrowLine = tok.range.start.line;
        lastOrderTokenLine = arrowLine;
        hasOrder = true;
        advance(); // ->
        const nextTok = current();
        if (nextTok) {
          lastOrderTokenLine = nextTok.range.start.line || arrowLine;
          if (nextTok.token.type === "arrowEnd") {
            terminatedWithHash = true;
            advance();
          } else if (nextTok.token.type === "openParen") {
            // S-expression in playback order: -> ( ... )
            let parenDepth = 0;
            while (pos < tokensWithRanges.length) {
              const cur = current();
              if (!cur) break;
              if (cur.token.type === "openParen") {
                parenDepth++;
                advance();
              } else if (cur.token.type === "closeParen") {
                parenDepth--;
                advance();
                if (parenDepth === 0) break;
              } else if (cur.token.type === "arrow" || cur.token.type === "arrowEnd") {
                break;
              } else {
                advance();
              }
            }
          } else if (nextTok.token.type === "identifier") {
            const orderSecName = nextTok.token.value as string;
            if (orderSecName === "#") {
              terminatedWithHash = true;
            }
            orderSections.push({ name: orderSecName, line: lastOrderTokenLine });
            advance();
          }
        }
      } else if (tok.token.type === "arrowEnd") {
        lastOrderTokenLine = tok.range.start.line;
        hasOrder = true;
        terminatedWithHash = true;
        advance();
      } else {
        advance();
      }
    }

    // Check playback order existence and termination
    if (!hasOrder) {
      let lastLine = 1;
      for (let i = tokensWithRanges.length - 1; i >= 0; i--) {
        if (tokensWithRanges[i].token.type !== "eof") {
          lastLine = tokensWithRanges[i].range.start.line;
          break;
        }
      }
      const issueObj = {
        paragraphName: "",
        instrument: "Order",
        lineNumber: lastLine,
        measureIndex: 0,
        expectedUnits: 0,
        actualUnits: 0,
        deltaUnits: 0,
        noteLength: 4,
        beat,
        snippet: "Missing playback order",
      };
      issues.push({
        ...issueObj,
        description: formatIssueDescription(issueObj),
      });
    } else if (!terminatedWithHash) {
      const issueObj = {
        paragraphName: "",
        instrument: "Order",
        lineNumber: lastOrderTokenLine,
        measureIndex: 0,
        expectedUnits: 0,
        actualUnits: 0,
        deltaUnits: 0,
        noteLength: 4,
        beat,
        snippet: "Playback order must terminate with '#'",
      };
      issues.push({
        ...issueObj,
        description: formatIssueDescription(issueObj),
      });
    }

    // Check for undefined sections referenced in execution orders (-> section)
    const definedSectionNames = new Set(paragraphInfos.map((p) => p.paragraphName));
    for (const order of orderSections) {
      if (order.name === "#") {
        continue;
      }
      if (!definedSectionNames.has(order.name)) {
        const issueObj = {
          paragraphName: order.name,
          instrument: "Order",
          lineNumber: order.line,
          measureIndex: 0,
          expectedUnits: 0,
          actualUnits: 0,
          deltaUnits: 0,
          noteLength: 4,
          beat,
          snippet: `-> ${order.name}`,
        };
        issues.push({
          ...issueObj,
          description: formatIssueDescription(issueObj),
        });
      }
    }

    // Note: in TMD, tracks within the same section may enter and exit freely (staggered entrance,
    // early exit / solos / breakdowns). TMDPlaybackRenderer pads trailing silence up to durationOf(section),
    // so shorter tracks are considered natural implicit rests rather than errors.

    return issues;
  }
}
