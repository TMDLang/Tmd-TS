import { TmdOutlineGenerator, TmdOutlineNode } from "../presentation/index.js";
import { TmdRefactor } from "../refactoring/index.js";
import { TmdParser } from "../syntax/index.js";
import { TmdMeasureChecker } from "../validation/index.js";
import { TMD_VERSION } from "../version.js";
import {
  TmdJSONRPCCodec,
  TmdJSONRPCFrame,
  TmdJSONRPCResponse,
} from "./codec.js";
import { TmdLSPCompletionEngine } from "./completion.js";
import {
  fromOutlineKind,
  TmdLSPCompletionItem,
  TmdLSPCompletionItemKind,
  TmdLSPDiagnostic,
  TmdLSPPosition,
  TmdLSPRange,
  TmdLSPSymbolKind,
} from "./types.js";

export * from "./codec.js";
export * from "./completion.js";
export * from "./types.js";



export class TmdLSPDiagnosticEngine {
  public static diagnose(source: string): TmdLSPDiagnostic[] {
    const diagnostics: TmdLSPDiagnostic[] = [];

    // 1. Measure consistency check
    try {
      const issues = TmdMeasureChecker.check(source);
      for (const issue of issues) {
        const line = Math.max(0, issue.lineNumber - 1);
        const range = new TmdLSPRange(
          new TmdLSPPosition(line, 0),
          new TmdLSPPosition(line, 80)
        );
        diagnostics.push({
          range,
          severity: 1, // Error
          source: "tmd-measure-checker",
          message: issue.description,
        });
      }
    } catch (_) {}

    // 2. Syntax / Parser check
    try {
      TmdParser.parseThrowing(source);
    } catch (err: any) {
      if (err?.range) {
        const line = Math.max(0, (err.range.start?.line ?? 1) - 1);
        const col = Math.max(0, (err.range.start?.column ?? 1) - 1);
        const len = Math.max(1, err.range.length ?? 1);
        diagnostics.push({
          range: new TmdLSPRange(
            new TmdLSPPosition(line, col),
            new TmdLSPPosition(line, col + len)
          ),
          severity: 1,
          source: "tmd-parser",
          message: err.message || "Parse error",
        });
      } else {
        diagnostics.push({
          range: new TmdLSPRange(
            new TmdLSPPosition(0, 0),
            new TmdLSPPosition(0, 80)
          ),
          severity: 1,
          source: "tmd-parser",
          message: err?.message || "Parse error",
        });
      }
    }

    return diagnostics;
  }
}

// MARK: - LSP Server Handler & Event Loop

export class TmdLSPServer {
  public documents: Map<string, string> = new Map();
  public isRunning: boolean = true;

  constructor(public sendOutput?: (data: string) => void) {}

  public handle(message: TmdJSONRPCFrame): void {
    if (!message.method) return;

    switch (message.method) {
      case "initialize": {
        const capabilities = {
          capabilities: {
            textDocumentSync: 1, // Full document sync
            completionProvider: {
              resolveProvider: false,
              triggerCharacters: [">", "(", ":", "[", "{"],
            },
            documentFormattingProvider: true,
            documentSymbolProvider: true,
          },
          serverInfo: {
            name: "tmd-lsp",
            version: TMD_VERSION,
          },
        };
        const resp = TmdJSONRPCCodec.encode({ id: message.id, result: capabilities });
        this.send(resp);
        break;
      }

      case "initialized":
        break;

      case "shutdown": {
        const resp = TmdJSONRPCCodec.encode({ id: message.id, result: null });
        this.send(resp);
        break;
      }

      case "exit": {
        this.isRunning = false;
        break;
      }

      case "textDocument/didOpen": {
        const params = message.params;
        const textDocument = params?.textDocument;
        if (textDocument?.uri && typeof textDocument.text === "string") {
          this.documents.set(textDocument.uri, textDocument.text);
          this.publishDiagnostics(textDocument.uri, textDocument.text);
        }
        break;
      }

      case "textDocument/didChange": {
        const params = message.params;
        const uri = params?.textDocument?.uri;
        const changes = params?.contentChanges;
        if (uri && Array.isArray(changes) && changes.length > 0) {
          const lastChange = changes[changes.length - 1];
          if (typeof lastChange.text === "string") {
            this.documents.set(uri, lastChange.text);
            this.publishDiagnostics(uri, lastChange.text);
          }
        }
        break;
      }

      case "textDocument/didClose": {
        const uri = message.params?.textDocument?.uri;
        if (uri) {
          this.documents.delete(uri);
          this.sendDiagnosticsNotification(uri, []);
        }
        break;
      }

      case "textDocument/completion": {
        if (message.id === undefined || message.id === null) return;
        const uri = message.params?.textDocument?.uri;
        const pos = message.params?.position;
        let completionItems: any[] = [];

        if (uri && pos && this.documents.has(uri)) {
          const source = this.documents.get(uri)!;
          const position = new TmdLSPPosition(pos.line, pos.character);
          const items = TmdLSPCompletionEngine.complete(source, position);
          completionItems = items.map((item) => ({
            label: item.label,
            kind: item.kind,
            detail: item.detail,
            documentation: item.documentation,
            insertText: item.insertText,
            insertTextFormat: item.insertTextFormat,
          }));
        }

        const resp = TmdJSONRPCCodec.encode({ id: message.id, result: completionItems });
        this.send(resp);
        break;
      }

      case "textDocument/formatting": {
        if (message.id === undefined || message.id === null) return;
        const uri = message.params?.textDocument?.uri;
        const edits: any[] = [];

        if (uri && this.documents.has(uri)) {
          const source = this.documents.get(uri)!;
          const formatted = TmdRefactor.format(source);
          const lines = source.split("\n");
          const lastLineIndex = Math.max(0, lines.length - 1);
          const lastLineChar = (lines[lastLineIndex] || "").length;

          edits.push({
            range: {
              start: { line: 0, character: 0 },
              end: { line: lastLineIndex, character: lastLineChar },
            },
            newText: formatted,
          });
        }

        const resp = TmdJSONRPCCodec.encode({ id: message.id, result: edits });
        this.send(resp);
        break;
      }

      case "textDocument/documentSymbol": {
        if (message.id === undefined || message.id === null) return;
        const uri = message.params?.textDocument?.uri;
        let symbols: any[] = [];

        if (uri && this.documents.has(uri)) {
          const source = this.documents.get(uri)!;
          const nodes = TmdOutlineGenerator.generate(source);
          symbols = nodes.map((node) => this.nodeToLSPDocumentSymbol(node));
        }

        const resp = TmdJSONRPCCodec.encode({ id: message.id, result: symbols });
        this.send(resp);
        break;
      }

      default: {
        if (message.id !== undefined && message.id !== null) {
          const resp = TmdJSONRPCCodec.encode({ id: message.id, result: null });
          this.send(resp);
        }
      }
    }
  }

  private send(encoded: string): void {
    if (this.sendOutput) {
      this.sendOutput(encoded);
    }
  }

  private publishDiagnostics(uri: string, source: string): void {
    const diags = TmdLSPDiagnosticEngine.diagnose(source);
    const diagDicts = diags.map((d) => ({
      range: {
        start: { line: d.range.start.line, character: d.range.start.character },
        end: { line: d.range.end.line, character: d.range.end.character },
      },
      severity: d.severity,
      source: d.source,
      message: d.message,
    }));
    this.sendDiagnosticsNotification(uri, diagDicts);
  }

  private sendDiagnosticsNotification(uri: string, diagnostics: any[]): void {
    const encoded = TmdJSONRPCCodec.encodeNotification("textDocument/publishDiagnostics", {
      uri,
      diagnostics,
    });
    this.send(encoded);
  }

  private nodeToLSPDocumentSymbol(node: TmdOutlineNode): any {
    const symbolKind = fromOutlineKind(node.kind);
    const dict: Record<string, any> = {
      name: node.name,
      kind: symbolKind,
      range: {
        start: { line: Math.max(0, node.range.startLine - 1), character: Math.max(0, node.range.startColumn - 1) },
        end: { line: Math.max(0, node.range.endLine - 1), character: Math.max(0, node.range.endColumn - 1) },
      },
      selectionRange: {
        start: { line: Math.max(0, node.selectionRange.startLine - 1), character: Math.max(0, node.selectionRange.startColumn - 1) },
        end: { line: Math.max(0, node.selectionRange.endLine - 1), character: Math.max(0, node.selectionRange.endColumn - 1) },
      },
    };
    if (node.detail) dict.detail = node.detail;
    if (node.children && node.children.length > 0) {
      dict.children = node.children.map((child) => this.nodeToLSPDocumentSymbol(child));
    }
    return dict;
  }
}
