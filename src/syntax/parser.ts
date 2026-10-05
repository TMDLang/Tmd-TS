import { TmdParserIO } from "../io/parser_io.js";
import { TmdParserCore } from "./parser_core.js";
import type { Sheet } from "./types.js";

export { Lexer } from "./lexer.js";
export { TmdParseError } from "./parse_diagnostics.js";
export { TmdParserCore } from "./parser_core.js";
export type { LexedToken, SourcePosition, SourceRange, Token, TokenType } from "./tokens.js";

/** Public parser facade for pure text parsing plus source-loading compatibility APIs. */
export class TmdParser extends TmdParserCore {
  /** @deprecated Prefer TmdParserIO.parseData for source-loading concerns. */
  public static parseData(data: Uint8Array): Sheet {
    return TmdParserIO.parseData(data);
  }

  /** @deprecated Prefer TmdParserIO.parseFile for source-loading concerns. */
  public static parseFile(filePathOrURL: string): Sheet {
    return TmdParserIO.parseFile(filePathOrURL);
  }

  /** @deprecated Prefer TmdParserIO.parseURL for source-loading concerns. */
  public static parseURL(fileURL: string): Sheet {
    return TmdParserIO.parseURL(fileURL);
  }
}
