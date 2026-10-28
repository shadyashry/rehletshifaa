---
target: Operations workspace (AdmissionPanel, travel plan, DischargePanel) — area 5 close
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\infallible-fermi-5c9b5b\\frontend\\src\\components\\portal\\AdmissionPanel.tsx"
target_fingerprint: "sha256:31b09bca9e64352ecb0025595e8cd77ab497acbf84a70ead44b800e68afd8180"
target_path: "C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\infallible-fermi-5c9b5b\\frontend\\src\\components\\portal\\AdmissionPanel.tsx"
timestamp: 2026-10-28T11-53-36Z
slug: frontend-src-components-portal-admissionpanel-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent). Re-critique closing UX area 5 (slices 5-0..5-3); the first
A pass on the pre-fix 5-3 shots scored 27/40, its two cheap P1s were fixed (the cashier line above the file; the shots fixture's
missing `myWorkCount`, which made My work say "No cases need action" above five items), and A ran again on the final shots.

Target: the Operations side of the staff case page — `AdmissionPanel.tsx` (`OperationsFile`), `TravelPlanPanel.tsx`, `DischargePanel.tsx`
(`OperationsHome`), composed by `StaffCaseView.tsx`, shared `panel-parts.tsx`. Mode: Operate. Evidence: `docs/ux-redesign/screenshots/area-5/after/`
(synthetic `e2e/operations-fixture.ts`; plan, letter, balance, admit, depart × en/ar × 390/1440, plus My work). Baseline 19/40
(`2026-10-28T10-24-59Z`).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | ✓ trail clear; the strip still says "Arrange travel and arrival" while the file opens the reservation or the letter (B-5-1); the rail has no travel step |
| 2 | Match System / Real World | 3 | Cashier, receipt, amount, "Recording it starts treatment"; "point of no return", "evidence trail", "countersigned" unexplained |
| 3 | User Control and Freedom | 3 | Change / correct under each done fact; stage moves confirm (admission number, PNR, departure) |
| 4 | Consistency and Standards | 3 | One hospital, one filled button per view; one act named twice ("Record the receipt" / "Record the hospital receipt"; "Confirm the patient has left" / "Confirm the departure"; Arabic queue vs case step) |
| 5 | Error Prevention | 3 | Owed amount prefilled and explained, times start at now, clock hints; the amount input reads `195500.00` |
| 6 | Recognition Rather Than Recall | 3 | Done acts are facts; later acts' hollow circles read a little like radios |
| 7 | Flexibility and Efficiency | 3 | Prefills, Next in My work, shortcuts, Go to the form |
| 8 | Aesthetic and Minimalist Design | 2 | "Destination & treatment" and "Before admission" repeat the file; the letter view shows ~6 disclosures; 390 pages 2,800–3,300px |
| 9 | Error Recovery | 3 | Refusals said at the form with the portal's reason; `loadFailed` panels still have no retry |
| 10 | Help and Documentation | 3 | Good hints on prefill, clock, effects; nothing on what the point of no return commits |
| **Total** | | **29/40** | **Good (from 19)** |

## Design Specificity Verdict

**LLM assessment:** partly specific (was generic). The hospital file reads as a checklist of real acts — done acts one ✓ line, the
current act open with the view's one filled button, later acts quiet rows — and "Patient pays at the cashier: EGP 195,500 · $3,988.20"
belongs to this product. The cards around the file (Destination & treatment, Before admission, Evidence trail, the rail) are unchanged,
so it is a good checklist inside an admin page rather than an Operations desk.

**Deterministic scan:** `impeccable detect` 0 findings on the five files. Off-ladder sizes 0; tints / nested cards 0; physical direction 0;
raw colours 0; `window.confirm` 0; inline en/ar tables and copy ternaries 0 (were 1 + 10); money inputs without `dir="ltr"` 0 (were 4);
filled buttons at most **1** per Operations view (were 2, 3 with Discharge); `datetime-local` outside `TimeField` 2, both in the travel
form with `dir="ltr"` (were 11 without a hint; the Consultant's follow-up and fit-to-fly fields moved onto `TimeField` in 5-3). False
positives: "left-to-right" in a comment; the tabs' arrow-key `locale === "ar"`; comments naming `datetime-local`.

**Visual overlays:** skipped — the portal needs the mocked OIDC session; no user-visible overlay.

**Synthesis correction:** A's second pass listed "the departure confirmation … with no confirmation"; the departure does confirm
(`DepartureForm`, `ActForm` confirm, covered by `DischargePanel.test.tsx`); a static shot cannot show the dialog. Not counted.

## What's Working

1. The checklist shape: ✓ fact → open act → later rows, exactly one filled button per view (plan, letter, balance, admit, depart).
2. The cashier act: amount prefilled from the balance owed and saying so, paid-at now, currency and copy behind one disclosure, the
   cashier total one line above the file.
3. Money and references hold in RTL: tabular figures, isolated LTR references, the Arabic discharge stamp without uppercase.

## Priority Issues

- **[P1] The strip names the stage, not the act.** "Arrange travel and arrival" for reserve and letter alike (the baseline P0, now
  smaller: the file and its one primary agree). Fix: B-5-1 step codes for the reservation and the letter. Command: /impeccable clarify.
- **[P1] Cards around the file repeat it.** Destination & treatment restates hospital, admission date and arrival; "Before admission"
  restates pending acts. Fix: fold into the file for Operations; keep blockers only for what Operations cannot do. Command: /impeccable distill.
- **[P2] Too many disclosures before the open act.** Letter view: change travel plan, record arrival, issue voucher, point of no return,
  first appointment, evidence trail. Fix: only acts possible now; history behind one "File history". Command: /impeccable layout.
- **[P2] Arabic parity gaps.** Tabs clip ("السجا") at 390; a separator dot lands at a run boundary in a few facts; My work contexts
  are the backend's English (fixture items carry no wording code); the amount input is unformatted. Command: /impeccable harden.
- **[P3] Later rows' hollow circles read as radios.** Command: /impeccable polish.

## Persona Red Flags

**Operations officer at the cashier, phone, Arabic-first:** the act sits about halfway down a 3,300px page ("انتقل إلى النموذج" gets
there); the receipt itself is four prefilled fields; the clipped tab and a misplaced separator look broken.

**New Operations hire:** the strip says "رتّب السفر والوصول" while the open form reserves the hospital; "point of no return" unexplained.

**Coordinator or auditor:** the same facts appear twice; the rail has no travel step.

## Minor Observations

- At 1440 "Next in My work" shows an Arabic patient name inside an English sentence (check its isolation).
- "Waiting on: You" on the case vs "Waiting on: Operations" in My work.
- The "Confirmed" chip on Admission & money does not say what is confirmed.
- At 1440 the admission number's input and button share a row while other forms stack.
- At 1440 the rotated depart stamp's divider crowds the date.

## Questions to Consider

- If the file already shows every act and its state, does Operations need "Destination & treatment" or "Before admission" at all?
- Should "Your step" be written by the file's open act, so the strip can never disagree with the form below it?
- On a phone at the cashier, should the case open scrolled to the act, with the file's history folded above it?
