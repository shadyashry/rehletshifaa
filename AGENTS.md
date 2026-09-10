# RehletShifaa — Codex Instructions

## 1. Canonical project context

Use this file as the default project context. Do **not** re-discover architecture or re-read broad docs unless the task requires it.

Current working branch:
- `codex/end-to-end-care-platform`

Current active epic:
- Proposal-to-patient **commercial workflow**
- Handoff/status: `docs/commercial-workflow-status.md`
- Detailed workflows: `docs/end-to-end-workflows.md`
- Architecture reference: `docs/architecture.md`

Read `docs/commercial-workflow-status.md` only for commercial-workflow tasks. Read `docs/end-to-end-workflows.md` or `docs/architecture.md` only when the requested change genuinely depends on them.

## 2. Stable development environment

The local Docker stack is exposed through a **named Cloudflare Tunnel** (`rehletshifaa-dev`). Do not use or introduce `trycloudflare.com` URLs.

Permanent development URLs:
- Frontend: `https://dev.rehletshifaa.com`
- Backend API: `https://api-dev.rehletshifaa.com`
- Keycloak: `https://auth-dev.rehletshifaa.com`
- MinIO/files: `https://files-dev.rehletshifaa.com`
- Mailpit: `https://mail-dev.rehletshifaa.com`

Local ports:
- Frontend `3000`
- Backend `8080`
- Keycloak `8180`
- MinIO API `9000`
- MinIO console `9001`
- Mailpit `8025`

Docker files:
- Base: `docker-compose.yml`
- Stable tunnel overlay: `docker-compose.tunnel.yml`

Always start/rebuild the development stack with:
```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
```

Never:
- run a base-only rebuild for the tunnel-served environment;
- delete Docker volumes unless explicitly requested;
- replace stable domain URLs with localhost or temporary tunnel URLs;
- expose tunnel secrets or copy `.env` credentials into source.

The `cloudflared` connector runs in Docker via the tunnel overlay and uses `CLOUDFLARE_TUNNEL_TOKEN` from local `.env`.

Keycloak web client:
- client id: `rehletshifaa-web`
- redirect URI: `https://dev.rehletshifaa.com/*`
- web origin: `https://dev.rehletshifaa.com`
- localhost equivalents may remain for local browser testing.

MinIO browser uploads must allow:
- `http://localhost:3000`
- `https://dev.rehletshifaa.com`

## 3. Technology map

Frontend:
- Next.js
- public runtime/build values use `NEXT_PUBLIC_*`
- important: `NEXT_PUBLIC_*` changes require a frontend rebuild

Backend:
- Spring Boot
- PostgreSQL
- Flyway
- Keycloak OIDC/JWT
- MinIO S3-compatible storage
- ClamAV document scanning
- Mailpit SMTP in local/dev

Identity:
- Keycloak realm: `rehletshifaa`
- realm source: `infrastructure/keycloak/realm-rehletshifaa.json`

Deployment:
- local/dev uses Docker Compose + named Cloudflare Tunnel
- `deploy/oracle/` is a separate public VM deployment; do not use it for local tasks unless explicitly requested

## 4. Token-efficient working rules

Default behavior:
1. Inspect only the files directly relevant to the request.
2. Use targeted search for exact symbols, endpoints, configuration keys, or error messages.
3. Do not scan the whole repository, all docs, all tests, or all logs unless necessary.
4. Reuse known project facts from this file instead of re-deriving them.
5. Reuse existing implementation patterns before creating new abstractions.
6. Prefer the smallest correct patch.
7. Do not re-open unchanged files repeatedly.
8. Do not repeat already-successful commands unless code affecting them changed.
9. Summarize long logs; inspect only the lines around the failure.
10. Keep progress updates and final responses concise.

For debugging, start from the failing boundary:
- browser/network error -> inspect the called frontend code + endpoint only;
- API `4xx/5xx` -> inspect the matching backend controller/service/security path;
- auth failure -> inspect Keycloak/OIDC config and token path only;
- upload failure -> inspect presign code + MinIO/CORS + exact request headers;
- database failure -> inspect the relevant entity/repository/migration only.

Do not perform broad architecture reviews during a bug fix unless evidence shows the issue is architectural.

## 5. Verification strategy

Use the smallest verification proportional to the change.

Frontend:
- focused component/type check first
- general gate: `cd frontend && pnpm typecheck`

Backend:
- focused relevant test first
- general local gate: `cd backend && mvn -o -q test`
- Maven is offline; do not add dependencies that are absent from local `~/.m2`

Run broader verification only when:
- shared infrastructure/API/auth/database/security is changed;
- a focused check fails;
- multiple modules are affected;
- release/merge verification is requested.

Do not run full production builds or E2E suites for cosmetic/config-only changes unless required.

## 6. Database rules

Flyway migrations are additive and immutable.
- Never edit existing `V1`–`V15`.
- Add `V16+`.
- Keep migrations H2-safe.
- Use `TIMESTAMP WITH TIME ZONE`.
- Avoid partial indexes.
- Use one `ADD COLUMN` per `ALTER`.
- Keep fixed seed UUIDs where existing patterns require them.

## 7. Change discipline

Before editing:
- identify the minimum affected files;
- state a short implementation plan only if the task is non-trivial.

While editing:
- preserve existing behavior outside task scope;
- do not rewrite unrelated code;
- do not change public contracts without need;
- never commit secrets.

After editing:
- run the smallest relevant verification once;
- report changed files, key behavior change, and verification result;
- mention any important check intentionally skipped.

## 8. User override

If the user explicitly requests broader analysis, exhaustive verification, refactoring, or a different testing level, follow that request.
