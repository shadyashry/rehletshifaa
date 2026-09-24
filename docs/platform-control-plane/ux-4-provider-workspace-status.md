# UX-4 — Provider Workspace, V-3 provider case read, V-11 self read

Date: 2026-09-24 · Branch: `codex/platform-control-plane` · Base: UX-4A `3f9246a` (UX-3 `cb72a42`, UX-2 `d418350`,
UX-1 `c8272b5`, UX-0 `d031450`)
Scope: plan §11 row UX-4 only, bounded by the frozen decisions
([ux-4-provider-workspace-decisions.md](ux-4-provider-workspace-decisions.md)) and matrix
([provider-persona-data-access-matrix.md](provider-persona-data-access-matrix.md), unchanged by this phase). No Access &
Governance (UX-5), credential lifecycle (UX-6), Coordination (UX-7) or Commercial/Journey (UX-8) redesign; no Phase 8C.
Journey production intake stays OFF. No migration, no authorization-model change, no role-version change, no Keycloak role.

## 1. Workspace architecture

| Piece | What it is |
|---|---|
| `/{locale}/portal/practice` | **My Practice** — the Provider Workspace page (`ProviderWorkspace.tsx`). Portal page family (site header/footer, account menu, language switch), one h1, its own section navigation. Never the Control Center shell or sidebar. |
| Landing (`Portal.tsx`) | A signed-in person with **no RehletShifaa staff workspace** whose V-11 read returns at least one practice is sent to My Practice. Identity-system accounts carry the realm default role `PATIENT` (verified in the running Keycloak: `default-roles-rehletshifaa` includes `PATIENT`; provider invitations do not remove it), so "only PATIENT" is not treated as "a patient". Patient entry links (`activate`, `link`, `case`, `continue`) and `?workspace=care` keep My Care reachable. Patient reads are deferred until the practice read answers, so the hop loads no patient data. |
| Composition (`provider-workspace-model.ts`) | Sections come from V-11 decisions only (`sections()`); persona labels are presentation only; *Manage organization* needs an owner/practice-manager role **and** an administration decision; attention items only from real facts. |
| Reads | V-11 `GET /api/v1/provider-workspace/me` (self) and V-3 `GET /api/v1/provider-workspace/cases?page=` (own assignments). Everything else is an existing, already-authorized endpoint. |
| Workspace switch | RehletShifaa staff who also work with a provider see *Workspace: Staff Portal · My Practice* on My Practice, and a *My Practice* link in the Staff Portal's workspace row. Each page keeps its own navigation; nothing is mixed. |
| Existing panels | Own/managed credentials, schedule and prices reuse the existing Control Center panels (`CredentialRequirements`, `AvailabilityManagement`, `PricingManagement`) inside a `.cc.cc-embedded` wrapper, fed the V-11 decisions for that one clinician (new optional `decisions` prop; `/admin/access/me` cannot report SELF/MANAGES grants — UX-3 debt). |

## 2. Persona-by-persona surfaces

| Persona | Landing | Sections (only when V-11 says the backend would serve them) | Never shown |
|---|---|---|---|
| **Provider consultant** | My Practice | Home (attention: own credential needs information, assigned cases; *You in this practice*: organization, role, own setup status, S-REL) · My cases (V-3) · My credentials (status/dates, view only) · My schedule (view only) · My prices (prices in effect, view only) | Manage organization (despite the seeded org-wide relationship grant), schedule edit, price approval/edit, cost estimate, drafts awaiting approval, clinical content, contact, travel, amounts of any proposal |
| **Associate doctor** | My Practice | Same model; *Supervised by* their consultant; My cases = own assignments only | Supervisor's cases, organization patient lists, independent price management |
| **Practice manager** | My Practice | Home (attention: managed clinicians still in setup; *Manage organization*) · My clinicians (managed clinicians with setup status; per clinician *Prices* / *Schedule* only where the V-11 decision allows; existing editors, clinician-scoped) | Any case/patient row, proposal/travel summary (future rows), organization-wide price changes (§9) |
| **Consultant assistant** | My Practice | Home only: *You assist* S-REL and "No supported practice tasks are available right now." | Schedule (see §9: not executable anyway), cases, prices, credentials, organization browsing |
| **Organization owner** | My Practice | Home: organization facts, *Manage organization* → `/portal/control-center/providers/{org}` | Cases, counts, commercial/price/schedule administration (owner role grants none) |
| **Staff + provider** | Staff Portal (their existing landing) | *My Practice* link in the workspace row; My Practice shows *Workspace: Staff Portal · My Practice* | Staff queues inside My Practice; provider sections inside the Staff Portal |
| **Direct doctor also enrolled** | Staff Portal | My cases links to the Consultant workspace instead of repeating V-3 (decision §8) | Duplicate case list |

A person holding several roles in one organization gets the union of what each role's decisions allow. Several
organizations: a labelled **Practice** selector lists only V-11 practices (active memberships), keeps `?org=`, and moves
focus to the page heading after a change.

## 3. V-3 — provider case read (`ProviderCaseSummaryService`, `ProviderCaseController`)

`GET /api/v1/provider-workspace/cases?page={0..500}` → `{ items: CaseSummary[], page, hasMore }`, 20 per page, `Cache-Control:
no-store`, no total. No case id, subject or organization parameter; no per-case endpoint (an unrelated case is
indistinguishable from a missing one).

`CaseSummary` = `caseNumber`, `patientDisplayName`, `caseStatus`, `assignmentStatus`, `assignedAt`, `proposalStage`,
`proposalDocumentType` — S-ID + S-STATUS + S-PROP exactly. No internal id, contact, DOB, identity document, clinical text,
documents, messages, tasks, timeline actors, amounts, margin, fees, finance policy, travel or routing metadata.

Query (2 statements per page): the caller's `case_assignments` rows joined to the case; the relationship must reach the
caller's **own provider enrollment** (`practitioner_profiles` → `clinician_onboardings`, not offboarded/suspended) in an
organization that is not offboarded, where the caller's **membership is active now** (the Assignment Engine's provenance).
Then the latest non-superseded proposal version per case on the page (status + document type only). Stage mapping:
`CLINICAL_DRAFT`/`CLINICALLY_APPROVED`/`OPERATIONS_COMPLETED`/`FINANCE_APPROVED` → IN_PREPARATION; `RELEASED`/`VIEWED` →
RELEASED; ACCEPTED/DECLINED/REVISION_REQUESTED/EXPIRED as is; no version → NONE.

## 4. V-3 assignment-state semantics

`case_assignments.status` ∈ `PENDING | ACTIVE | DECLINED | ENDED` (V2 check constraint).

| State | Meaning today | Existing `authorizeRead` | V-3 |
|---|---|---|---|
| PENDING | Case offered to the clinician; they accept or decline it ("You've been assigned to this case — accept to start your review") | readable | **readable** — shown as *Offered to you* |
| ACTIVE | Accepted / in the clinician's work | readable | **readable** — *Assigned to you* |
| DECLINED | Clinician declined | not readable | not returned |
| ENDED | Returned, reassigned or closed out | not readable | not returned |

PENDING is a legitimate offered assignment under the existing rule, so parity is kept (the UX-4A Phase 8D note on PENDING
identity exposure stands). V-3 is **narrower** than `authorizeRead`, never broader: only `assignee_role='DOCTOR'`
assignments, only through an active provider membership. A coordinator/operations/finance assignment row held by the same
person, or a Direct-model assignment without a provider enrollment, is not returned. No new assignment rule was created.
Provider clinicians still cannot be assigned while activation is fail-closed, so the list is empty in practice: *No
assigned cases yet. Cases will appear here when you are eligible for assignment and a case is assigned to you.*

Multi-organization clinician: the data model has no per-case organization beyond the enrollment, so the list is personal
(across the caller's practices) and carries no organization column rather than guessing one.

## 5. V-11 — self capability / relationship read (`ProviderWorkspaceService`, `ProviderWorkspaceController`)

`GET /api/v1/provider-workspace/me` (no parameters) → `{ practices: Practice[], truncated }`, `no-store`.

Per active membership (≤ 20) in a non-offboarded provider organization **where the caller holds a provider persona role**
(Owner, Practice manager, Consultant, Associate doctor, Consultant assistant; a RehletShifaa staff role at an organization
is not listed):
- organization id/name/status; the caller's provider role keys (active assignment, published version);
- own clinician enrollment (practitioner id, name, type, stored onboarding status, provider-credentialing flag) with
  decisions on the **own clinician resource**: `credential.view`, `price_list.view`, `availability.view` (no submit,
  manage, manage_self or approval keys are asked for);
- S-REL both directions (≤ 50 each): *I manage/assist/supervise* (counterpart = clinician name) and *manages/assists/
  supervises me* (counterpart = member display name); revoked and ended relationships omitted;
- clinicians the caller **currently MANAGES** (active relationship, ≤ 25, `managedCliniciansTruncated`), with setup and
  membership status and decisions on that clinician: `price_list.view/manage/publish`, `availability.view/manage`;
- organization decisions: `provider.view/update/member.invite/clinician.invite/practice_staff.manage/relationship.manage`.

Every decision is `AuthorizationService.decide` on the **same resource context and channels as the downstream endpoint**
(organization: CONSULTANT_WEB, ADMIN_WEB; credential: + API; price/availability: CONSULTANT_WEB, API); a held capability
that needs a fresh sign-in is reported with `recentAuthentication`, as `/admin/access/me` does. `/admin/access/me` is
unchanged. V-11 authorizes nothing; it only composes the page.

## 6. Privacy enforcement and data minimization

- Membership alone reaches no case: V-3 is keyed on the caller's own assignment; MANAGES/ASSISTS/SUPERVISES and ownership
  are not inputs (tested for manager, assistant, owner, plain member, other-organization owner, stranger).
- Server-shaped: the two new responses contain only the fields above; the V-3 record shape is asserted by test.
- No broad fetch + React filtering: every workspace request is either V-3/V-11 or an existing per-clinician endpoint the
  caller is authorized for (own or managed clinician). The workspace never calls `/admin/providers` lists, organization
  detail, member lists, `/doctor/**`, `/coordinator/**` or any case workspace.
- Own prices view shows only versions in effect (`appliedOnly`): no drafts, no "awaiting Consultant approval" prompt for
  an approval the consultant cannot record. Credentials show status and dates only (no evidence, reviewer or free text).
- Practice-manager price editing is clinician-scoped (`clinicianScopeOnly`, §9).

## 7. Unsupported / future rows intentionally absent

No UI (no disabled teaser, no "coming soon") for: clinical documents/notes/diagnosis; consultant cost estimate
(S-OWNCOM estimate); consultant price approval; schedule self-edit (future business decision); practice-manager case
identity/status/proposal/travel summaries; assistant case/status/travel rows (not currently supportable); assistant
schedule narrowing; owner commercial/price/schedule administration and S-AGG case counts; relationship management,
member lists and invitations for clinicians/assistants; Access & Governance, Journey administration, coordination/routing
configuration and finance policy for any provider persona.

## 8. Existing broad grants and mismatches (for Phase 8D / UX-5; the matrix is not edited here)

| # | Finding | Evidence | UX-4 handling |
|---|---|---|---|
| M-1 | Consultants/associates/assistants hold organization-wide `provider.view`; consultants organization-wide `provider.relationship.manage` | seeded grants; V-11 reports them (test) | Not surfaced: no Manage organization, no member lists, no relationship management for them |
| M-2 | **Role-version drift.** Invitations assign Consultant/Associate **v3** (credential cutover, no own price/schedule view) and Practice manager **v2** (no MANAGES setup grants). The v4/v3 versions that grant them lack the credential cutover (v4 consultant/associate: `credential.view` SELF → INVALID_CONFIGURATION). So a freshly invited consultant can see own credentials but not own prices/schedule; an invited practice manager cannot manage anyone's prices or schedule until reassigned through Access Governance | `ProviderOrganizationService.ROLE_VERSIONS`; V34/V35 cutover inserts; `ProviderWorkspaceIntegrationTest` asserts the real decisions | Workspace shows exactly what the held version allows (sections appear/disappear with the decision). Matrix §1 "latest seeded versions" table describes grants, not what invitations assign — needs a governance decision (UX-5 / Phase 8D), not a UX-4 change |
| M-3 | Assistant organization-wide `availability.view` is **not executable**: V35 limited the permission's actor types to PRACTICE_OPERATIONS/CONSULTANT/ASSOCIATE_DOCTOR and the assistant version has no cutover | test: assistant `schedule()` → ACCESS_DENIED | Nothing to narrow today; matrix row "SUPPORTED TODAY (broader: org-wide)" is stricter in practice. Record for the matrix owner |
| M-4 | A MANAGES-scoped `price_list.manage/publish` holder can create, edit, publish and **retire organization-wide prices** through any managed clinician's route (organization rows have no clinician id), affecting clinicians they do not manage | `ProviderOperationalSetupService.createPrice/updateDraft/publish/retire` | Not offered in the workspace (`clinicianScopeOnly`); backend breadth recorded |
| M-5 | Provider-invited identity accounts keep the realm default role `PATIENT` (`inviteTracked` passes no role; default-roles composite includes `PATIENT`), so they pass the `/patient/**` route gate (their own, empty, patient data only) | live Keycloak read-only check; `KeycloakStaffIdentityService.invite` | Landing handles it; the role grant itself is an identity finding |
| M-6 | V-3 exposes S-ID for PENDING (offered) assignments — `authorizeRead` parity | §4 | As decided in UX-4A |
| M-7 | Direct doctor `CaseWorkspace` breadth (deposit, coordinator notes) vs S-OWNCOM | UX-4A §12.8 | Unchanged; the Provider Workspace links to the Direct workspace instead of duplicating it |
| M-8 | `PricingManagement` reads `/onboarding` (org-wide `provider.view`) to learn the clinician type and owner | existing panel | Kept (own/managed clinician only) |

## 9. Performance and request counts

| View | Browser requests (live, mocked data) |
|---|---|
| `/portal` hop → My Practice (consultant) | 4: `/admin/access/me` (account-menu entry), `/provider-workspace/me`, `/account/preferences`, `/provider-workspace/cases?page=0` — no patient reads |
| Consultant / associate Home, My cases | 3 (V-11, preferences, V-3 page 0) |
| My credentials · My schedule | +2 each (existing per-clinician reads) |
| My prices | +2 + one effective-price read per active service (existing panel behaviour) |
| Practice manager Home / My clinicians | 2 (no V-3) |
| Practice manager › clinician Prices | +2 + effective reads, per selected clinician only |
| Assistant, Owner Home | 2 |

No per-clinician fan-out on load: managed clinicians' facts and decisions arrive in the one V-11 response. Server side,
V-11 is bounded: 1 membership query, then per organization (≤ 20) ~5 queries plus decisions — 6 organization + 3 own + 5
per managed clinician (≤ 25), each an existing `AuthorizationService` evaluation (a few indexed queries). Typical
consultant ≈ tens of queries; worst case (a practice manager with 25 managed clinicians) is a few hundred in one request —
bounded, and a batching candidate if real practices grow. V-3: 2 queries per 20-row page.

## 10. Tests

Backend — `ProviderWorkspaceIntegrationTest` (14): assigned consultant gets only the approved fields (record shape
asserted); PENDING/ACTIVE visible, DECLINED/ENDED/coordinator-role rows not, ending removes at once; associate sees own case
never the supervisor's; manager, assistant, owner, plain member, other-organization owner and stranger get nothing;
cross-organization and revoked membership denied; Direct assignment without enrollment not returned; paging 20/1 with no
total and other callers' volume irrelevant; bad pages rejected; proposal stage summary; V-11 has no subject parameter,
lists only the caller's organizations, excludes staff-role organizations; consultant/associate own decisions and
relationships; practice manager's managed clinicians with decisions **equal to** `AuthorizationService` on the same
resource (parity helper), relationship revocation removes them and the endpoint refuses; assistant ASSISTS only and no
schedule read; owner administration only; two organizations, revocation drops one; hidden navigation ≠ control (own price
create refused).

Frontend — `ProviderWorkspace.test.tsx` (18): personas A–F (landing, navigation, absent areas, truthful empty states,
no case/patient leakage, Manage organization only for owner/practice manager, request lists), case summaries and paging,
view-only schedule/prices (no edit/publish/approve/retire, no drafts), practice-manager clinician-scoped editing (no
organization-price actions), Direct-doctor link, multi-practice selector + focus, Arabic, failed read + retry, no-practice
fallback; model rules (capability-derived sections, Manage organization rule, attention). `PortalEntry.test.tsx` (+4):
default-PATIENT provider → My Practice with no patient reads, `?workspace=care` keeps My Care, staff keep their workspace
with a My Practice link, plain patient unaffected.

## 11. Visual sanity (limited; not Phase 8C)

Canonical base + tunnel rebuild, temporary Playwright script (scratchpad, not committed), synthetic session (realm roles
`PATIENT` — the real default — or `COORDINATOR` for the mixed persona), mocked reads, **every write refused (none
attempted)**. 19 views: EN desktop — `/portal` hop, consultant Home/cases/credentials/schedule/prices, practice-manager
Home and clinician Prices, assistant, owner, mixed staff, practice switch; EN mobile 390 — consultant Home/cases,
practice-manager clinicians; AR desktop — consultant Home/cases; AR mobile — consultant Home, practice-manager clinicians.

| Check | Result |
|---|---|
| Horizontal overflow · landmarks · h1 | none · one `main` · one h1 on all 19 |
| Console/page errors · writes | none · none |
| Found and fixed | (1) the `/portal` hop fired patient reads and the patient-session POST before the practice read started (hook reported "not loading" on the first signed-in render) — result now keyed to the subject; (2) *My Care* switch offered to every provider person (default PATIENT role) — removed; (3) practice-manager price panel offered *Retire*/edit on the organization-wide price (M-4) — clinician-scoped mode |
| RTL | `dir=rtl`, navigation and cards mirror, mixed Arabic/English names `<bdi>`-isolated, case numbers LTR-isolated |

## 12. Accessibility and mobile (baseline; formal validation is Phase 8C)

One h1; labelled `nav` landmarks (*Workspace*, *My Practice sections*) with `aria-current`; section change moves focus to
the section h2, practice change to the h1; statuses are icon + text; case rows are plain list items (no clickable
container, no nested controls); per-clinician buttons carry the clinician name for screen readers; the practice selector
has a visible label; failures are `role="alert"` with *Try again*; touch targets ≥ 44 px. Mobile: stacked case and
clinician cards, wrapping section pills, attention first, no tables, no horizontal scroll.

Arabic terms needing native review (V-9): عيادتي · أقسام عيادتي · حالاتي · اعتماداتي · جدولي · أسعاري · أطبائي · إدارة الجهة ·
يحتاج إلى انتباهك · أنت في هذه العيادة · معروضة عليك · مسندة إليك · لدى المريض · تقدير مبدئي · عرض سعر نهائي · يديرك · يساعدك ·
يشرف عليك · بوابة الفريق.

## 13. Remaining debt (UX-5+ / Phase 8D)

- **UX-5 (Access & Governance):** M-2 role-version drift (which versions invitations assign; credential cutover for
  v4) and M-5 default PATIENT role — access-model decisions, not workspace UX; offboarding (V-6).
- **Phase 8D:** M-1, M-3, M-4, M-6, M-7; V-3 as the first provider-persona patient-data path outside the realm-role gate;
  V-11 query volume for large practices.
- **Control Center:** its clinician Prices/Schedule tabs still read `/admin/access/me` (no SELF/MANAGES), so practice
  managers use My Practice for those edits; wiring V-11 decisions into the Control Center clinician page is UX-5/UX-6 work.
- Direct-model case work stays in the Consultant workspace; a person with a real patient record and a provider role
  reaches My Care via patient links or `?workspace=care`.
- Frontend suite: 1 intermittent failure in 1 of 12 full runs (not reproduced in the next 10; the failing test name was
  not captured). Tracked as environment timing; re-check in Phase 8C.

## 14. Acceptance

| Criterion | Result |
|---|---|
| Provider personas have a truthful workspace; none lands in a misleading no-role state | YES (incl. the default-PATIENT landing) |
| Workspace separate from Control Center | YES |
| V-3 narrow, server-authorized, assignment-scoped | YES (§3–4) |
| V-11 self-only, read-only | YES (§5) |
| No future/unsupported capability exposed | YES (§7) |
| Consultant/Associate cannot browse unrelated patients | YES (tests) |
| Practice manager sees only supported administrative/provider data | YES (clinician-scoped editing, no case rows) |
| Assistant receives no schedule/case access | YES |
| Owner gets no patient access through ownership | YES |
| Mixed-role switching understandable | YES |
| No client-side-only privacy enforcement; no overexposure | YES (§6) |
| Mobile and RTL sanity | YES (§11–12) |
| Frontend and backend tests pass | YES (test-status.md) |
| No UX-5+ redesign | YES |

### UX-4 COMPLETE: YES

### UX-5 READY: YES

Remaining items are Access & Governance decisions (M-2, M-5) and Phase 8D review findings; none is an unresolved
provider privacy or security defect introduced or left open by the workspace.
