# TMD Architecture Parity Matrix

This matrix is the source of truth for the responsibility boundaries shared by
the Swift and TypeScript implementations.

| Responsibility | TmdSwift | Tmd-TS | Status |
| --- | --- | --- | --- |
| Syntax lexer, parser, AST/source model | `Sources/TmdSwift/Syntax/TmdParser.swift`, `Types.swift` | `src/syntax/parser.ts`, `types.ts` | Aligned |
| Measure validation and diagnostics | `Sources/TmdSwift/Validation/TmdMeasureChecker.swift` | `src/validation/measure_check.ts` | Aligned |
| Inspector facade, profiles, analyzers, localization | `Sources/TmdSwift/Analysis/` | `src/analysis/` | Aligned |
| Playback timeline and measure rendering | `Sources/TmdSwift/Playback/` | `src/playback/` | Aligned |
| Source refactoring | `Sources/TmdSwift/Refactoring/TmdRefactor.swift` | `src/refactoring/refactor.ts` | Aligned |
| Text I/O | `Sources/TmdSwift/IO/TmdTextIO.swift` | `src/io/text_io.ts` | Aligned |
| Source formatting | `Sources/TmdSwift/Syntax/Format.swift` | `src/syntax/format.ts` | Aligned |
| Outline and visual presentation | `Sources/TmdSwift/Presentation/` | `src/presentation/` | Aligned |
| Public responsibility entrypoints | SwiftPM target exports symbols directly | `src/*/index.ts` plus `src/index.ts` | Intentional language difference |

## Known asymmetries

- `Tmd-TS` has `src/domain/canon_gen.ts` and `src/domain/instruments.ts`.
  These are domain capabilities without a current Swift counterpart; they are
  not placed in either implementation's syntax core.
- Swift keeps package/module names such as `TmdSwift` and `TmdSkill` for source
  and distribution compatibility. Canonical public symbols use the `Tmd`
  prefix; migrated deprecated aliases have been removed. Tmd-TS still uses its
  legacy `TMD` public symbols while issue #33 tracks the coordinated migration.
- Swift currently uses directories inside one SwiftPM target. Splitting them
  into separate targets is intentionally deferred until dependency rules are
  stable.

## Boundary rules

- Syntax may depend on syntax types, lexer/token definitions, parser, and parse
  diagnostics only.
- Validation, analysis, playback, I/O, refactoring, formatting, and
  presentation must not be reintroduced into the syntax boundary.
- New public consumers should import the owning responsibility entrypoint and
  must not recreate a broad `core` barrel.
