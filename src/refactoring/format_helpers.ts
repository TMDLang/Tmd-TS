export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PARAGRAPH_HEADER_REGEX =
  /^([a-zA-Z0-9_\u4e00-\u9fa5-]+)\s*:\s*([a-zA-Z0-9_\u4e00-\u9fa5-]+)(?:\s*\[[^\]]*\])?\s*(@[^{]*)?\s*\{/;
const GRID_SUBDIVISION_REGEX = /^<(\d+)\*>/;
const LYRIC_LINE_REGEX = /^L(\d+)?\s*\|(.*)$/;

export function parseLyricStanzaIndex(trimmedLine: string): number | undefined {
  const commentIdx = findInlineCommentStart(trimmedLine);
  const clean = (commentIdx !== -1 ? trimmedLine.slice(0, commentIdx) : trimmedLine).trim();
  const match = clean.match(LYRIC_LINE_REGEX);
  if (!match) return undefined;
  if (!match[1]) return 0;
  return parseInt(match[1], 10);
}

export function formatLyricBody(text: string): string {
  const chars = Array.from(text);
  const tokens: string[] = [];
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if (ch === "|") {
      tokens.push("|");
      i++;
      continue;
    }
    if (ch === "(") {
      const closeIdx = findMatchingDelimiter(chars, i, "(", ")");
      if (closeIdx !== -1) {
        const innerRaw = chars.slice(i + 1, closeIdx).join("");
        const formattedInner = formatLyricBody(innerRaw);
        tokens.push(`(${formattedInner})`);
        i = closeIdx + 1;
        continue;
      }
    }
    let token = "";
    while (
      i < chars.length &&
      chars[i] !== " " &&
      chars[i] !== "\t" &&
      chars[i] !== "|" &&
      chars[i] !== "(" &&
      chars[i] !== ")"
    ) {
      token += chars[i];
      i++;
    }
    if (token.length > 0) {
      tokens.push(token);
    } else {
      tokens.push(chars[i]);
      i++;
    }
  }

  return tokens.join(" ");
}

export function parseParagraphHeaderLine(
  trimmedLine: string
): { section: string; instrument: string } | undefined {
  const match = trimmedLine.match(PARAGRAPH_HEADER_REGEX);
  if (!match) return undefined;
  return {
    section: match[1],
    instrument: match[2],
  };
}

export function parseGridSubdivisionLine(trimmedLine: string): number | undefined {
  const match = trimmedLine.match(GRID_SUBDIVISION_REGEX);
  if (!match) return undefined;
  const parsed = parseInt(match[1], 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function matchesRefactorTarget(
  target: { section?: string; instrument?: string } | undefined,
  section: string,
  instrument: string
): boolean {
  if (!target) return true;
  if (target.section && target.section !== section) return false;
  if (target.instrument && target.instrument !== instrument) return false;
  return true;
}

function readCanonicalNote(chars: string[], startIdx: number): { note: string; nextIdx: number } | null {
  if (startIdx >= chars.length) return null;
  const deg = chars[startIdx];
  if (deg < "1" || deg > "7") return null;

  let idx = startIdx + 1;
  let accidentals = "";
  let octaves = "";

  while (idx < chars.length) {
    const ch = chars[idx];
    if (ch === "'" || ch === ",") {
      accidentals += ch;
      idx++;
    } else if (ch === "^" || ch === "_") {
      octaves += ch;
      idx++;
    } else {
      break;
    }
  }

  return {
    note: `${deg}${accidentals}${octaves}`,
    nextIdx: idx,
  };
}

function findMatchingDelimiter(chars: string[], openIdx: number, openChar: string, closeChar: string): number {
  let depth = 0;
  for (let i = openIdx; i < chars.length; i++) {
    if (chars[i] === openChar) depth++;
    else if (chars[i] === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function formatInlineDirective(rawInner: string): string {
  const trimmed = rawInner.trim();
  if (/^key\s*=/i.test(trimmed)) {
    const eqIdx = trimmed.indexOf("=");
    const val = trimmed.slice(eqIdx + 1).replace(/\s+/g, "");
    return `{key= ${val}}`;
  }
  return `{${trimmed.replace(/\s+/g, "")}}`;
}

export function formatChordToken(rawInner: string): string {
  const normalized = rawInner
    .trim()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, "");
  return `[${normalized}]`;
}

export function formatMusicalUnits(text: string): string {
  const chars = Array.from(text);
  const tokens: string[] = [];
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];

    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }

    if (ch === "|") {
      tokens.push("|");
      i++;
      continue;
    }

    if (ch === "{") {
      const closeIdx = findMatchingDelimiter(chars, i, "{", "}");
      if (closeIdx !== -1) {
        const rawInner = chars.slice(i + 1, closeIdx).join("");
        tokens.push(formatInlineDirective(rawInner));
        i = closeIdx + 1;
        continue;
      }
    }

    if (ch === "[") {
      const closeIdx = findMatchingDelimiter(chars, i, "[", "]");
      if (closeIdx !== -1) {
        const rawInner = chars.slice(i + 1, closeIdx).join("");
        tokens.push(formatChordToken(rawInner));
        i = closeIdx + 1;
        continue;
      }
    }

    if (ch === "(") {
      const closeIdx = findMatchingDelimiter(chars, i, "(", ")");
      if (closeIdx !== -1) {
        const innerRaw = chars.slice(i + 1, closeIdx).join("");
        const formattedInner = formatMusicalUnits(innerRaw);
        const nextIdx = closeIdx + 1;
        let scanIdx = nextIdx;
        while (scanIdx < chars.length && (chars[scanIdx] === " " || chars[scanIdx] === "\t")) {
          scanIdx++;
        }
        if (scanIdx < chars.length && chars[scanIdx] === "%") {
          scanIdx++;
          while (scanIdx < chars.length && (chars[scanIdx] === " " || chars[scanIdx] === "\t")) {
            scanIdx++;
          }
          if (scanIdx < chars.length && chars[scanIdx] === "(") {
            const durCloseIdx = findMatchingDelimiter(chars, scanIdx, "(", ")");
            if (durCloseIdx !== -1) {
              const durInner = chars.slice(scanIdx + 1, durCloseIdx).join("").replace(/\s+/g, "");
              tokens.push(`(${formattedInner})%(${durInner})`);
              i = durCloseIdx + 1;
              continue;
            }
          }
        }
        tokens.push(`(${formattedInner})`);
        i = nextIdx;
        continue;
      }
    }

    if (ch >= "1" && ch <= "7") {
      const firstNote = readCanonicalNote(chars, i);
      if (firstNote) {
        let noteToken = firstNote.note;
        let curIdx = firstNote.nextIdx;

        while (curIdx < chars.length) {
          let lookIdx = curIdx;
          while (lookIdx < chars.length && (chars[lookIdx] === " " || chars[lookIdx] === "\t")) {
            lookIdx++;
          }
          if (lookIdx < chars.length && chars[lookIdx] === "+") {
            lookIdx++;
            while (lookIdx < chars.length && (chars[lookIdx] === " " || chars[lookIdx] === "\t")) {
              lookIdx++;
            }
            const nextNote = readCanonicalNote(chars, lookIdx);
            if (nextNote) {
              noteToken += `+${nextNote.note}`;
              curIdx = nextNote.nextIdx;
              continue;
            }
          }
          break;
        }

        tokens.push(noteToken);
        i = curIdx;
        continue;
      }
    }

    if (ch === "0" || ch === "-") {
      tokens.push(ch);
      i++;
      continue;
    }

    let word = "";
    while (
      i < chars.length &&
      chars[i] !== " " &&
      chars[i] !== "\t" &&
      chars[i] !== "|" &&
      chars[i] !== "{" &&
      chars[i] !== "}" &&
      chars[i] !== "[" &&
      chars[i] !== "]" &&
      chars[i] !== "(" &&
      chars[i] !== ")" &&
      chars[i] !== "-" &&
      !(chars[i] >= "0" && chars[i] <= "7")
    ) {
      word += chars[i];
      i++;
    }
    if (word.length > 0) {
      tokens.push(word);
    } else {
      tokens.push(chars[i]);
      i++;
    }
  }

  return tokens.join(" ");
}

export function reindentBlockComment(lines: string[], indentPrefix: string): string[] {
  if (lines.length === 1) {
    return [indentPrefix + lines[0].trim()];
  }
  const firstLine = lines[0];
  const firstMatch = firstLine.match(/^(\s*)/);
  const baseIndent = firstMatch ? firstMatch[1].length : 0;

  return lines.map((line, idx) => {
    if (idx === 0) {
      return indentPrefix + line.trimStart();
    }
    if (line.trim().length === 0) {
      return "";
    }
    const match = line.match(/^(\s*)/);
    const lineIndent = match ? match[1].length : 0;
    const relIndent = Math.max(0, lineIndent - baseIndent);
    return indentPrefix + " ".repeat(relIndent) + line.trimStart();
  });
}

export function findInlineCommentStart(line: string): number {
  let inQuotes = false;
  for (let i = 0; i < line.length - 1; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && line[i] === "/" && line[i + 1] === "*") {
      return i;
    }
  }
  return -1;
}

export type TopLevelBlockKind = "header" | "metadata" | "entry" | "playback" | "other";

export function classifyTopLevelLine(trimmedLine: string): TopLevelBlockKind {
  const commentIdx = findInlineCommentStart(trimmedLine);
  const clean = (commentIdx !== -1 ? trimmedLine.slice(0, commentIdx) : trimmedLine).trim();
  if (
    clean.startsWith("::SCORE::") ||
    (clean.startsWith("**") && clean.endsWith("**") && clean.length > 4) ||
    clean.startsWith("!=") ||
    clean.startsWith("! =") ||
    clean.startsWith("?=") ||
    clean.startsWith("? =") ||
    /^key\s*=/i.test(clean) ||
    (clean.startsWith("<") && clean.endsWith(">") && clean.includes("/"))
  ) {
    return "header";
  }
  if (/^~\s*"/.test(clean) || /^=\s*~\s*:/.test(clean)) {
    return "metadata";
  }
  if (clean.endsWith("{")) {
    return "entry";
  }
  if (clean.startsWith("->")) {
    return "playback";
  }
  return "other";
}

export function formatLine(line: string, indent = 0): string {
  const indentPrefix = "    ".repeat(indent);
  let working = line;
  let commentSuffix = "";

  // Extract inline block comment if present at end of line (outside quotes)
  const commentStart = findInlineCommentStart(working);
  if (commentStart !== -1) {
    const commentText = working.slice(commentStart);
    working = working.slice(0, commentStart);
    commentSuffix = "  " + commentText.trim();
  }

  const trimmed = working.trim();

  // Check if header line
  if (trimmed.startsWith("::SCORE::")) {
    return "::SCORE::" + commentSuffix;
  }
  if (trimmed.startsWith("**") && trimmed.endsWith("**") && trimmed.length > 4) {
    const title = trimmed.slice(2, -2).trim();
    return `** ${title} **` + commentSuffix;
  }
  if (trimmed.startsWith("!=") || trimmed.startsWith("! =")) {
    const value = (trimmed.startsWith("! =") ? trimmed.slice(3) : trimmed.slice(2)).trim();
    return `!= ${value}` + commentSuffix;
  }
  if (trimmed.startsWith("?=") || trimmed.startsWith("? =")) {
    const value = (trimmed.startsWith("? =") ? trimmed.slice(3) : trimmed.slice(2)).trim();
    return `?= ${value}` + commentSuffix;
  }
  if (/^key\s*=/i.test(trimmed)) {
    const eqIdx = trimmed.indexOf("=");
    const value = trimmed.slice(eqIdx + 1).trim();
    return `key= ${value}` + commentSuffix;
  }
  if (trimmed.startsWith("<") && trimmed.endsWith(">") && trimmed.includes("/")) {
    return trimmed + commentSuffix;
  }

  // Metadata lines: ~ "..." or =~:__KEY__= "..."
  const creditMetaMatch = trimmed.match(/^~\s*"([^"]*)"$/);
  if (creditMetaMatch) {
    return `~ "${creditMetaMatch[1]}"` + commentSuffix;
  }
  const namedMetaMatch = trimmed.match(/^=\s*~\s*:\s*_*([A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)_*\s*=\s*"([^"]*)"$/);
  if (namedMetaMatch) {
    return `=~:__${namedMetaMatch[1]}__= "${namedMetaMatch[2]}"` + commentSuffix;
  }

  // Paragraph / Show header line: e.g. intro:Piano[pitchMode=fixed]@|0|{ or show:Lighting@intro{
  if (trimmed.includes("@") && trimmed.endsWith("{")) {
    const atIdx = trimmed.indexOf("@");
    const head = trimmed.slice(0, atIdx).trim();
    const timing = trimmed.slice(atIdx + 1).replace(/\s+/g, "");
    const colonIdx = head.indexOf(":");
    if (colonIdx !== -1) {
      const pName = head.slice(0, colonIdx).trim();
      const inst = head
        .slice(colonIdx + 1)
        .trim()
        .replace(/\s*\[\s*/g, "[")
        .replace(/\s*=\s*/g, "=")
        .replace(/\s*\]/g, "]");
      return `${pName}:${inst}@${timing}` + commentSuffix;
    }
    return `${head}@${timing}` + commentSuffix;
  }

  // Abstract prototype header: e.g. Theme {
  const protoMatch = trimmed.match(/^([a-zA-Z0-9_\u4e00-\u9fa5-]+)\s*\{$/);
  if (protoMatch) {
    return `${protoMatch[1]} {` + commentSuffix;
  }

  // Section header line: <4*> or <16*>
  if (trimmed.startsWith("<") && trimmed.endsWith("*>")) {
    return indentPrefix + trimmed.replace(/\s+/g, "") + commentSuffix;
  }

  // Closing brace
  if (trimmed === "}") {
    return "}" + commentSuffix;
  }

  // Orders line: -> ...
  if (trimmed.startsWith("->")) {
    const normalized = trimmed
      .replace(/\s*\[\s*([^\]]*?)\s*\]/g, (_, inner: string) => `[${inner.replace(/\s+/g, "")}]`)
      .replace(/\{([^}]*)\}/g, (_, inner: string) => formatInlineDirective(inner))
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .replace(/->\s*#/g, " -># ")
      .replace(/->(?!#)/g, " -> ")
      .trim()
      .replace(/\s+/g, " ");
    return indentPrefix + normalized + commentSuffix;
  }

  // Lyric line: L| ... or L1| ...
  const lyricMatch = trimmed.match(LYRIC_LINE_REGEX);
  if (lyricMatch) {
    const stanzaNum = lyricMatch[1] ?? "";
    const prefix = `L${stanzaNum}|`;
    let body = formatLyricBody(lyricMatch[2]);
    while (body.startsWith("|")) {
      body = body.slice(1).trimStart();
    }
    while (body.endsWith("|")) {
      body = body.slice(0, -1).trimEnd();
    }
    if (body.length === 0) {
      return `${indentPrefix}${prefix} |${commentSuffix}`;
    }
    return `${indentPrefix}${prefix} ${body} |${commentSuffix}`;
  }

  // Content / measure line
  const formattedContent = formatMusicalUnits(trimmed);
  if (formattedContent.length === 0) {
    return commentSuffix.trimStart();
  }
  const hasOnlyDirectives = /^(\{[^}]*\}\s*)+$/.test(formattedContent);
  let measureLine = formattedContent;
  if (!hasOnlyDirectives && measureLine !== "|") {
    if (!measureLine.startsWith("|")) {
      measureLine = `| ${measureLine}`;
    }
    if (!measureLine.endsWith("|")) {
      measureLine = `${measureLine} |`;
    }
  }
  return indentPrefix + measureLine + commentSuffix;
}
