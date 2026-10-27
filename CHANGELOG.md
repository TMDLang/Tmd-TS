# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.6] - 2026-10-27

### Added
- Expanded the AI TMD skill with simultaneous multi-note syntax, prototype and macro rules, checker workflows, and CLI/MCP guidance.

### Changed
- Clarified the distinction between `?=` sounding movable-do context and `key=` printed key-signature metadata.
- Documented the supported fixed-pitch entry attribute `[pitchMode=fixed]` and current refactoring／inspection workflows.

## [0.2.5] - 2026-10-11

### Added
- **Music Braille Exporter (`TmdBrailleGenerator`)**:
  - Added 6-dot Unicode Braille (`.brl`) and North American Braille ASCII (`.brf`) export in `part-by-part` and `bar-over-bar` layouts across CLI, MCP, and Web Studio preview modal.
- **Unified Score Validator (`TmdScoreValidator`) & Semantic Linter**:
  - Unified syntax and semantic validation rules across CLI `tmd check` (with batch directory scan and `--json` / `--markdown` output), Web Studio Problems Panel, AI Validator, and MCP servers.
- **MCP & WebMCP Alignment**:
  - Extracted shared `TmdMcpCore` handlers for Node MCP and WebMCP, auto-loaded TMD Skill resources/prompts, and aligned tool schemas.

### Changed
- **Single Source of Truth (SSOT) & TmdSwift Parity**:
  - Consolidated `prepareSheetForExport`, monophonic vocal note reduction (`extractVocalNoteItems`), extended chord quality intervals (`chordQualityIntervals`), MIDI channel/pan assignment, and shared AST note transformation helpers.
  - Aligned LSP completion (15-key major/minor diatonic chords, prefix filtering, auto-closed `}` handling), CLI vocal `--instrument` filtering, and `ARCHITECTURE_PARITY.md` with `TmdSwift`.

### Fixed
- **Core, Playback, Validation & Exporter Correctness**:
  - Replaced `indexOf` in `TmdLexer.tokenizeWithRanges` with single-pass offset tracking to prevent token range corruption on repeated tokens.
  - Fixed multi-note `UnitGroup` formatting (`formatUnitGroup`), `[pitchMode=fixed]` handling across `TmdRefactor`, `TmdMeasureLexerFallback`, and `TmdSongTonalityAnalyzer`, and CJK instrument name normalization in `TmdScoreValidator`.
  - Fixed `lilyPondKey("bm")` flat false positive, MusicXML erroneous `<chord/>` on simultaneous chord+note events, MIDI channel `> 15` wrap-around to Drum Ch.9, VSQ/VSQX non-4/4 `preMeasure`, ChordPro section fallback, and `PercussiveOrgan` classification.

## [0.2.3] - 2026-10-05

### Changed
- **Modular Architecture Refactoring**:
  - Restructured monolithic core into dedicated, single-responsibility subsystems: `syntax`, `playback`, `analysis`, `refactor`, `mcp`, and `lsp`.
  - Decoupled lexer fallback from parser and measure checkers.
  - Consolidated canonical pitch logic and timeline event ordering.
  - Normalized public class and type names to standard camel-cased `Tmd*` / `Mcp*` conventions (e.g. `TmdParser`, `TmdSkill`, `TmdVersion`, `TmdMCPServer`).
  - Aligned internal terminology and architecture parity with TmdSwift.

### Added
- **CLI Flags Alignment**:
  - Added `-s, --section` and `-i, --instrument` command-line flags to align with TmdSwift CLI behavior.
- **Web Studio & LSP Enhancements**:
  - Support loading Gist scores directly via URL query parameter (`?gist=<gist_id>`).
  - Added chord completion support for common secondary dominants and modal interchange chords in LSP.

### Fixed
- **Core Timeline and Playback Correctness**:
  - Preserved directives, grid semantics, and entry metadata in `TmdRefactor.inlineOrders`.
  - Fixed fixed-pitch state propagation to trailing directives in `TmdPlaybackRenderer`.
  - Preserved per-event playback states when `TmdMeasureRenderer` pads rests and summarizes measures.
  - Made inspector report strings fully localizable.

## [0.2.2] - 2026-10-01

### Changed
- Renamed npm package to `tmdlang` (while preserving `tmd` CLI executable).
- Updated brand icon mark to `{♪}` in Web Studio.

### Added
- **Web Studio TMD Symbol Palette**:
  - Touch/click friendly symbol palette bar for tablets and mobile devices with categorized tabs for chords, notes, dynamics, meter, and structure tags.

### Fixed
- Fixed unspaced note runs splitting when doubling grid resolution in score refactoring.
- Raised canon variation limit and bounded canon generator dimensions.

## [0.2.1] - 2026-09-28

### Changed
- Aligned macro parsing and playback semantics with the current TMD specification.
- Explicit `key=` directives now remain notation metadata and do not transpose sounding pitches.
- Prototype-only macro sources, strict macro arguments, canon duration bounds, and canonical entry-offset syntax are enforced.
- Legacy inline fixed-pitch directives are rejected in favor of `[pitchMode=fixed]`.

### Added
- **REAPER Project (.rpp) Exporter**:
  - Implemented `TMDReaperGenerator.generateRPP(sheet)` to export complete, self-contained REAPER `.rpp` projects.
  - Generates multi-track layout with instrument names, automatic stereo panning (`VOLPAN` for `-L`/`-R`), and instrument family color-coding (`PEAKCOL`).
  - Converts dynamic tempo changes (`{!=120}`, `{!+10}`) and time signature directives into exact timeline seconds on the Master Tempo Envelope (`<TEMPOENVEX`).
  - Generates section markers (`MARKER`) corresponding to song order sections (`Intro`, `Verse`, `Chorus`, etc.).
  - Serializes embedded inline MIDI items (`<SOURCE MIDI HASDATA 1 960 QN>`) with note pitch, velocity, duration, and General MIDI percussion.
  - Added CLI flags `-r, --reaper-output PATH` and `--rpp-output PATH`.
  - Added `reaper` and `rpp` target format support to Model Context Protocol (MCP) tool `convert_tmd`.
- **Online Web Studio (GitHub Pages)**:
  - In-browser TMD editor with full syntax highlighting powered by CodeMirror 6.
  - Multi-format download menu for Standard MIDI (`.mid`), MusicXML (`.musicxml`), LilyPond (`.ly`), ABC Notation (`.abc`), and WAV audio.
  - Floating mini audio player bar matching `zago`'s WebAssembly edition, supporting Grand Piano (FluidR3 SoundFont), Chiptune TinySynth, and Web MIDI hardware output.
  - Preset song library including 《三天三夜》, 《少年》, and contrapuntal canons.
  - Automated GitHub Pages deployment workflow (`.github/workflows/deploy-pages.yml`).
  - Added root npm scripts `web:dev` and `web:build`.

### Added
- Initial public TypeScript release of `tmd-ts`.
- Two-stage Lexer and TokenParser pipeline reproducing the complete TMD specification.
- Normalized musical AST structures (`Beat`, `Note`, `Unit`, `Section`, `Paragraph`, `Order`, `Sheet`).
- Formatter to serialize AST back to standard TMD syntax.
- Playback timeline calculation engine (`TMDPlaybackRenderer`).
- Exporters:
  - Multi-track Standard MIDI file exporter (`TMDMIDIGenerator`).
  - W3C MusicXML 4.0 Partwise exporter (`TMDMusicXMLGenerator`).
  - LilyPond source and PDF compiler exporter (`TMDLilyPondGenerator`).
  - ABC Notation v2.1+ exporter (`TMDABCGenerator`).
  - Portable fallback 16-bit stereo PCM WAV synthesizer (pure sine wave) (`TMDWAVRenderer`).
- Command-line interface `tmd` executable with options for parsing, export, playback, and AI agent skill installation (`--install-skills`).
- AI Agent Skill provider (`TmdSkill`) compatible with Codex, Claude Code, Antigravity, and Gemini agent directories.
- Full Vitest test suite and GitHub Actions CI workflow.
