# UX redesign — status

Live tracker for the RehletShifaa UX redesign epic (`feat/ux-redesign`). Rules: `CLAUDE.md` → "UX redesign epic".
Update at the end of every phase.

## Phases

- [x] **Phase 0 — Preflight**
- [ ] **Phase 1 — P0 My Care reload loop** (branch `fix/my-care-reload-loop` from `codex/platform-control-plane`)
  - [ ] harden fix: stable `signIn` (read `me` from a ref), session registered once per user, guard `/undefined/` request
  - [ ] `my-care.spec.ts` fixture exercises a linked patient; test counts session and `/me` calls
  - [ ] lint, typecheck, unit, Playwright `my-care.spec.ts` + portal specs
  - [ ] GATE 1: diffs approved → commit, push, PR into `codex/platform-control-plane`
  - [ ] merged → bring the fix into `feat/ux-redesign`
- [ ] **Phase 2 — axe-core accessibility ratchet** (`e2e/a11y.spec.ts`, `e2e/a11y-baseline.json`, `e2e/patient-fixture.ts`)
- [ ] **Phase 3 — `/redesign-area` skill, backlog, CLAUDE.md note**
- [ ] **Phase 4 — Architect work**: portal audits → backlog; token proposals; shape plans
  - [ ] GATE 2: token, plan and legal (Arabic terms) decisions
- [ ] **Phase 5 — `/redesign-area` runs**
  - [ ] Patient proposal dialog — GATE 3
  - [ ] Staff work views — GATE 4
- [ ] **Phase 6 — Close the loop**: polish, full verification, re-critique, DESIGN.md refresh, PR draft — GATE 5

## Decisions

| Date | Decision | By |
|---|---|---|
| 2026-10-07 | Petrol & Paper is the one visual system; Control Center base tokens are legacy (converge when touched). | Owner |
| 2026-10-07 | Public-site pass scope P0 + P1 (done: commits `adcf0d6`…`7061d9c`). | Owner |
| 2026-10-07 | Portal pass scope P0 + P1; proposal terms behind a disclosure, wording unchanged, flagged pending legal review; staff shell: slim footer only (P2, later). | Owner |
| 2026-10-07 | `.impeccable/critique/` snapshots are committed (`47291f6`). | Owner |
| 2026-10-07 | The P0 loop exists only on `codex/platform-control-plane` (introduced in `19a970c`; `main` has `signIn` deps `[]` and no `refreshMe()` call), so `fix/my-care-reload-loop` branches from `codex/platform-control-plane` and its PR targets that branch, not `main`. | Owner |

## Scores

| Surface | Critique | Score |
|---|---|---|
| Public site | `.impeccable/critique/2026-10-07T12-52-27Z__dev-rehletshifaa-com.md` | 25/40 |
| Portal | `.impeccable/critique/2026-10-07T13-37-54Z__frontend-src-components-portal.md` | 24/40 |

## Future (out of scope for this run)

- Marketing assets with Pro Max brand / banner-design / slides (WhatsApp and social banners, partner decks), using
  PRODUCT.md voice and Petrol & Paper tokens.

## Next exact action

Phase 1: `git switch -c fix/my-care-reload-loop codex/platform-control-plane`, then harden `AuthProvider.tsx` /
`Portal.tsx` and the `my-care.spec.ts` fixture.
