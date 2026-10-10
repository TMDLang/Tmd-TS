import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TmdMcpCore, TmdMCPInstaller, TmdMCPServer } from "../src/mcp/index.js";

describe("TMD Node CLI MCP Server & Installer (TDD)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tmd-mcp-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleTmd = `::SCORE::
** MCP Test Song **
!= 120
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    1 2 3 4
}
-> intro ->#
`;

  it("TmdMCPServer creates server instance with registered tools", () => {
    const server = TmdMCPServer.createServer();
    expect(server).toBeDefined();
  });

  it("TmdMCPServer tool handlers parse TMD correctly including declaredKey, entries, and structured syntax errors (#45)", async () => {
    const scoreWithKey = `::SCORE::
** MCP Test Song **
!= 120
?= A
key= Am
<4/4>

intro:Piano@|0|{
    <4*>
    1 2 3 4
}
-> intro ->#
`;
    const result = await TmdMCPServer.handleParseTmd({ text: scoreWithKey });
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.valid).toBe(true);
    expect(parsed.name).toBe("MCP Test Song");
    expect(parsed.speed).toBe(120);
    expect(parsed.tonic).toBe("A");
    expect(parsed.declaredKey).toBe("Am");
    expect(Array.isArray(parsed.entries)).toBe(true);
    expect(parsed.entries.length).toBe(1);
    expect(parsed.paragraphs.length).toBe(1);

    const brokenResult = await TmdMCPServer.handleParseTmd({
      text: "::SCORE::\n!= 120\n?= C\n<4/4>\nintro:Piano@|0|{\n<4*>\n| 1 2 ??? 4 |\n}\n-> intro ->#",
    });
    const brokenParsed = JSON.parse(brokenResult.content[0].text);
    expect(brokenParsed.valid).toBe(false);
    expect(brokenParsed.line).toBe(7);
    expect(brokenParsed.column).toBeGreaterThanOrEqual(1);
    expect(brokenParsed.snippet).toContain("???");
    expect(Array.isArray(brokenParsed.expectedTokens)).toBe(true);
  });

  it("TmdMCPServer tool handlers check TMD for measure and rhythm issues", async () => {
    const goodResult = await TmdMCPServer.handleCheckTmd({ text: sampleTmd });
    const goodParsed = JSON.parse(goodResult.content[0].text);
    expect(goodParsed.valid).toBe(true);
    expect(goodParsed.issues).toEqual([]);

    const badTmd = `::SCORE::
** Bad Test **
!= 120
?= C
<4/4>

verse:Piano@|0|{
<4*>
| 1 2 3 |
}
-> verse ->#
`;
    const badResult = await TmdMCPServer.handleCheckTmd({ text: badTmd });
    const badParsed = JSON.parse(badResult.content[0].text);
    expect(badParsed.valid).toBe(false);
    expect(badParsed.issueCount).toBe(1);
    expect(badParsed.issues[0].expectedUnits).toBe(4);
    expect(badParsed.issues[0].actualUnits).toBe(3);
    expect(badParsed.errorCount).toBe(1);
    expect(badParsed.diagnostics.some((d: any) => d.rule === "E-MEASURE-BEAT")).toBe(true);

    const semanticBadTmd = `::SCORE::
** Semantic Bad **
!= 120
?= C
<4/4>

verse:Piano@|0|{
  <4*>
  | [1 3 5] - - - |
}
unused:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
-> verse ->#
`;
    const semanticRes = await TmdMCPServer.handleCheckTmd({ text: semanticBadTmd });
    const semanticParsed = JSON.parse(semanticRes.content[0].text);
    expect(semanticParsed.valid).toBe(false);
    expect(semanticParsed.errorCount).toBe(1);
    expect(semanticParsed.warningCount).toBe(1);
    expect(semanticParsed.diagnostics.some((d: any) => d.rule === "E-CHORD-MULTINOTE")).toBe(true);
    expect(semanticParsed.diagnostics.some((d: any) => d.rule === "W-UNUSED-ENTRY")).toBe(true);
  });


  it("TmdMCPServer tool handlers convert TMD to MIDI and other formats", async () => {
    const midiRes = await TmdMCPServer.handleConvertTmd({ text: sampleTmd, format: "midi" });
    expect(midiRes.content[0].type).toBe("text");
    expect(midiRes.content[0].text.length).toBeGreaterThan(0);

    const xmlRes = await TmdMCPServer.handleConvertTmd({ text: sampleTmd, format: "musicxml" });
    expect(xmlRes.content[0].text).toContain("<?xml");

    const lyRes = await TmdMCPServer.handleConvertTmd({ text: sampleTmd, format: "lilypond" });
    expect(lyRes.content[0].text).toContain("\\version");

    const abcRes = await TmdMCPServer.handleConvertTmd({ text: sampleTmd, format: "abc" });
    expect(abcRes.content[0].text).toContain("X:1");

    const choRes = await TmdMCPServer.handleConvertTmd({ text: sampleTmd, format: "chordpro" });
    expect(choRes.content[0].text).toContain("{title: MCP Test Song}");
  });

  it("TmdMCPServer getSkill returns TMD specification", async () => {
    const res = await TmdMCPServer.handleGetSkill();
    expect(res.content[0].text).toContain("Timebase Mark Down");
    expect(res.content[0].text).toContain("::SCORE::");
  });

  it("TmdMCPInstaller installs mcpServers entry into target config JSON files", () => {
    const fakeConfigPath = path.join(tmpDir, "claude_desktop_config.json");
    fs.writeFileSync(fakeConfigPath, JSON.stringify({ mcpServers: {} }, null, 2));

    const results = TmdMCPInstaller.installToConfigPath(fakeConfigPath, {
      command: "tmd",
      args: ["--mcp"],
    });

    expect(results.installed).toBe(true);
    const updated = JSON.parse(fs.readFileSync(fakeConfigPath, "utf-8"));
    expect(updated.mcpServers.tmd).toBeDefined();
    expect(updated.mcpServers.tmd.command).toBe("tmd");
    expect(updated.mcpServers.tmd.args).toEqual(["--mcp"]);
  });

  it("TmdMCPInstaller creates config file if it does not exist", () => {
    const fakeConfigPath = path.join(tmpDir, "nested", "mcp_config.json");

    const results = TmdMCPInstaller.installToConfigPath(fakeConfigPath, {
      command: "tmd",
      args: ["--mcp"],
    });

    expect(results.installed).toBe(true);
    expect(fs.existsSync(fakeConfigPath)).toBe(true);
    const updated = JSON.parse(fs.readFileSync(fakeConfigPath, "utf-8"));
    expect(updated.mcpServers.tmd.command).toBe("tmd");
  });

  it("TmdMCPInstaller default paths include standard tool config locations", () => {
    const paths = TmdMCPInstaller.defaultConfigPaths();
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.includes("Claude") || p.includes("claude"))).toBe(true);
    expect(paths.some((p) => p.includes("gemini") || p.includes("antigravity"))).toBe(true);
  });

  it("CLI main handles --install-mcp flag", async () => {
    const { main } = await import("../src/cli.js");
    const fakeConfigPath = path.join(tmpDir, "test_mcp.json");
    // Mock defaultConfigPaths to test install-mcp cleanly
    const origPaths = TmdMCPInstaller.defaultConfigPaths;
    TmdMCPInstaller.defaultConfigPaths = () => [fakeConfigPath];
    try {
      const code = main(["--install-mcp"]);
      expect(code).toBe(0);
      expect(fs.existsSync(fakeConfigPath)).toBe(true);
    } finally {
      TmdMCPInstaller.defaultConfigPaths = origPaths;
    }
  });

  it("TmdMcpCore provides shared environment-agnostic handlers for Node MCP and WebMCP (#52)", () => {
    const parsed = TmdMcpCore.parseTmdText(sampleTmd);
    expect(parsed.valid).toBe(true);
    if (parsed.valid) {
      expect(parsed.name).toBe("MCP Test Song");
      expect(parsed.tonic).toBe("C");
      expect(parsed.entryCount).toBe(1);
    }

    const checked = TmdMcpCore.checkTmdText(sampleTmd, { includeSyntaxCheck: true });
    expect(checked.valid).toBe(true);
    expect(checked.syntaxValid).toBe(true);
    expect(checked.issueCount).toBe(0);

    const midiOut = TmdMcpCore.convertTmdText(sampleTmd, { format: "midi" });
    expect(midiOut.kind).toBe("binary");
    if (midiOut.kind === "binary") {
      expect(midiOut.base64.length).toBeGreaterThan(0);
    }

    const choOut = TmdMcpCore.convertTmdText(sampleTmd, { format: "chordpro" });
    expect(choOut.kind).toBe("text");
    if (choOut.kind === "text") {
      expect(choOut.text).toContain("{title: MCP Test Song}");
    }
  });
});
