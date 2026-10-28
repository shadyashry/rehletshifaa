# Shape plan — Area 4: the Finance workspace (C2, complete revamp)

Status: **plan, 2026-10-28**. Written without an owner gate, under the owner's standing instruction (2026-10-15: "always
continue each next implementation on new session without asking me till the end"). Assumptions are marked **[A]**.

Scope (`PLAN.md` row 4, owner C2 "complete revamp"):
- the verification queue (My work and the deposit transfer);
- the commercial approval (`FinanceApproval.tsx`);
- change-order pricing;
- the reconciliation workbench (`ReconciliationPanel.tsx`) and the statements;
- Finance's parts of `AdmissionPanel.tsx` (letter decision, countersignatures, fee balance);
- Control Center › Commercial, only where Finance works in it.

Critique: `.impeccable/critique/2026-10-28T15-30-37Z__frontend-src-components-portal-financeapproval-tsx.md`, **20/40**.
It was a dual-agent run; the detector found 0 issues. The mechanical scan found:
- 14 text sizes off the ladder;
- one inline en/ar table (44 strings);
- 2 unconditionally filled buttons;
- 9 irreversible money commands with no confirmation;
- 7 raw Finance forms, so a refusal is not said at the form;
- English context sentences on the Arabic page.

It also confirmed a runaway: panels duplicated on a case in treatment.

Before shots: `screenshots/area-4/before/`, from `e2e/finance-shots.spec.ts` on the synthetic `e2e/finance-fixture.ts`. The
change-order case has no before shot: it could not be captured, because the page grew without bound.

**Data.** P1-15 (admission), P1-16 (treatment and change orders), P1-17 (discharge, reconciliation, statements) and DEP-3 (the
bank transfer) are on this line, so every screen is designed on its real contract.

## Job and audience

**Who.** Finance officers and Finance Managers, Arabic-first or English, mostly at a desk, sometimes on a phone. Mode: **Operate**.

**The job.** An officer opens a case to settle one money fact, then moves to the next case. The facts are:
- a transfer received;
- terms that are fair;
- a hospital price above the estimate;
- a cashier receipt;
- the platform fee balance;
- a change order's price;
- the hospital's final invoice;
- a variance above the band (the Manager's);
- a statement's e-invoice reference.

**What they need for each.** The figure in EGP (the ledger's currency), what it is checked against, the gap, and one
deliberate act with a confirmation that names the amount.

## Outcome and proof

**Success.** From My work an officer opens a case and sees the money act at the head of the Finance sheet, in EGP first:
- the figure;
- what it is checked against;
- the gap, already worked out.

They confirm it in a dialog that repeats the amount and reference, and the page answers with the fact as one line. This holds:
- in en and ar;
- on a phone;
- without a refund form, a proposal card or a deposit card that is not this moment's.

**Evidence (rendered, never re-derived).**
- `actions.currentAction` / `availableActions`
- `/work/mine`
- the case view's `proposal`, `commercial`, `gates`, `deposit`
- `/finance/cases/{id}/admission|treatment|reconciliation`

## Selected direction

Enhance the accepted layouts. Petrol & Paper is unchanged, and no new token is added.

1. **Panels that stay put (4-0).** Each staff panel gets its own key. Today five sibling panels share `key={c.id}`, and React
   appends copies on every render of a case in treatment, for every role.
2. **Money is never one click (4-0 → 4-2).** Every Finance command goes through `ActForm`, which:
   - says a refusal at the form;
   - asks for a confirmation whose title carries the amount and the reference ("Record EGP 43,200 received against
     QNB-…?").

   The return and refuse paths are secondary, behind a disclosure where they are a second verb.
3. **EGP first (4-0 → 4-2).** Where Finance records, EGP is the bold figure and the patient's currency is the sub-line. The
   rate is printed the way Egyptian finance quotes it ("1 USD = 49.02 EGP"). Each check states its gap:
   - the letter: "EGP 22,500 above the estimate's maximum (9.4%)";
   - the variance: "EGP 7,660 above the band".
4. **Only this moment's money (4-0, 4-3).** For Finance:
   - the deposit card leads only while a transfer waits; otherwise it is one line ("Deposit paid · EGP 43,200 · $881.28");
   - a refund sits behind "Record a refund", only once something was paid;
   - the proposal and checklist fold to one line outside the approval;
   - done acts read as `DoneAct` lines.
5. **One Finance sheet (4-3).** The money act opens first and carries the view's one filled button:
   - when the step names it, as the step says;
   - when the step names nothing, as the panel's own `next`, the way the fee balance and the e-invoice work today.

   The strip says the same. Backend follow-up **B-4-1**: step codes `RECORD_FEE_BALANCE` and `RECORD_E_INVOICE`, so
   neither moment reads "Nothing needs you" **[A: presentation first; the codes are a small backend slice after 4-3]**.
6. **Arabic as a first voice.** Copy lives in `portalWork.*` (en + ar, inserted textually). Finance's work contexts are
   worded from their work type in Arabic. References are isolated and never broken mid-token. Tables become stacked rows
   under 640px.
7. **Convergence in every touched file.** Ladder sizes, `StatusBadge` for tags, hairlines, isolates, `PanelBoundary`.

## Slices

One slice per session. Each one loads Impeccable and the Vercel skills at batch start, runs the four read-only reviews,
verifies, and commits.

| Slice | What | Files | Depends |
|---|---|---|---|
| **4-0 the deposit and the approval** (this session) | Fixture and shots spec; critique; this plan. Panel keys (the runaway). Deposit transfer: confirm through `ActForm` with a confirmation naming the amount and reference; return behind a disclosure with its own confirmation; reference unbroken. EGP first in Finance's deposit card. The refund behind a disclosure, only once paid. The deposit as one line outside its moment. `FinanceApproval`: copy into messages, approve with a confirmation, the manual-line chip as `StatusBadge`, the rate as "1 USD = … EGP", stacked lines on a phone, ladder sizes | `StaffCaseView.tsx`, `FinanceApproval.tsx` (+ test), `RefundForm.tsx`, messages, `e2e/finance-*` | — |
| **4-1 the admission money** | Letter decision: the gap and its percentage, accept/refuse through `ActForm` + confirmation, refuse as the secondary verb. Receipt countersign as a checked fact (receipt against the voucher's "pays at the cashier"). Fee balance: its derivation (fee − deposit credit) and a confirmation. Done money acts as `DoneAct` lines; the trail behind one disclosure. EGP first in the voucher facts for Finance | `AdmissionPanel.tsx` (+ test), messages | 4-0 |
| **4-2 the treatment and the settlement** | `PriceForm` and the interim bill via `ActForm` + confirmation (the total and the band in the title). Reconciliation: lines submit with a confirmation; the variance verdict ("EGP 7,660 above the band") before the decision; Approve / Return as two equal acts, the Manager's one filled button following `next`; dispute and e-invoice through `ActForm`. Ledger as stacked rows on a phone; ladder sizes (12 × `0.85rem`); statement totals net/gross labelled | `TreatmentPanel.tsx`, `ReconciliationPanel.tsx` (+ tests), messages | 4-1 |
| **4-3 the Finance sheet + close** | Finance's case page as one sheet: the act first, proposal/checklist one line outside the approval, the strip agreeing with the page (fee, e-invoice). My work: Arabic contexts from the work type, overdue before priority **[A: presentation of the backend order only if the backend's order already does so; else backlog]**. Control Center › Commercial where Finance works (margin and deposit policy read) converged to Petrol & Paper. Re-critique (target ≥ 28/40); after shots (`AREA4_SHOTS=after`); STATUS closing the area; PLAN.md row 4 closed | `StaffCaseView.tsx`, `CurrentAction.tsx`, `MyWork.tsx`, `platform-control-center/commercial/*`, messages | 4-2 |

## States and ranges

- **Deposit:** REQUESTED or PARTIALLY_PAID, with or without a SUBMITTED transfer; REJECTED last reference; PAID; REFUNDED,
  WAIVED or CANCELLED; a cash payment through an agent.
- **Approval:**
  - lines: no manual line, one, several;
  - a facility package line;
  - no margin policy;
  - a rate not fixed yet, or fixed;
  - the FX re-approval of a final quote.
- **Letter:** CHECK_PENDING (within the estimate), VARIANCE_OPEN (reason owed), REFUSED.
- **Receipt and money:** a receipt awaiting countersignature; the point of no return; a fee balance with no work item;
  an emergency admission.
- **Treatment:** change orders PROPOSED or EMERGENCY (unpriced); an interim bill to countersign; a variance over the band.
- **Reconciliation:** not opened; OPEN; AWAITING_COUNTERSIGN (Manager); DISPUTED; CLOSED with statements (current or
  superseded, e-invoice recorded or owed, credit due).
- **Everywhere:** a panel that fails to load; a refused command (step-up, version conflict); long Arabic names; amounts
  above a million; USD and EGP display currencies.

## Open questions (assumed, not asked)

- O-1 **[A]** Finance's ledger currency is EGP. The patient's currency is a converted display, shown second.
- O-2 **[A]** The fee balance and the e-invoice have no step codes. Until B-4-1, the panel's own `next` leads, and the strip
  is not changed.
- O-3 **[A]** The refund stays on the deposit card (one disclosure). A refund moment of its own is not in this area.
- O-4 Control Center › Commercial is the Finance Manager's settings home. Only the screens Finance opens are converged
  here; the rest is area 6.
