import JSZip from "jszip";

import { TmdWAVRenderer } from "../../../src/audio.js";
import {
  TmdABCGenerator,
  TmdBrailleGenerator,
  TmdChordProGenerator,
  TmdLilyPondGenerator,
  TmdMIDIGenerator,
  TmdMusicXMLGenerator,
  TmdReaperGenerator,
  TmdVSQGenerator,
  TmdVSQXGenerator,
} from "../../../src/exporters/index.js";
import { TmdSkill } from "../../../src/skill.js";
import { TmdParser } from "../../../src/syntax/parser.js";
import type { Sheet } from "../../../src/syntax/types.js";
import type { TmdWebEditor } from "../editor.js";
import { t } from "../i18n.js";
import { encodeShareHash } from "../share.js";
import { TmdStorage } from "../storage/db.js";

export interface ExportMenuElements {
  exportDropdown: HTMLElement;
  btnExportMenu: HTMLButtonElement;
  btnExportTmd: HTMLButtonElement;
  btnExportMidi: HTMLButtonElement;
  btnExportReaper: HTMLButtonElement;
  btnExportMusicXML: HTMLButtonElement;
  btnExportLilyPond: HTMLButtonElement;
  btnExportABC: HTMLButtonElement;
  btnExportChordPro?: HTMLButtonElement | null;
  btnExportBraille?: HTMLButtonElement | null;
  btnPreviewBraille?: HTMLButtonElement | null;
  btnExportVsq?: HTMLButtonElement | null;
  btnExportVsqx?: HTMLButtonElement | null;
  btnExportWAV: HTMLButtonElement;
  btnExportSkill: HTMLButtonElement;
  btnExportLibraryZip?: HTMLButtonElement | null;
  btnBackupZip?: HTMLButtonElement | null;
  btnShare: HTMLButtonElement;
  toolsDropdown?: HTMLElement | null;
  onOpenBraillePreview?: () => void;
}

export function getSafeFilename(title?: string, ext: string = "mid"): string {
  const safe =
    (title || "untitled")
      .replace(/[^\w\u4e00-\u9fa5-_]+/g, "_")
      .replace(/^_+|_+$/g, "") || "score";
  return `${safe}.${ext}`;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSkillFile(): void {
  downloadBlob(
    "SKILL.md",
    new Blob([TmdSkill.skillMarkdown], { type: "text/markdown;charset=utf-8" })
  );
}

export async function exportAllScoresZip(): Promise<void> {
  try {
    const scores = await TmdStorage.listScores();
    if (!scores || scores.length === 0) {
      alert(t("noScoresToBackup"));
      return;
    }
    const zip = new JSZip();
    const usedFilenames = new Map<string, number>();

    scores.forEach((s) => {
      const baseName = s.title.replace(/[\\/:*?"<>|]/g, "_").trim() || "score";
      const count = usedFilenames.get(baseName) || 0;
      let filename = `${baseName}.tmd`;
      if (count > 0) {
        filename = `${baseName}_(${count}).tmd`;
      }
      usedFilenames.set(baseName, count + 1);
      zip.file(filename, s.content);
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadBlob(`tmd-scores-backup-${dateStr}.zip`, blob);
  } catch (e: any) {
    console.error("Backup ZIP failed:", e);
    alert(`備份失敗: ${e.message || String(e)}`);
  }
}

function bindSheetExportButton(
  button: HTMLButtonElement | null | undefined,
  exportDropdown: HTMLElement,
  getEditor: () => TmdWebEditor,
  ext: string,
  mimeType: string,
  generate: (sheet: Sheet) => BlobPart
): void {
  button?.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    const sheet = TmdParser.parse(getEditor().getContent());
    if (!sheet) return alert(t("alertCannotExport"));
    const payload = generate(sheet);
    downloadBlob(getSafeFilename(sheet.name, ext), new Blob([payload], { type: mimeType }));
  });
}

export function setupExportMenu(
  elements: ExportMenuElements,
  getEditor: () => TmdWebEditor
): void {
  const {
    exportDropdown,
    btnExportMenu,
    btnExportTmd,
    btnExportMidi,
    btnExportReaper,
    btnExportMusicXML,
    btnExportLilyPond,
    btnExportABC,
    btnExportChordPro,
    btnExportBraille,
    btnPreviewBraille,
    btnExportVsq,
    btnExportVsqx,
    btnExportWAV,
    btnExportSkill,
    btnExportLibraryZip,
    btnBackupZip,
    btnShare,
    toolsDropdown,
    onOpenBraillePreview,
  } = elements;

  btnExportMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    exportDropdown.classList.toggle("open");
    toolsDropdown?.classList.remove("open");
  });

  btnExportTmd.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    const editor = getEditor();
    const text = editor.getContent();
    let filename = "score.tmd";
    try {
      const sheet = TmdParser.parse(text);
      if (sheet?.name) {
        filename = getSafeFilename(sheet.name, "tmd");
      }
    } catch {
      // Allow download of raw TMD code even if syntax incomplete
    }
    downloadBlob(filename, new Blob([text], { type: "text/plain;charset=utf-8" }));
  });

  bindSheetExportButton(btnExportMidi, exportDropdown, getEditor, "mid", "audio/midi", (sheet) =>
    TmdMIDIGenerator.generateMIDI(sheet) as any
  );

  bindSheetExportButton(
    btnExportReaper,
    exportDropdown,
    getEditor,
    "rpp",
    "text/plain;charset=utf-8",
    (sheet) => TmdReaperGenerator.generateRPP(sheet)
  );

  bindSheetExportButton(
    btnExportMusicXML,
    exportDropdown,
    getEditor,
    "musicxml",
    "application/vnd.recordare.musicxml+xml;charset=utf-8",
    (sheet) => TmdMusicXMLGenerator.generateMusicXML(sheet)
  );

  bindSheetExportButton(
    btnExportLilyPond,
    exportDropdown,
    getEditor,
    "ly",
    "text/plain;charset=utf-8",
    (sheet) => TmdLilyPondGenerator.generateLilyPond(sheet)
  );

  bindSheetExportButton(
    btnExportABC,
    exportDropdown,
    getEditor,
    "abc",
    "text/vnd.abc;charset=utf-8",
    (sheet) => TmdABCGenerator.generateABC(sheet)
  );

  bindSheetExportButton(
    btnExportChordPro,
    exportDropdown,
    getEditor,
    "cho",
    "text/plain;charset=utf-8",
    (sheet) => TmdChordProGenerator.generateChordPro(sheet)
  );

  bindSheetExportButton(
    btnExportBraille,
    exportDropdown,
    getEditor,
    "brl",
    "text/plain;charset=utf-8",
    (sheet) => TmdBrailleGenerator.generateBraille(sheet, { encoding: "unicode", layout: "partByPart" })
  );

  btnPreviewBraille?.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    onOpenBraillePreview?.();
  });

  bindSheetExportButton(btnExportVsq, exportDropdown, getEditor, "vsq", "audio/x-vsq", (sheet) =>
    TmdVSQGenerator.generateVSQ(sheet) as any
  );

  bindSheetExportButton(
    btnExportVsqx,
    exportDropdown,
    getEditor,
    "vsqx",
    "application/xml;charset=utf-8",
    (sheet) => TmdVSQXGenerator.generateVSQX(sheet)
  );

  bindSheetExportButton(btnExportWAV, exportDropdown, getEditor, "wav", "audio/wav", (sheet) =>
    TmdWAVRenderer.renderWAV(sheet) as any
  );

  btnExportSkill.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    downloadSkillFile();
  });

  btnShare.addEventListener("click", async () => {
    const editor = getEditor();
    let url: string;
    try {
      url =
        window.location.origin +
        window.location.pathname +
        (await encodeShareHash(editor.getContent()));
    } catch (err) {
      console.warn("Could not create a share link:", err);
      alert(t("shareCreateFailed"));
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      prompt(t("shareCopyPrompt"), url);
      return;
    }
    const icon = btnShare.querySelector(".btn-icon")!;
    const label = btnShare.querySelector(".btn-text")!;
    icon.textContent = "✓";
    label.textContent = t("shareCopied");
    setTimeout(() => {
      icon.textContent = "🔗";
      label.textContent = t("btnShare");
    }, 2000);
  });

  btnBackupZip?.addEventListener("click", () => {
    exportAllScoresZip();
  });

  btnExportLibraryZip?.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    exportAllScoresZip();
  });
}
