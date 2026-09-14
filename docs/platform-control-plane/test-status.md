# Platform Control Plane — verification status

Updated 2026-09-14. Phases 1–3 remain green; Phase 4A is complete and accepted at the offline backend verification boundary. Phase 4B remains unstarted.

## Phase 4A verification — 2026-09-14

- Focused offline gate: `mvn -o -q '-Dtest=JourneyGraphTest,JourneyDefinitionIntegrationTest,JourneyDefinitionConcurrencyTest,FlywayMigrationTest' test` passed **22 tests, zero failures/errors/skips**. The initial run caught a missing-actor null dereference (fixed); HTTP context and tenant FK fixture corrections were verified in the final focused run.
- Final full offline gate: `mvn -o -q test` passed **344 tests / 35 suites, zero failures/errors/skips**. This includes the subsequently added API-channel grant and audit-history assertions. Final Phase 4A classes contribute 22 tests: graph 14, lifecycle/security integration 7 and database concurrency 1.
- Graph coverage: valid linear and conditional routes, missing/unsupported actor/action, incompatible stage/action, unreachable nodes, dangling transitions, no completion, invalid terminal nodes, rejected cycles, incomplete branches, invalid conditions and SLA/timer settings. Deterministic true/false branch selection and missing-fact/wait behavior are verified.
- Lifecycle/security coverage: explicit canonical definition and initial draft creation, validation/simulation/submission, independent publish, immutable published snapshots, cloning/version numbers, retirement, stale draft conflicts, edit invalidation of saved evidence, manager/publisher separation, former-editor rejection after role replacement, dormant cutovers, recent authentication, ADMIN_WEB/API grants, no-role JWT HTTP authorization, mismatched definition/version and tenant-scoped grant denial.
- Concurrency/audit: two writers produce exactly one successful revision; two simultaneous clones produce one draft; a rolled-back edit leaves both graph revision and successful audit count unchanged. Published events and authorized history retrieval are checked; production case/task/assignment/outbox counts remain unchanged by simulation. The simulator has only a pure graph-validator dependency and cannot invoke production projections or external services.
- Impacted/full suites include all existing Access Governance, provider credential/readiness/pricing, Phase 3 assignment/concurrency, current case transitions and patient/commercial/payment flows, WorkItem/WaitingOn behavior, outbox, security/CORS and architecture checks. No existing authoritative case/runtime implementation was modified.
- Flyway validates and applies all 37 additive migrations on fresh H2 PostgreSQL-mode schemas. Canonical specs and V1–V36 are unchanged. No frontend changes; frontend/E2E, live PostgreSQL, Docker/tunnel, Keycloak, external delivery and Flowable checks were intentionally not run. Domain publication always reports NOT_DEPLOYED and is not a deployment certification.
- The normal sandbox resolved Maven to inaccessible `C:\.m2\repository`; authorized offline execution reused `C:\Users\hp\.m2` successfully. No dependencies were added/downloaded.
## Phase 3 verification — 2026-09-14

- Recovered reports: `CoordinatorScoringTest` 3/3, `CoordinationConcurrencyTest` 1/1 and `FlywayMigrationTest` 1/1 passed; the integration report had 11 passes and one effective-period boundary error. The working-tree microsecond normalization postdated that report and the fresh rerun passed.
- Focused final Phase 3 set: **17 tests, 0 failures/errors/skips** across scoring, routing integration, database concurrency and Flyway V1–V36.
- Impacted access/provider/Journey/WorkItem/outbox/security/architecture set: **128 tests, 0 failures/errors/skips**. This includes access cutover/default-deny, provider tenant/readiness, Case Owner versus WorkItem preservation, legacy Journey compatibility, outbox delivery, CORS/authenticated route exposure and architecture rules.
- Full offline backend: **322 tests / 32 suites, 0 failures/errors/skips**. Fresh H2 PostgreSQL-mode schemas validate and migrate through V36.
- Phase 3 coverage includes eligible continuity; preferred Coordinator success and inactive/unavailable/over-capacity fallback; preferred/team and weighted scoring paths; deterministic tie-break under shuffled input; no-candidate queue/escalation; manual assign/reassign and mandatory reason; invalid/missing staff, dormant grants, revoked membership and cross-tenant/provider denial; durable replay/conflict; concurrent duplicate/stale/manual-vs-auto/global-capacity races; recorded policy/algorithm/candidate explanations; shadow matching/adoption and legacy comparison; queue resolution audit; notification deduplication; and preservation of non-Coordinator tasks and case status.
- `git diff --check` and canonical-specification diff are clean after final reconciliation. No frontend files changed. Live PostgreSQL, Docker/tunnel, Keycloak, browser and delivery-provider validation remain intentionally unrun deployment checks.

## Phase 2C verification — 2026-09-14

- Focused `ProviderOperationalSetupIntegrationTest` passed 6 tests covering organization/Consultant/Associate inheritance, effective resolution, legacy catalogue synchronization, history, overlap/currency/stale-write validation, weekly timezone resolution, leave/blocked/extra exceptions, exception update/removal, Practice Manager exact scope, cross-tenant denial, Finance separation, Consultant self-management opt-in and real readiness facts.
- Focused Flyway, Permission Catalog, Authorization Service, Role Assignment, Access Governance, architecture, Phase 2B credential/readiness and legacy `PricingCatalogService` regressions passed after the capability cutover was made explicit.
- Full offline backend: **306 tests / 29 suites, 0 failures/errors/skips**. Fresh H2 PostgreSQL-mode migration validated and applied V1 through V35.
- Existing commercial regression coverage verifies frozen proposal currency/FX/margin snapshots and all proposal/payment flows remained green. Phase 2C publication updates only `consultant_service_catalog` for future selections and never updates proposal tables.
- `git diff --check` passed. Canonical specification diff is empty.
- No frontend files changed. Frontend, live PostgreSQL, Docker/tunnel, Keycloak, MinIO/ClamAV and browser checks were intentionally not run.

## Phase 2B verification — 2026-09-14

- Focused Phase 2B suites passed: `AccessGovernanceIntegrationTest`, `ProviderOrganizationIntegrationTest` and `ProviderCredentialIntegrationTest`. They cover tracked identity recovery/retry, trusted verifier delegation, onboarding boundaries, immutable sealed evidence, correction/rejection/renewal, self/submitting-reviewer denial, Provider Operations separation, Associate supervision, evidence IDOR, readiness, activation replay, expiry events/reminders and ambiguous multi-provider legacy compatibility.
- Impacted security/integration set passed: provider/access catalog and authorization, Flyway, architecture, Journey compatibility, secure journey corrections, HTTP security and notification delivery.
- Full offline backend passed after the implementation changes: **300 tests in 28 suites, zero failures/errors/skips**. Flyway validated and migrated a fresh H2 PostgreSQL-mode schema through V34.
- Focused reruns also caught and verified fixes for immediate membership precision, invalid decision-state persistence, rejected-scan rollback, untrusted verifier subject registration, effective-access provider resolution and immutable expiry reconciliation.
- No frontend files changed, so frontend/build/browser suites were not rerun. Live PostgreSQL, Keycloak, MinIO/ClamAV, Docker/tunnel and deployment checks remain intentionally unrun and are not implied by mocked/H2 integration tests.

| Check | Result | Evidence / boundary |
|---|---|---|
| Branch/status/log at resume | PASS | `codex/platform-control-plane`, HEAD `3a184b0`; unstaged and untracked interrupted work preserved, no index changes initially |
| Recovered prior access reports | Historical | 14 passed, one concurrency failure; handoff still said Phase 0. The working-tree seed-date fix postdated the failed report |
| Focused concurrency rerun | PASS | Current interrupted source already fixed fixture effective dates; one successful grant/edit under races; subsequent audit-rollback assertion also passed |
| Focused access + Flyway + architecture | PASS | `mvn -o -q '-Dtest=Access*Test,AuthorizationServiceTest,PermissionCatalogTest,FlywayMigrationTest,ArchitectureRulesTest' test`; 17 access tests, 1 migration test, 8 architecture tests |
| Final reconciliation focus | PASS | `mvn -o -q '-Dtest=IdentityProvisioningPortTest,AccessGovernanceIntegrationTest,AuthorizationServiceTest,PermissionCatalogTest,AccessConcurrencyTest,JourneyServiceIntegrationTest,SecureJourneyCorrectionsTest,SecurityIntegrationTest,CorsIntegrationTest,FlywayMigrationTest,ArchitectureRulesTest' test`; identity boundary, IDOR/SoD/default-deny, immediate-effective timestamps, independent credential review, V31 and architecture all passed |
| Full offline backend | PASS | `mvn -o -q test`; 286 tests in 26 suites, zero failures/errors/skips; Surefire XML |
| Frontend typecheck | PASS | `pnpm typecheck`, including access UI, assignment form and new browser spec |
| Access UI / impacted portal roles | PASS | `pnpm test src/components/platform-control-center src/lib/portal-role-access.test.ts`; 9 tests in 3 files |
| Focused Chromium browser | PASS | `pnpm test:e2e e2e/access-governance.spec.ts --workers=1`; 2 EN/AR tests, desktop/mobile, eleven steps, validate, saved-draft simulation ID, independent publication contract, no horizontal overflow |
| Screenshots | PASS | Four screenshots under `frontend/test-results/access-governance-*/access-{en,ar}-{desktop,mobile}.png`; reviewed at page top with instant scrolling to avoid a full-page capture offset of the global sticky header |
| Whitespace / staged scope | PASS | `git diff --cached --check` passed on the final 12-file reconciliation; the staged stat matched the intended identity, access, journey-test and handoff scope |
| Phase 2A focused provider/access/migration | PASS | `mvn -o -q '-Dtest=ProviderOrganizationIntegrationTest,PermissionCatalogTest,AuthorizationServiceTest,FlywayMigrationTest' test`; 13 tests, zero failures/errors/skips |
| Phase 2A compatibility focus | PASS | Provider + catalog + authorization + Flyway + architecture + identity provisioning + security + JourneyService focused set passed after final IDOR validation |
| Phase 2A full offline backend | PASS | `mvn -o -q test`; **291 tests in 27 suites**, zero failures/errors/skips; Flyway V33, all prior access/clinical/commercial/payment/patient/security regressions included |

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
- PM-001/PM-002: platform-scoped provider creation grants the creator only the created tenant; guessed cross-tenant detail is denied and one subject can hold active memberships in multiple organizations.
- PM-004/PM-005/PM-006: Associate Doctor is a reused licensed practitioner type with explicit SUPERVISES; Practice Manager cannot self-promote to Owner; Assistant is linked only through ASSISTS and has no Consultant submission grant.
- Phase 2A identity/audit: role-free invitation stores the stable external subject and a PENDING membership/pinned role; durable identity-operation state supports reconciliation. Provider creation, membership, identity and relationship changes write audit events.
- Migration compatibility: repeat-safe V33 mapping produces distinct deterministic solo-practice IDs, PENDING_REVIEW/PENDING state, one unchanged practitioner row and no duplicate mapping.

## Environment observations and intentionally unrun checks

- Initial sandbox Maven run could not read an existing Log4j dependency; Vitest/esbuild could not read the parent configuration path. Both passed outside the sandbox using existing dependencies. No downloads or dependency additions.
- The initial UI fixture returned a fresh auth object/function on every render, retriggering refresh and causing three failures; stabilized the fixture to match AuthProvider. Subsequent UI checks passed.
- Browser tests use synthetic identity/API responses with a separate Next.js server on port 3100 and the stable development authority/API configuration. They do not exercise real Keycloak, gateway, PostgreSQL or patient records. Existing development CSP emits a development-only React eval warning; no security header was weakened.
- No Docker rebuild/tunnel deployment or live PostgreSQL migration was performed. H2 migration tests validate V33; PostgreSQL inventory review/migration and explicit review of legacy mappings remain operational rollout steps.
- No production build, frontend checks, live Keycloak invitation, Playwright, Flowable bootstrap, Phase 2B credential/readiness or Phase 2C pricing/availability tests. No frontend changed. Full offline backend regression was run because schema/security/catalog are shared.

## Completion gate

Phase 3 implementation and offline backend verification are complete. The default remains SHADOW and no production/global routing cutover is claimed. Phase 4A may begin only under separate authorization; do not start Phase 4B or Journey runtime cutover.
