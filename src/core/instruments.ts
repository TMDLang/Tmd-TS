import { TMDMacroEvaluator } from './macro.js';
import { Sheet } from './types.js';

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
    const sheet = TMDMacroEvaluator.expandThrowing(rawSheet);
    const distinct = Array.from(
      new Set(
        sheet.entries
          .map((p) => p.assignment)
          .filter((inst): inst is string => Boolean(inst && inst.trim()))
      )
    ).sort();
    if (distinct.length === 0 && fallbackToDefault) {
      return ['Piano'];
    }
    return distinct;
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
