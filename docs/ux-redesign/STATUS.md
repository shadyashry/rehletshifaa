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
- [x] **Phase 6 — Close the loop**
  - [x] polish (`6ea2a74`): drawer header pinned + focus return, 44px queue controls, announced copy, worded pager
  - [x] full verification: typecheck ok; lint 25/13 unchanged; unit 318/11 (`ProposalSign`, pre-existing); Playwright 178 passed,
        26 skipped, 22 failed — 18 identical on base `975f071`, 4 `case-flow` blocked by backend CORS (tunnel-only); a
        `case-flow` locator regression from `395c002` was fixed
  - [x] portal re-critique: 24/40 → 25/40
  - [x] DESIGN.md refresh (`6fdc5ce`)
  - [x] backlog updated (done items, re-critique items)
  - [x] PR description drafted: `docs/ux-redesign/PR_DESCRIPTION.md`; branch pushed
  - [x] **GATE 5**: owner chose to merge directly (no PR) — `feat/ux-redesign` merged into `codex/platform-control-plane`
        as `06daa8e` and pushed (2026-10-08); `PR_DESCRIPTION.md` stays as the change summary

- [ ] **Pass 2** (branch `feat/ux-redesign-pass-2` from `codex/platform-control-plane` @ `5f0b887`)
  - [x] Step 1 shape: `plans/arabic-proposal-decision.md`. Findings: no backend path for a coordinator to record
        a proposal decision (`RecordPatientResponse` covers information requests only); the Arabic block applies to the
        portal drawer only — the secure link (`ProposalSign`) and activation deposit consent are not gated. Needs a
        backend contract change, legal questions L1–L5, owner decisions O1–O3.
  - [x] **GATE P2-1** approved (O1 all surfaces, O2 keep quiet English link, O3 owning coordinator only)
  - [x] Step 2 shape: `plans/staff-home.md`: count line instead of KPI tiles, land on first non-empty view,
        `StaffNav` in the header + role switch in the account menu, slim portal footer, toolbar distill, My work rows,
        one entry point for focus-step actions (Assign Consultant inline in the current-action panel, care area
        preselected, no-eligible next steps). Owner decisions S1–S3.
  - [x] **GATE P2-2** approved (S1 remove List/Cards, S2 slim footer on all `/portal` routes, S3 مهامي)
  - [x] Step 2 build: `/redesign-area` staff home
    - [x] count line instead of KPI tiles (zero counts omitted; a pressed count stays at zero); land on the first view with
          work (an explicit choice wins); `StaffNav` in the header from md, inline below; role switch in the account menu;
          slim `PortalFooter` on all `/portal` routes (`FooterSwitch`); List/Cards removed; selection only where a bulk
          action exists; My work as a hairline list with one quiet action; Assign Consultant inside the current-action
          panel, care area kept when the category list lacks it, unset hint, no-eligible next steps and no dead submit
    - [x] four reviewers: HIGH ×2 fixed (restore on silent renew; stuck zero filter); cheap MEDIUM/LOW fixed;
          the rest in backlog.md "Staff home — deferred review findings"
    - [x] verify: typecheck ok; lint 24/13 (baseline 25/13); unit 330 pass, 11 `ProposalSign` (pre-existing);
          Playwright staff-home 13/13 (en/ar × 375/390/768/1024/1440, assign en/ar, view choice), portal/portal-ux/
          workspace-case-switch/my-care/a11y 70 pass, 1 fail = pre-existing Control Center "Staff & teams"; a11y 20/20 at
          baseline (no entries to shrink); 3 previously failing `portal-ux` tests now pass (stale sub-tab labels fixed)
    - [x] screenshots: `docs/ux-redesign/screenshots/pass-2/`
  - [x] **GATE P2-3** approved (2026-10-08) → committed
  - [x] Step 3 build: coordinator-mediated Arabic proposal decision
    - [x] backend: `V74__assisted_proposal_decisions` (provenance columns + `proposal_assistance_requests`), permission
          `PROPOSAL_DECISION_RECORD` (step-up, coordinator at `CASE_OWNER`), `ProposalAssistanceService` (patient request
          from portal/secure link → one `PROPOSAL_TERMS_CALL` work item; owner records with attestation, channel, time,
          confirmer), `JourneyService.applyRecordedDecision` (same state change as the patient's own), assistance facts
          on `ProposalView`/`PublicProposalView`, `RECORD_PROPOSAL_DECISION` available action
    - [x] frontend: `/ar` drawer and secure link ask the coordinator (no dead checkbox/primary), "requested" state,
          quiet English route; in-drawer Decline confirm (en + ar); "Recorded by … after a …" provenance + dispute line;
          staff `RecordProposalDecision` inline in the current action or from More actions
    - [x] five reviewers (incl. a backend authorization review): HIGH fixed (datetime, focus, Arabic gendered verbs,
          English route as instruction); journey-runtime HIGH deferred as a cross-path decision (pre-existing for
          self-service); rest in backlog.md "Arabic proposal decision — deferred review findings"
    - [x] verify: backend full suite 611/0 (2 skipped), `PostgresJpaMappingTest` green on V74; typecheck ok; lint 24/13;
          unit 340 pass, 11 `ProposalSign` (pre-existing); Playwright `arabic-proposal-decision` 8/8, my-care,
          proposal-responsive, staff-home, a11y (20/20 at baseline), status-proposal, proposal-otp, pre8c, portal-ux all
          pass except the pre-existing Control Center "Staff & teams"
    - [x] screenshots: `docs/ux-redesign/screenshots/pass-2/` (secure-link-assisted-ar-*, my-care-assisted-ar-390,
          my-care-recorded-{en,ar}-1440, record-decision-{en,ar}-1440)
  - [x] **GATE P2-4** approved (2026-10-08) → committed

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
| 2026-10-08 | GATE 5 follow-ups: the Arabic proposal path becomes **coordinator-mediated** (Arabic page offers a coordinator who goes through the terms in Arabic and records the decision; Decline de-emphasised while Accept is blocked) — needs its own shape plan. **Next `/redesign-area` run: staff home distill** (stat tiles, toolbar, slim footer, staff nav; fold in the duplicated Assign Consultant action). PR description to be revised before opening. | Owner |
| 2026-10-08 | GATE P2-1: `plans/arabic-proposal-decision.md` **approved**. O1: the coordinator-mediated rule covers every Arabic surface relying on the deposit/refund/cancellation terms (portal drawer and secure link; activation per legal L2). O2: keep a quiet "decide on the English page" link. O3: only the owning coordinator records a decision on the patient's behalf. Legal L1–L5 open; Arabic terms approval stays a launch blocker. | Owner |
| 2026-10-08 | GATE P2-2: `plans/staff-home.md` **approved**. S1: remove the queue List/Cards toggle. S2: the slim footer replaces the marketing footer on all `/portal` routes (patients included). S3: Arabic "مهامي" for My work (pending native sign-off). | Owner |
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
| Portal (re-critique, Phase 6) | `.impeccable/critique/2026-10-07T21-50-23Z__frontend-src-components-portal.md` | 25/40 |

## Future (out of scope for this run)

- Marketing assets with Pro Max brand / banner-design / slides (WhatsApp and social banners, partner decks), using
  PRODUCT.md voice and Petrol & Paper tokens.

## Next exact action

Owner: decide the journey-runtime follow-up (backlog "Arabic proposal decision" P1 decision: UI on the journey-action
endpoints, or direct endpoints sync the runtime). Then the next pass-2 item from the backlog (patient notification of a
recorded decision, P2). Legal L1–L5 open; Arabic terms approval remains a launch blocker; native Arabic review pending.
