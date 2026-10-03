# Independent verification of the architecture challenge review

Date: 2026-09-26  
Branch/working state reviewed: `codex/platform-control-plane`, including the uncommitted V53 slice

> **Disposition:** This report verifies canonical revision 2 as it existed during the review. Its confirmed gaps and
> corrections are incorporated into canonical revision 3 and the linked phased execution plan; this report remains
> the evidence record rather than the current requirements source.

## 1. Verdict on the review: RELIABLE WITH CORRECTIONS

The review identifies the principal authorization, eligibility, concurrency, identity-consistency, and retirement risks, and most code claims are reproducible. It is not fully reliable: F-05 describes an imprecise race ordering, F-18 overstates plaintext propagation, F-21 incorrectly says the schema lacks `SUSPENDED`, and the provider-dependency inventory is incomplete. It also misses two direct disclosure paths and a referral-creation concurrency/idempotency defect. “READY FOR IMPLEMENTATION” is defensible only for starting the gated remediation programme; it is not evidence that V53 is safe to commit or that the platform architecture is closed.

## 2. Evidence verification table

| Finding | Claim | Status | Code evidence (short exact excerpts) | Severity assessment |
|---|---|---|---|---|
| F-01 | Pending assignments grant full case/document access. | **PARTLY TRUE** | `JourneyService.java:861`: `status IN ('PENDING','ACTIVE')`; `:134`: `authorizeRead(caseId,actor)` before constructing the workspace; `SecureDocumentService.java:25-26`: `access.assertCanReadDocument(caseId)` for download and list. `ConsultantVirtualClinicTest.java:140` asserts the pending transfer offeree can open the workspace. | **BLOCKER justified.** The central claim is verified, and the focused test passed. The review did not enumerate all reachable surfaces; see below and MF-01/MF-02. |
| F-02 | Care area **or** approved CARE_AREA capability makes a Consultant eligible. | **VERIFIED** | `ConsultantEligibilityService.java:33-39`: `(p.care_category=:area OR EXISTS (... capability_type='CARE_AREA' ... status='APPROVED'))`; `:60-62` reports `PRIMARY_CARE_AREA` or `APPROVED_CAPABILITY`. | **HIGH justified.** The profile branch contradicts the target capability-authority rule. |
| F-03 | One current verified credential is sufficient; profile expires only when none remains. | **VERIFIED** | `ConsultantEligibilityService.java:37-39`: `EXISTS (SELECT 1 FROM practitioner_credentials ... status='VERIFIED' ...)`; `CredentialExpiryService.java:39-46`: profile selection uses `NOT EXISTS` any current verified credential before setting `credentialing_status='EXPIRED'`. | **HIGH justified.** The code does not enforce a professional-type/jurisdiction requirement set. |
| F-04 | `SYSTEM_ADMIN`/`AUDITOR` bypass clinical/ownership/governance checks. | **PARTLY TRUE** | `JourneyService.java:861`: `if(actor.has(SYSTEM_ADMIN)||actor.has(AUDITOR)... )return`; `:863`: `if(actor.has(SYSTEM_ADMIN))return`; `ConsultantReferralService.java:152,192`: coordinator decisions admit `SYSTEM_ADMIN`; `ConsultantCapabilityService.java:76-85` admits it as governor; `JourneyService.java:430,433` admits it for enable/verification. | **HIGH understated in breadth.** The stated bypasses are real, but additional bypasses were omitted. |
| F-05 | Transfer acceptance can race a clinical decision and leave no active primary. | **PARTLY TRUE** | `ConsultantReferralService.java:217-224` reads assignment/referral without a lock; `:246-247` ends source then activates target and ignores both update counts; `:286-291` independently ends the pending target and withdraws the referral. | **HIGH justified.** The outcome is reproducible, but only if acceptance reads the old state before the clinical-decision transaction commits; an acceptance begun wholly after that commit is rejected. |
| F-06 | Concurrent initial offers/acceptances can yield two active primaries. | **VERIFIED** | `JourneyService.java:197` ends visible rows and inserts `PENDING` without locking the case; `:865`: `if(current.status().equals(target))return`; `:306-318` activates the caller's pending assignment. `V2__end_to_end_care_platform.sql:109-126` has only non-unique assignment indexes. | **HIGH justified.** No database or locked aggregate invariant prevents duplicate primary rows. |
| F-07 | Acceptance does not recheck eligibility. | **VERIFIED** | `JourneyService.java:306-328` and `ConsultantReferralService.java:215-277` check assignment/referral/case state but never call `ConsultantEligibilityService`. | **HIGH justified.** Eligibility can change between offer and acceptance. |
| F-08 | Active clinical writes survive credential/lifecycle loss. | **VERIFIED** | `JourneyService.java:878` checks only an `ACTIVE` non-referral assignment; clinical commands call it at `:210`, `:435`, `:440`, `:664`, `:760`, `:768`, `:776`, `:785`. | **HIGH justified.** Expiry changes profile state but not authorization of an existing assignment. |
| F-09 | Grant/revoke lacks self-action and last-administrator protection. | **VERIFIED** | `RoleAssignmentService.java:26-74` grants with no `actor.subject()==command.subject()` guard; `:77-81` revokes with no self/last-effective-admin check. | **HIGH justified.** One-shot bootstrap (`AccessBootstrapService.java:10-28`) does not protect later governance mutations. |
| F-10 | Business authority is derived from Keycloak realm/token roles. | **VERIFIED** | `JwtRoleConverter.java:14-18`: reads `realm_access.roles` and top-level `roles`, then creates `ROLE_...`; `ActorContext.java:24-32` builds `ActorRole` solely from those authorities. | **HIGH justified.** Database lifecycle/assignment authority is not the universal per-request source of truth. |
| F-11 | MFA assurance is not checked. | **VERIFIED** | `ActorContext.java:29-30` reads only `auth_time`; `:58` checks age only. No `acr` or `amr` use exists in backend or realm configuration. | **HIGH justified.** Recent authentication is not equivalent to MFA assurance. |
| F-12 | Keycloak side effects occur inside database transactions. | **VERIFIED** | `JourneyService.java:425,430`: `staffIdentity.setEnabled(...)` precedes DB updates inside `@Transactional`; `VirtualClinicService.java:495-513`: identity invite precedes manager insert in the same transaction. | **HIGH justified.** Either side can commit while the other fails. |
| F-13 | Practice-manager invitation lacks consent/MFA/reuse and retains patient role. | **VERIFIED** | `VirtualClinicService.java:507-511` inserts a manager directly as `ACTIVE`; `:517-529` can widen permissions/reactivate without recent auth. Realm `defaultRoles` contains `PATIENT` (`realm-rehletshifaa.json:25-27`), while manager invitation does not call the staff-role removal at `KeycloakStaffIdentityService.java:111-115`. | **HIGH justified.** This combines delegation and role-confusion risks. |
| F-14 | Journey authority/cutover is ambiguous and disabled by default. | **VERIFIED** | `application.yml:80,85`: both `journey.runtime.enabled` and `journey.runtime.production-intake-enabled` default to `false`; `CaseHandoffService.java:86,120` locks rows and `:137-146` performs the guarded, idempotent `ACCEPTED -> TRAVEL_COORDINATION` entry. | **HIGH justified.** It is the only implemented handoff into the enabled journey runtime, while later parity remains incomplete. |
| F-15 | No scheduled activation-handoff reconciliation exists. | **VERIFIED** | The only `@Scheduled` methods are `CoordinationQueueRetry.java:20`, `CredentialExpiryService.java:32`, `ProposalExpiryService.java:25`, and `NotificationOutboxProcessor.java:31`. | **MEDIUM justified.** A crash gap has no periodic repair path. |
| F-16 | Referral offers/second-opinion access have no expiry. | **VERIFIED** | V53 `consultant_referrals` (`V53__consultant_virtual_clinic.sql:146-175`) and V2 `case_assignments` have no offer `expires_at`; `ConsultantReferralService.java:117-138` ends second-opinion access only on submission. | **MEDIUM justified.** Pending or abandoned access can persist indefinitely. |
| F-17 | Referrer withdrawal/post-arrival referral are absent. | **VERIFIED** | `ConsultantReferralService.java:63-66` permits create only in `CONSULTANT_REVIEW`; the only withdrawal code is internal `withdrawOpenTransfers` at `:283-298`, not a referrer command. | **MEDIUM justified.** These are explicit target-workflow gaps. |
| F-18 | Free text is plaintext in audit/notifications and audit is mutable. | **PARTLY TRUE** | Plaintext exists: V53 `coordinator_note`/`receiver_reason` at `:162,164`; `JourneyService.java:891` writes `audit_events.reason`. Contrary evidence: `StaffWorkService.java:211-214` stores notification title/context using `encrypt(...)`; `:372-374` implements encryption; `:240-244` email data is encrypted and contains title, case reference, and role. | **MEDIUM justified only for audit/referral columns and append-only controls.** The notification/work-item plaintext claim is wrong. |
| F-19 | V53 cascading deletes can erase clinic/capability history. | **VERIFIED** | `V53__consultant_virtual_clinic.sql:7,34,57,93,129`: `ON DELETE CASCADE` from practitioner/clinic roots. | **MEDIUM justified.** No present delete command was found, but the schema permits destructive history loss. |
| F-20 | Capability approval overwrites state without reason/evidence/history. | **VERIFIED** | `ConsultantCapabilityService.java:52-60` performs an upsert/update with no reason/evidence parameter or immutable decision record. | **MEDIUM justified.** Audit text alone is not a decision-history model. |
| F-21 | Consultant lifecycle is fragmented and there is no `SUSPENDED`. | **PARTLY TRUE** | Fragmentation is real, but `V2__end_to_end_care_platform.sql:90` explicitly allows `credentialing_status IN (...,'SUSPENDED',...)`. No direct-practitioner service transition to that value was found. | **MEDIUM justified for the missing coherent lifecycle; evidence wording is wrong.** |
| F-22 | Disabled/suspended owners retain clinic write authority. | **VERIFIED** | `VirtualClinicService.java:78-95` authorizes a `DOCTOR` owner by subject/profile ownership; lifecycle checks apply only to delegates at `:89-92`. | **MEDIUM justified.** Owner mutation authority is not revoked by practitioner lifecycle. |
| F-23 | Audience/claim acceptance is too broad. | **VERIFIED** | `KeycloakClientTokenValidator.java:14-16`: accepts `aud` **or** `azp`; `JwtRoleConverter.java:14-17` also trusts top-level `roles`. | **MEDIUM justified.** Both broaden accepted token shapes beyond a single explicit API audience/role source. |
| F-24 | Disable does not revoke sessions; token lifetimes are unspecified. | **VERIFIED** | `KeycloakStaffIdentityService.java:82-86` only PUTs `{enabled: ...}`; no logout/session-revocation call exists. The realm export contains no token/session-lifespan settings. | **MEDIUM justified.** Existing tokens remain usable until external expiry unless every request rechecks lifecycle, which it does not. |
| F-25 | Platform owner recovery/transfer is undefined in code. | **VERIFIED** | The only owner artefact found is the V31 `PLATFORM_OWNER` template; no owner relationship, successor, recovery, or transfer aggregate exists. | **MEDIUM justified.** It is a governance availability risk. |
| F-26 | Rev 1 omitted break-glass/recertification/dormancy/service-account/recovery requirements. | **CANNOT VERIFY** | Revision 1 is not present in the supplied repository state. Revision 2 defines IAM-13..IAM-17 and SUP-01..SUP-04. | **Severity reasonable if the historical claim is true**, but the claimed rev-1 absence is not independently provable. |
| F-27 | Jurisdiction/legal basis/residency/retention are unresolved. | **PARTLY TRUE** | `commercial-workflow-status.md:138` records Egyptian legal/tax questions; `qa-test-protocol.md:14` names Egypt as destination. Neither establishes controller/processor, residency, transfer, retention, or applicable-law decisions; rev 2 leaves OD-01 open. | **Production BLOCKER justified.** The review's inference from EGP alone is overstated, but the decision gap is real. |
| F-28 | Rev 1 had no data-classification/retention model. | **CANNOT VERIFY** | Revision 1 is unavailable; revision 2 defines DAT-01..DAT-08 and keeps retention gated by OD-01. | **MEDIUM reasonable conditionally.** |
| F-29 | Rev 1 had no SLO/RTO/RPO/restore/alerting requirements. | **CANNOT VERIFY** | Revision 1 is unavailable; revision 2 defines OPS-01..OPS-09 and OD-06. | **MEDIUM reasonable conditionally.** |
| F-30 | Consultant Operations/Credential Verification ownership is not implementable. | **VERIFIED** | No Consultant-Operations owner/onboarder relationship is persisted; searches find only role/assignment authority, not ownership of a Consultant account. | **MEDIUM justified.** The proposed SoD rule lacks an enforceable relationship fact. |
| F-31 | Provider-retirement inventory is incomplete and rollback boundary unclear. | **PARTLY TRUE** | Section I captures major ports/tables, but live dependencies are missing, including `ProviderCaseSummaryService.java:50-52`, `PricingCatalogService.java:90`, `RoleTemplateRepository.java:18,23,51,77`, `ResourceRelationshipRepository.java:17,24,29,33`, `AccessQueryService.java:141,179`, and `CoordinationReadService.java:49,84`. | **MEDIUM understated.** A supposedly exhaustive cutover inventory that omits live authority/read paths can invalidate retirement evidence. |
| F-32 | Recommended pre-acceptance preview is appropriate. | **CANNOT VERIFY** | This is a policy/design recommendation, not a current-code fact. No approved DPO/medical decision exists; OD-04 remains open. | **LOW appropriate.** Fail-safe minimal fields are prudent, but approval is a privacy/clinical business decision. |
| F-33 | Rev 1 omitted staffing/support/manager-responsibility detail. | **CANNOT VERIFY** | Revision 1 is unavailable; revision 2 defines STF-11, SUP-01..SUP-04, and role responsibilities. | **LOW reasonable conditionally.** |
| F-34 | Medical-device software standards are not applicable. | **CANNOT VERIFY** | No diagnostic/treatment algorithm was found, but regulatory scope depends on intended use, claims, jurisdictions, and future features—not repository code alone. | **OBSERVATION overstated.** “Not yet classified; trigger an intended-use assessment” is supportable; “not applicable” is not closed evidence. |
| F-35 | Rev 1 accessibility baseline was incomplete. | **CANNOT VERIFY** | Revision 1 is unavailable; revision 2 now states WCAG 2.2 AA. | **LOW reasonable conditionally.** |
| F-36 | Clinic reads lazily create the clinic row. | **VERIFIED** | `VirtualClinicService.java:83-85` calls `ensureClinic`; `:70-75` performs the insert. | **OBSERVATION appropriate.** It is an accurate current-state note. |
| F-37 | `clinic` still depends on retired `provider` code. | **VERIFIED** | `ConsultantEligibilityService.java:5,42-45` imports/injects `ProviderCredentialEligibility`. | **OBSERVATION appropriate**, but it must be included in cutover compilation/architecture tests. |

### F-01 reachable surfaces

A Consultant with a pending initial, transfer, or second-opinion assignment can reach:

- Full `workspace()` (`JourneyService.java:133-153`): patient/case data, timeline, tasks, messages, assignments, clinical/cost reviews, latest proposal, commercial/readiness gates, delivery/deposit state, condition description, and current actions.
- Document list plus download/view (`DocumentController.java:13`; `SecureDocumentController.java:12-13`; `SecureDocumentService.java:25-26`).
- Customer-readiness and deposit views (`JourneyService.java:51-52`).
- Message-read mutation (`JourneyService.java:355`) because it calls only `authorizeRead`; sending messages and completing tasks do require an accepted assignment.
- The receiver's referral data, including decrypted clinical reason (`ConsultantRoutingController.java:46-47`; `ConsultantReferralService.java:109-114,303-311`). This access also survives decline/end; see MF-02.
- The pending offer's work item through `/work`: `StaffWorkService.java:134-154` returns patient name, case number/status, care area, and document count; see MF-01.
- Their own offer notification (`StaffWorkService.java:173-181`), but not another subject's notifications. `assignedCases()` is restricted to `ACTIVE` (`JourneyService.java:79-82`), so it is not an additional pending path.

The focused command `mvn "-Dmaven.repo.local=C:\Users\hp\.m2\repository" -o -q test "-Dtest=ConsultantVirtualClinicTest"` completed with exit code 0.

### Exact concurrency traces

**F-05 under PostgreSQL READ COMMITTED:** T1 (acceptance) reads `PENDING`, `AWAITING_CONSULTANT`, `CONSULTANT_REVIEW`, and source `ACTIVE`. Before T1 writes, T2 (`reviewDecision`) commits the clinical transition and `withdrawOpenTransfers`, ending the target and marking the referral `WITHDRAWN`. T1 then ends the source (`UPDATE` count 1), attempts to activate the already-ended target (`UPDATE` count 0), marks the referral `COMPLETED`, and commits. Result: zero active primary Consultants. If T1 starts only after T2 commits, it fails at its state/status checks; that is the correction to Claude's stated ordering.

**F-06 under PostgreSQL READ COMMITTED:** two assignment transactions can each see no row inserted by the other, end only rows visible to their statement snapshot, and insert separate `PENDING` primary offers. The second transition observes `CONSULTANT_ASSIGNMENT_PENDING` and returns early. Later each Consultant updates their own `PENDING` row to `ACTIVE`; the second case transition again returns early. The schema has no uniqueness constraint, so two active primaries remain.

### Additional F-04 bypasses omitted by the review

`SYSTEM_ADMIN` is also admitted to eligible-consultant reads (`JourneyService.java:124`), case transition/update-care-category/assignment/history paths (`:172,174,178,190,192`), broad message-thread selection (`:350-351`), task completion/cancellation/reassignment overrides (`:360-361,413`), practitioner creation/invite/credential commands (`:428-433`), and the accepted-assignment bypass shared by message/task operations (`:857`). `COORDINATOR_LEAD` and `AUDITOR` also bypass accepted assignment at `:857`; the auditor remains write-blocked by `authorizeWrite`, but `markMessageRead` calls only `authorizeRead`.

## 3. Missed findings

### MF-01 — Pending offeree receives patient identity and document count through My Work

- **Severity:** BLOCKER · **Domain:** Clinical access / privacy
- **Evidence:** Offer creation assigns a work item to the offeree. `StaffWorkService.java:134-154` scopes by `owner_subject` but returns `patient_name`, `case_number`, `case_status`, `care_category`, and `document_count`; it does not check assignment acceptance.
- **Risk:** ASG-05/REF-04 can be fixed in `authorizeRead` while the same pre-acceptance patient disclosure remains through `/api/v1/work`.
- **Required correction:** Use a separate minimal offer-preview DTO/work-item shape before acceptance; do not join patient identity or documents for an unaccepted clinical offer.
- **Acceptance test:** A pending initial/transfer/second-opinion offeree receives only the OD-04 preview fields from every work/notification endpoint; patient name, case number if identifying, and document count/content are absent. The fields appear only after acceptance.
- **Standards trace:** OWASP API1:2023 BOLA; INV-12; ASG-05; REF-04.
- **Blocks:** Phase 0 and any shared V53 deployment.

### MF-02 — Former referral receiver retains decrypted referral access after assignment end

- **Severity:** HIGH · **Domain:** Clinical access / BOLA
- **Evidence:** `ConsultantReferralService.java:109-114` returns referrals when `a.assignee_subject=?` with no assignment/referral-status condition. `:303-311` decrypts and returns `clinical_reason_encrypted` (and opinion, if present). Decline clears `target_assignment_id` from the referral at `:232-233`, but completed/withdrawn referrals retain the link after the linked assignment ends, and no case-read authorization is called by `ConsultantRoutingController.java:46-47`.
- **Risk:** A receiver whose time-bounded clinical relationship ended can continue reading clinical referral content by case ID.
- **Required correction:** Authorize the referral relation and allowed fields from current assignment/referral state; sever or history-scope receiver access when the relationship ends, subject to an explicitly approved continuity rule.
- **Acceptance test:** Pending uses only OD-04 preview; declined, expired, withdrawn, and ended receivers get 403/not-found for clinical content. A completed receiver sees clinical content only while a separate current active assignment still authorizes it; an active second-opinion receiver and authorized referrer see only their approved fields.
- **Standards trace:** OWASP API1:2023 BOLA; INV-12; REF-04/REF-05/REF-09.
- **Blocks:** Phase 0.

### MF-03 — Referral creation is neither atomic nor idempotent

- **Severity:** HIGH · **Domain:** Concurrency / workflow integrity
- **Evidence:** `ConsultantReferralService.java:72-74` performs `COUNT(*)` for an open referral, then `:85-89` inserts without locking the case or a database uniqueness invariant. Referral/assignment controllers do not consume `Idempotency-Key`; `SecurityConfig.java:44` merely allows the header.
- **Risk:** Concurrent clicks/retries can create multiple open referrals of the same type, duplicate work/audit/notification side effects, and conflicting offers.
- **Required correction:** Lock the case/aggregate, enforce the open-referral invariant at the database-safe command boundary, and persist actor+endpoint+body-hash idempotency results.
- **Acceptance test:** Parallel identical commands and retries with one key produce one referral and one side-effect set; key reuse with a different body is rejected; concurrent different keys cannot create more than one open referral of a type for a case.
- **Standards trace:** SEC-03; OWASP API6:2023 Unrestricted Access to Sensitive Business Flows.
- **Blocks:** Phase 0 referral concurrency acceptance.

### Hostile-path checks with no additional finding

- `/api/v1/clinics/**` is only broadly authenticated at the filter, but every inspected service operation calls `access(practitionerId)`; `mine()` is subject-scoped. No clinic-ID BOLA was demonstrated.
- Document list/download/view does resolve the document's case and calls case authorization. Its exploitable flaw is F-01, not a separate document-ID bypass.
- Public intake routes are `permitAll` (`SecurityConfig.java:7-11`), but creation calls bot protection (`CaseController.java:15`), and presign/confirm/submit require an expiring hashed `X-Case-Grant` (`CaseIntakeGrantService.java:34,41,46-48`; `CaseService.java:58`). No unauthenticated case-ID bypass was demonstrated.

## 4. Canonical-document consistency issues

An automated ID check found **250 defined requirement/decision/invariant IDs, all unique**. All **134 requirement-style IDs referenced by the review** are defined; `ICD-11` is an external classification name, not an undefined requirement. The specifically requested ASG-05, REF-08, CNS-12, IAM-11, IDO-01, DAT-06, OPS-05, INV-25, and OD-05 exist and have the meanings used by the review.

| ID | Problem | Suggested fix |
|---|---|---|
| CAN-01 | `SEC-06` says “Staff emails carry titles and links only (IMPLEMENTED)”. Current template data also carries case reference and recipient role (`StaffWorkService.java:240-244`). | Say “title, case reference, role, and link; no patient identity or clinical context”, then decide whether case reference is acceptable for every recipient/channel. |
| CAN-02 | Phase 0 requires IDO-01 for Practice Manager invitation, but the identity-operation outbox is not delivered until Phase 3. Phase 0 therefore depends on later infrastructure. | Move the identity-operation outbox/reconciliation kernel to Phase 0, or explicitly prohibit manager invitation until Phase 3. |
| CAN-03 | SEC-03 applies idempotency universally, but no delivery phase or V53 acceptance criterion implements it. Current referral creation is non-idempotent (MF-03). | Add SEC-03 to Phase 0 for referral/assignment commands and add replay, conflicting-body, and parallel-command acceptance tests. |
| CAN-04 | Phase 5/6 cannot proceed without OD-03/OD-05/OD-04, yet the closure text highlights only OD-01 and OD-06 as production conditions. The detailed phase table is correct; the summary can be read as weaker. | State that production requires every phase gate applicable to launch scope, plus OD-01/OD-06 and acceptance evidence. |
| CAN-05 | The provider-dependency inventory is not exhaustive (F-31), despite being presented as the concrete retirement inventory. | Add every live dependency listed in F-31 and assign migration owner, replacement, reconciliation query, rollback point, and removal test to each. |
| CAN-06 | “The 20 frozen decisions are unchanged” cannot be historically verified because revision 1 is absent. No rev-2 requirement was found that internally changes D-01..D-20. | Retain the prior revision or a signed decision ledger and include a decision-by-decision semantic diff in future revisions. |
| CAN-07 | Current-state documentation conflicts: `consultant-virtual-clinic.md:59` presents exactly-one-primary as implemented, while code/schema permit the F-05/F-06 races; its “pending grants no access” target is also contradicted by code. | For implemented truth, code plus executable tests win; mark those statements as target invariants until concurrency/privacy tests pass. Rev 2 remains the target authority. |
| CAN-08 | `technical-decisions.md` still describes provider-organization tenant authority, conflicting with D-02/D-20's platform scope and retirement target. | Mark the affected decisions superseded by the approved frozen decisions and link the cutover conditions; do not silently use both as authority. |
| CAN-09 | `journey-parity-status.md` records current runtime/parity limitations, while rev 2 describes the target state. | Keep parity status authoritative for “implemented now” and rev 2 authoritative for the target. Update parity status only when acceptance evidence exists. |
| CAN-10 | Review F-21 says `SUSPENDED` is absent, although V2 permits it. Rev 2 correctly requires a coherent lifecycle rather than relying on that claim. | Correct the review/evidence wording to “SUSPENDED exists as a credentialing value but lacks a coherent, enforced Consultant lifecycle transition/authorization model.” |

All `⚠ Correction` items checked do contradict current code: broad privileged bypasses; patient role from realm authority; non-durable identity mutations; capability-governor bypass; clinic-owner lifecycle bypass; active-on-invite managers; profile/one-credential eligibility; unlocked assignment/referral commands; pending access; no acceptance recheck; plaintext clinical reasons/audit reasons; and cascading deletes. Apart from CAN-01, no other `IMPLEMENTED`/`CONFIRMED` statement was disproved by the cited implementation; qualified phrases such as REF-07 “implemented in intent; see REF-08” must not be converted into implementation claims.

### OD-01..OD-06 challenge

- **OD-01** is primarily legal/privacy/business (jurisdiction, controller roles, residency, transfer, retention), not an engineering choice. The fail-safe is conservative; counsel must decide it.
- **OD-02** is board/governance/legal policy. The recommended two-administrator, board-confirmed recovery is reasonable; cryptographic workflow, cooling-off enforcement, and notifications are engineering implementation details.
- **OD-03** is medical-governance plus jurisdictional/legal policy. Engineering can model configurable credential sets but cannot choose them.
- **OD-04** is privacy and clinical-governance policy. The recommended dataset is reasonable, but even age band/sex/language/document counts require purpose/necessity approval; the minimal default is safer.
- **OD-05** is patient-safety/medical-governance policy. Engineering can enforce a selected window; it should not choose the 72-hour/4-business-hour values.
- **OD-06** is executive operational risk appetite with engineering/SRE input. RPO/RTO/SLO values are business commitments; backup topology, measurements, and restore automation are engineering choices.

## 5. Disagreements with the closure statement

**Argument for Claude's wording:** revision 2 gives testable target requirements for the known blocker/high defects, supplies fail-safe defaults, sequences cutover, and prevents undecided later phases from blocking safe Phase 0/1 engineering. On that narrow meaning, “READY FOR IMPLEMENTATION: YES” means work may begin, not that the solution may launch.

**Argument against it:** the uncommitted slice still contains a BLOCKER disclosure, two HIGH assignment races, a HIGH referral idempotency race, identity/DB split-brain paths, and indefinite former-receiver access. The retirement inventory is incomplete, SEC-03 is unscheduled, Phase 0 depends on Phase 3 identity infrastructure, and legal, credential, continuity, preview, and SLO decisions remain open. “Platform architecture closed” is therefore stronger than the evidence.

**Codex verdict:** use **CONDITIONALLY CLOSED FOR REQUIREMENTS REMEDIATION**, not “closed” without qualification. **READY FOR IMPLEMENTATION: YES** is defensible only for the ungated remediation phases. V53 is **not ready to commit as implemented, enable in a shared environment, or treat as acceptance-complete** until Phase 0 plus MF-01..MF-03 pass. No reviewed finding was wholly false-positive, but F-18 and F-21 contain false subclaims and F-05 needs the corrected interleaving above.

## 6. Standards-matrix corrections

| Matrix entry | Verification/correction | Official publisher source |
|---|---|---|
| OAuth 2.0 for Browser-Based Applications | **Superseded statement.** It is no longer an IETF draft. RFC 10017 / BCP 212 was published in August 2026. Replace “guidance only / draft” with the published BCP and assess the current SPA against its architecture/token-storage guidance. | [RFC Editor — RFC 10017](https://www.rfc-editor.org/rfc/rfc10017.html) |
| HL7 FHIR R6 | The “not published for production adoption” conclusion remains sound, but “still in ballot (ballot5, July 2026)” is stale. HL7's current R6 artifact is `6.0.0-snapshot1` (R6 Snapshot, September 2026), while the directory still identifies R5 5.0.0 as the current published technical release. | [HL7 FHIR published-version directory](https://hl7.org/fhir/directory.html), [HL7 R6 snapshot history](https://hl7.org/fhir/6.0.0-snapshot1/history.html) |
| International Patient Summary | Replace “ISO 27269 + confirm current edition” with **ISO 27269:2025, Edition 2, published September 2025**. Whether it is adopted remains deferred and partner/use-case dependent. | [ISO — ISO 27269:2025](https://www.iso.org/standard/84639.html) |

The checked ISO 14971:2019 entry is still current (confirmed by ISO in 2025), so it needs no edition correction; only the applicability conclusion in F-34 remains open. [ISO — ISO 14971:2019](https://www.iso.org/standard/72704.html)
