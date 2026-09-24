# UX-8 — Commercial, Care Journeys, portal polish, Organization profile, terminology

Date: 2026-09-24 · Branch `codex/platform-control-plane` · Base UX-7 `1be4046` · Claude Code.
Scope: presentation and structure only. **Phase 8C not started. Journey production intake OFF. No routing rollout change.**
Backend: one read-only addition (`GET /admin/journeys/summaries`); no write, authorization, permission or migration change.

## 1. Test inventory check (UX-6 386/48 → UX-7 383/42)

Diff `5af3703..1be4046`: seven test files deleted, one added, one rewritten. **None accidentally deleted.**

| Deleted file (tests) | Component | Classification | Where the coverage is now |
|---|---|---|---|
| `AssignmentAudit.test.tsx` (3) | removed in UX-7 | obsolete component; intentionally consolidated | `CareCoordinationWorkspace.test` › Advanced "keeps recommendations visibly apart…", section gating test |
| `AssignmentQueue.test.tsx` (4) | removed | consolidated (queue moved to Staff Portal + live-routed queue) | Advanced "offers the authoritative assignment only for live-routed cases" (revision + reason body), `portal/CareCoordination.test` Team queue (2) |
| `CareCoordinationOrganizations.test.tsx` (3) | kept | renamed/moved | `CareCoordinationWorkspace.test` › "Coordination organization picker" (2; empty vs denied, no picker hop; provider.view not required — fixture grants none) |
| `CoordinatorTeams.test.tsx` (3) | removed | consolidated | Teams & People (4) incl. read-only hides *Add person*, "No capacity set" |
| `RoutingPolicy.test.tsx` (3) | removed | consolidated | Rules test (weights must add to 100, publish with reason); "No routing rules are in effect" overview test |
| `RoutingPreferences.test.tsx` (2) | removed | consolidated | Clinician Preferences (finite non-overlapping version) |
| `RoutingSimulation.test.tsx` (3) | removed | consolidated | Advanced preview (backend reasons, no command) |

Small gaps found (empty/denied states): preview hidden without `assignment.simulate`, *Nobody is eligible*, empty decision
history. **Restored** in UX-8 as one test (`CareCoordinationWorkspace.test` "offers the preview only with
assignment.simulate…"). The 21 → 15 + 7 reduction is legitimate consolidation.

## 2. Commercial IA

Unchanged top level: **Commercial › Price Lists · Exchange Rates · Margin & Deposit**. Clinician prices stay reachable from the
clinician (Prices tab); organization defaults remain the organization price shown with each clinician; Commercial gives the
cross-provider view. No new page.

## 3. Price Lists redesign (`CommercialSetup.PricingHub`, `PricingManagement`, `pricing-copy.ts`)

- Views: **Provider organization prices · Direct clinician prices · Care-area templates** (gated as before).
- Explainer *How the price that applies is chosen*: **1. Organization price** (applies to every clinician without their own
  price) → **2. Clinician-specific price** (used instead). No "override/default/inheritance/scope" words (UX-3 debt A fixed).
- Per service, stacked cards (no wide table): **Price that applies now** + source; each level (**Organization price**,
  **Clinician-specific price**) lists versions by business stage: **Current · Scheduled · Draft · Draft · awaiting clinician
  approval · Draft · approved by the clinician · Ended · Retired**, with *From … · Until …*. Version number, stored status and
  IDs only under *Technical details*.
- New price form: **Applies to** — *Every clinician in {organization} (organization price)* / *Only this clinician
  (clinician-specific price)*; approval checkbox only for a clinician-specific price (the backend can only record approval by
  the scoped clinician, so an organization price that required approval could never be published — the old form allowed it);
  EGP-conversion note for a non-EGP clinician-specific price; *Saving keeps it as a draft*.

## 4. Pricing-source behaviour (no precedence in React)

Source comes only from `GET …/prices/effective` (`sourceLevel`): `ORGANIZATION` → *Using organization price · Organization:
{name}*; clinician scope → *Clinician-specific price · Overrides the organization price for this service* only when a current
organization version exists in the loaded list, otherwise *…no organization price is in effect*; `LEGACY_CONSULTANT` → *Direct
clinician price · From this clinician's Direct price list* (previously the raw code was printed). `priceStage()` derives a
display stage from a version's own stored status/dates only.

Actions by real decision: view (`price_list.view`), **Edit draft** / new price / **Record Consultant approval**
(`price_list.manage`; approval also needs caller = clinician), **Publish** / **Retire** (`price_list.publish`). There is no
separate approval step other than the Consultant's own approval. **M-4 unchanged**: `clinicianScopeOnly` still hides every
organization-price action in the Practice Manager workspace (test kept).

## 5. Direct / provider picker fix (UX-3 debt B)

`directPricingCandidates()` excludes `providerCredentialing` practitioners (the backend's engagement switch); the picker says
*Clinicians who work through a provider organization are priced under Provider organization prices*. The Direct clinician page
no longer shows a *Direct price list* tab for a provider-credentialed clinician. Regression tests: `CommercialPages.test`,
`ClinicianPage.test`.

## 6. Exchange Rates (`legacy-admin.ExchangeRates`)

Verified in `CurrencyService`: one stored rate per currency per day (EGP → currency); the market rate is read **once a day**
from the rate provider (`API`); a saved rate (`MANUAL`) replaces it **for that day only**; with no row for a day the most recent
earlier rate is used (`FALLBACK`); proposals freeze the rate at release. The page now states exactly that (not live FX), shows
per row *From → To*, *1 USD = x EGP* + *1,000 EGP ≈*, source with its meaning and date, and *Rates used for new calculations
today, {date}*. A date picker shows **historical** rates (existing `?date=`), read-only. Save is *Save rate for today* with
*Today only; tomorrow the daily market rate is used again*. Stacked rows (mobile-safe).

## 7. Margin & Deposit

Internal-only notice (margin never shown to patients, clinicians or provider organizations). Corrected timing (the old intro
said "apply to new cases only"): margin is taken **when a preliminary estimate is created** and the final quote reuses the
locked margin; the coordination deposit amount is taken **when the patient acknowledges the preliminary estimate**, at that
estimate's frozen rate. *Save new version* now goes through **Review new version** → confirmation with consequences. Same
endpoints/bodies; gate unchanged (`financePolicy` legacy lead roles; backend recent-auth).

## 8. Financial-stage terminology (final)

| Concept | Staff | Patient |
|---|---|---|
| Business object | **Proposal** (versions) | **Your proposal** (umbrella) |
| Document type `PRELIMINARY_ESTIMATE` | **Preliminary estimate** | **Preliminary care estimate** (+ approved basis sentence) |
| Document type `FINAL_TREATMENT_QUOTE` | **Final treatment quote** | **Final treatment plan and quote** |
| Deposit | **Coordination deposit** | **Coordination deposit** |
| Paid amount | *paid* / *Received* | *Received* / *Already paid (credited to this quote)* |

My Care's proposal card now names the document type; the staff *Latest proposal* line names it too. "Offer/Price" are not used
for the object. Existing approved legal-ish copy (estimate basis, deposit "credited to your final balance") was reused, not
invented. **Needs legal/business copy review:** the estimate-basis sentence on My Care and the absence of deposit refund terms
on My Care (stored per deposit component; not exposed to the patient DTO — future decision).

## 9. Organization Profile

`PUT /admin/providers/{id}` models: legal name, business name, display name, country, time zone, default currency, plus
`status`, `version`, required `reason`. New `OrganizationProfile` (Organization › Overview): read view of those fields; **Edit
profile** only when the backend would accept it (`profileEditability`: not ACTIVE/READINESS_REVIEW — the update refuses them;
SUSPENDED needs `provider.suspend`, otherwise `provider.update`); status sent back unchanged; required *Why are you making this
change?*; error summary linked to fields. No new fields.

## 10. Organization profile ↔ activation

Setup's *Organization profile* step now shows **Needs attention** (+ *Complete profile* when editable) only when a clinician's
backend readiness reports `PROVIDER_PROFILE_INCOMPLETE`, **Complete** when every loaded readiness is clear. Legacy mapping
pending review still says it can't be completed here. Commercial & Legal Acceptance stays *Not available yet*; Decision D and
activation gates unchanged.

## 11. Journey list

New read `GET /admin/journeys/summaries` (journey.view; stored facts only): per journey **Published** (version + date),
**Change in progress** (version + status), **Last activity** (newest journey audit event), attention badge *Needs approval* /
*Ready to send for approval*. No usage/performance/SLA figures. **New journey** only while no journey exists (the backend allows
exactly one; the button used to 409). Page title *Care Journeys*.

## 12. Journey detail (`JourneyVersionWorkspace`)

Overview cards: **Published version** · **Change in progress** (status, next step, *Open draft* / *Review for approval*) ·
**New patient cases** (production intake status from `GET /admin/journey-cutover`, read-only). **Versions & history** (Published
on / Retired on; history in business words, outcome only when not successful; no actor IDs). **Advanced — technical details**
(closed by default; journey key/ID, version IDs, configuration hash, creator account, runtime deployment/compiler/artifact hash
loaded only when opened). *Clone into a new draft* → **Edit a copy** dialog, offered only when no draft exists (backend rule).
No cross-journey publishing page (UX-2 decision kept).

## 13. Journey check / test

Tabs: **Design · Check · Test journey · Compare versions · Approval & publishing**; the duplicate header Validate/Simulate
buttons are gone (one primary header action: *Save draft*). **Check** shows the backend message first (Arabic by code, English
backend text otherwise), *Step: {name}* and **Go to step**, the engine code as secondary text, a count summary in a live region;
no rule is re-checked in React. **Test journey**: *Testing does not publish or change the live journey. Nothing real is created…*;
path shows who acts and the step state in words.

## 14. Approval / publish

Checklist from stored state: 1 Check (passed) → 2 Test (passed) → 3 Send for approval → 4 Publish by an independent reviewer.
Maker/checker stated; the version's creator is told someone else must publish; publish needs both `journey.publish` and
`journey.approve` (said when missing). **Publish…** opens a confirmation: which version becomes published; new cases use the
newest published version *while production intake is on*; the live intake status (**off**) and that publishing does not turn it
on; existing cases stay pinned; earlier published versions stay published until retired; runtime prepared automatically where
enabled. Own reason field. Backend independent-review refusal is still surfaced.

## 15. Versions / retirement

**Retire version…** confirmation: this version is no longer used for new cases; which version replaces it (newest remaining
published) or that none would remain; existing cases stay; retired can't be republished → *Edit a copy*. Own reason field.

**Finding J-1 (truthfulness, fixed in copy):** journey "governance reasons" are required by the backend (`locked()`) but **never
persisted** (audit rows store `revision=…`/`graph=…`). The UI said "Recorded on the audit trail" — removed; fields now say
*Required by the platform for this action*. Persisting the reason is a small backend follow-up (recommended before Phase 8C/8D;
not done here — it changes audit content).

## 16. Advanced technical detail

Only under *Advanced*: artifact hash, compiler version, runtime deployment, configuration hash, version/journey IDs, journey key,
creator account, raw audit action/actor/detail. Prices: version numbers/IDs under *Technical details*.

## 17. Production intake confirmation

`journey.runtime.production-intake-enabled` default `false` (unchanged in `application.yml`); no code path in UX-8 writes it or
any cutover policy (the cutover API is GET-only). UI reads and states it. **Journey production intake = OFF.**

## 18. Patient portal polish

- My Care: duplicate phase badge in the header removed (stepper remains); proposal card named by document type; *Version N*
  → *Updated version* only when N > 1; preliminary estimate basis line; deposit = *Coordination deposit* (card, stepper).
- Secure status link and proposal document: *Version N* replaced the same way (version identity kept internally/staff).
- Requested information: one primary action (*Reply in Messages*) plus *Requested by your coordinator {name} · Please reply
  by {date}* and the item checklist. A signed-in patient has **no API** to answer the structured request (only the secure link
  does); aligning My Care to the structured form needs a backend capability → recorded, not built.
- V-8 (representative authority): the authenticated proposal decision requires the PATIENT role + case read authorization;
  representatives also carry the default PATIENT role (M-5). No representative-specific UI change; any change is a business
  decision (recorded).

## 19. Staff Portal polish

*Latest proposal* names *Preliminary estimate* / *Final treatment quote*; *Coordination deposit* in the summary and the
*Coordination deposit & payments* card; journey stepper label aligned. Team Queue/assignment untouched.

## 20. Provider Workspace polish

My prices / managed-clinician prices inherit the new pricing wording and show the organization name as the source; view-only for
the clinician (no actions), clinician-scope-only for the Practice Manager (M-4 hidden). No data access change.

## 21. Glossary consistency (English)

Clinician (physicians: Consultant, Associate Doctor) · Provider Organization · Credential Review · Schedule · Price List ·
Organization price · Clinician-specific price · Direct clinician price · Preliminary estimate / Preliminary care estimate ·
Coordination deposit · Proposal / Final treatment quote (staff) · Final treatment plan and quote (patient) · Care Journey ·
Journey version · Publish · Retire version · Team Queue · Case Owner (PRIMARY coordinator assignment) · WorkItem assignee ·
Access Summary. Distinctions kept on purpose: Proposal (object) vs document types; Case Owner vs WorkItem assignee.

## 22. Arabic glossary handoff

[arabic-ux-glossary-review.md](arabic-ux-glossary-review.md): UX-2…UX-8 terms with current Arabic, screen, ambiguity and the
decision needed. Top items: one Arabic term for the coordination deposit (وديعة vs دفعة مقدمة), one noun for the final quote
(three renderings today, and «عرض» collides with "view"), «مركز التحكم» vs «مركز الإدارة», non-clinical words for journey
*check/test*, plural agreement. **Not final.**

## 23. OPS-1 — Notify the new owner when case ownership is transferred

Pre-8C operational follow-up, **not implemented** (would blur UX-8 scope). Product direction: **YES** — the newly responsible
coordinator should be notified (in-app + email, as live-routing assignment already does via `persist`). The Transfer drawer and
result keep saying nobody is notified until OPS-1 ships.

## 24. Performance (representative GETs)

| Surface | Before | After |
|---|---|---|
| Price Lists (clinician selected) | me×2 + `/admin/providers` + **1 detail per organization** + panel (me, onboarding, prices, 1 effective per live service) | me×2 + `/admin/providers/clinicians` + same panel — per-organization fan-out gone |
| Exchange Rates | me + fx-rates | same (+1 per chosen date) |
| Journey list | me×2 + list | me×2 + summaries (bounded server-side) |
| Journey detail | me×2 + detail + **1 runtime per version** | me×2 + detail + cutover; runtime only when Advanced opens (published/retired versions) |
| Designer | me×2 + detail + registry + metadata + runtime | runtime dropped; cutover once when the publish dialog opens |
| Organization detail | unchanged (profile uses the detail read; save = 1 PUT + reload) | |

The per-service effective-price read remains (bounded by one clinician's services; a bulk read would need a new endpoint).

## 25. Mobile / RTL / accessibility (baseline; formal validation is Phase 8C)

390 px: price services and versions stack; exchange rates stack (`cc-fx-list` single column ≤720 px); Margin & Deposit forms
and dialogs usable; journey detail cards stack; publish dialog scrolls; no horizontal overflow and one h1 on every reviewed
page. RTL: amounts, currency codes, dates, rates, service codes and English names `bdi`/`dir=ltr`-isolated. A11y: dialogs are
focus-trapped (price retire, margin confirm, edit a copy, publish, retire); statuses carry text; Check/Test results in
`role=status` live regions; issues link to the affected step; org-profile error summary receives focus and links to fields;
Test facts are a labelled fieldset.

## 26. Tests

- Frontend: `pnpm typecheck` clean; `pnpm test` **407 tests / 43 files** (UX-7: 383 / 42). New `CommercialPages.test.tsx`
  (Direct picker exclusion, bounded read, FX semantics + historical, org profile save/edit rule); rewritten
  `PricingManagement.test` (13), `JourneyList.test` (6), `JourneyVersionWorkspace.test` (5), `JourneyPublishPanel.test` (6);
  updated designer, My Care (+2), status link, staff stepper, Margin & Deposit, clinician page, workspace tests; restored
  coordination coverage (+1). Lint: no new findings (remaining ones are pre-existing lines, compared against HEAD).
- Backend: focused `JourneyDefinitionIntegrationTest` **8/8** (new `summariesStateLiveAndDraftWithoutWriting`: empty, pending,
  published + new draft, no audit write, denied without the grant). Full `mvn -o test`: **531 tests, 0 failures, 0 errors,
  1 skipped** (UX-7: 530).
- Flyway: **no migration** (latest V51).

## 27. Live review (limited; not Phase 8C)

Canonical tunnel rebuild (frontend + backend). New `e2e/ux8-commercial-journeys.spec.ts` — synthetic session and fixture reads,
every write blocked and asserted empty; Journey *Check* answered by a fixture (side-effect free in the backend too): Price Lists
(EN/AR desktop, EN/AR 390 px, retire dialog, Direct view), Exchange Rates (desktop/390), Margin & Deposit (confirm, 390),
Organization profile (view, edit errors, 390), Journey list, detail (+390), Advanced, Check, Test, publish confirmation
(desktop/390; EN/AR), Provider Workspace *My prices* (desktop/390). Existing `my-care`, `status-proposal`,
`proposal-responsive`, `credential-reviews`, `care-coordination`, `access-governance` re-run against the rebuilt stack (see
test-status.md). Fixed from screenshots: duplicated *Journeys* breadcrumb in the designer; the pending version row said *Open
draft* (now *Review for approval*). Nothing was published, no intake or routing changed, no live data written.

## 28. Remaining Phase 8C / 8D debt

- **8C (formal):** WCAG, RTL and visual certification; native Arabic review (V-9) of the handoff file; live E2E on real data.
- **Pre-8C follow-ups (small, separate):** OPS-1 transfer notification; J-1 persist journey governance reasons; legal/business
  review of the estimate-basis sentence on My Care and patient-facing deposit terms.
- **Future capability:** authenticated structured response to requested information in My Care; bulk effective-price read;
  "Published by" names in journey history (audit stores subjects only); Direct price list still a table inside a scroll box.
- **8D (unchanged, not touched):** M-1 residual provider.view, M-3 assistant schedule scope, **M-4** PM organization-price
  authority via MANAGES routes (UI still hides it), M-6 PENDING assignment identity exposure, M-7 Direct CaseWorkspace breadth,
  default PATIENT role removal path, offboarding gaps.

## 29. Acceptance

| Gate | Result |
|---|---|
| Commercial ownership and pricing-source language clear | YES |
| Provider clinicians cannot enter Direct pricing | YES — picker + Direct page tab; tests |
| Price/version actions state real consequences | YES — scope-specific retire copy from backend semantics |
| Exchange Rates don't imply live FX | YES |
| Preliminary estimate / coordination deposit / final proposal distinct | YES |
| Internal margin not exposed to inappropriate personas | YES — page gate unchanged; notice added; no patient/clinician surface shows it |
| Organization profile truthful UI | YES — existing API fields only, backend edit rule |
| Care Journeys business-first; check/test/publish distinct | YES |
| Maker/checker intact | YES — backend unchanged; UI states it |
| Journey production intake OFF | YES |
| Technical runtime data progressively disclosed | YES |
| Patient portal duplication/technical wording cleaned | YES (structured My Care response recorded as backend gap) |
| Terminology consistent; Arabic handoff prepared | YES |
| No UX-1…7 regression; tests pass; backend regression passes | YES |
| Mobile / RTL / a11y sanity | YES (baseline) |
| Phase 8C formal testing started | NO |

### UX-8 COMPLETE: YES
### PHASE 8C READY: YES

What remains is formal validation (accessibility, RTL, visual, live E2E), the native Arabic review, and the small recorded
pre-8C follow-ups (OPS-1, J-1, legal copy review) — none is a known structural UX defect.
