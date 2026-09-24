# Pre-8C Arabic review pack (COPY-1)

Date: 2026-09-24 · Status: **ARABIC REVIEW REQUIRED — nothing here is approved.** Phase 8C entry waits for this review.

> **Reviewer instruction: Approve or replace each Arabic term based on natural Arabic healthcare-operations usage, not literal
> translation.**

How to answer: for each row write **Approve** or the replacement in the *Decision* column (or in a PR comment quoting the
row id). Where two Arabic variants exist today, pick one — engineering then applies it everywhere. The full inventory of lower-
risk terms stays in [arabic-ux-glossary-review.md](arabic-ux-glossary-review.md) (§2–§7); this pack is the short list that
must be decided before Phase 8C. No disputed string was changed in code in this session.

Screens: *Control Center* = internal admin workspace; *Staff Portal* = coordinators/operations/finance; *Provider Workspace*
= clinicians and practice managers; *Patient* = My Care, secure status link, proposal document, profile activation.

## 1. General platform

| # | English | Current Arabic | Where | Intended meaning | Ambiguity / risk | Options for the reviewer | Decision |
|---|---|---|---|---|---|---|---|
| G1 | Control Center | مركز التحكم | Control Center title, breadcrumbs, shell (≈15 places) | The internal administration workspace | «التحكم» may read as technical/industrial control; the UX-0 draft glossary proposed «مركز الإدارة» | «مركز التحكم» · «مركز الإدارة» · other | |
| G2 | Staff Portal | بوابة الموظفين (Control Center, access pages, transfer notice) · بوابة الفريق (Provider Workspace) | Nav, access explanations, OPS-1 transfer copy | The workspace used by RehletShifaa staff | Two nouns for one place | «بوابة الموظفين» · «بوابة الفريق» | |
| G3 | Reason / Reason not recorded *(new, J-1)* | السبب / لم يُسجَّل سبب | Care Journey history | The reason a person gave for a governed change; older entries have none | — | Approve or replace | |
| G4 | Why are you making this change? | لماذا تُجري هذا التغيير؟ | Reason fields (organization profile, journey *Edit a copy*) | Audit reason prompt | — | Approve or replace | |

## 2. Provider / credentials

| # | English | Current Arabic | Where | Intended meaning | Ambiguity / risk | Options | Decision |
|---|---|---|---|---|---|---|---|
| P1 | Credential Review | مراجعة التراخيص والمؤهلات (nav, shell) · مراجعة الاعتمادات (queue and review pages) | Reviews & Safety nav, credential queue, review detail | Independent verification of a clinician's licences and qualifications | Two names for one area; «الاعتمادات» can also mean *accreditation* of a facility | «مراجعة التراخيص والمؤهلات» · «مراجعة الاعتمادات» · other | |
| P2 | Independent Review | المراجعة المستقلة / المراجعة المستقلة للاعتمادات | Credential review detail, readiness explanations | A reviewer other than the submitter decides | — | Approve or replace | |
| P3 | Clinicians | الأطباء | Nav, directory | Physicians (Consultant, Associate Doctor) | Correct only while every clinician is a physician (V-10) | Approve · a broader noun if non-physicians are planned | |

## 3. Care coordination

| # | English | Current Arabic | Where | Intended meaning | Ambiguity / risk | Options | Decision |
|---|---|---|---|---|---|---|---|
| C1 | Case owner | مالك الحالة | Staff Portal case header, Team queue, transfer | The coordinator responsible for the case (not a legal owner) | «مالك» may read as ownership of the patient/record | «مالك الحالة» · «المنسق المسؤول» · other | |
| C2 | Transfer case ownership | نقل ملكية الحالة | Transfer drawer, Team queue action | Hand the case to another coordinator | Same «ملكية» concern as C1 | Follow C1 | |
| C3 | Assignment history | سجل التعيينات (in product) · سجل الإسناد (UX-0 draft) | Staff Portal case, Control Center Advanced | Every responsibility record on a case, ended ones included | Two candidate nouns | «سجل التعيينات» · «سجل الإسناد» | |
| C4 | Routing recommendation (preview) | معاينة توصية التوجيه (in product) · معاينة توصية الإسناد (UX-0 draft) | Coordination Setup › Advanced | What the rules would suggest; never assigns anything | «التوجيه» may read as *guidance*; the recommendation must not read as a decision | «توصية التوجيه» · «توصية الإسناد» · other | |
| C5 | Transfer notice *(new, OPS-1)* | يتلقى {الاسم} إشعارًا في بوابة الموظفين ورسالة على بريد العمل بعد اكتمال النقل. لا تتضمن الرسالة سوى رقم الحالة. / أنت من يتولى الحالة، لذلك لا يُرسَل إشعار. | Transfer review and result | New owner is notified in-app + work email after the transfer commits | Depends on G2 and C1 | Approve or replace | |

## 4. Commercial

| # | English | Current Arabic | Where | Intended meaning | Ambiguity / risk | Options | Decision |
|---|---|---|---|---|---|---|---|
| M1 | Coordination deposit | وديعة التنسيق (patient: My Care, proposal document, activation consent; staff case card) · دفعة التنسيق / الدفعة المقدمة (Control Center «الهامش والدفعة المقدمة», policy names) | Patient and staff | An upfront coordination payment, credited to the final balance (refund terms: see the commercial copy pack, B) | «وديعة» suggests a refundable security deposit; «دفعة مقدمة» an advance on the treatment price; «عربون» has specific legal meaning | «وديعة التنسيق» · «دفعة التنسيق المقدمة» · other — **depends on the legal refund decision** ([commercial pack](pre-8c-commercial-copy-review-pack.md) B) | |
| M2 | Preliminary care estimate (patient) / Preliminary estimate (staff) | تقدير مبدئي للرعاية / تقدير مبدئي | Proposal document, My Care, staff summary, Provider Workspace | A non-final estimate from remote review | Must never read as a price commitment | Approve or replace | |
| M3 | Final treatment plan and quote (patient) / Final treatment quote (staff) | خطة العلاج والعرض النهائي (patient) · عرض العلاج النهائي (staff) · عرض سعر نهائي (Provider Workspace) | Proposal document, My Care, staff, Provider Workspace | The document the patient accepts after in-person assessment | Three renderings; «عرض» alone also means *view/show* (buttons «عرض …») | One noun, e.g. «عرض السعر النهائي» / «خطة العلاج وعرض السعر النهائي»; and a verb other than «عرض» for *View* | |
| M4 | Proposal (patient umbrella) | عرضك | My Care, status link | The patient's current estimate/quote | Same «عرض» collision | «عرضك» · «مقترح العلاج» · other | |
| M5 | Margin & Deposit | الهامش والدفعة المقدمة | Control Center › Commercial | Internal margin and deposit policy | Follows M1 | Follow M1 | |

## 5. Care Journey

| # | English | Current Arabic | Where | Intended meaning | Ambiguity / risk | Options | Decision |
|---|---|---|---|---|---|---|---|
| J1 | Care Journeys / Care Journey | رحلات الرعاية / رحلة الرعاية | Control Center nav, list, detail | The operational coordination process a case follows | Must not read as a clinical pathway/protocol | Approve · «مسار التنسيق» · other | |
| J2 | Check / Run check / Draft · checked | الفحص / تشغيل الفحص / مسودة · مفحوصة | Journey designer | Configuration validation | «فحص/مفحوصة» reads as a medical examination | «التحقق» / «تم التحقق منها» · other | |
| J3 | Test journey / Run test / Draft · tested | اختبار الرحلة / تشغيل الاختبار / مسودة · مختبرة | Journey designer | Dry run with synthetic facts; creates nothing | «اختبار» may read as a lab test | «تجربة الرحلة» · «محاكاة» · approve | |
| J4 | Change note | ملاحظة التغيير | Journey designer (now saved in history — J-1) | What this draft changes and why | — | Approve or replace | |
| J5 | Retire version | إنهاء الإصدار | Journey approval & publishing; price versions use the same verb | Withdraw a published version for new cases | «إنهاء» is also used for *end by date* («انتهى») | «سحب الإصدار» · «إيقاف الإصدار» · approve | |
| J6 | Production intake | الاستقبال الفعلي | Journey detail | Whether new real cases use Care Journeys (currently **off**) | Technical concept | Approve · plainer wording | |

## 6. Patient-facing

| # | English | Current Arabic | Where | Intended meaning | Ambiguity / risk | Options | Decision |
|---|---|---|---|---|---|---|---|
| X1 | Estimate basis sentence | بناءً على التوصية الحالية والخدمات المشمولة. قد يتغيّر العلاج والسعر النهائي بعد الفحص الحضوري. | My Care, proposal document | Why the estimate may change | Wording also needs **legal** approval (commercial pack A) | Approve or replace after legal | |
| X2 | Deposit consent | قرأت وأقبل شروط وديعة التنسيق والإلغاء والاسترداد. | Profile activation consent | Consent to deposit terms | Terms are not displayed to the patient today (commercial pack B, **legal**) | Follows M1 + legal | |
| X3 | Deposit credited | وديعة تنسيق للبدء — تُخصم من رصيدك النهائي. / مدفوع مسبقًا (يُخصم من هذا العرض) | Proposal document | Deposit reduces the final balance | «تُخصم» (deducted) vs *credited*; depends on M1/M3 | Approve or replace | |
| X4 | Updated version | نسخة محدّثة | Proposal card, status link, document | A newer version of the same document | — | Approve or replace | |

## 7. Grammar items (implementation after review)

Counted nouns without dual/plural agreement (e.g. «${n} خدمة», «${n} إصدار»): reviewer supplies the rule; implementation will
use `Intl.PluralRules("ar")`. Backend validation/policy messages remain English-only inside Arabic pages (known, recorded).

## 8. After the review

Engineering applies every approved replacement in one change (frontend copy files, no logic), re-runs the Arabic tests and the
UX-8 Arabic screenshots, and records the decisions in `arabic-ux-glossary-review.md`. Until then: **ARABIC REVIEW REQUIRED**.
