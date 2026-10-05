import { Lexer } from "../syntax/lexer.js";

export function parseTupletToken(tok: string): { inner: string; dashes: string } | null {
  const matchWithLen = tok.match(/^\(([^)]+)\)\s*%\s*\(([-]+)\)$/);
  if (matchWithLen) {
    return { inner: matchWithLen[1].trim(), dashes: matchWithLen[2] };
  }
  const matchWithoutLen = tok.match(/^\(([^)]+)\)$/);
  if (matchWithoutLen) {
    return { inner: matchWithoutLen[1].trim(), dashes: "-" };
  }
  return null;
}
export function measureUnits(line: string): string[] {
  const lexed = new Lexer(line).tokenizeWithRanges().filter(({ token }) => token.type !== "eof");
  const units: string[] = [];
  let index = 0;

  while (index < lexed.length) {
    const current = lexed[index];
    if (current.token.type === "pipe") {
      units.push(current.text);
      index++;
      continue;
    }

    if (current.token.type === "openParen") {
      const innerEnd = lexed.findIndex((item, offset) => offset >= index && item.token.type === "closeParen");
      if (innerEnd >= index) {
        const inner = lexed.slice(index + 1, innerEnd).map(({ text }) => text).join(" ");
        let end = innerEnd + 1;
        let dashes = "";
        if (lexed[end]?.token.type === "percentOpenParen") {
          const dashEnd = lexed.findIndex((item, offset) => offset > end && item.token.type === "closeParen");
          if (dashEnd > end) {
            dashes = lexed.slice(end + 1, dashEnd)
              .filter(({ token }) => token.type === "tie")
              .map(() => "-")
              .join("");
            end = dashEnd + 1;
          }
        }
        units.push(dashes ? `(${inner})%(${dashes})` : `(${inner})`);
        index = end;
        continue;
      }
    }

    let unit = current.text;
    let end = index + 1;
    while (
      end < lexed.length &&
      lexed[end].token.type === "tie" &&
      lexed[end - 1].range.endOffset === lexed[end].range.start.offset
    ) {
      unit += lexed[end].text;
      end++;
    }
    units.push(unit);
    index = end;
  }
  return units;
}

export function containsTransposableUnit(line: string): boolean {
  if (line.trimStart().startsWith("<")) return false;
  return new Lexer(line).tokenize().some(({ type }) => type === "note" || type === "chord");
}
