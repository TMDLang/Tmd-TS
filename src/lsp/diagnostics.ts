import { TmdScoreValidator } from "../validation/index.js";
import {
  TmdLSPDiagnostic,
  TmdLSPPosition,
  TmdLSPRange,
} from "./types.js";

export class TmdLSPDiagnosticEngine {
  public static diagnose(source: string): TmdLSPDiagnostic[] {
    const scoreDiagnostics = TmdScoreValidator.validate(source);
    const lines = source.split("\n");

    return scoreDiagnostics.map((diag) => {
      const startLine = Math.max(0, diag.line - 1);
      const startCol = Math.max(0, diag.column - 1);
      const endLine = Math.max(startLine, diag.endLine - 1);
      const defaultEndCol = startLine < lines.length ? lines[startLine].length : 80;
      const endCol =
        diag.endColumn > diag.column
          ? Math.max(startCol + 1, diag.endColumn - 1)
          : Math.max(startCol + 1, defaultEndCol);

      const range = new TmdLSPRange(
        new TmdLSPPosition(startLine, startCol),
        new TmdLSPPosition(endLine, endCol)
      );
      const severity = diag.severity === "error" ? 1 : 2;
      let msg = diag.message;
      if (diag.suggestion && !msg.includes(diag.suggestion)) {
        msg += ` (${diag.suggestion})`;
      }
      let sourceName = "tmd-validator";
      if (diag.rule === "E-MEASURE-BEAT") {
        sourceName = "tmd-measure-checker";
      } else if (diag.rule === "E-SYNTAX") {
        sourceName = "tmd-parser";
      }

      return {
        range,
        severity,
        source: sourceName,
        message: msg,
      };
    });
  }
}

// MARK: - LSP Server Handler & Event Loop
