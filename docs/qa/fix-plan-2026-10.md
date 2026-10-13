# Fix plan — journey findings, October 2026

Status: **draft for the owner's approval** (2026-10-13). Source: `docs/qa/journey-findings-2026-10-13.md` (IDs #1–#33,
B1–B2, D1, R1, G-1…G-16, W-1…W-20, 2a–2k). Approach agreed with the owner: findings are grouped by **root cause**,
sequenced **logic and truth first, then copy, accessibility and redesign**, and each batch fits **one session** on
`codex/platform-control-plane` (commit when green, owner approves merge and push; see `AGENTS.md`).

Two groups are marked **pending walk evidence**: the walk still has the deposit recording (step 5) and step 6
(identity reviewer, credentialing, referrals, Conversations). Their findings are slotted in before those batches start.

Housekeeping: B1 and B2 read "Fixed, **not committed**" in the findings; both are committed and pushed (`b06ae3f`,
`9e1e6c8`). Correct the status when Batch A0 lands.

## Duplicates merged

| Kept | Merged into it | Why |
|---|---|---|
| #6 | W-6 | Step-up loses the form — same defect, seen for Consultant/Finance (#6) and coordinator (W-6). |
| #9 | W-7 | Stale "not saved" banner after a later save. |
| #31 | W-10 | Two one-time codes within an hour. |
| #1 | W-12 | Country search and names in English for Arabic users (case form and profile). |
| #29 | W-8 | "To verify: Arabic patient's WhatsApp text in English" — now confirmed (profile message, 2026-10-13). |
| #13 | W-5 | "Waiting on" contradicts the current action. |

## Sequence at a glance

| Order | Batch | Theme | Size | Blocked by |
|---|---|---|---|---|
| 1 | **A0** | Quick, high-impact truth fixes | ½ session | — |
| 2 | **A1** | The next action tells the truth | 1 session | — |
| 3 | **A2** | Sign-in, security re-check and browser history | 1 session | D1 (owner) for one item |
| 4 | **A3** | Work items and "waiting on" from one source | 1 session | — |
| 5 | **A4** | Finance and commercial clarity | 1 session | W-1 rule (business) |
| 6 | **A5** | Journey history and audit from workflow events | 1–2 sessions | #15 shape (owner) |
| 7 | **A6** | Continuity, identity and representation | 1–2 sessions | walk step 6; #33 confirm |
| 8 | **B1** | Notifications and Arabic copy | 1 session | — |
| 9 | **B2** | Accessible names | ½ session | — |
| 10 | **C1** | Patient proposal, status link and profile redesign | 2 sessions (plan + build) | shape plan approval |
| 11 | **R1** | Travel services priced by Operations | design + 3–4 sessions | R1 decisions |
| — | **Blocked** | Legal, business and native-review items | — | see register |

---

## Phase A — logic and truth

### A0 — Quick, high-impact truth fixes (½ session)

| ID | Fix |
|---|---|
| W-19 | After sign-in, replace the `/auth/callback` history entry (`location.replace`) so Back never lands on a used code; localise the callback error (EN + AR). `frontend/src/app/auth/callback/page.tsx`. |
| W-8 (+#29) | Profile-completion WhatsApp template: Arabic for Arabic patients, and "you acknowledged your preliminary estimate" instead of "accepted". Check every patient template for language selection (`NotificationOutboxProcessor`). |
| W-16 | "Verify first" refusal points to the coordinator, not the read-only Profile & Security (EN + AR) — copy added this week. |
| W-9 | Coordinator email "Case for case RS-…" (`NotificationOutboxProcessor`). |
| B1/B2 | Correct the status in the findings document. |

Verify: unit tests for the callback and the templates (language + wording), Playwright my-care and callback check, backend
notification tests.

### A1 — The next action tells the truth (1 session)

Root cause: one action code and one stage label serve two different moments.

| ID | Fix |
|---|---|
| #25 | Separate code for the **pre-release** Operations travel plan (today `ASSIGN_OPERATIONS` at `CaseActionService` ~l.222 shares the post-deposit copy "The deposit is settled…"); own EN + AR copy; test that no pre-release case says the deposit is settled. |
| #27 (copy part) | Pre-release Operations action copy without "confirm it once every requirement is met" (after-deposit wording). |
| #21 | After Finance approval the stage reads "Ready to release", not "Internal approval". |
| #13 / W-5 | "Waiting on" derived from the current action (coordinator owes the Arabic-terms call → "waiting on: our team / you"); one test per stage that header and action agree. |
| #11 | Consultant view labels from the consultant's side (no "Waiting on: our team" leaks). |
| #28 | Secure-link delivery status shown to staff reads the outbox state ("Delivered", not "Queued"). |

Verify: backend `CaseActionService` tests per stage; unit tests for the copy; full suite.

### A2 — Sign-in, security re-check and browser history (1 session)

Root cause: sensitive actions ask for re-authentication only at submit time, and the portal rewrites history.

| ID | Fix |
|---|---|
| #6 (+W-6) | Ask for the re-check **before** the form starts (opening clinical review, Finance approval, recording a patient decision) — or keep a draft and resubmit after it. High. |
| #9 (+W-7) | Clear the "not saved" notice on the next success. |
| — | Check the recent-authentication window (aim 15–30 min) so step-up is not asked on every click. |
| #7 | Enrol the authenticator at first sign-in for roles that need it, not mid-task. |
| G-5 | Push history on case and view switches, reopen from `popstate` (with W-19 already done, Back returns to the previous case). |
| W-11 | Keycloak theme (EN + AR) for "already signed in as a different user" with a "sign out and continue" action. |
| #32 | Keycloak: a used setup link says "already used — sign in", not "expired". |
| D1 | **Owner decision first:** authenticator at sign-in for every workforce account (recommended) — then configure. |

Verify: Playwright for history (Back between cases), unit tests for the re-check entry point, a live re-check walk on dev
(owner signs in).

### A3 — Work items and "waiting on" from one source (1 session)

Root cause: "Needs attention" comes from open work items, "Waiting on" from the stage; some stages create no work item.

| ID | Fix |
|---|---|
| #3 | Routing at submission creates the coordinator's work item. |
| #3b | Finance approval creates "Release the proposal" for the coordinator. |
| #18 | Finance "At a glance" uses the same source as My work. |
| — | Invariant test: every stage that waits on someone has exactly one open work item for them, and the header agrees. |
| 3-UX | Then rename the tabs ("To do" / "My cases"), counts on the tabs; validate with one coordinator. |

Verify: backend invariant test over all stages; dashboard Playwright specs; full suite.

### A4 — Finance and commercial clarity (1 session)

| ID | Fix |
|---|---|
| #19 | Finance sees which lines are manual, their base EGP price and the margin before approving. High. |
| #22 | Margin and deposit policy settable for all 9 care areas. |
| #12 | One rounding rule for proposal totals (sum of rounded lines vs rounded total). |
| #8 | "Approved catalogue price" excludes off-list items. |
| #20 | One "Approve commercial terms" action. |
| W-1 | **Business decision first:** cap the deposit at a share of the estimate, or waive under a threshold — then implement in the commercial policy. |

*Pending walk evidence:* the deposit-recording step (walk step 5) may add items here.

### A5 — Journey history and audit from workflow events (1–2 sessions)

Root cause: history is built from stage changes only.

| ID | Fix |
|---|---|
| #15 / 15-ops | History and journey strip from workflow events: Finance and Operations assignments, waiting periods and completions. **Owner to choose:** sub-steps under Proposal (recommended) or separate stages. |
| #16 / 2j | Names, never raw subject IDs, in history and in the transfer choice. |
| #24 | Ownership transfer as an audit event. |
| #23 | Care-area change: reason when it differs from the patient's request, from→to recorded, mismatch flagged to the Consultant. |
| #17 | "Consultant accepted the case" → "Recommendation submitted" on that step. |

### A6 — Continuity, identity and representation (1–2 sessions) — *pending walk evidence (step 6)*

| ID | Fix |
|---|---|
| #33 | Routing prefers the patient's current coordinator when eligible (as `INTAKE_CONTINUITY` does). Owner to confirm. |
| G-2 | Option C (decided): on "this is me", the patient decides whether the sender keeps helping them (EN + AR); coordinators get a visible re-authorise action. |
| G-14 | Representative access created on submit (authenticated submit step); drafts hidden from My Care. |
| G-15 | Scheduled clean-up of drafts older than ~7 days, files included, audited. |
| G-16 | Invisible Turnstile on the signed-in send path. |
| G-4 | Stable person key on `GET /patient/cases`; "for ‹name›" choices in the form; group by that key. |
| W-13 | Profile copy says identity is checked next when travel support is requested. |
| W-14 | Identity verification prefilled from the profile; asks only for the document. |
| #26 | Travel package: coordinator note on turn on/off; "Travel package included" on the proposal; optional patient request. |

---

## Phase B — copy, Arabic and accessibility

### B1 — Notifications and Arabic copy (1 session)

| ID | Fix |
|---|---|
| #1 (+W-12) | Arabic country names and Arabic search in the country picker (case form, profile). High. |
| W-2 | Arabic names on catalogue items; the exchange-rate note in both message files. |
| G-9 | Arabic amounts ("500 US$") — currency placement in `formatMoney` for `ar`. |
| G-10 | Translated fallback label for unknown proposal/deposit states. |
| W-18 | Short care-area names on switcher cards. |
| #5 | One name per care area across public and staff screens. |
| #14 | "Consultant", not "Doctor", in the messages panel. |
| W-15 | Hide "Track your case" in the phone menu when signed in. |
| #4 | Review step shows care area, condition note and email. |

### B2 — Accessible names (½ session)

2k first (the legal acknowledgement checkbox), then 2a–2j and the "My work , 1" stray comma (2h); #10 Virtual Clinic top
bar (account menu, sign out, back to workspace). Verify with `e2e/a11y.spec.ts` (en + ar) and unit name assertions.

---

## Phase C — redesign

### C1 — Patient proposal, status link and profile (shape plan + build)

G-1 via `/redesign-area`, reusing the My Care pieces: the proposal drawer and secure proposal link (W-3: one action
location per screen size), the secure status link, profile completion. Includes the My Care follow-ups G-6, G-7, G-11,
G-12 and the W-10/#31 decision (two codes in an hour). Starts with a shape plan in `docs/ux-redesign/plans/` for owner
approval, as My Care did.

## Phase D — new feature

### R1 — Travel services priced by Operations

Design session first (backend-design + Impeccable), following the outline in the findings. Needs the R1 decisions:
margin on travel, Finance approval of travel prices, fixed price vs range, companions, travel deposit. Depends on A1
(#25/#27) and A5 (journey events).

---

## Blocked register (decisions owed)

| Item | Owner of the decision | Blocks |
|---|---|---|
| #30, L1–L5 | Legal: refund and cancellation wording | launch; proposal terms |
| G-3 | Legal: representative consent wording | consent variant |
| G-13 | Native Arabic review | launch |
| W-1 | Business: deposit cap/waiver rule | A4 |
| R1 decisions | Business | R1 batch |
| D1 | Owner: authenticator at sign-in for staff | one item in A2 |
| #15 | Owner: sub-steps vs separate stages | A5 |
| #33 | Owner: confirm continuity routing | A6 |
| W-10 / #31 | Owner: accept two codes or carry the session | C1 |
| G-11 | Owner/design: connector contrast | C1 |

## Next exact action

1. Owner reviews this draft (order, batch boundaries, the decisions in the register).
2. Next session: finish the walk (deposit recording, then step 6); slot new findings into A4/A6 (or a new batch).
3. Owner approves the plan; batches then run one per session, starting with **A0**.
