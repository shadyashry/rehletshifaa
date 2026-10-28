---
target: Operations workspace (AdmissionPanel, travel plan, DischargePanel)
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\ux-5-operations-27e3fd\\frontend\\src\\components\\portal\\AdmissionPanel.tsx"
target_fingerprint: "sha256:cee40535c763ef55c947d43e59198070f3892fea4380f3d425cce7b4f1e068d7"
target_path: "C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\ux-5-operations-27e3fd\\frontend\\src\\components\\portal\\AdmissionPanel.tsx"
timestamp: 2026-10-28T10-24-59Z
slug: frontend-src-components-portal-admissionpanel-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent)

Target: the Operations side of the staff case page — `AdmissionPanel.tsx` (Operations branch), `CaseWorkflowActions.tsx` (travel plan), `DischargePanel.tsx` (final invoice, return, departure), composed by `StaffCaseView.tsx`. Mode: Operate. Evidence: `docs/ux-redesign/screenshots/area-5/before/` (synthetic `e2e/operations-fixture.ts`: plan, letter, balance, admit, depart × en/ar × 390/1440, plus My work).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | "Destination & treatment" says "Arrived" after discharge; the rail marks Treatment current during travel coordination and has no travel/arrival step |
| 2 | Match System / Real World | 2 | "Point of no return", "voucher revision 1", "Evidence trail", blockers in system words; the cashier's words are receipt, amount, paid |
| 3 | User Control and Freedom | 3 | Corrections exist; stage moves (admission number, departure, confirmed arrival in the travel form) have no confirmation |
| 4 | Consistency and Standards | 1 | Two hospital pickers ("Facility" in the travel plan, "Hospital" in the reservation); two filled Saves; travel copy inline en/ar |
| 5 | Error Prevention | 2 | 11 datetime-local fields without a hint; travel form reopens blank and the endpoint replaces the whole plan (a re-save wipes stored dates, flight, visa); free-text currency |
| 6 | Recognition Rather Than Recall | 2 | Closed tasks are bare link titles; the officer must know which of 5–6 disclosures is theirs |
| 7 | Flexibility and Efficiency | 2 | No receipt amount prefill from "balance still owed" (Finance's fee form prefills) |
| 8 | Aesthetic and Minimalist Design | 1 | Receipt form 7 fields (3 optional); voucher 8 money facts; read-only reconciliation for Operations; "Also open" repeats the step |
| 9 | Error Recovery | 2 | `loadFailed` without retry; travel form has no inline errors |
| 10 | Help and Documentation | 2 | Good hints exist (number, voucher) but none on dates or on what the point of no return commits |
| **Total** | | **19/40** | **Poor-to-acceptable** |

## Design Specificity Verdict

**LLM assessment:** generic. Type, hairlines and palette follow DESIGN.md, but every stage stacks the same cards (Destination & treatment, a form card, Admission & money, Evidence trail): an admin form in the brand's skin, not an operations desk. Nothing says "you are at the cashier, this is the one number to type". case-balance is 2,170px at 1440 and 3,747px at ar-390 with the act two-thirds down.

**Deterministic scan:** `impeccable detect` 0 findings on the four files. Mechanical scan: off-ladder sizes 0; tinted panels / nested cards 0; physical direction 0; raw colours 0; `window.confirm` 0; uppercase/tracking 0. Inline en/ar table 1 + 10 locale ternaries, all in `CaseWorkflowActions.tsx` (16 strings outside the messages). Filled buttons: each panel keeps one (`next`), but the travel form's Save is always filled, so a view shows two (three with Discharge). 11 datetime-local fields with no hint; 4 money inputs without `dir="ltr"`; travel inputs without `maxLength`/`autoComplete`. The logistics card repeats the travel form's dates. The pre-release Operations plan textarea has only an `aria-label`. False positives: "left-to-right" in a comment; separators.

**Visual overlays:** skipped — the portal needs the mocked OIDC session; no user-visible overlay.

## Overall Impression

The money and evidence are trustworthy and each panel already knows its one next act. The page does not: the strip, the travel form and the admission panel each claim the step, and the officer at a cashier scrolls past three cards to reach a seven-field form. The biggest opportunity is one "hospital file" for Operations that shows only the current act, with done acts as one-line facts.

## What's Working

1. `next` in AdmissionPanel and DischargePanel opens the right task with the panel's one primary (the depart view does it well).
2. Money as stored: tabular figures, `bdi`/`dir="ltr"` references, the frozen-rate line.
3. The cover strip: step, waiting-on and "Go to the form" in one calm header.

## Priority Issues

- **[P0] The step and the page disagree.** In travel coordination the backend says UPDATE_TRAVEL_PLAN for the whole stage; AdmissionPanel opens "Reserve the hospital" as next, and the travel Save is always filled: two filled buttons, the anchor on the wrong form. Fix: one Operations sheet ordered reserve → letter → travel → arrival with one primary; backend step codes for the reservation and the letter (B-5-1). Command: /impeccable layout.
- **[P1] The travel form loses data and speaks two languages inline.** Reopens blank; the PUT replaces the plan, so a re-save clears stored dates, flight and visa, and arrival arrangements are unreachable. Confirmed arrival (a stage move) is a plain field beside a status that also says "Arrived". Fix: slice 5-0. Command: /impeccable harden.
- **[P1] Duplicate hospital fact.** Travel `facilityId` and the reservation's can disagree; the logistics card reads the travel one. Fix: the reservation owns the hospital; the card reads it. Command: /impeccable distill.
- **[P1] Arabic parity.** The "Also open" work title in English on the Arabic page; Latin city and voucher runs not isolated; travel copy inline. Command: /impeccable clarify.
- **[P1] The receipt form on a phone.** Prefill the owed amount and now; currency/foreign amount/copy behind "Paid in another currency"; voucher facts behind a disclosure with one line visible ("Patient pays at the cashier …"). Command: /impeccable distill.
- **[P2] Stale or contradictory states.** Logistics "Arrived" after discharge; rail without travel; "Fit to fly · Examined —"; reconciliation for Operations shows "Nothing authorised" beside "Authorised EGP 200,000"; "Also open" repeats the step. Command: /impeccable harden.

## Persona Red Flags

**Operations officer at the hospital cashier, phone, Arabic-first:** scrolls ~1,700px past destination, voucher and blockers to "سجل إيصال المستشفى"; seven fields, Latin date placeholders, free-text currency; "تسجيل" without the amount checked against the balance owed; an English work title in the header.

**New Operations hire:** two Saves, "Facility" vs "Hospital"; does not know whether reserving or travel comes first, or what the point of no return commits them to.

**Coordinator or auditor:** the logistics card says "Arrived" after discharge; the page contradicts itself.

## Minor Observations

- The discharge stamp's uppercase in the Arabic rendering (check against the Arabic Is Not Latin rule).
- `when()` in StaffCaseView's logistics uses `locale`, not `intlLocale(locale)` (Arabic digits rule).
- "First confirmed appointment" shows for Operations at every stage.
- The PNR form's Save does not say its effect.
- At 1440 the travel form is half width with an empty column.

## Questions to Consider

- Should Operations have one hospital file (reserve → letter → receipt → admit) showing only the current act, done acts as one-line facts?
- Is the travel plan a form at all, or a few facts recorded once (flight, arrival)?
- If the backend knows the next act, why does the frontend still guess it from `letterCheck` and `currentCode`?
