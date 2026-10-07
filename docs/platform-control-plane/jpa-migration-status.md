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
| directory | `patient_profiles` | W | access,authority,casemanagement,journey |
| directory | `patient_representatives` | W | authority,journey |
| authority | `platform_role_assignments` | W | access,authority,identity |
| directory | `practice_managers` | W | access,authority,clinic |
| directory | `practitioner_profiles` | W | access,authority,clinic,coordination,identity,journey |
| authority | `workforce_role_conflicts` | W | access,authority |
| casemanagement | `case_access_links` | W | casemanagement,journey |
| casemanagement | `case_intake_grants` | R | casemanagement |
| casemanagement | `case_status_history` | W | casemanagement,journey |
| casemanagement | `case_submission_contacts` | W | casemanagement,journey |
| casemanagement | `consent_records` | W | casemanagement,journey |
| document | `medical_documents` | W | casemanagement,document,journey |
| clinic | `audit_events` | W | clinic,journey |
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
| journey | `case_access_challenges` | W | journey |
| journey | `case_message_reads` | W | journey |
| journey | `case_messages` | W | journey |
| journey | `clinical_review_cost_estimates` | W | journey |
| journey | `clinical_review_versions` | W | journey |
| journey | `consultant_referrals` | W | journey |
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
| journey | `patient_account_link_requests` | W | journey |
| journey | `patient_action_items` | W | journey |
| journey | `patient_identity_verifications` | W | journey |
| journey | `patient_onboardings` | W | journey |
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
| workforce | `access_subjects` | W | access,authority,coordination,identity,workforce |
| workforce | `workforce_current_managers` | W | access,workforce |
| workforce | `workforce_functions` | W (read-only entity) | clinic,workforce |
| workforce | `workforce_lead_designations` | W | access,coordination,workforce |
| workforce | `workforce_people` | W | access,authority,clinic,coordination,identity,journey,workforce |
| workforce | `workforce_reporting_lines` | W | access,workforce |
| workforce | `workforce_role_assignments` | W | access,authority,clinic,coordination,identity,journey,workforce |
| workforce | `workforce_role_catalogue` | W (read-only entity) | access,workforce |
| workforce | `workforce_team_memberships` | W | access,coordination,workforce |
| workforce | `workforce_teams` | W | access,coordination,workforce |

`care_categories` is read only through `CareCategoryRepository` since `JourneyService` was converted (2026-10-07).
`audit_events` reads remaining:
`CaseHandoffService`, `JourneyCaseAdmissionRepository`, `JourneyDefinitionRepository`.

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

## Known exceptions to the rules

- `CaseNumberGenerator` reads `nextval('case_number_seq')` through `JdbcClient`: JPQL has no sequence function, and a
  counter table would add a hot row lock to every intake.
- `LocalDemoDataSeeder` (`@Profile("local")`, runs once at startup) still writes with JDBC until it moves to its own
  dev-data package.

## Where it stands (2026-10-06)

- **Writes:** every table is JPA-written except the two exceptions above (the coordination tables followed CL2 on
  2026-10-06). The patient merge (`mergePatient`) was the
  last dynamic-SQL writer (`"UPDATE " + table`); it is now six `moveToPatient` JPQL updates.
- **Reads:** 13 classes still read with `JdbcClient` (2026-10-07: `StaffWorkService`, `CaseActionService`, `JourneyService` and
  `PaymentService` converted) — `ConsultantReferralService`, `PatientActivationService`, `PublicCaseAccessService`,
  `PatientAccountService`, `PatientActionService`, `IdentityVerificationService`, `CaseHandoffService`,
  `OnboardingService`, `JourneyCaseRelationships`, `CoordinationReadService`, plus the three exceptions. They are
  listed in `ArchitectureRulesTest.JDBC_NOT_YET_CONVERTED`; nothing else may use `JdbcClient` or any other
  `org.springframework.jdbc..`/`java.sql..` type (CL6), and no repository may declare a native query.

## Next slice

Convert the read models, one service per slice, as query services rather than line-by-line translations: most
remaining reads assemble a view across 3–6 tables (case cards, work queues, proposal documents). `StaffWorkService` and
`CaseActionService`, `JourneyService` and `PaymentService` are done (2026-10-07); next `ConsultantReferralService`, then the
rest of the list, one service per session. Follow the `StaffWorkService` pattern: one projection query for the rows in the owning module, then one
batched (`in :ids`) query per extra fact, assembled in a `…QueryService` in the caller's `application`. Each slice removes its
class from `JDBC_NOT_YET_CONVERTED`; the full suite is green (0 failures), so any failure is a regression. Move
`LocalDemoDataSeeder` to a `devdata` package.
