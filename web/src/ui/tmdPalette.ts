import type { TMDWebEditor } from "../editor.js";
import { onLanguageChange, t } from "../i18n.js";

export interface TmdPaletteEntry {
  id: string;
  label: string;
  title: string;
  insertText: string;
  cursorOffset?: number;
}

const digitEntries: TmdPaletteEntry[] = Array.from({ length: 10 }, (_, value) => ({
  id: `digit-${value}`,
  label: String(value),
  title: `Insert ${value}`,
  insertText: String(value),
}));

export const TMD_PALETTE_ENTRIES: readonly TmdPaletteEntry[] = [
  ...digitEntries,
  { id: "bar", label: "|", title: "Insert bar separator", insertText: "|" },
  { id: "tie", label: "-", title: "Insert duration extension", insertText: "-" },
  { id: "octave-up", label: "^", title: "Insert octave up", insertText: "^" },
  { id: "octave-down", label: "_", title: "Insert octave down", insertText: "_" },
  { id: "sharp", label: "'", title: "Insert sharp", insertText: "'" },
  { id: "flat", label: ",", title: "Insert flat", insertText: "," },
  { id: "chord-pair", label: "[ ]", title: "Insert chord brackets", insertText: "[ ]", cursorOffset: 1 },
  { id: "directive-pair", label: "{ }", title: "Insert directive braces", insertText: "{ }", cursorOffset: 1 },
  { id: "angle-pair", label: "< >", title: "Insert angle brackets", insertText: "< >", cursorOffset: 1 },
  { id: "dynamic-p", label: "p", title: "Insert piano dynamic", insertText: "{p}" },
  { id: "dynamic-mp", label: "mp", title: "Insert mezzo-piano dynamic", insertText: "{mp}" },
  { id: "dynamic-mf", label: "mf", title: "Insert mezzo-forte dynamic", insertText: "{mf}" },
  { id: "dynamic-f", label: "f", title: "Insert forte dynamic", insertText: "{f}" },
  { id: "dynamic-ff", label: "ff", title: "Insert fortissimo dynamic", insertText: "{ff}" },
  { id: "tempo-absolute", label: "!=", title: "Insert absolute tempo directive", insertText: "{!= }", cursorOffset: 4 },
  { id: "tempo-relative", label: "!+", title: "Insert relative tempo directive", insertText: "{!+ }", cursorOffset: 4 },
  { id: "movable-do", label: "?=", title: "Insert movable-do directive", insertText: "{?= }", cursorOffset: 4 },
  { id: "movable-do-relative", label: "?+", title: "Insert relative movable-do directive", insertText: "{?+ }", cursorOffset: 4 },
  { id: "declared-key", label: "key=", title: "Insert declared key directive", insertText: "{key= }", cursorOffset: 6 },
  { id: "meter", label: "<>", title: "Insert time signature directive", insertText: "{<>}", cursorOffset: 2 },
];

export function getTmdPaletteEntry(id: string): TmdPaletteEntry | undefined {
  return TMD_PALETTE_ENTRIES.find((entry) => entry.id === id);
}

export function applyPaletteInsertion(
  content: string,
  from: number,
  to: number,
  entry: TmdPaletteEntry
): { text: string; cursor: number } {
  const before = content.slice(0, from);
  const after = content.slice(to);
  const cursorOffset = entry.cursorOffset ?? entry.insertText.length;
  return {
    text: `${before}${entry.insertText}${after}`,
    cursor: from + cursorOffset,
  };
}

export class TmdPaletteController {
  constructor(
    private readonly root: HTMLElement,
    private readonly editor: TMDWebEditor
  ) {
    this.render();
    onLanguageChange(() => this.render());
  }

  private render(): void {
    const buttons = document.createElement("div");
    buttons.className = "tmd-palette-buttons";
    buttons.setAttribute("role", "toolbar");

    for (const entry of TMD_PALETTE_ENTRIES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tmd-palette-button";
      button.dataset.paletteId = entry.id;
      const localizedTitle = t("tmdPaletteInsert", { value: entry.label });
      button.title = localizedTitle;
      button.setAttribute("aria-label", localizedTitle);
      button.textContent = entry.label;
      button.addEventListener("click", () => {
        this.editor.insertAtCursor(entry.insertText, entry.cursorOffset);
        this.editor.focus();
      });
      buttons.appendChild(button);
    }

    this.root.replaceChildren(buttons);
  }
}
