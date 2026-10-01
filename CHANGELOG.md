# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
