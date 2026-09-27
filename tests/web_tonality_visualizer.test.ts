import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { TMDSongInspector } from "../src/core/inspector.js";
import { TmdParser } from "../src/core/parser.js";
import { renderTonalityProfileHtml } from "../web/src/ui/tonality.js";


describe("Web Studio tonality visualization", () => {
  it("labels the top score metric as movable-do base, not a declared key", () => {
    const indexHtml = fs.readFileSync(path.join(process.cwd(), "web/index.html"), "utf8");
    expect(indexHtml).toContain('data-i18n="statLabelMovableDoBase"');
    expect(indexHtml).not.toContain('data-i18n="statLabelKey"');
  });
  it("renders the same inspector-level tonality details as the VSCode view", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Tonality UI **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    1 3 5 1^
    [C] - [G] -
}

-> verse ->#
`);
    const profile = TMDSongInspector.inspect(sheet!, undefined, "en");
    const html = renderTonalityProfileHtml(profile.tonality!, "en", profile.timing.sections);

    expect(html).toContain("tonality-stability-badge");
    expect(html).toContain("Clean major tonality");
    expect(html).toContain("Modulation Journey");
    expect((html.match(/class=\"pitch-bar-col\"/g) || []).length).toBe(12);
    expect(html).toContain("Do");
    expect(html).toContain("Best Fit Tonalities (K-S)");
    expect(html).toContain("Circle of Fifths Trajectory");
    expect(html).toContain("Detailed Theoretical Analysis");
    expect(html).toContain("tonality-timeline");
    expect((html.match(/class=\"timeline-segment\"/g) || []).length).toBe(1);
    expect(html).toContain("verse");
  });

  it("localizes the tonality panel and uses theme tokens instead of dark-only colors", () => {
    const sheet = TmdParser.parse(`::SCORE::
** 調性 l10n **
!= 120
?= C
<4/4>

A:Piano@|0|{ <4*> 1 3 5 1^ }
-> A ->#
`);
    const profile = TMDSongInspector.inspect(sheet!, undefined, "zh-Hant");
    const html = renderTonalityProfileHtml(profile.tonality!, "zh-Hant", profile.timing.sections);

    expect(html).toContain("音樂性格與氣質");
    expect(html).toContain("詳細樂理分析");
    expect(html).toContain("最佳推論調性 (K-S)");
    expect(html).not.toContain("Musical Character &amp; Mood");

    const indexHtml = fs.readFileSync(path.join(__dirname, "../web/index.html"), "utf8");
    const styles = fs.readFileSync(path.join(__dirname, "../web/src/styles.css"), "utf8");
    expect(indexHtml).not.toContain('id="inspector-tonality-viz" style="width: 100%; border-radius: 6px; overflow: hidden; background: #0f172a;');
    expect(styles).toContain("var(--bg-tertiary)");
  });

  it("relocalizes stored tonality narratives when the UI locale changes", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Narrative Locale Override **
!= 120
?= C
<4/4>

A:Piano@|0|{ <4*> 1 3 5 1^ }
-> A ->#
`);
    const profile = TMDSongInspector.inspect(sheet!, undefined, "zh-Hant");
    const html = renderTonalityProfileHtml(profile.tonality!, "en", profile.timing.sections);

    expect(html).toContain("no modulation");
    expect(html).not.toContain("全曲無轉調");
  });

  it("renders declared tonality metric when sheet has declared key", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Declared Tonality Score **
!= 120
?= D
key= Bm
<4/4>

verse:Piano@|0|{
    <4*>
    1 3 5 1^
}

-> verse ->#
`);
    const profileEn = TMDSongInspector.inspect(sheet!, undefined, "en");
    const htmlEn = renderTonalityProfileHtml(profileEn.tonality!, "en", profileEn.timing.sections);
    expect(htmlEn).toContain("Declared tonality");
    expect(htmlEn).toContain("Bm");

    const profileZh = TMDSongInspector.inspect(sheet!, undefined, "zh-Hant");
    const htmlZh = renderTonalityProfileHtml(profileZh.tonality!, "zh-Hant", profileZh.timing.sections);
    expect(htmlZh).toContain("宣告調性");
    expect(htmlZh).toContain("Bm");
  });
});

