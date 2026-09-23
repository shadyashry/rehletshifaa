# Control Center — Admin UX simplification (pre-Phase 8C)

Date: 2026-09-23 (Claude Code). Scope: information architecture, routes, naming, task grouping, onboarding
workflow, progressive disclosure. No business-rule, authorization or Journey-cutover change. Journey production
intake remains OFF. This is not Phase 8C acceptance; formal E2E/visual/a11y closure remains Phase 8C.

## 1. Problems found in the old Admin UX

- **Two unrelated "admin" places.** `/portal?role=admin` ("Administration" → "Credentialing console") and the
  Provider Control Center (`/portal/control-center`), plus a third top-level "Roles & Access" page
  (`/portal/access`) in its own chrome, and Journeys at `/portal/journeys`. Three entry buttons, three shells.
- **The console mixed four jobs on one screen:** inviting direct consultants, registering a credential, the
  approval decision (all driven by a raw practitioner UUID "Working on profile" bar), consultant account access,
  staff invitations + reporting teams, and a price catalog tab that also hid FX rates until a consultant was picked.
- **People were shown as account identifiers.** Provider members, relationships, credential queue rows and review
  headers displayed Keycloak subjects/UUIDs; the member API had no name.
- **No landing page.** `/portal/control-center` redirected to the organizations list.
- **Engine vocabulary in primary copy:** `SUPERVISES`, clinician type codes, "Credential-eligible", "Legacy mapping",
  "Configured in Phase 5A-3", raw status enums, role-version numbers and an 11-step role wizard with equal-weight steps.
- **Onboarding was not a flow.** Provider onboarding was a read-only stepper on the organization page; profile
  completion, credential requirements/evidence submission, and clinician activation had backend APIs but **no UI**.
- **Pricing/Availability** only reachable per clinician via raw-ID breadcrumbs; inheritance explained in one sentence.
- **Rows of equally weighted buttons** (Activate/Deactivate/Readiness/Assign on each card; Verify/Reject side by side).

## 2. New information architecture (one shell: `ControlCenterShell`)

```
Control Center
├─ Overview                              (attention items from real reads + "What do you want to manage?")
├─ Providers
│  ├─ Organizations                      provider.view
│  ├─ Consultants                        provider.view  | legacy admin (direct consultants)
│  └─ Practice team                      provider.view
├─ Credentials
│  └─ Credential reviews                 credential.review | legacy admin (direct approvals)
├─ Commercial setup
│  ├─ Pricing                            price_list.view | legacy admin (price lists, templates, FX)
│  └─ Availability                       availability.view
├─ Care operations team
│  ├─ Staff & teams                      legacy admin
│  └─ Identity checks                    legacy identity reviewer
├─ Care coordination › Teams & routing   any assignment.* view capability
├─ Journeys › Journey library            journey.view
└─ Access & governance                   access.role.view (+ specific)
   ├─ User access                        + access.effective_access.view
   ├─ Roles
   ├─ Effective access                   + access.effective_access.view
   ├─ Permissions
   └─ Audit                              + access.audit.view
```

Navigation is defined once (`control-center-nav.ts`) and gated with exact capability keys from `/admin/access/me`
(one read per shell via `useControlCenterAccess`). The legacy administration endpoints are still realm-role gated on
the backend, so their areas use the **same** role check the old console used, centralised in
`legacyAdministration()` (`lib/portal-role-access.ts`) — no new role names were introduced.

## 3. Route map (old → new; every old route still works)

| Old | New | Mechanism |
|---|---|---|
| `/portal?role=admin` (Administration console) | `/portal/control-center` (launcher card in portal) | Portal admin role shows a hand-off card |
| `/portal/control-center` (redirect to providers) | `/portal/control-center` Overview | page |
| `/portal/control-center/providers` | same (Organizations) | page |
| `/portal/control-center/providers/:id` | same, `?tab=overview\|people\|setup` | page |
| `…/providers/:id/consultants`, `/associate-doctors`, `/practice-managers`, `/assistants` | `…/providers/:id?tab=people` | redirect |
| `…/providers/:id/clinicians/:pid/pricing` | `…/providers/consultants/:id/:pid?tab=pricing` | redirect |
| `…/providers/:id/clinicians/:pid/availability` | `…/providers/consultants/:id/:pid?tab=availability` | redirect |
| — | `…/providers/consultants` (`?view=direct`) | new |
| — | `…/providers/consultants/:orgId/:pid` (`?tab=`) | new (consultant workspace) |
| — | `…/providers/consultants/:orgId/:pid/setup?step=` | new (wizard resume) |
| — | `…/providers/onboarding/new` (`?org=`) | new (Add consultant) |
| — | `…/providers/consultants/direct/:id` (`?tab=`) | new (direct consultant) |
| — | `…/providers/practice-team` | new |
| `/portal/control-center/credentials` (`?org=`) | same (`?org=`, `?view=direct`) | page |
| `…/credentials/:org/:rev` | same | page |
| — | `…/commercial` → `…/commercial/pricing` (`?view=&org=&clinician=`), `…/commercial/availability` | new |
| — | `…/team`, `…/identity-checks` | new |
| `/portal/journeys/**` | `/portal/control-center/journeys/**` (designer `?tab=` preserved) | redirect |
| `/portal/access?tab=roles\|permissions\|effective\|audit` | `/portal/control-center/access/<view>` | redirect |
| — | `/portal/control-center/access` → `/access/users` | redirect |

`/portal/control-center` was kept as the base (instead of `/admin`) so no existing deep link or bookmark breaks.

## 4. Terminology

| Old | New | Why |
|---|---|---|
| Administration / Provider Control Center / Roles & Access | Control Center (one name) | one place |
| Credentialing console | (removed) — tasks live in Consultants, Credential reviews, Staff & teams, Pricing | split by job |
| Identity review | Identity checks | it is patient/representative identity verification, not credentials |
| Staff accounts | Staff & teams | these are RehletShifaa coordination/operations/finance staff — **not** "Practice team" (that name is used for provider practice managers/assistants) |
| Price catalog | Pricing › Direct consultant price lists / Care-area templates / Exchange rates | three different things |
| Roles & Access | Access & governance | |
| Role catalogue / Capabilities / Access history | Roles / Permissions / Audit | |
| Credential verification queue | Credential reviews | |
| `SUPERVISES` / `MANAGES` / `ASSISTS` | Supervising consultant / Manages / Assists | keys unchanged on the wire |
| `PROFILE_INCOMPLETE`, `DRAFT`, `SUBMITTED`, … | "Setup in progress", "Draft — not live yet", "Awaiting review", … | `admin-labels.ts`; raw code kept under Technical details |
| Consultants onboarded by the old console | "Direct consultants (current case workflow)" | they are approved for live case assignment, separately from provider organizations |

## 5. Consultant onboarding — before / after

Before: one long page (invite form, a UUID "working on profile" bar, credential form, approve/reject), no provider
profile/evidence/activation UI at all.

After: **Add consultant** (`ConsultantOnboardingWizard`) — four milestones mapped onto the unchanged backend readiness:

| Milestone | Backend it groups | "Done" when (backend fields only) |
|---|---|---|
| 1 Consultant details | `POST members/invite` (or legacy `POST /admin/practitioners` for a direct consultant), membership activation | `identityProvisioned && organizationMembershipActive` |
| 2 Professional setup | `PUT …/profile`, `GET credential-requirements`, evidence presign → upload → `confirm` → `POST …/credentials`, `SUPERVISES` relationship | `clinicianProfileComplete && requiredCredentialsSubmitted && requiredRelationshipsComplete` |
| 3 Working setup | Pricing panel, Availability panel | pricing/availability complete where required |
| 4 Review & activate | `GET readiness`, `POST …/activate` | onboarding status `ACTIVE` |

Each screen: title, one-sentence explanation, progress (`<ol>` with `aria-current="step"`), Back / Continue /
**Save & continue later** (every section saves on its own), readiness blockers shown beside the step that fixes them
(`blockerInfo()` maps each backend blocker code to its milestone), field-level validation. Resume lands on the first
milestone the backend reports incomplete. Readiness semantics were not changed.

After onboarding, **Consultant workspace** (`ConsultantWorkspace`): Overview · Credentials · Practice relationships ·
Pricing · Availability · Readiness, with "Continue setup" only while not active and a grouped "More actions" menu.
No activity/history tab: there is no per-clinician history endpoint (debt §15).

## 6. Credentials

Credential reviews is an operational queue (oldest first) naming the credential, the clinician and the organization;
filters: organization, type, status; a "Direct consultant approvals" view for the current workflow. The review page
names the credential and person, lists evidence as "Document 1…" (secure short-lived link), and separates the primary
decision from "Request a correction" and the destructive Reject/Suspend. Self-review and submitter-review blocks,
reason requirement, idempotency keys and capability-per-decision mapping are unchanged. Per-consultant credential
records live in the consultant workspace. "Expiring / attention" aggregate is not built (no cross-org credential list).

## 7. Pricing & Availability

Moved out of onboarding pages into **Commercial setup** (pick organization → clinician by name) and into the
consultant workspace/wizard step 3. The inheritance is shown as an ordered visual (Organization default →
Consultant override → Associate doctor override); the effective price is still the backend's `prices/effective`.
The old console's catalog is split into Direct consultant price lists, Care-area templates and Exchange rates
(FX no longer hidden behind picking a consultant).

## 8. Access & governance

One component family inside the shell (`AccessGovernance view=users|roles|effective|permissions|audit`):
- **User access** — find a person by name (provider members + care staff; account-identifier fallback under
  "Advanced"), see current access, **Give access** (role → scope → validity → review & confirm; newest published
  version by default, version picker under Advanced), remove access from a row menu with a reason.
- **Roles** — list → detail (what this role allows; versions/channel under Advanced) → **5-step wizard**:
  Role purpose · Permissions · Scope (actor/channel under Advanced) · Restrictions & checks (validate + simulate) ·
  Review & publish. All eleven former inputs are preserved; lifecycle/versioning/maker-checker unchanged.
- **Effective access** — "why can / can't they?" per action, from the backend decision reason; searchable/filterable.
- Permissions (search) and Audit (load more) unchanged in behaviour.

## 9. Buttons/actions relocated (highlights)

Refresh buttons removed from headers (reads refresh after each action); per-row Activate/Deactivate/Readiness/Assign
→ one row action menu (destructive last, separated, red); Verify/Reject → primary / secondary / destructive;
"Invite member" per tab → "Add consultant" (wizard) + "Add practice team member" (dialog); console account actions
(resend/disable/restore) → row menu + Account access tab.

## 10. Functionality parity checklist (old function → new location → tested)

| Old function | New location | Test |
|---|---|---|
| Console: invite consultant (`POST /admin/practitioners`) | Add consultant › "Directly with RehletShifaa" | `ConsultantOnboardingWizard.test` |
| Console: register credential (`POST /admin/practitioners/{id}/credentials`) | Direct consultant › Case approval | `CareOperations.test` (approval tab) |
| Console: approve / reject (`…/decision`) | Direct consultant › Case approval | `CareOperations.test` |
| Console: consultant access resend/disable/enable | Consultants › Direct row menu; Direct consultant › Account access | `CareOperations.test` |
| Console: staff invite incl. `_LEAD` composite | Staff & teams › Invite staff member | `CareOperations.test` |
| Console: staff teams & leads, account actions, read-only for auditor | Staff & teams | `CareOperations.test`, e2e `portal-ux` |
| Console: care-area templates (list/add/toggle) | Pricing › Care-area templates | typecheck + manual |
| Console: per-consultant catalog edit/add/deactivate/derive/CSV import/preview/template | Direct consultant › Price list; Pricing › Direct price lists | `CareOperations.test` (derive) |
| Console: FX pin / display currency | Pricing › Exchange rates; price list "View prices in" | `CareOperations.test` |
| Portal: Identity review queue | Identity checks (same component) and unchanged portal identity role | typecheck |
| Org list/create | Organizations + dialog | `ProviderOrganizations.test` |
| Org overview/clinical/practice/onboarding tabs | Organization › Overview / People / Setup & activation | `ProviderOrganizationDetail.test` |
| Role pages: invite per role, activate/deactivate, readiness, relationship assign, pricing/availability links | Organization › People (menus, dialogs), Practice team, Consultant workspace | `ProviderOrganizationDetail.test` |
| Provider activation | Organization › Setup & activation | `ProviderOrganizationDetail.test` |
| Credential queue + filters + `?org=` | Credential reviews | `CredentialQueue.test` |
| Credential review decisions, self/submitter block, evidence | Credential review | `CredentialReview.test` |
| Pricing (create/edit/approve/publish/retire, effective) | Consultant workspace › Pricing; Commercial › Pricing | `PricingManagement.test` |
| Availability (slots, exceptions, remove) | Consultant workspace › Availability; Commercial › Availability | `AvailabilityManagement.test` |
| Roles: list/detail/draft/edit/validate/simulate/publish/retire | Access › Roles (5-step wizard) | `AccessGovernance.test`, e2e `access-governance` |
| Permissions / Audit / Effective access | Access › Permissions / Audit / Effective access | `AccessGovernance.test` |
| Assign / revoke role version (`AccessAssignments`) | Access › User access (Give access / Remove access) | `AccessGovernance.test` |
| Coordination, Journeys (list/versions/designer tabs) | unchanged screens inside the shell; journeys under `/control-center/journeys` | existing tests + `routes.test` |
| Old URLs | redirects | `routes.test` |

**Newly exposed (existing APIs that had no UI):** provider profile completion, credential requirements, evidence
upload + submission, clinician activation, identity-operation reconcile ("Finish account setup").

## 11–12. Responsive / RTL / accessibility

Desktop: 264 px sidebar; tablet (≤1200 px): 220 px sidebar, wizard summary stacks; mobile (≤900 px): sidebar becomes a
labelled "Menu · current section" disclosure, lists become stacked rows, wizard shows markers with only the current
label, Back/Continue bar is sticky. Logical properties throughout; RTL mirrors the active-item bar, breadcrumbs and
menus; progress order is not mirrored conceptually. A11y: skip link, one `h1`, breadcrumb `nav` + `aria-current`,
tabs with `role=tab`/arrow keys (RTL-aware), dialogs via the existing focus-trap, menus with arrow/Escape, field
errors announced, status = icon + text, 40–44 px targets. Full audit remains Phase 8C.

## 14. Backend change (one read-only field)

`ProviderOrganizationService.MemberView` gained `displayName` (practitioner profile name, else the invitation's or
staff record's encrypted name; decrypt failure → `null`, never an error). No schema, permission or behaviour change.
Test: `ProviderOrganizationIntegrationTest` asserts the invited member's name.

## 15. Remaining UX debt

- No cross-organization people/credential endpoints: directory and queues fan out per organization (bounded by the
  caller's organizations); an "expiring credentials" view needs a real read.
- Professional details cannot be pre-filled (no read of registration/qualifications).
- No per-clinician activity/history; Access audit shows raw actor/entity only under Advanced.
- Legacy direct-consultant credentials have no list endpoint; only record + decide are possible.
- Organization profile edit (`PUT /admin/providers/{id}`) still has no UI.
- Care coordination and Journey Designer internals were only re-homed (shell, breadcrumbs, routes), not redesigned.
- Repository-wide `react-hooks/set-state-in-effect` lint pattern is followed, not resolved.
