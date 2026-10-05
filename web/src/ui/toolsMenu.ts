import { TmdRefactor } from "../../../src/refactoring/refactor.js";
import type { TmdWebEditor } from "../editor.js";
import { t } from "../i18n.js";

export interface ContextMenuElements {
  editorContextMenu: HTMLElement;
  ctxHeaderInfo: HTMLElement;
  ctxFormat: HTMLButtonElement;
  ctxFormatLabel: HTMLElement;
  ctxComment: HTMLButtonElement;
  ctxTranspose: HTMLButtonElement;
  ctxTransposeLabel: HTMLElement;
  ctxInsertSection: HTMLButtonElement;
  ctxDoubleGrid: HTMLButtonElement;
  ctxHalveGrid: HTMLButtonElement;
  ctxOptimizeGrid?: HTMLButtonElement;
  ctxDuplicateTrack: HTMLButtonElement;
  ctxGenerateHarmony: HTMLButtonElement;
  ctxExtractInstrument: HTMLButtonElement;
  ctxRenameInstrument: HTMLButtonElement;
  ctxRenameSection: HTMLButtonElement;
  ctxHumRecording: HTMLButtonElement;
}

export interface ToolsDropdownElements {
  toolsDropdown: HTMLElement;
  btnToolsMenu: HTMLButtonElement;
  toolFormatDocument: HTMLButtonElement;
  toolDoubleGrid: HTMLButtonElement;
  toolHalveGrid: HTMLButtonElement;
  toolOptimizeGrid?: HTMLButtonElement;
  toolTranspose: HTMLButtonElement;
  exportDropdown: HTMLElement;
}

export class TmdToolsAndContextMenuController {
  constructor(
    private contextElements: ContextMenuElements,
    private toolsElements: ToolsDropdownElements,
    private getEditor: () => TmdWebEditor,
    private onScoreUpdated: (text: string) => void,
    private showToast: (message: string, type?: "success" | "error") => void
  ) {}

  public closeContextMenu(): void {
    if (this.contextElements.editorContextMenu) {
      this.contextElements.editorContextMenu.style.display = "none";
    }
  }

  public async handleFormatDocument(): Promise<void> {
    try {
      const editor = this.getEditor();
      if (editor.formatDocument) {
        await editor.formatDocument();
      } else {
        const current = editor.getContent();
        const formatted = TmdRefactor.format(current);
        editor.setContent(formatted);
      }
      this.onScoreUpdated(editor.getContent());
      this.showToast(t("toastFormatted"));
    } catch (err: any) {
      this.showToast(t("errorRefactor").replace("{error}", err.message || String(err)), "error");
    }
  }

  public handleDoubleGrid(): void {
    this.toolsElements.toolsDropdown?.classList.remove("open");
    const editor = this.getEditor();
    const selection = editor.getSelection();
    try {
      if (selection && selection.trim().length > 0) {
        const doubled = TmdRefactor.doubleGrid(selection);
        editor.replaceSelection(doubled);
      } else {
        const full = editor.getContent();
        const doubled = TmdRefactor.doubleGrid(full);
        editor.setContent(doubled);
      }
      const updated = editor.getContent();
      this.onScoreUpdated(updated);
      this.showToast(t("toastDoubleGrid"));
    } catch (err: any) {
      this.showToast(t("errorRefactor").replace("{error}", err.message || String(err)), "error");
    }
  }

  public handleHalveGrid(): void {
    this.toolsElements.toolsDropdown?.classList.remove("open");
    const editor = this.getEditor();
    const selection = editor.getSelection();
    try {
      if (selection && selection.trim().length > 0) {
        const halved = TmdRefactor.halveGrid(selection);
        editor.replaceSelection(halved);
      } else {
        const full = editor.getContent();
        const halved = TmdRefactor.halveGrid(full);
        editor.setContent(halved);
      }
      const updated = editor.getContent();
      this.onScoreUpdated(updated);
      this.showToast(t("toastHalveGrid"));
    } catch (err: any) {
      this.showToast(t("errorRefactor").replace("{error}", err.message || String(err)), "error");
    }
  }

  public handleOptimizeGrid(): void {
    this.toolsElements.toolsDropdown?.classList.remove("open");
    const editor = this.getEditor();
    const selection = editor.getSelection();
    try {
      if (selection && selection.trim().length > 0) {
        const optimized = TmdRefactor.optimizeGrid(selection);
        editor.replaceSelection(optimized);
      } else {
        const full = editor.getContent();
        const ctx = editor.getCursorContext();
        const optimized = TmdRefactor.optimizeGrid(
          full,
          ctx.section && ctx.instrument ? { section: ctx.section, instrument: ctx.instrument } : undefined
        );
        editor.setContent(optimized);
      }
      const updated = editor.getContent();
      this.onScoreUpdated(updated);
      this.showToast(t("toastOptimizeGrid"));
    } catch (err: any) {
      this.showToast(t("errorRefactor").replace("{error}", err.message || String(err)), "error");
    }
  }

  public init(): void {
    const {
      toolsDropdown,
      btnToolsMenu,
      toolFormatDocument,
      toolDoubleGrid,
      toolHalveGrid,
      exportDropdown,
    } = this.toolsElements;

    const {
      editorContextMenu,
      ctxHeaderInfo,
      ctxFormat,
      ctxFormatLabel,
      ctxComment,
      ctxDoubleGrid,
      ctxHalveGrid,
    } = this.contextElements;

    btnToolsMenu?.addEventListener("click", (e) => {
      e.stopPropagation();
      toolsDropdown?.classList.toggle("open");
      exportDropdown.classList.remove("open");
    });

    window.addEventListener("click", (e) => {
      if (toolsDropdown && !toolsDropdown.contains(e.target as Node)) {
        toolsDropdown.classList.remove("open");
      }
      if (!editorContextMenu.contains(e.target as Node)) {
        this.closeContextMenu();
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeContextMenu();
      }
    });

    toolFormatDocument?.addEventListener("click", () => {
      toolsDropdown?.classList.remove("open");
      this.handleFormatDocument();
    });

    toolDoubleGrid?.addEventListener("click", () => {
      this.handleDoubleGrid();
    });

    toolHalveGrid?.addEventListener("click", () => {
      this.handleHalveGrid();
    });

    this.toolsElements.toolOptimizeGrid?.addEventListener("click", () => {
      this.handleOptimizeGrid();
    });

    const editorContainerEl = document.getElementById("editor-container");
    editorContainerEl?.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      const editor = this.getEditor();
      const ctx = editor.getCursorContext();

      if (ctx.section && ctx.instrument) {
        ctxHeaderInfo.style.display = "block";
        ctxHeaderInfo.textContent = `📍 [${ctx.section}:${ctx.instrument}]`;
      } else if (ctx.section) {
        ctxHeaderInfo.style.display = "block";
        ctxHeaderInfo.textContent = `📍 Section: [${ctx.section}]`;
      } else {
        ctxHeaderInfo.style.display = "none";
      }

      if (ctx.hasSelection) {
        ctxFormatLabel.textContent = t("toolFormatSelection");
        if (this.contextElements.ctxTransposeLabel) {
          this.contextElements.ctxTransposeLabel.textContent =
            t("toolTransposeSelection");
        }
      } else {
        ctxFormatLabel.textContent = t("toolFormatDocument");
        if (this.contextElements.ctxTransposeLabel) {
          this.contextElements.ctxTransposeLabel.textContent = t("toolTranspose");
        }
      }

      editorContextMenu.style.display = "flex";
      const menuWidth = 220;
      const menuHeight = 280;
      let x = e.clientX;
      let y = e.clientY;

      if (x + menuWidth > window.innerWidth) {
        x = Math.max(10, window.innerWidth - menuWidth - 10);
      }
      if (y + menuHeight > window.innerHeight) {
        y = Math.max(10, window.innerHeight - menuHeight - 10);
      }

      editorContextMenu.style.left = `${x}px`;
      editorContextMenu.style.top = `${y}px`;
    });

    ctxFormat?.addEventListener("click", () => {
      this.closeContextMenu();
      this.handleFormatDocument();
    });

    ctxComment?.addEventListener("click", () => {
      this.closeContextMenu();
      this.getEditor().toggleComment();
    });

    ctxDoubleGrid?.addEventListener("click", () => {
      this.closeContextMenu();
      this.handleDoubleGrid();
    });

    ctxHalveGrid?.addEventListener("click", () => {
      this.closeContextMenu();
      this.handleHalveGrid();
    });

    this.contextElements.ctxOptimizeGrid?.addEventListener("click", () => {
      this.closeContextMenu();
      this.handleOptimizeGrid();
    });
  }
}
