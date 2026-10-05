import { describe, expect, it } from "vitest";

import { TmdLocalizationKey, TmdLocalizer } from "../src/analysis/localization.js";

describe("TMD core localization", () => {
  it("matches the TmdSwift report strings and placeholder behavior", () => {
    const zh = new TmdLocalizer("zh-Hant");
    const en = new TmdLocalizer("en");

    expect(zh.text(TmdLocalizationKey.reportTitle)).toBe("TMD Song Profile");
    expect(zh.text(TmdLocalizationKey.modulationStep, ["chorus", "D 大調", "+2", "+2"]))
      .toBe("[chorus] 轉至 D 大調 (+2 半音 / 五度圈 +2 步)");
    expect(en.text(TmdLocalizationKey.modulationStep, ["chorus", "D Major", "+2", "+2"]))
      .toBe("[chorus] to D Major (+2 semitones / +2 fifths)");
    expect(en.text(TmdLocalizationKey.candidateKeys)).toBe("Best-fit keys (K-S)");
  });

  it("falls back to English for unknown locales and preserves unknown keys", () => {
    const localizer = new TmdLocalizer("ja", "en");
    expect(localizer.text(TmdLocalizationKey.reportTitle)).toBe("TMD Song Profile");
    expect(localizer.text("missing.key")).toBe("missing.key");
  });
});
