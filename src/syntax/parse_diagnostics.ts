import { FULLWIDTH_PUNCT_MAP, type SourceRange, type Token } from "./tokens.js";

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

