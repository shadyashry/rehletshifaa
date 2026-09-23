# Provider persona data-access matrix (P0-9 — UX-4 design and security gate)

Date: 2026-09-23 · Phase: UX-1 · Status: **FROZEN FIRST DRAFT — business decisions open (marked UNDECIDED).**

This matrix is the required input for UX-4 (Provider Workspace). **No provider persona may be shown patient or case
data in any workspace until the rows marked UNDECIDED are decided and each ALLOW rule is proven against the actual
backend read.** UX-1 introduced no new provider data exposure (see §4).

Marks: **ALLOW** · **ALLOW WHEN ASSIGNED/RELATED** · **SUMMARY ONLY** · **DENY** · **UNDECIDED**.

## 1. What the platform allows today (verified in code)

- Every case, patient, document and work read requires an **identity-system portal role**:
  - `SecurityConfig` gates `/patient`, `/coordinator`, `/doctor`, `/operations` and `/finance` by realm role.
  - `JourneyService.authorizeRead` (used for the case workspace and `CaseDocumentAccessPolicy`) accepts only SYSTEM_ADMIN, AUDITOR, a lead reader, the patient or their representative, or the realm-role staff paths.
  - Provider personas are provisioned with **no** realm role (`IdentityProvisioningPort`), so **no provider persona can read any patient or case data today.**
- The seeded provider role versions (V31–V35) grant `clinical.case.view`, `clinical.document.view` and `clinical.recommendation.*` on ASSIGNED_CASES to Consultant and Associate doctor.
  - These are **not executable** (`PermissionCatalog`: executable=false, workflow-gated), so they confer nothing.
- Provider capabilities today (latest seeded versions; real assignments may differ):

| Persona (role version) | Organization-wide | Own records (SELF) | Clinicians they manage (MANAGES) |
|---|---|---|---|
| Organization owner (v2) | `provider.view`, `provider.update`, `provider.member.invite/deactivate`, `provider.clinician.invite`, `provider.practice_staff.manage`, `provider.relationship.manage` | — | — |
| Practice manager (v3) | `provider.view`, `provider.practice_staff.manage`, `provider.relationship.manage` | — | `price_list.view/manage/publish`, `service_catalog.view/manage`, `availability.view/manage` |
| Consultant (v4) | `provider.view`, `provider.relationship.manage` | `provider.update`, `credential.submit/view`, `price_list.view`, `availability.view` | — |
| Associate doctor (v4) | `provider.view` | `provider.update`, `credential.submit/view`, `price_list.view`, `availability.view` | — |
| Consultant assistant (v2) | `provider.view`, `availability.view`, `appointment.view` | — | — |

## 2. Matrix — today vs. the UX-4 draft rule

"Today" is what the backend serves now. "UX-4 draft" is the proposed minimum-necessary rule, to be approved.

### Provider consultant
| Category | Today | UX-4 draft | Basis / open decision |
|---|---|---|---|
| Patient identity | DENY | ALLOW WHEN ASSIGNED | Needs an executable, assignment-scoped read (future backend capability) |
| Patient contact information | DENY | DENY | Coordinators own patient contact |
| Medical documents | DENY | ALLOW WHEN ASSIGNED | `clinical.document.view` exists but is not executable |
| Clinical notes | DENY | ALLOW WHEN ASSIGNED (own recommendation and case clinical notes) | Future backend capability |
| Diagnosis / medical summary | DENY | ALLOW WHEN ASSIGNED | Future backend capability |
| Proposal / commercial | DENY | UNDECIDED | May see their own cost estimate; final quote and deposit need a business decision |
| Travel information | DENY | DENY | Not needed for clinical review |
| Case status | DENY | ALLOW WHEN ASSIGNED | Future backend capability |
| Consultant schedule | ALLOW WHEN RELATED (own, view) | ALLOW WHEN RELATED (own) | `availability.view` SELF; self-edit (`availability.manage_self`) not granted |
| Prices | ALLOW WHEN RELATED (own, view) | ALLOW WHEN RELATED (own) | Approving their own price needs `price_list.manage` SELF, which is **not granted** → UNDECIDED |
| Credentials | ALLOW WHEN RELATED (own: submit/view) | ALLOW WHEN RELATED (own) | Independent review stays with reviewers |
| Practice relationships | ALLOW (org-wide manage) | SUMMARY ONLY (own relationships) | Seeded org-wide `provider.relationship.manage` is broader than needed → Phase 8D finding |
| Provider organization setup | ALLOW (org-wide view: members, onboarding, readiness) | SUMMARY ONLY (own setup) | Seeded org-wide `provider.view` is broader than needed → UNDECIDED |

### Associate doctor
| Category | Today | UX-4 draft | Basis / open decision |
|---|---|---|---|
| Patient identity | DENY | ALLOW WHEN ASSIGNED | As consultant; the supervisor's other cases: UNDECIDED |
| Patient contact information | DENY | DENY | — |
| Medical documents | DENY | ALLOW WHEN ASSIGNED | Future backend capability |
| Clinical notes | DENY | ALLOW WHEN ASSIGNED (draft only; no final recommendation authority) | technical-decisions §13.3 |
| Diagnosis / medical summary | DENY | ALLOW WHEN ASSIGNED | Future backend capability |
| Proposal / commercial | DENY | DENY | Not needed |
| Travel information | DENY | DENY | — |
| Case status | DENY | ALLOW WHEN ASSIGNED | Future backend capability |
| Consultant schedule | ALLOW WHEN RELATED (own, view) | ALLOW WHEN RELATED (own) | — |
| Prices | ALLOW WHEN RELATED (own, view) | UNDECIDED | Whether associates carry their own price list |
| Credentials | ALLOW WHEN RELATED (own) | ALLOW WHEN RELATED (own) | — |
| Practice relationships | DENY (no manage grant) | SUMMARY ONLY (their supervisor) | — |
| Provider organization setup | ALLOW (org-wide view) | SUMMARY ONLY (own setup) | Seeded breadth → UNDECIDED |

### Practice manager
| Category | Today | UX-4 draft | Basis / open decision |
|---|---|---|---|
| Patient identity | DENY | UNDECIDED | Scheduling might need a name; default DENY until decided |
| Patient contact information | DENY | DENY | — |
| Medical documents | DENY | DENY | — |
| Clinical notes | DENY | DENY | — |
| Diagnosis / medical summary | DENY | DENY | — |
| Proposal / commercial | DENY | UNDECIDED | Commercial tasks beyond price lists need a decision |
| Travel information | DENY | UNDECIDED | — |
| Case status | DENY | UNDECIDED (at most SUMMARY ONLY for clinicians they manage) | — |
| Consultant schedule | ALLOW WHEN RELATED (MANAGES: view/manage) | ALLOW WHEN RELATED | Existing capability |
| Prices | ALLOW WHEN RELATED (MANAGES: view/manage/publish) | ALLOW WHEN RELATED | Existing capability; consultant approval rule unchanged |
| Credentials | SUMMARY ONLY (readiness facts via `provider.view`) | SUMMARY ONLY (status, not evidence) | No `credential.view` |
| Practice relationships | ALLOW (org-wide manage) | ALLOW | Existing capability |
| Provider organization setup | ALLOW (view) + practice-staff management | ALLOW | Existing capability |

### Consultant assistant
| Category | Today | UX-4 draft | Basis / open decision |
|---|---|---|---|
| Patient identity | DENY | UNDECIDED | Default DENY |
| Patient contact information | DENY | DENY | — |
| Medical documents | DENY | DENY | An assistant relationship grants no clinical status (technical-decisions §13.3) |
| Clinical notes | DENY | DENY | — |
| Diagnosis / medical summary | DENY | DENY | — |
| Proposal / commercial | DENY | DENY | — |
| Travel information | DENY | UNDECIDED | — |
| Case status | DENY | UNDECIDED | — |
| Consultant schedule | ALLOW (org-wide view) | ALLOW WHEN RELATED (ASSISTS) | Seeded ORGANIZATION scope is broader than "clinicians they support" → Phase 8D finding |
| Prices | DENY | DENY | — |
| Credentials | DENY | DENY | — |
| Practice relationships | DENY | SUMMARY ONLY (who they assist) | — |
| Provider organization setup | ALLOW (org-wide view) | SUMMARY ONLY | Seeded breadth → UNDECIDED |

### Organization owner
| Category | Today | UX-4 draft | Basis / open decision |
|---|---|---|---|
| Patient identity | DENY | DENY | Governance role; no clinical need |
| Patient contact information | DENY | DENY | — |
| Medical documents | DENY | DENY | — |
| Clinical notes | DENY | DENY | — |
| Diagnosis / medical summary | DENY | DENY | — |
| Proposal / commercial | DENY | UNDECIDED (organization-level commercial summary only) | — |
| Travel information | DENY | DENY | — |
| Case status | DENY | UNDECIDED (aggregate counts only, no patient rows) | — |
| Consultant schedule | DENY | UNDECIDED | No availability grant |
| Prices | DENY | UNDECIDED | No price grant |
| Credentials | SUMMARY ONLY (readiness via `provider.view`) | SUMMARY ONLY | No `credential.view` |
| Practice relationships | ALLOW (manage) | ALLOW | Existing capability |
| Provider organization setup | ALLOW (view, update, invite, deactivate) | ALLOW (via *Manage organization*) | Existing capability; activation stays with provider operations |

## 3. Rules for UX-4

1. A workspace may show a category only when the draft rule is ALLOW or ALLOW WHEN ASSIGNED/RELATED, **and** an existing backend read already enforces that exact scope. A frontend filter is never the control.
2. UNDECIDED means DENY until a business owner decides; record the decision in this file.
3. SUMMARY ONLY means status or counts, never evidence, documents, patient identifiers or free text.
4. Seeded grants broader than the draft rule (organization-wide `provider.view` for clinicians and assistants,
   organization-wide `provider.relationship.manage` for consultants, organization-wide `availability.view` for
   assistants) must not be widened further. They are Phase 8D review findings.

## 4. UX-1 exposure statement

UX-1 added **no new backend authority and no patient or case data** for any provider persona:

- **`/admin/access/me`** now reports the caller's **own** capabilities, including organization-scoped ones.
  - The backend already authorized these. The UI now shows the areas a provider person could already reach through the API: their organization's Control Center pages.
  - The navigation is discoverability only; every endpoint still authorizes.
  - The breadth noted in §3.4 is therefore visible in the interim landing. It remains organization setup data, never patient data.
- The professional-profile read requires `provider.update` (the same as the write).
- Credential submitted facts require `credential.view`: a clinician sees only their own (SELF).
- Workspace roles require platform `access.effective_access.view`.
- The interim landing (`NoPortalWorkspace`) renders navigation links only.
