# UX-3 — Clinicians directory, clinician page family and Consultant Setup

Date: 2026-09-24 · Branch: `codex/platform-control-plane` · Base: UX-2 `d418350` (UX-1 `c8272b5`, UX-0 `d031450`)
Scope: plan §11 row UX-3 only. No Provider Workspace (UX-4), no Access & Governance (UX-5), no credential lifecycle
redesign (UX-6), no Coordination redesign (UX-7), no Commercial/Journey polish (UX-8), no Phase 8C. Journey production
intake stays OFF. Direct and provider-organization consultants **remain separate backend models**.

## 1. Old clinician UX (UX-2 state)

| Area | Before |
|---|---|
| Directory | *Clinicians* page with a segmented toggle **In provider organizations / Direct (current case workflow)** — two lists, two mental models; the provider list read every organization's detail and then each clinician's onboarding (1 + O + C calls) |
| Row actions | Row menu repeating *Open / Credentials / Pricing / Schedule* (Direct: *Open / Price list / Resend / Disable*) |
| Add | *Add consultant* = step 1 of a four-step wizard (progress strip, "Four short steps"), with the audit note as a visible required field |
| Setup | `…/setup?step=` wizard: *Consultant details → Professional setup → Working setup → Review & activate*; one admin appeared responsible for everything |
| Clinician page | `ConsultantWorkspace` (Overview · Credentials · Practice relationships · Pricing · Schedule · Readiness) plus the separate wizard — two editors for the same things |
| Direct page | `DirectConsultantDetail` (Overview · Case approval · Price list · Account access), visually unrelated |
| Hidden defect | The Direct list (`GET /admin/practitioners`) returns **every** `CONSULTANT` practitioner profile, so provider-invited consultants also appeared as "Direct · Awaiting approval" with a *Review* action. The backend refuses that approval (`ProviderCredentialEligibility.requireLegacyWriteAllowed` → 409 `PROVIDER_CREDENTIAL_POLICY_ADOPTED`), so the action could never succeed and Home counted them as Direct approvals |

## 2. New directory — Providers › Clinicians (`/providers/clinicians`)

- **One list** for Consultants, Associate Doctors and Direct consultants, sorted by name. No engagement toggle.
- Each row: **name** (link to the clinician page) · professional role (+ specialty where the read has it: Direct only) ·
  **Works with** (organization, or *RehletShifaa*) + engagement (*Direct with RehletShifaa* / *Through a Provider
  Organization*) · **Credentials** · **Setup** · **Case eligibility** — three separate facts, each a labelled status
  with icon + text (never colour alone).
- The only row action is **Continue setup**, shown only while setup is in progress. No row menus.
- Filters (existing data only): search (name, organization, specialty) · Engagement · Organization (incl. RehletShifaa)
  · Clinician type · Setup (In progress / Complete / Suspended or inactive). A filter appears only when it can narrow
  the list. A live result count; *No clinicians match these filters.* with *Clear filters*; *No clinicians yet · Add
  your first clinician to begin setup · Add clinician*.
- One failing source is reported with *Try again* and "the list below is incomplete" — never shown as a complete list.
- Credential status filter deliberately **not** added: the Direct model has no credential status separate from its
  approval, so a combined filter would falsely normalize the two models.

## 3. Direct / Provider presentation (engagement rule)

The backend already defines the switch: a practitioner **uses provider credentialing** when a provider enrollment has a
credential-policy cutover (`ProviderCredentialEligibility.adopted`). It decides case eligibility (`eligible()`) and
refuses Direct approval writes. UX-3 uses exactly that fact, no heuristics:

| Record | Shown as |
|---|---|
| Direct record, not under provider credentialing | **Direct with RehletShifaa** |
| Provider enrollment under provider credentialing | **Through a Provider Organization** (its Direct record is not listed a second time) |
| Provider enrollment **not** adopted (V33 legacy mapping, `LEGACY_UNREVIEWED`) | Shown on the person's Direct entry: *Also linked to {organization} (imported record)*; its own page says case approval still follows the Direct record |

A person enrolled in two organizations appears once per organization (each is a real, separate engagement).

## 4. Common vs model-specific sections

| | Through a Provider Organization (`/providers/clinicians/{org}/{practitioner}`) | Direct with RehletShifaa (`/providers/clinicians/direct/{id}`) |
|---|---|---|
| Header | name · *type · organization* · engagement chip · setup status | name · *specialty · care area* · engagement chip · setup status |
| Overview | type, organization, engagement, organization membership, **Credentials**, **Case eligibility**, setup progress, *What needs attention* (section, owner, next step) · **Professional Profile** (read-back, edit in place) · Technical details (collapsed) | type, *RehletShifaa*, engagement, specialty, care area, account, **Credentials** (*checked at case approval*), **Case eligibility**, work email, invited · Direct **Setup** list (Account · Credential & case approval · Availability for cases, each with owner) |
| Setup | **Consultant Setup** checklist (§5) | — (model has no provider readiness or activation) |
| Credentials | required credentials with per-credential status (existing component; reviewers get *Open review*) | **Credential & case approval** (existing decision with confirmation) — hidden when the backend would refuse it |
| Professional Relationships | Supervising Consultant · Manages this consultant · Assists this consultant · Supervises | — |
| Prices | existing editor; *Using organization price* / *Clinician-specific price* | **Price list** (existing Direct catalog) |
| Schedule | existing weekly schedule editor | — (Direct availability is the clinician's own AVAILABLE/UNAVAILABLE flag, shown in Setup) |
| Account | organization membership (activate in Setup › Account) | **Account access** (resend / disable / restore, system administrator) |

Tabs appear only when the caller can read them (`credential.view`, `price_list.view`, `availability.view`), so nobody
sees empty tabs. The default tab is *Setup* while a provider clinician is not active, else *Overview*.

## 5. Add clinician → Consultant Setup

**Add clinician** (`/providers/clinicians/new`) is one short screen: Engagement (only if the caller can use both) ·
Full name · Work email · Provider Organization + Clinician type (provider) or Specialty + Care area (Direct; the
existing mandatory facts the case workflow matches on) · Invitation language. The mandatory audit reason is prefilled
("New clinician invited from the Control Center") under a collapsed **Audit note** (opens if emptied) — still sent,
still editable. Primary action **Send invitation**; a half-created sign-in account stays recoverable (*Finish account
setup*). Endpoints and bodies are unchanged.

On success the provider path opens `…?tab=setup&invited=1`; the Direct path opens its page with `?invited=1`. The
confirmation receives focus so it is announced.

**Consultant Setup** (Setup tab) is a persistent checklist — a summary line (*n of 6 sections complete · Now: {section}
— {state} · Responsible: {owner}*) and six sections, each with status, responsible party, what remains and only the
actions the caller can take:

| # | Section | Backend facts (readiness, unchanged) | Actions offered here |
|---|---|---|---|
| 1 | Account | `identityProvisioned`, `organizationMembershipActive` | *Activate membership* (`provider.member.invite`) |
| 2 | Professional Profile | `clinicianProfileComplete`, `requiredRelationshipsComplete` | *Complete professional profile* (→ Overview), *Assign supervising consultant* (→ Relationships) |
| 3 | Credentials Submitted | `requiredCredentialsSubmitted`; rejected / more-information-required credentials from the credential summary | *Add credentials* (→ Credentials, `credential.submit`) |
| 4 | Independent Credential Review | `requiredCredentialsVerified`, `mandatoryCredentialsUnexpired`, `CREDENTIAL_EXPIRED` | reviewer: *Open review* (link to Credential Reviews); others: *View credential status*. **No decision controls.** |
| 5 | Operational Setup | pricing, schedule (when required), `ROUTING_INCOMPLETE`, `OPERATIONAL_SETUP_UNAVAILABLE` | *Open prices*, *Set schedule*, *Assign practice manager*, *Open Coordination Setup* |
| 6 | Activation | `readyForActivation`, organization status, `PROVIDER_PROFILE_INCOMPLETE`, commercial acceptance | existing `ActivationPanel` (Decision D); *Open organization setup* |

States: *Complete* · *Needs attention* · *Waiting* (someone else's turn) · *Not available yet* (release-blocked). The
current section is marked `aria-current="step"` and with an inline-start bar (not colour alone).

## 6. Responsibilities (derived from the seeded role grants, V31–V35)

| Requirement | Shown owner | Evidence |
|---|---|---|
| Membership activation | Provider Operations or the Organization Owner | `provider.member.invite`: Provider Operations Manager (org), Organization Owner |
| Professional Profile | Provider Operations | `provider.update`: Provider Operations Manager, Organization Owner, clinician (SELF); plan §4 names Provider Operations |
| Credentials submitted | The clinician or Provider Operations | `credential.submit`: Provider Operations Manager (org), Consultant/Associate (SELF) |
| Independent review | Credential Review Team | `credential.review/verify`: Credential Verifier only |
| Prices, schedule | Practice manager | `price_list.manage/publish`, `availability.manage`: Practice Manager, **MANAGES** scope only. When no practice manager manages the clinician the section says so — nobody else holds these grants |
| Routing | Coordination Setup team | `assignment.policy.manage`: Care Coordination Manager |
| Activation | Provider Operations | `provider.activate`: Provider Operations Manager only |
| Organization profile / legacy review | shown as the backend blocker with a link to the organization's Setup | — |

A section with nothing the caller can do says *Nothing for you to do here — the responsible team handles it.*

## 7. Credential summary

- Directory and Overview use one status per clinician computed server-side from the same rules readiness uses: per
  required credential type, *MISSING* / *VERIFIED* (an effective verified revision, so a renewal in review does not
  hide a valid credential) / *EXPIRED* (derived from `expires_at`, never the stored status) / else the latest status.
  The label is the most urgent: Suspended › Rejected › Expired › More information required › Under review ›
  Submitted › Not submitted / Partly submitted › Verified, with *n of m verified* underneath. Never "complete".
- Per-credential status stays on the Credentials tab (existing component; labels aligned to the plan: *Submitted*,
  *Under review*, *More information required*). "Uploaded" (evidence scanned but not submitted) is not a separate
  state in the UI because upload and submit are one step there.
- **Credential status ≠ case eligibility**: separate columns/facts everywhere; the Credentials tab says a verified
  credential does not by itself make the clinician eligible.

## 8. Operational setup, prices, schedule

- Summaries only; the existing editors are reused (no duplicate editors). Deep links switch to the Prices / Schedule
  / Relationships tab or open Coordination Setup for that organization.
- Prices: *Organization price* / *Clinician-specific price* (was *Organization default* / *Consultant override*); the
  applied price reads *Price that applies now: … · Using organization price* or *Clinician-specific price*.
- Schedule is the visible term; the separate Schedules hub stays only for people who can read schedules but cannot
  open Clinicians (it is no longer a Clinicians header action).

## 9. Activation / case eligibility

- Provider: *Not ready for cases · Provider activation isn't available in this release* while commercial acceptance
  is fail-closed; *Activated for cases* only for an ACTIVE enrollment; *Uses Direct case approval* for an unadopted
  legacy record. Activation follows Decision D unchanged (case 3 information; case 2 disabled with named blockers;
  real activation behind confirmation).
- Direct: *Can receive cases* only when approved, marked available and with a care area (the conditions the current
  case assignment checks); otherwise *Not taking cases* / *Not ready for cases* with the reason, or *Not approved*.
  Direct approval is not renamed "activation".

## 10. Routes and redirects

| Route | Change |
|---|---|
| `/providers/clinicians` | **New** directory (`?engagement=direct|provider` preselects the filter) |
| `/providers/clinicians/new` | **New** Add clinician (`?org=`) |
| `/providers/clinicians/{org}/{practitioner}` | **New** provider clinician page (`?tab=overview|setup|credentials|relationships|prices|schedule`, `invited=1`) — composite key kept (practitioner is only unique within an enrollment) |
| `/providers/clinicians/{org}/{practitioner}/setup` | Redirect → `?tab=setup` |
| `/providers/clinicians/direct/{id}` | **New** Direct clinician page (`?tab=overview|approval|prices|access`, `invited=1`) |
| `/providers/consultants` | Redirect → `/providers/clinicians` (`view=direct` → `engagement=direct`) |
| `/providers/consultants/{org}/{p}` | Redirect, tab mapped (`pricing→prices`, `availability→schedule`, `readiness→setup`) |
| `/providers/consultants/{org}/{p}/setup` | Redirect → `?tab=setup` (old `step` ignored) |
| `/providers/consultants/direct/{id}` | Redirect, `pricing→prices`, `created=1→invited=1` |
| `/providers/onboarding/new` | Redirect → `/providers/clinicians/new` (keeps `org`) |
| `/providers/{id}/clinicians/{p}/pricing` · `/availability` | Now redirect straight to `?tab=prices` / `?tab=schedule` |

Organization › People rows and the organization's *Add clinician* action link into the same pages; the organization
page keeps only organization-specific actions (activate/remove membership, relationships) — no clinician editor.

## 11. Backend additions (read-only)

1. `GET /api/v1/admin/providers/clinicians[?organizationId=]` (`ProviderClinicianDirectoryService`) — **why existing
   reads were insufficient:** the one directory needs, per clinician, the organization, stored onboarding status and a
   credential status. The only existing path is `GET /admin/providers` + `GET /admin/providers/{id}` per organization +
   `…/onboarding` and `…/credentials` (+ `…/credential-requirements`) per clinician, i.e. **1 + O + 3C** requests; with
   the gateway's read burst of 60 that fails at ~20 clinicians, and readiness per clinician would add C more expensive
   evaluations. The new read is bounded: the caller's visible organizations come from the unchanged
   `ProviderOrganizationService.list()` (active membership + `provider.view` per organization), then **three queries**
   (enrollments, revisions of those organizations, current credential policies). It returns stored facts and
   status-level counts only — no evidence, submitted facts, reviewer identity, free text or specialty. No readiness is
   computed. `organizationId` only narrows the caller's own visible set.
2. `PractitionerSummaryView.providerCredentialing` on `GET /admin/practitioners` — one `EXISTS` on the existing cutover
   column, so the Direct list can tell which records the backend already treats as provider-credentialed.
No write API, no migration, no authorization change, no merge of persistence.

## 12. N+1 / performance

| Page | Before | After |
|---|---|---|
| Clinicians directory | 1 + O (org details) + C (onboarding) [+ `/admin/practitioners` on toggle] | **2** (`/admin/providers/clinicians`, `/admin/practitioners`) + the shell's capability read |
| Clinician page | detail + onboarding + readiness (+ tab reads) | same + 1 (`clinicians?organizationId=` for the credential summary) |
| Home | unchanged (UX-2 fan-out, capped) | Direct approval count now excludes provider-credentialed records |

Pre-existing, not changed: `/admin/practitioners` resolves each practitioner's account status with a Keycloak lookup
server-side (N identity calls per list); the organization Setup tab and Home still fan out per clinician/organization.

## 13. Permissions and isolation

- Provider rows are filtered server-side per organization exactly as the organization list; `?organizationId=` for an
  organization the caller cannot view returns nothing (integration test). Direct rows come only from the unchanged
  legacy-role endpoint. The UI never joins data the caller could not already read.
- Exposure: a `provider.view` holder could already read, per organization, members' names, onboarding status and
  readiness blockers that name each missing/expired/awaiting credential. The directory aggregates that same class of
  status data into counts; specialty and registration stay behind `provider.update`. No provider-persona patient or
  case data; the P0-9 matrix is unchanged.

## 14. Responsive, RTL, accessibility (baseline; formal validation is Phase 8C)

- Desktop: compact six-column rows. ≤ 900 px: stacked cards — name, then *Works with*, then Credentials/Setup/Case
  eligibility in two columns each with a visible label, *Continue setup* full width. No horizontal scroll.
- Consultant Setup on mobile is the same checklist (no wizard strip); the summary line with the current section and
  owner comes first; action buttons are ≥ 44 px.
- RTL: logical properties; the current-section bar sits on the inline start; clinician names, organization names,
  emails and licence numbers are `<bdi>`-isolated; country names come from `Intl.DisplayNames` in the page language.
- Accessibility: one h1; sections are h2/h3; the checklist is an ordered list with `aria-current="step"`; statuses are
  icon + text; each directory fact carries a label for screen readers (visually hidden on desktop, visible on mobile);
  filters live in a `role="search"` region with a polite result count; *Continue setup* links name the clinician;
  focus moves to the confirmation after *Send invitation*; the first invalid field is focused on a failed submit;
  tabs keep the existing tab semantics; rows are not clickable containers (no nested interactives).

**Arabic terms needing native review (V-9)** — drafts used here: الأطباء · إضافة طبيب · مباشرة مع رحلة شفاء · من خلال
جهة طبية · الجهة الطبية · طريقة العمل · يعمل مع · أهلية الحالات · غير جاهز للحالات · يمكنه استقبال الحالات · مفعّل
لاستقبال الحالات · الملف المهني · تقديم الاعتمادات · المراجعة المستقلة للاعتمادات · الإعداد التشغيلي · التفعيل ·
العلاقات المهنية · يديره / يساعده / يشرف على · سعر الجهة / سعر خاص بالطبيب · مطلوب مزيد من المعلومات · مقدَّمة جزئيًا ·
ملاحظة سجل التدقيق · فريق مراجعة الاعتمادات · عمليات مقدمي الرعاية.

## 15. Tests

Frontend `pnpm typecheck` clean; `pnpm test` **314 tests / 45 files, 0 failures** (three consecutive full runs; UX-2 was 299 / 43). Backend: focused `ProviderClinicianDirectoryIntegrationTest` 3/3, then the full offline regression **495 tests, 0 failures, 0 errors, 1 skipped**. New suites: `ClinicianDirectory` (mixed list, no toggle, engagement /
organization / type, separate facts, Continue setup only in progress, one bounded read per model, permission-scoped
reads, filters + filtered empty state, empty state, partial failure, Arabic/bdi; model rules), `ClinicianPage`
(invitation lands on Setup with focus, six sections + owners, Provider Ops has no review controls, reviewer *Open
review* link, operational summaries + deep links, Decision D cases 2/3 + confirmed activation, Overview facts, profile
read-back with country name and untouched fields preserved, capability-gated tabs, Arabic; Direct page model and
provider-credentialed refusal), `AddClinician` (short form, prefilled audit note, unchanged invite body → Setup, Direct
path, recoverable identity). Updated: `routes` (every old clinician URL), `CareOperations`, `PageHeaders`,
`CredentialQueue`, `CredentialReview`, `PricingManagement`, `ProviderOrganizationDetail`, `ControlCenterOverview`,
`ControlCenterShell`. Removed with their components: `ConsultantOnboardingWizard.test` (its profile/activation cases
moved to `ClinicianPage.test`). Backend: `ProviderClinicianDirectoryIntegrationTest` (isolation, credential summary,
expiry derivation, Direct-list engagement fact).

## 16. Live visual sanity (limited; not Phase 8C)

Canonical base + tunnel rebuild, then a temporary Playwright script (scratchpad only, not committed) against
`https://dev.rehletshifaa.com` with a synthetic session and mocked reads; **every write refused** (none attempted).
Views: EN desktop 1440 — mixed directory (2 provider organizations incl. an Arabic name, Direct approved + awaiting,
a provider-credentialed Direct record hidden), provider clinician Setup (after invitation) / Overview / Credentials,
Direct clinician, Add clinician, the legacy `/providers/consultants/…?tab=readiness` bookmark (lands on Setup);
EN mobile 390 — directory, Setup checklist; AR desktop — Setup, directory; AR mobile — directory.

| Check | Result |
|---|---|
| Horizontal overflow | none on all 12 views |
| Landmarks / h1 | one `main`, one stable h1 everywhere |
| Console / page errors | none (the pre-existing Cloudflare beacon CSP refusal is filtered) |
| Focus after invitation | on the confirmation (**found and fixed**: the first build focused before the capability read had rendered the page) |
| Directory columns | **found and fixed**: rows without *Continue setup* shifted the grid, and long badges (*More information required*) overflowed into the next column — fixed action column width, wrapping badges |
| Model distinction / CTA | engagement stated on every row and page; one primary action per scenario; no duplicate editors; activation shown as *Activation isn't available yet* information, never a disabled primary button |
| RTL | `dir=rtl`, sidebar on the right, current-section bar on the inline start, mixed-script names isolated |

## 17. Remaining debt (not UX-3)

- **UX-4:** Provider Workspace; the interim landing still lists Control Center areas.
- **UX-6:** Credential Reviews workspace (typed rows incl. Direct approvals), decision history, derived *expiring* /
  *renewal submitted* labels; organization Setup readiness fan-out; "Uploaded" as a visible state.
- **UX-8:** Price Lists page still says *Organization default / Consultant override* in its price-order explainer and
  lists provider-credentialed practitioners in its Direct price-list picker.
- **Backend (small reads, needs approval):** `/admin/practitioners` per-row Keycloak status lookups; a shared capability
  provider (the capability read still runs twice per page).
- Practice-manager and clinician self-service capabilities are relationship/self-scoped, which `/admin/access/me` does
  not report (V-11), so the checklist cannot yet offer those people their own actions (UX-4 decision).

## 18. Acceptance gate

| Criterion | Result |
|---|---|
| One canonical Clinicians directory; no Direct/Provider primary toggle; engagement explicit | YES |
| Backend models separate; persistence untouched | YES (two read additions only, §11) |
| One clinician page family with truthful model-specific sections | YES (§4) |
| Short invitation + persistent Consultant Setup replaces the wizard | YES (§5) |
| Independent credential review separated (no decision controls in setup) | YES |
| Professional details read back, edit in place, country picker | YES |
| Credential status ≠ case eligibility | YES |
| Operational setup understandable; activation truthful (Decision D) | YES |
| No broadened provider-person data exposure; no dangerous N+1 | YES (§12, §13) |
| Mobile usable; RTL sanity | YES (§14, §16) |
| Frontend typecheck/tests; backend tests | YES (§15) |
| UX-4 functionality not implemented | YES |

### UX-3 COMPLETE: YES

### UX-4 READY: NO

The clinician/provider presentation is stable, but the provider-persona data-access matrix
([provider-persona-data-access-matrix.md](provider-persona-data-access-matrix.md)) still has material **UNDECIDED**
patient/case rows, and UX-4 is defined by exactly those categories. Decisions needed from the business owner (record
them in the matrix):

1. **Provider consultant — Proposal / commercial**: may they see their own cost estimate, the final quote, the deposit?
2. **Associate doctor — Patient identity for the supervisor's other cases**, and whether associates carry their own
   **prices**.
3. **Practice manager — Patient identity** (scheduling), **Proposal / commercial**, **Travel information**, **Case status**
   (at most summary for managed clinicians?).
4. **Consultant assistant — Patient identity**, **Travel information**, **Case status**.
5. **Organization owner — Proposal / commercial** (organization-level summary?), **Case status** (aggregate counts only?),
   **Consultant schedule**, **Prices**.
6. **Provider organization setup breadth** for consultants, associates and assistants (seeded organization-wide
   `provider.view` vs "own setup" summary).

In addition, every ALLOW WHEN ASSIGNED patient/case row needs an executable, assignment-scoped backend read that does
not exist yet (V-3); until approved, a Provider Workspace can show only schedule, prices, credentials and relationship
data that existing reads already scope correctly, and V-11 (how to present self/relationship-scoped capabilities) must
be decided.
