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
  - [x] Owner: "merge and push" — `7633977` fast-forwarded into `codex/platform-control-plane` and pushed (from the main
        checkout, which now has that branch checked out).
  - [x] Remaining work-item wording (owner request): `V77__notification_and_waiting_copy` (`staff_notifications.copy_code`
        + encrypted `copy_params`, `medical_cases.waiting_reason_code`). Work-item codes for `ConsultantReferralService`
        (transfer / second-opinion requested, offered, declined; second opinion due), `CaseHandoffService` (deposit due,
        treatment coordination start) and `AssignmentEngine` (coordination routing). Notifications inherit their work item's
        code; direct notifications got their own (routing, assignment, ownership transfer with optional "previously / by"
        sentences, second opinion received/accepted, referral not confirmed, transfer completed, Consultant needs
        information). `WaitingReason(code, text)` replaces the string reason everywhere: fixed codes, `WORK:<code>` and
        `PATIENT_STEP:<blocker>`; `CaseActionsView.waitingReasonCode`. Frontend: `portalWork.workCopy` (33 items),
        `portalWork.waitingReason`, `workCopyText` `extras`, `waitingReasonText()`; NotificationBell and the coordinator
        brief render from them. The default patient reason now reads "Waiting for the patient" instead of "information
        requested". Journey-runtime action handlers keep their admin-defined node labels (content, not code)
    - [x] verify: backend full suite 619/0 (2 skipped); `PostgresJpaMappingTest` green on V77; typecheck ok; lint 24/12;
          unit 347 pass, 11 `ProposalSign`; Playwright 13 portal/patient specs incl. a11y 113 pass, 3 fail = pre-existing
          (`care-coordination` ×2, Control Center "Staff & teams"), plus one cold-start a11y timeout that passes alone
  - [x] Owner: "merge and push, then rebuild the stack" — `40565e5` pushed; tunnel stack rebuilt, V77 applied, health UP.
  - [x] Representative picker (owner request): `CaseWorkspace.representatives` (coordinator role only; in-force
        `PATIENT_REPRESENTATIVE` links with relationship, since-date and the person's own portal display name when set —
        no other name source exists); `RecordedDecisionRequest.representativeId` (optional; must be one of those links,
        else `REPRESENTATIVE_NOT_AUTHORISED`; still `REPRESENTATIVE_AMBIGUOUS` with several and no pick). The form names a
        single representative in the choice, asks "Which representative" when there are several, and offers only "The
        patient" (with a reason) when there is none. No migration
    - [x] verify: backend full suite 620/0 (2 skipped; +1 picker test); typecheck ok; lint 24/12; unit 348 pass, 11
          `ProposalSign`; Playwright arabic-proposal-decision 10/10 (new en/ar picker test), portal-ux, staff-home, my-care,
          portal-p2-pass-3, portal, workspace-case-switch, a11y 83 pass, 1 fail = pre-existing Control Center "Staff & teams"
    - [x] screenshots: `docs/ux-redesign/screenshots/pass-3/record-decision-representative-{en,ar}-390.png`
  - [x] Portal module split (owner request; structure only, no behaviour change): `Portal.tsx` (138 KB) → shell
        `Portal.tsx` (39 KB: auth, routing, queue state, leave guard), `StaffQueue.tsx`, `StaffCaseView.tsx` (the staff
        case page and its proposal/deposit/assessment forms), `PatientCaseView.tsx` (My Care + proposal drawer),
        `portal-ui.tsx` (copy, feedback context, drawer, panel, status), `portal-model.ts` (types and pure helpers). Code
        moved verbatim by script; the only rewrite is the patient/staff seam of the old `WorkspaceView`. The case page is
        fetched per role as soon as the role is known (`useCaseView`) and then rendered without suspending — a lazy
        component left the queue hidden over a blank page on the first "Open" (caught by `portal-ux` "a claim another
        coordinator won"). Production build: the portal shell chunk (47 KB) has neither staff case code (118 KB chunk) nor
        My Care
    - [x] verify: typecheck ok; lint 24/12; unit 348 pass, 11 `ProposalSign`; `next build` ok; Playwright 18 portal/
          patient/governance specs 133 pass; failures = pre-existing (access-governance ×2, credential-reviews ×2,
          care-coordination ×2, Control Center "Staff & teams") plus two cold-run timeouts (a11y how-it-works, my-care
          Arabic) that pass alone

- [x] **Pass 4** (branch `feat/ux-redesign-pass-4` from `codex/platform-control-plane` @ `764535a`; backlog "Performance and
      code structure" → Composition; structure only, no behaviour or copy change)
  - [x] Staff case page overlays: the nine boolean flags in `StaffCaseView.tsx` (journey, messages, more, transfer, request
        information, proposal, decline, record response, record decision) are one `CaseOverlay | null` state. No two can be
        open at once: every overlay is a modal `<dialog>` (`showModal`), and each "More actions" entry already closed that
        drawer before opening its own. `closeOverlay(which)` only clears the overlay that asked, as the separate flags did,
        so a late `close` event from a replaced drawer cannot shut its successor. `recordOpen` was not dead: it is set from
        More actions and cleared by `RecordPatientResponse` through `onOpenChange(false)` on cancel/Escape/save
  - [x] `CaseWorkspaceProvider` (in `StaffCaseView.tsx`; same createContext/useContext idiom as `WorkCopyProvider`) carries
        locale, `t`, role, the case summary, busy, mutate, FX rates, catalogue and the viewer's subject. ProposalSummary,
        CoordinatorBrief, CaseActivity, ProposalSendForm, ProposalShareLinks, FinalAssessment, FinalQuoteActions,
        DepositCard, DeliveryCard and ProposalCard read it instead of taking the same props one by one (ProposalSendForm's
        unused `fxRates` prop is gone). `CaseViewProps` (what Portal passes) is unchanged; `PatientCaseView` does not use it.
        `RoleActions` keeps explicit props because `AuthoritativeActions.test.tsx` renders it alone
  - [x] verify: typecheck ok; lint 24/12 (= baseline); unit 348 pass, 11 `ProposalSign` (pre-existing); `next build` ok and
        the portal shell chunk (47 KB, has "Sign in to open your case") contains no staff case strings (the provider error,
        deposit, final assessment and transfer copy are only in the 118 KB staff case chunk); Playwright portal-ux, portal,
        portal-p2-pass-3, portal-reliability, staff-home, arabic-proposal-decision, workspace-case-switch, care-coordination,
        my-care, a11y: cold run 94 pass / 7 fail; rerun of the 7: 4 pass (cold timeouts: portal-ux ×2, portal-p2-pass-3,
        workspace-case-switch), 3 = pre-existing (care-coordination "Coordination Setup" ×2, Control Center "Staff & teams");
        warm rerun of portal-ux, portal-p2-pass-3 and workspace-case-switch: 38 pass, 1 = "Staff & teams"
  - [x] Owner: "merge pass 4 into codex/platform-control-plane and push" (`5a79f90`), then "rebuild the stack": rebuilt
        from `5a79f90`, backend UP, schema V77, localhost 3000/8081/8180 and `https://dev.rehletshifaa.com/en` 200
  - [x] Role crash guard (owner: "carry on with the role crash guard"; backlog P2). Since the pass-3 split `role={currentRole!}`
        could no longer crash (`useCaseView(null)` renders nothing), but a failed `/me` re-read left an open case on an
        endless "Loading your workspace…", and a failed first read left an empty page: the portal never read `meFailed`.
        The shell now derives `caseRole` (the role a case page opens under; none while `/me` has failed) and passes it
        without `!`; while `meFailed` it shows one alert (`portalWork.accessUnavailable`, en + ar) with Try again
        (`refreshMe`). The open case stays in state and comes back on a successful retry
    - [x] verify: typecheck ok; lint 24/12; unit 348 pass, 11 `ProposalSign`; Playwright `portal-reliability` +3 tests (staff
          first-load failure en/ar, patient re-read failure) — all 3 fail on the previous `Portal.tsx` and pass now; the 10
          portal/patient specs 99 pass, 5 fail = 3 pre-existing (care-coordination ×2, "Staff & teams") + 2 cold-run
          timeouts (a11y care-areas, portal-ux team queue) that pass alone
  - [x] Owner: "merge and push, then rebuild the stack" — `2aa23d8` fast-forwarded into `codex/platform-control-plane` and
        pushed; stack rebuilt (backend UP, localhost 3000/8081/8180 and `https://dev.rehletshifaa.com/en` 200; the portal
        serves the new access-alert copy in en and ar)
  - [x] Portal lint and `refreshMe` (owner: "carry on with the lint errors and the refreshMe fix"; backlog P2 ×2)
    - [x] the 11 portal compiler-rule errors: `?role=` read once into lazy state and the role derived (no effect);
          the queue clear/loading and the saved queue view adjusted while rendering when the person or role changes (the
          effect only fetches); the case restore starts its async open just after the effect body (as the bell's first
          fetch); `usePortalSlot` (`portal-slot.ts`, `useSyncExternalStore`) for the bell and account menu; PortalAccount
          keeps the dialog's open state instead of reading the ref in render; PortalDirectories and WorkforceAdoptionPanel
          fetch without synchronous resets; `validUntilInDays()` replaces `Date.now()` in render. Plus the Portal `api`
          `locale` dependency warning. The 13 Control Center errors are a new backlog row
    - [x] `refreshMe`: AuthProvider keeps the previous `/me` answer while re-reading for the same person, so the portal
          no longer swaps to the loading frame and unmounts the open case, its dialogs and drafts. An activation retry
          still shows as loading; a failed re-read still clears roles (the access alert)
    - [x] verify: typecheck ok; lint 13/11 (was 24/12; no new findings); unit 349 pass (+1 AuthProvider re-read test, fails on
          the old provider), 11 `ProposalSign`; `next build` ok, shell chunk 48 KB without staff case code; Playwright 11
          specs (the 10 portal/patient specs + credential-reviews) 102 pass, 5 fail = pre-existing (care-coordination ×2,
          credential-reviews ×2, "Staff & teams"); new `portal-reliability` test (case stays on screen during a held `/me`
          re-read) fails on the old provider
  - [x] Owner: "merge and push, then rebuild the stack" — `6cd977d` fast-forwarded into `codex/platform-control-plane` and
        pushed; stack rebuilt (backend UP, localhost 3000/8081/8180, `https://dev.rehletshifaa.com/en` and `/en/portal` 200)

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
| 2026-10-09 | Owner: "merge pass 4 into codex/platform-control-plane and push" — `feat/ux-redesign-pass-4` (`23a1f77`) fast-forwarded and pushed to origin. | Owner |
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

Pass 4 (composition, `23a1f77`) is fast-forwarded into `codex/platform-control-plane` and pushed (owner, 2026-10-09); the
tunnel stack runs `6cd977d` (role crash guard, portal lint and `refreshMe` fix; all merged and pushed). Next candidates: Control Center lint
(13 errors, P2) and the `refresh` stale-result guard / shared `busy` flag (P2). Earlier notes:

Pass 3 is complete and fast-forwarded into `codex/platform-control-plane`, pushed to origin (2026-10-08); the follow-up
commit on `feat/ux-redesign-pass-3` is not merged or pushed yet. The tunnel stack runs `9e3b336` (V76); live checks must run from a network that
reaches `*.rehletshifaa.com`. Portal module split done on `feat/ux-redesign-pass-3` (not merged or pushed yet). `cfc1394` (representative picker) is pushed and deployed: the tunnel
stack runs it (schema 77). A Docker engine restart stopped the stack right after that rebuild; it was brought back
with the standard tunnel-overlay command (only cloudflared restarts on its own). Owner decisions
still open: journey-bound cases (backlog P1 decision); legal L1–L5; native Arabic review; status tokens (B1) for the
amber tones; proposal drawer order (price first approved, recommendation-first suggestion kept in the backlog).
