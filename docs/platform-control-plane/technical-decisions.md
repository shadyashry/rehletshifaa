# Platform Control Plane — technical decisions

Phase 0, 2026-09-13. These are implementation decisions, not implemented features.
Canonical product requirements: [blueprint](blueprint.md), [master spec](master-implementation-spec.md).

## 1. Branch and source of truth

Retain `codex/platform-control-plane`: it is already the intended feature branch, with the canonical specifications committed at `458359895209eccfea011c76cd6a46bc38dc7bae`. The reflog records its creation from `codex/2026-healthcare-ux` at `1fa84e4`; no new redundant branch is needed. Phase 0 began with a clean tree. The older branch name in AGENTS.md and the commercial handoff is historical; the actual checkout wins.

Keep byte-identical copies of the supplied blueprint/master under the canonical continuation filenames. Original package files remain in `specs/`. Implementation reconciliation lives here rather than modifying the supplied documents.

## 2. Module and persistence boundaries

Add `com.rehletshifaa.access`, `provider`, and `coordination` alongside the existing `journey` module. Use `domain`, `application`, `infrastructure`, and thin `api` packages. Reuse UUID, `Clock`, `SqlValues`, `ApiException`, encryption, and transaction conventions.

Most current journey data uses `JdbcClient` directly in application services, not JPA entities. New control-plane persistence will use typed domain records with `JdbcClient` repositories in `infrastructure`; application services own transactions. This satisfies the master spec's repository boundary without rewriting legacy services. No new persistence library is needed.

Keep access evaluation independent of the journey/provider implementation. Define resource/subject facts and the decision contract in access; calling business services supply authoritative facts. Avoid access importing JourneyService while JourneyService imports access. Preserve `ArchitectureRulesTest.businessModulesAreFreeOfCycles`.

## 3. Access foundation and identity compatibility

Engineering registers permissions with risk, scopes, actors, channels, dependencies, conflicts, workflow gating, and recent-auth metadata. Persist a catalog projection using only registered keys. Unknown keys cannot become executable permissions. Seed the 19 default business templates listed in master §5.2. Do not assign them globally merely because they exist.

Phase 1A adds persistence and lifecycle services only. Phase 1B adds `AuthorizationService` and an explicitly bounded `LegacyRoleCompatibilityAdapter`; later phases expand enforcement. Preserve the existing enum, JWT conversion, realm composites, patient/representative access, and endpoint gates until the replacement has parity tests.

Important migration constraint: `JwtRoleConverter` discards roles unknown to `ActorRole`, and `ActorContext.current()` rejects an authenticated subject with no recognized legacy role. Phase 1B must support database-authorized subjects independently of that legacy prerequisite. Adding new role names to Keycloak alone cannot deliver configurable access.

Legacy mappings:

| Current identity role | Intended mapping / constraint |
|---|---|
| DOCTOR | CONSULTANT; retain subject, practitioner ID, credential and assignment checks |
| COORDINATOR, OPERATIONS, FINANCE | Corresponding business templates with current resource scope |
| *_LEAD | Base template plus explicit supervisory scope; reporting visibility does not grant execution rights |
| CREDENTIALING_ADMIN | Explicit provider-onboarding/credential permissions matching migrated operations; never an unrestricted platform grant |
| SYSTEM_ADMIN | PLATFORM_ADMIN technical role; existing broad read/exception privileges stay confined to unmigrated legacy paths, never copied into the new template |
| AUDITOR | COMPLIANCE_AUDITOR with appropriate read scope; no mutation |
| PATIENT_IDENTITY_REVIEWER | Separate patient-identity permission bundle; never clinician credential-verification authority |
| PATIENT / PATIENT_REPRESENTATIVE | Existing ownership and patient_representatives delegation; no staff-template substitution |

Compatibility is not a universal fallback after a new-policy denial. Endpoint cutover must explicitly select the new enforcement path; absence/revocation of a new grant must not resurrect access through an old role. New SYSTEM_ADMIN semantics do not inherit the legacy clinical-access bypass.

## 4. Persistence design for Phase 1A

Planned migration: `V31__access_governance_foundation.sql` (recheck latest number immediately before creating it).

| Table | Key integrity and purpose |
|---|---|
| permission_definitions | Unique registered permission key; metadata persisted by registry synchronization |
| role_templates | UUID, stable template key, label, optional tenant scope, optimistic version |
| role_template_versions | Template FK, unique (template_id, version_number), lifecycle/effective dates, publisher, version column; published grants immutable |
| role_permission_grants | Version + permission FK + scope type; uniqueness for each grant/scope; channels and constraints validated against registry |
| role_assignments | Subject, pinned role-version FK, explicit scope type/target, effective/revoked timestamps, assigning actor, reason |
| resource_relationships | Typed source/target identifiers, organization scope when applicable, relationship type, effective dates/revocation, actor/reason |

Use explicit columns for security-relevant scope and identifiers; bounded serialized metadata only for validated catalog collections, not arbitrary executable policies. `PLATFORM` is explicit, exceptional and audited. Require scope identifiers for tenant/resource-sensitive assignments and deny unresolved organization facts until Phase 2 supplies the provider domain. Phase 1A does not create a fake provider entity or grant access based on an unverified UUID; Phase 2 adds provider FKs/backfill validation before provider enforcement is enabled.

Use UUIDs, timezone-aware timestamps, one ADD COLUMN per ALTER, portable constraints and indexes. Serialize mutation of one template by a row lock and optimistic version checks; enforce monotonically unique versions in the DB. Published versions cannot be edited; assignments pin a version. Reject duplicate overlapping effective assignments/relationships inside a serialized transaction, since partial active indexes are prohibited. Keep historical grants and revocations rather than deleting them. Add lifecycle, stale-write and concurrent-duplicate tests.

Reuse `audit_events` via a new access infrastructure repository. Phase 1A audit records can use entity ID plus reason; add an explicit organization/version/diff projection in a later additive migration where needed. Do not put clinical payloads or secret claims in audit. No live authorization cache.

## 5. Provider and credential migration

Reuse `practitioner_profiles`, `practitioner_credentials`, `staff_members`, existing Keycloak subjects and seed IDs. A provider organization is a distinct tenant; a practitioner remains a person who can belong to organizations. Organization memberships and MANAGES/SUPERVISES/ASSISTS relationships are new data, not inferred from role names or `staff_team_assignments`.

For legacy clinicians, plan deterministic solo-practice organization IDs derived from existing practitioner IDs, with an explicit mapping recorded by the migration. Preserve all practitioner IDs and catalog references. Do not infer membership of a shared clinic from a common specialty/name. Backfill only reviewed mappings, and do not auto-activate organizations merely because a legacy doctor is VERIFIED.

Existing credential decisions operate at profile level. Extend evidence/verification history and required-credential policy; add no-self-verification and independent Associate Doctor verification before enabling new provider activation. Keep the existing expiry job. Existing `medical_documents` evidence is case-oriented: introduce an authorized provider-evidence ownership adapter/model using current storage/scanning rather than attaching evidence to a fabricated patient case.

## 6. Pricing and scheduling

Extend `consultant_service_catalog` and `PricingCatalogService`, preserving existing service IDs and released `proposal_items` snapshots. Add organization defaults and immutable effective price-list versions; clinician override wins over organizational fallback. Keep EGP provider bases, inclusive margin, locked FX, Finance gates and patient-safe DTOs in the current proposal/payment services. Practice pricing authority must remain separate from settlement authority.

Current availability is a profile string, not a schedule. Add timezone-aware weekly templates and exceptions in Phase 2C; integrate the existing availability eligibility check before routing uses schedules. Free-text `appointments` is not an appointment/reservation table.

## 7. Assignment and journey runtime

Reuse `case_assignments` for accepted case responsibility and `case_tasks` for operational work. Preserve coordinator continuity independently from active Operations/Finance/Consultant work. Add first-class coordinator teams, policy versions, effective preferences and decision audit; retain legacy reporting hierarchy separately. Routing starts in shadow mode. Use current per-case locking plus idempotent decision keys and serialized capacity checks before authoritative routing.

The current source of transition truth is `CaseTransitionPolicy`, not the abbreviated happy path in the blueprint. Preserve all recovery/terminal paths and business gates. `CaseActionService`, `StaffWorkService`, `PatientActionService`, `CaseHandoffService` remain operational projections/domain entry points. Note that `CaseActionService.resolve` also reconciles work: it is unsuitable as a pure simulator. Simulation must use synthetic facts without invoking mutating reconciliation.

One global INTERNATIONAL_CARE journey; typed registered actions; deterministic graph-to-BPMN compilation; immutable graph/deployment snapshots. Add version binding for new cases after parity; existing cases remain legacy or explicitly pinned. Never silently migrate active cases. Domain services retain money, identity, documents, clinical decisions and secure-link invariants.

## 8. Flowable preflight decision

Pin the planned dependency to **`org.flowable:flowable-spring-boot-starter-process:7.2.0`**. Do not modify pom.xml during Phase 0.

Evidence checked 2026-09-13:

- Repository parent is Spring Boot **3.5.10**, Java target **21**; local Maven **3.9.16**, Temurin Java **21.0.11**.
- Flowable's [7.2.0 release notes](https://github.com/flowable/flowable-engine/releases/tag/flowable-7.2.0) state its upgrade to Boot 3.5.4. Its [maintainer compatibility response](https://forum.flowable.org/t/runtime-security-exception-after-upgrading-to-java-21-spring-boot-3-5-8-with-flowable-7-0-0/12538/2) confirms the 3.5.x family. This supports version selection for this repository; it is not a passed integration test on Boot 3.5.10.
- The [tagged process-starter POM](https://raw.githubusercontent.com/flowable/flowable-engine/flowable-7.2.0/modules/flowable-spring-boot/flowable-spring-boot-starters/flowable-spring-boot-starter-process/pom.xml) declares autoconfigure, engine, spring and Boot JDBC dependencies. Do not add all-engine/REST/CMMN/IDM starters. Inspect transitives and disable unused engine activation during integration.
- `C:/Users/hp/.m2/repository/org/flowable` is absent. No Flowable dependency currently exists in backend/pom.xml.
- Offline project validation passed outside the sandbox. The first sandbox attempt failed because Maven resolved its local repository to inaccessible `C:\.m2\repository`; this is an environment issue, not a POM failure.

**DEPENDENCY-01:** Flowable and its transitives are not available for the normal offline build. AGENTS.md forbids adding uncached dependencies; the blueprint permits a bootstrap only when environment/user policy allows. No online bootstrap was attempted and no dependency was installed. This blocks engine integration/verification in Phase 4B, not Phase 1A persistence.

Before Phase 4B: perform a policy-authorized one-time bootstrap of the pinned process starter and transitives, inspect the dependency tree under the actual Boot BOM, then return to offline mode and run an embedded-engine deploy/start/complete/timer/restart smoke test on H2 and a PostgreSQL schema test. Keep engine-owned schema management separate from application Flyway migrations; do not fabricate engine tables. Confirm shared transaction rollback between domain work and engine completion, or implement an idempotent outbox adapter if atomic participation cannot be achieved. No homemade production workflow-engine fallback.

## 9. Frontend and rollout

Extend the existing localized portal and its API client. Introduce a control-center component subtree in Phase 5; do not rewrite Portal.tsx in Phase 1. Preserve OIDC/PKCE and the gateway base URL. Use backend effective permissions to render navigation and actions only after corresponding APIs exist. Keep EN/AR and keyboard/non-drag React Flow editing for Phase 6; no frontend dependency additions now.

Implementation sequence and exact entry files: [migration inventory](migration-inventory.md). The next session must follow [NEXT EXACT ACTIONS](implementation-status.md#next-exact-actions--phase-1a-not-authorized-in-phase-0).
