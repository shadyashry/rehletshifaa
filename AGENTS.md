# Codex Project Instructions

## Start here (current work)

The active epic is the proposal-to-patient **commercial workflow** on branch
`codex/end-to-end-care-platform`. Before changing related code, read
**[`docs/commercial-workflow-status.md`](docs/commercial-workflow-status.md)** — it is the
handoff: what is implemented, the money model, migrations, tests, and the remaining backlog
(the Keycloak theme is the main open item). Behaviour is in
[`docs/end-to-end-workflows.md`](docs/end-to-end-workflows.md); structure in
[`docs/architecture.md`](docs/architecture.md).

## Running the local stack (Docker Compose)

The live local environment is served through Cloudflare quick tunnels (`*.trycloudflare.com`),
whose URLs are baked into the containers by the **tunnel overlay** `docker-compose.tunnel.yml`.

- To (re)build or start the stack, ALWAYS include the overlay:

  ```bash
  docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up --build -d
  ```

- NEVER run a bare `docker compose up` / `--build` (base file only): it recreates
  keycloak/backend/frontend/minio with `localhost` config and rebuilds the frontend with
  `localhost` API URLs baked in, breaking the tunnel-served portal. NEVER delete Docker volumes
  (especially `keycloak-data`).
- Ports: frontend 3000, backend 8080, keycloak 8180, minio 9000/9001, mailpit 8025.
- `deploy/oracle/` is the separate public VM stack; do not run it locally.

## Build, test, migrations

- Backend is **offline Maven**: `cd backend && mvn -o -q test`. Do not add a dependency missing
  from local `~/.m2` (breaks the offline build). Frontend gate: `cd frontend && pnpm typecheck`.
- Flyway migrations are **additive and immutable** — never edit `V1`–`V15`; add `V16+`. Keep them
  H2-safe (see the status doc: `TIMESTAMP WITH TIME ZONE`, no partial indexes, one `ADD COLUMN`
  per `ALTER`, fixed seed UUIDs).

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
