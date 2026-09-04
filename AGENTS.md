# Codex Project Instructions

## Token-efficient workflow

Use a proportional verification strategy. Match investigation and testing effort to the risk and scope of the requested change.

For small, isolated, and low-risk changes:

- Inspect only files directly related to the request. Do not explore the entire repository unless the change requires it.
- Reuse the project's existing patterns and components.
- Do not create or update tests for cosmetic, copy, styling, or configuration-only changes unless behavior changes or the user requests tests.
- Run only the smallest relevant test, type-check, lint command, or build check.
- Do not run the full test suite, production build, end-to-end tests, or unrelated checks unless:
  - the change affects shared infrastructure or multiple features;
  - a focused check fails;
  - there is a specific unresolved concern;
  - or the user explicitly requests full verification.
- Run each successful check once. Repeat it only if relevant code changes afterward.
- Do not repeatedly review unchanged files.
- Summarize command output and failures; do not reproduce long logs unless needed for diagnosis.
- Keep progress updates and the final response concise.

## Verification levels

- Copy, color, spacing, and other visual-only edits: inspect the diff and, when useful, run targeted lint or a focused visual check.
- Isolated component changes: run the component's focused test or the smallest relevant type-check.
- Business-logic changes: run the directly related unit tests.
- Shared APIs, authentication, database schema, dependencies, build configuration, or security-sensitive code: run broader impacted checks.
- Before release or merge: run the project's required comprehensive CI checks once.

## User-request override

If the user specifies a testing or verification level, follow that request. Clearly mention any important check that was skipped and why.
