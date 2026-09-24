# Pre-8C commercial copy review pack (COPY-2)

> **2026-09-25:** the review returned. Decisions, remaining legal/business items and F1–F4 status are recorded in
> [pre-8c-commercial-copy-decisions.md](pre-8c-commercial-copy-decisions.md). This pack is kept as the pre-review record.

Date: 2026-09-24 · Status: **LEGAL/BUSINESS COPY REVIEW REQUIRED — nothing here is approved policy.** Phase 8C entry waits
for this review.

For the business/legal reviewer. Each section lists (1) the exact text the product shows today, (2) what the software actually
does — verified in code, and (3) the decisions only the business/legal owner can make. Engineering has **not** answered any
policy question below; where the product already implies an answer, that is flagged as *implied, not approved*.

Arabic wording is listed for completeness; Arabic terminology choices are in the [Arabic review pack](pre-8c-arabic-review-pack.md)
(M1–M4, X1–X3). After both reviews, engineering applies the approved text in one copy-only change.

## Highest-priority findings (review first)

| # | Finding | Why it matters |
|---|---|---|
| F1 | The patient ticks **"I have read and accept the coordination deposit, cancellation and refund terms."** (profile activation) but **no patient screen shows those terms**. The stored terms (below, B) are not in any patient-facing response. | Consent to unseen terms |
| F2 | The deposit's stored refund class is `NON_REFUNDABLE`, while its stored text says **"Refundable in full before case coordination begins; non-refundable once coordination has started."** | The two stored facts disagree |
| F3 | The staff proposal form sends fixed text: payment terms **"Payment schedule to be confirmed"**, refund terms **"Subject to provider terms"**, disclaimer **"This proposal is not procedure-specific medical consent."**, validity **14 days**. Only the disclaimer and the *Valid until* date are shown to the patient. | Placeholder terms stored on every proposal; decide what is shown |
| F4 | No patient screen explains exchange rates, although foreign-currency prices are converted from EGP at a stored daily rate. | Decide whether an explanation is required (D) |

---

## A. Preliminary care estimate

### Current copy (exact)

| Where | English | Arabic |
|---|---|---|
| Proposal document badge / title | Preliminary care estimate · Your preliminary care estimate | تقدير مبدئي للرعاية · تقديرك المبدئي للرعاية |
| Document + My Care, basis line | Based on the current recommendation and included services. The final treatment and price may change after an in-person assessment. | بناءً على التوصية الحالية والخدمات المشمولة. قد يتغيّر العلاج والسعر النهائي بعد الفحص الحضوري. |
| Document, price block | Estimated coordinated-care package · Expected · Estimated services total | باقة الرعاية المنسّقة التقديرية · المتوقع · إجمالي الخدمات التقديري |
| Document, coordination note | This package price includes RehletShifaa's case coordination, provider arrangements, scheduling and patient-support services. | يشمل سعر الباقة تنسيق الحالة وترتيبات مقدّمي الخدمة والجدولة وخدمات دعم المريض من رحلة شفاء. |
| Document, exclusions fallback | Services not listed in this estimate are not included, and would be discussed with you before being added. | الخدمات غير المدرجة في هذا التقدير ليست مشمولة، وسيتم مناقشتها معك قبل إضافتها. |
| Document, acknowledgement | I understand this is a preliminary estimate based on remote review. / The final treatment plan and price may increase or decrease after the treating doctor examines me. I will receive and decide on a final quote before non-emergency treatment. | أفهم أن هذا تقدير مبدئي يستند إلى مراجعة عن بُعد. / قد ترتفع أو تنخفض خطة العلاج النهائية وسعرها بعد فحص الطبيب المعالج لي. سأستلم عرضًا نهائيًا وأقرّره قبل أي علاج غير طارئ. |
| Document, what happens next | You acknowledge this estimate to continue. … After your in-person assessment you receive a final quote to decide on. | تُقرّ بهذا التقدير للمتابعة. … بعد فحصك الحضوري تستلم عرضًا نهائيًا لتقرّره. |
| Staff | Preliminary estimate | تقدير مبدئي |

### Facts confirmed by current software

- A preliminary estimate is a proposal version with document type `PRELIMINARY_ESTIMATE`, built from the consultant's approved
  remote clinical review and the cost-estimate lines the consultant recorded with it, in the proposal currency.
- The RehletShifaa margin is applied **when the estimate is created** (current margin policy) and locked; the final quote
  reuses it. The margin is never shown to the patient.
- Foreign-currency amounts use the stored daily EGP rate, **frozen on the version at release**.
- The patient **acknowledges** it (not "accepts"); acknowledgement triggers profile activation and the deposit request.
- It carries a *Valid until* date (staff form: 14 days); after that it expires automatically and cannot be acknowledged.
- The patient can request changes or decline; a new version replaces the old one (the old link stops working).

### Business / legal decisions required

1. Must the document state explicitly that the estimate is **non-binding**? (Today it says "may change"; the word
   "non-binding" is not used.)
2. Which inputs may be named as its basis (remote review, consultant prices, included services — anything else)?
3. Approve "may increase or decrease after the treating doctor examines me" as the change statement, or replace it.
4. Must taxes, provider fees, travel, accommodation, visas and companion costs be stated as **included or excluded**? (Today only
   the generic "not listed = not included" line exists.)
5. Is "Expected" / "Estimated coordinated-care package" permitted wording for expected cost, or is a range/"from" required?
6. Is a 14-day validity acceptable as a default, and must the document say what happens after expiry?

---

## B. Coordination deposit

### Current copy (exact)

| Where | English | Arabic |
|---|---|---|
| Proposal document | What you pay now · A coordination deposit to begin — credited to your final balance. | ما تدفعه الآن · وديعة تنسيق للبدء — تُخصم من رصيدك النهائي. |
| Proposal document, next steps | You settle the coordination deposit, credited to your final balance. | تسدّد وديعة التنسيق، وتُخصم من رصيدك النهائي. |
| Final quote | Already paid (credited to this quote) | مدفوع مسبقًا (يُخصم من هذا العرض) |
| Profile activation consent | I have read and accept the coordination deposit, cancellation and refund terms. | قرأت وأقبل شروط وديعة التنسيق والإلغاء والاسترداد. |
| Activation | Deposit for your accepted care estimate · Your coordinator will provide or arrange the payment instructions for your region and record the payment once it arrives. | وديعة تقدير الرعاية الذي قبلته · سيوفّر منسّقك تعليمات الدفع… |
| My Care deposit status | Arranging · Partly received · Deposit received ("Thank you — credited to your final balance.") · Waived · Refunded · Cancelled | قيد الترتيب · استُلم جزئيًا · تم استلام الوديعة («شكرًا لك — تُحتسب من رصيدك النهائي.») · معفاة · مستردة · ملغاة |
| Staff / Control Center | Coordination deposit · Margin & Deposit | وديعة التنسيق · الهامش والدفعة المقدمة |

### Facts confirmed by current software

- Created once per case **when the patient acknowledges the preliminary estimate**, only if an active deposit policy for the
  case's care area has a positive amount.
- Amount = the policy's EGP amount, shown in the proposal currency at the **proposal's frozen rate**.
- One component: beneficiary `PLATFORM`, purpose "Case coordination initiation", `credited_to_final = true`, refund class
  `NON_REFUNDABLE`, terms text "Refundable in full before case coordination begins; non-refundable once coordination has
  started." (F2 — the two disagree).
- Payment is **offline**: the coordinator arranges instructions; Finance records payments and **refunds** (each by amount,
  with a reason). Statuses: REQUESTED, PARTIALLY_PAID, PAID, WAIVED, REFUNDED, CANCELLED.
- Settling it starts treatment coordination (case moves on); nothing in the software computes a refund automatically.
- The terms text and refund class are **not returned to the patient** (F1).

### Business / legal decisions required

1. Is the deposit **refundable**? Fully, partially, or not — and under which conditions? (Resolve F2.)
2. What service does it pay for (the product says "to begin" coordination)?
3. Is it **deducted from later charges** in every case? (Product states "credited to your final balance" everywhere.)
4. When does it become **payable** and when is it **earned** (e.g. when coordination starts)?
5. What happens on **cancellation** by the patient, by RehletShifaa, or if the provider declines after assessment?
6. Must the terms be **shown to the patient before consent** (F1)? If yes, engineering needs the approved text and a place to
   show it (a small follow-up: expose the stored terms on the activation/deposit screen).
7. Arabic noun: «وديعة» vs «دفعة مقدمة» (Arabic pack M1) depends on answer 1.

---

## C. Final treatment plan and quote

### Current copy (exact)

| Where | English | Arabic |
|---|---|---|
| Document badge / title | Final treatment plan and quote · Your final treatment plan and quote | خطة العلاج والعرض النهائي · خطة علاجك وعرضك النهائي |
| Document sections | Physical-assessment summary · What changed since your estimate · Confirmed services · Final package price | ملخّص الفحص السريري · ما الذي تغيّر منذ تقديرك · الخدمات المؤكدة · سعر الباقة النهائي |
| Acceptance | I understand that accepting this quote is a financial agreement. / Accepting covers the coordinated-care package and is not procedure-specific medical consent; my doctor will take separate informed consent before treatment. | أفهم أن قبول هذا العرض اتفاق مالي. / يشمل القبول باقة الرعاية المنسّقة وليس موافقة طبية خاصة بالإجراء… |
| Next steps | You accept this treatment plan and quote. · Your coordinator confirms your schedule and arrangements. · Your treating doctor takes separate medical consent before treatment. | … |
| Disclaimer (all proposals) | This proposal is not procedure-specific medical consent. | (stored in English only) |
| Staff | Final treatment quote | عرض العلاج النهائي |

### Facts confirmed by current software

- Document type `FINAL_TREATMENT_QUOTE`, a new version after in-person assessment, with a scope-change reason; it reuses the
  margin locked at the estimate and freezes its own FX rate at release.
- The patient **accepts** or declines it; acceptance is recorded as a decision on that exact version.
- It carries *Valid until* (staff form default 14 days) and expires automatically after it.
- Stored payment terms "Payment schedule to be confirmed" and refund terms "Subject to provider terms" are **not shown** (F3).

### Business / legal decisions required

1. Is the accepted final quote **binding**, and on whom (patient, RehletShifaa, provider)? The product already says "a
   financial agreement" — *implied, not approved*.
2. For how long is it valid (default 14 days)? What happens after expiry?
3. What may still cause a **revision** after acceptance (clinical findings during treatment, length of stay, complications)?
4. Which **provider/service components** must be itemised as included/excluded?
5. Replace the placeholder payment and refund terms (F3), and decide whether they are shown to the patient.

---

## D. Exchange-rate explanation

### Current copy

Patient-facing: **none** — amounts are shown only in the proposal currency. Staff-facing (Control Center › Exchange Rates):
"one stored rate per currency per day; saved rate applies to that day only; proposals freeze the rate at release".

### Facts confirmed by current software

- Prices are held in EGP; a foreign-currency proposal converts at the stored rate for the day and **freezes that rate on the
  version at release**; the deposit uses the same frozen rate. A later rate change does not change a released document.

### Business / legal decisions required

1. Must the patient be told the amounts are converted from EGP, at which date's rate, and that the rate is fixed for that
   document?
2. Which currency is legally payable (EGP or the displayed currency), and who bears conversion/bank fees?

---

## After the review

Engineering applies the approved wording (copy files only, EN + AR), and — only if decided — the small follow-ups: show the
deposit terms before consent (F1), fix the deposit's stored refund class/text (F2, needs a data decision), replace the proposal
form's placeholder terms (F3). Until then: **LEGAL/BUSINESS COPY REVIEW REQUIRED**.
