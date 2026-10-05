import { TmdParserCore } from "./parser_core.js";

export { Lexer } from "./lexer.js";
export { TmdParseError } from "./parse_diagnostics.js";
export { TmdParserCore } from "./parser_core.js";
export type { LexedToken, SourcePosition, SourceRange, Token, TokenType } from "./tokens.js";

/** Public parser facade for pure text parsing. */
export class TmdParser extends TmdParserCore {
}
