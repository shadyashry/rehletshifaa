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
| P1 | The dialog title is third person ("Patient proposal" / "المقترح المقدم للمريض"). It should read "Your proposal" / "مقترحك". | PC | `components/portal/Portal.tsx` (proposal dialog) | clarify |
| P1 | Raw proposal statuses reach the patient ("v1 · RELEASED"). Map every status in `statusLabel` to plain words. | PC | `Portal.tsx:753` `statusLabel` | clarify |
| P1 | Dates are short US format ("Valid until 12/31/2026"). Use long, localised dates. | PC | `Portal.tsx` | clarify |
| P1 | Order the dialog as price → "preliminary, can change" → decision. The terms wall currently comes before the decision. | PC | `Portal.tsx`, `components/PatientProposalDecision*` | clarify / shape |
| P1 | Deposit, refund and cancellation terms should sit behind a disclosure, with wording unchanged and marked "pending legal review". | PC | `lib/commercial-terms.ts`, `Portal.tsx` | clarify |
| P1 | The terms are English-only on `/ar`. The option chosen at GATE 2 (legal) applies here. | PC | `lib/commercial-terms.ts` | clarify |
| P2 | The terms box is nested inside a tinted panel inside the dialog, which breaks the "no nested cards" rule. | PC | `Portal.tsx` | distill |

## Staff work views (portal)

Plan: `docs/ux-redesign/plans/staff-work-views.md`.

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| P1 | Copy ignores who is viewing. A Consultant sees "Owned by another coordinator" and "Waiting on: the consultant"; resolve these to "you" for the coordinator, owner or Consultant concerned. | PC | `components/portal/CurrentAction.tsx`, `MyWork.tsx`, `CaseQueue.tsx` | clarify |
| P1 | A coordinator sees "Coordinator: Unassigned" on their own case when the name is missing. Add a fallback name. | PC | `CurrentAction.tsx`, `CaseQueue.tsx` | clarify |
| P1 | Plurals are wrong ("1 cases", "1 work items", "1 documents"). Use `Intl.PluralRules`. | PC | `CaseQueue.tsx`, `MyWork.tsx`, `Portal.tsx` | clarify |
| P1 | Raw enum values reach the screen ("NORMAL", "cardiology"). Map them to words in both locales. | PC | `CaseQueue.tsx`, `MyWork.tsx`, `CurrentAction.tsx` | clarify |
| P1 | "Assign a verified consultant" breaks the never-say-"Verified" rule and the capital C in "Consultant". | PC | `Portal.tsx` / `ConsultantRouting.tsx` | clarify |
| P2 | The case number is repeated as the title when there is no patient name. | PC | `CaseQueue.tsx` | clarify |
| P2 | "Assign consultant" only scrolls to a second "Confirm assignment" panel, so there are two controls for one job. | PC | `CoordinatorActions.tsx`, `ConsultantRouting.tsx` | distill |
| P2 | "No eligible Consultant" is a dead end. Add a next step (escalate or request staffing). | PC | `ConsultantRouting.tsx` | onboard / harden |

## Staff home and shell (portal)

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| P2 | Multi-hue stat tiles (violet, sky, stone) repeat the tab counts, and the colours are outside the petrol family. | PC | `components/portal/RoleDashboardSummary.tsx` | distill |
| P2 | The toolbar shows 6+ controls before the first case. List/Cards and "Select page" have no bulk action to support them. | PC | `CaseQueue.tsx` | distill |
| P2 | The home lands on an empty "My work" tab while the cases sit one tab away. Land on the first tab that has work. | PC | `Portal.tsx`, `CaseQueue.tsx` | distill |
| P2 | The public marketing footer appears on staff screens. Replace it with a slim app footer (owner decision). | PC | `components/Footer.tsx`, portal layout | distill |
| P3 | No keyboard shortcuts or saved views for coordinators. | PC | `CaseQueue.tsx` | shape |
| P3 | The finance home is only an empty state plus one link. | PC | `Portal.tsx` | onboard |
| P3 | On phones, coordinator rows put a lone checkbox above the case name. | PC | `CaseQueue.tsx` | adapt |

## Portal system drift

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| P2 | Labels are set at 0.7rem, 0.72rem, 0.75rem or `text-xs`, below the 13px floor (37+ in `Portal.tsx`). | PC | `Portal.tsx`, `CaseQueue.tsx`, `ClinicalReview.tsx`, `MyCare.tsx`, `JourneySnapshot.tsx` | typeset |
| P2 | `rounded-xl` is used about 40 times instead of the 6/8px radii. | PC | portal components | polish |
| P2 | Five `border-s-4` side-stripe callouts. | PC (detector) | `NotificationBell.tsx:101`, `Portal.tsx:339/454/479/639` | polish |
| P2 | Amber tones, plus petrol-50 and cream washes behind the My Care cards. | PC | `MyCare.tsx`, `Portal.tsx` | polish |
| P2 | Nested cards: the "Services & costs" table and the Consultant intake summary. | PC (detector) | `Portal.tsx`, `ClinicalReview.tsx` | distill |
| P2 | "Mark read" buttons are 32px tall and don't say which message they apply to. | PC | `CaseMessages.tsx` | harden |
| P2 | An h2 on My Care ("other cases") is styled as an 11.5px uppercase label. | PC | `MyCare.tsx` | typeset |
| P3 | The tab list wraps onto two rows on phones in Arabic (Consultant view). | PC | `Portal.tsx` | adapt |
| P3 | Message timestamps use short US format. | PC | `CaseMessages.tsx` | clarify |
| P3 | Currency is shown three ways ("$US 4,850.00", "4,850 US$", "$4,850"). | PC | `MyCare.tsx`, `Portal.tsx` | clarify |
| P3 | Latin initials and country names appear on Arabic pages. | PC | `MyCare.tsx`, `Portal.tsx` | harden |
| P3 | Nothing on My Care shows a representative whose account this is. | PC | `MyCare.tsx`, `PatientNav.tsx` | shape |
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
| **P0** | `WorkspaceView` (and `ProposalSendForm`, `FinalAssessment`, `FinalQuoteActions`, `RoleActions`) has no case key. Opening another case without returning to the queue (notification bell, `openCaseById`, `otherCases`) keeps the previous case's typed drafts and dialog flags, so they can be submitted against the wrong patient's case. Fix: `key={workspace.caseSummary.id}`. (verified) | RB | `Portal.tsx:216` | harden |
| P1 | Drafts are lost on a tab switch or "My dashboard". The clinical review, proposal notes, final assessment and operations plan live in tab-panel state that unmounts. Keep the panels mounted, or lift the drafts and warn when a form is dirty. | WG | `ClinicalReview.tsx:51`, `Portal.tsx:649/685/750` | harden |
| P1 | Bulk "Take ownership" clears errors per case and reports success even if one claim failed. Report "N of M" and keep the failed rows selected. | WG, AU | `CaseQueue.tsx:215` | harden |
| P1 | Bulk "Request information" stops at the first failure. Resubmitting sends a second request and email to patients who already received one. Drop the succeeded cases and show a result per case. | WG | `RequestInformationDialog.tsx:82` | harden |
| P1 | The Arabic preliminary-estimate disclaimer is weaker than the English one. It omits non-binding, "not a price guarantee" and "may increase or decrease". | AU | `MyCare.tsx:255/272`, `CaseMessages.tsx:38` | clarify |
| P2 | Recording a refund has no confirmation. Submitting a second opinion permanently ends access with no confirmation. "Resend link" silently revokes the current link. | WG | `Portal.tsx:731/746`, `ConsultantRouting.tsx:174`, `CoordinatorActions.tsx:478` | harden |
| P2 | "Request changes" can be sent with an empty note. `RecordPatientResponse` lets required items be blank. | WG | `CaseMessages.tsx:38`, `RecordPatientResponse.tsx:62` | harden |

### Feedback, focus and state

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| P1 | `<fieldset disabled={busy}>` around the whole workspace disables the focused control on every action. Focus drops to `<body>` and is never restored, and the workspace dims to 65%. Confirmed with a keyboard probe in en and ar. | AU, WG | `Portal.tsx:418/363/365`, `app/globals.css:731` | harden |
| P1 | Success and error notices render behind an open modal `<dialog>`, so drawer actions show no result. This affects More actions, Transfer ownership, Request info and the patient decision. Errors far down the page appear only in the top banner. | WG | `Portal.tsx:212` | harden |
| P2 | `refresh` has no stale-result guard, and one shared `busy` flag serves concurrent loads. Reference-data effects are not cancelled or reset when the role changes. | RB | `Portal.tsx:110/134-136` | harden |
| P2 | `refreshMe` blanks `me`, so Portal returns the loading frame and unmounts the tree (dialogs and drafts are lost). Keep the previous `me` while revalidating. | RB | `AuthProvider.tsx:41`, `Portal.tsx:191` | harden |
| P2 | Missing empty states: an empty message thread; TeamAssignment with nobody in the role; a care-area select whose value is not among its options. | WG | `CaseMessages.tsx:20`, `CoordinatorActions.tsx:87`, `ConsultantRouting.tsx:126` | onboard |
| P2 | `PatientIdentityStep` always receives `identity={null}`, so the PENDING and REJECTED states never render. | WG | `Portal.tsx:362` | harden |
| P2 | `WorkforceAdoptionPanel` accept has no busy state, so a double-click sends twice. | WG | `WorkforceAdoptionPanel.tsx:38` | harden |
| P3 | Every action shows the generic "Saved successfully"; "Retry" only reloads the queue; the copy-link failure is silent; the completion note closes before its result is known. | WG | `Portal.tsx:184/212/681`, `CurrentAction.tsx:78` | clarify |

### Accessibility and semantics

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| P1 | Unlabelled controls: the discharge-document select; the FinalAssessment currency select; manual service and amount inputs labelled only by placeholder; an English "remove" aria-label. | AU, WG | `CaseWorkflowActions.tsx:17`, `Portal.tsx:696/699` | harden |
| P1 | Text-field borders are `--color-line-strong` (1.66:1 on white), below the 3:1 non-text contrast WCAG 1.4.11 requires. Token decision at GATE 2. | Tokens | `app/globals.css` `.field`, `theme-petrol.css` | polish |
| P2 | A hard-coded English `aria-label="Confirmed arrival"` overrides the Arabic label (label-in-name). | AU, WG | `CaseWorkflowActions.tsx:16` | clarify |
| P2 | Broken unread-badge names ("Messages1 unread"). The staff Messages badge shows the total, not the unread count. Unread notifications and overdue tasks are shown by colour only. | AU, WG | `PatientNav.tsx:30`, `MyCare.tsx:55/212`, `Portal.tsx:402/603`, `NotificationBell.tsx:101` | harden |
| P2 | Tablist arrow keys don't flip in RTL (ArrowLeft jumps to the far tab), and Home/End are missing. | AU, WG | `Portal.tsx:260/424`, `CaseQueue.tsx:143` | adapt |
| P2 | My Care card titles are `<p>`, not headings. `CaseMessages` puts an h3 under the h1 (axe heading-order in en and ar). | AU | `MyCare.tsx:147/187/202/219`, `CaseMessages.tsx:18` | harden |
| P2 | Tap targets: copy button 13px, chip remove about 17px, row checkboxes 16px, `!min-h-9` (36px) buttons, tabs 40–41px, "Back to dashboard" 33px. | AU, WG | `CaseQueue.tsx:179/206/253-297`, `Portal.tsx:212/378/531` | adapt |
| P2 | The coordinator lock is `pointer-events-none opacity-50` only, so the release buttons stay keyboard-operable. | AU | `Portal.tsx:310` | harden |
| P2 | Zero-value dashboard tiles are `disabled` at 0.55 opacity (about 2.6:1). | AU | `RoleDashboardSummary.tsx:69` | polish |
| P2 | Repeated "Open/View/Download" buttons with no item context. Role-switcher active state is shown by styling only. `role="dialog"` on the inline `AccountLinkRequest` card. A focusable "disabled" mailto. | WG | `MyWork.tsx:87`, `CaseQueue.tsx:256`, `Portal.tsx:208/682`, `AccountLinkRequest.tsx:84` | harden |
| P3 | Popovers with `role="dialog"` don't move focus. The result-count live region re-announces on every keystroke. Smooth scroll ignores reduced motion. "✓/♥" glyphs are read aloud. No new-tab notice. | AU, WG | `CaseQueue.tsx:164/223`, `NotificationBell.tsx:79`, `Portal.tsx:194/336`, `PortalAccount.tsx:95` | harden |

### RTL, i18n and formatting

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| P2 | `tracking-[0.08–0.1em]` and `uppercase` on Arabic micro-labels (computed 1.15px letter-spacing on "الخطوة الحالية"). Add an RTL reset or use `.eyebrow`. | AU, WG | `MyCare.tsx:95/147/187/202/219`, `Portal.tsx:434-612`, `CurrentAction.tsx:45`, `JourneySnapshot.tsx:28`, `MyWork.tsx:108`, `PortalAccount.tsx:62` | typeset |
| P2 | `dir="ltr"` on Arabic money blocks flips alignment and digit order. Wrap only the figure in `<bdi>`. | AU, WG | `MyCare.tsx:148/155/188` | adapt |
| P2 | Care-area labels: two local maps cover 3 of 9 areas, disagree with each other, and fall back to English slugs on Arabic pages. Use one shared source. | AU, WG | `MyCare.tsx:349`, `Portal.tsx:763`, `MyWork.tsx:72` | clarify |
| P2 | One total is formatted with 0 and 2 decimals in different places. Use one shared money formatter. | WG, AU | `Portal.tsx:517/717/760`, `MyCare.tsx`, `ClinicalReview.tsx` | clarify |
| P2 | Date of birth is parsed as UTC midnight, so it shows the previous day west of UTC. | WG | `PortalAccount.tsx:67` | harden |
| P3 | Dates without a year; raw FX rate and ISO date; hard-coded "KB/MB"; English "Bank" placeholder and English error fallbacks in the Arabic UI; the wrong-account case detected by an English regex; Arabic IME Enter not guarded. | WG, AU | `CaseQueue.tsx:286`, `Portal.tsx:665/727/764`, `PortalDirectories.tsx:10`, `AccountLinkRequest.tsx:68`, `RequestInformationDialog.tsx:132` | clarify |

### Design-system drift (beyond items above)

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| P2 | Status, priority and attention chips and the journey "blocked" state use Tailwind amber, emerald, sky and stone colours with rounded-full pills. Map them to the status tokens (GATE 2) and the 8px badge. | AU | `Portal.tsx:768`, `CaseQueue.tsx:54-62`, `MyWork.tsx:64/103`, `JourneySnapshot.tsx:36-56` | colorize / polish |
| P2 | The deposit panel uses `sand-50/200` (not remapped by petrol), and the current step fills with `brand-50`. Both break the Two Surfaces rule. | AU | `MyCare.tsx:94/146` | polish |
| P2 | A filled petrol "Open" on every queue row and work card (up to 12 per page) breaks the One Action rule. | AU | `CaseQueue.tsx:256`, `MyWork.tsx:87` | quieter |
| P3 | `PortalFrame` uses a gradient with a hard-coded `#fff`; old-palette `rgba(28,51,58)` shadows; `shadow-xl`/`rounded-2xl` popovers. | AU | `Portal.tsx:236`, `CurrentAction.tsx:43`, `PortalAccount.tsx:49`, `NotificationBell.tsx:80`, `CaseQueue.tsx:165` | polish |

### Performance and code structure

| Sev | Item | Source | Files | Command |
|---|---|---|---|---|
| P1 | `api` depends on the whole `user` object, so every silent token renewal re-runs the queue effect (clears the cases), refetches reference data, restarts polling, and wipes ConsultantRouting selections. Key on the subject and read the token from a ref. | RB | `Portal.tsx:109`, `ConsultantRouting.tsx:105` | harden |
| P1 | Serial waterfalls: `openCaseById` makes 3 round trips including a duplicate fetch; workspace and documents load sequentially; `mutate` runs refresh then openCase (4–5 trips per click); bulk claim does this N times. | RB, AU | `Portal.tsx:145/163/182-185`, `CaseQueue.tsx:215` | optimize |
| P1 | `Portal.tsx` is one 132 KB client module importing every role's UI. Split it into patient and staff modules by role and lazy-load dialogs and drawers. | RB, AU | `Portal.tsx:3`, `app/[locale]/portal/page.tsx` | optimize |
| P2 | Lint `set-state-in-effect`, `refs` and `purity` errors (12 in scope), each with a concrete fix in the RB report: queue loading derived state, `?role=` lazy init, `Date.now()` in render, dialog ref read in render, a shared `usePortalSlot` hook, the view-mode lazy init, directory and adoption loaders. | RB | `Portal.tsx:108/114/168/173/666`, `PortalAccount.tsx:38/55`, `NotificationBell.tsx:34`, `CaseQueue.tsx:87`, `PortalDirectories.tsx:11`, `WorkforceAdoptionPanel.tsx:20` | harden |
| P2 | Composition: 27 `useState` hooks in Portal, 26 props into `WorkspaceView`, 8 boolean dialog flags. Introduce a `CaseWorkspaceProvider`, split the patient and staff views, and use one dialog union state. | RB | `Portal.tsx:276/323` | — |
| P2 | `role={currentRole!}` can crash `WorkspaceView` when `/me` fails while a case is open. | RB | `Portal.tsx:216/285` | harden |
| P3 | The hidden queue re-renders under the workspace; formatters are rebuilt on every render; polling continues in hidden tabs; both locales' copy ships to the client; dead code (`PatientStatusCard`, `PATIENT_JOURNEY`, `ProposalShareLinks`, `TaskActions`, a no-op `Panel wide`, the MyCare timeline no-op). | RB, WG, AU | `Portal.tsx`, `NotificationBell.tsx:41`, `CaseMessages.tsx:29`, `MyCare.tsx:235` | distill |
