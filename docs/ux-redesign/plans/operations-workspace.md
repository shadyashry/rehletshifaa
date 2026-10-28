# Shape plan — Area 5: Operations' side of the file

Status: **plan, 2026-10-28** — written without an owner gate under the owner's standing instruction (2026-10-15: "always
continue each next implementation on new session without asking me till the end"); assumptions are marked **[A]**.
Scope: `docs/remaining-work-prioritized.md` item 1.7 — Operations' screens for the reservation, the admission letter, the
balance receipt, the travel plan and the departure, and the copy of Operations' inline travel form.
Critique: `.impeccable/critique/2026-10-28T10-24-59Z__frontend-src-components-portal-admissionpanel-tsx.md`, **19/40**
(dual-agent; detector 0; mechanical scan: 0 off-ladder sizes, 0 tints, 0 physical direction, 1 inline en/ar table + 10
ternaries — all in the travel form — two filled Saves in one view, 11 datetime-local fields without a hint). Before shots:
`screenshots/area-5/before/` from `e2e/operations-shots.spec.ts` on the synthetic `e2e/operations-fixture.ts`.

**Data.** P1-15 (admission), P1-17 (discharge, return, departure) and B-3-1b (treatment starts on the admission number) are on
this line (`feat/review-p0` @ `a6e1a6fe`), so every screen is designed on its real contract.

## Job and audience

Operations officers (Arabic-first or English, often at the hospital's admission desk or cashier on a phone). Mode: **Operate**.
An officer opens a case to record one real-world fact — the hospital reserved, its letter, the patient landed, the cashier's
receipt, the admission number, the final invoice, the flight home, the patient gone — and wants the one field set for that
fact, what it was checked against, and the next case.

## Outcome and proof

- **Success:** from My work an officer opens a case, sees one act with its one filled button, records it with the amount or
  date already where it can be, and the page answers with the fact as one line — in en and ar, on a phone, without meeting
  a second picker for the same hospital or a form that forgets what it holds.
- **Evidence (rendered, never re-derived):** `actions.currentAction` / `availableActions`; `/work/mine`; `travelPlan` on the
  workspace; `/operations/cases/{id}/admission|discharge|reconciliation`.

## Selected direction (enhance the accepted layouts; Petrol & Paper unchanged; no new token)

1. **A travel plan that keeps what it holds (5-0).** The PUT replaces the whole plan, so the form reopens on everything
   stored and resends it; arrival arrangements (reception, accommodation, transport, companion) reachable behind a
   disclosure; booking as two radio choices; the patient's arrival its own act behind a confirmation (it moves the stage);
   copy in `portalWork.travelPlan` (en + ar); one filled button (Save, then the arrival once booked); the confirm-without-
   arrival refusal said at the field.
2. **One hospital file, one act at a time (5-1).** The Operations sheet orders the acts reserve → letter → travel → arrival
   → receipt → admission number; only the current act is open with the view's one filled button (across the travel panel
   and the admission panel); done acts become one-line facts ("Reserved · Nile Heart Hospital · 30 Oct"). The reservation
   owns the hospital: the travel form drops its picker and resends the stored value **[A: until B-5-1 the travel plan's
   facility stays on the record for the logistics card]**; the logistics card reads the reservation and a stage-true
   travel line (never "Arrived" after discharge), with `intlLocale` dates. Backend follow-up **B-5-1**: step codes
   `RESERVE_HOSPITAL` / `RECORD_ADMISSION_LETTER` in travel coordination so the strip names the real act.
3. **The cashier on a phone (5-2).** Receipt: amount prefilled from the balance owed, paid-at now, method; currency,
   foreign amount and the copy behind "Paid in another currency or with a copy"; currency a select of the FX list;
   voucher facts folded to one visible line ("Patient pays at the cashier EGP 195,500 · US$3,988.20"); money inputs
   `dir="ltr"`; the admission number and the point of no return say their effect and confirm; date hints on every
   `datetime-local`.
4. **Going home (5-3).** Operations' Discharge view leads with the return and the departure; the pack and the letter as
   summaries; departure confirmed (it ends Operations' part); reconciliation hidden for Operations or reduced to its
   status line **[A: presentation only]**; "Also open" never repeats the current step; Arabic work titles.
5. **Convergence in every touched file.** Ladder sizes, hairlines, `StatusBadge`, isolates for Latin runs in Arabic,
   en/ar parity, `PanelBoundary` around each panel.

## Slices (one per session; each: Impeccable + Vercel skills loaded at batch start, the four read-only reviews, verify, commit)

| Slice | What | Files | Depends |
|---|---|---|---|
| **5-0 travel plan** (this session) | Fixture + shots spec; critique; this plan; `TravelPlanPanel` replaces `CaseWorkflowActions` (keeps the stored plan, arrangements, booking radios, arrival behind a confirmation, copy in messages, one filled button, at-field refusal) | `TravelPlanPanel.tsx` (+ test), `StaffCaseView.tsx`, `portal-model.ts`, messages, `e2e/operations-*` | — |
| **5-1 the hospital file** | Act order + one filled button across panels; done acts as facts; reservation owns the hospital; logistics card stage-true; B-5-1 recorded (or built if small) | `StaffCaseView.tsx`, `AdmissionPanel.tsx`, `TravelPlanPanel.tsx`, messages | 5-0 |
| **5-2 the cashier** | Receipt prefill + disclosure; currency select; voucher one-liner; confirmations and hints on admission number / PNR; date hints | `AdmissionPanel.tsx`, `panel-parts.tsx`, messages | 5-1 |
| **5-3 going home + close** | Operations' discharge order; departure confirm; reconciliation for Operations; "Also open" dedupe; Arabic work titles; re-critique (target ≥ 28/40), after shots (`AREA5_SHOTS=after`), STATUS closing the area | `DischargePanel.tsx`, `ReconciliationPanel.tsx`, `CurrentAction.tsx`, messages | 5-2 |

## States and ranges

- Operations cases: ACCEPTED / TRAVEL_COORDINATION (no plan, planning, booked; reservation none/reserved; letter none,
  pending, variance, refused, accepted), ARRIVAL_CONFIRMED (voucher, balance owed, receipt awaiting countersign),
  ADMISSION_READY (number owed), TREATMENT_IN_PROGRESS (final invoice once discharge is planned), DISCHARGED / FOLLOW_UP
  (return, departure).
- Long Arabic hospital names (the fixture carries one), no active hospital, no checked documents, refused letter, failed
  panel load, the confirm-without-arrival refusal, `PRICE_VARIANCE_OPEN` and readiness refusals on a confirmed booking.

## Open questions (assumed, not asked)

- O-1 the travel plan's own facility (kept on the record until B-5-1 decides whether the reservation alone is the hospital).
- O-2 `datetime-local` is on the device's clock; an Egypt-time rule for staff abroad is a product decision.
