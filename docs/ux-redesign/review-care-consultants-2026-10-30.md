# Review: Care areas and Consultants (2026-10-30)

Method: dual-agent Impeccable critique, read-only.
- Assessment A: design review from source and screenshots.
- Assessment B: the detector on source and on live URLs, plus a browser overlay and measurements.

Pages:
- `/care-areas`
- `/cardiology` (stands in for the nine care-area pages)
- `/consultants`
- `/consultants/ahmed-alashry`

All were checked in en and ar at 390 and 1440 px. They ran on a production build on the isolated QA stack, with the 13 profiles seeded by migrations. Screenshots are in `screenshots/review-care-consultants-2026-10-30/`: full pages, plus screen-height slices in `slices/`.

**Score: 24/40, Acceptable.** These pages were never a redesign area of their own; they only went through the site-wide batches and the Arabic pass.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Live result count and breadcrumbs. The filter is not in the URL, so it is lost after opening a profile. |
| 2 | Match with the real world | 2 | Body-system taxonomy and unexplained acronyms (PCI, TEER, EBAC, FEBIC). Search fails on lay words: "chest pain", "back pain", "cancer" and «دعامة» all give 0. |
| 3 | User control and freedom | 3 | Clear filters, breadcrumbs and back paths are all present. |
| 4 | Consistency and standards | 2 | Three different three-step stories on one page. Plural copy for one Consultant. Two Arabic terms for "structural heart". |
| 5 | Error prevention | 3 | "You don't need to choose" comes only at the foot of the page. |
| 6 | Recognition rather than recall | 2 | The wheel is icons only on phones. Initials stand in for faces. Credentials are not explained. |
| 7 | Flexibility and efficiency | 2 | No synonyms, no search across scripts, no shareable filter. |
| 8 | Aesthetic and minimalist design | 2 | The one Consultant is named three times on Cardiology. Stats strip, gradient wash and spinning orbit on the profile. |
| 9 | Error recovery | 3 | Good empty state. A failed directory fetch, though, reads as "No Consultants match your search". |
| 10 | Help and documentation | 2 | No inline explanation of credentials or procedure acronyms. |

Detector: 0 findings on the `.tsx` source. That scan is regex-only and undercounts. On the live pages it found:
- an icon tile above each heading on the nine atlas cards (`CareAreaCard.tsx:35`);
- a card nested in a card (`ConsultantMatching.tsx:22`);
- a gradient disc on the profile (`ProfileVisuals.tsx:16`, `[slug]/page.tsx:132`);
- four eyebrow-plus-heading pairs per page.

Expected noise: the cream ground is the Paper token; the straggler and line-length findings come from the shared `Footer.tsx`. Contrast: no text below AA on any page. Sideways overflow: none.

## Priority issues

1. **[P1] The step asks visitors to classify themselves, though the product promises routing.** Cross-page.
   - The atlas intro says "Choose the one closest to your need".
   - The "you don't need to choose" router sits after 9 cards (`care-areas/page.tsx:132`).
   - Search only matches names, specialties, focus and qualifications (`ConsultantPanel.tsx:169`), so lay words give 0.

   **Fix:**
   - Put the router's promise in or right under the hero, and rewrite the atlas intro as coverage, not choice.
   - On phones, show the atlas as a compact list of nine links.
   - Make the search placeholder honest, or add lay synonyms in en and ar.
   - Put the Send my case link inside the empty state.

   *distill, then clarify.*
2. **[P1] Trust claims outrun the evidence shown.** Consultants page and profile. **Fixed in `107ec766`** (review steps, hero count, V110 CV notes, label, icons); open: owner content checks (EBAC, Bavaria, highlights, listing unreviewed profiles).
   - "Checked against official sources … with institutional sources" (`consultantsPage.verification.steps[1]`) is contradicted on the profile, whose only source is "consultant-supplied curriculum vitae".
   - Sourcing notes leak into patient copy ("(CV-reported)", «وفق سيرة 2024»).
   - "Professional distinction" labels trainings and talks.
   - EBAC is shown as a credential. It accredits CME programmes, so this needs owner confirmation.
   - The hero says "named senior Consultants" for each area, but six of the nine areas have one.
   - Shield and badge icons imply verification.

   **Fix:**
   - Claim only what was checked, shown per profile with a date; otherwise say it happens before matching.
   - Move the sourcing notes into the sources line.
   - Rename or drop the distinction label.
   - Use neutral icons.

   *clarify, plus an owner content check.*
3. **[P1] Arabic reads as a translation.** Cross-page.
   - Latin initials are every Consultant's identity on Arabic pages (`CareAreaCard.tsx:57`, the matching hero, "AA" on the profile).
   - The plural is wrong for 11 and up: «13 استشاريين» (`ConsultantPanel.tsx:53` has only one/many).
   - "+1" renders as "1+" (`CareAreaCard.tsx:62`, not isolated).
   - Two Arabic terms for structural heart appear on one page.
   - Search works in one script only.

   **Fix:**
   - Arabic monograms or the specialty glyph.
   - `Intl.PluralRules` categories.
   - `<bdi dir="ltr">` on counts.
   - One term, settled in the native review.
   - Index names in both scripts.

   *harden, typeset.*
4. **[P2] Repetition inflates length.**
   - On Cardiology the single Consultant is named three times, under the plural "Meet the Consultants".
   - The three facets appear three times; the scope cards keep 01–03 numerals.
   - The closing eyebrow repeats the heading's question.
   - On Consultants the route is explained three times.
   - On the profile, FEBIC appears three times, and "Professional distinction" repeats the job title: `[slug]/page.tsx:97` lacks the card's `showDistinction` check.

   *distill.*
5. **[P2] Off-system decoration and vanity figures.**
   - The profile uses gradient tones, a coral ring and dots, and an endless spinning orbit (`ProfileVisuals.tsx:286-318`).
   - A blurred card is nested in the matching hero (`ConsultantMatching.tsx:271`).
   - A 22px card has a heavy shadow (`CareAreaDetail.tsx:124`).
   - The "18 / 4 / 4" stats strip reads as performance figures.
   - The matching figure lights a real Consultant's initials as "Matched" (`ConsultantMatching.tsx:317`).

   *quieter.*

## Smaller findings

- **Touch targets:**
  - The filter chips are 40px (`ConsultantPanel.tsx:178`).
  - English breadcrumbs and profile text links are 22–24px tall (`CareAreaDetail.tsx:68`, `[slug]/page.tsx:162`).
  - The header language switch is 36px.
  - English footer links are under 24px.
- **Semantics:**
  - On the profile, the stats `<dd>` comes before `<dt>` (`[slug]/page.tsx:143-144`).
  - The "Send us your case if…" title is a `<p>`, not a heading (`CareAreaDetail.tsx:217`).
  - The 9 wheel nodes plus 6 system chips are 15 jump links before the first card.
- **Content:**
  - Credential badges are truncated.
  - "Bavaria, Germany" appears without explanation.
  - "Also in Heart & circulation" labels a mixed grid.
- **Legacy styling:** radii of 14–22px, gradients and physical `left` (`CareNetwork.tsx:87,105,109`) are written into components and only neutralised by `theme-petrol.css`.

Strengths to keep:
- The care-network wheel and the matching diagram draw the routing promise.
- Each page has one in-content route to the form.
- Cardiology's "Send us your case if…" uses events patients actually go through.

Still blocked on consent (area 1b): photographs.
