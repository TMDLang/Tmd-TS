import { Beat } from "../syntax/types.js";

export interface TmdMeasureIssue {
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

export function formatMeasureIssueDescription(
  issue: Omit<TmdMeasureIssue, "description">
): string {
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
