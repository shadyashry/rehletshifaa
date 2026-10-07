# JPA migration status (live tracker)

Decision and conventions: `technical-decisions.md` §29. This file is the resumable checkpoint for the
JdbcClient → Spring Data JPA conversion; update it at every slice boundary.

## Rules (read before converting anything)

1. **Ownership.** A table's entity lives in the lowest module that uses it (`<module>/domain`), its repository in
   `<module>/infrastructure`. Module order (low → high): shared · workforce · directory · authority · identity,
   notification · security · casemanagement · access, clinic · document · journey · coordination. (`casemanagement`
   depends only on directory, notification, security and below, so `access` and `clinic` read case tables through it;
   `ArchitectureRulesTest` keeps the graph acyclic.) `LocalDemoDataSeeder` is excluded
   from ownership and must move to its own top-level dev-data module (it would otherwise make `shared` depend on everything).
2. **Write-convert a table completely, in one slice.** Every INSERT/UPDATE/DELETE on the table, in every file, goes
   through its repository with an immediate flush (`saveAndFlush`/`saveAllAndFlush`, or `@Modifying(flushAutomatically
   = true, clearAutomatically = true)` for bulk JPQL). Only then is the table "W". Reads may stay JDBC until their
   file is converted ("R"). Never leave a JDBC write on a W table.
3. **Concurrency semantics are preserved explicitly.** `SELECT … FOR UPDATE` → `@Lock(PESSIMISTIC_WRITE)` query;
   guarded `UPDATE … WHERE status=?/version=?` returning a count → `@Modifying` JPQL returning `int` (same guard);
   `INSERT … WHERE NOT EXISTS`/`ON CONFLICT` → existence check + unique constraint, isolated with
   `REQUIRES_NEW` when a race must not abort the caller (see `FxRateRefresher`).
4. **Verification per slice:** `mvn -o -q test` must stay at **0 failures** (the CL2/CL3 baseline failures are gone
   since 2026-10-06), then the PostgreSQL proof (`PostgresJpaMappingTest`). `ArchitectureRulesTest` must stay green.

## Status

Legend: **—** not started · **W** all writes via JPA · **R** all reads via JPA too (done) · **dead** no code uses it.

| Owner | Table | Status | Users (modules) |
|---|---|---|---|
| access | `access_recertification_campaigns` | W | access |
| access | `access_recertification_items` | W | access |
| casemanagement | `case_assignments` | W | access,clinic,coordination,journey |
| casemanagement | `case_tasks` | W | access,coordination,journey |
| access | `consultant_current_operations_owners` | W | access,clinic |
| access | `mfa_reset_requests` | W | access |
| access | `platform_account_owner_current` | W | access |
| access | `platform_account_owner_relationships` | W | access |
| access | `platform_governance_bootstrap` | W | access |
| access | `platform_owner_transfer_acceptances` | W | access |
| access | `platform_owner_transfer_requests` | W | access |
| access | `platform_owner_transfer_verifications` | W | access |
| access | `privileged_access_change_decisions` | W | access |
| access | `privileged_access_change_requests` | W | access |
| access | `service_accounts` | W | access |
| access | `support_identity_checks` | W | access |
| workforce | `workforce_identity_review_history` | W | access |
| workforce | `workforce_identity_reviews` | W | access |
| workforce | `workforce_staffing_requests` | W | access |
| directory | `patient_profiles` | R | access,authority,casemanagement,journey |
| directory | `patient_representatives` | R | authority,journey |
| authority | `platform_role_assignments` | W | access,authority,identity |
| directory | `practice_managers` | W | access,authority,clinic |
| directory | `practitioner_profiles` | W | access,authority,clinic,coordination,identity,journey |
| authority | `workforce_role_conflicts` | W | access,authority |
| casemanagement | `case_access_links` | R | casemanagement,journey |
| casemanagement | `case_intake_grants` | R | casemanagement |
| casemanagement | `case_status_history` | W | casemanagement,journey |
| casemanagement | `case_submission_contacts` | R | casemanagement,journey |
| casemanagement | `consent_records` | R | casemanagement,journey |
| document | `medical_documents` | W | casemanagement,document,journey |
| clinic | `audit_events` | R | clinic,journey |
| clinic | `care_categories` | R | clinic,journey |
| clinic | `clinic_service_changes` | R | clinic |
| clinic | `consultant_capabilities` | W | clinic |
| clinic | `consultant_operations_ownerships` | W | clinic |
| clinic | `consultant_review_conflicts` | W | clinic |
| clinic | `consultant_service_catalog` | W | clinic,journey |
| clinic | `consultation_slots` | R | clinic |
| casemanagement | `medical_cases` | W | casemanagement,clinic,coordination,journey |
| directory | `practitioner_credentials` | W | clinic,journey |
| clinic | `virtual_clinics` | R | clinic |
| coordination | `coordination_routing_lock` | W | coordination |
| coordination | `coordination_decisions` | W | coordination |
| coordination | `coordination_policy_versions` | W | coordination |
| coordination | `coordination_team_profiles` | W | coordination |
| identity | `identity_operations` | W | access,identity |
| identity | `identity_reconciliation_discrepancies` | W | identity |
| identity | `identity_reconciliation_runs` | W | identity |
| identity | `identity_restore_gate` | W | identity |
| identity | `platform_governance_lock` | W | access,identity |
| workforce | `workforce_invitation_roles` | W | access,identity |
| workforce | `workforce_invitations` | W | access,identity |
| journey | `case_access_challenges` | R | journey |
| journey | `case_message_reads` | W | journey |
| journey | `case_messages` | W | journey |
| journey | `clinical_review_cost_estimates` | W | journey |
| journey | `clinical_review_versions` | W | journey |
| journey | `consultant_referrals` | R | journey |
| journey | `deposit_components` | R | journey |
| journey | `deposit_policies` | R | journey |
| journey | `deposits` | R | journey |
| journey | `follow_up_plans` | W | journey |
| journey | `journey_admission_policy_current` | R | journey |
| journey | `journey_admission_policy_revisions` | R | journey |
| journey | `journey_case_admissions` | R | journey |
| journey | `journey_case_bindings` | R | journey |
| journey | `journey_definitions` | R | journey |
| journey | `journey_deployments` | R | journey |
| journey | `journey_edges` | R | journey |
| journey | `journey_governance_lock` | R | journey |
| journey | `journey_nodes` | R | journey |
| journey | `journey_shadow_commands` | R | journey |
| journey | `journey_shadow_runs` | R | journey |
| journey | `journey_stage_projections` | R | journey |
| journey | `journey_version_editors` | R | journey |
| journey | `journey_versions` | R | journey |
| journey | `patient_account_link_requests` | R | journey |
| journey | `patient_action_items` | R | journey |
| journey | `patient_identity_verifications` | R | journey |
| journey | `patient_onboardings` | R | journey |
| journey | `payment_events` | R | journey |
| journey | `portal_preferences` | W | journey |
| journey | `proposal_access_challenges` | W | journey |
| journey | `proposal_decisions` | W | journey |
| journey | `proposal_items` | W | journey |
| journey | `proposal_share_tokens` | W | journey |
| journey | `proposal_versions` | W | journey |
| journey | `proposals` | W | journey |
| journey | `service_template_items` | R | journey |
| journey | `service_templates` | R | journey |
| journey | `staff_notifications` | W | journey |
| journey | `travel_plans` | W | journey |
| journey | `treatment_episodes` | W | journey |
| notification | `notification_outbox` | W | casemanagement,journey,notification |
| notification | `whatsapp_delivery_events` | W | notification |
| journey | `commercial_policies` | R |  |
| shared | `fx_rates` | R |  |
| (none) | `idempotency_records` | dead |  |
| access | `platform_access_roles` | FK catalogue (no entity) | authority (`platform_role_assignments.role_key`) |
| (none) | `platform_governance_commissioning` | dead |  |
| (none) | `platform_governance_commissioning_decisions` | dead |  |
| (none) | `platform_governance_commissioning_participants` | dead |  |
| (none) | `platform_owner_recovery_evidence` | dead |  |
| (none) | `platform_owner_recovery_requests` | dead |  |
| (none) | `practice_manager_delegation_history` | dead |  |
| (none) | `practice_manager_invitations` | dead |  |
| workforce | `access_subjects` | R | access,authority,coordination,identity,workforce |
| workforce | `workforce_current_managers` | W | access,workforce |
| workforce | `workforce_functions` | W (read-only entity) | clinic,workforce |
| workforce | `workforce_lead_designations` | W | access,coordination,workforce |
| workforce | `workforce_people` | R | access,authority,clinic,coordination,identity,journey,workforce |
| workforce | `workforce_reporting_lines` | W | access,workforce |
| workforce | `workforce_role_assignments` | R | access,authority,clinic,coordination,identity,journey,workforce |
| workforce | `workforce_role_catalogue` | W (read-only entity) | access,workforce |
| workforce | `workforce_team_memberships` | W | access,coordination,workforce |
| workforce | `workforce_teams` | W | access,coordination,workforce |

`care_categories` is read only through `CareCategoryRepository` since `JourneyService` was converted (2026-10-07).
`audit_events` is read only through JPA (`AuditEventRepository`, `JourneyVersionRepository`) since `CaseHandoffService` was
converted (2026-10-07).

## Dead schema (owner decision needed)

Created by migrations but read/written by no code (reviewed in CL4, 2026-10-06):

| Table | Why it stays |
|---|---|
| `platform_governance_commissioning`, `…_decisions`, `…_participants`, `platform_owner_recovery_requests`, `platform_owner_recovery_evidence` (V65) | Back owner commissioning/recovery, gated on OD-02 |
| `practice_manager_invitations`, `practice_manager_delegation_history` (V64) | Back the Practice Manager consent flow, gated until its consent state machine exists |
| `idempotency_records` (V2) | technical-decisions §13.8 still names durable idempotency keys; implement or drop is an owner decision |

Either implement the feature or drop them before `main` (pre-production rule). Resolved in CL4: `case_claim_challenges`
dropped by V73 (claim codes were superseded by secure status links and account-link requests);
`provider_membership_details_v` was already gone (V62); `platform_access_roles` is not dead — it is the FK catalogue of
`platform_role_assignments.role_key`.

## Delivered

- 2026-10-06 — foundations (`AssignedIdEntity`, `SqlValues.micros`, `OffsetPageRequest`), `AuditTrail` + `AuditEvent`
  (all 25 audit INSERTs), `GovernanceAuditLog` (writes + filtered list via Specification), FX (`ExchangeRate`,
  provider port/adapter, `FxRateRefresher`), care areas (`CareCategory`), commercial policies.

## Delivered (continued)

- 2026-10-06 — workforce slice W1: entities + repositories for `access_subjects`, `workforce_people`,
  `workforce_role_assignments`, teams, memberships, lead designations, reporting lines, current-manager pointer,
  invitations (+ roles as an element collection) and the read-only function/role catalogue. Every write on these
  tables in every module (access.platform stores, identity completion/reconciliation, workforce hierarchy) goes through
  JPA; `workforce/application` reads are fully on repositories (three N+1 loops removed). New `WorkforceEnrolment`
  replaces two copies of the invitation→person/roles SQL. `BaseRepository.lockById` (lock + refresh) replaces `@Lock`
  finders on mutable entities: a JPA row lock does not reload an instance already in the persistence context.
- Verification: workforce/access/identity/authority/coordination/architecture suites 106/106; full suite before the
  lock fix = baseline + 1, fixed (fixture now flushes/clears around raw SQL).
- **PostgreSQL proof (2026-10-06): PASS.** `PostgresJpaMappingTest` (opt-in, disposable DB on 127.0.0.1:55439) applies all
  migrations, validates every entity and executes every declared repository query on PostgreSQL 17. It found three
  defects H2 hides, all fixed: V72 counted the NOT NULL constraint as a decision CHECK (V72 failed on *any* PostgreSQL,
  which is why the dev backend could not start); a pessimistic lock on an `@Immutable` entity; an untyped bind
  parameter in `CASE … THEN :now`. Re-run it after every slice.

- 2026-10-06 — W2 + identity + notification + platform governance: staffing requests, identity reviews (+history), identity
  operations (leased outbox, `SKIP LOCKED` via lock-timeout -2), reconciliation runs/discrepancies, restore gate,
  `PlatformGovernanceLock` (shared), notification outbox (`NotificationOutbox` is the single writer; 15 INSERT sites
  removed; `enqueue` vs `enqueueOnce` keeps the old unique-key vs `WHERE NOT EXISTS` semantics), WhatsApp receipts (HQL
  `INSERT … ON CONFLICT DO NOTHING`), System Administrator assignments, privileged change requests/decisions, support
  checks, MFA resets, recertification, service accounts, governance bootstrap, owner relationships/pointer/transfers.
  SOD-04 conflict resolution in `EffectiveRoleStore`/`WorkforceRoleAssignmentStore` rewritten from `UNION ALL` SQL to
  two conflict queries (fail-closed semantics kept). Bounded two unbounded lists (identity operations 500, runs 200).
  Verification: full suite = baseline (568 run, the 101 CL2 failures only); `PostgresJpaMappingTest` PASS.

- 2026-10-06 — `directory` module (person-profile tables read across the graph): practitioners, practice managers,
  credentials, patients, representatives. Consultant onboarding/credentialing extracted from `JourneyService` into
  `ConsultantOnboardingService`. Patient account/activation updates (COALESCE/CASE SQL) are now `PatientProfile` domain
  methods on a locked, refreshed row that report whether their guard held. `authority` is JDBC-free.
  Verification: full suite = baseline; `PostgresJpaMappingTest` PASS.

- 2026-10-06 — clinic part 1: Consultant Operations ownership (history, current-owner pointer), review conflicts and
  structured capabilities. `ConsultantOperationsOwnershipService` and `ConsultantCapabilityService` are JDBC-free; the
  access reads of the current-owner pointer (`ownsConsultant`, the CONSULTANT_OPERATIONS_OWNER offboarding blocker) use
  `ConsultantCurrentOwnerRepository`. The eligibility rule (`ConsultantEligibilityService.ELIGIBLE_WHERE`) still reads
  capabilities in SQL until the rule moves to JPQL with case workload.
  Verification: full suite = baseline; `PostgresJpaMappingTest` PASS.

- 2026-10-06 — clinic part 2 + price lists: `VirtualClinic` (profile draft/publish, settings), `ConsultationSlot`,
  `ClinicServiceChange`, `CatalogEntry` (`consultant_service_catalog`, written by both the clinic and the platform price
  list) and journey `ServiceTemplate`/`ServiceTemplateItem`. `VirtualClinicService` and `PricingCatalogService` are
  JDBC-free; guarded `UPDATE … WHERE version=?` became locked (`lockById`), version-checked domain methods. Opening a
  clinic is a single-row HQL `INSERT … ON CONFLICT DO NOTHING` (H2 cannot emulate it for `INSERT … SELECT`). The PG proof
  now counts a constraint violation from placeholder arguments as executed. Remaining reader: `JourneyService` (price
  lookup); `LocalDemoDataSeeder` seeds the catalogue.
  Verification: full suite = baseline; `PostgresJpaMappingTest` PASS.

- 2026-10-06 — case tables (owner `casemanagement`): `MedicalCase` (now explicit `version`, no `@Version`;
  `@DynamicUpdate` on the case entities so an entity flush only writes changed columns), `CaseStatusChange` (single
  writer `CaseStatusLog`), `CaseAssignment`, `CaseTask`. All 45 writes in casemanagement, journey (8 services) and
  coordination are JPA; each guarded `UPDATE` is a 1:1 `@Modifying` JPQL method with the same guard and version rule
  (two historical non-bumping updates kept as such). The eligibility rule and consultant workload are JPQL
  (`ConsultantEligibilityRepository`); `clinic` is JDBC-free; the access offboarding blockers use repository counts.
  Reads of the case tables in journey/coordination are still JDBC.
  Verification: full suite = baseline; `PostgresJpaMappingTest` PASS.

- 2026-10-06 — intake and secure links: `CaseIntakeGrant`, `CaseSubmissionContact`, `ConsentRecord`, `CaseAccessLink`
  (casemanagement) and `CaseAccessChallenge` (journey); 22 writes converted, including two `INSERT … SELECT` (the
  returning-patient contact is built from `PatientProfile`; idempotent consents check `isGiven` first). `casemanagement`
  no longer reads `medical_documents`: submission readiness is the `SubmissionDocuments` port, implemented by `document`
  (`medical_documents` was always JPA-written; its `@Version` stays because it has no other writer). `document` is
  JDBC-free; in `casemanagement` only `CaseNumberGenerator` (`nextval`) remains — see Known exceptions.
  Verification: full suite = baseline; `PostgresJpaMappingTest` PASS.

- 2026-10-06 — journey operations: referrals, case messages (+ first-read markers), travel plans, treatment episodes,
  follow-ups, staff notifications, deposits (+ policy revisions, components, payment ledger), onboarding, identity
  verification, account-link requests, patient action items, portal preferences — 16 tables, 55 writes. Idempotent
  inserts keyed by a unique column (staff notifications, payment ledger) are HQL `INSERT … ON CONFLICT DO NOTHING`
  (race-safe; the `WHERE NOT EXISTS` they replace was not); update-then-insert upserts load or create the entity.
  **Deferred:** the coordination tables (`coordination_*`, `coordinator_capacity`, `consultant_routing_preferences`) *(Converted 2026-10-06 after CL2.)*
  until the in-progress CL2 routing slice lands — it is rewriting `CoordinationRepository`.
  Verification: full suite = baseline; `PostgresJpaMappingTest` PASS.

- 2026-10-06 — proposals: clinical review versions (+ cost estimates), proposals, proposal versions, items, decisions,
  share tokens and access challenges — 47 writes. Each status step keeps its exact guard (`status IN (…)` lists, the
  `currency IS NOT NULL` finance gate); release-time display pricing is JPQL `round(unitPriceEgp * :rate, 2)`; the
  version `INSERT … SELECT` from the clinical review is `createVersion` (no review: nothing created, as before).
  Verification: full suite = baseline; `PostgresJpaMappingTest` PASS. Coverage note: ~50 proposal-path tests are among
  the 101 CL2 baseline failures (they stop at coordinator routing); the passing journey suites (happy-path parity,
  action dispatch, conversion layer, secure-journey, activation — 163 tests) drive release and decision end to end.

- 2026-10-06 — journey engine: the six JDBC adapters (`Journey{Definition,Deployment,Shadow,CaseBinding,CaseAdmission,
  StageProjection}Repository`) are renamed `…Store` (the `access` convention: a store composes Spring Data repositories)
  and rewritten on 14 entities with unchanged public contracts; `JourneyAdmissionPolicyService` and
  `JourneyCutoverStatusService` are JDBC-free. All 14 tables are **R** (reads too). Version listing loads deployments in
  one query instead of one per version. Fixed while converting: a case with no care area must not read as "not found".
  Verification: full suite = baseline; journey cutover/intake/binding suites 29/29; `PostgresJpaMappingTest` PASS.

- 2026-10-06 — CL4 schema cleanup (V73): `MedicalCase` lost `full_name`/`whatsapp_number` and requires `patientId` at
  construction (`patient_id` NOT NULL); `PatientProfile` lost `mobile_owner`; `case_claim_challenges` dropped.
  Verification: full suite 574/0; `PostgresJpaMappingTest` PASS.

- 2026-10-06 — CL6 boundary enforcement: the ratchet now covers every plain-SQL type (`org.springframework.jdbc..`,
  `java.sql..`), not only `JdbcClient`; native queries are forbidden; repositories must sit in the persistence layer and
  entities in `..domain..`; application services may not use the EntityManager/criteria/Hibernate API
  (technical-decisions §29, CL6 addendum). The allowlist is unchanged (17 classes).

- 2026-10-07 — **`StaffWorkService` converted** (CL5 read slice 1; removed from `JDBC_NOT_YET_CONVERTED`, 17 → 16).
  The staff member's own read models moved to a new `journey.application.StaffWorkQueryService` (`myWork`,
  `myNotifications`; `WorkController` calls it — HTTP contract, authorization (`TASK_WORK` / signed-in subject),
  ordering, the 30-item feed and the encrypted-text handling unchanged). My Work is assembled from at most four queries
  whatever its length: `CaseTaskRepository.findOpenWorkOf` (task + case + patient display name, same `URGENT/HIGH/NORMAL`
  → due date `nulls last` → created order), then batched `MedicalDocumentRepository.countByCaseExcluding` (non-rejected
  documents per case), `CaseAssignmentRepository.findActiveCoordinators` (newest active coordinator per case) and
  `WorkforcePersonRepository.findAllById` (coordinator names) — the per-row name lookup (N+1) is gone. `StaffWorkService`
  keeps the commands and reads through repositories: `findOpenInternalOfType` (dedup), three derived `exists…` checks
  (waiting-on precedence, `hasOpenWork`), `MedicalCaseRepository.findCaseNumber`/`findWaitingOn`,
  `StaffNotificationRepository.findFeed`/`countByRecipientSubjectAndReadAtIsNull`,
  `WorkforceRoleAssignmentRepository.findLowestActiveRoleKey` and `PractitionerProfileRepository.findByExternalSubject`
  (work-email recipient). Ownership: case-table queries in `casemanagement`, document counts in `document`, names in
  `workforce`, notifications in `journey`. New test `myWorkOrdersByUrgencyThenDueDateAcrossCasesAndNamesEachCasesCoordinator`.
  Verification: full suite **584 tests, 0 failures** (2 skipped); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest`
  **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

- 2026-10-07 — **`CaseActionService` converted** (CL5 read slice 2; removed from `JDBC_NOT_YET_CONVERTED`, 16 → 15).
  Its reads moved to a new `journey.application.CaseActionQueryService`; `CaseActionService` keeps the resolver, the
  shared Operations-assignment policy and the repair writes, and reads only through the query service. Public contract
  (`resolve`, `assertOperationsAssignable`, `operationsAssignable`, `readinessBlockers`, `reconcileWaitingOn`, the
  readiness event listener, `CONSULTANT_OWNED`, `patientGate`), ordering, filtering and authorization unchanged.
  Queries added: `MedicalCaseRepository.findActionFacts` (stage + travel-package interest; 404 when absent) and
  `findWaitingReason`; `CaseAssignmentRepository.findOpenOnCase` (pending/active assignments, newest first — answers the
  active primary coordinator, "pending for me" and "Operations/Finance already assigned" from one read instead of a
  query per question); `CaseTaskRepository.findOpenInternalWorkOf` (my open internal item: blocking, then
  `URGENT/HIGH/NORMAL/other`, then oldest; `Limit.of(1)`); `ProposalVersionRepository.findApprovalGates` (latest
  version's status, finance/operations gates, document type); `PatientIdentityVerificationRepository.isUnderReviewForCase`.
  A resolve now reads the case facts, assignments and latest proposal once (before: facts up to three times, the proposal
  twice, one count per assignment question, and `operationsAssignable` re-ran the readiness reads); nothing the resolve writes
  (obsolete work, waiting-on) changes them. Ownership: case-table queries in `casemanagement`, proposal and identity
  queries in `journey`. New test `myCurrentWorkItemIsTheBlockingOneThenTheMostUrgentThenTheOldest`.
  Verification: full suite **585 tests, 0 failures** (2 skipped); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest`
  **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

- 2026-10-07 — **`JourneyService` converted, every view** (CL5 read slice 3; removed from `JDBC_NOT_YET_CONVERTED`, 15 → 14).
  All ~85 JdbcClient statements are gone; public contract (every method the controllers and action handlers call), ordering,
  filtering, authorization and error codes unchanged. The views moved to three query services in `journey.application`:
  - `JourneyCaseQueryService` — patient cases, the coordination queue, assigned cases, a case view, queue cards and the
    assignment history. One `MedicalCaseRepository` row query (`findCaseRow`, `findPatientCaseRows` — representatives
    included —, `findCoordinatorQueueRows`, `findAssignedCaseRows`; patient display name in JPQL) plus one batched
    `CaseAssignmentRepository.findCaseHolders` and one names read; cards add `CaseTaskRepository.findWorkSignals` (one
    grouped aggregate), `CaseAssignmentRepository.findHeldBy` and `MedicalDocumentRepository.countByCaseExcluding`.
    `Names` resolves staff (`WorkforcePersonRepository.findAllById`, decrypted on use) and consultant names
    (`PractitionerProfileRepository.findDisplayNames`) for a whole set of subjects in two queries.
  - `CaseWorkspaceQueryService` — the case page and `myTasks`. Timeline (`CaseStatusChangeRepository.findTimelineOf`), tasks
    (`CaseTaskRepository.findRowsOf`, patient-scoped overload), messages with the reader's read flag
    (`CaseMessageRepository.findRowsOf`, left join on `CaseMessageRead`), open assignments (`findOpenRowsOn`), reviews and
    their estimate lines (`ClinicalReviewVersionRepository.findRowsOf`, `ClinicalReviewCostEstimateRepository.findRowsForCase`).
    **N+1 removed:** every timeline actor, message sender and assignee used to cost one or two name queries per row
    (and invisible threads were named before being filtered out); the page now reads all names once, and today's FX
    rates at most once instead of once per foreign-currency review. The role → thread rule moved here (`allowedThreads`).
  - `ProposalQueryService` — a proposal document (`ProposalVersionRepository.findDocument` + `ProposalItemRepository.findRowsOf`),
    the latest version (`findLatestIdOf`, patient-visible statuses overload), the patient's secure view
    (`findPatientDocument`: case, patient, recommendation, totals, rate snapshot, consultant), the approval gates (one
    `findApprovalGatesOf` read instead of four single-column reads) and delivery status.
  - Command lookups in `JourneyService` now read through repositories: `findStageAndVersion`, `findCareCategory`,
    `findPatientId`, `findConditionDescription`, `findPatientPreferredLanguage`, `isPatientOf`, `lockById` (intake preview
    and the proposal version counter — `Proposal.getCurrentVersion` added), `findActivePrimaryCoordinator`, `findStatusFor`,
    `existsBy…` checks (active assignment, open task owner, clean document, treatment episode, live consent, optional
    item, accepted decision, approved review), `nextVersionNumber`, `findProposalCurrency`/`findLatestProposalCurrency`,
    `findPricedLinesOf`, `findLockedMargin`, `findLatestLiveFinalQuote`, `findIdByCaseId`, `findLive` (share link),
    `findLatest`/`hasLiveGrant`/`countByShareTokenIdAndCreatedAtAfter` (OTP codes), `CatalogEntryRepository.findActivePrice`,
    `PractitionerProfileRepository.findAvailableVerifiedConsultants`, and `CareCategoryCatalog.exists` (uncached).
  Ownership: case-table queries in `casemanagement`, proposal/review/message queries in `journey`, names in `directory` and
  `workforce`, catalogue price in `clinic`, documents in `document`. New test
  `theCasePageNamesEveryPersonOnItAndNeverShowsARawSubject`.
  Verification: full suite **586 tests, 0 failures** (2 skipped; +1 case-page names test); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

- 2026-10-07 — **`PaymentService` converted** (CL5 read slice 4; removed from `JDBC_NOT_YET_CONVERTED`, 14 → 13). The four
  deposit tables (`deposits`, `deposit_components`, `deposit_policies`, `payment_events`) are now **R**. The reads moved to a
  new `journey.application.DepositQueryService`; `PaymentService` keeps the commands (deposit creation, receipts, refunds,
  waiver, policy configuration) and its public contract — every method callers use, the authorization (`PAYMENT_RECORD`,
  `COMMERCIAL_POLICY_READ`), error codes, ordering, the display rounding (EGP × the deposit's snapshot rate, 2 dp half-up)
  and the currency rules are unchanged. The unused `depositPaid` (no caller) was removed.
  - Queries added: `DepositRepository.findLatestOf` (latest deposit, cancelled included — the deposit view) and
    `findLatestLiveOf` (latest not-cancelled — readiness, net paid), `findOnCase` (404 guard that also returns the quote, so a
    receipt/refund reads the deposit once instead of four times), `existsByCaseIdAndStatusNot`;
    `DepositComponentRepository.findLinesOf`; `PaymentEventRepository.findLedgerOf` and `findTotalsOf` (paid and refunded in one
    aggregate instead of two `SUM`s); `CoordinationDepositPolicyRepository.findAllRows`, `findRow`, `findActiveFor`,
    `findActiveDefault`, `findLatestVersionFor`/`findLatestDefaultVersion`; `ProposalVersionRepository.findFxSnapshot`. The care
    area comes from the existing `MedicalCaseRepository.findCareCategory`.
  - Read once per request: readiness used to call four deposit methods that each re-read the active deposit (and the case
    and policy when there was none); `DepositQueryService.standing` answers status, waiver, satisfied and the amount due from
    one deposit read (plus case + policy only when no deposit exists). `CustomerReadinessService`, `PatientActivationService`
    (activation hand-off and the deposit summary) and `CaseWorkspaceQueryService` read through the query service;
    `CaseActionService`, `CaseTransitionPolicy` and `JourneyService` keep calling the unchanged `PaymentService` methods.
  - H2 finding: Hibernate's H2 dialect omits `nulls first` (it assumes NULLs sort low) while the test database orders them
    high (`DEFAULT_NULL_ORDERING=HIGH`, like PostgreSQL), so the policy list now orders default-first with an explicit
    `case when careCategory is null`. `CommercialPolicyRepository` (`asc nulls first`) and `ClinicServiceChangeRepository`
    (`desc nulls last`) have the same H2-only divergence (PostgreSQL renders both correctly); not changed in this slice.
  - New test `depositLedgerTracksPartialPaymentsAndRefundsAtTheQuotedRateAndPoliciesListDefaultFirst` (policy revisions and
    list order, anticipated amount before a deposit, partial receipt → PARTIALLY_PAID with half-up display amounts in USD,
    PAID, partial refund, full refund → REFUNDED, ledger order, foreign deposit id → 404).
  Verification: full suite **587 tests, 0 failures** (2 skipped; +1 deposit-ledger test); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest` **PASS** on a
  freshly reset PostgreSQL 17 (V1–V73, new queries included).

- 2026-10-07 — **`ConsultantReferralService` converted** (CL5 read slice 5; removed from `JDBC_NOT_YET_CONVERTED`, 13 → 12).
  `consultant_referrals` is now **R**: no plain-SQL reader is left. The views moved to a new
  `journey.application.ReferralQueryService` (`view`, `onCase`, `seenBy`, `consultantName`); `ConsultantReferralService` keeps
  every command and its public contract (`create`, `candidates`, `forConsultant`, `submitOpinion`, `forCoordinator`, `confirm`,
  `decline`, `handles`, `decide`, `withdrawOpenTransfers`), authorization (still checked before the query service is called),
  error codes, newest-first ordering and the "The consultant" fallback for a missing profile unchanged.
  - Queries added: `ConsultantReferralRepository.findRow`, `findRowsOf` (coordinator list), `findRowsSeenBy` (referrer or
    currently offered receiver, left join on `CaseAssignment`; the relation is derived from `fromSubject` in Java), `findRef`,
    `findRefByTargetAssignment` (the offer being decided — one read instead of id lookup + reload), `findUndecidedTransfersOf`,
    `existsByCaseIdAndReferralTypeAndStatusIn`, `existsByTargetAssignmentId`; `CaseAssignmentRepository.findActiveConsultantAssignment`,
    `findAssigneeAndStatus`, `existsByCaseIdAndAssigneeSubjectAndStatusIn`; `PractitionerProfileRepository.findDisplayNamesByIds`,
    `findIdByExternalSubject`, `findExternalSubjectById`. Reused: `MedicalCaseRepository.findStageAndVersion`/`findCareCategory`/
    `findCaseNumber`, `CaseAssignmentRepository.findStatusFor`/`findActivePrimaryCoordinator`.
  - **N+1 removed:** each listed referral used to cost one row read plus up to three consultant-name reads; a list is now two
    queries whatever its length (rows, then every referrer/suggested/target consultant in one `in :ids` read).
  - Ownership: referral queries in `journey`, assignment queries in `casemanagement`, consultant names/subjects in `directory`.
  - Gotcha: a JPQL text block ending in `… r """` loses its trailing space (Java strips it), so a concatenated `where` ran into
    the alias; the shared select fragments end with a line break instead.
  - New test `referralListsAreNewestFirstNameEveryConsultantAndShowEachPersonTheirRelation` (coordinator list order and names,
    suggested vs target consultant, referrer vs receiver relation, unknown referral → `REFERRAL_NOT_FOUND`).
  Verification: full suite **588 tests, 0 failures** (2 skipped; +1 referral-views test); `ArchitectureRulesTest` 22/22;
  `PostgresJpaMappingTest` **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

- 2026-10-07 — **`PatientActivationService` converted** (CL5 read slice 6; removed from `JDBC_NOT_YET_CONVERTED`, 12 → 11).
  The patient's onboarding views moved to a new `journey.application.PatientActivationQueryService` (`prefill`, `result`,
  `depositSummary`; the profile, submitter and onboarding subject-type reads the validation shares); `PatientActivationService`
  keeps `activate`, `resendAccountSetup` and `portalAccess` and its public contract — the onboarding-grant authorization,
  validation rules and messages, error codes (`PATIENT_NOT_FOUND`, `CASE_NOT_FOUND`, `CASE_NOT_ACTIVATABLE`,
  `ONBOARDING_NOT_STARTED`/`_NOT_ACTIVE`, `PROFILE_NOT_ACTIVE`, `ACCOUNT_SETUP_NOT_STARTED`), the deposit summary (currency,
  display amounts and "required" rule via `DepositQueryService`), journey stage and current action are unchanged.
  - Queries added: `PatientProfileRepository.findOnboardingProfile` (the profile as the pages show and validate it) and
    `isVerifiedMobileOfAnotherAccount`; `MedicalCaseRepository.findOnboardingFacts` (case number, stage and waiting-on in one
    row — the views read the case once instead of twice); `CaseSubmissionContactRepository.findSubmitter`;
    `ConsentRecordRepository.findLiveTypesOf` (unrevoked types on any case — validation) and `findLiveTypesCovering` (the
    pre-fill's completed consents: patient-wide or this case); `PatientOnboardingRepository.findNewestOf` (current onboarding
    id + state, `Limit.of(1)`) and `findNewestSubjectTypesOf`. Reused: `MedicalCaseRepository.findStageAndVersion` (the
    activatable check).
  - Locks: activation still locks the profile row first, then the case's newest onboarding (`findNewestOf` → `lockById`,
    which re-reads it under the lock), as the two `FOR UPDATE` selects did; the locked profile entity is reused for the
    completion instead of a second `lockById`.
  - Read once: validation reads the consents on file in one query, only when the request leaves a required consent out (it
    was one count per missing type).
  - New test `consentsAlreadyOnFileCountUnlessRevokedAndThePrefillShowsTheCaseAsStored` (a patient-wide consent on file need not
    be repeated, a revoked one must; the pre-fill and result show the stored case number, stage, waiting-on and onboarding state).
  Verification: full suite **589 tests, 0 failures** (2 skipped; +1 test); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest` **PASS** on a
  freshly reset PostgreSQL 17 (V1–V73, new queries included).

- 2026-10-07 — **`PublicCaseAccessService` converted** (CL5 read slice 7; removed from `JDBC_NOT_YET_CONVERTED`, 11 → 10).
  `case_access_links` and `case_access_challenges` are now **R**: no plain-SQL reader is left. Every read here is a command
  lookup or an authorization check (no list view), so they became repository reads used by the service directly; no query
  service was needed. Public contract unchanged: token → link resolution (revoked/expired → `CASE_LINK_INVALID` 404), the
  grant check (`VERIFICATION_REQUIRED` 401), code verification (`VERIFICATION_INVALID`, attempt counting, open code first),
  the hourly limits (5 codes per link → `TOO_MANY_REQUESTS` 429; 3 silent recovery links per case), purpose checks, masks,
  status labels/phases and the "already invited" onboarding rule.
  - Queries added: `CaseAccessLinkRepository.findByTokenHash` (the link as its token resolves it; liveness stays in Java) and
    `existsLive` (unrevoked, unexpired link of a purpose); `CaseAccessChallengeRepository.countByLinkIdAndCreatedAtAfter`,
    `findCurrentOf` (open code first, then newest — `Limit.of(1)`; no NULL sort involved), `findLastVerifiedDelivery` (channel and
    masked destination of the last consumed code in one row — it was two identical reads) and `hasLiveGrant`;
    `MedicalCaseRepository.findRecoveryContact` (non-draft case by number with the patient's own number and language). Reused:
    `MedicalCaseRepository.findOnboardingFacts` (case number + stage for the status view).
  - Read once: `CaseContactResolver.CaseContact` now carries the case's patient id (the resolver already loads it), so issuing an
    information/status link and stamping a verified channel no longer re-read `medical_cases.patient_id`; requesting a code
    resolves the contact once (it was resolved for the code and again for the summary). The onboarding link keeps its "case
    missing → no link" rule with `findById`, which leaves the case in the persistence context for the resolver.
  - Locks: unchanged — stamping a verified channel still locks the patient profile (`lockById`); no `FOR UPDATE` select existed.
  - New test `caseAccessChecksTheOpenCodeLimitsSendsAndExpiresGrantsAndLinks` (draft never recovered, recovery limit, summary
    mask, resend revokes the earlier code, status view labels, a grant opens only its own link, the 5-codes limit leaves an issued
    grant valid, grant expiry at 30 minutes, link expiry at 30 days).
  Verification: full suite **590 tests, 0 failures** (2 skipped; +1 test); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest`
  **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

- 2026-10-07 — **`PatientAccountService` converted** (CL5 read slice 8; removed from `JDBC_NOT_YET_CONVERTED`, 10 → 9).
  `patient_account_link_requests` and `case_submission_contacts` are now **R**: no plain-SQL reader is left. Every read is a
  command lookup or a single-row view (account state, the sign-in session, the "is this case for you?" question, "Profile &
  Security"), so — as for `PublicCaseAccessService` — they are repository projection reads used by the service directly; no
  query service was needed. Public contract unchanged: account setup/resume/resend rules and the 10-minute resend guard, the
  7-day continuation link, token → request resolution (`ACCOUNT_LINK_INVALID` 404, `ACCOUNT_LINK_EXPIRED` 410,
  `ACCOUNT_LINK_WRONG_ACCOUNT` 403, replay of a resolved request only for its resolver), `ACCOUNT_SETUP_NOT_STARTED`,
  `PATIENT_NOT_FOUND`, `PATIENT_PROFILE_NOT_FOUND`, `PATIENT_NOT_LINKED`, masks, and the current-case rule.
  - Queries added: `PatientProfileRepository.findAccount` and `findAccountBySubject` (one shared `ACCOUNT` select; a patient
    folded into another by a merge owns no account) and `findOwnProfile`; `PatientAccountLinkRequestRepository.findByToken`
    (`LinkRequest` projection; expiry and ownership stay in Java), `findNewestPendingEmails` (unanswered, newest first, expired
    included as before — `Limit.of(1)`), `hasLivePendingFor` (patient), `countLivePendingTo` (address; the session's pending
    count) and `existsByPatientIdAndEmail` (an answered request is never re-opened); `MedicalCaseRepository.findCurrentCasesOf`
    (open cases, waiting-on-patient first, then `updatedAt desc` — `Limit.of(1)`; no NULL sort involved),
    `findSubmissionAddress` (intake existing-account check: patient, submitter email, case language) and `findLinkedCase`
    (case number, patient name, submitter role and relationship). Reused: `CaseSubmissionContactRepository.findSubmitter` for
    the submitter's number (one contact per case, `uq_case_submission_contact`).
  - Locks: unchanged — every profile change still goes through `PatientProfileRepository.lockById` (lock + refresh); no
    `FOR UPDATE` select existed. A link request without a submission contact still fails as an internal error (it was
    `EmptyResultDataAccessException`, now `IllegalStateException`; both map to `INTERNAL_ERROR`).
  - New test `aPendingContinuationLinkShowsUntilItExpiresCanBeResentAndIsNeverReopenedOnceAnswered` (account state and the
    session's pending count for the address's owner only, expiry, resend of the newest unanswered request by rotation, an
    answered request is not re-opened or re-sent, `ACCOUNT_SETUP_NOT_STARTED` once nothing is pending). It also passes on the
    pre-conversion service.
  Verification: full suite **591 tests, 0 failures** (2 skipped; +1 test); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest`
  **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

- 2026-10-07 — **`PatientActionService` converted** (CL5 read slice 9; removed from `JDBC_NOT_YET_CONVERTED`, 9 → 8).
  `patient_action_items` is now **R**: no plain-SQL reader is left. The one view — the case's open information request
  (`openAction`, shown on the secure link, the case page and to the action resolver) — moved to a new
  `journey.application.PatientActionQueryService`: two queries (the request, then its lines), where it was three (id, row,
  lines). `CaseWorkspaceQueryService` and `CaseActionService` call the query service directly; `PublicCaseAccessService` keeps
  calling the unchanged `PatientActionService.openAction`, which delegates. The commands (`request`, `openJourneyAction`,
  `completeJourneyAction`, `completeByPatient`, `recordOnBehalf`) read through repositories. Public contract unchanged: one
  open request per case (a repeat extends it and never duplicates a line), the terminal-case refusal (`CASE_NOT_FOUND` 404,
  `CASE_NOT_ACTIONABLE` 409), `INVALID_CHANNEL`, `NO_OPEN_PATIENT_ACTION`, required-answer enforcement, foreign item ids
  ignored, the replay rule (no second review or notification), the review summary and the stage restore.
  - Queries added: `CaseTaskRepository.findOpenPatientActionOfType` (newest open PATIENT_ACTION task of a type — the
    information request or a Journey action; `Limit.of(1)`) and `findOpenPatientActionRowsOfType` (the same, with title,
    message, blocking and due date for the view); `PatientActionItemRepository.findRowsOf` (lines in `sortOrder, createdAt`
    order — both NOT NULL, no NULL sort involved) and `countByTaskId` (next sort position); `MedicalCaseRepository.findPatientName`
    (display name, the `trim(concat(given, ' ', coalesce(family, '')))` rule of the case rows). Reused:
    `MedicalCaseRepository.findStageAndVersion` (case status for the terminal check) and
    `CaseAssignmentRepository.findActivePrimaryCoordinator` (owner of the review work item).
  - Answers (`applyResponses`) now match against the undecrypted line rows instead of the decrypted view: the patient's
    labels and earlier answers are no longer decrypted on the write path.
  - Locks: none — the service never took a row lock; its guarded updates (`renewPatientAction`, `complete`, `moveStatus`,
    `recordAnswer`/`recordDocument`) were already JPQL.
  - New test `anExtendedRequestShowsItsLatestTermsAndEveryLineOnceInOrderAndTheReviewNamesThePatient` (no request → null view;
    an extended request keeps its first title, takes the latest message, blocking flag and due date, lists each line once in
    request order with kind/label/required; a Journey action on the same case is never the information request and is opened
    once; answering closes the view, stores the answer and opens the coordinator's review naming the patient and their note).
    It also passes on the pre-conversion service.
  Verification: full suite **592 tests, 0 failures** (2 skipped; +1 test); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest`
  **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

- 2026-10-07 — **`IdentityVerificationService` converted** (CL5 read slice 10; removed from `JDBC_NOT_YET_CONVERTED`, 8 → 7).
  `patient_identity_verifications` is now **R**: no plain-SQL reader is left (`patient_representatives` and
  `patient_onboardings` stay W — `OnboardingService` and `JourneyCaseRelationships` still read them). The views — one check
  (returned by `start`/`review`), the patient's latest (`latestForCase`, and `latestForPatient` for the onboarding page) and
  the reviewer queue — moved to a new `journey.application.IdentityVerificationQueryService`, one query each, selecting only
  the view columns (never the encrypted legal name/date of birth or the provider reference). The commands read through
  repositories. Public contract unchanged: `CASE_ACCESS_DENIED` 403 unless the identity is the case's patient or holds an
  unrevoked, unexpired representation; `REVIEW_REASON_REQUIRED`, `IDENTITY_NOT_FOUND` 404, `IDENTITY_NOT_REVIEWABLE` 409
  (status check and the guarded `decide`), the 730-day validity, the onboarding hand-offs and the audit case id.
  - Queries added: `PatientIdentityVerificationRepository.findRow`, `findNewestRowsOf` (`createdAt desc`, `Limit.of(1)`),
    `findAwaitingReviewRows` (PENDING/MANUAL_REVIEW by `requestedAt`; always set, no NULL sort involved) — one shared `ROW`
    select — and `findReviewTarget` (status, onboarding and that onboarding's case in one row via a left join; was two reads,
    the case read after the decision — an onboarding never changes case); `MedicalCaseRepository.findPatientIdAccessibleTo`
    (the case's patient for its own identity or an active representative, the `findPatientCaseRows` rule);
    `PatientRepresentativeRepository.findNewestUnrevokedIdsOf` (`effectiveFrom desc`, NOT NULL; expiry not checked, as
    before). Reused: `PatientOnboardingRepository.findNewestOf` for the case's onboarding.
  - Locks: none — the service never took a row lock; the decision stays the guarded JPQL `decide`.
  - New test `identityViewsShowTheLatestCheckTheQueueInRequestOrderAndEachDecisionOnItsCase` (a representative check links the
    representation and the onboarding; latest-first on the case and the onboarding page; another patient's case is refused;
    queue in request order, rejected and verified checks leave it; reject keeps the provider's assurance and records the
    reason; a decided check is not reviewable again; unknown id; verify sets the 730-day expiry, marks the onboarding and
    audits on the case). It also passes on the pre-conversion service.
  Verification: full suite **593 tests, 0 failures** (2 skipped; +1 test); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest`
  **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

- 2026-10-07 — **`CaseHandoffService` converted** (CL5 read slice 11; removed from `JDBC_NOT_YET_CONVERTED`, 7 → 6).
  `audit_events` is now **R** (this was its last plain-SQL reader); `medical_cases`, `case_assignments` and `patient_profiles`
  stay W (`OnboardingService`, `JourneyCaseRelationships` and the coordination reads still use them). Every read is a command
  lookup inside an event handler (deposit required, deposit settled, patient readiness changed), so — as for
  `PublicCaseAccessService` — they are repository reads used by the service directly; no query service was needed. Public
  contract unchanged: only an ACCEPTED case gets deposit work; the handoff (close deposit work, restore the original
  coordinator, TRAVEL work item, shared-queue alert when unowned, the patient's WhatsApp-else-email message in `ar`/`en`) runs
  once, keyed on the `CASE_DEPOSIT_HANDOFF` audit row; the move to TRAVEL_COORDINATION is retried under `CaseTransitionPolicy`
  on every event; unknown cases are ignored.
  - Queries added: `CaseAssignmentRepository.findNewestPrimaryCoordinators` (`CoordinatorAssignment` projection, ended ones
    included, `assignedAt desc` — NOT NULL, `Limit.of(1)`) and `MedicalCaseRepository.findPatientContact` (the patient's own
    number, email and language). Reused: `MedicalCaseRepository.findStageAndVersion` and `findCaseNumber`,
    `CaseAssignmentRepository.findActivePrimaryCoordinator` (the active-owner read, now shared by `currentCoordinator` and
    `restoreCoordinator`) and `AuditEventRepository.countByCaseIdAndEventType` (the one-shot marker).
  - Locks: the two `SELECT status … FOR UPDATE` reads (deposit settled, readiness changed) are now
    `MedicalCaseRepository.lockById` (lock + refresh), still the first statement of each handler, so the lock order is unchanged.
  - New tests in `UatDefectCorrectionsTest`: `aSettledDepositRevivesTheEndedCoordinatorOnceAndTellsThePatientByEmailInTheirLanguage`
    (ended coordinator reinstated once with its audit, TRAVEL work owned by them, deposit work closed, no shared-queue alert,
    patient told by email in Arabic when no number is on file, a replay changes nothing, unknown cases ignored by all three
    handlers) and `aSettledDepositOnACaseNoCoordinatorEverOwnedAlertsTheSharedQueueWithTheCaseNumber` (no coordinator picked,
    unowned TRAVEL work, the deposit-settled team alert carries the case number, patient told on WhatsApp). Both also pass on
    the pre-conversion service.
  Verification: full suite **595 tests, 0 failures** (2 skipped; +2 tests); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest`
  **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

- 2026-10-07 — **`OnboardingService` converted** (CL5 read slice 12; removed from `JDBC_NOT_YET_CONVERTED`, 6 → 5).
  `patient_onboardings` and `consent_records` are now **R** (no plain-SQL reader is left); `patient_representatives`,
  `patient_profiles` and `medical_cases` stay W (`JourneyCaseRelationships` and the coordination reads still use them). The
  onboarding page (`myOnboarding`, `viewForCase` and the view every command returns) moved to a new
  `journey.application.OnboardingQueryService`: the onboarding row, then the case with its patient in one row (case number,
  patient and profile summary were three reads), the latest identity check through `IdentityVerificationQueryService`
  (OnboardingService no longer depends on `IdentityVerificationService`) and the consents covering the case; readiness still
  comes from `CustomerReadinessService`. The commands read through repositories. Public contract unchanged: `CASE_ACCESS_DENIED`
  403 unless the identity is the patient or an active representative, `ONBOARDING_NOT_FOUND` 404, `ONBOARDING_VERSION_CONFLICT`
  409 (version check and the guarded updates), `INVALID_ONBOARDING_CONSENT`, `ONBOARDING_INCOMPLETE`, the 45-day expiry, the
  idempotent creation on acknowledgement, the representative re-grant, the display-name rule and which consents count.
  - Queries added: `PatientOnboardingRepository.findNewestRowsOf` (`Row` projection, `createdAt desc`, `Limit.of(1)` — NOT
    NULL) and `MedicalCaseRepository.findOnboardingHeader` (case number, patient id and profile summary; display name by the
    `CASE_ROW` rule). Reused: `MedicalCaseRepository.findPatientId` and `findPatientIdAccessibleTo`,
    `ConsentRecordRepository.findLiveTypesCovering` (the onboarding-type filter moved from SQL to Java, over the same
    `ONBOARDING_CONSENTS` set the service validates against) and `IdentityVerificationQueryService.latestForPatient`.
  - Removed: `PatientNames.DISPLAY_SQL` (its last user; the JPQL rule lives in the case queries).
  - Locks: none — the service never took a row lock; its writes stay the version-guarded JPQL updates.
  - New test `theOnboardingPageShowsTheCaseItsPatientAndOnlyTheOnboardingConsentsCoveringTheCase` (case number, onboarding row,
    profile summary with verified flags; a patient-wide consent counts, another case's, a revoked one and a non-onboarding
    type do not; staff see the same page; a stale version is refused for subject choice and submission; a representative
    subject bumps the version and requires the representative consent). It also passes on the pre-conversion service. It
    compares the staff view ignoring `readiness.updatedAt`, which is the compute time.
  Verification: full suite **596 tests, 0 failures** (2 skipped; +1 test); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest`
  **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

- 2026-10-07 — **`JourneyCaseRelationships` converted** (CL5 read slice 13; removed from `JDBC_NOT_YET_CONVERTED`, 5 → 4).
  `patient_representatives` and `patient_profiles` are now **R** (no plain-SQL reader is left); `medical_cases` and
  `case_assignments` stay W (`CoordinationReadService` and `CoordinationRepository` still read them). The class is the
  `CaseRelationships` port behind every case-scope authority decision (CASE_TEAM, CASE_CONSULTED, CASE_OFFERED, CASE_OWNER,
  CASE_UNCLAIMED, OWN_PATIENT, supervision); each fact is one existence/count read in `casemanagement`, used directly — no query
  service. Public contract unchanged: the team is ACTIVE and not a second opinion; an offer (PENDING) counts only when asked
  for; a second opinion is CASE_CONSULTED; the owner is the active primary coordinator; intake is unclaimed while RECEIVED with
  no active primary coordinator; a representative reaches the case only while unrevoked, already effective and unexpired.
  - Queries added: `CaseAssignmentRepository.existsByCaseIdAndAssigneeSubjectAndAssigneeRoleAndStatusIn` (offered or active),
    `isActivelyAssigned`, `isConsulted`, `findActiveAssignees` (no order, as before); `MedicalCaseRepository.isUnclaimedIntake`
    and `isOwnPatientCase` (note `effectiveFrom <= now`, which the patient-command access rule `findPatientIdAccessibleTo` does not
    check — both kept as they were). Reused: `CaseAssignmentRepository.findActivePrimaryCoordinator`, which now breaks a
    same-instant tie by `id` as this class did (at most one primary coordinator is active, so other callers are unaffected).
  - `ownPatientCase` compares "effective" and "unexpired" against one `now` (it read the clock twice).
  - Locks: none.
  - New test `AuthorityIntegrationTest.caseRelationshipFactsSeparateTheTeamOffersSecondOpinionsIntakeAndRepresentation` (team vs
    offer vs second opinion vs ended, role match, consulted, active assignees per role, owner and unclaimed intake before and
    after the primary ends, unknown case, the patient and a representative in force vs not yet effective, expired, revoked and a
    stranger). It also passes on the pre-conversion class.
  Verification: full suite **597 tests, 0 failures** (2 skipped; +1 test); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest`
  **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

- 2026-10-07 — **`CoordinationReadService` converted** (CL5 read slice 14; removed from `JDBC_NOT_YET_CONVERTED`, 4 → 3).
  `workforce_people`, `access_subjects` and `workforce_role_assignments` are now **R** (only `LocalDemoDataSeeder`, the excluded
  local-profile exception, still touches them with JDBC — its `NOT EXISTS` guards on its own inserts); the case, task and team
  tables stay W (`CoordinationRepository` reads them). The service's own plain SQL — the coordinator roster with account state,
  names, caseloads and the supervisor's managed-case summary (QA-12) — became JPA projections in the owning modules, assembled in
  the service (it already is the Coordination Setup read service; its overview, consultants and decision feed still go through
  `CoordinationRepository`, converted next). Public contract unchanged: account ACTIVE only while the person and the access switch
  are active, NOT_A_COORDINATOR without the role in force, caseload counts open (not closed/cancelled) primary cases, the summary
  covers active primary coordinators who are members of active care-coordination teams the caller leads now, latest change first,
  with open/overdue/blocking internal work and one `SUPERVISORY_SUMMARY_READ` audit per case.
  - Queries added: `WorkforcePersonRepository.findRoleHolderAccounts` (subject + account state of a role's holders at `at`; the
    roster's encrypted name was selected but unused — names come from the batched names read); `CaseAssignmentRepository.
    countCoordinatorCaseloads` (`in :subjects`, grouped) and `findCoordinatedCases` (`in :subjects`, `updatedAt desc`);
    `CaseTaskRepository.countOpenInternalWork` (`in :caseIds`, grouped; a case without open work is absent and shows zeros).
    Reused: `WorkforceLeadDesignationRepository.findSupervisedMembers` (WF-08 — the same lead/team/membership window the SQL
    used) and `WorkforcePersonRepository.findAllById` for names (the `JourneyCaseQueryService` pattern).
  - The summary is four queries whatever its size (members, cases, work counts, names), where it was one grouped join; it lists
    each (case, coordinator) once — the join could have doubled a case's counts only if one coordinator held two active primary
    assignments on it, which the single-owner rule forbids.
  - Locks: none.
  - New test `CoordinationIntegrationTest.peopleShowAccountStateAndOpenCaseloadAndManagedSummariesListEveryLedCaseLatestFirst`
    (a disabled account, a former coordinator with capacity, closed cases outside the caseload; every led case latest first with
    stage, coordinator name and zero/real work counts; a lead of no team sees nothing). It also passes on the pre-conversion
    service.
  Verification: full suite **598 tests, 0 failures** (2 skipped; +1 test); `ArchitectureRulesTest` 22/22; `PostgresJpaMappingTest`
  **PASS** on a freshly reset PostgreSQL 17 (V1–V73, new queries included).

## Known exceptions to the rules

- `CaseNumberGenerator` reads `nextval('case_number_seq')` through `JdbcClient`: JPQL has no sequence function, and a
  counter table would add a hot row lock to every intake.
- `LocalDemoDataSeeder` (`@Profile("local")`, runs once at startup) still writes with JDBC until it moves to its own
  dev-data package.

## Where it stands (2026-10-06)

- **Writes:** every table is JPA-written except the two exceptions above (the coordination tables followed CL2 on
  2026-10-06). The patient merge (`mergePatient`) was the
  last dynamic-SQL writer (`"UPDATE " + table`); it is now six `moveToPatient` JPQL updates.
- **Reads:** 3 classes still read with `JdbcClient` (2026-10-07: `StaffWorkService`, `CaseActionService`, `JourneyService`,
  `PaymentService`, `ConsultantReferralService`, `PatientActivationService`, `PublicCaseAccessService`,
  `PatientAccountService`, `PatientActionService`, `IdentityVerificationService`, `CaseHandoffService`, `OnboardingService`,
  `JourneyCaseRelationships` and `CoordinationReadService` converted) — plus the three exceptions
  (`CoordinationRepository` reads, `CaseNumberGenerator`, `LocalDemoDataSeeder`). They are
  listed in `ArchitectureRulesTest.JDBC_NOT_YET_CONVERTED`; nothing else may use `JdbcClient` or any other
  `org.springframework.jdbc..`/`java.sql..` type (CL6), and no repository may declare a native query.

## Next slice

Convert the read models, one service per slice, as query services rather than line-by-line translations: most
remaining reads assemble a view across 3–6 tables (case cards, work queues, proposal documents). `StaffWorkService` and
`CaseActionService`, `JourneyService`, `PaymentService`, `ConsultantReferralService`, `PatientActivationService`,
`PublicCaseAccessService`, `PatientAccountService`, `PatientActionService`, `IdentityVerificationService`, `CaseHandoffService`, `OnboardingService`, `JourneyCaseRelationships` and `CoordinationReadService` are done (2026-10-07); next the `CoordinationRepository` reads, then the rest of the list, one service per session. Follow the `StaffWorkService` pattern: one projection query for the rows in the owning module, then one
batched (`in :ids`) query per extra fact, assembled in a `…QueryService` in the caller's `application`. Each slice removes its
class from `JDBC_NOT_YET_CONVERTED`; the full suite is green (0 failures), so any failure is a regression. Move
`LocalDemoDataSeeder` to a `devdata` package.
