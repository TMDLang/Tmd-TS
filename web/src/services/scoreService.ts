// web/src/services/scoreService.ts
// Handles score auto-saving, hash-based sharing, and score title extraction

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
    history.replaceState(null, "", window.location.pathname + window.location.search);
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
}
