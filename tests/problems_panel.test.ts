import { describe, expect,it } from "vitest";

import { setupProblemsPanelEvents,updateProblemsPanel } from "../web/src/ui/problemsPanel.js";

describe("Problems Panel UI (TDD)", () => {
  it("displays accurate line:column, separating main message and hint", () => {
    const problemsList = { innerHTML: "" } as any;
    const problemsCountBadge = { className: "", textContent: "" } as any;
    const fixAllBtn = { style: { display: "" } } as any;
    const problemsPanel = {
      querySelector: () => fixAllBtn,
    } as any;

    const brokenTmd = `::SCORE::\nintro:Drums@|0|{\n<4*>\n1 2 A 4\n}`;
    updateProblemsPanel(brokenTmd, {
      problemsPanel,
      btnFixProblemsAi: fixAllBtn,
      problemsCountBadge,
      problemsList,
    });

    expect(problemsCountBadge.textContent).toBe("1");
    expect(problemsCountBadge.className).toBe("problems-badge error");
    expect(problemsList.innerHTML).toContain('data-line="4"');
    expect(problemsList.innerHTML).toContain('data-col="5"');
    expect(problemsList.innerHTML).toContain("Ln 4:5");
    expect(problemsList.innerHTML).toContain("problem-item-hint");
    expect(problemsList.innerHTML).toContain("If writing percussion/drums");
  });

  it("navigates to exact line and column range when clicking syntax error item", () => {
    let scrolledStartLine = -1;
    let scrolledStartCol = -1;
    let scrolledEndCol = -1;

    const mockEditor = {
      scrollToRange: (sLine: number, sCol: number, eLine: number, eCol: number) => {
        scrolledStartLine = sLine;
        scrolledStartCol = sCol;
        scrolledEndCol = eCol;
      },
      scrollToLine: () => {},
    } as any;

    let clickHandler: Function | null = null;
    const mockList = {
      addEventListener: (evt: string, fn: Function) => {
        if (evt === "click") clickHandler = fn;
      },
    } as any;

    const mockPanel = {
      classList: { toggle: () => {}, contains: () => false },
      querySelector: () => null,
    } as any;

    setupProblemsPanelEvents(
      {
        problemsPanel: mockPanel,
        problemsList: mockList,
        problemsCountBadge: {} as any,
      },
      mockEditor,
      () => {}
    );

    expect(clickHandler).not.toBeNull();

    // Simulate clicking an item with data-line="4", data-col="5", data-len="1"
    const fakeTarget = {
      closest: (selector: string) => {
        if (selector === ".problem-item") {
          return {
            dataset: { line: "4", col: "5", len: "1" },
          };
        }
        return null;
      },
    };

    clickHandler!({
      target: fakeTarget,
      stopPropagation: () => {},
    });

    expect(scrolledStartLine).toBe(4);
    expect(scrolledStartCol).toBe(5);
    expect(scrolledEndCol).toBe(6);
  });

  it("surfaces TmdScoreValidator Stage 2-6 semantic errors and warnings in Problems Panel (#44)", () => {
    const problemsList = { innerHTML: "" } as any;
    const problemsCountBadge = { className: "", textContent: "" } as any;
    const fixAllBtn = { style: { display: "" } } as any;
    const problemsPanel = {
      querySelector: () => fixAllBtn,
    } as any;

    const semanticScore = `::SCORE::
** Semantic Check **
!= 120
?= C
<4/4>

A:UnknownMartianZorg@|0|{
  <4*>
  | [1 3 5] - - - |
}
-> A ->#
`;
    updateProblemsPanel(semanticScore, {
      problemsPanel,
      btnFixProblemsAi: fixAllBtn,
      problemsCountBadge,
      problemsList,
    });

    // Should report both E-CHORD-MULTINOTE and W-INSTRUMENT-UNKNOWN
    expect(problemsCountBadge.textContent).toBe("2");
    expect(problemsCountBadge.className).toBe("problems-badge error");
    expect(problemsList.innerHTML).toContain("E-CHORD-MULTINOTE");
    expect(problemsList.innerHTML).toContain("1+3+5");
    expect(problemsList.innerHTML).toContain("W-INSTRUMENT-UNKNOWN");
    expect(problemsList.innerHTML).toContain("UnknownMartianZorg");
  });
});
