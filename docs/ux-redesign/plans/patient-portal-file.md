# Shape plan — UX area 1: the patient portal as the file

Status: **approved by the owner, 2026-10-15**, with the recommendations: D-1 backend milestones, D-2 Copy controls yes, D-3 no fourth stamp, D-4 quiet emergency notice, D-5 no only-account line until the business confirms. Build order starts with slice T. Branch `feat/ux-area-1-portal-file` (from
`claude/zen-blackwell-6af461` @ `aba2635`, which carries the area 0 decision on top of `feat/ux-trust-pass`).
Critique: §1 below; snapshot in `.impeccable/critique/` (path in STATUS.md). Before screenshots:
`docs/ux-redesign/screenshots/area-1/before/`.

Entry points (PLAN.md, area 1): `portal/MyCare.tsx` + `PatientCaseView.tsx` + `CaseSwitcher.tsx` (My Care),
`CaseStatusAccess.tsx` (secure status link), `ProposalSign.tsx` (secure proposal link), `ProfileActivation.tsx`
(profile activation), `portal/PatientDepositPayment.tsx` (deposit step). Signature moments: **case sent**,
**specialist reviewing**, **estimate ready**, each a stamped dossier page.

## 0. What already exists and is reused, not rebuilt

`feat/ux-redesign-my-care` is **committed** (`0d743b2`, 2026-10-13, owner-approved plan `plans/patient-my-care.md`) and
is an ancestor of this branch. STATUS.md's "Next exact action" still calls it uncommitted; that line is stale and is
corrected in this commit. Already on the branch and kept as is:

| Built in `0d743b2` | Kept | This area adds |
|---|---|---|
| `CaseSwitcher` (by person, "Needs you", past folded, "Send a new case") | yes | nothing |
| Case header band with the care-area mark | yes | nothing |
| Current step as the one file-tab card, deposit facts inside it | yes | the stamp on the three moments; the deposit step inside it is restyled (slice E) |
| Coordinator card with monograms | yes | nothing |
| Numbered journey that fills (`care-journey`) | yes | becomes the **one** journey, also on the status link (slice A) |
| Estimate card, paper canvas, header pills | yes | nothing |
| `CaseView.viewer` on the patient case list | yes | nothing |

From the public trust pass (`b2b9f3e`): `CaseStamp` and the confirmation page (`dossier-page dossier-page-static`) —
the "case sent" moment already exists there and is the template every other page follows.

## 1. Critique (summary)

Full report: `.impeccable/critique/2026-10-15T00-27-32Z__frontend-src-components.md` (dual-agent: design review +
detector; 84 before screenshots). **23/40, Acceptable** (portal-wide re-critique at the Close was 27/40 over a
different scope).

| # | Sev | Finding | Evidence |
|---|---|---|---|
| 1 | P1 | **Deposit truth contradicts DEP-3.** A reload of the activation link lands on the done page, which always ticks "Deposit received" and says the coordinator is starting the next stage; the activated page says the coordinator will arrange the deposit; the status link's deposit phase says the coordinator will share payment details. The patient is told not to act on the one step that is theirs. | `ProfileActivation.tsx` 85, 707–710, 729 (+ backend `PatientActivationQueryService.currentAction` always `CONTINUE_IN_PORTAL`); `PatientJourneyTracker.tsx` 114 |
| 2 | P1 | **The signature is missing.** No stamped page for specialist reviewing or estimate ready, and case sent only on the public form. | `CaseStamp` used in 2 places |
| 3 | P1 | **One file, three visual languages.** 82 off-ladder font sizes, 24 off-scale radii, 18 tinted panels, 5 "✓" glyphs, uppercase tracked labels on `/ar`, a petrol-filled badge, two journey trackers. | detector + grep (B); screenshots |
| 4 | P1 | **Arabic parity at the decision.** English money terms on `/ar` (legal gate, kept); acceptance statement means something else in Arabic; identical range/total labels; an empty and a mismatched done line; unknown consent codes render raw. | `ProposalSign.tsx` copy; activation-form-ar |
| 5 | P2 | **The deposit step overloads a phone.** ~3,300px page; the reference field ~1,500px below the bank rows; no copy controls. The detector's one finding (side stripe on a tinted note) is here. | `PatientDepositPayment.tsx` 70; my-care-pay-deposit-ar-390 |

Also: the status link does not show where the code will go before sending it; raw backend messages reach patients;
the proposal's done page is a dead end; the emergency banner outranks the case on every secure page; screen-reader
gaps (no current/done text on the status-link tracker, no `aria-current` on the activation stepper, a double-labelled
code input). The My Care fixture's "deposit-arranging" scenario uses a retired action code and shows "You're all
set" beside a due deposit — a fixture defect. **Legal strings** `commercial-terms.ts` 41, 68, 81 ("your coordinator
sends you the payment instructions") contradict DEP-3 too; they are not edited here (§9, L-6).

## 2. Job and audience

The patient, or the relative acting for them, usually on a phone and usually in Arabic, reached by a WhatsApp message
or an email and returning several times over weeks. Mode: **Operate**, with short Read moments (the estimate). Each
visit asks the same three questions: *where is my file, is anything needed from me, what did it cost so far.* Three
of the five surfaces are reached without signing in, through a link and a one-time code, by someone who may not yet
trust the platform.

## 3. Outcome and proof

- **Success:** whichever door the patient comes through (status link, proposal link, activation link, My Care) they
  recognise the same file: the same case number as its heading, the same journey, the same "nothing needed from you"
  line or the same single action, and a stamp on the page when something real has happened to it.
- **Truth that must stay exact:** the current step (backend `actions` / patient current action / public `phase`),
  amounts, currency and deposit status, the estimate's "preliminary, non-binding" line and every legal string in
  `lib/commercial-terms.ts` (byte for byte, both languages), case numbers, and **every stamp date**: a stamp is
  printed only from a date the backend sends for that event, never "today".

## 4. Selected direction — one file, five doors

Inside Petrol & Paper (no new colours, fonts or radii). **Every patient screen is one page of the case file**: white
page, 8px radius, strong hairline edge, the petrol file-tab top edge, the case number as the page's kicker, one
heading, the body, and at most one primary action. The stamp sits at the page's end-top corner when, and only when,
the page records one of the three moments. Nothing is wrapped in tinted panels; notes are hairline-separated text
with an icon. The secure-link screens stop looking like a different product.

### The three stamped moments

| Moment | Stamp (en / ar) | Where it appears | Date it prints |
|---|---|---|---|
| **Case sent** | Received / تم الاستلام (existing `form.success.stampReceived`) | Send my case confirmation (exists); status link and My Care while the case is in *received* or *coordinator review* | when the case was received (backend milestone, D-1) |
| **Specialist reviewing** | In review / قيد المراجعة | status link and My Care while a Consultant has the case (`WAIT_CONSULTANT_REVIEW` / phase `consultant`) | when the case went to the Consultant (milestone, D-1) |
| **Estimate ready** | Estimate ready / التقدير جاهز | My Care `REVIEW_PROPOSAL`; status link proposal `READY`; the proposal link's document header | `releasedAt` of the version (already in `PatientProposalState`; added to `PublicProposalView`, D-1) |

Rules: one stamp per page (the latest moment the page is about); no date → no stamp; never on a waiting-for-staff
page that is not one of the three; the home's `DossierPreview` stays the only stamp with a synthetic date (labelled
"Example"). The patient's own acknowledgement could take a fourth stamp ("Acknowledged") — **D-3**.

## 5. Slices

| # | Slice | What changes | Files |
|---|---|---|---|
| T | **Truth first** (critique #1) — **built 2026-10-15** | Activation's done page lists only steps that are true; while the deposit is required and unpaid it names the next step, "Pay your coordination deposit in My Care", with one action (sign in); the activated page says the same; the unreachable "deposit" stage is removed. The status link's deposit phase says the deposit is paid by bank transfer (or through an agent) in My Care. "will contact you shortly" goes (unsupported). The My Care fixture moves to the action codes the backend sends (`PAY_DEPOSIT`, `WAIT_PAYMENT_CHECK`). Legal strings untouched | `ProfileActivation.tsx`, `PatientJourneyTracker.tsx`, `e2e/patient-fixture.ts`, messages |
| A | **Foundations** (no visible change on its own) | `DossierPage` extracted from the confirmation page (kicker, heading slot, stamp slot, file-tab edge) and adopted by `CaseForm` unchanged; `CaseStamp` takes an ISO date and formats it per locale, floor 12px (today 11px); one `CaseJourney` drawn with the DESIGN.md markers, used by My Care and by the status link in place of `PatientJourneyTracker`'s own drawing (its phase map and copy stay); one `OneTimeCodeStep` (destination hint, channel switch where the link offers two, 6-digit field, resend) for the three secure links; the three links' inline copy objects move to `messages/en.json` + `ar.json` (`secureLink.status.*`, `secureLink.proposal.*`, `secureLink.activation.*`) with wording unchanged | `brand/DossierPage.tsx` (new), `brand/CaseStamp.tsx`, `CaseJourney.tsx` (new, from `MyCare` + `PatientJourneyTracker`), `OneTimeCodeStep.tsx` (new), `CaseForm.tsx`, messages |
| B | **Status link = the file, unsealed** | Before the code: a sealed page — case number, where the code will go (masked, as the proposal link already does), a channel switch only if the status endpoint accepts a channel (today it takes none; the proposal and activation links do), "we will never ask you for this code", one "Send code". After it: the current page — phase title, the stamp for the moment, "no action needed" or the one action, usually-within, next, meanwhile; then the one journey; then the response form (information requested) or "Review estimate" (estimate ready). The "Current update: ‹status›" line is dropped (it repeats the title). Done page in the same frame with an icon, not a "✓" glyph. Backend messages are never shown raw: each failure maps to copy, shown beside the field it concerns, focus on the first error. The emergency notice takes the quiet variant (D-4) | `CaseStatusAccess.tsx` |
| C | **Proposal link = the estimate as a document** | The header becomes the document's first page: document type as kicker (not an amber warning badge — the honesty line already says "preliminary"), title, prepared for, case, valid until, the "Estimate ready" stamp. One reading column: recommendation ("Reviewed by"), the price list, total, scope, basis, next steps as journey-style numbers (no tinted panel), terms disclosure (unchanged), decision (unchanged order and rules, Arabic assisted path untouched). Summary aside kept (sticky on desktop, first on phones). Radii 8, shadows from tokens, the "RehletShifaa · RS-…" middle-dot eyebrow removed. Done page = a dossier page with the case number and the real next step (profile link sent → "check WhatsApp/email", per the backend), stamped only if D-3 = yes. One noun per document: "estimate" for the preliminary estimate, "quote" for the final quote, everywhere ("proposal" stays only where it names both). Code input: one label, no placeholder; "More options" ≥ 44px. Arabic: range and total labels told apart, the empty and mismatched done lines aligned with English (non-legal strings only); the acceptance statement (`ackShortFinal`) goes to the legal/native list unchanged | `ProposalSign.tsx` |
| D | **Activation = completing the file** | Verify through `OneTimeCodeStep`; the three-step header drawn with journey markers and a check icon; fieldset legends as eyebrows; email and phone choices as DESIGN.md choice cards; tinted boxes removed; the stepper gets `aria-current` and short labels that do not truncate at 375 in Arabic; a consent with no text never renders its code (the form names it generically and the coordinator is told — harden). The truth fixes are slice T | `ProfileActivation.tsx` |
| E | **Deposit step = the payment slip** | Inside My Care's current-step page, in two numbered parts — **1 Transfer**, **2 Enter your bank's reference** — so the field follows the details it depends on: amount due in Statement size; the estimate caveat as a hairline note with an icon (today a 4px side stripe on a sand panel — the detector's one finding); method as choice cards with the disabled online option as one trailing line (still shown, as decided); the body says "by bank transfer or through an agent"; bank details as a slip with a **Copy** control on account number, IBAN, SWIFT and the payment reference (phones: no retyping); reference field and its rules unchanged; an "only account we use" assurance line if the business confirms it (D-5) | `portal/PatientDepositPayment.tsx` |
| F | **My Care: the stamp and two history fixes** | The current-step page carries the stamp on the three moments; the journey is `CaseJourney`; backlog MEDIUMs from the My Care pass: Back returns to the previous case (push, not replace), and My Care / Documents / Messages become links | `MyCare.tsx`, `Portal.tsx` (history only), `PatientNav.tsx` |

Order: T → A → F → B → C → D → E, one commit per slice once green; screenshots after each visible slice. About three sessions (T + A + F; B + C; D + E), matching PLAN.md.

## 6. Scope and boundaries

- **Untouched:** every API call and payload except D-1's additions; access, OTP, grant and handoff logic; the
  decision rules and the Arabic coordinator-mediated path; `lib/commercial-terms.ts` and every legal string; the
  current-case rule; the proposal drawer's content in the portal (`PatientProposal.tsx`, own follow-up, §9); staff
  screens; the Keycloak theme (area 7).
- **Anti-goals:** no gradients, washes or tinted panels; no new colours, fonts or radii; no second primary action per
  view; no stamp without a real event and its date; no greeting copy, testimonials or promises; no "Verified".

## 7. States and ranges

- Status link: invalid/expired link, code not sent, code sent (WhatsApp / email), wrong code, too many attempts,
  team working (each phase), information requested (0, 1, many items; documents and text), estimate ready, estimate
  acknowledged / declined / revision requested / expired, sent.
- Proposal link: verify, code, preliminary estimate (range / single figure; with and without deposit; foreign
  currency with rate date), final quote, blocked (expired, superseded, decided), Arabic assisted (asked / not asked),
  done per decision.
- Activation: verify, form (patient / representative-submitted; known email / none; mobile owned by patient /
  representative / none; field errors; session timed out), account setup (sent / not sent / resent), done (deposit
  required unpaid / paid / not required).
- Deposit step: bank transfer / agent cash, rejected transfer with reason, partially paid, checking.
- Content: long Arabic and Latin names, LTR isolation of numbers and case numbers, amounts in USD/EUR/SAR/EGP.

## 8. Interaction and layout

- Pages hold one column of 42–44rem on the secure links (as today); the proposal keeps its 1fr + 20rem layout at
  ≥1024px; My Care keeps 8/4.
- Focus moves to the new page heading on every step change (activation does this today; the status and proposal
  links adopt it). Touch targets ≥ 44px, including Copy, Resend and channel switches.
- RTL: logical properties only; the stamp's tilt and corner mirror (already in `theme-petrol.css`); amounts, IBAN,
  case numbers and codes in LTR isolates.
- Motion: the stamp may press in once (opacity + scale, ≤200ms, `backwards` fill); nothing moves under reduced motion.
- Breakpoints checked: 375, 390, 768, 1024, 1440.

## 9. Constraints and owner decisions

- **D-1 Stamp dates (backend, small).** The patient workspace and the public status view gain a patient-safe
  `milestones` object (`receivedAt`, `consultantReviewAt`, `estimateReadyAt`) read from the status history, and
  `PublicProposalView` gains `releasedAt`; one test each. **Recommended.** Alternative: frontend-only — My Care reads
  the raw `timeline` it already receives, the status link stamps only "Estimate ready" (its `proposal.releasedAt`
  exists), and the other two stamps wait. The alternative builds on a field the patient should not be receiving
  (below).
- **D-2 Copy buttons on the payment slip** (slice E): a new interaction, four small secondary controls inside the
  payment step. Recommended yes.
- **D-3 A fourth stamp, "Acknowledged"**, on the proposal link's done page and My Care's estimate card after the
  patient's own decision. It is a real event with a date. Recommended no for now: keep the three moments rare.
- **D-4 Emergency notice weight on the patient pages.** The status link, proposal link and My Care show the full red
  banner above the case; the public form already uses the quiet one-line variant with a disclosure (trust pass,
  approved). Content unchanged, weight changed. Recommended: quiet variant on all four, kept first in reading order.
- **D-5 "This is the only account we use" on the payment slip.** Strong anti-scam reassurance for this audience, but
  it is a business promise. Needs a yes from the business; without it the line is not added.
- **L-6 (legal, not decided here):** `lib/commercial-terms.ts` 41, 68 and 81 say "your coordinator sends you the
  payment instructions"; since DEP-3 the patient sees the platform account and pays in My Care. Added to the legal
  list (L1–L5) for wording; untouched in this area.
- **Found, not in this area's scope — backend data minimisation:** the patient workspace
  (`CaseWorkspaceQueryService.workspace`, patient actor) returns the full staff `timeline` (actor names, actor roles
  and the free-text reason of every status change) and the open `assignments` (staff identity subjects), which the
  patient UI never renders. `JourneyCaseQueryService.forPatient` already strips staff subjects from the case summary,
  so this looks like an oversight. Proposed as its own backend session.
- Arabic copy stays subject to the native review; country names on `/ar` stay English until B1 (decided earlier).
- The portal's proposal drawer (`PatientProposal.tsx`) and the proposal link are two implementations of one document;
  converging them is a follow-up, not this area.

## 10. Verification (after approval)

Typecheck; eslint on touched files; vitest; Playwright `my-care*.spec.ts`, `status-access.spec.ts`,
`status-proposal.spec.ts`, `proposal-otp.spec.ts`, `proposal-responsive.spec.ts`, `activation-flow.spec.ts`,
`arabic-proposal-decision.spec.ts`; `a11y.spec.ts` in en + ar **extended** with the status link (view), the proposal
link (view), activation (form) and My Care's payment step; backend tests for D-1. Screenshots after:
`docs/ux-redesign/screenshots/area-1/after/` (en/ar, 390/1440). The four read-only reviews (React/composition, web
design guidelines, RTL/i18n, Pro Max checklist) before verification; HIGHs fixed, the rest to backlog under "Area 1".
