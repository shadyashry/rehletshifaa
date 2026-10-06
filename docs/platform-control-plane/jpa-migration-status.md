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
4. **Verification per slice:** `mvn -o -q test`, then compare failing tests with the baseline (101 failures from the
   in-progress CL2 routing work on 2026-10-06, all "An effective routing policy is required"/eligibility); a slice may
   not add a failure. `ArchitectureRulesTest` must stay green.

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
| coordination | `coordination_routing_lock` | — | coordination |
| coordination | `coordination_team_profiles` | — | coordination |
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
| journey | `deposit_components` | W | journey |
| journey | `deposit_policies` | W | journey |
| journey | `deposits` | W | journey |
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
| journey | `payment_events` | W | journey |
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
| journey | `case_claim_challenges` | dead |  |
| journey | `commercial_policies` | R |  |
| shared | `fx_rates` | R |  |
| (none) | `idempotency_records` | dead |  |
| (none) | `platform_access_roles` | dead |  |
| (none) | `platform_governance_commissioning` | dead |  |
| (none) | `platform_governance_commissioning_decisions` | dead |  |
| (none) | `platform_governance_commissioning_participants` | dead |  |
| (none) | `platform_owner_recovery_evidence` | dead |  |
| (none) | `platform_owner_recovery_requests` | dead |  |
| (none) | `practice_manager_delegation_history` | dead |  |
| (none) | `practice_manager_invitations` | dead |  |
| (none) | `provider_membership_details_v` | dead |  |
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

`care_categories` still has a JDBC *read* inside a multi-table join in `JourneyService`;
they convert with `practitioner_profiles`. `audit_events` reads remaining:
`CaseHandoffService`, `JourneyCaseAdmissionRepository`, `JourneyDefinitionRepository`.

## Dead schema (owner decision needed)

Created by migrations but read/written by no code: `idempotency_records` (V2), `platform_access_roles` (V56),
`platform_governance_commissioning`, `…_decisions`, `…_participants`, `platform_owner_recovery_requests`,
`platform_owner_recovery_evidence` (V65), `practice_manager_invitations`, `practice_manager_delegation_history` (V64),
`provider_membership_details_v` (V59), `case_claim_challenges` (its only reference was the patient merge, which no longer
touches it). Either implement the feature or drop them before `main` (pre-production rule).

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
  **Deferred:** the coordination tables (`coordination_*`, `coordinator_capacity`, `consultant_routing_preferences`)
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

## Known exceptions to the rules

- `CaseNumberGenerator` reads `nextval('case_number_seq')` through `JdbcClient`: JPQL has no sequence function, and a
  counter table would add a hot row lock to every intake.
- `LocalDemoDataSeeder` (`@Profile("local")`, runs once at startup) still writes with JDBC until it moves to its own
  dev-data package.
- `CoordinationRepository` keeps its own-table writes (`coordination_*`, `coordinator_capacity`,
  `consultant_routing_preferences`) until the in-progress CL2 routing slice lands; its case-table writes are JPA.

## Where it stands (2026-10-06)

- **Writes:** every table is JPA-written except the three exceptions above. The patient merge (`mergePatient`) was the
  last dynamic-SQL writer (`"UPDATE " + table`); it is now six `moveToPatient` JPQL updates.
- **Reads:** 17 classes still read with `JdbcClient` — `JourneyService` (~85 statements), `PaymentService`,
  `ConsultantReferralService`, `PatientActivationService`, `PublicCaseAccessService`, `PatientAccountService`,
  `StaffWorkService`, `CaseActionService`, `PatientActionService`, `IdentityVerificationService`, `CaseHandoffService`,
  `OnboardingService`, `JourneyCaseRelationships`, `CoordinationReadService`, plus the three exceptions. They are
  listed in `ArchitectureRulesTest.JDBC_NOT_YET_CONVERTED`; nothing else may use `JdbcClient`.

## Next slice

Convert the read models, one service per slice, as query services rather than line-by-line translations: most
remaining reads assemble a view across 3–6 tables (case cards, work queues, proposal documents). Start with
`StaffWorkService` and `CaseActionService` (work queues), then `JourneyService` split by view. Each slice removes its
class from `JDBC_NOT_YET_CONVERTED`. Prerequisite for confidence: the CL2 routing baseline (101 failures) must be
green, because ~50 proposal-path tests stop at coordinator routing today. Move `LocalDemoDataSeeder` to a `devdata`
package; convert the coordination writes after CL2.
