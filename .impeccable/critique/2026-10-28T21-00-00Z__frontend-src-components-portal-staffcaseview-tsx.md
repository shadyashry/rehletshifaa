---
target: Finance workspace, re-critique at the close of area 4 (the Finance sheet in StaffCaseView, FinanceApproval, AdmissionPanel finance, TreatmentPanel pricing, ReconciliationPanel, the deposit, My work, Control Center › Margin & Deposit)
total_score: 29
max_score: 40
baseline_score: 20
baseline: .impeccable/critique/2026-10-28T15-30-37Z__frontend-src-components-portal-financeapproval-tsx.md
p0_count: 0
p1_count: 0
timestamp: 2026-10-28T21-00-00Z
slug: frontend-src-components-portal-staffcaseview-tsx
---
Method: single pass over the rendered after shots (`docs/ux-redesign/screenshots/area-4/after/`, the synthetic
`e2e/finance-fixture.ts`: my-work, margin & deposit and nine cases, en/ar at 390 and 1440) and the 4-0..4-3 code, against the
baseline's ten heuristics and its P0/P1 list. Mode: Operate.

## Design Health Score

| # | Heuristic | Before | After | Key evidence |
|---|-----------|--------|-------|--------------|
| 1 | Visibility of System Status | 2 | 3 | The strip names the act on every case. On the fee and statement cases the panel's own act becomes "Your step" (`RECORD_FEE_BALANCE`, `RECORD_E_INVOICE`), and "Waiting on: You". Kept from 4: the strip hears the panel after it loads (one paint of "Nothing needs you"), until B-4-1 |
| 2 | Match System / Real World | 2 | 3 | EGP leads where Finance records. The rate reads "1 US$ = EGP 49.0196", the letter gap and the fee derivation are worded, and blocker codes are words. Kept from 4: the beneficiary and purpose are the backend's English |
| 3 | User Control and Freedom | 2 | 3 | All nine money commands ask first, with the amount and the reference in the question. Return, refuse and refund are second verbs behind disclosures |
| 4 | Consistency and Standards | 2 | 3 | Every Finance act is `ActForm` + confirmation. The approval copy is in messages. Margin & Deposit uses Petrol & Paper. Kept from 4: Arabic names the deposit three ways |
| 5 | Error Prevention | 1 | 3 | Refusals are said at the form. The reconciliation mismatch is held before any question, the refund appears only once paid, and the band check is in whole cents. Kept from 4: the deposit amount still relies on the browser's range message |
| 6 | Recognition Rather Than Recall | 2 | 3 | Each check states its gap: the letter "EGP 22,500 above the estimate's maximum (9.4%)", the fee "55,700 − 43,200 = 12,500", the variance "EGP 7,660 above the band" |
| 7 | Flexibility and Efficiency | 3 | 3 | "Go to the form" lands in the act's first field. Next in My work and `n` work. Overdue-first is still the backend's order (B-4-2) |
| 8 | Aesthetic and Minimalist Design | 1 | 3 | Panels stay put. The act opens the sheet with the view's one filled button. The proposal is one line, with the deposit as its line. The destination card is gone when the file names the hospital. The fee case is under 1,700px tall at en-1440, against 324k–563k px before |
| 9 | Error Recovery | 2 | 2 | Refusals now give retry wording at the form. A panel that fails to load still has no retry button |
| 10 | Help and Documentation | 3 | 3 | The hints stand. Arabic contexts on My work and the strip are now worded from the work type |
| **Total** | | **20** | **29** | **Good**: target ≥ 28 met |

## What changed the score

- **P0: panels multiplied (4-0).** Fixed: each panel has its own key.
- **P0: money on one click (4-0..4-2).** Fixed: nine commands confirm, each naming the amount.
- **P1: the strip disagreed with the page (4-3).** Fixed in presentation: the panel's own act is the strip's step. Backend B-4-1 makes it a real step code.
- **P1: everything on every case (4-0, 4-3).** Fixed: the deposit is a card only while a transfer waits, and otherwise one line. The refund needs a payment first. The proposal and checklist fold to one line, except at the approval.
- **P1: Arabic parity (4-0..4-3).** Fixed: the approval copy, the isolated rate, references that never break, stacked rows on a phone, and Arabic work contexts. The only remainder is native review.
- **P2: EGP as the sub-line (4-0..4-2).** Fixed.

## Remaining (all in backlog "Area 4 — Finance")

- **MEDIUM:**
  - When two acts coincide (a transfer and an FX re-approval), two filled buttons are still possible.
  - The three Arabic deposit terms.
  - `AmountInput`'s refusal is still not inline.
- **LOW:**
  - The `LeadSignal` stopgap (B-4-1).
  - Overdue-first (B-4-2).
  - The legacy `.cc-notice`/`.cc-badge` palette, and policy facts that run on in one line on Margin & Deposit (area 6).
  - The deposit amount field width.
  - Generic Arabic contexts.

## Persona check

- **Finance clerk, Arabic desktop.** The step reads in Arabic, with an Arabic context. The act comes first, EGP is bold, references stay unbroken and tables stack on a phone.
- **New Finance hire.** The fee balance shows its derivation. Only this moment's act is open, and done acts read as one line each.
- **Finance Manager.** The verdict comes before Approve and Return. Approve is filled only as `next`, kept for owner review.
- **Auditor.** The trail sits behind one disclosure with a count. The rate is labelled.
