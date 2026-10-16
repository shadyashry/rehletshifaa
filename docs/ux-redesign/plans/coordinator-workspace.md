# Shape plan — Area 2: the coordinator workspace ("the working side of the same file")

Status: **plan, 2026-10-15** — written without an owner gate under the owner's standing instruction (2026-10-15: "always
continue each next implementation on new session without asking me till the end"); assumptions are marked **[A]**.
Critique: `.impeccable/critique/2026-10-15T19-06-05Z__frontend-src-components-portal-staffcaseview-tsx.md`, **21/40**
(dual-agent; detector 0 — regex-only; mechanical scan: 70 off-ladder sizes, ~12 tinted notices, ~155 inline copy
ternaries, 40px header buttons). Before shots: `screenshots/area-2/before/` (synthetic `e2e/coordinator-fixture.ts`).
Source of the ask: platform review D-06 / ex P2-22 — "a My work queue with keyboard navigation, a per-case 'one next
action' strip mirroring the patient's current step, and inline reply with templates" (templates stay backend data, P2-22).

## Job and audience

Coordinators and coordinator leads (also Consultants, operations and finance on the same pages) work a full day of
cases on desktop, WhatsApp open beside them, in English or Arabic. Mode: **Operate**. They return many times a day,
need to know in a second what is theirs now, do it, and move to the next item without hunting.

## Outcome and proof

- **Success:** from My work, a coordinator can open the next item, see one "now" line (their step, who waits, what the
  patient's own page says), act, and go to the next item — by keyboard alone, in en and ar, without the page repeating
  itself or alarming them.
- **Evidence (rendered, never re-derived):** the backend's `actions.currentAction` / `waitingOn` / `availableActions`;
  `/work/mine` items (ordered by the backend); the case `messages` and `patientReply`; conversation summaries
  (`windowOpen`, `windowExpiresAt`, `lastInboundAt`); and — new, slice 2-0 — the patient's current step for staff.

## Selected direction (enhance the accepted layouts; Petrol & Paper unchanged)

1. **The file cover.** The case header and the current-action panel read as the cover of the case file: the 2px petrol
   file-tab edge (the patient pages' `file-tab`), identity on top, then **the one-next-action strip**: *Your step* (the
   backend's current action, as today) · *Waiting on* (said once on the page) · *The patient's page* (the patient's
   current step in the patient's own words from `portalWork.myCare`, with its usual window). Duplicates go: the case
   brief's patient-voice "Waiting for our team" line, the journey rail's waiting chip, the case number shown twice.
2. **The strip stays with you.** When the cover scrolls away, a slim sticky line under the site header keeps the case
   (number, name) and *Your step*; its control moves focus to the action in the panel (a quiet button, never a second
   filled action). It also carries **Next in My work** — the next item after this case in My work's order.
3. **A working loop by keyboard.** My work and the case queue are roving-focus lists (↑/↓, Home/End, Enter opens); Back
   from a case returns focus to the row it came from; a small, documented shortcut set (`?` help, `j`/`k`, `g` then
   `w`/`c`/`t`/`m` for the views, `/` search, `n` next item on a case) bound to **physical keys** (`event.code`) so an
   Arabic layout works, ignored in fields, with modifiers and under dialogs, with an **off switch** in the help dialog
   (WCAG 2.1.4; stored per browser as a convenience).
4. **Messages that show who is owed a reply.** Case messages: thread tabs (Patient · Consultant · internal …) with
   unread counts instead of a `<select>`; "Doctor" → Consultant; a reply to the patient reachable from the strip when
   the step is a patient reply. Conversations: "awaiting your reply" and "reply window closes {time}" in the list, one
   tab style (underline), focus to the thread on pick, a live confirmation on send, bidi isolated per run.
5. **Quieter chrome.** The view's name is the page's place (not the role); the role subtitle and the count line leave
   every view but My work; the count line is ink unless the overdue work is yours; Out of office becomes a one-line
   disclosure; journey rail uses the journey markers; header buttons 44px with the Field Edge; one tab style; type on
   the ladder and hairline notices (no tinted panels) in every touched file; inline copy moves to `messages/{en,ar}.json`
   as each component is touched.

## Slices (one per session; each: Impeccable + Vercel skills at batch start, the four read-only reviews, verify, commit)

| Slice | What | Files | Depends |
|---|---|---|---|
| **2-0 backend** | Staff case actions carry `patientStep` — the patient's current step (code, kind, expected working days, exit word; no free text) resolved by the same `CaseActionService` rule the patient's page uses; coordinators only **[A]** (the one voice to the patient), null for other staff and for patients. Typing on the frontend. | `CaseActionService`, `CaseActionsView`, test; `CurrentAction.tsx` types, `e2e/portal-fixture.ts` | — |
| **2-1 cover + strip** | File cover (tab edge), the strip (your step · waiting on · the patient's page), duplicates removed, sticky line with "Go to step" and Next in My work (order only; keys come in 2-2), "Also open on this case" from My work items, journey markers in the rail, 44px header buttons, back label names the view, copy of the touched parts to messages | `StaffCaseView.tsx`, `CurrentAction.tsx`, `JourneySnapshot.tsx`, `Portal.tsx` (pass tasks/next), messages | 2-0 |
| **2-2 keyboard flow** | Roving-focus lists in My work and the queue, return-to-row, shortcut layer + `?` dialog + off switch, `n` on a case | `MyWork.tsx`, `CaseQueue.tsx`, new `portal/StaffShortcuts.tsx`, `Portal.tsx`, messages | 2-1 |
| **2-3 messages + conversations** | Thread tabs with unread counts, Consultant naming, reply from the strip, conversation list states, underline scope tabs, focus/live region, bidi; both components' copy to messages | `CaseMessages.tsx`, `ConversationsView.tsx`, `StaffCaseView.tsx` (drawer), messages | 2-1 |
| **2-4 chrome + convergence** | Place as heading, role subtitle out, count line only on My work and in ink, Out of office as a disclosure, one tab style, ladder sizes and hairline notices in the area's remaining files, the remaining inline staff copy in `StaffCaseView`/`Portal` to messages | `Portal.tsx`, `StaffQueue.tsx`, `RoleDashboardSummary.tsx`, `ReplyCoverPanel.tsx`, `StaffCaseView.tsx` | 2-1..2-3 |

Then the area's closing pass: re-critique (target ≥ 28/40), screenshots `screenshots/area-2/after/`, STATUS.

## States and ranges

- My work: 0 (empty → team queue hint, unchanged), 1–30 items; same case may hold 2+ items (grouping not in scope **[A]**).
- Current action kinds: CLAIM, ACCEPT, FOCUS (with inline form), COMPLETE (note), WAIT, NONE; preview (unowned) has no
  patient step line **[A: the patient's page says Received there too, but the coordinator is deciding ownership]**.
- Patient step codes: `WAIT_COORDINATOR_REVIEW`, `WAIT_CONSULTANT_REVIEW`, `WAIT_PROPOSAL`, `REVIEW_PROPOSAL`,
  `PROVIDE_INFORMATION`, `COMPLETE_PROFILE`, `VERIFY_IDENTITY`, `PAY_DEPOSIT`, `WAIT_PAYMENT_CHECK`, `WAIT_COORDINATION`,
  `WAIT_TREATMENT`, `IN_TREATMENT`, `FOLLOW_UP`, `NONE` (+ exit word). No field → no line (data rule).
- Messages: 0–200 per case across 4 threads; conversations: 0–50 per scope, window open/closed, unnamed contacts.
- Long Arabic names, long EGP amounts, 320px phones; RTL everywhere.

## Constraints and boundaries

- Theme unchanged (V-6 petrol, V-7 beige); tokens only; coral only as a mark; one filled action per view; logical
  properties; `theme-petrol.css` is unlayered (no margin/padding resets on classes that take spacing utilities).
- Workforce hierarchy, ownership, journey and authority stay in the backend; the UI renders `actions`, never infers a
  step from `status`. The "next item" is My work's own order, not a new priority rule.
- Every copy change in `messages/en.json` and `ar.json`; plurals only under `portalWork.plural`. WCAG 2.2 AA (2.1.4 for
  shortcuts, 2.4.11 focus not obscured by the sticky line, 2.5.8 targets).
- Untouched: the accepted views and their URLs (`?view=`, `?case=`), the landing rule, the leave-with-draft guard, the
  Assign Consultant single entry point, Control Center, patient screens.
- Not in this area: reply templates (backend data, P2-22), grouping My cases/Team queue into My work (views accepted at
  GATE P2-2), bulk mark-read (no endpoint).

## Open decisions (none block)

- **[A] O-1** Patient step visible to coordinators only (data minimisation); widen later if operations/Consultants ask.
- **[A] O-2** Shortcuts on by default with an off switch (2.1.4 allows either); the help dialog names every key.
