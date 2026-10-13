# Fix plan — journey findings, October 2026

Status: **v2, for the owner's approval** (2026-10-13). Covers every finding in
`docs/qa/journey-findings-2026-10-13.md` to date: #1–#33, B1–B3, D1, R1, P-UX-1, MC-1, F-UX-1, DEP, MFA-1, G-1…G-16,
W-1…W-40, 2a–2k. The **Coverage index** at the end maps each ID to its batch.

Approach agreed with the owner: findings are grouped by **root cause**, sequenced **blockers and test readiness first,
then logic and truth, then copy, accessibility and redesign, then new features**. Each batch fits **one session** on
`codex/platform-control-plane`: build, verify, commit when green; the owner approves merge and push (`AGENTS.md`).
Security-sensitive batches (B3, A2, A6, A7) get an independent review before commit.

## Duplicates merged

| Kept | Merged | Why |
|---|---|---|
| #6 | W-6 | Step-up loses the form (Consultant, Finance, coordinator). |
| #9 | W-7, W-30 | "Not saved" notice wrong or stale after a re-check. |
| #31 | W-10 | Two one-time codes within an hour. |
| #1 | W-12 | Country names and search in English for Arabic users. |
| #29 | W-8 | Arabic patient's WhatsApp text in English — confirmed. |
| #13 | W-5 | "Waiting on" contradicts the current action. |
| W-25 | B3 | Catalogue-only deposits unreachable — the blocker. |
| #28 | W-23 | Delivery status — did not reproduce; re-check before fixing. |

## Sequence at a glance

| Order | Batch | Theme | Size | Waits on |
|---|---|---|---|---|
| 1 | **B3** | Blocker: Finance cannot reach deposits on catalogue-only cases | ½ session | — |
| 2 | **T1** | Test readiness: QA authenticators, second Consultant, inbound WhatsApp on dev | ½–1 session | — |
| 3 | **W0** | Finish the walk (deposit end to end, identity review, credentialing actions) | ½ session (owner signs in) | B3, T1 |
| 4 | **A0** | Quick, high-impact truth fixes | ½ session | — |
| 5 | **A1** | The next action tells the truth | 1 session | — |
| 6 | **A2** | Staff sign-in, MFA policy, security re-check, browser history | 1–2 sessions | D1 confirmed (MFA-1 agreed) |
| 7 | **A3** | Work items and "waiting on" from one source | 1 session | — |
| 8 | **A4** | Finance and commercial logic | 1 session | W-1 rule |
| 9 | **A5** | Journey history and audit from workflow events | 1–2 sessions | #15 shape |
| 10 | **A6** | Continuity, identity and representation | 1–2 sessions | W0 identity evidence; #33 |
| 11 | **A7** | Credentialing and workforce truth | 1 session | W0 credentialing evidence; W-32 scope |
| 12 | **B1** | Notifications and Arabic copy | 1 session | — |
| 13 | **B2** | Accessible names and navigation | ½ session | — |
| 14 | **C1** | Patient proposal, status link and profile redesign | 2 sessions | shape plan approval |
| 15 | **C2** | Finance workspace redesign (complete revamp) | 2–3 sessions | A4 + B3; shape plan approval |
| 16 | **DEP-2** | Online deposit payment (if approved) | design + 2 sessions | business decision |
| 17 | **R1** | Travel services priced by Operations | design + 3–4 sessions | R1 decisions |

---

## 1. Blockers and test readiness

### B3 — Finance cannot reach deposits on catalogue-only cases (blocker)

A case priced only from the catalogue never needs Finance approval, so Finance is never assigned
(`JourneyService.assign` allows FINANCE only in `PROPOSAL_PREPARATION`); recording a deposit happens only on the staff
case page, which Finance cannot open on such a case (403). Fix: when the coordinator marks payment instructions sent,
create a Finance work item "Record the deposit" (closes W-24); give Finance `CASE_READ` on cases with an open deposit (as
B1 did for offered cases); test that a catalogue-only case is paid end to end; independent security review.

**Done — `0778a3e` on `fix/b3-finance-deposit-access` (from `7d36005`; not pushed, awaiting the owner).** The security review
narrowed the read: Finance gets `CASE_DEPOSIT_READ` (payment view only, audited), not `CASE_READ`, while the case is
ACCEPTED with an open deposit; W-24 (the Finance work item) is closed here. Follow-ups from the review, slotted into
later batches: `recordReceipt`/`recordRefund`/`waiveDeposit` are platform-wide `PAYMENT_RECORD` with no open-deposit or
case-stage check (A4); an ownerless `DEPOSIT_RECORD` item cannot be cancelled, and an owned one stays with a stale Finance
assignee (A3); the journey runtime's work completion would trust `CASE_READ` alone if enabled (A2 security re-check); the
Finance open-deposit list is unpaginated (C2); a case page read still re-derives work and waiting-on (pre-existing).

### T1 — Test readiness (½–1 session)

| ID | Fix |
|---|---|
| MFA-1 / W-29 | Seeded QA staff accounts get documented test authenticators (app codes) whose secrets live in the owner's password manager, never the repo; `docs/qa/test-accounts-and-e2e-journey.md` records which method each account uses and the reset route. |
| W-34 | Seed a second Consultant login (another care area) so referrals can be accepted and care areas need no shortcut (#23). |
| W-31 | A dev-only inbound WhatsApp simulator (disabled in production) or seeded synthetic conversations, so Conversations and the coordinator routing (R1–R11, S0–S6) can be walked. |
| — | Invited accounts (`patient-identity-reviewer` and others): document the activation route for walks. |

**Done — `899de3a` (2026-10-13).** W-31 dev inbound WhatsApp simulator (`/dev/whatsapp/inbound`, local only, off the
gateway); W-34 second Consultant login `doctor-orthopedics`; W-51 `keycloak-sync` one-shot partial import; MFA-1/W-29 and
the invited-account activation route (Forgot password → Mailpit → authenticator) documented in
`test-accounts-and-e2e-journey.md`. Not done here: W-52 (seed state needs the invitation model — A7); W-40 passkey
registration in browsers without `prompt()` (A2); recording a credential (needs the administrator passkey — next walk,
in Chrome). Live checks for the next walk: `docker logs rehletshifaa-keycloak-sync-1` shows the counts; activate
`doctor-orthopedics`; inject one inbound message and see it in Conversations.

### W0 — Finish the walk (owner signs in)

Deposit end to end on RS-2026-000001 and on a catalogue-only case (after B3); the patient sees "Deposit received";
patient identity submission (owner types a synthetic document number) → reviewer activation → review; credentialing
actions (record a credential, approval decision) to settle W-37. New findings are slotted into A6/A7 before they start.

**Closed 2026-10-13.** Deposit end to end on both cases (W-41); identity submitted → reviewer activated (after W-51) →
verified (after the W-49 fix, `f60a3d0`, verified live); W-37 settled from the database (UI only). Not walked: recording a
credential (needs `credential-admin`'s passkey, W-40) — moved to T1. New findings W-42…W-56 are in the coverage index.

---

## 2. Logic and truth

### A0 — Quick, high-impact truth fixes (½ session)

| ID | Fix |
|---|---|
| W-19 | After sign-in, replace the `/auth/callback` history entry (`location.replace`); localise the callback error. `frontend/src/app/auth/callback/page.tsx`. High. |
| W-8 (+#29) | Profile-completion WhatsApp template in the patient's language; "acknowledged your preliminary estimate", not "accepted"; check every patient template for language (`NotificationOutboxProcessor`). High. |
| W-16 | "Verify first" refusal points to the coordinator (EN + AR). |
| W-9 | Coordinator email "Case for case RS-…". |
| B1/B2 | ~~Correct their status in the findings (committed and pushed: `b06ae3f`, `9e1e6c8`).~~ Done in the B3 session. |

**Done — `fc44ffb` (2026-10-13).** All A0 rows fixed with tests (W-19, W-8/#29/W-42, W-16, W-9). Live checks after the
rebuild: Back after sign-in returns to the portal; an Arabic patient's secure-message / action link arrives in Arabic.

### A1 — The next action tells the truth (1 session)

Root cause: one action code and one stage label serve two different moments.

| ID | Fix |
|---|---|
| #25 | Separate code and copy for the **pre-release** Operations plan (today `ASSIGN_OPERATIONS`, `CaseActionService` ~l.222, says "The deposit is settled"). High. |
| #27 (copy) | Pre-release Operations copy without after-deposit wording. |
| #21 | After Finance approval the stage reads "Ready to release". |
| #13 (+W-5) | "Waiting on" derived from the current action; one test per stage that header, brief and action agree. |
| #11 | Consultant view wording from the consultant's side. |
| #28 (+W-23) | Re-check with a fresh link; if it reproduces, read the outbox delivery state. |

**Done — `306757d` (2026-10-13).** #25, #27 (copy), #21, #13, W-5, #11 fixed with tests; #28 not reproduced (closed). The
"one test per stage" invariant (header = brief = action) is folded into A3's invariant test, which owns the work-item source.

### A2 — Staff sign-in, MFA policy, security re-check, browser history (1–2 sessions)

Root cause: second factors enrolled ad hoc and asked only at submit time; the portal rewrites history.

| ID | Fix |
|---|---|
| D1 / MFA-1 | Second factor at sign-in for every workforce account; passkeys required for privileged roles (system admin, credentialing, Finance), authenticator app as backup; recovery codes; documented two-person "MFA reset request" recovery. |
| #7 / W-39 | Enrol at first sign-in, one method policy per role — never mid-task. |
| W-40 | Keycloak passkey registration without `prompt()` (label inline or not asked); EN + AR explanation. |
| #6 (+W-6) | ~~Keep the refused change and resubmit after the re-check.~~ Done in the walk findings batch (one-click re-send). |
| #9 (+W-7, W-30) | ~~Notice cleared on success~~ (done, walk findings batch); abandoned re-check worded as not completed. |
| W-38 | Read-specific wording ("to see these, confirm with your authenticator"). |
| W-35 | Control Center: don't request or show areas the account cannot use (menu included); re-authentication offered as an action, not "Try again". |
| — | Recent-authentication window 15–30 min. |
| G-5 | Push history on case and view switches; reopen from `popstate`. |
| W-11 | Keycloak "already signed in as a different user" themed (EN + AR) with sign out and continue. |
| #32 | Used setup link says "already used — sign in". |

### A3 — Work items and "waiting on" from one source (1 session)

| ID | Fix |
|---|---|
| #3 | Routing at submission creates the coordinator's work item. |
| #3b | Finance approval creates "Release the proposal". |
| #18 | "At a glance" uses the same source as My work (all roles). |
| W-24 | Finance work item for a deposit — **done with B3** (`0778a3e`). |
| — | Invariant test: every waiting stage has exactly one open work item for whoever it waits on; header agrees. |
| 3-UX | Then rename tabs ("To do" / "My cases") with counts; validate with one coordinator. |

**Done — `eca4d05` on `fix/a3-work-items-one-source` (from `666bf80`; not pushed, awaiting the owner).** Root cause: the current
action fell back to the stage for steps no event raised work for, and "At a glance" counted by stage. Now
`CaseActionService.syncStageWork` keeps exactly one work item per step a stage owes a person (coordinator intake review,
internal sign-off steps and release; Finance approval; Operations' plans), decided by the same `stageFallback` as the
current action (codes and forms unchanged), on every `WorkChanged` event, never on a read. Readiness-gated work is parked
out of My work while the case waits on the patient. #3, #3b, #18, W-44 fixed; the invariant test
(`everyWaitingStageHasExactlyOneOpenWorkItemForWhoeverItWaitsOn`, submission to treatment coordination) also carries A1's
header = brief = action. B3 follow-ups: the deposit to record skips a Finance assignee who left the role, a departing
member's items return to the pool (event + sweep, audited), a lead releases or hands on pool work via the reassign endpoint
(audited from/to), pool work is never cancelled (409: recording or waiving the deposit closes it). Independent security
review: no CRITICAL/HIGH; MEDIUM/LOW fixed. 3-UX rename left for the owner's validation. Backend 721/0/2, vitest 414,
Playwright staff-home/portal/a11y 37 passed. Live walk on dev (RS-2026-000005, 2026-10-13): #3 and #3b verified (one item per
stage, the release step notified and emailed); it found Finance's pending assignment missing from "At a glance", fixed in
`52c8b47`. Also seen live, already planned: W-6 (re-check loses the recommendation and the Finance approval) and #9 (stale
"not saved" notice after success) in A2; the Consultant's summary calls a total that includes a manual line "Approved
catalogue price" (#8, A4).

### Walk findings batch — `fix/walk-findings-2026-10-14` (2026-10-14)

Everything the live walks on 2026-10-13/14 caught that was not yet fixed, done before the next live test (owner):

| ID | Fix |
|---|---|
| #6 / W-6 | The portal keeps the request the re-check refused (this tab, 10 minutes, read once) and, back from the sign-in, offers "Send it now" / "Discard" — nothing is filled in again. Chosen over asking for the re-check before the form, which would still lose a form whose window lapses while it is filled. The rest of A2 (D1/MFA-1 sign-in policy, enrolment, W-38 wording) is unchanged and still open. |
| #9 | The return notice clears on any successful change. |
| #8 | Consultant summary: "Approved catalogue price" is the catalogue lines only; an off-list amount shows apart ("Outside your list — needs Finance approval") with the estimate total. |
| W-57 | Name with digits or symbols: its own message (EN + AR), not "please enter the family name". |
| DEP-3 review | A deposit waiver is checked against case visibility, like a receipt (CASE_READ, else CASE_DEPOSIT_READ); the unused `deposit-required-coordinator` template is removed. |

Gates: backend 726/0/2, vitest 58 files / 424, typecheck, lint 0 errors, Playwright staff-home/portal/a11y 37 passed.
Open for the owner: whether a Finance waiver may settle a deposit with no patient reference; what to do with
RS-2026-000003/000004 (routed before A3, no work items).

### A4 — Finance and commercial logic (1 session)

| ID | Fix |
|---|---|
| #19 | Finance sees manual lines, base EGP prices and margin before approving. High. |
| W-26 | EGP amount due and balance shown beside the patient-currency figure; amount prefilled. |
| W-28 | Fixed payment-method list. |
| DEP-1 | Patient uploads proof of transfer; Finance work item to verify and record; patient sees "Payment received". |
| W-21 / W-22 | Deposit copy from the actual flow; readiness wording per deposit state; case touched on the action. |
| #22 | Margin and deposit policy for all 9 care areas. |
| #12 | One rounding rule for totals. |
| #8 | ~~"Approved catalogue price" excludes off-list items.~~ Done in the walk findings batch. |
| #20 | One "Approve commercial terms" action. |
| W-1 | After the business rule: deposit cap or waiver. |

### A5 — Journey history and audit from workflow events (1–2 sessions)

| ID | Fix |
|---|---|
| #15 / 15-ops | History and strip from workflow events (Finance, Operations, waits, completions); owner picks sub-steps vs stages. |
| #16 / 2j | Names, never raw subject IDs. |
| #24 | Ownership transfer audited. |
| #23 | Care-area change: reason, from→to, flagged to the Consultant. |
| #17 | "Recommendation submitted" on that step. |

### A6 — Continuity, identity and representation (1–2 sessions)

| ID | Fix |
|---|---|
| #33 | Routing prefers the patient's current coordinator (owner to confirm). |
| G-2 | Option C (decided): the patient decides on "this is me" whether the sender keeps helping; coordinators get a re-authorise action. |
| G-14 | Representative access on submit; drafts hidden from My Care. |
| G-15 | Scheduled clean-up of drafts > ~7 days, files included, audited. |
| G-16 | Invisible Turnstile on the signed-in send path. |
| G-4 | Stable person key on the patient case list; "for ‹name›" choices; group by key. |
| W-13 | Profile copy: identity checked next when travel support is requested. |
| W-14 | Identity verification prefilled from the profile. |
| #26 | Travel package: coordinator note, shown on the proposal, optional patient request. |
| — | W0 identity-review findings. |

### A7 — Credentialing and workforce truth (1 session)

| ID | Fix |
|---|---|
| W-37 | Settled in W0: credentials are recorded; the tab must list them (type, issuer, expiry, status). |
| W-36 | Account state from the identity link ("No account yet" + Invite). |
| W-32 | "Verified" wording per the owner's scope decision ("Credentials reviewed · current"); "Doctor reviews" → "Consultant reviews". |
| W-33 | Services & prices "Kind" column filled or removed. |
| — | W0 credentialing findings. |

---

## 3. Copy, Arabic and accessibility

### B1 — Notifications and Arabic copy (1 session)

| ID | Fix |
|---|---|
| #1 (+W-12) | Arabic country names and search (case form, profile). High. |
| W-2 | Arabic catalogue item names; FX note in both message files. |
| G-9 | Arabic amount format ("500 US$"). |
| G-10 | Translated fallback for unknown states. |
| W-18 | Short care-area names on switcher cards. |
| #5 | One name per care area. |
| #14 | "Consultant", not "Doctor", in messages. |
| W-15 | Hide "Track your case" in the phone menu when signed in. |
| #4 | Review step shows care area, note and email. |

### B2 — Accessible names and navigation (½ session)

2k first (the legal acknowledgement checkbox), then 2a–2j and 2h (stray comma); #10 Virtual Clinic top bar (account menu,
sign out, back to workspace — confirmed again in W-33). Verify with `e2e/a11y.spec.ts` (en + ar).

---

## 4. Redesign

### C1 — Patient proposal, status link and profile

G-1 via `/redesign-area`, reusing the My Care pieces: proposal drawer and secure proposal link (W-3), status link,
profile completion; My Care follow-ups G-6, G-7, G-11, G-12; the W-10/#31 decision. Shape plan first.

### C2 — Finance workspace (owner: complete revamp)

F-UX-1 via `/redesign-area`: Impeccable critique of the Finance dashboard, case view (approval, deposit, payments,
refunds) and Control Center Finance pages; shape plan for approval; build on the A4 + B3 logic. The Control Center
converges from the legacy base theme to Petrol & Paper here.

---

## 5. New features (after decisions)

- **DEP-3 — the patient's payment step (owner decision 2026-10-13; replaces DEP-1).** The journey never continues on
  staff word alone: the patient must give a transfer reference.
  1. After profile activation the patient's current step is "Pay your coordination deposit" (EN/AR); the case waits on
     the **patient**. The coordinator's "arrange the deposit / payment instructions sent" work item is retired — the
     platform shows the instructions itself.
  2. The patient chooses the payment method: **Online** is shown but disabled ("coming soon") until a provider is
     chosen (DEP-2); **Bank transfer to the platform account** shows the account details, the exact amount and the case
     number as the payment reference to write on the transfer.
  3. For a bank transfer the patient enters the **transaction reference number** the bank gave them — **mandatory, and
     the only proof asked for** (no receipt upload). The field explains what it is for ("so Finance can find your
     transfer and confirm it") and where to find it (the bank's confirmation SMS/email/receipt, or the transfer details
     in the banking app; also called transfer ID / FT number). Two entry points, one screen: directly on the patient's
     case screen (My Care), or — if the patient asks on WhatsApp — the coordinator sends a secure link that opens the
     same field. Staff never type the reference for the patient.
  4. Submitting it opens Finance's "Verify the transfer" work item automatically (assigned Finance person, else the
     Finance pool), with in-app notification and work email; the coordinator is told; the patient reads "We're checking
     your payment". Every step audited.
  5. Finance checks the bank and **confirms** (records the receipt against the patient's reference; journey continues)
     or **rejects with a reason** (the step returns to the patient with that reason). Treatment coordination starts
     only after confirmation.
  Owner answers (2026-10-13): bank details dummy for now and configurable (`app.payments.bank-transfer.*`); the patient
  sees the remaining amount, with the preliminary-estimate caveat highlighted; reminders daily for three days, the
  coordinator alerted on the fourth; build it on priority.

  **Done — on `feat/dep3-patient-payment-step` (from `f46c37f`; commit hash in the findings DEP row).** The coordinator's
  "arrange the deposit / instructions sent" item is retired. The patient's step `PAY_DEPOSIT` (My Care): amount due with
  the estimate caveat, Online shown disabled, bank transfer with the configured account and the case number as payment
  reference, and the mandatory transaction-reference field (what it is for, where to find it). Submitting opens Finance's
  "Verify the transfer" (`DEPOSIT_RECORD`, assigned Finance holder else pool, all told), the coordinator is told, the
  patient reads "We're checking your payment" (`WAIT_PAYMENT_CHECK`). Finance confirms the amount received against the
  reference (never without one; never their own report; never above the balance) or returns it with a reason; a part
  payment returns the balance to the patient. Reminders: due notice once, days 1–3 to the patient, day 4 to the
  coordinator (each once). Coordinator action "Send payment link" (WhatsApp request; at most once a day). New WhatsApp
  templates listed in `docs/whatsapp-message-templates.md` (to register with Meta before production). Production
  refuses to start with the dummy bank account. Independent security review: no CRITICAL/HIGH; MEDIUM (replay leak,
  maker/checker, prod dummy account, key collision, open-deposit check) and most LOW fixed. Owner to confirm: a waiver
  still settles without a patient reference (pre-existing; now refused while a reference is pending).
- **DEP-2 — online deposit payment** through a payment provider (hosted checkout/link, automatic receipt on provider
  confirmation, Finance handles exceptions). Design + build once the business decides provider, fees, currencies,
  refunds and legal terms.
- **R1 — travel services priced by Operations**, per the outline in the findings; design first; depends on A1 and A5.

---

## Decisions owed

| Item | Decided by | Blocks |
|---|---|---|
| #30, L1–L5, W-27 | Legal: refund/cancellation wording and the stored refund class | launch; proposal terms |
| G-3 | Legal: representative consent wording | consent variant |
| G-13 | Native Arabic review | launch |
| W-1 | Business: deposit cap/waiver | A4 |
| DEP-2 | Business: online payment provider | DEP-2 |
| R1 decisions | Business | R1 |
| D1 | Owner: confirm staff MFA at sign-in (MFA-1 agreed the approach) | A2 |
| #15 | Owner: sub-steps vs separate stages | A5 |
| #33 | Owner: continuity routing | A6 |
| W-32 | Owner: does "never say Verified" cover staff views? | A7 |
| W-10 / #31 | Owner: two codes or carried session | C1 |
| G-11 | Owner/design: connector contrast | C1 |

Already decided: G-2 (option C), G-8 (layered limits, done), DEP (keep Finance confirmation, DEP-1), MFA-1 (approach).

---

## Coverage index

| ID | Batch | ID | Batch | ID | Batch |
|---|---|---|---|---|---|
| #1 | B1 | #20 | A4 | G-9 | B1 |
| 2a–2k | B2 (2j also A5) | #21 | A1 | G-10 | B1 |
| #3, #3b | A3 | #22 | A4 | G-11 | C1 / decision |
| 3-UX | A3 | #23 | A5 | G-12 | C1 |
| #4 | B1 | #24 | A5 | G-13 | decision |
| #5 | B1 | #25 | A1 | G-14, G-15, G-16 | A6 |
| #6 | A2 | #26 | A6 | W-1 | A4 / decision |
| #7 | A2 | #27 | A1, R1 | W-2 | B1 |
| #8 | A4 | #28 | A1 | W-3 | C1 |
| #9 | A2 | #29 | A0 (with W-8) | W-4, W-17, W-20 | works — keep |
| #10 | B2 | #30 | decision | W-5 | A1 (#13) |
| #11 | A1 | #31 | C1 / decision | W-6, W-7 | A2 |
| #12 | A4 | #32 | A2 | W-8, W-9 | A0 |
| #13 | A1 | #33 | A6 | W-10 | C1 |
| #14 | B1 | B1, B2 | A0 (status) | W-11 | A2 |
| #15, 15-ops | A5 | B3 | B3 | W-12 | B1 (#1) |
| #16 | A5 | D1 | A2 / decision | W-13, W-14 | A6 |
| #17 | A5 | R1 | R1 | W-15 | B1 |
| #18 | A3 | P-UX-1, MC-1 | done | W-16 | A0 |
| #19 | A4 | F-UX-1 | C2 | W-18 | B1 |
| G-1 | C1 | DEP | A4 (DEP-1), DEP-2 | W-19 | A0 |
| G-2 | A6 | MFA-1 | A2, T1 | W-21, W-22 | A4 |
| G-3 | decision | G-5 | A2 | W-23 | A1 (#28) |
| G-4 | A6 | G-6, G-7 | C1 | W-24 | B3, A3 |
| G-8 | done | | | W-25 | B3 |
| W-26, W-28 | A4 | W-27 | decision | W-29 | T1, A2 |
| W-30 | A2 | W-31 | T1 | W-32, W-33 | A7 (W-33 also B2) |
| W-34 | T1 | W-35, W-38, W-39, W-40 | A2 | W-36, W-37 | A7 |
| W-41 | verified (B3) | W-42 | A0 (W-8) | W-43, W-44 | C2, A3 |
| W-45 | B2, C2 | W-46 | B1 (G-13) | W-47 | T1/W0 watch |
| W-48 | A4 (W-21/W-22) | W-49 | fixed (`f60a3d0`) | W-50 | A6 |
| W-51 | T1 | W-52 | T1, A7 | W-53 | B2 |
| W-54 | C1 | W-55 | B1 (#1), B2 | W-56 | A6, A2 |

## Next exact action

1. Owner approves this plan (order, batch boundaries) and answers what the decision register needs before each batch.
2. ~~B3~~ done (`0778a3e`, awaiting the owner's merge and push). Next session: **T1**, then **W0** (owner signs in) — so the
   walk is complete before the logic batches. W0 adds: Finance records the deposit on RS-2026-000002 (catalogue-only)
   from My work, and on RS-2026-000001. **W0 closed 2026-10-13** (deposit, identity review; credential recording moved to T1).
3. Then A0 → A1 → A2 → … one batch per session, each committed when green. A3 done (`eca4d05`, awaiting merge); A2 still waits on D1.
