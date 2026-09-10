# RehletShifaa — Claude Code Instructions

`AGENTS.md` is the **canonical project context** for architecture, stable URLs, Docker/Cloudflare setup, project rules, testing strategy, and token-efficiency rules.

## Start rule

Before work:
1. Read `AGENTS.md`.
2. Do **not** independently re-discover the architecture unless the requested task requires information not covered there.
3. Do not read all project docs by default.

For the active commercial-workflow epic, read `docs/commercial-workflow-status.md` only when the task concerns that workflow. Read `docs/end-to-end-workflows.md` or `docs/architecture.md` only when necessary.

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
