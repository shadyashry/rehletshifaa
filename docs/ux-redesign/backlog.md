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
