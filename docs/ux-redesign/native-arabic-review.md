# Native Arabic review — the launch gate

Status: **open, prepared 2026-10-29 (area X)**. No native sign-off has been given; nothing in this repository claims one.
This page is what the reviewer gets: a checklist, the decisions to confirm or overturn, and the list of every Arabic string
area X changed (before → after). Plan and glossary: `plans/arabic-first.md`. Rules: `DESIGN.md` "Arabic scale" and
"Numerals and isolation".

**Who:** a native Arabic speaker familiar with patients from Libya, Sudan, Iraq and Yemen (ideally one Maghrebi and one
Sudanese/Iraqi reader), plus legal for the money terms. **Where:** the dev site (`/ar`), the secure links and My Care on
synthetic cases (never real patient data), and the Keycloak pages; `messages/ar.json` and
`infrastructure/keycloak/themes/rehletshifaa/login/messages/messages_ar.properties` for the strings themselves.

## Sign-off record

| Reviewer | Role | Date | Scope | Verdict |
|---|---|---|---|---|
| — | native Arabic | — | whole site, portal, secure links, Keycloak | pending |
| — | legal | — | deposit, refund, cancellation, acceptance wording (L1–L5, F2) | pending |

## Checklist

### Decisions to confirm or overturn

- [ ] **Digits.** Latin digits (0–9) everywhere, Arabic included (DESIGN.md "The One Digit Rule"). Keep, or move counts and dates
      in running prose to Arabic-Indic (٠–٩)? Identifiers (case number, codes, references, phone numbers) stay Latin either way.
- [ ] **Month names.** Egyptian set (يناير … أكتوبر … ديسمبر). Acceptable for Iraqi readers, or the Levantine/Iraqi set (كانون الثاني …)?
- [ ] **The deposit.** «دفعة التنسيق» for the coordination deposit, replacing «الوديعة», «العربون» and «الدفعة المقدمة»
      (chosen as neutral on refunds; legal to confirm with the refund terms).
- [ ] **Finance.** «الفريق المالي» when the team acts; «المالية» only as a role or queue label.
- [ ] **Coordinator.** «منسّق» with shadda everywhere.
- [ ] **Estimate / quote.** «التقدير المبدئي» (preliminary) and «عرض السعر النهائي» (final); no bare «العرض», no «المقترح».
- [ ] **Exchange rate.** «سعر الصرف», the figure as one left-to-right run `1 USD = 50.25 EGP` the same way round as English.
- [ ] **Address.** Imperatives for actions; neutral phrasing where a relative or a woman may be reading; no «يرجى» beside
      imperatives. Is the masculine imperative acceptable as the UI convention, or should key patient screens be neutral throughout?

### Reading pass (each page in Arabic, on a phone)

- [ ] Every sentence reads as written Arabic, not translated English (word order, idiom, no calques).
- [ ] One word per concept across the site, the secure links, My Care, the staff portal and the Keycloak pages.
- [ ] Amounts, dates and case numbers sit in the right place inside the sentence (no flipped `1 EGP = …`, no stray punctuation
      at the wrong end of a line).
- [ ] Headings, labels and buttons have no letter-spacing or uppercase artefacts; the type is comfortable at 390px.
- [ ] Error messages say what to do next, in the same register as the rest.
- [ ] Legal and money sentences mean exactly what the English says (`ackShortFinal`, `payNowNote`, `nextPrelim[2]`,
      `blockedExpired*`; backlog "Blocked (legal / native)").
- [ ] Keycloak: sign-in, account setup, password rule, one-time code, passkey (USB «يو إس بي» vs "USB"; NFC wording).

### Open rows carried from the areas (backlog.md, "native review")

373, 393, 429, 434, 443, 454, 465, 506, 518, 576, 588, 731, 738, 740, 779, 783, 797 — each is mapped to a slice or to this gate in
`plans/arabic-first.md` ("The backlog's native-review rows").

## Changed strings

Filled per slice (key · before · after). X-0 changed no message string; X-2 and X-3 append their lists here.

| Slice | File | Key | Before | After |
|---|---|---|---|---|
| X-0 | — | — | — | (no strings changed: rules, type and digit input only) |
