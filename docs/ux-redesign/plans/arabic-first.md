# Shape plan — Area X: Arabic first, across the file

Status: **done, 2026-10-29** (X-0..X-3; closing critique 32/40; the native + legal gate stays open). Planned the same day, written without an owner gate under the owner's standing instruction (2026-10-15: "always
continue each next implementation on new session without asking me till the end"); assumptions are marked **[A]**.
Scope: `PLAN.md` row X — the Arabic type scale and the numeral rule in `DESIGN.md` (ex P2-21) with `theme-petrol.css`
aligned to them; an Arabic-first copy pass over `messages/ar.json` (and `en.json` where terms must match) and the Keycloak
bundles (`infrastructure/keycloak/themes/rehletshifaa`); the native Arabic review prepared as a launch gate.
Critique: `.impeccable/critique/2026-10-29T03-20-00Z__frontend-src-messages-ar-json.md`, **26/40** (dual-agent: design review +
detector and browser measurements on /ar at 390 and 1440). Target at the close: **≥ 32/40**.
Native sign-off is **not** claimed anywhere in this area; every Arabic decision here is a recommendation for the reviewer
(`docs/ux-redesign/native-arabic-review.md`).

## Job and audience

The patient's family reads the file in Arabic first: a Sudanese, Iraqi, Yemeni or Libyan relative on a phone, often on an
Arabic keypad, deciding about money and travel for someone else. They need one word for each thing (the deposit is the
same money on the estimate, the account and the receipt), digits that match what arrives in WhatsApp and what they type
back, and Arabic set as Arabic — not Latin type shrunk. Staff read the same words on the working side. Mode: Operate
(portal) and Persuade (public); the area is cross-cutting, so it changes rules and words, not layouts.

## Outcome and proof

- **Success:** the deposit, Finance, the coordinator and the estimate/quote each have one Arabic name on every surface (site,
  portal, secure links, Keycloak); a number typed on an Arabic keypad is read, never dropped; every amount, date and case
  number is Latin-digit and isolated inside Arabic text; every Arabic text role computes to DESIGN.md's Arabic scale.
- **Evidence:** vitest (`latinDigits`, `formatCaseId`, `intlLocale`), the a11y spec en + ar, the public and portal specs, a
  computed-style check of the Arabic roles at 390 and 1440, a term-count script over `ar.json` (one term per glossary row),
  the changed-strings list for the reviewer, the closing re-critique.

## Decisions (recommendations; the native reviewer can overturn any of them)

1. **Digits: Latin in both languages** (owner default since GATE 2, 2026-10-07; now written as DESIGN.md "Numerals and
   isolation" and "The One Digit Rule"). CLDR splits the audience (Libya Latin; Sudan, Iraq, Yemen, Egypt Arabic-Indic), but
   keypads, WhatsApp, bank and mobile-money messages and passports are Latin, and identifiers must match what is typed back.
   Inputs accept ٠–٩ and ۰–۹. The reviewer may move counts and dates in running prose to Arabic-Indic (one change in
   `intlLocale`); identifiers (case number, codes, references, phone numbers) never switch.
2. **Type: Arabic is its own scale** (DESIGN.md "Arabic scale"): every role steps down from Latin and opens its leading;
   statement below headline; nothing below 13px except badges, initials, figures and the home story's miniature pages
   (12px); tracking 0, no case transform.
3. **One term per concept** (glossary below). The deposit's word must not prejudge the refund terms (legal F2/L1–L5 open).

## Glossary (one term per concept)

| Concept | English | Arabic, one term | Replaces | Why |
|---|---|---|---|---|
| The coordination deposit | coordination deposit / deposit | **دفعة التنسيق** (plural none; "the deposit paid" «دفعة التنسيق المدفوعة») | «الوديعة»/«وديعة التنسيق» (73), «العربون» (15), «الدفعة المقدمة» (6) | Mirrors the English; neutral on refunds. «عربون» reads as earnest money forfeited on withdrawal, «وديعة» as money held in trust and fully returned — each answers a refund question legal has not answered. **Legal + native sign-off** |
| Finance (the team that acts) | Finance / the Finance team | **الفريق المالي** | «فريق المالية» (9), «قسم المالية» (1) | Most used form (17); a team, not a department |
| Finance (nav, role and queue labels only) | Finance | **المالية** | — | Short label beside other role names; "financial" as an adjective (الشروط المالية) is not this concept |
| Coordinator | coordinator | **منسّق** (with shadda; «منسّقك», «منسّقة» only for a named woman) | «منسق» (106) | The shadda separates the role (munassiq) from "coordinated"; 116 already use it |
| Preliminary estimate | estimate | **التقدير المبدئي** (then «التقدير») | «المقترح», bare «العرض» for the estimate | Says it is not a price commitment |
| Final quote | final quote | **عرض السعر النهائي** (then «عرض السعر») | bare «العرض» for the quote | "Price offer", the trade's own word |
| The proposal (either document, on the secure link) **[A]** | proposal | **عرض السعر** when it carries a price, **التقدير** before | «المقترح» (12), bare «العرض» (92, offer vs display) | Bare «العرض» is ambiguous; X-2 inventories the 92 uses one by one |
| Consultant | Consultant | **الاستشاري** | — | Already consistent (430) |
| Exchange rate | exchange rate | **سعر الصرف**; the figure is one LTR run `1 USD = 50.25 EGP`, the date in the Arabic sentence | the rate written both ways (backlog 738) | DESIGN.md "A rate is one run" |
| Case number | case number | **رقم الحالة** + `<bdi dir="ltr">RS-YYYY-NNNNNN</bdi>` | — | Already consistent |
| Address (register) | you | Imperative for actions («أرسل», «أدخل»); verbal nouns or passive for statements about the patient where a relative or a woman may be reading; no «يرجى» beside imperatives | «يرجى …» (17) mixed with imperatives | backlog 429, 465, 588 |

## Slices (one per session; each: Impeccable + the Vercel skills loaded at batch start, the four read-only reviews, verify, commit)

| Slice | What | Files | Depends |
|---|---|---|---|
| **X-0 the scale and the digits** (this session) | Critique; this plan; the reviewer checklist started; DESIGN.md "Arabic scale", "Numerals and isolation", "The One Digit Rule"; globals.css + theme-petrol.css aligned (petrol's 1.25 leading, statement in Arabic, portal-shell headline/title, ladder snaps, 15.68px phone lead → 16px); `latinDigits` in `lib/i18n.ts` replacing four copies and added to the case form, track-case and activation phone fields; Arabic tracking/case removed from CaseForm legends and CareJourney (its stage title on the Arabic title role); two off-ladder Arabic sizes; the dead `[dir=rtl] .text-2xl…` overrides removed (utilities outrank them); the Control Center's 11 `Intl` calls through `intlLocale` (review HIGH, pulled forward from X-1) | `DESIGN.md`, `globals.css`, `theme-petrol.css`, `lib/i18n.ts`, `lib/money.ts`, `CaseForm.tsx`, `TrackCaseLanding.tsx`, `ProfileActivation.tsx`, `OneTimeCodeStep.tsx`, `portal/panel-parts.tsx`, `journey/*`, `home/story/StoryScenes.tsx` | — |
| **X-1 isolation and digits everywhere** | An ESLint rule refusing `"ar"`/`"ar-EG"` literals in `Intl.*`; `fillTemplate` isolates `{amount}`, `{caseNumber}`, `{date}`, `{rate}` by default (LRI/FSI) where the caller passes plain text; the FX keys one direction (backlog 738); `Intl.NumberFormat(intlLocale())` for the raw counts (backlog 373); identifiers `nowrap`; the staff `type="number"` amount fields (`AdmissionPanel:333`, `DischargePanel:247`, `StaffCaseView:791`, `TreatmentPanel:453`) become `type="text" inputMode="decimal"` read by `readAmount`, and `VirtualClinic`'s hours through `latinDigits`; `panel-parts`' `en-US` grouping through `intlLocale`; the home story's 11px/9px Arabic captions (`CareSystemsGrid`, `StoryScenes:346`) to 12px | `lib/*`, `eslint.config.*`, portal amount fields, messages FX keys, home story | X-0 |
| **X-2 one term per concept** | The glossary applied to `ar.json` (inserted textually, never re-serialised) and `messages_ar.properties`; `en.json` only where an English term must match; a term-count script proving one term per row; the changed-strings list (key, before, after) appended to the reviewer doc | `messages/ar.json`, `messages/en.json`, Keycloak `messages_ar.properties`, `scripts/arabic-terms.*` **[A]** | X-1 |
| **X-3 register, the backlog's native rows, close** | Register pass (imperatives vs «يرجى», neutral address where cheap); the backlog rows tagged native review (table below) resolved or carried to the reviewer; reviewer checklist finished; re-critique ≥ 32/40; STATUS closes area X | `messages/ar.json`, Keycloak bundle, `native-arabic-review.md`, STATUS, backlog | X-2 |

## The backlog's native-review rows and where they land

| backlog.md line | Row | Slice |
|---|---|---|
| 373 | raw digits in past-case count and journey numerals | X-1 |
| 393 | Launch blocker: Arabic deposit/refund/cancellation terms + native review of portalWork, proposal, public copy | reviewer (gate) |
| 429 | masculine address; «عرض» ambiguous; `{count}` not Intl | X-1 (count), X-2 («عرض»), X-3 (register) |
| 434 | «الشروط المالية» vs «الشروط التجارية»; «تعيين قسم المالية»; «تقديم الرأي الطبي الثاني»; feminine priority adjectives; «تمّت تسوية الوديعة»; «إجراءات إضافية» | X-2 |
| 443, 454, 518 | منسّق vs منسق; «المقترح» vs «العرض»; «وديعة التنسيق» | X-2 |
| 465, 588 | masculine second person; «يرجى» vs imperatives on activation | X-3 |
| 506, 576 | `ackShortFinal`, `payNowNote`, `nextPrelim[2]`, `blockedExpired*`, final-quote nouns (legal meaning) | reviewer (legal) |
| 731 | fee derivation as an equation vs prose | X-3 |
| 738, 740 | rate direction; deposit three ways; Finance twice | X-1 (rate), X-2 (terms) |
| 779, 783, 797 | Keycloak 7-1..7-3 wording (NFC, password rule ranges, USB) | X-2 (glossary), reviewer |

## States and ranges

Arabic keypad digits (٠–٩, ۰–۹) typed mid-value and pasted; a long Arabic line around an amount, a case number and a name; a
woman or a relative reading "you"; 320px phones; the Control Center (legacy base theme) for the digit rule only.

## Open questions (assumed, not asked)

- O-1 Whether the native reviewer prefers Arabic-Indic digits in running prose (counts, dates) for Sudan/Iraq/Yemen — one switch.
- O-2 Month names: Egyptian set (أكتوبر) vs Levantine/Iraqi (تشرين الأول) for Iraqi readers **[A: Egyptian]**.
- O-3 The deposit's word needs legal sign-off with the refund terms (F2, L1–L5); «دفعة التنسيق» is the neutral recommendation.
- O-4 The caret jumps to the end when an Arabic digit is typed mid-number in the phone fields (the value is rewritten); accepted
  for short phone fields **[A]**.
