import { TmdParser } from "../syntax/parser.js";
import { Sheet } from "../syntax/types.js";
import type { TmdMeasureIssue } from "./measure_issue.js";
import { formatMeasureIssueDescription } from "./measure_issue.js";
import { TmdMeasureLexerFallback } from "./measure_lexer_fallback.js";

export type { TmdMeasureIssue } from "./measure_issue.js";

export class TmdMeasureChecker {
  /** Checks parser-valid structural invariants directly from the canonical AST. */
  public static checkSheet(sheet: Sheet): TmdMeasureIssue[] {
    const measureDuration = (Math.max(1, sheet.beat.count) * 4) / Math.max(1, sheet.beat.noteValue);
    const issues: TmdMeasureIssue[] = [];
    for (const entry of sheet.entries ?? []) {
      for (const section of entry.sections ?? []) {
        const duration = section.unitGroups.reduce(
          (total, group) => total + Math.max(0, group.length) * 4 / Math.max(1, section.noteLength), 0
        );
        if (duration > measureDuration + 1e-9 && (section.barlinePositions ?? []).length === 0) {
          const measureCount = Math.round(duration / measureDuration);
          const issueObj = {
            paragraphName: entry.name,
            instrument: entry.assignment ?? "",
            lineNumber: entry.line ?? 0,
            measureIndex: 0,
            expectedUnits: measureCount,
            actualUnits: measureCount,
            deltaUnits: 0,
            noteLength: section.noteLength,
            beat: sheet.beat,
            snippet: "Multi-measure section requires explicit barlines",
          };
          issues.push({ ...issueObj, description: formatMeasureIssueDescription(issueObj) });
        }
      }
    }
    return issues;
  }

  public static check(source: string): TmdMeasureIssue[] {
    const astIssues = (() => {
      try {
        return TmdMeasureChecker.checkSheet(TmdParser.parse(source));
      } catch {
        return [];
      }
    })();
    return [...astIssues, ...TmdMeasureLexerFallback.check(source)];
  }
}
