import { TmdParser } from "../syntax/index.js";
import { TmdMeasureChecker } from "../validation/index.js";
import {
  TmdLSPDiagnostic,
  TmdLSPPosition,
  TmdLSPRange,
} from "./types.js";

export class TmdLSPDiagnosticEngine {
  public static diagnose(source: string): TmdLSPDiagnostic[] {
    const diagnostics: TmdLSPDiagnostic[] = [];

    // 1. Measure consistency check
    try {
      const issues = TmdMeasureChecker.check(source);
      for (const issue of issues) {
        const line = Math.max(0, issue.lineNumber - 1);
        const range = new TmdLSPRange(
          new TmdLSPPosition(line, 0),
          new TmdLSPPosition(line, 80)
        );
        diagnostics.push({
          range,
          severity: 1, // Error
          source: "tmd-measure-checker",
          message: issue.description,
        });
      }
    } catch (_) {}

    // 2. Syntax / Parser check
    try {
      TmdParser.parseThrowing(source);
    } catch (err: any) {
      if (err?.range) {
        const line = Math.max(0, (err.range.start?.line ?? 1) - 1);
        const col = Math.max(0, (err.range.start?.column ?? 1) - 1);
        const len = Math.max(1, err.range.length ?? 1);
        diagnostics.push({
          range: new TmdLSPRange(
            new TmdLSPPosition(line, col),
            new TmdLSPPosition(line, col + len)
          ),
          severity: 1,
          source: "tmd-parser",
          message: err.message || "Parse error",
        });
      } else {
        diagnostics.push({
          range: new TmdLSPRange(
            new TmdLSPPosition(0, 0),
            new TmdLSPPosition(0, 80)
          ),
          severity: 1,
          source: "tmd-parser",
          message: err?.message || "Parse error",
        });
      }
    }

    return diagnostics;
  }
}

// MARK: - LSP Server Handler & Event Loop

