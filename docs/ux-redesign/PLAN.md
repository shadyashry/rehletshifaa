# UX plan — the whole platform, one standard

**Status:** master plan for all user-interface work, decided 2026-10-15. Tracker: `STATUS.md`. Findings: `backlog.md`.
One shape plan per area under `plans/`. Runs **in parallel** with the backend plan
(`docs/platform-review-implementation-plan-2026-10-14.md`), which no longer carries UI slices.

## Rules

- Direction: **"the dossier, shown"** (`patient-site-review-2026-10-14.md`, built for the public site in
  `plans/public-site-trust.md`). Every patient screen is a page of the same case file; the `CaseStamp` marks real
  events only; staff screens are the working side of the same file.
- Theme: **Petrol & Paper stays** (decision and reasons below). Tokens only from `globals.css` @theme as re-pointed by
  `theme-petrol.css`; propose a token before using a new value. Coral is a mark, never text. One accent-filled button
  per view. Arabic is a first-class layout, not a mirror.
- Pipeline per area: critique → shape plan → **owner gate** → build (Impeccable decides UX; Vercel skills decide code;
  the frontend-design plugin and ui-ux-pro-max checklist in the sessions that have them) → the four read-only reviews →
  verify (typecheck, lint on touched files, vitest, the area's Playwright specs, `a11y.spec.ts` en + ar) →
  STATUS/backlog → **owner gate** → commit. Never push.
- Branching: a worktree per UX session, branch from `feat/ux-trust-pass` (or its successor), merged into
  `feat/review-p0` at each area's gate. Backend sessions stay on `feat/review-p0`.
- Backend coupling: where a backend phase delivers a screen, it ships the minimum working UI; the UX area designs the
  final one on the real data. Areas marked "after P1-xx" do not start before that phase is merged.

## Theme decision (2026-10-15)

The owner invited a theme change. Recommendation, accepted: **keep the palette, finish its use.** Petrol on warm paper
is the differentiated choice in a category of cold blue on white; it reads calm, clinical and warm, which is the
promise; the paper canvas and near-black ink give the best Arabic legibility on phones; the critique's problems were
imagery, unnamed people and a warning as the opening line, not colour; a new palette would reopen 60+ tokens, the
Keycloak theme and every screenshot baseline. To finish: converge the Control Center (D-07), coral as a mark only, one
accent per view, Arabic type scale and numerals per locale.

## Areas and order

| # | Area | Entry points | Depends on | Sessions | Status |
|---|---|---|---|---|---|
| 0 | Public site trust pass (hero, Send my case opening, confirmation, home order) | `home/Hero.tsx`, `CaseForm.tsx`, `send-my-case/page.tsx` | — | 1 | **Built** `b2b9f3e` (`plans/public-site-trust.md`); deferred: photos strip, continue-later link, care-area row, Arabic numerals |
| 1 | **Patient portal as the file**: My Care, status link, proposal link, profile activation, deposit step; signature moments "case sent", "specialist reviewing", "estimate ready" (ex P2-20) | `portal/MyCare.tsx`, `CaseStatusAccess.tsx`, `ProposalSign.tsx`, `ProfileActivation.tsx`, `portal/PatientDepositPayment.tsx` | — | 3 | Next |
| 1b | Consultant public profile page and cards with photographs (consent), "Credentials reviewed · current", practice locations, languages (ex P1-14 UI) | `consultants/*`, `home/CareSystemsGrid.tsx` | P1-14 data; photo consent | 1 | Blocked on consent |
| 2 | **Coordinator workspace**: staff home, My work, queue, case page, current action, messages, conversations; keyboard flow and one-next-action strip (ex P2-22) | `portal/Portal.tsx`, `StaffCaseView.tsx`, `CurrentAction.tsx`, `MyWork.tsx`, `CaseQueue.tsx`, `CaseMessages.tsx`, `ConversationsView.tsx` | — | 3 | — |
| 3 | **Consultant portal + Virtual Clinic** shells: review, final assessment, milestones, discharge pack, follow-up, affiliations | `portal/ClinicalReview.tsx`, `FinalAssessment`, `virtual-clinic/*` | shells now; data with P1-16/P1-17/P1-19 | 2 | — |
| 4 | **Finance workspace** (C2, owner: complete revamp): verification queue, approval, change-order pricing, reconciliation workbench, statements | `FinanceApproval.tsx`, transfer panels, Control Center › Commercial | **after P1-15 and P1-17** | 3 | Waits |
| 5 | **Operations**: reservation, admission letter, balance receipt, travel plan, departure | `CaseWorkflowActions.tsx` | **after P1-15** | 1–2 | Waits |
| 6 | **Control Center** convergence to Petrol & Paper (D-07) and the 13 lint errors; Compliance screens (scorecards, audit samples) | `platform-control-center/*`, `control-center-nav.ts` | P1-19 for Compliance screens | 3 | — |
| 7 | **Keycloak theme** parity (login, setup, OTP, passkey; EN/AR) | `infrastructure/keycloak/themes/rehletshifaa` | — | 1 | — |
| X | **Cross-cutting**: Arabic-first copy pass, Arabic type scale and numeral rule in DESIGN.md (ex P2-21); native review as a launch gate | `DESIGN.md`, `messages/*.json`, `theme-petrol.css` | — | 2 | — |

Recommended sequence: 1 → 2 → 3 → 7 → X → 6 → (after P1-15) 5 → (after P1-17) 4 → 1b when consent arrives.

## Owner decisions open

- [ ] Photographs of Consultants and coordinators, with consent (area 1b).
- [ ] Native Arabic review (area X, launch gate).
- [ ] Finance workspace: confirm the "complete revamp" scope once P1-17's reconciliation workbench exists.

## Paste-ready prompt for a new UX session

```text
Read AGENTS.md, CLAUDE.md ("UX redesign epic" rules), PRODUCT.md, DESIGN.md, docs/ux-redesign/PLAN.md and
docs/ux-redesign/STATUS.md. Run UX plan area 1 (patient portal as the file) through the /redesign-area pipeline. Use
the frontend-design plugin and Impeccable for design decisions, the Vercel skills for code, and the ui-ux-pro-max
checklist before delivery. The theme stays Petrol & Paper. Continue the "dossier" direction: every patient screen is
a page of the same case file, with the CaseStamp on real events only. Work in a new worktree on a branch from
feat/ux-trust-pass; one area per session; commit when green; do not push. Start by critiquing the area in the
built-in browser on https://dev.rehletshifaa.com (I type the sign-ins and codes), write the shape plan under
docs/ux-redesign/plans/, and stop at the gate for my approval.
```
