import { MIDIInstrument } from "../exporters/midi_instrument.js";
import { TmdMacroError, TmdMacroEvaluator, TmdPlaybackRenderer } from "../playback/index.js";
import { ChordSymbol, Entry, SExpr, Sheet, TmdParser } from "../syntax/index.js";
import { TmdMeasureChecker } from "./measure_check.js";

export type TmdDiagnosticSeverity = "error" | "warning";

export type TmdValidationRule =
  | "E-MEASURE-BEAT"
  | "E-SYNTAX"
  | "E-MACRO-EXPAND"
  | "E-TIMELINE-OVERLAP"
  | "E-TEMPO-CONFLICT"
  | "E-CHORD-MULTINOTE"
  | "E-LYRIC-SLOT-MISMATCH"
  | "E-LYRIC-COUNT"
  | "E-LYRIC-DIRECTIVE"
  | "E-LYRIC-GROUP"
  | "E-LYRIC-TOKEN-UNSEPARATED"
  | "E-STANZA-ZERO"
  | "E-STANZA-RANGE"
  | "E-STANZA-DUPLICATE"
  | "E-STANZA-INCONSISTENT"
  | "W-STANZA-GAP"
  | "W-STANZA-FALLBACK"
  | "W-CHORD-CUSTOM"
  | "W-UNUSED-ENTRY"
  | "W-UNUSED-PROTOTYPE"
  | "W-INSTRUMENT-INCONSISTENT"
  | "W-INSTRUMENT-UNKNOWN"
  | "W-SECTION-LENGTH-MISMATCH"
  | "W-TEMPO-OUT-OF-RANGE";

export interface TmdScoreDiagnostic {
  file?: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  severity: TmdDiagnosticSeverity;
  rule: TmdValidationRule;
  message: string;
  suggestion?: string;
  codeFrame?: string;
}

export interface TmdValidationOptions {
  file?: string;
  isSnippet?: boolean;
  lineOffset?: number;
}

export class TmdScoreValidator {
  public static validate(
    source: string,
    options: TmdValidationOptions = {}
  ): TmdScoreDiagnostic[] {
    const file = options.file;
    const isSnippet = options.isSnippet ?? false;
    const lineOffset = options.lineOffset ?? 0;

    const diagnostics: TmdScoreDiagnostic[] = [];
    const lines = source.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));

    // Stage 1a: Measure consistency check (E-MEASURE-BEAT)
    const measureIssues = TmdMeasureChecker.check(source);
    for (const issue of measureIssues) {
      const line = Math.max(1, issue.lineNumber) + lineOffset;
      const lineLen =
        issue.lineNumber >= 1 && issue.lineNumber <= lines.length
          ? Math.max(1, lines[issue.lineNumber - 1].length)
          : 80;
      diagnostics.push({
        file,
        line,
        column: 1,
        endLine: line,
        endColumn: lineLen + 1,
        severity: "error",
        rule: "E-MEASURE-BEAT",
        message: issue.description,
      });
    }

    // Stage 1b: Strict Syntax / Throwing Parser check (E-SYNTAX)
    let sheet: Sheet;
    try {
      sheet = TmdParser.parseThrowing(source);
    } catch (err: any) {
      const line = Math.max(1, err?.range?.start?.line ?? 1) + lineOffset;
      const col = Math.max(1, err?.range?.start?.column ?? 1);
      const len = Math.max(1, err?.range?.length ?? 1);
      const suggestion =
        Array.isArray(err?.hints) && err.hints.length > 0
          ? err.hints.join(" ")
          : undefined;
      const codeFrame =
        typeof err?.formatCodeFrame === "function"
          ? err.formatCodeFrame(source)
          : undefined;
      diagnostics.push({
        file,
        line,
        column: col,
        endLine: line,
        endColumn: col + len,
        severity: "error",
        rule: "E-SYNTAX",
        message: err?.message || "Parse error",
        suggestion,
        codeFrame,
      });
      return diagnostics;
    }

    // Validate movable-do header ?= is not a minor key like ?= Am
    for (let idx = 0; idx < lines.length; idx++) {
      const rawLine = lines[idx];
      const trimmed = rawLine.trim();
      if (trimmed.startsWith("//")) continue;
      const match = trimmed.match(/^\?=\s*([A-Ga-g][',#b]?m\b|\S+)/);
      if (match) {
        const token = match[1].trim();
        if (!this.isValidMovableDoKeyToken(token)) {
          const lineNum = idx + 1 + lineOffset;
          const baseLetter = token.replace(/[mM].*$/, "") || "A";
          diagnostics.push({
            file,
            line: lineNum,
            column: 1,
            endLine: lineNum,
            endColumn: Math.max(1, rawLine.length) + 1,
            severity: "error",
            rule: "E-SYNTAX",
            message: `Invalid movable-do key signature '?= ${token}'. '?=' only defines where '1' (do) is in semitones.`,
            suggestion: token.toLowerCase().endsWith("m")
              ? `Use '?= ${baseLetter}' for the movable-do base and 'key= ${token}' for the written minor key signature.`
              : "Use a pitch class such as C, D, E, F, G, A, B with optional ' or , (e.g. '?= C', '?= F', '?= B,').",
          });
        }
      }
    }

    // Stage 2: Macro Expansion & Timeline Validation
    let expandedSheet: Sheet;
    try {
      expandedSheet = TmdMacroEvaluator.expandThrowing(sheet);
    } catch (err: any) {
      const line = (err instanceof TmdMacroError ? err.line ?? 1 : 1) + lineOffset;
      const col = err instanceof TmdMacroError ? err.column ?? 1 : 1;
      diagnostics.push({
        file,
        line,
        column: col,
        endLine: line,
        endColumn: col + 1,
        severity: "error",
        rule: "E-MACRO-EXPAND",
        message: err?.message || String(err),
      });
      expandedSheet = sheet;
    }

    // 2b. Timeline overlap (E-TIMELINE-OVERLAP)
    try {
      for (const overlap of TmdPlaybackRenderer.validate(expandedSheet)) {
        const line =
          this.findEntryLine(overlap.sectionName, overlap.assignment, lines) + lineOffset;
        diagnostics.push({
          file,
          line,
          column: 1,
          endLine: line,
          endColumn: 2,
          severity: "error",
          rule: "E-TIMELINE-OVERLAP",
          message: overlap.description,
        });
      }
    } catch (_) {}

    // 2c. Simultaneous tempo conflicts (E-TEMPO-CONFLICT)
    try {
      for (const conflict of TmdPlaybackRenderer.validateTempoConflicts(expandedSheet)) {
        const temposStr = conflict.tempos.map((t) => String(Math.round(t))).join(", ");
        diagnostics.push({
          file,
          line: 1 + lineOffset,
          column: 1,
          endLine: 1 + lineOffset,
          endColumn: 2,
          severity: "error",
          rule: "E-TEMPO-CONFLICT",
          message: `Conflicting simultaneous tempo directives (${temposStr} BPM) at beat position ${conflict.position}.`,
        });
      }
    } catch (_) {}

    // 2d. Tempo bounds check (W-TEMPO-OUT-OF-RANGE: [10, 1000] BPM)
    if (
      sheet.speed > 0 &&
      (sheet.speed < TmdPlaybackRenderer.minTempoBPM ||
        sheet.speed > TmdPlaybackRenderer.maxTempoBPM)
    ) {
      const speedIdx = lines.findIndex((l) => {
        const t = l.trim();
        return !t.startsWith("//") && t.startsWith("!=");
      });
      const speedLine = (speedIdx >= 0 ? speedIdx + 1 : 1) + lineOffset;
      const clamped = TmdPlaybackRenderer.clampTempo(sheet.speed);
      diagnostics.push({
        file,
        line: speedLine,
        column: 1,
        endLine: speedLine,
        endColumn: 2,
        severity: "warning",
        rule: "W-TEMPO-OUT-OF-RANGE",
        message: `Tempo '!= ${sheet.speed}' is outside the supported range [10, 1000] BPM (will be clamped to ${clamped} BPM).`,
        suggestion: "Specify a tempo between 10 and 1000 BPM.",
      });
    }

    for (const entry of sheet.entries) {
      let currentTempo =
        sheet.speed > 0
          ? TmdPlaybackRenderer.clampTempo(sheet.speed)
          : TmdPlaybackRenderer.defaultTempoBPM;
      const entryLine =
        (entry.line ?? this.findEntryLine(entry.name, entry.assignment, lines)) +
        lineOffset;
      for (const section of entry.sections) {
        const sortedDirectives = [...section.directives].sort(
          (a, b) => a.position - b.position
        );
        for (const directive of sortedDirectives) {
          if (directive.kind.type === "tempo") {
            const bpm = directive.kind.bpm;
            if (
              bpm < TmdPlaybackRenderer.minTempoBPM ||
              bpm > TmdPlaybackRenderer.maxTempoBPM
            ) {
              const clamped = TmdPlaybackRenderer.clampTempo(bpm);
              diagnostics.push({
                file,
                line: entryLine,
                column: 1,
                endLine: entryLine,
                endColumn: 2,
                severity: "warning",
                rule: "W-TEMPO-OUT-OF-RANGE",
                message: `Tempo directive '{!= ${bpm}}' in '${entry.name}' is outside the supported range [10, 1000] BPM (will be clamped to ${clamped} BPM).`,
                suggestion: "Specify a tempo between 10 and 1000 BPM.",
              });
            }
            currentTempo = TmdPlaybackRenderer.clampTempo(bpm);
          } else if (directive.kind.type === "relativeTempo") {
            const delta = directive.kind.deltaBpm;
            const targetTempo = currentTempo + delta;
            if (
              targetTempo < TmdPlaybackRenderer.minTempoBPM ||
              targetTempo > TmdPlaybackRenderer.maxTempoBPM
            ) {
              const clamped = TmdPlaybackRenderer.clampTempo(targetTempo);
              const op = delta >= 0 ? "!+" : "!-";
              diagnostics.push({
                file,
                line: entryLine,
                column: 1,
                endLine: entryLine,
                endColumn: 2,
                severity: "warning",
                rule: "W-TEMPO-OUT-OF-RANGE",
                message: `Relative tempo directive '{${op} ${Math.abs(delta)}}' in '${entry.name}' results in ${targetTempo} BPM, outside [10, 1000] BPM (will be clamped to ${clamped} BPM).`,
                suggestion: "Keep effective tempo within 10 to 1000 BPM.",
              });
            }
            currentTempo = TmdPlaybackRenderer.clampTempo(targetTempo);
          }
        }
      }
    }

    // Stage 3: Chord Symbol Linter (E-CHORD-MULTINOTE, W-CHORD-CUSTOM)
    for (const entry of sheet.entries) {
      for (const section of entry.sections) {
        for (const group of section.unitGroups) {
          for (const unit of group.units) {
            if (unit.type === "chord") {
              const chord = unit.chord;
              if (!ChordSymbol.isStandardQuality(chord.quality)) {
                const rawSuffix = chord.quality;
                const rawDesc = chord.toString();
                const loc = this.findTokenLocation(
                  `[${rawDesc}]`,
                  entry.name,
                  entry.assignment,
                  lines
                );
                const line = loc.line + lineOffset;
                const col = loc.column;
                const endCol = col + rawDesc.length + 2;

                if (this.isMultiNoteMisuse(chord, rawSuffix)) {
                  const suggested = this.suggestMultiNoteFix(rawDesc);
                  diagnostics.push({
                    file,
                    line,
                    column: col,
                    endLine: line,
                    endColumn: endCol,
                    severity: "error",
                    rule: "E-CHORD-MULTINOTE",
                    message: `Chord symbol '[${rawDesc}]' appears to be a multi-note chord written with brackets instead of '+'.`,
                    suggestion: `Did you mean '${suggested}'? Brackets '[...]' are for chord symbols (e.g. '[Cmaj7]'), while simultaneous notes use '+' (e.g. '${suggested}').`,
                  });
                } else if (!ChordSymbol.isRecognizedExtendedQuality(rawSuffix)) {
                  diagnostics.push({
                    file,
                    line,
                    column: col,
                    endLine: line,
                    endColumn: endCol,
                    severity: "warning",
                    rule: "W-CHORD-CUSTOM",
                    message: `Unrecognized custom chord quality '${rawSuffix}' in '[${rawDesc}]'.`,
                    suggestion:
                      "Use standard chord qualities (e.g. m, 7, maj7, m7, dim, m7-5, aug, sus4, 5, add9, maj9, m9, 6) or '+' for multi-note dyads/chords.",
                  });
                }
              }
            }
          }
        }
      }
    }

    // Stage 4: Unused Entries & Prototypes (W-UNUSED-ENTRY, W-UNUSED-PROTOTYPE)
    if (!isSnippet && sheet.playback.length > 0) {
      const referencedNames = new Set<string>();
      for (const item of sheet.playback) {
        if (item.type === "name") {
          referencedNames.add(item.name);
        } else if (item.type === "macro") {
          for (const expr of item.expr) {
            this.collectSExprSymbols(expr, referencedNames);
          }
        }
      }
      for (const item of expandedSheet.playback) {
        if (item.type === "name") {
          referencedNames.add(item.name);
        }
      }

      // Concrete entries grouped by section name
      const concreteSectionNames: string[] = [];
      const seenConcrete = new Set<string>();
      for (const entry of sheet.entries) {
        if (entry.assignment && !seenConcrete.has(entry.name)) {
          seenConcrete.add(entry.name);
          concreteSectionNames.push(entry.name);
        }
      }

      for (const secName of concreteSectionNames) {
        if (!referencedNames.has(secName)) {
          const firstEntry = sheet.entries.find(
            (e) => e.name === secName && Boolean(e.assignment)
          );
          const line =
            (firstEntry?.line ??
              this.findEntryLine(secName, firstEntry?.assignment, lines)) + lineOffset;
          diagnostics.push({
            file,
            line,
            column: firstEntry?.column ?? 1,
            endLine: line,
            endColumn: (firstEntry?.column ?? 1) + secName.length,
            severity: "warning",
            rule: "W-UNUSED-ENTRY",
            message: `Section '${secName}' is defined but never referenced in the '-> ... ->#' playback order.`,
          });
        }
      }

      // Prototypes
      const prototypeNames: string[] = [];
      const seenProto = new Set<string>();
      for (const entry of sheet.entries) {
        if (!entry.assignment && !seenProto.has(entry.name)) {
          seenProto.add(entry.name);
          prototypeNames.push(entry.name);
        }
      }

      for (const protoName of prototypeNames) {
        if (!referencedNames.has(protoName)) {
          const firstProto = sheet.entries.find(
            (e) => e.name === protoName && !e.assignment
          );
          const line =
            (firstProto?.line ?? this.findEntryLine(protoName, undefined, lines)) +
            lineOffset;
          diagnostics.push({
            file,
            line,
            column: firstProto?.column ?? 1,
            endLine: line,
            endColumn: (firstProto?.column ?? 1) + protoName.length,
            severity: "warning",
            rule: "W-UNUSED-PROTOTYPE",
            message: `Prototype '${protoName}' is defined but never referenced by any playback order or S-expression macro.`,
          });
        }
      }
    }

    // Stage 5: Instrument Assignment Consistency & Recognition
    const rawAssignments: string[] = [];
    const seenRaw = new Set<string>();
    for (const entry of expandedSheet.entries) {
      const trimmed = entry.assignment?.trim();
      if (trimmed && !seenRaw.has(trimmed)) {
        seenRaw.add(trimmed);
        rawAssignments.push(trimmed);
      }
    }

    const byNormalized = new Map<string, string[]>();
    for (const raw of rawAssignments) {
      const norm = this.normalizeInstrumentKey(raw);
      if (!norm) continue;
      const list = byNormalized.get(norm) ?? [];
      list.push(raw);
      byNormalized.set(norm, list);
    }

    for (const [, variants] of byNormalized.entries()) {
      if (variants.length > 1) {
        const canonical = variants[0];
        for (const variant of variants.slice(1)) {
          const line = this.findEntryLine(undefined, variant, lines) + lineOffset;
          diagnostics.push({
            file,
            line,
            column: 1,
            endLine: line,
            endColumn: 2,
            severity: "warning",
            rule: "W-INSTRUMENT-INCONSISTENT",
            message: `Instrument assignment '${variant}' differs in casing or punctuation from '${canonical}'. Exporters treat distinct assignment strings as separate tracks.`,
            suggestion: `Rename '${variant}' to '${canonical}' for a single unified instrument track.`,
          });
        }
      }
    }

    for (const raw of rawAssignments) {
      if (!this.isRecognizedInstrument(raw)) {
        const line = this.findEntryLine(undefined, raw, lines) + lineOffset;
        diagnostics.push({
          file,
          line,
          column: 1,
          endLine: line,
          endColumn: 2,
          severity: "warning",
          rule: "W-INSTRUMENT-UNKNOWN",
          message: `Unrecognized instrument assignment '${raw}'; MIDI and audio exporters will fall back to default Acoustic Grand Piano (Program 0).`,
        });
      }
    }

    // Stage 6: Cross-Track Section Measure Length Discrepancy (W-SECTION-LENGTH-MISMATCH)
    const measureDur = TmdPlaybackRenderer.measureDuration(sheet.beat);
    if (measureDur > 0) {
      const concreteEntries = sheet.entries.filter((e) =>
        Boolean(e.assignment && e.assignment.trim())
      );
      const entriesBySection = new Map<string, Entry[]>();
      const sectionOrder: string[] = [];
      for (const entry of concreteEntries) {
        if (!entriesBySection.has(entry.name)) {
          entriesBySection.set(entry.name, []);
          sectionOrder.push(entry.name);
        }
        entriesBySection.get(entry.name)!.push(entry);
      }

      for (const secName of sectionOrder) {
        const secEntries = entriesBySection.get(secName) ?? [];
        const byInstrument = new Map<string, Entry[]>();
        const instOrder: string[] = [];
        for (const entry of secEntries) {
          const inst = entry.assignment ?? "";
          if (!byInstrument.has(inst)) {
            byInstrument.set(inst, []);
            instOrder.push(inst);
          }
          byInstrument.get(inst)!.push(entry);
        }
        if (instOrder.length < 2) continue;

        const spanByInstrument: Array<{
          instrument: string;
          span: number;
          endBeats: number;
          entry: Entry;
        }> = [];
        for (const inst of instOrder) {
          const entriesForInst = byInstrument.get(inst) ?? [];
          let maxEndMeasure = 0;
          let maxEndBeats = 0.0;
          for (const e of entriesForInst) {
            const beatDur = e.sections.reduce((total, section) => {
              const unitDur = 4.0 / Math.max(1, section.noteLength);
              return (
                total +
                section.unitGroups.reduce(
                  (sum, g) => sum + Math.max(0, g.length) * unitDur,
                  0
                )
              );
            }, 0);
            const entryBeat = TmdPlaybackRenderer.entryInitialBeat(
              e,
              sheet,
              sheet.beat
            );
            const entryMeasureDur = TmdPlaybackRenderer.measureDuration(entryBeat);
            const measuresCount = Math.round(beatDur / entryMeasureDur);
            const endMeasure = e.start + measuresCount;
            const endBeats = e.start * entryMeasureDur + beatDur;
            if (endMeasure > maxEndMeasure) {
              maxEndMeasure = endMeasure;
            }
            if (endBeats > maxEndBeats) {
              maxEndBeats = endBeats;
            }
          }
          if (maxEndMeasure > 0 && entriesForInst.length > 0) {
            spanByInstrument.push({
              instrument: inst,
              span: maxEndMeasure,
              endBeats: maxEndBeats,
              entry: entriesForInst[0],
            });
          }
        }

        const distinctSpans = new Set(spanByInstrument.map((s) => s.span));
        if (spanByInstrument.length >= 2 && distinctSpans.size > 1) {
          const freq = new Map<number, number>();
          for (const item of spanByInstrument) {
            freq.set(item.span, (freq.get(item.span) ?? 0) + 1);
          }
          let referenceSpan = 0;
          let bestCount = -1;
          for (const [span, count] of freq.entries()) {
            if (count > bestCount || (count === bestCount && span > referenceSpan)) {
              bestCount = count;
              referenceSpan = span;
            }
          }
          const referenceEndBeats =
            spanByInstrument.find((s) => s.span === referenceSpan)?.endBeats ?? 0.0;

          for (const item of spanByInstrument) {
            if (
              item.span !== referenceSpan &&
              Math.abs(item.endBeats - referenceEndBeats) > 1e-4
            ) {
              const line =
                this.findEntryLine(secName, item.instrument, lines) + lineOffset;
              diagnostics.push({
                file,
                line,
                column: 1,
                endLine: line,
                endColumn: 2,
                severity: "warning",
                rule: "W-SECTION-LENGTH-MISMATCH",
                message: `Section '${secName}' instrument '${item.instrument}' spans ${item.span} measure(s), whereas other instruments in '${secName}' span ${referenceSpan} measure(s). Check if '<n*>' note-length subdivision or rest padding was intended.`,
              });
            }
          }
        }
      }
    }

    // Stage 7: Vocal Lyrics & Multi-Stanza Validation
    const sectionDefinedStanzas = new Map<string, Set<number>>();
    for (const entry of sheet.entries) {
      for (const section of entry.sections) {
        if (!section.lyricBlocks || section.lyricBlocks.length === 0) continue;

        const blockStanzaSets: Array<{ line: number; stanzas: Set<number>; span: number }> = [];
        let stanzaSpan = 0;

        for (const block of section.lyricBlocks) {
          const seenStanzasInBlock = new Set<number | string>();
          const validStanzaNumbersInBlock: number[] = [];

          for (const lyricLine of block.lyricLines) {
            const lLine = (lyricLine.line ?? entry.line ?? 1) + lineOffset;
            const lCol = lyricLine.column ?? 1;

            if (lyricLine.stanza === 0) {
              diagnostics.push({
                file,
                line: lLine,
                column: lCol,
                endLine: lLine,
                endColumn: lCol + lyricLine.rawPrefix.length,
                severity: "error",
                rule: "E-STANZA-ZERO",
                message: `Illegal stanza index 'L0|' in '${entry.name}'. Stanza numbering is 1-based (L1..L64).`,
              });
            } else if (lyricLine.stanza !== undefined && lyricLine.stanza > 64) {
              diagnostics.push({
                file,
                line: lLine,
                column: lCol,
                endLine: lLine,
                endColumn: lCol + lyricLine.rawPrefix.length,
                severity: "error",
                rule: "E-STANZA-RANGE",
                message: `Stanza index 'L${lyricLine.stanza}|' in '${entry.name}' exceeds the maximum limit of 64 (L1..L64).`,
              });
            }

            const stanzaKey = lyricLine.stanza ?? "default";
            if (seenStanzasInBlock.has(stanzaKey)) {
              diagnostics.push({
                file,
                line: lLine,
                column: lCol,
                endLine: lLine,
                endColumn: lCol + lyricLine.rawPrefix.length,
                severity: "error",
                rule: "E-STANZA-DUPLICATE",
                message: `Duplicate stanza '${lyricLine.rawPrefix.trim()}' declared under the same melodic measure block in '${entry.name}'.`,
              });
            } else {
              seenStanzasInBlock.add(stanzaKey);
              if (
                lyricLine.stanza !== undefined &&
                lyricLine.stanza >= 1 &&
                lyricLine.stanza <= 64
              ) {
                validStanzaNumbersInBlock.push(lyricLine.stanza);
                if (!sectionDefinedStanzas.has(entry.name)) {
                  sectionDefinedStanzas.set(entry.name, new Set());
                }
                sectionDefinedStanzas.get(entry.name)!.add(lyricLine.stanza);
              }
            }

            if (lyricLine.measures.length !== block.melodicMeasures.length) {
              diagnostics.push({
                file,
                line: lLine,
                column: lCol,
                endLine: lLine,
                endColumn: lCol + 2,
                severity: "error",
                rule: "E-LYRIC-SLOT-MISMATCH",
                message: `Lyric line in '${entry.name}' has ${lyricLine.measures.length} measure(s), but corresponding melodic line has ${block.melodicMeasures.length} measure(s).`,
              });
            }

            const pairCount = Math.min(
              lyricLine.measures.length,
              block.melodicMeasures.length
            );
            for (let mIdx = 0; mIdx < pairCount; mIdx++) {
              const lMeasure = lyricLine.measures[mIdx];
              const mSpan = block.melodicMeasures[mIdx];
              const melodicGroups = section.unitGroups.slice(
                mSpan.startGroupIndex,
                mSpan.endGroupIndex
              );

              if (lMeasure.directives && lMeasure.directives.length > 0) {
                for (const dir of lMeasure.directives) {
                  diagnostics.push({
                    file,
                    line: lLine,
                    column: lMeasure.column ?? lCol,
                    endLine: lLine,
                    endColumn: (lMeasure.column ?? lCol) + dir.length,
                    severity: "error",
                    rule: "E-LYRIC-DIRECTIVE",
                    message: `Musical directive '${dir}' is forbidden inside a lyric line in '${entry.name}'.`,
                  });
                }
              }

              for (const tok of lMeasure.soundingTokens) {
                if (tok.kind === "syllable" && /\p{Script=Han}{2,}/u.test(tok.cleanWord)) {
                  diagnostics.push({
                    file,
                    line: lLine,
                    column: tok.column ?? lCol,
                    endLine: lLine,
                    endColumn: (tok.column ?? lCol) + tok.text.length,
                    severity: "error",
                    rule: "E-LYRIC-TOKEN-UNSEPARATED",
                    message: `Lyric token '${tok.text}' in '${entry.name}' contains multiple unseparated CJK syllables; separate each syllable with whitespace (e.g. '${Array.from(tok.cleanWord).join(" ")}').`,
                  });
                }
              }

              const melodicUnits = melodicGroups.flatMap((g) => g.units);
              const expectedSlots = melodicUnits.length;
              const trailingGroups = melodicGroups.slice(lMeasure.slots.length);
              let previousWasRest = false;
              const canAutoPadTrailingRests =
                lMeasure.slots.length < melodicGroups.length &&
                trailingGroups.every((group) =>
                  group.units.every((unit) => {
                    if (unit.type === "rest") {
                      previousWasRest = true;
                      return true;
                    }
                    if (unit.type === "tie" && previousWasRest) return true;
                    return false;
                  })
                ) && previousWasRest;
              const actualSlots = canAutoPadTrailingRests
                ? expectedSlots
                : lMeasure.soundingTokens.length;
              if (actualSlots !== expectedSlots) {
                diagnostics.push({
                  file,
                  line: lLine,
                  column: lMeasure.column ?? lCol,
                  endLine: lLine,
                  endColumn: (lMeasure.column ?? lCol) + 2,
                  severity: "error",
                  rule: "E-LYRIC-SLOT-MISMATCH",
                  message: `Lyric measure ${mSpan.measureIndex + 1} in '${entry.name}' has ${actualSlots} sounding token(s), but corresponding melodic measure has ${expectedSlots} slot(s).`,
                });
              } else {
                let previousWasRestOrRestTie = false;
                for (let uIdx = 0; uIdx < lMeasure.soundingTokens.length; uIdx++) {
                  const mUnit = melodicUnits[uIdx];
                  const lTok = lMeasure.soundingTokens[uIdx];
                  const isRestContinuation =
                    mUnit.type === "tie" && previousWasRestOrRestTie;
                  if (mUnit.type === "rest" && lTok.kind !== "rest") {
                    diagnostics.push({
                      file,
                      line: lLine,
                      column: lTok.column ?? lCol,
                      endLine: lLine,
                      endColumn: (lTok.column ?? lCol) + lTok.text.length,
                      severity: "error",
                      rule: "E-LYRIC-SLOT-MISMATCH",
                      message: `Lyric token '${lTok.text}' in '${entry.name}' cannot be placed on a melodic rest '0'; use rest placeholder '0' or '_'.`,
                    });
                  } else if (
                    mUnit.type !== "rest" &&
                    lTok.kind === "rest" &&
                    !isRestContinuation
                  ) {
                    diagnostics.push({
                      file,
                      line: lLine,
                      column: lTok.column ?? lCol,
                      endLine: lLine,
                      endColumn: (lTok.column ?? lCol) + lTok.text.length,
                      severity: "error",
                      rule: "E-LYRIC-SLOT-MISMATCH",
                      message: `Lyric rest placeholder '${lTok.text}' in '${entry.name}' cannot be placed on a sounding melodic unit; only melodic rests '0' may pair with lyric '${lTok.text}'.`,
                    });
                  }
                  previousWasRestOrRestTie =
                    mUnit.type === "rest" ||
                    (mUnit.type === "tie" && previousWasRestOrRestTie);
                }
              }

              const hasMelodicSubdivision = melodicGroups.some(
                (g) => g.units.length > 1
              );
              const hasLyricGroup = lMeasure.slots.some((s) => s.type === "group");
              if (hasMelodicSubdivision || hasLyricGroup) {
                if (
                  lMeasure.slots.some(
                    (s) => s.type === "group" && s.hasInvalidRatio
                  )
                ) {
                  diagnostics.push({
                    file,
                    line: lLine,
                    column: lMeasure.column ?? lCol,
                    endLine: lLine,
                    endColumn: (lMeasure.column ?? lCol) + 2,
                    severity: "error",
                    rule: "E-LYRIC-GROUP",
                    message: `Lyric group in '${entry.name}' must not repeat duration ratio suffix '%(...)'.`,
                  });
                } else if (lMeasure.slots.length !== melodicGroups.length) {
                  diagnostics.push({
                    file,
                    line: lLine,
                    column: lMeasure.column ?? lCol,
                    endLine: lLine,
                    endColumn: (lMeasure.column ?? lCol) + 2,
                    severity: "error",
                    rule: "E-LYRIC-GROUP",
                    message: `Lyric measure ${mSpan.measureIndex + 1} in '${entry.name}' does not mirror melodic subdivision grouping '(...)'.`,
                  });
                } else {
                  for (let gIdx = 0; gIdx < melodicGroups.length; gIdx++) {
                    const mGroup = melodicGroups[gIdx];
                    const lSlot = lMeasure.slots[gIdx];
                    const melodyIsGroup = mGroup.units.length > 1;
                    const lyricIsGroup = lSlot.type === "group";
                    if (melodyIsGroup !== lyricIsGroup) {
                      diagnostics.push({
                        file,
                        line: lLine,
                        column: lSlot.column ?? lCol,
                        endLine: lLine,
                        endColumn: (lSlot.column ?? lCol) + 2,
                        severity: "error",
                        rule: "E-LYRIC-GROUP",
                        message: `Lyric measure ${mSpan.measureIndex + 1} in '${entry.name}' must mirror melodic subdivision with parenthesized lyric group '(...)'.`,
                      });
                      break;
                    } else if (
                      lyricIsGroup &&
                      lSlot.soundingTokens.length !== mGroup.units.length
                    ) {
                      diagnostics.push({
                        file,
                        line: lLine,
                        column: lSlot.column ?? lCol,
                        endLine: lLine,
                        endColumn: (lSlot.column ?? lCol) + 2,
                        severity: "error",
                        rule: "E-LYRIC-GROUP",
                        message: `Lyric group in '${entry.name}' has ${lSlot.soundingTokens.length} sounding token(s), but melodic subdivision has ${mGroup.units.length} note slot(s).`,
                      });
                      break;
                    }
                  }
                }
              }
            }
          }

          if (validStanzaNumbersInBlock.length > 0) {
            const sortedStanzas = [...new Set(validStanzaNumbersInBlock)].sort(
              (a, b) => a - b
            );
            const maxStanza = sortedStanzas[sortedStanzas.length - 1];
            const missing: number[] = [];
            for (let s = 1; s <= maxStanza; s++) {
              if (!sortedStanzas.includes(s)) {
                missing.push(s);
              }
            }
            const blockLine = (block.line ?? entry.line ?? 1) + lineOffset;
            if (missing.length > 0) {
              diagnostics.push({
                file,
                line: blockLine,
                column: 1,
                endLine: blockLine,
                endColumn: 2,
                severity: "warning",
                rule: "W-STANZA-GAP",
                message: `Discontinuous stanza numbering in '${entry.name}': missing stanza(s) ${missing.map((n) => "L" + n).join(", ")}.`,
              });
            }
            blockStanzaSets.push({
              line: blockLine,
              stanzas: new Set(sortedStanzas),
              span: stanzaSpan,
            });
          } else {
            // An unnumbered L| block is a single-pass lyric line and separates
            // numbered stanza spans rather than participating in their union.
            stanzaSpan += 1;
          }
        }

        const spans = new Map<number, typeof blockStanzaSets>();
        for (const block of blockStanzaSets) {
          if (!spans.has(block.span)) spans.set(block.span, []);
          spans.get(block.span)!.push(block);
        }
        for (const spanBlocks of spans.values()) {
          if (spanBlocks.length >= 2) {
            const unionStanzas = new Set<number>();
            for (const b of spanBlocks) for (const s of b.stanzas) unionStanzas.add(s);
            if (unionStanzas.size > 1) {
              for (const b of spanBlocks) {
                if (b.stanzas.size !== unionStanzas.size) {
                  diagnostics.push({
                  file,
                  line: b.line,
                  column: 1,
                  endLine: b.line,
                  endColumn: 2,
                  severity: "error",
                  rule: "E-STANZA-INCONSISTENT",
                  message: `Inconsistent stanza set across measures in '${entry.name}': expected stanza(s) ${Array.from(unionStanzas).sort((a, c) => a - c).map((n) => "L" + n).join(", ")}.`,
                  });
                }
              }
            }
          }
        }
      }
    }

    for (const order of sheet.playback) {
      if (order.type === "name") {
        if (order.stanza === 0) {
          diagnostics.push({
            file,
            line: (order.line ?? 1) + lineOffset,
            column: order.column ?? 1,
            endLine: (order.line ?? 1) + lineOffset,
            endColumn: (order.column ?? 1) + 2,
            severity: "error",
            rule: "E-STANZA-ZERO",
            message: `Illegal stanza selector '[L0]' on playback order '-> ${order.name}'. Stanza numbering is 1-based (L1..L64).`,
          });
        } else if (order.stanza !== undefined && order.stanza > 64) {
          diagnostics.push({
            file,
            line: (order.line ?? 1) + lineOffset,
            column: order.column ?? 1,
            endLine: (order.line ?? 1) + lineOffset,
            endColumn: (order.column ?? 1) + 2,
            severity: "error",
            rule: "E-STANZA-RANGE",
            message: `Stanza selector '[L${order.stanza}]' on playback order '-> ${order.name}' exceeds maximum limit of 64 (L1..L64).`,
          });
        } else if (order.stanza === undefined) {
          const stanzas = sectionDefinedStanzas.get(order.name);
          if (stanzas && stanzas.size > 1) {
            diagnostics.push({
              file,
              line: (order.line ?? 1) + lineOffset,
              column: order.column ?? 1,
              endLine: (order.line ?? 1) + lineOffset,
              endColumn: (order.column ?? 1) + 2,
              severity: "warning",
              rule: "W-STANZA-FALLBACK",
              message: `Playback order '-> ${order.name}' omits a stanza selector for multi-stanza section '${order.name}'; falling back to default 'L1'.`,
              suggestion: `Specify an explicit stanza selector such as '-> ${order.name}[L1]'.`,
            });
          }
        }
      }
    }

    return diagnostics;
  }

  public static validateMarkdown(
    source: string,
    file?: string
  ): TmdScoreDiagnostic[] {
    const diagnostics: TmdScoreDiagnostic[] = [];
    const lines = source.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));

    let inTmdBlock = false;
    let fenceStartLine = 0;
    let blockLines: string[] = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const trimmed = line.trim();
      if (!inTmdBlock) {
        if (trimmed.toLowerCase().startsWith("```tmd")) {
          inTmdBlock = true;
          fenceStartLine = idx + 1; // 1-indexed line of ```tmd
          blockLines = [];
        }
      } else {
        if (trimmed.startsWith("```")) {
          inTmdBlock = false;
          const blockContent = blockLines.join("\n");
          diagnostics.push(
            ...this.validateMarkdownBlock(blockContent, fenceStartLine, file)
          );
        } else {
          blockLines.push(line);
        }
      }
    }

    return diagnostics;
  }

  private static validateMarkdownBlock(
    blockContent: string,
    fenceStartLine: number,
    file?: string
  ): TmdScoreDiagnostic[] {
    const trimmed = blockContent.trim();
    if (!trimmed) return [];

    if (trimmed.includes("::SCORE::")) {
      return this.validate(blockContent, {
        file,
        isSnippet: false,
        lineOffset: fenceStartLine,
      });
    } else {
      const hasEntryBrace = blockContent.includes("{") && blockContent.includes("}");
      const trailingOrder = blockContent.includes("->") ? "" : "\n->#";
      let syntheticSource: string;
      let syntheticHeaderLines: number;
      if (hasEntryBrace) {
        syntheticSource = "::SCORE::\n!= 120\n?= C\n<4/4>\n" + blockContent + trailingOrder;
        syntheticHeaderLines = 4;
      } else if (trimmed.startsWith("<")) {
        syntheticSource =
          "::SCORE::\n!= 120\n?= C\n<4/4>\nSnippet:Piano@|0|{\n" +
          blockContent +
          "\n}\n-> Snippet ->#";
        syntheticHeaderLines = 5;
      } else {
        return [];
      }

      return this.validate(syntheticSource, {
        file,
        isSnippet: true,
        lineOffset: fenceStartLine - syntheticHeaderLines,
      });
    }
  }

  private static isValidMovableDoKeyToken(token: string): boolean {
    const num = Number(token);
    if (Number.isInteger(num) && num >= 1 && num <= 7) {
      return true;
    }
    return /^[A-Ga-g][',#b]?$/.test(token);
  }

  private static isMultiNoteMisuse(chord: ChordSymbol, rawSuffix: string): boolean {
    if (rawSuffix.includes(" ") || rawSuffix.includes("\t") || rawSuffix.includes(",")) {
      return true;
    }
    if (
      chord.root.isScaleDegree &&
      /^[',_^\s0-7b#]+$/.test(rawSuffix) &&
      !["5", "6", "7", "9", "11", "13"].includes(rawSuffix)
    ) {
      return true;
    }
    return false;
  }

  private static suggestMultiNoteFix(rawDescription: string): string {
    const tokens = rawDescription
      .replace(/,/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length >= 2) {
      return tokens.join("+");
    }
    return rawDescription.trim();
  }

  private static collectSExprSymbols(sexpr: SExpr, set: Set<string>): void {
    if (typeof sexpr === "string") {
      set.add(sexpr);
    } else if (Array.isArray(sexpr)) {
      for (const item of sexpr) {
        this.collectSExprSymbols(item, set);
      }
    }
  }

  private static normalizeInstrumentKey(name: string): string {
    return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  }

  private static isRecognizedInstrument(name: string): boolean {
    return MIDIInstrument.isRecognized(name);
  }

  private static findEntryLine(
    name: string | undefined,
    assignment: string | undefined,
    lines: string[]
  ): number {
    for (let idx = 0; idx < lines.length; idx++) {
      const trimmed = lines[idx].trim();
      if (trimmed.startsWith("//")) continue;
      if (name && assignment) {
        if (trimmed.startsWith(`${name}:${assignment}`)) {
          return idx + 1;
        }
      } else if (name) {
        if (trimmed.startsWith(name) && (trimmed.includes("{") || trimmed.includes(":"))) {
          return idx + 1;
        }
      } else if (assignment) {
        if (trimmed.includes(`:${assignment}@`) || trimmed.includes(`:${assignment}{`)) {
          return idx + 1;
        }
      }
    }
    return 1;
  }

  private static findTokenLocation(
    token: string,
    entryName: string,
    assignment: string | undefined,
    lines: string[]
  ): { line: number; column: number } {
    const startLineIdx = Math.max(0, this.findEntryLine(entryName, assignment, lines) - 1);
    for (let idx = startLineIdx; idx < lines.length; idx++) {
      const colIdx = lines[idx].indexOf(token);
      if (colIdx !== -1) {
        return { line: idx + 1, column: colIdx + 1 };
      }
    }
    for (let idx = 0; idx < lines.length; idx++) {
      const colIdx = lines[idx].indexOf(token);
      if (colIdx !== -1) {
        return { line: idx + 1, column: colIdx + 1 };
      }
    }
    return { line: startLineIdx + 1, column: 1 };
  }
}
