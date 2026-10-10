import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CHUNK_RELOAD_DEBOUNCE_MS,
  CHUNK_RELOAD_STORAGE_KEY,
  importWithChunkErrorRecovery,
  isDynamicImportError,
  tryReloadOnChunkError,
} from "../web/src/ui/modals/humModal.js";

const root = process.cwd();
const html = readFileSync(join(root, "web/index.html"), "utf8");
const mainSource = readFileSync(join(root, "web/src/main.ts"), "utf8");
const humModalSource = readFileSync(join(root, "web/src/ui/modals/humModal.ts"), "utf8");

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

describe("Web dynamic import chunk 404 cache recovery (#36)", () => {
  it("declares no-cache and must-revalidate meta headers in web/index.html", () => {
    expect(html).toMatch(
      /<meta\s+http-equiv="Cache-Control"\s+content="[^"]*no-cache[^"]*must-revalidate[^"]*"\s*\/>/i
    );
    expect(html).toMatch(/<meta\s+http-equiv="Pragma"\s+content="no-cache"\s*\/>/i);
    expect(html).toMatch(/<meta\s+http-equiv="Expires"\s+content="0"\s*\/>/i);
  });

  it("registers a global vite:preloadError listener in web/src/main.ts", () => {
    expect(mainSource).toContain('"vite:preloadError"');
    expect(mainSource).toContain("tryReloadOnChunkError");
  });

  it("wraps @spotify/basic-pitch dynamic import with chunk error recovery in humModal.ts", () => {
    expect(humModalSource).toContain("importWithChunkErrorRecovery");
    expect(humModalSource).toContain('import("@spotify/basic-pitch")');
  });

  it("identifies browser dynamic import and chunk load errors accurately", () => {
    expect(
      isDynamicImportError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://tmdlang.github.io/Tmd-TS/assets/index-DZMA8fYt.js"
        )
      )
    ).toBe(true);
    expect(isDynamicImportError(new Error("Importing a module script failed."))).toBe(true);
    expect(
      isDynamicImportError(new Error("error loading dynamically imported module: /assets/chunk.js"))
    ).toBe(true);
    expect(isDynamicImportError(new Error("Unable to preload CSS for /assets/style.css"))).toBe(
      true
    );
    expect(isDynamicImportError(new Error("Microphone permission denied"))).toBe(false);
  });

  it("returns the module without reloading when dynamic import succeeds on first attempt", async () => {
    const storage = createMemoryStorage();
    const reload = vi.fn();
    const expectedModule = { BasicPitch: class {} };
    const importer = vi.fn().mockResolvedValue(expectedModule);

    const result = await importWithChunkErrorRecovery(importer, {
      storage,
      reload,
      now: 100_000,
    });

    expect(result).toBe(expectedModule);
    expect(importer).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("retries once on dynamic import failure and recovers without reloading if retry succeeds", async () => {
    const storage = createMemoryStorage();
    const reload = vi.fn();
    const expectedModule = { BasicPitch: class {} };
    const importer = vi
      .fn()
      .mockRejectedValueOnce(
        new TypeError(
          "Failed to fetch dynamically imported module: https://tmdlang.github.io/Tmd-TS/assets/index-DZMA8fYt.js"
        )
      )
      .mockResolvedValueOnce(expectedModule);

    const result = await importWithChunkErrorRecovery(importer, {
      storage,
      reload,
      now: 100_000,
    });

    expect(result).toBe(expectedModule);
    expect(importer).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads the page and records sessionStorage timestamp when chunk import fails after retry", async () => {
    const storage = createMemoryStorage();
    const reload = vi.fn();
    const chunkError = new TypeError(
      "Failed to fetch dynamically imported module: https://tmdlang.github.io/Tmd-TS/assets/index-DZMA8fYt.js"
    );
    const importer = vi.fn().mockRejectedValue(chunkError);

    await expect(
      importWithChunkErrorRecovery(importer, {
        storage,
        reload,
        now: 100_000,
      })
    ).rejects.toThrow("Failed to fetch dynamically imported module");

    expect(importer).toHaveBeenCalledTimes(2);
    expect(storage.setItem).toHaveBeenCalledWith(CHUNK_RELOAD_STORAGE_KEY, "100000");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("debounces reload via sessionStorage to prevent infinite reload loops when offline", async () => {
    const recentTimestamp = 100_000;
    const storage = createMemoryStorage({
      [CHUNK_RELOAD_STORAGE_KEY]: String(recentTimestamp),
    });
    const reload = vi.fn();
    const chunkError = new TypeError(
      "Failed to fetch dynamically imported module: https://tmdlang.github.io/Tmd-TS/assets/index-DZMA8fYt.js"
    );
    const importer = vi.fn().mockRejectedValue(chunkError);

    await expect(
      importWithChunkErrorRecovery(importer, {
        storage,
        reload,
        now: recentTimestamp + CHUNK_RELOAD_DEBOUNCE_MS - 1000,
      })
    ).rejects.toThrow("Failed to fetch dynamically imported module");

    expect(reload).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("allows reload again once the sessionStorage debounce window has expired", () => {
    const initialTimestamp = 100_000;
    const storage = createMemoryStorage({
      [CHUNK_RELOAD_STORAGE_KEY]: String(initialTimestamp),
    });
    const reload = vi.fn();

    const triggered = tryReloadOnChunkError({
      storage,
      reload,
      now: initialTimestamp + CHUNK_RELOAD_DEBOUNCE_MS + 1,
    });

    expect(triggered).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      CHUNK_RELOAD_STORAGE_KEY,
      String(initialTimestamp + CHUNK_RELOAD_DEBOUNCE_MS + 1)
    );
  });

  it("does not retry or reload on non-chunk runtime errors", async () => {
    const storage = createMemoryStorage();
    const reload = vi.fn();
    const runtimeError = new Error("AudioContext decode error");
    const importer = vi.fn().mockRejectedValue(runtimeError);

    await expect(
      importWithChunkErrorRecovery(importer, {
        storage,
        reload,
        now: 100_000,
      })
    ).rejects.toThrow("AudioContext decode error");

    expect(importer).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });
});
