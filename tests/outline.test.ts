import { describe, expect,it } from "vitest";

import { TMDOutlineGenerator, TMDOutlineNode } from "../src/core/outline.js";

describe("TMDOutlineGenerator (TDD)", () => {
  it("generates nested outline symbols with sections, tracks, and measures", () => {
    const input = `::SCORE::
** Nested Song **
!= 128
?= G
<4/4>

intro:CHORD@|0|{
    <4*>
    [G] [D] [Em] [C] |
}

intro:Piano@|0|{
    <4*>
    1 2 3 4 |
}

verse:CHORD@|0|{
    <4*>
    [G] - [D] - |
}

-> intro -> verse ->#
`;

    const nodes = TMDOutlineGenerator.generate(input);

    expect(nodes.length).toBe(3);

    // 1. Score node
    const scoreNode = nodes[0];
    expect(scoreNode.name).toBe("Score: Nested Song");
    expect(scoreNode.kind).toBe("class");
    expect(scoreNode.detail).toContain("!= 128");
    expect(scoreNode.detail).toContain("?= G");
    expect(scoreNode.detail).toContain("<4/4>");

    // 2. Sections node
    const sectionsNode = nodes[1];
    expect(sectionsNode.name).toBe("Sections");
    expect(sectionsNode.kind).toBe("namespace");
    expect(sectionsNode.children).toBeDefined();
    expect(sectionsNode.children!.length).toBe(2); // intro, verse

    // Intro section
    const introNode = sectionsNode.children![0];
    expect(introNode.name).toBe("intro");
    expect(introNode.kind).toBe("namespace");
    expect(introNode.children!.length).toBe(2); // CHORD, Piano

    // Track 1: CHORD
    const chordTrack = introNode.children![0];
    expect(chordTrack.name).toBe("CHORD");
    expect(chordTrack.kind).toBe("field");
    expect(chordTrack.children).toBeUndefined();

    // Track 2: Piano
    const pianoTrack = introNode.children![1];
    expect(pianoTrack.name).toBe("Piano");
    expect(pianoTrack.kind).toBe("field");
    expect(pianoTrack.children).toBeUndefined();

    // Verse section
    const verseNode = sectionsNode.children![1];
    expect(verseNode.name).toBe("verse");
    expect(verseNode.children!.length).toBe(1); // CHORD
    const verseChord = verseNode.children![0];
    expect(verseChord.name).toBe("CHORD");
    expect(verseChord.kind).toBe("field");
    expect(verseChord.children).toBeUndefined();

    // 3. Playback node
    const playbackNode = nodes[2];
    expect(playbackNode.name).toBe("Playback");
    expect(playbackNode.kind).toBe("event");
    expect(playbackNode.children!.length).toBe(3);
    expect(playbackNode.children![0].name).toBe("intro");
    expect(playbackNode.children![1].name).toBe("verse");
    expect(playbackNode.children![2].name).toBe("#");
  });

  it("accurately tracks line numbers for scores containing metadata comments and multi-line orders", () => {
    const input = `::SCORE::
** Shinagawa **
~ "composer: zonble"
~ "arranger: Antigravity"
!= 126
?= C
<4/4>

/*
  Structure comment
*/

-> Concourse_Dawn
-> Double_Train_Depart
-> Rush_Hour_Surge
-> Vaulted_Skywalk
-> Grand_Terminal_Arrival
-> #
`;

    const nodes = TMDOutlineGenerator.generate(input);
    const playbackNode = nodes.find((n) => n.name === "Playback");
    expect(playbackNode).toBeDefined();

    // In this score:
    // line 13: -> Concourse_Dawn
    // line 14: -> Double_Train_Depart
    // line 15: -> Rush_Hour_Surge
    // line 16: -> Vaulted_Skywalk
    // line 17: -> Grand_Terminal_Arrival
    // line 18: -> #
    expect(playbackNode!.children).toBeDefined();
    expect(playbackNode!.children!.length).toBe(6);

    expect(playbackNode!.children![0].name).toBe("Concourse_Dawn");
    expect(playbackNode!.children![0].range.startLine).toBe(13);

    expect(playbackNode!.children![1].name).toBe("Double_Train_Depart");
    expect(playbackNode!.children![1].range.startLine).toBe(14);

    expect(playbackNode!.children![2].name).toBe("Rush_Hour_Surge");
    expect(playbackNode!.children![2].range.startLine).toBe(15);

    expect(playbackNode!.children![3].name).toBe("Vaulted_Skywalk");
    expect(playbackNode!.children![3].range.startLine).toBe(16);

    expect(playbackNode!.children![4].name).toBe("Grand_Terminal_Arrival");
    expect(playbackNode!.children![4].range.startLine).toBe(17);

    expect(playbackNode!.children![5].name).toBe("#");
    expect(playbackNode!.children![5].range.startLine).toBe(18);
  });

  it("supports CLI outline subcommand with --json", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const { main } = await import("../src/cli.js");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tmd-outline-test-"));
    const tmpFile = path.join(tmpDir, "test.tmd");
    fs.writeFileSync(
      tmpFile,
      `::SCORE::
** CLI Outline **
!= 120
?= C
<4/4>

intro:Piano@|0|{
<4*>
1 2 3 4 |
}
-> intro ->#
`,
      "utf-8"
    );

    let output = "";
    const originalLog = console.log;
    console.log = (msg: any) => {
      output += msg + "\n";
    };

    try {
      const exitCode = main(["outline", "--json", tmpFile]);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(output);
      expect(parsed.length).toBe(3);
      expect(parsed[0].name).toBe("Score: CLI Outline");
    } finally {
      console.log = originalLog;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("supports abstract paragraphs (Pattern), co-existing A and A:Violin, and S-Expression macros in Orders", () => {
    const input = `::SCORE::
** Canon Outline **
!= 56
?= D
<4/4>

/* 1. Abstract prototype */
Theme {
    <4*>
    1 2 3 4 |
}

/* 2. Co-existing A (Pattern) and A:Violin (Track) */
A {
    <4*>
    3 4 5 6 |
}

A:Violin@|0|{
    <4*>
    3 4 5 6 |
}

/* 3. Concrete section */
intro:Cello@|0|{
    <4*>
    1_ 5__ 6__ 3__ |
}

-> intro -> (canon Theme (Violin1 Violin2) 2) -> (layer (loop A Cello 4)) ->#
`;

    const nodes = TMDOutlineGenerator.generate(input);
    expect(nodes.length).toBe(3);

    // 1. Sections Node
    const sectionsNode = nodes.find(n => n.name === "Sections");
    expect(sectionsNode).toBeDefined();
    expect(sectionsNode!.children).toBeDefined();

    // Theme section: only has Pattern
    const themeSec = sectionsNode!.children!.find(c => c.name === "Theme");
    expect(themeSec).toBeDefined();
    expect(themeSec!.children).toBeDefined();
    expect(themeSec!.children!.length).toBe(1);
    expect(themeSec!.children![0].name).toBe("Pattern");
    expect(themeSec!.children![0].kind).toBe("field");

    // A section: has both Pattern and Violin track!
    const aSec = sectionsNode!.children!.find(c => c.name === "A");
    expect(aSec).toBeDefined();
    expect(aSec!.children!.length).toBe(2);
    expect(aSec!.children![0].name).toBe("Pattern");
    expect(aSec!.children![1].name).toBe("Violin");

    // intro section: has Cello track
    const introSec = sectionsNode!.children!.find(c => c.name === "intro");
    expect(introSec).toBeDefined();
    expect(introSec!.children!.length).toBe(1);
    expect(introSec!.children![0].name).toBe("Cello");

    // 2. Playback Node
    const playbackNode = nodes.find(n => n.name === "Playback");
    expect(playbackNode).toBeDefined();
    expect(playbackNode!.children).toBeDefined();

    // In Orders: intro, canon, layer, #
    const orderItems = playbackNode!.children!;
    expect(orderItems[0].name).toBe("intro");

    // S-Expression macros: displayed as operator name
    expect(orderItems[1].name).toBe("canon");
    expect(orderItems[1].detail).toContain("Theme");
    expect(orderItems[1].kind).toBe("method");

    expect(orderItems[2].name).toBe("layer");
    expect(orderItems[2].kind).toBe("method");

    expect(orderItems[3].name).toBe("#");
  });
});
