---
target: public site (dev.rehletshifaa.com, branch build)
total_score: 24
max_score: 36
na_heuristics: 7
p0_count: 0
p1_count: 3
target_identity: "url:https://dev.rehletshifaa.com/"
timestamp: 2026-10-09T14-11-07Z
slug: dev-rehletshifaa-com
---
Method: dual-agent (A: design-review sub-agent · B: detector + browser sub-agent), isolated, parallel. Evidence: production build of `feat/ux-redesign-batch-3` at localhost (what dev.rehletshifaa.com serves after merge), en/ar at 390 and 1440, live probes; home, How it works, Care areas, /cardiology, Consultants, Send my case, Track case.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Active nav, breadcrumb, labelled form stepper; the How it works preview fills stage 2, which can read as "you are here" |
| 2 | Match System / Real World | 2 | Plain-language home/How it works, but /cardiology listed TAVI/TAVR, TEER, ICD, CRT-D unexplained; "(2024 CV)" leaked into a role |
| 3 | User Control and Freedom | 3 | "No commitment" and "Not now" branches; typed form data lost on reload; language switch hidden on phones |
| 4 | Consistency and Standards | 2 | Four names for one action (Start my case / Send my case / Send Your Medical Case / Send My Case); Case Number vs Case ID; Title Case drift |
| 5 | Error Prevention | 3 | Good guardrails; file types and 15 MB limit shown only as an error; track-case placeholders look filled |
| 6 | Recognition Rather Than Recall | 3 | Labelled nav and cards; the mobile care-areas wheel is icons only; no Track case in the footer |
| 7 | Flexibility and Efficiency | n/a | Persuade/Read surface (playbook allows n/a) |
| 8 | Aesthetic and Minimalist Design | 2 | Calm palette, repeated content: duplicate headings, a 3-up strip repeated across pages, distinction lines repeating the role |
| 9 | Error Recovery | 3 | Specific form errors that keep work; privacy-preserving track-case message |
| 10 | Help and Documentation | 3 | Case-number disclosure, "How secure tracking works", WhatsApp coordinator on every page; nothing at the upload |
| **Total** | | **24/36** | **Acceptable (67%; up from 25/40, 62.5%)** |

n/a heuristics: 7 (applicable maximum 36).

## Design Specificity Verdict

**LLM assessment:** about 70% product-specific — Petrol & Paper, Alexandria headings shared with the wordmark, the coral eyebrow rule, numbered journey markers, YOU/NEXT pairs, the "Your case" hub, body-system colour families, the access diagram, and genuinely re-laid-out Arabic. Generic: icon-in-square feature rows, the 3-up routing strip, the big-number stat strip, the skeleton-bar mock on /consultants, pill flowcharts. Biggest missed opportunity: the coordinator relationship ("the product") appears only as a small note and a WhatsApp chip.

**Deterministic scan:** `impeccable detect` over the public components and routes: 0 findings (also with `--no-config`). Browser overlay (detect.js, CSP bypassed in the test browser only) on /en, /ar, How it works, Care areas, /cardiology, Consultants, Send my case: `low-contrast` on the old "01–06" numerals (already removed in this branch) and on the Arabic logo accent (logotype, exempt); `border-accent-on-rounded` (hero card), `line-length` (footer notice ~110 ch), `kicker-above-heading` ×25 (the documented eyebrow), `icon-tile-stack` ×8 (care-area cards), `nested-cards` (both false positives: an illustration and a compound phone field), `em-dash-overuse`, `cream-palette` (the brand paper). Mechanical: no horizontal overflow; 11px avatar initials and 11.2px diagram chips; no real content hidden below the fold; the home page carries three "Start my case" links in `main`.

## Overall Impression

The honest cost staging and the decision fork are the site's best moments. The weak points were trust at the upload, naming drift around the one action that matters, and clinical shorthand on the pages where families decide.

## What's Working

- Honest, structured cost and decision copy (preliminary estimate → final quote; "You decide → Not now").
- Arabic is laid out, not mirrored.
- Track case is privacy-first.

## Priority Issues

- **[P1] No reassurance where patients upload files or first wonder about cost** — no privacy line at the drop zone, limits only as an error, a 12px secure note, typed data lost on reload, silence on whether the review costs anything. → harden (fee wording: owner decision)
- **[P1] One action and one identifier, four names each** — Start/Send my case variants; Case Number vs Case ID; Patient Coordinator; Title Case. → clarify
- **[P1] Clinical acronyms and CV residue** — /cardiology acronyms, "(2024 CV)", distinction lines repeating the role, "TEVARو EVAR". → clarify
- **[P2] An Arabic-first family arrives in English on a phone** — `/` always redirects to `/en`; the language switch is inside the phone menu. → adapt
- **[P2] Repeated "Start my case"** — 3–4 per home page against the one-route rule. → distill

## Persona Red Flags

**Jordan (first-timer):** the Coordinator chip doesn't say WhatsApp; icon-only care wheel on phones; "Four steps" vs 01–07; never learns whether the review is paid.
**Casey (mobile):** ~2,700px first form step; data lost on reload; manual "+—" phone code; 12px helper text; 37–41px wheel targets and 40px filter chips.
**Riley (stress tester):** Case Number then Case ID; placeholders that look filled; truncated badges; clipped avatar initials; "(2024 CV)".
**Ahmed (Benghazi, Arabic-first, acting for his father):** lands in English; Arabic /cardiology still shows TAVI/TEER/ICD; Latin monograms and "Dr. med."; bidi breaks ("TEVARو EVAR", the track-case phone hint).

## Minor Observations

PageHero "mist" glow on Send my case; off-family radii and shadows on Track case; text under 13px in diagrams and avatars; 36px desktop language switch; repeated headings on Care areas and /cardiology; the plastic-surgery icon reads as face ID.

## Questions to Consider

- If the home page ended at "How your information is handled", would it feel more like a clinical dossier and lose anything?
- What would a Consultant card look like that leads with "conditions this Consultant helps you decide about"?
- If the coordinator is the product, should the persistent phone element be the WhatsApp coordinator rather than the form?
- Is "No commitment to start" honest enough while the site is silent on whether the review is paid?

## Resolution (Close step, same branch)

The P1s were fixed before merge, except the review-fee wording, which waits on an owner decision: a privacy and file-rules line at the upload (facts from PRODUCT.md only), a 14px secure note, and a leave-first warning instead of storing medical details in the browser; one name each — **Send my case**, **Track case**, **case number**, **coordinator** — in sentence case (en; Arabic «أرسل حالتي»); /cardiology lists lead with plain treatment names (acronyms in brackets), CV sourcing notes stripped, distinction lines that restate the role hidden, Arabic Latin join spaced. P2s are on the backlog's Post-launch list.
