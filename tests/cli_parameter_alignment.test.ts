import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { main } from "../src/cli.js";

const score = `::SCORE::
** CLI Parameter Alignment **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    1 3 5 1^
}

-> verse ->#
`;

function createScoreFile(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tmd-cli-alignment-"));
  const filePath = path.join(directory, "score.tmd");
  fs.writeFileSync(filePath, score, "utf8");
  return filePath;
}

describe("CLI parameter alignment with TmdSwift", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("supports --locale for human-readable inspect reports", () => {
    const filePath = createScoreFile();
    const output = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(main(["inspect", "--locale", "en", filePath])).toBe(0);

    const rendered = output.mock.calls.flat().join("\n");
    expect(rendered).toContain("TMD Song Profile");
    expect(rendered).toContain("Analysis scope");
    expect(rendered).not.toContain("調性診斷");
  });

  it("applies --locale to inspect SVG and HTML output", () => {
    const filePath = createScoreFile();
    const output = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(main(["inspect", "--locale", "en", "--svg", filePath])).toBe(0);
    expect(output.mock.calls.flat().join("\n")).toContain("Circle of Fifths Trajectory");

    output.mockClear();
    expect(main(["inspect", "--locale", "en", "--html", filePath])).toBe(0);
    expect(output.mock.calls.flat().join("\n")).toContain("Detailed Text Analysis");
  });

  it.each([
    ["--inspect", filePath => [filePath, "--inspect"]],
    ["--inspect before input", filePath => ["--inspect", filePath]],
  ])("supports top-level %s invocation", (_label, argvFactory) => {
    const filePath = createScoreFile();
    const output = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(main(argvFactory(filePath))).toBe(0);

    const rendered = output.mock.calls.flat().join("\n");
    expect(rendered).toContain("TMD Song Profile");
  });

  it("reports soundfont capability explicitly instead of rejecting the option as unknown", () => {
    const filePath = createScoreFile();
    const wavPath = path.join(path.dirname(filePath), "preview.wav");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(main([filePath, "--soundfont", "custom.sf2", "--wav-output", wavPath])).toBe(1);

    const rendered = errors.mock.calls.flat().join("\n");
    expect(rendered.toLowerCase()).toContain("soundfont");
    expect(rendered).not.toContain("Unknown option: --soundfont");
  });
});
