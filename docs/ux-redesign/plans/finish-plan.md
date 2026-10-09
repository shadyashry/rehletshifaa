# UX redesign — finish plan

Written 2026-10-09, after pass 4 (`d86ec5d` on `codex/platform-control-plane`). This plan replaces "work the backlog
top to bottom" with a fixed finish line, four batches and one set of owner decisions.

## Finish line

The epic is done when:

1. Batches 0–3 below are merged, and the stack is rebuilt on the result.
2. A portal and public-site re-critique has been run once, and its scores are recorded in `STATUS.md`.
3. Every remaining item is either a P3 on the post-launch list or blocked on a named decision or approval.

Nothing else is in scope. In particular, P3 items and new reviewer findings are **not** worked unless they are P0/P1.

## Working rules for the remaining batches

- **One batch per session.** Each batch is verified, merged, pushed and rebuilt **once**, at its end. The owner
  approves at batch boundaries only.
- **One verification run per batch:**
  - typecheck, lint and unit tests;
  - the portal/patient Playwright set and a production build.
  - Each new behaviour gets a test that fails without the change.
- **Docs once per batch.** One `STATUS.md` entry and the backlog rows marked done. No separate docs-only commits.
- **New findings go to the post-launch list, not into the batch.** Reviewers still run, but only P0/P1 findings are
  fixed in the batch.
- **Baselines:**
  - Lint is 13 errors / 11 warnings; Batch 1 takes it to 0 errors.
  - Unit tests are 349 pass / 11 `ProposalSign` fail; Batch 0 makes them all pass.

## Owner decisions needed now (one sitting)

| # | Decision | Options | Recommendation | Unblocks |
|---|---|---|---|---|
| D1 | Journey-bound cases (backlog P1). A proposal decision (self-service or recorded) does not complete the journey runtime's `REVIEW_PROPOSAL` action. | (a) Complete the runtime action from both decision paths: backend change plus tests, about one session. (b) Record it as a known limitation until journey runtime goes live. | (a) if any launch case is journey-bound, otherwise (b) | P1 row in "Arabic proposal decision — deferred" |
| D2 | B1 status colour tokens (`token-proposals.md`). | Approve as proposed, or ask for a revision. | Approve as proposed | Amber tones in My Care, and the status/priority/attention chips (2 P2 rows) |
| D3 | Proposal drawer order. | Keep price first (already approved) and close the suggestion, or switch to recommendation first. | Keep price first; close the row | 1 P2 row |
| D4 | Public-site content. | (a) The canonical journey: 4 stage names. (b) A coordinator introduction: real name/photo/languages/hours, or a generic team introduction. | Approve the 4 stages as on How it works; use a generic team introduction until real content exists | Batch 3 |

These stay with others and run in parallel. They are not on the critical path of this plan:

- **Legal L1–L5:**
  - approved Arabic deposit, refund and cancellation terms;
  - the activation consent on `/ar` (L2);
  - the "Pending legal review" badge beside concrete refund promises (F2).
- **Native Arabic review** of all `portalWork` and proposal wording.
- **Final-quote validity:** a business decision, needed for 8C, not for this plan.

## Batch 0 — trustworthy test baseline (1 session) — done 2026-10-09, see `STATUS.md`

Why first: every verification run in this epic has needed reruns and side-by-side comparisons to prove nothing new
broke. Removing that noise makes every later batch cheaper.

1. **11 `ProposalSign` unit tests.** All 11 fail the same way. The test cannot find the acknowledgement checkbox or
   the "Acknowledge & continue", "Request changes" and "Decline estimate" buttons. These are most likely stale
   expectations from the proposal redesign. Fix the tests to the approved design, or fix the component if a test
   shows a real regression.
2. **Pre-existing e2e failures:**
   - care-coordination "Coordination Setup" (en/ar);
   - portal-ux Control Center "Staff & teams";
   - access-governance ×2;
   - credential-reviews ×2.

   For each: update the stale selector or expectation, or fix the defect.
3. **Cold-start timeouts.** Add a warm-up step for the dev server (compile the portal routes before the first spec),
   so a full run has no timeout reruns.

Done when: unit tests are all green, and the portal/patient/governance Playwright set is green on a single cold run.

## Batch 1 — portal safety and reliability (1 session) — done 2026-10-09, see `STATUS.md`

| Item | Backlog source |
|---|---|
| A confirmation before recording a refund, ending second-opinion access and resending a link (which revokes the old one) | Safety and data integrity |
| No empty "Request changes" note; required items enforced in `RecordPatientResponse` | Safety and data integrity |
| `WorkforceAdoptionPanel` accept: busy state, no double send | Feedback, focus and state |
| Queue `refresh`: stale-result guard; separate busy flags for loads vs actions; reference data reset on a role change | Feedback, focus and state |
| `PatientIdentityStep` receives real identity, so PENDING/REJECTED render | Feedback, focus and state |
| Empty states: empty message thread, TeamAssignment with nobody, care-area value not in options | Feedback, focus and state |
| `mutate` distinguishes "failed" from "skipped overlapping call" | Arabic proposal decision — deferred |
| Control Center lint: 13 `set-state-in-effect` errors, same fixes as the portal (lint reaches 0 errors) | Performance and code structure |

## Batch 2 — portal accessibility and Arabic formatting (1 session)

| Item | Backlog source |
|---|---|
| Unread-badge accessible names; staff badge shows the unread count; unread and overdue not by colour alone | Accessibility and semantics |
| My Care card titles as headings; `CaseMessages` heading order; the "other cases" h2 styled as a heading | Accessibility / Portal system drift |
| Coordinator lock not keyboard-operable (`inert`, not only `pointer-events-none`) | Accessibility and semantics |
| Item context in repeated Open/View/Download and My work row names; role switcher state not by style only | Accessibility / Staff home — deferred |
| Count line live region; "Mark read" 44px and named | Staff home — deferred / Portal system drift |
| Patient proposal: reason for the disabled primary; optional items explained; terms id via `useId` | Patient proposal — deferred |
| Arabic money: `<bdi>` on the figure instead of `dir="ltr"` blocks; one shared money formatter (decimals) | RTL, i18n and formatting |
| Date of birth shown in UTC; Arabic micro-label tracking leftovers; My Care care-area map uses the shared labels | RTL, i18n and formatting |
| Nested cards (Services & costs, Consultant intake summary, terms box) | Portal system drift / Patient proposal |
| Work-copy context carries the locale | Staff work views — deferred |
| My Work says "You": `coordinatorSubject` on `WorkItem` (small backend field) | Staff work views — deferred |
| If D2 is approved: B1 status tokens on chips and My Care amber tones | Design-system drift |

## Batch 3 — public site (1–2 sessions, needs D4)

| Item | Backlog source |
|---|---|
| One canonical 4-stage journey everywhere, with sub-steps only on How it works | Journey and cost model |
| "Body systems" (6) vs "care areas" (9) wording; care-areas H1 contradiction | Journey and cost model |
| Preliminary estimate → final quote explained on How it works | Journey and cost model |
| Travel-package question moved out of the first intake | Journey and cost model |
| Coordinator introduction (per D4) | Journey and cost model |
| One route to the form on care-area pages; How it works label sizes and phase spacing | Pages and form |
| Consultant pages: heading levels, card density on phones | Pages and form |
| `PageHero` gradient mirrored in RTL; CaseForm upload-area tokens and copy into `messages/*.json` | Pages and form |
| Scroll reveals no longer hide half the home page | Pages and form |

## Close (end of Batch 3)

1. Run one portal and one public-site re-critique, and record the scores.
2. Run the full Playwright suite once, which should be green after Batch 0.
3. Move every open P3 into a "Post-launch" section of `backlog.md`.
4. Write the final `STATUS.md` entry; merge, push and rebuild once.

## Expected effort

- **Batches:** four, about 4–5 working sessions.
- **Your time:** one decision sitting now, plus an approval at the end of each batch.
- **Dependencies:**
  - D1(a) adds about one session if chosen.
  - Legal and the native Arabic review follow their own timelines. They block launch copy, not these batches.
