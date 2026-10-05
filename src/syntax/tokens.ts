export type TokenType =
  | "scoreHeader"
  | "doubleAsterisk"
  | "speedPrefix"
  | "relativeTempoPrefix"
  | "keySignaturePrefix"
  | "explicitKeyPrefix"
  | "openAngle"
  | "slash"
  | "asterisk"
  | "closeAngle"
  | "colon"
  | "at"
  | "pipe"
  | "openBrace"
  | "closeBrace"
  | "openParen"
  | "closeParen"
  | "percentOpenParen"
  | "arrow"
  | "arrowEnd"
  | "relativeOrderPrefix"
  | "absoluteOrderPrefix"
  | "number"
  | "positiveNumber"
  | "double"
  | "note"
  | "plus"
  | "chord"
  | "percussion"
  | "metadata"
  | "programText"
  | "tie"
  | "identifier"
  | "eof";

export interface Token {
  type: TokenType;
  value?: any;
  text: string;
  line: number;
  column: number;
}

export function tokenExpectedDescription(type: TokenType): string {
  switch (type) {
    case "scoreHeader": return "::SCORE::";
    case "doubleAsterisk": return "**";
    case "speedPrefix": return "!=";
    case "relativeTempoPrefix": return "!+";
    case "keySignaturePrefix": return "?=";
    case "explicitKeyPrefix": return "key=";
    case "openAngle": return "<";
    case "slash": return "/";
    case "asterisk": return "*";
    case "closeAngle": return ">";
    case "colon": return ":";
    case "at": return "@";
    case "pipe": return "|";
    case "openBrace": return "{";
    case "closeBrace": return "}";
    case "openParen": return "(";
    case "closeParen": return ")";
    case "percentOpenParen": return "%(";
    case "arrow": return "->";
    case "arrowEnd": return "->#";
    case "relativeOrderPrefix": return "{?";
    case "absoluteOrderPrefix": return "{?=";
    case "number": return "number";
    case "positiveNumber": return "positive number";
    case "double": return "decimal number";
    case "note": return "note";
    case "plus": return "+";
    case "chord": return "chord";
    case "percussion": return "percussion";
    case "metadata": return "metadata";
    case "programText": return "program block";
    case "tie": return "-";
    case "identifier": return "identifier";
    case "eof": return "end of input";
  }
}

export interface SourcePosition { offset: number; line: number; column: number; }
export interface SourceRange { start: SourcePosition; length: number; endOffset: number; }
export interface LexedToken { token: Token; text: string; range: SourceRange; }
export const FULLWIDTH_PUNCT_MAP: Record<string, string> = {
  "（": "(",
  "）": ")",
  "｛": "{",
  "｝": "}",
  "【": "[",
  "】": "]",
  "：": ":",
  "｜": "|",
  "－": "-",
  "，": ",",
  "、": ",",
  "？": "?",
  "！": "!",
  "＊": "*",
  "／": "/",
  "＜": "<",
  "＞": ">",
};

