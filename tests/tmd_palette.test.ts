import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { en } from "../web/src/locales/en.js";
import { zhTW } from "../web/src/locales/zh-TW.js";
import {
  applyPaletteInsertion,
  getTmdPaletteEntry,
  TMD_PALETTE_ENTRIES,
} from "../web/src/ui/tmdPalette.js";

describe("TMD tablet input palette", () => {
  it("contains all digits and tablet-hostile TMD symbols", () => {
    const entries = new Set(TMD_PALETTE_ENTRIES.map((entry) => entry.id));

    for (const digit of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
      expect(entries.has(`digit-${digit}`)).toBe(true);
    }

    for (const id of ["bar", "tie", "octave-up", "octave-down", "sharp", "flat"]) {
      expect(entries.has(id)).toBe(true);
    }
  });

  it("inserts a token exactly at the selected range and places the cursor after it", () => {
    const result = applyPaletteInsertion("1 3", 2, 3, getTmdPaletteEntry("digit-5")!);

    expect(result.text).toBe("1 5");
    expect(result.cursor).toBe(3);
  });

  it("inserts paired delimiters and places the cursor inside them", () => {
    const result = applyPaletteInsertion("", 0, 0, getTmdPaletteEntry("directive-pair")!);

    expect(result.text).toBe("{ }");
    expect(result.cursor).toBe(1);
  });

  it("inserts directive forms with the cursor at the value position", () => {
    const tempo = applyPaletteInsertion("", 0, 0, getTmdPaletteEntry("tempo-absolute")!);
    const declaredKey = applyPaletteInsertion("", 0, 0, getTmdPaletteEntry("declared-key")!);
    const meter = applyPaletteInsertion("", 0, 0, getTmdPaletteEntry("meter")!);

    expect(tempo.text).toBe("{!= }");
    expect(tempo.cursor).toBe(4);
    expect(declaredKey.text).toBe("{key= }");
    expect(declaredKey.cursor).toBe(6);
    expect(meter.text).toBe("{<>}");
    expect(meter.cursor).toBe(2);
  });

  it("keeps palette entries text-only and independent from piano playback", () => {
    expect(TMD_PALETTE_ENTRIES.every((entry) => !("midi" in entry))).toBe(true);
  });

  it("defines localized palette labels and mounts it above the editor", () => {
    for (const locale of [en, zhTW]) {
      expect(locale.tmdPaletteTitle).toBeTruthy();
      expect(locale.tmdPaletteHint).toBeTruthy();
      expect(locale.tmdPaletteAriaLabel).toBeTruthy();
      expect(locale.tmdPaletteInsert).toContain("{value}");
    }

    const html = fs.readFileSync(path.join(process.cwd(), "web/index.html"), "utf8");
    expect(html.indexOf('id="tmd-palette"')).toBeLessThan(html.indexOf('id="editor-container"'));
  });
});
