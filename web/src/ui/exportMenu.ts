import JSZip from "jszip";

import { TmdWAVRenderer } from "../../../src/audio.js";
import {
  TmdABCGenerator,
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
  btnExportVsq?: HTMLButtonElement | null;
  btnExportVsqx?: HTMLButtonElement | null;
  btnExportWAV: HTMLButtonElement;
  btnExportSkill: HTMLButtonElement;
  btnExportLibraryZip?: HTMLButtonElement | null;
  btnBackupZip?: HTMLButtonElement | null;
  btnShare: HTMLButtonElement;
  toolsDropdown?: HTMLElement | null;
}

export function getSafeFilename(title?: string, ext: string = "mid"): string {
  const safe = (title || "untitled")
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
  downloadBlob("SKILL.md", new Blob([TmdSkill.skillMarkdown], { type: "text/markdown;charset=utf-8" }));
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
      let baseName = s.title.replace(/[\\/:*?"<>|]/g, "_").trim() || "score";
      let count = usedFilenames.get(baseName) || 0;
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
    btnExportVsq,
    btnExportVsqx,
    btnExportWAV,
    btnExportSkill,
    btnExportLibraryZip,
    btnBackupZip,
    btnShare,
    toolsDropdown,
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

  btnExportMidi.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    const editor = getEditor();
    const text = editor.getContent();
    const sheet = TmdParser.parse(text);
    if (!sheet) return alert(t("alertCannotExport"));
    const midi = TmdMIDIGenerator.generateMIDI(sheet);
    downloadBlob(getSafeFilename(sheet.name, "mid"), new Blob([midi as any], { type: "audio/midi" }));
  });

  btnExportReaper.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    const editor = getEditor();
    const text = editor.getContent();
    const sheet = TmdParser.parse(text);
    if (!sheet) return alert(t("alertCannotExport"));
    const rpp = TmdReaperGenerator.generateRPP(sheet);
    downloadBlob(getSafeFilename(sheet.name, "rpp"), new Blob([rpp], { type: "text/plain;charset=utf-8" }));
  });

  btnExportMusicXML.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    const editor = getEditor();
    const text = editor.getContent();
    const sheet = TmdParser.parse(text);
    if (!sheet) return alert(t("alertCannotExport"));
    const xml = TmdMusicXMLGenerator.generateMusicXML(sheet);
    downloadBlob(getSafeFilename(sheet.name, "musicxml"), new Blob([xml], { type: "application/vnd.recordare.musicxml+xml;charset=utf-8" }));
  });

  btnExportLilyPond.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    const editor = getEditor();
    const text = editor.getContent();
    const sheet = TmdParser.parse(text);
    if (!sheet) return alert(t("alertCannotExport"));
    const ly = TmdLilyPondGenerator.generateLilyPond(sheet);
    downloadBlob(getSafeFilename(sheet.name, "ly"), new Blob([ly], { type: "text/plain;charset=utf-8" }));
  });

  btnExportABC.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    const editor = getEditor();
    const text = editor.getContent();
    const sheet = TmdParser.parse(text);
    if (!sheet) return alert(t("alertCannotExport"));
    const abc = TmdABCGenerator.generateABC(sheet);
    downloadBlob(getSafeFilename(sheet.name, "abc"), new Blob([abc], { type: "text/vnd.abc;charset=utf-8" }));
  });

  btnExportChordPro?.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    const editor = getEditor();
    const text = editor.getContent();
    const sheet = TmdParser.parse(text);
    if (!sheet) return alert(t("alertCannotExport"));
    const cho = TmdChordProGenerator.generateChordPro(sheet);
    downloadBlob(getSafeFilename(sheet.name, "cho"), new Blob([cho], { type: "text/plain;charset=utf-8" }));
  });

  btnExportVsq?.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    const editor = getEditor();
    const text = editor.getContent();
    const sheet = TmdParser.parse(text);
    if (!sheet) return alert(t("alertCannotExport"));
    const vsq = TmdVSQGenerator.generateVSQ(sheet);
    downloadBlob(getSafeFilename(sheet.name, "vsq"), new Blob([vsq as any], { type: "audio/x-vsq" }));
  });

  btnExportVsqx?.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    const editor = getEditor();
    const text = editor.getContent();
    const sheet = TmdParser.parse(text);
    if (!sheet) return alert(t("alertCannotExport"));
    const vsqx = TmdVSQXGenerator.generateVSQX(sheet);
    downloadBlob(getSafeFilename(sheet.name, "vsqx"), new Blob([vsqx], { type: "application/xml;charset=utf-8" }));
  });

  btnExportWAV.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    const editor = getEditor();
    const text = editor.getContent();
    const sheet = TmdParser.parse(text);
    if (!sheet) return alert(t("alertCannotExport"));
    const wav = TmdWAVRenderer.renderWAV(sheet);
    downloadBlob(getSafeFilename(sheet.name, "wav"), new Blob([wav as any], { type: "audio/wav" }));
  });

  btnExportSkill.addEventListener("click", () => {
    exportDropdown.classList.remove("open");
    downloadSkillFile();
  });

  btnShare.addEventListener("click", async () => {
    const editor = getEditor();
    let url: string;
    try {
      url = window.location.origin + window.location.pathname + (await encodeShareHash(editor.getContent()));
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
