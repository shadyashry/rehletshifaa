# Shape plan — Public site trust pass ("the dossier, shown")

Status: **approved by the owner in chat (2026-10-15: "do whatever you see is correct … free approval")**; built on
`feat/ux-trust-pass` (from `feat/review-p0` @ `adcab1b`). Source: `docs/ux-redesign/patient-site-review-2026-10-14.md`
(critique 24/32; P1 ×3). Plan slot: P1-20 in `docs/platform-review-implementation-plan-2026-10-14.md`.

## Job and audience

A worried patient or family member on a phone, Arabic first, who has never bought healthcare abroad, deciding in the
first ten seconds whether to trust the site enough to send medical papers. Mode: **Persuade** (home) and **Operate**
(Send my case). Testimonials, volumes, outcomes and partnerships may not be used (PRODUCT.md), so trust must come from
showing the product's own artefacts and naming real behaviour.

## Direction

Show the case file instead of describing it. One signature motif, the coral date stamp, pressed only where something
real happens. Petrol & Paper stays: no new colours; `--color-coral` (the logo's accent, already a token) carries the
stamp; everything else is ink, petrol and paper.

## Slices (this pass)

| # | Slice | Decision |
|---|---|---|
| A | **Hero = dossier preview.** `DossierPreview` replaces the consultation photograph: three pages placed on the desk (preliminary estimate, reviewed by a Consultant, case received), the top page stamped "Received · ‹today›", labelled "Example". Copy describes what the platform produces; no names, figures or promises. The "Start with what you have" card keeps docking onto the file's lower edge. The back pages show heading only; the top page is fully readable. | Built |
| A' | **Entrance robustness.** `animation-fill-mode: backwards` (never `both`), shorter delays; the pages and the stamp are the one authored moment; everything is visible if no animation runs. | Built |
| B | **Send my case opening.** Promise line under the title (about 5 minutes · a coordinator replies within 2 working hours, Sat–Thu · no commitment); emergency notice as a quiet one-line note with a disclosure (content unchanged, weight changed); the "already have an account" line moved to where saved details would be used; a "What happens next" rail beside the form with the WhatsApp route; camera guidance on the upload step. | Built |
| C | **Confirmation = dossier page 1.** The case number as the page heading, stamped "Received · ‹today›", "Your file is with the coordination team", the reply window, "keep this number", one primary action (Track your case) and the WhatsApp link as a quiet link. | Built |
| D | **Home order.** "How your information is handled" before "Travel support". | Built |
| E | Named people with photographs; coordinators strip | Deferred: needs photographs with consent and the real coordinator directory (P1-14, P1-20 b) |
| F | "Continue later on WhatsApp" resume link | Deferred: needs a backend resume link for a draft |
| G | Arabic numerals and country names on `/ar` | Deferred to B1 |

## Copy

All new strings in `messages/en.json` and `messages/ar.json`: `home.dossier.*`, `form.promise.*`, `form.nextSteps.*`,
`form.uploadCamera`, `form.success.*`, `common.emergencyNotice.more`. The reply window states the decided service
level (R10: Sat–Thu 10:00–20:00 Cairo, 2 working hours). Native Arabic review pending with the rest (G-13).

## Verification

Typecheck; eslint on touched files; vitest; Playwright `a11y.spec.ts` (en + ar) and `home-quality.spec.ts` against
the dev server; `home-media.spec.ts` updated for the hero (intended change); screenshots EN/AR at 1280 and 375.

## Owner decisions carried

- Photographs of Consultants and coordinators (consent) → slice E.
- Theme: keep Petrol & Paper (recommendation in the pass report); the stamp motif added to DESIGN.md.
