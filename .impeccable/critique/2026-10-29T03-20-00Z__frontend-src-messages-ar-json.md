---
target: The Arabic experience, cross-cutting (UX area X baseline): type scale (globals.css, theme-petrol.css), numerals and bidi isolation, terminology in messages/ar.json, the public pages and the portal in ar
total_score: 26
max_score: 40
p0_count: 0
p1_count: 2
timestamp: 2026-10-29T03-20-00Z
slug: frontend-src-messages-ar-json
---
Method: dual-agent. Assessment A (design review: source, DESIGN.md, ar.json counts, the live /ar pages at 390 and 1440 on
`next dev`) and Assessment B (detector on `components/portal`, `components/home`, `app`; computed type, overflow, digits and
English leaks measured in the browser on /ar, /ar/how-it-works, /ar/send-my-case, /ar/track-case at 390 and 1440) ran
isolated and were merged here. Modes: Persuade (public), Operate (portal). Synthetic data only.

## Design Health Score

| # | Heuristic | Score | Key evidence |
|---|-----------|-------|--------------|
| 1 | Visibility of System Status | 3 | Stages, stamps and current step read in Arabic; nothing Arabic-specific missing |
| 2 | Match System / Real World | 2 | The deposit has four names (وديعة 53, عربون 9, الدفعة المقدمة 6, دفعة التنسيق 3); masculine address only |
| 3 | User Control and Freedom | 3 | No Arabic-specific gap |
| 4 | Consistency and Standards | 2 | منسّق 116 / منسق 106 on the same screen; Finance four ways; the Control Center prints Arabic-Indic digits (`"ar"`, `"ar-EG"`) where patients read Latin; the petrol theme's Arabic leading (1.25) contradicts DESIGN (1.3/1.36) on desktop only |
| 5 | Error Prevention | 2 | Arabic-Indic digits typed into the case form's phone, the track-case WhatsApp and case-number fields are deleted, not read (`CaseForm.tsx:433`, `TrackCaseLanding.tsx:130,351`) |
| 6 | Recognition Rather Than Recall | 3 | Isolation designed in (`<bdi dir="ltr">` on amounts, FSI in `portal-labels`), but `fillTemplate` leaves `{amount}`/`{caseNumber}`/`{date}` raw in 49 components |
| 7 | Flexibility and Efficiency | 3 | OTP and amount fields already accept ٠–٩ |
| 8 | Aesthetic and Minimalist Design | 3 | Calm Arabic pages; off-ladder sizes (15.68px lead, 21.6/25.6/29.6/30.4px utilities, 17.6px titles); a statement can outgrow a headline in Arabic (20→28 vs 22→28) |
| 9 | Error Recovery | 2 | A blanked phone field gives no message |
| 10 | Help and Documentation | 3 | Hints present in both languages |
| **Total** | | **26** | **Acceptable**; area X target at close ≥ 32 |

## Priority issues

- **[P1] Arabic-Indic digits deleted at the first touchpoints** (A, B). Fix: one `latinDigits` helper before every digit filter. → X-0.
- **[P1] The deposit's Arabic names prejudge the refund terms** (عربون = earnest money forfeited on withdrawal; وديعة = held in
  trust, fully returnable). Fix: one neutral term, «دفعة التنسيق», legal sign-off. → X-2, launch gate.
- **[P2] Arabic leading and sizes drift in the cascade**: theme-petrol's `line-height: 1.25` beats globals on desktop; 15.68px phone
  lead; the portal's `.headline` cancels the Arabic step-down; `.statement` keeps Latin tracking and size in Arabic. → X-0.
- **[P2] Latin tracking and uppercase reach Arabic**: CaseForm legends (`uppercase tracking-wide`), CareJourney h3 (−0.01em). → X-0.
- **[P2] Digits and dates bypass `intlLocale`**: 11 Control Center sites, `ProposalSign.tsx:332` (inside the English-only legal
  line, kept). Raw placeholders in `fillTemplate`; the rate written both ways (backlog 738). → X-1.

## Persona red flags

- Sudanese relative on a phone: types the WhatsApp number on an Arabic keypad; the field stays empty with no message. Reads
  «عربون» and fears losing the money.
- Libyan patient: digits fine; sees the rate one way on the quote and the other way on the re-approval; the receipt says وديعة where
  the account said عربون.

## Detector

`components/portal` 0, `components/home` 0, `app` 1 (`bounce-easing`, theme-petrol.css:1173, advisory, out of scope). No overflow at
390 or 1440 on the four public pages. No Arabic-Indic digits rendered anywhere on the public side. English on /ar: the wordmark
(intended), Latin initials in consultant avatars (`CareSystemsGrid.tsx:73`, backlog), the `RS-` prefix (intended).

## Questions skipped

Questions skipped: the owner's standing instruction (2026-10-15) is to chain slices without gate prompts; decisions are recorded
as recommendations in `docs/ux-redesign/plans/arabic-first.md` and go to the native reviewer.
