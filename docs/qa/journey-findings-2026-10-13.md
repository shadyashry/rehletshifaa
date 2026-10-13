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
| P-UX-1 | **Owner: "very bad UI/UX design and theme coloring for patient page."** My Care (and by extension the patient proposal, status and profile pages) reads like a form: plain text between hairlines, no visual anchors, flat colour (petrol on paper plus a stray orange line under the header); the current step and the deposit section repeat the same message; the deposit status ("Arranging") has no visual weight or timing; the coordinator — the patient's human contact — is at the bottom as a small line; the progress strip has faint labels; on wide screens the content sits narrow on the left. The earlier "quiet: type + hairlines, one action" direction went too far and became cold. Direction: warm and clear, not loud — current step as a proper card with a status badge, coordinator near the top with initials/photo and Message, deposit as what / how much / when / how, a clearer progress strip, deliberate Petrol & Paper token use (no invented colours). First area for Step 2 via `/redesign-area` with an Impeccable critique. | High — **Done** (`0d743b2`, My Care; plan `docs/ux-redesign/plans/patient-my-care.md`). The proposal drawer, secure status/proposal links and profile follow in the next pass. |

| MC-1 | **Owner: My Care must handle multiple cases.** Works today (verified: case 3 sent as a returning patient; "Your other cases" lists case 1; switching works), but: the other cases are a small list at the bottom; (opening the newest case is correct: the backend rule `findCurrentCasesOf` puts cases waiting on the patient first, then the most recently updated, and case 1's deposit waits on staff); a signed-in patient cannot send a case for a family member; the header still shows public "activated their account" links while signed in. Direction: "Your cases" switcher at the top (one card per case, current step, badge when the patient must act), grouped by person ("Your care" / "Care for <name>"), default to the case needing the patient's action else the newest, "Send a new case — for me / for someone else" inside My Care. | High — **Done** (`0d743b2`: "Your cases" switcher, grouped by person, "Needs you", backend per-case relation). Gaps closed in the follow-up: a signed-in patient sends a case for someone else from the new-case form (new person, account holder as representative, own saved contact), and the header leads a signed-in person back to My Care instead of offering Sign in / Track case. |
| 33 | **Owner decision.** A returning patient's new case (RS-2026-000003) was routed to a different coordinator (Omar) than their open case (Layla): two coordinators and two threads for one person, against the one-coordinator principle. Recommended: routing prefers the patient's current coordinator when eligible (as `INTAKE_CONTINUITY` does for WhatsApp intake). | Medium-High |

## Gaps found while fixing P-UX-1 and MC-1 (2026-10-13)

Found during the My Care redesign (`0d743b2`) and the MC-1 follow-up (send for someone else, signed-in header). Detail and
sources: `docs/ux-redesign/backlog.md`, section "My Care + multiple cases".

| # | Finding | Proposed fix | Severity |
|---|---|---|---|
| G-1 | P-UX-1 covered My Care only. The proposal drawer, the secure status link, the secure proposal link and profile completion still have the old plain look. | Next `/redesign-area` pass, reusing the My Care pieces (file-tab card, status badges, monograms, journey markers). | High |
| G-2 | **Merge now revokes representative access.** When a patient confirms "this case is mine", any representative grant on the pending record is revoked instead of moved (security fix: it used to reach the owner's other cases). A relative who sent the case loses access until it is granted again. | **Owner decision (2026-10-13): option C.** On "this is me", ask the patient whether the person who sent the case keeps helping them (named, with the relationship; EN + AR); yes keeps access to that case, no revokes it. Until built, the safe default stays (revoke on merge). Coordinators still need a visible re-authorise action. | Medium — decided, to plan |
| G-3 | The intake consent text is first-person ("my medical case") also when a representative sends the case, publicly or signed in. The consent record now names the signed-in sender, but not the capacity. | Representative consent wording (EN + AR) — legal decision, then a consent variant with the relationship. | Medium (legal) |
| G-4 | "Send a new case for someone else" always creates a new patient record; the account cannot pick a person it already represents, so a second case for the same relative creates a duplicate person. My Care also groups represented people by name for the same reason. | Add a stable person key to `GET /patient/cases`; offer "for ‹name›" choices in the form; group by that key. | Medium |
| G-5 | Switching cases or views uses `history.replaceState`: the browser Back button leaves My Care instead of returning to the previous case. | Push history on case switches and reopen from `popstate`. | Medium |
| G-6 | My Care / Documents / Messages are buttons, not links: no new tab or copyable link although the view is in the URL. | Render them as links with the in-place switch on a plain click. | Low |
| G-7 | The coordinator card cannot show the coordinator's languages or a covering colleague's name: the patient API does not expose them. | Add them to the patient workspace view. | Low |
| G-8 | Sending a case for someone else has no CAPTCHA, so it needed its own abuse controls; the first draft cap had no time window, so three abandoned drafts would have blocked an account for good. | **Owner decision (2026-10-13): layered approach.** Done now: a verified WhatsApp number and email are required; per account at most 3 people per hour, 10 per day and 3 unsent drafts from the last 24 hours; each refusal logs `event.code=CASE_FOR_OTHERS_LIMIT` for monitoring and the form explains it (EN + AR). Rest: G-14 to G-16. | Medium — done (rest planned) |
| G-9 | Arabic amounts render as "500 US$" inside the left-to-right isolate. | Fix `formatMoney` for `ar` (currency placement). | Low |
| G-10 | Unknown proposal or deposit states fall back to the raw code (e.g. `READY`), in Arabic too. | A translated generic label in both message files. | Low |
| G-11 | Journey connector lines are decorative (2.46:1 filled, 1.66:1 unfilled on white); progress is carried by the markers only. | Accept and state it in DESIGN.md, or darken the filled connector. | Low (decision) |
| G-12 | Switching cases gives no pending cue on the pressed card while the next case loads; a modified-click opens the case without the `role`/`view` parameters. | Pending state on the card; keep the other query parameters in the link. | Low |
| G-14 | The representative access for a case sent for someone else is created at the draft step, so an unsent draft already carries access and shows in My Care as if it were received (unsent drafts of a patient's own returning case show too). | Create the access only when the case is submitted (an authenticated submit step); hide drafts from My Care. | Medium — fix plan |
| G-15 | Abandoned drafts are never cleaned up (with their uploaded files and, for someone else, the new patient record). | A scheduled clean-up of drafts older than about 7 days, files included, audited. | Medium — fix plan |
| G-16 | The signed-in "send a case" path has no human check, so a script with a stolen session is held back only by the per-account limits. | Run the same invisible Turnstile check as the public form on the signed-in path. | Low — fix plan |
| G-13 | All new Arabic copy (My Care, the switcher, "for someone else") awaits the native review, as does the earlier Arabic. | Part of the pending native Arabic review. | Medium (launch) |

## Walk continuation (2026-10-13, after the My Care deploy `bea21d8`)

| # | Finding | Proposed fix | Severity |
|---|---|---|---|
| W-1 | Case 2 (consultation only): the coordination deposit is SAR 214.40 against an estimated total of SAR 280.15 — the deposit is 77% of the care being estimated. A fixed deposit can approach or exceed a small estimate. | Business rule: cap the deposit at a share of the estimate (or waive it under a threshold); decide in the commercial policy. | Medium (business) |
| W-2 | Arabic proposal shows the catalogue item name in English ("Diagnostic cardiology consultation") and the exchange-rate note in English ("Amounts in SAR are converted…"). | Arabic names on catalogue items; the FX note in both message files. | Medium |
| W-3 | On a narrow screen the proposal repeats its actions: "طلب تعديلات" and "اطلب من منسّقي" appear in the page and again in the sticky bottom bar. | Part of G-1 (proposal redesign): one action location per screen size. | Low |
| W-4 | Arabic assisted path works: the request is confirmed on the page ("أُرسل الطلب في 13 أكتوبر 2026") and the coordinator is emailed "Go through the proposal terms with the patient in Arabic". | Keep. | — |
| W-5 | While the patient's Arabic-terms request waits on the coordinator, the case header still reads "بانتظار: المريض" (waiting on: the patient). | Same root as #3 / #13: derive "waiting on" from the current action. | Medium |
| W-6 | **Security re-check loses the work.** Recording the patient's decision triggered the step-up sign-in; afterwards the portal said "the change you were making was not saved — please do it again" and the whole form (decision, channel, confirmation) was empty. | Ask for the re-check before the form is filled (when opening a decision-recording action), or keep the form and resubmit after the re-check. | Medium |
| W-7 | After the re-done save, the stale "not saved — please do it again" notice stayed on screen beside "تم الحفظ بنجاح" (saved successfully). | Clear the re-check notice on the next successful action. | Low |
| W-8 | The WhatsApp message "Complete your RehletShifaa profile" to an **Arabic** patient is in **English**, and says "Your treatment proposal has been **accepted**" when the patient acknowledged a preliminary estimate. | Localise the template (EN + AR) and use the acknowledged-estimate wording. | High (copy truth) |
| W-9 | Coordinator emails read "Case for case RS-2026-…". | Fix the template text. | Low |
| W-10 | The patient enters two one-time codes within an hour on the same number (secure proposal link, then profile activation). | Product decision: accept, or let a recently verified link session carry into activation. | Low (decision) |
| W-11 | Opening the account-setup link in a browser where another account is signed in ends on Keycloak's English-only page "You are already authenticated as different user … Please sign out first" with no way forward. Realistic on a shared family phone. | Theme the page (EN + AR) with a "sign out and continue" action, or sign the other session out before the action token runs. | Medium |
| W-12 | The Arabic profile form shows country names in English ("Saudi Arabia") and the search only matches English, although Profile & Security shows the same country in Arabic. | Use the Arabic country names (and search) in the country picker. | Medium |
| W-13 | The profile step says "we don't need your passport or ID now", then the first My Care step (travel requested) asks for the passport/ID number. | Align the copy with the case: say identity is checked next when travel support is requested. | Medium |
| W-14 | Identity verification asks again for date of birth and nationality, entered two minutes earlier in the profile. | Prefill from the profile; ask only for the document details. | Medium |
| W-15 | The phone menu still lists "متابعة حالتك" (Track your case) for a signed-in patient. | Hide Track case in the menu when signed in (as the header now does). | Low |
| W-16 | **Dead end (new copy).** Sending a case for someone else without a verified number shows "verify your WhatsApp number and email in Profile & Security", but Profile & Security is read-only ("to correct these details, message your coordinator"; WhatsApp "not provided"). | Point the message to the coordinator (EN + AR); self-service verification later. | Medium |
| W-17 | Works: Arabic setup email; profile prefilled and aware the case was sent by a relative; My Care for the patient matches the step-5 checklist (header band, file-tab step card, coordinator card with monograms, journey, estimate with the deposit inside it); signed-in header shows "رعايتي" and no Sign in; the someone-else refusal creates no case. | Keep. | — |
| W-18 | Case switcher cards cut long Arabic care-area names ("الجراحة العامة وجراحات ا…"). | Use the catalogue short name on the cards (e.g. "الجراحة العامة"), full name in the case header. | Low |
| W-19 | **Browser Back from My Care lands on the sign-in callback** (`/auth/callback?code=…`, already used) and shows an English-only error: "Sign-in could not be completed. Please return to the portal and try again." — for an Arabic patient after an ordinary Back. | Replace the callback entry in history after sign-in (`location.replace`); with G-5 (push history on case switches) Back then returns to the previous case. Localise the callback error. | High |
| W-20 | Works: two own cases → "حالاتك" switcher with both cards, no "Needs you" (nothing waits on the patient), no person groups, newest case opened; switching updates `?case=`, moves focus to the case heading and the open-case mark; the deposit step shows the deposit inside the step. | Keep. | — |

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
2. ~~Consultant: case 2 catalogue-only recommendation.~~ Done (diagnostic cardiology consultation, SAR 250.13 consultant cost; work item completed).
3. ~~Coordinator: case 2 proposal → expect Operations required, Finance not (journey check 15-ops).~~ Done (proposal prepared; Operations Mariam Soliman on the case team).
4. ~~Operations: travel plan before release; then coordinator releases.~~ Done (case 2 released: waiting for the patient's decision).
5. Patient: secure link + OTP (Mailpit) → view → acknowledge (English) / Arabic coordinator-recorded path; profile completion; deposit; My Care; SEC-10 visual check.
   **Progress 2026-10-13 (stopped here):** RS-2026-000002 Arabic secure link + code → assisted Arabic decision recorded by the coordinator → profile (`qa-case2-patient@local.test`) → account → My Care: done. Two-case patient (`qa-cardio@local.test`, RS-2026-000001 + 000003) switcher: done. **Next:** coordinator records RS-2026-000001 deposit received → patient sees "Deposit received"; optional identity submission (owner types the document number); then step 6. Findings W-1…W-20 above.
   Checks added for the My Care redesign and the MC-1 follow-up (`0d743b2`, `ff39128`; needs the stack rebuilt from
   `codex/platform-control-plane` after the fast-forward). Synthetic data only.
   - [ ] Activation lands in My Care on the case waiting on the patient (else the newest); paper background, no coral line under the header.
   - [ ] Case header: care-area icon on its colour, patient name, case number (LTR) and care area; "Care for ‹name›" on a relative's case.
   - [ ] Current step is the one card with the petrol top edge: one primary action, or "No action is required from you right now"; "What happens next".
   - [ ] Deposit step: amount, status badge and note **inside** the current step; the amount appears once on the page. After payment it shows in the estimate card.
   - [ ] Coordinator card near the top (under the step on a phone): initials, name, Message (with unread count), WhatsApp line; Consultant row below.
   - [ ] Journey: reached steps filled, current step ringed, labels readable; a closed case shows no step as reached.
   - [ ] Estimate card: document type, total, status badge, the preliminary-estimate line, "View proposal" only once the decision is made.
   - [ ] Two or more cases: "Your cases" switcher on top; "Needs you" on the case waiting on the patient; "Your care" / "Care for ‹name›" groups; past cases folded; switching updates `?case=` and lands on the case heading. Note what Back does (G-5).
   - [ ] Send a new case → **Myself**: only case details asked; the case joins the same patient.
   - [ ] Send a new case → **Someone else**: name, country, relationship only; the case appears under "Care for ‹name›" at once; Mailpit gets **no** "is this case for you?" email for the sender's own address; the coordinator sees the sender as representative.
   - [ ] A fourth case for someone else within an hour is refused with a clear message (G-8); an account with an unverified number or email is told to verify first.
   - [ ] Signed in on public pages: the header shows "My Care" (desktop and phone menu) instead of "My case" / Sign in / Track case; the case form has no "sign in" note.
   - [ ] Arabic at 390px: right-to-left, case numbers and amounts isolated; record how amounts read (G-9).
   - [ ] If a patient confirms a relative-sent case as their own, record what the relative and the coordinator see afterwards (G-2).
6. Identity reviewer, credentialing, referrals, Conversations with live data where possible.
