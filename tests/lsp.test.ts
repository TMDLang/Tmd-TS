import { describe, it, expect, vi } from "vitest";
import {
  TMDJSONRPCCodec,
  TMDLSPCompletionEngine,
  TMDLSPDiagnosticEngine,
  TMDLSPServer,
  TMDLSPPosition,
} from "../src/lsp/index.js";

describe("TMD LSP Protocol & Completion Tests (TDD)", () => {
  it("parses JSON-RPC messages with Content-Length header", () => {
    const raw = 'Content-Length: 46\r\n\r\n{"jsonrpc":"2.0","id":1,"method":"initialize"}';
    const frames = TMDJSONRPCCodec.decode(raw);
    expect(frames).toHaveLength(1);
    expect(frames[0].id).toBe(1);
    expect(frames[0].method).toBe("initialize");
  });

  it("encodes JSON-RPC response with Content-Length header", () => {
    const response = { id: 1, result: { capabilities: {} } };
    const encoded = TMDJSONRPCCodec.encode(response);
    expect(encoded.startsWith("Content-Length: ")).toBe(true);
    expect(encoded).toContain("\r\n\r\n");
    expect(encoded).toContain('"jsonrpc":"2.0"');
  });

  it("handles fragmented chunked JSON-RPC buffer stream", () => {
    const msg = '{"jsonrpc":"2.0","id":2,"method":"shutdown"}';
    const header = `Content-Length: ${msg.length}\r\n\r\n`;

    let buffer = Buffer.from(header.slice(0, 10));
    let frames = TMDJSONRPCCodec.decodeBuffer(buffer);
    expect(frames.frames).toHaveLength(0);

    buffer = Buffer.concat([frames.remaining, Buffer.from(header.slice(10) + msg)]);
    frames = TMDJSONRPCCodec.decodeBuffer(buffer);
    expect(frames.frames).toHaveLength(1);
    expect(frames.frames[0].id).toBe(2);
    expect(frames.frames[0].method).toBe("shutdown");
    expect(frames.remaining.length).toBe(0);
  });

  it("provides section name completions after '-> ' in playback orders", () => {
    const source = `::SCORE::
** Test Score **
!= 120
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    1 2 3 4
}

verse:Piano@|0|{
    <4*>
    1 2 3 4
}

Theme {
    <4*>
    1 2 3 4
}

-> `;
    // Position at last line, after "-> "
    const lines = source.split("\n");
    const lastLineIndex = lines.length - 1;
    const items = TMDLSPCompletionEngine.complete(
      source,
      new TMDLSPPosition(lastLineIndex, lines[lastLineIndex].length)
    );
    const labels = items.map((i) => i.label);
    expect(labels).toContain("intro");
    expect(labels).toContain("verse");
    expect(labels).toContain("Theme");
  });

  it("provides section completions after '->' even with draft score or unclosed braces", () => {
    const draftSource = `intro:Piano { 1 2 3 4
verse:Guitar { 5 6 7 1
Theme { 1 1 5 5

-> `;
    const lines = draftSource.split("\n");
    const lastLineIndex = lines.length - 1;
    const items = TMDLSPCompletionEngine.complete(
      draftSource,
      new TMDLSPPosition(lastLineIndex, lines[lastLineIndex].length)
    );
    const labels = items.map((i) => i.label);
    expect(labels).toContain("intro");
    expect(labels).toContain("verse");
    expect(labels).toContain("Theme");
  });

  it("provides S-expression macro snippets after '-> (' in playback orders", () => {
    const source = `::SCORE::
** Test Score **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 2 3 4
}

-> (`;
    const lines = source.split("\n");
    const lastLineIndex = lines.length - 1;
    const items = TMDLSPCompletionEngine.complete(
      source,
      new TMDLSPPosition(lastLineIndex, lines[lastLineIndex].length)
    );
    const labels = items.map((i) => i.label);
    expect(labels).toContain("canon");
    expect(labels).toContain("loop");
    expect(labels).toContain("layer");
    expect(labels).toContain("seq");
    expect(labels).toContain("reverse");
    expect(labels).toContain("flip");
    expect(labels).toContain("transpose");
    expect(labels).toContain("vary");

    const canonItem = items.find((i) => i.label === "canon");
    expect(canonItem?.insertText?.startsWith("(")).toBe(false);
    expect(canonItem?.insertText?.startsWith("canon")).toBe(true);

    // Also supports ->( without space
    const itemsNoSpace = TMDLSPCompletionEngine.complete(
      source.replace("-> (", "->("),
      new TMDLSPPosition(lastLineIndex, 3)
    );
    expect(itemsNoSpace.map((i) => i.label)).toContain("canon");

    // Also supports partial macro prefix -> (ca
    const itemsPartial = TMDLSPCompletionEngine.complete(
      source.replace("-> (", "-> (ca"),
      new TMDLSPPosition(lastLineIndex, 6)
    );
    expect(itemsPartial.map((i) => i.label)).toContain("canon");
  });

  it("provides General MIDI 128 instrument names after colon in paragraph header", () => {
    const source = `::SCORE::
** Test Score **
!= 120
?= C
<4/4>

verse:`;
    const lines = source.split("\n");
    const lastLineIndex = lines.length - 1;
    const items = TMDLSPCompletionEngine.complete(
      source,
      new TMDLSPPosition(lastLineIndex, lines[lastLineIndex].length)
    );
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Piano");
    expect(labels).toContain("Violin");
    expect(labels).toContain("AcousticGuitar");
    expect(labels).toContain("Timpani");
    expect(labels).toContain("Drums");
  });

  it("provides completions even when partial prefix is typed (e.g. verse:Pi or [D or {!)", () => {
    const source1 = "verse:Pi";
    const items1 = TMDLSPCompletionEngine.complete(source1, new TMDLSPPosition(0, 8));
    expect(items1.map((i) => i.label)).toContain("Piano");

    const source2 = "[D";
    const items2 = TMDLSPCompletionEngine.complete(source2, new TMDLSPPosition(0, 2));
    expect(items2.map((i) => i.label)).toContain("Dm");

    const source3 = "{!";
    const items3 = TMDLSPCompletionEngine.complete(source3, new TMDLSPPosition(0, 2));
    expect(items3.map((i) => i.label)).toContain("!= 120");

    const source4 = "-> v";
    const fullSource4 = `intro:Piano { 1 }\nverse:Piano { 2 }\n-> v`;
    const items4 = TMDLSPCompletionEngine.complete(fullSource4, new TMDLSPPosition(2, 4));
    expect(items4.map((i) => i.label)).toContain("verse");
  });

  it("offers explicit tonality and dynamics directives inside a section", () => {
    const source = `::SCORE::\n** Completion **\n!= 120\n?= C\n<4/4>\n\nA:Piano@|0|{\n  <4*>\n  {\n`;
    const items = TMDLSPCompletionEngine.complete(source, new TMDLSPPosition(6, source.split("\n")[6].length));
    const labels = items.map((item) => item.label);

    expect(labels).toContain("key= Bm");
    expect(labels).toContain("p");
    expect(labels).toContain("mf");
    expect(labels).toContain("fff");
  });

  it("offers every section directive and filters by the typed directive prefix", () => {
    const fullSource = "A:Piano@|0|{\n  <4*>\n  {";
    const fullLine = fullSource.split("\n").length - 1;
    const all = TMDLSPCompletionEngine.complete(fullSource, new TMDLSPPosition(fullLine, 3));
    const allLabels = all.map((item) => item.label);

    expect(allLabels).toEqual(expect.arrayContaining([
      "!= 120", "!+ 10", "?= C", "?+ 2", "?- 2", "?= fixed",
      "key= Bm", "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "<4/4>",
    ]));
    expect(allLabels).not.toContain("intro");

    const partial = "A:Piano@|0|{\n  <4*>\n  {key";
    const partialLine = partial.split("\n").length - 1;
    const keyItems = TMDLSPCompletionEngine.complete(partial, new TMDLSPPosition(partialLine, 6));
    expect(keyItems.map((item) => item.label)).toEqual(["key= Bm"]);
  });

  it("provides diatonic chords when opening bracket '[' inside paragraph", () => {
    const source = `::SCORE::
** Test Score **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    [`;
    const lines = source.split("\n");
    const lastLineIndex = lines.length - 1;
    const items = TMDLSPCompletionEngine.complete(
      source,
      new TMDLSPPosition(lastLineIndex, lines[lastLineIndex].length)
    );
    const labels = items.map((i) => i.label);
    expect(labels).toContain("C");
    expect(labels).toContain("Dm");
    expect(labels).toContain("Em");
    expect(labels).toContain("F");
    expect(labels).toContain("G");
    expect(labels).toContain("Am");
  });

  it("matches Swift chord completion with scale-degree, extensions, and inversions", () => {
    const source = `::SCORE::
** Chord Completion **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    [`;
    const lines = source.split("\n");
    const items = TMDLSPCompletionEngine.complete(source, new TMDLSPPosition(lines.length - 1, lines.at(-1)!.length));
    const labels = items.map((item) => item.label);

    for (const label of ["1", "2m", "3m", "4", "5", "6m", "7dim", "1maj7", "2m7", "4maj7", "57", "6m7", "5sus4", "5/4", "4/5", "1/3", "5/7", "1/5"]) {
      expect(labels).toContain(label);
    }
    for (const label of ["C", "Dm", "Em", "F", "G", "Am", "Bdim", "Cmaj7", "Dm7", "Em7", "Fmaj7", "G7", "Am7", "Gsus4", "C/E", "G/B", "F/G"]) {
      expect(labels).toContain(label);
    }
  });

  it("publishes diagnostics on beat discrepancies in measures", () => {
    const invalidSource = `::SCORE::
** Measure Error Score **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 2 3 |
}

-> verse ->#
`;
    const diags = TMDLSPDiagnosticEngine.diagnose(invalidSource);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].message).toMatch(/3 units|expected 4/i);
    expect(diags[0].severity).toBe(1); // Error
  });

  it("server handles initialize, document change, completion, formatting, and documentSymbol", () => {
    const outputMessages: string[] = [];
    const server = new TMDLSPServer((out) => {
      outputMessages.push(out);
    });

    // 1. Initialize
    server.handle({
      id: 1,
      method: "initialize",
      params: {},
    });
    expect(outputMessages).toHaveLength(1);
    const initResp = JSON.parse(outputMessages[0].split("\r\n\r\n")[1]);
    expect(initResp.result.capabilities.completionProvider).toBeDefined();
    expect(initResp.result.capabilities.documentFormattingProvider).toBe(true);
    expect(initResp.result.capabilities.documentSymbolProvider).toBe(true);

    outputMessages.length = 0;

    // 2. didOpen with invalid score -> publishes diagnostics
    const uri = "file:///test.tmd";
    server.handle({
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          uri,
          text: `::SCORE::
** Invalid **
!= 120
?= C
<4/4>

verse:Piano@|0|{
    <4*>
    | 1 2 3 |
}
-> verse ->#
`,
        },
      },
    });

    expect(outputMessages).toHaveLength(1);
    const diagNote = JSON.parse(outputMessages[0].split("\r\n\r\n")[1]);
    expect(diagNote.method).toBe("textDocument/publishDiagnostics");
    expect(diagNote.params.diagnostics.length).toBeGreaterThan(0);

    outputMessages.length = 0;

    // 3. Formatting
    server.handle({
      id: 2,
      method: "textDocument/formatting",
      params: {
        textDocument: { uri },
      },
    });
    expect(outputMessages).toHaveLength(1);
    const formatResp = JSON.parse(outputMessages[0].split("\r\n\r\n")[1]);
    expect(formatResp.result).toHaveLength(1);
    expect(formatResp.result[0].newText).toContain("::SCORE::");

    outputMessages.length = 0;

    // 4. Document symbols
    server.handle({
      id: 3,
      method: "textDocument/documentSymbol",
      params: {
        textDocument: { uri },
      },
    });
    expect(outputMessages).toHaveLength(1);
    const symbolResp = JSON.parse(outputMessages[0].split("\r\n\r\n")[1]);
    expect(symbolResp.result.length).toBeGreaterThan(0);

    outputMessages.length = 0;

    // 5. Shutdown and exit
    server.handle({ id: 4, method: "shutdown" });
    expect(outputMessages).toHaveLength(1);
    const shutdownResp = JSON.parse(outputMessages[0].split("\r\n\r\n")[1]);
    expect(shutdownResp.result).toBeNull();

    expect(server.isRunning).toBe(true);
    server.handle({ method: "exit" });
    expect(server.isRunning).toBe(false);
  });

  it("CLI dispatches lsp subcommand with help info", async () => {
    const { main } = await import("../src/cli.js");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitCode = main(["lsp", "-h"]);
    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("USAGE: tmd lsp"));
    logSpy.mockRestore();
  });
});
