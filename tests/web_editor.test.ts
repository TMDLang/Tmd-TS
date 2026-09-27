import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect,it } from "vitest";

import { en } from "../web/src/locales/en.js";
import { zhTW } from "../web/src/locales/zh-TW.js";

describe("Web Studio Editor Configuration (TDD)", () => {
  it("allows typing tab by binding indentWithTab in keymap", () => {
    const editorPath = path.join(__dirname, "../web/src/editor.ts");
    const editorContent = fs.readFileSync(editorPath, "utf-8");

    // Must import indentWithTab
    expect(editorContent).toMatch(/import\s*\{[^}]*indentWithTab[^}]*\}\s*from\s*["']@codemirror\/commands["']/);

    // Must include indentWithTab in keymap extensions
    expect(editorContent).toMatch(/indentWithTab/);
  });

  it("supports highlighting problematic measures with custom styles in editor", () => {
    const editorPath = path.join(__dirname, "../web/src/editor.ts");
    const editorContent = fs.readFileSync(editorPath, "utf-8");

    // Must expose setMeasureIssues method or decoration effect
    expect(editorContent).toContain("setMeasureIssues");
    expect(editorContent).toContain("cm-measure-issue");

    // Check CSS styling in styles.css
    const cssPath = path.join(__dirname, "../web/src/styles.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");
    expect(cssContent).toContain(".cm-measure-issue");
  });

  it("displays hover tooltip with error description when hovering over problematic line", () => {
    const editorPath = path.join(__dirname, "../web/src/editor.ts");
    const editorContent = fs.readFileSync(editorPath, "utf-8");

    // Must import hoverTooltip from @codemirror/view
    expect(editorContent).toMatch(/import\s*\{[^}]*hoverTooltip[^}]*\}\s*from\s*["']@codemirror\/view["']/);

    // Must configure hoverTooltip in editor extensions
    expect(editorContent).toContain("hoverTooltip");
    expect(editorContent).toContain("cm-issue-tooltip");

    // Must define CSS styles for error tooltip in styles.css
    const cssPath = path.join(__dirname, "../web/src/styles.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");
    expect(cssContent).toContain(".cm-issue-tooltip");
  });

  it("includes comprehensive syntax help for accidentals (1', 2,) and tuplets (1 2)%(-) in Help modal and locales", () => {
    const htmlPath = path.join(__dirname, "../web/index.html");
    const html = fs.readFileSync(htmlPath, "utf-8");

    expect(html).toContain('id="help-modal"');
    expect(html).toContain('data-i18n="helpLiAccidentals"');
    expect(html).toContain('data-i18n="helpLiTuplets"');

    // Check zh-TW
    expect((zhTW as any).helpLiAccidentals).toBeDefined();
    expect((zhTW as any).helpLiAccidentals).toContain("1'");
    expect((zhTW as any).helpLiAccidentals).toContain("2,");
    expect((zhTW as any).helpLiTuplets).toBeDefined();
    expect((zhTW as any).helpLiTuplets).toContain("(1 2)%(-)");
    expect((zhTW as any).helpLiTuplets).toContain("(1 2 3)%(-)");

    // Check en
    expect((en as any).helpLiAccidentals).toBeDefined();
    expect((en as any).helpLiAccidentals).toContain("1'");
    expect((en as any).helpLiAccidentals).toContain("2,");
    expect((en as any).helpLiTuplets).toBeDefined();
    expect((en as any).helpLiTuplets).toContain("(1 2)%(-)");
    expect((en as any).helpLiTuplets).toContain("(1 2 3)%(-)");
  });

  it("binds browser-safe Mod-Shift-F for format hotkey and updates UI labels", () => {
    const editorPath = path.join(__dirname, "../web/src/editor.ts");
    const editorContent = fs.readFileSync(editorPath, "utf-8");

    // CodeMirror keymap must bind Mod-Shift-f
    expect(editorContent).toContain('"Mod-Shift-f"');

    // Locales must reflect Cmd+Shift+F or Ctrl+Shift+F
    expect((zhTW as any).toolFormatDocument).toContain("Shift+F");
    expect((en as any).toolFormatDocument).toContain("Shift+F");
  });

  it("supports syntax highlighting for abstract paragraphs and S-Expression macros", async () => {
    const { tmdStreamParser } = await import("../web/src/syntax.js");

    const tokenize = (line: string) => {
      const state = tmdStreamParser.startState();
      const tokens: { text: string; type: string | null }[] = [];
      let pos = 0;
      while (pos < line.length) {
        const stream = {
          string: line,
          pos,
          start: pos,
          eatSpace: () => {
            const m = line.slice(pos).match(/^[ \t]+/);
            if (m) {
              pos += m[0].length;
              return true;
            }
            return false;
          },
          match: (pattern: RegExp | string) => {
            const rest = line.slice(pos);
            if (typeof pattern === "string") {
              if (rest.startsWith(pattern)) {
                pos += pattern.length;
                return [pattern];
              }
              return null;
            }
            const m = rest.match(pattern);
            if (m && m.index === 0) {
              pos += m[0].length;
              return m;
            }
            return null;
          },
          next: () => {
            if (pos < line.length) {
              const ch = line[pos];
              pos++;
              return ch;
            }
            return null;
          },
        };
        const before = pos;
        const type = tmdStreamParser.token(stream as any, state as any);
        if (pos > before) {
          tokens.push({ text: line.slice(before, pos), type });
        } else {
          break;
        }
      }
      return tokens;
    };

    // Test 1: Abstract paragraph header `Theme {`
    const pTokens = tokenize("Theme {");
    expect(pTokens.some(t => t.text.includes("Theme") && t.type === "def")).toBe(true);

    // Test 2: S-Expression macro `(canon Theme (V1 V2) 2)`
    const mTokens = tokenize("(canon Theme (V1 V2) 2)");
    expect(mTokens.some(t => t.text === "(" && t.type === "bracket")).toBe(true);
    expect(mTokens.some(t => t.text === "canon" && (t.type === "keyword" || t.type === "builtin"))).toBe(true);
    expect(mTokens.some(t => t.text === "Theme" && t.type === "variableName")).toBe(true);
    expect(mTokens.some(t => t.text === "2" && t.type === "number")).toBe(true);
  });

  it("highlights explicit tonality and dynamics directives", async () => {
    const { tmdStreamParser } = await import("../web/src/syntax.js");
    const tokenize = (line: string) => {
      const state = tmdStreamParser.startState();
      const tokens: { text: string; type: string | null }[] = [];
      let pos = 0;
      while (pos < line.length) {
        const stream = {
          string: line,
          pos,
          start: pos,
          eatSpace: () => {
            const match = line.slice(pos).match(/^[ \t]+/);
            if (!match) return false;
            pos += match[0].length;
            return true;
          },
          match: (pattern: RegExp | string) => {
            const rest = line.slice(pos);
            if (typeof pattern === "string") {
              if (!rest.startsWith(pattern)) return null;
              pos += pattern.length;
              return [pattern];
            }
            const match = rest.match(pattern);
            if (!match || match.index !== 0) return null;
            pos += match[0].length;
            return match;
          },
          next: () => pos < line.length ? line[pos++] : null,
        };
        const before = pos;
        const type = tmdStreamParser.token(stream as any, state as any);
        if (pos === before) break;
        tokens.push({ text: line.slice(before, pos), type });
      }
      return tokens;
    };

    const tokens = tokenize("key= Bm {key= F#m} {p} {fff}");
    expect(tokens.some((token) => token.text.startsWith("key=") && token.type === "atom")).toBe(true);
    expect(tokens.filter((token) => token.type === "operator").map((token) => token.text)).toEqual([
      "{key= F#m}", "{p}", "{fff}",
    ]);
  });

  it("supports gutter play button and cursor context for default track without instrument", () => {
    const editorPath = path.join(__dirname, "../web/src/editor.ts");
    const editorContent = fs.readFileSync(editorPath, "utf-8");

    // Gutter marker should support abstract/default paragraphs
    expect(editorContent).toContain("abstractMatch");
    expect(editorContent).toContain("DEFAULT_INSTRUMENT");

    // Cursor context should resolve default track to DEFAULT_INSTRUMENT
    expect(editorContent).toMatch(/instrument\s*=\s*DEFAULT_INSTRUMENT/);
  });

  it("integrates LSP client into TMDWebEditor for diagnostics, completions, and formatting", () => {
    const editorPath = path.join(__dirname, "../web/src/editor.ts");
    const editorContent = fs.readFileSync(editorPath, "utf-8");

    // Must import and instantiate TMDWebLSPClient
    expect(editorContent).toContain("TMDWebLSPClient");
    expect(editorContent).toContain("lspClient");

    // Must configure CodeMirror linter extension
    expect(editorContent).toMatch(/import\s*\{[^}]*linter[^}]*\}\s*from\s*["']@codemirror\/lint["']/);
    expect(editorContent).toContain("linter(");

    // Must configure CodeMirror autocompletion extension
    expect(editorContent).toMatch(/import\s*\{[^}]*autocompletion[^}]*\}\s*from\s*["']@codemirror\/autocomplete["']/);
    expect(editorContent).toContain("autocompletion(");

    // TMDWebEditor interface must expose lspClient and formatDocument
    expect(editorContent).toContain("lspClient: TMDWebLSPClient");
    expect(editorContent).toContain("formatDocument(): Promise<void>");
  });

  it("reuses the editor LSP client for lint diagnostics", () => {
    const editorPath = path.join(__dirname, "../web/src/editor.ts");
    const editorContent = fs.readFileSync(editorPath, "utf-8");
    const linterBody = editorContent.slice(editorContent.indexOf("const tmdLinter"), editorContent.indexOf("const setMeasureIssuesEffect"));
    expect(linterBody).not.toContain("new TMDWebLSPClient");
    expect(linterBody).toContain("lspClient.diagnose");
  });

  it("configures autocompletion with hotkeys (Mod-Space, Ctrl-Space) and activateOnTyping", () => {
    const editorPath = path.join(__dirname, "../web/src/editor.ts");
    const editorContent = fs.readFileSync(editorPath, "utf-8");

    // Must bind Mod-Space and Ctrl-Space for startCompletion and include completionKeymap
    expect(editorContent).toContain('"Mod-Space"');
    expect(editorContent).toContain('"Ctrl-Space"');
    expect(editorContent).toContain("startCompletion");
    expect(editorContent).toContain("completionKeymap");

    // Must activate on typing
    expect(editorContent).toContain("activateOnTyping: true");

    // Must match macro triggers before order triggers
    expect(editorContent).toContain("macroMatch");
    expect(editorContent).toContain("orderMatch");

    // Must sync document on change
    expect(editorContent).toContain("lspClient.changeDocument(");
  });

  it("does not auto-close macro parentheses before completion", () => {
    const editorPath = path.join(__dirname, "../web/src/editor.ts");
    const editorContent = fs.readFileSync(editorPath, "utf-8");

    // `-> (` must remain open so macro completion can own the closing `)`.
    expect(editorContent).toMatch(/closeBrackets:\s*\{\s*brackets:\s*\[[^\]]*\]/);
    expect(editorContent).not.toMatch(/closeBrackets:\s*\{\s*brackets:\s*\[[^\]]*"\("/);
    expect(editorContent).toContain('{ mac: "Alt-i", run: startCompletion }');
  });
});
