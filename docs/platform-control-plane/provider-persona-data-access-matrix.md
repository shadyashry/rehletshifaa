# Provider persona data-access matrix (P0-9 — UX-4 design and security gate)

Date: 2026-09-23 (UX-1 draft) · **2026-09-24 UX-4A decision freeze** · Status: **FROZEN — business decisions recorded;
no UNDECIDED patient/case row remains.** Decision record and rationale:
[ux-4-provider-workspace-decisions.md](ux-4-provider-workspace-decisions.md). This file is the canonical row-level
matrix; if the two ever disagree, this file wins.

**Privacy principle (frozen).** Provider organization membership by itself never grants access to patient or case
data. Patient/case access requires an active business relationship to the specific case (or clinician), resolved
through the existing authorization relationships. Minimum necessary applies; when unsure the answer is DENY or
SUMMARY ONLY, never a broad ALLOW. Clinical, commercial and operational data are decided separately.

Decision marks: **ALLOW** · **ALLOW WHEN ASSIGNED/RELATED** · **SUMMARY ONLY** · **DENY** · **FUTURE BUSINESS DECISION**.

Support marks (what the backend can serve without inventing anything):
- **SUPPORTED TODAY** — an existing, executable capability/relationship already enforces this exact rule (for DENY:
  the denial is already enforced).
- **NEEDS UX-4 READ SURFACE** — the authority exists (existing grant or relationship); only a small, self/assignment-
  scoped, read-only projection is missing (V-3 or V-11).
- **FUTURE BACKEND CAPABILITY** — needs a capability that is not executable or not granted today (a clinical-capability
  cutover, a new role version through existing governance, or a new case read authority). Not built in UX-4.
- **NOT CURRENTLY SUPPORTABLE** — cannot be expressed in the existing authorization model at all (would need a new scope
  or relationship semantics = an authorization-model change, out of the UX program).

## 1. What the platform allows today (verified in code, re-checked 2026-09-24)

- Every case, patient, document and work read requires an **identity-system portal role**:
  - `SecurityConfig` gates `/patient`, `/coordinator`, `/doctor`, `/operations` and `/finance` by realm role.
  - `JourneyService.authorizeRead` (used for the case workspace and `CaseDocumentAccessPolicy`) accepts only SYSTEM_ADMIN, AUDITOR, a lead reader, the patient or their representative, or a staff actor holding a `case_assignments` row (`assignee_subject`, status PENDING/ACTIVE) for that case.
  - Provider personas are provisioned with **no** realm role (`IdentityProvisioningPort`), so **no provider persona can read any patient or case data today.**
- The seeded provider role versions (V31–V35) grant `clinical.case.view`, `clinical.document.view` and `clinical.recommendation.*` on ASSIGNED_CASES to Consultant and Associate doctor.
  - These are **not executable** (`PermissionCatalog`: executable=false, workflow-gated), so they confer nothing.
  - `AuthorizationService` resolves ASSIGNED_CASES through access relationships of type `ASSIGNED_TO`/`COORDINATES`; no code writes those relationships for cases today.
- `appointment.view` (seeded for the assistant) is **not executable**.
- Relationship-scoped grants exist only for **MANAGES** (`MANAGED_CLINICIANS`). There is **no scope type for ASSISTS or
  SUPERVISES** (`ScopeType`), so an assistant or associate grant can never be relationship-scoped today.
- There is **no provider-persona capability for proposals, quotes, deposits, travel or case lists**; commercial policy
  (margin), FX policy and deposits are realm-role (finance/admin) surfaces.
- **No provider clinician can receive a case today**: activation is fail-closed while Commercial & Legal Acceptance is
  unavailable (UX-3 record §9), so every assignment-scoped provider read is empty in practice.
- Price approval (`POST …/prices/{id}/approve`) requires `price_list.manage` on the clinician **and** caller = that
  clinician. No clinician role version grants `price_list.manage` SELF, so **no one can record Consultant price approval
  today**.
- Provider capabilities today (latest seeded versions; real assignments may differ):

| Persona (role version, actor type) | Organization-wide | Own records (SELF) | Clinicians they manage (MANAGES) |
|---|---|---|---|
| Organization owner (v2, PRACTICE_OPERATIONS) | `provider.view`, `provider.update`, `provider.member.invite/deactivate`, `provider.clinician.invite`, `provider.practice_staff.manage`, `provider.relationship.manage` | — | — |
| Practice manager (v3, PRACTICE_OPERATIONS) | `provider.view`, `provider.practice_staff.manage`, `provider.relationship.manage` | — | `price_list.view/manage/publish`, `service_catalog.view/manage`, `availability.view/manage` |
| Consultant (v4, CONSULTANT) | `provider.view`, `provider.relationship.manage` | `provider.update`, `credential.submit/view`, `price_list.view`, `availability.view` | — |
| Associate doctor (v4, ASSOCIATE_DOCTOR) | `provider.view` | `provider.update`, `credential.submit/view`, `price_list.view`, `availability.view` | — |
| Consultant assistant (v2, CLINICAL_SUPPORT) | `provider.view`, `availability.view`, `appointment.view` (not executable) | — | — |

## 2. What "SUMMARY ONLY" means (frozen definitions)

Every SUMMARY ONLY row names one of these. Anything not listed is excluded. Summaries are **server-shaped**: the
response contains only these fields; a frontend never receives more and hides it.

| Code | Contains | Never contains |
|---|---|---|
| **S-ID** Identity summary | Case number; patient display name | Contact details, date of birth, nationality, passport/ID numbers, address, representative details, photos |
| **S-STATUS** Case status summary | Case number; current stage; waiting-on code; assigned clinician name; own assignment status and date | Timeline actors, free-text reasons, messages, tasks, condition description, documents |
| **S-AGG** Aggregate | Counts by stage, per organization or per clinician | Any row, case number or patient identifier |
| **S-PROP** Proposal stage | Proposal stage (none · in preparation · released · accepted · declined · revision requested · expired) and document type (preliminary estimate / final quote) | Any amount, line item, payment/refund terms, coordinator notes |
| **S-OWNCOM** Own commercial | S-PROP + the clinician's **own** submitted cost-estimate lines (service, amount, currency) + their **own** price-list entries | Patient-quoted prices and totals (they reveal the margin), margin rate, coordination fee configuration, commercial/FX policy, deposit components, payment events, other clinicians' prices |
| **S-MGDCOM** Managed-clinician commercial | S-OWNCOM for a clinician the caller MANAGES | Same exclusions as S-OWNCOM |
| **S-TRAVEL** Travel summary | Expected arrival and departure dates / on-site window | Passport, visa, flights, accommodation, companions, contact details |
| **S-CRED** Credential summary | Per requirement: status, expiry date, readiness blockers | Evidence files, reference numbers, issuer detail, reviewer comments |
| **S-REL** Relationship summary | The caller's **own** relationships: counterpart name, type (Manages · Assists · Supervises), status, effective dates | Other people's relationships |
| **S-SETUP** Own-work setup | Organization name and status; the caller's own membership and role; own clinician setup/readiness; S-REL | Member list, invitations, other clinicians' setup, organization administration |

## 3. Matrix — decision and support

"Today" is what the backend serves now. "Decision" is the frozen UX-4A rule. "Support" is how (or whether) it can be
served. Patient/case rows for every persona are empty in practice until a provider clinician can be assigned a case.

### Provider consultant
| Category | Today | Decision | Support | Basis |
|---|---|---|---|---|
| Patient identity | DENY | ALLOW WHEN ASSIGNED — **S-ID** in the workspace | NEEDS UX-4 READ SURFACE (V-3) | Own `case_assignments` row, as `authorizeRead` |
| Patient contact information | DENY | DENY | SUPPORTED TODAY | Coordinators own patient contact |
| Medical documents | DENY | ALLOW WHEN ASSIGNED (required for clinical review) | FUTURE BACKEND CAPABILITY | `clinical.document.view` not executable; clinical-capability cutover required |
| Clinical notes | DENY | ALLOW WHEN ASSIGNED (own recommendation and case clinical notes) | FUTURE BACKEND CAPABILITY | `clinical.*` not executable |
| Diagnosis / medical summary | DENY | ALLOW WHEN ASSIGNED | FUTURE BACKEND CAPABILITY | `clinical.case.view` not executable |
| Proposal / commercial — stage | DENY | SUMMARY ONLY — **S-PROP** | NEEDS UX-4 READ SURFACE (V-3) | Stage derives from case status on the own assignment |
| Proposal / commercial — own estimate | DENY | SUMMARY ONLY — **S-OWNCOM** | FUTURE BACKEND CAPABILITY | A provider consultant cannot author a clinical review (cost estimate) today |
| Travel information | DENY | DENY | SUPPORTED TODAY | Not needed for clinical review |
| Case status | DENY | ALLOW WHEN ASSIGNED — **S-STATUS** | NEEDS UX-4 READ SURFACE (V-3) | Own `case_assignments` row |
| Consultant schedule — view own | ALLOW WHEN RELATED | ALLOW WHEN RELATED (own) | SUPPORTED TODAY | `availability.view` SELF |
| Consultant schedule — edit own | DENY | FUTURE BUSINESS DECISION | FUTURE BACKEND CAPABILITY | `availability.manage_self` executable but not granted |
| Prices — view own | ALLOW WHEN RELATED | ALLOW WHEN RELATED (own) | SUPPORTED TODAY | `price_list.view` SELF |
| Prices — approve own | DENY | ALLOW WHEN RELATED (own, approval only) | FUTURE BACKEND CAPABILITY | `approve` needs `price_list.manage` SELF (not granted) → role-version grant through existing governance |
| Credentials | ALLOW WHEN RELATED (own: submit/view) | ALLOW WHEN RELATED (own) | SUPPORTED TODAY | `credential.submit/view` SELF; review stays with reviewers |
| Practice relationships | ALLOW (org-wide manage) | SUMMARY ONLY — **S-REL**; no management in the workspace | NEEDS UX-4 READ SURFACE (V-11) | Seeded org-wide `provider.relationship.manage` is broader → Phase 8D finding |
| Provider organization setup | ALLOW (org-wide view) | SUMMARY ONLY — **S-SETUP** (read only) | SUPPORTED TODAY (broader than decision) + V-11 for the self view | Seeded org-wide `provider.view` is broader → Phase 8D finding |
| Unassigned / unrelated cases | DENY | DENY | SUPPORTED TODAY | — |

### Associate doctor
| Category | Today | Decision | Support | Basis |
|---|---|---|---|---|
| Patient identity | DENY | ALLOW WHEN ASSIGNED — **S-ID**; **never** the supervising Consultant's other patients | NEEDS UX-4 READ SURFACE (V-3) | Own assignment only; SUPERVISES never grants case access. No associate assignment path exists today |
| Patient contact information | DENY | DENY | SUPPORTED TODAY | — |
| Medical documents | DENY | ALLOW WHEN ASSIGNED and required by the workflow | FUTURE BACKEND CAPABILITY | As consultant |
| Clinical notes | DENY | ALLOW WHEN ASSIGNED (draft only; no final recommendation authority) | FUTURE BACKEND CAPABILITY | technical-decisions §13.3 |
| Diagnosis / medical summary | DENY | ALLOW WHEN ASSIGNED | FUTURE BACKEND CAPABILITY | — |
| Proposal / commercial | DENY | SUMMARY ONLY — **S-PROP** (assigned case only) | NEEDS UX-4 READ SURFACE (V-3) | No amounts |
| Travel information | DENY | DENY | SUPPORTED TODAY | — |
| Case status | DENY | ALLOW WHEN ASSIGNED — **S-STATUS** | NEEDS UX-4 READ SURFACE (V-3) | Own assignment only |
| Consultant schedule | ALLOW WHEN RELATED (own, view) | ALLOW WHEN RELATED (own, view) | SUPPORTED TODAY | `availability.view` SELF |
| Prices — view own | ALLOW WHEN RELATED | ALLOW WHEN RELATED (own, view) | SUPPORTED TODAY | `price_list.view` SELF; associate-specific versions exist (technical-decisions §14) |
| Prices — manage own | DENY | DENY (supervisor/practice commercial governance is authoritative) | SUPPORTED TODAY | No grant; managed by the Practice Manager (MANAGES) |
| Credentials | ALLOW WHEN RELATED (own) | ALLOW WHEN RELATED (own) | SUPPORTED TODAY | — |
| Practice relationships | DENY (no manage grant) | SUMMARY ONLY — **S-REL** (their supervisor) | NEEDS UX-4 READ SURFACE (V-11) | — |
| Provider organization setup | ALLOW (org-wide view) | SUMMARY ONLY — **S-SETUP** (read only) | SUPPORTED TODAY (broader than decision) + V-11 | Phase 8D finding |

### Practice manager
| Category | Today | Decision | Support | Basis |
|---|---|---|---|---|
| Patient identity | DENY | SUMMARY ONLY — **S-ID**, managed clinicians' cases, only where an operational task needs it | FUTURE BACKEND CAPABILITY | No case read authority for PRACTICE_OPERATIONS; MANAGES resolves clinicians, not cases |
| Patient contact information | DENY | DENY | SUPPORTED TODAY | — |
| Medical documents | DENY | DENY | SUPPORTED TODAY | — |
| Clinical notes | DENY | DENY | SUPPORTED TODAY | — |
| Diagnosis / medical summary | DENY | DENY | SUPPORTED TODAY | — |
| Commercial — prices and services of managed clinicians | ALLOW WHEN RELATED | ALLOW WHEN RELATED | SUPPORTED TODAY | `price_list.*`, `service_catalog.*` MANAGES |
| Commercial — case proposals of managed clinicians | DENY | SUMMARY ONLY — **S-MGDCOM** | FUTURE BACKEND CAPABILITY | No case-level commercial capability exists; DENY until built |
| Travel information | DENY | SUMMARY ONLY — **S-TRAVEL**, where scheduling needs it | FUTURE BACKEND CAPABILITY | Travel is an Operations realm-role surface |
| Case status | DENY | SUMMARY ONLY — **S-STATUS**, managed clinicians' cases | FUTURE BACKEND CAPABILITY | As patient identity |
| Consultant schedule | ALLOW WHEN RELATED (MANAGES: view/manage) | ALLOW WHEN RELATED | SUPPORTED TODAY | `availability.view/manage` MANAGES |
| Prices | ALLOW WHEN RELATED (MANAGES: view/manage/publish) | ALLOW WHEN RELATED | SUPPORTED TODAY | Consultant approval rule unchanged |
| Credentials | SUMMARY ONLY (readiness via `provider.view`) | SUMMARY ONLY — **S-CRED** | SUPPORTED TODAY | No `credential.view`; readiness/onboarding reads |
| Practice relationships | ALLOW (org-wide manage) | ALLOW | SUPPORTED TODAY | `provider.relationship.manage` |
| Provider organization setup | ALLOW (view) + practice-staff management | ALLOW (operational setup of the areas they manage) | SUPPORTED TODAY | `provider.view`, `provider.practice_staff.manage`; organization profile edit stays with the owner |

### Consultant assistant
| Category | Today | Decision | Support | Basis |
|---|---|---|---|---|
| Patient identity | DENY | SUMMARY ONLY — **S-ID**, only cases of clinicians they are assigned to assist | NOT CURRENTLY SUPPORTABLE | No case authority, and no ASSISTS scope type |
| Patient contact information | DENY | DENY | SUPPORTED TODAY | — |
| Medical documents | DENY | DENY | SUPPORTED TODAY | An assistant relationship grants no clinical status (technical-decisions §13.3) |
| Clinical notes | DENY | DENY | SUPPORTED TODAY | — |
| Diagnosis / medical summary | DENY | DENY | SUPPORTED TODAY | — |
| Proposal / commercial | DENY | DENY | SUPPORTED TODAY | No accepted capability requires a read |
| Travel information | DENY | SUMMARY ONLY — **S-TRAVEL**, assisted clinicians' cases, when schedule work needs it | NOT CURRENTLY SUPPORTABLE | As patient identity |
| Case status | DENY | SUMMARY ONLY — **S-STATUS**, assisted clinicians' cases | NOT CURRENTLY SUPPORTABLE | As patient identity |
| Organization-wide case browsing | DENY | DENY | SUPPORTED TODAY | — |
| Consultant schedule | ALLOW (org-wide view) | ALLOW WHEN RELATED (clinicians they assist) | SUPPORTED TODAY (broader: org-wide); narrowing NOT CURRENTLY SUPPORTABLE | Seeded ORGANIZATION `availability.view`; no ASSISTS scope → Phase 8D finding |
| Prices | DENY | DENY | SUPPORTED TODAY | — |
| Credentials | DENY | DENY | SUPPORTED TODAY | — |
| Practice relationships | DENY | SUMMARY ONLY — **S-REL** (who they assist) | NEEDS UX-4 READ SURFACE (V-11) | — |
| Provider organization setup | ALLOW (org-wide view) | SUMMARY ONLY — **S-SETUP**, very limited | SUPPORTED TODAY (broader than decision) + V-11 | Phase 8D finding |

### Organization owner
| Category | Today | Decision | Support | Basis |
|---|---|---|---|---|
| Patient identity | DENY | DENY (unless the owner also holds another operational role that grants it) | SUPPORTED TODAY | Ownership ≠ clinical access |
| Patient contact information | DENY | DENY | SUPPORTED TODAY | — |
| Medical documents | DENY | DENY | SUPPORTED TODAY | — |
| Clinical notes | DENY | DENY | SUPPORTED TODAY | — |
| Diagnosis / medical summary | DENY | DENY | SUPPORTED TODAY | — |
| Proposal / commercial | DENY | ALLOW organization-level commercial administration where existing permissions allow; case-level: DENY | FUTURE BACKEND CAPABILITY (the owner role grants no `price_list`/`service_catalog` today) | Catalogue permits these keys for PRACTICE_OPERATIONS → a role-version grant through existing governance |
| Travel information | DENY | DENY | SUPPORTED TODAY | — |
| Case status | DENY | SUMMARY ONLY — **S-AGG** (no patient rows) | FUTURE BACKEND CAPABILITY | No case read authority |
| Consultant schedule | DENY | ALLOW organization-level where existing permissions allow | FUTURE BACKEND CAPABILITY | No `availability` grant → role-version grant |
| Prices | DENY | ALLOW organization-level where existing permissions allow | FUTURE BACKEND CAPABILITY | No `price_list` grant → role-version grant |
| Credentials | SUMMARY ONLY (readiness via `provider.view`) | SUMMARY ONLY — **S-CRED** | SUPPORTED TODAY | No `credential.view` |
| Practice relationships | ALLOW (manage) | ALLOW | SUPPORTED TODAY | — |
| Provider organization setup | ALLOW (view, update, invite, deactivate) | ALLOW (via *Manage organization*) | SUPPORTED TODAY | Activation stays with provider operations |

An owner (or any person) who also holds another provider role receives that role's rows as well; the workspace shows the
union of what each role independently allows, never more.

## 4. Rules for UX-4

1. A workspace may show a category only when the decision is ALLOW, ALLOW WHEN ASSIGNED/RELATED or SUMMARY ONLY **and**
   the support is SUPPORTED TODAY or the approved V-3/V-11 read serves it. A frontend filter is never the control.
2. FUTURE BACKEND CAPABILITY and NOT CURRENTLY SUPPORTABLE rows are **omitted** (no placeholder that promises them).
   FUTURE BUSINESS DECISION means DENY until decided here.
3. SUMMARY ONLY means exactly the §2 definition named in the row, shaped by the server.
4. Seeded grants broader than the decision (organization-wide `provider.view` for consultants, associates and assistants;
   organization-wide `provider.relationship.manage` for consultants; organization-wide `availability.view` for assistants)
   must not be widened and must not be surfaced as workspace features beyond the decision. They are Phase 8D findings.
5. RehletShifaa-internal areas — Access & Governance, Journey administration, coordination/routing configuration, finance
   policy (margin, coordination fees, FX policy, deposits) — are never shown to a provider persona because of membership.

## 5. UX-1 exposure statement

UX-1 added **no new backend authority and no patient or case data** for any provider persona:

- **`/admin/access/me`** now reports the caller's **own** capabilities, including organization-scoped ones.
  - The backend already authorized these. The UI now shows the areas a provider person could already reach through the API: their organization's Control Center pages.
  - The navigation is discoverability only; every endpoint still authorizes.
  - The breadth noted in §4.4 is therefore visible in the interim landing. It remains organization setup data, never patient data.
- The professional-profile read requires `provider.update` (the same as the write).
- Credential submitted facts require `credential.view`: a clinician sees only their own (SELF).
- Workspace roles require platform `access.effective_access.view`.
- The interim landing (`NoPortalWorkspace`) renders navigation links only.
