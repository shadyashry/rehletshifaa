# RehletShifaa — Platform UX audit and redesign proposal

Date: 2026-09-23 · Branch: `codex/platform-control-plane` (HEAD `44dd629`) · Author: Claude Code (audit only)

**Revised 2026-09-23 after expert review (UX-0 design freeze).** The original findings below are kept unchanged.
Recommendations that expert review replaced are marked **Superseded after expert review** with a pointer to the
revision (§31). The canonical implementation handoff is [ux-implementation-plan.md](ux-implementation-plan.md).

## Product decisions approved after expert review

These four decisions answer the open questions in the Decision report item 14 and §22 step 1. They are frozen for
UX-1 … UX-8.

**Decision A — Consultant models.** DIRECT and PROVIDER-ORGANIZATION consultants remain separate backend and
business models; they are not merged. Admins get **one `Clinicians` directory**, where each clinician shows the
engagement model (*Direct with RehletShifaa* / *Through a provider organization*) and real operational capability
(*Can receive cases*, *Setup in progress*, credential status, organization). The two models must not look
identical where behaviour differs; a shared clinician page family may carry model-specific sections and actions.
Direct is treated as potentially transitional but is not retired until functional parity and migration criteria
are explicitly proven.

**Decision B — Provider personas.** Provider-side users do not land in the general Control Center. The product
distinguishes a **Workspace** (daily work) from the **Control Center** (configuration/administration). Provider
consultant: My work, My cases, My practice, My schedule, My credentials, prices needing their approval where
existing capability permits. Associate doctor: the same, with supervision context. Practice manager: clinicians
they manage, schedules, setup status, commercial tasks their existing permissions allow, practice staff.
Consultant assistant: only the clinicians and tasks they support. Organization owner: Provider Workspace by
default plus a **Manage organization** entry into scoped Control Center administration where authorized.
Unrelated platform-admin navigation is not exposed because a capability technically exists. Existing
capabilities/scopes only; no authorization-architecture change.

**Decision C — Shadow routing.** A routing command that does not change the live case is never presented as
Assign, Reassign or Transfer. Everyday operations show only authoritative live commands. Shadow functionality lives
only under an Advanced routing/configuration area as **Preview routing recommendation**, with the copy
*"Evaluation only — this will not change the case owner or the person assigned to this work."* `SHADOW` is not a
business-facing label.

**Decision D — Activation dead end.** Case 1 (action not relevant): hide. Case 2 (relevant, waiting for achievable
prerequisites): show disabled with blockers (*"Not ready to activate · Waiting for: Independent credential
review."*). Case 3 (cannot be completed in this release): no permanently disabled primary Activate button; show
the informational status **Activation isn't available yet** — *"Commercial & Legal Acceptance must be completed
before this organization can receive cases. That step isn't available in the current release. You can complete
the remaining setup now. No cases will be routed to this organization until activation becomes available."* All
backend readiness and activation gates stay; Commercial & Legal Acceptance is not bypassed.

Scope: every user-facing screen in the public site's patient flows, the secure portal (patient and staff
personas) and the Control Center. **No code was changed.** No backend architecture change, no Phase 8C work, no
Journey production cutover.

## 0. Method and evidence

- **Code read directly** (not docs alone): all `app/[locale]/portal/**` routes, `Portal.tsx` (workspace, queue,
  finance policies, case administration), `MyCare`, `CurrentAction`, `CoordinatorActions`, `CaseQueue`, all 45
  `platform-control-center/*` components, `lib/portal-role-access.ts`, the public secure-link components
  (`CaseStatusAccess`, `ProposalSign`, `ProfileActivation`, `TrackCaseLanding`, `CaseForm`), the e2e fixtures and
  the relevant backend read models (`ProviderCredentialService.computeReadiness`,
  `ProviderOperationalSetupService.evaluate`, `AccessQueryService.EffectiveAccess`, `IdentityProvisioningPort`).
- **Rendered review (partial):** 19 Control Center / portal screens were rendered against the running tunnel
  frontend (`https://dev.rehletshifaa.com`) with a synthetic OIDC session and mocked GET fixtures — the same
  technique the e2e specs use; every write was refused by the mock. Authentication was not weakened and no real
  record was read. Screenshots are in the session scratchpad (`scratchpad/shots/01…19`), not committed.
- **Limitation:** the live data states (real routing mode, real role assignments, real Keycloak roles) were not
  observed; where a finding depends on a backend state it cites the code path that produces it. Care
  coordination, Journeys and patient pages were reviewed mostly from code plus existing e2e screenshots.
- Prior context: `admin-ux-redesign.md` (the same-day Control Center consolidation). This audit starts from that
  result and deliberately challenges it.

Severity scale: **Critical UX** (users are misled, blocked or act on the wrong thing) · **High** (major confusion,
duplicated authority, wrong-place functionality) · **Medium** (friction, extra clicks, technical wording) ·
**Low** (polish).

---

## Decision report (summary for approval)

Status: **audit only — no UI code changed.** Redesign starts only after approval and the four product decisions
in item 14. Details for every point are in the numbered sections that follow.

> **UX-0 update:** the four product decisions are now approved (see *Product decisions approved after expert
> review* above). Items 7–14 below are the original proposal; where marked **Superseded after expert review**,
> the revision in §31 and [ux-implementation-plan.md](ux-implementation-plan.md) applies.

### 1. Overall UX assessment
- **Patient portal:** strong (Level 0–1). My Care and the secure-link pages need polish only.
- **Staff portal:** good (Level 1–2), with a few features in the wrong place.
- **Control Center:** structurally confusing (Level 2–3). The main problems aren't visual: two parallel consultant
  models are shown to admins instead of being resolved behind one list, screens show engine internals, and some
  actions cannot do what they claim.

### 2. Top 10 problems
1. **Provider people have no home** — provider-invited consultants, associate doctors, practice managers,
   assistants and owners get no sign-in role, so `/portal` shows a red "Your account has no portal role assigned."
2. **Activation is a dead end** — the backend always blocks on commercial/legal acceptance (by design, for now) and
   on an organization profile that has no screen, yet setup ends in "Review & activate" and **Activate
   organization** is an enabled primary button.
3. **Control Center Assign/Reassign may do nothing** — routing defaults to SHADOW, so it records a comparison only;
   people are shown as account IDs; the portal's "Transfer case" is the path that really changes the owner.
4. **Access can't answer "why"** — roles given through Staff & teams (Coordinator, Finance, System admin) are
   invisible in User access / Effective access, and those two pages split one job.
5. **"Direct" vs "provider" consultants** appear as toggles on five screens, each with its own add, credential,
   approval and pricing process.
6. **Onboarding is heavy** — 4 steps, six-plus separate saves in step 2, a manual "activate membership" step, a
   credential Review button inside setup, and a professional-details form that is blank after saving.
7. **Care coordination reads like an engine console** — 7 tabs, IDs everywhere, free-text comma lists, routing
   weights.
8. **Features in the wrong place** — Finance margin/deposit policies are a collapsed section in the portal;
   organization default prices can only be edited from inside a clinician's page.
9. **Overview repeats the sidebar** as 19 cards (~3,000 px tall on a phone), and the public marketing footer
   appears under every admin page.
10. **Buttons shown whether or not they make sense** — Activate organization enabled when not ready; Journey
    Validate/Simulate as both buttons and tabs; some destructive actions confirm and others don't.

### 3. Pages needing full revamp (Level 3)
Consultant onboarding · Care coordination (all 7 tabs) · the "no portal role" landing · presentation of the two
consultant models.

### 4. Pages to merge or retire (Level 4)
| Retire or merge | Where it goes |
|---|---|
| Commercial › Availability | Clinician › Schedule |
| Effective access | Access › People |
| Permissions page | Reference inside the role wizard |
| Portal admin "moved to Control Center" card | Redirect to the Control Center |
| Portal Finance policies | Commercial › Margin & deposit |
| Coordination organization picker | Selector in the page header |
| Consultant "More actions" menu and Readiness tab | Removed (duplicates) |
| Overview card grid | Removed |
| Setup step 4 | Checklist on the clinician page |

### 5. Duplicate functionality found
Consultant setup · credential decisions · prices · availability · practice relationships · membership activation ·
readiness · a person's access · account actions · case reassignment · identity checks · Journey validate/simulate.
§6 names one canonical home for each plus any shortcuts to keep.

### 6. Buttons/actions to remove or contextualize
- **Remove:** Overview grid; consultant "More actions" menu; credential Review button inside setup; Refresh buttons
  in Coordination and Journeys; the admin hand-off card.
- **Show only when valid:** Activate organization (only when ready); Assign in shadow mode (hide or relabel with its
  real effect).
- **Ask only at publish:** the "reason" field for Journey and role changes.
- **Add confirmation:** Retire on prices; "Approve for cases" on direct consultants.

### 7. Major terminology changes
**Partly superseded after expert review** — "Can they…?", "Works with", "Stop using", "Care pathways",
"Coordinator changes" and "Claim review" are replaced; see §31.7.

| Current | Proposed |
|---|---|
| Direct (current case workflow) | Engagement: RehletShifaa direct / Through a provider |
| Practice team | Practice staff |
| Staff & teams | RehletShifaa staff |
| Coordinator teams / Teams & routing | Coordination pools / Coordination setup |
| Assignment queue | Unassigned cases |
| Effective access | Can they…? |
| Scope | Where it applies |
| Relationship | Works with |
| Readiness | Ready to activate |
| Working setup | Ready to work |
| Retire | Stop using |
| Journeys (admin side) | Care pathways |
| Validate / Simulate | Check / Try it |

Full table: §15.

### 8. Consultant onboarding recommendation
**Superseded after expert review** by *Add Consultant* + a persistent, owner-labelled *Consultant Setup*
checklist (§31.3). Original proposal:
**Invite → Professional profile & credentials → Ready to work**, with no step 4. An activation checklist sits at
the top of the clinician page and **Activate** appears only when the backend reports the clinician ready. Membership
confirmation, credential decisions, "works with" links and organization default prices move out of onboarding.
All backend readiness requirements stay. Details: §8.

### 9. Access & Governance recommendation
**Superseded after expert review:** People stays primary, but Roles and Audit remain first-class and authority
sources are separated visually (§31.5). Original proposal:
One **People** page per person with three parts: workspaces (sign-in roles, read-only), platform roles
(give/remove), and "Can they…?". Ask for the reason once, at publish; use the person picker in role simulation;
fold the validity step into review. Details: §10.

### 10. Proposed final navigation
**Superseded after expert review** by the approved IA in §31.1 (Care Journeys separate; Operations; Access &
Governance; provider personas land in a Provider Workspace, not a scoped Control Center). Original proposal:
- **Control Center:** Home · Providers (Organizations, Clinicians, Practice staff) · Reviews (Credentials,
  Identity checks) · Commercial (Price lists, Exchange rates, Margin & deposit) · Care operations (RehletShifaa
  staff, Coordination setup, Care pathways) · Access (People, Roles, Audit).
- **Staff portal:** My work · My cases · Team queue (real Assign/Transfer) → case page.
- **Clinicians:** workspace including prices to approve and their own schedule (existing capabilities).
- **Patients:** unchanged.

Full hierarchy: §19.

### 11. Largest click-path reductions
| Flow | Now | Target |
|---|---|---|
| Onboard a consultant | ~45–60 | ~25–30 |
| Journey publish | ~13–15 | ~9 |
| Give access | ~11 | ~7 |
| Reassign a case | ~7 | ~4 |
| Resolve unassigned work | ~7 | ~4 |
| Change a price | ~10 | ~5 |
| Understand someone's access | ~6 | ~3 |

All 15 flows: §16.

### 12. P0 items before Phase 8C
**Superseded after expert review:** P0 is narrowed to truthfulness, safety and material user error (§31.9).
Original list:
UX-001 (provider landing) · UX-002 (truthful activation) · UX-003 (truthful assignment) · UX-004 (People page) ·
UX-005 (one consultant list) · UX-006 (onboarding) · UX-009 (finance policies) · UX-012 (Home) · UX-014 (admin
layout without public footer) · UX-023 (terminology) · UX-019 and UX-022 (duplicate menus and steps) · UX-032 (one
confirmation pattern). Register: §18.

### 13. Estimated redesign size/risk
**Superseded after expert review:** the 3–5 session estimate is replaced by the UX-1 … UX-8 program, ~10–14
sessions (§31.10–31.11). Original estimate:
Mostly frontend. Four small backend **read** additions: professional-profile values (form not blank after saving);
licence number and issuer on the credential review page; case number on coordination queue items; a person's
sign-in roles. Rough estimate 3–5 focused sessions; medium risk, mainly updating existing unit and e2e tests
(`routes.test`, `ConsultantOnboardingWizard.test`, `AccessGovernance.test`, `CareOperations.test`, e2e `portal-ux`,
`access-governance`).

### 14. Recommended implementation sequence
**Superseded after expert review:** step 1 is done (decisions A–D approved); steps 2–10 are replaced by UX-1 …
UX-8, then Phase 8C, then Phase 8D (§31.10). Original sequence:
1. **Product decisions first:** (a) whether direct and provider consultants stay two long-term models; (b) where
   provider people land (recommended: a scoped Control Center view); (c) how shadow-mode routing is presented;
   (d) wording for the commercial acceptance that isn't live yet.
2. Admin layout and navigation.
3. Truthfulness fixes (activation, assignment, confirmations).
4. Clinician page and onboarding.
5. Access People page.
6. Care coordination.
7. Commercial consolidation.
8. Journeys.
9. Portal polish.
10. Phase 8C.

Details: §22.

---

## 1. Executive summary

The platform is functionally rich and the patient-facing experience is genuinely good: *My Care*, the secure
status link, the proposal page and profile activation all answer "where am I, what do I do now, what happens
next" in plain language with one primary action. The coordinator's case workspace (current-action panel driven by
the backend action contract) is also strong.

The problems concentrate in the **Control Center and the provider side**, and they are not mainly visual. They
come from four structural causes:

1. **Two parallel business models are shown to the user instead of being resolved for them.** "Direct"
   consultants (legacy `/admin/practitioners`, the model that actually drives case assignment today) and
   "provider-organization" clinicians (the new readiness model) each have their own list, add flow, credential
   process, price system and approval screen. The UI asks the admin to understand that split on five screens.
2. **Screens expose engine state rather than business outcomes.** Care coordination shows account UUIDs, case
   UUIDs, routing weights, "Shadow (comparison only)" mode and revision numbers; Journeys show compiler versions and
   artifact hashes; readiness shows ten internal booleans plus seven backend blocker codes.
3. **Several flows cannot reach their stated end, and the UI does not say so.** Provider clinician readiness is
   hard-coded fail-closed on *commercial/legal acceptance* (`ProviderOperationalSetupService.evaluate` always adds
   that blocker, by design per technical-decisions §Phase 2B) and on an *organization profile* that has no edit
   UI — yet the wizard ends in "Review & activate" and the organization page shows an enabled primary
   **Activate organization** button. In SHADOW routing mode, Control Center "Assign/Reassign" records a
   comparison only while the portal's "Take ownership"/"Transfer case" is authoritative.
4. **Authority is split between Keycloak realm roles and platform role assignments, but the governance UI only
   shows one.** Staff invited via *Staff & teams* get realm roles; *User access / Effective access* reads only
   platform assignments, so a working coordinator appears to have "no access". Provider-invited people get no
   realm role at all, so a practice manager or provider consultant signing in lands on a red
   *"Your account has no portal role assigned."*

The consolidation done earlier today (one shell, grouped navigation, names instead of IDs in provider screens) was
the right direction and should be kept. What remains is: **resolve the dual models in the UI, make every action
truthful to its real effect, give every persona a home, and move engine detail behind "Advanced".**

Overall assessment: **patient portal — strong (Level 0–1); staff portal — good with misplaced extras (Level 1–2);
Control Center — structurally confusing in onboarding, access, coordination and commercial (Level 2–3).**

---

## 2. Top 10 UX problems

| # | Problem | Where | Severity |
|---|---|---|---|
| 1 | Provider-side people (provider consultants, associate doctors, practice managers, assistants, owners) have no home: `/portal` shows a red "no portal role" error; the only way forward is a small "Control Center" button above the page title | `Portal.tsx` `roleDenied`, `IdentityProvisioningPort` (no business role sent to Keycloak) | Critical |
| 2 | Provider activation is a dead end presented as achievable: commercial acceptance always blocks; organization profile has no UI; "Activate organization" is an enabled primary button while every row says "Needs action" | Wizard step 4, Consultant › Readiness, Organization › Setup & activation | Critical |
| 3 | Control Center manual Assign/Reassign in SHADOW mode changes nothing real; candidates and owners are listed as account UUIDs; a second, authoritative reassign path lives in the portal (lead "Case administration") | Care coordination › Assignment queue; portal case workspace | Critical |
| 4 | "Who has access and why" is unanswerable for RehletShifaa staff: realm roles (Coordinator, Finance, System admin…) are invisible in User access / Effective access; the answer is split across two pages anyway | Access & governance › User access + Effective access; Staff & teams | Critical |
| 5 | Two consultant models shown everywhere as segmented toggles ("In provider organizations" / "Direct (current case workflow)") with different add, credential, approval and pricing processes | Consultants, Add consultant, Credential reviews, Pricing, Direct consultant detail | High |
| 6 | Consultant onboarding is heavy: 4 milestones, step 2 holds three independent save models, a required audit note on invite, a manual "Activate membership" step, blind re-entry of professional details ("Saved values aren't shown here"), a credential **Review** button inside onboarding, 10 readiness rows + up to 7 blocker cards | `ConsultantOnboardingWizard`, `consultant-setup.tsx` | High |
| 7 | Care coordination is an engine console: 7 tabs (wrapping onto two rows at 1440 px), UUIDs everywhere, comma-separated free-text care areas and languages, routing weights "must sum to 100", precedence rules written for engineers | `CareCoordinationWorkspace` and children | High |
| 8 | Wrong-place functionality: Finance margin/deposit policy editor hidden as a collapsed `<details>` under the Finance queue; organization-default prices editable only from inside a clinician's page; routing preference (a readiness blocker) fixed only in Care coordination; identity checks reachable as both a portal role and a Control Center page | `Portal.tsx FinancePolicies`, `PricingManagement`, readiness `ROUTING_INCOMPLETE` link | High |
| 9 | Overview duplicates the sidebar (19 "What do you want to manage?" cards — ~3,000 px tall on a phone) and the Control Center carries the public marketing footer | `ControlCenterOverview`, root layout | Medium-High |
| 10 | Actions shown regardless of scenario or with equal weight: enabled Activate organization when not ready; disabled Activate consultant as the page's biggest control; Journey Designer header Save/Validate/Simulate **and** Validation/Simulation tabs; publish panel shows Submit/Return/Publish/Retire together; "More actions" menu on the consultant page that only switches tabs; Retire price and "Approve for cases" without confirmation while their siblings confirm | Many — see §7 | High |

---

## 3. Screen / route inventory

Legend for the flags column: **N** necessary · **D** duplicated · **M** misplaced · **O** overloaded · **U**
underused · **T** technically worded · **C** too click-heavy.

### 3.1 Public patient flows (anonymous / secure link)

| Route | Screen | Persona | Primary action | Secondary | Gate | Flags |
|---|---|---|---|---|---|---|
| `/send-my-case` | Case submission wizard (3 steps: patient & contact · case & documents · review & consent) | Patient / representative | Send my case | Sign in to reuse saved details; travel package | public | N |
| `/track-case` | Track case landing | Patient without account | Send my secure tracking link (Case ID + WhatsApp) | Continue with saved link; sign in | public | N |
| `/status/[token]` | Secure case status (+ OTP, requested-information form, proposal card) | Patient | Verify → respond to current request / Review proposal | — | token + OTP | N |
| `/proposal/[token]` | Proposal / estimate / final quote review + acknowledgement | Patient | Acknowledge & continue (with consents) | Request changes, Decline (under "More options") | token + OTP | N |
| `/activate/[token]` | Profile completion + account setup link | Patient | Continue / Resend setup link | Use another email | token + OTP | N |

### 3.2 Secure portal `/portal` (one route, persona decided by realm role)

| Screen (state) | Persona | Primary action | Secondary | Gate | Flags |
|---|---|---|---|---|---|
| Signed-out landing | Everyone | Sign in securely | Language, secure-link tracking | — | N |
| **No role** — "Your account has no portal role assigned." | Provider members, platform-only roles | *(none)* | "Control Center" button above the title | no realm role | **M, T** (Critical) |
| Role switcher (button row) | Multi-role staff | switch role | — | ≥2 realm roles | O |
| **My Care** — Care / Documents / Messages views | Patient | the one backend current action (Review proposal, Reply, Verify identity) | Message coordinator; other cases | PATIENT(_REPRESENTATIVE) | N (strong) |
| Proposal drawer | Patient | Accept / request changes / decline | — | patient | N |
| Account settings dialog | All | Save preferences | Sign out | signed in | N |
| Staff dashboard — KPI strip + tabs *My work · My cases · Team queue* | Coordinator, Consultant, Operations, Finance | Open the next work item | filters, bulk Take ownership / Request info | realm role | N (Team queue lead-only) |
| Case workspace — header, Current action panel, tabs Overview · Clinical · Documents · Activity, aside Journey pulse + Case team | Coordinator, Consultant, Operations, Finance | The backend current action | Messages drawer, More drawer, full-journey dialog | per-case contract | N (strong) |
| Consultant clinical review panel (in Clinical tab) | Consultant (legacy DOCTOR) | Save / submit recommendation with cost estimates | documents | doctor + `CONSULTANT_REVIEW` | N |
| Proposal panel / send form / final-quote actions / deposit card / delivery card | Coordinator, Finance, Operations | Prepare & release proposal; record payment | resend link | contract | O (many cards in one panel) |
| "More actions" drawer | Coordinator (owner) | Request info, record response, resend links, travel package, move back, cancel | Case administration | contract | N |
| Case administration drawer (transfer coordinator) | Coordinator lead | Transfer case | — | COORDINATOR_LEAD | **D** with CC Assignment queue |
| **Financial policies** `<details>` under Finance queue | Finance lead / System admin | Save new margin / deposit version | — | FINANCE_LEAD, SYSTEM_ADMIN | **M, U** |
| Admin role "Administration has moved" hand-off card | Credentialing admin, System admin, Auditor | Open the Control Center | 4 shortcut cards | admin realm roles | **D** (dead-end page) |
| Identity role queue | Identity reviewer | Decide identity check | — | PATIENT_IDENTITY_REVIEWER | **D** with CC Identity checks |
| Notification bell | Staff | Open case | — | staff | N |

### 3.3 Control Center `/portal/control-center/**`

| Route | Screen / tabs | Persona | Primary action | Gate | Flags |
|---|---|---|---|---|---|
| `/` | Overview — attention counts + 19 destination cards | All admins | Add consultant | any area | **D** (grid = sidebar), O |
| `/providers` | Organizations list (+ Add organization dialog) | Provider ops | Add organization | `provider.view` / `provider.create` | N; dialog T (ISO codes, IANA zone) |
| `/providers/:id` `?tab=overview\|people\|setup` | Organization detail | Provider ops | Add consultant; Add practice team member | `provider.view` | O; Setup tab **Critical** (dead-end activation) |
| `/providers/consultants` (`?view=direct`) | Consultants list with model toggle | Provider ops, admin | Add consultant | `provider.view` ∨ legacy admin | **D, T** |
| `/providers/onboarding/new` (`?org=`) | Add consultant (step 1) with "Where will this consultant work?" | Provider ops | Send invitation & continue | `provider.clinician.invite` ∨ legacy manage | O, T |
| `/providers/consultants/:org/:pid/setup?step=` | Setup wizard steps 1–4 | Provider ops | Continue | provider caps | **O, C** |
| `/providers/consultants/:org/:pid?tab=` | Consultant workspace: Overview · Credentials · Practice relationships · Pricing · Availability · Readiness | Provider ops | Continue setup (if not active) | provider caps | **D** (wizard vs tabs), O |
| `/providers/consultants/direct/:id?tab=` | Direct consultant: Overview · Case approval · Price list · Account access | Legacy admin | Record credential / Approve for cases | legacy admin | **D, T** |
| `/providers/practice-team` | Practice team (managers, assistants, owners across orgs) | Provider ops | Add team member | `provider.view` | N; naming clash |
| `/credentials` (`?org=`, `?view=direct`) | Credential reviews queue + "Direct consultant approvals" toggle | Credential reviewer | Review | `credential.review` ∨ legacy admin | **D** (two queues) |
| `/credentials/:org/:rev` | Credential review | Credential reviewer | Start review → Verify | `credential.view` + per-decision caps | N; missing licence facts |
| `/commercial` → `/commercial/pricing` `?view=provider\|direct\|templates\|rates` | Pricing hub (4 views) | Commercial admin | New price (after picking org + clinician) | `price_list.view` ∨ legacy admin | **O, D, C** |
| `/commercial/availability` | Availability hub (picker + same editor) | Provider ops | Add weekly hours | `availability.view` | **D** (retire) |
| `/team` | Staff & teams (Care coordination · Operations · Finance tabs) | System admin | Invite staff member | legacy admin | N; "teams" clash |
| `/identity-checks` | Identity checks queue | Identity reviewer | Decide | legacy identity role | **D** |
| `/coordination` | Care coordination org picker (cards) | Coordination manager | pick org | any `assignment.*` view | **C** (extra hop) |
| `/coordination/:org?tab=` | Overview · Coordinator teams · Routing preferences · Routing policy · Routing simulation · Assignment queue · Assignment history | Coordination manager | varies | per-tab caps | **O, T, D** (Critical in queue) |
| `/journeys` | Journey list | Journey manager | New journey | `journey.view` | N; Refresh button |
| `/journeys/:def` | Versions (current published/draft cards, list, clone, runtime status, history) | Journey manager | Clone into new draft / Open designer | `journey.view` | T (deploy, hash) |
| `/journeys/:def/versions/:v?tab=designer\|validation\|simulation\|diff\|publish` | Journey Designer | Journey manager / approver | Save draft | `journey.*` | **O, D** (header buttons vs tabs) |
| `/access/users` | User access (person picker → current access → Give access 4-step) | Access admin | Give access | `access.role.view` + `access.effective_access.view` | **D** with Effective |
| `/access/effective` | Effective access (same person picker → decisions + why) | Access admin | — | same | **D** (merge) |
| `/access/roles` | Roles list → detail → 5-step wizard | Access admin | New role / Edit | `access.role.*` | O, T |
| `/access/permissions` | Permission catalogue | Access admin | — | `access.role.view` | U (reference only) |
| `/access/audit` | Access audit | Auditor | Load more | `access.audit.view` | N |
| Legacy redirects (`/portal/access`, `/portal/journeys/**`, `/providers/:id/{consultants,associate-doctors,practice-managers,assistants}`, `/providers/:id/clinicians/:pid/{pricing,availability}`, `/access`, `/commercial`) | — | — | — | — | keep as redirects only |

Important dialogs/drawers: Create organization, Invite person (practice team), Relationship dialog, Give access
wizard, Revoke access inline form, Manual assignment dialog, Credential submit form, Role wizard, Clone version,
Case drawers (Messages, More, Proposal, Case administration), Request information, Decline assignment, Record
patient response, Full journey.

---

## 4. Persona findings

| Persona | Frequent needs | Occasional | Should never see | Ideal home | Today's reality |
|---|---|---|---|---|---|
| **Platform administrator** (SYSTEM_ADMIN) | What is waiting; staff accounts; who can do what | Org creation, FX, templates | Routing weights, compiler hashes, account UUIDs | Control Center › Home (attention only) | 19-card launcher; must understand two consultant models and two access systems |
| **Access administrator** | Give/remove a person's access; answer "why can/can't they" | Create/publish a role | Role versions, actor type, channel, scope keys | Access › People | Two pages for one person; realm roles invisible; raw subject needed for simulation |
| **Provider operations manager** | Add consultant, finish setup, see what blocks activation | Org creation, practice staff | Blocker codes, membership revisions, commercial-acceptance engine facts | Providers › Clinicians (setup-status filter) | Wizard + workspace duplicate; activation cannot complete; must jump to Care coordination for routing |
| **Credential reviewer** | Oldest pending credential → decide | Suspend/restore | Onboarding forms, pricing | Reviews › Credentials | Two queues (provider vs direct); licence number/issuer not shown; extra "Start review" click |
| **Care coordination manager** | Unassigned work, rebalance load, team capacity | Routing rules, preferences | Engine precedence, shadow mode, revisions, UUIDs | Portal Team queue (work) + CC Coordination setup (config) | Everything in one 7-tab engine console; people shown as UUIDs; Assign may be a no-op |
| **Coordinator** | My work, my cases, current action | Transfer (lead), request info | Control Center | Portal › My work | Good. Minor: role switcher, "More" drawer depth |
| **Consultant — legacy DOCTOR** | Accept/decline assignment, clinical review | Final assessment | Admin screens | Portal › My work | Good ("Consultant workspace") |
| **Consultant — provider organization** | Same as above + approve own prices, manage own availability | Credentials renewal | Other clinicians' data | Portal (clinician workspace) | **No portal role → red error.** Price approval ("only the clinician can approve") exists only inside the admin Pricing screen |
| **Associate doctor** | Same as provider consultant, under supervision | — | — | Portal | Same dead end |
| **Practice manager** | The consultants they manage: schedule, prices, setup status | Add assistant | Governance, coordination engine | Providers scoped to "my consultants" | Red error in portal; Control Center shows full admin IA filtered only by capability |
| **Consultant assistant** | Schedule for their consultant | — | Everything else | Scoped schedule view | Same dead end |
| **Patient / representative** | Current step, what to do, who helps, messages | Documents, other cases, settings | Staff vocabulary, version numbers | My Care | Strong; minor leaks (proposal "Version N", duplicated phase indicator) |

Finding: the **persona model is organised by backend authority system**, not by job. Realm-role personas get the
portal; capability personas get the Control Center; provider personas fall between them.

---

## 5. Navigation / IA findings

1. **Three entry points to administration** still exist: portal "Control Center" button (rendered *above* the
   portal `h1`, `app/[locale]/portal/page.tsx`), the admin-role hand-off card (`AdminHandoff`), and the
   Overview destination grid. One is enough: users whose only roles are administrative should be redirected to the
   Control Center; mixed users get a persistent link in the account menu/header.
2. **Sidebar has 16 leaves in 7 groups**, several groups with a single item ("Credentials", "Care coordination",
   "Journeys"). Single-item groups add a heading per item without aiding scanning. Target: 5 groups (§19).
3. **Group names do not match their content.** "Commercial setup › Availability" (availability is not
   commercial); "Care operations team" vs "Care coordination" (both about coordinators, different objects);
   "Practice team" vs "Staff & teams" vs "Coordinator teams" (three "team" concepts).
4. **Coordination requires an org-picker hop** even when the caller manages one organization; tab state lives in
   `?tab=` under an org route — the queue, which is daily work, is four levels deep.
5. **The Overview is a launcher, not a home.** Attention counts are good (real reads) but compete with 19 equal
   cards that repeat the sidebar. On a 390 px phone the page is ~3,000 px tall.
6. **Public site chrome inside the Control Center.** The marketing footer (Care Areas, Consultants, legal) renders
   under every admin page; the header carries the public logo only. Admin workspaces should use an app shell.
7. **Deep routes that should be one detail page:** `/providers/consultants/:org/:pid` and `…/setup?step=` are two
   containers for the same components; `/providers/consultants/direct/:id` is a third container for the same
   business object (a consultant).
8. **Inconsistent route naming:** `/providers/onboarding/new` adds a *consultant*; `/team` is staff;
   `/commercial/pricing?view=rates` is exchange rates; `/access/effective` vs `/access/users` are the same person.

---

## 6. Duplicate functionality — canonical location decisions

| Concept | Where it exists today | Canonical location | Keep as shortcut |
|---|---|---|---|
| Consultant details / setup | Wizard (`/setup`), Consultant workspace tabs, Direct consultant detail, Organization › People row menu | **Clinician page** (one page per clinician, both models) with a setup checklist at the top while not active | Organization › People → link to clinician page |
| Credential submission (provider) | Wizard step 2, Workspace › Credentials | Clinician page › Credentials | — |
| Credential decision | Credential review page; **Review** buttons inside onboarding (wizard step 2, workspace) | **Reviews › Credentials** | Clinician page shows status + "Open review" link only for reviewers, never inside setup steps |
| Direct consultant approval | Direct consultant › Case approval; Credential reviews › Direct toggle | Same review queue as provider credentials (typed row "Case approval") → decision page | — |
| Provider prices | Wizard step 3, Workspace › Pricing, Commercial › Pricing (org + clinician picker) | Clinician page › Prices (overrides); **Organization page › Prices** (organization defaults) | Commercial › Price lists = cross-clinician read view with links |
| Direct consultant price list | Direct detail › Price list, Commercial › Pricing › Direct | Clinician page › Prices (direct clinicians) | — |
| Care-area templates, exchange rates | Commercial › Pricing views | Commercial › Templates, Commercial › Exchange rates | — |
| Margin & deposit policy | Portal Finance `<details>` | **Commercial › Margin & deposit policies** | — |
| Availability | Wizard step 3, Workspace › Availability, Commercial › Availability hub | Clinician page › Schedule | Retire the hub |
| Practice relationships | Wizard step 2, Workspace › Practice relationships, Organization › People row menu + dialog, Practice team row menu | Clinician page › Practice team (who manages/assists/supervises) | Practice staff row menu → same dialog |
| Membership activation | Wizard step 1 panel, Workspace overview button, People row menu, Practice team row menu | Organization › People (row) + Home attention item | — |
| Readiness / activation | Wizard step 4, Workspace › Readiness, Organization › Setup (aggregate) | Clinician page header checklist; Organization page › Setup | — |
| Person's access | User access, Effective access | **Access › People** (one person page) | — |
| Staff account actions (resend/disable) | Staff & teams row menu, Direct consultant row menu + Account access tab | Person page (Access › People) for all accounts; list row menus stay | — |
| Coordinator ownership change | Portal lead "Case administration" (authoritative in SHADOW), CC Assignment queue (shadow no-op unless LIVE) | **Portal** case workspace (Transfer) for daily work; CC queue only for routing-engine queue items and only when the action is real | — |
| Identity checks | Portal identity role view, CC Identity checks | Reviews › Identity checks | portal identity-only users redirect there |
| Routing preference | Care coordination › Routing preferences; demanded by consultant readiness | Coordination setup › Preferences | Clinician page shows current routing and links there |
| Validate / simulate a Journey | Designer header buttons **and** Validation / Simulation tabs | Publish checklist panel (Validate → Simulate → Submit → Publish) | — |

---

## 7. Unnecessary controls / buttons (control audit)

Classification: KEEP · MOVE · MERGE · CONTEXTUAL · ADVANCED (hide under Advanced) · REMOVE (with proof).

| Screen | Control | Decision | Reason |
|---|---|---|---|
| Portal page | "Control Center" button above `h1` | MOVE | Put in header/account menu for mixed users; redirect admin-only users |
| Portal admin role | "Administration has moved…" card + 4 cards | REMOVE | Duplicates Control Center; admin-only users should land there directly (the card exists only as a hand-off) |
| Portal role switcher | Button row | MOVE | Account menu "Switch workspace"; row of equal primary/secondary buttons competes with the page |
| Portal Finance | "Financial policies" `<details>` | MOVE | To Commercial › Margin & deposit policies |
| Portal case | Header icon "Case administration" (when not owner) | MERGE | Same drawer as More › Case administration; keep one trigger (More) |
| Portal case | Proposal "Version N" to patients (My Care proposal card) | REMOVE for patient | Internal versioning; patients see "Updated proposal" when it changes |
| My Care | Phase badge in header + journey stepper | MERGE | Same fact twice; keep the stepper, drop the badge (or vice versa on mobile) |
| My Care | Reserved `PAY_DEPOSIT` button with no handler | REMOVE until online payment exists | A primary button that does nothing if the code ever resolves |
| CC Overview | 19 destination cards | REMOVE | Exact duplicate of sidebar (same `NAV_GROUPS` source) |
| CC Overview | "Add consultant" header CTA | CONTEXTUAL | Only for users whose job is provider setup; not for access/journey admins |
| Consultants list | Segmented "In provider organizations / Direct" | MERGE | One list with a "How they work with us" column + filter |
| Consultants list | Row menu Open/Credentials/Pricing/Availability | REMOVE (keep Open via name link) | Deep links to tabs the name link already opens; adds a menu per row |
| Consultants list | "Continue setup" per row | KEEP (contextual) | Correct: shown only when not active |
| Add consultant | "Where will this consultant work?" radio | CONTEXTUAL → decision | Only while both models exist; reword as the engagement type (§8) |
| Add consultant | "Note for the audit trail" (required) | ADVANCED (prefilled) | Backend needs a reason; default is already supplied — hide it |
| Setup step 1 | "Activate organization membership" | MOVE | To Organization › People and Home attention; it is not the onboarder's job in the middle of a wizard |
| Setup step 2 | Credential "Review" button | REMOVE from setup | Reviewing is a separate, independent job (self/submitter review is blocked anyway) |
| Setup step 3 | Link "Open Care coordination to set routing" | MOVE | Show routing preference inline (read) with a deep link to the exact editor, not the org picker |
| Setup step 4 | "Activate consultant" disabled button | CONTEXTUAL | Hide until ready; show the checklist and a single sentence instead |
| Consultant workspace | "More actions" menu (Edit professional details, Add credential, Update pricing, Manage availability, Open organization) | REMOVE (keep "Open organization" as breadcrumb/fact link) | Every item switches to an existing tab |
| Consultant workspace | Readiness tab | MERGE | Into the header checklist on Overview |
| Organization › Setup | "Activate organization" enabled while not ready | CONTEXTUAL (refined by Decision D) | Case 2: disabled with blockers; case 3 (commercial acceptance unavailable): informational status, no primary button |
| Organization › Setup | "Organization owner: Needs action" with no action | ADD CONTEXTUAL link | Link to People with the owner row highlighted (no new function) |
| Org header | "Add consultant" + "Add practice team member" | KEEP (primary + secondary) | Correct hierarchy |
| Add practice team member | Role "Organization owner" in a "practice team" dialog | MOVE | Owner is a governance role of the organization, not practice staff; rename dialog "Add person" |
| Credential review | "Start review" → then Verify | KEEP; relabel **superseded after expert review** → "Start review" / "Assign review to me" ("Claim" reads as insurance) | State transition is real; clarify its purpose |
| Credential review | Technical details disclosure | KEEP (Advanced) | Correct |
| Direct approval | "Approve for cases" (no confirm) vs "Reject…" (confirm) | CONTEXTUAL | Add the same confirm used for provider activation |
| Pricing | Retire (no confirm) | CONTEXTUAL | Confirm with effect sentence ("patients quoted after today will not see this price") |
| Pricing | Full version history inline with equal weight | ADVANCED | Show live price + draft; history under "Earlier versions" |
| Pricing | Free-text "Service code" | CONTEXTUAL | Pick from the care-area template / existing codes (data already loaded for direct lists) |
| Staff & teams | "Reports to" select inline on every row | KEEP | Efficient; fine |
| Coordination (all tabs) | Header "Refresh" | REMOVE | Reads refresh after actions elsewhere; Refresh was removed from other CC headers today |
| Coordination › Queue | "Look up a case (Case ID)" | ADVANCED | Engineering lookup; daily work comes from the list |
| Coordination › Queue | "Assign" in SHADOW mode | CONTEXTUAL → **Superseded after expert review (Decision C)** | Remove from everyday UI; only under Coordination Setup › Advanced as "Preview routing recommendation" (§31.6) |
| Coordination › Policy | "Show raw configuration" | ADVANCED | Already hidden-ish; move with weights under Advanced |
| Coordination › Simulation | whole tab | ADVANCED | Diagnostic; not a daily coordinator task |
| Journey list/versions/designer | "Refresh" | REMOVE | Same rationale |
| Journey versions | "Deploy", runtime status, compiler version, artifact hash | ADVANCED | Engine deployment detail |
| Journey designer header | Save draft · Validate · Simulate | MERGE | Save stays; Validate/Simulate move into the publish checklist (already tabs) |
| Journey publish panel | Submit · Return to draft · Publish · Retire together | CONTEXTUAL | Show only the transition valid for the current status and the viewer's capability; Retire separated as destructive |
| Journey / Role editors | "Governance reason" required before Save/Validate | MOVE | Ask once, at Submit/Publish; drafts should save freely |
| Access › Roles wizard | Single "Reason" field required on every step | MOVE | Same — ask at publish |
| Access › Roles wizard | "Try the role on a person" with raw account identifier | CONTEXTUAL | Use the same person picker as User access |
| Access › Give access | Step "Validity" | MERGE | Into Review as optional "Ends on" |
| Access › Give access | "Specific resource" type/identifier free text | ADVANCED | Engineering scope |
| Access › User access | "Why do they have this access?" link to another page | MERGE | Same page (§10) |

No accepted function is removed: every REMOVE above is either a duplicate path to the same function, a menu that
only navigates to an existing tab, or a hand-off page.

---

## 8. Consultant onboarding — deep review

### 8.1 What happens today (provider-organization consultant)

1. **Add consultant** — route choice (provider/direct), organization, clinician type, name, email, invitation
   language, *required* audit note → **Send invitation & continue**. If the identity operation is pending, a
   "Finish account setup" retry appears.
2. **Consultant details** — facts + a manual **Activate organization membership** (membership starts PENDING).
3. **Professional setup** — (a) professional details form (registration no., licensing country as a 2-letter
   code, speciality, sub-speciality, qualifications) with its own Save; the backend has no read of these fields, so
   on return the form is blank and says *"Saved values aren't shown here; what you enter replaces them"*;
   (b) one row per required credential, each with its own Add → inline form (issuer, reference, issue date,
   expiry, file) → upload → scan → submit; (c) practice relationships with Assign buttons per relationship type.
4. **Working setup** — nested Pricing / Availability tabs inside the wizard step, each a full editor (new price
   form: 9 fields; weekly slots one at a time), plus a link to Care coordination for routing.
5. **Review & activate** — 10 readiness rows in 4 groups + blocker cards + Activate button.

Rendered observations (screens 04, 05): step 2 shows **six independent save/add buttons** plus Continue; step 4
shows **7 "Needs action" blocker cards**, three of which the onboarder cannot resolve from anywhere in onboarding
(organization profile — no UI anywhere; routing — another area; commercial acceptance — always fails today).

### 8.2 Diagnosis

- **Onboarding mixes four different jobs**: inviting a person (admin), completing a professional profile (could be
  the clinician), independent credential verification (reviewer), and commercial/operational configuration
  (commercial admin). A single "wizard" that spans all four makes one person appear responsible for everything.
- **The wizard and the consultant workspace render the same components in two containers.** Users meet
  "Continue setup" (wizard) and tabs (workspace) with no clear rule for which to use.
- **Blocker vocabulary is engine vocabulary** ("Routing preference or supported platform default is missing",
  "Operational setup is not yet available") and is shown twice (label + backend message).
- **No truthful end state.** The last step promises activation the backend will refuse.

### 8.3 Recommendation — "Invite → Profile & credentials → Ready to work" plus a checklist page

> **Superseded after expert review.** One person-owned sequential flow still hides that onboarding spans several
> owners (Provider Operations, Credential Review Team, Commercial, Coordination). Replaced by *Add Consultant* →
> persistent *Consultant Setup* with six owner-labelled sections (§31.3). The diagnosis in §8.2 and the "moved out
> of onboarding" list below still stand.

Keep backend readiness exactly as is. Change the shape:

| Step | Objective | Fields / actions | Done when (backend) | Save & continue later |
|---|---|---|---|---|
| **1 Invite** (one screen) | Create the person and send the invitation | Engagement type (only while two models exist), organization (auto if one), clinician type, full name, work email, language. Audit reason prefilled and under Advanced. | `identityProvisioned` | n/a — single submit |
| **2 Professional profile & credentials** | Everything an independent reviewer will check | Professional details (licensing country as a country picker; values shown after save once a read exists — see UX-021), required credentials as a checklist with one "Upload" each; supervising consultant (associate doctors only) | `clinicianProfileComplete && requiredCredentialsSubmitted && requiredRelationshipsComplete` | Yes — every item saves on its own; step shows "3 of 4 done" |
| **3 Ready to work** | What the clinician needs to receive cases | Prices: confirm the organization default applies, or add an override (single "Use organization prices" default); Weekly schedule: preset week editor (e.g. Sun–Thu 09:00–17:00 then adjust). Routing preference shown read-only with deep link. | pricing/availability complete where required | Yes |

Then **no step 4**: the clinician page header always shows a compact **activation checklist** ("Waiting on:
credential review by an independent reviewer · commercial acceptance — not available yet in this release")
with **Activate** appearing only when `readyForActivation` is true.

Moved out of onboarding:

- Membership activation → Organization › People row + Home attention item ("2 people waiting to join").
- Credential decisions → Reviews › Credentials (never inside setup).
- Practice manager / assistant links → Clinician page › Practice team (optional, after activation).
- Organization default prices → Organization page › Prices (done once per organization, not per clinician).

Direct consultants (legacy model), until the product decides to retire one model: same Invite screen with
engagement "Directly with RehletShifaa"; the clinician page shows **Case approval** (record credential +
decision) in place of steps 2–3 and **Price list** in place of Prices. One list, one page family, one add flow.

### 8.4 Decision needed from product

> **Resolved after expert review — Decision A:** both models stay; one Clinicians directory with an engagement
> column; Direct possibly transitional, not retired without proven parity.

Whether "direct" and "provider" consultants remain two long-term engagement types, or direct is a transitional
state to be migrated. The UI recommendation above works for both, but naming should follow the decision
("Engagement: RehletShifaa direct / Through a provider organization").

---

## 9. Administration / Control Center findings

- **Five-second test fails.** A new admin sees 16 sidebar items, 19 cards and 6 attention tiles. Target: ≤6
  attention items, 5 sidebar groups, no card grid.
- **Attention counts are good but expensive and partial:** they fan out per organization (N+1 reads, 25-org cap
  for memberships); OK for now, flag for a summary endpoint later (P3).
- **Organization page** is the right idea (Overview · People · Setup) but *Overview* is a bare fact list
  (organization profile is not editable — `PUT /admin/providers/{id}` has no UI), and *Setup* offers an enabled
  Activate button that the backend will refuse.
- **Staff & teams** is clear and efficient; rename to **RehletShifaa staff** to separate it from provider
  "practice staff" and from routing "coordinator teams".
- **Identity checks** duplicates the portal identity role view with the same component — fine to keep one route
  (CC) and redirect identity-only users.
- **Visual:** public footer below every admin page; card-in-card-in-section stacking on Overview/Setup; three CSS
  systems (`cc-*`, `ag-*`, journey CSS) plus Tailwind in the portal.

## 10. Access & Governance findings

Can a business admin answer the four questions?

| Question | Today | Why it fails |
|---|---|---|
| Who has access? | Only by searching one person at a time; no "people with role X" view | `/effective-access` is per person; roles list has no assignee count (no endpoint — debt acknowledged) |
| What can this person do? | User access shows platform role assignments; Effective access shows decisions | **Realm roles (COORDINATOR, FINANCE, SYSTEM_ADMIN, DOCTOR…) are absent** — staff look like they have "no access" |
| Why? | Effective access › per-permission "Why can they?" disclosure | Separate page; reason text from backend is good |
| How do I change it? | Give access 4-step wizard on User access; staff roles changed only by re-inviting in Staff & teams (there is no role change for realm roles) | Two systems, no pointer between them |

Recommendation — **people and tasks first**:

> **Partly superseded after expert review:** keep People as the primary page, but Roles and Audit remain
> first-class; "Can they…?" becomes *Access summary* (with *Can this person…?* inside); realm roles and platform
> assignments are shown in separate, source-labelled blocks; the permission catalogue stays as an advanced
> reference (§31.5).

- **Access › People**: one page per person with three blocks — *Accounts & workspaces* (portal workspace from the
  realm role, e.g. "Coordinator — RehletShifaa staff", read-only with a link to Staff), *Roles* (platform
  assignments with Give/Remove), *Can they…?* (search an action → allowed/denied + reason). This merges User
  access and Effective access. Needs one read: the person's realm roles (Small backend read, or join client-side
  from `/admin/staff-teams` for staff).
- **Roles**: list shows plain-language purpose; detail shows "What this role allows" (already good); versions,
  actor type, channel under Advanced (already); wizard keeps 5 steps but asks for the reason once at publish;
  simulation uses the person picker.
- **Permissions** becomes a reference drawer inside the role wizard's step 2 (remove as a sidebar item).
- **Audit** stays, moved under "Advanced" in the group (auditor persona still gets a direct link via Home).
- Terminology: "Effective access" → "Can they…?"; "Scope" → "Where it applies"; "Relationship" (in role grants)
  → "Only for clinicians they manage/assist".

## 11. Provider / Credential findings

> **Refined after expert review:** "Works with" is replaced by *Professional relationships* (Manages · Assists ·
> Supervises); credentialing is treated as an ongoing lifecycle, not only an onboarding activity (§31.4).

- Users cannot tell **Organization vs Consultant vs Practice team vs Staff account vs Relationship** apart because
  the words overlap: "Practice team" (provider managers/assistants/owners), "Staff & teams" (RehletShifaa
  employees), "Coordinator teams" (routing pools), "Care team"/"Case team" (people on a case). Proposed naming:
  *Organization* · *Clinicians* (consultants, associate doctors) · *Practice staff* (practice managers,
  assistants) · *Organization owner* (a separate governance role) · *RehletShifaa staff* · *Coordination pools*
  (routing) · *Case team*. "Relationship" → **"Works with"** (manages / assists / supervises).
- **Credentialing currently feels like onboarding** (it is embedded in the setup wizard with a Review button).
  It must feel like an **operational review function**: its own queue, oldest first, one decision page, with the
  submitting admin never seeing reviewer controls in setup.
- Queue: good filters; merge the direct-approval toggle into typed rows; add "Expires in 30 days" when a
  cross-org read exists (P3).
- Review page: shows type, clinician, organization, submitted/expires and "Document 1…". It **does not show the
  licence/reference number or issuer** the reviewer must verify (`RevisionView` does not return them) — the
  reviewer must open each PDF. Small backend read addition; high value.
- No decision history on the review page (previous revisions' outcomes and reasons). P2.

## 12. Care Coordination findings

- **Case owner vs WorkItem assignee vs routing preference** are not distinguished in the UI. The manual
  assignment dialog shows "Current coordinator (WorkItem)" as a UUID, a "Mode: Shadow (comparison only)", and
  "Revision". In SHADOW (the default, technical-decisions §Phase 3) the command records a recommendation only;
  the portal's Take ownership / lead Transfer is authoritative. This is the most misleading action in the product.
- **People are UUIDs**: team members, capacity rows, queue candidates, audit previous/selected owner; the "add
  member" and "capacity" forms require typing an account subject. Staff names are available
  (`/admin/staff-teams`, `/coordinator/staff`), so a picker needs no new backend.
- **Cases are UUIDs** in the queue and lookup; the case number exists on the case (small read to include it).
- **Engine detail as primary content**: precedence list ("Deterministic routing precedence, engineering-configured
  and versioned"), weights that must sum to 100, simulation with scores/factors.
- *Refined after expert review (Decision C, §31.6): shadow commands are never labelled Assign/Reassign/Transfer;
  they appear only under Coordination Setup › Advanced as "Preview routing recommendation".*
- Recommendation: split into **(a) Unassigned work** — for the coordination lead, in the portal Team queue
  (names, case numbers, one "Assign to…" that uses the authoritative path) — and **(b) Coordination setup** in the
  Control Center: *Pools & people* (teams + capacity merged per person: "Sara — Cardiology desk — 8/12 cases — on
  duty"), *Clinician preferences*, and *Rules* (policy) with weights/simulation/history under Advanced.
- Remove the org-picker hop: default to the caller's organization; organization selector in the page header.
- The Overview tab's "no organization-wide decision feed" sentence is an engineering note shown to users —
  remove.

## 13. Journey findings

*Terminology note after expert review: "Care pathways" is withdrawn — it implies a formal clinical protocol,
while this engine models operational patient coordination. Keep "Care Journeys" (§31.7).*

Everyday management vs advanced governance:

| Everyday | Advanced |
|---|---|
| List of journeys with "Live version" and "Draft in progress" | Runtime deployment status, compiler version, artifact hash, Deploy |
| Open draft → Designer (list mode default on small screens) | Stage keys, immutable technical keys, actor types |
| Publish checklist: Check → Try it (simulate) → Send for approval → Publish | Version diff, history |

Issues: Validate/Simulate duplicated (header buttons and tabs); "Governance reason" gate before any save;
publish panel shows all transitions; "Published versions are immutable. Clone this version to make changes." is
good copy but "Clone into a new draft" asks for a reason in a separate form — make it "Edit a copy". The
published version should render read-only with a single **Edit a copy** CTA (already partly true).

## 14. Patient portal findings

Strong. Keep the model (one current step, one primary action, "what happens next", coordinator card, deposit
facts). Fix:

- Proposal card shows "Version N" (technical) — replace with "Updated on …" when N>1.
- Phase badge in the header duplicates the stepper.
- Documents view lists files but offers no open/download for the patient (staff can). Decide: allow view or
  explain ("Your coordinator has these documents").
- `PROVIDE_INFORMATION` sends the patient to Messages, while the secure status link has a structured
  "requested information" form with uploads. Two different ways to answer the same request; align My Care to the
  structured form (component exists in `CaseStatusAccess`).
- Sign-in page copy explains account creation timing in one long sentence — split into two lines.
- `/track-case` requires Case ID + WhatsApp; acceptable (safety), keep.
- Dead code: `PatientStatusCard` / `PATIENT_JOURNEY` in `Portal.tsx` are unused.

## 15. Terminology changes

> **Partly superseded after expert review.** Rows for Effective access, Relationship, Retire, Journey, Assignment
> history and Start review are replaced by §31.7; the rest stand.

| Current term | Problem | Recommended | Reason |
|---|---|---|---|
| Control Center | Fine | **Control Center** (keep) | One name, already adopted |
| Administration (portal role label "Control Center"; hand-off card) | Duplicate entry | — (remove card) | One place |
| Direct (current case workflow) / In provider organizations | Engineering history in a label | **Engagement: RehletShifaa direct · Through a provider** | Business relationship, not workflow version |
| Consultant workspace (portal doctor role label) | "Workspace" for a role name | **Clinical work** or **My cases** | Describes the job |
| Practice team | Clashes with Staff & teams, Care team | **Practice staff** | Provider employees supporting clinicians |
| Staff & teams | Clashes with Coordinator teams | **RehletShifaa staff** | Our employees |
| Coordinator teams / Teams & routing | Engine term | **Coordination pools** / **Coordination setup** | What they are for |
| Assignment queue | Ambiguous (which assignment?) | **Unassigned cases** | Outcome |
| Assignment history | Ambiguous | **Coordinator changes** | Outcome |
| Routing policy / preferences / simulation | Engine | **Rules** / **Clinician preferences** / **Test the rules** (Advanced) | Plain words |
| Shadow (comparison only) / Live (adopted) | Rollout mechanics | Not shown; action labels state their effect | Users need the effect, not the mode |
| Current coordinator (WorkItem) | Internal object | **Coordinator** | — |
| Revision | Concurrency token | hidden | Engineering |
| Credential reviews | OK | **Credential reviews** (keep) | — |
| Case approval (direct) | Different word for the same decision | **Credential review** (typed "case approval") | One concept |
| Start review | Unclear side effect | **Claim review** | It assigns the review to you |
| Readiness | Engine | **Ready to activate** checklist | Outcome |
| Setup in progress / PROFILE_INCOMPLETE | OK / raw | keep label; raw only in Advanced | — |
| Working setup | Vague | **Ready to work** (prices & schedule) | Outcome |
| Availability (in Commercial) | Not commercial | **Schedule** (on the clinician) | Place + word |
| Price catalog / Pricing | OK | **Prices** (clinician), **Price lists** (commercial overview) | — |
| Organization default → Consultant override → Associate doctor override | Good visual, jargon "override" | **Organization price → Clinician's own price** | "Override" is developer vocabulary |
| Retire (price/role/journey) | Unusual English for business users | **Stop using** | Plain |
| Effective access | Jargon | **Can they…?** (section of the person page) | Question users ask |
| User access | OK | **People** (Access) | Person-centred |
| Scope | Engine | **Where it applies** | — |
| Relationship (roles, providers) | Abstract | **Works with** (manages / assists / supervises) | — |
| Membership (activate membership) | Engine | **Joined the organization** / "Confirm they joined" | — |
| Journey / Journey library | "Journey" is also the patient-facing word | **Care pathways** (admin) — keep "journey" for patients | Avoid one word for the engine and the patient's experience |
| Designer, Validate, Simulate, Deploy, Artifact hash, Runtime | Engine | Designer · **Check** · **Try it** · (Advanced) | — |
| Governance reason | Formal | **Why are you making this change?** | Plain question |
| Identity checks | OK | keep | — |
| Provider | Used for organization and in "Provider operations manager" | **Provider organization** on first use | — |
| Note for the audit trail | Friction | hidden default | — |
| "Your account has no portal role assigned." | Blames the user in system words | Persona-appropriate landing (§4) | — |

## 16. Click-path analysis

Counts are *major interactions* (clicks, selections, submits; typing a field counts once per field group). They
are estimates from code/rendered screens, not measured sessions.

| Flow | Current | Target | Removed | Safety retained |
|---|---|---|---|---|
| **A. Add consultant** | Overview/Consultants → Add → route radio → org select → type → 4 fields + audit note → Send: 2 pages, ~9 | Consultants → Add → (engagement) → org auto → 4 fields → Send: 1 page, ~6 | audit note, route choice when single model, org when single | Invitation via Keycloak; email verification |
| **B. Complete onboarding** (provider) | 4 wizard steps, step 1 membership activation, ≥6 separate saves in step 2, nested tabs in step 3, step 4 review; plus a detour to Care coordination for routing: 5–6 pages, ~45–60 | 2 steps + checklist on clinician page; org default prices once per org; preset week: 3 pages, ~25–30 | membership detour, duplicated review step, per-clinician org defaults, routing detour | Independent credential review; activation gate |
| **C. Review credential** | Home tile → queue → Review → Start review → reason → Verify (+ open N documents): 3 pages, ~6 + docs | same pages; licence facts inline; "Claim review" kept: ~5 + docs | Opening PDFs just to read the licence number | Claim, reason, self/submitter block, idempotency |
| **D. Activate clinician** | 3 places (wizard 4, Readiness tab, Org setup); org must be active first; confirm | 1 place: clinician header; org activation first stated in the checklist | 2 duplicate surfaces | Readiness gate, confirmation |
| **E. Change consultant price** | Pricing → org → clinician → New price → 9 fields → Save → Publish (+ clinician approval from inside admin): ~10, or via Consultant tab ~8 | Clinician › Prices → Change price (amount, from date) → Save draft → Publish (confirm): ~5 | org+clinician pickers, service code retyping | Draft→publish, consultant approval (moved to the clinician's own workspace) |
| **F. Change availability** | Availability hub → org → clinician → Add slot → 4–7 fields per weekday: ~7 per slot | Clinician › Schedule → edit week grid → Save: ~4 | hub pickers, one-slot-at-a-time | — |
| **G. Add practice manager / assistant** | Org → Add practice team member (6 fields incl. audit note) → People → row menu Activate membership → row menu Assign to consultant → dialog: 1 page + 2 dialogs, ~12 | Org › People → Add person (role, name, email, **Works with**) → Send; membership confirmation from Home: ~7 | separate relationship dialog, audit note | Invitation; membership confirmation |
| **H. Give user access** | Access › User access → search → Select → Give access → role → Continue → scope → Continue → validity → Continue → reason → Confirm: ~11 | Access › People → search → Give access → role → where it applies → Review (optional end date, reason) → Confirm: ~7 | validity step | Reason, pending-in-unverified-org rule |
| **I. Why does/doesn't X have permission** | User access → select → "Why do they have this access?" → Effective access page → filter → expand: ~6; realm roles invisible | People › person → "Can they…?" search → reason inline: ~3; realm workspace shown | page hop | — |
| **J. Assign / reassign a case** | Portal (lead): case → More → Case administration → select + reason → Transfer (~5); **or** CC → Coordination → org → Queue → Assign → UUID → reason → Confirm (~7, possibly no effect) | Portal: case → Transfer (from More) → name + reason → Transfer: ~4; Team queue row → Assign to…: ~3 | CC path for daily work | Reason; lead-only; eligibility |
| **K. Resolve unassigned WorkItem** | Home tile → org picker → org → Queue tab → Assign → UUID pick → reason → Confirm: 4 pages, ~7 | Home tile → Unassigned cases (names, case numbers) → Assign to… → reason: 1–2 pages, ~4 | org hop, tab hop, UUID reading | Reason, eligibility check |
| **L. Configure routing preference** | CC → Coordination → org → Preferences tab → choose consultant → coordinator/team → reason → Save: ~7; readiness link lands on the org picker | Clinician page › Coordination (read) → "Change" deep link → preference form → Save: ~4 | org hop; blocker detour | Versioned preference, reason |
| **M. Create / edit / publish Journey** | List → versions → Clone (reason form) → Open designer → edit → reason → Save → Validate → Simulate → Publish tab → Submit → (approver) Publish: ~13–15 | List → Edit a copy → edit → Save (no reason) → Publish checklist: Check → Try it → Send for approval (reason) → approver Publish: ~9 | reason on every save, duplicate validate/simulate controls | Maker-checker, validation, simulation, immutability |
| **N. Patient submits case** | 3-step wizard + review → Send: ~8–12 | unchanged | — | Consents |
| **O. Patient responds to proposal** | Link → OTP send → code → review → consents → Acknowledge: ~6 (or portal → Review → decide ~4) | unchanged | — | OTP, explicit consents |

## 17. Pages by revamp level

| Level | Pages | Reasoning |
|---|---|---|
| **0 Keep** | My Care; secure status link; proposal sign; profile activation; send-my-case; coordinator/consultant Current action panel; Credential review decision block | Plain language, one primary action, backend-driven |
| **1 Polish** | Staff dashboard & case workspace (role switcher, duplicate triggers, finance extras out); Organizations list; Credential queue; Staff & teams (rename); Identity checks; Journey list; Audit | Copy/hierarchy only |
| **2 Restructure** | Control Center Home (attention only); Organization detail (Prices tab for org defaults, truthful Setup); Clinician page (merge workspace + wizard + direct detail); Pricing hub (becomes Commercial overview); Access People (merge Users + Effective); Roles wizard (reason once, person picker); Journey versions + Designer header + publish checklist; Credential review (licence facts) | Same functionality, better IA |
| **3 Full revamp** | Consultant onboarding; Care coordination workspace (all 7 tabs); provider-member landing (the "no portal role" state); dual consultant model presentation | Current model fundamentally confusing or untruthful |
| **4 Merge / retire** | Commercial › Availability hub → clinician Schedule; Access › Effective access → People; Access › Permissions → reference inside role wizard; portal admin hand-off card → redirect; portal Financial policies → Commercial; Coordination org picker → header selector; Consultant workspace "More actions" & Readiness tab; Overview destination grid; setup wizard step 4 | Functionality lives elsewhere |

## 18. UX debt register

Complexity: S (≤½ day, frontend), M (1–2 days or small backend read), L (multi-day or product decision).

| ID | Sev | Persona | Page | Problem | Business impact | Recommendation | Cx | Duplicates | Click Δ |
|---|---|---|---|---|---|---|---|---|---|
| UX-001 | Critical | Provider consultant, associate doctor, practice manager, assistant, owner | `/portal` | Red "no portal role" error; no home | Provider people cannot start work; support load | Persona landing: redirect capability-only users to a scoped Control Center home; never show the error to a user with any capability | M | — | — |
| UX-002 | Critical | Provider ops | Wizard step 4, Consultant readiness, Org setup | Activation unreachable (commercial acceptance fail-closed; org profile has no UI) but presented as reachable; Activate organization enabled | Wasted effort, loss of trust | State plainly "Activation isn't available yet: commercial & legal acceptance is not live in this release"; enable Activate only when ready; add org-profile edit or remove its row until it exists | S (copy/state) + M (org profile UI) | readiness ×3 | — |
| UX-003 | Critical | Coordination manager | Coordination › Assignment queue | Manual Assign/Reassign is a no-op in SHADOW; UUIDs | Wrong belief that a case was reassigned | Hide or relabel per mode; route daily reassign to portal authoritative path; names + case numbers | M | Portal Case administration | −3 |
| UX-004 | Critical | Access admin | Access › User/Effective | Realm roles invisible; two pages | Cannot answer "why"; risk of duplicate grants | Merge into People page; show realm workspaces read-only | M | Users/Effective | −3 |
| UX-005 | High | Admin, provider ops, reviewer | Consultants, Add, Credentials, Pricing, Direct detail | Two consultant models as toggles | Admins must learn internal history | One list/page family with engagement column; product decision on direct model | L | ×5 | −2 per flow |
| UX-006 | High | Provider ops | Onboarding wizard | 4 steps, 6+ saves per step, membership + review inside | Slow onboarding, abandoned setups | 2 steps + checklist (§8.3) | L | wizard/workspace | −20 |
| UX-007 | High | Provider ops | Professional details | Blind re-entry ("saved values aren't shown") | Accidental overwrite, re-typing | Backend read of profile fields; show and edit in place | M | — | — |
| UX-008 | High | Coordination manager | Coordination (all tabs) | Engine console; UUID inputs; comma-separated lists | Misconfiguration | Pools & people with pickers; chips for care areas/languages; Advanced for weights/simulation | L | Staff & teams "teams" | −3 |
| UX-009 | High | Finance lead | Portal Finance | Margin/deposit policy hidden in `<details>` | Policy changes hard to find/audit | Move to Commercial › Margin & deposit | S | — | — |
| UX-010 | High | Provider ops | Pricing | Org default prices editable only via a clinician | Confusing inheritance | Organization › Prices tab for defaults | M | pricing ×3 | −3 |
| UX-011 | High | Provider consultant | Pricing | "Only the clinician can approve" but approval lives in admin screen | Drafts never publish | Surface approval to the clinician's own workspace (depends on UX-001) | M | — | — |
| UX-012 | High | Admin | Overview | 19-card grid duplicates sidebar; 3,000 px on mobile | Slow orientation | Attention-only home, persona-ordered | S | nav | — |
| UX-013 | High | Reviewer | Credential review | Licence number / issuer not shown | Reviewer opens PDFs to read basics | Add fields to review read; show inline | M | — | −N docs |
| UX-014 | High | All admins | CC shell | Public marketing footer inside admin | Noise, looks unfinished | App shell without public footer | S | — | — |
| UX-015 | Medium | Journey manager | Designer | Validate/Simulate twice; reason before save | Confusion about where to act | Publish checklist; reason at submit | M | header vs tabs | −4 |
| UX-016 | Medium | Journey manager | Versions | Deploy/compiler/hash in main view | Technical exposure | Advanced disclosure | S | — | — |
| UX-017 | Medium | Access admin | Role wizard | Reason on every step; raw subject for simulation | Friction | Reason at publish; person picker | S | — | −2 |
| UX-018 | Medium | Access admin | Give access | Separate validity step; free-text resource | Extra click; errors | Fold into review; Advanced | S | — | −2 |
| UX-019 | Medium | Provider ops | Consultant workspace | "More actions" menu duplicates tabs; Readiness tab duplicates wizard | Clutter | Remove menu; header checklist | S | ×2 | −1 |
| UX-020 | Medium | Provider ops | Org › Add practice team member | Owner offered as practice staff; audit note required | Wrong mental model | "Add person" with role groups; hide note | S | — | −1 |
| UX-021 | Medium | Provider ops | Add consultant / invite dialogs | Required audit note (prefilled) | Friction | Advanced | S | ×3 | −1 |
| UX-022 | Medium | Provider ops | Setup step 1 | Manual membership activation mid-wizard | Unclear why | Move to People + Home attention | S | ×4 | −1 |
| UX-023 | Medium | Admin | Nav | Three "team" concepts | Misrouting | Rename (§15) | S | — | — |
| UX-024 | Medium | Admin | Pricing | Service code typed freely; retire without confirm; history inline | Errors | Code picker, confirm, collapse history | M | — | — |
| UX-025 | Medium | Admin | Direct approval | Approve without confirm; free-text credential type | Inconsistent safety | Confirm; credential type select | S | — | — |
| UX-026 | Medium | Coordination manager | Coordination | Org picker hop; 7 wrapping tabs; Refresh | Clicks | Header org selector; 3 tabs + Advanced | S | — | −2 |
| UX-027 | Medium | Staff | Portal | Role switcher button row; CC button above title; admin hand-off card | Clutter | Account menu; redirect | S | ×3 | −1 |
| UX-028 | Medium | Coordinator lead | Portal case | Case administration has two triggers | Duplicate | Keep More only | S | ×2 | — |
| UX-029 | Medium | Patient | My Care | Info request answered via messages vs structured form on status link | Incomplete responses | Reuse structured form | M | ×2 | — |
| UX-030 | Medium | Provider ops | Setup step 3 | Routing blocker links to org picker | Detour | Deep link to preference editor | S | — | −2 |
| UX-031 | Medium | All | Errors | Raw backend messages in Pricing/Availability/Coordination (`cc-message`) vs `ErrorNotice` elsewhere | Unclear recovery | Use `ErrorNotice` everywhere | S | — | — |
| UX-032 | Medium | All | Destructive actions | Mix of `window.confirm`, inline confirm, none | Inconsistent safety | One confirm pattern | S | — | — |
| UX-033 | Low | Patient | My Care | "Version N"; duplicate phase indicator | Mild confusion | Remove | S | — | — |
| UX-034 | Low | Patient | My Care | Documents not openable by patient | Frustration | Decide & explain | S | — | — |
| UX-035 | Low | Patient | My Care | Dead `PAY_DEPOSIT` button stub | Risk if resolved | Remove until real | S | — | — |
| UX-036 | Low | Coordination | Overview tab | Engineering note about missing feed | Noise | Remove | S | — | — |
| UX-037 | Low | All admin | Coordination loading | Page `h1` becomes "Loading…" | A11y/orientation | Stable title | S | — | — |
| UX-038 | Low | All | Dates | `ar-EG` vs `ar-AE` vs `en-GB` locales mixed | Inconsistent formats | One formatter | S | — | — |
| UX-039 | Low | Dev | Portal.tsx | 138 KB single file; dead `PatientStatusCard` | Change risk | Split by persona when restructuring | M | — | — |
| UX-040 | Low | Admin | Home | Attention counts via N+1 fan-out | Slow home at scale | Summary endpoint (P3) | M | — | — |

## 19. Target information architecture

> **Superseded after expert review.** A (Control Center) is replaced by the approved IA in §31.1; C (providers) is
> replaced by the Provider Workspace model in §31.2 — the "scoped Control Center view" recommendation is withdrawn.
> B (staff portal) and D (patient portal) stand.

### A. Control Center (administration and configuration)

```
Control Center
├─ Home                      what is waiting for me (persona-ordered attention items; no card grid)
├─ Providers
│  ├─ Organizations          list → Organization: Overview · People · Prices (organization defaults) · Setup
│  ├─ Clinicians             consultants + associate doctors, both engagement types, filter by status/organization
│  │                         → Clinician: Overview (with activation checklist) · Credentials · Prices · Schedule · Works with
│  └─ Practice staff         practice managers & assistants across organizations
├─ Reviews
│  ├─ Credentials            provider credential reviews + direct case approvals, one queue, oldest first
│  └─ Identity checks
├─ Commercial
│  ├─ Price lists            cross-clinician overview (read + links), service templates
│  ├─ Exchange rates
│  └─ Margin & deposit       (moved from the Finance portal)
├─ Care operations
│  ├─ RehletShifaa staff     invitations, team leads, accounts
│  ├─ Coordination setup     Pools & people · Clinician preferences · Rules (Advanced: weights, test, history)
│  └─ Care pathways          journey list → versions → designer with publish checklist
└─ Access
   ├─ People                 one person: workspaces · roles · "Can they…?"
   ├─ Roles                  list · detail · wizard (permission catalogue as a reference drawer)
   └─ Audit
```

### B. Operational staff (portal)

```
Portal (RehletShifaa staff)
├─ My work                   actions assigned to me
├─ My cases                  cases I own
├─ Team queue (leads)        unowned cases + unassigned coordination work (names, case numbers, Assign to…)
└─ Case                      Current action · Overview · Clinical · Documents · Activity; drawers: Messages, More
Account menu: switch workspace (multi-role), Control Center link (if any capability), settings, sign out
```

### C. Providers / clinicians

```
Clinician workspace (legacy DOCTOR today; provider clinicians once UX-001 is decided)
├─ My work / My cases        assignments, clinical reviews
└─ My practice (provider clinicians and their practice staff, scoped to "clinicians I am / manage / assist")
   ├─ Prices to approve      consultant price approval (existing capability)
   └─ Schedule               existing availability capability (`availability.manage_self`)
```

This reuses existing capabilities only (`price_list.manage` approval rule, `availability.manage_self`); the open
product decision is where it lives (portal vs a scoped Control Center view). Recommendation: a scoped Control
Center view reached directly after sign-in — no new backend, fastest to deliver.

### D. Patient portal (unchanged structure)

```
My Care
├─ Care       current step · journey · proposal · deposit · coordinator · other cases
├─ Documents
└─ Messages
Secure links: /status/[token] · /proposal/[token] · /activate/[token] · /track-case · /send-my-case
```

## 20. Top business flows — before / after

1. **Add and activate a provider consultant** — *Current:* Consultants → Add → route → org → form → Send →
   Step 1 (activate membership) → Step 2 (details save, N credential uploads, relationships) → Step 3 (nested
   pricing editor, availability editor, routing detour) → Step 4 (blocked). *Target:* Clinicians → Add → Send →
   Profile & credentials → Ready to work → clinician page checklist → (reviewer approves) → Activate.
   Removed: 1 step, membership/relationship detours, duplicate readiness; retained: independent review, activation
   gate, confirmation.
2. **Review a credential** — *Current:* Queue → Review → Start review → open PDFs → reason → Verify. *Target:* Queue
   → Review → Claim → read licence facts inline → reason → Verify. Removed: PDF opening for basic facts. Retained:
   claim, reason, independence rules.
3. **Change a price** — *Current:* Pricing → org → clinician → New price → 9 fields → Save → Publish. *Target:*
   Clinician › Prices → Change price → Save → Publish. Removed: 2 pickers, retyping service data. Retained:
   draft/publish, clinician approval.
4. **Set a weekly schedule** — *Current:* Availability hub → org → clinician → one slot per form. *Target:*
   Clinician › Schedule → week grid → Save. Removed: hub, per-slot forms.
5. **Add a practice manager** — *Current:* Org → dialog → People → Activate membership → Assign to consultant.
   *Target:* Org › People → Add person (with Works with) → confirm joined from Home. Removed: separate relationship
   dialog. Retained: membership confirmation.
6. **Give someone access** — *Current:* 11 interactions across a 4-step wizard. *Target:* 7 with validity folded
   into review. Retained: reason, pending rule for unverified orgs.
7. **Understand someone's access** — *Current:* two pages, realm roles missing. *Target:* one page, workspaces +
   roles + "Can they…?". Retained: backend decision reasons.
8. **Reassign a case** — *Current:* two paths, one possibly a no-op. *Target:* one authoritative path (portal
   Transfer / Team queue Assign to…). Retained: reason, lead-only, eligibility.
9. **Publish a care pathway** — *Current:* reason on every save, duplicated controls, all transitions shown.
   *Target:* Edit a copy → Save → Check → Try it → Send for approval → Publish. Retained: maker-checker,
   validation, simulation, immutability.
10. **Patient answers an information request** — *Current:* My Care → Messages (free text) vs status link
    structured form. *Target:* one structured form in both. Retained: OTP on the secure link.

## 21. Priorities

> **Superseded after expert review** by the narrowed P0 and re-ranked P1 in §31.9. The original ranking is kept
> for traceability.

**P0 — before Phase 8C** (structure and truthfulness; 8C would otherwise validate the wrong UI)
- UX-001 provider-member landing · UX-002 truthful activation state · UX-003 truthful assignment actions ·
  UX-004 People page with realm workspaces · UX-005 single consultant list/page family (presentation; data models
  unchanged) · UX-006 onboarding restructure · UX-009 finance policies moved · UX-012 attention-only Home ·
  UX-014 app shell without public footer · UX-023 terminology set (§15, business-facing labels only) ·
  UX-019/UX-022 remove duplicate menus/steps · UX-032 one destructive-confirm pattern.

**P1 — before final production**
- UX-007 professional details read · UX-008 coordination revamp · UX-010 organization default prices ·
  UX-011 clinician price approval in their workspace · UX-013 licence facts in review · UX-015/016 journey
  publish checklist & Advanced · UX-017/018 access wizards · UX-026 coordination hop · UX-027/028 portal chrome ·
  UX-029 structured info response · UX-031 error pattern.

**P2 — useful**: UX-020, UX-021, UX-024, UX-025, UX-030, UX-033, UX-034, UX-035, credential decision history,
Arabic/RTL fixes in §27, mobile patterns in §26.

**P3 — future**: UX-040 summary endpoint, expiring-credentials view, role assignee counts, UX-039 file split.

## 22. Proposed implementation sequence

> **Superseded after expert review** by the UX-1 … UX-8 program (§31.10). Step 1 decisions are approved (A–D).

1. **Decisions (product owner, no code):** (a) direct vs provider consultants long-term; (b) provider-member home
   (scoped Control Center recommended); (c) how SHADOW routing is presented (hide manual commands vs relabel);
   (d) wording for the unavailable commercial acceptance.
2. **Shell & navigation** (S–M): app shell without public footer, 5-group IA, attention-only Home, persona
   landing/redirects, terminology labels. Update `control-center-nav.ts`, `routes.test`, e2e `portal-ux`.
3. **Truthfulness fixes** (S–M): activation state, assignment actions, confirmations, error pattern.
4. **Clinician page + onboarding** (L): merge workspace/wizard/direct detail into one page family; 2-step setup;
   header checklist; organization Prices tab. Shared components in `consultant-setup.tsx` are reused.
5. **Access People page** (M): merge Users/Effective; realm workspace block; wizard simplifications.
6. **Care coordination** (L): pickers/names, Pools & people, Advanced, Team queue in the portal.
7. **Commercial consolidation** (M): move finance policies; Schedule on clinician; Commercial overview.
8. **Journeys** (M): publish checklist, Advanced, reason at submit.
9. **Portal polish** (S): role switcher, duplicate triggers, patient nits.
10. **Phase 8C** (formal E2E/visual/a11y) on the result.

Small backend reads implied (no architecture change): professional-profile read (UX-007), credential
issuer/reference in review read (UX-013), queue items with case number (UX-003/008), person realm roles (UX-004).

---

## 23. UX consistency audit (one pattern each)

| Element | Today | Standard |
|---|---|---|
| Page header | CC: `ControlCenterShell` title/intro/actions; portal: `PortalFrame` headline; coordination sets `h1` to "Loading…" | Stable `h1` = object name; intro one sentence; ≤1 primary + ≤1 secondary header action |
| Breadcrumbs | CC yes (built by hand in coordination/journeys with different labels) | Always `ccCrumbs` |
| Tabs | `SectionTabs` (roving, attention dots) vs `cc-tabs` (coordination/journeys: `aria-current` on tabs, no arrow keys) vs portal inline tablists | `SectionTabs` everywhere |
| Buttons | `cc-primary`, bare `<button>` (styled primary), `btn-primary`/`btn-secondary`, `cc-secondary cc-small`, `cc-ghost` | One primary per scenario; secondary; ghost for navigation; danger only in menus/confirm |
| Lists/tables | `cc-list` rows, `cc-cards`, `<table>` in pricing/templates, `ag-*` lists | `cc-list` for records; tables only for numeric grids |
| Status badges | `StatusBadge` tones vs `cc-badge` vs portal pills | `StatusBadge` (icon + text) |
| Empty states | `EmptyState` vs `cc-empty` paragraphs; coordination shows "You do not have access" for an empty list | `EmptyState` with next action |
| Errors | `ErrorNotice` (what/retry) vs raw `cc-message` backend strings | `ErrorNotice` + "nothing was saved" when true |
| Destructive | `window.confirm`, inline confirm cards, none | Inline confirm card stating the effect + reason when backend needs one |
| Forms | `Field` with labels/errors vs bare `<label>` (pricing, coordination, role wizard) | `Field` |
| Save pattern | Per-section saves inside a wizard; draft/publish; immediate | Per-section save with inline "Saved" + draft/publish only where versioned |
| Search/filter | `cc-filterbar` vs `cc-toolbar` | `cc-filterbar` |
| Pagination | Roles prev/next; audit "load more"; portal pages | "Load more" for logs, pages for queues |
| Drawer vs modal | Portal `<dialog>` drawers; CC `FocusTrapDialog` | Dialog for short forms; page for anything with >6 fields |

## 24. Button / CTA hierarchy

Rule: **one primary CTA per scenario, derived from state**; secondary actions in a menu; destructive last,
separated, and never primary. Violations found: Organization Setup (enabled primary Activate when not ready);
wizard step 2 (six primaries: Save professional details + 2×Add + Continue, plus Assign buttons); Journey header
(Save + Validate + Simulate + Refresh); Journey publish panel (4 transitions); Direct approval (Approve primary
without confirm); Consultant workspace (Continue setup + More menu duplicating tabs); portal role switcher
(one `btn-primary` per role).

## 25. Empty / error / success states

- Good: Overview "Nothing is waiting for you"; consultants "Add your first consultant"; credential queue; My Care
  "No active case yet" with Send my case.
- Fix: Coordination org list empty → "You do not have access" (wrong message for "no organizations");
  PricingManagement/AvailabilityManagement/coordination show raw backend `message` without "was anything saved";
  generic "Saved." / "Decision recorded." without what happens next (e.g. "Verified. Dr Farouk still needs: …");
  Activate disabled with a hint below but no list of what's missing near the button (the list is above, OK);
  `CREDENTIAL_POLICY_UNCONFIGURED` tells the admin to "contact the platform team" — acceptable, add who.

## 26. Mobile

- CC sidebar collapses into a "Menu · section" disclosure — good. Overview on 390 px is ~3,000 px (six attention
  tiles then 19 cards) — attention-only home fixes it.
- Coordination 7 tabs wrap even on desktop; on mobile they become a long wrapped strip — use a select or 3 tabs.
- Journey Designer graph is not a mobile interaction; default to the existing list mode and make mobile
  read-only (review, not authoring).
- Wizard sticky Back/Continue is good; step 2's many forms become a very long scroll — the checklist pattern
  (each item opens its own short form) works better on phones.
- Staff case workspace stacks the aside below the tabs; on phones the Current action panel should stay first
  (it does) and the Case team moves into the header facts.
- Tables (pricing templates, FX, finance policies) need row-card layouts under 600 px.

## 27. Arabic / RTL

- Direction-neutral wording "Back" with literal arrows `→`/`←` is handled; keep using icons that mirror.
- **Mixed-direction strings** in selects ("Dr Amira Farouk — Consultant", "EGP — Egyptian Pound") and
  "Hospital · EG · EGP" need `<bdi>` isolation; codes (EG, EGP, Africa/Cairo) should be replaced by names in
  Arabic (country/currency pickers).
- Comma-separated inputs ("en, ar", "cardiology") are confusing in RTL (Arabic comma "،" vs ","); use chips.
- Numbered steps mix Arabic-Indic and Latin digits ("١. تسجيل" vs "1. Organization default"); pick one per locale.
- Date formats mix `ar-EG`, `ar-AE` and `toLocaleString(locale)`; one formatter.
- Wizard progress and journey phase steppers: order should read right-to-left; confirm the connector lines and
  "done" colours are not direction-dependent (CSS uses logical properties — verify in 8C).
- Journey graph canvas: edges drawn left→right regardless of locale; in Arabic, list mode should be default.
- UUIDs and `dir="ltr"` blocks inside Arabic rows (coordination) are unreadable — removing IDs solves it.

## 28. Accessibility (expert review; formal validation remains Phase 8C)

- **Keyboard/tabs:** coordination and journey tabs use `role="tab"` with `aria-current="page"` and no arrow-key
  support; `SectionTabs` does it right — reuse.
- **Headings:** coordination/journey loading states set the page `h1` to "Loading…"; portal pages have one `h1`;
  CC pages use `h2` sections — good.
- **Modal focus:** `FocusTrapDialog` and native `<dialog>` are fine; `window.confirm` (disable access, remove
  member) is accessible but inconsistent.
- **Labels:** several forms use bare `<label>` wrapping without hints/errors (pricing, coordination, role wizard);
  required state conveyed only by `required` attribute.
- **Status announcements:** notices use `role="status"`/`alert` — good; raw error strings are announced but not
  actionable.
- **Touch targets:** `cc-small` buttons and row action menus are below 44 px in dense lists.
- **Colour reliance:** badges combine icon + text — good; the attention tiles rely on an orange left border
  plus text — acceptable.
- **Dense data:** UUID-heavy rows are hostile to screen readers (read character by character).
- **Graph interaction:** Journey canvas has a list alternative — keep it as the accessible default.

## 29. Visual design quality

Calm, trustworthy palette (teal/sand), good typography, generous but not excessive whitespace in the patient
portal — it reads as premium healthcare. The Control Center is clean but reads as **a set of card grids**: the
Overview is 25 cards; Setup pages are stacked bordered boxes each with a badge; there is no density difference
between a 3-row checklist and a data list. The public footer under admin pages undermines the "enterprise tool"
feel. Three style systems (`cc-*`, `ag-*`, journey CSS) plus portal Tailwind show as small inconsistencies in
buttons, spacing and headings. No redesign for trend's sake is recommended: remove the footer, cut card
nesting, adopt one list density for records and one checklist pattern for readiness.

## 30. What this audit deliberately does not propose

No new business functions. Every recommendation reuses existing endpoints and capabilities, except four small
**read** additions (§22) needed to stop showing identifiers or blind forms. No approval, maker-checker,
independent-review, OTP, reason or confirmation step is removed; several are made more consistent.

---

## 31. Revisions after expert review (UX-0 design freeze, 2026-09-23)

This section revises the recommendations above. It does not change any finding's evidence. The concise handoff
for implementation is [ux-implementation-plan.md](ux-implementation-plan.md).

### 31.1 Target Control Center IA (replaces §19 A and Decision report item 10)

```
CONTROL CENTER
Home                        What needs my attention? (attention items, pending review/setup, persona shortcuts)
Providers
  Organizations
  Clinicians                one directory: Direct with RehletShifaa · Through a provider organization
  Practice Staff
Reviews & Safety
  Credential Reviews
  Identity Checks
Commercial
  Price Lists
  Exchange Rates
  Margin & Deposit
Operations
  RehletShifaa Staff
  Coordination Setup
Care Journeys
  Journeys
  Journey Design / Publishing
Access & Governance
  People
  Roles
  Audit
```

- The original "5 groups" target is withdrawn: the IA is not optimized toward a number of groups.
- *Care Journeys* is separate because journey design/publishing is product-management/governance work, not
  ordinary coordination configuration.
- Navigation stays permission-gated; users see only sections they can open.
- **Home principle:** Home answers *"What needs my attention?"* It is not a sitemap. The 19-card destination grid
  (UX-012) is removed conceptually; Home shows attention items and pending review/setup work only where real reads
  exist, plus role-relevant shortcuts. No fabricated metrics. Navigation stays in the sidebar.

### 31.2 Provider personas — Workspace vs Control Center (replaces §19 C and the "scoped Control Center" recommendation)

Decision B applies. **Workspace** is for daily work; **Control Center** is for configuring and administering the
platform. Provider personas land in a **Provider Workspace**; organization owners additionally get **Manage
organization** into scoped Control Center administration where authorized.

| Persona | Workspace contents (existing capabilities only) |
|---|---|
| Provider consultant | My work · My cases · My practice · My schedule (`availability.manage_self`) · My credentials (`credential.submit` SELF) · prices needing their approval (existing `price_list` approval rule) |
| Associate doctor | Same, plus supervision context (the `SUPERVISES` relationship) |
| Practice manager | Clinicians they manage (`MANAGES`) · schedules · setup status · commercial tasks their existing role version allows · practice staff |
| Consultant assistant | Only the clinicians/tasks they support (`ASSISTS`) · schedule · existing scoped capabilities |
| Organization owner | Provider Workspace + *Manage organization* |

Constraints: provider personas have no Keycloak realm role today and none is added; the workspace must be driven by
existing memberships/capabilities. Unrelated platform-admin navigation is never exposed because a capability
technically exists. No patient/case data reaches a provider persona until the minimum-necessary matrix (§31.8 D,
P0-9) is approved and verified against the actual backend reads.

### 31.3 Consultant onboarding (replaces §8.3 and Decision report item 8)

The earlier recommendation ("Invite → Profile & credentials → Ready to work", one sequential flow) is withdrawn:
it still presents a multi-owner process as one person's wizard.

1. **Add Consultant** — one short screen: name, email, organization, clinician type, engagement model, invitation
   language, and only other existing mandatory invite facts (the backend audit reason is prefilled under
   Advanced).
2. Land on **Consultant Setup** — a persistent setup workspace/checklist, not a linear wizard:

| Section | Readiness facts (unchanged) | Owner | Notes |
|---|---|---|---|
| 1 Account | identity provisioned; organization membership active | Provider Operations | Membership confirmation also surfaced in Organization › People and Home |
| 2 Professional Profile | clinician profile complete; required relationships (associate → supervising consultant) | Provider Operations | Needs the profile read (P0-5) so saved values show |
| 3 Credentials Submitted | all mandatory credentials submitted | Provider Operations / clinician | Upload + scan + submit per requirement |
| 4 Independent Credential Review | all verified and unexpired | Credential Review Team | Status only; reviewers get an "Open review" link; submitters never see decision controls |
| 5 Operational Setup | pricing; schedule when required; routing preference | Provider Operations / Commercial / Coordination Setup | Deep links to the canonical editors |
| 6 Activation | provider profile, owner, organization active, commercial & legal acceptance, `readyForActivation` | Provider Operations | Decision D; today always case 3 |

Grouped progress may be shown ("4 of 6 sections complete") but each section names its responsibility, e.g.
*Professional Profile — Completed — Owner: Provider Operations*; *Credential Review — Waiting — Owner: Credential
Review Team*; *Operational Setup — Needs attention — Pricing / Schedule / routing*. Provider Operations cannot
perform independent credential review (backend self/submitter blocks stay). Direct consultants use the same Add
screen and a model-specific setup (legacy case approval with confirmation, price list, account access).

### 31.4 Credentialing as a lifecycle (new; extends §11)

Credentialing is ongoing, not an onboarding-only step. Credential Reviews stays its own operational workspace.

| State | Exists today? | Evidence | UX treatment |
|---|---|---|---|
| Submitted | Yes | revision `SUBMITTED` (V34) | Show |
| Under review | Yes | `START_REVIEW` → `UNDER_REVIEW` | Show; action "Start review" / "Assign review to me" |
| More information required | Yes | `REQUEST_INFORMATION`, reason required | Show with the reason to the submitter |
| Verified | Yes | `VERIFY` from `UNDER_REVIEW`; reviewer is neither the clinician nor the submitter; `reviewed_by`, encrypted reason, recent auth | Show reviewer identity and date |
| Rejected | Yes | `REJECT`, reason required | Show |
| Suspended / restored | Yes | `SUSPEND` (from VERIFIED) / `RESTORE`; revision and dossier `SUSPENDED` | Show; restore is its own reviewed action |
| Expired | **Representable, not written** | `EXPIRED` is an allowed status but no provider job sets it; readiness computes `expires_at <= now` → `CREDENTIAL_EXPIRED` | Derive from `expires_at` at display time |
| Expiring | **Derivable only** | `expires_at` per revision; no reminder or cross-organization "expiring soon" read | Derived label on clinician/revision views; queue view = future backend capability |
| Renewal submitted | **Representable** | New revision in the same dossier while an earlier VERIFIED revision stays effective (technical-decisions §13.7) | Derived label; behaviour to verify in UX-6 |
| Revoked | **Schema only** | dossier `REVOKED` exists; no command produces it | Do not show; future business decision |
| Legacy unreviewed | Yes | `LEGACY_UNREVIEWED` provenance | Never displayed as independently verified |

Preserve: independent review, reviewer identity, reasons, sealed evidence, expiry, audit history where supported.
Future business functionality: renewal reminders, an organization-wide expiring view (P3 in §21), revocation,
recredentialing cadence.

### 31.5 Access & Governance (replaces §10 recommendation and Decision report item 9)

Person-centred access stays the primary usability model, but governance is not collapsed into a People page.

- **People** answers: who is this person; which workspaces/accounts they have; which RehletShifaa business roles
  are assigned; what they can do; why they can or can't do something; how to change their business access.
  Contains an **Access summary**; inside it, the question *"Can this person…?"* (allowed/denied + backend reason).
- **Roles** stays first-class: what the role allows, where it applies, restrictions, versions/status.
- **Audit** stays.
- Authority sources are shown in **separate blocks labelled by source**:
  - *Account & workspaces* — realm roles (e.g. Coordinator · Staff Portal) — **Managed by Identity System**,
    read-only.
  - *Business access* — platform assignments (e.g. Provider Operations Manager · Al Noor Hospital) — **Managed by
    RehletShifaa**, give/remove.
  They must not look like one interchangeable role system.
- The permission catalogue leaves the primary sidebar but stays as an advanced/reference surface.
- Removing access (offboarding) is summarized on the person page with each consequence stated separately (§31.8 F).

### 31.6 Care coordination (refines §12)

- **Daily operations → Staff Portal:** My work · My cases · Team queue · authoritative Assign / Transfer / Reassign.
- **Configuration → Control Center › Coordination Setup:** Pools & People · Clinician Preferences · Rules.
- **Advanced:** Preview routing recommendation (Decision C copy) · routing simulation · decision history ·
  technical configuration only when truly necessary.
- Keep **Case Owner**, **WorkItem assignee** and **routing preference** distinct and labelled; never merged into
  one "coordinator" concept. (Supersedes the §15 row "Current coordinator (WorkItem) → Coordinator".)

### 31.7 Terminology (revises §15)

Principle: plain language is good, but not at the cost of governance or clinical meaning.

| Term | Decision |
|---|---|
| RehletShifaa staff · Practice staff | Keep |
| Schedule | Preferred over Availability in clinician-facing UX |
| Where it applies | Preferred helper wording for Scope |
| Ready to activate | Preferred readiness wording |
| Professional relationships — Manages · Assists · Supervises | Replaces "Works with" |
| Access summary (inside: *Can this person…?*) | Replaces "Can they…?" as a page/section name |
| Assignment history / Routing history | Replaces "Coordinator changes" (the history includes WorkItem/routing evidence) |
| Start review / Assign review to me | Replaces "Claim review" (confusable with insurance claims) |
| Retire version + consequence copy | Replaces the blanket "Stop using" where immutable/versioned governance matters |
| Direct with RehletShifaa · Through a provider organization | Engagement model labels |
| Preview routing recommendation | Replaces shadow Assign wording; `SHADOW` never business-facing |
| Care Journeys · Journey design / publishing | Replaces "Care pathways"; must not imply a formal clinical care protocol — the engine represents operational patient coordination |
| Check / Test run (journey validate/simulate) | Proposed; validate in UX-8 |

**Arabic product glossary — DRAFT.** Not a final legal/clinical translation. **Requires native Arabic
healthcare-operations review before Phase 8C.**

| English | Draft Arabic | Note |
|---|---|---|
| Control Center | مركز الإدارة | |
| Workspace | مساحة العمل | |
| Providers / Provider organizations | الجهات الطبية | |
| Clinicians | الأطباء | Supported types today are Consultant and Associate doctor (physicians). Switch to الممارسون الصحيون if non-physician types are added |
| Consultant | الاستشاري | |
| Associate doctor | طبيب مشارك | Validate against local usage |
| Practice staff | فريق العيادة | طاقم العيادة is an alternative; for hospitals consider فريق الجهة الطبية |
| Practice manager | مدير العيادة | |
| Consultant assistant | مساعد الاستشاري | |
| Organization owner | مالك الجهة | |
| RehletShifaa staff | فريق رحلة شفاء | Confirm the Arabic brand name |
| Credential Reviews | مراجعة التراخيص والمؤهلات المهنية | |
| Identity Checks | التحقق من الهوية | |
| Access & Governance | الصلاحيات والحوكمة | |
| Access summary | ملخص الصلاحيات | |
| Can this person…? | هل يستطيع هذا الشخص…؟ | |
| Professional relationships | العلاقات المهنية | Manages يدير · Assists يساعد · Supervises يشرف على |
| Coordinator teams | فرق التنسيق | |
| Coordination Setup | إعداد التنسيق | |
| Assignment history | سجل الإسناد | |
| Preview routing recommendation | معاينة توصية الإسناد | |
| Ready to activate | جاهز للتفعيل | |
| Activation isn't available yet | التفعيل غير متاح بعد | |
| Schedule | الجدول | مواعيد العمل as an alternative |
| Where it applies | نطاق التطبيق | |
| Price Lists · Exchange Rates | قوائم الأسعار · أسعار الصرف | |
| Margin & Deposit | الهامش والدفعة المقدمة | Avoid عربون unless finance/legal confirm |
| Preliminary estimate · Final quote | تقدير مبدئي · عرض السعر النهائي | |
| Care Journeys | رحلات الرعاية | Must not read as a clinical protocol |
| Credential states: Submitted · Under review · Verified · Expiring · Expired · Suspended · Renewal submitted | مُقدَّم · قيد المراجعة · تم التحقق · ينتهي قريبًا · منتهي الصلاحية · موقوف · تم تقديم التجديد | |

### 31.8 Previously underweighted audit dimensions (new)

Classification: **Exists** (supported today; UX work only) · **Future business decision** · **Future backend
capability** · **Phase 8D finding**.

**A. Credential expiry / renewal / recredentialing lifecycle.** See §31.4. Expiry is enforced at read time
(Exists). Renewal as a new revision is representable (Exists; verify behaviour in UX-6). Reminders, an "expiring
soon" queue and recredentialing cadence: **Future backend capability**; recredentialing policy: **Future business
decision**.

**B. Document submitted vs credential reviewed vs independently verified.** Four distinct facts, all Exist:
evidence uploaded and scanned `CLEAN` (technical acceptance, not a review) → revision `SUBMITTED` → reviewed (any
decision, including rejection or a request for information) → `VERIFIED` by an independent reviewer. The UX must
never show "uploaded" or "submitted" as "verified", and never show `LEGACY_UNREVIEWED` as verified. The review page
must show the submitted issuer, reference number, issue date and jurisdiction (P0-10).

**C. Clinical scope / approval to receive cases vs credential validity.** Exists as separate facts:
`credentialReady` (credentials) ≠ `readyForActivation` (credentials + profile + operational + commercial) ≠
onboarding `ACTIVE` ≠ legacy Direct case approval. The Clinicians directory shows "Can receive cases" separately
from credential status. A clinical-scope / privileging model (which procedures or case types a clinician may
accept) does not exist: **Future business decision**; the profile's specialty is descriptive only.

**D. Minimum-necessary patient/case information by persona.** Not yet specified for provider personas.

| Persona | Proposed minimum (to approve) | Today |
|---|---|---|
| Consultant | Clinical content of cases assigned to them only | Legacy DOCTOR role sees assigned cases; provider consultants have no case read path (no realm role) |
| Associate doctor | Cases assigned to them; supervision context; not the supervisor's other cases unless approved | No case read path |
| Practice manager | Operational metadata (schedule, setup, prices); no clinical documents by default | No case read path |
| Consultant assistant | Scheduling metadata for supported clinicians; no clinical content | No case read path |

Classification: persona data matrix = **Future business decision** (required before UX-4 exposes any case data —
P0-9); any new case read for provider personas = **Future backend capability**; enforcement review = **Phase 8D
finding**.

**E. Financial truthfulness.** Exists: preliminary estimate (consultant cost estimates), final quote,
coordination deposit, strict FX snapshot on released proposals, multi-currency (EGP) catalogue. UX rules: label the
estimate as preliminary and not a final price; state what the deposit is for using only backend/policy-provided
text; show the charged currency and, when converted, the rate and "as of" date from the snapshot; never recompute
a released proposal in the client; provider price screens distinguish source currency from the derived EGP
catalogue value. Refund terms and online payment: **Future business decision / Future backend capability**. Copy
review: UX-8.

**F. Provider/account offboarding and access removal.** Exists as separate actions: provider membership
deactivation (`provider.member.deactivate`, reason), legacy staff/practitioner account disable, role-assignment
revoke, organization status (SUSPENDED/OFFBOARDED via update). Per technical-decisions §13.2, ending one membership
never globally disables a multi-organization identity. UX: a single *Remove access* summary on People that states
each consequence (account disabled vs membership ended vs role removed). No dedicated clinician offboarding command
was found (`OFFBOARDED` is only guarded): **Future backend capability**; completeness of access removal across
sources: **Phase 8D finding**.

**G. Privileged action re-authentication.** Exists: recent-auth permissions (e.g. `provider.activate`,
`credential.verify`, journey approve/publish/retire) return `401 REAUTHENTICATION_REQUIRED` — "Sign in again to
confirm this sensitive change". The frontend handles it in several components but not verifiably everywhere. UX
rule: warn before a privileged action; re-authenticate and return to the same page with entered reasons preserved.
Coverage check: UX-1 (P0-8); independent verification: **Phase 8D finding**.

**H. Patient representative vs patient authority.** Exists: `PATIENT_REPRESENTATIVE` realm role and `REPRESENTS`
relationship. UX: My Care states that the user is acting for a named patient; representative restrictions follow
the backend contract. Which proposal/consent actions a representative may take is unverified: verify in UX-8; any
change = **Future business decision**.

### 31.9 Revised priorities (replaces §21 and Decision report item 12)

**P0 — truthfulness, safety, material user error** (UX-1 unless noted)

| ID | Item | Audit refs |
|---|---|---|
| P0-1 | Provider personas' no-home / dead-end (truthful interim landing in UX-1; workspace in UX-4) | UX-001 |
| P0-2 | False or unreachable activation (Decision D) | UX-002 |
| P0-3 | Fake / no-op shadow Assign/Reassign (Decision C) | UX-003 |
| P0-4 | Incomplete access picture across authority sources (read-only realm-role block now; People page in UX-5) | UX-004 |
| P0-5 | Professional details saved but shown blank / overwrite risk | UX-007 (was P1) |
| P0-6 | Any reachable control that performs no real action | UX-035, §7 |
| P0-7 | Dangerous actions missing required confirmation (Retire price, Approve for cases) | UX-024/025/032 |
| P0-8 | Misleading permission/error states, incl. inconsistent re-authentication | §25, UX-031, §31.8 G |
| P0-9 | Minimum-necessary access verification before provider personas get new workspace exposure | §31.8 D |
| P0-10 | Credential review missing the submitted issuer/reference/issue date/jurisdiction. **P0** because `VERIFY` attests these facts and `RevisionView` does not return them — the reviewer cannot compare the claim against the evidence | UX-013 (was P1) |

**P1 — highest first:** UX-005 one Clinicians directory · UX-006 Consultant Setup · UX-014 app shell · UX-012
attention-only Home · UX-023 terminology · UX-009 Margin & Deposit move · UX-008/026 coordination restructure ·
UX-010 organization prices · UX-011 clinician price approval in their workspace · UX-019/022 duplicate
menus/steps · UX-015/016 journey checklist & Advanced · UX-017/018 access wizards · UX-027/028 portal chrome ·
UX-029 structured info response.

**P2/P3:** unchanged from §21 except the items promoted above.

### 31.10 Implementation program (replaces §22)

| Phase | Scope |
|---|---|
| UX-1 Truthfulness & Safety | P0-1 (interim) … P0-10; small reads: professional profile, credential revision facts, person realm roles |
| UX-2 Control Center Shell / Navigation / Home / Terminology | App shell, §31.1 IA, attention-only Home, redirects, terminology, AR draft labels |
| UX-3 Clinician Directory & Consultant Setup | One directory; Add Consultant; Consultant Setup; clinician page family; Schedule; organization prices |
| UX-4 Provider Workspace / Provider Personas | §31.2; gated by P0-9 |
| UX-5 Access & Governance | §31.5 |
| UX-6 Credentials & Provider Readiness | §31.4; Credential Reviews workspace; organization setup/profile |
| UX-7 Care Coordination | §31.6 |
| UX-8 Commercial / Care Journeys / Remaining Portal Polish | §31.8 E, H; journey publish checklist; portal polish |

Then **Phase 8C** (formal E2E / visual / EN-AR / RTL / mobile / accessibility), then **Phase 8D** (independent
architecture / security / operations / red-team review). None of these started in UX-0.

### 31.11 Estimate and risk (replaces Decision report item 13)

~10–14 focused sessions (UX-3, UX-4 and UX-7 large; others medium). Risk medium. Main risks: UX-4 may find no
existing case-read path for provider personas (scope down, never fake); required small read APIs; unit/e2e test
churn (`routes.test`, `ConsultantOnboardingWizard.test`, `AccessGovernance.test`, `CareOperations.test`, e2e
`portal-ux`, `access-governance`); Arabic review lead time before Phase 8C.
