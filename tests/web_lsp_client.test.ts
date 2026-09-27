import { describe, expect,it } from "vitest";

import { TMDWebLSPClient } from "../web/src/lsp/client.js";

describe("TMDWebLSPClient (In-Memory LSP Client for Web Studio)", () => {
  it("initializes and handles document open and diagnostics notification", () => {
    let receivedDiagnostics: any[] | null = null;
    const client = new TMDWebLSPClient({
      onDiagnostics: (diags) => {
        receivedDiagnostics = diags;
      },
    });

    const docText = `tempo: 120
verse:Piano {
  1 2 3
}
`;
    client.openDocument(docText);

    expect(receivedDiagnostics).not.toBeNull();
    // 1 2 3 in 4/4 has measure beat discrepancy
    expect(receivedDiagnostics!.length).toBeGreaterThan(0);
    const diag = receivedDiagnostics![0];
    expect(diag.message).toBeDefined();
    expect(diag.range).toBeDefined();
    expect(diag.range.start.line).toBeDefined();
  });

  it("updates document and receives updated diagnostics", () => {
    let count = 0;
    const client = new TMDWebLSPClient({
      onDiagnostics: () => {
        count++;
      },
    });

    client.openDocument("tempo: 120\n");
    expect(count).toBe(1);

    client.changeDocument("tempo: 120\nverse:Piano { 1 2 3 4 }\n");
    expect(count).toBe(2);
  });

  it("requests completions at position and formats snippets correctly", async () => {
    const client = new TMDWebLSPClient();
    const source = "-> (ca";
    client.openDocument(source);

    // Line 0, character 6 (after "-> (ca")
    const completions = await client.requestCompletions(0, 6);
    expect(completions.length).toBeGreaterThan(0);
    const canonItem = completions.find((c) => c.label === "canon");
    expect(canonItem).toBeDefined();
    expect(canonItem?.detail).toContain("Polyphonic Canon");
  });

  it("works in a browser runtime without the Node Buffer global", async () => {
    const nodeBuffer = (globalThis as any).Buffer;
    try {
      (globalThis as any).Buffer = undefined;

      const client = new TMDWebLSPClient();
      client.openDocument("-> (ca");
      const completions = await client.requestCompletions(0, 6);

      expect(completions.some((item) => item.label === "canon")).toBe(true);
    } finally {
      (globalThis as any).Buffer = nodeBuffer;
    }
  });

  it("requests document formatting", async () => {
    const client = new TMDWebLSPClient();
    const unformatted = `::SCORE::
**Test**
!=120
?=C
<4/4>

verse:Piano@|0|{
<4*>
|1 2 3 4|
}
-> verse ->#
`;
    client.openDocument(unformatted);

    const edits = await client.requestFormatting();
    expect(edits.length).toBe(1);
    expect(edits[0].newText).toContain("::SCORE::");
    expect(edits[0].newText).toContain("!= 120");
    expect(edits[0].newText).toContain("verse:Piano");
  });

  it("requests document symbols (outline hierarchy)", async () => {
    const client = new TMDWebLSPClient();
    const source = `tempo: 120
verse:Piano {
  1 2 3 4
}
`;
    client.openDocument(source);
    const symbols = await client.requestDocumentSymbols();
    expect(symbols.length).toBeGreaterThan(0);
  });

  it("converts LSP positions to and from CodeMirror offsets correctly", () => {
    const client = new TMDWebLSPClient();
    const text = "abc\ndefgh\nijk";
    // line 0: 'abc' (len 3), line 1: 'defgh' (len 5), line 2: 'ijk' (len 3)
    // offsets: 'a'=0, 'b'=1, 'c'=2, '\n'=3, 'd'=4, 'e'=5, 'f'=6, 'g'=7, 'h'=8, '\n'=9, 'i'=10
    expect(client.positionToOffset(text, { line: 0, character: 2 })).toBe(2);
    const pos = client.offsetToPosition(text, 7);
    expect(pos).toEqual({ line: 1, character: 3 });
  });

  it("converts LSP diagnostics to CodeMirror diagnostics with accurate offsets", () => {
    const client = new TMDWebLSPClient();
    const doc = "tempo: 120\nverse:Piano {\n  1 2 3\n}\n";
    const lspDiags = [
      {
        range: {
          start: { line: 2, character: 2 },
          end: { line: 2, character: 7 },
        },
        severity: 1, // Error
        message: "Measure length mismatch",
        source: "tmd-measure-checker",
      },
    ];

    const cmDiags = client.convertToCMDiagnostics(doc, lspDiags);
    expect(cmDiags.length).toBe(1);
    expect(cmDiags[0].severity).toBe("error");
    expect(cmDiags[0].message).toBe("Measure length mismatch");
    // Line 0: "tempo: 120\n" (11)
    // Line 1: "verse:Piano {\n" (14)
    // Line 2: start at 11 + 14 + 2 = 27, end at 11 + 14 + 7 = 32
    expect(cmDiags[0].from).toBe(27);
    expect(cmDiags[0].to).toBe(32);
  });

  it("converts LSP completions to CodeMirror completions", () => {
    const client = new TMDWebLSPClient();
    const lspItems = [
      {
        label: "canon",
        kind: 15, // Snippet
        detail: "Polyphonic Canon",
        insertText: "(canon ${1:Theme} (${2:Violin1 Violin2}) ${3:2})",
      },
      {
        label: "Piano",
        kind: 12, // Value
        detail: "Instrument",
      },
    ];

    const cmItems = client.convertToCMCompletions(lspItems);
    expect(cmItems.length).toBe(2);
    expect(cmItems[0].label).toBe("canon");
    expect(cmItems[0].detail).toBeUndefined();
    expect(cmItems[0].info).toBeUndefined();
    expect(cmItems[0].type).toBe("text");
    expect(cmItems[1].label).toBe("Piano");
  });
});
