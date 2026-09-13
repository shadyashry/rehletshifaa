# Platform Control Plane — verification status

Updated 2026-09-13. Phase 1 results from the preserved working branch; no Phase 2 work.

| Check | Result | Evidence / boundary |
|---|---|---|
| Branch/status/log at resume | PASS | `codex/platform-control-plane`, HEAD `3a184b0`; unstaged and untracked interrupted work preserved, no index changes initially |
| Recovered prior access reports | Historical | 14 passed, one concurrency failure; handoff still said Phase 0. The working-tree seed-date fix postdated the failed report |
| Focused concurrency rerun | PASS | Current interrupted source already fixed fixture effective dates; one successful grant/edit under races; subsequent audit-rollback assertion also passed |
| Focused access + Flyway + architecture | PASS | `mvn -o -q '-Dtest=Access*Test,AuthorizationServiceTest,PermissionCatalogTest,FlywayMigrationTest,ArchitectureRulesTest' test`; 17 access tests, 1 migration test, 8 architecture tests |
| Full offline backend | PASS | `mvn -o -q test`; 278 tests in 25 suites, zero failures/errors/skips; `backend/target/phase1-full-backend.log` and Surefire XML |
| Frontend typecheck | PASS | `pnpm typecheck`, including access UI, assignment form and new browser spec |
| Access UI / impacted portal roles | PASS | `pnpm test src/components/platform-control-center src/lib/portal-role-access.test.ts`; 9 tests in 3 files |
| Focused Chromium browser | PASS | `pnpm test:e2e e2e/access-governance.spec.ts --workers=1`; 2 EN/AR tests, desktop/mobile, eleven steps, validate, saved-draft simulation ID, independent publication contract, no horizontal overflow |
| Screenshots | PASS | Four screenshots under `frontend/test-results/access-governance-*/access-{en,ar}-{desktop,mobile}.png`; reviewed at page top with instant scrolling to avoid a full-page capture offset of the global sticky header |
| Whitespace | PASS before staging | `git diff --check`; final staged gate recorded at commit |

## Security and acceptance evidence

- AG-001/AG-010: PermissionCatalogTest and HTTP integration deny unassigned/legacy SYSTEM_ADMIN governance access; only registered access capabilities execute. Technical admin has no clinical/finance/journey bypass.
- AG-002/AG-003: AuthorizationServiceTest isolates organization membership and exact managed-clinician relationships (Dr A vs Dr B); trusted organization status is independently required. Provider resolver tests use synthetic executable metadata; production provider execution stays disabled.
- AG-004/AG-005: Catalog tests reject missing dependencies, incompatible clinical actor types, support/export conflicts and journey maker/checker combinations. Backend publication and assignment enforce the publisher/granter's executable maximum envelope; independent reviewer cannot be the creator or a prior editor. Self-verification denies.
- AG-006: Lifecycle integration proves stale revisions, published immutability, increasing draft versions, duplicate draft rejection, effective publication and retirement.
- AG-007: Effective access returns membership state, source assignment, role/version, scope and explanation; simulation resolves resources server-side, uses the saved draft, keeps policy unchanged and denies unknown membership/resource context. No target authentication borrowing.
- AG-008: Existing ActorContext/JwtRoleConverter and patient representation remain unchanged; compatibility adapter is inventory-only. Full suite includes current commercial/clinical/deposit/patient regression tests; no live OIDC verification claimed.
- AG-009: MockMvc exercises authenticated capability authorization independent of browser visibility, including anonymous/unassigned callers, stale recent-auth claims, and explicit governance grants with no recognized realm roles.
- Audit/concurrency: successful mutation/audit rollback together; authorization denial survives failed service transaction. Duplicate concurrent grants and stale concurrent edits serialize. Bootstrap revocation is not resurrected on reinitialization. Pending provider assignments/relationships cannot activate from request UUIDs.
- UI: backend-derived navigation fails closed; readable capability labels, hidden technical keys, eleven keyboard-operable steps, RTL, denial messages, recoverable errors, pinned assignment and revision-checked revocation.

## Environment observations and intentionally unrun checks

- Initial sandbox Maven run could not read an existing Log4j dependency; Vitest/esbuild could not read the parent configuration path. Both passed outside the sandbox using existing dependencies. No downloads or dependency additions.
- The initial UI fixture returned a fresh auth object/function on every render, retriggering refresh and causing three failures; stabilized the fixture to match AuthProvider. Subsequent UI checks passed.
- Browser tests use synthetic identity/API responses with a separate Next.js server on port 3100 and the stable development authority/API configuration. They do not exercise real Keycloak, gateway, PostgreSQL or patient records. Existing development CSP emits a development-only React eval warning; no security header was weakened.
- No Docker rebuild/tunnel deployment or live PostgreSQL migration was performed. H2 migration tests validate V31; PostgreSQL deployment validation and an explicit initial governance subject remain operational rollout steps.
- No production build, entire Playwright suite, Flowable bootstrap or Phase 2 provider tests. These are outside this Phase 1 implementation boundary. Full offline backend regression was run because the schema/security matcher is shared.

## Completion gate

Implementation, screenshot inspection and verification complete. Commit Phase 1 after the staged whitespace/scope gate, without push/merge. Do not start Phase 2.
