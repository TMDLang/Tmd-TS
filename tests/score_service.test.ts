import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { TmdScoreService } from "../web/src/services/scoreService.js";
import { encodeShareHash } from "../web/src/share.js";
import { SavedScore, TmdStorage } from "../web/src/storage/db.js";

describe("TmdScoreService Unit Tests", () => {
  beforeEach(async () => {
    await TmdStorage.clearAll();
    vi.restoreAllMocks();
  });

  describe("Auto-save scheduling", () => {
    it("auto-saves a template score as a new score and notifies callbacks", async () => {
      let isTemplate = true;
      let currentScoreId: string | null = null;
      let loadedScore: SavedScore | null = null;
      const refreshMock = vi.fn().mockResolvedValue(undefined);
      const feedbackMock = vi.fn();

      const service = new TmdScoreService({
        getIsTemplateScore: () => isTemplate,
        getCurrentScoreId: () => currentScoreId,
        loadScoreIntoEditor: (score) => {
          loadedScore = score;
          isTemplate = false;
          currentScoreId = score.id;
        },
        refreshLibraryScores: refreshMock,
        onAutoSaveFeedback: feedbackMock,
      });

      const scoreContent = "::SCORE::\n** Auto Saved Song **\n!= 120\n?= C\n<4/4>\n";
      service.scheduleAutoSave(scoreContent, 10);

      // Wait for delay
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(loadedScore).not.toBeNull();
      expect(loadedScore?.title).toBe("Auto Saved Song");
      expect(refreshMock).toHaveBeenCalled();
      expect(feedbackMock).toHaveBeenCalled();

      // Ensure score is persisted
      const fromDb = await TmdStorage.getScore(loadedScore!.id);
      expect(fromDb?.content).toBe(scoreContent);
    });

    it("auto-saves changes to an existing active score", async () => {
      const initialScore = await TmdStorage.saveScore({
        title: "Initial Song",
        content: "::SCORE::\n** Initial Song **\n",
      });

      const isTemplate = false;
      const currentScoreId = initialScore.id;
      const refreshMock = vi.fn().mockResolvedValue(undefined);
      const feedbackMock = vi.fn();

      const service = new TmdScoreService({
        getIsTemplateScore: () => isTemplate,
        getCurrentScoreId: () => currentScoreId,
        loadScoreIntoEditor: vi.fn(),
        refreshLibraryScores: refreshMock,
        onAutoSaveFeedback: feedbackMock,
      });

      const updatedContent = "::SCORE::\n** Modified Song **\n!= 140\n";
      service.scheduleAutoSave(updatedContent, 10);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const updated = await TmdStorage.getScore(initialScore.id);
      expect(updated?.title).toBe("Modified Song");
      expect(updated?.content).toBe(updatedContent);
      expect(refreshMock).toHaveBeenCalled();
      expect(feedbackMock).toHaveBeenCalled();
    });

    it("cancels pending auto-save when requested", async () => {
      let saved = false;
      const service = new TmdScoreService({
        getIsTemplateScore: () => true,
        getCurrentScoreId: () => null,
        loadScoreIntoEditor: () => {
          saved = true;
        },
        refreshLibraryScores: async () => {},
      });

      service.scheduleAutoSave("::SCORE::\n** Cancel Me **\n", 50);
      service.cancelAutoSave();

      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(saved).toBe(false);
    });
  });

  describe("importSharedScore", () => {
    it("imports score from valid #tmd= share hash", async () => {
      const scoreText = "::SCORE::\n** Shared Melody **\n!= 110\n?= G\n";
      const hash = await encodeShareHash(scoreText);

      const replaceStateMock = vi.fn();
      (globalThis as any).window = {
        location: {
          pathname: "/",
          search: "?lang=en",
          hash,
        },
      };
      (globalThis as any).history = {
        replaceState: replaceStateMock,
      };

      const result = await TmdScoreService.importSharedScore();
      expect(result).not.toBeNull();
      expect(result?.title).toBe("Shared Melody");
      expect(result?.content).toBe(scoreText);
      expect(replaceStateMock).toHaveBeenCalledWith(null, "", "/?lang=en");
    });

    it("reuses existing score when shared score content is already in storage", async () => {
      const scoreText = "::SCORE::\n** Existing Melody **\n";
      const existing = await TmdStorage.saveScore({
        title: "Existing Melody",
        content: scoreText,
      });

      const hash = await encodeShareHash(scoreText);
      (globalThis as any).window = {
        location: {
          pathname: "/",
          search: "",
          hash,
        },
      };
      (globalThis as any).history = {
        replaceState: vi.fn(),
      };

      const result = await TmdScoreService.importSharedScore();
      expect(result?.id).toBe(existing.id);
    });

    it("handles invalid or corrupt share hash gracefully with alert", async () => {
      const alertMock = vi.fn();
      const replaceStateMock = vi.fn();
      (globalThis as any).alert = alertMock;
      (globalThis as any).window = {
        location: {
          pathname: "/",
          search: "",
          hash: "#tmd=invalid_corrupted_payload_xyz",
        },
      };
      (globalThis as any).history = {
        replaceState: replaceStateMock,
      };

      const result = await TmdScoreService.importSharedScore();
      expect(result).toBeNull();
      expect(alertMock).toHaveBeenCalled();
      expect(replaceStateMock).toHaveBeenCalledWith(null, "", "/");
    });

    it("returns null when hash is empty or not a share link", async () => {
      (globalThis as any).window = {
        location: {
          pathname: "/",
          search: "",
          hash: "",
        },
      };
      const result = await TmdScoreService.importSharedScore();
      expect(result).toBeNull();
    });
  });

  describe("clearShareHash & clearGistParam edge cases", () => {
    it("safely handles clearShareHash and clearGistParam when history/window are missing or malformed", () => {
      (globalThis as any).window = undefined;
      (globalThis as any).history = undefined;

      expect(() => TmdScoreService.clearShareHash()).not.toThrow();
      expect(() => TmdScoreService.clearGistParam()).not.toThrow();
    });

    it("clears gist query param while preserving multiple other query params", () => {
      const replaceStateMock = vi.fn();
      (globalThis as any).window = {
        location: {
          href: "https://example.com/studio?theme=dark&gist=abc12345&mode=compact#editor",
          pathname: "/studio",
          search: "?theme=dark&gist=abc12345&mode=compact",
          hash: "#editor",
        },
      };
      (globalThis as any).history = {
        replaceState: replaceStateMock,
      };

      TmdScoreService.clearGistParam();
      expect(replaceStateMock).toHaveBeenCalledWith(
        null,
        "",
        "/studio?theme=dark&mode=compact#editor"
      );
    });
  });
});
