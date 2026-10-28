---
target: area 3 Consultant portal + Virtual Clinic (after)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\ux-3-4-closing-a9f91f\\frontend\\src\\components\\portal\\ClinicalReview.tsx"
target_fingerprint: "sha256:625bd591029eb5aa9dcc37606bb172292bc44b417db45d04155ed16d88b1eb80"
target_path: "C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\ux-3-4-closing-a9f91f\\frontend\\src\\components\\portal\\ClinicalReview.tsx"
timestamp: 2026-10-28T08-44-42Z
slug: frontend-src-components-portal-clinicalreview-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector + mechanical scan sub-agent)

# Critique — UX area 3: the Consultant's side of the file + the Virtual Clinic (after, closing pass 3-4)

Target: `ClinicalDecision.tsx`, `ClinicalReview.tsx`, the Consultant paths of `StaffCaseView.tsx` (FinalAssessment, panel
order, evidence rail), `TreatmentPanel`, `DischargePanel`, `FollowUpPanel`, `AdmissionPanel`, `CaseWorkflowActions`
(Start treatment), `ConsultantRouting`, `panel-parts`, `ReopenCase`, `PortalFrame`, `virtual-clinic/VirtualClinic.tsx`,
`Affiliations.tsx`, `clinic-parts.tsx`, after slices 3-1..3-3 (`48e89c0f`). Rendered on the synthetic
`e2e/consultant-fixture.ts`; shots `docs/ux-redesign/screenshots/area-3/after/` (my-work, case-review/assess/treat/
discharge/follow, clinic-overview/services/affiliations × en/ar × 390/1440). Mode: Operate. Same rubric as the 3-0 run (17/40).

## Design Health Score — 28/40 (Good; trend 17 → 28)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 2 | At Arrival confirmed the strip says "Nothing needs you right now" beside "Waiting on: The Consultant" above an open final assessment (B-3-1a); the journey rail marks Treatment current at arrival; My work listed the urgent complication last (fixture, fixed in 3-4) |
| 2 | Match system / real world | 3 | Clinical wording much better; still "RS-CO-RS-2026-000013-1", service codes "CARD-REV · version 1", "Running money", "releases the hold on closing" (fixed in 3-4) |
| 3 | User control and freedom | 3 | Confirm dialogs everywhere, review drafts; no final-assessment draft (G-2); the approval-setting checkbox saves on click |
| 4 | Consistency and standards | 3 | One tab style, one shell, one Summary, one filled action; clinic header lacks the bell and My work count; tracked micro-labels beside sentence-case headings |
| 5 | Error prevention | 3 | Legacy form gone, Start treatment gated + confirmed, prices checked at the field; "No relationship" an exclusive choice drawn as a checkbox |
| 6 | Recognition rather than recall | 3 | Evidence rail works for the review; at the final assessment the preliminary recommendation sat last in a 55vh scroller, cut mid-heading (moved first in 3-4) |
| 7 | Flexibility and efficiency | 2 | Next in My work and tab keys good; phone review 3,776px (unchanged), treatment ar 3,956px (was ~6,200); clinic tabs not in the URL; phone tabs clip with no cue |
| 8 | Aesthetic and minimalist design | 3 | Hairlines on paper, no tints, money as summaries; ~700px of Discharge open for the Consultant during treatment |
| 9 | Error recovery | 3 | PanelBoundary per panel, refusals at the control, clinic refusals by code; decision refusals (`FACILITY_PACKAGE_RANGE`, `CATALOG_SERVICE_INVALID`) not yet in place |
| 10 | Help and documentation | 3 | Hints state clinical intent; follow-up safety line; manager permission line |
| **Total** | | **28/40** | **Good** |

## Design specificity verdict

Now the working side of one dossier: the review reads evidence → 1 Recommendation → 2 Estimate lines → Before you send,
with the story in the rail and one filled action; follow-up opens with the patient's words and a safety line; the
discharge stamp marks a real timeline event; the Virtual Clinic sits in the portal shell (h1, underline tabs, hairline
parts). Still category-standard: the treatment day is a long panel stack (Discharge fully open during treatment), My work
carries English context lines in Arabic, and the clinic overview opens as a profile/settings form rather than a practice.

Deterministic scan: `impeccable detect` → 0 findings on all 15 files (regex-only on .tsx). Mechanical scan against the
2026-10-16 baseline: off-ladder sizes 103 → 0; tinted notices 17 → 0; boxes in cards ~11 → 2 (ConsultantRouting radio
tiles); filled-button pairs every view → 0; raw colours 0; physical-direction classes 0; uppercase+tracking 4 → 0; inline
en/ar copy tables 3 → 1 (+9 ternaries, ~15 English strings, all in `CaseWorkflowActions` — Operations' travel form, area
5); glyph icons 2 → 0; `window.confirm` 1 → 0; both tablists complete (roving tabindex, arrows mirrored in ar,
aria-controls, tabpanel). Indirect: `.error-text` (globals.css) is 0.86rem, off-ladder. Browser overlay skipped (the portal
needs the mocked OIDC session).

Cognitive load: 2 of 8 failed (visual hierarchy on the treatment day; working memory at the final assessment).

## What's working

1. One clinical-decision grammar (`ClinicalDecision.tsx`) for the review and the final assessment: evidence first,
   recommendation before money, summary led by the clinical text, one filled submit, refusals at the field.
2. Report-first follow-up (`FollowUpPanel`): alert icon and words without tint, `dir="auto"` on the patient's words,
   safety line, the form as the only primary action, the panel first after discharge.
3. The Virtual Clinic on the system: shared `PortalFrame`, keyboard tabs, services hairline list with prices and dates
   in words, "Credentials reviewed · current", confirmations.

## Priority issues

- **[P1 HIGH] The final assessment has no step on the strip.** "Nothing needs you right now" beside "Waiting on: The
  Consultant" above the open form; My work does not list it. Fix: backend B-3-1a (`RECORD_FINAL_ASSESSMENT` FOCUS at
  ARRIVAL_CONFIRMED until saved; copy and focus target exist). Large (backend). → clarify
- **[P1 HIGH] The preliminary recommendation was clipped in the rail at the final assessment.** Last in the 55vh evidence
  scroller, cut mid-heading, while the hint asks what changed. **Fixed in 3-4**: it now leads the evidence. Scroll cue on
  the region stays open. → layout
- **[P1 HIGH] My work put the urgent complication last under "most urgent first".** Verified: the backend ranks URGENT
  first (`StaffWorkQueryService.QUEUE_ORDER`); the fixture listed items out of order. **Fixed in 3-4** (fixture in the
  backend's order). → harden
- **[P2] The Consultant's Discharge panel is fully open during treatment** (~700px between Treatment and Admission); the
  3-2 fold applies only once discharged. Fix: one-line state with the detail behind the same Summary, open when the
  current code is `COMPLETE_DISCHARGE_PACK`. → distill
- **[P2] Arabic parity and phone tabs.** English context lines in Arabic My work (backend text), English specialty and
  service names, clinic and case tabs clipped at 390 with no scroll cue. Fix: work-copy codes for context lines,
  bilingual catalogue names or `lang="en"`, an inline-end fade on the tab scrollers. → harden

## Persona red flags

- **Senior Consultant on a phone:** review ~3,776px, submit ~3,000px down; arrival strip says nothing is needed; the scroll
  continues through the discharge pack during treatment; no deep link to a clinic tab.
- **Arabic-first Consultant:** English context lines, specialty and service names; tabs clipped; English free text from
  Operations shifts surrounding label order.
- **Practice manager:** no bell (a rejected change is only learnt by reloading); the pending change shown in-row and in its
  own section; the Consultant's approval-setting checkbox applies at once without a saved line.
- **Sam (keyboard/screen reader):** tabs now have keys and panels; the evidence region does not announce that it scrolls;
  "No relationship" should be a radio choice, not an exclusive checkbox.

## Minor observations

"Day 30 · Due · due Oct 16" (fixed in 3-4: the date alone beside the Due badge); the DISCHARGED stamp in alert-adjacent
coral on the page where alert red means a reported problem (brand decision); the change order's "Withdraw" drawn as a
chevron disclosure; "RS-CO-RS-…" doubled prefix (backend); clinic overview has three actions in the profile cluster and
Specialty/Care area both "Cardiology"; "Not declared yet" does not link to the form row; orphan "Keyboard shortcuts ?"
footer; tracked micro-labels only on case pages; clinic header shows a different avatar and no My work count; "Refer this
case" floats alone below the review; `.error-text` 0.86rem off-ladder; ConsultantRouting's two bordered radio tiles.

## Questions to consider

1. Should the final assessment open as a comparison (preliminary beside today's) rather than a pre-filled copy of the form?
2. Does the Consultant need the Discharge panel before the pack is their step, or one line in Treatment until then?
3. Should the clinic open on what needs the Consultant (changes waiting, declaration due, next slots) and keep the profile a
   tab away?
