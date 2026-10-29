---
target: The Arabic experience at the close of UX area X (ar.json, Keycloak Arabic, Arabic scale, digits)
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\affectionate-zhukovsky-5602ef\\frontend\\src\\messages\\ar.json"
target_fingerprint: "sha256:e33413a85abf2e552e1eaed022bc96e38e9e140baa1f2626b41ead997492e403"
target_path: "C:\\Users\\hp\\Projects\\rehletshifaa\\.claude\\worktrees\\affectionate-zhukovsky-5602ef\\frontend\\src\\messages\\ar.json"
timestamp: 2026-10-29T08-40-27Z
slug: frontend-src-messages-ar-json
---
Method: dual-agent, isolated. Assessment A (design review: sources, the X-0..X-3 diff, the plan, `scripts/arabic-terms.mjs`, a
Playwright read of /ar, /ar/how-it-works, /ar/send-my-case, /ar/track-case at 390 and 1440 on `next dev`) and Assessment B
(detector on `components/portal`, `components/home`, `app`; computed type, overflow, digits, Latin leaks, «يرجى» count, the empty
case-form submit and Arabic keypad digits in track-case, measured in the browser). Modes: Persuade (public), Operate (portal).
Synthetic data only. A scored the working tree at **31**; four of its findings were then fixed in X-3 (shadda drift, the generic
activation error, staff stage labels assuming a male patient, an 11.2px diagram label), and the synthesis re-scores H4 on that state.

## Design Health Score

| # | Heuristic | Score | Key evidence |
|---|-----------|-------|--------------|
| 1 | Visibility of System Status | 3 | Stages and stamps read in Arabic; admission is now an institution's decision («اعتُمد دخولك إلى المستشفى»), not a claim about the reader |
| 2 | Match System / Real World | 3 | One neutral deposit term (legal sign-off open); adjectives about the reader neutralised; masculine imperatives kept as the UI convention, for the reviewer |
| 3 | User Control and Freedom | 3 | No Arabic-specific gap |
| 4 | Consistency and Standards | 4 | One term per concept, enforced by script (deposit 71, Finance 67, coordinator 226, estimate 124, quote 116); one register (0 «يرجى»); one digit set; shadda unified on تحقّق/تعذّر/تحدّث (92 sites) — Control Center still plain, in its convergence row |
| 5 | Error Prevention | 4 | Arabic keypad digits read everywhere (track-case `٠١٢` → `RS-012`, `012`); amount fields text + `readAmount`; 0 Arabic-Indic digits rendered |
| 6 | Recognition Rather Than Recall | 3 | `fillTemplate` isolates values; placeholder parity clean; no raw `{x}` rendered |
| 7 | Flexibility and Efficiency | 3 | Unchanged |
| 8 | Aesthetic and Minimalist Design | 3 | No Latin tracking/uppercase on Arabic, no overflow; but ~20 call sites keep off-ladder Latin sizes (`text-[0.9rem]`/`[0.95rem]`) in Arabic, h2 = h3 (17px) on how-it-works at 390, case-story tab labels 12px |
| 9 | Error Recovery | 3 | Refusals name the fix (three new field messages; activation error now routes to the coordinator); focus stays on «التالي» after a failed case-form step, and the dial-code select has no label |
| 10 | Help and Documentation | 3 | Hints present in both languages |
| **Total** | | **32** | **Good**; baseline 26; area X close target ≥ 32 met |

## Priority issues

- **[P1] Deposit term and four legal sentences not signed off** (A). «دفعة التنسيق» is neutral, but launch is gated on legal F2/L1–L5
  (backlog 393/506/576). No copy change; `native-arabic-review.md` carries it.
- **[P2] Off-ladder Arabic sizes at call sites** (A, B): `text-[0.9rem]`/`text-[0.95rem]` in ~20 components (CoordinatorActions,
  PriceTransparency, ProposalSign, dialogs, portal-ui feedback), how-it-works h2 = h3 at 390. Fix: `rtl:` sizes on the Arabic ladder
  (body 16, label 14) per DESIGN.md "Arabic scale". → backlog "Area X".
- **[P2] Case-form step refusal leaves focus on «التالي»; the dial-code select has no accessible name; «اختر الفئة العمرية.» has no
  `aria-invalid` field** (B). → backlog "Area X" (shared polish).
- **[P3] Masculine imperatives remain** (A): the UI convention, carried to the reviewer as a decision.

## Persona red flags

- Sudanese relative on a phone: digits read, errors name the fix, the deposit word frightens no one; small tab labels (12px) remain.
- Libyan patient: one deposit word from estimate to receipt; one rate direction.
- A woman patient reading "you": adjectives about her are neutral; imperatives are masculine by convention (reviewer).

## Minor observations

- Detector: `components/portal` 0, `components/home` 0, `app` 1 advisory (`bounce-easing`, theme-petrol.css, out of scope).
- The wordmark renders "RehletShıfaa" with a dotless ı as a styled glyph; the accessible name is "RehletShifaa" (intended logo).
- «اختر الدولة أولًا» / «اختر رمز الدولة» double as placeholders, so they carry no full stop.
- Keycloak: 0 «يرجى»; `passwordRuleLatin` explains switching the keyboard.

Questions skipped: the owner's standing instruction (2026-10-15) is to chain slices without gate prompts; the open decisions are in
`docs/ux-redesign/native-arabic-review.md` for the native reviewer.
