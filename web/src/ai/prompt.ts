import { TmdSkill } from "../../../src/skill.js";
import { GenerateOptions } from "./types.js";

export function buildSystemPrompt(): string {
  return `${TmdSkill.skillMarkdown}

You are an expert composer, orchestrator, and master of TMD (Timebase Mark Down).
Your primary goal is to write or modify TMD musical scores.

CRITICAL SYNTAX RULES:
1. Every score MUST start with '::SCORE::' on line 1.
2. The score-level header must specify Title (** Name **), Speed (!= 120), movable-do base (?= C), and Meter (<4/4>). Use optional key= Bm / key= C when declaring the actual musical tonality.
3. Every track paragraph MUST follow: 'name:instrument@|offset|{ ... }'
   - Always close every opened paragraph '{' with a matching '}'.
4. Every section inside a paragraph MUST start with a note length grid like '<4*>', '<8*>', or '<16*>'.
5. Measure Consistency & Check: The system performs automated measure checking (\`tmd check\` / \`check_tmd\` / Problems Panel). Every measure bounded by '| ... |' must contain the exact expected unit count for the meter and note grid (e.g. 4 units in <4/4> at <4*>, 8 units at <8*>).
6. Accidentals MUST precede octave displacements: write '1'^' (Sharp Do, high octave), NEVER '1^''.
7. Chords are enclosed in brackets: [C], [Dm7], [1], [6m], etc.
8. Tuplet syntax is strictly '(units...)%(dashes)', e.g. '(1 2 3)%(--)'.
9. The playback arrangement at the end MUST start with '->' and terminate with '->#', e.g. '-> intro -> verse -> chorus ->#'. All referenced section names must exist in the score.
10. OUTPUT FORMAT: Output ONLY the complete, valid TMD score inside a single \`\`\`tmd ... \`\`\` code block. Keep any explanations concise and placed after the code block.
`;
}

export function buildUserPrompt(options: GenerateOptions): string {
  const current = options.currentTmd?.trim();
  let baseInstruction = options.prompt;

  if (options.mode === "arrange") {
    baseInstruction = `Please arrange accompaniment for the following score (e.g. add CHORD track, Bass track, and Drums track while keeping the melody intact):\n\n${current}\n\nAdditional User Request: ${options.prompt}`;
  } else if (options.mode === "extend") {
    baseInstruction = `Please develop, continue, or expand the musical motif of the following score (e.g. write the chorus, bridge, or counter-melody):\n\n${current}\n\nAdditional User Request: ${options.prompt}`;
  } else if (options.mode === "debug") {
    baseInstruction = `Please analyze, fix any syntax errors, balance section beat durations, and polish the formatting of this TMD score:\n\n${current}\n\nUser Notes: ${options.prompt}`;
  } else if (options.mode === "reharm") {
    baseInstruction = `Please re-harmonize the following score with richer, colorful jazz/pop chord progressions and voice leading:\n\n${current}\n\nUser Request: ${options.prompt}`;
  } else if (current && options.mode === "compose") {
    baseInstruction = `Current score context:\n\`\`\`tmd\n${current}\n\`\`\`\n\nTask: ${options.prompt}`;
  }

  return baseInstruction;
}

export function extractTmdCode(response: string): string | null {
  const match = response.match(/```(?:tmd)?\s*([\s\S]*?)```/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  if (response.includes("::SCORE::")) {
    const idx = response.indexOf("::SCORE::");
    return response.slice(idx).trim();
  }
  return null;
}

export interface RepairPromptOptions {
  originalPrompt: string;
  faultyTmd: string;
  errorMessage: string;
  line?: number;
  column?: number;
  snippet?: string;
  expectedTokens?: string[];
}

export function buildRepairPrompt(options: RepairPromptOptions): string {
  const lineInfo = options.line ? `Line ${options.line}` : "";
  const colInfo = options.column ? `Column ${options.column}` : "";
  const pos = [lineInfo, colInfo].filter(Boolean).join(", ");
  const expected = options.expectedTokens && options.expectedTokens.length > 0
    ? `Expected tokens: ${options.expectedTokens.join(", ")}`
    : "";

  return `The previous TMD score generated for the request "${options.originalPrompt}" has a TMD syntax error and failed strict validation.

=== PARSER DIAGNOSTIC ===
${pos ? `Location: ${pos}` : ""}
Error Message: ${options.errorMessage}
${expected ? expected : ""}
${options.snippet ? `Offending Code Snippet:\n> ${options.snippet}` : ""}

=== FAULTY TMD SCORE ===
\`\`\`tmd
${options.faultyTmd}
\`\`\`

=== REPAIR INSTRUCTIONS ===
1. Correct the syntax error indicated above according to TMD specification (check bar lines '|', section braces '{}', meter '<4/4>', note octaves, paragraph declarations, and play orders '-> ... ->#').
2. Maintain the original musical intent and track balance.
3. Return the complete corrected score inside a single \`\`\`tmd ... \`\`\` code block.`;
}

export interface ProblemsFixOptions {
  scoreContent: string;
  issues?: Array<{
    paragraphName?: string;
    instrument?: string;
    lineNumber?: number;
    measureIndex?: number;
    expectedUnits?: number;
    actualUnits?: number;
    deltaUnits?: number;
    description?: string;
    snippet?: string;
  }>;
  syntaxError?: {
    message: string;
    line?: number;
    column?: number;
    snippet?: string;
  };
}

export function buildProblemsFixPrompt(options: ProblemsFixOptions): string {
  const issuesList: string[] = [];

  if (options.syntaxError) {
    const loc = options.syntaxError.line ? `Line ${options.syntaxError.line}` : "";
    issuesList.push(`- [Syntax Error] ${loc}: ${options.syntaxError.message}`);
    if (options.syntaxError.snippet) {
      issuesList.push(`  Snippet: > ${options.syntaxError.snippet}`);
    }
  }

  if (options.issues && options.issues.length > 0) {
    options.issues.forEach((issue) => {
      const desc = issue.description || `${issue.paragraphName}:${issue.instrument} (line ${issue.lineNumber}): Expected ${issue.expectedUnits} units, found ${issue.actualUnits} units`;
      issuesList.push(`- [Measure Issue] ${desc}`);
      if (issue.snippet) {
        issuesList.push(`  Measure Snippet: ${issue.snippet}`);
      }
    });
  }

  return `The current TMD musical score has reported issues in the Studio Problems Panel. Please analyze the score and studio problem diagnostics below, fix all discrepancies, and return the complete corrected score.

=== PROBLEMS PANEL DIAGNOSTICS ===
${issuesList.join("\n")}

=== CURRENT TMD SCORE ===
\`\`\`tmd
${options.scoreContent}
\`\`\`

=== FIX REQUIREMENTS ===
1. If there is a syntax error, fix the formatting so the score parses without errors.
2. If there are measure unit discrepancies (e.g. expected 4 units in <4/4> grid, but found 3 units), balance the measure by adjusting note values, adding ties '-' or rests '0' as appropriate for the musical style.
3. Keep the overall musical arrangement, melodies, chords, and section structures intact.
4. Return ONLY the complete, corrected score inside a single \`\`\`tmd ... \`\`\` code block.`;
}
