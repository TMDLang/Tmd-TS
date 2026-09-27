import "fake-indexeddb/auto";

import { beforeEach,describe, expect, it } from "vitest";

import {
  extractTmdTitle,
  SavedScore,
  TmdStorage,
} from "../web/src/storage/db.js";

describe("TMD IndexedDB Storage (TDD)", () => {
  beforeEach(async () => {
    // Reset database for clean test runs
    await TmdStorage.clearAll();
  });

  it("extracts song title from ** Title ** or falls back gracefully", () => {
    expect(extractTmdTitle("::SCORE::\n** 我的新歌 **\n!= 120")).toBe("我的新歌");
    expect(extractTmdTitle("::SCORE::\n**   Space Title   **")).toBe("Space Title");
    expect(extractTmdTitle("::SCORE::\n!= 120")).toBe("未命名樂譜");
    expect(extractTmdTitle("")).toBe("未命名樂譜");
  });

  it("creates, reads, updates, and deletes saved scores", async () => {
    const score1 = await TmdStorage.saveScore({
      id: "score-1",
      title: "曲目一",
      content: "::SCORE::\n** 曲目一 **\n",
    });

    expect(score1.id).toBe("score-1");
    expect(score1.title).toBe("曲目一");
    expect(score1.createdAt).toBeTypeOf("number");
    expect(score1.updatedAt).toBeTypeOf("number");

    // Read by ID
    const fetched = await TmdStorage.getScore("score-1");
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe("曲目一");

    // Update score content and title extraction
    const updated = await TmdStorage.saveScore({
      id: "score-1",
      title: "更新曲目",
      content: "::SCORE::\n** 更新曲目 **\n!= 140\n",
    });
    expect(updated.title).toBe("更新曲目");
    expect(updated.updatedAt).toBeGreaterThanOrEqual(score1.updatedAt);

    // List all scores
    const all = await TmdStorage.listScores();
    expect(all.length).toBe(1);
    expect(all[0].id).toBe("score-1");

    // Delete score
    await TmdStorage.deleteScore("score-1");
    const afterDelete = await TmdStorage.getScore("score-1");
    expect(afterDelete).toBeNull();
    const emptyList = await TmdStorage.listScores();
    expect(emptyList.length).toBe(0);
  });

  it("handles duplicateScore correctly", async () => {
    await TmdStorage.saveScore({
      id: "orig-1",
      title: "原版創作",
      content: "::SCORE::\n** 原版創作 **\n",
    });

    const copy = await TmdStorage.duplicateScore("orig-1", "原版創作 (副本)");
    expect(copy.id).not.toBe("orig-1");
    expect(copy.title).toBe("原版創作 (副本)");
    expect(copy.content).toContain("** 原版創作 (副本) **");

    const all = await TmdStorage.listScores();
    expect(all.length).toBe(2);
  });

  it("finds a saved score by exact content, newest first", async () => {
    const content = "::SCORE::\n** 分享曲 **\n!= 100\n";
    await TmdStorage.saveScore({ id: "older", content });
    await TmdStorage.saveScore({ id: "other", content: content + "\n" });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await TmdStorage.saveScore({ id: "newer", content });

    expect((await TmdStorage.findScoreByContent(content))?.id).toBe("newer");
    expect((await TmdStorage.findScoreByContent(content + "\n"))?.id).toBe("other");
    expect(await TmdStorage.findScoreByContent("::SCORE::\n** 沒有這首 **\n")).toBeNull();
  });

  it("handles last active score session state", () => {
    // Initially null
    TmdStorage.setActiveScoreId(null);
    expect(TmdStorage.getActiveScoreId()).toBeNull();

    // Set active ID
    TmdStorage.setActiveScoreId("my-score-123");
    expect(TmdStorage.getActiveScoreId()).toBe("my-score-123");

    // Clear active ID
    TmdStorage.setActiveScoreId(null);
    expect(TmdStorage.getActiveScoreId()).toBeNull();
  });
});
