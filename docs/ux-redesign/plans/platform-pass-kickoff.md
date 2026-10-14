# Full-platform UX pass — kickoff for a new session

Owner request (2026-10-15): after the patient pages, review and enhance **every page of the platform** with the same
standard: staff portal (coordinator, Consultant, Operations, Finance), the Virtual Clinic, the patient portal (My
Care, secure links), and the Control Center. The owner allows a new session with the `frontend-design` plugin.

## Decision carried into the pass: the theme stays Petrol & Paper

The owner invited a change of theme if an expert saw a better one. Recommendation: **keep the palette, finish its
use.** Reasons:

1. Petrol on warm paper is already the differentiated choice in this category: every competitor and most hospitals use
   cold blue on white; teal-on-cream reads calm, clinical and warm at once, which is the brand's promise.
2. The audience reads Arabic on phones: the paper canvas and near-black ink give the best long-form legibility of any
   light palette; a darker or more saturated world would cost readability in sunlight.
3. The problems the critique found were never colour: they were generic imagery, unnamed people and a warning as the
   opening line. The dossier and the stamp fix that inside the palette.
4. A new palette would reopen 60+ tokens, the Keycloak theme, WhatsApp templates and every screenshot baseline for no
   measurable gain.

What to finish instead: (a) the Control Center still renders the base teal tokens; converge it to Petrol & Paper
(D-07) so staff and patients see one product; (b) coral stays a mark (stamp, hairline rule), never text; (c) one
accent-filled button per view; (d) Arabic type scale and numerals per locale (P2-21).

## Scope of the pass (one `/redesign-area` run per area, in this order)

| # | Area | Files (entry points) | Why first |
|---|---|---|---|
| 1 | **Patient portal**: My Care, status link, proposal link, profile activation, deposit step | `components/portal/MyCare.tsx`, `CaseStatusAccess.tsx`, `ProposalSign.tsx`, `ProfileActivation.tsx`, `portal/PatientDepositPayment.tsx` | Continues the dossier: every patient screen becomes a page of the same file (stamps on real events) |
| 2 | **Coordinator workspace**: staff home, My work, queue, case page, current action, messages, routing | `components/portal/Portal.tsx`, `StaffCaseView.tsx`, `CurrentAction.tsx`, `MyWork.tsx`, `CaseQueue.tsx`, `CaseMessages.tsx`, `ConversationsView.tsx` | The most-used staff surface; the one-next-action strip and keyboard flow (P2-22) |
| 3 | **Consultant portal + Virtual Clinic** | `components/portal/ClinicalReview.tsx`, `FinalAssessment`, `virtual-clinic/*` | Milestone and discharge-pack forms arrive with P1-16/17; design the shells now |
| 4 | **Finance workspace** (C2, owner: complete revamp) | `FinanceApproval.tsx`, deposit/transfer panels, Control Center › Commercial | Reconciliation workbench and statements arrive with P1-17 |
| 5 | **Operations** | `CaseWorkflowActions.tsx` travel plan, admission (P1-15) | Shells for reservation, letter, balance, departure |
| 6 | **Control Center** convergence to Petrol & Paper + lint debt (13 errors) | `components/platform-control-center/*`, `control-center-nav.ts` | D-07; the only place still on the legacy look |
| 7 | **Keycloak theme** parity check (login, setup, OTP, passkey) | `infrastructure/keycloak/themes/rehletshifaa` | The first screen every staff member and returning patient sees |

Each run: critique (dual-agent when the session allows sub-agents) → shape plan with a gate → build → the four
read-only reviews (react/composition, web-design-guidelines, RTL/i18n, pre-delivery checklist) → verify (typecheck,
lint on touched files, vitest, Playwright for the area, `a11y.spec.ts` en + ar) → STATUS.md and backlog → owner gate
before commit. Pro Max reviews charts only.

## Paste-ready prompt for the new session

```text
Read AGENTS.md, CLAUDE.md ("UX redesign epic" rules), PRODUCT.md, DESIGN.md, docs/ux-redesign/STATUS.md and
docs/ux-redesign/plans/platform-pass-kickoff.md. Then run the full-platform UX pass, area 1 (patient portal) first,
through the /redesign-area pipeline. Use the frontend-design plugin and Impeccable for the design decisions, the
Vercel skills for code, and the ui-ux-pro-max checklist before delivery. The theme stays Petrol & Paper (see the
decision in the kickoff). Continue the "dossier" direction: every patient screen is a page of the same case file, with
the CaseStamp on real events only. Work on a branch from feat/ux-trust-pass; one area per session; commit when green;
do not push. Start by critiquing the area in the built-in browser on https://dev.rehletshifaa.com (sign-ins typed by
the owner), write the shape plan, and stop at the gate for my approval.
```
