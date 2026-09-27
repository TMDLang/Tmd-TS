import * as fs from "node:fs";
import * as path from "node:path";

import { beforeEach,describe, expect, it } from "vitest";

import { applyI18n, detectLanguage, getCurrentLocale, Locale } from "../web/src/i18n.js";
import { en } from "../web/src/locales/en.js";
import { zhTW } from "../web/src/locales/zh-TW.js";

describe("i18n and Default Language (TDD)", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
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

    // Default window.location
    (globalThis as any).window = {
      location: {
        search: "",
      },
    };

    // Default navigator without specific language preference
    Object.defineProperty(globalThis, "navigator", {
      value: {
        language: "",
        languages: [],
      },
      configurable: true,
      writable: true,
    });
  });

  it("defaults to English when no language preference is saved or detected", () => {
    expect(detectLanguage()).toBe("en");
  });

  it("respects saved localStorage preference", () => {
    mockStorage["tmd-locale"] = "zh-TW";
    expect(detectLanguage()).toBe("zh-TW");

    mockStorage["tmd-locale"] = "en";
    expect(detectLanguage()).toBe("en");
  });

  it("detects language from URL query parameter ?lang=", () => {
    (globalThis as any).window.location.search = "?lang=zh-TW";
    expect(detectLanguage()).toBe("zh-TW");

    (globalThis as any).window.location.search = "?lang=en";
    expect(detectLanguage()).toBe("en");
  });

  it("detects language from browser navigator languages when no saved preference", () => {
    (globalThis as any).navigator = {
      language: "zh-TW",
      languages: ["zh-TW", "zh", "en"],
    };
    expect(detectLanguage()).toBe("zh-TW");
  });

  it("ensures index.html sets English as default language (<html lang='en'>)", () => {
    const htmlPath = path.join(__dirname, "../web/index.html");
    const html = fs.readFileSync(htmlPath, "utf-8");

    // index.html root element must be lang="en"
    expect(html).toContain('<html lang="en">');
    // Default meta/og tags should reflect English defaults
    expect(html).toContain('<meta property="og:locale" content="en_US" />');
  });

  it("ensures index.html is valid HTML without unescaped brackets (e.g. <4*>, <8*>, <16*>)", () => {
    const htmlPath = path.join(__dirname, "../web/index.html");
    const html = fs.readFileSync(htmlPath, "utf-8");

    // Must not contain raw unescaped '<' followed by digits/special chars which breaks parse5
    expect(html).not.toMatch(/<[0-9*]/);
    expect(html).toContain('&lt;4*&gt;');
    expect(html).toContain('&lt;8*&gt;');
  });
});
