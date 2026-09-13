# Platform Control Plane — technical decisions

Phase 0 plans followed by implemented Phase 1 decisions (§10) and final reconciliation (§11), 2026-09-13.
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

Implementation sequence and exact entry files: [migration inventory](migration-inventory.md). The next session must follow the Phase 2 NEXT EXACT ACTIONS in [implementation status](implementation-status.md).

## 10. Phase 1 implemented decisions (supersedes the Phase 0 plans above)

2026-09-13: current user authorization included full Phase 1 backend and Access Governance UI, so the earlier 1A-only/UI-deferred stopping boundary no longer applies. No Phase 2 provider/business execution has started.

- V31 adds the six originally planned tables plus `access_subjects`, `access_memberships`, `access_bootstrap`. Platform is the explicit reserved scope UUID `00000000-0000-0000-0000-000000000001`; it is not a fake provider organization. Provider membership is a pending foundation record, not trusted verification evidence.
- All role templates are governed centrally under platform ownership. Assignments carry the tenant boundary separately; custom actor types are distinct from template names. A subject can hold multiple tenant assignments. PLATFORM does not match provider tenants.
- Subject creation/mutations serialize on the bootstrap sentinel before subject/template locks. This deliberately conservative Phase 1 lock prevents absent-parent and cross-role SoD races without partial indexes. It is a throughput limitation for future optimization, not a tenant bypass.
- Only `access.*` permissions are executable. Other registered business capabilities are design-time foundation data until their authoritative owning resource resolvers exist. A UUID supplied by the browser never verifies an organization, activates a relationship, or supplies workflow authority.
- New `/api/v1/admin/access/**` security matcher authenticates identity; each service enforces the capability. AccessIdentity supports JWT subjects without recognized ActorRole. ActorContext/JwtRoleConverter/realm are unchanged. LegacyRoleCompatibilityAdapter provides migration suggestions only; it is never called as a fallback following DENY. Representative delegation remains solely in the existing patient model.
- Bootstrap is an opt-in deployment property `app.access.bootstrap-subject` (Spring environment form `APP_ACCESS_BOOTSTRAP_SUBJECT`). No default subject or API exists. It records one owner assignment and a completion marker transactionally. Restart cannot regrant after revocation; an existing authorized owner must grant a replacement. A second independent reviewer is required for publication and can be appointed through the effective-access assignment UI.
- Publication validates the full registry envelope and requires the publisher to hold every executable capability being delegated. Assignment applies the same check. Future permission grants remain non-executable; Phase 2 must add the appropriate business delegation envelope before enabling them.
- Successful audit writes share the mutation transaction; denied operations use a separate transaction so rejection rollback cannot erase the event. No clinical payloads or secret token claims are logged.
- Simulation can reference a saved draft version; evaluation includes current membership, registry constraints and combined assignment conflicts but evaluates the proposed grant instead of silently falling back to the user's existing grants. It never writes policy, assignments or relationships. Unresolved resources deny; other subjects have unknown recent authentication and therefore cannot appear recently authenticated by borrowing the reviewer's session.
- UI and API use the existing gateway client and OIDC flow. EN/AR UI is included now at the user's request; no React Flow/provider/designer work was introduced.

## 11. Final identity/authorization reconciliation

**Keycloak is authoritative for authentication and identity-session concerns. RehletShifaa is authoritative for dynamic business authorization, organization membership, roles, permissions, scopes and relationships.**

Keycloak owns OIDC Authorization Code + PKCE, passwords, MFA, login/session management, stable identity subjects and security account enable/disable/lifecycle. The browser remains a public S256 PKCE client. Realm/client roles retained on existing routes are coarse technical/legacy compatibility information, not configurable business policy. Never create resource-specific realm roles/groups (such as a role per doctor/manager/coordinator), synchronize dynamic DB roles into Keycloak, or fall back to ActorRole after a new-policy denial.

`access_subjects.active` is a local business-access suspension, not a second authentication account or a replacement for Keycloak's enabled state. Revoking an organization membership must not disable a person's identity in other organizations. Cached/display invitation status is not authorization evidence. Existing JWT session validation remains unchanged; account/session invalidation and application grant revocation are distinct operations.

### Identity provisioning boundary for Phase 2

`identity/IdentityProvisioningPort` exposes role-free `invite(name,email,locale)`, `resend(subject,locale)`, `setEnabled(subject,enabled)` and display `status(subject,storedStatus)`. Its `IdentityAccount` returns the stable external subject. The existing `KeycloakStaffIdentityService` implements this port, reusing the existing backend credentials, HTTP integration and invitation actions. No duplicate identity adapter or frontend Admin API exists. The four-argument invitation method remains exclusively for legacy staff/doctor realm-role compatibility; new provider business services inject the port and do not pass business roles to Keycloak.

The role-free invitation creates an enabled identity requiring email verification/password setup and sends Keycloak's action email. It performs no role lookup/mapping; realm defaults remain identity-provider configuration and confer no new business access. Invitation failure retains the existing best-effort identity cleanup. `status` may return stored display status if Keycloak is unavailable; it must never authorize membership or activation.

Phase 2 business orchestration must authorize the operator and resolve the organization first, call this backend port, store the returned subject with the existing person/profile identity, and persist organization membership, pinned role assignment, credential lifecycle and relationships in RehletShifaa. Keycloak and the application DB do not share an atomic transaction: implement durable retry/reconciliation for partial provisioning and DB failures, never link an existing identity solely from an unverified client email/subject, and activate business access only after required checks. Do not globally disable an identity merely to remove one organization membership. Provider orchestration is not implemented in this reconciliation.

### Security corrections and effective-access semantics

- The existing `JourneyService.verifyPractitioner` now rejects both approval and rejection of one's own credentials by resolving the profile's stored external subject, including for SYSTEM_ADMIN. The new evaluator's existing self-verification guard remains. Full provider credential lifecycle/activation remains Phase 2.
- Membership, assignment and published-version start timestamps normalize to DB microsecond precision, avoiding upward JDBC rounding that could transiently deny immediate grants/bootstrap. A fixed nanosecond regression reproduced the issue before correction. No migration or global timestamp behavior changed.
- Published assignments pin immutable versions. Removing a permission in v2 does not silently rewrite v1: revoke/replace v1 assignments or retire v1 to withdraw its permissions. The evaluator reads current DB state without an authorization cache; revocation/retirement denies subsequent decisions.
- Platform governance capabilities explicitly authorize central access administration/inspection. They do not imply provider/clinical access. `ASSIGNED_ORGANIZATIONS` uses an explicit assignment and active membership for each organization; PLATFORM is currently confined to the governance sentinel. Broader provider capabilities require reviewed resolver/envelope implementation in Phase 2, not a wildcard bypass.
- Effective-access responses explain assignment/version, permission, organization, scope, relationship type and allow/deny reason. Provider resource simulation remains unresolved/default-deny until its owning resolver exists. Denial reasons do not claim that a grant exists.

Final reconciliation accepts the Phase 1 foundation after the focused checks in test-status.md; it is not a live deployment certification. Provider, Journey and Coordinator routing execution remain unstarted.
