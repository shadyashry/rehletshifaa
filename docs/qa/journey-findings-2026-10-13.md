# Journey findings — 2026-10-13

Step 1 of the QA plan: a live walk through the journey on the dev stack (`dev.rehletshifaa.com`, frontend build of
2026-10-10, backend rebuilt 2026-10-13 with the B1 fix), signed in as each seeded role. Test data: synthetic cases
RS-2026-000001 (cardiology, English, self) and RS-2026-000002 (orthopedics, Arabic, submitted by a relative).

Agreed approach: finish the journey first, then fix in batches — logic first, then UX/copy through `/redesign-area`.
Only blockers and serious security/data issues are fixed immediately.

Status: **Open** unless marked. "Owner" = raised by the product owner during the walk.

## Fixed immediately (blockers)

| ID | Finding | Fix | Status |
|---|---|---|---|
| B1 | Finance (and Operations) could not open a case they had been offered: `GET /api/v1/finance/cases/{id}` → 403 "not related to this record (CASE_READ)". The role could accept an offer but not read it first; consultants could. Blocked every Finance approval and every Operations travel plan. | `RolePolicy`: `CASE_READ` on `CASE_OFFERED` for `FINANCE` and `OPERATIONS`; test `AuthorityIntegrationTest.financeAndOperationsReadACaseTheyWereOfferedButActOnlyOnceTheyAccept` (fails before, passes after; an offer still cannot settle). Full suite 688/0. Backend rebuilt on dev. | Fixed, **not committed** |

| B2 | **6 of the 9 care areas could not be submitted at all.** `CreateCaseRequest`, `NewCaseForPatientRequest` and `CareCategoryUpdateRequest` validated `careArea` against a hard-coded `cardiology|rheumatology-rehabilitation|orthopedics` while `care_categories` holds 9 (added in `3f26bc6`): the public form, a returning patient's next case and the coordinator's correction all returned 400 → "We couldn't send your case right now". Found while checking My Care with multiple cases. | Patterns removed (`@Size(max=80)`); `CaseService` checks the table through a new `CareAreas` port implemented by `CareCategoryCatalog` (no module cycle; `ArchitectureRulesTest` green); tests `CareAreaRequestValidationTest` (9 areas × 3 requests) and `JourneyServiceIntegrationTest.aCaseIsSentInAnyManagedCareAreaAndAnUnknownOneIsRefused` — both failed before, pass after. Full suite 698/0. Backend rebuilt on dev; verified live (RS-2026-000003, General Surgery). | Fixed, **not committed** |

## Logic / data

| # | Finding | Where | Severity |
|---|---|---|---|
| 3 | A case routed at submission says "Waiting on: you", but no work item is created: My work is empty and "At a glance" says "No cases need action". The consultant hand-back and assignments do create work items. "Needs attention" is computed only from open work items (`CaseTaskRepository.findWorkSignals`), "Waiting on" from the case stage — two sources that disagree. Fix: every stage that waits on someone creates its work item; add a test that both always agree. | Coordinator dashboard; routing at submission | Medium-High |
| 3b | Same gap at release: after Finance approved, the coordinator's current action is "Release the proposal to the patient", but My work is empty and "At a glance" says nothing needs action — a ready proposal would sit unnoticed. | Coordinator dashboard | Medium-High |
| 25 | **False statement about money.** Before release, with a travel package, the coordinator's current action reads "Start treatment coordination — The deposit is settled. Assign Operations…" although the patient has not seen the proposal and no deposit exists. `CaseActionService` returns the same code `ASSIGN_OPERATIONS` for the pre-release travel plan (`internalApprovalStep`, line ~222) and for post-deposit treatment coordination (line ~196); the copy (`en.json` `ASSIGN_OPERATIONS`) fits only the latter. Fix: a separate code for the pre-release plan with its own en/ar copy, plus a test. | Coordinator current action | High |
| 28 | The coordinator's case page shows the secure proposal link as "Queued · WhatsApp" although the outbox row is `DELIVERED` (both cases). Delivery status shown to staff is stale or reads the wrong field (`provider_delivery_status` empty in the local simulator?). | Coordinator case page | Medium |
| 29 | To verify: the Arabic patient's (case 2) "proposal ready" WhatsApp text is in English (link is `/ar/`). May be the local simulator only; confirm the real Meta template is sent in the patient's language. | Notifications | To verify |
| 30 | **Legal:** the patient proposal states concrete deposit refund rules ("Full refund if you cancel before…", "No refund if…"), while the refund class for new deposits is recorded as pending the legal decision (L1–L5). Must be the legally approved wording before launch. | Patient proposal | Decision (legal) |
| 31 | The patient verifies a WhatsApp code on the proposal link, then must verify another code on the profile link two minutes later. Probably intended (purpose-scoped grants); review the friction in the UX pass. | Patient links | Low |
| 32 | Reopening an already-used Keycloak account-setup link says "This setup link has expired" (`expired_code`) although it was used, not expired (24 h validity). Should say it was already used and offer sign-in. | Keycloak theme | Low |
| 13 | "Waiting on" contradicts the current action: "Waiting on: you" while the case waits for Finance sign-off; "Waiting on: our team" on a work item assigned to you personally. Same root as #3. | Case header, My work cards | Medium |
| 18 | Finance's "At a glance" says "No cases need action" while My work shows 1 item (the reverse of #3). | Finance dashboard | Medium |
| 21 | After Finance approved, the case stage reads "Internal approval", as if still waiting. Should read e.g. "Ready to release". | Case header | Medium |
| 22 | Margin and deposit policy can be set per care area for only 3 of the 9 care areas (Cardiology, Rehabilitation, Orthopedics). | Control Center › Margin & Deposit | Medium |
| 16 | Full journey history shows a raw internal ID: "Routed to eligible Coordinator 00000000-0000-0000-0000-000000000102" instead of the name (an existing rule says pages never show raw subjects). | Full journey | Medium |
| 23 | **Owner:** the coordinator changed case 2 from Orthopedics (knee) to Cardiology with no reason asked; audit stores a fixed text "Coordinator corrected case care area" with no from/to; the cardiologist was offered it with no mismatch warning (only the intake summary still says Orthopedics). Correction must stay possible; fix: require a reason when it differs from the patient's request, record from→to, flag it to the consultant. (In the walk this was a deliberate test shortcut — no test login for the orthopedic consultant.) | Assign-consultant panel, audit, consultant view | Medium |
| 26 | **Owner:** the travel package is a coordinator-only flag (More → "Turn on the full travel package"); the intake question was removed by owner decision B3-1. Gaps: no record of who asked for it, when or why; no reason asked on turn on/off; the patient never sees or confirms it and cannot ask for it later. It switches on the Operations pre-release gate and, later, identity verification. Recommended (keep it out of intake): a short coordinator note when turning it on or off; show "Travel package included" on the proposal so the patient explicitly accepts it; optionally let the patient ask for it from My Care / the status page, which only notifies the coordinator. | Case actions, proposal, patient views | Medium |
| 24 | To verify: the ownership transfer's reason is kept in `case_assignments`, but no transfer event appears in `audit_events` for the case (may live in coordination decision tables). | Audit | To verify |
| 12 | Total $190.46 on the coordinator's proposal panel vs $190.47 on the consultant's summary (sum of rounded lines vs rounded total). | Proposal panel / clinical review summary | Low |

## Journey and workflow visibility (Owner)

| # | Finding | Proposed fix | Severity |
|---|---|---|---|
| 15 | **Owner:** the journey strip on the case screen has no internal-approval step; it jumps Proposal → Patient decision while the case waits for Finance. The full history records the approval once done, but not the assignment or the waiting period. | Staff-only, conditional sub-steps under Proposal: "Finance approval — waiting · name / approved · time", "Operations travel plan — waiting · name"; same source for strip and history; patients only see "Preparing your proposal". Owner to confirm sub-step vs separate stage. | Medium |
| 15-ops | **Owner:** check the Operations path in the journey too. | Checked on case 2 (catalogue + travel package): gates correct (Operations Waiting → Complete, Finance Not required). Worse than Finance: the **full history has no Operations entry at all** (Finance appeared only because its approval changes the case stage; completing the plan does not). The history also omits the ownership transfer, the care-area change and the travel-package flag. Fix with #15: history built from workflow events, not only stage changes. | Confirmed, Medium-High |
| 27 | For a "full travel package" case the pre-release Operations step is one free-text note plus "Complete operational plan" — no structured services, no travel cost on the proposal. Superseded by **R1** below. The current action also says "confirm it once every requirement is met", which belongs to the after-deposit phase (same root as #25). | → R1 |

## New requirements (Owner)

### R1 — Travel services priced by Operations, documents uploaded by the patient

Owner, 2026-10-13: the Operations pre-release screen must let Operations add **manual costs per requested travel
service** (visa, hotel reservation, or both, and similar), each service must declare the **documents it requires**, the
**patient uploads them through the platform**, the travel agency handles the bookings manually, and the costs appear
on the **proposal in a separate section** from the medical costs.

Owner, follow-up: **no service catalogue and no fixed prices** — visa fees vary by country (nationality), hotels and
other items vary per case; every item is entered per case with full information.

First outline (to be designed in full after the walk, with backend-design + Impeccable):
- Travel items per case, versioned with the proposal; immutable after release. A fixed set of item **kinds** (Visa,
  Hotel, Transfer, Flight, Other) only decides which fields are captured — it carries no price.
  - Visa: traveller, nationality, visa type (tourist / medical / e-visa), entries, validity, processing time, agency ref.
  - Hotel: name, address and distance to hospital, check-in/out, nights, room type, guests, board, cancellation terms.
  - Transfer: from/to, date and time, vehicle, passengers, wheelchair/medical needs.
  - Flight: route, dates, class, passengers, baggage, medical assistance, fare rules.
  - Other: free description.
  - Every item: travellers (patient and/or companions), cost in the original currency + rate → EGP (frozen at
    release), agency quote reference and attached quote, price valid until, status quoted → accepted → booked →
    confirmed, and the required documents (suggested per kind or typed by Operations).
- Required documents become patient tasks; upload via status link / My Care through the existing scanned, private
  document pipeline; Operations marks each missing / uploaded / accepted / rejected (reason).
- Proposal: "Medical care" and "Travel & stay" sections with subtotals and a grand total, frozen at the same rate.
- Release gated on the travel lines being complete; documents gate the booking after acceptance, not the release.
- Journey shows the travel plan and document progress (ties into #15).

Open decisions: margin on travel costs (pass-through vs policy); Finance approval of travel prices (always vs
threshold); fixed price vs range; companions (per-traveller documents/visas); whether the coordination deposit covers
travel or a separate travel deposit is needed.
| 17 | Full history says "Consultant accepted the case" on the step where the recommendation was submitted. | Copy fix | Low |

## Patient experience (Owner)

| # | Finding | Severity |
|---|---|---|
| P-UX-1 | **Owner: "very bad UI/UX design and theme coloring for patient page."** My Care (and by extension the patient proposal, status and profile pages) reads like a form: plain text between hairlines, no visual anchors, flat colour (petrol on paper plus a stray orange line under the header); the current step and the deposit section repeat the same message; the deposit status ("Arranging") has no visual weight or timing; the coordinator — the patient's human contact — is at the bottom as a small line; the progress strip has faint labels; on wide screens the content sits narrow on the left. The earlier "quiet: type + hairlines, one action" direction went too far and became cold. Direction: warm and clear, not loud — current step as a proper card with a status badge, coordinator near the top with initials/photo and Message, deposit as what / how much / when / how, a clearer progress strip, deliberate Petrol & Paper token use (no invented colours). First area for Step 2 via `/redesign-area` with an Impeccable critique. | High |

| MC-1 | **Owner: My Care must handle multiple cases.** Works today (verified: case 3 sent as a returning patient; "Your other cases" lists case 1; switching works), but: the other cases are a small list at the bottom; (opening the newest case is correct: the backend rule `findCurrentCasesOf` puts cases waiting on the patient first, then the most recently updated, and case 1's deposit waits on staff); a signed-in patient cannot send a case for a family member; the header still shows public "activated their account" links while signed in. Direction: "Your cases" switcher at the top (one card per case, current step, badge when the patient must act), grouped by person ("Your care" / "Care for <name>"), default to the case needing the patient's action else the newest, "Send a new case — for me / for someone else" inside My Care. | High (with P-UX-1) |
| 33 | **Owner decision.** A returning patient's new case (RS-2026-000003) was routed to a different coordinator (Omar) than their open case (Layla): two coordinators and two threads for one person, against the one-coordinator principle. Recommended: routing prefers the patient's current coordinator when eligible (as `INTAKE_CONTINUITY` does for WhatsApp intake). | Medium-High |

## Navigation and dashboards (Owner)

| # | Finding | Proposed fix | Severity |
|---|---|---|---|
| 3-UX | **Owner:** "My work" vs "My cases" will confuse coordinators: names too close, and #3 makes My work untrustworthy. | Fix #3 first; rename (e.g. "To do" / "My cases"); counts on the tabs; "At a glance" uses the same source as My work or is removed. Validate with one real coordinator. | Medium |
| 10 | **Owner:** the Virtual Clinic page has no account menu, no sign-out and no way back to the workspace — only the logo, which goes to the public home page. (The Control Center does have "My workspace" and Sign out.) | Same top bar as the portal. | Medium |
| 11 | **Owner:** the consultant portal reuses the coordinator portal (intended, one shared staff portal) but wording leaks the coordinator's point of view: "Waiting on: our team" shown to the consultant. | Keep the shared portal; review every label in the consultant view from the consultant's side. | Medium |
| 20 | Two "Approve commercial terms" buttons on the Finance case page; the first only scrolls to the second (repeated CTA). | One action. | Low |

## Security re-check (step-up) UX (Owner asked why)

| # | Finding | Proposed fix | Severity |
|---|---|---|---|
| 6 | After the step-up re-check (password + authenticator) the action's input is lost: "You signed in again. The change you were making was not saved — please make it again." Consultant had to re-enter the whole recommendation; Finance had to click approve again. | Ask for the step-up before the form/action starts (e.g. on "Start clinical review", on opening the approval), or save a draft before redirecting. | High |
| 7 | First sensitive action forces authenticator (TOTP) enrolment mid-task; seeded staff accounts have none. | Enrol at first sign-in for roles that need it; note in protocol test-data setup. | Medium |
| 9 | The "not saved, please make it again" banner stays visible after a later successful save. | Clear it on success. | Low |
| — | Check the recent-authentication window length so step-up is not asked on every click. | Review setting (e.g. 15–30 min). | To check |
| D1 | **Owner decision.** Staff sign in with a password only (LoA 1) and can read patient medical records at that level; the authenticator is asked only for sensitive actions (LoA 2). Observed: `doctor` signed in with no code after enrolling. | Recommended: require the authenticator at sign-in for every workforce account (patients unaffected), keep step-up for clinical/money/governance actions. | Decision |

## Finance

| # | Finding | Severity |
|---|---|---|
| 19 | Finance approves the manually priced proposal without seeing which line is manual, its base EGP price, or the margin — only patient-inclusive prices. | High |

## Public case form and i18n

| # | Finding | Where | Severity |
|---|---|---|---|
| 1 | Arabic users cannot find their country by typing Arabic: the country-of-residence search matches English names only, and the chosen country shows in English on the Arabic review step. `CountrySelect` receives `locale` but filters on `c.name`. | `CaseForm.tsx:428`, `ProfileActivation.tsx:820` | High |
| 4 | The "Review before sending" step omits the care area, the condition note and the email. | Case form step 3 | Low |
| 5 | Same care area named differently: "Rehabilitation, Dysphagia & Physical Medicine" (public form) vs "Rehabilitation & Dysphagia" (staff). | Form vs staff screens | Low |
| 14 | Messages panel says "Doctor · internal"; the role is "Consultant" everywhere else. | Case messages | Low |
| 8 | "Approved catalogue price EGP 10,000" includes the off-list item, which is not approved catalogue pricing. | Clinical review summary | Low |

## Accessibility (WCAG 2.2 AA — accessible names)

| # | Control | Announced as |
|---|---|---|
| 2a | Case form consent checkbox | "on" |
| 2b | Case form "who is this for" radios | "MYSELF" / "SOMEONE_ELSE" (both languages) |
| 2c | Assign-consultant radio | "on" |
| 2d | Assign-consultant care-area select | its current value ("Cardiology") |
| 2e | Clinical review: 11 service checkboxes | "on" |
| 2f | Clinical review: off-list name and amount fields | no name (visible labels not associated) |
| 2g | Clinical review: clinical-outcome radios | no name |
| 2h | "My work" tab | "My work , 1" (stray comma) |
| 2i | Control Center: language switch, collapsed-sidebar links and a button | no name |
| 2j | Transfer ownership: coordinator choice | the raw subject ID "00000000-0000-0000-0000-000000000102" (also #16) |
| 2k | **Patient proposal: the acknowledgement checkbox** (legal statement) | "on" — highest priority of this list |

Severity: Medium (several block screen-reader users from completing the form).

## Test data and protocol notes (done)

- Protocol §2 "Test data setup" added; the dev database already has `coordinator2` taking cases (UAT prep 2026-10-10).
- **Owner:** two coordination teams (UC-20) and "only the owner replies to the patient" (UC-16) added to the protocol.
- To add: seeded staff accounts have no authenticator; the first sensitive action enrols one (doctor and finance done on dev).

## Works well (keep)

- Routing shared new cases between both on-duty coordinators; the lead sees the colleague's case under "Owned by your team".
- Consultant eligibility list updates live when the care area changes and shows workload ("1 active case").
- Transfer ownership review screen: from/to, reason, what changes, what stays, who is notified.
- Release gates: manual price without travel → Finance only; approval recorded with name in the full history.
- Control Center limits Finance to Exchange Rates and Margin & Deposit, with "My workspace" and Sign out.

## Still to walk

1. ~~Coordinator: release case 1; case 2 → transfer to `coordinator`, care area → Cardiology, travel package on, assign consultant.~~ Done.
2. Consultant: case 2 catalogue-only recommendation.
3. Coordinator: case 2 proposal → expect Operations required, Finance not (journey check 15-ops).
4. Operations: travel plan before release; then coordinator releases.
5. Patient: secure link + OTP (Mailpit) → view → acknowledge (English) / Arabic coordinator-recorded path; profile completion; deposit; My Care; SEC-10 visual check.
6. Identity reviewer, credentialing, referrals, Conversations with live data where possible.
