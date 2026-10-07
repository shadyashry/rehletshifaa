# UX redesign — status

Live tracker for the RehletShifaa UX redesign epic (`feat/ux-redesign`). Rules: `CLAUDE.md` → "UX redesign epic".
Update at the end of every phase.

## Phases

- [x] **Phase 0 — Preflight**
- [x] **Phase 1 — P0 My Care reload loop** (branch `fix/my-care-reload-loop` from `codex/platform-control-plane`)
  - [x] harden fix: stable `signIn` (read `me` from a ref), session registered once per user, guard `/undefined/` request,
        case restore waits for a role (`6ea32d2`)
  - [x] `my-care.spec.ts` fixture exercises a linked patient; new test counts session, `/me` and role-less calls
        (fails without the fix, passes with it)
  - [x] lint/typecheck/unit unchanged from baseline; `my-care.spec.ts` 8/8; portal specs 25 pass, 4 pre-existing
        `portal-ux` failures (identical without the fix)
  - [x] GATE 1 approved → committed and pushed `fix/my-care-reload-loop`
  - [x] merged into `feat/ux-redesign` locally (`2a20383`). Note: GitHub still showed `origin/codex/platform-control-plane`
        at `bc6971b` (18 local commits unpushed) when this was merged.
- [x] **Phase 2 — axe-core accessibility ratchet** (`721ad90`)
  - [x] `@axe-core/playwright@4.13.0`; patient setup moved to `e2e/patient-fixture.ts` (my-care 8/8 unchanged)
  - [x] `e2e/a11y.spec.ts`: 10 targets × en/ar = 20 pages; serious/critical only; baseline ratchet; update mode
  - [x] baseline recorded, normal run green (20/20). CI (`.github/workflows/ci.yml`) already runs `pnpm test:e2e`,
        which includes the spec; note CI is red earlier on lint (25 errors) and unit tests (11 `ProposalSign`).
- [x] **Phase 3 — `/redesign-area` skill, backlog, CLAUDE.md note** (`.claude/skills/redesign-area/SKILL.md`,
      `docs/ux-redesign/backlog.md` seeded from both critiques + the a11y baseline)
- [ ] **Phase 4 — Architect work** (`fe8b8a4`)
  - [x] three read-only portal reviews (Impeccable audit, web-design-guidelines, react-best-practices) merged into
        backlog.md — new **P0**: `WorkspaceView` has no case key, so typed drafts can carry into another patient's case
  - [x] Pro Max token proposals → `docs/ux-redesign/token-proposals.md` (proposals only)
  - [x] shape plans → `plans/patient-proposal.md`, `plans/staff-work-views.md` (drafts)
  - [x] GATE 2 decided (see Decisions); approved component tokens + `ink-350` applied to `globals.css` /
        `theme-petrol.css` / `DESIGN.md`; lint unchanged, typecheck ok, a11y 20/20
  - [x] P0 cross-case drafts fixed on `fix/workspace-case-key` (`6f561e6`), merged into `feat/ux-redesign` (`9e77677`)
- [x] **Phase 5 — `/redesign-area` runs**
  - [x] Patient proposal dialog — GATE 3 approved; terms open by default while a decision is owed (owner)
  - [x] Staff work views — GATE 4 approved
- [ ] **Phase 6 — Close the loop**: polish, full verification, re-critique, DESIGN.md refresh, PR draft — GATE 5

## Decisions

| Date | Decision | By |
|---|---|---|
| 2026-10-07 | Petrol & Paper is the one visual system; Control Center base tokens are legacy (converge when touched). | Owner |
| 2026-10-07 | Public-site pass scope P0 + P1 (done: commits `adcf0d6`…`7061d9c`). | Owner |
| 2026-10-07 | Portal pass scope P0 + P1; proposal terms behind a disclosure, wording unchanged, flagged pending legal review; staff shell: slim footer only (P2, later). | Owner |
| 2026-10-07 | `.impeccable/critique/` snapshots are committed (`47291f6`). | Owner |
| 2026-10-07 | GATE 2 tokens: **A component tokens approved** (button, badge, table, dialog, field, card + `--focus-ring`, `--shadow-raised` rename); **field edge = new `--color-ink-350 #7a898c`** (3.63/3.31/3.03); **B1 status, B2 chart palette, B3 dense-table type deferred** (kept in `token-proposals.md`). Defaults accepted: badge 12px/600; Western digits in Arabic until native review; CC converges colours first; legacy aliases deleted once components use component tokens. | Owner |
| 2026-10-07 | GATE 2 plans: `plans/patient-proposal.md` and `plans/staff-work-views.md` **approved**. | Owner |
| 2026-10-07 | GATE 2 legal: **option B** — the proposal decision stays disabled on `/ar` until legally approved Arabic deposit/refund/cancellation terms exist; explain why and offer "Message your coordinator". | Owner |
| 2026-10-07 | New P0 (cross-case drafts, `WorkspaceView` has no case key) gets its own fix branch from `codex/platform-control-plane`, like the reload loop. | Owner |
| 2026-10-07 | The P0 loop exists only on `codex/platform-control-plane` (introduced in `19a970c`; `main` has `signIn` deps `[]` and no `refreshMe()` call), so `fix/my-care-reload-loop` branches from `codex/platform-control-plane` and its PR targets that branch, not `main`. | Owner |

## Accessibility baseline

| Page | Rules | Cause |
|---|---|---|
| `en/care-areas` | `color-contrast` | decorative body-system numerals "01–06" at `text-brand-600/40` (1.92:1 on paper), 6 nodes |

## Scores

| Surface | Critique | Score |
|---|---|---|
| Public site | `.impeccable/critique/2026-10-07T12-52-27Z__dev-rehletshifaa-com.md` | 25/40 |
| Portal | `.impeccable/critique/2026-10-07T13-37-54Z__frontend-src-components-portal.md` | 24/40 |

## Future (out of scope for this run)

- Marketing assets with Pro Max brand / banner-design / slides (WhatsApp and social banners, partner decks), using
  PRODUCT.md voice and Petrol & Paper tokens.

## Next exact action

Phase 6, in a fresh session (owner request): read this file, `docs/ux-redesign/backlog.md` and the two critiques in
`.impeccable/critique/`, then:
1. `/impeccable:impeccable polish` the changed patient and staff views (en + ar, 390px + 1440px; synthetic fixtures via
   `e2e/patient-fixture.ts` / `e2e/portal-fixture.ts` against `frontend-dev` on :3100);
2. full verification: lint, typecheck, unit, Playwright (en + ar), `e2e/a11y.spec.ts` (known failures: 11 `ProposalSign`
   unit tests, 4 `portal-ux` + 2 Control Center `care-coordination` specs, lint 25 errors/13 warnings — all pre-existing);
3. `/impeccable:impeccable critique` the portal again; record 24/40 → new score here;
4. `/impeccable:impeccable document` to refresh DESIGN.md (component tokens already recorded);
5. update backlog (done items, remaining P2: staff home footer, stat tiles, toolbar → distill);
6. push `feat/ux-redesign` and draft the PR description → **GATE 5** (stop before opening the PR).
