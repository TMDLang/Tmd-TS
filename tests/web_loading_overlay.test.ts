import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { en } from "../web/src/locales/en.js";
import { zhTW } from "../web/src/locales/zh-TW.js";
import {
  dismissLoadingOverlay,
  LOADING_OVERLAY_ID,
  LOADING_STATUS_ID,
  updateLoadingStatus,
} from "../web/src/ui/loadingOverlay.js";

const root = process.cwd();

describe("Studio Startup Loading Overlay (#68)", () => {
  it("renders #app-loading-overlay in web/index.html with critical inline styles and theme bootstrap", () => {
    const html = fs.readFileSync(path.join(root, "web/index.html"), "utf-8");

    expect(html).toContain(`id="${LOADING_OVERLAY_ID}"`);
    expect(html).toContain(`id="${LOADING_STATUS_ID}"`);
    expect(html).toContain('id="app-loading-title"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('class="app-loading-spinner"');
    expect(html).toContain('data-i18n="appLoadingStatus"');

    // Critical inline CSS and early theme sync in <head> for zero-FOUC first paint
    expect(html).toContain("#app-loading-overlay");
    expect(html).toContain("tmd_studio_theme");
  });

  it("defines appLoadingTitle and appLoadingStatus in both zh-TW and en locales", () => {
    expect((zhTW as Record<string, string>).appLoadingTitle).toBe("TMD Studio");
    expect((zhTW as Record<string, string>).appLoadingStatus).toBeTruthy();
    expect((en as Record<string, string>).appLoadingTitle).toBe("TMD Studio");
    expect((en as Record<string, string>).appLoadingStatus).toBeTruthy();
  });

  it("updates loading status text via updateLoadingStatus and tolerates missing elements", () => {
    const statusEl = { textContent: "Initial" };
    const mockDoc = {
      getElementById: (id: string) => (id === LOADING_STATUS_ID ? statusEl : null),
    } as unknown as Document;

    updateLoadingStatus("Restoring score...", mockDoc);
    expect(statusEl.textContent).toBe("Restoring score...");

    const emptyDoc = {
      getElementById: () => null,
    } as unknown as Document;
    expect(() => updateLoadingStatus("No-op", emptyDoc)).not.toThrow();
  });

  it("marks overlay as loaded, clears aria-busy, and removes it after transition delay", () => {
    vi.useFakeTimers();
    try {
      const classes = new Set<string>();
      const attrs: Record<string, string> = { "aria-busy": "true" };
      let removed = false;

      const overlayEl = {
        classList: {
          add: (cls: string) => classes.add(cls),
          contains: (cls: string) => classes.has(cls),
        },
        setAttribute: (k: string, v: string) => {
          attrs[k] = v;
        },
        getAttribute: (k: string) => attrs[k] ?? null,
        remove: () => {
          removed = true;
        },
      };

      const mockDoc = {
        getElementById: (id: string) => (id === LOADING_OVERLAY_ID ? overlayEl : null),
      } as unknown as Document;

      dismissLoadingOverlay(mockDoc, 250);
      // Calling a second time while already loaded is a safe no-op
      dismissLoadingOverlay(mockDoc, 250);

      expect(attrs["aria-busy"]).toBe("false");
      expect(classes.has("is-loaded")).toBe(true);
      expect(removed).toBe(false);

      vi.advanceTimersByTime(250);
      expect(removed).toBe(true);

      const emptyDoc = {
        getElementById: () => null,
      } as unknown as Document;
      expect(() => dismissLoadingOverlay(emptyDoc, 250)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("always dismisses the loading overlay inside a finally block during main.ts init()", () => {
    const mainTs = fs.readFileSync(path.join(root, "web/src/main.ts"), "utf-8");
    expect(mainTs).toContain("dismissLoadingOverlay");
    expect(mainTs).toMatch(/finally\s*\{\s*dismissLoadingOverlay\(\)/);
  });
});
