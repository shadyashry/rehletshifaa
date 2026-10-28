---
target: Finance workspace (FinanceApproval, ReconciliationPanel, AdmissionPanel finance, TreatmentPanel pricing, deposit transfer)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\ux-4-finance-aa276b\\frontend\\src\\components\\portal\\FinanceApproval.tsx"
target_fingerprint: "sha256:ed7dd01ef7654d033ea16882c9074cad17ce2b2d4e3d983994035442f6fc826d"
target_path: "C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\ux-4-finance-aa276b\\frontend\\src\\components\\portal\\FinanceApproval.tsx"
timestamp: 2026-10-28T15-30-37Z
slug: frontend-src-components-portal-financeapproval-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent)

Target: the Finance side of the staff case page. Files: `FinanceApproval.tsx`; `ReconciliationPanel.tsx`; `AdmissionPanel.tsx` (the Finance branch: letter decision, countersign, fee balance); `TreatmentPanel.tsx` (Finance's `PriceForm` and interim bills); `StaffCaseView.tsx` (`TransferPanel`, `DepositCard`, `RoleActions` and how the panels are composed); `FxReapproval.tsx`; My work. Mode: Operate. Evidence: `docs/ux-redesign/screenshots/area-4/before/`, from the synthetic `e2e/finance-fixture.ts`. It covers my-work plus the deposit, approve, letter, receipt, fee, change, reconcile, variance and statement cases, each in en and ar at 390 and 1440.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | The fee and statement cases show "Nothing needs you right now" while a form or a link waits on the page. My work says "Waiting on: another party" for items the case page says "You". |
| 2 | Match System / Real World | 2 | "v1 · OPERATIONS COMPLETED", blocker codes lower-cased ("price variance open", "fee balance not paid"), the raw beneficiary "Rehlet Shifaa", and the rate as 0.0204 EGP→USD instead of ≈49 EGP per USD |
| 3 | User Control and Freedom | 2 | Countersign and return confirm. Confirming a deposit, returning a transfer, approving commercial terms, accepting or refusing a letter, pricing a change order, submitting the lines and recording an e-invoice all commit on one click |
| 4 | Consistency and Standards | 2 | The act is inline in the strip only for approval; every other moment says "Go to the form". "Return" is a link, a button or a disclosure. Two USD figures for one package come with no rate label. 44 strings sit in an inline en/ar table (FinanceApproval) |
| 5 | Error Prevention | 1 | The refund form shows on every case, even with $0 paid. 7 of 8 Finance forms are raw `<form>`, so a refusal is not said at the form. The letter shows the quote and the cap but not the gap |
| 6 | Recognition Rather Than Recall | 2 | The letter variance (+22,500 / +9.4%) and the fee balance's derivation are left for the clerk to work out |
| 7 | Flexibility and Efficiency | 3 | "Next in My work" and the prefilled deposit amount work; reconcile re-asks a figure already shown |
| 8 | Aesthetic and Minimalist Design | 1 | **Panels duplicate without bound in treatment** (duplicate React keys): the change-order page grew to 324,000–563,000px. The Patient proposal, deposit and refund blocks repeat on all nine cases. The act sits 40–60% down the page |
| 9 | Error Recovery | 2 | `loadFailed` has no retry. The return reason is free text with no example |
| 10 | Help and Documentation | 3 | Good hints ("Enter each line as the invoice shows it", step-up notes), undercut by raw codes |
| **Total** | | **20/40** | **Poor-to-acceptable** |

## Design Specificity Verdict

**LLM assessment:** partly specific. The cover strip, and the reconciliation's two columns with their variance tags ("At the package price", "Unapproved extra · not charged"), are this product's settlement desk. Below the strip the page turns generic. All nine Finance moments sit in the same stacked cards (Destination, Admission & money, Patient proposal, Deposit, refund form), money appears in three currencies with USD bold and EGP grey even though Finance works in EGP, and a refund form sits at the foot of every case. The dossier lives in the strip and the ledger only.

**Deterministic scan:** `impeccable detect` found 0 issues across the six files (exit 0). The mechanical scan found:
- Off-ladder sizes: 14 (`text-[0.85rem]` ×13: FinanceApproval 1, ReconciliationPanel 12; `text-[0.9rem]` ×1 in FxReapproval).
- One inline en/ar table: FinanceApproval, 22 keys per locale.
- One tinted fill used as a text chip: the "Manual" label.
- Physical direction and raw colours: 0. `window.confirm`: 0.
- Unconditionally filled buttons: FinanceApproval's Approve and TransferPanel's Confirm. Neither follows `next`.
- Irreversible money commands with no confirmation: deposit confirm, transfer reject, approve terms (×2 sites), letter accept/refuse, the change-order price, reconciliation submit, dispute resolve and the e-invoice record.
- Raw `<form>` instead of `ActForm`: 7 Finance forms. Only the fee form uses it, and it has no confirm.
- Arabic: work titles exist for all seven work types, but the context sentences stay English (`copy: null`, `LOCALIZED_FORM_HINT` only knows PROPOSAL_TERMS_CALL), and `currentAction.work.APPROVE_COMMERCIAL_TERMS` is missing.
- Money inputs all carry `dir="ltr"` and `inputMode`.

False positives:
- The `locale==="ar"` check in the tab key handler.
- The Operations/doctor TreatmentPanel fields.
- Assessment A's "charged contradicts its lines" came from fixture data, which set `chargedEgp` to the invoice total; the fixture now matches the backend.

**Visual overlays:** skipped. The portal needs the mocked OIDC session, so no user-visible overlay exists.

**Runtime check (parent):** the 563,202px `case-change-en-390.png` was confirmed in a probe. The overview tab held 79 children: `StaffCaseView` gave admission, treatment, discharge, reconciliation and follow-up the same `key={c.id}` as siblings of one fragment, so each re-render appended copies. This hits every role on a case in treatment. Slice 4-0 gives each panel its own key, and the change-case before shots were dropped because they cannot be taken.

## Overall Impression

The money is stored and shown honestly, each panel already knows its next act, and the ledger is auditable. The page does not hold together. Finance meets the same clinical case file nine times, scrolls past facts to find a form, commits money with one click on most acts, and reads English instructions on the Arabic page. The biggest opportunity is one **settlement sheet** for Finance: the act for this moment at the top, one line per money fact in EGP first, and everything done or not Finance's folded away.

## What's Working

1. The reconciliation ledger: authorised against invoiced, with per-line variance tags (ReconciliationPanel).
2. One filled button per panel through `next`, in AdmissionPanel, TreatmentPanel and ReconciliationPanel.
3. References and amounts isolated (`<bdi dir="ltr" translate="no">`, `Money`), with step-up notes and an evidence trail for audit.

## Priority Issues

- **[P0] Panels multiply on a case in treatment.** Duplicate sibling keys in `StaffCaseView` make the overview grow without bound (79 children, a page over 300k px). Fix: one key per panel (slice 4-0). Command: /impeccable harden.
- **[P0] Money is committed on one click.**
  - Covers the deposit confirm and return, approving commercial terms, letter accept/refuse, the change-order price, reconciliation submit, dispute resolve and the e-invoice record.
  - Fix: `ActForm` with a confirmation whose title states the amount and reference ("Record EGP 43,200 received against QNB-…?"), with the refusal said at the form.
  - Command: /impeccable harden.
- **[P1] The strip and the page disagree.**
  - The fee and statement cases say "Nothing needs you" with work on the page; My work says another party.
  - Fix: a Finance sheet that leads with the act the step names. When no step is named, the panel's own `next` leads, and the strip says what the page shows. Backend follow-up: step codes for the fee balance and the e-invoice reference.
  - Command: /impeccable layout.
- **[P1] Everything on every case.**
  - The proposal, deposit and refund blocks show on all nine moments. The refund form shows with nothing paid.
  - Fix: the deposit card leads only for the deposit moment; elsewhere it is one line ("Deposit paid · EGP 43,200 · $881.28"). The refund sits behind a disclosure, only when something was paid.
  - Command: /impeccable distill.
- **[P1] Arabic parity.**
  - English context sentences on the Arabic page.
  - The FinanceApproval table is inline; the "1" in "service … 1" renders with broken bidi; "Cardiology margin" and "Rehlet Shifaa" are raw.
  - The transfer reference breaks mid-token (`break-all`).
  - Tables clip at 390.
  - Command: /impeccable clarify + adapt.
- **[P2] EGP is the clerk's ledger but reads as the sub-line.** The fee balance is underived; the letter gap is not stated; the rate is printed as 0.0204. Fix: EGP first wherever Finance records; the gap and its percentage in the letter decision; the rate as "1 USD = 49.02 EGP". Command: /impeccable clarify.

## Persona Red Flags

**Finance clerk, Arabic desktop:** Arabic headings over English instructions. Tables clip and amounts are hard to scan right-to-left. The transfer reference wraps in the middle.

**New Finance hire:** cannot tell the EGP truth from the converted display, or why the fee balance is 12,500. Seven controls and three verbs in the deposit card, of which only two belong to this moment.

**Finance Manager approving a variance:** Approve is the filled button and Return a small link. The "above the band by EGP 7,660" verdict sits under six figures instead of before the decision.

**Auditor:** the trail is collapsed with no preview. Two USD amounts for one line, with no rate label.

## Minor Observations

- My work lists the overdue item third, after two "High" items.
- The deposit "Amount (EGP)" label touches its input.
- The reconcile header leaves out the city.
- The variance "Approve" has no object ("Approve the variance").
- `pick()` falls back to lower-cased codes for blockers Finance sees ("fee balance not paid").

## Questions to Consider

- If each Finance moment is one act on one ledger, should Finance see the clinical case file at all, or one settlement sheet (authorised → invoiced → paid → owed) with the act at its head?
- Should every Finance figure read EGP first, with the patient's currency as the sub-line?
