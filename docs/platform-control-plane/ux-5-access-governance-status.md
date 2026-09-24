# UX-5 — Access & Governance, role-version alignment, person-centred access

Date: 2026-09-24 · Branch: `codex/platform-control-plane` · Base: UX-4 `297bb92` (UX-4A `3f9246a`, UX-3 `cb72a42`,
UX-2 `d418350`, UX-1 `c8272b5`, UX-0 `d031450`)
Scope: plan §11 row UX-5 only. No credential-lifecycle (UX-6), Care Coordination (UX-7) or Commercial/Journey (UX-8)
redesign; no Phase 8C. Journey production intake stays OFF. No authorization-model change, no new executable permission,
no new scope type, no Keycloak change. One additive migration (V51, role-version seed) and three small read additions.

## 1. M-2 investigation — provider role versions

Every provider role template has several immutable published versions (V31–V35). Invitations and `link` assign the version
in `ProviderOrganizationService.ROLE_VERSIONS` (one assignment per distinct non-platform scope of the version's grants).
`AuthorizationService` additionally requires an **approved cutover** (`permission_version_cutovers`) for every
`credential.*`, `price_list.*`, `availability.*`, `service_catalog.*`, `assignment.*`, `journey.*` and
`provider.activate` grant; `publish()` only approves `journey.*` cutovers, so these cutovers are engineering-seeded.

| Role | Version (id) | Published | Grants (scope) | Cutover | Invitations | Live dev people | Matches matrix | Safe for new |
|---|---|---|---|---|---|---|---|---|
| Consultant | v1 `31…13` | yes | clinical.* ASSIGNED_CASES (not executable) | — | no | 0 | no (no own records) | no |
| Consultant | v2 `32…13` | yes | v1 + provider.view ORG, provider.relationship.manage ORG | n/a | no | 3 PENDING (V33 legacy mapping) | no | no |
| Consultant | v3 `34…13` | yes | v2 + credential.submit/view SELF, provider.update SELF | credential.* | **before UX-5** | 0 | partly: no own price/schedule view; org-wide relationship.manage (M-1) | incomplete |
| Consultant | v4 `35…13` | yes | v3 + price_list.view SELF, availability.view SELF | price/availability **only** | no | 0 | **no — credential grants evaluate to `INVALID_CONFIGURATION`** | no |
| Consultant | **v5 `51…13` (new)** | yes | v4 **minus** provider.relationship.manage | credential.*, price_list.*, availability.* | **after UX-5** | 0 | yes (org-wide provider.view remains, M-1) | **yes** |
| Associate doctor | v1 `31…14` | yes | clinical.case/document.view, recommendation.draft ASSIGNED_CASES | — | no | 0 | no | no |
| Associate doctor | v2 `32…14` | yes | v1 + provider.view ORG | n/a | no | 0 | no | no |
| Associate doctor | v3 `34…14` | yes | v2 + credential.submit/view SELF, provider.update SELF | credential.* | **before UX-5** | 0 | partly (no own price/schedule view) | incomplete |
| Associate doctor | v4 `35…14` | yes | v3 + price_list.view SELF, availability.view SELF | price/availability only | no | 0 | no (credential broken) | no |
| Associate doctor | **v5 `51…14` (new)** | yes | = v4 | credential.*, price_list.*, availability.* | **after UX-5** | 0 | yes | **yes** |
| Practice manager | v1 `31…12` | yes | availability/service_catalog/price_list view+manage MANAGES | none (dormant) | no | 0 | no (nothing executable) | no |
| Practice manager | v2 `32…12` | yes | provider.view, practice_staff.manage, relationship.manage ORG | n/a | **before UX-5** | 0 | no — cannot manage managed clinicians' prices/schedule | no |
| Practice manager | v3 `35…12` | yes | v2 + price_list.view/manage/publish, service_catalog.view/manage, availability.view/manage MANAGES | yes | **after UX-5** | 0 | yes (M-4 is a service defect, §14) | **yes** |
| Organization owner | v2 `32…11` | yes | provider.view/update/member.invite/deactivate/clinician.invite/practice_staff.manage/relationship.manage ORG | n/a | unchanged | 0 | yes | yes |
| Consultant assistant | v2 `32…15` | yes | provider.view ORG, availability.view ORG, appointment.view ORG | none | unchanged | 0 | stricter in practice (M-3) | yes |

SoD: none of the versions above trips `AuthorizationService.prohibited` (checked by `validate` in the tests; v5 validates as
a copy). Scope: every change stays within existing scope types; nothing becomes organization-wide.

## 2. Provider invitation version decision

**B + C.** New memberships (invite and link) now receive:
- Practice manager → **v3** (existing published version; option B).
- Consultant → **v5**, Associate doctor → **v5**, created through the existing seeded-version mechanism (V51; option C),
  because no published version combined the credential cutover with own price/schedule view.
- Owner (v2), assistant (v2) and Provider Operations Manager (v3) unchanged.

Not switched to "latest": `ROLE_VERSIONS` stays an explicit, reviewed mapping. No published version was edited.

## 3. Credential permission issue (v4)

Exact cause: **the cutover was not approved for v4's credential grants.** V35 created v4 by copying v3's grants (including
`credential.submit/view SELF`) but inserted cutover rows only for price/availability/service keys; `requiresApprovedCutover`
then denies `credential.*` with `INVALID_CONFIGURATION`. Not a missing assignment, scope, relationship or engine bug. The
matrix says consultants and associates hold own credentials (SUPPORTED TODAY), so it is a real configuration defect.
Fixed forward in v5 (V51 approves the cutover for every gated key v5 grants). v4 is left untouched (no one holds it on the
live stack; adding cutover rows to v4 would silently change a published version) — the test pins the defect as documented.

## 4. Practice Manager alignment

Matrix: prices, services and schedule of **clinicians they manage** (MANAGES), practice relationships and practice staff
(organization). v3 grants exactly that through the existing MANAGED_CLINICIANS scope; nothing is broadened to the
organization (test: org-wide `price_list.manage` denied, unmanaged clinician denied). Remaining backend breadth M-4 (§14)
is not reachable from any UI.

## 5. M-5 — default PATIENT role: **deliberately retained**

- Realm `defaultRoles: [PATIENT]` (`default-roles-rehletshifaa` composite on the live realm); `registrationAllowed=false`.
- `KeycloakPatientIdentityService.provisionPatient` already grants PATIENT explicitly when the default did not apply
  (`ensurePatientRole`; the service account has `view-realm`), so new patient accounts would survive removing the default.
- **But two supported paths depend on the default and grant nothing themselves:** patient representatives (no code grants
  `PATIENT_REPRESENTATIVE` or `PATIENT`; `/api/v1/patient/**` requires one of them) and existing-account resolution
  (`PatientAccountService.ensureAccount` → `issueLinkRequest` for an address that already has an account, e.g. a staff or
  provider person who is also a patient). Removing the default would lock both out of My Care.
- The live realm is imported once (persistent `keycloak-data` volume), and `deploy/oracle` has its own realm file, so a
  JSON change would not even reach the running environments without a manual Keycloak change.

Decision: keep the default; the UX-4 routing guard stays (provider accounts land in My Practice; `?workspace=care` keeps My
Care). The People page states it: *"Every sign-in account gets this automatically. It opens only records linked to this
account, if any."* Removing it requires first adding explicit PATIENT/PATIENT_REPRESENTATIVE grants to the representative
and link-resolution flows — recorded for Phase 8D / identity work.

## 6. People page

`/access/users` (sidebar *People*). Search by **name, email or organization** over the reads the administrator already
has (provider organizations they can view; RehletShifaa staff for system administrators); same-name matches show their
organization and email; an account identifier is only an advanced fallback. One person page, four sections:
**Account & workspaces · Business access · Access Summary · Changing or ending access.** The heading takes focus on
selection; names are `<bdi>`-isolated. `/access/effective?subject=` (old Effective access URL) opens the same page with the
Access Summary focused.

New read: `GET /api/v1/admin/access/people/access?subject=` (`AccessQueryService.person`) — every non-revoked assignment
of that person across organizations (≤ 50) with role and organization names, computed state (ACTIVE · SCHEDULED · ENDED ·
PENDING), validity, source, membership and non-revoked relationships (clinician names). Requires
`access.effective_access.view`; audited `PERSON_ACCESS_REVIEWED`. Read-only.

## 7. Identity/workspace vs business access

- **Account & workspaces** (identity system, read-only): account status and each workspace role with the workspace it
  opens (*Staff Portal · Coordinator*), tagged **Managed by Identity System**; provider memberships shown as **My Practice**
  with role and organization, tagged **Provider membership**. No buttons; links to *Manage sign-in in RehletShifaa Staff*
  (system administrators, staff people) and *Manage membership in {organization}*. No Keycloak Admin API from the browser.
- **Business access** (RehletShifaa): one card per role and organization (the one-assignment-per-scope storage is merged):
  role, organization, *Where it applies* in words (*The whole organization · Clinicians they manage*), validity (*No end
  date* / *Until …*), status, source (*Managed by RehletShifaa* / *Provider membership*), who they manage. Version, scope key
  and revision only under *Technical details*.

## 8. Access Summary

Inside the person page: *Can {name}…?* — choose an action (searchable, grouped by area), where (platform or one of their
organizations) and optionally a clinician in that organization. New read: `GET /api/v1/admin/access/check?subject=&
permission=&organization=[&clinician=]` (`AccessQueryService.check`): the existing `AuthorizationService.decide` on the
organization resource or the clinician resource (owner subject resolved server-side through the provider port, as the
clinician endpoints do), over the channels the capability is used through; recent-sign-in-only answers are reported as
allowed with a note. Returns decision, reason code, role name, scope, relationship, organization/clinician names, the
assignment's end date and the scopes at which the person holds that permission (explains *"Their role allows this only for
clinicians they manage."*). Audited `ACCESS_CHECKED`. The result region is `role=status` / `aria-live`. The frontend only
words the backend's answer; it never evaluates access.

This fixes a UX-1-era false negative: the old Effective access list evaluated every permission at organization level on
`ADMIN_WEB` only, so a consultant's own price/schedule/credential access and a practice manager's MANAGES access all read
*Not allowed*.

## 9. Role wizard

Steps: **Role purpose · Permissions · Where it applies · Restrictions & checks · Review & publish**. Draft save and check
send a prefilled, editable **change note** (under a disclosure) — the backend requires a reason on every mutation, so it is
supplied once instead of prompted each time. Publishing asks for its own **Reason for publishing** (required, empty) and an
effective date. Saving never publishes. Maker/checker: the creator sees *"You prepared this draft, so another authorized
reviewer must publish it"* and no publish control; the backend's editor rule (`editedVersion`) remains the enforcement and
its refusal is shown. Validation errors are grouped under an `role=alert` summary in words. Simulation moved under
*Advanced: try the draft on a person* with the person picker.

## 10. Role/version behaviour

Roles list: purpose, **In use** / **Not published**, **Change in progress** / **Change ready to publish**, version number
as small meta (list read now returns `currentVersion`, `currentSince`, `draftStatus`). Role page: Overview · What this role
allows · Where it can apply · Restrictions & conflicts (conflicting permissions, fresh-sign-in and not-yet-usable grants,
SoD note) · Versions & history (each version, status, effective date; select to view) · Advanced (participation, channel,
key, revision). DRAFT/VALIDATED/PUBLISHED/RETIRED preserved; published versions are never edited: **Edit a copy** creates
the draft from the published version; **Continue the prepared change** resumes an existing draft.

Truthfulness fix: *Retire version* said "will stop being offered for new access", but `AuthorizationService` honours only
PUBLISHED versions, so retiring **removes that access immediately** from everyone on it. The confirmation now says so and
that it cannot be undone.

## 11. Permission reference

Not in the sidebar; reached from the Roles header and from wizard step 2 (new tab, so the draft is kept). States that
permissions are engineering-defined and cannot be added here. Keys only under *Advanced details*.

## 12. Simulation

Unchanged backend (`POST /simulate`, side-effect-free, audited). Advanced disclosure in step 4; person picker instead of a
typed subject (identifier fallback kept under advanced); action list limited to the draft's grants.

## 13. Offboarding map (V-6)

| Action | Current command / API | Effect | Data retained | Active work impact | Supported | UI offered in UX-5 |
|---|---|---|---|---|---|---|
| Disable identity account (staff) | `POST /admin/staff/{subject}/disable` (SYSTEM_ADMIN) | Keycloak `enabled=false`; `staff_members.invitation_status=DISABLED` | yes (row, audit) | none automatic | yes | link to RehletShifaa Staff |
| Disable identity account (Direct clinician) | `POST /admin/practitioners/{id}/disable` | Keycloak disabled; `practitioner_profiles.account_status=DISABLED` | yes | none automatic | yes | stated (Direct clinician page) |
| Disable provider member account | — | — | — | — | **no command** | stated as not available |
| Remove realm workspace role | — (only at staff invite: `replaceStaffRole`) | — | — | — | **no** | read-only display |
| Revoke platform role assignment | `POST /admin/access/assignments/{id}/revoke` (`access.assignment.manage`, reason) | assignment REVOKED | yes (row, audit) | none | yes | **Remove this access** (per role card) |
| End provider membership | `POST /admin/providers/{id}/members/{subject}/deactivate` (`provider.member.deactivate`, reason) | membership + all its assignments + relationships REVOKED in that organization | yes | none automatic | yes | link to the organization's People |
| Remove clinician/practice relationship | `POST /admin/access/relationships/{id}/revoke` (`access.relationship.manage`); no provider-side endpoint | relationship REVOKED | yes | managed-clinician access ends | partly (governance only) | not offered (UX-6 relationship work) |
| Deactivate clinician eligibility (OFFBOARDED) | — (status only guarded) | — | — | — | **no** | not offered |
| Suspend credential | `POST /admin/providers/{org}/credential-reviews/{revision}/decision` `SUSPEND` | revision + dossier SUSPENDED | yes | readiness blocker | yes | not here (Credential Reviews, UX-6) |
| Reassign open work / cases | task reassign `POST /tasks/{id}/cases/{caseId}/reassign`; coordination commands | per case | yes | manual | partly, manual | stated: not automatic |

UI: a *Changing or ending access* section lists only these separate steps and says there is **no single "delete person"
action**; history and audit are kept. No orchestration was invented.

## 14. M-1 / M-3 / M-4 disposition

- **M-1** (organization-wide grants): consultant v5 drops organization-wide `provider.relationship.manage` (matrix: summary
  only). Organization-wide `provider.view` for consultants/associates/assistants stays — the existing clinician panels read
  organization-level onboarding (M-8); narrowing needs a resource change → Phase 8D. Not surfaced in any workspace.
- **M-3** (assistant `availability.view` not executable): unchanged. Effective behaviour is already stricter than the
  matrix; narrowing to *assisted clinicians* needs an ASSISTS scope → not supportable here.
- **M-4** (MANAGES holder can change organization-wide prices through a managed clinician's route): **not fixable by role
  configuration** — `ProviderOperationalSetupService` authorizes organization-scope price rows against the clinician
  resource. The correct fix (authorize organization rows against the organization resource) would also leave organization
  default prices with no manager, because no version grants `price_list.manage` at ORGANIZATION scope — a business decision
  on who owns organization defaults. Recorded for **Phase 8D**. No UI offers it: My Practice is clinician-scoped and the
  Control Center price tab does not report MANAGES capabilities.

## 15. Tests

- Backend `AccessGovernanceUx5IntegrationTest` (10): new memberships receive Consultant v5 / Associate v5 / Practice
  manager v3, owner and assistant unchanged; consultant and associate matrix capabilities (own credentials, prices, schedule,
  profile; no manage/publish/self-schedule; nothing on another clinician; no org-wide relationship management); practice
  manager only on managed clinicians and never org-wide; assistant restricted, owner unaffected; historical v3 stays pinned
  and v4's `INVALID_CONFIGURATION` is pinned as documented; published v5 immutable, *Edit a copy* draft equals the published
  grants and validates, maker cannot publish, stale revision refused; person access across organizations with names, state
  and relationships; check allowed with role/scope/relationship/clinician, denied with held scopes, SELF answered on the own
  record, unknown permission refused; temporal validity and ended assignments; reads require
  `access.effective_access.view`; audit filters.
- Frontend `AccessGovernance.test.tsx` (20), `PageHeaders.test.tsx` updated; e2e `access-governance.spec.ts` updated and
  passing live (EN/AR). Totals: backend **519 / 0 failures / 1 skipped**; frontend **345 tests / 46 files**. Details in
  test-status.md.
- Live review (15 views, EN/AR, desktop/390 px): no overflow, one `main`/h1, no writes; fixed a nested-form defect in the
  person picker (inside the wizard and audit filters) and the Arabic role-page purpose line.
- Accessibility baseline: person search has a visible label, live match count and named *Select {name}* buttons; states
  are text + icon, never colour only; wizard steps use `aria-current="step"` and move focus to the step heading; Remove and
  Retire use the focus-trapping dialog (Escape, focus return); validation errors are an `role=alert` summary; the Access
  Summary result is a `role=status` live region. Formal validation remains Phase 8C.
- Mobile: person page stacks Person → Workspaces → Business roles (single-column cards) → Access Summary → Changes; Give
  access is single-column; no tables. Role authoring works at 390 px but is best on desktop (dense permission lists).

## 16. Remaining debt

- **Phase 8D:** M-4 (organization-row price authorization + ownership of organization default prices); M-1 residual
  (organization-wide `provider.view`); M-3; M-5 removal path (explicit PATIENT/representative grants first); disabling a
  provider member's identity account; clinician OFFBOARDED command; case reassignment on offboarding.
- **Existing users:** nobody on the live stack holds Consultant/Associate v3/v4 or Practice manager v2 (3 legacy PENDING v2
  consultants from V33). Anyone invited before UX-5 stays pinned; migrate explicitly through *Give access* (v5/v3) +
  *Remove* of the old role — never automatically.
- Audit role filter not offered (entries reference version/assignment ids; no role join) — only person (who acted),
  action and date.
- People search covers people visible through provider organizations and (for system administrators) RehletShifaa staff;
  patients are intentionally not searchable here (privacy).
- Arabic terms needing native review (V-9): الوصول إلى أعمال رحلة شفاء · ملخص الصلاحيات · أين ينطبق · تعديل نسخة · متابعة
  التغيير قيد الإعداد · ملاحظة التغيير · سبب النشر · تغيير الوصول أو إنهاؤه · يديره نظام الهوية · عضوية لدى مقدم الرعاية ·
  علاقة مهنية · قيد الاستخدام.

## 17. Acceptance

| Criterion | Result |
|---|---|
| People answers who / what / why / how | YES |
| Identity roles and business roles clearly separated; realm roles read-only | YES |
| Role-centric governance available (Roles, versions, wizard, Audit) | YES |
| Give / Remove access understandable and safe (backend validation, reasons) | YES |
| Access Summary uses backend decisions | YES (`/admin/access/check`) |
| Role wizard keeps full governance (DRAFT/VALIDATED/PUBLISHED/RETIRED, maker/checker, immutability) | YES |
| Provider invitation role-version behaviour explicitly resolved (M-2) | YES (v5 / v3) |
| M-5 resolved or deliberately retained with reason | Retained (§5) |
| No historical access silently changed | YES (no assignment rewritten) |
| No broad unsafe grant exposed merely because it exists | YES (M-4 not reachable from UI) |
| Offboarding capabilities/gaps documented truthfully | YES (§13) |
| Frontend and backend tests pass | YES |
| No UX-6+ redesign | YES |

### UX-5 COMPLETE: YES

### UX-6 READY: YES

Remaining work for UX-6 is credential/readiness UX. The open access findings (M-4, M-1 residual, M-3, M-5 removal path,
offboarding gaps) are Phase 8D items with no UI exposure, not unresolved access-governance safety defects in the UI.
