# Shape plan — Area 3: the Consultant's side of the file + the Virtual Clinic

Status: **plan, 2026-10-16** — written without an owner gate under the owner's standing instruction (2026-10-15: "always
continue each next implementation on new session without asking me till the end"); assumptions are marked **[A]**.
Critique: `.impeccable/critique/2026-10-16T06-47-12Z__frontend-src-components-portal-clinicalreview-tsx.md`, **17/40**
(dual-agent; detector 0 — regex-only; mechanical scan: 103 off-ladder sizes, 17 tinted panels, ~11 boxes in cards,
filled-button pairs in every view, 3 inline en/ar copy tables, a `window.confirm`, a tablist without keys). Before shots:
`screenshots/area-3/before/` from `e2e/consultant-shots.spec.ts` on the synthetic `e2e/consultant-fixture.ts`.

**Data.** P1-15..P1-18 (admission, milestones/change orders, discharge pack, follow-up) were merged into the UX line as
slice 3-0 (`7b9e195`, from `claude/trusting-lamarr-b82819` @ `b112bce`), so the shells are designed on their real
contracts. **P1-19 (affiliations, compliance, separate payee lines) was merged in slice 3-1** (`33671ec`, finished and confirmed
by the owner 2026-10-16; backend V103): gap G-1 is closed and slice 3-3 designs `virtual-clinic/Affiliations.tsx` on its real
contract.

## Job and audience

Consultants (senior specialists, often between clinics, often on a phone, Arabic-first or English) and their practice
managers. Mode: **Operate**. A Consultant opens a case to do one clinical act — recommend, confirm after examining,
countersign a milestone, complete the discharge pack, review a complication — and wants the patient's evidence beside
the act, one place to act, and the next case after it. A practice manager keeps the clinic's profile, prices and slots
in order within the permissions the Consultant gave.

## Outcome and proof

- **Success:** from My work, a Consultant opens a case, reads the evidence first, does the one clinical act in one
  place, sees what was sent, and goes to the next item — in en and ar, on a phone, without meeting the hospital ledger
  or a second form for the same fact.
- **Evidence (rendered, never re-derived):** `actions.currentAction` / `availableActions`; `/work/mine`; the case
  `intakeSummary`, documents and `clinicalReviews`; the panels' own views (`/doctor/cases/{id}/admission|treatment|
  discharge|follow-up`); `/clinics/mine`, `/clinics/{id}`, `/clinics/{id}/audit`.

## Selected direction (enhance the accepted layouts; Petrol & Paper unchanged; no new token)

1. **Evidence first, one act per sheet.** Every Consultant step opens under the area-2 cover as one sheet: the evidence
   (intake summary with `dir="auto"`, documents on file, the preliminary recommendation when there is one) opens it —
   on large screens pinned in the case rail beside the form — then the act, then its summary and its one filled button.
   When the step's form is on the page, the cover strip's step button becomes the quiet "Go to …" link (all roles), so
   each view has one filled action.
2. **One clinical-decision grammar.** The first review and the final assessment are the same composition: "1
   Recommendation" (clinical text, risks) then "2 Estimate lines" (one shared picker: approved services as a hairline
   checkbox list, Finance-approved packages, off-list lines with a status icon, not a tint), then a summary led by the
   clinical text ("Documents on file", not "reviewed"). The final assessment gets its own step copy by stage, calls the
   earlier review "Your preliminary recommendation", says which currency the patient sees, refuses an empty submit at
   the control, and keeps the draft it can keep **[A: the final assessment has no draft endpoint; the slice keeps the
   typed state mounted and does not clear it on a failed save, and records a backend draft as a follow-up]**. "Not
   clinically suitable" and the other exits confirm in the native `<dialog>` ConfirmDialog, worded in messages.
3. **The clinical timeline after arrival.** The legacy Consultant branch of `CaseWorkflowActions` (treatment episode,
   schedule follow-up) is retired **[A: pre-production clean cutover; the slice first checks the backend still has no
   rule that needs it — if it does, it records a backend retirement instead of hiding a live action]**, and the step
   button focuses the real form. The Consultant's overview orders the panels by the current task: the task's panel
   first, the others as one-line summaries (Admission: "Admitted · within the estimate"; Running money behind a
   disclosure **[A: presentation only; the backend still decides what a Consultant may read]**); after discharge,
   Follow-up first and Discharge as its summary. A reported complication opens with the patient's report and safety
   wording. Discharge carries the dossier's stamp on the real event (DESIGN.md: "discharge" takes the same mark).
4. **The Virtual Clinic as the Consultant's own practice file.** Inside the portal shell (header nav, `#portal-title`
   "Virtual Clinic", paper page, no gradient); sections in the one underline tab style with the APG keyboard model (or
   place links if they get URLs); hairline sections, no tinted draft box; services as a hairline list with localised
   dates and the code de-emphasised (a table only where it fits); Retire confirmed; Reject secondary; one filled action
   per section; "Credentials reviewed · current" instead of "Verified" (PRODUCT rule); a practice-manager line saying
   what they may do; copy to `messages/{en,ar}.json`; no Latin tracking/uppercase on Arabic; one digit rule per page.
5. **Convergence in every touched file.** Ladder sizes, hairline notices, `StatusBadge` for states, drawn icons (no
   glyphs), copy in messages (ClinicalReview's, ConsultantRouting's and VirtualClinic's inline tables; the unmapped
   `COMPLETE_DISCHARGE_PACK` work copy in ar), a per-panel error boundary so one bad view never takes the case page down.

## Slices (one per session; each: Impeccable + Vercel skills loaded at batch start, the four read-only reviews, verify, commit)

| Slice | What | Files | Depends |
|---|---|---|---|
| **3-0 integration** (done) | P1-15..P1-18 merged into the UX line; synthetic Consultant fixture + shots spec; critique; this plan | merge `7b9e195`; `e2e/consultant-fixture.ts`, `e2e/consultant-shots.spec.ts` | — |
| **3-1 the clinical decision** | Evidence-first sheet (intake + documents opening the review, rail on lg); one decision grammar shared by ClinicalReview and FinalAssessment (shared picker + summary, numbered parts); final-assessment stage copy, currency line, control-level errors, no clear-on-failure; ConfirmDialog for the exits; quiet strip button when the form is on the page (all roles); retire the Consultant's legacy episode/follow-up form and focus FinalAssessment; ClinicalReview + referral copy to messages; ladder/hairlines | `ClinicalReview.tsx`, `StaffCaseView.tsx` (FinalAssessment, clinical tab order, focusAction), `CurrentAction.tsx`, `CaseWorkflowActions.tsx`, `ConsultantRouting.tsx` (referrals copy), messages | 3-0 |
| **3-2 after arrival** | Panel order by the current task; Admission/Running money as summaries for the Consultant; Follow-up first after discharge, complication-first wording; discharge stamp; work-type copy for the discharge/follow-up steps (en+ar) and their focus targets; per-panel error boundary; ladder/tints in the four panels and ReopenCase | `StaffCaseView.tsx`, `TreatmentPanel.tsx`, `DischargePanel.tsx`, `FollowUpPanel.tsx`, `AdmissionPanel.tsx`, `panel-parts.tsx`, `ReopenCase.tsx`, messages | 3-1 |
| **3-3 the Virtual Clinic** | Portal shell + h1; tabs with keys; hairline sections; services list; confirmations; one filled action; wording ("Credentials reviewed"); manager permission line; dates/digits; copy to messages; **Affiliations (P1-19, merged in 3-1) designed on its real contract**; the Consultant fixture gains `/clinics/{id}` affiliation data for the shots | `virtual-clinic/*` (incl. `Affiliations.tsx`), `app/[locale]/portal/virtual-clinic/page.tsx`, `Portal.tsx`/`StaffNav` (shell reuse), `e2e/consultant-fixture.ts`, messages | 3-1 |
| **3-4 closing pass** | Re-critique (target ≥ 28/40), after shots (`AREA3_SHOTS=after`), STATUS section closing the area | — | 3-1..3-3 |

## States and ranges

- Consultant cases: CONSULTANT_ASSIGNMENT_PENDING (accept), CONSULTANT_REVIEW (review; draft or none; 0–20 documents,
  some scanning), INFORMATION_REQUIRED / CLINICAL_RECOMMENDATION_READY (sent), ARRIVAL_CONFIRMED (final assessment),
  ADMISSION_READY, TREATMENT_IN_PROGRESS (milestones to countersign, change orders, discharge pack), DISCHARGED,
  FOLLOW_UP (contacts, check-ins, outcomes, complication review), CLOSED (reopen). Second-opinion-only access.
- Catalogue 0–40 services, 0–10 packages, 0–5 off-list lines; proposal currency EGP or a foreign one; long Arabic
  service names; amounts to 7 digits; 320px phones; RTL everywhere.
- Clinic: owner or practice manager (any subset of PROFILE/SCHEDULE/SERVICES); 0–30 services, 0–10 pending changes,
  0–40 slots, 0–5 managers; a profile draft or none.

## Constraints and boundaries

- Theme unchanged; tokens only; coral only as a mark (the stamp frame); one filled action per view; logical properties;
  `theme-petrol.css` is unlayered (no margin/padding resets on classes that take spacing utilities); WCAG 2.2 AA; any new
  modal a native `<dialog>`; programmatic scrolls that must land use `behavior: "instant"`.
- Clinical authority, journey, workforce and pricing rules stay in the backend; the UI renders actions and views, never
  infers a step from `status` alone (copy may vary by stage, as the patient step does). No backend field is invented.
- Every copy change in both `messages/en.json` and `ar.json` (insert keys textually; never re-serialise); plurals only
  under `portalWork.plural`.
- Untouched: the coordinator views accepted in area 2, the patient screens, Control Center, the referral flow's rules.

## Gaps and open questions (none block)

- **G-1 Affiliations** — **closed in 3-1**: P1-19 (`33671ec`: backend V103 + session-2 UI) is merged into the UX line; 3-3
  designs the section. Area 6's Compliance screens are unblocked too.
- **G-2 Final-assessment draft**: no draft endpoint; recorded as a backend follow-up.
- **O-1 [A]** Money facts for the Consultant shown as summaries, not removed (what a Consultant may read is the
  backend's call; raise data minimisation with P1-19's audit work if wanted).
- **O-2 [A]** A clinical recommendation still needs one priced line (the server's rule, `ClinicalReview` mirrors it);
  splitting opinion from estimate is a domain change for the backend plan, not this area.
- Backend English context lines in My work (Arabic) stay in the cross-cutting area X.
