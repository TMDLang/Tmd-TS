import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach,beforeEach, describe, expect, it, vi } from "vitest";

import { TmdMcpInstaller,TmdMcpServer } from "../src/mcp/index.js";

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

  it("TmdMcpServer creates server instance with registered tools", () => {
    const server = TmdMcpServer.createServer();
    expect(server).toBeDefined();
  });

  it("TmdMcpServer tool handlers parse TMD correctly", async () => {
    const result = await TmdMcpServer.handleParseTmd({ text: sampleTmd });
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.valid).toBe(true);
    expect(parsed.name).toBe("MCP Test Song");
    expect(parsed.speed).toBe(120);
    expect(parsed.tonic).toBe("C");
  });

  it("TmdMcpServer tool handlers check TMD for measure and rhythm issues", async () => {
    const goodResult = await TmdMcpServer.handleCheckTmd({ text: sampleTmd });
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
    const badResult = await TmdMcpServer.handleCheckTmd({ text: badTmd });
    const badParsed = JSON.parse(badResult.content[0].text);
    expect(badParsed.valid).toBe(false);
    expect(badParsed.issueCount).toBe(1);
    expect(badParsed.issues[0].expectedUnits).toBe(4);
    expect(badParsed.issues[0].actualUnits).toBe(3);
  });


  it("TmdMcpServer tool handlers convert TMD to MIDI and other formats", async () => {
    const midiRes = await TmdMcpServer.handleConvertTmd({ text: sampleTmd, format: "midi" });
    expect(midiRes.content[0].type).toBe("text");
    expect(midiRes.content[0].text.length).toBeGreaterThan(0);

    const xmlRes = await TmdMcpServer.handleConvertTmd({ text: sampleTmd, format: "musicxml" });
    expect(xmlRes.content[0].text).toContain("<?xml");

    const lyRes = await TmdMcpServer.handleConvertTmd({ text: sampleTmd, format: "lilypond" });
    expect(lyRes.content[0].text).toContain("\\version");

    const abcRes = await TmdMcpServer.handleConvertTmd({ text: sampleTmd, format: "abc" });
    expect(abcRes.content[0].text).toContain("X:1");

    const choRes = await TmdMcpServer.handleConvertTmd({ text: sampleTmd, format: "chordpro" });
    expect(choRes.content[0].text).toContain("{title: MCP Test Song}");
  });

  it("TmdMcpServer getSkill returns TMD specification", async () => {
    const res = await TmdMcpServer.handleGetSkill();
    expect(res.content[0].text).toContain("Timebase Mark Down");
    expect(res.content[0].text).toContain("::SCORE::");
  });

  it("TmdMcpInstaller installs mcpServers entry into target config JSON files", () => {
    const fakeConfigPath = path.join(tmpDir, "claude_desktop_config.json");
    fs.writeFileSync(fakeConfigPath, JSON.stringify({ mcpServers: {} }, null, 2));

    const results = TmdMcpInstaller.installToConfigPath(fakeConfigPath, {
      command: "tmd",
      args: ["--mcp"],
    });

    expect(results.installed).toBe(true);
    const updated = JSON.parse(fs.readFileSync(fakeConfigPath, "utf-8"));
    expect(updated.mcpServers.tmd).toBeDefined();
    expect(updated.mcpServers.tmd.command).toBe("tmd");
    expect(updated.mcpServers.tmd.args).toEqual(["--mcp"]);
  });

  it("TmdMcpInstaller creates config file if it does not exist", () => {
    const fakeConfigPath = path.join(tmpDir, "nested", "mcp_config.json");

    const results = TmdMcpInstaller.installToConfigPath(fakeConfigPath, {
      command: "tmd",
      args: ["--mcp"],
    });

    expect(results.installed).toBe(true);
    expect(fs.existsSync(fakeConfigPath)).toBe(true);
    const updated = JSON.parse(fs.readFileSync(fakeConfigPath, "utf-8"));
    expect(updated.mcpServers.tmd.command).toBe("tmd");
  });

  it("TmdMcpInstaller default paths include standard tool config locations", () => {
    const paths = TmdMcpInstaller.defaultConfigPaths();
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.includes("Claude") || p.includes("claude"))).toBe(true);
    expect(paths.some((p) => p.includes("gemini") || p.includes("antigravity"))).toBe(true);
  });

  it("CLI main handles --install-mcp flag", async () => {
    const { main } = await import("../src/cli.js");
    const fakeConfigPath = path.join(tmpDir, "test_mcp.json");
    // Mock defaultConfigPaths to test install-mcp cleanly
    const origPaths = TmdMcpInstaller.defaultConfigPaths;
    TmdMcpInstaller.defaultConfigPaths = () => [fakeConfigPath];
    try {
      const code = main(["--install-mcp"]);
      expect(code).toBe(0);
      expect(fs.existsSync(fakeConfigPath)).toBe(true);
    } finally {
      TmdMcpInstaller.defaultConfigPaths = origPaths;
    }
  });
});
