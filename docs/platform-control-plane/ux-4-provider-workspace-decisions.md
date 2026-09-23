# UX-4A — Provider Workspace data-access decision freeze

Date: 2026-09-24 · Branch: `codex/platform-control-plane` · Base: UX-3 `cb72a42` (UX-2 `d418350`, UX-1 `c8272b5`,
UX-0 `d031450`)
Scope: business decisions for provider-persona data access, V-3 and V-11 directions. **Documentation only — no
application code, no API, no migration, no UI.** UX-4 implementation and Phase 8C are not started.

Row-level matrix (canonical; wins on any disagreement):
[provider-persona-data-access-matrix.md](provider-persona-data-access-matrix.md) §3. Summary definitions (S-ID, S-STATUS …):
matrix §2.

## 1. Privacy principle (frozen)

1. **Membership is not access.** Provider organization membership by itself never grants access to patient or case data.
2. **Relationship to the case.** Patient/case access requires an active business relationship to the specific case —
   today that is the caller's own `case_assignments` row (the relationship `JourneyService.authorizeRead` already uses).
   Clinician relationships (MANAGES, ASSISTS, SUPERVISES) never grant case access on their own.
3. **Minimum necessary.** Each persona gets the smallest category and field set its work needs. When unsure: DENY or
   SUMMARY ONLY, never a broad ALLOW.
4. **Three kinds of data, decided separately.** Clinical (documents, notes, diagnosis) · commercial (prices, estimates,
   proposals, margin, deposits) · operational (identity summary, status, schedule, travel window, setup).
5. **Server-shaped.** A response contains only what the caller may see. The frontend never receives a broad record and
   hides fields.
6. **No invented authority.** A decision that needs a capability the backend does not have is recorded as future, not
   implemented.

## 2. Provider consultant

| Data | Decision | Support |
|---|---|---|
| Patient identity (S-ID), assigned cases | ALLOW WHEN ASSIGNED | NEEDS UX-4 READ SURFACE (V-3) |
| Case status (S-STATUS), assigned cases | ALLOW WHEN ASSIGNED | NEEDS UX-4 READ SURFACE (V-3) |
| Proposal stage (S-PROP) | SUMMARY ONLY | NEEDS UX-4 READ SURFACE (V-3) |
| Own cost estimate + own prices (S-OWNCOM) | SUMMARY ONLY | FUTURE BACKEND CAPABILITY (estimate); own prices SUPPORTED TODAY |
| Medical documents · clinical notes · diagnosis, assigned cases | ALLOW WHEN ASSIGNED | FUTURE BACKEND CAPABILITY (clinical capabilities not executable) |
| Patient contact · travel | DENY | SUPPORTED TODAY |
| Margin, coordination-fee configuration, finance policy, unrelated commercial administration | DENY | SUPPORTED TODAY |
| Unassigned/unrelated cases | DENY | SUPPORTED TODAY |
| Own schedule (view) · own prices (view) · own credentials | ALLOW WHEN RELATED | SUPPORTED TODAY |
| Own schedule (edit) | FUTURE BUSINESS DECISION | FUTURE BACKEND CAPABILITY (`availability.manage_self` not granted) |
| Approve own prices | ALLOW WHEN RELATED | FUTURE BACKEND CAPABILITY (`price_list.manage` SELF not granted) |
| Own relationships (S-REL) · own setup (S-SETUP) | SUMMARY ONLY | NEEDS UX-4 READ SURFACE (V-11); setup data readable today |

Why S-OWNCOM excludes patient-quoted prices: the patient price minus the clinician's own price reveals the internal
margin. The consultant sees their own inputs and the proposal stage, not RehletShifaa's pricing.

## 3. Associate doctor

| Data | Decision | Support |
|---|---|---|
| Patient identity (S-ID), **own** assigned cases | ALLOW WHEN ASSIGNED | NEEDS UX-4 READ SURFACE (V-3) — no associate assignment path exists today |
| Supervising Consultant's other patients | DENY | SUPPORTED TODAY |
| Case status (S-STATUS) · proposal stage (S-PROP), own assigned cases | ALLOW WHEN ASSIGNED / SUMMARY ONLY | NEEDS UX-4 READ SURFACE (V-3) |
| Documents · notes (draft only) · diagnosis, own assigned cases | ALLOW WHEN ASSIGNED and required by the workflow | FUTURE BACKEND CAPABILITY |
| Patient contact · travel | DENY | SUPPORTED TODAY |
| Own prices — view | ALLOW WHEN RELATED | SUPPORTED TODAY (`price_list.view` SELF) |
| Own prices — independent management | DENY | SUPPORTED TODAY (no grant; the Practice Manager manages associate price versions) |
| Own schedule (view) · own credentials | ALLOW WHEN RELATED | SUPPORTED TODAY |
| Supervisor relationship (S-REL) · own setup (S-SETUP) | SUMMARY ONLY | NEEDS UX-4 READ SURFACE (V-11) |

No new pricing authority is created. Supervisor/practice commercial governance stays authoritative.

## 4. Practice manager

The Practice Manager runs provider operations, not clinical care.

| Data | Decision | Support |
|---|---|---|
| Prices, services, schedules of clinicians they manage | ALLOW WHEN RELATED | SUPPORTED TODAY (MANAGES grants) |
| Credential readiness of those clinicians (S-CRED) | SUMMARY ONLY | SUPPORTED TODAY (readiness via `provider.view`) |
| Practice staff · relationships · operational setup | ALLOW | SUPPORTED TODAY |
| Patient identity (S-ID), managed clinicians' cases, task-driven | SUMMARY ONLY | FUTURE BACKEND CAPABILITY |
| Case status (S-STATUS), managed clinicians' cases | SUMMARY ONLY | FUTURE BACKEND CAPABILITY |
| Case proposals of managed clinicians (S-MGDCOM) | SUMMARY ONLY | FUTURE BACKEND CAPABILITY (DENY until built) |
| Travel window (S-TRAVEL), for scheduling | SUMMARY ONLY | FUTURE BACKEND CAPABILITY |
| Documents · clinical notes · diagnosis · patient contact | DENY | SUPPORTED TODAY |
| RehletShifaa internal finance policy | DENY | SUPPORTED TODAY |

The case-linked rows need a case read keyed on *MANAGES → clinician → case assignment*. No capability grants a
PRACTICE_OPERATIONS person any case read today, so building one would be a new business capability (rule 6).

## 5. Consultant assistant

Narrower than the Practice Manager in every row.

| Data | Decision | Support |
|---|---|---|
| Patient identity (S-ID) · case status (S-STATUS) · travel window (S-TRAVEL), assisted clinicians' cases | SUMMARY ONLY | NOT CURRENTLY SUPPORTABLE (no case authority and no ASSISTS scope type) |
| Documents · notes · diagnosis · contact · proposal/commercial · prices · credentials | DENY | SUPPORTED TODAY |
| Organization-wide case browsing | DENY | SUPPORTED TODAY |
| Schedules of clinicians they assist | ALLOW WHEN RELATED | SUPPORTED TODAY only as the broader org-wide view; narrowing NOT CURRENTLY SUPPORTABLE |
| Who they assist (S-REL) · own setup (S-SETUP, very limited) | SUMMARY ONLY | NEEDS UX-4 READ SURFACE (V-11) |

`appointment.view` is seeded but not executable, so assistants have no appointment data either.

## 6. Organization owner

Ownership is governance, not clinical access.

| Data | Decision | Support |
|---|---|---|
| Organization administration (profile, members, clinicians, practice staff, relationships) | ALLOW (via *Manage organization*) | SUPPORTED TODAY |
| Credential readiness (S-CRED) | SUMMARY ONLY | SUPPORTED TODAY |
| Organization-level commercial administration · prices · schedules | ALLOW where existing permissions allow | FUTURE BACKEND CAPABILITY — owner v2 grants none; a later owner role version can, through existing governance (catalogue allows these keys for PRACTICE_OPERATIONS) |
| Case status (S-AGG: counts only, no patient rows) | SUMMARY ONLY | FUTURE BACKEND CAPABILITY |
| Patient-level case details · identity · clinical records · contact · travel | DENY (unless another held role grants it) | SUPPORTED TODAY |

An owner who is also a Practice Manager (or a clinician) gets that role's rows too; nothing is inherited from ownership.

## 7. Organization setup visibility

| Setup area | Consultant | Associate | Assistant | Practice manager | Owner |
|---|---|---|---|---|---|
| Organization name/status, own membership | READ | READ | READ | READ | ALLOW |
| Own clinician setup and readiness | READ | READ | — | — | — |
| Own relationships (S-REL) | READ | READ | READ | READ | READ |
| Members list, invitations | — | — | — | READ (operational) | ALLOW |
| Practice staff | — | — | — | ALLOW | ALLOW |
| Clinician setup (other clinicians) | — | — | — | ALLOW (managed) | ALLOW |
| Relationships (manage) | — | — | — | ALLOW | ALLOW |
| Organization profile edit | — | — | — | — | ALLOW |
| Access & Governance · Journey administration · routing configuration · finance policy | — | — | — | — | — |

"—" = not shown. All reads above are served by existing grants except S-REL/S-SETUP self views (V-11). Consultants,
associates and assistants can technically read more today (org-wide `provider.view`); UX-4 presents only the row above
and the breadth stays a Phase 8D finding (matrix §4.4). Activation stays with RehletShifaa provider operations.

## 8. V-3 — provider case read: **APPROVED DIRECTION**

UX-4 adds one provider-workspace case read with these properties:

- **Relationship-scoped.** Returns only cases where the caller holds a PENDING/ACTIVE `case_assignments` row
  (`assignee_subject` = caller) — the exact relationship `authorizeRead` already accepts. The organization is resolved
  from stored case/assignment provenance, never from a request parameter; the caller's membership in it must be active.
  MANAGES, ASSISTS and SUPERVISES are **not** inputs.
- **Persona-aware, minimum necessary.** A new narrow DTO: S-ID + S-STATUS + S-PROP. No clinical content (that waits for
  the clinical-capability cutover), no amounts, no messages, tasks, timeline actors or free text.
- **Read-only, server-authorized, bounded.** Paged with a hard cap; not cached; an unrelated case is indistinguishable
  from a missing one.
- **Not a reuse of `CaseWorkspace`.** `CaseWorkspace` (served to Direct doctors on `/doctor/cases/{id}`) carries the full
  proposal (items, coordinator notes, payment terms), the deposit with payment events, messages and tasks. It must not be
  returned, wrapped or filtered client-side for provider personas.
- **Endpoint shape** is decided in UX-4 after reviewing the existing case read models; path outside `/doctor/**`.
- **Today it returns nothing for provider personas**: no provider clinician can be assigned while activation is
  fail-closed. UX-4 renders a truthful empty state and promises no cases. If the caller also holds the Direct DOCTOR
  workspace, the Provider Workspace links to it rather than duplicating case work.
- Required tests: unassigned consultant sees nothing; associate never sees the supervisor's cases; Practice Manager,
  assistant and owner get nothing; ended/declined assignment disappears; cross-organization and multi-organization person.

## 9. V-11 — self capability / relationship read: **APPROVED DIRECTION**

"What can I do in My Practice?" is answered from existing facts only: platform capabilities, active organization
memberships, clinician relationships (MANAGES · ASSISTS · SUPERVISES), and — through V-3 — case assignment.

- `/admin/access/me` stays as is (platform- and organization-scoped decisions).
- UX-4 may add **one small self-only read** because `/admin/access/me` cannot report SELF or MANAGES decisions. Per active
  membership it returns: organization name/status; membership role type(s); the caller's own practitioner record (if a
  clinician) with its setup summary; the caller's own relationships in both directions (S-REL); and capability booleans
  from the existing `AuthorizationService` evaluated **only** against the caller's own clinician resource, each clinician
  they MANAGE, and the organization (e.g. `price_list.view/manage/publish`, `availability.view/manage`,
  `credential.view/submit`, `provider.update`, `provider.practice_staff.manage`, `provider.relationship.manage`).
- Constraints: self only (no subject parameter), read only, bounded, no enumeration of organizations the caller is not
  an active member of, navigation-only. Every downstream endpoint still authorizes each operation itself.
- Persona labels (V-2) are derived from membership role types and practitioner type; a person may hold several.
  Workspace sections come from the returned capabilities, never from the label alone.
- No new authorization model, scope type, relationship type or grant.

## 10. Existing authorization mapping

| Decision | Enforced by |
|---|---|
| Own schedule / prices / credentials (clinicians) | `availability.view`, `price_list.view`, `credential.submit/view` at SELF — `AuthorizationService` `SELF` = `ownerSubject` |
| Managed clinicians' prices, services, schedules | `price_list.*`, `service_catalog.*`, `availability.*` at MANAGED_CLINICIANS — relationship MANAGES |
| Price approval by the clinician | `ProviderOperationalSetupService.approve`: `price_list.manage` + caller = clinician (grant missing) |
| Organization setup and administration | `provider.view`, `provider.update`, `provider.member.*`, `provider.clinician.invite`, `provider.practice_staff.manage`, `provider.relationship.manage` at ORGANIZATION |
| Credential readiness summary | `ProviderCredentialService.onboarding/readiness` under `provider.view` |
| Assigned-case identity/status (V-3) | `case_assignments.assignee_subject`, as in `JourneyService.authorizeRead` |
| Clinical reads | `clinical.case.view`, `clinical.document.view`, `clinical.recommendation.*` — catalogued, **not executable** |
| Denials of internal areas | `access.*`/`journey.*` PLATFORM + GOVERNANCE only; `assignment.*` COORDINATOR only; finance policy and deposits behind finance/admin realm roles |

## 11. Unsupported and future rows

**FUTURE BACKEND CAPABILITY** (not built in UX-4):
- Clinical documents, notes and diagnosis for assigned consultants/associates — clinical-capability cutover
  (technical-decisions §13.4 pattern) plus a provider case-assignment path.
- Consultant own cost estimate (S-OWNCOM) — needs a provider clinical-review path.
- Consultant price approval and schedule self-edit — role-version grants (`price_list.manage` SELF,
  `availability.manage_self`) through existing governance; self-edit also needs a business decision.
- Practice Manager case identity, status, case proposals and travel window — a case read keyed on MANAGES.
- Owner commercial/prices/schedule — owner role-version grants; owner aggregate case counts — a case read authority.
- Any case at all for provider clinicians — Commercial & Legal Acceptance and provider activation (V-1).

**NOT CURRENTLY SUPPORTABLE** (would change the authorization model):
- Assistant identity, status and travel for assisted clinicians' cases; narrowing assistant schedule view to assisted
  clinicians — no ASSISTS scope type exists.

**FUTURE BUSINESS DECISION**: consultant schedule self-edit.

## 12. UX-4 implementation constraints

1. Build only rows marked SUPPORTED TODAY or served by V-3/V-11. Omit every future/unsupportable row — no disabled
   teaser, no "coming soon" for patient data.
2. V-3 and V-11 as §8–§9; each a new narrow DTO, assignment- or self-scoped, with the §8 tests. No other new API.
3. No authorization-model change, no new scope/relationship type, no role-version change, no Keycloak role, no migration.
4. Workspace sections derive from V-11 capabilities; persona label is presentation only.
5. The workspace never shows management actions beyond the decision (no relationship management for consultants, no
   org-wide member lists for clinicians/assistants) even where a broader seeded grant would allow the call.
6. Internal RehletShifaa areas are never linked from the Provider Workspace; *Manage organization* is the owner's (and
   practice manager's, for their areas) single entry into scoped Control Center pages.
7. Truthful empty states: "My cases" states that provider clinicians receive no cases until activation is available.
8. Phase 8D receives: V-3 as the first provider-persona patient-data path outside the realm-role gate; the seeded-breadth
   findings (matrix §4.4); PENDING-assignment identity exposure (V-3 follows `authorizeRead` parity); small-count
   re-identification risk for any future S-AGG; the Direct doctor `CaseWorkspace` breadth (deposit, coordinator notes)
   relative to the consultant S-OWNCOM rule.

## 13. Acceptance

| Criterion | Result |
|---|---|
| No material UNDECIDED patient/case row | YES — one FUTURE BUSINESS DECISION (schedule self-edit), not patient/case data |
| Every persona has a minimum-necessary definition | YES (§2–§6, matrix §3) |
| Membership alone grants no patient access | YES (§1.1; V-3 keyed on own assignment only) |
| Clinical / commercial / operational separated | YES (split rows; S-codes) |
| V-3 frozen | YES (§8) |
| V-11 frozen | YES (§9) |
| Unsupported decisions marked future, not implemented | YES (§11) |
| No application code changed | YES (docs only) |

### UX-4A COMPLETE: YES

### UX-4 READY: YES

Scoped to the implementable rows: everything UX-4 builds is served by existing grants and relationships plus the two
small read-only surfaces V-3 and V-11. Rows needing new authority are FUTURE/NOT CURRENTLY SUPPORTABLE and are omitted,
not invented.
