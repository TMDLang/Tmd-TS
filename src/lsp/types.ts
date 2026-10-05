// MARK: - LSP Data Structures

export class TmdLSPPosition {
  constructor(public line: number, public character: number) {}
}

export class TmdLSPRange {
  constructor(public start: TmdLSPPosition, public end: TmdLSPPosition) {}
}

export enum TmdLSPCompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
}

export enum TmdLSPSymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

export function fromOutlineKind(outlineKind: string): TmdLSPSymbolKind {
  switch (outlineKind.toLowerCase()) {
    case "file": return TmdLSPSymbolKind.File;
    case "namespace": return TmdLSPSymbolKind.Namespace;
    case "class": return TmdLSPSymbolKind.Class;
    case "method": return TmdLSPSymbolKind.Method;
    case "property": return TmdLSPSymbolKind.Property;
    case "field": return TmdLSPSymbolKind.Field;
    case "event": return TmdLSPSymbolKind.Event;
    case "operator": return TmdLSPSymbolKind.Operator;
    case "string": return TmdLSPSymbolKind.String;
    case "number": return TmdLSPSymbolKind.Number;
    default: return TmdLSPSymbolKind.Variable;
  }
}

export interface TmdLSPCompletionItem {
  label: string;
  kind: TmdLSPCompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: number; // 1: PlainText, 2: Snippet
}

export interface TmdLSPDiagnostic {
  range: TmdLSPRange;
  severity: number; // 1: Error, 2: Warning, 3: Information, 4: Hint
  source?: string;
  message: string;
}
