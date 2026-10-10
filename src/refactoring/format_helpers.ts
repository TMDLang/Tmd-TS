export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PARAGRAPH_HEADER_REGEX =
  /^([a-zA-Z0-9_\u4e00-\u9fa5-]+)\s*:\s*([a-zA-Z0-9_\u4e00-\u9fa5-]+)(@[^{]*)?\s*\{/;
const GRID_SUBDIVISION_REGEX = /^<(\d+)\*>/;

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

export function formatMusicalUnits(text: string): string {
  let output = "";
  const chars = Array.from(text);
  let i = 0;
  let lastWasSpace = false;

  while (i < chars.length) {
    const ch = chars[i];
    if (ch === "|") {
      if (output.length > 0 && !output.endsWith(" ")) {
        output += " ";
      }
      output += "| ";
      lastWasSpace = true;
      while (i + 1 < chars.length && (chars[i + 1] === " " || chars[i + 1] === "\t")) {
        i++;
      }
    } else if (ch === " " || ch === "\t") {
      if (!lastWasSpace && output.length > 0) {
        output += " ";
        lastWasSpace = true;
      }
    } else {
      output += ch;
      lastWasSpace = false;
    }
    i++;
  }

  return output.trim();
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

export function formatLine(line: string, indent = 0): string {
  const indentPrefix = "    ".repeat(indent);
  let working = line;
  let commentSuffix = "";

  // Extract inline block comment if present at end of line
  const commentStart = working.indexOf("/*");
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
  if (trimmed.startsWith("<") && trimmed.endsWith(">") && trimmed.includes("/")) {
    return trimmed + commentSuffix;
  }

  // Paragraph header line: e.g. intro:Piano@|0|{
  if (trimmed.includes(":") && trimmed.includes("@") && trimmed.endsWith("{")) {
    const colonIdx = trimmed.indexOf(":");
    const pName = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).trim();
    const atIdx = rest.indexOf("@");
    if (atIdx !== -1) {
      const inst = rest.slice(0, atIdx).trim();
      const timing = rest.slice(atIdx + 1).trim();
      return `${pName}:${inst}@${timing}` + commentSuffix;
    }
  }

  // Section header line: <4*> or <16*>
  if (trimmed.startsWith("<") && trimmed.endsWith("*>")) {
    return indentPrefix + trimmed + commentSuffix;
  }

  // Closing brace
  if (trimmed === "}") {
    return "}" + commentSuffix;
  }

  // Orders line: -> ...
  if (trimmed.startsWith("->")) {
    const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0);
    const orderTokens: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t === "->" || t === "->#") {
        orderTokens.push(t);
      } else if (t.startsWith("->")) {

        orderTokens.push("->");
        const sub = t.slice(2);
        if (sub.length > 0) {
          orderTokens.push(sub);
        }
      } else {
        orderTokens.push(t);
      }
      i++;
    }
    return orderTokens.join(" ") + commentSuffix;
  }

  // Content / measure line
  const formattedContent = formatMusicalUnits(trimmed);
  return indentPrefix + formattedContent + commentSuffix;
}
