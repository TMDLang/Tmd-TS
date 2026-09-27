import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  keymap,
  gutter,
  GutterMarker,
  BlockInfo,
  Decoration,
  DecorationSet,
  hoverTooltip,
  Tooltip,
} from "@codemirror/view";
import { EditorState, Compartment, StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import {
  StreamLanguage,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldKeymap,
} from "@codemirror/language";
import {
  history,
  defaultKeymap,
  historyKeymap,
  toggleComment,
  indentWithTab,
} from "@codemirror/commands";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import {
  autocompletion,
  startCompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { linter, lintKeymap, Diagnostic as CMDiagnostic } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";
import type { TMDMeasureIssue } from "../../src/core/measure_check.js";
import { DEFAULT_INSTRUMENT } from "../../src/core/types.js";
import { TMDWebLSPClient } from "./lsp/client.js";
import { t } from "./i18n.js";

import { tmdStreamParser, type TMDParserState } from "./syntax.js";
export { tmdStreamParser, type TMDParserState };

// Export comment tokens configuration for tests/editor integrations: tmdStreamParser.languageData.commentTokens
export const tmdLanguage = StreamLanguage.define<TMDParserState>(tmdStreamParser);

export const defaultEditorExtensions = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  // Macro completion owns the closing `)`, so don't insert it while typing
  // `-> (`. Keep automatic closing for chords, directives, and quotes.
  EditorState.languageData.of(() => [{
    closeBrackets: { brackets: ["[", "{", "'", '"'] },
  }]),
  closeBrackets(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...lintKeymap,
  ]),
];

export interface CursorContext {
  section?: string;
  instrument?: string;
  hasSelection: boolean;
  selectionText: string;
}

export interface TMDWebEditor {
  view: EditorView;
  lspClient: TMDWebLSPClient;
  getContent(): string;
  setContent(text: string): void;
  insertAtCursor(text: string): void;
  getSelection(): string;
  replaceSelection(text: string): void;
  scrollToLine(line: number): void;
  scrollToRange(startLine: number, startCol: number, endLine: number, endCol: number): void;
  getCursorContext(): CursorContext;
  toggleComment(): void;
  formatDocument(): Promise<void>;
  setMeasureIssues(issues: TMDMeasureIssue[]): void;
  setTheme(theme: "dark" | "light"): void;
  focus(): void;
}

class SectionPlayGutterMarker extends GutterMarker {
  constructor(
    private readonly sectionName: string,
    private readonly instrumentName: string,
    private readonly onPlaySection?: (section: string, instrument: string) => void
  ) {
    super();
  }

  override toDOM(): HTMLElement {
    const btn = document.createElement("span");
    btn.className = "cm-section-play-btn";
    const titleTmpl = t("playSectionTitle") || "Play section: {section}";
    btn.title = titleTmpl.replace("{section}", `${this.sectionName} (${this.instrumentName})`);
    btn.textContent = "▶";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.onPlaySection) {
        this.onPlaySection(this.sectionName, this.instrumentName);
      }
    });
    return btn;
  }
}

export function createTmdCompletionSource(lspClient: TMDWebLSPClient) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const pos = context.pos;
    const doc = context.state.doc;
    const lineObj = doc.lineAt(pos);
    const lineIndex = lineObj.number - 1;
    const charIndex = pos - lineObj.from;
    const prefix = lineObj.text.slice(0, charIndex);

    // Sync latest document before completion request
    lspClient.changeDocument(doc.toString());

    // 1. Check trigger scenarios and calculate exact replacement start position `from`
    // Macro completion after `-> (` or `(` or `(ca` (check before `->` order completion)
    const macroMatch = prefix.match(/(?:->\s*\(|\()\s*([\w\d_-]*)$/);
    // Section order completion after `->`
    const orderMatch = prefix.match(/->\s*([\w\d_-]*)$/);
    // Instrument completion after `:`
    const colonMatch = prefix.match(/:([\w\d_-]*)$/);
    // Chord completion after `[`
    const bracketMatch = prefix.match(/\[([\w\d#b]*)$/);
    // Section directive after `{`
    const braceMatch = prefix.match(/\{([A-Za-z!?<][\w\d+=\s\/-]*)$/);
    const bareBraceMatch = prefix.match(/\{$/);

    let from = pos;
    let isTriggerMatched = false;

    if (macroMatch) {
      from = pos - macroMatch[1].length;
      isTriggerMatched = true;
    } else if (orderMatch) {
      from = pos - orderMatch[1].length;
      isTriggerMatched = true;
    } else if (colonMatch) {
      from = pos - colonMatch[1].length;
      isTriggerMatched = true;
    } else if (bracketMatch) {
      from = pos - bracketMatch[1].length;
      isTriggerMatched = true;
    } else if (braceMatch) {
      from = pos - braceMatch[1].length;
      isTriggerMatched = true;
    } else if (bareBraceMatch) {
      from = pos;
      isTriggerMatched = true;
    } else {
      const wordMatch = context.matchBefore(/[\w\d_-]+/);
      if (wordMatch) {
        from = wordMatch.from;
        isTriggerMatched = true;
      }
    }

    if (!isTriggerMatched && !context.explicit) {
      return null;
    }

    const items = await lspClient.requestCompletions(lineIndex, charIndex);
    if (!items || items.length === 0) return null;

    const cmItems = lspClient.convertToCMCompletions(items);
    return {
      from,
      options: cmItems,
      validFor: /^[\w\d#b!+?<=/ -]*$/,
    };
  };
}

export function createTmdEditor(
  container: HTMLElement,
  initialContent: string,
  onChange?: (content: string) => void,
  onCursorActivity?: (line: number, col: number) => void,
  onFormat?: () => void,
  onPlaySection?: (section: string, instrument: string) => void
): TMDWebEditor {
  const languageCompartment = new Compartment();
  const themeCompartment = new Compartment();

  const lightEditorTheme = EditorView.theme({
    "&": {
      backgroundColor: "#ffffff",
      color: "#1f2328",
    },
    ".cm-content": {
      caretColor: "#0969da",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "#0969da",
    },
    "&.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "#b6e3ff !important",
    },
    ".cm-gutters": {
      backgroundColor: "#f6f8fa",
      color: "#656d76",
      borderRight: "1px solid #d0d7de",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(234, 238, 242, 0.5)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#eaeef2",
      color: "#1f2328",
    },
  }, { dark: false });

  const lspClient = new TMDWebLSPClient();
  lspClient.openDocument(initialContent);

  const tmdCompletionSource = createTmdCompletionSource(lspClient);

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const docStr = update.state.doc.toString();
      lspClient.changeDocument(docStr);
      if (onChange) {
        onChange(docStr);
      }

      // Automatically trigger completion popup when typing trigger sequences like '->', '(', ':', '[', '{'
      if (update.transactions.some((tr) => tr.isUserEvent("input.type"))) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        const prefix = line.text.slice(0, pos - line.from);
        if (/(?:->\s*\(?|:\s*|\[\s*|\{\s*|\(\s*)$/.test(prefix)) {
          // Dispatch after the current update has completed. Dispatching from
          // inside an update listener can be swallowed by CodeMirror's
          // completion state before its source is queried.
          queueMicrotask(() => {
            if (update.view.dom.isConnected) {
              startCompletion(update.view);
            }
          });
        }
      }
    }
    if ((update.selectionSet || update.docChanged) && onCursorActivity) {
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      const col = pos - line.from + 1;
      onCursorActivity(line.number, col);
    }
  });

  const editorKeymap = keymap.of([
    {
      key: "Mod-Shift-f",
      run: () => {
        if (onFormat) {
          onFormat();
          return true;
        }
        return false;
      },
    },
    {
      key: "Shift-Alt-f",
      run: () => {
        if (onFormat) {
          onFormat();
          return true;
        }
        return false;
      },
    },
    {
      key: "Mod-Space",
      run: startCompletion,
    },
    {
      key: "Ctrl-Space",
      run: startCompletion,
    },
    { mac: "Alt-i", run: startCompletion },
    { mac: "Alt-`", run: startCompletion },
    ...completionKeymap,
    {
      key: "Mod-/",
      run: toggleComment,
    },
    {
      key: "Shift-Alt-a",
      run: toggleComment,
    },
    indentWithTab,
  ]);

  const sectionPlayGutter = gutter({
    class: "cm-section-play-gutter",
    lineMarker(view: EditorView, line: BlockInfo) {
      const lineText = view.state.doc.lineAt(line.from).text.trim();
      const concreteMatch = lineText.match(/^([a-zA-Z0-9_\u4e00-\u9fa5-]+):([a-zA-Z0-9_\u4e00-\u9fa5-]+)(?:@\|?[+-]?\d+\|?)?\s*\{/);
      if (concreteMatch) {
        return new SectionPlayGutterMarker(concreteMatch[1], concreteMatch[2], onPlaySection);
      }
      const abstractMatch = lineText.match(/^([a-zA-Z0-9_\u4e00-\u9fa5-]+)\s*\{/);
      if (abstractMatch) {
        const secName = abstractMatch[1];
        if (secName !== "instruments") {
          return new SectionPlayGutterMarker(secName, DEFAULT_INSTRUMENT, onPlaySection);
        }
      }
      return null;
    },
    initialSpacer: () => new SectionPlayGutterMarker("", ""),
  });

  const tmdLinter = linter(async (view) => {
    const docText = view.state.doc.toString();
    const diags = await lspClient.diagnose(docText);
    return lspClient.convertToCMDiagnostics(docText, diags) as CMDiagnostic[];
  });

  const setMeasureIssuesEffect = StateEffect.define<TMDMeasureIssue[]>();

  let activeIssues: TMDMeasureIssue[] = [];

  const measureIssuesTooltip = hoverTooltip((view, pos, side): Tooltip | null => {
    if (!activeIssues || activeIssues.length === 0) return null;
    const doc = view.state.doc;
    const line = doc.lineAt(pos);
    const lineNum = line.number;

    const matchingIssues = activeIssues.filter((i) => i.lineNumber === lineNum);
    if (matchingIssues.length === 0) return null;

    return {
      pos: line.from,
      end: line.to,
      above: true,
      create(view) {
        const dom = document.createElement("div");
        dom.className = "cm-issue-tooltip";

        matchingIssues.forEach((issue) => {
          const item = document.createElement("div");
          item.className = "cm-issue-tooltip-item";

          const icon = document.createElement("span");
          icon.className = "cm-issue-tooltip-icon";
          icon.textContent = "⚠";

          const text = document.createElement("span");
          text.className = "cm-issue-tooltip-text";
          text.textContent = issue.description || `${issue.paragraphName}:${issue.instrument} measure issue`;

          item.appendChild(icon);
          item.appendChild(text);
          dom.appendChild(item);
        });

        return { dom };
      },
    };
  });

  const measureIssuesField = StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(decorations, tr) {
      decorations = decorations.map(tr.changes);
      for (const effect of tr.effects) {
        if (effect.is(setMeasureIssuesEffect)) {
          const issues = effect.value;
          activeIssues = issues || [];
          if (!issues || issues.length === 0) {
            decorations = Decoration.none;
          } else {
            const builder = new RangeSetBuilder<Decoration>();
            // Deduplicate line numbers and sort
            const lines = Array.from(
              new Set(
                issues
                  .map((i) => i.lineNumber)
                  .filter((ln) => typeof ln === "number" && ln >= 1 && ln <= tr.state.doc.lines)
              )
            ).sort((a, b) => a - b);

            for (const lineNum of lines) {
              const lineObj = tr.state.doc.line(lineNum);
              builder.add(
                lineObj.from,
                lineObj.from,
                Decoration.line({
                  class: "cm-measure-issue",
                })
              );
            }
            decorations = builder.finish();
          }
        }
      }
      return decorations;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const state = EditorState.create({
    doc: initialContent,
    extensions: [
      defaultEditorExtensions,
      tmdLinter,
      autocompletion({
        override: [tmdCompletionSource],
        activateOnTyping: true,
      }),
      sectionPlayGutter,
      measureIssuesField,
      measureIssuesTooltip,
      themeCompartment.of(oneDark),
      languageCompartment.of(tmdLanguage),
      updateListener,
      editorKeymap,
      EditorView.lineWrapping,
      EditorView.theme({
        "&": {
          height: "100%",
          fontSize: "14px",
          fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
        },
        ".cm-scroller": {
          overflow: "auto",
        },
        ".cm-content": {
          padding: "12px 4px",
        },
        ".cm-line": {
          padding: "0 4px",
          lineHeight: "1.6",
        },
        "&.cm-focused": {
          outline: "none",
        },
      }),
    ],
  });

  const view = new EditorView({
    state,
    parent: container,
  });

  return {
    view,
    lspClient,
    getContent() {
      return view.state.doc.toString();
    },
    setContent(text: string) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: text,
        },
      });
    },
    insertAtCursor(text: string) {
      const selection = view.state.selection.main;
      view.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: text,
        },
        selection: { anchor: selection.from + text.length },
      });
    },
    getSelection() {
      const selection = view.state.selection.main;
      if (selection.empty) return "";
      return view.state.sliceDoc(selection.from, selection.to);
    },
    replaceSelection(text: string) {
      const selection = view.state.selection.main;
      view.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: text,
        },
        selection: { anchor: selection.from + text.length },
      });
    },
    scrollToLine(line: number) {
      const doc = view.state.doc;
      const targetLine = Math.max(1, Math.min(line, doc.lines));
      const lineObj = doc.line(targetLine);
      view.dispatch({
        selection: { anchor: lineObj.from, head: lineObj.to },
        scrollIntoView: true,
      });
      view.focus();
    },
    scrollToRange(startLine: number, startCol: number, endLine: number, endCol: number) {
      const doc = view.state.doc;
      const sLine = Math.max(1, Math.min(startLine, doc.lines));
      const eLine = Math.max(1, Math.min(endLine, doc.lines));
      const sLineObj = doc.line(sLine);
      const eLineObj = doc.line(eLine);
      const from = Math.min(sLineObj.from + Math.max(0, startCol - 1), sLineObj.to);
      const to = Math.min(eLineObj.from + Math.max(0, endCol - 1), eLineObj.to);
      view.dispatch({
        selection: { anchor: from, head: Math.max(from, to) },
        scrollIntoView: true,
      });
      view.focus();
    },
    getCursorContext() {
      const selection = view.state.selection.main;
      const hasSelection = !selection.empty;
      const doc = view.state.doc;
      const currentLineNum = doc.lineAt(selection.head).number;

      // Scan backwards from current line to find the enclosing paragraph header e.g. "verse:Guitar@|0|{"
      let section: string | undefined;
      let instrument: string | undefined;

      for (let l = currentLineNum; l >= 1; l--) {
        const lineText = doc.line(l).text.trim();
        // Match concrete paragraph header like `verse:Guitar@|0|{` or `verse:Guitar{`
        const concreteMatch = lineText.match(/^([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)/);
        if (concreteMatch) {
          section = concreteMatch[1];
          instrument = concreteMatch[2];
          break;
        }
        // Match abstract / default paragraph header like `theme {` or `theme{`
        const abstractMatch = lineText.match(/^([a-zA-Z0-9_-]+)\s*\{/);
        if (abstractMatch) {
          const sec = abstractMatch[1];
          if (sec !== "instruments") {
            section = sec;
            instrument = DEFAULT_INSTRUMENT;
            break;
          }
        }
        // If we hit another block closing before opening, we stop or continue scanning
      }

      return {
        section,
        instrument,
        hasSelection,
        selectionText: hasSelection ? view.state.sliceDoc(selection.from, selection.to) : "",
      };
    },
    toggleComment() {
      toggleComment(view);
      view.focus();
    },
    async formatDocument() {
      lspClient.changeDocument(view.state.doc.toString());
      const edits = await lspClient.requestFormatting();
      if (edits && edits.length > 0) {
        const edit = edits[0];
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: edit.newText,
          },
        });
      }
    },
    setMeasureIssues(issues: TMDMeasureIssue[]) {
      view.dispatch({
        effects: setMeasureIssuesEffect.of(issues),
      });
    },
    setTheme(theme: "dark" | "light") {
      view.dispatch({
        effects: themeCompartment.reconfigure(theme === "light" ? lightEditorTheme : oneDark),
      });
    },
    focus() {
      view.focus();
    },
  };
}
