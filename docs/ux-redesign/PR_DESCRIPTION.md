# UX redesign, pass 1: trust fixes, patient proposal, role-aware staff views

**Base:** `codex/platform-control-plane` · **Head:** `feat/ux-redesign` · Synthetic fixtures only.

## Summary
- **Public site.** Consultants are no longer called "Verified"; WhatsApp messages are localised and the
  representative can choose their own country code; the index pages have one quiet route to the case form; Arabic
  labels have no letter-spacing; placeholders meet AA.
- **Portal P0 fixes** (also merged into the base):
  - the My Care reload loop for linked patients;
  - typed drafts carrying into another patient's case.
- **Patient proposal.**
  - The drawer reads in the patient's voice: plain status, long localised dates.
  - The price comes first, followed by an honesty line and the terms behind a "Pending legal review" disclosure,
    open while a decision is owed.
  - One decision at the end.
  - Arabic acceptance is blocked until the Arabic terms are approved.
- **Staff work views.**
  - "You" appears only for the person really waited on, and the coordinator label is the same everywhere.
  - "Consultant" wording throughout, with no "verified".
  - `Intl` plurals, RTL tab keys and 44px hit areas.
  - All copy lives in `messages/*.json`.
- **System.**
  - Component tokens and a 3:1 field edge.
  - An axe WCAG 2.2 AA ratchet in en and ar.
  - The `/redesign-area` pipeline.
- **Score.** Portal critique 24/40 → 25/40.

Details are in `docs/ux-redesign/STATUS.md`, `docs/ux-redesign/backlog.md` and `.impeccable/critique/`.

## Screenshots

| | Before | After |
|---|---|---|
| Patient proposal, en 1440 | ![before](https://github.com/shadyashry/rehletshifaa/blob/feat/ux-redesign/docs/ux-redesign/screenshots/before/patient-proposal-en-1440.png?raw=true) | ![after](https://github.com/shadyashry/rehletshifaa/blob/feat/ux-redesign/docs/ux-redesign/screenshots/after/patient-proposal-en-1440.png?raw=true) |
| Patient proposal, ar 390 | ![before](https://github.com/shadyashry/rehletshifaa/blob/feat/ux-redesign/docs/ux-redesign/screenshots/before/patient-proposal-ar-390.png?raw=true) | ![after](https://github.com/shadyashry/rehletshifaa/blob/feat/ux-redesign/docs/ux-redesign/screenshots/after/patient-proposal-ar-390.png?raw=true) |
| Coordinator case, en 1440 | ![before](https://github.com/shadyashry/rehletshifaa/blob/feat/ux-redesign/docs/ux-redesign/screenshots/before/coordinator-case-en-1440.png?raw=true) | ![after](https://github.com/shadyashry/rehletshifaa/blob/feat/ux-redesign/docs/ux-redesign/screenshots/after/coordinator-case-en-1440.png?raw=true) |
| Coordinator "My cases", ar 390 | ![before](https://github.com/shadyashry/rehletshifaa/blob/feat/ux-redesign/docs/ux-redesign/screenshots/before/coordinator-my-cases-ar-390.png?raw=true) | ![after](https://github.com/shadyashry/rehletshifaa/blob/feat/ux-redesign/docs/ux-redesign/screenshots/after/coordinator-my-cases-ar-390.png?raw=true) |

The files are in `docs/ux-redesign/screenshots/{before,after}/` (synthetic fixtures on the local dev server).

## Decisions log (owner)

| Gate | Decision |
|---|---|
| Setup | Petrol & Paper is the one visual system, and the Control Center's base tokens are legacy. Work runs on `feat/ux-redesign`, branched from `codex/platform-control-plane`. |
| Public-site pass | Scope was P0 + P1, with "make the dossier visible" as the direction. |
| GATE 1 | The My Care reload loop is fixed on its own branch from `codex/platform-control-plane`; the loop never existed on `main`. |
| GATE 2: tokens | Component tokens approved, plus the new field edge `--color-ink-350 #7a898c`. Status, chart and dense-table tokens (B1–B3) deferred. |
| GATE 2: plans | Both shape plans approved: the patient proposal and the staff work views. |
| GATE 2: legal | Option B: the Arabic proposal decision stays disabled until the Arabic deposit, refund and cancellation terms are legally approved. |
| GATE 2: P0 | The cross-case drafts bug is fixed on its own branch (`fix/workspace-case-key`). |
| GATE 3 | Patient proposal approved, with the terms open by default while a decision is owed. |
| GATE 4 | Staff work views approved. |
| GATE 5 | Next pass: a coordinator-mediated Arabic decision path, then `/redesign-area` for the staff home (folding in the duplicated "Assign Consultant" action). |

## Test plan

Checked in this branch:
- [x] typecheck
- [x] lint: 25 errors / 13 warnings, unchanged from the base
- [x] unit: 318 passed, 11 failed (pre-existing `ProposalSign.test.tsx`)
- [x] Playwright on the local dev server: 178 passed, 26 skipped (live specs), 22 failed. 18 fail identically on the
      base commit `975f071`; 4 are `case-flow`, blocked by backend CORS on localhost.
- [x] `e2e/a11y.spec.ts` (en + ar, 20 pages): green, baseline unchanged (one entry)

Reviewer checklist:
- [ ] Rebuild the tunnel frontend from this branch:
      `docker compose -p rehletshifaa -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build --no-deps frontend`
- [ ] Run `case-flow.spec.ts` and the visual specs against the tunnel stack (`PLAYWRIGHT_EXTERNAL_SERVER=true` with the
      `dev.rehletshifaa.com` URLs from `AGENTS.md`)
- [ ] Run the live specs with credentials: `portal-live`, `my-care-live`, `portal-gateway-live`, `operations-gate-live`
- [ ] My Care as a linked patient: the page settles, with one session registration in the network tab
- [ ] Open a second case from the notification bell: a fresh workspace, with no draft carried over
- [ ] Patient proposal in `/ar`: the decision is disabled with an explanation, and Request changes and Decline still
      work; `/en` completes normally
- [ ] Staff queue in `/ar`: "أنت" only on cases you own, arrow keys follow the reading direction, and 44px controls
- [ ] Native Arabic review of all new Arabic copy

## Open items
These are tracked in the backlog:
- the coordinator-mediated Arabic path (P0, next);
- the staff home distill and the duplicated "Assign Consultant" action (P1);
- token drift, My Care naming the patient or representative, and drawer nesting (P2);
- work-item title codes and `coordinatorSubject` on work items (backend);
- refund wording next to "Pending legal review" (legal).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
