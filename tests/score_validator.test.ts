import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { handleCheckCommand } from "../src/commands/check.js";
import { TmdLSPDiagnosticEngine } from "../src/lsp/index.js";
import { TmdScoreValidator } from "../src/validation/index.js";

describe("TmdScoreValidator & Semantic Linter", () => {
  it("catches syntax errors (including invalid ?= Am) and measure beat discrepancies", () => {
    const invalidSyntax = `::SCORE::
** Invalid Key **
!= 120
?= Am
<4/4>

A:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
-> A ->#
`;
    const syntaxDiags = TmdScoreValidator.validate(invalidSyntax);
    expect(syntaxDiags.some((d) => d.rule === "E-SYNTAX" && d.severity === "error")).toBe(true);

    const invalidMeasure = `::SCORE::
** Bad Measure **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | 1 2 3 |
}
-> A ->#
`;
    const measureDiags = TmdScoreValidator.validate(invalidMeasure);
    expect(
      measureDiags.some((d) => d.rule === "E-MEASURE-BEAT" && d.severity === "error")
    ).toBe(true);
  });

  it("catches macro expansion errors, timeline overlaps, and simultaneous tempo conflicts", () => {
    const badMacro = `::SCORE::
** Bad Macro **
!= 120
?= C
<4/4>

Theme {
  <4*>
  | 1 2 3 4 |
}
-> (canon NonExistent (Piano Violin) 1 0) ->#
`;
    const macroDiags = TmdScoreValidator.validate(badMacro);
    expect(
      macroDiags.some((d) => d.rule === "E-MACRO-EXPAND" && d.severity === "error")
    ).toBe(true);

    const overlapScore = `::SCORE::
** Overlap **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | 1 2 3 4 | 5 6 7 1^ |
}
A:Piano@|+1|{
  <4*>
  | 1 2 3 4 |
}
-> A ->#
`;
    const overlapDiags = TmdScoreValidator.validate(overlapScore);
    expect(
      overlapDiags.some((d) => d.rule === "E-TIMELINE-OVERLAP" && d.severity === "error")
    ).toBe(true);

    const tempoConflictScore = `::SCORE::
** Tempo Conflict **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | {!= 140} 1 2 3 4 |
}
A:Violin@|0|{
  <4*>
  | {!= 100} 1 2 3 4 |
}
-> A ->#
`;
    const tempoDiags = TmdScoreValidator.validate(tempoConflictScore);
    expect(
      tempoDiags.some((d) => d.rule === "E-TEMPO-CONFLICT" && d.severity === "error")
    ).toBe(true);
  });

  it("catches multi-note bracket misuse ([1 3 5]) as error and unknown custom chord quality as warning", () => {
    const multiNoteChordScore = `::SCORE::
** MultiNote Chord Typo **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | [1 3 5] - - - |
}
-> A ->#
`;
    const multiDiags = TmdScoreValidator.validate(multiNoteChordScore);
    const chordErr = multiDiags.find((d) => d.rule === "E-CHORD-MULTINOTE");
    expect(chordErr).toBeDefined();
    expect(chordErr?.severity).toBe("error");
    expect(chordErr?.suggestion).toContain("1+3+5");

    const customChordScore = `::SCORE::
** Custom Chord Warning **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | [Cadd9] - [Cweirdquality] - |
}
-> A ->#
`;
    const customDiags = TmdScoreValidator.validate(customChordScore);
    expect(customDiags.some((d) => d.message.includes("Cadd9"))).toBe(false);
    expect(
      customDiags.some(
        (d) =>
          d.rule === "W-CHORD-CUSTOM" &&
          d.severity === "warning" &&
          d.message.includes("Cweirdquality")
      )
    ).toBe(true);
  });

  it("emits warnings for unused entries/prototypes, instrument naming issues, and section length mismatches", () => {
    const score = `::SCORE::
** Unused and Instrument Warnings **
!= 120
?= C
<4/4>

UnusedProto {
  <4*>
  | 1 2 3 4 |
}

A:nylonGuitar@|0|{
  <4*>
  | 1 2 3 4 |
}

A:UnknownMartianZorg@|0|{
  <4*>
  | 1 2 3 4 | 5 6 7 1^ |
}

Bridge:Nylon_Guitar@|0|{
  <4*>
  | 1 2 3 4 |
}

-> A ->#
`;
    const diags = TmdScoreValidator.validate(score);
    expect(
      diags.some(
        (d) =>
          d.rule === "W-UNUSED-ENTRY" &&
          d.severity === "warning" &&
          d.message.includes("Bridge")
      )
    ).toBe(true);
    expect(
      diags.some(
        (d) =>
          d.rule === "W-UNUSED-PROTOTYPE" &&
          d.severity === "warning" &&
          d.message.includes("UnusedProto")
      )
    ).toBe(true);
    expect(
      diags.some(
        (d) => d.rule === "W-INSTRUMENT-INCONSISTENT" && d.severity === "warning"
      )
    ).toBe(true);
    expect(
      diags.some(
        (d) =>
          d.rule === "W-INSTRUMENT-UNKNOWN" &&
          d.severity === "warning" &&
          d.message.includes("UnknownMartianZorg")
      )
    ).toBe(true);
    expect(
      diags.some(
        (d) => d.rule === "W-SECTION-LENGTH-MISMATCH" && d.severity === "warning"
      )
    ).toBe(true);
  });

  it("extracts and validates Markdown ```tmd code blocks, CLI flags, and LSP severities", () => {
    const markdown = `# TMD Guide

Here is a full score:
\`\`\`tmd
::SCORE::
** Embedded Score **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  | [1 3 5] - - - |
}
-> A ->#
\`\`\`

And a partial snippet without header:
\`\`\`tmd
A:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
\`\`\`
`;
    const mdDiags = TmdScoreValidator.validateMarkdown(markdown, "guide.md");
    expect(mdDiags.length).toBe(1);
    expect(mdDiags[0].rule).toBe("E-CHORD-MULTINOTE");
    expect(mdDiags[0].line).toBe(13);

    // LSP maps error -> 1 and warning -> 2
    const lspDiags = TmdLSPDiagnosticEngine.diagnose(`::SCORE::
** LSP Check **
!= 120
?= C
<4/4>
A:Piano@|0|{
  <4*>
  | [1 3 5] - - - |
}
Unused:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
-> A ->#
`);
    expect(lspDiags.some((d) => d.severity === 1)).toBe(true);
    expect(lspDiags.some((d) => d.severity === 2)).toBe(true);

    // CLI directory, --markdown, --strict, --json
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tmd-check-test-"));
    try {
      const warnFile = path.join(tmpDir, "warn.tmd");
      fs.writeFileSync(
        warnFile,
        `::SCORE::
** Warn Only **
!= 120
?= C
<4/4>
A:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
Unused:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
-> A ->#
`,
        "utf8"
      );

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      // Default mode returns 0 on warnings
      expect(handleCheckCommand([warnFile])).toBe(0);
      // --strict returns 1 on warnings
      expect(handleCheckCommand(["--strict", warnFile])).toBe(1);
      // --json outputs JSON structure
      logSpy.mockClear();
      expect(handleCheckCommand(["--json", tmpDir])).toBe(0);
      const jsonOut = JSON.parse(String(logSpy.mock.calls[0]?.[0] ?? "{}"));
      expect(jsonOut.filesChecked).toBe(1);
      expect(jsonOut.errorCount).toBe(0);
      expect(jsonOut.warningCount).toBe(1);
      expect(jsonOut.diagnostics[0].rule).toBe("W-UNUSED-ENTRY");
      logSpy.mockRestore();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
