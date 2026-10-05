import { TMDParser } from "../../../src/syntax/parser.js";
import { TMDMeasureChecker, TMDMeasureIssue } from "../../../src/validation/measure_check.js";
import type { TMDWebEditor } from "../editor.js";
import { escapeHtml } from "../html.js";
import { t } from "../i18n.js";

export interface ProblemsPanelElements {
  problemsPanel: HTMLElement;
  btnToggleProblems?: HTMLButtonElement | null;
  btnFixProblemsAi?: HTMLButtonElement | null;
  problemsCountBadge: HTMLElement;
  problemsList: HTMLElement;
}

export interface ProblemFixTarget {
  syntaxError?: {
    message: string;
    line?: number;
    column?: number;
    snippet?: string;
  };
  issues?: TMDMeasureIssue[];
}

let currentIssues: TMDMeasureIssue[] = [];
let currentSyntaxError: { message: string; line: number; snippet?: string } | null = null;

export function updateProblemsPanel(
  text: string,
  elements: ProblemsPanelElements
): TMDMeasureIssue[] {
  const { problemsPanel, btnFixProblemsAi, problemsCountBadge, problemsList } = elements;
  if (!problemsPanel || !problemsList || !problemsCountBadge) return [];

  const fixAllBtn = btnFixProblemsAi || (problemsPanel.querySelector("#btn-fix-problems-ai") as HTMLButtonElement | null);

  // First check if syntax parse fails
  try {
    TMDParser.parse(text);
    currentSyntaxError = null;
  } catch (err: any) {
    const line = err.range?.start?.line ?? 1;
    const column = err.range?.start?.column ?? 1;
    const length = err.range?.length ?? err.text?.length ?? 1;
    const fullMsg = err.message || "Syntax Error";

    // Split main error and hint if present
    let mainMsg = fullMsg;
    let hintMsg = "";
    if (fullMsg.includes("\nHint: ")) {
      const parts = fullMsg.split("\nHint: ");
      mainMsg = parts[0];
      hintMsg = parts[1];
    }

    currentSyntaxError = {
      message: fullMsg,
      line,
    };
    currentIssues = [];

    problemsCountBadge.className = "problems-badge error";
    problemsCountBadge.textContent = "1";
    if (fixAllBtn) fixAllBtn.style.display = "inline-flex";

    problemsList.innerHTML = `
      <div class="problem-item error" data-line="${line}" data-col="${column}" data-len="${length}">
        <div style="display: flex; flex-direction: column; gap: 3px; flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="problem-item-line">Ln ${line}:${column}</span>
            <span class="problem-item-msg">${escapeHtml(mainMsg)}</span>
          </div>
          ${
            hintMsg
              ? `<div class="problem-item-hint" style="font-size: 11px; color: var(--accent-orange, #d29922); padding-left: 2px;">💡 ${escapeHtml(hintMsg)}</div>`
              : ""
          }
        </div>
        <button class="btn btn-sm btn-quick-fix-ai" data-action="fix-ai" title="${escapeHtml(t("problemsFixWithAi"))}">
          ${escapeHtml(t("problemsFixWithAi"))}
        </button>
      </div>
    `;
    return [];
  }

  // If syntax is valid, run TMDMeasureChecker
  const issues: TMDMeasureIssue[] = TMDMeasureChecker.check(text);
  currentIssues = issues;

  if (issues.length === 0) {
    if (fixAllBtn) fixAllBtn.style.display = "none";
    problemsCountBadge.className = "problems-badge valid";
    problemsCountBadge.textContent = "0";
    problemsList.innerHTML = `<div class="problem-empty-hint">${escapeHtml(t("problemsAllValid"))}</div>`;
  } else {
    if (fixAllBtn) fixAllBtn.style.display = "inline-flex";
    problemsCountBadge.className = "problems-badge warning";
    problemsCountBadge.textContent = issues.length.toString();
    problemsList.innerHTML = issues
      .map((issue, idx) => {
        const line = issue.lineNumber || 1;
        const msg = issue.description || `${issue.paragraphName}:${issue.instrument} measure issue`;
        return `
          <div class="problem-item warning" data-line="${line}">
            <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
              <span class="problem-item-line">Ln ${line}</span>
              <span class="problem-item-msg">${escapeHtml(msg)}</span>
            </div>
            <button class="btn btn-sm btn-quick-fix-ai" data-action="fix-ai" data-issue-idx="${idx}" title="${escapeHtml(t("problemsFixWithAi"))}">
              ${escapeHtml(t("problemsFixWithAi"))}
            </button>
          </div>
        `;
      })
      .join("");
  }
  return issues;
}

export function setupProblemsPanelEvents(
  elements: ProblemsPanelElements,
  editor: TMDWebEditor,
  onStateChange: () => void,
  onFixWithAi?: (target: ProblemFixTarget) => void
): void {
  const { problemsPanel, btnToggleProblems, btnFixProblemsAi, problemsList } = elements;
  if (!problemsPanel) return;

  const fixAllBtn = btnFixProblemsAi || (problemsPanel.querySelector("#btn-fix-problems-ai") as HTMLButtonElement | null);

  const toggleCollapsed = () => {
    problemsPanel.classList.toggle("collapsed");
    if (btnToggleProblems) {
      btnToggleProblems.textContent = problemsPanel.classList.contains("collapsed") ? "▲" : "▼";
    }
    onStateChange();
  };

  btnToggleProblems?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCollapsed();
  });

  const problemsHeader = problemsPanel.querySelector(".problems-panel-header");
  problemsHeader?.addEventListener("click", (e) => {
    // Avoid toggling when clicking action buttons inside header
    if ((e.target as HTMLElement).closest("button")) return;
    toggleCollapsed();
  });

  fixAllBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (onFixWithAi) {
      onFixWithAi({
        syntaxError: currentSyntaxError || undefined,
        issues: currentIssues.length > 0 ? currentIssues : undefined,
      });
    }
  });

  problemsList?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const fixBtn = target.closest('[data-action="fix-ai"]') as HTMLElement | null;
    if (fixBtn) {
      e.stopPropagation();
      const issueIdxStr = fixBtn.dataset.issueIdx;
      if (issueIdxStr !== undefined) {
        const idx = parseInt(issueIdxStr, 10);
        const issue = currentIssues[idx];
        if (onFixWithAi) {
          onFixWithAi({
            issues: issue ? [issue] : currentIssues,
          });
        }
      } else {
        // Syntax error fix
        if (onFixWithAi) {
          onFixWithAi({
            syntaxError: currentSyntaxError || undefined,
          });
        }
      }
      return;
    }

    const item = target.closest(".problem-item") as HTMLElement | null;
    if (item && item.dataset.line) {
      const line = parseInt(item.dataset.line, 10);
      const col = item.dataset.col ? parseInt(item.dataset.col, 10) : 1;
      const len = item.dataset.len ? parseInt(item.dataset.len, 10) : 1;
      if (!isNaN(line) && line > 0) {
        if (typeof editor.scrollToRange === "function" && !isNaN(col) && col > 0) {
          editor.scrollToRange(line, col, line, col + len);
        } else {
          editor.scrollToLine(line);
        }
      }
    }
  });
}
