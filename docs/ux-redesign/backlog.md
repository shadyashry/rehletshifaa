# UX redesign backlog

Seeded from the two critiques:

- **Public site:** `.impeccable/critique/2026-10-07T12-52-27Z__dev-rehletshifaa-com.md` (25/40)
- **Portal:** `.impeccable/critique/2026-10-07T13-37-54Z__frontend-src-components-portal.md` (24/40)

Each item lists its severity, its source, the files involved and the suggested Impeccable command. Items marked
done record the commit that fixed them. `/redesign-area` adds MEDIUM and LOW review findings under the matching
area.

Sources: **PC** = portal critique, **SC** = public-site critique, **A11Y** = axe ratchet baseline.

## Patient proposal experience (portal)

Plan: `docs/ux-redesign/plans/patient-proposal.md`.

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Done (pass 1) | The dialog title is third person ("Patient proposal" / "المقترح المقدم للمريض"). It should read "Your proposal" / "مقترحك". | PC | `components/portal/Portal.tsx` (proposal dialog) | clarify |
| Done (pass 1) | Raw proposal statuses reach the patient ("v1 · RELEASED"). Map every status in `statusLabel` to plain words. | PC | `Portal.tsx:753` `statusLabel` | clarify |
| Done (pass 1) | Dates are short US format ("Valid until 12/31/2026"). Use long, localised dates. | PC | `Portal.tsx` | clarify |
| Done (pass 1) | Order the dialog as price → "preliminary, can change" → decision. The terms wall currently comes before the decision. | PC | `Portal.tsx`, `components/PatientProposalDecision*` | clarify / shape |
| Done (pass 1) | Deposit, refund and cancellation terms should sit behind a disclosure, with wording unchanged and marked "pending legal review". | PC | `lib/commercial-terms.ts`, `Portal.tsx` | clarify |
| Done (pass 2) | The terms are English-only on `/ar`. The option chosen at GATE 2 (legal) applies here. | PC | `lib/commercial-terms.ts` | clarify |
| P2 | The terms box is nested inside a tinted panel inside the dialog, which breaks the "no nested cards" rule. | PC | `Portal.tsx` | distill |

## Staff work views (portal)

Plan: `docs/ux-redesign/plans/staff-work-views.md`.

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Done (pass 1) | Copy ignores who is viewing. A Consultant sees "Owned by another coordinator" and "Waiting on: the consultant"; resolve these to "you" for the coordinator, owner or Consultant concerned. | PC | `components/portal/CurrentAction.tsx`, `MyWork.tsx`, `CaseQueue.tsx` | clarify |
| Done (pass 1) | A coordinator sees "Coordinator: Unassigned" on their own case when the name is missing. Add a fallback name. | PC | `CurrentAction.tsx`, `CaseQueue.tsx` | clarify |
| Done (pass 1) | Plurals are wrong ("1 cases", "1 work items", "1 documents"). Use `Intl.PluralRules`. | PC | `CaseQueue.tsx`, `MyWork.tsx`, `Portal.tsx` | clarify |
| Done (pass 1) | Raw enum values reach the screen ("NORMAL", "cardiology"). Map them to words in both locales. | PC | `CaseQueue.tsx`, `MyWork.tsx`, `CurrentAction.tsx` | clarify |
| Done (pass 2) | "Assign a verified consultant" breaks the never-say-"Verified" rule and the capital C in "Consultant". | PC | `Portal.tsx` / `ConsultantRouting.tsx` | clarify |
| Done (run 2: the case number is the title only when there is no name, and is not repeated) | The case number is repeated as the title when there is no patient name. | PC | `CaseQueue.tsx` | clarify |
| Done (pass 2) | "Assign consultant" only scrolls to a second "Confirm assignment" panel, so there are two controls for one job. | PC | `CoordinatorActions.tsx`, `ConsultantRouting.tsx` | distill |
| Done (pass 2) | "No eligible Consultant" is a dead end. Add a next step (escalate or request staffing). | PC | `ConsultantRouting.tsx` | onboard / harden |

## Staff home and shell (portal)

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Done (pass 2) | Multi-hue stat tiles (violet, sky, stone) repeat the tab counts, and the colours are outside the petrol family. | PC | `components/portal/RoleDashboardSummary.tsx` | distill |
| Done (pass 2) | The toolbar shows 6+ controls before the first case. List/Cards and "Select page" have no bulk action to support them. | PC | `CaseQueue.tsx` | distill |
| Done (pass 2) | The home lands on an empty "My work" tab while the cases sit one tab away. Land on the first tab that has work. | PC | `Portal.tsx`, `CaseQueue.tsx` | distill |
| Done (pass 2) | The public marketing footer appears on staff screens. Replace it with a slim app footer (owner decision). | PC | `components/Footer.tsx`, portal layout | distill |
| P3 | No keyboard shortcuts or saved views for coordinators. | PC | `CaseQueue.tsx` | shape |
| P3 | The finance home is only an empty state plus one link. | PC | `Portal.tsx` | onboard |
| P3 | On phones, coordinator rows put a lone checkbox above the case name. | PC | `CaseQueue.tsx` | adapt |

## Portal system drift

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Done (pass 2 sweep) | Labels are set at 0.7rem, 0.72rem, 0.75rem or `text-xs`, below the 13px floor (37+ in `Portal.tsx`). | PC | `Portal.tsx`, `CaseQueue.tsx`, `ClinicalReview.tsx`, `MyCare.tsx`, `JourneySnapshot.tsx` | typeset |
| Done (pass 2 sweep) | `rounded-xl` is used about 40 times instead of the 6/8px radii. | PC | portal components | polish |
| Done (pass 2 sweep) | Five `border-s-4` side-stripe callouts. | PC (detector) | `NotificationBell.tsx:101`, `Portal.tsx:339/454/479/639` | polish |
| Partly done (washes gone; amber status tones wait for B1 status tokens) | Amber tones, plus petrol-50 and cream washes behind the My Care cards. | PC | `MyCare.tsx`, `Portal.tsx` | polish |
| P2 | Nested cards: the "Services & costs" table and the Consultant intake summary. | PC (detector) | `Portal.tsx`, `ClinicalReview.tsx` | distill |
| P2 | "Mark read" buttons are 32px tall and don't say which message they apply to. | PC | `CaseMessages.tsx` | harden |
| P2 | An h2 on My Care ("other cases") is styled as an 11.5px uppercase label. | PC | `MyCare.tsx` | typeset |
| P3 | The tab list wraps onto two rows on phones in Arabic (Consultant view). | PC | `Portal.tsx` | adapt |
| P3 | Message timestamps use short US format. | PC | `CaseMessages.tsx` | clarify |
| P3 | Currency is shown three ways ("$US 4,850.00", "4,850 US$", "$4,850"). | PC | `MyCare.tsx`, `Portal.tsx` | clarify |
| P3 | Latin initials and country names appear on Arabic pages. | PC | `MyCare.tsx`, `Portal.tsx` | harden |
| Done (pass 2) | Nothing on My Care shows a representative whose account this is. | PC | `MyCare.tsx`, `PatientNav.tsx` | shape |
| P3 | Every portal view has the same page title, "RehletShifaa". | PC (detector) | `app/[locale]/portal/page.tsx` | harden |
| Done | P0 My Care reload loop for linked patients. | PC | `AuthProvider.tsx`, `Portal.tsx`, `e2e/my-care.spec.ts` | harden (`6ea32d2`) |

## Public site — journey and cost model

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| P2 | Four different step models (4 / 7 / 5 / 3). Use one canonical 4-stage model, with sub-steps only on How it works. | SC | `components/home/*`, `components/journey/*`, `care-areas/CaseRouter.tsx` | clarify |
| P2 | "9 care areas" is shown above 6 cards. Use "body systems" for the 6 and "care areas" for the 9. | SC | `messages/*.json`, `home/CarePathways.tsx` | clarify |
| P2 | The care-areas H1 "Choose the care area closest to your need" contradicts the later "you don't need to choose". | SC | `messages/*.json` (`careAreasPage`) | clarify |
| P2 | "Final quote" appears on no page. Add a preliminary-estimate → final-quote diagram to How it works. | SC | `components/journey/*` | shape |
| P2 | The intake form asks about a travel package before any proposal exists. | SC | `components/CaseForm.tsx` | clarify |
| P2 | The coordinator is never introduced (name, face, languages, hours). | SC | `components/home/*` | shape |

## Public site — pages and form

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| P2 | Care-area detail pages still carry a hero button plus the closing link (two routes to the form). | SC (polish) | `components/care-areas/CareAreaDetail.tsx` | distill |
| P2 | How it works: the "You" and "Next" labels are 10.5–11.5px, and phase headings have 0px of space above them. | SC (detector) | `components/journey/*` | typeset / layout |
| P2 | Consultants: an h2 is followed by h4 cards (a skipped heading level). | SC (detector) | `consultants/ConsultantPanel.tsx`, `ConsultantCard.tsx` | harden |
| P2 | Consultant cards stack about six levels of information, and the page is 13k px tall on phones. | SC | `consultants/ConsultantCard.tsx` | distill |
| P2 | `PageHero` uses a radial gradient with a physical 88% position, which is not mirrored in RTL. | SC | `components/PageHero.tsx:22` | polish |
| P2 | The CaseForm upload area uses `rounded-2xl`/`rounded-xl`, `bg-mist` and `shadow-sm`. Form copy is hard-coded in a `t` object instead of the message files. | SC | `components/CaseForm.tsx` | polish / clarify |
| P2 | Scroll-driven reveals hide about 47% of the home page until it is scrolled, and some reveals blur. | SC (detector) | `app/theme-petrol.css` | animate |
| P3 | Title Case headings ("Send Your Medical Case", "Your Case Has Been Received"). | SC | `messages/*.json` | clarify |
| P3 | Consultant cards: "Professional distinction" repeats the job title; the CV qualifiers are inconsistent; a Germany-based Consultant has no explanation. | SC | `lib/consultants.ts`, `lib/attached-consultants.ts` | clarify |
| P3 | `CarePathways.tsx:58` "View all care areas" fires the `send_case_cta_clicked` analytics event. | SC | `components/home/CarePathways.tsx` | harden |
| P3 | No Track case link in the footer. | SC | `components/Footer.tsx` | clarify |
| P3 | 12px phone gutters, and text touches the viewport edge in 21 places. | SC (detector) | `app/globals.css` `.container-site` | adapt |
| P3 | Every page logs a CSP error blocking the Cloudflare Insights beacon (site config). | SC | `next.config.ts` | — |
| A11Y | `en/care-areas` `color-contrast`: the decorative body-system numerals "01–06" are 1.92:1 (`text-brand-600/40`). | A11Y | `app/[locale]/care-areas/page.tsx` | polish |
| Done | "Verified" claims removed (`adcf0d6`). WhatsApp prefills localised, "cardiac" dropped, Arabic eyebrow tracking fixed (`e01c663`). Representative dial code (`395c002`). Index-page CTA stacking (`6f123da`). AA placeholders (`7061d9c`). | SC | — | — |

## Portal — engineering, accessibility and RTL (Phase 4 reviews, 2026-10-07)

These items come from three read-only reviews of `frontend/src/components/portal`, merged with duplicates removed
and the stricter severity kept:

- **AU:** Impeccable audit, with axe and keyboard probes on synthetic fixtures.
- **WG:** web-design-guidelines review.
- **RB:** vercel-react-best-practices and composition-patterns review.

Severity mapping: CRITICAL → P0, HIGH → P1, MEDIUM → P2, LOW → P3. Items already listed above are not repeated.

### Safety and data integrity

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Done (`6f561e6`) | `WorkspaceView` (and `ProposalSendForm`, `FinalAssessment`, `FinalQuoteActions`, `RoleActions`) has no case key. Opening another case without returning to the queue (notification bell, `openCaseById`, `otherCases`) keeps the previous case's typed drafts and dialog flags, so they can be submitted against the wrong patient's case. Fix: `key={workspace.caseSummary.id}`. (verified) | RB | `Portal.tsx:216` | harden |
| Done (pass 2; leaving the case still discards drafts — P2) | Drafts are lost on a tab switch or "My dashboard". The clinical review, proposal notes, final assessment and operations plan live in tab-panel state that unmounts. Keep the panels mounted, or lift the drafts and warn when a form is dirty. | WG | `ClinicalReview.tsx:51`, `Portal.tsx:649/685/750` | harden |
| Done (pass 2) | Bulk "Take ownership" clears errors per case and reports success even if one claim failed. Report "N of M" and keep the failed rows selected. | WG, AU | `CaseQueue.tsx:215` | harden |
| Done (pass 2) | Bulk "Request information" stops at the first failure. Resubmitting sends a second request and email to patients who already received one. Drop the succeeded cases and show a result per case. | WG | `RequestInformationDialog.tsx:82` | harden |
| Done (pass 2) | The Arabic preliminary-estimate disclaimer is weaker than the English one. It omits non-binding, "not a price guarantee" and "may increase or decrease". | AU | `MyCare.tsx:255/272`, `CaseMessages.tsx:38` | clarify |
| P2 | Recording a refund has no confirmation. Submitting a second opinion permanently ends access with no confirmation. "Resend link" silently revokes the current link. | WG | `Portal.tsx:731/746`, `ConsultantRouting.tsx:174`, `CoordinatorActions.tsx:478` | harden |
| P2 | "Request changes" can be sent with an empty note. `RecordPatientResponse` lets required items be blank. | WG | `CaseMessages.tsx:38`, `RecordPatientResponse.tsx:62` | harden |

### Feedback, focus and state

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Done (pass 2) | `<fieldset disabled={busy}>` around the whole workspace disables the focused control on every action. Focus drops to `<body>` and is never restored, and the workspace dims to 65%. Confirmed with a keyboard probe in en and ar. | AU, WG | `Portal.tsx:418/363/365`, `app/globals.css:731` | harden |
| Done (pass 2) | Success and error notices render behind an open modal `<dialog>`, so drawer actions show no result. This affects More actions, Transfer ownership, Request info and the patient decision. Errors far down the page appear only in the top banner. | WG | `Portal.tsx:212` | harden |
| P2 | `refresh` has no stale-result guard, and one shared `busy` flag serves concurrent loads. Reference-data effects are not cancelled or reset when the role changes. | RB | `Portal.tsx:110/134-136` | harden |
| P2 | `refreshMe` blanks `me`, so Portal returns the loading frame and unmounts the tree (dialogs and drafts are lost). Keep the previous `me` while revalidating. | RB | `AuthProvider.tsx:41`, `Portal.tsx:191` | harden |
| P2 | Missing empty states: an empty message thread; TeamAssignment with nobody in the role; a care-area select whose value is not among its options. | WG | `CaseMessages.tsx:20`, `CoordinatorActions.tsx:87`, `ConsultantRouting.tsx:126` | onboard |
| P2 | `PatientIdentityStep` always receives `identity={null}`, so the PENDING and REJECTED states never render. | WG | `Portal.tsx:362` | harden |
| P2 | `WorkforceAdoptionPanel` accept has no busy state, so a double-click sends twice. | WG | `WorkforceAdoptionPanel.tsx:38` | harden |
| P3 | Every action shows the generic "Saved successfully"; "Retry" only reloads the queue; the copy-link failure is silent; the completion note closes before its result is known. | WG | `Portal.tsx:184/212/681`, `CurrentAction.tsx:78` | clarify |

### Accessibility and semantics

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Done (pass 2) | Unlabelled controls: the discharge-document select; the FinalAssessment currency select; manual service and amount inputs labelled only by placeholder; an English "remove" aria-label. | AU, WG | `CaseWorkflowActions.tsx:17`, `Portal.tsx:696/699` | harden |
| Done (GATE 2, `--color-ink-350`) | Text-field borders are `--color-line-strong` (1.66:1 on white), below the 3:1 non-text contrast WCAG 1.4.11 requires. Token decision at GATE 2. | Tokens | `app/globals.css` `.field`, `theme-petrol.css` | polish |
| Done (pass 2) | A hard-coded English `aria-label="Confirmed arrival"` overrides the Arabic label (label-in-name). | AU, WG | `CaseWorkflowActions.tsx:16` | clarify |
| P2 | Broken unread-badge names ("Messages1 unread"). The staff Messages badge shows the total, not the unread count. Unread notifications and overdue tasks are shown by colour only. | AU, WG | `PatientNav.tsx:30`, `MyCare.tsx:55/212`, `Portal.tsx:402/603`, `NotificationBell.tsx:101` | harden |
| Done (run 2: `tabKeyTarget` flips arrows in RTL and adds Home/End on every portal tablist) | Tablist arrow keys don't flip in RTL (ArrowLeft jumps to the far tab), and Home/End are missing. | AU, WG | `Portal.tsx:260/424`, `CaseQueue.tsx:143` | adapt |
| P2 | My Care card titles are `<p>`, not headings. `CaseMessages` puts an h3 under the h1 (axe heading-order in en and ar). | AU | `MyCare.tsx:147/187/202/219`, `CaseMessages.tsx:18` | harden |
| Done (pass 3: Mark read, Mark all read, Retry, My dashboard, View proposal, View full journey are 44px; copy/chip/checkbox hit areas were 44px already) | Tap targets: copy button 13px, chip remove about 17px, row checkboxes 16px, `!min-h-9` (36px) buttons, tabs 40–41px, "Back to dashboard" 33px. | AU, WG | `CaseQueue.tsx:179/206/253-297`, `Portal.tsx:212/378/531` | adapt |
| P2 | The coordinator lock is `pointer-events-none opacity-50` only, so the release buttons stay keyboard-operable. | AU | `Portal.tsx:310` | harden |
| Done (pass 2: the count line replaced the tiles; zero counts are omitted) | Zero-value dashboard tiles are `disabled` at 0.55 opacity (about 2.6:1). | AU | `RoleDashboardSummary.tsx:69` | polish |
| P2 | Repeated "Open/View/Download" buttons with no item context. Role-switcher active state is shown by styling only. `role="dialog"` on the inline `AccountLinkRequest` card. A focusable "disabled" mailto. | WG | `MyWork.tsx:87`, `CaseQueue.tsx:256`, `Portal.tsx:208/682`, `AccountLinkRequest.tsx:84` | harden |
| P3 | Popovers with `role="dialog"` don't move focus. The result-count live region re-announces on every keystroke. Smooth scroll ignores reduced motion. "✓/♥" glyphs are read aloud. No new-tab notice. | AU, WG | `CaseQueue.tsx:164/223`, `NotificationBell.tsx:79`, `Portal.tsx:194/336`, `PortalAccount.tsx:95` | harden |

### RTL, i18n and formatting

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Partly done (`CurrentAction`, `JourneySnapshot` reset in RTL; `MyCare` kickers, `AssignmentHistory`, `CaseBlockers`, `ClinicalReview` h4s still track in Arabic) — P2 | `tracking-[0.08–0.1em]` and `uppercase` on Arabic micro-labels (computed 1.15px letter-spacing on "الخطوة الحالية"). Add an RTL reset or use `.eyebrow`. | AU, WG | `MyCare.tsx:95/147/187/202/219`, `Portal.tsx:434-612`, `CurrentAction.tsx:45`, `JourneySnapshot.tsx:28`, `MyWork.tsx:108`, `PortalAccount.tsx:62` | typeset |
| P2 | `dir="ltr"` on Arabic money blocks flips alignment and digit order. Wrap only the figure in `<bdi>`. | AU, WG | `MyCare.tsx:148/155/188` | adapt |
| Partly done (staff views share `careAreaLabel`; `MyCare.tsx` `careArea` keeps its own 3-area map) — P2 | Care-area labels: two local maps cover 3 of 9 areas, disagree with each other, and fall back to English slugs on Arabic pages. Use one shared source. | AU, WG | `MyCare.tsx:349`, `Portal.tsx:763`, `MyWork.tsx:72` | clarify |
| P2 | One total is formatted with 0 and 2 decimals in different places. Use one shared money formatter. | WG, AU | `Portal.tsx:517/717/760`, `MyCare.tsx`, `ClinicalReview.tsx` | clarify |
| P2 | Date of birth is parsed as UTC midnight, so it shows the previous day west of UTC. | WG | `PortalAccount.tsx:67` | harden |
| P3 | Dates without a year; raw FX rate and ISO date; hard-coded "KB/MB"; English "Bank" placeholder and English error fallbacks in the Arabic UI; the wrong-account case detected by an English regex; Arabic IME Enter not guarded. | WG, AU | `CaseQueue.tsx:286`, `Portal.tsx:665/727/764`, `PortalDirectories.tsx:10`, `AccountLinkRequest.tsx:68`, `RequestInformationDialog.tsx:132` | clarify |

### Design-system drift (beyond items above)

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| P2 | Status, priority and attention chips and the journey "blocked" state use Tailwind amber, emerald, sky and stone colours with rounded-full pills. Map them to the status tokens (GATE 2) and the 8px badge. | AU | `Portal.tsx:768`, `CaseQueue.tsx:54-62`, `MyWork.tsx:64/103`, `JourneySnapshot.tsx:36-56` | colorize / polish |
| Done (pass 2 sweep: no `sand-*` or `brand-50` fill left in `MyCare.tsx`) | The deposit panel uses `sand-50/200` (not remapped by petrol), and the current step fills with `brand-50`. Both break the Two Surfaces rule. | AU | `MyCare.tsx:94/146` | polish |
| Partly done (pass 2: queue Open is secondary, My work has one filled lead item and quiet links; Claim/Accept on a queue row stay filled) — P3 | A filled petrol "Open" on every queue row and work card (up to 12 per page) breaks the One Action rule. | AU | `CaseQueue.tsx:256`, `MyWork.tsx:87` | quieter |
| P3 | `PortalFrame` uses a gradient with a hard-coded `#fff`; old-palette `rgba(28,51,58)` shadows; `shadow-xl`/`rounded-2xl` popovers. | AU | `Portal.tsx:236`, `CurrentAction.tsx:43`, `PortalAccount.tsx:49`, `NotificationBell.tsx:80`, `CaseQueue.tsx:165` | polish |

### Performance and code structure

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Done (pass 2) | `api` depends on the whole `user` object, so every silent token renewal re-runs the queue effect (clears the cases), refetches reference data, restarts polling, and wipes ConsultantRouting selections. Key on the subject and read the token from a ref. | RB | `Portal.tsx:109`, `ConsultantRouting.tsx:105` | harden |
| Mostly done (pass 2: workspace + documents in parallel, no duplicate fetch from My work, refresh + reload in parallel; bulk claim stays sequential by design) | Serial waterfalls: `openCaseById` makes 3 round trips including a duplicate fetch; workspace and documents load sequentially; `mutate` runs refresh then openCase (4–5 trips per click); bulk claim does this N times. | RB, AU | `Portal.tsx:145/163/182-185`, `CaseQueue.tsx:215` | optimize |
| Partly done (pass 2: role-specific panels lazy-loaded; a full patient/staff split stays P2) | `Portal.tsx` is one 132 KB client module importing every role's UI. Split it into patient and staff modules by role and lazy-load dialogs and drawers. | RB, AU | `Portal.tsx:3`, `app/[locale]/portal/page.tsx` | optimize |
| P2 | Lint `set-state-in-effect`, `refs` and `purity` errors (12 in scope), each with a concrete fix in the RB report: queue loading derived state, `?role=` lazy init, `Date.now()` in render, dialog ref read in render, a shared `usePortalSlot` hook, the view-mode lazy init, directory and adoption loaders. | RB | `Portal.tsx:108/114/168/173/666`, `PortalAccount.tsx:38/55`, `NotificationBell.tsx:34`, `CaseQueue.tsx:87`, `PortalDirectories.tsx:11`, `WorkforceAdoptionPanel.tsx:20` | harden |
| P2 | Composition: 27 `useState` hooks in Portal, 26 props into `WorkspaceView`, 8 boolean dialog flags. Introduce a `CaseWorkspaceProvider`, split the patient and staff views, and use one dialog union state. | RB | `Portal.tsx:276/323` | — |
| P2 | `role={currentRole!}` can crash `WorkspaceView` when `/me` fails while a case is open. | RB | `Portal.tsx:216/285` | harden |
| P3 | The hidden queue re-renders under the workspace; formatters are rebuilt on every render; polling continues in hidden tabs; both locales' copy ships to the client; dead code (`PatientStatusCard`, `PATIENT_JOURNEY` and `TaskActions` removed in pass 2; a no-op `Panel wide` and the MyCare timeline no-op remain). | RB, WG, AU | `Portal.tsx`, `NotificationBell.tsx:41`, `CaseMessages.tsx:29`, `MyCare.tsx:235` | distill |

## Patient proposal — deferred review findings (`/redesign-area` run 1, 2026-10-07)

Four reviewers ran on the redesigned patient proposal:

- **RB:** react-best-practices and composition-patterns.
- **WG:** web-design-guidelines.
- **I18N:** RTL and i18n.
- **PM:** the Pro Max pre-delivery checklist.

The two HIGH findings, a failed decision hidden behind the modal and Arabic amounts reading "$US", were fixed in
the run. So were these in-area MEDIUM items:

- the note label and validation contradicted each other;
- the Arabic disclaimer and acknowledge wording;
- bidi isolation and `dir="auto"` for free text;
- the blocked-note variant for quotes;
- a summary chevron;
- the expiry date shown in the viewer's time zone;
- per-currency decimals;
- `Object.hasOwn`;
- the dead old decision component.

The items below are deferred.

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Done | The terms disclosure now opens by default while a decision is owed (owner decision at GATE 3). | RB, WG, PM | `components/portal/PatientProposal.tsx` | — |
| Done (pass 3: `--button-disabled-bg/fg/border`, Petrol only) | The disabled primary button relies on `opacity .55` (white on #7aa7ab, 2.64:1). Add `--button-disabled-bg/fg/border` tokens; on `/ar` it stays disabled for good. | PM | `app/globals.css` (`button:disabled`) | polish |
| Done (pass 3: ink-350, 3.63:1; outline buttons too) | `--button-secondary-border` = line-strong (1.66:1). Point it at `--color-ink-350` (3.63:1), the same as fields. This is a token change that needs the owner. | PM | `app/globals.css` | polish |
| Done (pass 3: `.field:focus-visible` keeps the 3px ring) | `.field:focus { outline: 0 }` replaces the 3px ring with a 1px border change and a 1.26:1 halo. | PM | `app/globals.css` | polish |
| Done (pass 2) | Decline uses `window.confirm` over the modal (browser-language buttons, no consequence text). Use an in-drawer confirm step in en and ar. | WG | `PatientProposal.tsx` | harden |
| Done | Done in Phase 6 polish: the drawer returns focus to the control that opened it. | RB, WG | `Portal.tsx` `CaseDrawer` | harden |
| Done (pass 2: the workspace fieldset is gone; the ask button reads "Sending…" while busy) | `<fieldset disabled={busy}>` dims the whole document and drops focus while sending, with no "Sending…" label. This is the same root cause as the portal P1. | WG, PM, RB | `Portal.tsx:368` | harden |
| P2 | The primary is disabled until the box is ticked, with no reason that keyboard or screen-reader users can reach. | WG, PM | `PatientProposal.tsx` | harden |
| P2 | Optional items are priced but excluded from the total and can't be selected, and nothing says so. | WG | `PatientProposal.tsx` | clarify |
| Done (pass 2) | The Arabic blocked note asks the patient to switch to English but has no direct link to the same view in `/en`. | WG | `PatientProposal.tsx` | harden |
| P2 | The terms id `portal-deposit-terms` is hard-coded and shared across components, and the checkbox description reads the whole English terms block. Use `useId` and a short summary target, and test the real target. | RB, WG | `PatientProposal.tsx`, `CoordinationDepositTerms.tsx`, test | harden |
| P3 | Fixed section ids and a region landmark per section; an unnamed fieldset group around the read-only document; an inline `mutate` wrapper (use `onDecided`); formatters rebuilt per item. | RB | `PatientProposal.tsx`, `Portal.tsx` | distill |
| Done | Done in Phase 6 polish: the drawer header and Close stay pinned while the content scrolls. | PM | `Portal.tsx` `CaseDrawer` | adapt |
| Done | Done in Phase 6 polish: the dialog is named by its h2 through `aria-labelledby`. | WG | `Portal.tsx` | harden |
| P3 | A typed note is lost on Esc or close without a warning. | WG | `PatientProposal.tsx` | harden |
| P3 | Decimals vary per amount within one document ("$4,850" beside "$120.50"). | WG | `PatientProposal.tsx` | clarify |
| P3 | "Ready for your decision" (drawer) vs "Ready to review" (My Care card): use one phrase. Buttons mix "&" and "and". | WG | `messages/*.json`, `MyCare.tsx` | clarify |
| P3 | The quote's `paymentTitle` is a bold `<p>`, not a heading. The three decision buttons wrap unevenly. | WG | `PatientProposal.tsx` | layout |
| P3 | `CoordinationDepositTerms`: a 12px-radius card with `bg-white` inside the disclosure, one-off type sizes (0.82–0.95rem), and a small, low-contrast Arabic notice (0.82rem, ink-600). | WG, I18N | `components/CoordinationDepositTerms.tsx` | polish |
| P3 | Arabic: masculine address throughout (use neutral phrasing where cheap); "عرض" alone is ambiguous (offer vs display); `{count}` is not formatted with Intl. All pending native review. | I18N | `messages/ar.json`, `PatientProposal.tsx` | clarify |

## Staff work views — deferred review findings (`/redesign-area` run 2, 2026-10-07)

Four reviewers (RB, WG, I18N, PM) found 7 HIGH issues. All were fixed in the run:

- "you" decided by role instead of ownership;
- the workspace and the queue disagreeing about the coordinator;
- English work-item titles in Arabic (×2);
- 13–17px copy, chip-remove and checkbox hit areas (×3).

These in-area MEDIUM items were fixed too:

- the RTL "Case RS-…" order;
- "Assign a verified consultant" (moved to messages);
- the patient's own "Waiting on";
- the due-date format;
- Arabic letter-spacing in the journey strip;
- Arabic ownership wording (ملكية → مسؤولية) and one Arabic "take ownership";
- RTL arrow keys plus Home/End on every portal tablist;
- 44px tabs;
- one care-area label source (`prettyCategory` removed).

The items below are deferred.

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Done (pass 3) | **Backend follow-up.** Work-item titles and context are English text from the backend. Arabic now shows a per-type title, but the context stays English. Emit a title code plus parameters instead of prose. | I18N | backend `CaseActionService`, `JourneyService`, `PatientActionService`; `MyWork.tsx`, `CurrentAction.tsx` | harden |
| Partly done (pass 3 follow-up: referrals, deposit/travel handoffs, coordinator routing, staff notifications and the waiting reason carry codes; journey-runtime action handlers keep their admin-defined node labels, which are content, not code) — P3 | Work still worded only in English: `ConsultantReferralService` (transfer / second-opinion offers and confirmations), `CaseHandoffService` (deposit, travel), `AssignmentEngine` (coordinator routing), the journey-runtime action handlers (node labels), staff notifications (`NotificationView`) and `waitingReason` ("Waiting for the patient: …"). Give each a `WorkCopy` code. | Pass 3 | backend services above; `NotificationBell.tsx`, `Portal.tsx` | harden |
| P2 | `WorkItem` has no `coordinatorSubject`, so My Work still prints your own name where the queue says "You". This needs a field in the work API. | WG | backend work API, `MyWork.tsx` | harden |
| P2 | The work-copy context carries no locale, so callers pair a `locale` prop with context copy (a mismatch is possible). Put the locale in the context value. | RB | `portal-copy.tsx`, `portal-labels.ts` | harden |
| Done (pass 3: `intlLocale()`; the page counter and badge format through it) | Numbers rely on the engine's default numbering system for "ar". Pin one system (e.g. `-u-nu-latn`, per the Western-digits default) in `plural()`, dates and money. The page counter and filter badge are raw numbers. | I18N, RB | `portal-labels.ts`, `CaseQueue.tsx` | harden |
| Done | Done in Phase 6 polish: pressed state has a petrol ring; toggle, Clear all and row/bulk/pager buttons are 44px. | PM | `CaseQueue.tsx` | polish |
| Done (pass 3, same fix) | Search and sort fields have no focus outline (`.field:focus { outline: 0 }`, halo about 1.2:1). This is global and duplicates the patient-proposal item. | PM | `app/globals.css` | polish |
| P3 | `categoryLabel` and `statusLabel` props are now partly redundant with the context. `waiting` and `priority` mix enum keys with UI keys (nest them). Build `buildWorkCopy(locale)` once for the page and the tests. Cache `Intl` objects. Use React 19 `use()`. Add a placeholder-parity test. | RB | `CaseQueue.tsx`, `portal-labels.ts`, `page.tsx`, `test-copy.tsx` | distill |
| P3 | JourneyPulse and FullJourneyDialog still carry inline `ar ? …` strings (Journey, phases, View full journey), and the timeline note lacks `dir="auto"`. | RB, WG, I18N | `JourneySnapshot.tsx` | clarify |
| Done | Done in Phase 6 polish: copy is announced, the chip remove names its value, the pager reads "Page {page} of {pages}", no zero count beside an empty state, no empty grid subtitle. | WG, RB | `CaseQueue.tsx`, `MyWork.tsx` | harden |
| Done | Done in Phase 6 polish: the label is 13px (0.8125rem). | WG | `CurrentAction.tsx` | typeset |
| P3 | Queue tab `tabIndex` follows a stale `focused` value after blur. Date chips show ISO dates. Country names stay in English. `FilterSelect` sorts by code, not by the localised label. | I18N | `CaseQueue.tsx` | harden |
| P3 | Arabic wording (pending native review):<br>• "الشروط المالية" vs "الشروط التجارية";<br>• "تعيين قسم المالية";<br>• "تقديم الرأي الطبي الثاني" in `currentAction.work`;<br>• feminine priority adjectives;<br>• "تمّت تسوية الوديعة";<br>• the «إجراءات إضافية» label vs the "المزيد" button (also English "More actions" vs "More");<br>• "عملي" → "مهامي";<br>• the date-filter fragments;<br>• "حالة الطلب" → "وضع الحالة";<br>• consistent shadda on منسّق.<br>English: one term for "no coordinator yet". | I18N, WG | `messages/*.json`, `Portal.tsx` | clarify |
| P3 | `ConsultantRouting`: "No eligible consultant is available…" is lowercase and still a dead end (see the P2 above). | WG (screenshot) | `ConsultantRouting.tsx` | clarify |

## Portal re-critique (Phase 6, 2026-10-08) — new and re-ranked items

Source: `.impeccable/critique/2026-10-07T21-50-23Z__frontend-src-components-portal.md`, 25/40 (up from 24/40).

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Done (pass 2) | Arabic patients cannot accept a proposal but can decline it. This follows the owner's GATE 2 decision (option B). Proposed: a coordinator-mediated path ("your coordinator goes through the terms with you in Arabic and records your decision"; `RecordPatientResponse` exists), de-emphasise Decline while Accept is blocked, and treat Arabic terms approval as a launch blocker. **Owner decision needed.** | Re-critique A | `PatientProposal.tsx`, `lib/commercial-terms.ts` | clarify / harden |
| Done (pass 2) | Coordinator case: the current-action "Assign Consultant" button plus a second inline "Assign a Consultant" form with its own button. The care-area select is blank, and "No eligible consultant" has no next step. | Re-critique A | `CurrentAction.tsx`, `CoordinatorActions.tsx`, `ConsultantRouting.tsx` | clarify |
| Done (pass 2) | The staff home is still a template dashboard: off-palette KPI tiles, disabled zero tiles, an empty My work landing, the marketing footer, and no staff navigation in the header. Already planned as the P2 staff-home distill; raised to P1. | Re-critique A | `RoleDashboardSummary.tsx`, `CaseQueue.tsx`, `MyWork.tsx`, `Portal.tsx`, `Footer.tsx` | distill / layout |
| Done (pass 2) | My Care is five boxed cards and never names the patient. A representative ("Care for: [name]") is invisible, and the avatar reads "ME". | Re-critique A | `MyCare.tsx`, `PatientNav.tsx` | layout |
| Done (pass 2; phone sheet, unframed terms) | Proposal drawer: the sticky header and the embedded deposit-terms box count as nested surfaces. The open drawer has a 1px border with a wide shadow. On phones it is a centred modal, not a full-height sheet. | Re-critique B, A | `Portal.tsx` `CaseDrawer`, `CoordinationDepositTerms.tsx` | polish / adapt |
| P2 | The drawer leads with the price, and the label says "recommended services" even when there is no recommendation. Consider the Consultant's recommendation first ("understanding before commitment"). | Re-critique A | `PatientProposal.tsx` | shape |
| P2 | The deposit terms are badged "Pending legal review" but state concrete refund promises (F2 is open). This is a truthfulness tension for legal. | Re-critique A | `lib/commercial-terms.ts` | — (legal) |
| P3 | AR "العرض" (My Care) vs "مقترحك" (drawer); the estimate card says "your treating doctor" where the drawer says "Consultant"; no WhatsApp route in My Care; the coordinator lead isn't labelled as a lead. | Re-critique A | `MyCare.tsx`, `messages/*.json`, `Portal.tsx` | clarify |

## Staff home — deferred review findings (`/redesign-area` run 3, pass 2, 2026-10-08)

Four reviewers ran on the staff home (plan `plans/staff-home.md`):
- **RB:** react-best-practices and composition-patterns;
- **WG:** web-design-guidelines;
- **I18N:** RTL and i18n;
- **PM:** the Pro Max pre-delivery checklist.

These were fixed in the run:
- **HIGH (RB):** a silent token renew re-ran the queue-state restore and sent a landed view back to My work. The restore is now keyed by the subject.
- **Raised to HIGH (RB, WG):** a pressed count that dropped to zero disappeared and left the list filtered with no way out. It now stays visible, pressed, at zero.
- A failed queue load left the count line blank forever.
- Resting underlines on the count toggles and quiet actions.
- The live region now holds only the no-eligible message.
- Spoken separator for nav counts.
- Role switch: `aria-pressed`, and focus returns to the menu button.
- The inline form follows the busy state.
- The dot separator wrapped at the start of a phone line.
- Footer gutter.
- "No cases need action right now."
- "{count} cases overdue".
- Curly apostrophe.
- Neutral Arabic for "الدور الحالي", the unset hint, the Control Center link and the lead line.
- Nav label "أقسام العمل".
- Header nav one-line check at 768/1024.

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Done (pass 3: `?view=` pushed per pick, read on load and on Back/Forward; views are links) | The staff view lives only in sessionStorage. Back/Forward, deep links and "open in new tab" don't reach a view. Write `?view=` as `changeCareView` does, or render views as links. | WG | `Portal.tsx`, `StaffNav.tsx` | harden |
| Done (pass 3: `intlLocale()` in the portal, secure links and activation; Arabic few/many test) | Pin Western digits (`-u-nu-latn`) in `plural()` and the nav count. This is the existing numbering-system item, and this run adds more call sites. Add an Arabic test for a few/many count. | I18N | `lib/portal-labels.ts`, `StaffNav.tsx` | harden |
| P2 | The count line has no live region, so screen-reader users miss updates when counts arrive or change. | WG | `RoleDashboardSummary.tsx` | harden |
| Done (pass 3: focus moves to the view's visible heading; also after My dashboard) | Picking a view from inside a case keeps focus on the header nav. Move it to the view's `<h2>`. | WG | `Portal.tsx` | harden |
| P3 | A failed eligible-consultants load reads as "nobody eligible" with routing advice. Give it its own error state. | RB | `ConsultantRouting.tsx` | harden |
| P3 | "Assign Consultant" is disabled with no reason until a Consultant is picked. Use an inline "Choose a Consultant" error, or a described-by hint. | WG | `CoordinatorActions.tsx` | harden |
| P3 | Row actions in My work are all named "Open"/"Review assignment" (the title is only a description). Add the title as an sr-only part of the name. | WG | `MyWork.tsx` | clarify |
| P3 | `{area}` is interpolated as plain text, so a Latin fallback name can't be wrapped in `<bdi>` on Arabic pages. | I18N | `CoordinatorActions.tsx` | adapt |
| P3 | Memoise `staffViewItems` and pass the counts down instead of re-filtering in `RoleDashboardSummary`. | RB | `Portal.tsx`, `RoleDashboardSummary.tsx` | optimize |
| P3 | `FooterSwitch` serialises both footers into every RSC payload. A portal route-group layout would avoid it. Acceptable for now. | RB | `app/[locale]/layout.tsx` | optimize |
| P3 | The Arabic footer shows the Latin brand, and the "© {year} {brand}" order is fixed in code. Add an Arabic brand string and a copyright template. | I18N | `PortalFooter.tsx`, `messages/*.json` | clarify |
| P3 | Arabic (pending native review): the spelling of "منسّق" vs "منسق" is mixed across portalWork. | I18N | `messages/ar.json` | clarify |
| P3 | The "Current action" kicker above the panel heading (an Impeccable ban, pre-existing). | Impeccable | `CurrentAction.tsx` | typeset |

## Arabic proposal decision — deferred review findings (pass 2 build, 2026-10-08)

Five reviewers ran on the coordinator-mediated decision (plan `plans/arabic-proposal-decision.md`):
- **AUTH:** a backend authorization and correctness review;
- **RB:** react-best-practices and composition-patterns;
- **WG:** web-design-guidelines;
- **I18N:** RTL and i18n;
- **PM:** the Pro Max pre-delivery checklist.

These were fixed in the build:
- an unchecked conversation time that could throw, and focus loss when the "ask" button is replaced;
- masculine Arabic verbs beside a coordinator's name, and the English route worded as an instruction;
- a call before the release, and work left open after expiry or a new version;
- requests on a lapsed version, the acknowledgement-version stamp, and the request race (row lock);
- exact denial codes, plus IDOR, expiry and deposit tests;
- 409/410 on the secure link, busy labels, `hrefLang`, the note-error id, the neutral provenance fallback, bidi isolation of names, and the Arabic context of the work item.

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| **P1 (decision)** | Journey-bound cases: neither the patient's own decisions (portal and secure link post to the direct `/decision` endpoints) nor the recorded decision complete the journey runtime `REVIEW_PROPOSAL` action. This is pre-existing for self-service, and the recorded path keeps parity. Decide whether the UI moves to the `/actions/{id}/proposal-decision` endpoints or the direct paths sync the runtime. Then add a `RecordedDecision` handler variant. | AUTH | `JourneyService`, `ReviewProposalActionHandler`, `PatientProposal.tsx`, `ProposalSign.tsx` | harden |
| Done (pass 2) | The patient is not notified when a decision is recorded (the plan says "notified with the provenance line"). A recorded decline also notifies the recording coordinator about their own action. Needs an outbox template in en and ar, plus legal L4 (dispute window). | AUTH | `JourneyService.applyRecordedDecision`, notification templates | harden |
| Done (pass 3, legal L3 still open) | "Representative" means the submitting contact (`case_submission_contacts.contact_role`), not an authorised `PATIENT_REPRESENTATIVE` link, and no representative id is stored. Now: exactly one in-force link is required and its subject is stored (V75). | AUTH | `ProposalAssistanceService` | harden |
| Done (pass 3 follow-up: authorised representatives on the coordinator's workspace; one is named in the choice, several need a pick, none leaves only the patient) | The staff "Confirmed by → Representative" option shows even when the patient has no authorised representative (the server refuses), and with two representatives the record cannot name one (`REPRESENTATIVE_AMBIGUOUS`). Expose the authorised representatives on the workspace and let the coordinator pick. | Pass 3 | `RecordProposalDecision.tsx`, `ProposalAssistanceService` | harden |
| Done (pass 3: the assisted path starts with the coordinator conversation) | Arabic secure link: the numbered "what happens next" list still starts with "acknowledge this estimate". | Build review | `ProposalSign.tsx` | clarify |
| P2 | Activation's deposit-terms consent on `/ar` is unchanged, pending legal L2. | Plan O1 | `ProfileActivation.tsx` | — |
| P3 | `englishHref` opens the English case without the proposal drawer. Add a deep link that opens it. | WG | `Portal.tsx` | harden |
| P3 | Portal `mutate` returns `undefined` both for a failure and for a skipped overlapping call, so "failed" can show while the first request succeeds. | RB | `Portal.tsx` | harden |
| P3 | Every `proposal(versionId)` read now also loads the assistance facts and a staff name. Compute them only where they are returned. | AUTH | `ProposalQueryService` | optimize |
| P3 | The staff form's Note label doesn't say it becomes required for Request changes. The time field has no `min` (release time) on the client, though the server enforces it. | WG, RB | `RecordProposalDecision.tsx` | clarify |
| P3 | The quiet links' resting underline uses `line-strong` (1.66:1). It is the cue beside near-identical text colours. Consider `decoration-current`. | PM | `PatientProposal.tsx`, `ProposalSign.tsx` | polish |
| P3 | The "requested" line names no channel ("You will hear from …"). Interpolate the patient's actual contact channel once the backend exposes it. | I18N | `messages/*.json` | clarify |

## Pass 2 follow-ups — deferred review findings (autonomous run, 2026-10-08)

One independent read-only review ran over `a9eee09`…`ed57af3`. Fixed in `fix(portal): review follow-ups`: the request-dialog retry total, the busy gap between the parallel refresh and case reload, the My Care chunk preload, a dismissible bulk outcome, the unread notification style, drawers no longer wiping a page error, preferences keyed on the subject, workspace shown before documents, the Cairo-day localised date and escaped JSON in the patient message, Arabic counts without noun agreement, and the `care-coordination` spec missed when the staff navigation changed.

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Done (pass 3) | "Care for …" uses an account-level rule (PATIENT_REPRESENTATIVE without PATIENT). A person with their own record who also acts for a relative sees the relative's case under the bare name. Now from `actions.viewer` per case. | Review | `Portal.tsx`, backend workspace view | harden |
| Done (pass 3: unsent-text guard + in-page dialog on every exit, `beforeunload`) | Leaving the case ("My dashboard") still discards typed drafts. Add a dirty-form warning. | Plan | `Portal.tsx` | harden |
| P3 | The overview and clinical tabs stay mounted, so a Consultant's referral and eligibility reads run on every case open. Mount the clinical tab on its first visit and keep it mounted afterwards. | Review | `Portal.tsx` | optimize |
| P3 | A full patient/staff module split of `Portal.tsx` (role panels are lazy now). | RB | `Portal.tsx` | optimize |
| Duplicate of the P3 under "Arabic proposal decision" | `mutate` returns the same value for a failure and for a call skipped while another runs. | RB | `Portal.tsx` | harden |

## Portal P2s — deferred review findings (pass 3 step 4, 2026-10-08)

Four read-only reviewers ran on `plans/portal-p2-pass-3.md`: RB (react-best-practices + composition), WG (web-design-
guidelines), I18N (RTL/i18n), PM (Pro Max pre-delivery checklist). Fixed in the run: a role switch with a draft never
switched (RB HIGH); a saved draft still warned (RB HIGH); Back to a landing entry without `?view=` did nothing (RB HIGH);
focus went to the summary's sr-only heading and the test hid it (WG HIGH ×2); activation and status links still used
Arabic-Indic digits (I18N HIGH ×2); the pushed case entry left a dead Back step; Back with a draft added entries; the
previous role's `?view=` carried over; entries of another role were applied; focus fell to `<body>` after My dashboard;
dialog DOM order; "Leave without saving" wording; `returnValue`; the disabled style leaking into the Control Center;
a text-arrow glyph; 36px View proposal and 32px View full journey; feminine Arabic "another coordinator".

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| Done (pass 3 follow-up: `portalWork.plural.services`) | The services count is a raw template (`${services} خدمات`): wrong Arabic for 2 and 11+. Add `portalWork.plural.services`. | I18N | `Portal.tsx` | clarify |
| Done (pass 3 follow-up: isolated name; timeline actor in `<bdi>`) | `t.handoff.replace("{name}", …)` puts a Latin Consultant name into Arabic without isolation; the timeline's `· {actorName}` likewise. | I18N | `Portal.tsx`, `JourneySnapshot.tsx` | adapt |
| P3 | An action in the same panel rebaselines the whole panel (outermost form/section/dialog), so text typed beside a different successful action in that panel stops counting as unsent. Messages typed in the staff Messages drawer are still lost when the drawer closes (pre-existing). | Build | `LeaveCaseGuard.tsx`, `Portal.tsx` | harden |
| P3 | Opening case B from inside case A (bell, My work, other cases) replaces the entry, so Back from B returns to the view, not to A. Intended for now. | RB | `Portal.tsx` | — |
| P3 | `LeaveCaseDialog` opens on mount only; any future path that swaps the pending exit without an unmount would leave it closed. Key it per request if such a path appears. | RB | `LeaveCaseGuard.tsx` | harden |
| P3 | Arabic: منسّق vs منسق mixed across portalWork; `PROPOSAL_TERMS_CALL` says «المقترح» where siblings say «العرض» and its context is masculine. Pending native review. | I18N | `messages/ar.json` | clarify |
| Done (pass 3 follow-up: `portalWork.proposalVersion`, Intl unit file sizes) | A Latin "v{versionNumber}" in the Arabic proposal summary; `formatBytes` uses `toFixed` and English KB/MB. | I18N | `Portal.tsx` | clarify |
