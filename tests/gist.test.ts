import { describe, expect, it, vi } from "vitest";

import { extractGistId, fetchGistTmd, GistImportResult } from "../web/src/gist.js";

describe("GitHub Gist TMD Importer (TDD)", () => {
  describe("extractGistId", () => {
    it("extracts ID from standard gist.github.com URL", () => {
      expect(extractGistId("https://gist.github.com/zonble/6b85675e2e88a099a25997dbb341f23c")).toBe(
        "6b85675e2e88a099a25997dbb341f23c"
      );
      expect(extractGistId("https://gist.github.com/6b85675e2e88a099a25997dbb341f23c")).toBe(
        "6b85675e2e88a099a25997dbb341f23c"
      );
      expect(extractGistId("http://gist.github.com/user/12345abcde")).toBe("12345abcde");
    });

    it("extracts ID from gist.githubusercontent.com raw URL", () => {
      expect(
        extractGistId(
          "https://gist.githubusercontent.com/zonble/6b85675e2e88a099a25997dbb341f23c/raw/abc123/song.tmd"
        )
      ).toBe("6b85675e2e88a099a25997dbb341f23c");
    });

    it("extracts ID from direct hex / alphanumeric gist ID", () => {
      expect(extractGistId("6b85675e2e88a099a25997dbb341f23c")).toBe("6b85675e2e88a099a25997dbb341f23c");
      expect(extractGistId("   6b85675e2e88a099a25997dbb341f23c   ")).toBe(
        "6b85675e2e88a099a25997dbb341f23c"
      );
    });

    it("returns null for invalid or non-gist inputs", () => {
      expect(extractGistId("")).toBeNull();
      expect(extractGistId("https://github.com/TMDLang/Tmd-TS")).toBeNull();
      expect(extractGistId("invalid url with spaces")).toBeNull();
      expect(extractGistId("https://google.com")).toBeNull();
    });
  });

  describe("fetchGistTmd", () => {
    it("fetches single TMD file from Gist API response", async () => {
      const mockScore = "::SCORE::\n** Gist Song **\n!= 120\n?= C\n<4/4>\n";
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          description: "My test song on Gist",
          files: {
            "score.tmd": {
              filename: "score.tmd",
              type: "text/plain",
              content: mockScore,
              truncated: false,
            },
          },
        }),
      });

      const res = await fetchGistTmd("6b85675e2e88a099a25997dbb341f23c", mockFetch as any);
      expect(res.title).toBe("Gist Song");
      expect(res.filename).toBe("score.tmd");
      expect(res.content).toBe(mockScore);
    });

    it("prefers .tmd files over other files in a multi-file gist", async () => {
      const mockScore = "::SCORE::\n** Multi File TMD **\n";
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          description: "Multi-file Gist",
          files: {
            "README.md": {
              filename: "README.md",
              content: "# Instructions",
            },
            "my_song.tmd": {
              filename: "my_song.tmd",
              content: mockScore,
            },
            "notes.txt": {
              filename: "notes.txt",
              content: "random notes",
            },
          },
        }),
      });

      const res = await fetchGistTmd("https://gist.github.com/user/abcdef123456", mockFetch as any);
      expect(res.filename).toBe("my_song.tmd");
      expect(res.content).toBe(mockScore);
      expect(res.title).toBe("Multi File TMD");
    });

    it("finds file containing ::SCORE:: if no .tmd extension exists", async () => {
      const mockScore = "::SCORE::\n** Text File Score **\n";
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          files: {
            "song.txt": {
              filename: "song.txt",
              content: mockScore,
            },
          },
        }),
      });

      const res = await fetchGistTmd("abcdef123456", mockFetch as any);
      expect(res.filename).toBe("song.txt");
      expect(res.content).toBe(mockScore);
      expect(res.title).toBe("Text File Score");
    });

    it("handles truncated content by fetching raw_url", async () => {
      const fullScore = "::SCORE::\n** Large Gist Song **\n!= 100\n";
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            files: {
              "big.tmd": {
                filename: "big.tmd",
                truncated: true,
                raw_url: "https://gist.githubusercontent.com/raw/big.tmd",
              },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => fullScore,
        });

      const res = await fetchGistTmd("1234567890abcdef1234567890abcdef", mockFetch as any);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res.content).toBe(fullScore);
      expect(res.title).toBe("Large Gist Song");
    });

    it("throws error when gist is not found (404)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(fetchGistTmd("00000000000000000000000000000000", mockFetch as any)).rejects.toThrow(
        /Gist not found/i
      );
    });

    it("throws error when no TMD content is found in gist", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          files: {
            "test.js": {
              filename: "test.js",
              content: "console.log('hello');",
            },
          },
        }),
      });

      await expect(fetchGistTmd("abcdef1234567890", mockFetch as any)).rejects.toThrow(
        /No TMD score found/i
      );
    });
  });

  describe("UI Integration", () => {
    it("provides i18n strings for Gist import dialog in zh-TW and en", async () => {
      const { zhTW } = await import("../web/src/locales/zh-TW.js");
      const { en } = await import("../web/src/locales/en.js");

      expect((zhTW as any).btnImportGist).toBeDefined();
      expect((zhTW as any).btnImportGistTitle).toBeDefined();
      expect((zhTW as any).importGistModalTitle).toBeDefined();
      expect((zhTW as any).importGistPrompt).toBeDefined();
      expect((zhTW as any).importGistPlaceholder).toBeDefined();
      expect((zhTW as any).importGistSuccess).toBeDefined();
      expect((zhTW as any).importGistError).toBeDefined();

      expect((en as any).btnImportGist).toBeDefined();
      expect((en as any).btnImportGistTitle).toBeDefined();
      expect((en as any).importGistModalTitle).toBeDefined();
      expect((en as any).importGistPrompt).toBeDefined();
      expect((en as any).importGistPlaceholder).toBeDefined();
      expect((en as any).importGistSuccess).toBeDefined();
      expect((en as any).importGistError).toBeDefined();
    });

    it("includes Gist import button and modal in web/index.html", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const html = fs.readFileSync(path.join(__dirname, "../web/index.html"), "utf-8");

      expect(html).toContain('id="btn-import-gist"');
      expect(html).toContain('id="import-gist-modal"');
      expect(html).toContain('id="input-gist-url"');
      expect(html).toContain('id="btn-confirm-import-gist"');
    });
  });
});
