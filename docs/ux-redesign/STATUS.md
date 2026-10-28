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

- [x] **Finish plan — Batch 0: trustworthy test baseline** (branch `feat/ux-redesign-batch-0`, 2026-10-09; plan
      `plans/finish-plan.md`)
  - [x] 11 `ProposalSign` unit tests: the fixture's fixed `validUntil` (2026-10-01) had passed, so every decision test saw
        the correct "expired" view. Validity is now relative to today. Not a product regression
  - [x] Specs left behind by the Control Center rework (`19a970c`, 2026-10-04): care-coordination "Coordination Setup" now
        reads the unit tests' typed fixtures (`coordination-test-support.ts`) and the current screens; ux8 commercial checks
        the consultant Price Lists hub (persona gains Consultant Operations) and the current journey wording; owner-approved
        deletions of tests for removed screens: `access-governance.spec.ts`, `credential-reviews.spec.ts`, portal-ux
        "Staff & teams", ux8 "Organization profile" and "Provider Workspace: my prices" (coverage gap row in backlog)
  - [x] Environment-bound specs: case-flow submits to a real backend, so it now skips unless `PLAYWRIGHT_API_BASE_URL` names
        a stack (as the live specs do); home-media plays H.264 video, which Playwright's Chromium cannot decode, so it uses
        installed Chrome by default
  - [x] Cold-run timeouts, root cause: under parallel workers `next dev` corrupted `.next/dev/prerender-manifest.json`
        mid-run (then every page failed), and 11 browsers on this laptop stalled page creation. Playwright now builds and
        runs `next start` (`PLAYWRIGHT_DEV_SERVER=true` keeps dev for quick runs), with 4 workers locally; the a11y scans run
        in parallel with 60s each
  - [x] Found under load, fixed in the app: after "ask my coordinator" the drawer focused the confirmation one frame later,
        before it rendered, so focus was lost; it now focuses it when it mounts (`PatientProposal.tsx`)
  - [x] verify: typecheck ok; lint 13/11 (unchanged, Control Center in Batch 1); unit **360/360**; Playwright full suite on
        two consecutive cold runs **229 passed, 0 failed**, 38 skipped (env-gated live specs), under three minutes each
  - [x] Owner: "merge and push, then rebuild the stack" — `7441dbf` (with `3b40a09`) fast-forwarded and pushed; stack rebuilt
        (backend UP, localhost 3000/8081/8180, `https://dev.rehletshifaa.com/en` and `/en/portal` 200)

- [x] **Finish plan — Batch 1: portal safety and reliability** (branch `feat/ux-redesign-batch-1`, 2026-10-09)
  - [x] Control Center lint (13 `set-state-in-effect`): effects only fetch and apply in `.then` with a liveness guard; the
        journey pages derive loading (signed out, `/me` pending, no read permission); resets on a new key are adjusted while
        rendering; the language link reads the URL through `useSyncExternalStore`. Lint 0 errors
  - [x] Confirmations (one `ConfirmDialog` alertdialog, safe choice focused, en + ar copy in `portalWork.confirm`): recording a
        refund (amount read back), Resend link on the proposal summary and the delivery card (both revoke the patient's link,
        checked in `JourneyService`/`PublicCaseAccessService`), and submitting a second opinion (ends the consultant's access)
  - [x] Required items in `RecordPatientResponse` are `required`; the "Request changes" note was already required
  - [x] Portal reliability: busy counts operations in flight; a refresh answers only if it is the latest for the role; reference
        data is cleared on a role switch and its reads are guarded; `mutate` returns `null` for a skipped overlapping call
        (not a failure) and `undefined` for a failure
  - [x] Identity step shows the latest submission (awaiting review / under review / rejected with the reason) from the patient's
        onboarding read instead of an empty form; re-read after a submit. No backend change
  - [x] Workforce adoption accept: busy while sending (no double send), network failure shown
  - [x] Empty states: empty conversation; no one to assign in Operations/Finance; the referral care area keeps an unlisted
        value and asks to choose when there is none (en + ar copy in `portalWork.empty`)
  - [x] CI: the separate `pnpm build` step is gone (Playwright builds and tests the production build itself)
  - [x] verify: typecheck ok; lint **0 errors** / 10 warnings; unit 360/360; Playwright full suite cold **233 passed, 0 failed**,
        38 skipped (+4 new: identity awaiting review / rejected, resend asks first en/ar; the second-opinion unit test now
        confirms before sending)
  - [x] Owner: "merge push and rebuild" — `f304421` fast-forwarded and pushed; stack rebuilt (backend UP, localhost and tunnel 200;
        the portal serves the new confirm and empty-state copy in en and ar)

- [x] **Batch 1a — skill review of this session's work and fixes** (owner: "are you sure you take installed plugins…"; branch
      `feat/ux-redesign-batch-1a`). Until then the session had not loaded the skills CLAUDE.md requires; the review loaded
      `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines` (fresh rules) and Impeccable (context +
      audit/clarify playbooks) over `764535a..f304421`. 13 findings: no P0/P1; 6 P2 and 3 P3 fixed, 2 deferred, 2 kept with reasons.
  - [x] Fixed: a failed team-list load is no longer shown as "no one on the team" (`staff: null`, `portalWork.empty.teamUnavailable`);
        the identity status is re-read by the submit handler (no state-triggered effect), with the submit's own answer as
        fallback; Control Center results/readiness kept with the key they were read for (derived, no render-time resets);
        a past identity rejection is shown, not announced (`role="alert"` removed); Resend link triggers carry
        `aria-haspopup="dialog"`; React 19 `use()` and `<Context value>` for the case workspace and work-copy contexts;
        "Accepting…" while a workforce invitation is accepted; the resend question names the destination
        (`portalWork.confirm.resendBodyTo`); focus moves to the referrals section after a second opinion is sent
  - [x] Kept: the case restore's `queueMicrotask` start (behaviour unchanged; a pending-restore state machine would be a larger
        rewrite) and Portal's render-time resets on a role switch (many writers; React's adjust-while-rendering pattern)
  - [x] Rule from here: each batch loads the relevant skills at its start and runs the reviewers before its verification
  - [x] verify: typecheck ok; lint 0 errors / 10 warnings; unit 361/361 (+1 team unavailable vs empty); Playwright full suite cold
        232 passed, 1 failed = the new identity test still expecting `role="alert"` (updated), then my-care + portal-reliability
        21/21

- [x] **Finish plan — Batch 2: portal accessibility and Arabic formatting** (same branch `feat/ux-redesign-batch-1a`, 2026-10-09;
      **Batch 1a merges together with this batch**: one merge, push and rebuild when the owner says so). Skills loaded at the start
      and used for build and review: react-best-practices, composition-patterns, web-design-guidelines (fresh rules), Impeccable
      (context, audit/harden playbooks, craft floor, detector: 0 findings)
  - [x] B1 status tokens (D2): `--color-status-*` in `@theme`, `--badge-{tone}-*`, `.status-badge[data-tone]`; one `StatusBadge`
        (word + the Control Center's icon per tone) and one `caseStatusTone` for the case header and the queue; queue status and
        attention chips, My Work priority/overdue/blocking, assignment history, journey "blocked", Case blockers, the Consultant
        review's finance rows, the secure link and the patient tracker moved off Tailwind amber/emerald/sky. No amber left in My Care
  - [x] Accessibility: unread counts named in words (`UnreadCount`, `plural.unreadMessages`; staff badge = unread the viewer can mark
        read, not the total); bell items say "Unread"; overdue Case activity says "Overdue"; My Care section titles and other cases are
        h2 (other cases styled as a heading); `CaseMessages` h2; coordinator lock is `inert` (`LockedSection`); repeated actions name
        their item (queue "Open RS-…", My Work "Open: title, case", View/Preview/Download name the file, bell "Open case RS-…", Mark
        read names sender and time); inline `AccountLinkRequest` is not a dialog; no-email is text, not a dead mailto; the count line
        has a polite live region. Role switch already had a check icon + `aria-pressed`
  - [x] Patient proposal: visible reason under the disabled primary (approved disabled design kept); optional items explained; terms
        id from `useId` and the checkbox described by one short sentence naming the disclosure
  - [x] Arabic formatting: one `formatMoney` (`lib/money.ts`) for every amount; `<bdi dir="ltr">` on My Care figures instead of
        `dir="ltr"` blocks; date of birth formatted in UTC (`formatCalendarDate`); `.label-micro` with an RTL reset replaces every
        portal micro-label; My Care care areas from the shared atlas; the work-copy context carries its locale (plurals read it)
  - [x] Nested cards: Services & costs and the Consultant review's documents/services/summary are hairline sections in their card
  - [x] Backend: `WorkItemView.coordinatorSubject` (My Work says "You" on the viewer's own case)
  - [x] Review (four skills over the batch diff): no P0–P2; 6 P3s + 1 older screenshot finding in backlog.md "Batch 2 — deferred"
  - [x] verify: backend full suite 620/0 (2 skipped); typecheck ok; lint 0 errors / 10 warnings; unit **371/371** (+10: count-line live
        region, proposal reason/optional/terms reference, date of birth west of UTC (fails without the fix), My Care headings/unread
        words/Arabic figure, My Work "You", `LockedSection`, status tone); Playwright full suite **233 passed, 0 failed**, 38 skipped;
        a11y 20/20 at baseline. First full run: 30 failures, all stale selectors on the old names (`"Open"` exact, "Messages1",
        file name now also in its actions) — updated; the affected specs then 82/82

  - [x] Owner: "merge batch one and batch 2 and push and reload" — `023731e` fast-forwarded into `codex/platform-control-plane`, pushed
        and deployed by the owner (the auto-mode classifier refused the git step here); checked after: local = origin = `023731e`, backend
        UP, localhost 3000/8081/8180 and `https://dev.rehletshifaa.com/en`, `/en/portal`, api-dev health all 200, served CSS has the
        Batch 2 tokens

- [x] **Finish plan — Batch 3: public site** (branch `feat/ux-redesign-batch-3` from `codex/platform-control-plane` @ `023731e`,
      2026-10-09; owner decisions B3-1..3 below). Skills loaded at the start and used for build and review: react-best-practices,
      composition-patterns, web-design-guidelines (fresh rules), Impeccable (context, animate playbook, craft floor, detector: 0)
  - [x] One journey: the home film and the How it works preview are the four stages (Understand your case → Understand your options
        → Prepare your care in Egypt → Continue your care); the 7 numbered sub-steps stay on How it works only; the care-area and
        Consultant routers are unnumbered and link to How it works (B3-3)
  - [x] Body systems vs care areas: "9 care areas across 6 body systems"; care-areas H1 "Explore care by body system"
  - [x] How it works: "How the cost is settled" — preliminary estimate (with the recommendation, before travel, non-binding) → final
        quote (after the in-person assessment, before treatment); "You"/"Next" labels at 13px; more room above phase headers
  - [x] Intake: no travel-package question (B3-1); the coordinator sets it in the portal. Coordinator introduction in the home
        journey (D4, B3-2): one bilingual coordinator, Arabic and English, WhatsApp — no name, photo or hours
  - [x] Care-area pages: one in-content route to the form (hero button removed). Consultant cards: names are h3 (no h2→h4 skip);
        shorter on phones (no distinction block, two facets). `PageHero` mist mirrored in RTL. CaseForm upload area on tokens (8px,
        pearl, no shadow, 44px remove, Intl file sizes) and its flow copy in `messages/*.json` (`form.flow`)
  - [x] Scroll reveals: heading and content reveals removed (nothing waits for a scroll); kept the hero arrival, header, reading
        progress and the journey filling as it is read
  - [x] Review (four skills): no P0–P2; 4 P3s in backlog.md "Batch 3 — deferred"
  - [x] verify: typecheck ok; lint 0 errors / 10 warnings; unit 371/371; Playwright full suite **243 passed, 0 failed**, 38 skipped
        (+10 `public-batch-3.spec.ts`, each failing on the pre-Batch-3 pages); a11y 20/20 at baseline. No backend change

- [x] **Finish plan — Close** (same branch `feat/ux-redesign-batch-3`, 2026-10-09; owner: "run the close step", then "fix the P1s as part
      of the close", and the coverage gap accepted as post-launch)
  - [x] Re-critiques (Impeccable `critique`, dual-agent: an isolated design review and an isolated detector + browser-overlay run per
        target, on the branch's production build): **portal 27/40** (trend 24 → 25 → 27), **public site 24/36 = 67%** (7 n/a; last
        25/40 = 62.5%, not like-for-like). Snapshots in `.impeccable/critique/2026-10-09T14-11-*`. Detector: 0 CLI findings on both;
        overlay findings were the documented paper surface and eyebrow, plus small items moved to Post-launch
  - [x] The six P1s fixed before merge:
        portal — Arabic money isolated on every surface (secure link, staff case), Arabic plural forms and one long date on the secure
        link; the secure-link sticky bar stacks on phones with a short assisted label, no blur, an 8px hairline summary without the
        nested card, 13px labels, and no "Send my case" in the header on `/proposal` and `/status`; staff-voice status words with the
        proposal and work states (no raw RELEASED/OPEN), countries via `Intl.DisplayNames` (`countryName`), "Consultant" capitalised.
        public — a privacy and file-rules line at the upload (facts from PRODUCT.md only), a 14px secure note, a leave-first warning
        instead of storing medical details in the browser; one name each (Send my case, Track case, case number, coordinator) in
        sentence case; /cardiology lists lead with plain treatment names, CV sourcing notes stripped, a distinction that restates the
        role hidden, the Arabic Latin join spaced. Fees: the owner decided the site states nothing about them
  - [x] Decorative "01–06" numerals removed from Care areas; the a11y baseline is now empty
  - [x] Backlog: every open P3 moved to **Post-launch**; the critiques' P2/P3s added there; **Blocked on a decision or approval** lists
        legal F2 and L2, the two confirmation styles, D1 and the Arabic terms / native review (launch blocker);
        the e2e coverage gap for Teams/People/governance accepted as post-launch (owner)
  - [x] verify: typecheck ok; lint 0 errors / 10 warnings; unit **377/377** (+6 Close tests, each failing on the old code);
        Playwright full suite **245 passed, 0 failed**, 38 skipped (a first run caught one stale
        heading assertion after the sentence-case rename, updated); a11y 20/20 with an empty baseline
  - [x] Owner: "merge, push and deployment done" (2026-10-09) — `f4b6886` (Batch 3 + Close) fast-forwarded into
        `codex/platform-control-plane`, pushed and deployed by the owner; checked after: local = origin = `f4b6886`, frontend and
        backend rebuilt, backend UP; localhost 3000/8081/8180 and `https://dev.rehletshifaa.com` `/en`, `/ar`, `/en/how-it-works`,
        `/en/cardiology`, `/en/send-my-case`, `/en/portal`, api-dev health all 200; the live pages serve "Send my case" / «أرسل حالتي»
        (no "Start my case"), the four stages, "9 care areas across 6 body systems", "How the cost is settled" and the plain
        treatment names. **The redesign epic is complete.**

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
| 2026-10-09 | Owner: "go with your recommendations for D1–D4" (finish plan). **D1** journey-bound cases: a known limitation, because no admission policy is current and no case was ever admitted (dev DB); the fix is a precondition for turning journey admission on. **D2** B1 status tokens approved as proposed (`token-proposals.md`). **D3** price first stays; the recommendation-first suggestion is closed. **D4** the public site uses the four stages as on How it works, and a generic team introduction until real coordinator content exists. | Owner |
| 2026-10-09 | Batch 3 (owner): **B3-1** the travel-package question leaves the intake (the coordinator sets it in the portal); **B3-2** coordinator introduction = role, Arabic and English, WhatsApp (no name, photo or hours); **B3-3** the routers are unnumbered and link to How it works. | Owner |
| 2026-10-09 | Close (owner): fix the re-critique P1s as part of the close; accept the Teams/People/governance e2e coverage gap as post-launch. Fees: the site states nothing about whether sending a case or the review costs anything. | Owner |
| 2026-10-15 | Area 1 plan `plans/patient-portal-file.md` **approved** with the recommendations: **D-1** stamp dates from backend milestones; **D-2** Copy controls on the payment slip; **D-3** no fourth (Acknowledged) stamp; **D-4** quiet emergency notice on the patient pages; **D-5** no only-account line until the business confirms. Slice T first. | Owner |
| 2026-10-15 | Area 1 slices **A** (`8f8dfc2`) and **F** (`31d60df`) **approved** after review; fast-forwarded into `feat/ux-area-1-portal-file`. Next: slice B. | Owner |
| 2026-10-15 | Area 1 slice **B** (`5e20d75`, status link = the file, unsealed) **approved**; fast-forwarded into `feat/ux-area-1-portal-file`. Next: slice C. The B owner calls (form above the journey on phones, an onward link on the done page) stay open in backlog "Area 1 — slice B". | Owner |
| 2026-10-15 | Area 1 slice **C** (`82136e5`, proposal link = the estimate as a document; one noun per document across the doors) **approved**; fast-forwarded into `feat/ux-area-1-portal-file`. Next: slice D. The C owner calls ("Request changes" repeated in the fixed bar, channel switch after a failed resend) stay open in backlog "Area 1 — slice C". | Owner |
| 2026-10-15 | Area 1 slice **D** (`fa77b6c`, activation = completing the file) **approved**; fast-forwarded into `feat/ux-area-1-portal-file`. Next: slice E. | Owner |
| 2026-10-15 | Area 1 slice **E** (`d96aedd`, deposit step = the payment slip) **approved**; fast-forwarded into `feat/ux-area-1-portal-file`. All area 1 slices approved; next: the area gate (merge `feat/review-p0` D-1, rebuild, live check). | Owner |
| 2026-10-15 | Area 1 gate: live walk stopped at Received by the owner — Received checked live; In review and Estimate ready recorded as covered by the specs against the live build. Payment slip checked live on RS-2026-000005. | Owner |
| 2026-10-07 | The P0 loop exists only on `codex/platform-control-plane` (introduced in `19a970c`; `main` has `signIn` deps `[]` and no `refreshMe()` call), so `fix/my-care-reload-loop` branches from `codex/platform-control-plane` and its PR targets that branch, not `main`. | Owner |

## Accessibility baseline

| Page | Rules | Cause |
|---|---|---|
| — | — | Empty since the Close step (2026-10-09): the decorative "01–06" numerals on Care areas were removed; no page has a known serious/critical violation |

## Scores

| Surface | Critique | Score |
|---|---|---|
| Public site | `.impeccable/critique/2026-10-07T12-52-27Z__dev-rehletshifaa-com.md` | 25/40 |
| Portal | `.impeccable/critique/2026-10-07T13-37-54Z__frontend-src-components-portal.md` | 24/40 |
| Portal (re-critique, Phase 6) | `.impeccable/critique/2026-10-07T21-50-23Z__frontend-src-components-portal.md` | 25/40 |
| Portal (finish-plan Close) | `.impeccable/critique/2026-10-09T14-11-06Z__frontend-src-components-portal.md` | 27/40 |
| Public site (finish-plan Close) | `.impeccable/critique/2026-10-09T14-11-07Z__dev-rehletshifaa-com.md` | 24/36 (67%; heuristic 7 n/a) |
| Area 2 coordinator workspace (close) | `.impeccable/critique/2026-10-16T05-53-19Z__frontend-src-components-portal-staffcaseview-tsx.md` | 28/40 (from 21) |
| Area 3 Consultant portal + Virtual Clinic (close) | `.impeccable/critique/2026-10-28T08-44-42Z__frontend-src-components-portal-clinicalreview-tsx.md` | 28/40 (from 17) |
| Area 5 Operations (before) | `.impeccable/critique/2026-10-28T10-24-59Z__frontend-src-components-portal-admissionpanel-tsx.md` | 19/40 |

## Future (out of scope for this run)

- Marketing assets with Pro Max brand / banner-design / slides (WhatsApp and social banners, partner decks), using
  PRODUCT.md voice and Petrol & Paper tokens.

## Next exact action

**UX area 1 — patient portal as the file** (`plans/patient-portal-file.md`, branch `feat/ux-area-1-portal-file`, worktree
`zealous-kapitsa-ee74d4`): critique **23/40** and shape plan **approved by the owner (2026-10-15)** with D-1 backend milestones, D-2 Copy yes, D-3 no fourth stamp, D-4 quiet notice, D-5 not yet. Was: the
owner approves the plan and decides D-1 (stamp dates: backend milestones, recommended), D-2 (Copy on the payment slip), D-3
(no fourth stamp, recommended), D-4 (quiet emergency notice on the patient pages) and D-5 (only-account assurance, business);
then slices T → A → F → B → C → D → E in about three sessions. **Slices T, A (`8f8dfc2`) and F (`31d60df`) are built, committed and approved by the owner (2026-10-15); A and F fast-forwarded into `feat/ux-area-1-portal-file`. Slice B (`5e20d75`, status link = the file, unsealed) is approved (2026-10-15) and fast-forwarded into `feat/ux-area-1-portal-file`. Slice C (`82136e5`, proposal link = the estimate as a document) is approved (2026-10-15) and fast-forwarded into `feat/ux-area-1-portal-file`. Slice D (`fa77b6c`, activation = completing the file) is approved (2026-10-15) and fast-forwarded into `feat/ux-area-1-portal-file`. Slice E (`d96aedd`, deposit step = the payment slip) is approved (2026-10-15) and fast-forwarded; all five slices of area 1 are approved. **Area 1 gate run (2026-10-15):** `feat/review-p0` (D-1, P1-10 s1) merged into the area (`7cb5fef`), dev stack rebuilt (backend from the main checkout on `feat/review-p0`, frontend from the area worktree, `--no-deps`), Received stamp and payment slip checked live, one gate fix (`582968b`). Next: the owner decides whether `feat/review-p0` takes area 1 now (it is a fast-forward of `feat/review-p0` to `feat/ux-area-1-portal-file`; the main checkout is on `feat/review-p0`), and the In review / Estimate ready stamps can still be watched live on RS-2026-000006 once a coordinator sends it to a Consultant; then area 2 per PLAN.md.** Merge `feat/review-p0` (D-1 backend, `668e24c`) before or with the area gate so the Received / In review stamps render live; owner calls open from B: form above the journey on phones when the patient owes the step (backlog "Area 1 — slice B"), and an onward link on the done page. Correction: "My Care + multiple cases" below **is committed**
(`0d743b2`, 2026-10-13) and is an ancestor of this branch; it is reused, not rebuilt.

**My Care + multiple cases** (`plans/patient-my-care.md`, owner-approved 2026-10-13) built by `/redesign-area` on
`feat/ux-redesign-my-care` (worktree `ux-my-care`), **not committed — awaiting owner approval**. Delivered: case switcher
(`CaseSwitcher.tsx`: grouped by person, "Needs you", past cases folded, "Send a new case" for the account's own), case header
band with the care-area mark, current step as the one file-tab card with the deposit inside it, coordinator card with
monograms, numbered journey that fills, estimate card, paper canvas, header pills per DESIGN.md, coral reading hairline off
portal pages; all My Care copy moved to `portalWork.myCare` (en + ar). Backend (decision 2): `CaseView.viewer`
(SELF/REPRESENTATIVE) on `GET /patient/cases` + `CaseViewerRelationTest` (+2). Verify: typecheck ok; lint 0 errors / 9
warnings; unit 402/402; backend 700 run / 0 failures; Playwright My Care + polish + a11y (en+ar, new `my-care-cases`
route) + Arabic decision 91/91. Screenshots: `screenshots/my-care/`. Deferred findings: backlog "My Care + multiple
cases". Next: owner review, then commit; then the next pass (proposal drawer, secure links, profile completion).

**Finish plan:** [`plans/finish-plan.md`](plans/finish-plan.md) (2026-10-09). Batch 0 merged, pushed and deployed (`7441dbf`);
D1–D4 decided (see Decisions); Batch 1 merged, pushed and deployed (`f304421`); Batch 1a (skill review fixes) done on
`feat/ux-redesign-batch-1a` (`fc03f0b`), not merged or pushed. Owner: Batch 2 runs in a **new session on the same branch**
(`feat/ux-redesign-batch-1a`, worktree `vigilant-roentgen-29caab`) and Batch 1a is merged **together with Batch 2** (one merge,
push and rebuild). **The redesign epic is complete** (finish plan): Batches 0–3 and the Close are merged into `codex/platform-control-plane`
(`f4b6886`), pushed and deployed (2026-10-09); re-critique scores are recorded above; every remaining item is on backlog.md's
Post-launch list or Blocked on a named decision. Open for the owner: legal L1–L5 (Arabic terms are a launch blocker); the native
Arabic review; the two confirmation styles.
Baselines: unit 377/377, Playwright full suite green, lint 0 errors / 10 warnings, backend 620/0, a11y baseline empty.

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

## Trust pass — public site (2026-10-15, branch `feat/ux-trust-pass` from `feat/review-p0` @ `adcab1b`)

Source: `patient-site-review-2026-10-14.md` (24/32). Plan: `plans/public-site-trust.md` (owner approval in chat).
Built: the hero shows the case file (`DossierPreview` + `CaseStamp`, photo removed; entrance uses `backwards` fill);
Send my case opens with the promise line (5 minutes · reply within 2 working hours Sat–Thu · no commitment), a quiet
emergency note with a disclosure, the account line moved beside the contact fields, a "What happens next" rail beside
the form and camera guidance on uploads; the confirmation is the first stamped dossier page; the privacy section moved
above travel. Copy in en + ar (`home.dossier`, `form.promise`, `form.nextSteps`, `form.uploadCamera`, `form.success`,
`common.emergencyNotice.more`). DESIGN.md gained "Case stamp and dossier pages".
Verify: typecheck ok; eslint clean on touched files; vitest 66 files / 470; Playwright `a11y.spec.ts` + `home-quality`
37/38 on the first run (stamp text contrast) → stamp words moved to `alert-700`, re-run green (home + send-my-case,
en + ar); `home-media.spec.ts` updated for the hero (intended change; needs the Chrome channel to run).
Deferred (backlog "Public site — trust pass"): photographs and the coordinators strip (consent, P1-14), continue-later
resume link (backend), care-area row distill, Arabic numerals/country names (B1).
Theme decision: Petrol & Paper stays (reasoning in `PLAN.md`).
Next: owner review on dev after merge + rebuild; then UX plan area 1 (`PLAN.md`), in its own worktree, in parallel with the backend plan.

## UX area 0 — visual-world exploration (2026-10-15, worktree `zen-blackwell-6af461`, branch `claude/zen-blackwell-6af461` from `feat/ux-trust-pass`)

Session: frontend-design plugin + Impeccable `new-work` (context, concept-seed `7766245a`, assigned candidate 3 of the grounded list) + ui-ux-pro-max as the checklist owner (its design-system match, Neumorphism with a testimonials carousel, was rejected against PRODUCT.md).
Delivered, docs only: `theme-studio-v2.html` (regenerated studio) and `screenshots/theme-studio-v2/` (world E at 1440, 768, 390).
- Critique of A–D against the plugin's generated-design tells: coral-ruled eyebrow (banned kicker), middle-dot meta strings, arrow on the button, tracked uppercase labels, cream + terracotta (A, B, C), near-black + one accent (B, D); the first studio also lacked doctype/charset/viewport, so served over HTTP its Arabic rendered as mojibake. Coral (2.69) and mint (2.53) fail 3:1, so neither can draw a ring or a marker under 1.4.11.
- New world **E Letterhead & Seal**: the bilingual Egyptian clinic letterhead as the page skeleton (Arabic right, mark centre, English left, double rule; the inactive name is the language switch), bond white, one blue-black ink for text and actions, one seal violet (#4b3fa5) for the stamp, focus ring and the mark's centre dot, Markazi Text display (Naskh with a Latin drawn to match) + Readex Pro body, Arabic type scale set first, locale numerals. Every text pair measured (appendix on the page).
- Proposed mark: a cupped hand holding three dots (you, your coordinator, your Consultant); EN, AR and letterhead lockups, reversed and one-ink variants, favicon test 16–64 px.
- Recommendation: adopt E with the new mark; fallback A-prime (A with the tells removed, white bond). Token proposal lists every `@theme` token, the `theme-petrol.css` re-points, component tokens, fonts.ts, the Keycloak login CSS variables and images, favicon/app icons, WhatsApp profile picture and the film posters. **Nothing changed in code.**
- Verify: detector 0 findings after one fix (future journey-step text was 2.3:1, now ink-400); narrow file-scoped ignores recorded in `.impeccable/config.json` for the proposed fonts, the dossier tab edge and clamp() padding; no horizontal overflow at 390/375/320 after wrapping long code tokens and the staff bar; Pro Max checklist (44px targets, visible 3px focus, reduced motion, no emoji icons, 375–1440) applied.
- **Owner decision (2026-10-15): Petrol & Paper stays** ("still the best is petrol and paper"). World E, the new mark and the token proposal are declined and kept on the page as a record. No token, component or asset changes; Western digits on `/ar` stay until the native review (pass-3 decision). Area 0 is closed; next is area 1 (patient portal as the file) per PLAN.md.

## UX area 1 — patient portal as the file (2026-10-15, worktree `zealous-kapitsa-ee74d4`, branch `feat/ux-area-1-portal-file` from `claude/zen-blackwell-6af461` @ `aba2635`)

Docs only. Critique (dual-agent: design review + `impeccable detect`, 84 before screenshots in `screenshots/area-1/before/`):
**23/40** (`.impeccable/critique/2026-10-15T00-27-32Z__frontend-src-components.md`). Findings: P1 deposit copy contradicts DEP-3
(activation done page ticks "Deposit received" on a reload; status-link deposit phase says the coordinator shares payment details);
P1 no stamped page for specialist reviewing or estimate ready; P1 three visual languages across five doors (82 off-ladder sizes,
24 off-scale radii, 18 tinted panels, two journey trackers); P1 Arabic parity at the decision; P2 deposit step overloads a phone.
Detector: 1 finding (side stripe, `PatientDepositPayment.tsx:70`).
Plan: `plans/patient-portal-file.md` — one dossier page shell, one journey, one code step for the three secure links; stamps on
case sent / specialist reviewing / estimate ready from backend event dates only; slices T (truth) → A (foundations) → F (My Care)
→ B (status link) → C (proposal link) → D (activation) → E (payment slip). Reuses `0d743b2` (switcher, current step, coordinator,
journey) unchanged. Owner decisions D-1…D-5 open; legal L-6 (payment-instruction lines in `commercial-terms.ts`) added to the
legal list. Found out of scope: the patient workspace returns the staff timeline (actor names, reasons) and open assignments
(staff subjects) — backend data-minimisation follow-up.
**Status: plan approved 2026-10-15 (decisions D-1 milestones, D-2 Copy yes, D-3 no, D-4 quiet notice, D-5 not yet).**
**Slice T built (truth first):** activation's ready page lists only true steps (account only when active; deposit received / not needed only when so) and names an unpaid deposit as the next step — heading, amount owed, how it is paid in My Care, one "Sign in to pay"; the unreachable deposit stage and its "no action / coordinator arranges" copy are gone; "will contact you shortly" removed. The status link's deposit phase says how and where to pay (true whether or not it was paid), shows no "nothing needed" and no team timing, offers one "Sign in to pay" link, and marks the step as the patient's on the tracker. ProfileActivation's and the journey tracker's copy moved to `messages/{en,ar}.json` (`secureLink.activation`, `secureLink.journey`, passed from the server pages; parity test extended); names and numbers bidi-isolated. The My Care fixture's retired `WAIT_DEPOSIT_ARRANGEMENT` became `WAIT_PAYMENT_CHECK` with a submitted reference (scenario `deposit-checking`), which fixes 6 My Care specs that failed on the base branch. Reviews (React/composition, web guidelines, RTL/i18n, Pro Max): 1 HIGH (deposit phase gave no way to pay) and 6 MEDIUM fixed; LOWs to backlog "Area 1 — slice T". Verify: typecheck ok; eslint 0 errors on touched files (1 pre-existing warning); vitest 66 files / 471; Playwright my-care, my-care-new-case, my-care-polish, activation-flow, status-access, status-proposal and a11y (en + ar) 72/72. Screenshots: `screenshots/area-1/after/t-*`. Next: slice A (foundations).

**Slice A built (foundations, `8f8dfc2`):** `brand/DossierPage` (kicker, reference, heading via children, stamp slot in the end-top corner with space reserved only when stamped, optional file-tab edge), adopted by the Send my case confirmation with the same classes; `CaseStamp` takes an ISO date and formats it per locale (12px floor); `CaseJourney` (DESIGN.md markers) now draws both My Care's and the status link's journey (phase map and `secureLink.journey` copy kept, in `lib/patient-journey.ts`; "completed"/"current" said in words; the patient's own step marked "Your step"); `OneTimeCodeStep` serves the status, proposal and activation links (masked destination before sending, channel switch only where the link offers two, one labelled field without placeholder, resend) with their access and grant logic unchanged; CaseStatusAccess's and ProposalSign's copy and the activation consents moved byte-identical to `secureLink.status`, `secureLink.proposal`, `secureLink.activation.consents` (passed from the server pages; ProposalSign no longer imports the dictionary); legal wording stays beside `lib/commercial-terms`. Screenshots `after/a-*`.

**Slice F built (My Care):** the current step is a `DossierPage` with the file tab and carries the stamp on the three moments only — Received (`WAIT_COORDINATOR_REVIEW`), In review (`WAIT_CONSULTANT_REVIEW`), Estimate ready (`REVIEW_PROPOSAL`) — printed from `milestones` (D-1) or, for the estimate, the already-shipped `patientProposal.releasedAt`; no date, no stamp (CaseStamp renders nothing). The stamp is read once by screen readers ("Received, Sep 1"), presses in once (200ms, reduced motion respected), and long labels wrap. Types: `Workspace.milestones`, `PatientProposalState.releasedAt`, status-link `milestones`, proposal-link `releasedAt` (B and C render them). My Care / Documents / Messages are links (`?case=…&view=…`, plain click stays in the page) in the header and the phone tab bar. Back to the previous case was already implemented (QA G-5, `99d5a16`, push + popstate); F adds a spec that guards it. Fixture: `milestones` on every scenario, new `case-received` and `consultant-review`. Reviews (React/composition, web guidelines, RTL/i18n, Pro Max) + detector (0): 3 HIGH fixed (a pasted code was cut to five digits; wrong-code errors not tied to the field on the status and activation links; the estimate stamp now falls back to `releasedAt`), MEDIUMs fixed (typed code kept when a resend fails, status busy label, destination line describes the field, Arabic stamp date untracked, stamp overhang, Arabic grammar in `proposalPreparingNext`); the rest to backlog "Area 1 — slices A/F". Verify: typecheck ok; eslint 0 errors on touched files (1 pre-existing warning); vitest 67 files / 480; Playwright status-access, status-proposal, proposal-otp, proposal-responsive, activation-flow, arabic-proposal-decision, home-quality, my-care, my-care-polish, my-care-new-case and a11y (en + ar) 114/114 (incl. new stamp, no-stamp and Back specs). Screenshots `after/f-*` (fixture data; the Received / In review stamps need the D-1 backend live).

**Slice B built (status link = the file, unsealed):** `CaseStatusAccess` is one `DossierPage` per step on the paper desk, the quiet emergency line first (D-4). **Sealed** — case number as the reference, "Track your case securely", where the code goes (masked, and now the channel: "to your WhatsApp" / "to your email" from the summary's `channel`; the link offers one contact, so no switch), "No one from RehletShifaa will ever ask you for this code…" (new, en + ar, as a slot in `OneTimeCodeStep`), one "Send verification code". **Current page** (file-tab edge) — phase title as the `h1`, body, usually-within, the one action (Review estimate / Review final quote by `documentType`, or Sign in to pay) or "No action is required", then Next / Meanwhile, then `CaseJourney`, then the response form; the stamp only on the three moments from `status.milestones` (Received in received/coordinator, In review for the Consultant, Estimate ready from `estimateReadyAt` or the proposal's `releasedAt`; none on a request, a final quote or a later phase; no date, no stamp). The "Current update: ‹status›" line is gone. Revised / declined / expired estimates get their own story instead of the "being prepared, or ready" fallback; a decidable estimate during an information request stays reachable as a secondary button (one filled action). **Done** — same frame, case number, an icon (no "✓" glyph). **Invalid** — says how to get a new link (Track case). Failures are mapped from the backend's `code` / status to copy beside the field they concern (wrong code, too many codes, file type / size / security check / upload, empty note, session ended, estimate no longer available; an expired link ends on the invalid page); focus goes to the first error after it renders, and to the new page's heading on every step the patient takes. Code field accepts Arabic-Indic digits; Verify says "Enter all six digits" instead of staying disabled (status link). Copy moved/added in `secureLink.status` (en + ar), stamp words and the case-number label passed from the server page. Backlog items closed: one journey vocabulary («استلام الحالة», «مسار رعايتك» / "Your care journey", "completed"; `lib/patient-journey.test.ts` holds My Care to it), `proposalAccepted` no longer says the coordinator is arranging the next steps, `--page-pad` instead of padding utilities (CaseForm, status link), `DossierPage` reference as `<bdi dir="ltr">`, the stamp reserve measured and fixed (label max 5.25rem, reserve = inset + 7.25rem, `.dossier-page-full` returns the width below the stamp; no overlap 640–1023 on the status link or My Care). `CaseStamp` time zone left open: nothing stamped renders on the server. Reviews (React/composition, web guidelines, RTL/i18n, Pro Max) + detector (0): 3 HIGH fixed (Arabic-Indic digits wiped; decided estimates contradicting the page; «تقديرك» read as "your regard" → «تقدير التكلفة»), MEDIUMs fixed (proposal hidden during a request, focus before the error rendered, channel not named, two nouns on the page, Arabic stamp leading, 429 wording, rejected file kept); the rest in backlog "Area 1 — slice B". Verify: typecheck ok; eslint 0 on touched files; vitest 68 files / 499 (×3 full runs green); Playwright status-access, status-proposal, proposal-otp, proposal-responsive, activation-flow, arabic-proposal-decision, my-care, my-care-polish, my-care-new-case, home-quality, track-case and a11y (en + ar, new `status-link` target) 120 passed, 12 skipped (case-flow, env-gated on a real backend). Screenshots `after/b-*` (en/ar, 390/1440; synthetic fixture with D-1 milestones). Approved by the owner (2026-10-15). Next: slice C.

**Slice C built (proposal link = the estimate as a document):** `ProposalSign` is pages of the same file. **Sealed** — a `DossierPage` with the case reference, "Verify it's you", where the code goes, the never-ask line, one Send; the other channel only before a code is sent (one rule with activation); a resend says "We sent a new code" in a live region and puts focus back in the field (`OneTimeCodeStep` now takes `round` instead of being remounted by `key`; the status link uses it too). **Document** — the header is the document's first page (file-tab edge): document type as the kicker (the amber badge and the "RehletShifaa · RS-…" eyebrow are gone), the title as the `h1`, prepared for / case (`<bdi dir="ltr">`) / updated version / valid until, and the "Estimate ready" stamp from the version's `releasedAt` — only for a decidable preliminary estimate with a date (none for a final quote, a blocked page, or no date). One reading column (8px card, token shadow): recommendation and "Reviewed by", the price list and total, scope, basis, next steps numbered with journey markers (no tinted panel), the deposit terms and the decision exactly as before (order, rules, assisted path); the summary aside first on phones and sticky from 1024px. Section labels on the ladder without tracking in Arabic. **Done** — the same frame with the case number, an icon, and the real next step: the profile link sent on WhatsApp or by email, as the backend sends it. **Invalid** — "This link no longer works" with the reason (expired, already decided) when the code step learns it. Failures map from the backend's `code` (wrong code, too many requests including the gateway's 429, session ended, acknowledgement required); a decision refused as expired or superseded replaces the decision block with a focused notice; pressing the primary action without the acknowledgement focuses the checkbox (its error is in its description). "More options" ≥44px with a chevron; the fixed bar clears the iPhone home indicator. One noun per document across the doors: "estimate" / «تقدير التكلفة», "final quote" / «عرض السعر النهائي» (proposal link, status link, My Care's review step and button by `documentType`, which My Care now types); Arabic range and total labels told apart, the empty / mismatched done lines aligned with English, «بمراجعة», «المراجعة والقرار بالإنجليزية». Legal strings untouched; the Arabic legal/native items are on the backlog. Phone stamp reserve raised to inset + 4.75rem (status link and My Care too). Reviews (React/composition, web guidelines, RTL/i18n, Pro Max) + detector (0): 5 HIGH fixed (focus lost when the fixed bar or the decision block unmounted; empty stamp corner without a date; stamp over the kicker on phones; the Arabic final-quote noun), MEDIUMs fixed (expired link at the code step, gateway 429, focus after resend, live region hidden, stamp on blocked pages, ack error not described, spacer under the fixed bar, "More options" affordance, My Care's "next" promising a profile link); the rest in backlog "Area 1 — slice C". Verify: typecheck ok; eslint 0 on touched files; vitest 68 files / 510 (×3); Playwright status-access, status-proposal, proposal-otp, proposal-responsive, activation-flow, arabic-proposal-decision, my-care, my-care-polish, my-care-new-case, home-quality, track-case and a11y (en + ar, new `proposal-link` target) 122 passed, 0 failed; stamp overlap check 320–1440 clean. Screenshots `after/c-*` (en/ar, 390/1440; synthetic fixture, `releasedAt` as D-1 sends it). Approved by the owner (2026-10-15). Next: slice D.

**Slice D built (activation = completing the file):** `ProfileActivation` is pages of the same file. **Sealed** — the case reference, "Let's confirm it's you", where the code goes, the never-ask line, the other channel only before sending, resend confirmed and the field refocused (`OneTimeCodeStep` `round`/`notice`/`incomplete`); a lapsed session returns here with a neutral note ("Send a new code to continue — nothing you entered was lost"), also from account setup and the portal handoff. **Steps** — Verify / Your details / Secure account drawn with the journey's markers and connector, a check icon on finished steps (no "✓" glyph), `aria-current`, completed said in words, one `stepCounter` template; Arabic labels wrap, never truncate. **Form** (file-tab edge) — legends as eyebrows over hairlines; the account email and the number's owner as DESIGN.md choice cards (8px, own radio, petrol edge + wash + halo when checked); the representative note, the email box, the consent rows and the passport note no longer tinted; labels name their control by `htmlFor` (the country list is no longer read as the combobox's name), help text stays beside an error, the pre-fill note sits under its field so paired fields line up; errors beside their fields in the page's words (backend field names, `profile.*` included, mapped to copy; never its English), focus to the first one after it renders (an empty phone with no number on file is a phone error); an agreement the page has no words for is named generically and cannot be accepted (a clear line says why). Country combobox: `aria-activedescendant`, option ids, closes on blur, 44px options. **Account setup** — hairline section, no placeholder address when none is known. **Ready** — the same frame with the case number and an icon (no petrol-filled badge), true steps only, the deposit as the next step (unchanged from T). The invalid page names the reason (case closed, onboarding stopped). Reviews (React/composition, web guidelines, RTL/i18n, Pro Max) + detector (0): 4 HIGH fixed (combobox label/announcement; errors with no field on screen; unseen agreement acceptable), MEDIUMs fixed (session lapse after activation, email radio error wiring, help hidden on error, stepper connector, reversed example number in Arabic, timed-out note shown as an error, "***" address); the rest in backlog "Area 1 — slice D". Verify: typecheck ok; eslint 0 errors on touched files (2 pre-existing warnings); vitest 68 files / 521; Playwright status-access, status-proposal, proposal-otp, proposal-responsive, activation-flow, arabic-proposal-decision, my-care, my-care-polish, my-care-new-case, home-quality, track-case and a11y (en + ar, new `activation-form` target) all green (activation-flow's placeholder consent type `COORDINATION` replaced with a real one). Screenshots `after/d-*` (en/ar, 390/1440; representative-submitted synthetic case). Approved by the owner (2026-10-15). Next: slice E.

**Slice E built (deposit step = the payment slip):** `PatientDepositPayment` inside My Care's current step is a slip in two numbered parts (journey markers) so the field follows the details it depends on — **1** pay ("Transfer to this account" or "Pay through an agent"), **2** "Enter your bank's reference" (or the agent's receipt). The amount due in Statement size; the estimate caveat as a hairline note with an icon (the critique's side stripe on a sand panel is gone; detector 0); the method as DESIGN.md choice cards with online payment kept as one disabled trailing line ("Coming soon"); the rejection as a hairline notice that shows the number sent and the reason. The slip: label above value on phones, side by side from 640px; the IBAN shown in groups of four (copied raw); **Copy** on account number, IBAN, SWIFT and the payment reference (D-2) — always drawn (no shift after hydration), name = visible word + what it copies, "Copied" announced in a live region, a fallback line where the browser cannot copy; the payment reference never breaks at its hyphen. The "where do I find it" help behind a one-tap disclosure; an empty field says what to enter, a malformed one the format; the reference rule, validation and payloads unchanged; switching method starts its errors fresh; a rejected agent payment keeps the agent's name. Copy: the step body and the deposit note say "by bank transfer or through an agent … reference or receipt number"; the checking step speaks of "your payment" and "transfer or agent receipt"; «مرجع الدفع» used for the payment reference everywhere. My Care: the in-step deposit facts lose their tinted panel, the estimate card's caveat is not repeated while the payment step is open, and the emergency notice takes the quiet variant (D-4, the last patient page that still had the banner). D-5 (only-account line) not added. New fixture scenarios `pay-deposit`, `pay-deposit-rejected`; a11y target `my-care-payment`. Reviews (React/composition, web guidelines, RTL/i18n, Pro Max) + detector (0): 4 HIGH fixed (phone rows and IBAN, page length, reference split at its hyphen, lint error + hydration shift), MEDIUMs fixed (label in name, repeat announcements, rejected number shown, empty-field message, hints read twice, agent wording in the checking step, caveat shown twice, Arabic noun); the rest in backlog "Area 1 — slice E". Verify: typecheck ok; eslint 0 errors on touched files; vitest 68 files / 525; Playwright status-access, status-proposal, proposal-otp, proposal-responsive, activation-flow, arabic-proposal-decision, my-care, my-care-polish, my-care-new-case, home-quality, track-case and a11y (en + ar, new `my-care-payment` target) 126 passed. Screenshots `after/e-*` (en/ar, 390/1440; dummy bank details). Approved by the owner (2026-10-15). Next: the area gate.

**Area 1 gate (2026-10-15):** `feat/review-p0` @ `668e24c` (D-1 milestones + `PublicProposalView.releasedAt`, patient-workspace minimisation, P1-10 session 1) merged into the area work (`7cb5fef`, clean; backend now identical to `feat/review-p0`, frontend = area 1). Dev stack rebuilt: backend from the main checkout (on `feat/review-p0` @ `668e24c`, clean) with the canonical tunnel command `--no-deps backend`; frontend from the area worktree under the same compose project (`-p rehletshifaa --env-file <main>/.env … --no-deps frontend`), so no other container was touched; no migration needed. **Against the live build:** Playwright status-access, status-proposal, proposal-otp, proposal-responsive, activation-flow, arabic-proposal-decision, my-care, my-care-polish, my-care-new-case and a11y (en + ar) in tunnel mode — 106 passed (24 first-run failures were `ERR_NAME_NOT_RESOLVED`/`ERR_ABORTED` on page loads; all passed on re-run). **Live walk:** a synthetic case RS-2026-000006 ("Gate Testpatient", +218 910000417, area1-gate@example.test) sent through Send my case — confirmation page stamped Received; its status link's sealed page named the channel ("your WhatsApp ***0417") and the never-ask line; after the owner's code, the coordinator-review page showed **Received, Oct 15** from the backend's `milestones.receivedAt` (12:21 UTC; the status link has no fallback to today). The owner stopped the walk there (the Consultant assignment had not reached dev): **In review and Estimate ready are recorded as covered by the specs**, not seen live. **Payment slip** live on RS-2026-000005 (owner signed in as `qa-a3-walk2@local.test`): EGP 3,000 due, backend bank details with the IBAN in groups of four, Copy on the four values (44px, named "Copy IBAN" …), part 2 after the details, caveat not repeated in the estimate card, quiet emergency notice, Arabic phone layout right; no reference sent. **Gate fix `582968b`:** the embedded browser denied `clipboard-write`, as in-app browsers (WhatsApp's) can; Copy now falls back to a selection copy (`execCommand`) and only then asks the patient to select the value — rebuilt and confirmed live ("Copied IBAN", "IBAN copied." announced, focus kept). Also: the status link's done-page unit test gets a 10s wait (flaked under the full parallel run). Verify after the gate: typecheck ok; vitest 68 files / 526. Left in dev: RS-2026-000006 in `INTAKE_REVIEW` (synthetic).

## UX area 1c — slice 1c-1: My Care + deposit visuals (2026-10-15, worktree `ux-1c-1-mycare-deposit-ba2523`, branch `claude/ux-1c-1-mycare-deposit-ba2523` from 1c-0 @ `499c5bd`)

Direction, data rule and decisions: `PLAN.md` "Area 1c" on `claude/festive-blackburn-b86c62` (`39ffb38`; not on this branch).
Enhances the accepted area 1 layouts; theme unchanged (V-6 petrol, V-7 beige). Every visual comes from a field the page already
receives: no date, no stamp or sheet; a sent transfer has no amount, so "being checked" never fills a bar.

**Built.**
- **Earlier pages of the file** (`portal/CaseFileStack.tsx`): each `milestones.*` moment (D-1) the journey has reached is a paper
  sheet tucked behind the current page, its stamp on one line (`CaseStamp variant="line"`), sheets further back narrower, caption
  "Your file · N pages" (`portalWork.plural.filePages`, Arabic dual/few forms), list named "Earlier in your file". The moment the
  current page is stamped with stays the page. A final quote's `releasedAt` no longer stands in for "Estimate ready" (it would have
  dated the estimate with the quote's release). Sheets rise from behind the page on arrival (transform only, off under reduced motion).
- **Journey dates** (`CaseJourney` optional `dates`, index-aligned `{ dateTime, text }`): the recorded date under each step the
  case has reached, as `<time>`. The usual-window sentence stays (V-2: no `expectedBy`).
- **Deposit** (`portal/DepositVisuals.tsx`): `PaymentTrack` — you pay and send · Finance checks · received, the journey's markers
  without numerals (the slip numbers its own parts): check when done, a petrol dot now, empty later; `PaymentReceipt` — the
  reference sent on a paper slip stamped **Sent** (`transfer.submittedAt`) or, once CONFIRMED, **Received** (`transfer.decidedAt`);
  `PaidBar` — received of total on a Deep Paper track, only for a part payment, `role="img"` with one sentence and the figures
  beside it as its visible twin (amounts in `<bdi dir="ltr">`). The payment step shows the track (always the patient's turn) and,
  after a part payment, the bar in place of the old "Total · Received" line; `DepositFacts` shows the track once money moves,
  the receipt for a sent or confirmed reference, the bar for a part payment, and reads its own copy (`useWorkCopy`).
- Copy (en + ar): `myCare.stamp.sent`, `myCare.file.earlier`, `plural.filePages`, `myCare.deposit.track/receipt/receivedOf/
  remaining/paidChart`; removed unused `myCare.payment.total/received`. Fixture: `deposit-paid` carries a CONFIRMED transfer
  (`decidedAt` 2026-09-13).

**Reviews** (Impeccable polish with a visual pass, web-interface-guidelines, react-best-practices, composition-patterns; design hook
0 findings): fixed — the track's numerals competed with the slip's numbered parts; an unlayered `margin: 0` on the track overrode
the caller's spacing; the track's last step repeated the "Deposit received" badge (now "Received"); `DepositFacts` was growing
copy props; one mapping for which moment stamps which step (`MOMENTS`/`STAMPED_BY`); sheets limited to steps the journey reached
so the file and the journey never disagree.

**Verify.** typecheck ok; eslint 0 on touched files; vitest 68 files / 530 (4 new: three in MyCare, one in PatientDepositPayment);
Playwright my-care, my-care-polish, my-care-new-case, workspace-case-switch, portal-reliability, new `my-care-visuals` and
a11y (en + ar) 103/103 (one existing spec now counts the page's own stamp, since sheets and receipts carry theirs).
Screenshots `screenshots/1c-1/` — five scenarios (consultant-review, proposal-ready, pay-deposit-rejected, deposit-checking,
deposit-paid) × en/ar × 390/1440, synthetic fixtures.

**Gate:** owner instruction 2026-10-15 — continue each next slice in a new session without asking; screenshots above are for the
owner's later review. Follow-ups: the payment reference wraps at its hyphens beside its hint from 640px (pre-existing, slice E;
same in `area-1/after/e-payment-bank-en-1440.png`). **Next:** slice 1c-2 (estimate range bar + legend shared by `ProposalSign`
and My Care's estimate card; V-4/V-5 still open).

## UX area 1c — slice 1c-2: the estimate range bar (2026-10-15, worktree `ux-1c-2-range-bar-b09feb`, branch `claude/ux-1c-2-range-bar-b09feb` from 1c-1 @ `66505a6`)

Direction and data rule: `PLAN.md` "Area 1c" (on `claude/festive-blackburn-b86c62` @ `39ffb38`). Enhances the accepted area 1 layouts;
theme unchanged. No range, no bracket; category split only from two categories; no V-5 spread sentence (still open).

**Built.**
- **`EstimateRangeBar`** (`components/EstimateRangeBar.tsx`, one shared component + its legend): one scale from zero to the top of
  the range on a Deep Paper track — the expected total filled and split by `items[].category` (petrol 700 / 400 / 200, 2px white
  gaps), a Petrol Ink marker at the expected figure, the range bracketed above (only when `totalMin < totalMax`), the coordination
  deposit bracketed below in coral as a mark (only where its amount is known). The bar is `role="img"` with one sentence (parts joined
  with `Intl.ListFormat`); the legend (`<dl>`) is its readable twin: categories, Expected (or the total's name), Estimated range,
  Coordination deposit with its note; every amount in `<bdi dir="ltr">`, tabular. Arrival: the fill scales from the start edge
  (mirrored in RTL via `transform-origin`, PaidBar's `pay-fill`), off under reduced motion; marks are present from the start. A
  container query drops the range mark's figures below 17.5rem so a long EGP range never widens a 320px page (the legend keeps them).
- **Proposal link** (`ProposalSign`): the bar + legend replace the old total / expected lines under the services list, deposit
  bracketed from `depositDueDisplay` (estimates only). Service groups now show the category in words (they showed the raw code).
- **My Care** (`MyCare` estimate card): the bar under the expected figure, range from the workspace totals (1c-0); the headline
  figure is `totalExpected` when sent. **No deposit bracket here:** area 1's rule (spec "the deposit is stated once") keeps the deposit
  in its own facts; the first build bracketed it and the spec caught the repetition.
- Copy (en + ar) `portalWork.myCare.estimate.bar` (passed to the link as `copy.estimateBar` from the server page): expected, total,
  finalTotal (a final quote's total is its price, never "estimated"), range, to, deposit, depositNote, marks, `categories.MEDICAL/
  PLATFORM_FEE`, chart sentences.

**Finding (V-4).** Since V96 `proposal_items.category` is constrained to `MEDICAL | PLATFORM_FEE` (no staff free text). Totals
(`ProposalQueryService.displayTotals`) count every non-optional priced line, the fee line included, so the split on real data is
care vs. the coordination and guarantee fee. The bar words the two schema codes and shows any other value as entered; it splits at
most three categories and never a line without one. V-4 (fixed bilingual list vs free text) is still the owner's, but its "free text
today" premise is outdated. Merge note: P1-10 s2 (`10f5389`, on `feat/review-p0` lineage) separates the fee line in `ProposalSign`
(`isPlatformFee`, `price.feeLabel`); when the lines merge, keep its fee row and drop this slice's group heading for the fee.

**Reviews** (Impeccable polish with a visual pass on the screenshots, web-interface-guidelines, react-best-practices,
composition-patterns; design hook 0 findings): fixed — the deposit repeated on My Care (above); the range mark could overflow a
320px phone with long EGP figures (container query + spec); the final quote's total read "Estimated total" (`kind="quote"` →
"Final package price"); the services list printed `MEDICAL` / `PLATFORM_FEE`; a de-duplicated fee heading made the fee read as a
care line (reverted: the heading stays). Component is pure (no hooks), copy injected, one explicit `kind` variant instead of a label prop.

**Verify.** typecheck ok; eslint 0 on touched files; vitest 69 files / 538 (7 new in `EstimateRangeBar.test.tsx`, 1 new in MyCare,
two MyCare assertions scoped to the bar's arrival); Playwright estimate-range-bar (new, 7), status-proposal, proposal-otp,
proposal-responsive, arabic-proposal-decision, my-care, my-care-polish, my-care-visuals and a11y (en + ar) 117/117, then the
proposal-side set again after the last fix 60/60. Tracked screenshots the specs overwrite were restored.
Screenshots `screenshots/1c-2/` — proposal link (services + bar), My Care estimate card (proposal ready) and with the deposit paid,
each en/ar × 390/1440, synthetic fixtures (fee line, range, deposit).

**Gate:** owner instruction 2026-10-15 — continue without asking; shots above for the owner's later review. **Area 1c is complete**
(1c-0, 1c-1, 1c-2). Open: V-4 (category labels), V-5 (spread sentence). Follow-ups: the fee-line merge note above; the payment
reference wrap (1c-1). **Next:** area 2 — coordinator workspace (PLAN.md recommended sequence 1 → 1c → 2).

## UX area 2 — coordinator workspace: critique, plan, slice 2-0 (2026-10-15, worktree `focused-jackson-a4d85d`, branch `claude/focused-jackson-a4d85d` fast-forwarded to 1c-2 @ `cd7e6cb`)

**Critique** (dual-agent: design review + `impeccable detect` and mechanical scan; synthetic `e2e/coordinator-fixture.ts`, 24 before
shots in `screenshots/area-2/before/`): **21/40** (`.impeccable/critique/2026-10-15T19-06-05Z__frontend-src-components-portal-staffcaseview-tsx.md`).
On-palette, off-concept: the staff side has none of the file's signatures (tab edge, stamps, journey markers), and is card-in-card.
P1 no working loop (no list keyboard model, no next item, focus not returned to the row); P1 no single "now" line and nothing
mirrors the patient's page (waiting-on said three times, once in the patient's voice); P1 messaging split (thread `<select>`, no
"awaiting your reply" or reply-window state in conversations, Arabic bidi garbled in the list); P2 heavy chrome (role as h1,
repeated subtitle and count line, Out of office on My work, 40px header buttons with a sub-3:1 edge); P2 Arabic parity (~155 inline
copy ternaries, English fallbacks). Detector 0 (regex-only on .tsx; the overlay needs the mocked OIDC session); scan: 70 off-ladder
sizes, ~12 tinted notices, 0 physical-direction classes.

**Plan** `plans/coordinator-workspace.md` (no owner gate, standing instruction; assumptions O-1 patient step for coordinators only,
O-2 shortcuts on with an off switch): the file cover + one-next-action strip (your step · waiting on · the patient's page), a sticky
strip with Next in My work, a keyboard loop (roving lists, return to row, physical-key shortcuts, `?` help, off switch), messages
that show who is owed a reply, quieter chrome. Slices 2-0 backend → 2-1 cover + strip → 2-2 keyboard → 2-3 messages +
conversations → 2-4 chrome + convergence; reply templates stay backend data (P2-22).

**Slice 2-0 built (backend, small):** `CaseActionsView.patientStep` — for a coordinator viewer, the step the patient's own page
shows now, resolved by the patient's rule (`patientCurrentAction`) with its usual window, reduced to code, kind, work type, due,
overdue, readiness step and exit word (never the information request's title or message); null for every other staff role and
for patients (8-argument constructor kept). Frontend: typed as `CaseActions.patientStep`; the area fixture carries it. No UI change
in this slice (rendered in 2-1). Reviews: data minimisation checked by hand (free text dropped, coordinators only, same
authorization as the workspace); the UI reviews do not apply to a typing-only change.

**Verify.** `CoordinatorCaseActionsTest` 36/36 (new: `theCoordinatorSeesThePatientsCurrentStepAndNoOtherStaffDoes`); full backend
suite: 859 tests, 0 failures, 3 skipped (113 classes); frontend typecheck ok; eslint 0 on touched files; vitest 69 files / 538 (one jsdom test flaked once while
Maven ran in parallel, green on rerun).

**Next:** slice 2-1 — the file cover and the one-next-action strip (`StaffCaseView`, `CurrentAction`, `JourneySnapshot`, `Portal`).

## UX area 2 — slice 2-1: the file cover and the one-next-action strip (2026-10-15, worktree `youthful-gagarin-e257b1`, branch `claude/youthful-gagarin-e257b1` fast-forwarded to 2-0 @ `baab2fb`)

**Built (enhances the accepted case page; Petrol & Paper unchanged, no new token).**
- **The cover of the file** (`StaffCaseView.tsx`): the case header and the current-action panel are one `card file-tab` (the
  patient pages' 2px petrol tab edge): identity on top (case number, care area, country, language — screen-reader separators
  between them — name at 18px, status, urgency, coordinator, Consultant), then the strip under a hairline. Header buttons are
  `btn-secondary` (44px, Field Edge). The back control names the view the case was opened from ("Back to My work", from
  Portal's resolved staff view); the breadcrumb's second case number is gone.
- **The strip** (`CurrentAction.tsx`, no card of its own; a `facts` slot): *Your step* — the backend's current action as
  today, title now an h3 at 20px, the strongest line — and beside it (under it on phones) *Waiting on*, said once on the page,
  with the backend's waiting reason only when it adds why (`DEFAULT_*` and `PATIENT_JOURNEY_ACTION` restate and are left out),
  and *The patient's page* (coordinators only: `actions.patientStep` from 2-0), worded by `portalWork.myCare.steps` through the
  new shared `patient-step.ts` (My Care's own rule, moved out of `MyCare.tsx` so the staff chunk does not load My Care),
  reading `patientProposal` state and document type exactly as My Care does (REVIEW_PROPOSAL → REVIEW_FINAL_QUOTE), with
  "Usually within {n working days}" on WAIT steps or "Due / Overdue since {date}" otherwise. No field, no line. A WAIT or
  NONE step is labelled "This case now", never "Your step".
- **Duplicates removed:** the brief's patient-voice waiting line, the rail's waiting chip, the second case number; the case
  brief also drops care area, country, language, coordinator and Consultant (now on the cover; an unclassified care area
  stays in the brief, the one fact the cover cannot show).
- **The sticky line** (`CaseLine`): once the whole cover has scrolled under the site header (IntersectionObserver, header
  measured by ResizeObserver), a slim white line under the header keeps case number, name and "Your step: …", a quiet
  "Go to your step" (only on a step that is the viewer's; moves focus to the primary, else the form's first field, else the
  step title, with an instant centred scroll — the page's smooth scrolling was cut short as the line left) and, from 640px,
  "Next in My work". While shown it sets `scroll-padding-top` from its measured height (ResizeObserver; WCAG 2.4.11) and
  publishes `--case-line-bottom` / `--case-header-bottom` for the sticky rail; if it leaves holding the focus, the focus goes
  to the case heading.
- **Next in My work**: the first item after this case's items in My work's own (backend) order, wrapping round, from the
  tasks Portal already loads; a quiet `link-cta` in the case nav and in the line (never a second filled action). Opening
  a case from a case now starts at its top with its heading focused (`Portal.openCase`).
- **Also open on this case**: the case's other open My work items (excluding the current action's `workItemId`), a
  hairline list with "Due / Overdue since" dates; `workItemText` moved to `lib/portal-labels.ts` (My work and the cover).
- **Journey rail** (`JourneySnapshot.tsx`): DESIGN.md journey markers (`care-journey journey-rail`: numbered 32px, reached
  filled Deep Petrol, current in the coral ring, a petrol connector; always vertical), "View full journey" as a text action.
- **Copy:** everything touched is in `portalWork.caseCover` (en + ar; Arabic per the RTL review: "مهام أخرى مفتوحة في هذه
  الحالة", "نقل المسؤولية", "ما تعرضه صفحة المريض", "مرحلة مكتملة / المرحلة الحالية", "مستحق في / متأخر منذ {date}");
  unused `currentAction.label` removed. Type on the ladder and no tinted panels in what was touched (the inline patient
  response is a hairline block now; the raw rgba shadow is gone).

**Reviews** (Impeccable + Vercel skills loaded before code; four read-only reviews on the diff; all HIGH/MEDIUM fixed):
React/composition (patient wording from `patientProposal` not the staff proposal; line height re-measured by
ResizeObserver; waiting reason kept where it adds why; header observed by ResizeObserver; focus priority; `workItemText` out
of the MyWork component module; wrap-round next; phase key/length test), web guidelines (sr separators, h3 step under the h2
cover, visible focus ring on the programmatically focused step title, neutral label on waiting steps, focus rescue when the
line leaves, phone layout of the line), RTL/i18n (Arabic wording above, date templates, locale separator), Pro Max (focus and
scroll after Next, neutral label and no "Go to your step" on waiting steps, phone line, aside offset from the measured
header, hierarchy: step 20px over name 18px, Waiting on in regular ink, cover facts de-duplicated from the brief). Visual
pass on the EN/AR 390/1440 shots. Impeccable detector: 0 findings.

**Verify.** `pnpm typecheck` ok; eslint 0 on touched files; vitest 69 files / 540 tests; Playwright (built on :3113):
staff-home, portal-ux, portal-p2-pass-3, portal-reliability, care-coordination, workspace-case-switch,
ux8-commercial-journeys, a11y (en + ar) and the new `e2e/case-cover.spec.ts` (cover, strip, once-only rules, rail markers,
44px Field Edge buttons, sticky line, focus not obscured, Next opens the next case at its top) — 102/102. Specs adjusted:
back control by its new name, "Your step" label, the Arabic waiting line now on the strip. The coordinator fixture's current
action now carries its `workItemId` (`w2`), as the backend's does. Overwritten pass-2/pass-3 shots restored.

**Screenshots:** `screenshots/area-2/2-1/` — `case-{en,ar}-{390,1440}` (full page) and `case-line-{en,ar}-{390,1440}`
(scrolled, the sticky line).

**Follow-ups (not in 2-1):** the dim "handoff to Consultant" banner and Case team still repeat the Consultant (2-4); the
case brief, Case team, FullJourneyDialog (`PHASES`/`STAGES`/`ROLES` en/ar tables) and the rest of `StaffCaseView` keep inline
copy (2-4); "Also open" has no cap (rare; cap at 3 with "+n in My work" if it grows); `Task` vs `WorkItem` typing (two
casts in Portal/StaffQueue); Back/Next are buttons, not links (no open-in-new-tab) — consider in 2-2; portal buttons are
44px on phones where DESIGN.md says 46px (portal convention, unchanged).

**Next:** slice 2-2 — keyboard flow (roving lists in My work and the queue, return to the row, shortcut layer with `?` help
and an off switch, `n` = Next in My work on a case).

## UX area 2 — slice 2-2: the keyboard flow (2026-10-16, worktree `serene-poincare-31f0bc`, branch `claude/serene-poincare-31f0bc` fast-forwarded to 2-1 @ `680b2ed`)

**Built (enhances the accepted views; Petrol & Paper unchanged, no new token).**
- **Roving-focus lists** (`portal/StaffShortcuts.tsx` `useRovingList`, used by `MyWork.tsx` and `CaseQueue.tsx`): each list is one
  tab stop — the current row's Open; ↑/↓ and Home/End move between rows (vertical, so nothing to mirror in RTL), Enter opens
  (the native button). In the queue the row's other controls (select, copy, take ownership, accept, transfer) join the tab
  order only while the focus is in the list, so Tab enters on Open and Shift+Tab reaches the rest of that row. The current row
  is kept by id; when it leaves the list (work done) the row that took its place is current. A petrol-50 wash marks the row
  whose Open has keyboard focus (`has-[…:focus-visible]`). A screen-reader hint (`aria-describedby`) says how the list moves.
  The queue's Open uses `aria-disabled` while the portal is busy (styled as the Inert button in `globals.css`), so the roving
  target never drops the focus.
- **Back returns to the row** (`Portal.tsx`): opening a case records the row it was opened from; Back (and browser Back)
  focuses the row of the case being closed if it is in the visible list (after `n` that is a later row), else the row first
  opened, else the list's current row — keeping the scroll position. A case opened from elsewhere (URL, notification) still
  hands the focus to the view's heading; switching views from a case does too.
- **Shortcuts** (`StaffShortcuts`, rendered once by Portal for staff; `useStaffShortcut` for a component's own key): `?` help;
  `j`/`k` next/previous row (from anywhere on a list view); `g` then `w`/`c`/`t`/`m` for My work / My cases / Team queue /
  Conversations (only the views the person has); `/` search (My work and Conversations have none, so `/` goes to My cases and
  its search); `n` on a case = 2-1's `nextItem`/`openNext` (same leave guard). Bound by `event.code`, so an Arabic layout works;
  ignored in text fields and non-modal popups, with Ctrl/Alt/Meta (Shift only for `?`), while any modal `<dialog>` is open, and
  for the key after `g` (consumed). **On by default (O-2)**, with an off switch in the help dialog (WCAG 2.1.4), stored per
  browser in localStorage (`portal-shortcuts`, try/catch, synced across tabs); arrow keys and Enter are widget keys and stay on.
- **Help dialog**: a native modal `<dialog>` (the CaseDrawer header pattern; focus returns to the opener), groups *Anywhere*
  (`?`, `g` + view), *In a list* (arrows · `j` `k`, Home/End, Enter, Shift+Tab, `/`), *On a case* (`n`); flat Latin keycaps
  (`<kbd dir="ltr" lang="en">`, page font, hairline), arrows named for screen readers; the off switch with its note. A quiet
  "Keyboard shortcuts ?" text button at the foot of the staff portal opens it (and reopens it when shortcuts are off).
- **Back/Next stay buttons (2-1 follow-up, decided):** both are in-place transitions with the leave-with-draft guard, focus and
  scroll rules (and now `n`); as links they would invite a second tab of the same workspace, whose drafts the guard cannot
  see. Every case keeps its shareable URL (`?case=`) for anyone who needs a new tab.
- **Copy:** `portalWork.shortcuts` in en + ar (Arabic per the RTL review: "اختصارات بمفتاح واحد", "فتح الحالة في الصف المحدد",
  verbal nouns for the moves, "في صفحة الحالة", an intro that tells an Arabic-layout user to press the key bearing the Latin letter).

**Reviews** (Impeccable + Vercel skills loaded before code; four read-only reviews; HIGH/MEDIUM fixed): React/composition (no
HIGH; stale in-list state when focus leaves without a blur → document focusin/focusout; disabled Open as roving target →
`aria-disabled`; Back after `n` → row of the closing case; one storage listener; listener-order test), web guidelines
(return by row id, list hint for screen readers, Shift+Tab row in help, switch labelled once, `aria-keyshortcuts` on the
trigger and the queue search, off note), RTL/i18n (wording above, `lang` on keycaps), Pro Max (regrouped into three groups by
where keys work, merged ↑↓/j k row, one-sentence intro, label-micro group headings, flat keycaps, wash meets the hairlines,
no extra hairline at the foot; its HIGH — rows under the header — is already met by the root `scroll-padding-top: 6.5rem`).
Visual pass on the EN/AR 390/1440 shots. Impeccable detector: 0 findings (after the keycap's 2px edge went).

**Verify.** `pnpm typecheck` ok; eslint 0 on touched files; vitest 70 files / 548 (new `StaffShortcuts.test.tsx`: one tab stop,
arrows/Home/End, physical keys with an Arabic `key`, fields/modifiers/modal ignored, `g` prefix, help + off switch kept,
listener order both ways, list hint); Playwright on :3114 (staff-keyboard [new], staff-home, portal-ux, portal-p2-pass-3,
portal-reliability, care-coordination, workspace-case-switch, ux8-commercial-journeys, case-cover, a11y en + ar): 106/109 in
the full run, the 3 failures (a `newPage` timeout and two case-heading focus checks under load) green on rerun. Spec changed:
portal-p2-pass-3 "Back hands the focus to the heading" now expects the row (and a URL-opened case keeps the heading).
Overwritten pass-2/pass-3 and 2-1 shots restored.

**Screenshots:** `screenshots/area-2/2-2/` — `help-{en,ar}-{390,1440}`, `my-work-row-{en,ar}-{390,1440}` (keyboard-focused row),
`my-cases-row-{en,ar}-1440`.

**Follow-ups (not in 2-2):** opening a case focuses `#case-heading` in one rAF, which misses when the lazy case chunk arrives
late under load (seen in e2e, pre-existing from 2-1; focus once the case view mounts — 2-4, Portal); claim/accept disable the
row's own buttons and drop the focus to the body (return it to the row); a polite cue while `g` waits for its second key;
`aria-keyshortcuts="n"` on Next in My work (StaffCaseView, 2-4); the queue re-renders whole on each arrow (split the rows into
their own component if the list grows); `useEffectEvent` once `@types/react` ≥ 19.2; Conversations becomes a roving list in 2-3;
the hover and focus washes in the queue are close (hover could move to paper); the pre-existing inline finance link copy in
Portal (2-4).

**Next:** slice 2-3 — messages + conversations (thread tabs with unread counts, Consultant naming, reply from the strip,
conversation list states, underline scope tabs, focus/live region, bidi; both components' copy to messages).

## UX area 2 — slice 2-3: messages that show who is owed a reply (2026-10-16, worktree `angry-murdock-1ed3d9`, branch `claude/angry-murdock-1ed3d9` fast-forwarded to 2-2 @ `05015e6`)

**Built (enhances the accepted views; Petrol & Paper unchanged, no new token).**
- **Case messages** (`CaseMessages.tsx`): `MessageThreads` is the frameless thread view the staff drawer renders (the drawer names it;
  the card-in-card and the repeated "Secure messages" title are gone); `CaseMessages` keeps the card and title for the patient's page.
  A coordinator reads the threads as underline tabs — Patient · Consultant · Operations · Finance ("Doctor" is gone; the internal ones
  carry a lock and a screen-reader "(internal)") — each with its unread count as a quiet bold petrol number (`UnreadTally`, also on the
  cover's Messages button; the patient side keeps its `UnreadCount`). The drawer opens on the thread a reply is owed in (the first with
  unread messages), the tabs keep one row and scroll sideways on a phone with the selected one in view, arrows mirror in Arabic. Messages
  are hairline cards — ours on paper, theirs on white (no tinted bubbles); an unread inbound one has a petrol dot; Mark read keeps its
  44px target without the dead band, and the focus goes to the next Mark read (or the thread) when its button leaves. The composer's
  hint ("The patient sees this message." / "Internal: the patient does not see this conversation.") is its description; a send is
  confirmed beside it in a polite status ("Message sent.", the drawer's generic "Saved" cleared) and the focus stays in it. The cover
  note is a hairline note. One date form: "14 Oct, 2:00 PM" (`messageTime`).
- **Reply from the strip** (`StaffCaseView.tsx`): when the backend's current action is the patient's reply (`workType`
  `REVIEW_PATIENT_RESPONSE`, never the stage) and `patientReply.canReply` says this viewer answers the patient, the strip carries a
  quiet "Reply to the patient" (`btn-secondary` beside the step's one filled action); it opens the drawer on the patient's thread with
  the composer focused (overlay `"reply"`; Escape returns to the button).
- **Conversations** (`ConversationsView.tsx`): rows say **"Awaiting your reply"** (Mine; "Awaiting a reply" in the queue and team)
  with a petrol dot, and **"Reply window closes {time}"** / "Reply window closed", then owner and last message on their own lines. The
  scope switch is the case page's underline tablist (selection follows the arrows, mirrored in Arabic); the list is a 2-2 roving list
  (`useRovingList`, `data-row` = conversation id: one tab stop, arrows, Home/End, `j`/`k`, Enter); picking a conversation moves the
  focus to the thread heading (16px) once it has loaded, the selected row has the file-tab edge (`border-s-2` petrol), a send or
  follow-up is confirmed beside the composer ("Reply sent." / "Follow-up sent.") with the focus kept there; Take focuses the thread,
  Close returns to the list's current row. Only the latest list/detail request may land (a late answer for an earlier pick never shows
  under another row). Each run is isolated (`<bdi>` for names and times, `dir="ltr"` phone hints, U+2068/2069 in templates, coordinator
  names in the hand-over select). A loading row; "Open file" says it opens a new tab; Hand over / Close have a disclosure chevron.
- **Backend (small):** `ConversationSummary.awaitingReply` — the person wrote last and no one on the team has answered since
  (`IntakeConversation.awaitingReply()`: last inbound after last staff outbound; the out-of-hours auto-reply does not count). The list
  could not say it from `windowOpen`/`lastInboundAt` alone (the window stays open after a reply).
- **Copy:** both components' inline copy (and the attachment notes) moved to `portalWork.caseMessages` and `portalWork.conversations`
  in en + ar (Arabic per the RTL review: "جهة الاتصال", "تنتهي مهلة الرد في {time}", "آخر رسالة في {time}", "تولّي هذه المحادثة",
  "تعليم كمقروءة", "محادثة داخلية: لا يراها المريض.", "سيرى المريض هذه الرسالة.", the intro and cover notes reworded). No new plurals.
  `.case-drawer` gets `scroll-padding-block-start` so a control reached by keyboard lands below the pinned drawer header (2.4.11).

**Reviews** (Impeccable + Vercel skills loaded before code; four read-only reviews; no HIGH; MEDIUM fixed): React/composition (stale
detail response under another row → request counters + render only the picked thread; re-picking kept the draft; formatters memoised;
refs/`useId` for ids), web guidelines (focus after Mark read/send/claim/close, drawer scroll padding, hint described, stale list
response, tabpanel focusable when empty, loading row, text-action hover, textarea names, isolated option names), RTL/i18n (the last
inline ternary → `markReadContext`; Arabic wording above), Pro Max (tabs in one scrolling row; unread as a quiet number, not a second
filled petrol mark; selected row by the file-tab edge, not a wash; one date format; unread dot; Mark read band; chevrons; new-tab note;
16px thread heading). Visual pass on the EN/AR 390/1440 shots. Impeccable detector: 0 findings.

**Verify.** `IntakeConversationIntegrationTest` 9/9 (new: `theListSaysWhoIsOwedAReplyUntilStaffAnswer`); `pnpm typecheck` ok; eslint 0
on touched files; vitest 70 files / 555 (CaseMessages + ConversationsView tests extended: tabs, Consultant naming, unread counts, open
where owed, arrows mirrored, reply focus + confirmation, list cues, focus to thread, roving list, scope tabs, Arabic bidi); Playwright on
:3115 (new `e2e/messages-conversations.spec.ts` with axe on the drawer and the view, staff-home, portal-ux, portal-p2-pass-3,
portal-reliability, care-coordination, workspace-case-switch, ux8-commercial-journeys, case-cover, staff-keyboard, a11y en + ar):
116/117 in the full run (the one failure a `newPage` timeout under load before the test body, the 2-2 flake) and 8/8 for the new spec on rerun; earlier full run 117/117. Fixture: `setupCoordinatorDay(page, role, { currentAction })`, `awaitingReply` on the conversations, an Arabic-named queued
conversation. Overwritten pass-2/pass-3, 2-1 and 2-2 shots restored.

**Screenshots:** `screenshots/area-2/2-3/` — `case-messages-{en,ar}-{390,1440}` (drawer), `strip-reply-{en,ar}-{390,1440}` (the cover
with the reply action), `conversations-{en,ar}-{390,1440}`.

**Follow-ups (not in 2-3):** on phones the strip shows Waiting on / the patient's page between the step and the reply under review
(2-1's order in `CurrentAction`; consider facts after the work when a response shows); `SecondaryAction` has no `aria-haspopup`
(the strip's reply opens a dialog); the patient side still uses the filled `UnreadCount` disc (patient screens, not this area); per
message Mark read stays (no bulk endpoint); conversation ↔ case link and reply templates (P2-22) remain backend work; the header view
pills still use `aria-pressed` (2-4, one tab style).

**Next:** slice 2-4 — chrome + convergence (place as heading, role subtitle out, count line only on My work and in ink, Out of office
as a disclosure, one tab style, ladder sizes and hairline notices in the remaining files, remaining inline staff copy), then the area's
closing pass (re-critique ≥ 28/40, `screenshots/area-2/after/`, STATUS).

## UX area 2 — slice 2-4: quieter chrome and convergence; area 2 closed (2026-10-16, worktree `angry-haibt-7f91be`, branch `claude/angry-haibt-7f91be` fast-forwarded to 2-3 @ `c5bc83d`)

**Built (enhances the accepted views; Petrol & Paper unchanged, no new token).**
- **The page is named by its place** (`Portal.tsx` `PortalFrame`): the h1 `#portal-title` is the staff view's name (My work, My cases,
  Team queue, Conversations), not the role; on a case it is visually hidden and reads "Case RS-…" (the cover names the patient). The
  views (`MyWork`, `CaseQueue`, `ConversationsView`) no longer repeat the name as their own h2 and are labelled by the h1
  (`labelledBy`); row titles, the queue's empty state and the conversation thread heading are h2 under it. `focusViewHeading` and a
  view picked from a case move the focus to the h1 (visible ring, `scroll-mt-28`). The page is paper throughout (the staff side's
  mist-to-white gradient is gone).
- **Role line and count line on My work only.** Every other view starts with its place and its one-line description. The count line
  is ink; only overdue work of the viewer's own (`/work/mine`) is in the alert ink. A count opens the list it counts and its filter
  travels as the first chip there ("Showing: Overdue", removable; "Clear all" clears it in one change), with the focus on the new
  view's heading (the pressed count goes with the line). My work's "3 work items" stays for screen readers only (the nav carries it).
- **Out of office is one line** (`ReplyCoverPanel.tsx`): a disclosure under My work that already says where things stand ("No cover
  set" / "Omar Ali answers your patients · now, until …" / "+ n more"); opening it shows the covers, End cover and the form. Copy in
  `portalWork.replyCover` (plural `moreCovers`), names isolated.
- **One tab style.** The header navigation stays a `nav` with `aria-current="page"` (APG: places with their own URL are navigation,
  not tabs — the notes' "`aria-pressed` pills" were already `aria-current`; the change is the convention): the current place is
  underlined in petrol like the case tabs and Conversations' scopes (14px at md, 15px from lg so it holds one line at 768). On phones
  the same links sit above the h1 in one scrolling row. The case tabs scroll in one row on phones (2-3's thread-tab pattern).
- **Lists converge.** The queue is a hairline list like My work (no boxed white list); one filled "Take ownership" per list (the first
  claimable case; the rest quiet); Open is My work's quiet text action in every list; on phones the row's checkbox sits beside it.
  Conversations sits on paper like the other views (no card around the whole view); "Choose a conversation" only beside the list.
- **Ladder and hairlines.** Sizes on the 13/14/15/16/17/18/20px ladder in every file of the area (the queue's 0.82/0.85/0.8rem, the
  case page's, the journey dialog's); notices are hairlines with an icon (portal notice/alerts, the Consultant's "review sent" line,
  missing-service and no-rate alerts, the ownership hint, the queue's selection bar); the clinical review, recommendation, proposal,
  deposit, delivery, release checklist and final-quote blocks are hairline sections inside their panel (no card-in-card, no tints);
  deposit, delivery and release states are `StatusBadge`s with their tone icons; glyphs (✓ ×) are drawn icons. The portal's notice is
  one always-present status region.
- **Copy:** the remaining inline staff copy of `StaffCaseView` and `Portal` (≈110 ternaries and the per-component en/ar tables) moved
  to `portalWork.caseView`, `portalWork.portal`, `portalWork.queue.kpi*`, plural `stageChanges`, en + ar (Arabic per the RTL review:
  "بانتظار قبوله حتى {date}", "مهلة القبول حتى {date}", "الحالات" for the chip, "تبقى إجراءات العرض مقفلة إلى أن تكتمل توصية
  الاستشاري.", "جارٍ إعادة المحاولة", clearer operations/finance role lines; the rate equation isolated with U+2066/2069 and formatted
  by locale). "consultant/doctor" → Consultant in the moved strings.
- **2-3 / 2-1 follow-ups:** `SecondaryAction.opensDialog` → `aria-haspopup="dialog"` on the strip's "Reply to the patient"; on phones,
  with a patient response under review, the strip's facts come after the work (DOM order too); `aria-keyshortcuts="n"` on Next in My
  work while shortcuts are on; `Portal.openCase` focuses `#case-heading` from an effect once the lazily loaded case view has mounted
  (a ref + request tick, dropped when another case wins) instead of one animation frame; the dim "handoff to Consultant" banner is
  gone (the cover names the Consultant, the strip says the case waits on them; why the proposal's actions are locked is said beside
  the lock), and Case team lists only people the cover does not (a pending offer's deadline moved to the cover's Consultant fact).

**Reviews** (Impeccable + Vercel skills loaded before code; four read-only reviews; all HIGH/MEDIUM fixed): React/composition (empty
state "Clear all" made one change; KPI chip folded into the chips; case-focus effect on the open case id, stale request dropped;
channel fallback kept), web guidelines (HIGH: focus lost when a count switches the view → h1; visible focus on the case heading;
`scroll-mt` on the h1; heading outline h1 → h2; persistent status region; Back with no row scrolls to the heading), RTL/i18n (name and
case-number isolation, the offer/proposal wording, plural for "+n more", locale punctuation, rate/date formatting, role lines), Pro Max
(HIGH: phone nav above the h1 in one row; one description slot under the h1; Conversations off its card; one filled claim per list;
one Open style; phone queue rows; one rule under Out of office; sentence-case field labels; capitalised "Waiting on" value). Visual
pass on the EN/AR 390/1440 shots. Impeccable detector: 0 findings.

**Verify.** `pnpm typecheck` ok; eslint 0 on touched files; vitest 71 files / 559 (new `StaffChrome.test.tsx`: count-line ink vs
alert, KPI chip, facts order, `aria-haspopup`; `ReplyCoverPanel.test.tsx` for the one-line disclosure; RoleActions/FinalAssessment
tests render inside the work-copy provider); Playwright on :3116 (new `e2e/staff-chrome.spec.ts`: page named by its view, role and
count lines on My work only, own-overdue alert ink, closed Out of office line, underline nav with `aria-current`, the KPI chip, the
case heading focused after the case view mounts with chunks delayed, axe per view, the closing shots; plus staff-home, portal-ux,
portal-p2-pass-3, portal-reliability, care-coordination, workspace-case-switch, ux8-commercial-journeys, case-cover, staff-keyboard,
messages-conversations, a11y en + ar): 124/125 in the full run, the one failure the known `newPage` timeout before the test body
(messages-conversations ar), 8/8 on rerun. Specs changed: the view headings are level 1 (`staff-home`, `portal-p2-pass-3`), the view
heading locator is `#portal-title` (`portal-p2-pass-3`, `staff-keyboard`). Overwritten pass-2/pass-3, 2-1, 2-2 and 2-3 shots restored.

**Closing pass — re-critique: 28/40** (dual-agent; `.impeccable/critique/2026-10-16T05-53-19Z__frontend-src-components-portal-staffcaseview-tsx.md`;
trend 21 → 28, target ≥ 28 met). Up: flexibility 1 → 3 (keyboard loop), control, recognition, aesthetics, real-world match and help
2 → 3; still 2: consistency (two list grammars) and error recovery (errors in the page banner, not at the control). Mechanical scan
against the 2026-10-15 baseline: off-ladder sizes 70 → 0, tinted notices ~12 → 0, inline copy ternaries ~155 → 6 (3 punctuation-only;
real copy left only in `JourneySnapshot`), raw colours 1 → 0, glyph icons 1 → 0, physical-direction classes 0. Detector 0 (regex-only;
the browser overlay needs the mocked OIDC session and was skipped).

**Screenshots:** `screenshots/area-2/after/` — `my-work`, `my-cases`, `team-queue`, `conversations`, `case` (full page) and
`case-messages` (drawer) × en/ar × 390/1440, from `e2e/staff-chrome.spec.ts` on the synthetic coordinator fixture.

**Area 2 follow-ups (backlog, not blocking):** one shared row grammar for My work and the queues (P1); claiming from a list row vs
"review before claiming" — consider Open as the row action and the claim on the strip (P1, revisit GATE P2-2's accepted queue); the
WhatsApp channel and reply window under the case composer (P1, needs the window on `patientReply`); Arabic work-copy codes for every
work type and `lang="en"` on fallbacks, `JourneySnapshot`'s `{en, ar}` label maps to messages (P2); urgency said four times on a My
work row (P2); keys for messages/reply/send/claim; a count-line pick does not update `?view=` (pre-existing); errors at the control;
"awaiting you" count on Conversations; time-left wording for the reply window; mixed date styles; "Select page" for one row.

**Area 2 is closed.** Next (PLAN.md order 3 → 7 → X → 6): **area 3 — Consultant portal + Virtual Clinic shells** (review, final
assessment, milestones, discharge pack, follow-up, affiliations), started in a new session from this branch under the owner's
standing instruction.

## UX area 3 — Consultant portal + Virtual Clinic: integration, critique, plan (slice 3-0) (2026-10-16, worktree `awesome-shamir-9f726d`, branch `claude/awesome-shamir-9f726d` fast-forwarded to 2-4 @ `71b520c`)

**Integration (merge `7b9e195`).** The Consultant's treatment milestones, discharge pack and follow-up screens exist only
on the backend chain (`claude/trusting-lamarr-b82819` @ `b112bce`: P1-13, P1-15..P1-18 with their session-2 screens, from
`1a3ed8f`), so area 3 merged that chain into the UX line rather than drawing shells beside the real panels. P1-19
(affiliations, `b2656f3`) is uncompiled WIP and is **not** merged. Conflicts resolved in ProposalSign (1c-2 range bar +
P1-10 fee line/holds/price copy; groups over the medical lines), StaffCaseView (area 2's cover/copy/hairlines + P1-13/15..18
props, panels, guardian review, the final-quote validity field and its refusal at the field, FX/cooling lines; final-quote
copy stays in `portalWork.caseView.finalQuote`), Portal (2-4's page title + the refusal context, `send`/`reloadDocuments`,
`canReopen`, the incidents link), MyCare (the shared `patientStepText`, now with the P1-15..18 step codes, + the guardian
step), messages (both sides' keys; JSON valid, no duplicates, en/ar key parity apart from Arabic plural forms). Verify:
typecheck ok; vitest 89 files / 699 (two tests adapted: the final-quote form renders inside the work-copy provider; the
fee label is named on its line and in the range bar's legend); backend 940 tests, 0 failures, 3 skipped (123 classes).

**Fixture and shots.** `e2e/consultant-fixture.ts` (synthetic only: a Consultant's My work with four items; cases at
review, final assessment, treatment, discharge pack and follow-up with the P1-15..18 views as their own tests define
them; catalogue, FX, a facility package; the Virtual Clinic with a manager's pending price change and profile draft).
`e2e/consultant-shots.spec.ts` writes `screenshots/area-3/<AREA3_SHOTS|before>/` — my-work, case-review/assess (Clinical
tab), case-treat/discharge/follow, clinic-overview/services × en/ar × 390/1440 (4/4 green).

**Critique: 17/40** (dual-agent; `.impeccable/critique/2026-10-16T06-47-12Z__frontend-src-components-portal-clinicalreview-tsx.md`;
first run for this target; the review screen alone ≈ 24). P0: the legacy Consultant branch of `CaseWorkflowActions`
(treatment episode / schedule follow-up) duplicates P1-16..18's panels on every post-arrival case and takes the step
button to the wrong form. P1: final assessment's framing, copy and currency; evidence after the form and "Documents
reviewed" overclaiming; two or three filled actions per view; commerce before clinic (ledger before the countersign);
the complication review buried and framed as admin. P2: the Virtual Clinic off-system (no portal nav, gradient,
tracked uppercase in Arabic, "Verified", unconfirmed Retire, cramped table); Arabic parity and the ladder. Detector 0
(regex-only); scan: 103 off-ladder sizes, 17 tinted panels, ~11 boxes in cards, 3 inline en/ar copy tables, one
`window.confirm`, a tablist without keys. Fixture finding: a malformed panel view takes the whole case page down (no
per-panel error boundary).

**Plan** `plans/consultant-workspace.md` (no owner gate, standing instruction; assumptions marked [A]): evidence first and
one act per sheet under the area-2 cover (the strip's step button goes quiet when its form is on the page, all roles);
one clinical-decision grammar for the review and the final assessment; the clinical timeline after arrival (legacy
Consultant form retired, panels ordered by the current task, money as summaries, follow-up first after discharge, the
discharge stamp); the Virtual Clinic as the Consultant's own practice file inside the portal shell; convergence. Slices
3-1 the clinical decision → 3-2 after arrival → 3-3 the Virtual Clinic → 3-4 closing pass. Gaps: **G-1 affiliations wait
for P1-19** (uncompiled; not built here), G-2 final-assessment draft endpoint (backend follow-up); O-1 money shown as
summaries not removed, O-2 a recommendation still needs one priced line (server rule).

**Next:** slice 3-1 — the clinical decision, started in a new session from this branch.

## UX area 3 — slice 3-1: the clinical decision (2026-10-16, worktree `youthful-villani-621f9f`, branch `claude/youthful-villani-621f9f` fast-forwarded to 3-0 @ `cd1fb22`)

**Built (enhances the accepted layouts; Petrol & Paper unchanged, no new token).** Feature commit `e3c9a28`.
- **One clinical-decision grammar** (`ClinicalDecision.tsx`, new): the review and the final in-person assessment are one
  composition — "1 Recommendation" (clinical text required, risks), "2 Estimate lines" (one shared picker: approved services
  as a hairline checkbox list, Finance-approved packages, off-list lines marked by a drawn clock and words, never a tint),
  then a summary led by the clinical text ("Documents on file", not "reviewed"; money lines only when there is some; the
  patient's proposal in its currency). One hook (`useClinicalDecision`) holds the fields and one validation: each refusal is
  said at its control and the focus lands there (recommendation field; the lines; a package figure out of range). Seeds once
  (the case view is keyed per case); seeded catalogue ids survive a late catalogue; amounts read Arabic-Indic digits; package
  figures are checked when left or sent, not per keystroke, and announce their range.
- **Evidence first**: intake summary (`dir="auto"`, long ones clamped with "Read the whole summary"), documents on file with
  Preview/Download, and at arrival the preliminary recommendation (its lines, the patient's currency) open the sheet — on
  phones above the form, on `lg` pinned in the case rail (its own keyboard-scrollable region; the rail widens to 22rem at
  `xl`). The Consultant lands on the Clinical tab when their decision is there; the review history is hidden while composing.
- **Final assessment**: its own step copy by stage ("Record your final assessment" for `RECORD_CLINICAL_DECISION` at
  ARRIVAL_CONFIRMED, and a ready `RECORD_FINAL_ASSESSMENT` code — copy only, the backend decides the step); starts from the
  Consultant's last word (a saved final assessment, else the preliminary recommendation) so they confirm or change it;
  says the patient's currency (carried from the preliminary estimate) and what the lines come to at today's rate; "Saved on
  {date}" beside "Save a new version"; nothing cleared on a failed save (no draft endpoint: **G-2**).
- **Exits** (more information, return, not clinically suitable) confirm in the native `<dialog>` ConfirmDialog, worded per
  exit in messages; no `window.confirm`.
- **One filled action per view (all roles)**: a FOCUS step whose form is on the page shows the strip's quiet "Go to the form"
  link (accessible name "Go to the form: {action}"); the form's submit is the filled one. The referral's "Send to the
  coordinator" is secondary. `focusAction` lands the Consultant's step in the decision sheet (instant scroll), falls back to
  the tab panel.
- **Legacy Consultant forms retired** (`CaseWorkflowActions`): the treatment-episode form in treatment and "Schedule follow-up"
  after discharge duplicated P1-16..18's panels. Checked against the backend first: `/doctor/cases/{id}/treatment-episodes` is
  still **the only path into treatment** (ARRIVAL_CONFIRMED → ADMISSION_READY → TREATMENT_IN_PROGRESS), so that act stays as a
  narrowed "Start treatment" (facility, start, admission number), shown only once the admission view has no blockers (quote,
  consent, balance), confirmed in a dialog, errors at the fields, secondary. **Backend follow-up B-3-1b**: move the start of
  treatment onto the admission (the hospital's admission number) and retire the endpoint and its episode fields.
- **Copy**: ClinicalReview's and ConsultantRouting's inline en/ar tables moved to `portalWork.clinicalDecision` /
  `portalWork.referrals` (+ plurals `estimateLines`, `reviewHours`, `activeCases`, `pendingOffers`; `currentAction.goToForm*`,
  `RECORD_FINAL_ASSESSMENT`, `caseView.startTreatment`, `caseView.reviewHistory/reviewVersion`); the old
  `caseView.finalAssessment` block removed. Keys inserted textually; en/ar parity checked. Currencies in sentences by name
  (Intl.DisplayNames, "US Dollar (USD)"). Ladder sizes, hairlines, drawn icons in every touched file.
- **Fixture**: the arrival case now carries the backend's real answer (no Consultant step, `none()`); the preliminary line
  carries its `catalogServiceId`.

**P1-19 merged** (owner confirmed it finished; `33671ec` = 9e4f216 backend V103, c03461c session-2 UI, 33671ec follow-ups) in
its own merge commit after the slice. Conflicts resolved: `ProposalView` keeps UX 1c-0's patient totals **and** P1-19's
`payeeTotals` (record field order: …, fxReapprovalStatus, payeeTotals, totalMin, totalExpected, totalMax; `withTotals` carries
the payees), `ProposalItemView` gains `payee`; the staff workspace drops the PLATFORM payee total with the fee line;
`ProposalSign` keeps the 1c-2 range bar and adds P1-19's payee totals; the area-2 hairline `ProposalCard` gains P1-19's payee
note and totals; ClinicalReview/FinalAssessment keep the 3-1 redesign with P1-19's behaviour carried into the shared picker
(an off-list line says who is paid — Consultant, hospital or other, default other — sent as `payee`, shown on the row).
Messages merged textually: valid JSON, no duplicate keys, en/ar parity. **Gap G-1 is closed**: slice 3-3 designs
`virtual-clinic/Affiliations.tsx` on its real contract (the Consultant fixture needs `/clinics/{id}` affiliation data for its
shots, 3-3 adds it); area 6's Compliance screens are unblocked.

**Reviews** (Impeccable + Vercel skills loaded before code; four read-only reviews; all HIGH/MEDIUM fixed): React/composition
(HIGH seeded catalogue lines dropped when the catalogue loads late → seeds kept by id; re-seed on every draft save → seed once;
the draft's currency kept on the control with a no-rate note; validation unified in one hook; stable off-list keys; focus after
removal; `useId` ids), web guidelines (focus after each refusal, digits and wheel in amount fields, figure error on leave,
scrollable evidence region, inline errors for Start treatment, `role="status"` on the completion line, wrapped file names,
disclosure markers), RTL/i18n (bidi in the review history, version in words, range as a template with isolated figures, Arabic
plurals in full forms, currency names, "تحويل", templates for "Requested by {name}" and the link name, phrasing fixes),
Pro Max (HIGH no backend step at arrival → fixture honest + backend follow-up B-3-1a; HIGH Start treatment before clearance →
gated on the admission blockers + confirm; same money on both acts; saved line by the button; wider rail; clamp long intake;
no zero line; dropped foreign-currency lines said). Visual pass on the EN/AR 390/1440 shots (the first pass caught the rail
clipping the journey card → evidence scrolls in its own region). Impeccable detector: 0 findings; off-ladder sizes in the
touched files: 0.

**Verify.** `pnpm typecheck` ok; eslint 0 on touched files; vitest 92 files / 737 after the merge (89 / 715 before it);
Playwright on :3117 after the merge: consultant-shots, staff-chrome, case-cover, staff-keyboard, portal-reliability,
portal-p2-pass-3, portal-ux, messages-conversations, a11y en+ar, arabic-proposal-decision, ux8-commercial-journeys,
pre8c-commercial-copy 127/127, proposal-otp/responsive and status-proposal 13/13 (before the merge one staff-keyboard flake,
6/6 on rerun); backend `mvn -o -q test` after the merge: 947 tests, 0 failures, 3 skipped (V103 included). Specs changed: portal-reliability reads the labelled
recommendation field (ids are `useId` now). Overwritten pass-2/pass-3 and area-2 shots restored.

**Screenshots:** `screenshots/area-3/3-1/` — my-work, case-review/assess (Clinical tab), case-treat/discharge/follow,
clinic-overview/services × en/ar × 390/1440 (after the P1-19 merge).

**Follow-ups (backlog, not blocking):** **B-3-1a** the backend gives the Consultant a `RECORD_FINAL_ASSESSMENT` (FOCUS) step at
ARRIVAL_CONFIRMED until a final assessment is saved (today `none()`, so the strip says "Nothing needs you right now" beside
"Waiting on: The Consultant"); **B-3-1b** move the start of treatment onto the admission and retire `/treatment-episodes`;
**G-2** a final-assessment draft endpoint; server refusals of the decision (`FACILITY_PACKAGE_RANGE`, `CATALOG_SERVICE_INVALID`)
said at the control via `refusalExplainedInPlace` (Portal.tsx, outside this slice); Operations' travel form copy still inline in
`CaseWorkflowActions`; documents list "Show all" past ~10 files; a "N earlier lines are no longer on your list" note when a
seeded catalogue line was deactivated; the evidence heading level in the rail (h3 before the team's h2).

**Next:** slice 3-2 — after arrival (panel order by the current task, summaries for the Consultant's money facts, follow-up
first after discharge with the complication first, the discharge stamp, work-type copy, a per-panel error boundary), started
in a new session from this branch.

## UX area 3 — slice 3-2: after arrival (2026-10-28, worktree `ux-3-2-after-arrival-8a0824`, branch `claude/ux-3-2-after-arrival-8a0824` from `feat/review-p0` @ `db493ab9`)

**Built (enhances the accepted layouts; Petrol & Paper unchanged, no new token).**
- **Panels in the order of the Consultant's work** (`StaffCaseView`): the panel holding the current step comes first (by its
  work set: admission, treatment, discharge, follow-up), then the stage's own order: in treatment Treatment → Discharge →
  Admission; after discharge (DISCHARGED/FOLLOW_UP/CLOSED) Follow-up → Discharge → the rest. Start treatment stays with the
  admission it depends on. Other roles keep the area-2 order unchanged.
- **Money as summaries for the Consultant** (O-1, presentation only): Admission reads as one line ("Nile Heart Hospital · Cairo ·
  Checked, within the estimate", the admission number when there is one, what still blocks treatment before clearance), the
  voucher behind "The voucher and what is owed"; no ledger trail. The emergency admission at arrival stays. Treatment puts the
  clinic first (milestones, change orders, evidence checklist) and the running money and the hospital's interim bills behind one
  "Running money · Authorised total" disclosure, which also says a variance over the authorised total in its summary.
- **Follow-up first, the complication first** (`FollowUpPanel`): an unreviewed complication opens the panel — "The patient
  reported a problem" (drawn alert icon, alert-800 words, no tint), when and how it was answered and by whom, the patient's own
  words (`dir="auto"`), the safety line (contact the patient or the person answering for them, record what you did or advised; an
  incident is open), then the review form as the one primary action. The outcome row no longer repeats the words. The
  coordinator sees one line that a problem was reported and the Consultant reviews it (no clinical text). The coordinator's
  REBOOK_FOLLOW_UP line is a focus target.
- **The discharge stamp** (`DischargePanel`): once discharged, the file's `CaseStamp` ("Discharged", line variant) on the date the
  case timeline recorded DISCHARGED — a real event, never decoration; no date, a plain badge. For the Consultant the pack, letter,
  invoice and journey home fold into "The discharge pack, the letter and the journey home"; Operations (return/departure) keeps
  the panel open.
- **Work-type copy and focus targets**: `COMPLETE_DISCHARGE_PACK`, `CONFIRM_RETURN`, `CONFIRM_DEPARTURE` added to
  `currentAction.work` and `workTitles` (en+ar), so the Arabic strip and My work never fall back to English for these steps;
  their targets are the panels' `*-next` anchors (unchanged mechanism, now the first panel).
- **Per-panel error boundary** (`PanelBoundary` in `panel-parts`): each panel renders inside one, keyed per case; a view the page
  cannot draw says "{panel} could not be shown…" in its own place while the cover, the step and the other panels work.
- **Convergence**: off-ladder `0.85rem` → `0.875rem` in the four panels; `0.8rem`/`0.9rem` → `0.8125rem`/`0.9375rem` in
  ReopenCase; Finance's tinted price box → hairline; ReopenCase card → hairline line; one shared `Summary` with a drawn
  chevron (the flex summaries had lost their marker) and a hover state for every panel disclosure.
- **Fixture**: the discharge work item now carries the backend's real type (`DISCHARGE_PACK`, `DischargeService.PACK_WORK`) and
  wording code; the follow-up case has DISCHARGED/FOLLOW_UP timeline entries and a discharged view (pack done, return confirmed).

**Reviews** (Impeccable, react-best-practices, composition-patterns and web-design-guidelines loaded at batch start; in-thread
review of the diff): role-based branches inside the existing panels rather than new boolean props; one finding fixed (disclosure
summaries had no hover state). Impeccable detector: 0 findings; off-ladder sizes in the touched panels: 0.

**Verify.** `pnpm typecheck` ok; eslint 0 on the touched files (baseline 0); vitest 97 files / 760 tests, 759 pass — the one
failure, `StaffOperationalUi.test.tsx` "tells Finance its list also holds the cases with a deposit to record" (QA W-44), fails the
same on the clean base (pre-existing). New tests: Consultant admission summary, discharge stamp + fold (and open for Operations),
`PanelBoundary`; FollowUpPanel's complication test rewritten for the report-first layout. Playwright on :3117 (production build):
consultant-shots (now asserts the panel order and the stamp), staff-chrome, case-cover, staff-keyboard, portal-reliability,
a11y en+ar — 61/61. Overwritten area-2 shots restored.

**Screenshots:** `screenshots/area-3/3-2/` — my-work, case-review/assess/treat/discharge/follow, clinic-overview/services × en/ar ×
390/1440.

**Follow-ups (backlog, not blocking):** a coordinator-side order by the current task (left as area 2 accepted it); the unused
`followUp.outcomes.reviewForm` key can go once nothing reads it; B-3-1a/B-3-1b and G-2 from 3-1 stay open.

**Next:** slice 3-3 — the Virtual Clinic (portal shell + h1, tabs with keys, hairline sections, services list, confirmations, one
filled action, "Credentials reviewed", manager permission line, Affiliations on P1-19's contract), started in a new session from
this branch.

## UX area 3 — slice 3-3: the Virtual Clinic (2026-10-28, worktree `ux-3-3-virtual-clinic-aaa37c`, branch `claude/ux-3-3-virtual-clinic-aaa37c` from 3-2 @ `a1339b2f`)

**Built (enhances the accepted layout; Petrol & Paper unchanged, no new token).**
- **The portal shell**: `PortalFrame` moved out of `Portal.tsx` into `portal/PortalFrame.tsx` and shared, so the clinic has the
  portal's paper page (no gradient), `#portal-title` h1 "Virtual Clinic" and the lead as its subtitle. A Consultant gets the staff
  navigation (My work · My cases · Virtual Clinic, the clinic `aria-current="page"`; `StaffViewLinks` takes `current: "clinic"`) in
  the header and inline on phones, and the account menu (`PortalAccount`, preferences, Control Center entry). A practice manager
  has no case work, so no navigation; the account menu stays.
- **Tabs with keys**: one underline tab style (the case page's), roving `tabIndex`, arrows mirrored in Arabic, Home/End
  (`tabKeyTarget`), `aria-controls`/`tabpanel`; icons dropped; scrolls on phones.
- **Hairline sections**: each section is one white sheet of `Part`s parted by hairlines (`clinic-parts.tsx`: `Part`, `Fact`,
  `AlertLine`, `DoneLine`, `QUIET`); no card in a card, no tinted draft box, notices as hairline lines with a drawn icon. Field
  labels without tracking or capitals (Arabic-safe).
- **Services as a hairline list**: name, kind, "From {date}" in words, code and version de-emphasised, the price in Egyptian
  pounds (`formatMoney`, `<bdi dir="ltr">`), Active/Retired as `StatusBadge`; Edit/Retire/History as named quiet actions; history
  opens under its own row. Changes waiting come first for the Consultant (Approve secondary with a check, Reject quiet, then its
  reason and a secondary "Reject the change"); a manager reads them after the list under "Changes waiting for the Consultant".
  The service form checks prices at the field (Arabic digits read; upper price must be higher) and focuses its heading on open.
- **Confirmations** (native `<dialog>` ConfirmDialog, worded in messages): retire a service (a manager's version says it goes for
  approval), cancel a slot ("Keep the slot"), revoke a manager, discard a profile draft.
- **One filled action per section**: Approve and publish (draft), Save the change (service form), Add slot, Send invitation, File
  declaration; Save availability, Approve, Publish now and Save permissions are secondary.
- **Wording**: "Credentials reviewed · current" / "Credentials not reviewed yet · renewal due" (PRODUCT: never "Verified");
  history events in words (14 `CLINIC_*` codes, en+ar), not the code lower-cased; backend refusals by code
  (`CLINIC_VERSION_CONFLICT` also reloads, `CLINIC_ACCESS_DENIED`), English messages only in English.
- **Manager permission line**: under the Consultant's name, "{name} has allowed you to {permissions}." (`Intl.ListFormat`) and
  whether service changes wait for approval or apply at once (the Consultant's setting).
- **Dates and digits**: one rule, `intlLocale` everywhere (Latin digits in both languages, as the portal); calendar dates by
  `formatCalendarDate`, slots by `formatRange`; review hours validated 1–720 at the field. `formatEgp` removed.
- **Affiliations on P1-19's real contract** (`AffiliationsView`): the status as a `StatusBadge` with filed/renew-by dates and the
  declared lines; no current declaration as an alert line; facilities used before they were declared as a hairline list with
  "Not declared yet" as a warning badge; the yearly form's rows as hairline rows; earlier declarations; the overview's
  declaration prompt sits above the sheet (a renewal in ink with a calendar icon, a missing one in alert ink).
- **Copy**: VirtualClinic's inline en/ar table moved to `portalWork.virtualClinic` (inserted textually before `affiliations`;
  en/ar key parity checked, JSON valid).
- **Fixture**: `consultant-fixture.ts` answers `/clinics/pr-1/affiliations` (a current declaration renewing within the month, the
  one it replaced, an open undeclared-facility flag); the shots spec asserts the clinic is the current place, End on the tabs,
  and shoots the Affiliations tab.

**Reviews** (Impeccable, react-best-practices, composition-patterns and web-design-guidelines loaded at batch start; in-thread
review of the diff): role-based branches inside the sections, shared `Part` instead of new boolean props; the visual pass on the
shots caught doubled hairlines where a list met the next part and the declaration prompt boxed inside the sheet (both fixed).
Impeccable detector: 0 findings; off-ladder sizes in the touched files: 0.

**Verify.** `pnpm typecheck` ok; eslint 0 on the touched files (baseline 0); vitest 97 files / 766 tests, 765 pass — the one
failure is the known `StaffOperationalUi.test.tsx` W-44 test (fails on the clean base). VirtualClinic tests rewritten (17/17 with
Affiliations): tab keys (en + mirrored ar), "Credentials reviewed", manager line, retire and revoke confirmations, price and date,
review-hours refusal, version conflict. Playwright on :3117 (production build): consultant-shots, hospital-agreement-audit,
a11y en+ar, staff-chrome — 54/54. Overwritten area-2 shots restored.

**Screenshots:** `screenshots/area-3/3-3/` — my-work, case-review/assess/treat/discharge/follow, clinic-overview/services/
affiliations × en/ar × 390/1440.

**Follow-ups (backlog, not blocking):** the clinic's section is not in the URL (tabs, as the plan allowed; place links if a
deep link is wanted); the notification bell is not on the clinic page; "Not declared yet" could link to the form row;
B-3-1a/B-3-1b and G-2 stay open.

**Next:** slice 3-4 — the closing pass (re-critique, target ≥ 28/40; after shots `AREA3_SHOTS=after`; the STATUS section closing
area 3), started in a new session from this branch.

## UX area 3 — slice 3-4: closing pass; area 3 closed (2026-10-28, worktree `ux-3-4-closing-a9f91f`, branch `claude/ux-3-4-closing-a9f91f` from 3-3 @ `48e89c0f`)

**Re-critique: 28/40** (dual-agent, same rubric as 3-0; `.impeccable/critique/2026-10-28T08-44-42Z__frontend-src-components-portal-clinicalreview-tsx.md`;
trend 17 → 28, target ≥ 28 met). P0 0 (was 1), P1 3 (was 5). Up:
- real-world match, control, error prevention, recognition, aesthetics, error recovery and help, 1–2 → 3;
- consistency, 1 → 3: one shell, one tab style, one `Summary`, one filled action.

Still 2:
- **Visibility.** At arrival the strip says "Nothing needs you right now" above the open final assessment (B-3-1a). The journey rail marks Treatment current at arrival.
- **Flexibility.** The phone review is still about 3,800px. Clinic tabs are not in the URL.

Mechanical scan against the 2026-10-16 baseline:

| Category | Before | After |
|---|---|---|
| Off-ladder sizes | 103 | 0 |
| Tinted notices | 17 | 0 |
| Boxes in cards | about 11 | 2 (ConsultantRouting radio tiles) |
| Filled-button pairs | in every view | 0 |
| Uppercase + tracking | 4 | 0 |
| Inline en/ar tables | 3 | 1 |
| Glyph icons | 2 | 0 |
| `window.confirm` | 1 | 0 |

The remaining inline table, plus 9 ternaries and about 15 English strings, are all in `CaseWorkflowActions`: Operations' travel form, area 5. Both tablists are complete. Raw colours and physical-direction classes are 0. Detector 0 (regex-only). The browser overlay was skipped because the portal needs the mocked OIDC session.

**HIGH findings, fixed here (small, in scope):**
- **The preliminary recommendation now leads the evidence at the final assessment** (`CaseEvidence` in `ClinicalDecision.tsx`). It was last in the rail's 55vh scroller and cut off mid-heading, while the field's hint asked what had changed from it.
- **My work's order.** The fixture listed the urgent complication last under "most urgent first". The backend already ranks it first (`StaffWorkQueryService.QUEUE_ORDER`: priority, then due, then created), so `consultant-fixture.ts` now lists My work in that order.
- **Copy, from the minor findings.** The complication review hint states clinical intent ("Say what you found and what you advised or arranged for the patient.", en + ar) instead of "releases the hold on closing the case". A due check-in shows its date alone beside the Due badge, not "Due · due Oct 16".

**The third HIGH finding is backend work:** B-3-1a, the final assessment step on the strip.

**Verify.**
- `pnpm typecheck` ok.
- eslint 0 on the touched files.
- vitest FollowUpPanel, FinalAssessment and ClinicalReview: 34/34.
- Playwright on :3118 (production build), consultant-shots + a11y en+ar: 34/34.
- Visual check of the after shots: the assess rail opens on the preliminary, and the urgent complication is first in My work, en + ar.

**Screenshots:** `screenshots/area-3/after/`: my-work, case-review/assess/treat/discharge/follow and clinic-overview/services/affiliations, each in en and ar at 390 and 1440 (36 shots, taken with `AREA3_SHOTS=after` on the synthetic Consultant fixture, after the fixes).

**Area 3 follow-ups:** in backlog.md under "Area 3 — close". Not blocking, except as noted:
- ~~**B-3-1a:** the Consultant's `RECORD_FINAL_ASSESSMENT` (FOCUS) step at ARRIVAL_CONFIRMED (backend; the critique's open HIGH).~~ **Done** (see below).
- ~~**B-3-1b:** start treatment on the admission and retire `/treatment-episodes` (backend).~~ **Done** (see below).
- ~~**G-2:** a final-assessment draft endpoint (backend).~~ **Done** (see below).
- **Smaller items:**
  - the Consultant's Discharge panel folded during treatment;
  - Arabic context lines and catalogue names;
  - a scroll cue on the phone tabs and on the evidence region;
  - decision refusals said in place;
  - Affiliations' "No relationship" as a radio choice;
  - the clinic's bell and deep links;
  - the stamp colour (owner).

**Area 3 is closed.** Areas 4 (Finance, needed P1-15 and P1-17) and 5 (Operations, needed P1-15) are now unblocked: both chains are merged into the UX line. **Next** (PLAN.md order 3 → 7 → X → 6 → 5 → 4): **area 7 — Keycloak theme parity** (login, setup, OTP, passkey; EN/AR), started in a new session from this branch under the owner's standing instruction.

## Backend follow-up B-3-1a: the final assessment on the strip (2026-10-28, worktree `b-3-1a-final-assessment-25ffca`, branch `claude/b-3-1a-final-assessment-25ffca` from 3-4 @ `d8a150c7`)

Closes the area 3 re-critique's open HIGH: at arrival the strip said "Nothing needs you right now" beside "Waiting on: The Consultant".
- **Backend.** `CaseActionService.stageFallback` gives the case's Consultant `RECORD_FINAL_ASSESSMENT` (FOCUS) at ARRIVAL_CONFIRMED until a final assessment is saved: an APPROVED review written after the move into the current stage (`ClinicalReviewVersionRepository.existsByCaseIdAndStatusAndCreatedAtAfter`). Other roles' steps are unchanged.
- **Frontend.** The `stagedAction` rename shim in `CurrentAction.tsx` (RECORD_CLINICAL_DECISION → RECORD_FINAL_ASSESSMENT by stage) and the panel's `stage` prop are gone: the strip words the backend's code. The step's states/actions copy existed since 3-1; work-type copy added (`currentAction.work`, `workTitles`, en + ar). The focus target is unchanged: the Consultant's FOCUS lands on the FinalAssessment form (`#clinical-decision`). `consultant-fixture.ts` returns the step at arrival.
- **My work.** The step is also a stage-step work item now: `syncStageWork` covers the case's Consultant (active assignment, as for milestones). Arrival (`patientArrived`, `arrivalAttested`) and the save raise `WorkChanged`; leaving the stage closes the item. Work copy `RECORD_FINAL_ASSESSMENT` in en + ar.

**Verify.** `FinalAssessmentStepTest` (on the strip and in My work at arrival, gone from both after the save, not shown to Operations, Coordinator or patient); backend `mvn -o -q test`: 992 tests, 0 failures, 3 skipped; `pnpm typecheck` ok; vitest 97 files / 766 tests, 765 pass (the known `StaffOperationalUi` W-44; a `NoPortalWorkspace` flake under load passes alone); Playwright on :3119 (production build): consultant-shots, staff-chrome, hospital-agreement-audit, a11y en+ar — 54/54; overwritten shots restored.

## Backend follow-up B-3-1b: treatment starts on the admission (2026-10-28, worktree `b-3-1b-treatment-start-efb10b`, branch `claude/b-3-1b-treatment-start-efb10b` from B-3-1a @ `8e16226c`)

One honest path into treatment: the hospital's admission number recorded on a cleared case. The admission blockers are the only gate.
- **Backend.** `AdmissionService.recordAdmissionNumber` (Operations, `ADMISSION_MANAGE`) on ADMISSION_READY records the number and moves the case to TREATMENT_IN_PROGRESS under the transition policy, then raises `TreatmentStarted` (the ADMITTED milestone, now recorded by `SYSTEM` from the number, and the Consultant's milestone clock). In treatment a different number corrects the one on file and moves nothing. ADMISSION_READY is still entered only through the admission handoff (final quote, procedure consent, balance or the Consultant's emergency admission). **The emergency exception:** after their emergency admission, the Consultant records the number themselves, via `POST /doctor/cases/{id}/admission/number` (`recordEmergencyAdmissionNumber`, `CLINICAL_REVIEW`; refused with `EMERGENCY_ADMISSION_REQUIRED` otherwise). The case still has to be cleared first.
- **Retired.** `POST /doctor/cases/{id}/treatment-episodes`, `TreatmentRequest`, `TreatmentEpisode` + repository, the workspace's `treatmentEpisodes` / `TreatmentEpisodeView`, `FollowUpRequest.treatmentEpisodeId` and `FollowUpPlan.treatmentEpisodeId`. V109 drops `follow_up_plans.treatment_episode_id` and `treatment_episodes` (clean cutover; the retention catalogue no longer lists the table). `TreatmentDeliveryService` lost its now-unused quote/consent/pay-to-admit checks: `AdmissionReadiness` owns them.
- **Frontend.** `CaseWorkflowActions` lost the Consultant's Start treatment form (it is Operations' travel plan only). The case page's logistics card lost the episode list. `AdmissionPanel`: the Operations number field says "Recording it starts treatment." on a cleared case, and the Consultant's summary gains the number form after an emergency admission on ADMISSION_READY. Copy: `caseView.startTreatment` and `logistics.episodes` / `unnamedFacility` / `episode` removed; `admission.forms.numberHint` reworded; `admission.summary.emergencyNumber` added (en + ar, inserted textually).

**Verify.** `AdmissionServiceTest` (Operations starts treatment from the number, blank refused, the Consultant refused without an emergency admission, a correction moves nothing and records ADMITTED once, refused before clearance, the emergency path end to end). `JourneyServiceIntegrationTest` uses the admission path, and `theTreatmentEpisodeEndpointIsGone` checks for a 404 and no table. `AdmissionFixture.inTreatment()` records the number as Operations. Backend `mvn -o -q test`: 994 tests, 0 failures/errors, 3 skipped. `pnpm typecheck` ok, eslint on the touched files clean. vitest: 97 files / 764 tests, 762 pass (the known `StaffOperationalUi` W-44, plus a `CaseStatusAccess` load timeout that passes alone, 39/39). Playwright on :3147 (production build): consultant-shots, staff-chrome, hospital-agreement-audit, a11y en+ar: 54/54 on the first full run; a clean re-run had 52/54, the 2 being Windows file locks on screenshot PNGs (EBUSY-style `UNKNOWN: open`), both passing on re-run. Overwritten shots restored. `PostgresJpaMappingTest` was not run (no Docker PostgreSQL in this session).

## Backend follow-up G-2: the final assessment's draft (2026-10-28, worktree `g-2-final-assessment-draft-366789`, branch `claude/g-2-final-assessment-draft-366789` from B-3-1b @ `160b8c13`)

The final assessment gets a Save draft, kept the way the clinical review's is. A draft is never the saved final assessment.
- **Backend.** `ClinicalRecommendationService.saveFinalAssessmentDraft` (`POST /doctor/cases/{id}/final-assessment/draft`, the same `FinalAssessmentRequest`; `CLINICAL_APPROVE` on the case, ARRIVAL_CONFIRMED only) supersedes older drafts. It then writes a DRAFT review that carries the case's quoting currency and the lines picked so far, and audits `FINAL_ASSESSMENT_DRAFT_SAVED`. It does not call `work.changed`: `CaseActionService.finalAssessmentSaved` still reads only an APPROVED review written after the arrival move, so the Consultant's `RECORD_FINAL_ASSESSMENT` step and work item stay open. `saveFinalAssessment` now supersedes the draft.
- **Frontend.** One rule in `StaffCaseView` tells the Consultant's words apart: written since arrival (the timeline's ARRIVAL_CONFIRMED) is this stage's, whether saved or a draft; the latest approved before it is the preliminary recommendation. The form starts from the latest standing review since arrival, else the preliminary one. `FinalAssessment` gains Save draft (refused at the button when empty, as in the review), "Draft saved on {date}. It is not your final assessment until you save it." when it reopens on a draft, and "Not saved. What you entered is still here; try again." in place when a save or a draft fails. Copy: `clinicalDecision.finalDraftSaved` and `clinicalDecision.errors.notSaved` (en + ar, inserted textually).

**Verify.** `FinalAssessmentStepTest`: a draft leaves the step and the work item open, keeps its lines, a later draft supersedes the earlier one, and saving supersedes the draft. A draft is refused before arrival (`CASE_STATE_CONFLICT`), for the coordinator, and for a Consultant off the case (403). Backend `mvn -o -q test`: 996 tests, 3 skipped, 1 failure in `IntakeConversationIntegrationTest.theListSaysWhoIsOwedAReplyUntilStaffAnswer`, which is unrelated (WhatsApp intake, timing) and passes alone (9/9). `pnpm typecheck` ok, eslint on the touched files clean. vitest: 97 files / 767 tests, 766 pass (the known `StaffOperationalUi` W-44). `FinalAssessment.test.tsx` 11/11, covering draft save, empty draft, the reopen on a draft and the failed save. Playwright on :3100 (production build): consultant-shots, staff-chrome, hospital-agreement-audit and a11y, en + ar: 54/54. The shots they overwrote are restored. `PostgresJpaMappingTest` was not run (no schema change).

## UX area 5 — Operations: critique, plan, slice 5-0 the travel plan (2026-10-28, worktree `ux-5-operations-27e3fd`, branch `claude/ux-5-operations-27e3fd` from `feat/review-p0` @ `a6e1a6fe`)

Scope: `remaining-work-prioritized.md` 1.7 (reservation, admission letter, balance receipt, travel plan, departure; the travel
form's copy). P1-15, P1-17 and B-3-1b are on this line, so no integration merge was needed.

**Fixture and shots.** `e2e/operations-fixture.ts` (synthetic only: My work with five items in the backend's order; cases at
travel coordination with nothing reserved, reserved without a letter, arrived with the receipt owed, cleared with the number
owed, discharged with the departure owed; a long Arabic hospital name and patient name). `e2e/operations-shots.spec.ts` writes
`screenshots/area-5/<AREA5_SHOTS|before>/` — my-work and case-plan/letter/balance/admit/depart × en/ar × 390/1440.

**Critique: 19/40** (dual-agent; `.impeccable/critique/2026-10-28T10-24-59Z__frontend-src-components-portal-admissionpanel-tsx.md`;
first run for this target). P0: the strip says "Arrange travel and arrival" for the whole of travel coordination while the
admission panel opens "Reserve the hospital", and the travel Save is always filled (two filled buttons). P1: the travel form
reopens blank on a PUT that replaces the whole plan (**a re-save cleared the stored arrival, flight and visa**), with its copy
inline and the arrival as a plain field; two hospital pickers; Arabic parity ("Also open" in English, Latin runs); the
cashier's seven-field receipt on a phone. P2: stale states (logistics "Arrived" after discharge, the rail, reconciliation for
Operations). Detector 0; scan: 0 off-ladder sizes, tints, physical direction or raw colours; 1 inline table + 10 ternaries (all
in the travel form); 11 datetime-local fields without a hint.

**Plan** `plans/operations-workspace.md` (no owner gate; assumptions [A]): 5-0 the travel plan → 5-1 the hospital file (one act
at a time, one filled button across panels, the reservation owns the hospital, stage-true logistics; backend follow-up **B-5-1**
step codes for the reservation and the letter) → 5-2 the cashier (receipt prefill and disclosure, voucher one-liner,
confirmations and date hints) → 5-3 going home + close (re-critique, target ≥ 28/40).

**Slice 5-0 — the travel plan.** `TravelPlanPanel.tsx` replaces `CaseWorkflowActions.tsx` (deleted with its test; StaffCaseView
renders it for Operations while `UPDATE_TRAVEL_PLAN` is offered, inside a `PanelBoundary`):
- reopens on everything stored and resends it (incl. the arrival arrangements and `exceptions`, which the form never sent), so
  a save never clears the plan; a stored hospital the directory has not loaded (or no longer lists) stays selected;
- arrival arrangements (airport reception, accommodation, transport, companion) behind a disclosure; booking as two radios;
  "Booked and confirmed" without a planned arrival refused at the field;
- the patient's arrival is its own act: empty or future times refused in place, then a confirmation that shows the time,
  because it moves the case to ARRIVAL_CONFIRMED;
- one filled button (Save until booked, then Record the arrival); date fields `dir="ltr"` with a hint; option text isolated;
- copy in `portalWork.travelPlan` (en + ar, inserted textually); `TravelPlanView` gains the arrangement fields.
- Shared: the `Task` disclosure (panel-parts) now uses `Summary`, so every panel task shows its chevron (the reviewers found
  no open/closed cue).

**Reviews.** RB: HIGH ×1 fixed (the late hospital directory). WG, RTL/i18n, Pro Max: no CRITICAL/HIGH; fixed the MEDIUMs (disclosure
cue, localized validation, the time in the confirmation, the no-hospitals note at its field, `dir="ltr"` dates, isolates) and
the Arabic wording LOWs; the rest in backlog.md "Area 5 — Operations".

**Verify.** `pnpm typecheck` ok; eslint on the touched files clean; vitest 97 files / 770 tests, 769 pass (the known
`StaffOperationalUi` W-44); `TravelPlanPanel.test.tsx` 8/8 (whole-plan resend, late directory, re-seed, at-field refusal,
confirm/cancel, empty/future arrival, Arabic); panel suites 50/50. Playwright on :3152 (production build): operations-shots,
consultant-shots, staff-chrome, hospital-agreement-audit, a11y en+ar — 58/58; operations-shots re-run on :3153 after the
fieldset fix 4/4. Overwritten shots restored. Shots: `screenshots/area-5/before/` and `screenshots/area-5/5-0/`.

**Next:** slice 5-1 — the hospital file, started in a new session from this branch.

## UX area 5 — slice 5-1 the hospital file (2026-10-28, worktree `elastic-lederberg-eace3a`, branch `claude/elastic-lederberg-eace3a` from 5-0 @ `da2f014c`)

Plan direction 2 (`plans/operations-workspace.md`); no owner gate (standing instruction), assumptions as planned.

**One hospital file.** For Operations the "Admission & money" panel opens on an ordered list of acts (`OperationsFile` in
`AdmissionPanel.tsx`, `aria-label` "Hospital file"): reserve → admission letter → travel and arrival → cashier receipt →
admission number. Only the current act is open and it carries the view's one filled button. The travel plan is part of
that count: in travel coordination it is an act in the file, drawn through a `travel` slot that StaffCaseView fills with
`TravelAct`, and it is current once the reservation and the letter are in. A done act is one line with its correction behind
a disclosure ("Reserved · Nile Heart Hospital · Cairo · admission 30 Oct 2026" / "Change the reservation"; "Admission letter ·
Waiting for Finance's check" / "Record a new letter"; "Arrived · …"; "Cashier receipt recorded · EGP … · waiting for
Finance's countersignature" / "Record another receipt"; "Admission number …" / "Correct the admission number"). A recorded act
that still waits on someone else shows a clock, and a variance shows an alert icon. A later act is named, muted, with an sr-only
"Later:". The voucher, the point of no return and the first appointment follow as side tasks, and none of them is primary. The
reference maximum and the point of no return stay as facts. The act now sits about 1,000px higher on the cashier case
(case-balance-en-1440). New shared pieces in `panel-parts.tsx`: `DoneAct` (tone done / waiting / warning), `LaterAct`, and
`localInput` (moved from the travel form). The reservation's form now reopens on its stored date.
- `next` for Operations: reserve (unless cleared) → letter (unless cleared: an emergency admission can clear a case with no
  letter, and then no letter act shows) → travel (in travel coordination, when the slot is offered) → what the backend's step
  names (receipt, number). One stage (`view.caseStatus ?? caseStatus`) decides both `next` and `cleared`.
- When an act is recorded its form is replaced by its fact, so focus moves on to the act that is now open, or to the panel's
  heading.
- When the admission view cannot be read, the travel act still stands under the error.

**The reservation owns the hospital.** The travel form no longer has a hospital picker. It resends the stored `facilityId`
with everything else, because the PUT replaces the whole plan. `TravelPlanPanel` (its own card, h3) is now used only before a
reservation can exist (ACCEPTED). `TravelAct` (h4, not a landmark) is the act in the file: when it is not current it is one line
("Planned arrival: …"), with the form behind "Change the travel plan" / "Plan the travel" and no filled button.

**Stage-true logistics.** "Destination & treatment" reads the reservation back from the admission panel (`onView`, held through
a ref so the reads never re-run): it shows the hospital · city and the planned admission. The travel line follows the stage
(Arrived, before admission / cleared for admission / In hospital / Discharged / in follow-up / Case closed), so it never says
"Arrived" after discharge. Dates go through `intlLocale`. "Facility" is now "Hospital", and the booking reads "Booked" in both
places. The card states the hospital only when it knows it.

**5-1 backlog items.** Done: the arrangements disclosure keeps the officer's open/closed state through a re-seed; a refused
arrival is reported at the field ("…Read the message above, check the time, then try again."); the pre-release Operations plan
textarea has a visible label and a hint. **B-5-1 was recorded, not built.** It touches `CaseActionService`, stage work and
`WorkCopy`, `SlaPolicy`, `JourneyStageRegistry` and the parity tests, so it is not small. Details are in backlog.md
"Area 5 — Operations"; until it lands, the strip says "Arrange travel and arrival" while the file opens the reservation or the
letter.

Copy is in en + ar, inserted textually: `admission.acts.*` and `admission.forms.{hospitalOption,noHospitals,newLetter,
anotherReceipt,correctNumber}`; `travelPlan.{change,start,nothingYet,noArrivalYet,arriving,arrived,arrival.failed}`;
`caseView.logistics.{admission,notPlanned,stage.*}`; `caseView.release.{operationsPlan,operationsPlanHint}`. The travel form's
four picker keys were removed.

**Reviews** (four read-only reviewers):
- RB + composition: HIGH ×1 fixed (an emergency-cleared case with no letter left the view with no primary and a "done" letter).
  MEDIUMs fixed: the travel act was offered as current with no slot; a partial or wrong receipt could not be recorded again;
  `onView` sat in the read effects' deps.
- Web design guidelines: HIGH ×1 fixed (focus dropped to `<body>` when an act became its fact). MEDIUMs fixed: the waiting /
  warning icon on the letter, and the arrival failure copy.
- RTL/i18n: no CRITICAL/HIGH. Fixed: `dir` on the receipt, number and date inputs; name and city isolated separately; the
  Arabic wording (تم الحجز · موعد الدخول, اعتماد المالية, إيصال خزينة المستشفى, خرج من المستشفى, "خطوة لاحقة:").
- Pro Max: no CRITICAL/HIGH. Contrast passes (ink-500 7.5:1 on paper). Fixed: wrapping of long facts.
- The rest is in backlog.md "Area 5 — Operations". Detector 0 on the four files.

**Verify.** `pnpm typecheck` ok; eslint on the touched files clean; vitest 97 files / 779 tests, 778 pass (the known `StaffOperationalUi` W-44); `AdmissionPanel.test.tsx` 21/21 (new "hospital file" block: order and one primary, travel handed the primary after the letter, travel standing on a failed read, emergency-cleared without a letter, receipt as one line with "Record another receipt"), `TravelPlanPanel.test.tsx` 12/12 (no picker, stored hospital resent from the act, arrangements state through a re-seed, arrival failure at the field, the act not current / current). Playwright on :3162 (production build): operations-shots (`AREA5_SHOTS=5-1`), consultant-shots, staff-chrome, hospital-agreement-audit, a11y en+ar — 58/58. Overwritten shots restored. Shots: `screenshots/area-5/5-1/`.

**Next:** slice 5-2 — the cashier, started in a new session from this branch.

## UX area 5 — slice 5-2 the cashier (2026-10-28, worktree `kind-shtern-f926c7`, branch `claude/kind-shtern-f926c7` fast-forwarded to 5-1 @ `7f6798c6`)

Plan direction 3 (`plans/operations-workspace.md`); no owner gate (standing instruction).

**The receipt on a phone.** Four visible fields: receipt number, amount prefilled with the hospital balance still owed (its
hint says so and names the figure), paid-at prefilled with now, method. "Paid at" moves on to now each time the officer comes
back to the receipt while it is untouched, so a file left open never records an old time. Currency, the amount in that
currency and the receipt copy sit behind "Paid in another currency or with a copy". The currency is a list (the patient's
currency first, then the platform's others, labelled per locale); choosing one makes its amount required; a field refused
inside the closed disclosure opens it. Money and date inputs are `dir="ltr"`.

**The voucher as one line.** Operations reads "Patient pays at the cashier: EGP 195,500 · $3,988.20" (a template, so the
Arabic order is the copy's); every other figure, the voucher number and the frozen rate are behind "The voucher and what is
owed". Finance and the coordinator keep the full facts.

**What moves the case asks first.** The admission number on a cleared case (Operations, and the Consultant after an
emergency admission) confirms with the number typed and its effect ("Recording it starts treatment: the case moves to
Treatment in progress…"); a correction does not ask. The point of no return says its effect above the field and confirms
with the time.

**Shared (`panel-parts.tsx`).** `ActForm`: a backend refusal is said at the form ("Not saved." + the portal's own reason,
which on a phone is scrolled out of view), focus moves to that line, typing clears it, and what was typed stays; an optional
`confirm` asks first. `TimeField`: every `datetime-local` in the panel carries its clock hint (reservation, receipt, point of
no return, Finance's fee balance). `Summary`'s chevron now reads its own `<details>`, not a `group`, so a closed disclosure
inside an open one no longer shows the open marker (found on the shots).

**5-2 backlog rows done.** Refusals at the form with focus (every form in the panel); specific submit labels ("Save the
reservation", "Record the letter", "Record the receipt", "Record the admission number" / "Save the corrected number", "Set the
point of no return", "Record the appointment", "Record the fee balance"; `forms.save` / `forms.record` removed); the
reservation's date hint; `paidCurrency` is a list; "First confirmed appointment" for Operations only before admission, and
"Correct the first confirmed appointment" once recorded; the PNR says its effect.

Copy en + ar, inserted textually: `admission.forms.{saveReservation,recordLetter,recordReceipt,amountHint,timeHint,
paidAtHint,otherCurrency,egpOnly,pnrHint,pnrConfirm,numberConfirm,numberConfirmBody,saveNumber,refused,refusedRetry}`,
`admission.money.patientPaysLine`, `admission.firstAppointment.{record,correct}`, `admission.finance.recordFee`; Arabic
"وقت الدفع" / "وقت الاستلام" for the date-and-time fields.

**Reviews** (four read-only reviewers): RB + composition: no CRITICAL/HIGH (MEDIUM fixed: the stale paid-at; LOW fixed: a
rejected command now shows the refusal). Web design guidelines: HIGH ×2 fixed (the refusal pointed "above" with no reason at
the form; the alert was cut off by the focus move to the field — focus now goes to the alert). MEDIUMs fixed: currency and
amount tied, `toFixed(2)` prefill. RTL/i18n: no CRITICAL/HIGH; fixed the one-line template, the PNR hint, «عند», the amount
hint, «وقت». Pro Max: HIGH ×2 fixed (the same refusal reason; the stale paid-at); MEDIUMs fixed (the PNR button aligned under
its hint, the closed disclosure opening for an invalid field, the refusal clearing on input). The rest is in backlog.md
"Area 5 — Operations" (the currency list is not the rated FX list: Operations has no FX read; no pending text; enterKeyHint;
the collapsed disclosure's contents). Design hook 0 on the touched files.

**Verify.** `pnpm typecheck` ok; eslint on the touched files clean; vitest 97 files / 786 tests, 785 pass (the known
`StaffOperationalUi` W-44); `AdmissionPanel.test.tsx` 28/28 (new "the cashier" block: one money line, the disclosure and the
currency list, the refusal at the form with focus and clearing, currency → amount required, PNR confirmation, a correction
without a confirmation, the first appointment before admission only). Playwright on a production build on :3173 (rerun after
the chevron fix; the first run on :3172 was also 58/58): operations-shots (`AREA5_SHOTS=5-2`), consultant-shots,
staff-chrome, hospital-agreement-audit, a11y en+ar — 58/58. Overwritten shots restored. Shots: `screenshots/area-5/5-2/`.

**Next:** slice 5-3 — going home + close (re-critique, after shots, area closed), started in a new session from this branch.

## Control Center — Consultant public profiles (2026-10-17)

The existing Consultant directory, Consultant page and onboarding screen now include the public-profile workflow. The
directory groups Consultants by care area and shows publication, credentialing, availability, affiliation and price-list
badges; order controls are keyboard buttons. The Consultant page edits English and Arabic side by side, mirrors backend
bounds, guards unsaved work, reports version conflicts and previews the real public card and header. The onboarding finish
offers the profile as an optional next step. All new copy is in `en.json` and `ar.json`; Arabic fields use RTL/Cairo with no
tracking, and new targets are at least 44px.

Visual QA used synthetic API fixtures at 390px and 1440px in both languages. The eight production-rendered screenshots are
in `screenshots/consultant-profiles/`; the focused Playwright run passed 4/4 with no horizontal overflow. The Next production
route table marks home, Consultants, Consultant profiles and all care-area pages dynamic (`ƒ`). Portrait upload is the one
visible profile-authoring gap; stored CV portrait references continue to render.

The requested `impeccable detect` executable was not installed in this environment (`pnpm exec impeccable --help` returned
command not found), so no detector result is claimed. The visual review found no overflow or target-size regression; the
2px Petrol top edge remains the sanctioned DESIGN.md signature.

**Verify.** Frontend typecheck and production build pass; touched-file eslint has 0 errors; focused Vitest has 12/12;
the production-rendered Playwright screenshot run has 4/4. Backend `mvn -o -q test` has 974 tests, 0 failures/errors and
3 environment-gated skips; the separately enabled `PostgresJpaMappingTest` passes on disposable PostgreSQL 17 with V1–V107.
