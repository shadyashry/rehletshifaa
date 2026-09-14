# Platform Control Plane — migration inventory

Snapshot: 2026-09-13, `458359895209eccfea011c76cd6a46bc38dc7bae`. No application changes in Phase 0.
Backend paths below are relative to `backend/src/main/java/com/rehletshifaa/`; schema paths are under `backend/src/main/resources/db/migration/`.

## Authorization inventory

[Exact file/line index](phase-notes/phase-0-role-checks.tsv): 306 matched source lines in 34 production files. This is a conservative lexical inventory, not 306 distinct authorization decisions: imports, DTOs, role rendering and multiple checks on minified lines are included. Classification tags can overlap and are migration hints, not security conclusions. Tests are excluded; seeded role references are included without copying seed values. Supplementary string roles in SQL/realm data are mapped below.

Search covered `ActorRole`, `ActorContext`, `actors.require/current/requireRecentAuthentication`, `hasRole/hasAnyRole`, `realm_access`, `ROLE_`, lead/admin roles, role collection membership, and direct role comparisons in backend production Java and frontend production source. Re-run this bounded search only when starting an enforcement cutover; line references are pinned to the snapshot.

| Boundary | Existing implementation and migration classification |
|---|---|
| Coarse identity | `security/JwtRoleConverter.java`, `ActorContext.java`, `SecurityConfig.java`: recognized enum only, subject identity, route families, recent-auth checks. BOOTSTRAP_CHANNEL. Preserve authentication; do not use as final configurable permission policy. |
| Business actions | `journey/application/JourneyService.java`, `PricingCatalogService.java`, `CommercialPolicyService.java`, `PaymentService.java`, `IdentityVerificationService.java`, `OnboardingService.java`, `PatientAccountService.java`: role-gated mutations/read projections. BUSINESS_PERMISSION plus resource checks. |
| Workflow/resource | `JourneyService.authorizeRead/authorizeWrite/requireActiveAssignment/requireCoordinatorOwnership`, `CaseActionService`, `StaffWorkService`, `PatientActionService`, `document/application/SecureDocumentService.java`: ownership, delegation, task and status gates. WORKFLOW_RESOURCE, retained beside new grants. |
| Supervisory scope | `PortalExperienceService.reports/canLeadRead/updateReporting`, coordinator/task reassignment, Finance lead settings. LEAD_ESCALATION; scope expansion does not replace an accepted operational assignment. |
| Browser | `frontend/src/lib/auth-client.ts`, `portal-role-access.ts`, `frontend/src/components/portal/Portal.tsx`, workflow/action/message components in index. CLIENT_PRESENTATION; replace by capabilities incrementally, never use browser role checks as enforcement. |

ActorRole contains 13 values: PATIENT, PATIENT_REPRESENTATIVE, COORDINATOR, COORDINATOR_LEAD, DOCTOR, OPERATIONS, OPERATIONS_LEAD, FINANCE, FINANCE_LEAD, CREDENTIALING_ADMIN, SYSTEM_ADMIN, AUDITOR, PATIENT_IDENTITY_REVIEWER. Realm source: `infrastructure/keycloak/realm-rehletshifaa.json`; lead roles are composite base roles. Existing route gates are role-family based, with admin allowing CREDENTIALING_ADMIN/SYSTEM_ADMIN/AUDITOR and identity-review allowing PATIENT_IDENTITY_REVIEWER/SYSTEM_ADMIN. Service checks narrow those routes further.

Legacy exceptions requiring explicit cutover tests: SYSTEM_ADMIN/AUDITOR broad case read; AUDITOR denied writes; active patient_representatives delegation; pending vs active staff assignment read/write; coordinator document read for unclaimed RECEIVED cases; recent auth on sensitive approvals. New governance templates must not inherit an unrestricted admin bypass.

## Current data and ownership

| Area | Current tables/files | Reuse or gap |
|---|---|---|
| Clinician | V2 `practitioner_profiles`; V3 adds type/care-area information; V24 account invitation fields. `JourneyService.createPractitioner/myDoctorProfile/verifiedDoctors`; `identity/KeycloakStaffIdentityService.java` | UUID + unique external_subject, clinical/profile fields, version, credentialing and availability statuses. Reuse identity/profile; no separate Doctor JPA entity. |
| Staff | V4 `staff_members`, V20 lead roles, V21 manager/preferences, V22 `staff_team_assignments`, V23 invitation/email/account fields. `PortalExperienceService`; `JourneyService` staff methods | Reuse staff and subject IDs. One direct lead per function, recursive visibility, no cross-function/cyclic reporting. This is not provider membership or a routing team. |
| Provider organizations | No provider-organization or organization-membership table in current migrations | Add distinct organization and membership data in Phase 2A. Do not treat a doctor ID as tenant ID. |
| Credentials | V2 `practitioner_credentials` with reference/source/evidence_document_id, issue/expiry, verifier/status; `JourneyService.addCredential/verifyPractitioner`, `CredentialExpiryService` | Profile-level UNDER_REVIEW approval updates credentials; requires at least one current credential, rejection reason. No explicit self-verification guard in verifyPractitioner. Add independent verification lifecycle/history and required-credential policy. |
| Evidence | `document` subsystem; credential evidence FK to `medical_documents` | Existing case-owned document/scanning boundary must be extended for provider evidence; no fake medical case. |
| Patient representation | V2 `patient_representatives`; V17 onboarding and V30 canonical patient/contact/account changes | Reuse existing delegation, identity and account ownership; payer does not become a clinical representative. |
| Prices | V11 `consultant_service_catalog`, `service_templates`, `service_template_items`, `fx_rates`; V25 care-area base templates | Unique practitioner/service code, EGP amount, active/valid_until, optimistic version; no immutable price-list publication model yet. Extend with organization defaults and effective versions. |
| Price service | `PricingCatalogService` catalog CRUD, template derivation and CSV preview/commit; `CurrencyService` under `shared/currency`; `CommercialPolicyService` | Preserve existing importer and backend margin/FX logic; published proposal snapshots in V11/V13 remain unchanged. |
| Availability | V2 `practitioner_profiles.availability_status`; free-text `appointments` | No recurring availability, exceptions or appointment scheduling table found. Current assignment uses AVAILABLE plus VERIFIED consultant, matching care category and a current VERIFIED credential. |
| Assignments | V2 `case_assignments` (subject, role, PRIMARY/type, pod, status, reason, timestamps, version) | Reuse pending/active/declined/ended history; no versioned routing policy/candidate scores/preferences/capacity engine. |
| Staff work | V2 `case_tasks`, V7 task lifecycle extensions, V27 waiting/notification extensions; `StaffWorkService`, `WorkDtos`, `WorkController` | Existing WorkItem is a projection over case_tasks, not a new work_items entity/table. |
| Audit/outbox | V2 `audit_events`, `notification_outbox`, `idempotency_records`; V16 delivery tracking; V27 `staff_notifications`; `notification/application/NotificationOutboxStore.java` and processor | Reuse transactional/idempotent delivery and audit storage. Audit currently lacks a dedicated organization column. Extend additively where governance queries need it. |

## Coordinator and work behavior to preserve

`JourneyService.claimCoordinatorCase` locks the medical case row, rejects an existing active primary coordinator, requires RECEIVED, inserts an active PRIMARY assignment to the claiming actor, then advances to INTAKE_REVIEW. Therefore submitted queue cases can be unowned; the old prose saying every submitted case already has an owner is not literally true. Preserve the visible intake queue.

`reassignCoordinator` allows COORDINATOR_LEAD/SYSTEM_ADMIN, checks reporting scope for the lead, verifies staff-directory role, locks the case, ends old primary assignments, and records a new active owner with reason/audit. `assign` handles DOCTOR/OPERATIONS/FINANCE; it checks stage eligibility and doctor credentials/category/availability, creates pending work, and enforces acceptance before protected execution. Current staff eligibility SQL is largely role-based: explicit disabled-account, organizational scope and capacity checks are future routing requirements, not already guaranteed.

`CaseHandoffService` responds to deposit/readiness events, preserves the existing coordinator, and creates deposit/coordination work. Unowned work uses the normal coordination queue/mailbox. Do not transfer the primary coordinator when an Operations or Finance WorkItem becomes active.

`StaffWorkService.openWorkItem` reuses open work per case/type, derives priority from blocking/due conditions, and raises idempotent in-app/outbox notifications. `case_tasks` stores task type, owner subject/role, priority, due date, blocking, status, version and visibility. `refreshWaitingOn` maintains the operational responsibility projection. Preserve INTERNAL vs PATIENT_ACTION isolation and protected advancement blocking.

`CaseActionService.resolve` supplies currentAction, availableActions and blockers and can close obsolete tasks/reconcile waiting state. `PatientActionService` supports information-response work. The patient gets FOCUS only for their own required action, otherwise WAIT; offline deposits are staff work. These are backend projections, not merely labels computed in React.

## Journey transition source and parity baseline

`journey/application/CaseTransitionPolicy.java` owns TRANSITIONS and entry/blocking checks. `JourneyService.validateTransition` delegates to it; `CaseHandoffService` also uses it. `casemanagement/domain/CaseStatus.java`, `MedicalCase.java` and intake services cover initial draft/submission. Use code over stale abbreviated prose.

Preserve RECEIVED → intake → consultant pending/accepted review → recommendation → proposal → patient decision → accepted → travel → arrival → treatment → discharge → follow-up → closed, plus INFORMATION_REQUIRED, declined assignments, CLINICALLY_NOT_SUITABLE, CANCELLED, DECLINED, REVISION_REQUESTED and EXPIRED recovery paths. The transition map permits PROPOSAL_PREPARATION → PATIENT_DECISION for the no-extra-approval path; a class comment claiming otherwise is stale.

`CaseTransitionPolicy.entryBlockers` guards TRAVEL_COORDINATION using accepted proposal, deposit satisfaction and patient-only readiness blockers. Domain commands enforce additional rules: conditional Operations/Finance approval, frozen proposal money, final quote while ARRIVAL_CONFIRMED, consent or break-glass before treatment, secure link/OTP grants and patient identity. These must not move into administrator-authored expressions. Shadow V1 must cover all four pricing/travel gate combinations and recovery paths.

## Current admin surfaces

`frontend/src/app/[locale]/portal/page.tsx` renders `components/portal/Portal.tsx`; admin is a portal persona with practitioner, staff and catalog tabs, not a separate provider control-center route tree. PortalDirectories.tsx supports account/directory management; portal-role-access.ts selects personas. Audit/read-only and identity-review remain separate access concerns.

Backend entry points: `journey/api/AdminJourneyController.java` under `/api/v1/admin` (practitioners, credentials, decisions, staff, catalogs/templates, FX) and `PortalExperienceController.java` (preferences/reporting). Preserve these contracts while adding `/api/v1/admin/access/*`, provider, journey and routing APIs in their own phases. Browser calls keep the existing gateway URL and API client.

## Migration numbering and phased file plan

Latest: **V33__map_legacy_practitioners_to_provider_organizations.java**. V1–V31 remain immutable. V32 is the provider schema/capability foundation and V33 is the deterministic legacy mapping. Next available migration: **V34**.

| Phase | Exact integration roots / planned additions | Verification boundary |
|---|---|---|
| 1A | New `access/domain`, `access/application`, `access/infrastructure`; `V31__access_governance_foundation.sql`; new access tests | Permission metadata, lifecycle, uniqueness, effective dates, scope, published immutability; Flyway and architecture |
| 1B | `access/application/AuthorizationService.java`, `LegacyRoleCompatibilityAdapter.java`, `access/api/AccessGovernanceController.java`; targeted `security/ActorContext.java`, `JwtRoleConverter.java`, `SecurityConfig.java` integration | Deny/tenant/resource/legacy/recent-auth parity; shared security regression |
| 2A–C | New `provider` module; practitioner/staff/credential methods in JourneyService; CredentialExpiryService; PricingCatalogService; secure document port | Identity mapping, no-self-verification, readiness, historical price stability, schedule overlap |
| 3 | New `coordination` module; JourneyService claim/assign/reassign; PortalExperienceService; CaseHandoffService; StaffWorkService | Continuity, eligibility, scores, tie-breaks, fallback, concurrent assignment; shadow comparison |
| 4A–B | New `journey/domain` graph/version records, journey repositories, `JourneyRuntimePort`, compiler/Flowable adapter; existing CaseTransitionPolicy and CaseActionService | Synthetic validation; Flowable prerequisite; legacy parity, pinned instances and rollback |
| 5A–B | New `frontend/src/components/platform-control-center/`; integrate existing portal page, Portal.tsx, PortalDirectories.tsx and role-access helper | Provider/access forms, capabilities, typecheck, EN/AR, relevant component/E2E |
| 6A–B | Journey designer and coordination components within same subtree; frontend/package.json only when adding React Flow | Keyboard/non-drag editing, simulation/publish, routing explanation, RTL |
| 7–8 | Indexed authorization sites and existing workflow services; current portal action components | Controlled cutover followed by matrix-based security and commercial regression |

Phase 1 access paths and V31 now exist; later-phase paths in this table remain plans. Continue only from the Phase 2 NEXT EXACT ACTIONS in implementation-status.md when that phase is explicitly authorized.

## Phase 1 actual migration and cutover status — 2026-09-13

- V31 is the actual additive baseline extension. V1–V30 and all existing workflow tables/data are unchanged. V31 creates permission_definitions, role_templates, role_template_versions, role_permission_grants, access_subjects, access_memberships, role_assignments, resource_relationships and access_bootstrap; seeds 19 templates and the registered catalog, with no user assignments.
- H2 PostgreSQL-mode migration and full backend suite passed through V31. The development PostgreSQL database has NOT been migrated or inspected for Phase 1 deployment; no Docker rebuild was requested/performed.
- Authoritative new-policy cutover: `/api/v1/admin/access/*` only. Capability checks execute inside the application services after identity authentication. Legacy admin does not inherit governance access. All existing business routes remain on their existing role/resource/workflow policy.
- Opt-in initial owner: supply an explicitly reviewed Keycloak subject through `APP_ACCESS_BOOTSTRAP_SUBJECT` to the backend deployment. The property is intentionally absent from committed Compose/realm configuration. Migrate/rebuild with the tunnel overlay per AGENTS.md when deployment is separately undertaken. Never edit applied migrations or hand-seed patient/workflow data.
- Bootstrap commits one platform membership/assignment and durable completion marker. Remove the deployment property after success. Restart will not undo revocation. Use the protected assignment UI/API for a second reviewer and subsequent access changes; no blanket existing-role backfill.
- Unverified provider UUIDs, memberships, assignments and all new relationships remain PENDING. Provider clinical/finance/journey capabilities cannot execute through the new evaluator. No implicit migration of patient representatives, case ownership, work assignments or staff reporting.
- Phase 2: next expected Flyway V32. Add real provider organization ownership and verified membership resolution, then validate/backfill pending organization targets through explicit reviewed mappings before activation. Retain historical assignment/version IDs and audit. Do not activate pending rows based solely on role labels or arbitrary organization identifiers.
- Rollback boundary: retain additive schema/history and remove access grants or stop exposing the new UI/route. Do not drop tables/volumes, restore old migration files, or introduce a legacy-role fallback to bypass new-policy denials.

## Phase 2A migration and cutover status — 2026-09-14

- V32 adds `provider_organizations`, `provider_membership_details`, `provider_identity_operations`, invitation/activation metadata on `access_memberships`, and Associate Doctor as an allowed existing practitioner type. It adds `provider.relationship.manage`, marks only Phase 2A provider capabilities executable, and publishes provider-role v2 records without editing V31.
- V33 deterministically creates one distinct DRAFT solo-practice organization per existing subject-linked practitioner, with `legacy_mapping_status=PENDING_REVIEW`, a PENDING canonical membership, provider detail linkage and PENDING pinned Consultant assignment. It is repeat-safe and preserves every practitioner ID and existing credential/case/catalog/proposal reference.
- H2 PostgreSQL-mode migration passed through V33 and the full backend regression passed. The development PostgreSQL database has not been migrated or inspected; Docker/tunnel deployment was not performed.
- New-policy cutover now includes `/api/v1/admin/providers/**`. Provider organization IDs and clinician targets are resolved from database records before `AuthorizationService`; cross-organization membership and relationship scope are enforced server-side. Existing business routes retain their Phase 1 compatibility boundary.
- Before deployment, review the deterministic V33 mappings against the real practitioner inventory. Do not manually edit V32/V33, auto-activate PENDING mappings, or treat legacy VERIFIED as provider readiness. Phase 2B must provide explicit review/readiness activation.
- Rollback remains additive: revoke provider memberships/assignments or stop exposing the provider route. Do not drop provider/access history or disable a shared Keycloak identity to remove one organization membership.

## Phase 2B migration and cutover status — 2026-09-14

- V34 is the additive provider credentialing/readiness migration. It creates tenant clinician onboarding, immutable policy requirements, credential dossiers/revisions/evidence links/decisions, credential evidence scan/seal metadata, provider command idempotency, domain-event deduplication and permission-version cutover records. It publishes additive Provider Operations, Consultant, Associate Doctor and Credential Verification Officer versions.
- Existing V33 legacy mappings become `LEGACY_UNREVIEWED` onboarding records with no invented approvals. New non-legacy enrollments receive a policy-cutover marker; V33 mappings remain unadopted until explicit review after all mandatory provider credentials are independently verified.
- Dormant credential/provider-activation permissions execute only for explicitly approved V34 role versions. Existing pinned versions are not mass-repinned and no verifier assignment is bootstrapped.
- Fresh H2 PostgreSQL-mode Flyway validation passed through all 34 migrations, and the full 300-test backend regression passed. No live PostgreSQL migration, Docker rebuild or tunnel deployment was performed.
- Deployment is additive. Review V33 mappings, back up PostgreSQL, apply V34 with the normal Compose+tunnel command, create explicit tenant verifier assignments, and retain operational activation blockers until Phase 2C supplies authoritative setup facts. Roll back capability by revoking assignments or removing route exposure; never edit/drop V34 or erase credential/audit history.

## Phase 2C migration and cutover status — 2026-09-14

- V35 is the additive pricing/availability migration and the actual current baseline. It creates `provider_price_versions`, `clinician_availability_slots` and `clinician_availability_exceptions`; V1–V34 and the Java V33 migration remain immutable.
- Existing `consultant_service_catalog` rows and all proposal/catalog foreign keys are preserved. They remain the supported Consultant fallback. Publishing a Phase 2C Consultant version synchronizes its future effective EGP catalogue value through `PricingCatalogService`; no proposal or payment row is migrated or recalculated.
- V35 enables the registered price/service/availability capabilities and publishes reviewed Practice Manager v3 plus Consultant/Associate v4 versions. `permission_version_cutovers` keeps older pinned grants dormant; explicit Access Governance replacement is required.
- Fresh H2 PostgreSQL-mode Flyway validation passed through V35 and the full 306-test backend regression passed. The development PostgreSQL database has not been migrated or inspected; no Docker/tunnel deployment was performed.
- Deployment rollback remains additive: revoke/replace V35 role assignments or stop exposing the new provider operational endpoints. Never drop V35 tables, alter applied V35 text, or rewrite historical catalogue/proposal data.

## Phase 3 migration and cutover status — 2026-09-14

- V36 is the additive care-coordination migration and current baseline. It creates `coordinator_teams`, `coordinator_memberships`, `coordinator_capacity`, `coordination_policy_versions`, `consultant_routing_preferences`, `coordination_case_routing` and `coordination_decisions`, and adds coordination queue metadata to existing `case_tasks`. V1–V35 remain immutable.
- Existing `case_assignments` remains the Case Owner history and `case_tasks` remains the WorkItem/queue store. No second assignment or generic task subsystem was introduced; no medical-case status or existing owner history was rewritten.
- V36 registers/enables assignment capabilities, publishes additive Care Coordination Manager v2 and Coordinator v2 role versions and records only those reviewed version cutovers. Existing pinned role versions remain dormant until explicit replacement.
- Routing defaults to per-case SHADOW. V36 does not bind or adopt existing cases, migrate legacy owners, globally enable LIVE, or remove the legacy claim/reassign path. LIVE adoption requires a fresh matching shadow decision and explicit authorized reason.
- Fresh H2 PostgreSQL-mode validation passed through all 36 migrations. Focused/impacted verification passed 128 tests and the full offline backend passed 322 tests in 32 suites with no failures/errors/skips. The development PostgreSQL database was not migrated or inspected; no Docker/tunnel, Keycloak or browser validation was performed.
- Deployment remains additive: back up and inspect PostgreSQL, apply V34–V36 through the standard Compose+tunnel stack, assign reviewed V36 envelopes per provider, validate SHADOW first, and adopt only explicitly approved cases. Roll back behavior by revoking coordination grants or leaving cases in SHADOW; never edit/drop V36 or erase decisions, assignments, tasks, audit or outbox history.
