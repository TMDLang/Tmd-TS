import { TmdMacroEvaluator } from '../playback/macro.js';
import { DEFAULT_INSTRUMENT, Sheet } from '../syntax/types.js';

export interface SheetExportPrepOptions {
  targetParagraph?: string;
  targetInstrument?: string;
}

/**
 * Common helper functions for querying and resolving instruments from a TMD Sheet.
 * Eliminates duplicate instrument filtering and vocal track heuristic resolution across exporters.
 */
export class SheetInstrumentHelper {
  /**
   * Returns a sorted array of distinct instrument names present in the sheet.
   * If the sheet has no instruments, falls back to `["Piano"]` if fallback is enabled.
   * Automatically expands S-Expression macros so dynamically generated instruments are discovered.
   */
  public static distinctInstruments(rawSheet: Sheet, fallbackToDefault = true): string[] {
    const sheet = TmdMacroEvaluator.expandThrowing(rawSheet);
    return this.distinctInstrumentsFromExpanded(sheet, fallbackToDefault);
  }

  private static distinctInstrumentsFromExpanded(sheet: Sheet, fallbackToDefault: boolean): string[] {
    const distinct = Array.from(
      new Set(
        sheet.entries
          .map((p) => p.assignment)
          .filter((inst): inst is string => Boolean(inst && inst.trim()))
      )
    ).sort();
    if (distinct.length === 0 && fallbackToDefault) {
      return [DEFAULT_INSTRUMENT];
    }
    return distinct;
  }

  /**
   * Expands all S-Expression macros on `rawSheet` once, optionally filters by `targetParagraph`
   * and `targetInstrument`, and returns the prepared sheet along with its active instruments.
   */
  public static preparedForExport(
    rawSheet: Sheet,
    fallbackToDefault = false,
    options?: SheetExportPrepOptions
  ): { sheet: Sheet; instruments: string[] } {
    let sheet = TmdMacroEvaluator.expandThrowing(rawSheet);
    if (options?.targetParagraph) {
      const filteredParagraphs = sheet.entries.filter((p) => p.name === options.targetParagraph);
      sheet = {
        ...sheet,
        entries: filteredParagraphs,
        playback: [{ type: 'name', name: options.targetParagraph }],
      };
    }

    let instruments = this.distinctInstrumentsFromExpanded(sheet, false);
    if (options?.targetInstrument) {
      const target = options.targetInstrument === '' ? DEFAULT_INSTRUMENT : options.targetInstrument;
      instruments = instruments.filter((inst) => inst === target);
      if (
        instruments.length === 0 &&
        (options.targetInstrument === DEFAULT_INSTRUMENT || options.targetInstrument === '')
      ) {
        instruments = [DEFAULT_INSTRUMENT];
      }
    } else if (instruments.length === 0 && fallbackToDefault) {
      instruments = [DEFAULT_INSTRUMENT];
    }

    return { sheet, instruments };
  }

  /**
   * Returns `true` if any entry assigned to `instrument` (case-insensitively) contains a `percussion` unit.
   */
  public static containsPercussionUnits(sheet: Sheet, instrument: string): boolean {
    const lower = instrument.toLowerCase();
    return sheet.entries
      .filter((p) => (p.assignment ?? '').toLowerCase() === lower)
      .some((p) =>
        p.sections.some((s) =>
          s.unitGroups.some((g) => g.units.some((u) => u.type === 'percussion'))
        )
      );
  }

  /**
   * Returns `true` if `instrument` is a percussion track by name keyword or by containing `percussion` units.
   */
  public static isPercussionTrack(sheet: Sheet, instrument: string): boolean {
    const lower = instrument.toLowerCase();
    const aliases = [
      'drum',
      'drums',
      'groove',
      'percussion',
      'perc',
      'beat',
      'drumkit',
      'kit',
      'cajon',
      'snare',
      'kick',
      'hihat',
    ];
    if (aliases.some((a) => lower.includes(a))) {
      return true;
    }
    return this.containsPercussionUnits(sheet, instrument);
  }

  /**
   * Returns `true` if `instrument` conventionally uses bass clef (`F` clef on line 4).
   */
  public static isBassClefInstrument(instrument: string): boolean {
    const lower = instrument.toLowerCase();
    const bassKeywords = [
      'bass',
      'cello',
      'tuba',
      'contrabass',
      'bassoon',
      'trombone',
      'baritone',
      'timpani',
    ];
    return bassKeywords.some((k) => lower.includes(k));
  }

  /**
   * Returns `true` if `instrument` is a dedicated chord-symbol assignment (`CHORD` or `CHORDS`).
   */
  public static isChordSymbolTrack(instrument: string): boolean {
    const lower = instrument.trim().toLowerCase();
    return lower === 'chord' || lower === 'chords';
  }

  /**
   * Resolves a target vocal instrument for singing-synthesis exporters (VSQ, VSQX, UST).
   * Checks requested instrument first, then matches vocal regex, or falls back to first track.
   */
  public static resolveVocalInstrument(sheet: Sheet, requested?: string): string {
    const distinct = this.distinctInstruments(sheet, false);
    if (requested && distinct.includes(requested)) {
      return requested;
    }

    // Tier 1: Explicit primary vocal keywords (e.g. Vocal, MainVocal, LeadVocal, 主唱, 人聲, 歌)
    const tier1Regex = /^(main_?vocal|lead_?vocal|vocal|voice|主唱|人聲|歌|vo)$/i;
    const tier1Matched = distinct.find((inst) => tier1Regex.test(inst.trim()));
    if (tier1Matched) return tier1Matched;

    // Tier 2: Contains vocal / virtual singer tokens, excluding accompaniment/solo instrument indicators
    // (e.g., exclude guitar_lead, synth_lead, backing_vocal, vocal_harm if primary is available)
    const isExcluded = (name: string) => /backing|harm|choir|guitar|synth|pad|bass|drum|beat|solo/i.test(name);
    const tier2Regex = /vocal|voice|miku|utau|teto|sing/i;
    const tier2Matched = distinct.find((inst) => tier2Regex.test(inst) && !isExcluded(inst));
    if (tier2Matched) return tier2Matched;

    // Tier 3: Melody or lead keywords (not excluded)
    const tier3Regex = /melody|lead|主旋律/i;
    const tier3Matched = distinct.find((inst) => tier3Regex.test(inst) && !isExcluded(inst));
    if (tier3Matched) return tier3Matched;

    // Tier 4: Any vocal keyword including backing/harm
    const tier4Matched = distinct.find((inst) => /vocal|voice|miku|utau|teto|sing|melody/i.test(inst));
    if (tier4Matched) return tier4Matched;

    return distinct[0] || 'Vocal';
  }
}
