import {
  TmdJSONRPCCodec,
  TmdJSONRPCFrame,
  TmdLSPCompletionItem,
  TmdLSPDiagnostic,
  TmdLSPPosition,
  TmdLSPServer,
} from "../../../src/lsp/index.js";

export interface TmdWebLSPClientOptions {
  uri?: string;
  onDiagnostics?: (diagnostics: TmdLSPDiagnostic[]) => void;
}

export class TmdWebLSPClient {
  public readonly uri: string;
  private server: TmdLSPServer;
  private nextId: number = 1;
  private pendingRequests: Map<number | string, (response: any) => void> = new Map();
  private onDiagnostics?: (diagnostics: TmdLSPDiagnostic[]) => void;
  private diagnosticWaiters: Array<(diagnostics: TmdLSPDiagnostic[]) => void> = [];

  constructor(options?: TmdWebLSPClientOptions) {
    this.uri = options?.uri || "inmemory://score.tmd";
    this.onDiagnostics = options?.onDiagnostics;

    this.server = new TmdLSPServer((outputString) => {
      this.handleServerOutput(outputString);
    });

    // Initialize server
    this.sendRequest("initialize", {
      capabilities: {},
      rootUri: null,
    });
    this.sendNotification("initialized", {});
  }

  private handleServerOutput(raw: string) {
    const frames = TmdJSONRPCCodec.decode(raw);
    for (const frame of frames) {
      // Check if notification
      if (frame.method === "textDocument/publishDiagnostics") {
        if (frame.params?.uri === this.uri && this.onDiagnostics) {
          this.onDiagnostics(frame.params.diagnostics || []);
        }
        if (frame.params?.uri === this.uri) {
          const waiters = this.diagnosticWaiters.splice(0);
          const diagnostics = frame.params.diagnostics || [];
          for (const resolve of waiters) resolve(diagnostics);
        }
        continue;
      }

      // Check if response to a request
      if (frame.id !== undefined && frame.id !== null) {
        const resolver = this.pendingRequests.get(frame.id);
        if (resolver) {
          this.pendingRequests.delete(frame.id);
          // Frame parsed from JSON-RPC response contains result or error
          resolver(frame);
        }
      }
    }
  }

  public openDocument(text: string) {
    this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: this.uri,
        languageId: "tmd",
        version: 1,
        text,
      },
    });
  }

  public changeDocument(text: string, version: number = 1) {
    this.sendNotification("textDocument/didChange", {
      textDocument: {
        uri: this.uri,
        version,
      },
      contentChanges: [
        {
          text,
        },
      ],
    });
  }

  public diagnose(text: string, version: number = 1): Promise<TmdLSPDiagnostic[]> {
    return new Promise((resolve) => {
      this.diagnosticWaiters.push(resolve);
      this.changeDocument(text, version);
    });
  }

  public closeDocument() {
    this.sendNotification("textDocument/didClose", {
      textDocument: {
        uri: this.uri,
      },
    });
  }

  public async requestCompletions(line: number, character: number): Promise<TmdLSPCompletionItem[]> {
    const resp = await this.sendRequest("textDocument/completion", {
      textDocument: { uri: this.uri },
      position: { line, character },
    });
    // In our JSON-RPC decode, if the message returned result, frame will have it or we decode it
    // Wait, let's look at how TmdJSONRPCCodec encodes response:
    // payload: { jsonrpc: '2.0', id, result, error }
    // decode turns it into { id, method, params, result, error }
    return (resp?.result || []) as TmdLSPCompletionItem[];
  }

  public async requestFormatting(): Promise<Array<{ range: any; newText: string }>> {
    const resp = await this.sendRequest("textDocument/formatting", {
      textDocument: { uri: this.uri },
      options: { tabSize: 2, insertSpaces: true },
    });
    return (resp?.result || []) as Array<{ range: any; newText: string }>;
  }

  public async requestDocumentSymbols(): Promise<any[]> {
    const resp = await this.sendRequest("textDocument/documentSymbol", {
      textDocument: { uri: this.uri },
    });
    return (resp?.result || []) as any[];
  }

  public positionToOffset(text: string, pos: { line: number; character: number }): number {
    const lines = text.split("\n");
    let offset = 0;
    const targetLine = Math.min(pos.line, lines.length - 1);
    for (let i = 0; i < targetLine; i++) {
      offset += lines[i].length + 1; // +1 for \n
    }
    if (targetLine >= 0 && targetLine < lines.length) {
      offset += Math.min(pos.character, lines[targetLine].length);
    }
    return offset;
  }

  public offsetToPosition(text: string, offset: number): { line: number; character: number } {
    const clampedOffset = Math.max(0, Math.min(offset, text.length));
    const slice = text.slice(0, clampedOffset);
    const lines = slice.split("\n");
    const line = lines.length - 1;
    const character = lines[line].length;
    return { line, character };
  }

  public convertToCMDiagnostics(doc: string, lspDiagnostics: TmdLSPDiagnostic[]): Array<{
    from: number;
    to: number;
    severity: "error" | "warning" | "info" | "hint";
    message: string;
    source?: string;
  }> {
    return lspDiagnostics.map((diag) => {
      let from = this.positionToOffset(doc, diag.range.start);
      let to = this.positionToOffset(doc, diag.range.end);
      if (to <= from) {
        to = Math.min(from + 1, doc.length);
      }
      let severity: "error" | "warning" | "info" | "hint" = "error";
      if (diag.severity === 2) severity = "warning";
      else if (diag.severity === 3) severity = "info";
      else if (diag.severity === 4) severity = "hint";

      return {
        from,
        to,
        severity,
        message: diag.message,
        source: diag.source,
      };
    });
  }

  public convertToCMCompletions(items: TmdLSPCompletionItem[]): Array<{
    label: string;
    detail?: string;
    info?: string;
    apply?: string;
    type?: string;
  }> {
    return items.map((item) => {
      // Map snippet placeholder ${1:Theme} -> Theme if needed for basic completion text
      let applyText = item.insertText || item.label;
      // Strip simple snippet markers like ${1:foo} -> foo
      applyText = applyText.replace(/\$\{\d+:([^}]+)\}/g, "$1");
      applyText = applyText.replace(/\$\d+/g, "");

      return {
        label: item.label,
        apply: applyText,
        type: item.kind === 15 ? "text" : "variable",
      };
    });
  }

  private sendRequest(method: string, params: any): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pendingRequests.set(id, resolve);
      this.server.handle({
        id,
        method,
        params,
      });
    });
  }

  private sendNotification(method: string, params: any) {
    this.server.handle({
      method,
      params,
    });
  }
}
