---
target: area 3 Consultant portal + Virtual Clinic
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 5
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\awesome-shamir-9f726d\\frontend\\src\\components\\portal\\ClinicalReview.tsx"
target_fingerprint: "sha256:bf08fe224a3e48246acec7d7848c1bc06b78fe18a5e82fba079abbb802c94601"
target_path: "C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\awesome-shamir-9f726d\\frontend\\src\\components\\portal\\ClinicalReview.tsx"
timestamp: 2026-10-16T06-47-12Z
slug: frontend-src-components-portal-clinicalreview-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector + mechanical scan sub-agent)

# Critique — UX area 3: the Consultant's side of the file + the Virtual Clinic (before)

Target: `frontend/src/components/portal/ClinicalReview.tsx` and the Consultant paths of `StaffCaseView.tsx`
(FinalAssessment, clinical panel), `TreatmentPanel.tsx`, `DischargePanel.tsx`, `FollowUpPanel.tsx`, `AdmissionPanel.tsx`,
`CaseWorkflowActions.tsx` (Consultant branch), `ConsultantRouting.tsx` (referrals), `virtual-clinic/VirtualClinic.tsx`.
Rendered on the synthetic `e2e/consultant-fixture.ts` (P1-15..P1-18 merged into the UX line at `7b9e195`); before shots
`docs/ux-redesign/screenshots/area-3/before/` (my-work, case-review/assess/treat/discharge/follow, clinic-overview/services
× en/ar × 390/1440). Mode: Operate.

## Design Health Score — 17/40 (poor; the review screen alone ≈ 24)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 2 | Final assessment shows the first review's step copy on an Arrival-confirmed case; the follow-up screen still lists "Before discharge" blockers |
| 2 | Match system / real world | 2 | "v1 · Approved", "Doctor reviews", "Frozen rate 0.0204", "Voucher … revision 1", "Change-order band", service codes |
| 3 | User control and freedom | 2 | Final assessment has no draft and clears after save; Retire service one click; cover "Mark done" closes a pack step by hand |
| 4 | Consistency and standards | 1 | Three service pickers, two tab styles, clinic off the portal shell, inline copy tables, off-ladder sizes, a legacy form duplicating three panels |
| 5 | Error prevention | 1 | Legacy treatment-episode form can contradict the panels; cover button lands on the wrong form; silent no-op save; unconfirmed Retire |
| 6 | Recognition rather than recall | 2 | Intake summary below the form and Refer; documents only in a modal |
| 7 | Flexibility and efficiency | 2 | Next in My work and shortcuts good; no side-by-side evidence; phone pages 3.7k–6.2k px |
| 8 | Aesthetic and minimalist design | 1 | Treatment page 4.4k px with ~23 money facts above one countersign; duplicate milestone fields; tinted panels |
| 9 | Error recovery | 2 | Recommendation inline error good; final assessment silent; clinic shows raw `e.message` in a tinted box |
| 10 | Help and documentation | 2 | Hints explain system mechanics, not clinical intent |
| **Total** | | **17/40** | **Poor** |

## Design specificity verdict

Half dossier, half leftover admin forms. The cover inherited from area 2 (file tab, Your step · Waiting on, Next in My
work), the journey rail and the review's hairline evidence list read as the working side of the file. Everything after
arrival is a stack of white cards, each with its own form, and the Consultant meets the Finance ledger before the
clinical work. The Virtual Clinic is still on the old look (gradient band, 12px radii, tinted draft box, tracked
uppercase labels, cramped table) and reads as a separate product.

Deterministic scan: `impeccable detect` → 0 findings on all ten files (regex-only on .tsx; element rules did not run —
an undercount, not a pass). Mechanical scan: **103 off-ladder sizes** (ClinicalReview 30, Admission 12, Treatment 11,
FollowUp 11, Discharge 10, VirtualClinic 10, ConsultantRouting 4, ReopenCase 4); **17 tinted notices/panels**; **~11
bordered boxes inside cards** (three levels in ClinicalReview's outcome disclosure); **filled-button pairs in every
view**; 0 raw colours; 0 physical-direction classes; 4 unguarded uppercase+tracking labels (VirtualClinic); **3 inline
en/ar copy tables** (ClinicalReview, ConsultantRouting, VirtualClinic); 2 glyph icons (× and + in ClinicalReview); 1
`window.confirm` (Not clinically suitable); VirtualClinic's `role="tablist"` has no arrow keys, roving tabindex,
`aria-controls` or tabpanels. Browser overlay skipped (the portal needs the mocked OIDC session). Visual confirmations:
two or three filled buttons per view; clinic services table cells run together at 1440 and clip at 390 ar; the final
assessment amount placeholder is cut at "Amount (EG".

Fixture finding (harden): a panel that receives a malformed view crashes the whole case page into Next's error page
(no per-panel error boundary) — found when the fixture answered `/admission` with `[]`.

## What's working

1. The cover and strip are consistent and RTL-correct (mirrored arrows, isolated case number), with Next in My work.
2. `ClinicalReviewPanel`'s spine is right: evidence list, required field with inline error and focus, rare outcomes
   behind one disclosure, Save draft.
3. Treatment and Follow-up share one pattern: the next task opens first, routine work behind disclosures, re-sign-in
   confirmations, `StatusBadge` checklists with icons and screen-reader text.

## Priority issues

- **[P0] A legacy Consultant form sits on every post-arrival case and hijacks the step button.** `CaseWorkflowActions`
  renders "Record treatment episode" (facility, admission number, status, "Procedures / milestones" + "Milestones",
  complications, discharge document, "Discharge ready") at ARRIVAL_CONFIRMED / ADMISSION_READY / TREATMENT_IN_PROGRESS and
  "Schedule follow-up" at DISCHARGED — duplicating P1-16/17/18's panels and able to write contradicting facts; because
  `workflowBlock` is set, `focusAction` sends "Record clinical decision" on an arrival case to this form, not to
  FinalAssessment. Fix: retire the Consultant branch (clean-cutover rule), focus FinalAssessment. → harden / distill
- **[P1] Final assessment: wrong framing, copy and currency.** First-review step copy; history labelled "Doctor reviews /
  v1 · Approved"; "Proposal currency USD" above EGP lines; a third picker (`aria-pressed` buttons); silent no-op; no
  draft; clears after save. Fix: final-assessment step copy by stage, "Your preliminary recommendation", one shared
  picker and summary with the review, say what the patient sees. → clarify / distill
- **[P1] Evidence after the form; "Documents reviewed" overclaims.** Intake summary below Submit and Refer (≈2,900px on
  phones); the count is of clean files, not opened ones. Fix: evidence opens the review (rail on large screens);
  "Documents on file". → layout / clarify
- **[P1] Two or three filled actions in every Consultant view.** Cover step button + the form's submit; Countersign + the
  legacy Save; clinic Save + Approve & publish; a filled Reject. Fix: when the step's form is on the page, the strip
  button is the quiet "Go to …" link; the form's submit is the one filled action. → distill
- **[P1] Commerce outranks clinic.** Submit needs a priced line; the summary's largest figure is the catalogue price;
  AdmissionPanel's money and Running money come before milestones for the Consultant. Fix: "1 Recommendation · 2
  Estimate lines", summary led by the clinical text; the Consultant's money facts collapsed to one line; the current
  task's panel first. → layout
- **[P1] An urgent complication review is buried and framed as admin.** Discharge panel (stale blockers) renders first;
  the day-30 fever is ≈2,600px down; the hint says it "releases the hold on closing". Fix: after discharge, Follow-up
  first and Discharge as a summary; open with the patient's report; safety wording. → layout / clarify
- **[P2] The Virtual Clinic is off-system and a dead end.** No portal nav; tabs wrap and lack keys; gradient, rounded-xl,
  tinted draft; 11px tracked uppercase in Arabic; "Verified by RehletShifaa" (banned word); ISO dates and codes; inline
  copy; unconfirmed Retire; table cells run together. → adapt / harden
- **[P2] Arabic parity and the ladder.** ClinicalReview copy inline; COMPLETE_DISCHARGE_PACK unmapped (English in Arabic
  My work, "Mark done"); backend English context lines; English intake summary flips punctuation in RTL (no
  `dir="auto"`); Arabic-Indic digits in the clinic vs Latin on the case page; 0.7–1.05rem sizes. → typeset / harden

## Persona red flags

- **Senior Consultant, five cases between clinics, phone:** review ≈3,700px with the story near the bottom; treatment
  ≈6,200px opening with a 10-field legacy form; countersign behind the hospital ledger; documents only in a modal;
  submitting does not offer Next in My work.
- **Arabic-first Consultant:** English service names, intake summary and My work context; "Complete the discharge pack"
  untranslated; flipped punctuation; tracked clinic labels; mixed digits; a browser dialog for "Not clinically
  suitable"; the first My work title differs between en and ar.
- **Practice manager:** no way back to the portal; no statement of what they may do; "Waiting for the consultant"
  (lower case); their pending change shown twice; Retire without confirmation; a price list that reads as a table dump.

## Minor observations

Orphaned "Keyboard shortcuts ?" footer; "Refer this case" alone in a card; "Doctor reviews" wording; availability
checkbox label flips between states; off-list rows on a tinted warning surface; the journey rail shows Treatment as
current at Arrival confirmed without explanation; the final assessment amount field truncates its placeholder.

## Questions to consider

1. Should a Consultant see money beyond their own fee lines at all, or is their treatment view a clinical timeline?
2. Why is a clinical recommendation blocked until a price is picked — could the opinion and the estimate be two acts?
3. If the cover already names the step, could each Consultant step open as one sheet under it, with the evidence in the
   rail — one place to read, one place to act?
