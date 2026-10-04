# RehletShifaa — Platform Users and Virtual Clinics Execution Plan

**Status:** Normative delivery companion to
[`platform-users-and-virtual-clinics-requirements.md`](platform-users-and-virtual-clinics-requirements.md), revision 3  
**Date:** 2026-09-26  
**Purpose:** Segment every approved requirement into an executable, gated programme without changing D-01..D-20.

## 1. How to execute this plan

The canonical requirements document defines **what** must be true. This document defines **when**, **in what
dependency order**, and **with what evidence** it becomes true.

Rules:

1. Phases are sequential unless a phase explicitly permits parallel workstreams.
2. A requirement has one **primary delivery phase** in §15. Requirements that constrain every phase (for example
   SEC-02 or UX-04) are verified continuously but have one owner phase for final closure.
3. `IMPLEMENTED` means preserve and prove; it does not mean skip testing.
4. No legacy authority is removed until its replacement is populated, reconciled, observable, and rollback-tested.
5. An open decision's fail-safe default may support engineering only where the canonical document permits it. It
   never substitutes for a decision required at production launch.
6. Every phase produces the implementation record required by canonical §2.18.
7. Phase 0 is a commit/deployment gate. Phases 1–9 are architecture and migration delivery. Phase 10 is the launch
   gate. Phase 11 is outside the first production release.

## 2. Programme gates

| Gate | Required evidence | Blocks |
|---|---|---|
| G0 — V53 safety | Phase 0 negative-access, concurrency, idempotency, migration and identity-operation tests green | Commit/enable V53 in any shared environment |
| G1 — Identity security | Dedicated API audience, single role-claim source, MFA `acr`, session revocation, identity-operation retry/reconcile proof | Platform authority migration |
| G2 — Platform access foundation | Platform-scope schema/API populated; organization authority removed from the new path; rollback/read-history proof | Workforce and authority cutover |
| G2A — Workforce model | All internal identities mapped; one team model; multi-role/function/reporting/lead invariants green; OD-09 applied | Database authority resolver becoming universal |
| G3 — Governance authority | Owner/admin invariants, maker/checker, database authority resolver, `/api/v1/me`, bypass-negative matrix | Staff lifecycle rollout |
| G4 — Staff lifecycle | Invite/adopt/change/disable/offboard/support/recertification workflows and durable identity operations green | Consultant-domain rollout |
| G5 — Consultant domain | OD-03/OD-05 approved; lifecycle/credential/capability/delegation/clinic invariants green | Case routing/referral completion and provider migration |
| G6 — Case and Journey | OD-04 approved or fail-safe preview used; assignment/referral/Journey concurrency and reconciliation green | Provider migration/cutover |
| G7 — Migration parity | Counts, outcome diffs, price/routing/credential parity, architecture inventory, rollback rehearsal | Authority cutover |
| G8 — Point of no return | RET-06 signed, writes frozen, snapshot/rollback rehearsal passed, cutover observability green | Provider removal |
| G9 — Legacy removed | No reachable provider surfaces, roles, authority reads, jobs, flags, or dependencies | Production assurance |
| G10 — Production | All launch-scope OD decisions, security/privacy/legal/restore/accessibility evidence, §2.17 and every invariant green | Production launch |

## 3. Phase 0 — Make the V53 slice safe before commit

**Objective:** close every verified BLOCKER/HIGH defect introduced or exposed by the uncommitted Virtual Clinic,
assignment, and referral slice.

Parallel workstreams:

- **Access isolation:** replace pending-assignment case authorization with one minimal offer-preview contract across
  workspace, documents, messages, timeline, tasks, My Work, notifications, readiness/deposit, proposals and referral
  reads. Ended/withdrawn/expired receiver relationships cannot read referral clinical content.
- **Aggregate concurrency:** lock the case first for offer/referral/clinical-decision commands; check update counts;
  add the H2-safe primary-consultant pointer; enforce one open initial offer and one open referral per type.
- **Command idempotency:** persist actor + endpoint + body-hash command results; replay returns the original result;
  conflicting body reuse fails; work/audit/notifications are once-only.
- **Eligibility/capability:** remove profile-care-area eligibility; require approved capability; recheck eligibility
  inside acceptance; remove System Administrator capability/clinical bypasses; make capability decisions immutable.
- **Data and identity safety:** replace V53 cascades with restrict/history-safe constraints; encrypt/refactor clinical
  free text; ship the identity-operation outbox kernel for manager invitation. If the kernel is not complete, disable
  manager invitation rather than call Keycloak in the business transaction.
- **Transitional lifecycle guard:** clinic mutations fail for currently disabled/suspended/offboarding owners until
  the unified Consultant lifecycle ships in Phase 5.

Required tests/evidence:

- Pending initial, transfer and second-opinion offerees cannot reach any patient identity, case reference, document
  count/content, message, timeline, task, proposal, deposit/readiness, referral reason, or read-receipt mutation.
- The preview contains only the OD-04 fail-safe fields until OD-04 is decided.
- Ended/withdrawn/expired referral receivers cannot obtain decrypted referral content; an independently active
  assignment is required for any post-completion access.
- PostgreSQL READ COMMITTED interleaving tests prove one primary under parallel offer, acceptance, clinical decision,
  transfer withdrawal and transfer acceptance.
- Parallel referral creates prove one open referral and exactly one side-effect set.
- Eligibility loss between offer and acceptance returns the defined conflict, withdraws the offer and notifies once.
- Migration tests prove no clinic/capability/history row can cascade from practitioner deletion.
- Identity adapter failure leaves a retryable operation and committed business state, not a split-brain account.

**Exit:** G0 signed. V53 may then be committed, but remains feature-gated until the relevant later phase is complete.

## 4. Phase 1 — Authentication, identity operations and immediate governance safety

**Objective:** establish the security substrate required by every later authority change.

Deliverables:

- Dedicated `rehletshifaa-api` audience, issuer/signature/expiry/`azp` allowlist validation, and
  `realm_access.roles` as the only temporary role claim.
- Workforce MFA policy, backend `acr` verification, phishing-resistant owner/admin authentication, and step-up based
  on `auth_time` plus `acr`.
- Explicit token/SSO lifetimes and refresh rotation.
- Complete identity-operation worker, retry/dead-letter/operator view, logout/session revocation and daily/restore
  reconciliation.
- Self-grant/self-revoke and last-effective-administrator protections under locks.
- Patient authority resolved only from patient/representative relationships.
- Single-purpose, short-lived links/tokens and outbound-host/CSRF posture preserved.

**Exit:** G1 signed with live Keycloak tests, failure-injection tests, and identity reconciliation evidence.

## 5. Phase 2 — Platform-scope access-governance foundation

**Objective:** make platform scope—not organization/provider membership—the schema and API foundation while keeping
history readable.

Deliverables:

- Additive platform-scope role/assignment/relationship structures and migration projections.
- Remove organization input from new access APIs and retire organization-only scope types from new grants.
- Preserve platform, self, assigned-case, team/reporting, journey and work-item scopes.
- Remove provider authority ports/lookups from the new effective-access decision path.
- Seed the target `SYSTEM_ADMINISTRATOR` catalogue entry; do not yet remove legacy roles used by the old path.
- Add architecture tests preventing new `access -> provider` dependencies.

**Exit:** G2 signed with row-count reconciliation, effective-access comparison, history-read and rollback proof.

## 6. Phase 2A — Workforce catalogue, teams and hierarchy

**Objective:** build the single workforce model on which database business authority depends.

Deliverables:

- One workforce record for every internal identity across all ten functions.
- Several compatible database role assignments per person; retire `staff_role` as authority.
- Fixed function catalogue, one platform team model, effective memberships, per-function manager relationships and
  cycle prevention.
- Lead designation as a relationship; scoped supervisory permissions; no `*_LEAD` role/composite bypass.
- Function managers maintain their teams; System Administrators maintain access assignments.
- Effective-dated hierarchy changes, orphan/only-lead blockers, architecture boundary for a `workforce` module.
- Migration of V21/V22/V36/team/lead/realm-only data with a complete unmapped-items report.
- People, Teams, Hierarchy and Roles UI plus `/api/v1/me` workforce facts.

**Gate:** OD-09 is required only for the supervisory case-visibility slice; all other work proceeds using its fail-safe
default.

**Exit:** G2A signed; no internal identity is realm-only and no supervisory action succeeds outside a led team.

## 7. Phase 3 — Governance relationships and database authority

**Objective:** make the database the universal source of business authority and establish controlled ownership and
administration.

Deliverables:

- Exactly one Platform Account Owner relationship, controlled bootstrap/handover/transfer and recovery boundary.
- Same-role System Administrator maker/checker; privileged change requests with expiry, recent auth and immutable
  decisions.
- One authority resolver that checks lifecycle, effective assignment, relationship and domain constraints for every
  business request.
- Remove broad System Administrator, auditor and lead bypasses; apply the complete negative-test matrix.
- Effective `/api/v1/me` whose explanations match endpoint decisions.
- Retire realm roles as business authority family by family after parity; preserve only authentication-policy use.
- No clinical break glass; sealed dual-control identity-platform recovery.

**Gate:** OD-02 is required for owner-recovery commands. Owner relationship/ordinary transfer may ship earlier.

**Exit:** G3 signed; owner/admin/SoD invariants pass under grant, revoke, disable, expiry and offboarding races.

## 8. Phase 4 — Staff lifecycle, support and access hygiene

**Objective:** provide complete internal-person administration without direct Keycloak/database split transactions.

Deliverables:

- Invite, exact existing-identity adoption/consent, ambiguity review and activation with MFA.
- Job/responsibility/team/manager changes with conflicts and orphaned-work checks.
- Disable/restore/offboard/handover workflows with immediate database authority loss and after-commit identity work.
- Staffing-request workflow from function managers to System Administrators.
- Bounded support views, invitation resend, self-service password recovery and privileged MFA reset.
- Quarterly/semi-annual access recertification, dormancy processing and service-account registry/rotation.
- Complete audit linkage from request through execution and outcome; no deletion of history.

**Exit:** G4 signed with lifecycle state-machine, concurrency, last-admin, session and recovery tests.

## 9. Phase 5 — Consultant lifecycle, credentials, capabilities and Virtual Clinic

**Objective:** make the independent Consultant and their one Virtual Clinic a complete, authoritative domain before
provider data is retired.

Deliverables:

- Unified Consultant lifecycle with explicit restricted/suspended/offboarding semantics and current-eligibility
  write/read consequences.
- Versioned mandatory-credential policy; append-only credential and capability decisions; expiry/reminder processing.
- Consultant Operations owner relationship and credential/capability SoD.
- Deterministic one-clinic creation; lifecycle-aware clinic authorization; immutable clinic history.
- Practice Manager invite/accept/consent/MFA/adoption/permission-reaccept/revoke history and strict clinical
  isolation.
- Versioned services, pricing, public-profile state, availability and timezone-safe schedule/slots.
- Physical locations only as operational facts, never authority scopes.

**Gates:** OD-03 and OD-05. Their fail-safe defaults prevent Consultant production activation until decided.

**Exit:** G5 signed with eligibility-loss, handover, emergency-suspension, delegation-isolation and stale-write tests.

## 10. Phase 6 — Eligibility, assignment, referrals and Journey activation

**Objective:** complete the case-domain workflows that consume the Consultant authority model.

Deliverables:

- Server-resolved routing data and one eligibility rule for direct offers and referrals.
- Full initial-offer lifecycle: one open offer, preview, expiry, accept, decline, withdraw, escalation and audit.
- Full transfer/second-opinion lifecycle: one open referral per type, expiry, bounded access, withdrawal, submission,
  relationship-shaped reads and atomic primary handover.
- One Journey Instance and authoritative case/Journey parity; proposal acceptance durability; activation reconciliation
  and repair sweeps.
- Separate clinic and case/Journey timelines.

**Gate:** OD-04. Until decided, the fail-safe preview is the only permissible pre-acceptance response.

**Exit:** G6 signed with concurrency, BOLA/BFLA, expiry-at-read-time, idempotency, repair and continuous-case-history
tests.

## 11. Phase 7 — Provider-data migration and replacement

**Objective:** populate every replacement and prove parity before any authority cutover.

Deliverables:

- Freeze provider feature growth and finalize the exhaustive dependency inventory, including access repositories,
  provider case summaries, pricing projections, coordination reads and background jobs.
- Re-key coordination teams/policies/preferences/capacity/decisions to platform scope.
- Migrate direct Consultant credentials/evidence/history and compare every eligibility outcome.
- Migrate legitimate services, prices, availability and schedules to Virtual Clinics.
- Replace Provider Operations with Consultant Operations ownership.
- Produce before/after counts, explained diffs, price parity, zero-unmapped-live-authority report and rollback package.

**Exit:** G7 signed by Consultant Operations, Credential Verification, engineering and data owners.

## 12. Phase 8 — Authority cutover and point of no return

**Objective:** switch live authority exactly once with an explicit reversible boundary.

Execution:

1. Rehearse rollback from the final pre-cutover snapshot.
2. Freeze provider writes and migration-affecting administration.
3. Run final deltas and RET-06 reconciliation.
4. Switch access, credential, eligibility, routing, pricing and clinic reads to target authority.
5. Run smoke, negative-access, financial/patient regression and observability checks.
6. Before accepting G8, rollback on any unexplained mismatch. After G8, roll forward only.

**Exit:** G8/RET-07 signed and time-stamped with snapshot, build, migration and evidence identifiers.

## 13. Phase 9 — Remove provider product surfaces and code

**Objective:** retire the old product so it cannot silently regain authority.

Deliverables:

- Remove provider workspace, Control Center provider/facility/membership surfaces and APIs.
- Remove provider invitations, relationships, role templates, scope types, seeds, flags, notifications and jobs after
  inventory proof.
- Remove unused provider application code and forbid dependencies from access/clinic/journey/coordination.
- Preserve database/audit history read-only; never rewrite Flyway history.
- Seed a clean first-production role catalogue and archive pre-production role versions with reconciliation.
- Run the complete patient/representative/case/document/commercial/payment/travel/treatment/follow-up regression.

**Exit:** G9 signed; static SQL inventory, architecture tests and runtime telemetry show no live provider authority.

## 14. Phase 10 — Production assurance and launch

**Objective:** close cross-cutting assurance and prove the implemented system is operable, lawful for the selected
scope, recoverable and accessible.

Deliverables:

- Append-only/read-controlled audit, clinical-content read logging and daily write-once export.
- ASVS 5.0.0 Level 2 verification, API BOLA/BFLA/mass-assignment/business-flow tests, webhook replay controls and
  approved outbound-host controls.
- Data ownership/classification, key rotation, legal hold, retention, anonymization and migration lineage.
- Counsel-approved jurisdiction/controller/residency/transfer/retention/breach position.
- SLO/RPO/RTO, PostgreSQL/Keycloak/MinIO backup, full restore drill, after-restore identity reconciliation, alerts,
  operator recovery actions and degradation tests.
- Documented regulated-software classification and interoperability version policy.
- WCAG 2.2 AA, Arabic/English/RTL/mobile parity and non-disclosing error/notification review.
- Every canonical §1.9/§2.17 criterion and every `INV-` test green.

**Gates:** OD-01 and OD-06 plus every earlier decision required by the launch scope.

**Exit:** G10 production go/no-go signed by product, medical governance, privacy/legal, security, operations and
engineering. No “conditional” item may be represented as production-complete.

## 15. Phase 11 — Deferred, separately approved capabilities

This phase is not part of the first production release. Each item needs a new scoped design and threat/privacy
review:

- Practice Manager `APPOINTMENT_ADMIN` (OD-07).
- Patient slot hold/confirm/cancel, cancellation window and proxy booking (OD-08).
- Referrals outside `CONSULTANT_REVIEW` (REF-12).
- Public consultant discovery/profile release.
- External clinical exchange, including ISO 27269:2025/HL7 IPS where required (INT-03).

## 16. Primary requirement coverage index

This index is normative for ownership. Each canonical requirement/invariant/open decision appears in one primary
phase; D-01..D-20 constrain all phases.

| Phase | Primary IDs |
|---|---|
| All phases — frozen constraints | D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14, D-15, D-16, D-17, D-18, D-19, D-20 |
| 0 | ASG-02, ASG-03, ASG-05, ASG-06, CAP-03, CAP-04, DAT-06, ELG-01, ELG-02, IAM-11, IDO-01, INV-09, INV-11, INV-12, INV-22, INV-25, INV-30, REF-04, REF-06, REF-08, REF-13, REF-14, SEC-03, SEC-06, SOD-08, VC-08 |
| 1 | IAM-01, IAM-02, IAM-03, IAM-04, IAM-05, IAM-10, IAM-12, IDO-02, IDO-03, IDO-04, IDO-05, IDO-06, IDO-07, INV-03, INV-04, INV-21, SEC-04, SEC-08, SEC-09, SOD-01, SOD-06 |
| 2 | ACG-01, ACG-02, ACG-03, ACG-04, ACG-06, IAM-00, ROLE-01 |
| 2A | HIE-01, HIE-02, HIE-03, HIE-04, HIE-05, HIE-06, HIE-07, INV-26, INV-27, INV-28, INV-29, OD-09, ROLE-02, WF-01, WF-02, WF-03, WF-04, WF-05, WF-06, WF-07, WF-08, WF-09, WF-10, WF-11, WF-12, WF-13, WF-14, WF-15, WF-16, WF-17 |
| 3 | ACG-07, ACG-08, ACG-09, ACG-10, ACG-11, GOV-01, GOV-02, GOV-03, GOV-04, GOV-05, GOV-06, GOV-07, GOV-08, IAM-06, IAM-07, IAM-08, IAM-09, IAM-13, IAM-14, INV-01, INV-02, INV-05, OD-02, SOD-02, SOD-03, SOD-04, SOD-05, SOD-07 |
| 4 | IAM-15, IAM-16, IAM-17, STF-01, STF-02, STF-03, STF-04, STF-05, STF-06, STF-07, STF-08, STF-09, STF-10, STF-11, SUP-01, SUP-02, SUP-03, SUP-04 |
| 5 | CAP-01, CAP-02, CAP-05, CAP-06, CNS-01, CNS-02, CNS-03, CNS-04, CNS-05, CNS-06, CNS-07, CNS-08, CNS-09, CNS-10, CNS-11, CNS-12, CNS-13, CNS-14, CRD-01, CRD-02, CRD-03, CRD-04, CRD-08, INV-06, INV-07, INV-08, INV-15, INV-16, LOC-01, OD-03, OD-05, PM-01, PM-02, PM-03, PM-04, PM-05, PM-06, PM-07, PM-08, PM-09, PM-10, PM-11, SVC-01, SVC-02, SVC-03, SVC-04, SVC-05, SVC-06, VC-01, VC-02, VC-03, VC-04, VC-05, VC-06, VC-07 |
| 6 | ASG-01, ASG-04, ASG-07, ASG-08, AUD-01, AUD-02, ELG-03, ELG-04, INV-10, INV-13, INV-14, INV-17, INV-18, INV-19, JRN-01, JRN-02, JRN-03, JRN-04, JRN-05, JRN-06, OD-04, OPS-05, REF-01, REF-02, REF-03, REF-05, REF-07, REF-09, REF-10, REF-11 |
| 7 | CRD-05, CRD-06, CRD-07, DAT-08, RET-02, RET-03, RET-04, RET-05 |
| 8 | ACG-05, INV-20, RET-01, RET-06, RET-07 |
| 9 | RET-08, RET-09, RET-10, RET-11, RET-12 |
| 10 | AUD-03, AUD-04, AUD-05, AUD-06, DAT-01, DAT-02, DAT-03, DAT-04, DAT-05, DAT-07, INT-01, INT-02, INV-23, INV-24, OD-01, OD-06, OPS-01, OPS-02, OPS-03, OPS-04, OPS-06, OPS-07, OPS-08, OPS-09, PRV-01, PRV-02, PRV-03, PRV-04, PRV-05, REG-01, SEC-01, SEC-02, SEC-05, SEC-07, UX-01, UX-02, UX-03, UX-04, UX-05 |
| 11 | INT-03, OD-07, OD-08, REF-12 |

## 17. Phase implementation record template

Every phase closes with one checked-in record containing:

- phase/gate, build and migration identifiers;
- requirement IDs delivered and preserved;
- decisions applied and named approvers;
- schema/data counts and unexplained-difference count (must be zero at a cutover gate);
- API/UI changes and retired surfaces;
- invariant, authorization-negative, concurrency, idempotency, accessibility and recovery test results;
- observability dashboards/alerts and operator actions;
- security/privacy/clinical sign-off where applicable;
- rollback point and rehearsal result;
- remaining blockers, with owner and next gate.

No phase is complete because code merged. It is complete only when its gate evidence is accepted.
