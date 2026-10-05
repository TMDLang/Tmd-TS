import { TMDCanonGenerator } from "../../../src/domain/canon_gen.js";
import type { TMDWebEditor } from "../editor.js";
import { fetchGistTmd } from "../gist.js";
import { escapeHtml } from "../html.js";
import { t } from "../i18n.js";
import { SAMPLES } from "../samples.js";
import { extractTmdTitle,SavedScore, TmdStorage } from "../storage/db.js";

export interface LibraryDrawerElements {
  libraryDrawer: HTMLElement;
  btnToggleLibrary?: HTMLButtonElement | null;
  btnCloseLibrary?: HTMLButtonElement | null;
  btnLibraryNew?: HTMLButtonElement | null;
  inputImportTmd?: HTMLInputElement | null;
  btnImportGist?: HTMLButtonElement | null;
  importGistModal?: HTMLDialogElement | null;
  inputGistUrl?: HTMLInputElement | null;
  btnConfirmImportGist?: HTMLButtonElement | null;
  libraryScoresList?: HTMLElement | null;
  librarySamplesList?: HTMLElement | null;
  libraryScoresCount?: HTMLElement | null;

  // Canon Generator Modal Elements
  btnOpenCanonModal?: HTMLButtonElement | null;
  canonGeneratorModal?: HTMLDialogElement | null;
  inputCanonTitle?: HTMLInputElement | null;
  selectCanonKey?: HTMLSelectElement | null;
  inputCanonTempo?: HTMLInputElement | null;
  selectCanonMode?: HTMLSelectElement | null;
  selectCanonType?: HTMLSelectElement | null;
  inputCanonVoices?: HTMLInputElement | null;
  inputCanonOffset?: HTMLInputElement | null;
  inputCanonVariations?: HTMLInputElement | null;
  selectCanonOutput?: HTMLSelectElement | null;
  btnConfirmGenerateCanon?: HTMLButtonElement | null;
  btnCloseCanonModal?: HTMLButtonElement | null;
  btnCancelCanonModal?: HTMLButtonElement | null;
}

export function parseImportedScoreFile(
  fileName: string,
  rawContent: string
): { title: string; content: string } {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    throw new Error(t("importFileNoTmdFound") || "未在檔案中找到有效的 TMD 樂譜代碼或標頭 (缺少 ::SCORE::)");
  }

  const isMarkdown = /\.(?:md|markdown)$/i.test(fileName);
  let scoreContent = "";

  if (isMarkdown) {
    const codeBlockMatch = trimmed.match(/```(?:tmd)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch && codeBlockMatch[1]?.trim()) {
      scoreContent = codeBlockMatch[1].trim();
    } else if (trimmed.includes("::SCORE::")) {
      const idx = trimmed.indexOf("::SCORE::");
      scoreContent = trimmed.slice(idx).trim();
    } else {
      throw new Error(t("importFileNoTmdFound") || "未在檔案中找到有效的 TMD 樂譜代碼或標頭 (缺少 ::SCORE::)");
    }
  } else {
    // .tmd, .txt, or other text files - preserve original score content
    scoreContent = rawContent;
  }

  // Ensure content has ::SCORE:: or valid TMD structure
  if (!scoreContent.includes("::SCORE::")) {
    // If not markdown, could still be valid if it starts or has headers, but if it came from .md it must have ::SCORE::
    if (isMarkdown) {
      throw new Error(t("importFileNoTmdFound") || "未在檔案中找到有效的 TMD 樂譜代碼或標頭 (缺少 ::SCORE::)");
    }
  }

  const defaultBaseName = fileName.replace(/\.[^/.]+$/, "");
  const extracted = extractTmdTitle(scoreContent);
  const title = extracted !== "未命名樂譜" ? extracted : defaultBaseName;

  return {
    title,
    content: scoreContent,
  };
}

export class TMDLibraryDrawerController {
  private currentScoreId: string | null = null;
  private isTemplateScore: boolean = false;
  private activeTemplateId: string | null = null;

  constructor(
    private elements: LibraryDrawerElements,
    private getEditor: () => TMDWebEditor,
    private onScoreLoaded: (text: string) => void,
    private onSavePanelsState: () => void,
    private onShowToast?: (message: string, type?: "success" | "error") => void
  ) {}

  public async importScoreFile(file: File): Promise<SavedScore> {
    const rawContent = await file.text();
    const { title, content } = parseImportedScoreFile(file.name, rawContent);
    const newScore = await TmdStorage.saveScore({
      title,
      content,
    });
    this.loadScoreIntoEditor(newScore);
    if (this.onShowToast) {
      this.onShowToast(
        t("importFileSuccess").replace("{title}", newScore.title),
        "success"
      );
    }
    return newScore;
  }

  public init(): void {
    const {
      libraryDrawer,
      btnToggleLibrary,
      btnCloseLibrary,
      btnLibraryNew,
      inputImportTmd,
      libraryScoresList,
      librarySamplesList,
    } = this.elements;

    if (!libraryDrawer.classList.contains("hidden")) {
      this.refreshLibraryScores();
    }

    btnToggleLibrary?.addEventListener("click", () => {
      libraryDrawer.classList.toggle("hidden");
      if (!libraryDrawer.classList.contains("hidden")) {
        this.refreshLibraryScores();
      }
      this.onSavePanelsState();
    });

    btnCloseLibrary?.addEventListener("click", () => {
      libraryDrawer.classList.add("hidden");
      this.onSavePanelsState();
    });

    btnLibraryNew?.addEventListener("click", () => {
      this.createNewSong();
    });

    // File input change handler (.tmd, .md, .txt)
    inputImportTmd?.addEventListener("change", async () => {
      const file = inputImportTmd.files?.[0];
      if (!file) return;
      try {
        await this.importScoreFile(file);
        inputImportTmd.value = "";
      } catch (err: any) {
        const errorMsg = err.message || String(err);
        alert(t("importFileError").replace("{error}", errorMsg));
      }
    });

    // Drag-and-drop support on libraryDrawer
    let dragCounter = 0;
    libraryDrawer.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dragCounter++;
      libraryDrawer.classList.add("drag-over");
    });

    libraryDrawer.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
      libraryDrawer.classList.add("drag-over");
    });

    libraryDrawer.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        libraryDrawer.classList.remove("drag-over");
      }
    });

    libraryDrawer.addEventListener("drop", async (e) => {
      e.preventDefault();
      dragCounter = 0;
      libraryDrawer.classList.remove("drag-over");

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      try {
        await this.importScoreFile(file);
      } catch (err: any) {
        const errorMsg = err.message || String(err);
        alert(t("importFileError").replace("{error}", errorMsg));
      }
    });

    const { btnImportGist, importGistModal, inputGistUrl, btnConfirmImportGist } = this.elements;

    btnImportGist?.addEventListener("click", () => {
      if (inputGistUrl) inputGistUrl.value = "";
      importGistModal?.showModal();
      setTimeout(() => inputGistUrl?.focus(), 50);
    });

    const handleImportGistConfirm = async () => {
      const urlOrId = inputGistUrl?.value?.trim();
      if (!urlOrId) {
        inputGistUrl?.focus();
        return;
      }
      try {
        if (btnConfirmImportGist) {
          btnConfirmImportGist.disabled = true;
          btnConfirmImportGist.textContent = "⏳ ...";
        }
        const result = await fetchGistTmd(urlOrId);
        const saved = await TmdStorage.saveScore({
          title: result.title,
          content: result.content,
        });
        this.loadScoreIntoEditor(saved);
        importGistModal?.close();
        if (this.onShowToast) {
          this.onShowToast(t("importGistSuccess").replace("{title}", saved.title), "success");
        }
      } catch (err: any) {
        const errorMsg = err.message || String(err);
        alert(t("importGistError").replace("{error}", errorMsg));
      } finally {
        if (btnConfirmImportGist) {
          btnConfirmImportGist.disabled = false;
          btnConfirmImportGist.textContent = t("btnConfirm") || "確認";
        }
      }
    };

    btnConfirmImportGist?.addEventListener("click", () => {
      handleImportGistConfirm();
    });

    inputGistUrl?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleImportGistConfirm();
      }
    });

    // --- Canon Generator Modal Logic ---
    const {
      btnOpenCanonModal,
      canonGeneratorModal,
      inputCanonTitle,
      selectCanonKey,
      inputCanonTempo,
      selectCanonMode,
      selectCanonType,
      inputCanonVoices,
      inputCanonOffset,
      inputCanonVariations,
      selectCanonOutput,
      btnConfirmGenerateCanon,
      btnCloseCanonModal,
      btnCancelCanonModal,
    } = this.elements;

    btnOpenCanonModal?.addEventListener("click", () => {
      canonGeneratorModal?.showModal();
    });

    const closeCanonModal = () => {
      canonGeneratorModal?.close();
    };

    btnCloseCanonModal?.addEventListener("click", closeCanonModal);
    btnCancelCanonModal?.addEventListener("click", closeCanonModal);

    btnConfirmGenerateCanon?.addEventListener("click", async () => {
      try {
        const title = inputCanonTitle?.value?.trim() || "Canon";
        const key = selectCanonKey?.value || "D";
        const tempo = parseInt(inputCanonTempo?.value || "64", 10) || 64;
        const mode = (selectCanonMode?.value || "tonal") as "tonal" | "pentatonic";
        const canonType = (selectCanonType?.value || "standard") as "standard" | "crab" | "mirror" | "table";
        const numVoices = parseInt(inputCanonVoices?.value || "3", 10) || 3;
        const offsetBars = parseInt(inputCanonOffset?.value || "2", 10) || 2;
        const numVariations = parseInt(inputCanonVariations?.value || "3", 10) || 3;
        const useMacro = (selectCanonOutput?.value || "macro") === "macro";

        const generator = new TMDCanonGenerator({
          title,
          key,
          tempo,
          mode,
          canonType,
          numVoices,
          offsetBars,
          numVariations,
          useMacro,
        });

        const scoreContent = generator.generate();
        const savedScore = await TmdStorage.saveScore({
          title,
          content: scoreContent,
        });

        this.loadScoreIntoEditor(savedScore);
        closeCanonModal();

        if (this.onShowToast) {
          this.onShowToast(
            t("canonToastSuccess").replace("{title}", savedScore.title),
            "success"
          );
        }
      } catch (err: any) {
        alert(`生成卡農失敗: ${err.message || String(err)}`);
      }
    });

    libraryScoresList?.addEventListener("click", async (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest(".library-item") as HTMLElement | null;
      if (!item || !item.dataset.id) return;
      const scoreId = item.dataset.id;

      const action = target.closest("[data-action]")?.getAttribute("data-action");
      if (action === "delete") {
        e.stopPropagation();
        const score = await TmdStorage.getScore(scoreId);
        if (!score) return;
        if (confirm(t("confirmDeleteScore").replace("{title}", score.title))) {
          await TmdStorage.deleteScore(scoreId);
          if (this.currentScoreId === scoreId) {
            const remaining = await TmdStorage.listScores();
            if (remaining.length > 0) {
              this.loadScoreIntoEditor(remaining[0]);
            } else {
              this.loadTemplateIntoEditor("sandiansanye");
            }
          }
          await this.refreshLibraryScores();
        }
        return;
      }

      if (action === "copy") {
        e.stopPropagation();
        const copy = await TmdStorage.duplicateScore(scoreId);
        this.loadScoreIntoEditor(copy);
        return;
      }

      const score = await TmdStorage.getScore(scoreId);
      if (score) {
        this.loadScoreIntoEditor(score);
      }
    });

    librarySamplesList?.addEventListener("click", (e) => {
      const item = (e.target as HTMLElement).closest(".library-item") as HTMLElement | null;
      if (!item || !item.dataset.sampleId) return;
      this.loadTemplateIntoEditor(item.dataset.sampleId);
    });
  }

  public getCurrentScoreId(): string | null {
    return this.currentScoreId;
  }

  public getIsTemplateScore(): boolean {
    return this.isTemplateScore;
  }

  public setActiveScore(scoreId: string | null, isTemplate = false, templateId: string | null = null): void {
    this.currentScoreId = scoreId;
    this.isTemplateScore = isTemplate;
    this.activeTemplateId = templateId;
    if (!this.elements.libraryDrawer.classList.contains("hidden")) {
      this.refreshLibraryScores();
    }
  }

  public loadScoreIntoEditor(score: SavedScore): void {
    this.currentScoreId = score.id;
    this.isTemplateScore = false;
    this.activeTemplateId = null;
    TmdStorage.setActiveScoreId(score.id);
    const editor = this.getEditor();
    editor.setContent(score.content);
    this.onScoreLoaded(score.content);
    this.refreshLibraryScores();
  }

  public loadTemplateIntoEditor(sampleId: string): void {
    const sample = SAMPLES.find((s) => s.id === sampleId);
    if (!sample) return;
    this.currentScoreId = null;
    this.isTemplateScore = true;
    this.activeTemplateId = sample.id;
    TmdStorage.setActiveScoreId(null);
    const editor = this.getEditor();
    editor.setContent(sample.content);
    this.onScoreLoaded(sample.content);
    this.refreshLibraryScores();
  }

  public async createNewSong(): Promise<void> {
    const starterSample = SAMPLES.find((s) => s.id === "starter_template") || SAMPLES[0];
    const newScore = await TmdStorage.saveScore({
      title: "未命名新歌",
      content: starterSample.content,
    });
    this.loadScoreIntoEditor(newScore);
  }

  public async refreshLibraryScores(): Promise<void> {
    const { libraryScoresCount, libraryScoresList, librarySamplesList } = this.elements;
    try {
      const scores = await TmdStorage.listScores();
      if (libraryScoresCount) {
        libraryScoresCount.textContent = String(scores.length);
      }

      if (libraryScoresList) {
        if (scores.length === 0) {
          libraryScoresList.innerHTML = `<div class="library-empty-hint">${t("emptyScoresHint")}</div>`;
        } else {
          libraryScoresList.innerHTML = scores
            .map((score) => {
              const isActive = this.currentScoreId === score.id;
              const dateStr = new Date(score.updatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              return `
                <div class="library-item ${isActive ? "active" : ""}" data-id="${escapeHtml(score.id)}">
                  <div class="library-item-content">
                    <div class="library-item-title">${escapeHtml(score.title)}</div>
                    <div class="library-item-meta">
                      <span>🕒 ${dateStr}</span>
                    </div>
                  </div>
                  <div class="library-item-actions">
                    <button class="library-action-btn copy-btn" data-action="copy" title="複製副本">📋</button>
                    <button class="library-action-btn delete-btn delete" data-action="delete" title="刪除">🗑️</button>
                  </div>
                </div>
              `;
            })
            .join("");
        }
      }

      if (librarySamplesList) {
        librarySamplesList.innerHTML = SAMPLES.map((sample) => {
          const isSelected = this.isTemplateScore && this.activeTemplateId === sample.id;
          return `
            <div class="library-item ${isSelected ? "active" : ""}" data-sample-id="${sample.id}">
              <div class="library-item-content">
                <div class="library-item-title">${sample.name}</div>
                <div class="library-item-meta">
                  <span>${sample.category}</span>
                </div>
              </div>
            </div>
          `;
        }).join("");
      }
    } catch (e) {
      console.error("Failed to refresh library scores:", e);
    }
  }
}
