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

- [x] **Pass 2** (branch `feat/ux-redesign-pass-2` from `codex/platform-control-plane` @ `5f0b887`)
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
  - [x] Owner standing instruction (2026-10-08): run the recommended follow-ups end to end, no further gates; decisions
        logged here and in the plans. Step 1 (`a9eee09`): dead 'verified consultant' copy removed, Arabic estimate
        disclaimer aligned, patient notified of a recorded decision, backlog tidied.
  - [x] Step 2 portal reliability (`plans/portal-reliability.md`): workspace no longer disabled while busy, feedback
        inside drawers, drafts survive tab switches, per-case bulk outcomes, labels; unit 342 pass (11 `ProposalSign`),
        `portal-reliability` e2e 3/3, portal-ux only the pre-existing Control Center failure

- [x] **Pass 3** (branch `feat/ux-redesign-pass-3` from `codex/platform-control-plane` @ `881c3d6`)
  - Environment check (read-only, 2026-10-08): the tunnel stack is **not** on pass 2. The running backend image was built
    2026-10-07 10:26 and `flyway_schema_history` ends at V73 (no V74 `assisted_proposal_decisions`). Pass 3 relies on
    tests and mocked fixtures only; the stack needs a rebuild from `codex/platform-control-plane` before any live check.
  - [x] Step 1 backlog tidy: 9 rows re-checked against code — done: case number title, RTL tablist keys, zero tiles,
        deposit-panel washes, proposal fieldset; partly done with notes: Arabic micro-label tracking, care-area labels
        (MyCare keeps a local map), filled row actions (Claim/Accept stay filled); a duplicate `mutate` row merged
  - [x] Step 2 per-case viewer relation: `CaseActionsView.viewer` = SELF / REPRESENTATIVE / STAFF, resolved per case from
        the patient record's subject (a person can be the patient on their own case and a representative on a relative's);
        Portal/MyCare say "Care for …" from it (account-level role rule removed). `ProposalAssistanceService` now requires
        exactly one in-force `PATIENT_REPRESENTATIVE` link for a representative confirmation (`REPRESENTATIVE_NOT_AUTHORISED`,
        `REPRESENTATIVE_AMBIGUOUS`) instead of the submission contact's role, and `V75__proposal_decision_representative`
        stores the confirming representative's subject (check constraint ties it to `confirmed_by`)
    - [x] verify: backend full suite 617/0 (2 skipped; +4 `CaseViewerRelationTest`, +2 assisted-decision tests);
          `PostgresJpaMappingTest` green on V75 (throwaway `rs-jpa-mapping-pg`, schema reset); typecheck ok; unit 343 pass,
          11 `ProposalSign` (pre-existing); Playwright `my-care` 10/10 incl. 2 new per-case relation tests
  - [x] Step 3 work-item wording as code + parameters: `V76__work_item_copy` (`case_tasks.copy_code`, encrypted
        `copy_params` JSON), `WorkDtos.WorkCopy` on `WorkItemView` and `CurrentActionView`; codes emitted by
        `JourneyService` (new assignment, the four clinical outcomes, clinical review due, assignment declined, patient
        decline / change request), `PatientActionService` (patient responded) and `ProposalAssistanceService` (terms call);
        `CaseActionService` passes it through. The English title/context stay for e-mail, audit and unknown codes. Frontend:
        `portalWork.workCopy` (en + ar, neutral Arabic beside names, pending native review), `workCopyText()` isolates
        names and the patient's quoted words; `MyWork` and `CurrentAction` render from it in both locales and fall back
        to the old per-type title for codes they do not know
    - [x] verify: backend full suite 619/0 (2 skipped; +2 copy tests); `PostgresJpaMappingTest` green on V76; typecheck ok;
          lint 24/12 (= baseline); unit 345 pass, 11 `ProposalSign` (pre-existing); Playwright arabic-proposal-decision,
          portal-ux, staff-home, my-care 58 pass, 1 fail = pre-existing Control Center "Staff & teams"
  - [x] Step 4 portal P2s through /redesign-area (plan `plans/portal-p2-pass-3.md`, owner brief = approval; committed per
        the owner's "commit each step when green" instead of the skill's wait-for-approval): unsent-text guard
        (`LeaveCaseGuard.tsx`: text fields baselined on first focus, rebaselined after a successful save; in-page alertdialog
        on My dashboard, another case, a staff view, a role switch and browser Back; `beforeunload`); staff view in the URL
        (`?view=` pushed per pick, read on load and on popstate, views are links, focus to the view heading); Western digits
        in Arabic (`intlLocale()` → `ar-u-nu-latn` in the portal, secure proposal/status links and activation); `.field:focus-
        visible` 3px ring; tokens `--button-secondary-border`/`--button-outline-border` → ink-350 and new
        `--button-disabled-bg/fg/border` (aliases of existing palette, Petrol only; `token-proposals.md`, `DESIGN.md`); 44px
        targets; Arabic secure link's next steps start with the coordinator conversation on the assisted path
    - [x] four reviewers: 9 HIGH fixed (RB ×3, WG ×2, I18N ×2 + 2 HIGH-equivalent history bugs); MEDIUM/LOW fixed where
          cheap, the rest in backlog.md "Portal P2s — deferred review findings"
    - [x] verify: typecheck ok; lint 24/12 (= baseline); unit 345 pass, 11 `ProposalSign` (pre-existing); Playwright
          `portal-p2-pass-3` 9/9 (×4 repeat stable); 19 portal/patient specs incl. a11y 138 pass, 3 fail = pre-existing
          `care-coordination` "Coordination Setup" ×2 and Control Center "Staff & teams"; e2e staff-view selectors moved from
          button to link (fixture + portal-live, portal-gateway-live, uat-walkthrough-live)
    - [x] screenshots: `docs/ux-redesign/screenshots/pass-3/leave-case-{en,ar}-{390,1440}.png`
  - [x] Tunnel stack rebuilt from `codex/platform-control-plane` @ `9e3b336` (main checkout switched from `feat/ux-redesign`,
        which it contains): backend applied V74–V76, health UP, localhost 3000/8081/8180 all 200, cloudflared 4 connections.
        From this machine's network every `*.rehletshifaa.com` TLS handshake is reset (other Cloudflare sites work); the owner
        confirmed the site loads on mobile data, so the block is local, not the stack.
  - [x] Follow-up (owner: "carry on"): step-4 deferred P2s — Arabic services count through `portalWork.plural.services`
        (2 → خدمتان, 11 → 11 خدمة); the Consultant name in the handoff line and the timeline actor are bidi-isolated; the
        proposal version label (`portalWork.proposalVersion`, Arabic «الإصدار») and file sizes (Intl unit) are localised
    - [x] verify: typecheck ok; lint 24/12; unit 345 pass, 11 `ProposalSign`; Playwright 11 portal/patient specs incl. a11y
          105 pass, 1 fail = pre-existing Control Center "Staff & teams"

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
| 2026-10-08 | Owner: "commit and merge all" — pass 2 (`d09a3ad`…) fast-forwarded into `codex/platform-control-plane`; no push. | Owner |
| 2026-10-08 | Owner: "merge pass 3 into codex/platform-control-plane and push" — `feat/ux-redesign-pass-3` fast-forwarded and pushed to origin. | Owner |
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

Pass 3 is complete and fast-forwarded into `codex/platform-control-plane`, pushed to origin (2026-10-08); the follow-up
commit on `feat/ux-redesign-pass-3` is not merged or pushed yet. The tunnel stack runs `9e3b336` (V76); live checks must run from a network that
reaches `*.rehletshifaa.com`. Next engineering candidates: wording the remaining work types (backlog P3), a
representative picker for recorded decisions, full Portal module split. Owner decisions
still open: journey-bound cases (backlog P1 decision); legal L1–L5; native Arabic review; status tokens (B1) for the
amber tones; proposal drawer order (price first approved, recommendation-first suggestion kept in the backlog).
