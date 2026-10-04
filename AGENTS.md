# Project Guidelines for AI Agents

## Development Philosophy: Test-Driven Development (TDD)

All AI agents contributing to `Tmd-TS` must strictly follow Test-Driven Development (TDD):

1. **Write Tests First (Red)**:
   - Before writing or modifying any implementation code, write a comprehensive test in `tests/` (using Vitest) that asserts the expected behavior.
   - Run `npm test` to ensure it fails as expected for the right reason.
   - Do not settle for superficial tests (e.g. merely checking `data.length > 0`); verify domain invariants such as rendered duration, timeline positions, event sequencing, or exact pitch/tick offsets.

2. **Implement Minimal Code (Green)**:
   - Implement only the minimal production code necessary to make the failing test pass.
   - Run `npm test` and verify that the test suite now succeeds.

3. **Refactor Cleanly (Refactor)**:
   - Clean up code, remove duplication, optimize resource allocation, and preserve comments/documentation.
   - Re-run `npm run build && npm test` to guarantee no regressions or TypeScript compilation issues occurred.

## Musical Accuracy & Audio Rendering Invariants

- **Timeline & Tempo**:
  - Never hardcode BPM assumptions (e.g., assuming 120 BPM). Always resolve actual durations through the score's timeline.
  - Account for dynamic tempo changes, relative tempo directives (`{!+10}`), and time signature changes across the conductor track.
  - Provide adequate release tails (e.g. 2.5s) on audio rendering so note decays and reverb tails are never clipped.

- **DSL Standards**:
  - Keep TMD notation AST parsers, formatters, and exporters compliant with the specifications outlined in `docs/TMD-Language-Specification.zh-TW.md` and `docs/TMD-Language-Specification.en.md`.
  - Skill documentation bundled with `TmdSkill` must remain in English for universal compatibility with AI tools and LLMs.

## TMD Agent Flow

This section is the canonical repository workflow for AI agents. Compatibility entry points
(`CLAUDE.md`, `GEMINI.md`, and `.github/copilot-instructions.md`) point here and must not
duplicate or override these rules.

Last reviewed: 2026-10-04

### Mission and scope

AI agents working in this repository must leave the codebase in a maintainable, testable,
handoff-ready state. The workflow applies to feature development, bug fixing, large-scale
test expansion, and documentation or agent-instruction changes that affect repository
behavior.

Before acting, classify the task as one or more of:

- Feature development
- Bug fixing
- Test writing or test-suite expansion
- Documentation or agent-instruction maintenance

Keep the change narrowly scoped to the requested outcome. Record unrelated findings as
separate follow-up work instead of including them in the active change.

### Issue and branch gating

- Feature work, bug fixes, and large-scale test expansion require an accessible GitHub Issue
  before production or test code is changed. Record the requirement, scope, and acceptance
  criteria on that Issue.
- Local `gh` requirement: The local environment must have a functional, authenticated GitHub
  CLI (`gh`). If `gh` is missing, unauthenticated, or the ticket is inaccessible, the agent
  cannot verify issue gating and is strictly forbidden from proceeding with code modifications
  or committing. Halt immediately and report the blocker.
- Documentation-only changes may proceed without a ticket when the user explicitly requests
  a direct documentation update; otherwise use the same Issue traceability standard.
- Inspect the current branch before committing. Never commit directly on `main` or `master`.
- Run the linter (`npm run eslint`) before committing. Committing code with lint errors or unverified style is strictly prohibited.
- Use a dedicated topic branch and reference the Issue number in every commit message.
- Do not push, open a pull request, or make other external changes unless the user requests it
  or the current workflow explicitly requires it.

### TDD and verification contract

For every feature, bug fix, or test-suite expansion:

1. Write a precise test first and run it to establish the expected Red failure.
2. Implement the smallest production change that makes the test Green.
3. Refactor without changing behavior and rerun the relevant tests.
4. Before reporting completion or committing, run the full project verification:
   `npm run build`, `npm run eslint`, `npm test`, and `git diff --check`.

Do not commit with failing, skipped, or unexecuted required checks. In particular, always run the linter (`npm run eslint`) before creating a commit. Tests must assert domain
invariants such as timeline positions, rendered duration, event sequencing, exact pitch/tick
offsets, or precise CLI output—not merely non-empty results.

### SSOT, safety, and repository hygiene

- The repository is the source of truth for current implementation, configuration, and setup.
- Issue Tracker as external memory: The repository is a lean projection of the current system,
  while the Issue Tracker serves as durable external memory for both AI agents and humans.
  Agents can and should use the Issue Tracker as external memory—proactively searching past
  issues, PR reviews, and CI logs via `gh` to retrieve context, while recording intermediate
  findings, task milestones, and handoff checkpoints on tickets instead of polluting the
  codebase with scratch notes or development diaries.
- GitHub Issues are the source of truth for historical rationale, decisions, progress, and
  handoff context. Link to repository files instead of copying code into Issues.
- Keep one canonical implementation and one canonical workflow document. Compatibility files
  must point to the canonical source rather than copy policy text.
- Prefer read-only inspection before mutations. Ask for approval before destructive actions,
  external messages, credential use, dependency installation, or broad-scope changes.
- Never expose or commit secrets, tokens, private paths, generated reports, coverage output,
  binaries, caches, or one-off scratch scripts.
- Keep temporary artifacts under an ignored temporary directory such as `./tmp` or the system
  temporary directory. Do not add development diaries or intermediate analysis files to Git.

### Tool and blocker behavior

- Prefer `rg` for repository search and use the project scripts as the validation source of truth.
- If a required Issue, tool, dependency, credential, or external state is unavailable, stop and
  report the exact blocker. Do not invent access or silently weaken the acceptance criteria.
- Do not upload prompts, logs, secrets, or private context to an Issue without explicit human
  approval. Any Issue comment written by an AI agent must identify the AI product/model and the
  supervising human.

### Handoff and final response

When work pauses or changes hands, record on the Issue:

1. Done: completed milestones, branch, and commit hash.
2. Current state and blockers: active files, checks, and unresolved questions.
3. Next action: the exact next command or implementation step.

The final response must state the outcome first, then the changed files, verification commands
and results, commit or branch information, and any remaining blocker or user action.
