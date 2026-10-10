import { Sheet, TmdParseError, TmdParser } from "../../../src/syntax/index.js";

export interface ValidationSuccess {
  valid: true;
  sheet: Sheet;
}

export interface ValidationFailure {
  valid: false;
  error: Error;
  message: string;
  line: number;
  column: number;
  snippet: string;
  expectedTokens: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validates a TMD score string, extracting exact line numbers, error messages,
 * expected tokens, and source code snippet for AI diagnostic feedback.
 */
export function validateTmdCode(tmd: string): ValidationResult {
  if (!tmd || !tmd.trim()) {
    return {
      valid: false,
      error: new Error("TMD score is empty"),
      message: "TMD score is empty",
      line: 1,
      column: 1,
      snippet: "",
      expectedTokens: ["::SCORE::"],
    };
  }

  const lines = tmd.split("\n");

  try {
    const sheet = TmdParser.parseThrowing(tmd);
    if (!sheet) {
      return {
        valid: false,
        error: new Error("Missing ::SCORE:: header"),
        message: "Missing ::SCORE:: header",
        line: 1,
        column: 1,
        snippet: lines[0] || "",
        expectedTokens: ["::SCORE::"],
      };
    }
    return {
      valid: true,
      sheet,
    };
  } catch (err: any) {
    let line = 1;
    let column = 1;
    let expectedTokens: string[] = [];
    const message = err.message || "Syntax error parsing TMD score";

    if (err instanceof TmdParseError || err.range?.start) {
      line = err.range?.start?.line ?? 1;
      column = err.range?.start?.column ?? 1;
      expectedTokens = err.expectedTokens ?? [];
    } else {
      const match = message.match(/(?:at|line)\s+(\d+)(?::(\d+))?/i);
      if (match) {
        line = parseInt(match[1], 10) || 1;
        column = match[2] ? parseInt(match[2], 10) : 1;
      }
    }

    const lineIndex = Math.max(0, line - 1);
    const snippet = lines[lineIndex] !== undefined ? lines[lineIndex].trim() : "";

    return {
      valid: false,
      error: err,
      message,
      line,
      column,
      snippet,
      expectedTokens,
    };
  }
}

import { TmdMeasureChecker, TmdMeasureIssue } from "../../../src/validation/measure_check.js";
import {
  TmdScoreDiagnostic,
  TmdScoreValidator,
} from "../../../src/validation/score_validator.js";

export interface ComprehensiveValidationResult {
  syntaxValid: boolean;
  syntaxError?: {
    message: string;
    line: number;
    column: number;
    snippet: string;
  };
  measureIssues: TmdMeasureIssue[];
  diagnostics: TmdScoreDiagnostic[];
  allValid: boolean;
}

export function validateTmdCodeWithIssues(tmd: string): ComprehensiveValidationResult {
  const syntax = validateTmdCode(tmd);
  const diagnostics = tmd && tmd.trim() ? TmdScoreValidator.validate(tmd) : [];
  if (!syntax.valid) {
    return {
      syntaxValid: false,
      syntaxError: {
        message: syntax.message,
        line: syntax.line,
        column: syntax.column,
        snippet: syntax.snippet,
      },
      measureIssues: [],
      diagnostics,
      allValid: false,
    };
  }

  const measureIssues = TmdMeasureChecker.check(tmd);
  const hasErrors = diagnostics.some((d) => d.severity === "error");
  return {
    syntaxValid: true,
    measureIssues,
    diagnostics,
    allValid: measureIssues.length === 0 && !hasErrors,
  };
}
