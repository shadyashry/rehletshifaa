# Arabic UX glossary — native review handoff (V-9)

Date: 2026-09-24 · Prepared in UX-8 · Status: **DRAFT — not final.** Every Arabic term below is the wording currently in the
product. None is approved. This file is the handoff to a **native Arabic healthcare-operations reviewer**, and that review is
an entry condition of Phase 8C (plan §12).

How to use: for each row, confirm the current Arabic, or write the replacement in a review column/PR. Rows marked
**Decision** need a product/legal choice, not only wording. Where two screens use different Arabic for the same concept today,
both are listed so the reviewer can choose one.

**Pre-8C (2026-09-24):** the decisions needed before Phase 8C are condensed in
[pre-8c-arabic-review-pack.md](pre-8c-arabic-review-pack.md) — review that first; this file stays the full inventory.

Sources: UX-0 draft glossary (audit §31.7) and the Arabic lists in the UX-2 … UX-7 records, plus the terms UX-8 introduced.

## 1. Highest-impact decisions (review first)

| # | English | Current Arabic (where) | Ambiguity / risk | Reviewer decision needed |
|---|---|---|---|---|
| A1 | Coordination deposit | وديعة التنسيق (My Care, secure proposal, staff case summary, Journey facts) · الدفعة المقدمة (Control Center «الهامش والدفعة المقدمة», deposit policy) | Two words for one payment. «وديعة» can imply a refundable security deposit; «دفعة مقدمة» reads as an advance on the treatment price. The deposit's stored terms: refundable before coordination starts, non-refundable after; credited to the final balance | **Decision (finance/legal):** one term everywhere. Avoid «عربون» unless legal confirms (audit note) |
| A2 | Preliminary care estimate | تقدير مبدئي للرعاية (patient document) · تقدير مبدئي (staff, Provider Workspace) | Must never read as a price commitment | Confirm; confirm the estimate-basis sentence «قد يتغيّر العلاج والسعر النهائي بعد الفحص الحضوري» (legal/business copy review) |
| A3 | Final treatment plan and quote / Final treatment quote | خطة العلاج والعرض النهائي (patient) · عرض العلاج النهائي (staff summary) · عرض سعر نهائي (Provider Workspace proposal stage) | Three renderings of one document; «عرض» alone also means "view/show" in buttons (عرض العرض = "View proposal") | **Decision:** one noun for the quote document; a verb other than «عرض» for "View" |
| A4 | Proposal (umbrella, patient) | عرضك (My Care, status link) | Same «عرض» collision as A3 | Confirm or choose «مقترح العلاج» |
| A5 | Control Center | مركز التحكم (kept) vs draft glossary مركز الإدارة | Kept since UX-2 pending this review | Choose one |
| A6 | Care Journeys | رحلات الرعاية | Must not read as a clinical protocol (it is operational patient coordination) | Confirm |
| A7 | Production intake (Journeys) | الاستقبال الفعلي | Technical concept shown to journey managers only | Confirm or propose plainer wording |
| A8 | Clinicians | الأطباء | Correct only while clinicians are physicians (V-10) | Confirm; revisit if non-physician types are added |

## 2. Commercial (UX-8)

| English | Current Arabic | Screen / context | Ambiguity | Decision needed |
|---|---|---|---|---|
| Price Lists | قوائم الأسعار | Commercial nav, page title | — | Confirm |
| Provider organization prices | أسعار الجهات الطبية | Price Lists view | — | Confirm |
| Direct clinician prices / Direct clinician price | أسعار الأطباء المباشرين / سعر الطبيب المباشر | Price Lists view, pricing source | «مباشر» must mean "engaged directly with RehletShifaa" | Confirm |
| Organization price | سعر الجهة | Price level, pricing source | — | Confirm |
| Clinician-specific price | سعر خاص بالطبيب | Price level | — | Confirm |
| Using organization price | يُطبَّق سعر الجهة | Price that applies now | — | Confirm |
| Overrides the organization price for this service | يحل محل سعر الجهة لهذه الخدمة | Pricing source | — | Confirm |
| Price that applies now | السعر الساري الآن | Service card | — | Confirm |
| Applies to | يُطبَّق على | New price form | — | Confirm |
| Current · Scheduled · Ended · Draft · Retired | الحالي · مجدول · انتهى · مسودة · منتهٍ | Price version stage | «منتهٍ» (retired) vs «انتهى» (ended by date) are close | **Decision:** distinguish retired (withdrawn) from ended (date passed) |
| Draft · awaiting clinician approval | مسودة · بانتظار موافقة الطبيب | Price version | — | Confirm |
| Retire / Retire this price version? | إنهاء / إنهاء إصدار السعر هذا؟ | Price retire dialog | «إنهاء» also used for journey retirement and for "end" generally | Confirm or «سحب» |
| Exchange Rates | أسعار الصرف | Commercial nav | — | Confirm |
| Daily market rate · Saved manually · Most recent earlier rate | سعر السوق اليومي · محفوظ يدويًا · أحدث سعر سابق | Exchange-rate source | — | Confirm |
| Save rate for today | حفظ السعر لليوم | Exchange Rates | — | Confirm |
| Margin & Deposit | الهامش والدفعة المقدمة | Commercial nav | see A1 | A1 |
| Margin policy / Coordination deposit policy | سياسة الهامش / سياسة دفعة التنسيق | Margin & Deposit | mixes «دفعة» with A1 «وديعة» | A1 |
| Internal only | داخلي فقط | Margin & Deposit notice | — | Confirm |
| Review new version | مراجعة الإصدار الجديد | Margin & Deposit | — | Confirm |

## 3. Organization profile (UX-8)

| English | Current Arabic | Context | Decision needed |
|---|---|---|---|
| Organization profile | ملف الجهة | Organization › Overview, Setup | Confirm |
| Legal name · Business name · Display name | الاسم القانوني · الاسم التجاري · الاسم المعروض | Profile fields | Confirm legal vocabulary |
| Default currency | العملة الافتراضية | Profile | Confirm |
| Complete profile · Needs attention | إكمال الملف · يحتاج انتباهًا | Setup step | Confirm |
| Why are you making this change? | لماذا تُجري هذا التغيير؟ | Audit reason fields | Confirm |

## 4. Care Journeys (UX-8)

| English | Current Arabic | Context | Ambiguity | Decision needed |
|---|---|---|---|---|
| Published · Change in progress · Waiting for approval | المنشور · تغيير قيد العمل · بانتظار الموافقة | List, detail | — | Confirm |
| Draft · checked / Draft · tested | مسودة · مفحوصة / مسودة · مختبرة | Version status | «مفحوصة» may read as medically examined | **Decision:** a non-clinical word for "checked" (e.g. «تم التحقق منها») |
| Check / Run check | الفحص / تشغيل الفحص | Designer tab | same clinical connotation | as above |
| Test journey / Run test | اختبار الرحلة / تشغيل الاختبار | Designer tab | «اختبار» may read as a lab test | Confirm |
| Send for approval · Publish · Retire version | إرسال للموافقة · نشر · إنهاء الإصدار | Approval & publishing | — | Confirm |
| Edit a copy | تعديل نسخة | Journey detail | — | Confirm |
| Change note | ملاحظة التغيير | Designer | — | Confirm |
| Step · Who acts · Action · Condition · Next step | خطوة · من يتصرف · الإجراء · الشرط · الخطوة التالية | Designer | — | Confirm |
| Staff step · Patient step · Decision · Automatic step · Wait · Timer | خطوة موظف · خطوة مريض · قرار · خطوة آلية · انتظار · مؤقّت | Step types | — | Confirm |
| Validation messages (by code, e.g. «لا يمكن الوصول إلى … من البداية») | see `journey-copy.ts` `ISSUE_AR` | Check results | Frontend translation of English backend messages | Confirm each; backend messages stay English-only |
| Advanced — technical details | متقدم — تفاصيل تقنية | Journey detail | — | Confirm |

## 5. Patient portal (UX-8 changes)

| English | Current Arabic | Context | Decision needed |
|---|---|---|---|
| Updated version | نسخة محدّثة | Proposal card, status link, proposal document (replaces "Version N") | Confirm |
| Requested by your coordinator · Please reply by | طلبه منسقك · يُرجى الرد قبل | My Care information request | Confirm |
| Coordination deposit (phase) | وديعة التنسيق | Journey stepper, deposit card | A1 |

## 6. Carried from UX-2 … UX-7 (still unreviewed)

- **UX-2 shell:** مقدمو الرعاية · الجهات الطبية · الأطباء · فريق العيادة · المراجعات والسلامة · مراجعة التراخيص والمؤهلات
  (shortened) · الشؤون التجارية · العمليات · فريق رحلة شفاء · إعداد التنسيق · الصلاحيات والحوكمة · الأشخاص · مرجع
  الصلاحيات · الجداول · مركز التحكم (A5).
- **UX-3 clinicians:** إضافة طبيب · مباشرة مع رحلة شفاء · من خلال جهة طبية · طريقة العمل · يعمل مع · أهلية الحالات · غير
  جاهز للحالات · يمكنه استقبال الحالات · الملف المهني · تقديم الاعتمادات · المراجعة المستقلة للاعتمادات · الإعداد التشغيلي ·
  التفعيل · العلاقات المهنية · يديره / يساعده / يشرف على · مطلوب مزيد من المعلومات · مقدَّمة جزئيًا.
- **UX-4 Provider Workspace:** عيادتي · حالاتي · اعتماداتي · جدولي · أسعاري · أطبائي · إدارة الجهة · يحتاج إلى انتباهك ·
  لدى المريض · تقدير مبدئي (A2) · عرض سعر نهائي (A3) · يديرك · يساعدك · يشرف عليك · بوابة الفريق.
- **UX-5 access:** الوصول إلى أعمال رحلة شفاء · ملخص الصلاحيات · أين ينطبق · تعديل نسخة · ملاحظة التغيير · سبب النشر ·
  تغيير الوصول أو إنهاؤه · يديره نظام الهوية · عضوية لدى مقدم الرعاية · علاقة مهنية · قيد الاستخدام.
- **UX-6 credentials:** تحتاج إلى مراجعة · قيد المراجعة · مطلوب مزيد من المعلومات · المكتملة · المعلومات المقدَّمة ·
  المستندات · المراجعة المستقلة · سجل القرارات · أساس التحقق · تنتهي قريبًا · انتهت الصلاحية · إرسال نسخة جديدة · الجاهزية
  التشغيلية · سجل مستورد — لم تُسجَّل مراجعة مستقلة. Policy display names are English-only in the database.
- **UX-7 coordination:** الفرق والأشخاص · تفضيلات الأطباء · القواعد · وضع التقييم · معاينة توصية التوجيه (glossary draft
  had «معاينة توصية الإسناد» — **choose one**) · سجل قرارات التوجيه · سجل التعيينات (glossary draft «سجل الإسناد» —
  **choose one**) · نقل ملكية الحالة · تحتاج إلى مالك · حالات فريقي · مالك الحالة · فريق الملاذ الأخير · التوجيه الفعلي.

## 7. Known Arabic grammar items for the reviewer

- Counted nouns are built without dual/plural agreement in several places (e.g. «يجب إصلاح 2 مشكلة», «${n} إصدار»,
  «${n} طبيب»). A reviewer should supply the plural rule wording; implementation can then use `Intl.PluralRules("ar")`.
- System-written assignment reasons and backend validation/policy messages are English-only (shown inside Arabic pages).
