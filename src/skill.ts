import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export class TmdSkill {
  static readonly skillName = "tmd";
  static readonly skillMarkdown = `---
name: tmd
description: >-
  Comprehensive guide and reference for writing, parsing, checking, and exporting music scores using TMD (Timebase Mark Down).
  Use this skill whenever you need to create, edit, debug, verify measure consistency, or generate .tmd music scores, lead sheets, chord progressions,
  numbered musical notation (jianpu), multi-track arrangements, or compile and validate them with the tmd CLI tool and MCP servers.
---

# TMD (Timebase Mark Down) Music Score Specification & Guide

TMD is a plain-text musical notation DSL designed by Taiwanese composer and music producer Chen, Chih-Han / aguai (阿怪, 1974–2019, composer of A-Mei's "Three Days and Three Nights").
It allows musicians and arrangers to describe multi-track songs, numbered musical notation (jianpu / movable-do solfege), chord progressions, tuplets, and playback arrangements in a concise, human-readable text format.

The \`tmd\` CLI tool compiles \`.tmd\` files, verifies measure consistency (\`tmd check\`), and can export them to MIDI, MusicXML, LilyPond (.ly / PDF), ABC notation (.abc), REAPER (.rpp), ChordPro (.cho), or render offline audio to WAV.
When running under Model Context Protocol (MCP) or Web Studio, AI agents have access to \`check_tmd\` / \`checkTmd\` tools to automatically inspect and diagnose measure beat mismatches and execution order issues.

---

## 1. Minimal File Structure

Every TMD score MUST start with \`::SCORE::\`.
A minimal valid TMD file consists of:

\`\`\`tmd
::SCORE::
** Song Title **
!= 120
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    1 2 3 4
}

-> intro ->#
\`\`\`

### Essential Components:
1. **Header**: \`::SCORE::\` (must be at the beginning of the score).
2. **Title**: \`** Title **\` (enclosed in double asterisks).
3. **Tempo**: \`!= 120\` (in BPM, supports integer or decimals like \`!= 120.5\`).
4. **Movable-do base**: \`?= C\` (sets the pitch of numbered degree \`1\`; it is not a major/minor declaration).
5. **Explicit tonality**: \`key= Bm\` or \`Key= C\` (stores the actual declared key and mode separately from \`?=\`).
6. **Time Signature**: \`<4/4>\` (numerator/denominator, e.g. \`<3/4>\`, \`<6/8>\`).
7. **Paragraphs / Instrument Tracks**: \`name:instrument@|offset|{ ... }\`.
8. **Playback Flow**: \`-> section1 -> section2 ->#\` (must start with \`->\` and terminate with \`->#\`).

---

## 2. Metadata and Comments

### Comments
Block comments use \`/* ... */\` and can span multiple lines:
\`\`\`tmd
/* This is a comment. It will be ignored by the parser. */
\`\`\`

### Song Metadata Credits
TMD supports credit shorthand using \`~ "..."\` and named metadata using \`=~:__KEY__= "..."\`:
\`\`\`tmd
~ "lyrics: aguai"
~ "composer: aguai"
~ "arranger: Martin Tang"
=~:__ALBUM__= "May 1998"
\`\`\`
Recognized credit prefix mappings for \`~\` include:
- Chinese prefixes \`詞：\`, \`曲：\`, \`編：\` or direct keys.

---

## 3. Paragraphs and Instrument Tracks

Syntax:
\`\`\`tmd
section_name:instrument_name@|start_measure|{
    <note_length*>
    music_units...
}
\`\`\`

- **\`section_name\`**: Logical section name (e.g. \`intro\`, \`verse\`, \`chorus\`, \`A\`, \`B\`, \`bridge\`, \`ending\`).
- **\`instrument_name\`**: Track/instrument label (e.g. \`Piano\`, \`Guitar\`, \`Bass\`, \`Drums\`, \`Vocal\`, \`CHORD\`, \`Strings\`).
  Common names are mapped to General MIDI instruments automatically (e.g., \`Piano\` -> Grand Piano, \`Guitar\` -> Steel String Guitar, \`Drums\` / \`Groove\` -> Channel 10 Drum kit).
- **\`start_measure\`**: Entry measure offset inside \`|...|\` (e.g. \`@|0|\`, \`@|+4|\`, \`@|-1|\`).
  - \`@|0|\` or \`@|+0|\`: Enters at the beginning of the section.
  - \`@|+4|\`: Enters 4 measures after the section begins.
  - \`@|-1|\`: Enters 1 measure before the section begins (pick-up / anticipation measure).
  - Can also omit pipes: \`@0\` or \`@|0|\`.

Multiple tracks can share the same section name:
\`\`\`tmd
intro:CHORD@|0|{
    <2*>
    [1] - [4] -
}

intro:Piano@|0|{
    <4*>
    1 2 3 4
}
\`\`\`

---

## 4. Sections and Rhythm Grid

Inside a paragraph, music is organized into sections defined by a base subdivision:
\`\`\`tmd
<note_length*>
\`\`\`
Where \`note_length\` defines how many notes of this unit equal a whole note (semibreve):
- \`<1*>\`: Whole notes
- \`<2*>\`: Half notes
- \`<4*>\`: Quarter notes
- \`<8*>\`: Eighth notes
- \`<16*>\`: Sixteenth notes

Bar line dividers \`|\` are optional visual separators for readability and are ignored by the parser:
\`\`\`tmd
<4*>
| 1 2 3 4 | 5 - 5 - |
\`\`\`

---

## 5. Musical Units

### 5.1 Numbered Musical Notation (Jianpu / Movable-Do Solfege)
Numbered scale degrees:
- \`1\`: Do
- \`2\`: Re
- \`3\`: Mi
- \`4\`: Fa
- \`5\`: Sol
- \`6\`: La
- \`7\`: Ti

### 5.2 Accidentals
- \`'\` (single quote): Sharp (♯)
- \`,\` (comma): Flat (♭)

Examples: \`1'\` (C# / Sharp Do), \`7,\` (B♭ / Flat Ti).

### 5.3 Octave Displacements
- \`^\`: Higher octave. Multiple \`^\` raise by multiple octaves (e.g., \`1^^\`).
- \`_\`: Lower octave. Multiple \`_\` lower by multiple octaves (e.g., \`1__\`).

> **CRITICAL RULE**: Always write the accidental FIRST, then the octave displacement:
> - Correct: \`1'^\` (Sharp Do, one octave up), \`7,_\` (Flat Ti, one octave down).
> - Incorrect: \`1^'\` or \`7_,\` (syntax error).

### 5.4 Rests
- \`0\`: Rest of 1 base note length.
- \`0 - - -\`: Whole-measure rest in \`<4*>\` (or \`0---\`).

### 5.5 Ties and Duration Extensions
- \`-\`: Extends the previous note, chord, or rest by 1 base unit length.
Example in \`<4*>\` (quarter-note grid):
\`\`\`tmd
1 -        /* Half note (2 beats) */
1 - - -    /* Whole note (4 beats) */
\`\`\`

### 5.6 Chords
Chords are wrapped in square brackets \`[...]\`.
Can be written as:
- Letter roots: \`[C]\`, \`[Cmaj7]\`, \`[Am]\`, \`[Am7]\`, \`[F]\`, \`[G7]\`, \`[Bb]\`, \`[D7#9]\`, \`[Dm7-5]\`, \`[Csus4]\`
- Movable-do numbered chord degrees: \`[1]\` (I), \`[6m]\` (vi), \`[4]\` (IV), \`[5]\` (V), \`[2m7]\` (ii7)
- Chords can also take octaves: \`[6_m]\` (lower octave minor sixth), \`[1^]\`
- Chords can be sustained with ties: \`[Cmaj7] - - -\`

### 5.7 Percussion & Drums (Channel 10)
Percussion tracks (\`Drums\`, \`Percussion\`, \`Groove\`) send MIDI events to standard General MIDI Channel 10:
- Standard Drum Hits:
  - \`B\` / \`D\`: Bass Drum (Kick Drum 1, MIDI pitch 36).
  - \`S\`: Snare Drum (Acoustic Snare, MIDI pitch 38).
  - \`X\`: Closed Hi-Hat (MIDI pitch 42).
  - \`O\`: Open Hi-Hat (MIDI pitch 46).
  - \`T\`: Low-Mid Tom (MIDI pitch 45).
  - \`C\`: Crash Cymbal 1 (MIDI pitch 49).
- Lowercase letters (\`b\`, \`d\`, \`s\`, \`x\`, \`o\`, \`t\`, \`c\`) represent lighter velocity / ghost hits.
Example:
\`\`\`tmd
intro:Drums@|0|{
    <16*>
    X-X- S-X- X-X- S-X-
    B-0- 0-0- B-B- 0-0-
}
\`\`\`

> **Note on Timpani vs. Drum Kit**:
> Timpani (Program 47) is a **pitched melodic instrument**, NOT General MIDI Channel 10 percussion.
> - Acoustic Timpani kettle drums operate in the pitch range \`D2\` to \`A3\` (MIDI 38–57).
> - In standard TMD soundfonts (e.g., Apple DLS \`gs_instruments.dls\`), Timpani produces its deepest, resonant orchestral thunder ("咚！咚！咚！") when written in the lower octave: \`2__\` (D2, MIDI 38) to \`1_\` (C3, MIDI 48).
> - Since Timpani is tuned to specific harmonic fundamental pitches, use \`{?= fixed}\` inside Timpani sections so global order transpositions (e.g. \`-> {?+3} -> C\`) do not shift kettle pitches unexpectedly.

### 5.8 Tuplets and Rhythmic Groupings
Syntax:
\`\`\`tmd
(units...)%(dashes)
\`\`\`
The number of dashes in \`%(...)\` defines how many base beats the group occupies:
- \`(1 2 3)%(--)\`: Triplet fitting 3 notes into the time of 2 base beats.
- \`(7, 1)%(--)\`: 2 notes fitting into 2 base beats.
- \`(1 2 3 4 5)%(--)\`: 5-tuplet over 2 base beats.

---

## 6. Section Directives (Mid-Score & Local Track Changes)

You can place inline directives anywhere inside a section between notes:
- \`{!= 140}\`: Absolute tempo change (BPM).
- \`{!+ 10}\`: Relative tempo change (+10 BPM).
- \`{?= D}\`: Absolute movable-do base change to D.
- \`{key= Bm}\`: Explicit tonality change to B minor, independent from movable-do playback context.
- \`{?+ 2}\`: Relative key transposition up 2 semitones.
- \`{?- 2}\`: Relative key transposition down 2 semitones.
- \`{?= fixed}\` (or \`{? fixed}\`): Forces **Fixed Pitch** for this track section (locks \`keyOffset = 0\`, immune to song-level playback transpositions like \`-> {?+3} -> ...\`). Ideal for Timpani, Sound FX, or non-transposing tracks.
- \`{ppp}\`, \`{pp}\`, \`{p}\`, \`{mp}\`, \`{mf}\`, \`{f}\`, \`{ff}\`, \`{fff}\`: Set playback velocity and emit engraved dynamic marks.
- \`{<3/4>}\`: Time signature change to 3/4; place it at a measure boundary. Tempo and dynamics may still change within a measure.

Example:
\`\`\`tmd
<4*>
1 2 {!=140} 3 4
\`\`\`

---

## 7. Arrangement and Playback Orders

The playback arrangement directs the performance flow and modulations from beginning to end:
\`\`\`tmd
-> intro -> A -> B -> {?+3} -> C -> ending ->#
\`\`\`

Rules:
- Starts with \`->\`.
- References section names defined in paragraphs: \`-> intro -> verse -> chorus\`.
- Supports movable-do playback transposition:
  - \`{?+3}\`: Transpose playback up 3 semitones.
  - \`{?-2}\`: Transpose playback down 2 semitones.
  - \`{?=G}\`: Change the movable-do playback base to G.
  - \`{key= Bm}\`: Declare an explicit B-minor tonality change.
- Supports S-Expression macro combinators:
  - \`(play <Theme> <Instrument>)\`: Bind abstract theme to an instrument track.
  - \`(loop <Theme> <Instrument> <times>)\`: Repeat theme sequentially.
  - \`(canon <Theme> (<Inst1> <Inst2> ...) <bar_offset>)\`: Auto-stagger voices in strict canon.
  - \`(layer <expr1> <expr2> ...)\`: Concurrently play multiple voices/sections.
  - \`(seq <expr1> <expr2> ...)\`: Sequentially chain multiple expressions.
  - \`(vary <Theme> <modifiers...>)\`: Transform motives with pitch transposition (\`+7\`), inversion (\`flip\`), retrograde (\`reverse\`), or modal shift (\`minor\`/\`major\`).
- Ends with \`->#\` (terminator).

---

## 8. Complete Working Example

\`\`\`tmd
::SCORE::
** Sample Track **
!= 133
?= A'
<4/4>

intro:CHORD@|0|{
    <2*>
    |[1] - | - [7,] |
    |[1] - | - [7,] |
    <4*>
    [1] - - - [7,] - - -
}

intro:Chorus-1@|+4|{
    <16*>
    1_- 1_ - 1_ - - 1_ - 1_ - 1_ 1_ - - -
    1_- 1_ - 1_ - - 1_ - 1_ - 1_ 1_ - - -
}

intro:Guitar@|0|{
    <16*>
    (7,1)%(--) 1 (7,1)%(--) 1 (7,1)%(--) 1 (7,1)%(--) 6 7, 6 7, 6
    (7,1)%(--) 1 (7,1)%(--) 1 (7,1)%(--) 1 (7,1)%(--) 6 7, 6 7, 6
}

A:CHORD@|0|{
    <2*>
    |[1] - | - - |
    |[5] - | - - |
    |[6m] -| [5] -|
    |[4] - | [5] - |
}

-> intro -> A -> {?-3} -> A -> {?+3} -> ending ->#
\`\`\`

---

## 9. Using the \`tmd\` CLI Tool

Compile and verify TMD files:
\`\`\`bash
# 1. Parse and print score summary
tmd score.tmd -p

# 2. Export to Standard MIDI file (.mid)
tmd score.tmd -m score.mid

# 3. Export to MusicXML (.musicxml) for MuseScore/Sibelius
tmd score.tmd -x score.musicxml

# 4. Export to LilyPond (.ly) or render PDF
tmd score.tmd -l score.ly
tmd score.tmd --pdf-output score.pdf

# 5. Export to ABC notation (.abc) for web sheets (abcjs)
tmd score.tmd -a score.abc

# 6. Export to ChordPro (.cho) lead sheet
tmd score.tmd -c score.cho

# 7. Render offline WAV audio (macOS DLS / SoundFont)
tmd score.tmd -w output.wav

# 8. Export vocal track to VOCALOID (.vsq, .vsqx)
tmd score.tmd --vsq-output vocal.vsq --singer Miku
tmd score.tmd --vsqx-output vocal.vsqx --singer Miku

# 9. Export vocal track to UTAU / OpenUtau (.ust)
tmd score.tmd -u vocal.ust

# 10. Check measure consistency and beat accuracy (Essential for AI self-verification)
tmd check score.tmd

# 11. Format document layout and indentation
tmd format score.tmd -i

# 12. Install this skill into AI agent directories
tmd --install-skills
\`\`\`

---

## 10. AI Composition Methodology: Modular Section-Based Chunking

Unlike unstructured audio waveforms (e.g. Suno/Udio) or monolithic continuous notation (e.g. monolithic ABC/MusicXML files), TMD is built on **Modular Section-Based Chunking**. This provides critical advantages for AI-assisted music generation:

1. **Local Context Encapsulation**:
   - Each section (\`intro\`, \`verse\`, \`chorus\`, \`A1\`, \`B1\`) is an isolated, self-contained block.
   - When generating, editing, or orchestrating a specific section (e.g. expanding an 8-measure Chorus to 13 orchestral tracks), the AI only needs to focus on that specific section block, avoiding attention decay across long song timelines.

2. **Error Isolation (No Measure Clock Drift)**:
   - Rhythmic errors or miscalculations within one paragraph block are strictly localized. They do not cascade or offset measure alignment across subsequent sections.
   - The AI can inspect compiler diagnostic messages (e.g. \`tmd score.tmd -p\`) and fix a single paragraph in isolation.

3. **Progressive Layering and Orchestration**:
   - Start with a single lead track (\`verse:Vocal@|0|\`), then layer accompanying instruments into the same section (\`verse:CHORD@|0|\`, \`verse:Bass@|0|\`, \`verse:Drums@|+2|\`) without altering the original melody.

---

## 11. Human Composition Principles & AI Co-Composing Patterns

When assisting human composers or generating new arrangements, follow genuine **Human Composition Principles** rather than random note generation or style-collage diffusion:

### 1. Motif-Driven Architecture
- **Establish a Core Motif**: Begin by identifying or asking for the central melodic or rhythmic motif (usually 2 to 4 bars).
- **Develop, Don't Discard**: Carry the motif across sections through genuine compositional techniques:
  - *Sequence / Transposition*: Repeat the motif on higher or lower scale degrees.
  - *Inversion*: Flip interval directions.
  - *Augmentation & Diminution*: Double or halve rhythmic durations for contrasting sections.
  - *Antecedent-Consequent Phrasing*: Frame phrases as question-and-answer pairs resolving on tonic or dominant degrees.

### 2. Voice Leading and Texture Balance
- Maintain clear roles across tracks:
  - **Melody / Lead**: Clear vocal line or solo instrument.
  - **Counter-Melody**: Secondary line filling pauses in the main melody.
  - **Harmonic Pads & Fillers**: Sustained chords or arpeggiated movement.
  - **Bass Line**: Root notes, inversions, and step-wise walking notes anchoring the harmony.
  - **Rhythm Section**: Metric groove establishing tempo and dynamic drive.

### 3. Practical AI Co-Composing Patterns
AI agents should assist human composers through these distinct collaborative patterns:
- **Pattern A: Lead-to-Arrangement**: Given a human melody, generate multi-track accompaniment (chords, bassline, percussion).
- **Pattern B: Motif Continuation**: Given a 2-bar or 4-bar human idea, develop it into a complete structured A/B section.
- **Pattern C: Re-Harmonization**: Propose alternative chord progressions (e.g., standard pop, secondary dominants, modal mixture, or jazz extensions like \`[Cmaj9]\`, \`[Am7]\`, \`[6m]\`, \`[2m7-5]\`).
- **Pattern D: Style Transformation**: Convert a pop/folk lead sheet into multi-part strings, big band brass, or a full symphony orchestra.
- **Pattern E: Automated Self-Verification & Ear Check Loop**:
  1. **Measure Consistency Check**:
     - **CLI**: Run \`tmd check <file.tmd>\`.
     - **MCP Tool**: Call \`check_tmd({ text })\` or \`checkTmd({ text })\`.
     - **Web Studio**: Check the Problems Panel (\`#problems-panel\`, \`#problems-list\`).
     If any measure length discrepancy is reported (e.g. \`verse:Piano (line 12, measure 3): Expected 4 units, found 3 units (-1 units)\` or undefined section in playback order), immediately inspect the line and adjust rhythm units, ties \`-\`, or rests \`0\` until all measures pass.
  2. **Auto-Formatting**: Run \`tmd format <file.tmd> -i\` to clean up block indentation and spacing.
  3. **Syntax & Structure Verification**: Run \`tmd <file.tmd> -p\` (or MCP \`parse_tmd\`) to verify execution flow and track summary.
  4. **Audio Ear Check**: Render audio via \`tmd <file.tmd> -w preview.wav\` (or Web Studio playback) so the human composer can immediately audition counterpoint, voice leading, and rhythmic balance.

---

## 12. Contrapuntal Techniques: Canon and Fugue

Writing contrapuntal and polyphonic forms requires strict temporal synchronization and voice independence. TMD's track offset syntax (\`@|+N|\`) makes constructing canons and fugues deterministic and token-efficient for AI agents:

### 1. Strict Canon with Measure Offsets
In traditional notation, writing a canon requires manually filling preceding rests in entering voices. In TMD, use \`@|+N|\` to delay entering voices without padding rest tokens:

\`\`\`tmd
/* Two-Voice Canon at the Octave, 2 measures delayed */
canon:Violin1@|0|{
    <4*>
    1 2 3 1 | 3 4 5 - | 5 6 5 4 | 3 - 1 - |
    2 5_ 1 - | - - - - |
}

canon:Violin2@|+2|{
    <4*>
    1 2 3 1 | 3 4 5 - | 5 6 5 4 | 3 - 1 - |
    2 5_ 1 - | - - - - |
}
\`\`\`

For a **Canon at the Fifth**, transpose the melody by 4 scale degrees (or use \`{?+7}\` directives) when authoring the follower voice.

### 2. Fugue Architecture
Follow standard classical/baroque fugal exposition principles:
- **Subject (Dux)**: The primary theme stated alone by Voice 1 (\`@|0|\`) in the tonic key.
- **Answer (Comes)**: Voice 2 enters at \`@|+2|\` or \`@|+4|\`, transposed to the dominant (5th above / 4th below).
- **Countersubject**: While Voice 2 plays the Answer, Voice 1 continues with a contrasting counter-melody, maintaining complementary rhythmic motion (e.g., when one voice sustains, the other moves).
- **Episode**: Modulating passages using fragments of the Subject with motivic sequencing.
- **Stretto**: In climactic sections, introduce successive voice entries at narrower measure offsets (e.g., \`@|+1|\` instead of \`@|+4|\`) before previous statements finish, intensifying dramatic tension.
`;

  static defaultInstallPaths(): string[] {
    return [".codex", ".gemini", ".gemini/config", ".claude", ".agent", ".agents"].map((root) =>
      path.join(os.homedir(), root, "skills", "tmd")
    );
  }

  static installSkills(
    paths = this.defaultInstallPaths()
  ): { path: string; installed: boolean; error?: string }[] {
    return paths.map((p) => {
      try {
        fs.mkdirSync(p, { recursive: true });
        fs.writeFileSync(path.join(p, "SKILL.md"), this.skillMarkdown);
        return { path: p, installed: true };
      } catch (e) {
        return { path: p, installed: false, error: String(e) };
      }
    });
  }
}
