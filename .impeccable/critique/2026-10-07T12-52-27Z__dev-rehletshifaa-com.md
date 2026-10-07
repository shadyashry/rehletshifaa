---
target: "public site: home, care-areas, consultants, how-it-works, send-my-case"
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "url:https://dev.rehletshifaa.com/"
timestamp: 2026-10-07T12-52-27Z
slug: dev-rehletshifaa-com
---
Method: dual-agent (A: design review · B: detector + browser)

# Critique: public site (home, care-areas, consultants, how-it-works, send-my-case)

## Design Health Score: 25/40 (Acceptable)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Phone stepper shows bare numbers for steps 2–3; success screen gives no response-time expectation |
| 2 | Match system / real world | 2 | WhatsApp prefills English on /ar; "care area" = 9 specialties and 6 systems; Latin initials on Arabic pages |
| 3 | User control and freedom | 3 | Back, review step, "Not now"; no save-and-resume |
| 4 | Consistency and standards | 2 | 4 step models; Start/Send my case; Case Number/ID; Title Case drift; old radii in the form |
| 5 | Error prevention | 2 | Dial code locked to patient country; file types/15 MB only in errors |
| 6 | Recognition rather than recall | 3 | Success screen doesn't say keep case number + WhatsApp |
| 7 | Flexibility and efficiency | 2 | No resume; no WhatsApp intake |
| 8 | Aesthetic and minimalist | 2 | Repeated CTAs and stats; consultants 13,079px at 375; ~6-tier cards |
| 9 | Error recovery | 3 | Strong non-duplication recovery copy |
| 10 | Help and documentation | 3 | Coordinator WhatsApp everywhere, but English/"cardiac" prefill |

## Design Specificity Verdict
Copy is specific; composition is the medical-tourism template. Dossier, coordinator and preliminary→final quote staging are never shown; "final quote" appears on no page. Detector: 0 static findings; 16–72 rendered findings per page, mostly false positives from gradient-drawn underlines, the coral CTA rule, the closed mobile menu and unscrolled view() reveals. No overlay: CSP blocked detect.js.

## Priority Issues
- [P0] "Verified" labels on home/care-areas/consultants (en.json ~155, 193–194, 525–717 + ar) contradict PRODUCT.md. Fix: neutral labels, verification as process. → clarify
- [P1] WhatsApp prefills English-only; send-my-case/page.tsx:13 hard-codes "cardiac"; CaseForm.tsx:274; layout.tsx:8 metadata. Fix: localize, drop cardiac, add case number. → harden
- [P1] Representative cannot enter own country code (CaseForm.tsx:129, :387). Fix: independent phone country selector. → harden
- [P1] Index pages stack CTAs (care-areas/page.tsx:69,151; consultants/page.tsx:75,131; header CTA on /send-my-case) and share one hero/stats template. Fix: one quiet CaseRouter link, stats on home only, page-specific index layouts. → distill
- [P2] Journey/cost models disagree (4/7/5/3 steps; 9 areas vs 6 cards; "Choose" vs "don't need to choose"; travel package asked pre-proposal). Fix: one 4-stage model, body systems vs care areas, cost-stage diagram. → clarify, shape

## Persona Red Flags
- Jordan: conflicting step counts; 9 vs 6; choose/don't choose; sign-in prompt first on the form.
- Casey: 8–13k px pages; sticky bar duplicates hero CTA; unlabeled stepper; no resume; 10.5–11.5px labels.
- Sam: no required/aria-required; hints inside labels; country picker lacks combobox role; h2→h4 skip on consultants.
- Arabic relative abroad: English/cardiac WhatsApp; locked country code; Latin initials; Arabic eyebrows tracked 0.12em (petrol .eyebrow out-specifies the [dir=rtl] reset).

## Minor Observations
Placeholder contrast ~3.1:1; How-it-works phase headings 0px above/64px below; PageHero radial gradient with physical 88% position; CaseForm upload uses off-system radii/bg-mist/shadow-sm; blur in reveals; ~47% of home hidden until scrolled; Title Case drift; repeated "Professional distinction"; CV qualifier inconsistency; Germany-based Consultant unexplained; CarePathways.tsx:58 fires send_case_cta_clicked; no footer Track case link; CaseForm copy hard-coded; 12px phone gutters; Cloudflare beacon CSP error.

## Questions to Consider
- Why does the public site never introduce a coordinator?
- What if home showed a redacted sample deliverable?
- Should "Send on WhatsApp" be an equal first step?
