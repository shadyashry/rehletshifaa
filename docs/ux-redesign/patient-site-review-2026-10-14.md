# Patient site review — trust, distinctiveness, conversion (2026-10-14)

⚠️ DEGRADED: single-context (the session's rule forbids spawning sub-agents unless the owner asks; Assessment A was
completed and recorded before the detector ran, and the detector ran for real: 0 findings over 6 targets).

**Target:** the public patient site on dev — home (`/en`, `/ar`), Send my case, Track case, How it works,
Consultants. Sources: `frontend/src/components/home/*`, `CaseForm.tsx`, `TrackCaseLanding.tsx`, `Header.tsx`,
`theme-petrol.css`; live screenshots at 1280 px (EN) and 375 px (AR, EN). Mode: **Persuade** (home, consultants, how it
works) and **Operate** (Send my case, Track case). Brief honoured: Petrol & Paper, hand-heart logo, calm
evidence-first voice, one route to the form per page, nothing fabricated (no testimonials, outcomes, partnerships).

## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Form steps, upload states and failure stages are explicit; the home gives no sense of what you will *receive* |
| 2 | Match system / real world | 3 | Plain language throughout; "preliminary estimate / final quote" explained on How it works, not where the form asks for trust |
| 3 | User control and freedom | 3 | Back/next on the form, saved link on Track case; no way to pause the form and resume from the phone later |
| 4 | Consistency and standards | 3 | One system; the Consultant initials chips break the "named people" promise the copy makes |
| 5 | Error prevention | 3 | Structured names, country picker, dial code, draft-then-submit retry safety; file guidance is late (step 2) |
| 6 | Recognition rather than recall | 3 | Stepper, "where to find my case number" disclosure; the care-area grid asks the visitor to classify themselves though the product promises routing |
| 7 | Flexibility and efficiency | n/a | Persuade surface; the form has one path by design |
| 8 | Aesthetic and minimalist design | 3 | Calm and coherent; eight home sections, two header CTAs, a red emergency box as the form's first element |
| 9 | Error recovery | 3 | Failure stage names the next step (server / upload / submit-after-upload / limit) |
| 10 | Help and documentation | n/a | Persuade surface; How it works is the help |
| **Total** | | **24/32 (75%)** | **Good** |

## Design specificity verdict

**LLM assessment.** The site is competent and calm, and it is category-interchangeable. Swap the logo and the copy
and it could be any telehealth or concierge-medicine site: hero photograph of a doctor with a patient, five-icon
trust rail, numbered steps, a care-area grid, a "travel support" band, a privacy section, a CTA band. The product's
own ideas — the *dossier* (the brand description literally says "an evidence-first clinical dossier"), the one named
coordinator, the stamped case number, the staged price story, the secure link, the Consultant whose credentials were
reviewed — are described in words, never *shown*. The two most product-specific pieces on the site are the "who works
with your case" diagram in the privacy section and the How it works phase cards with YOU / NEXT lines; both sit low on
the page.

**Deterministic scan.** `impeccable detect` over `components/home`, `CaseForm.tsx`, `TrackCaseLanding.tsx`,
`Header.tsx`, `Footer.tsx`, `components/journey`: **0 findings**. No overlay was injected (review-only run).

**Observed in the review browser (verify on a real phone before treating as a defect):** the hero's entrance
animation (`petrol-rise`, `theme-petrol.css` 666–687, `animation-fill-mode: both` with 0.12–0.45 s delays) left the
lead paragraph at opacity 0.07 and the "Start with what you have" card at opacity 0 after six seconds on the 375 px
viewport, and only completed after a scroll. In a background or throttled tab CSS animations do not advance, so this
is most likely the review browser; but the design still depends on the animation finishing before the primary
message exists. Recommendation in P2 below.

## Overall impression

Professional, trustworthy in tone, forgettable in form. The visitor is a worried family member on a phone in Benghazi
or Khartoum who has never bought healthcare abroad. What they need in the first ten seconds is proof that a real,
named, accountable person will hold their file, and a glimpse of the thing they will get back (a recommendation with
a price range) before they commit anything. The site currently *asserts* both and *shows* neither. The single biggest
opportunity is to make the dossier the hero: show the artefacts of the journey instead of a stock consultation
scene.

## What's working

1. **The form's engineering is honest.** Draft-then-upload-then-submit with retry safety, structured names, "who is
   this for", the single-legal-name option, the dial-code picker, failure stages with a next step, Turnstile. This is
   rare and it is the foundation trust is built on.
2. **The privacy figure.** "Who works with your case" (you, your coordinator, your Consultant; never public) is the
   most specific trust device on the site and it describes real behaviour.
3. **Mobile Arabic reads well.** Alexandria/Cairo, line-height, logical properties, the sticky bottom "أرسل حالتي"
   with "لا التزام عند البدء" — the phone experience is already better than most competitors' desktop.

## Priority issues

**[P1] The hero shows a photograph, not the product.** The stock consultation still (and its AI-generated look) is the
one thing on the page that is not evidence. *Why it matters:* trust on this site must come from demonstrated process,
because testimonials and outcomes may not be used; a generic photo spends the most valuable viewport on an assertion.
*Fix:* make the hero's visual the **dossier preview**: three stacked pages that place themselves (200 ms, reduced-motion
aware) — "Case received · RS-2026-000421 · with Mariam", "Reviewed by Dr … · Credentials reviewed · current", "Preliminary
estimate · USD 4,200–5,100 · what it includes" — rendered from synthetic data in the brand's paper-and-ink style, with a
coral date stamp as the signature motif. Keep the photograph as a secondary image lower on the page or on How it
works. *Command:* `/impeccable shape` then `/impeccable bolder` on `Hero.tsx`.

**[P1] Named people are promised, initials are shown.** The care-area grid and the Consultants page show "AA · HA"
chips; the coordinator is "your coordinator". *Why it matters:* "one coordinator throughout" and "Consultant-led review"
are the positioning; chips read as placeholders and undo the claim. *Fix:* Consultant cards with a photograph (with
consent), full name, "Credentials reviewed · current", where they practise (city, facility from the registry),
languages, years; a "Your coordinators" strip with first names, photographs, languages and the reply window (Sat–Thu
10:00–20:00 Cairo, reply within 2 working hours). Both are true today or become true with P1-14 and the coordinator
directory. *Command:* `/impeccable harden` (data) and `/impeccable clarify` (copy) on `CareSystemsGrid.tsx`,
`consultants/`, a new `CoordinatorsStrip`.

**[P1] Send my case opens with a warning, an account prompt and a question.** The first screen is the red emergency
notice, then "Already have an account?", then "Who is this case for?". *Why it matters:* the emotional opening of
the one conversion surface is caution and administration; the reply promise and the time it takes are nowhere near
the form; on a phone the primary button is below two screens of fields. *Fix:* a calm promise header above the stepper
("About 5 minutes. A coordinator replies within 2 working hours, Saturday to Thursday. No commitment."); the emergency
notice as one quiet line with a disclosure (keep the P0-3 content, change the weight); the account line moved into
the contact step; a persistent "What happens next" rail (desktop) / collapsed line (phone) with the three artefacts;
"Continue later on WhatsApp" that sends the draft's resume link (the backend already keeps a draft); camera-capture
guidance on the upload step ("photograph each page; we read scans and phone photos"). *Command:* `/impeccable onboard`
then `/impeccable clarify` on `CaseForm.tsx`.

**[P2] Home order and length.** Eight sections; "Travel support" sits above "How your information is handled"; the
care-area grid (nine cards with sub-specialties and chips) asks the visitor to self-classify although the product
promises routing. *Fix:* order — hero (dossier) → named people → price story in three steps (with a synthetic range)
→ how your information is handled → care areas as a single quiet row of nine names ("you do not need to choose; we
route") → travel support → CTA. Cut the band of five icons into the hero card's last line. *Command:* `/impeccable
distill` then `/impeccable layout` on `app/[locale]/page.tsx`.

**[P2] Entrance animation robustness.** The lead, buttons' context and the hero card start at opacity 0 and depend on
the animation finishing. *Fix:* keep the rise but make the element's normal state the final state: `animation-fill-mode: backwards`
instead of `both`, total delay 0–0.2 s, and the whole block already sits inside `prefers-reduced-motion:
no-preference`. If the animation never runs, the content is simply there.
*Command:* `/impeccable animate` on `theme-petrol.css`.

## Persona red flags

**Jordan (first-timer, Libya, on a phone, Arabic):** reads "استشاري" and "منسّق" and wants to know who; sees initials.
Reaches the form and meets a red box first. Does not know what "preliminary estimate" will look like until How it
works, which is a separate page. Will send the case anyway if WhatsApp is offered — it is — but the site did not earn
it; WhatsApp did.

**Casey (distracted, one-handed, interrupted):** the sticky bottom CTA is right; the form has no "continue later";
a tab switch loses the draft on the phone (the server keeps it, the phone does not know how to find it); the upload
step gives no camera guidance; the primary button on step 1 is two screens down.

**Riley (stress tester):** the form's failure stages are good; Track case is neutral on unknown cases (correct);
pasting a number with spaces into the case-number field — verify; Arabic numerals in the case number — verify;
long single names and the "single legal name" path — handled.

## Minor observations

- Header: seven items, two CTAs ("Coordinator", "Send my case"); keep both, demote "Coordinator" to an icon+label
  link in the same visual weight as the language switch.
- "9 care areas across 6 body systems" is a taxonomy statement; the patient-facing line is "whatever the condition,
  we route it" — keep the number as a quiet fact.
- Country search and country names in English on `/ar` (known #1, batch B1).
- Footer disclaimer paragraph is the longest text on the page; shorten and link to the medical disclaimer.
- `TrustSection` cards: the fourth (emergency) uses the alert palette inside a trust section; move the emergency
  statement to the footer band and keep the trust cards in one palette.

## Direction: the dossier, shown

Within the committed world (Petrol & Paper, hand-heart mark, calm voice), the distinctive move is to **show the
product's artefacts as physical pages** throughout the public site, with one signature motif — the **coral date
stamp** — that appears exactly where something real happened: case received, Consultant assigned, estimate ready,
arrival, discharge. The motif is already latent in the palette (`logo-coral`) and in the brief ("stamped pages" in
the earlier review); nothing new is invented, and it resonates with the audience's experience of official documents.

Signature elements (public site):

1. **Hero dossier preview** (P1 above): three synthetic pages, Arabic-first typography, the stamp pressed on the first
   page as the page loads; prefers-reduced-motion shows the final state.
2. **Named people strip:** coordinators and Consultants with photographs, the reply window, languages. Real data only.
3. **Price story in three steps** with one worked synthetic range and the sentence "the final quote never exceeds the
   estimate's maximum without a written reason" (once P1-10 ships; until then "labelled as an estimate").
4. **"How your information is handled"** promoted to the third screen; unchanged content.
5. **Send my case** as a calm, three-screen, phone-first conversation with the promise header, the artefact rail and
   "continue later on WhatsApp".
6. **Confirmation page = dossier page 1** (P2-20): the stamped case number, "Your file is with ‹first name›", service
   hours, one button.
7. **Consultant profiles** (P1-14) as dossier-style credential pages: reviewed credentials, practice locations from the
   facility registry, languages, no ratings, no promotional copy (ethics regulation Article 10).

Anti-patterns to keep out: stock smiles, counters ("1,200 patients"), countdown or urgency language, chat widgets on
the patient path, carousels, more than one route to the form per page, Western-first typography on `/ar`.

Acceptance for the pass: critique re-run ≥ 28/32; axe ratchet unchanged or smaller; Playwright `home`, `case-flow`,
`a11y` green in EN and AR at 375/768/1280; Lighthouse performance ≥ 90 on the home at 375 px; owner sign-off on the
hero and the form opening at the shape gate.

## Run order (through `/redesign-area`)

1. Shape plan: `docs/ux-redesign/plans/public-site-trust.md` — hero dossier, named-people strip, form opening; owner
   gate.
2. Build slice A: hero + named people (data from the directory; photographs supplied by the owner with consent).
3. Build slice B: Send my case opening, artefact rail, continue-later link, upload guidance.
4. Build slice C: home order and distill; animation robustness; Arabic numerals/country names (with B1).
5. Polish and re-critique; update `DESIGN.md` (stamp motif, dossier page component) and `STATUS.md`.

Questions skipped: the owner asked for the review as a document; the three decisions it needs are listed under
"Owner decisions still open" in the implementation plan (direction approval, photograph consent, hero before or after
P1-10's price story).
