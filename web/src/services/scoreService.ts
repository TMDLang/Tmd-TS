// web/src/services/scoreService.ts
// Handles score auto-saving, hash-based sharing, and score title extraction

import { fetchGistTmd } from "../gist.js";
import { t } from "../i18n.js";
import { decodeShareHash } from "../share.js";
import { extractTmdTitle,SavedScore, TmdStorage } from "../storage/db.js";

export class TMDScoreService {
  private autoSaveTimer: any = null;

  constructor(
    private options: {
      getIsTemplateScore: () => boolean;
      getCurrentScoreId: () => string | null;
      loadScoreIntoEditor: (score: SavedScore) => void;
      refreshLibraryScores: () => Promise<void>;
      onAutoSaveFeedback?: (statusText: string) => void;
    }
  ) {}

  public scheduleAutoSave(text: string, delayMs = 500): void {
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(async () => {
      try {
        if (this.options.getIsTemplateScore()) {
          const title = extractTmdTitle(text);
          const newScore = await TmdStorage.saveScore({
            title,
            content: text,
          });
          this.options.loadScoreIntoEditor(newScore);
          await this.options.refreshLibraryScores();
        } else {
          const currentId = this.options.getCurrentScoreId();
          if (currentId) {
            const title = extractTmdTitle(text);
            await TmdStorage.saveScore({
              id: currentId,
              title,
              content: text,
            });
            TmdStorage.setActiveScoreId(currentId);
            await this.options.refreshLibraryScores();
          }
        }

        if (this.options.onAutoSaveFeedback) {
          this.options.onAutoSaveFeedback(t("savedAutoNotice"));
        }
      } catch (e) {
        console.error("Auto-save error:", e);
      }
    }, delayMs);
  }

  public cancelAutoSave(): void {
    clearTimeout(this.autoSaveTimer);
  }

  public static clearShareHash(): void {
    if (typeof history !== "undefined" && typeof window !== "undefined" && history.replaceState) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  public static clearGistParam(): void {
    if (typeof history !== "undefined" && typeof window !== "undefined" && history.replaceState) {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("gist")) {
          url.searchParams.delete("gist");
          const search = url.searchParams.toString();
          const query = search ? `?${search}` : "";
          history.replaceState(null, "", url.pathname + query + url.hash);
        }
      } catch (_) {}
    }
  }

  public static async importSharedScore(): Promise<SavedScore | null> {
    let text: string | null;
    try {
      text = await decodeShareHash(window.location.hash);
    } catch (err) {
      console.warn("Invalid share link:", err);
      TMDScoreService.clearShareHash();
      alert(t("shareInvalidLink"));
      return null;
    }
    if (text === null) return null;
    let score: SavedScore;
    try {
      score = (await TmdStorage.findScoreByContent(text)) ?? (await TmdStorage.saveScore({ content: text }));
    } catch (err) {
      console.error("Could not save the shared score:", err);
      alert(t("shareSaveFailed"));
      return null;
    }
    TMDScoreService.clearShareHash();
    return score;
  }

  public static async importGistScore(
    gistInput?: string,
    fetchFn: typeof fetch = fetch
  ): Promise<SavedScore | null> {
    let input = gistInput;
    if (!input && typeof window !== "undefined" && window.location) {
      try {
        const params = new URLSearchParams(window.location.search);
        input = params.get("gist") || undefined;
      } catch (_) {}
    }
    if (!input) return null;

    try {
      const result = await fetchGistTmd(input, fetchFn);
      let score: SavedScore;
      try {
        score =
          (await TmdStorage.findScoreByContent(result.content)) ??
          (await TmdStorage.saveScore({
            title: result.title,
            content: result.content,
          }));
      } catch (saveErr) {
        console.error("Could not save the gist score into storage:", saveErr);
        TMDScoreService.clearGistParam();
        if (typeof alert === "function") alert(t("shareSaveFailed"));
        return null;
      }
      TMDScoreService.clearGistParam();
      return score;
    } catch (err: any) {
      console.warn("Failed to load gist from URL:", err);
      TMDScoreService.clearGistParam();
      const errorMsg = err?.message || String(err);
      if (typeof alert === "function") {
        alert(t("importGistError").replace("{error}", errorMsg));
      }
      return null;
    }
  }
}
