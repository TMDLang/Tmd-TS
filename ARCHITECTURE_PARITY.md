# TMD Architecture Parity Matrix

This matrix is the source of truth for the responsibility boundaries shared by
the Swift and TypeScript implementations.

| Responsibility | TmdSwift | Tmd-TS | Status |
| --- | --- | --- | --- |
| Syntax lexer, parser, AST/source model | `Sources/TmdSwift/Syntax/TmdParser.swift`, `Sources/TmdSwift/Syntax/Lexer.swift`, `Sources/TmdSwift/Syntax/Token.swift`, `Sources/TmdSwift/Syntax/Types.swift`, `Sources/TmdSwift/Syntax/TmdParseDiagnostics.swift` | `src/syntax/parser_core.ts`, `src/syntax/lexer.ts`, `src/syntax/tokens.ts`, `src/syntax/types.ts`, `src/syntax/diagnostics.ts` | Aligned |
| Measure validation and diagnostics | `Sources/TmdSwift/Validation/TmdMeasureChecker.swift`, `Sources/TmdSwift/Validation/TmdMeasureLexerFallback.swift`, `Sources/TmdSwift/Validation/TmdScoreValidator.swift` | `src/validation/measure_check.ts`, `src/validation/measure_lexer_fallback.ts`, `src/validation/score_validator.ts` | Aligned |
| Inspector facade, profiles, analyzers, localization | `Sources/TmdSwift/Analysis/` | `src/analysis/` | Aligned |
| Playback timeline and measure rendering | `Sources/TmdSwift/Playback/TmdMacroEvaluator.swift`, `Sources/TmdSwift/Playback/TmdMacroTransformations.swift`, `Sources/TmdSwift/Playback/TmdMeasureRenderer.swift`, `Sources/TmdSwift/Playback/TmdPlaybackRenderer.swift` | `src/playback/macro.ts`, `src/playback/macro_transformations.ts`, `src/playback/measure.ts`, `src/playback/renderer.ts` | Aligned |
| Source refactoring | `Sources/TmdSwift/Refactoring/TmdRefactor.swift`, `Sources/TmdSwift/Refactoring/TmdRefactorFormatting.swift`, `Sources/TmdSwift/Refactoring/TmdRefactorGrid.swift`, `Sources/TmdSwift/Refactoring/TmdRefactorTracks.swift`, `Sources/TmdSwift/Refactoring/TmdRefactorTranspose.swift` | `src/refactoring/refactor.ts`, `src/refactoring/format_helpers.ts`, `src/refactoring/grid_operations.ts`, `src/refactoring/track_operations.ts`, `src/refactoring/transpose.ts` | Aligned |
| Text I/O | `Sources/TmdSwift/IO/TmdTextIO.swift`, `Sources/TmdSwift/IO/TmdParserIO.swift` | `src/io/text_io.ts`, `src/io/parser_io.ts` | Aligned |
| Source formatting | `Sources/TmdSwift/Syntax/Format.swift` | `src/syntax/format.ts` | Aligned |
| Outline and visual presentation | `Sources/TmdSwift/Presentation/TmdOutline.swift`, `Sources/TmdSwift/Presentation/TmdTonalityVisualizer.swift` | `src/presentation/outline.ts`, `src/presentation/tonality_visualizer.ts` | Aligned |
| LSP protocol, completion, diagnostics | `Sources/TmdLSP/TmdLSP.swift`, `Sources/TmdLSP/TmdLSPCodec.swift`, `Sources/TmdLSP/TmdLSPCompletion.swift`, `Sources/TmdLSP/TmdLSPDiagnostics.swift`, `Sources/TmdLSP/TmdLSPTypes.swift` | `src/lsp/server.ts`, `src/lsp/codec.ts`, `src/lsp/completion.ts`, `src/lsp/diagnostics.ts`, `src/lsp/types.ts` | Aligned |
| Public responsibility entrypoints | SwiftPM target exports symbols directly | `src/*/index.ts` plus `src/index.ts` | Intentional language difference |

## Known asymmetries

- `Tmd-TS` has `src/domain/canon_gen.ts` and `src/domain/instruments.ts` (in Swift, instrument helpers live on `Sheet` in `Sources/TmdSwift/Syntax/Types.swift` and `Sources/TmdSwift/Syntax/MIDIInstrument.swift`).
- Swift keeps package/module names such as `TmdSwift` and `TmdSkill` for source
  and distribution compatibility. Both `TmdSwift` and `Tmd-TS` use canonical
  `Tmd`-prefixed public symbols across all layers.
- Swift currently uses directories inside `TmdSwift` for core boundaries while
  exporters (`TmdMIDI`, `TmdMusicXML`, `TmdLilyPond`, `TmdABC`, `TmdChordPro`,
  `TmdBraille`, `TmdReaper`, `TmdVocaloid`, `TmdUTAU`, `TmdAudio`) and `TmdLSP`
  live in dedicated SwiftPM targets.

## Boundary rules

- Syntax may depend on syntax types, lexer/token definitions, parser, and parse
  diagnostics only.
- Validation, analysis, playback, I/O, refactoring, formatting, and
  presentation must not be reintroduced into the syntax boundary.
- New public consumers should import the owning responsibility entrypoint and
  must not recreate a broad `core` barrel.
