# RehletShifaa — UX implementation plan (UX-0 design freeze)

Date: 2026-09-23 · Branch: `codex/platform-control-plane` · Base: Phase 8B complete (`2f19ed0`), admin UX `44dd629`
Status: **FROZEN design direction. No UI implemented.** Phase 8C not started. Journey production intake OFF.

This is the canonical handoff for UX-1 … UX-8. Evidence and original findings (UX-001 … UX-040) are in
[platform-ux-audit.md](platform-ux-audit.md); where this plan and an earlier audit recommendation disagree,
**this plan wins** (the audit marks those recommendations as superseded).

---

## 1. Approved product decisions

### A — Consultant models
- DIRECT and PROVIDER-ORGANIZATION consultants **stay separate backend/business models**. No backend merge.
- Admins get **one `Clinicians` directory**. Each row states its engagement model — *Direct with RehletShifaa*
  or *Through a provider organization* — and its real operational capability: **Can receive cases**, **Setup in
  progress**, credential status, organization.
- The two models must not look identical where behaviour differs. Clinician detail is one page family;
  model-specific sections and actions are allowed where genuinely required (e.g. Direct: legacy case approval and
  price list; Provider: readiness, credential dossiers, organization-derived prices).
- Direct is **potentially transitional**. It is not retired until functional parity and migration criteria are
  proven (§14, assumption V-1).
- Truth constraint: today only Direct consultants can receive cases. Provider clinicians cannot reach
  `readyForActivation` while commercial & legal acceptance is fail-closed. The directory says so.

### B — Provider personas: Workspace vs Control Center
- Provider-side users **do not land in the general Control Center** by default.
- **Workspace** = daily work. **Control Center** = configuring and administering the platform.
- Target per persona (existing capabilities and scopes only; no authorization-architecture change):

| Persona | Default landing | Contents |
|---|---|---|
| Provider consultant | Provider Workspace | My work · My cases · My practice · My schedule · My credentials · Prices needing my approval (where existing capability permits) |
| Associate doctor | Provider Workspace | Same operational model, plus supervision context (who supervises me) |
| Practice manager | Provider Workspace | Clinicians I manage · schedules · setup status · commercial tasks allowed by existing permissions · practice staff |
| Consultant assistant | Provider Workspace | Only the clinicians and tasks I support · schedule · existing scoped capabilities |
| Organization owner | Provider Workspace | Plus a clear **Manage organization** entry into scoped Control Center administration, when authorized |

- Unrelated platform-admin navigation is never shown merely because a capability technically exists.
- Any patient/case data in the Provider Workspace is gated by the minimum-necessary verification (P0-9).

### C — Shadow routing
- A routing command that does not change the live case is **never** labelled Assign, Reassign or Transfer.
- Everyday operations show only **authoritative** live assignment/transfer commands.
- Shadow functionality lives only under **Coordination Setup › Advanced**, labelled
  **Preview routing recommendation**, with the copy:
  *"Evaluation only — this will not change the case owner or the person assigned to this work."*
- `SHADOW` / `LIVE` are not business-facing labels. Operational users never see rollout-engine terminology.

### D — Activation states
| Case | Condition | UX |
|---|---|---|
| 1 | Action not relevant to this user/state | **Hide** |
| 2 | Relevant, waiting for achievable prerequisites | **Show disabled with blockers**: *"Not ready to activate · Waiting for: Independent credential review."* |
| 3 | Cannot be completed in the current release | **No disabled primary button.** Informational status (copy below) |

Case 3 copy: **Activation isn't available yet** — *"Commercial & Legal Acceptance must be completed before this
organization can receive cases. That step isn't available in the current release. You can complete the remaining
setup now. No cases will be routed to this organization until activation becomes available."*

All backend readiness and activation gates stay. Commercial & Legal Acceptance is never bypassed or hidden as
"complete".

---

## 2. Final Control Center IA

```
CONTROL CENTER
Home                        What needs my attention?
Providers
  Organizations
  Clinicians                one directory, both engagement models
  Practice Staff
Reviews & Safety
  Credential Reviews
  Identity Checks
Commercial
  Price Lists
  Exchange Rates
  Margin & Deposit          moved from the Finance portal <details>
Operations
  RehletShifaa Staff
  Coordination Setup        Pools & People · Clinician Preferences · Rules · Advanced
Care Journeys
  Journeys
  Journey Design / Publishing
Access & Governance
  People
  Roles
  Audit                     (permission catalogue kept as an advanced reference, not a sidebar item)
```

- No target number of groups. *Care Journeys* stays separate: design/publishing is product governance, not
  coordination configuration.
- Navigation is permission-gated; users see only sections they can open.
- **Home** answers *"What needs my attention?"*: attention items from real reads, pending review/setup work,
  persona-relevant shortcuts. No destination grid, no fabricated metrics. Navigation stays in the sidebar.
- The Control Center uses an app shell (no public marketing footer).

## 3. Workspace vs Control Center principle

| | Workspace | Control Center |
|---|---|---|
| Question | "What do I do next?" | "How is the platform/organization set up?" |
| Users | Coordinators, finance, operations, clinicians, provider personas | Admins, provider operations, reviewers, commercial, access, journey managers |
| Language | *My work, My cases, My schedule* | Objects and configuration |
| Surfaces | Staff Portal (RehletShifaa staff) · Provider Workspace (provider personas) · My Care (patients) | Control Center |

A person may have both. They land in their workspace; the Control Center (or *Manage organization*) is one
persistent link in the header/account menu. Admin-only users land directly in the Control Center.

## 4. Consultant Setup model

**Step 1 — `Add Consultant`** (one short screen): name · email · organization · clinician type · engagement model
· invitation language · only other *existing* mandatory invite facts. The backend audit reason is prefilled and
under Advanced. → lands on **Consultant Setup**.

**Consultant Setup** is a persistent workspace/checklist, not a linear wizard. Each section shows status, owner,
next action and who can act. Backend readiness rules are unchanged (`ProviderCredentialService.computeReadiness`).

| # | Section | Backend facts | Owner |
|---|---|---|---|
| 1 | Account | `identityProvisioned`, `organizationMembershipActive` | Provider Operations |
| 2 | Professional Profile | `clinicianProfileComplete`, `requiredRelationshipsComplete` (supervising consultant for associate doctors) | Provider Operations (clinician self-service later, if enabled) |
| 3 | Credentials Submitted | `requiredCredentialsSubmitted` | Provider Operations / clinician (`credential.submit`) |
| 4 | Independent Credential Review | `requiredCredentialsVerified`, `mandatoryCredentialsUnexpired` | **Credential Review Team** — status only here; decision controls live in Credential Reviews |
| 5 | Operational Setup | pricing, availability (when required), routing preference | Provider Operations / Commercial / Coordination Setup (deep links) |
| 6 | Activation | provider profile, owner, organization active, commercial & legal acceptance, `readyForActivation` | Provider Operations (`provider.activate`, recent auth, confirmation) |

Example rendering: *Professional Profile — Completed — Owner: Provider Operations* · *Credential Review — Waiting —
Owner: Credential Review Team* · *Operational Setup — Needs attention — Pricing / Schedule / routing*.
Section 6 follows Decision D (case 3 today). Provider Operations never sees reviewer controls in setup; independent
review, self/submitter blocks and reasons stay. The **Direct** model shows its own sections (Account, Profile,
Credential & case approval with confirmation, Price list, Account access).

## 5. Access & Governance model

- **People** (person-centred, primary): who this person is · accounts and workspaces · RehletShifaa business roles ·
  **Access summary** (inside it: *"Can this person…?"* → allowed/denied + reason) · how to change business access.
- **Roles** (first-class): what the role allows · where it applies · restrictions · versions/status.
- **Audit**.
- Authority sources are **visually separated by source**:

```
ACCOUNT & WORKSPACES                      BUSINESS ACCESS
Coordinator · Staff Portal                Provider Operations Manager · Al Noor Hospital
Managed by Identity System (read-only)    Managed by RehletShifaa (give / remove)
```

Realm/Keycloak roles are read-only and never presented as interchangeable with platform assignments. The
permission catalogue moves out of the sidebar to an advanced/reference surface (not deleted). Reason asked once,
at submit/publish; person picker for role simulation.

## 6. Credential lifecycle design principle

Credentialing is an **ongoing lifecycle**, not an onboarding step. Credential Reviews is its own operational
workspace. What the data model supports today (verified in `V34`, `ProviderCredentialService`):

| Lifecycle state | Today | How the UX may present it |
|---|---|---|
| Submitted | Revision `SUBMITTED` | Direct |
| Under review | `UNDER_REVIEW` via `START_REVIEW` | Direct; action label **Start review** / **Assign review to me** |
| More information required | `MORE_INFORMATION_REQUIRED` (reason required) | Direct |
| Verified (independent) | `VERIFY` from `UNDER_REVIEW`; reviewer ≠ clinician ≠ submitter; `reviewed_by`, reason, recent auth | Direct |
| Rejected | `REJECTED` (reason required) | Direct |
| Suspended / restored | `SUSPEND` (from VERIFIED) / `RESTORE`; revision + dossier `SUSPENDED` | Direct |
| Expired | Status value exists but **no provider job writes it**; expiry is computed at read time (`expires_at <= now` → `CREDENTIAL_EXPIRED` blocker) | Derive from `expires_at`; never rely on the stored status alone |
| Expiring | Not a state; derivable from `expires_at` per clinician | Derived label only; no reminder or cross-organization "expiring" query exists → future backend capability |
| Renewal submitted | Representable: a newer revision in the same dossier while an earlier VERIFIED one remains effective | Derived label; behaviour to verify (V-4) |
| Revoked | Dossier status `REVOKED` exists in schema; no command produces it | Future business decision / backend capability; do not show |
| Legacy unreviewed | `LEGACY_UNREVIEWED` provenance | Never shown as independently verified |

Preserve independent review, reviewer identity, reasons, evidence, expiry and audit history. Distinguish:
**document uploaded & scanned** (evidence `CLEAN`) ≠ **credential submitted** (`SUBMITTED`) ≠ **reviewed** (any
decision) ≠ **independently verified** (`VERIFIED`). Credential validity ≠ approval to receive cases
(`credentialReady` vs `readyForActivation` vs `ACTIVE`); clinical scope/privileging does not exist as a model
(future business decision).

## 7. Care coordination: operations vs configuration

| Daily operations → **Staff Portal** | Configuration → **Control Center › Coordination Setup** |
|---|---|
| My work · My cases · Team queue | Pools & People · Clinician Preferences · Rules |
| Authoritative Assign / Transfer / Reassign only | **Advanced:** Preview routing recommendation · routing simulation · decision history · technical configuration only when truly necessary |

Never collapse **Case Owner**, **WorkItem assignee** and **routing preference** into one concept; label each. People
by name, cases by case number (small read allowed), never UUIDs.

## 8. Terminology principles

Plain language, without simplifying away governance or clinical meaning. Frozen English direction:

| Use | Instead of / note |
|---|---|
| RehletShifaa staff · Practice staff | "Staff & teams" · "Practice team" |
| Schedule (clinician-facing) | Availability |
| *Where it applies* (helper for Scope) | "Scope" alone |
| Ready to activate | Readiness |
| Professional relationships — Manages · Assists · Supervises | "Works with" (superseded) |
| Access summary, containing *Can this person…?* | "Can they…?" as a page name (superseded) |
| Assignment history / Routing history | "Coordinator changes" (superseded) |
| Start review / Assign review to me | "Claim review" (insurance ambiguity; superseded) |
| Retire version + consequence copy | "Stop using" (superseded where versioned governance matters) |
| Direct with RehletShifaa · Through a provider organization | "Direct (current case workflow)" |
| Preview routing recommendation | Shadow / Assign-in-shadow |
| Care Journeys / Journey design | "Care pathways" (superseded: implies a clinical protocol; the engine models operational patient coordination) |

Arabic: draft glossary in the audit §31.7 — **not final; native Arabic healthcare-operations review required
before Phase 8C.**

## 9. Cross-cutting implementation safety rules

1. One page, one primary business job.
2. One obvious primary action per scenario.
3. An action appears only when the user is authorized **and** it makes sense in the current state **and** it really
   does what its label promises.
4. One canonical place to manage each concept; elsewhere link or summarize.
5. Advanced technical detail uses progressive disclosure.
6. No UUIDs, revision tokens, engine hashes or compiler/runtime details as ordinary business UX.
7. Never remove independent credential review, maker/checker, OTP, required audit reasons, activation gates or
   sensitive confirmations.
8. No backend architecture change for UX convenience.
9. Small read-only APIs are allowed where needed to present existing data truthfully.
10. Preserve redirects for old routes where reasonably possible.

## 10. Revised P0 (truthfulness / safety / material user error)

| ID | Item | Audit refs | Program |
|---|---|---|---|
| P0-1 | Provider personas have no home (red "no portal role" error) — truthful interim landing now; full workspace in UX-4 | UX-001 | UX-1 → UX-4 |
| P0-2 | False/unreachable activation (enabled *Activate organization*; disabled primary *Activate consultant*; "Needs action" with no action) → Decision D | UX-002 | UX-1 |
| P0-3 | Fake/no-op shadow Assign/Reassign → Decision C (remove from daily UI; Preview under Advanced) | UX-003 | UX-1 |
| P0-4 | Incomplete access picture across authority sources (realm roles invisible) → read-only *Account & workspaces* block (small read) | UX-004 | UX-1 (block) → UX-5 (People) |
| P0-5 | Professional details saved but shown blank / overwrite risk → small profile read, show and edit in place | UX-007 | UX-1 |
| P0-6 | Any reachable control that performs no real action (inventory all; e.g. `PAY_DEPOSIT` stub if reachable) | UX-035, §7 | UX-1 |
| P0-7 | Dangerous actions missing confirmation (Retire price; Approve for cases) → one confirmation pattern | UX-024/025/032 | UX-1 |
| P0-8 | Misleading permission/error states (coordination "You do not have access" for empty lists; raw errors that hide whether anything was saved; inconsistent re-authentication prompts) | §25, UX-031 | UX-1 |
| P0-9 | Minimum-necessary access verification (per-persona patient/case data matrix) **before** provider personas get new workspace exposure | new | UX-1 (analysis) gates UX-4 |
| P0-10 | Credential review missing the submitted issuer, reference number, issue date and jurisdiction: `VERIFY` attests facts the reviewer cannot see (`RevisionView` omits them). Classified **P0** because the reviewer cannot safely compare the claim against the evidence | UX-013 | UX-1 |

Everything else (shell, Home, one directory, onboarding shape, terminology, finance policy move, coordination
restructure, journeys) is **P1/P2** and lands in UX-2 … UX-8.

## 11. Implementation program

| Phase | Boundary (in scope) | Not in scope |
|---|---|---|
| **UX-1 Truthfulness & Safety** — **COMPLETE** (§15) | P0-1 interim landing, P0-2 … P0-8, P0-10; P0-9 written data matrix; small reads: professional profile, credential revision facts, person realm roles, and (approved fourth) the caller's own capability read. Same pages, truthful states | New IA, new pages, directory merge |
| **UX-2 Shell / Navigation / Home / Terminology** — **COMPLETE** (§16) | App shell without public footer; §2 IA and labels; permission-gated nav; attention-only Home; admin-only redirect to CC; Margin & Deposit route in CC; old-route redirects; EN terminology; AR draft labels behind review | Page restructures |
| **UX-3 Clinician Directory & Consultant Setup** — **COMPLETE** (§17) | One Clinicians directory (engagement + capability); Add Consultant screen; Consultant Setup checklist (§4); clinician page family with model-specific sections; clinician Schedule (retire Availability hub); organization default prices on the organization; membership confirmation in Organization › People + Home | Provider Workspace |
| **UX-4 Provider Workspace / Personas** — decisions frozen in UX-4A (§18); **COMPLETE** (§19) | Persona landing from existing memberships/capabilities; §1-B contents; *Manage organization* entry; patient/case data only as permitted by the approved P0-9 matrix; V-3 assigned-case summary read and V-11 self read | Keycloak role provisioning, new authorization, any FUTURE / NOT CURRENTLY SUPPORTABLE matrix row |
| **UX-5 Access & Governance** — **COMPLETE** (§20) | People (merge User access + Effective access), Access summary, Roles, Audit, permission reference; reason at publish; person picker; access-removal/offboarding summary | Changing the realm-role/platform-role split |
| **UX-6 Credentials & Provider Readiness** — **COMPLETE** (§21) | Credential Reviews workspace (typed rows incl. Direct approvals); derived lifecycle labels (§6); decision history where supported; organization Setup and profile edit (existing `PUT /admin/providers/{id}`); Ready-to-activate wording | Reminders, revocation, privileging |
| **UX-7 Care Coordination** — **COMPLETE** (§22) | Staff Portal Team queue with authoritative Assign/Transfer, names + case numbers; Coordination Setup (Pools & People, Clinician Preferences, Rules); Advanced (Preview routing recommendation, simulation, history); no org-picker hop | Routing-mode changes |
| **UX-8 Commercial / Care Journeys / Portal polish** — **COMPLETE** (§23) | Price Lists overview, Exchange Rates, Margin & Deposit polish; financial truthfulness copy (audit §31.8 E); Journeys publish checklist, Advanced engine detail, reason at submit, *Retire version* copy; staff/patient portal polish; representative context | Online payment, Journey production intake |

Each phase: focused unit tests + typecheck; update affected e2e specs; live visual check of touched pages.
Estimate: **~10–14 focused sessions** (UX-3, UX-4, UX-7 are L; the rest M). Risk: medium. Main risks: UX-4 may find
no existing case-read path for provider personas (then scope down, never fake); small read APIs; test churn; Arabic
review lead time.

## 12. Phase 8C / 8D relationship

- **Phase 8C** (formal E2E, visual, EN/AR, RTL, mobile, accessibility) runs **after UX-8**, on the redesigned UI.
  Entry condition: native Arabic review of the glossary done.
- **Phase 8D** (independent architecture/security/operations/red-team review) runs after 8C and receives the
  findings flagged here: offboarding completeness, re-authentication coverage, minimum-necessary enforcement,
  provider-persona data exposure.

## 13. Out of scope (UX program)

Backend authorization changes · merging consultant models · enabling or bypassing Commercial & Legal Acceptance ·
Journey production intake · Keycloak roles for provider personas · new credential functions (reminders,
cross-organization expiring queue, revocation) · clinical scope/privileging model · online payment · new patient
representative authority · Phase 8C/8D work.

## 14. Assumptions requiring later verification

| ID | Assumption | Verify in |
|---|---|---|
| V-1 | Direct retirement criteria: provider path reaches ACTIVE (commercial acceptance exists), routing/assignment uses provider eligibility, price parity, V33 legacy mappings reviewed/adopted, no case-history loss | Product, before any retirement |
| V-2 | Persona can be derived from existing memberships/capabilities (`/admin/access/me` + membership role types) without a Keycloak role. **UX-4A:** direction frozen with V-11 (labels from membership role types; sections from capabilities) | UX-4 start |
| V-3 | **Resolved in UX-1: no** provider persona has a case-read path. **UX-4A: APPROVED DIRECTION** — one assignment-scoped, read-only, server-shaped summary read (identity summary, status, proposal stage; no clinical or commercial content) keyed on the caller's own `case_assignments` row; never `CaseWorkspace`. Empty in practice until provider clinicians can be assigned — [ux-4-provider-workspace-decisions.md](ux-4-provider-workspace-decisions.md) §8 | UX-4 — **implemented** (§19): `GET /provider-workspace/cases` |
| V-4 | **Resolved in UX-6: yes.** A newer revision can be submitted while an earlier VERIFIED revision is effective; the earlier one keeps counting while the newer is pending or rejected (readiness `anyMatch`, integration test). The UI now shows the effective verified version with the newer version's state; the action is *Submit a new version* (no renewal workflow) | UX-6 |
| V-5 | **Resolved in UX-3: yes.** One bounded read `GET /admin/providers/clinicians` (stored setup facts + status-level credential summary, no readiness computation) replaced a 1 + O + 3C fan-out; see ux-3-clinicians-setup-status.md §11–12 | UX-3 |
| V-6 | Offboarding: membership deactivation, legacy staff/practitioner disable, role revoke and organization status are separate; no dedicated clinician offboarding command was found (OFFBOARDED is only guarded). **UX-5: mapped** (ux-5 record §13); People offers only the separate existing steps; gaps (provider member account disable, OFFBOARDED, reassignment) → Phase 8D | UX-5 — **mapped**; Phase 8D |
| V-7 | **Resolved in UX-1.** Every fetcher now routes `REAUTHENTICATION_REQUIRED` through one helper: explained before (shared `ErrorNotice`) or after (return notice) the sign-in round trip; a form cannot be restored after the reload (architecture limit, stated to the user) | Phase 8D (independent check) |
| V-8 | Which proposal/consent actions a `PATIENT_REPRESENTATIVE` may take. **UX-8:** the authenticated decision requires the PATIENT role + case read authorization; representatives carry the default PATIENT role (M-5). No UI change; any narrowing is a business decision | UX-8 — **recorded** |
| V-9 | Arabic glossary validated by a native healthcare-operations reviewer | Before Phase 8C |
| V-10 | "Clinicians" = physicians only today (`CONSULTANT`, `ASSOCIATE_DOCTOR`) → Arabic الأطباء; revisit if non-physician types are added | UX-2 |
| V-11 | `/admin/access/me` (capability read, fixed in UX-1) reports org-scoped grants only at organization level; self- and relationship-scoped grants are not claimed. **UX-4A: APPROVED DIRECTION** — one self-only, bounded read of memberships, own relationships and existing-`AuthorizationService` decisions on own/managed clinician resources; navigation only — decisions record §9 | UX-4 — **implemented** (§19): `GET /provider-workspace/me` |

## 15. UX-1 outcome (2026-09-23)

UX-1 is complete — record: [ux-1-truthfulness-safety-status.md](ux-1-truthfulness-safety-status.md); P0-9 gate:
[provider-persona-data-access-matrix.md](provider-persona-data-access-matrix.md).

- All ten P0 items are fixed or delivered. P0-3 was corrected against code: in SHADOW mode the backend *refuses*
  Assign/Reassign rather than recording silently.
- **Fourth approved read:** `/admin/access/me` returned only `access.*` decisions at platform scope, so every other
  capability-gated Control Center area showed "no access" to authorized people. It now reports the caller's own
  capabilities (platform plus the organizations of their active assignments) through the existing
  `AuthorizationService`. It is self-only, read-only, bounded and navigation-only.
- Backend read additions: capability read, workspace (realm) roles, professional profile, credential submitted
  facts. No write API, no migration, no authorization-model change.
- UX-2 can start; what remains is structural navigation and IA, not P0 truthfulness.

## 16. UX-2 outcome (2026-09-24)

UX-2 is complete — record: [ux-2-shell-navigation-status.md](ux-2-shell-navigation-status.md).

- The §2 IA is the sidebar: seven disclosure groups, current group expanded, a one-line group shown as one link;
  permission-gated through the UX-1 capability read and the existing legacy role gate (navigation only).
- The Control Center is an app shell: no public header/footer, one `main`, a compact top bar with the account menu
  (sign-out, account security, *My workspace*) and the language switch; a focus-managed drawer on mobile.
- Home is attention-only (real reads, direct links, failed/partial counts stated). The destination grid is gone.
- One entry: the account-menu *Control Center* item; administration/identity-only accounts land in the Control Center;
  the portal hand-off card and the portal Administration/Identity tabs are removed.
- New routes: Commercial › Price Lists, Exchange Rates, Margin & Deposit (moved from the Finance workspace); the former
  Pricing URL redirects. No backend change.
- Deviations recorded in the status file: *Journey Design / Publishing* is the page family inside each journey (no
  cross-journey destination exists yet); *Schedules* sits under Clinicians and keeps a sidebar line only for people who
  cannot open Clinicians; «مركز التحكم» kept pending the V-9 glossary review.
- UX-3 can start: no structural shell or navigation issue blocks the Clinician redesign.

## 17. UX-3 outcome (2026-09-24)

UX-3 is complete — record: [ux-3-clinicians-setup-status.md](ux-3-clinicians-setup-status.md).

- **One Clinicians directory** (`/providers/clinicians`) for both engagement models; each row states *Direct with
  RehletShifaa* or *Through a Provider Organization* and keeps credential status, setup and case eligibility separate.
  The engagement rule is the backend's own provider-credentialing switch (credential-policy cutover), so provider-invited
  clinicians no longer appear as unapprovable "Direct" consultants.
- **One clinician page family**: provider (Overview · Setup · Credentials · Professional Relationships · Prices ·
  Schedule) and Direct (Overview · Credential & case approval · Price list · Account access), sections gated by capability.
- **Add clinician** is one short invitation screen (audit note prefilled under a disclosure); it opens **Consultant
  Setup**, a six-section checklist with status, owner (derived from the seeded grants), what remains and only the
  caller's own actions. No review decisions in setup; Decision D unchanged.
- Old `/providers/consultants/**` and `/providers/onboarding/new` URLs redirect. Backend: two read-only additions, no
  write, migration or authorization change.
- **UX-4 is not ready**: the provider-persona data-access matrix still has UNDECIDED patient/case rows (listed in the
  UX-3 record §18).

## 18. UX-4A outcome — provider workspace access decisions (2026-09-24)

UX-4A is complete — record: [ux-4-provider-workspace-decisions.md](ux-4-provider-workspace-decisions.md); matrix frozen:
[provider-persona-data-access-matrix.md](provider-persona-data-access-matrix.md). Documentation only.

- Privacy principle frozen: membership never grants patient/case access; access follows the caller's own case
  assignment; minimum necessary; clinical, commercial and operational data decided separately; server-shaped summaries.
- Every UNDECIDED row is resolved; every row is classified SUPPORTED TODAY · NEEDS UX-4 READ SURFACE · FUTURE BACKEND
  CAPABILITY · NOT CURRENTLY SUPPORTABLE. One FUTURE BUSINESS DECISION remains (consultant schedule self-edit; not
  patient data).
- V-3 and V-11 directions approved (small read-only surfaces, existing authorization only).
- §1-B adjustment: *Prices needing my approval* is omitted for now — no clinician role version grants the capability
  approval needs (`price_list.manage` SELF). Practice Manager/assistant/owner case views are future rows and are omitted.
- **UX-4 READY: YES**, scoped to rows served by existing grants plus V-3/V-11. Provider clinicians still receive no
  cases (activation fail-closed), so "My cases" ships as a truthful empty state.

## 19. UX-4 outcome — Provider Workspace (2026-09-24)

UX-4 is complete — record: [ux-4-provider-workspace-status.md](ux-4-provider-workspace-status.md). The matrix and the
UX-4A decisions are unchanged.

- **My Practice** (`/portal/practice`) is the provider-side landing: a portal workspace page with its own section
  navigation, never the Control Center shell. Sections come from V-11 decisions only; *Manage organization* is offered to
  owners and practice managers holding an administration decision.
- **V-3** `GET /api/v1/provider-workspace/cases`: own PENDING/ACTIVE clinician assignments through an active provider
  membership, S-ID + S-STATUS + S-PROP only, paged, no total, `no-store`. Empty in practice (activation fail-closed).
- **V-11** `GET /api/v1/provider-workspace/me`: self-only practices, roles, own clinician, S-REL, managed clinicians and
  existing `AuthorizationService` decisions on the same resources/channels the endpoints use. Navigation only.
- Landing handles the identity-system default `PATIENT` role on provider accounts; staff who also work with a provider
  switch between Staff Portal and My Practice.
- Found and recorded for UX-5 / Phase 8D (status §8): role-version drift (invitations assign versions without own
  price/schedule or MANAGES setup grants; v4 lacks the credential cutover), assistant schedule grant not executable,
  MANAGES price routes accept organization-wide price changes (not offered in the workspace), default PATIENT role.
- **UX-5 READY: YES.**

## 20. UX-5 outcome — Access & Governance (2026-09-24)

UX-5 is complete — record: [ux-5-access-governance-status.md](ux-5-access-governance-status.md).

- **People** answers who / where they can sign in / what business access / where and why / how to change it: one person
  page with *Account & workspaces* (identity system, read-only, the workspace each role opens; provider memberships as My
  Practice), *Business access* (one card per role and organization: where it applies in words, validity, status, source;
  give/remove with consequence copy and reason), *Access Summary* (*Can this person…?* answered by the backend) and
  *Changing or ending access* (only existing lifecycle steps; no "delete person"). Search by name, email or organization.
- **Roles** stays first-class: in-use/draft status, role page sections, *Edit a copy*, truthful *Retire version* (access
  is removed immediately), wizard with the change note supplied once and the reason asked at publish, maker/checker
  stated, simulation with the person picker under Advanced. **Audit** filters by who acted, action and date.
- **M-2 resolved:** new memberships receive Consultant **v5** / Associate **v5** (V51: credential + own price/schedule,
  cutover approved; consultant without organization-wide relationship management) and Practice manager **v3** (MANAGES
  prices/schedule). The v4 credential defect is missing cutover rows. Historical assignments stay pinned.
- **M-5 retained deliberately:** patient representatives and existing-account link resolution depend on the default
  PATIENT role; the People page explains it. **M-4** and the M-1 residual go to Phase 8D (not fixable by role
  configuration; not reachable from any UI).
- Backend: read additions only (`/admin/access/people/access`, `/admin/access/check`, audit filters, role-list status) and
  one additive seed migration; no write API, no authorization-model change.
- **UX-6 READY: YES** — what remains for UX-6 is credential/readiness UX; the access findings left open are Phase 8D items
  with no UI exposure.

## 21. UX-6 outcome — Credentials & readiness (2026-09-24)

UX-6 is complete — record: [ux-6-credentials-readiness-status.md](ux-6-credentials-readiness-status.md).

- **Credential Reviews** is the canonical review workspace: one cross-organization read, groups from the stored status
  (Needs review · In review · More information required · Completed) with counts, named clinicians/organizations, validity,
  review ownership (*Start review* assigns, never verifies), search and filters. Direct approvals stay a separate typed view.
- **Review page**: Clinician · Submitted information (never styled as verified) · Evidence (attached + scanned ≠ verified) ·
  Independent review · Decision history · Decision. Each decision has its own panel with its real effect and a required,
  audience-labelled reason; Verify never claims case eligibility.
- **Lifecycle**: one expiry rule (backend `CredentialValidity`, frontend `credentialExpired`), one *Expiring soon*
  threshold (30 days, the first existing reminder); expired verified = *Expired*; legacy records say independent review
  was not recorded; suspension outranks newer versions.
- **More information required** shows the reviewer's request, who acts and how review resumes — the backend now shares that
  request (only) with the provider side; other reviewer reasons and names stay reviewer-only.
- **Readiness**: credential status, operational readiness and case eligibility shown separately from backend readiness;
  blocker codes now distinguish more-information / rejected / suspended (explanation only). Organization Setup adds profile /
  legacy review and routing and no longer shows *Checking…* with no clinicians. Decision D unchanged.
- Backend: read additions only (queue endpoint, enriched review detail, blocker codes, directory suspension precedence);
  no migration, no write or authorization change.
- **UX-7 READY: YES.**

## 22. UX-7 outcome — Care Coordination (2026-09-24)

UX-7 is complete — record: [ux-7-care-coordination-status.md](ux-7-care-coordination-status.md).

- **Split frozen and implemented:** daily work in the Staff Portal (My work · My cases · Team queue — *Needs an owner* /
  *Owned by my team*; *Take ownership*; **Transfer case ownership**; **Assignment history** on the case); configuration in
  Control Center › **Coordination Setup** (Teams & People · Clinician Preferences · Rules · Advanced). No operational queue
  in the Control Center's primary sections; the org-picker hop is gone for a single organization.
- **Case Owner, WorkItem assignee and routing preference stay distinct**, each labelled from verified backend semantics
  (record §2). Every Assign/Transfer label now does what it says; recommendations are never labelled as assignments.
- **Transfer** is a two-step drawer (coordinator by name + reason → review of what changes / stays / notifications). Backend
  fix: open coordinator WorkItems now move with the ownership (the frozen Phase 3 owner-change rule) instead of stranding
  with the previous owner; disabled coordinators are no longer transfer targets or directory entries. Nobody is notified —
  the UI says so.
- **Advanced**: *Preview routing recommendation* (the engine's ephemeral simulation, approved evaluation-only copy, backend
  reasons only), *Routing decision history* (evaluation-only vs applied, manual overrides with actor and reason), live-routed
  cases waiting (only when live routing exists), technical configuration. *Evaluation mode* banner replaces "Shadow".
- Backend: read additions (`/admin/coordination/{org}/overview|people|consultants|decisions`, queue case numbers,
  `/coordinator/cases/{id}/assignment-history`) and the transfer/directory fix; no migration, no rollout change, no new
  permission, engine or state machine.
- **UX-8 READY: YES** — what remains for coordination is recorded debt (WorkItem-level pool when Journey intake turns on,
  WorkItem reassign UI, real-case preview read, transfer notification decision), not a truthfulness or safety defect.

## 23. UX-8 outcome — Commercial, Care Journeys, portal polish (2026-09-24)

UX-8 is complete — record: [ux-8-commercial-journeys-polish-status.md](ux-8-commercial-journeys-polish-status.md); Arabic
handoff: [arabic-ux-glossary-review.md](arabic-ux-glossary-review.md).

- **Commercial:** Price Lists explain *Organization price → Clinician-specific price* in plain words; each service states the
  price that applies now and its backend-resolved source; versions by business stage (Current · Scheduled · Draft · awaiting
  clinician approval · Ended · Retired), numbers only under Technical details; scope-specific retire consequences. Provider
  clinicians no longer appear in (or open) the Direct price list. Exchange Rates state stored daily rates, per-day manual
  override, fallback and proposal snapshot; historical view. Margin & Deposit marked internal, correct timing, confirmation.
- **Financial stages:** Proposal (object) · Preliminary estimate / Preliminary care estimate · Final treatment quote / Final
  treatment plan and quote · Coordination deposit — consistent in staff and patient UX; no technical *Version N* for patients.
- **Organization profile:** existing `PUT /admin/providers/{id}` fields on Organization › Overview, editable only where the
  backend accepts it; Setup step derived from backend readiness. Activation remains blocked (Decision D).
- **Care Journeys:** list from one bounded summary read; detail leads with published / change in progress / production intake
  (OFF, read-only); Check, Test journey, Approval & publishing distinct; maker/checker stated; consequence-aware publish and
  retire; engine detail only under Advanced. Finding J-1: journey governance reasons are not persisted (copy corrected).
- Backend: one read-only endpoint (`GET /admin/journeys/summaries`); no migration, write, permission or rollout change.
- Follow-ups before/around 8C: **OPS-1** (notify the new owner on transfer — direction YES), **J-1**, legal copy review of the
  estimate basis and patient deposit terms, native Arabic review (V-9).
- **PHASE 8C READY: YES.**
