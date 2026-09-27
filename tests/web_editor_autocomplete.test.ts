import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { TMDWebLSPClient } from "../web/src/lsp/client.js";
import { createTmdCompletionSource } from "../web/src/editor.js";

describe("TMD Autocomplete Integration", () => {
  it("resolves section name completions when after '->' without space (explicit: false)", async () => {
    const lspClient = new TMDWebLSPClient();
    const doc = `theme {
  1 2 3 4
}

->`;
    lspClient.openDocument(doc);
    const pos = doc.length;
    const state = EditorState.create({
      doc,
      selection: { anchor: pos },
    });
    const completionSource = createTmdCompletionSource(lspClient);
    const context = new CompletionContext(state, pos, false);
    const result = await completionSource(context);

    expect(result).not.toBeNull();
    expect(result!.options.length).toBeGreaterThan(0);
    expect(result!.options.some((o) => o.label === "theme")).toBe(true);
    expect(result!.from).toBe(pos);
  });

  it("resolves section name completions when after '-> ' with space (explicit: false)", async () => {
    const lspClient = new TMDWebLSPClient();
    const doc = `theme {
  1 2 3 4
}

-> `;
    lspClient.openDocument(doc);
    const pos = doc.length;
    const state = EditorState.create({
      doc,
      selection: { anchor: pos },
    });
    const completionSource = createTmdCompletionSource(lspClient);
    const context = new CompletionContext(state, pos, false);
    const result = await completionSource(context);

    expect(result).not.toBeNull();
    expect(result!.options.length).toBeGreaterThan(0);
    expect(result!.options.some((o) => o.label === "theme")).toBe(true);
    expect(result!.from).toBe(pos);
  });

  it("resolves macro completions when after '-> (' (explicit: false)", async () => {
    const lspClient = new TMDWebLSPClient();
    const doc = `theme {
  1 2 3 4
}

-> (`;
    lspClient.openDocument(doc);
    const pos = doc.length;
    const state = EditorState.create({
      doc,
      selection: { anchor: pos },
    });
    const completionSource = createTmdCompletionSource(lspClient);
    const context = new CompletionContext(state, pos, false);
    const result = await completionSource(context);

    expect(result).not.toBeNull();
    expect(result!.options.length).toBeGreaterThan(0);
    expect(result!.options.some((o) => o.label === "canon")).toBe(true);
    expect(result!.from).toBe(pos);
  });

  it("resolves macro completions when after '-> (ca' (explicit: false)", async () => {
    const lspClient = new TMDWebLSPClient();
    const doc = `theme {
  1 2 3 4
}

-> (ca`;
    lspClient.openDocument(doc);
    const pos = doc.length;
    const state = EditorState.create({
      doc,
      selection: { anchor: pos },
    });
    const completionSource = createTmdCompletionSource(lspClient);
    const context = new CompletionContext(state, pos, false);
    const result = await completionSource(context);

    expect(result).not.toBeNull();
    expect(result!.options.length).toBeGreaterThan(0);
    expect(result!.options.some((o) => o.label === "canon")).toBe(true);
    // from should point to start of 'ca'
    expect(result!.from).toBe(pos - 2);
  });

  it("resolves section directives after a partial brace prefix", async () => {
    const lspClient = new TMDWebLSPClient();
    const doc = `theme {
  <4*>
  {p`;
    lspClient.openDocument(doc);
    const pos = doc.length;
    const state = EditorState.create({ doc, selection: { anchor: pos } });
    const completionSource = createTmdCompletionSource(lspClient);
    const result = await completionSource(new CompletionContext(state, pos, false));

    expect(result).not.toBeNull();
    expect(result!.from).toBe(pos - 1);
    expect(result!.options.some((o) => o.label === "p")).toBe(true);
    expect(result!.options.some((o) => o.label === "ppp")).toBe(true);
    expect(result!.options.some((o) => o.label === "f")).toBe(false);
  });
});
