---
target: UX area 1 — patient portal as the file
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\zealous-kapitsa-ee74d4\\frontend\\src\\components"
timestamp: 2026-10-15T00-27-32Z
slug: frontend-src-components
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent), plus a capture sub-agent for 84 before screenshots (`docs/ux-redesign/screenshots/area-1/before/`). Browser overlay not injected (B skipped it while the capture run held the dev server); evidence is the CLI detector and the screenshots.

Target: UX area 1 "patient portal as the file" — `portal/MyCare.tsx`, `PatientCaseView.tsx`, `CaseSwitcher.tsx`, `CaseStatusAccess.tsx` (+ `PatientJourneyTracker.tsx`), `ProposalSign.tsx`, `ProfileActivation.tsx`, `portal/PatientDepositPayment.tsx`. Mode: Operate (Read moment: the estimate).

## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | SLA + "Meanwhile" are excellent; activation's done page ticks "Deposit received" when nothing was paid |
| 2 | Match system / real world | 2 | One document called proposal, estimate, treatment plan and quote; "Acknowledge" button vs "If you accept" next line |
| 3 | User control and freedom | 3 | Withdraw, Request changes, Decline folded; proposal-done is a dead end (no case number, no next step) |
| 4 | Consistency and standards | 1 | Two journey trackers, a third stepper, h1 outside the card on one link and inside on the others, 82 off-ladder font sizes, 24 off-scale radii |
| 5 | Error prevention | 3 | Reference regex with Arabic digits, ack checkbox, 6-digit gating, withdraw confirm |
| 6 | Recognition rather than recall | 3 | Pre-filled profile, select-all bank rows, highlighted payment reference |
| 7 | Flexibility and efficiency | 2 | Channel switch on two links, not on the status link; no copy controls on the payment slip |
| 8 | Aesthetic and minimalist design | 2 | A red emergency banner leads every secure page; "Current update" repeats the title; pay-deposit is ~3,300px on a phone |
| 9 | Error recovery | 2 | Raw backend `message` shown to patients; status-link errors render at the card's foot, far from the field |
| 10 | Help and documentation | 3 | "Where to find the reference" is model help; the secure links offer no way to reach a person |
| **Total** | | **23/40** | **Acceptable** |

## Design specificity verdict

**LLM assessment.** My Care (built 2026-10-13) is authored for this product: the file-tab current step, one backend-decided action, the coordinator as a person, the numbered journey. The three secure-link screens are not: a generic card on a tinted panel (status link), a SaaS three-step wizard with "✓" discs (activation), and a document header that is close to a dossier page but typeset off the ladder with an amber "warning" badge for the document type (proposal). Five shells, three journey drawings, four label styles: the area reads as about three products. The product's own signature, the stamp, appears only on the public confirmation and the home preview; none of "specialist reviewing" or "estimate ready" is a stamped page anywhere.

**Deterministic scan.** `impeccable detect` over 9 files: 1 finding, `side-tab` at `PatientDepositPayment.tsx:70` (4px inline-start stripe on a sand-tinted rounded note) — true positive. Mechanical grep against DESIGN.md (not detector rules): radius off-scale 24 (all `rounded-xl/2xl` in the three secure links), arbitrary shadows 3 (`ProposalSign`), off-ladder font sizes 82 (60 in `ProposalSign`), text glyph "✓" 5, inline copy objects 4 files, tinted panels 18; physical left/right 0. The detector missed what the review found (truth and consistency); the review did not count the scale of the token drift.

## Overall impression

The data and the honesty are better than the presentation. Every state is backend-decided and the copy is calm, but the patient who comes through a secure link meets a different product from the one in My Care, and the three moments that should feel like a page being stamped in their file pass unmarked. The biggest opportunity: one dossier page shell and one journey for all five doors, with the stamp where something real happened. The most urgent fix is not visual: money copy that contradicts DEP-3.

## What's working

1. My Care's current step is backend-truthful: one primary action, "usually within" + "Meanwhile", the coordinator as a named person with "messages here and on WhatsApp reach the same person" (`MyCare.tsx` 143–236).
2. The bank-reference craft: Arabic-digit regex, `translate="no"`, `bdi`, select-all, "where to find it", and the agent-cash corridor rail (`PatientDepositPayment.tsx`).
3. Acting for someone is designed in: cases grouped by person, "This case was submitted by …", the number-owner question in activation.

## Priority issues

- **[P1] Deposit truth contradicts DEP-3.** After DEP-3 the backend answers `CONTINUE_IN_PORTAL` once profile and account are done (`PatientActivationQueryService.currentAction`), so a reload of the activation link lands on the done page, which always ticks "Deposit received" (`ProfileActivation.tsx` 729) and says the coordinator is starting the next stage; the activated page says the coordinator "will arrange" the deposit (85); the unreachable deposit stage says no action is needed (707–710); the status link's deposit phase says the coordinator will share payment details (`PatientJourneyTracker.tsx` 114). *Why:* the patient is told not to act on the one step that is theirs, and the deposit expires. *Fix:* the done page lists only true steps and names "Pay your deposit in My Care" with one action while unpaid; the phase copy says where and how to pay. `commercial-terms.ts` 41, 68, 81 say the same ("your coordinator sends you the payment instructions") but are legal strings: escalate, do not edit. *Command:* clarify, then harden.
- **[P1] The signature is missing from the area.** No stamped page for case sent (outside the public form), specialist reviewing or estimate ready. *Fix:* a shared `DossierPage` (kicker = document kind and case number, one heading, stamp slot) and `CaseStamp` printed only from a backend event date; applied to the status view, the estimate header, My Care's current step, the proposal and activation done pages; the "✓ in a petrol disc" retired. *Command:* shape.
- **[P1] One file, three visual languages.** Labels at 0.7/0.72rem uppercase with tracking also on `/ar` (Ladder and Arabic Is Not Latin rules), a petrol-filled final-quote badge (One Action rule), brand-50 and sand washes as panel grounds (Two Surfaces rule), two journey trackers (the status link's has no sr "current/done" text). *Fix:* `.eyebrow` / `label-micro`, ladder sizes, 8px radii, one `CaseJourney`. *Command:* typeset, then polish.
- **[P1] Arabic parity at the decision.** `/ar` shows the English deposit terms and FX statement (known legal gate, owner decision B — keep, but add the Arabic pending notice beside it); `ackShortFinal` says something different in Arabic; `rangeLabel` = `totalLabel` in Arabic; `ackDoneDeposit` empty and `ackDoneMsg` describes a different step; an unknown consent code renders raw ("COORDINATION"). *Fix:* non-legal strings aligned; the acceptance statement to legal/native review; consents never render a code. *Command:* harden.
- **[P2] The deposit step overloads a phone.** Amount, caveat, three methods, six bank rows, two help paragraphs and the field in one card; the field is ~1,500px below the bank rows. *Fix:* two numbered parts ("1 Transfer", "2 Enter your bank's reference"), Copy controls on account number, IBAN, SWIFT and reference, the disabled online option as one trailing line, an "only account we use" assurance if the business confirms it. *Command:* distill, then layout.

## Persona red flags

**Jordan (first-timer):** four nouns for one document; "Acknowledge & continue" next to "If you accept"; a three-step activation stepper vs a seven-phase journey; done pages without a next action.

**Sam (screen reader / keyboard):** the status-link tracker has no current/done text; the activation stepper has no `aria-current`; the proposal code input has a wrapping label plus `aria-label` plus a "______" placeholder; "More options" summary below 44px; focus does not move to the first error on the status-link form.

**Casey (one-handed phone):** reference field far below the bank rows; select-all needs a long-press, no copy control; the activation stepper truncates "Secure ac…" (Arabic "تأمين الحس…") at 390.

**A relative in Benghazi acting for a parent (Arabic, phone, scam-wary):** the status link does not show where the code will go before sending it; no page says "we never ask you for this code"; the money terms turn English on `/ar`; nothing on the payment page says these are the only bank details RehletShifaa uses.

## Minor observations

- Case number not isolated on the status link (`CaseStatusAccess.tsx` 236).
- "Your medical information is shown only after contact verification" repeated after verification (351).
- The activated page still shows step 3 un-ticked (activation-done-en-1440).
- PAY_DEPOSIT body says "by bank transfer" while agent cash is offered.
- "will contact you shortly" (activation `doneIntro`) is an unsupported promise.
- Emergency notice: full banner inside the card on the secure links and above the step in My Care; the public form uses the quiet variant.
- The My Care fixture's "deposit-arranging" scenario uses a retired code (`WAIT_DEPOSIT_ARRANGEMENT`), so it renders "You're all set" beside a deposit marked "Due"; the backend now sends `PAY_DEPOSIT`. Fixture defect, not a UI one.
- `CaseStamp` sets its words at 11px, below the 12px floor.

## Questions to consider

- If the stamp marks real events, why does the patient's own file have none while the marketing preview has one?
- After activation, should the secure links keep their own shells at all, or land on the same dossier page?
- What single artefact proves to a wary relative that the bank account is really RehletShifaa's?
