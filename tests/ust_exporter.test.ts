import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect,it } from "vitest";

import { main } from "../src/cli.js";
import { TmdUSTGenerator } from "../src/exporters/ust.js";
import { TmdParser } from "../src/syntax/index.js";

describe("TmdUSTGenerator (UTAU .ust Export)", () => {
  const sampleTmd = `::SCORE::
** UTAU Test Song **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    | 1 2 3 4 |
    | [C] - - - |
}
-> verse ->#
`;

  it("generates standard UTAU [#SETTING] header with tempo and metadata", () => {
    const sheet = TmdParser.parse(sampleTmd)!;
    const ust = TmdUSTGenerator.generateUST(sheet);

    expect(ust).toContain("[#SETTING]");
    expect(ust).toContain("Tempo=120.00");
    expect(ust).toContain("Tracks=1");
    expect(ust).toContain("ProjectName=UTAU Test Song");
    expect(ust).toContain("Mode2=True");
    expect(ust).toContain("Charset=UTF-8");
  });

  it("renders note events with Length, Lyric, NoteNum, and default parameters", () => {
    const sheet = TmdParser.parse(sampleTmd)!;
    const ust = TmdUSTGenerator.generateUST(sheet, "Vocal", {
      lyrics: ["do", "re", "mi", "fa"],
    });

    // PPQ = 480 (quarter note = 480 ticks)
    // Note 1: degree 1 in C4 = MIDI 60
    expect(ust).toContain("[#0000]");
    expect(ust).toContain("Length=480");
    expect(ust).toContain("Lyric=do");
    expect(ust).toContain("NoteNum=60");

    // Note 2: degree 2 in C4 = MIDI 62
    expect(ust).toContain("[#0001]");
    expect(ust).toContain("Length=480");
    expect(ust).toContain("Lyric=re");
    expect(ust).toContain("NoteNum=62");

    // Note 3: degree 3 in C4 = MIDI 64
    expect(ust).toContain("[#0002]");
    expect(ust).toContain("Lyric=mi");
    expect(ust).toContain("NoteNum=64");

    // Note 4: degree 4 in C4 = MIDI 65
    expect(ust).toContain("[#0003]");
    expect(ust).toContain("Lyric=fa");
    expect(ust).toContain("NoteNum=65");

    expect(ust).toContain("[#TRACKEND]");
  });

  it("handles rests and timeline gaps with Lyric=R", () => {
    const tmdWithGaps = `::SCORE::
** Gap Song **
!= 120
?= C
<4/4>

melody:Vocal@|+1|{
    <4*>
    0 1 0 2
}
-> melody ->#
`;
    const sheet = TmdParser.parse(tmdWithGaps)!;
    const ust = TmdUSTGenerator.generateUST(sheet);

    // Initial 1-bar offset (@|+1| = 4 quarter notes = 1920 ticks gap)
    expect(ust).toContain("Lyric=R");
    expect(ust).toContain("NoteNum=60");
    expect(ust).toContain("[#TRACKEND]");
  });

  it("handles dynamic tempo changes on notes", () => {
    const tmdTempo = `::SCORE::
** Tempo Accel **
!= 100
?= C
<4/4>

part1:Vocal@|0|{
    <4*>
    | 1 - - - |
    {!= 120}
    | 2 - - - |
}
-> part1 ->#
`;
    const sheet = TmdParser.parse(tmdTempo)!;
    const ust = TmdUSTGenerator.generateUST(sheet);

    expect(ust).toContain("Tempo=100.00");
    expect(ust).toContain("Tempo=120.00");
  });

  it("supports CLI export with -u, --ust-output", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tmd-ust-test-"));
    const tmpInput = path.join(tmpDir, "test.tmd");
    const tmpOutput = path.join(tmpDir, "test.ust");

    fs.writeFileSync(tmpInput, sampleTmd, "utf-8");

    try {
      const exitCode = main([tmpInput, "-u", tmpOutput]);
      expect(exitCode).toBe(0);
      expect(fs.existsSync(tmpOutput)).toBe(true);

      const content = fs.readFileSync(tmpOutput, "utf-8");
      expect(content).toContain("[#SETTING]");
      expect(content).toContain("ProjectName=UTAU Test Song");
      expect(content).toContain("[#TRACKEND]");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles monophonic degradation for multi-notes in UST export", () => {
    const multiNoteTmd = `::SCORE::
** Multi-Note Vocal **
!= 120
?= C
<4/4>

verse:Vocal@|0|{
    <4*>
    1+3 2 0 0
}
-> verse ->#
`;
    const sheet = TmdParser.parse(multiNoteTmd)!;
    const ust = TmdUSTGenerator.generateUST(sheet);

    // 1+3 (C4=60, E4=64) should pick the highest pitch (64) without creating overlapping notes at the same position
    expect(ust).toContain("NoteNum=64");
    // Ensure there are no duplicate notes at [#0000]
    const noteHeaders = (ust.match(/\[#\d{4}\]/g) || []);
    // note 0: 1+3 (64), note 1: 2 (62), note 2: 0 (rest), note 3: 0 (rest)
    expect(noteHeaders.length).toBe(4);
  });
});
