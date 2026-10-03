# RehletShifaa — Claude Code Instructions

`AGENTS.md` is the **canonical project context** for architecture, stable URLs, Docker/Cloudflare setup, project rules, testing strategy, and token-efficiency rules.

## Start rule

Before work:
1. Read `AGENTS.md`.
2. Do **not** independently re-discover the architecture unless the requested task requires information not covered there.
3. Do not read all project docs by default.

For the active commercial-workflow epic, read `docs/commercial-workflow-status.md` only when the task concerns that workflow. Read `docs/end-to-end-workflows.md` or `docs/architecture.md` only when necessary.

## Interrupted Codex takeover

If Codex stops unexpectedly because of a usage or context limit, resume from the repository state; do not restart
the task from chat history and do not reset or discard uncommitted changes.

The Markdown file Codex is currently working from and updating is:

- `docs/platform-control-plane/section-1-implementation-status.md`

For a takeover:

1. Read `AGENTS.md` and the live implementation checkpoint above.
2. Inspect `git status` and only the diffs relevant to the checkpoint's current/next slice.
3. Treat existing modified and untracked files as in-progress Codex/user work and preserve them.
4. Continue from **Next Section 1 slice**, verifying inherited work before extending it.
5. Update the same checkpoint with delivered work, tests, open gaps, and the next exact action before stopping.

Use `docs/platform-control-plane/platform-users-and-virtual-clinics-execution-plan.md` and
`docs/platform-control-plane/platform-users-and-virtual-clinics-requirements.md` only for the sections needed by
that next slice.

## Claude-specific operating mode

Prefer **review/diagnosis first, targeted edits second**.

For each task:
- inspect only directly relevant files;
- use targeted symbol/text search instead of repository-wide exploration;
- avoid re-reading unchanged files;
- avoid long narrative reasoning in responses;
- do not repeat architecture already defined in `AGENTS.md`;
- make the smallest correct patch;
- run the smallest relevant verification;
- stop when acceptance criteria are met.

When asked to review without modifying:
- do not edit files;
- report only actionable findings;
- prioritize by severity;
- include exact file/symbol references;
- avoid speculative redesigns.

When debugging:
- trace one failing request/path end-to-end;
- inspect only logs near the failure;
- distinguish browser/CORS, Cloudflare routing, Keycloak/OIDC, backend, MinIO/S3, database, and frontend issues before expanding scope.

## Output style

Keep responses concise:
- root cause / decision;
- files changed or findings;
- verification performed;
- any unresolved blocker.

Do not restate the project architecture, permanent URLs, or Docker rules unless directly relevant to the result.
