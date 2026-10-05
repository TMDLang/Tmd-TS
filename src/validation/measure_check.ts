import { TMDParser } from "../syntax/parser.js";
import { Beat, Sheet } from "../syntax/types.js";
import { TMDMeasureLexerFallback } from "./measure_lexer_fallback.js";

export interface TMDMeasureIssue {
  paragraphName: string;
  instrument: string;
  lineNumber: number;
  measureIndex: number;
  expectedUnits: number;
  actualUnits: number;
  deltaUnits: number;
  noteLength: number;
  beat: Beat;
  snippet: string;
  description: string;
}

function formatIssueDescription(issue: Omit<TMDMeasureIssue, "description">): string {
  if (issue.instrument === "Order") {
    if (issue.paragraphName) {
      return `Playback (line ${issue.lineNumber}): Undefined section '${issue.paragraphName}' in playback (${issue.snippet})`;
    }
    return `Playback (line ${issue.lineNumber}): ${issue.snippet}`;
  }
  if (issue.snippet.startsWith("Unclosed entry")) {
    return `${issue.paragraphName}:${issue.instrument} (line ${issue.lineNumber}): ${issue.snippet}`;
  }
  if (issue.snippet.includes("explicit barlines")) {
    return `${issue.paragraphName}:${issue.instrument} (line ${issue.lineNumber}): ${issue.snippet}`;
  }
  const diffStr = issue.deltaUnits > 0 ? `+${issue.deltaUnits}` : `${issue.deltaUnits}`;
  if (issue.measureIndex === 0) {
    return `${issue.paragraphName}:${issue.instrument} (line ${issue.lineNumber}): Expected ${issue.expectedUnits} measures (${issue.snippet}), found ${issue.actualUnits} measures (${diffStr} measures)`;
  }
  let desc = `${issue.paragraphName}:${issue.instrument} (line ${issue.lineNumber}, measure ${issue.measureIndex}): Expected ${issue.expectedUnits} units (${issue.beat.count}/${issue.beat.noteValue} at <${issue.noteLength}*>), found ${issue.actualUnits} units (${diffStr} units)`;
  if (issue.snippet) desc += `\n  --> | ${issue.snippet} |`;
  return desc;
}

export class TMDMeasureChecker {
  /** Checks parser-valid structural invariants directly from the canonical AST. */
  public static checkSheet(sheet: Sheet): TMDMeasureIssue[] {
    const measureDuration = (Math.max(1, sheet.beat.count) * 4) / Math.max(1, sheet.beat.noteValue);
    const issues: TMDMeasureIssue[] = [];
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
          issues.push({ ...issueObj, description: formatIssueDescription(issueObj) });
        }
      }
    }
    return issues;
  }

  public static check(source: string): TMDMeasureIssue[] {
    const astIssues = (() => {
      try {
        return TMDMeasureChecker.checkSheet(TMDParser.parse(source));
      } catch {
        return [];
      }
    })();
    return [...astIssues, ...TMDMeasureLexerFallback.check(source)];
  }
}
