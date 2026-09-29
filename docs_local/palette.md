# Web Studio TMD Symbol Palette

The Web Studio has two separate input surfaces:

- **Piano Keyboard**: the piano UI at the bottom of the editor. It is used to audition pitches and, in Insert mode, enter notes.
- **TMD Symbol Palette**: a compact toolbar above the editor. It provides symbols and a few common TMD forms that are difficult to enter with a tablet software keyboard.

The palette is not a second piano keyboard, an autocomplete system, or a general snippet framework.

## Goal

Make TMD notation comfortable to edit on a tablet by providing digits and punctuation that may be hidden behind modifier pages or missing from an English-only software keyboard.

The palette should stay small and predictable. It supplements the tablet keyboard; it does not replace normal text entry.

## Position

The palette is placed directly above the text editor and remains available while editing:

```text
┌─────────────────────────────────────────────┐
│ TMD Symbols   0 1 2 3 4 5 6 7 8 9  |  -  ^  │
├─────────────────────────────────────────────┤
│                                             │
│                 Text editor                 │
│                                             │
├─────────────────────────────────────────────┤
│                 Piano Keyboard              │
└─────────────────────────────────────────────┘
```

On a narrow tablet viewport, the symbol row may scroll horizontally. It should not take over the editor or behave like a modal dialog.

## First version

The first version should provide digits and symbols:

```text
0 1 2 3 4 5 6 7 8 9
|   -   ^   _   '   ,   [ ]   { }   < >
```

The digits cover numbered notation and numeric values. The symbols cover bar separators, duration extensions, octave displacement, accidentals, chord brackets, directives, and time-signature brackets.

The following common forms may be provided as convenience buttons because they are tedious to type on a tablet:

```text
{p}   {mp}   {mf}   {f}   {ff}
{!= } {!+ }
{?= } {?+ }
{key= }
{<3/4>}
```

These buttons insert valid TMD text. They do not define a new syntax.

Ordinary letters can remain available from the tablet keyboard. The piano keyboard remains the preferred way to audition pitches, while the palette also supports direct numbered-notation entry.

## Insertion behavior

- Insert the selected symbol or form at the editor cursor.
- Keep the cursor after the inserted text.
- For a form with a value, leave the cursor in the value position. For example, `{!= }` places the cursor after the space.
- Preserve the current selection behavior of the editor; the palette must not unexpectedly replace a selection unless the selected action explicitly wraps it.
- Insert a space only when it is part of the selected form. Do not add broad formatting automatically.

The palette has no audio behavior. Pressing a palette button edits text; pressing a piano key produces audio and may edit text only when the piano is in Insert mode.

## Scope boundaries

The palette does not initially include:

- autocomplete suggestions;
- a full list of every TMD token;
- a general-purpose multi-line snippet system;
- playback-order programming such as `canon`, `loop`, or `layer`;
- a replacement for the desktop keyboard.

Common chords or a New Section action can be considered later, but they should not make the first palette larger than necessary.

## Terminology

Use these names consistently:

- `Piano Keyboard` for the bottom pitch and audition surface.
- `TMD Symbol Palette` or `TMD Symbols` for the top tablet-oriented toolbar.

Avoid calling the top toolbar a “keyboard” or a “snippet bar”.
