import type { TMDWebEditor } from "../editor.js";
import { escapeHtml } from "../html.js";
import { t } from "../i18n.js";
import { tmdPlayer } from "../midi-player.js";
import {
  calculateWhiteKeyCountForWidth,
  generateDynamicKeyboardKeys,
  type VirtualKeyInfo,
} from "./virtualKeyboardHelper.js";

export interface VirtualKeyboardElements {
  virtualKeyboard: HTMLElement;
  btnToggleKeyboard: HTMLButtonElement;
  keyboardKeysContainer: HTMLElement;
  keyboardModeAudition: HTMLButtonElement;
  keyboardModeInsert: HTMLButtonElement;
  keyboardOctaveDown: HTMLButtonElement;
  keyboardOctaveUp: HTMLButtonElement;
  keyboardOctaveDisplay: HTMLElement;
  keyboardKeySigDisplay?: HTMLElement | null;
}

export type VirtualKeyboardMode = "audition" | "insert";

export class VirtualKeyboardController {
  private elements: VirtualKeyboardElements;
  private editor: TMDWebEditor;
  private baseOctave: number = 4; // C4 - C6
  private currentKeySig: string = "C";
  private mode: VirtualKeyboardMode = "audition";
  private activeNoteNodes: Set<number> = new Set();
  private onStateChange?: () => void;

  constructor(
    elements: VirtualKeyboardElements,
    editor: TMDWebEditor,
    onStateChange?: () => void
  ) {
    this.elements = elements;
    this.editor = editor;
    this.onStateChange = onStateChange;

    // Load saved mode preference
    try {
      const savedMode = localStorage.getItem("tmd-keyboard-mode") as VirtualKeyboardMode | null;
      if (savedMode === "audition" || savedMode === "insert") {
        this.mode = savedMode;
      }
      const savedOctave = localStorage.getItem("tmd-keyboard-octave");
      if (savedOctave) {
        const oct = parseInt(savedOctave, 10);
        if (!isNaN(oct) && oct >= 1 && oct <= 7) {
          this.baseOctave = oct;
        }
      }
    } catch (_) {}

    this.bindEvents();
    this.render();
  }

  public setKeySignature(keySig: string) {
    const normalized = (keySig || "C").trim();
    if (this.currentKeySig !== normalized) {
      this.currentKeySig = normalized;
      this.render();
    }
  }

  public getMode(): VirtualKeyboardMode {
    return this.mode;
  }

  public setMode(mode: VirtualKeyboardMode) {
    this.mode = mode;
    try {
      localStorage.setItem("tmd-keyboard-mode", mode);
    } catch (_) {}
    this.updateModeButtons();
  }

  public isCollapsed(): boolean {
    return this.elements.virtualKeyboard.classList.contains("collapsed");
  }

  public toggleCollapsed(): void {
    const isNowCollapsed = this.elements.virtualKeyboard.classList.toggle("collapsed");
    this.elements.btnToggleKeyboard.textContent = isNowCollapsed ? "▲" : "▼";
    if (!isNowCollapsed) {
      // Re-render to adjust keys to width upon expanding
      setTimeout(() => this.render(), 50);
    }
    if (this.onStateChange) {
      this.onStateChange();
    }
  }

  private updateModeButtons(): void {
    if (this.mode === "audition") {
      this.elements.keyboardModeAudition.classList.add("active");
      this.elements.keyboardModeInsert.classList.remove("active");
    } else {
      this.elements.keyboardModeAudition.classList.remove("active");
      this.elements.keyboardModeInsert.classList.add("active");
    }
  }

  private updateOctaveDisplay(startNote?: string, endNote?: string): void {
    const start = startNote || `C${this.baseOctave}`;
    const end = endNote || `C${this.baseOctave + 2}`;
    this.elements.keyboardOctaveDisplay.textContent = t("virtualKeyboardOctaveLabel", {
      startNote: start,
      endNote: end,
    });
    if (this.elements.keyboardKeySigDisplay) {
      this.elements.keyboardKeySigDisplay.textContent = `Key: ${this.currentKeySig}`;
    }
  }

  private bindEvents(): void {
    const {
      virtualKeyboard,
      btnToggleKeyboard,
      keyboardModeAudition,
      keyboardModeInsert,
      keyboardOctaveDown,
      keyboardOctaveUp,
    } = this.elements;

    // Responsive auto-fit: resize keys when container size changes
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        if (!this.isCollapsed()) {
          this.render();
        }
      });
      ro.observe(virtualKeyboard);
    }

    // Toggle collapse header
    const header = virtualKeyboard.querySelector(".virtual-keyboard-header");
    header?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      this.toggleCollapsed();
    });

    btnToggleKeyboard.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleCollapsed();
    });

    // Mode buttons
    keyboardModeAudition.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setMode("audition");
    });

    keyboardModeInsert.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setMode("insert");
    });

    // Octave Shift
    keyboardOctaveDown.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.baseOctave > 1) {
        this.baseOctave--;
        try { localStorage.setItem("tmd-keyboard-octave", String(this.baseOctave)); } catch (_) {}
        this.render();
      }
    });

    keyboardOctaveUp.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.baseOctave < 6) {
        this.baseOctave++;
        try { localStorage.setItem("tmd-keyboard-octave", String(this.baseOctave)); } catch (_) {}
        this.render();
      }
    });
  }

  public render(): void {
    this.updateModeButtons();

    const container = this.elements.keyboardKeysContainer;
    const bodyWidth =
      this.elements.virtualKeyboard.clientWidth ||
      this.elements.virtualKeyboard.parentElement?.clientWidth ||
      container.clientWidth ||
      (typeof window !== "undefined" ? window.innerWidth : 800);
    const targetWhiteKeys = calculateWhiteKeyCountForWidth(bodyWidth);

    const keys = generateDynamicKeyboardKeys(this.baseOctave, targetWhiteKeys, this.currentKeySig);

    const firstKey = keys[0];
    const lastKey = keys[keys.length - 1];
    this.updateOctaveDisplay(firstKey?.noteName, lastKey?.noteName);

    container.innerHTML = "";

    // Group keys into visual piano structure:
    const pianoWrapper = document.createElement("div");
    pianoWrapper.className = "piano-keys-wrapper";

    keys.forEach((key) => {
      const keyEl = document.createElement("button");
      keyEl.type = "button";
      keyEl.className = `piano-key ${key.isBlack ? "black-key" : "white-key"}`;
      keyEl.dataset.midi = String(key.midi);
      keyEl.dataset.noteName = key.noteName;
      keyEl.dataset.tmdNote = key.tmdNote;

      keyEl.innerHTML = `
        <div class="key-labels">
          <span class="key-degree">${escapeHtml(key.degreeLabel)}</span>
          <span class="key-notename">${escapeHtml(key.noteName)}</span>
        </div>
      `;

      // Event handlers for pressing/releasing
      const handlePress = (e: Event) => {
        e.preventDefault();
        keyEl.classList.add("active");
        this.handleKeyPress(key);
      };

      const handleRelease = (e: Event) => {
        e.preventDefault();
        keyEl.classList.remove("active");
        this.handleKeyRelease(key);
      };

      keyEl.addEventListener("mousedown", handlePress);
      keyEl.addEventListener("mouseup", handleRelease);
      keyEl.addEventListener("mouseleave", handleRelease);

      keyEl.addEventListener("touchstart", handlePress, { passive: false });
      keyEl.addEventListener("touchend", handleRelease);
      keyEl.addEventListener("touchcancel", handleRelease);

      pianoWrapper.appendChild(keyEl);
    });

    container.appendChild(pianoWrapper);
  }

  private handleKeyPress(key: VirtualKeyInfo): void {
    // 1. Play note via SoundFont regardless of mode for audible feedback
    tmdPlayer.playNote(key.midi);
    this.activeNoteNodes.add(key.midi);

    // 2. If in insert mode, insert TMD note into editor at cursor
    if (this.mode === "insert") {
      this.editor.insertAtCursor(`${key.tmdNote} `);
      this.editor.focus();
    }
  }

  private handleKeyRelease(key: VirtualKeyInfo): void {
    tmdPlayer.stopNote(key.midi);
    this.activeNoteNodes.delete(key.midi);
  }
}
