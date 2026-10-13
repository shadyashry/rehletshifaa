# Shape plan — My Care (patient home) and multiple cases

Status: **draft for approval** (not approved). Scope: owner findings P-UX-1 and MC-1 from
`docs/qa/journey-findings-2026-10-13.md`. No code yet. Next pass (separate plan): the proposal drawer, secure status
link, secure proposal link and profile completion, reusing the pieces defined here.

**Owner input, 2026-10-13:** the patient page has "very bad UI/UX design and theme coloring": too plain and cold,
colours, layout and typography all wrong. My Care must handle multiple cases. Scope this pass to My Care + multi-case;
when a patient has several cases, open the one needing their action.

**What this supersedes:** for My Care, the earlier reading of "quiet" as plain text between hairlines with no
cards (pass 1–4 direction, `patient-proposal.md` §5 "no tinted panel"). It does **not** change the visual system:
Petrol & Paper stays (owner decision, 975f071) and no colour, font or radius is invented. The page instead uses the
signals DESIGN.md already prescribes and My Care currently leaves out: the petrol "file tab" edge on a card, the coral
rule opening an eyebrow, the numbered journey that fills, status badges, the lead monogram and the care-area system
colours.

## Job and audience

A patient, or a relative acting for them, signs in after accepting a preliminary estimate. They are often on a phone,
usually in Arabic, anxious about treatment abroad and money. Mode: **Operate**, with a short Read moment.

On arrival they must understand, in this order:

1. **which case** they are looking at (and that their other cases are one tap away);
2. **where it stands and whether they must do anything now**;
3. **who is looking after them** and how to reach that person;
4. **what it costs so far** (estimate, deposit) and where the documents and messages are.

## Outcome and proof

- **Success:** within one glance the patient can say "this is my heart case, my coordinator Layla is arranging the
  deposit details, I don't need to do anything yet, and my second case is with Omar." When an action is due, it is the
  one obvious thing on the screen.
- **Truth that must stay exact:** the current step and next step (from the backend `actions` / patient current
  action, never inferred), the deposit amount, currency and status, the estimate total and its "preliminary,
  non-binding" line, names of the coordinator and Consultant, case numbers.

## Critique of today (evidence from the dev walk, RS-2026-000001 and RS-2026-000003)

| Heuristic | Problem |
|---|---|
| Visibility of status | The current step is a thin-edged box; the deposit status "Arranging" is plain text; nothing signals "nothing needed" vs "do this". |
| Hierarchy | Everything is near the same weight: label-micro grey eyebrows, small amounts, faint journey labels. No focal point. |
| Redundancy | "Deposit arrangements" (current step) and "Coordination deposit" (section) state the same fact back to back. |
| Match to the product | PRODUCT.md: "the coordinator relationship is the product" — yet the coordinator is a small line at the bottom. |
| Multi-case | Other cases are a small list at the very bottom ("Your other cases"); nothing on top says this person has two cases with two coordinators. |
| Colour | Petrol text on paper with hairlines only; the header's coral reading-progress hairline shows as a stray partial orange line on an app page. |
| Space | At 1366px the content sits in a narrow column with an empty right side; at 800px the two columns collapse into one long list. |

## Selected direction — "the patient's file, opened"

Inside the Clinical Dossier: My Care is the patient's open file. One white card per subject, edged by hairlines on
paper, with the file-tab petrol edge only on the card that matters now. Colour comes from meaning: the care area's
own system colour identifies a case, petrol marks the one action, coral only opens eyebrows and rings the current
journey marker.

Order (phone = this order top to bottom; desktop = two columns, 8/4 at ≥1024px):

1. **Your cases switcher** (only when the account has 2+ cases). A row of case cards above everything — on phones a
   horizontal, scroll-snapping row; on desktop a wrapping row. Each card: the care area's system icon in its **well**
   colour, the care area name, the case number (`dir="ltr"`), the current step in plain words, and a petrol
   status badge **"Needs you"** when the backend says the case waits on the patient. The selected card carries the
   petrol top edge and `aria-current="page"`. Cards are grouped under the person's name when the account sees cases
   of more than one person ("Your care" / "Care for ‹name›"); closed or declined cases sit in a collapsed "Past
   cases" group. A quiet "Send a new case" entry ends the row (see open decision 1).
2. **Case header** (white band): "Care for ‹name›" when acting for a relative (existing rule), the patient name in
   Headline, case number and care area with its icon. No greeting, no claims.
3. **Current step — the focal card** (left column, top). File-tab petrol edge; coral-rule eyebrow "Current step";
   title in Headline; one or two sentences; then either **one primary action** (when the patient must act) or a
   clear "No action needed from you right now" line with a check. A "What happens next" row closes the card. When the
   step concerns money (deposit), the deposit facts live **inside** this card — amount (Statement size, tabular
   figures), status badge (Arranging / Requested / Paid / Waived), how and when — and the separate deposit section
   disappears.
4. **Your coordinator** (right column, top; directly under the current step on phones). Lead monogram (petrol-700
   circle, initials), name, "Your coordinator" role line, languages, one secondary "Message" action and a short line
   that WhatsApp reaches the same person. The Consultant follows as a second, smaller row (monogram outline). If no
   coordinator is assigned yet, the card says so plainly.
5. **Journey** (left column). The DESIGN.md numbered journey: reached markers filled petrol-700, the current marker
   with the coral ring, upcoming markers outlined; connector in support teal; labels in Body Ink (readable, not
   muted). Horizontal on desktop, vertical list on phones with each label beside its marker.
6. **Your estimate** (left column). Document type ("Preliminary care estimate"), total in Statement size, status
   badge (Acknowledged / Ready for your decision), the honesty line, "View proposal". Once a deposit is paid it shows
   "Paid and credited to your final quote".
7. **Documents and Messages** stay as the existing top navigation (My Care / Documents / Messages), with an unread
   count badge on Messages.

The portal header drops the coral reading-progress hairline on app pages (it belongs to long reading pages).

## Scope and boundaries

- **Files:** `components/portal/MyCare.tsx`, `components/portal/PatientCaseView.tsx`,
  `components/portal/PatientNav.tsx`, a new `components/portal/CaseSwitcher.tsx`, the portal header for the hairline,
  `messages/en.json`, `messages/ar.json`, `e2e/my-care*.spec.ts` and `MyCare.test.tsx`.
- **Untouched:** all API calls and payloads; the current-case rule (backend `findCurrentCasesOf` already orders cases
  waiting on the patient first, then most recently updated — exactly the owner's choice); the proposal drawer
  content (next pass); deposit, decision and identity logic; authentication; staff portal.
- **Anti-goals:** no gradients, washes or tinted section bands; no new colours or fonts; no second primary action on
  screen; no greeting copy, testimonials, success rates or promises; no "Verified" labels; no decorative imagery.

## States and ranges

- Cases: 1 (no switcher; "Send a new case" sits quietly at the end of the page), 2–6 (switcher), more than 6 (row
  scrolls; "Past cases" collapsed), cases of 2+ people (grouped by person).
- Current step: needs the patient (primary action), waiting on staff ("No action needed"), information requested,
  proposal ready, deposit requested / arranging / paid / waived, identity pending / rejected, treatment, follow-up,
  closed.
- Coordinator: assigned, not yet assigned, changed (transfer), covered by a colleague (reply cover — show the cover's
  name while active, if the API exposes it; otherwise unchanged).
- Content: long Arabic and Latin names (wrap, never truncate the patient name), long case numbers stay LTR,
  amounts in USD/EUR/SAR/EGP, missing estimate, no Consultant yet.
- Loading, access-check failure with retry (existing behaviour), empty state for an account with no case (existing).

## Interaction and layout

- Switching a case updates `?case=` and moves focus to the case heading (existing pattern); the switcher is a list
  of links/buttons, fully keyboard operable, `aria-current` on the selected case, visible focus ring.
- Touch targets ≥ 44px; switcher cards are whole-card targets.
- Breakpoints: 375 / 390 (single column, switcher row scrolls with snap), 768 (single column, wider cards),
  1024+ (8/4 columns), 1440 (container 1200, no empty right half).
- RTL: logical properties only; the switcher scroll direction, journey connector and any arrow icons mirror; amounts
  and case numbers keep LTR isolation.
- Motion: the selected case card's edge and the reached journey markers may settle in once (≤200ms); nothing moves
  under `prefers-reduced-motion`.

## Constraints and open decisions

1. **"Send a new case for someone else" from My Care.** Today a signed-in patient's new-case form has no
   "someone else" option (`NewCaseForPatientRequest` carries no representative). Options: (a) this pass shows only
   "Send a new case" (for me) and records the "someone else" path as a backend follow-up; (b) extend the request
   first. Recommendation: (a), so the redesign is not blocked.
2. **Grouping by person** needs to know, per case in the list, whether the account is the patient or a
   representative. `CaseView` carries `patientName` but not the viewer's relation; the builder may add it to the
   patient case list (small backend change) rather than infer it from names. Confirm it is in scope.
3. **No new tokens are expected.** If the builder needs one (e.g. a status-badge variant for "Needs you"), it is
   proposed in `docs/ux-redesign/token-proposals.md` first, not invented.
4. Arabic copy remains subject to the pending native review.
5. Routing a returning patient's new case to their existing coordinator (finding #33) is a backend rule, not part of
   this pass.

## Before `/redesign-area`

- Commit the open work on `codex/platform-control-plane` (B1, B2 and the QA documents) — owner approval needed.
- The uncommitted `frontend/src/components/nav/CareAreasMenu.tsx` change must be committed or set aside for a clean
  tree — owner's call.
- Branch `feat/ux-redesign-my-care` from `codex/platform-control-plane` (as passes 3 and 4 did).
- Then run: `/redesign-area My Care + multiple cases — frontend/src/components/portal/MyCare.tsx,
  PatientCaseView.tsx, PatientNav.tsx (plan: docs/ux-redesign/plans/patient-my-care.md)`.
