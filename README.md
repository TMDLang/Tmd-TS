# Tmd-TS

A modern TypeScript/JavaScript implementation of the **TMD** (Timebase Mark Down) markup language parser, toolkit, and music notation exporter.

In memory of **Chen, Chih-Han / [aguai](https://github.com/aguai)** (阿怪, 1974–2019).

- Original project: [https://github.com/aguai/TMDLang](https://github.com/aguai/TMDLang)
- Swift Implementation & Samples: [https://github.com/TMDLang/TmdSwift](https://github.com/TMDLang/TmdSwift)

![screenshot.png](screenshot.png)

## The Markdown of Music

### Origins & Heritage

**TMD** (Timebase Mark Down) was originally conceived and designed by the celebrated Taiwanese songwriter, composer, and producer **Chen, Chih-Han / [aguai](https://github.com/aguai) (阿怪, 1974–2019)**, renowned for Mandopop classics such as A-Mei's 《三天三夜》 (*Three Days and Three Nights*).

### Designed for Songwriters, Not Print Shops nor Archives

Just as **Markdown** freed writers from the tedious tags of HTML, **TMD (Timebase Mark Down)** brings that same simplicity to music.

Existing musical formats serve other masters: **DAWs** treat music as audio engineering (faders, millisecond waveforms); **Engravers** (LilyPond, Sibelius) focus on printing layout; and **ABC notation** was designed decades ago to archive folk melodies. Their workflow assumes the song is already finished on paper. Furthermore, in multi-instrument arrangements, ABC quickly devolves into "rest hell" (`| z4 | z4 |`), cluttering the page and exhausting LLM context windows.

**TMD moves the songwriter's creative notebook directly onto the computer—making it effortlessly mutable and AI-ready.**

Conceived by pop composer **aguai (阿怪)**, TMD reflects how songwriters actually create: humming in movable-do, auditioning chords, testing vocal ranges, and rearranging song blocks on the fly. As a music-native Intermediate Representation (IR), it provides:

- **Zero "Rest Hell"**: Instruments enter with measure offsets (`verse:Guitar@|+4|{ ... }`). Unused tracks in a section are simply omitted—no filler tokens, no empty measures.
- **Modular Blocks & Road Maps**: Sections (`intro`, `verse`, `chorus`) are defined once and arranged into a playback execution flow (`-> intro -> verse -> chorus -> {?+1} -> chorus ->#`), enabling instant MIDI/audio preview of isolated sections or solo tracks.
- **Movable-Do (Jianpu) Thinking**: Melodies use numbered scale degrees (`1`–`7`). Transposing for a singer's vocal range is as simple as changing `?= C` to `?= Eb`—the melody notes never need rewriting.
- **Built-in Typechecking & Diagnostics**: `tmd check` verifies measure beat math like a compiler linter, while `tmd inspect` acts as a profiler—analyzing vocal tessitura (highest/lowest notes), song timeline ratios, and arrangement density.

Yet because of its structural purity, a `.tmd` score compiles cleanly to virtually any downstream format: **MIDI**, **REAPER (.rpp)**, **MusicXML**, **LilyPond (.ly / .pdf)**, **ABC**, **ChordPro**, **VOCALOID**, **UTAU**, or **WAV audio**.

### Divide and Conquer: Composable Music Architecture

Writing an entire multi-movement symphony, orchestral score, or intricate pop arrangement in a single monolithic file or prompt is impractical—human focus scatters, and AI context windows drift into hallucination. TMD inherently supports a **Divide-and-Conquer** architecture:

1. **Atomic Motifs & Sections**: Draft isolated thematic components (`intro`, `verse`, `chorus`, or motivic variations) independently without carrying the baggage of the rest of the score.
2. **Instant Sensory Feedback Loop**: Inspect vocal tessitura (`tmd inspect`), lint measure rhythm math (`tmd check`), and render preview audio in seconds directly from the command line or web studio. Tweak each part in a rapid, tight verification loop.
3. **Macro Integration**: Assemble verified sectional blocks into full-length arrangements or multi-movement suites using the conductor timeline (`-> intro -> verse -> motif_a -> chorus -> {?+1} -> chorus ->#`).

## Co-Composing with AI Using TMD

Because TMD is concise, human-readable, and free of syntactic noise, it serves as the ideal shared language between creators and Large Language Models (LLMs). While AI can generate valid LilyPond or MusicXML, those formats are hostile to human reading and editing. TMD balances expressive power with human readability, allowing creators and AI agents to pair-program music interactively.

### Equip Your AI Assistant in One Command

`Tmd-TS` comes with an official AI Agent skill (`SKILL.md`) covering TMD syntax, modular section chunking, human composition principles, motif development, and counterpoint rules. You can install it directly into your local AI environment (supporting Codex, Claude Code, Antigravity, and Gemini):

```bash
tmd --install-skills
```

### Model Context Protocol (MCP) Server Support

`Tmd-TS` comes with full **Model Context Protocol (MCP)** server integration for AI tools (Claude Desktop, Cursor, Gemini, and Antigravity):

```bash
# Register TMD MCP server into Claude Desktop, Cursor, and Gemini configurations
tmd --install-mcp

# Or start the MCP server directly via stdio
tmd --mcp
```

### What AI Can Help You Achieve

1. **Arranging Accompaniments from Melody**:
   Draft a vocal line or melody in TMD, then prompt the AI to generate supporting tracks (bass lines, rhythm guitar grooves, string pads, or drum patterns) with specific entry offsets (`@|+4|`).

2. **Motif Development & Continuation**:
   Define a short 2-bar or 4-bar melodic motif, and let the AI develop it into complete phrases through inversion, retrograde, rhythmic variations, or antecedent-consequent question-and-answer phrasing.

3. **Re-Harmonization & Chord Exploration**:
   Provide a melody and have the AI propose multiple chord progressions—from standard pop and rock progressions to modal jazz substitutions and Neo-Soul extensions (`[Cmaj7]`, `[Am7]`, `[Dm7-5]`).

4. **Macro Song Structuring & Modulations**:
   Compose core song blocks (`intro`, `verse`, `chorus`, `bridge`) and have the AI plan the overarching playback sequence (`-> intro -> A -> B -> {?+1} -> B ->#`), complete with key modulations and emotional dynamics.

5. **Textural Layering & Dynamic Contrast**:
   Use measure entry offsets (`@|0|`, `@|+4|`, `@|-1|`) to guide the AI in orchestrating gradual instrumentation build-ups, pick-up measures (anticipation notes), and dynamic contrast across sections.

6. **Style & Metric Variations**:
   Prompt the AI to adapt a 4/4 ballad into a 3/4 waltz, re-groove straight rhythms into syncopated Funk/R&B patterns, or add tuplet ornaments `(1 2 3)%(--)`.

See [`docs/AI-Co-Composing-With-TMD.md`](docs/AI-Co-Composing-With-TMD.md) for concrete workflows, step-by-step examples, and copy-pasteable prompt templates.

## Automated Arrangement & Macro Song Inspection

Beyond AI pair-programming, TMD provides automated tools tailored for the real-world songwriting and arranging process:

- **Song Inspector (`tmd inspect`)**: Analyzes vocal tessitura (exact highest/lowest notes and semitone span to verify whether a singer can hit the notes), song section timing (seconds and measures), chord vocabulary, and peak arrangement density. Supports `--json` for dashboards and automated pipelines.
- **Arrangement & Score Operations (`tmd refactor`)**: Perform common arranging chores in seconds—scale rhythm grids (`double-grid` / `halve-grid`), rename instruments or sections globally, extract isolated tracks, duplicate melodies with octave shifts, generate parallel diatonic harmonies, or inline repeating orders into a linear score.

## Online Web Studio

Experience TMD editing and playback directly in your browser without installing anything:

- **Interactive Editor**: Syntax highlighting for TMD metadata, numbered notation (`1`–`7`), octaves, chords (`[1]`, `[6m]`), and directives.
- **Multi-Format Export**: One-click download for Standard MIDI (`.mid`), REAPER (`.rpp`), MusicXML 4.0 (`.musicxml`), LilyPond (`.ly`), ABC Notation (`.abc`), VOCALOID (`.vsq`, `.vsqx`), UTAU (`.ust`), and WAV audio.
- **In-Browser Audio Player**: Real-time playback featuring Grand Piano (FluidR3 SoundFont), Multi-Track General MIDI with dynamic soundfont hot-swapping, Chiptune TinySynth, and Web MIDI hardware output.
- **Visual Song Inspector**: Built-in vocal tessitura analyzer and arrangement density overview.
- **Preset Scores**: Instant loading for classic tunes such as 《三天三夜》, 《Legacy》, and contrapuntal chamber works.

Run the web studio locally:

```bash
npm run web:dev
```

## Platform & Runtime Support

| Runtime / OS | Parser & AST (`tmd-ts`) | MIDI Exporter | MusicXML Exporter | LilyPond Exporter | ABC Exporter | REAPER (.rpp) | VOCALOID / UTAU | Audio Playback |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Node.js (macOS / Linux / Windows)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ *(CLI preview / system audio)* |
| **Browser (Web Studio / WebAssembly)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ *(FluidR3 GM / Web MIDI)* |

## Installation & Build

Requires Node.js `v20.0.0` or newer.

### Global Installation (CLI)

Install globally via `npm` to use the `tmd` command anywhere:

```bash
npm install -g tmdlang
```

Or execute directly without permanent installation via `npx`:

```bash
npx tmdlang <input-path> [options]
```

### Local Dependency (TypeScript / JavaScript Projects)

Add `tmdlang` to your project:

```bash
npm install tmdlang
```

### Build from Source

```bash
git clone https://github.com/TMDLang/Tmd-TS.git
cd Tmd-TS
npm install
npm run build
npm link    # Optional: creates global `tmd` symlink to local build
```

## CLI Usage (`tmd`)

The `tmd` CLI tool provides comprehensive score compilation, export, verification, inspection, and refactoring commands:

### Compilation, Export & Rendering

```bash
# Parse and print score summary
tmd sample.tmd -p

# Export to Standard MIDI file (.mid)
tmd sample.tmd -m score.mid

# Export to REAPER project (.rpp) with tempo, section markers, and color-coded tracks
tmd sample.tmd -r score.rpp

# Export to MusicXML 4.0 (for MuseScore, Sibelius, Finale, Dorico)
tmd sample.tmd -x score.musicxml

# Export to LilyPond (.ly) source file or render directly to PDF
tmd sample.tmd -l score.ly
tmd sample.tmd --pdf-output score.pdf

# Export to ABC notation (.abc) for web score sharing (abcjs)
tmd sample.tmd -a score.abc

# Export to ChordPro lead sheet (.cho / .chordpro)
tmd sample.tmd -c score.cho

# Export vocal track to VOCALOID (.vsq, .vsqx) or UTAU (.ust)
tmd sample.tmd --vsq-output score.vsq
tmd sample.tmd --vsqx-output score.vsqx
tmd sample.tmd -u score.ust

# Render to offline WAV audio preview
tmd sample.tmd -w score.wav

# Play preview through system audio player (afplay on macOS, aplay on Linux)
tmd sample.tmd --play
```

### Inspection, Diagnostics & AI Skills

```bash
# Check measure consistency (detect beat count discrepancies between bar lines '|')
tmd check sample.tmd

# Inspect song profile (vocal tessitura, pitch ranges, duration, chord vocabulary, density)
tmd inspect sample.tmd

# Inspect song profile in structured JSON format
tmd inspect sample.tmd --json

# Generate document symbol outline (sections and tracks with line/col offsets)
tmd outline sample.tmd

# Install TMD skill definition into local AI agent environments (Codex, Antigravity, Claude, etc.)
tmd --install-skills

# Register TMD Model Context Protocol (MCP) server for Claude Desktop, Cursor, and Gemini
tmd --install-mcp
```

### Formatting & Arrangement Operations

```bash
# Format score with standardized indentation, spacing, and preserved comments
tmd format sample.tmd -i

# Double grid resolution (<4*> -> <8*>) padding units with ties
tmd refactor double-grid sample.tmd -i

# Halve grid resolution (<8*> -> <4*>) collapsing ties
tmd refactor halve-grid sample.tmd -i

# Rename instrument or section globally across paragraphs and orders
tmd refactor rename-instrument sample.tmd --from "Piano" --to "Keys" -i
tmd refactor rename-section sample.tmd --from "verse" --to "A" -i

# Duplicate track with optional octave transposition
tmd refactor duplicate-track sample.tmd --source "Lead" --target "LeadOct" --octave 1 -i

# Generate parallel diatonic harmony for an instrument (e.g. 3rd above: interval 2)
tmd refactor generate-harmony sample.tmd --source "Vocal" --target "Harmony" --interval 2 -i

# Extract an instrument's tracks into an isolated score
tmd refactor extract-instrument sample.tmd --instrument "Guitar" -o guitar_only.tmd

# Unroll / inline playback orders into a linear score
tmd refactor inline-orders sample.tmd -i
```

## TypeScript / JavaScript Package Usage

Import `tmdlang` into your application:

```typescript
import {
  TmdParser,
  formatSummary,
  TMDMIDIGenerator,
  TMDReaperGenerator,
  TMDMusicXMLGenerator,
  TMDLilyPondGenerator,
  TMDABCGenerator,
  TMDChordProGenerator,
  TMDVSQGenerator,
  TMDVSQXGenerator,
  TMDUSTGenerator,
  TMDSongInspector,
  TMDMeasureChecker,
  TMDRefactor,
  TMDWAVRenderer,
} from "tmdlang";

const scoreText = `
::SCORE::
** My Song **
!= 120
?= C
<4/4>

intro:Piano@|0|{
  <4*>
  1 2 3 4
}
-> intro ->#
`;

// 1. Parse TMD score
const sheet = TmdParser.parse(scoreText);
if (!sheet) {
  throw new Error("Failed to parse TMD score");
}

// 2. Summary & Diagnostics
console.log(formatSummary(sheet));
const profile = TMDSongInspector.inspect(sheet);
console.log(`Vocal range: ${profile.lowestNote?.name} to ${profile.highestNote?.name}`);

const issues = TMDMeasureChecker.check(scoreText);
console.log(`Measure issues: ${issues.length}`);

// 3. Exporters
const midiBytes: Uint8Array = TMDMIDIGenerator.generateMIDI(sheet);
const rppProject: string = TMDReaperGenerator.generateRPP(sheet);
const musicXML: string = TMDMusicXMLGenerator.generateMusicXML(sheet);
const lilyPond: string = TMDLilyPondGenerator.generateLilyPond(sheet);
const abcScore: string = TMDABCGenerator.generateABC(sheet);
const chordPro: string = TMDChordProGenerator.generateChordPro(sheet);
const vsqXml: string = TMDVSQXGenerator.generateVSQX(sheet);
const ustText: string = TMDUSTGenerator.generateUST(sheet);
const wavBytes: Uint8Array = TMDWAVRenderer.renderWAV(sheet);
```

## The Tmd-TS Implementation

**Tmd-TS** re-implements the original parser into a clean, modern TypeScript architecture featuring:
- A two-stage Lexer + TokenParser pipeline with accurate character and line ranges.
- Normalized musical AST structures (`Beat`, `Note`, `Unit`, `Section`, `Paragraph`, `Order`, `Sheet`).
- Complete AST-to-TMD serialization and round-trip formatter.
- Multi-format exporters (MIDI, REAPER, MusicXML, LilyPond, ABC, ChordPro, VOCALOID, UTAU, WAV).
- Built-in Model Context Protocol (MCP) server for deep AI IDE and agent integration.
- Full browser runtime compatibility for the online Web Studio.

## Editor Support

You can edit TMD files with syntax highlighting, snippets, and in-editor diagnostics using Visual Studio Code:

### Visual Studio Code Extension

The official VS Code extension is maintained in the [**TmdSwift repository (`editor/vscode`)**](https://github.com/TMDLang/TmdSwift/tree/main/editor/vscode). 

Because the CLI interfaces and command flags of `TmdSwift` and `Tmd-TS` are designed to be interchangeable, this extension **works seamlessly with `Tmd-TS`**! Once you install `tmdlang` globally (`npm install -g tmdlang`), the extension will automatically pick up your `tmd` CLI for diagnostics, song inspection, formatting, and exports:

- **Syntax Highlighting & Snippets**: Full grammar for TMD metadata, tracks, numbered notation, chords, tuplets, and arrangement flow.
- **Interactive Web MIDI Player**: Built-in Web MIDI player panel with SoundFont selection, play/stop controls, and position scrub bar.
- **Outline & Breadcrumb Navigation**: Explorer sidebar tree view displaying all sections, track counts, and execution orders with inline section/track play buttons.
- **CodeLens In-Editor Audition**: Click `▶ Play Section` or `▶ Play Track` directly above paragraph headers to preview individual sections or solo instruments on the fly.
- **Measure Consistency Diagnostics**: Real-time linter checking beat count math against time signatures on save and as you type, reporting issues in the Problems panel.
- **Song Inspector**: Run `TMD: Inspect Song Profile` to display vocal tessitura, pitch ranges, duration, chord vocabulary, and arrangement density directly in an Output Channel.
- **In-Editor Arrangement Operations**: Interactive commands to double/halve rhythm resolution, duplicate tracks with octave shifts, generate natural harmonies, rename instruments/sections globally, or inline orders.
- **GitHub Copilot Chat & LM Tools**: Chat participant `@tmd` (`/check`, `/inspect`, `/compose`, `/fix`, `/explain`) and language model tools (`tmd_check`, `tmd_inspect`, `tmd_format`, `tmd_get_specification`).
- **Export & Render Commands**: Export to MIDI, REAPER, MusicXML, ABC, LilyPond, PDF, VOCALOID (.vsq, .vsqx), UTAU (.ust), or offline WAV audio.

To install the extension locally from source:
```bash
git clone https://github.com/TMDLang/TmdSwift.git
ln -s "$(pwd)/TmdSwift/editor/vscode" ~/.vscode/extensions/tmd-vscode
```

## Documentation & Language Specification

- Frequently Asked Questions: [`docs/FAQ.md`](docs/FAQ.md)
- Formal Language Specification (English): [`docs/TMD-Language-Specification.en.md`](docs/TMD-Language-Specification.en.md)
- Formal Language Specification (Traditional Chinese): [`docs/TMD-Language-Specification.zh-TW.md`](docs/TMD-Language-Specification.zh-TW.md)
- AI Co-Composing Guide: [`docs/AI-Co-Composing-With-TMD.md`](docs/AI-Co-Composing-With-TMD.md)

Historical draft notes and original design concepts are preserved in [`docs/Band-Score.syntax.zh_TW.md`](docs/Band-Score.syntax.zh_TW.md).

## License

MIT License
