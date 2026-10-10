import * as fs from "node:fs";
import * as path from "node:path";

import { beforeEach,describe, expect, it } from "vitest";

import { en } from "../web/src/locales/en.js";
import { zhTW } from "../web/src/locales/zh-TW.js";
import { getTheme, setTheme, Theme,THEME_STORAGE_KEY, toggleTheme } from "../web/src/ui/theme.js";

describe("Theme Controller & Light Mode (TDD)", () => {
  let mockStorage: Record<string, string> = {};
  let mockAttributes: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    mockAttributes = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => {
        mockStorage[k] = v;
      },
      removeItem: (k: string) => {
        delete mockStorage[k];
      },
      clear: () => {
        mockStorage = {};
      },
    };
    (globalThis as any).document = {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          mockAttributes[name] = value;
        },
        removeAttribute: (name: string) => {
          delete mockAttributes[name];
        },
        getAttribute: (name: string) => mockAttributes[name] || null,
      },
    };
  });

  it("defaults to dark theme when no preference is saved in localStorage", () => {
    expect(getTheme()).toBe("dark");
  });

  it("persists theme preference to localStorage and updates data-theme attribute on documentElement", () => {
    setTheme("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(getTheme()).toBe("light");

    setTheme("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(getTheme()).toBe("dark");
  });

  it("toggles theme between dark and light", () => {
    expect(getTheme()).toBe("dark");
    const next1 = toggleTheme();
    expect(next1).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    const next2 = toggleTheme();
    expect(next2).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("defines light theme CSS custom properties in web/src/styles.css", () => {
    const cssPath = path.join(__dirname, "../web/src/styles.css");
    const css = fs.readFileSync(cssPath, "utf-8");

    // Must have [data-theme="light"] overrides for CSS variables
    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain('--bg-primary:');
    expect(css).toContain('--bg-secondary:');
    expect(css).toContain('--text-primary:');
  });

  it("ensures context-menu uses CSS variables that adapt properly to light mode", () => {
    const cssPath = path.join(__dirname, "../web/src/styles.css");
    const css = fs.readFileSync(cssPath, "utf-8");

    // .context-menu must use --bg-secondary or --bg-surface mapped variable rather than unmapped fallback
    expect(css).toMatch(/\.context-menu\s*\{[^}]*background:\s*var\(--bg-secondary/);
    expect(css).toMatch(/\.context-menu-item\s*\{[^}]*color:\s*var\(--text-primary/);

    // Light mode must customize context-menu shadow/background
    expect(css).toContain('[data-theme="light"] .context-menu');
  });

  it("includes theme toggle button in navbar with i18n support in index.html and locales", () => {
    const htmlPath = path.join(__dirname, "../web/index.html");
    const html = fs.readFileSync(htmlPath, "utf-8");

    expect(html).toContain('id="btn-theme-toggle"');
    expect(html).toContain('data-i18n-title="btnThemeToggleTitle"');

    // Check zh-TW and en locales
    expect((zhTW as any).btnThemeToggleTitle).toBeDefined();
    expect((en as any).btnThemeToggleTitle).toBeDefined();
  });

  it("editor.ts provides setTheme to switch between dark and light themes dynamically", () => {
    const editorPath = path.join(__dirname, "../web/src/editor.ts");
    const editorContent = fs.readFileSync(editorPath, "utf-8");

    // Editor should support setTheme on returned TmdWebEditor
    expect(editorContent).toContain("setTheme");
  });

  it("uses theme-aware hover variables instead of hardcoded dark #30363d on .btn:hover in light mode", () => {
    const cssPath = path.join(__dirname, "../web/src/styles.css");
    const css = fs.readFileSync(cssPath, "utf-8");

    expect(css).toContain("--bg-hover:");
    expect(css).toContain("--border-hover:");
    expect(css).toContain("--bg-subtle-hover:");

    // .btn:hover must use var(--bg-hover) and must NOT hardcode #30363d
    const btnHoverMatch = css.match(/\.btn:hover\s*\{([^}]*)\}/);
    expect(btnHoverMatch).not.toBeNull();
    expect(btnHoverMatch![1]).toContain("var(--bg-hover)");
    expect(btnHoverMatch![1]).toContain("var(--border-hover)");
    expect(btnHoverMatch![1]).not.toContain("#30363d");

    // .btn-primary:hover must keep white text (#ffffff) rather than inheriting blue --text-bright in light mode
    const btnPrimaryHoverMatch = css.match(/\.btn-primary:hover\s*\{([^}]*)\}/);
    expect(btnPrimaryHoverMatch).not.toBeNull();
    expect(btnPrimaryHoverMatch![1]).toContain("color: #ffffff");

    // .problem-item:hover and .library-action-btn:hover must use theme-aware hover variables
    const problemHoverMatch = css.match(/\.problem-item:hover\s*\{([^}]*)\}/);
    expect(problemHoverMatch).not.toBeNull();
    expect(problemHoverMatch![1]).toContain("var(--bg-subtle-hover)");

    const libActionHoverMatch = css.match(/\.library-action-btn:hover\s*\{([^}]*)\}/);
    expect(libActionHoverMatch).not.toBeNull();
    expect(libActionHoverMatch![1]).toContain("var(--bg-hover)");
  });
});
