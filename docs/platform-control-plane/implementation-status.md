# Platform Control Plane — implementation status

Updated: 2026-09-13. **Phase 0 complete. Phase 1A has not started.**

## Checkout and scope

- Current/intended feature branch: `codex/platform-control-plane`.
- Branch already created before this session from `codex/2026-healthcare-ux`, base SHA `1fa84e41e9cce73818adfe11d335e4763c12eafa`, confirmed by reflog. Retained the intended branch rather than creating a duplicate.
- Phase 0 starting HEAD: `458359895209eccfea011c76cd6a46bc38dc7bae` (canonical specification commit).
- Pre-existing dirty files: none.
- Scope: inventory, dependency preflight, persistent design and executable handoff only.
- Phase 0 artifact commit: `f1cc71c9f2d86d7ee59f183a39461bb2f831e31e` (`docs(platform): complete Phase 0 inventory and technical handoff`). A documentation-only follow-up records this SHA; no push was performed.

## Completed

- Read AGENTS.md, CLAUDE.md, the supplied blueprint/master/playbook, commercial handoff and relevant current workflow/architecture sections.
- Persisted byte-identical canonical copies under `blueprint.md` and `master-implementation-spec.md`; originals and acceptance matrix remain in `specs/`.
- Inventoried legacy roles/checks, clinician/staff/credential data, catalog, availability, coordinator ownership, work/current actions, transitions, audit/outbox and admin surfaces.
- Saved a source-location index: 306 matched lines across 34 production source files; classifications distinguish identity, business, workflow/resource, supervisory and browser concerns.
- Confirmed latest Flyway migration is V30; V31 is currently next, subject to recheck.
- Selected the documented Flowable 7.2.0 process-starter pin, inspected local cache, and recorded the offline prerequisite. Added no dependency.
- Reconciled repository specifics: JdbcClient repositories for new modules; legacy role adapter; existing case_tasks projections; separate provider tenants; no inherited unrestricted admin grant; immutable proposal pricing.

## Files changed

Only documentation under `docs/platform-control-plane/`:

- `blueprint.md`
- `master-implementation-spec.md`
- `technical-decisions.md`
- `migration-inventory.md`
- `implementation-status.md`
- `test-status.md`
- `phase-notes/phase-0-role-checks.tsv`

Migrations added: **none**. API contracts added/changed: **none**. Application/security/realm/config/dependency changes: **none**. No runtime cutover, Docker rebuild or deployment.

## Verification and blockers

See [test-status.md](test-status.md) for commands and scope. Offline Maven validate passed outside the sandbox after an environment-only cache-path failure. Documentation integrity checks are recorded there. No application test suite was needed for documentation-only Phase 0; previous handoff counts are historical, not a fresh test result.

**DEPENDENCY-01:** Flowable artifacts are absent from the normal local cache. Repository policy prohibits adding uncached dependencies. This is a future Phase 4B engine integration prerequisite, not a blocker to Phase 1A. No runtime compatibility smoke test has passed yet. See technical-decisions.md §8 for evidence and resolution steps. No other Phase 0 blocker remains.

## Compatibility notes

Keep existing identity subjects/seed IDs, ActorRole/realm composites, accepted-assignment requirements, lead reporting scope, patient delegation, credential expiry, proposal snapshots, money/FX gates, secure links, patient identity/account setup, payment ledger, case_tasks and notification semantics. Use the actual CaseTransitionPolicy map, not stale prose, for V1 parity. Keep all live authorization and workflow facts uncached.

## NEXT EXACT ACTIONS — Phase 1A (not authorized in Phase 0)

Only execute these when the user authorizes the next phase. Read this handoff and technical-decisions.md, then master §5.1–5.6, §11, §14 Phase 1 and playbook §5. Do not reread the repository broadly.

1. Confirm current branch and working tree; inspect migration filenames for conflicts. Keep `codex/platform-control-plane` and preserve any new unrelated work. Next expected migration is V31.
2. Create typed records/enums in `backend/src/main/java/com/rehletshifaa/access/domain/`: `PermissionDefinition.java`, `PermissionRisk.java`, `ScopeType.java`, `ActorType.java`, `ChannelEntitlement.java`, `RoleTemplate.java`, `RoleTemplateVersion.java`, `RolePermissionGrant.java`, `RoleAssignment.java`, `ResourceRelationship.java`, `RelationshipType.java`. Explicit actor types are distinct from configurable template keys. Use a typed scope target, effective dates and optimistic version fields.
3. Add `access/application/PermissionCatalog.java` for registered keys/metadata/dependencies/conflicts. Derive action keys from migration-inventory.md and master §5.3; mark future capabilities unavailable for execution until implemented. No arbitrary runtime-created keys, wildcard all-access grant, or Keycloak role expansion.
4. Add `backend/src/main/resources/db/migration/V31__access_governance_foundation.sql` (renumber if necessary) for the six planned tables and indexes/FKs/checks in technical-decisions.md §4. Seed the 19 default templates with stable UUIDs and least-privilege metadata/grants. No blanket role assignments. Use explicit unresolved organization targets only as inactive foundation data until provider verification exists; no provider access can be enabled in this phase.
5. Implement `access/infrastructure/PermissionCatalogRepository.java`, `RoleTemplateRepository.java`, `RoleAssignmentRepository.java`, `ResourceRelationshipRepository.java`, `AccessAuditRepository.java` using bound JdbcClient parameters and SqlValues. Repositories own SQL; services own transactions. Preserve module acyclicity and existing audit storage.
6. Add `access/application/RoleTemplateService.java`, `RoleAssignmentService.java`, `ResourceRelationshipService.java` for catalog validation, draft/version lifecycle, immutable published grants, assignment effective/revocation periods, scope validation, no self-relationship where invalid, and duplicate/overlap rejection. Serialize concurrent edits/assignments on a stable parent key and audit actual changes. These are internal persistence services; do not expose unauthenticated or partially authorized endpoints.
7. Add focused tests under `backend/src/test/java/com/rehletshifaa/access/`: `PermissionCatalogTest.java`, `AccessPersistenceTest.java`, `RoleTemplateLifecycleTest.java`, `RoleAssignmentScopeTest.java`. Prove unknown permissions, dependencies/conflicts, unique versions, published immutability, effective expiry/revocation, tenant separation in repository queries, concurrent duplicate prevention, rollback/audit and stale-version behavior. Fixtures use local subjects and deterministic clock, not real Keycloak accounts.
8. Run the focused access tests, then `FlywayMigrationTest` and `ArchitectureRulesTest` offline. Since schema is shared, run the normal `mvn -o -q test` gate once after focused tests pass. Inspect failures before expanding scope. No frontend/E2E run unless frontend/API behavior is changed contrary to this phase boundary.
9. Update these status/decision/inventory/test docs with actual filenames, migration number, checks and commit SHA; commit only coherent Phase 1A files. Stop before Phase 1B authorization enforcement/APIs, provider implementation, Flowable integration or frontend UI.
