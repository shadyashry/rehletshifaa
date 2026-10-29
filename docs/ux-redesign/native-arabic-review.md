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
- [ ] **Adjectives about the reader (X-3).** «لست متأكدًا»، «مستعدًا»، «أنت جاهز»، «قادراً»، «إبقائي مسجّلًا» were rewritten as
      impersonal or verbal-noun phrasing («لم يتضح لك…»، «اعتُمد دخولك…»، «إبقاء تسجيل الدخول…»). Natural, or stilted?
- [ ] **The patient in staff labels (X-3).** Stage labels no longer assume a male patient («تم الخروج من المستشفى» for «خرج»);
      «المريض» stays the generic noun. Keep, or prefer «المريض/المريضة» on staff screens?
- [ ] **Shadda on doubled verbs (X-3).** «تحقّق»، «تعذّر»، «تحدّث» written with shadda everywhere the patient and portal read (as
      «منسّق»). Keep, or drop the shadda on all three (plain MSA spelling)? The Control Center is not yet aligned.

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

Filled per slice (key · before · after). X-0 changed no message string; X-1 changed the rate sentences and added one field message; X-2 appended its list below (notes after the table); X-3 appends its own.

| Slice | File | Key | Before | After |
|---|---|---|---|---|
| X-0 | — | — | — | (no strings changed: rules, type and digit input only) |
| X-1 | ar.json | `portalWork.caseView.send.rateToday` | سعر الصرف اليوم: ⁦1 EGP = {rate} {currency}⁩. يُثبَّت السعر النهائي عند إرسال العرض. | سعر الصرف اليوم: {rate}. يُثبَّت السعر النهائي عند إرسال العرض. — `{rate}` is now one run, the patient's currency first: `1 USD = 49.0196 EGP` (same in English) |
| X-1 | ar.json | `portalWork.caseView.send.rateTodayDated` | سعر الصرف اليوم: ⁦1 EGP = {rate} {currency}⁩ ({date}). يُثبَّت السعر النهائي عند إرسال العرض. | سعر الصرف اليوم: {rate} ({date}). يُثبَّت السعر النهائي عند إرسال العرض. |
| X-1 | ar.json | `portalWork.depositTransfer.amountInvalid` (new) | — | أدخل المبلغ المستلَم بالأرقام، أكبر من صفر ولا يزيد على الرصيد المتبقي، مثل 12,500. |
| X-2 | `components/portal/portal-ui.tsx` | hard-coded (1×) | تظهر في العرض بجانب التوصية | تظهر في التقدير بجانب التوصية |
| X-2 | `components/portal/portal-ui.tsx` | hard-coded (1×) | "المقترح المقدم للمريض" | "التقدير المقدم للمريض" |
| X-2 | `components/portal/portal-ui.tsx` | hard-coded (1×) | إنشاء وإرسال العرض | إنشاء وإرسال التقدير |
| X-2 | `components/portal/portal-ui.tsx` | hard-coded (2×) | لديك صلاحية العرض فقط | لديك صلاحية الاطلاع فقط |
| X-2 | `components/portal/portal-ui.tsx` | hard-coded (1×) | "إنشاء المقترح" | "إنشاء التقدير" |
| X-2 | `components/portal/portal-ui.tsx` | hard-coded (1×) | "إرسال المقترح للمريض" | "إرسال التقدير للمريض" |
| X-2 | `components/portal/portal-ui.tsx` | hard-coded (1×) | اعتماد الشروط المالية | اعتماد الشروط التجارية |
| X-2 | `components/portal/portal-model.ts` | hard-coded (1×) | جارٍ إعداد العرض | جارٍ إعداد التقدير |
| X-2 | `components/portal/portal-model.ts` | hard-coded (1×) | تم رفض العرض | تم رفض عرض السعر |
| X-2 | `components/portal/portal-model.ts` | hard-coded (1×) | انتهت صلاحية العرض | انتهت صلاحية عرض السعر |
| X-2 | `components/portal/CoordinatorActions.tsx` | hard-coded (1×) | إعادة إرسال رابط العرض | إعادة إرسال رابط عرض السعر |
| X-2 | `components/portal/CoordinatorActions.tsx` | hard-coded (1×) | لا يُنشئ عرضًا جديدًا | لا يُنشئ عرض سعر جديدًا |
| X-2 | `components/portal/CoordinatorActions.tsx` | hard-coded (1×) | قبل إرسال العرض | قبل إرسال التقدير |
| X-2 | `components/portal/JourneySnapshot.tsx` | hard-coded (1×) | ar: "العرض" | ar: "التقدير" |
| X-2 | `components/portal/JourneySnapshot.tsx` | hard-coded (1×) | "وديعة التنسيق" | "دفعة التنسيق" |
| X-2 | `components/portal/JourneySnapshot.tsx` | hard-coded (1×) | "تجهيز العرض" | "تجهيز التقدير" |
| X-2 | `components/portal/JourneySnapshot.tsx` | hard-coded (1×) | "تم قبول العرض" | "تم قبول التقدير" |
| X-2 | `components/platform-control-center/MarginDeposit.tsx` | hard-coded (2×) | الهامش والدفعة المقدمة | الهامش ودفعة التنسيق |
| X-2 | `components/platform-control-center/MarginDeposit.tsx` | hard-coded (6×) | العرض النهائي | عرض السعر النهائي |
| X-2 | `components/platform-control-center/MarginDeposit.tsx` | hard-coded (1×) | تقررها المالية | يقررها الفريق المالي |
| X-2 | `components/platform-control-center/MarginDeposit.tsx` | hard-coded (1×) | تقرره المالية وحدها | يقرره الفريق المالي وحده |
| X-2 | `components/platform-control-center/control-center-nav.ts` | hard-coded (1×) | الهامش والدفعة المقدمة | الهامش ودفعة التنسيق |
| X-2 | `components/platform-control-center/control-center-nav.ts` | hard-coded (1×) | ودفعة التنسيق المقدمة | ودفعة التنسيق |
| X-2 | `components/platform-control-center/journey-copy.ts` | hard-coded (1×) | قبل المريض العرض | قبل المريض التقدير |
| X-2 | `components/platform-control-center/journey-copy.ts` | hard-coded (1×) | يحتاج العرض إلى إعادة عمل | يحتاج التقدير إلى إعادة عمل |
| X-2 | `components/platform-control-center/journey-copy.ts` | hard-coded (1×) | سُدّدت وديعة التنسيق | سُدّدت دفعة التنسيق |
| X-2 | `components/platform-control-center/facility-copy.ts` | hard-coded (1×) | بنود المقترحات المستندة | بنود عروض الأسعار المستندة |
| X-2 | `components/platform-control-center/facility-copy.ts` | hard-coded (1×) | تحتفظ المقترحات الحالية | تحتفظ عروض الأسعار الحالية |
| X-2 | `components/**` (25 files, Control Center included) | hard-coded | منسق… | منسّق… (shadda only) |
| X-2 | `components/portal/portal-ui.tsx` | hard-coded | … أو إنشاء مقترح. | … أو إنشاء تقدير. |
| X-2 | `components/portal/CaseBlockers.tsx` | hard-coded | وصل الرقم المرجعي للتحويل · تتحقق منه المالية | وصل الرقم المرجعي للتحويل · يتحقق منه الفريق المالي |
| X-2 | ar.json | `home.story.pause` | إيقاف العرض مؤقتًا | إيقاف القصة مؤقتًا |
| X-2 | ar.json | `home.story.play` | تشغيل العرض | تشغيل القصة |
| X-2 | ar.json | `home.travel.note` | يُرتَّب بعد عرضك الطبي، وفقط إذا رغبت في ذلك. | يُرتَّب بعد تقديرك المبدئي، وفقط إذا رغبت في ذلك. |
| X-2 | ar.json | `how.stages[3].title` | توصيتك وعرضك | توصيتك وتقديرك |
| X-2 | ar.json | `how.stages[3].what` | تتلقى توصية الاستشاري مع عرض الرعاية والتكاليف التقديرية: ما الموصى به، والخطوات المتوقعة، وما إذا كانت هناك حاجة إلى مزيد من الفحوصات. | تتلقى توصية الاستشاري مع التقدير المبدئي للرعاية وتكاليفها: ما الموصى به، والخطوات المتوقعة، وما إذا كانت هناك حاجة إلى مزيد من الفحوصات. |
| X-2 | ar.json | `how.stages[4].what` | لا يُرتَّب أي شيء تلقائيًا. تراجع توصيتك وعرضك، ثم تختار ما إذا كنت ستتابع. | لا يُرتَّب أي شيء تلقائيًا. تراجع توصيتك وتقديرك، ثم تختار ما إذا كنت ستتابع. |
| X-2 | ar.json | `how.stages[4].you` | إذا تابعت: إعداد الملف والحساب، وتوضيح أي عربون تنسيق أولًا. | إذا تابعت: إعداد الملف والحساب، وتوضيح أي دفعة تنسيق أولًا. |
| X-2 | ar.json | `how.proposalVisual.proposal` | عرض الرعاية والتقدير | خطة الرعاية والتقدير المبدئي |
| X-2 | ar.json | `how.costs.quote` | العرض النهائي | عرض السعر النهائي |
| X-2 | ar.json | `how.gate.yesSteps[1]` | توضيح أي عربون تنسيق | توضيح أي دفعة تنسيق |
| X-2 | ar.json | `portalProposal.price.guarantee` | وعدنا بعدم المفاجآت: لن يزيد عرضك النهائي عن الحد الأقصى المعروض هنا، إلا إذا تبيّن لاستشاريّك عند فحصك أن علاجك يحتاج إلى تغيير. وفي هذه الحالة سيشرح لك السبب كتابةً، وستحصل على مهلة لا تقل عن 24 ساعة لتقرّر. | وعدنا بعدم المفاجآت: لن يزيد عرض السعر النهائي عن الحد الأقصى المعروض هنا، إلا إذا تبيّن لاستشاريّك عند فحصك أن علاجك يحتاج إلى تغيير. وفي هذه الحالة سيشرح لك السبب كتابةً، وستحصل على مهلة لا تقل عن 24 ساعة لتقرّر. |
| X-2 | ar.json | `portalProposal.price.how.steps[1].body` | لا يصلك العرض النهائي إلا بعد أن يفحصك استشاريّك حضوريًا. وإلى ذلك الحين قد يتغيّر التقدير. | لا يصلك عرض السعر النهائي إلا بعد أن يفحصك استشاريّك حضوريًا. وإلى ذلك الحين قد يتغيّر التقدير. |
| X-2 | ar.json | `portalProposal.price.cooling.text` | لأن خطتك تغيّرت، لديك وقت لتقرّر. يمكنك قبول هذا العرض اعتبارًا من {time}. وإلى ذلك الحين يمكنك قراءته أو مراسلة منسّق حالتك أو طلب تعديلات. | لأن خطتك تغيّرت، لديك وقت لتقرّر. يمكنك قبول عرض السعر هذا اعتبارًا من {time}. وإلى ذلك الحين يمكنك قراءته أو مراسلة منسّق حالتك أو طلب تعديلات. |
| X-2 | ar.json | `portalProposal.price.staff.fxPending` | يراجع الفريق المالي سعر الصرف. لا يستطيع المريض قبول هذا العرض بعد. | يراجع الفريق المالي سعر الصرف. لا يستطيع المريض قبول عرض السعر هذا بعد. |
| X-2 | ar.json | `portalProposal.price.staff.cooling` | يستطيع المريض قبول هذا العرض اعتبارًا من {time}. | يستطيع المريض قبول عرض السعر هذا اعتبارًا من {time}. |
| X-2 | ar.json | `portalProposal.price.fxPending` | يراجع فريقنا المالي سعر الصرف اليوم لهذا العرض. لا يلزمك فعل أي شيء، وسيخبرك منسّق حالتك فور أن يصبح بإمكانك القبول. | يراجع فريقنا المالي سعر الصرف اليوم لعرض السعر هذا. لا يلزمك فعل أي شيء، وسيخبرك منسّق حالتك فور أن يصبح بإمكانك القبول. |
| X-2 | ar.json | `portalProposal.price.coordinator.scopeRequired` | هذا العرض يتجاوز الحد الأقصى للتقدير، لذا يجب إبلاغ المريض بالسبب. أضف السبب الذي رأى فيه الاستشاري أن الخطة تحتاج إلى تغيير. | عرض السعر هذا يتجاوز الحد الأقصى للتقدير، لذا يجب إبلاغ المريض بالسبب. أضف السبب الذي رأى فيه الاستشاري أن الخطة تحتاج إلى تغيير. |
| X-2 | ar.json | `portalProposal.price.coordinator.validityTooLong` | هذا التاريخ بعد مدة صلاحية العرض التي تسمح بها السياسة التجارية. اختر تاريخًا أبكر أو اتركه فارغًا. | هذا التاريخ بعد مدة صلاحية عرض السعر التي تسمح بها السياسة التجارية. اختر تاريخًا أبكر أو اتركه فارغًا. |
| X-2 | ar.json | `portalProposal.price.fxReapproval.body` | تحرّك سعر الصرف بأكثر من الحد المسموح منذ إعداد هذا العرض. لا يستطيع المريض القبول إلا بعد أن تقرّر. | تحرّك سعر الصرف بأكثر من الحد المسموح منذ إعداد عرض السعر هذا. لا يستطيع المريض القبول إلا بعد أن تقرّر. |
| X-2 | ar.json | `portalProposal.price.fxReapproval.frozen` | إجمالي العرض بالسعر المثبّت | إجمالي عرض السعر بسعر الصرف المثبّت |
| X-2 | ar.json | `portalProposal.price.fxReapproval.today` | إجمالي العرض بسعر اليوم | إجمالي عرض السعر بسعر صرف اليوم |
| X-2 | ar.json | `portalProposal.price.fxReapproval.keepBody` | يستطيع المريض قبول العرض كما هو، بالسعر الذي أُعدّ به. لا تتغيّر المبالغ بالجنيه المصري. | يستطيع المريض قبول عرض السعر كما هو، بسعر الصرف الذي أُعدّ به. لا تتغيّر المبالغ بالجنيه المصري. |
| X-2 | ar.json | `portalProposal.price.fxReapproval.repriceBody` | يُعاد حساب العرض بسعر اليوم، ويتوقف الرابط القديم، ويُرسل العرض الجديد إلى المريض. لا تتغيّر المبالغ بالجنيه المصري ولا سقف عدم المفاجآت ولا مدة الصلاحية. | يُعاد حساب عرض السعر بسعر اليوم، ويتوقف الرابط القديم، ويُرسل عرض السعر الجديد إلى المريض. لا تتغيّر المبالغ بالجنيه المصري ولا سقف عدم المفاجآت ولا مدة الصلاحية. |
| X-2 | ar.json | `portalProposal.title` | مقترحك | عرض السعر |
| X-2 | ar.json | `portalProposal.documentType.quote` | عرض العلاج النهائي | عرض السعر النهائي |
| X-2 | ar.json | `portalProposal.status.ACCEPTED_quote` | قبلت هذا العرض | قبلت عرض السعر هذا |
| X-2 | ar.json | `portalProposal.status.DECLINED` | رفضت هذا المقترح | رفضت عرض السعر هذا |
| X-2 | ar.json | `portalProposal.status.EXPIRED` | انتهت صلاحية هذا المقترح | انتهت صلاحية عرض السعر هذا |
| X-2 | ar.json | `portalProposal.status.other` | المقترح | عرض السعر |
| X-2 | ar.json | `portalProposal.honestyQuote` | أُعدّ هذا العرض بعد تقييمك الحضوري، ويشمل الخدمات المؤكدة المذكورة بالسعر المبيّن. قبول هذا العرض ليس موافقة طبية؛ سيطلب منك طبيبك المعالج موافقة مستنيرة منفصلة قبل العلاج. | أُعدّ عرض السعر هذا بعد تقييمك الحضوري، ويشمل الخدمات المؤكدة المذكورة بالسعر المبيّن. قبول عرض السعر هذا ليس موافقة طبية؛ سيطلب منك طبيبك المعالج موافقة مستنيرة منفصلة قبل العلاج. |
| X-2 | ar.json | `portalProposal.termsEstimate` | الوديعة والاسترداد والإلغاء | دفعة التنسيق والاسترداد والإلغاء |
| X-2 | ar.json | `portalProposal.introQuote` | راجع خطة العلاج والعرض النهائي قبل اتخاذ قرارك. | راجع خطة العلاج وعرض السعر النهائي قبل اتخاذ قرارك. |
| X-2 | ar.json | `portalProposal.acknowledgeEstimate` | راجعت هذا التقدير، بما في ذلك شروط الوديعة والاسترداد والإلغاء، وأفهم الخطوة التالية. | راجعت هذا التقدير، بما في ذلك شروط دفعة التنسيق والاسترداد والإلغاء، وأفهم الخطوة التالية. |
| X-2 | ar.json | `portalProposal.acknowledgeQuote` | راجعت هذا العرض، بما في ذلك شروط الدفع، وأفهم الخطوة التالية. | راجعت عرض السعر هذا، بما في ذلك شروط الدفع، وأفهم الخطوة التالية. |
| X-2 | ar.json | `portalProposal.primaryQuote` | قبول خطة العلاج والعرض النهائي | قبول خطة العلاج وعرض السعر النهائي |
| X-2 | ar.json | `portalProposal.declineConfirm` | هل تريد رفض هذا المقترح؟ | هل تريد رفض عرض السعر هذا؟ |
| X-2 | ar.json | `portalProposal.declineQuiet` | لا أرغب في المتابعة بهذا المقترح | لا أرغب في المتابعة بعرض السعر هذا |
| X-2 | ar.json | `portalProposal.declineKeep` | الإبقاء على المقترح | الإبقاء على عرض السعر |
| X-2 | ar.json | `portalProposal.assisted.nextFirstQuote` | يراجع منسّق حالتك شروط الدفع في العرض معك بالعربية ويسجّل قرارك. | يراجع منسّق حالتك شروط الدفع في عرض السعر معك بالعربية ويسجّل قرارك. |
| X-2 | ar.json | `portalProposal.assisted.explain` | شروط الوديعة والاسترداد والإلغاء غير متاحة بعد بصياغة عربية معتمدة. سيشرحها لك منسّقك بالعربية ويسجّل قرارك. | شروط دفعة التنسيق والاسترداد والإلغاء غير متاحة بعد بصياغة عربية معتمدة. سيشرحها لك منسّقك بالعربية ويسجّل قرارك. |
| X-2 | ar.json | `portalProposal.assisted.explainQuote` | شروط الدفع في هذا العرض غير متاحة بعد بصياغة عربية معتمدة. سيشرحها لك منسّقك بالعربية ويسجّل قرارك. | شروط الدفع في عرض السعر هذا غير متاحة بعد بصياغة عربية معتمدة. سيشرحها لك منسّقك بالعربية ويسجّل قرارك. |
| X-2 | ar.json | `portalWork.portal.financePolicies` | سياسات الهامش والدفعة المقدمة | سياسات الهامش ودفعة التنسيق |
| X-2 | ar.json | `portalWork.portal.signedOut.noAccountTail` |  — أما الحساب فتُنشئه عند إكمال ملفك بعد قبول العرض. |  — أما الحساب فتُنشئه عند إكمال ملفك بعد قبول التقدير. |
| X-2 | ar.json | `portalWork.caseView.handoffLocked` | تبقى إجراءات العرض مقفلة إلى أن تكتمل توصية الاستشاري. | تبقى إجراءات التقدير مقفلة إلى أن تكتمل توصية الاستشاري. |
| X-2 | ar.json | `portalWork.caseView.proposalCurrency` | عملة العرض | عملة عرض السعر |
| X-2 | ar.json | `portalWork.caseView.summary.title` | آخر عرض | آخر عرض سعر |
| X-2 | ar.json | `portalWork.caseView.summary.final` | عرض العلاج النهائي | عرض السعر النهائي |
| X-2 | ar.json | `portalWork.caseView.summary.none` | لا يوجد عرض بعد. | لا يوجد عرض سعر بعد. |
| X-2 | ar.json | `portalWork.caseView.summary.deposit` | وديعة التنسيق | دفعة التنسيق |
| X-2 | ar.json | `portalWork.caseView.send.missing` | لا يمكن إنشاء العرض حتى يضيف الاستشاري خدمة واحدة على الأقل وتكلفتها ضمن المراجعة المعتمدة. | لا يمكن إنشاء التقدير حتى يضيف الاستشاري خدمة واحدة على الأقل وتكلفتها ضمن المراجعة المعتمدة. |
| X-2 | ar.json | `portalWork.caseView.send.currency` | عملة عرض المريض | عملة عرض السعر للمريض |
| X-2 | ar.json | `portalWork.caseView.send.rateNote` | حدّدها الاستشاري عند تسجيل التقدير؛ يرى المريض العرض بهذه العملة. | حدّدها الاستشاري عند تسجيل التقدير؛ يرى المريض التقدير بهذه العملة. |
| X-2 | ar.json | `portalWork.caseView.send.rateToday` | سعر الصرف اليوم: {rate}. يُثبَّت السعر النهائي عند إرسال العرض. | سعر الصرف اليوم: {rate}. يُثبَّت سعر الصرف عند إرسال التقدير. |
| X-2 | ar.json | `portalWork.caseView.send.rateTodayDated` | سعر الصرف اليوم: {rate} ({date}). يُثبَّت السعر النهائي عند إرسال العرض. | سعر الصرف اليوم: {rate} ({date}). يُثبَّت سعر الصرف عند إرسال التقدير. |
| X-2 | ar.json | `portalWork.caseView.send.noRate` | لا يتوفر سعر صرف لعملة {currency} حاليًا، لذلك لا يمكن عرض المبالغ بها ولا إنشاء العرض حتى يتوفر السعر. | لا يتوفر سعر صرف لعملة {currency} حاليًا، لذلك لا يمكن عرض المبالغ بها ولا إنشاء التقدير حتى يتوفر السعر. |
| X-2 | ar.json | `portalWork.caseView.finalQuote.title` | العرض النهائي | عرض السعر النهائي |
| X-2 | ar.json | `portalWork.caseView.finalQuote.createIntro` | أنشئ العرض النهائي من التقييم النهائي المعتمد. لا يتغيّر وضع الحالة. | أنشئ عرض السعر النهائي من التقييم النهائي المعتمد. لا يتغيّر وضع الحالة. |
| X-2 | ar.json | `portalWork.caseView.finalQuote.currency` | عملة عرض المريض | عملة عرض السعر للمريض |
| X-2 | ar.json | `portalWork.caseView.finalQuote.create` | إنشاء العرض النهائي | إنشاء عرض السعر النهائي |
| X-2 | ar.json | `portalWork.caseView.finalQuote.release` | إرسال العرض النهائي للمريض | إرسال عرض السعر النهائي للمريض |
| X-2 | ar.json | `portalWork.caseView.finalQuote.financeWait` | بانتظار الموافقة المالية على الخدمات المُدخلة يدويًا. | بانتظار موافقة الفريق المالي على الخدمات المُدخلة يدويًا. |
| X-2 | ar.json | `portalWork.caseView.deposit.title` | وديعة التنسيق والدفعات | دفعة التنسيق والمدفوعات |
| X-2 | ar.json | `portalWork.caseView.deposit.refundOpen` | استرداد جزء من هذه الوديعة؟ | استرداد جزء من دفعة التنسيق هذه؟ |
| X-2 | ar.json | `portalWork.caseView.delivery.resendHint` | يُلغي الرابط ورمز التحقق السابقين ويُرسل رابطًا آمنًا جديدًا. لا يُنشئ عرضًا جديدًا ولا يغيّر حالة الطلب. | يُلغي الرابط ورمز التحقق السابقين ويُرسل رابطًا آمنًا جديدًا. لا يُنشئ عرض سعر جديدًا ولا يغيّر وضع الحالة. |
| X-2 | ar.json | `portalWork.caseView.release.finance` | الموافقة المالية | موافقة الفريق المالي |
| X-2 | ar.json | `portalWork.caseView.release.operationsPlan` | باقة السفر ضمن المقترح | باقة السفر ضمن التقدير |
| X-2 | ar.json | `portalWork.caseView.release.operationsPlanHint` | ما تشمله الباقة وتكلفتها. تُضاف إلى المقترح قبل إرساله. | ما تشمله الباقة وتكلفتها. تُضاف إلى التقدير قبل إرساله. |
| X-2 | ar.json | `portalWork.safety.concerns.types.DISPUTE` | مبلغ غير موجود في عرضي، أو طُلب مني الدفع خارجه | مبلغ غير موجود في عرض السعر، أو طُلب مني الدفع خارجه |
| X-2 | ar.json | `portalWork.empty.noFinance` | لا يوجد بعد أحد في فريق المالية يمكن تعيينه. يُرجى الطلب من مدير الفريق إضافة عضو. | لا يوجد بعد أحد في الفريق المالي يمكن تعيينه. يُرجى الطلب من مدير الفريق إضافة عضو. |
| X-2 | ar.json | `portalWork.clinicalDecision.evidence.proposalCurrency` | عملة عرض المريض: {currency} | عملة عرض السعر للمريض: {currency} |
| X-2 | ar.json | `portalWork.clinicalDecision.final.intro` | سجّل ما توصي به بعد فحص المريض. يبني المنسق العرض النهائي من هذه البنود. | سجّل ما توصي به بعد فحص المريض. يبني المنسّق عرض السعر النهائي من هذه البنود. |
| X-2 | ar.json | `portalWork.clinicalDecision.lines.packages.hint` | باقات المستشفى وغرفة العمليات والعناية المركزة والمستلزمات التي اعتمدها الفريق المالي. حدّد الرقم المتوقع داخل النطاق؛ لا يحتاج البند موافقة مالية أخرى. | باقات المستشفى وغرفة العمليات والعناية المركزة والمستلزمات التي اعتمدها الفريق المالي. حدّد الرقم المتوقع داخل النطاق؛ لا يحتاج البند موافقة أخرى من الفريق المالي. |
| X-2 | ar.json | `portalWork.clinicalDecision.lines.currency` | عملة العرض | عملة عرض السعر |
| X-2 | ar.json | `portalWork.clinicalDecision.lines.currencyHint` | يُعدّ عرض المريض بهذه العملة؛ تبقى قائمتك بالجنيه المصري. | يُعدّ عرض السعر للمريض بهذه العملة؛ تبقى قائمتك بالجنيه المصري. |
| X-2 | ar.json | `portalWork.clinicalDecision.lines.noRate` | لا يوجد سعر صرف حالي لعملة {currency}، لذا لا يمكن عرض قيمة عرض المريض. اختر عملة أخرى أو راجع الفريق المالي. | لا يوجد سعر صرف حالي لعملة {currency}، لذا لا يمكن حساب قيمة عرض السعر للمريض. اختر عملة أخرى أو راجع الفريق المالي. |
| X-2 | ar.json | `portalWork.clinicalDecision.lines.finalCurrencyNone` | يُعدّ العرض النهائي للمريض بالعملة التي يختارها المنسق. تبقى بنودك بالجنيه المصري. | يُعدّ عرض السعر النهائي للمريض بالعملة التي يختارها المنسّق. تبقى بنودك بالجنيه المصري. |
| X-2 | ar.json | `portalWork.clinicalDecision.lines.finalCurrency` | يُعدّ العرض النهائي للمريض بعملة {currency}، عملة تقديرك المبدئي، ويمكن للمنسق تغييرها. تبقى بنودك بالجنيه المصري. | يُعدّ عرض السعر النهائي للمريض بعملة {currency}، عملة تقديرك المبدئي، ويمكن للمنسّق تغييرها. تبقى بنودك بالجنيه المصري. |
| X-2 | ar.json | `portalWork.clinicalDecision.summary.proposal` | عرض المريض | عرض السعر للمريض |
| X-2 | ar.json | `portalWork.clinicalDecision.summary.approxNote` | تبقى أسعار قائمتك بالجنيه المصري؛ يُعدّ عرض المريض بعملة {currency} بسعر اليوم. | تبقى أسعار قائمتك بالجنيه المصري؛ يُعدّ عرض السعر للمريض بعملة {currency} بسعر اليوم. |
| X-2 | ar.json | `portalWork.clinicalDecision.finalSaved` | حُفظ في {date}. يُعدّ المنسق العرض النهائي منه. | حُفظ في {date}. يُعدّ المنسّق عرض السعر النهائي منه. |
| X-2 | ar.json | `portalWork.confirm.refundBody` | يسجّل هذا مبلغًا أُعيد إلى المريض من هذه الوديعة. يُرجى التحقق من المبلغ قبل المتابعة. | يسجّل هذا مبلغًا أُعيد إلى المريض من دفعة التنسيق هذه. يُرجى التحقق من المبلغ قبل المتابعة. |
| X-2 | ar.json | `portalWork.currentAction.work.PREPARE_PROPOSAL` | تجهيز العرض | تجهيز التقدير |
| X-2 | ar.json | `portalWork.currentAction.work.PROPOSAL_REVISION` | تعديل العرض | تعديل التقدير |
| X-2 | ar.json | `portalWork.currentAction.work.APPROVE_COMMERCIAL_TERMS` | اعتماد الشروط المالية | اعتماد الشروط التجارية |
| X-2 | ar.json | `portalWork.currentAction.actions.PREPARE_PROPOSAL` | تجهيز العرض | تجهيز التقدير |
| X-2 | ar.json | `portalWork.currentAction.actions.APPROVE_COMMERCIAL_TERMS` | اعتماد الشروط المالية | اعتماد الشروط التجارية |
| X-2 | ar.json | `portalWork.currentAction.states.VIEW_ONLY.body` | لديك صلاحية العرض فقط. | لديك صلاحية الاطلاع فقط. |
| X-2 | ar.json | `portalWork.currentAction.states.WAIT_PATIENT_DECISION.body` | تم تسليم العرض. ستعود الحالة إليك عند قرار المريض. | تم تسليم عرض السعر. ستعود الحالة إليك عند قرار المريض. |
| X-2 | ar.json | `portalWork.currentAction.states.WAIT_PAYMENT.title` | بانتظار وديعة التنسيق | بانتظار دفعة التنسيق |
| X-2 | ar.json | `portalWork.currentAction.states.WAIT_PAYMENT.body` | يسجّل قسم المالية الاستلام وتستكمل الرحلة تلقائيًا فور التأكيد. | يسجّل الفريق المالي الاستلام وتستكمل الرحلة تلقائيًا فور التأكيد. |
| X-2 | ar.json | `portalWork.currentAction.states.PREPARE_PROPOSAL.title` | جهّز عرض المريض | جهّز التقدير للمريض |
| X-2 | ar.json | `portalWork.currentAction.states.RELEASE_PROPOSAL.title` | أصدر العرض للمريض | أصدر التقدير للمريض |
| X-2 | ar.json | `portalWork.currentAction.states.ASSIGN_OPERATIONS.body` | تم تسوية الوديعة. عيّن فريق العمليات لترتيب السفر والوصول. | تمّت تسوية دفعة التنسيق. عيّن فريق العمليات لترتيب السفر والوصول. |
| X-2 | ar.json | `portalWork.currentAction.states.ASSIGN_OPERATIONS_PLAN.body` | طلب المريض باقة سفر. عيّن فريق العمليات لتخطيطها وتسعيرها قبل إرسال العرض. | طلب المريض باقة سفر. عيّن فريق العمليات لتخطيطها وتسعيرها قبل إرسال التقدير. |
| X-2 | ar.json | `portalWork.currentAction.states.PREPARE_TRAVEL_PACKAGE.body` | صِف باقة السفر للعرض قبل إرساله. تُرتَّب الحجوزات والوصول بعد استلام وديعة المريض فقط. | صِف باقة السفر للتقدير قبل إرساله. تُرتَّب الحجوزات والوصول بعد استلام دفعة التنسيق من المريض فقط. |
| X-2 | ar.json | `portalWork.currentAction.states.ASSIGN_FINANCE.title` | يلزم اعتماد المالية للشروط التجارية | يلزم اعتماد الفريق المالي للشروط التجارية |
| X-2 | ar.json | `portalWork.currentAction.states.ASSIGN_FINANCE.body` | خدمة مسعّرة يدويًا تحتاج إلى اعتماد المالية قبل الإصدار. عيّن من يعتمدها. | خدمة مسعّرة يدويًا تحتاج إلى اعتماد الفريق المالي قبل الإصدار. عيّن من يعتمدها. |
| X-2 | ar.json | `portalWork.currentAction.states.RECORD_ADMISSION_LETTER.body` | سجّل خطاب الدخول الصادر من المستشفى بسعر الباقة المعروض، لتراجعه المالية. | سجّل خطاب الدخول الصادر من المستشفى بسعر الباقة المعروض، ليراجعه الفريق المالي. |
| X-2 | ar.json | `portalWork.currentAction.states.APPROVE_COMMERCIAL_TERMS.title` | اعتمد الشروط المالية | اعتمد الشروط التجارية |
| X-2 | ar.json | `portalWork.currentAction.states.APPROVE_COMMERCIAL_TERMS.body` | راجع الخدمات المسعّرة يدويًا قبل إصدار العرض. | راجع الخدمات المسعّرة يدويًا قبل إصدار عرض السعر. |
| X-2 | ar.json | `portalWork.currentAction.states.RECORD_FEE_BALANCE.body` | لم تغطِّ الوديعة رسوم المنصة. سجّل المبلغ المتبقي الذي دفعه المريض والرقم المرجعي للدفعة. | لم تغطِّ دفعة التنسيق رسوم المنصة. سجّل المبلغ المتبقي الذي دفعه المريض والرقم المرجعي للدفعة. |
| X-2 | ar.json | `portalWork.currentAction.states.RECORD_HOSPITAL_BALANCE.body` | يدفع المريض الرصيد في خزينة المستشفى مقابل القسيمة. سجّل الإيصال؛ ثم توقّع عليه المالية. | يدفع المريض الرصيد في خزينة المستشفى مقابل القسيمة. سجّل الإيصال؛ ثم يوقّع عليه الفريق المالي. |
| X-2 | ar.json | `portalWork.currentAction.readiness.CONTACT_NOT_VERIFIED.body` | يؤكد المريض وسيلة التواصل عبر الرابط الآمن، ثم تُدفع وديعة التنسيق. | يؤكد المريض وسيلة التواصل عبر الرابط الآمن، ثم تُسدَّد دفعة التنسيق. |
| X-2 | ar.json | `portalWork.currentAction.readiness.DEPOSIT_UNPAID.title` | بانتظار تحويل المريض للوديعة | بانتظار تحويل المريض لدفعة التنسيق |
| X-2 | ar.json | `portalWork.currentAction.readiness.DEPOSIT_UNPAID.body` | يدفع المريض بتحويل بنكي ويُدخل الرقم المرجعي للعملية في صفحة حالته، ثم يتحقق منه فريق المالية. | يدفع المريض بتحويل بنكي ويُدخل الرقم المرجعي للعملية في صفحة حالته، ثم يتحقق منه الفريق المالي. |
| X-2 | ar.json | `portalWork.currentAction.readiness.default.body` | أُرسل رابط الملف الآمن إلى المريض، وتُرتَّب وديعة التنسيق بعد تفعيل الملف. | أُرسل رابط الملف الآمن إلى المريض، وتُرتَّب دفعة التنسيق بعد تفعيل الملف. |
| X-2 | ar.json | `portalWork.queue.assignedHintFinance` | الحالات المسندة إليك، أو التي فيها وديعة بانتظار التسجيل. | الحالات المسندة إليك، أو التي فيها دفعة تنسيق بانتظار التسجيل. |
| X-2 | ar.json | `portalWork.queue.status` | حالة الطلب | وضع الحالة |
| X-2 | ar.json | `portalWork.myCare.cases.pastStatus.DECLINED` | تم رفض العرض | تم رفض عرض السعر |
| X-2 | ar.json | `portalWork.myCare.steps.WAIT_PROPOSAL_REVISION.title` | نجهّز عرضًا معدّلًا | نجهّز تقديرًا معدّلًا |
| X-2 | ar.json | `portalWork.myCare.steps.WAIT_PROPOSAL_REVISION.body` | يحدّث منسقك العرض بالتعديلات التي طلبتها. | يحدّث منسّقك التقدير بالتعديلات التي طلبتها. |
| X-2 | ar.json | `portalWork.myCare.steps.WAIT_PROPOSAL_EXPIRED.title` | نجهّز عرضًا محدّثًا | نجهّز تقديرًا محدّثًا |
| X-2 | ar.json | `portalWork.myCare.steps.WAIT_PROPOSAL_EXPIRED.body` | انتهت صلاحية تقديرك السابق، ويجهّز منسقك عرضًا محدّثًا. | انتهت صلاحية تقديرك السابق، ويجهّز منسّقك تقديرًا محدّثًا. |
| X-2 | ar.json | `portalWork.myCare.steps.WAIT_PROPOSAL.title` | نجهّز عرضك | نجهّز تقديرك |
| X-2 | ar.json | `portalWork.myCare.steps.WAIT_PROPOSAL.next` | سيصلك العرض لتراجعه في وقتك. | سيصلك التقدير لتراجعه في وقتك. |
| X-2 | ar.json | `portalWork.myCare.steps.PAY_DEPOSIT.title` | ادفع وديعة التنسيق | سدّد دفعة التنسيق |
| X-2 | ar.json | `portalWork.myCare.steps.PAY_DEPOSIT.body` | اكتمل ملفك. ادفع الوديعة بتحويل بنكي أو عبر وكيل، ثم أدخل الرقم المرجعي أو رقم الإيصال الذي تحصل عليه. | اكتمل ملفك. سدّد دفعة التنسيق بتحويل بنكي أو عبر وكيل، ثم أدخل الرقم المرجعي أو رقم الإيصال الذي تحصل عليه. |
| X-2 | ar.json | `portalWork.myCare.steps.PAY_DEPOSIT.next` | بعد أن يؤكّد فريق المالية دفعتك، يبدأ منسّقك ترتيب علاجك. | بعد أن يؤكّد الفريق المالي دفعتك، يبدأ منسّقك ترتيب علاجك. |
| X-2 | ar.json | `portalWork.myCare.steps.WAIT_PAYMENT_CHECK.body` | شكرًا لك. يطابق فريق المالية دفعتك مع الرقم الذي أرسلته، وسنخبرك فور تأكيده. | شكرًا لك. يطابق الفريق المالي دفعتك مع الرقم الذي أرسلته، وسنخبرك فور تأكيده. |
| X-2 | ar.json | `portalWork.myCare.steps.DECLINED.title` | لم توافق على العرض | لم توافق على عرض السعر |
| X-2 | ar.json | `portalWork.myCare.steps.EXPIRED.body` | لم تصلنا وديعة التنسيق في الوقت المحدد، لذا أصبحت حالتك معلّقة. يمكن لمنسقك إعادة فتحها معك إن رغبت في المتابعة. | لم تصلنا دفعة التنسيق في الوقت المحدد، لذا أصبحت حالتك معلّقة. يمكن لمنسّقك إعادة فتحها معك إن رغبت في المتابعة. |
| X-2 | ar.json | `portalWork.myCare.payment.estimateNote` | تستند هذه الوديعة إلى تقديرك المبدئي. قد يتغيّر علاجك وسعره النهائي بعد أن يفحصك الطبيب حضوريًا؛ وتُخصم الوديعة من خطة العلاج وعرض السعر النهائيين. | تستند دفعة التنسيق هذه إلى تقديرك المبدئي. قد يتغيّر علاجك وسعره النهائي بعد أن يفحصك الطبيب حضوريًا؛ وتُخصم من خطة العلاج وعرض السعر النهائيين. |
| X-2 | ar.json | `portalWork.myCare.payment.referenceWhat` | بعد التحويل يعطيك البنك رقمًا مرجعيًا للعملية. أدخله هنا ليجد فريق المالية دفعتك ويؤكّدها. | بعد التحويل يعطيك البنك رقمًا مرجعيًا للعملية. أدخله هنا ليجد الفريق المالي دفعتك ويؤكّدها. |
| X-2 | ar.json | `portalWork.myCare.deposit.title` | وديعة التنسيق | دفعة التنسيق |
| X-2 | ar.json | `portalWork.myCare.deposit.track.steps[1]` | يتحقق فريق المالية منه | يتحقق الفريق المالي منه |
| X-2 | ar.json | `portalWork.myCare.deposit.paidChart` | استُلم {paid} من وديعة قيمتها {total}. | استُلم {paid} من دفعة تنسيق قيمتها {total}. |
| X-2 | ar.json | `portalWork.myCare.deposit.status.PAID` | تم استلام الوديعة | تم استلام دفعة التنسيق |
| X-2 | ar.json | `portalWork.myCare.deposit.note.PAID` | شكرًا لك — سيُخصم من السعر في خطة العلاج والعرض النهائي. | شكرًا لك — ستُخصم من السعر في خطة العلاج وعرض السعر النهائي. |
| X-2 | ar.json | `portalWork.myCare.deposit.note.WAIVED` | لا يلزم دفع وديعة لهذه الحالة. | لا تلزم دفعة تنسيق لحالتك. |
| X-2 | ar.json | `portalWork.myCare.deposit.note.REFUNDED` | أُعيدت الوديعة إليك. | أُعيدت دفعة التنسيق إليك. |
| X-2 | ar.json | `portalWork.myCare.journey.phases[3]` | عرضك | تقديرك |
| X-2 | ar.json | `portalWork.myCare.journey.phases[4]` | وديعة التنسيق | دفعة التنسيق |
| X-2 | ar.json | `portalWork.myCare.estimate.proposal` | عرضك | عرض السعر |
| X-2 | ar.json | `portalWork.myCare.estimate.view` | الاطلاع على العرض | الاطلاع على عرض السعر |
| X-2 | ar.json | `portalWork.myCare.estimate.documentType.FINAL_TREATMENT_QUOTE` | خطة العلاج والعرض النهائي | خطة العلاج وعرض السعر النهائي |
| X-2 | ar.json | `portalWork.myCare.estimate.bar.deposit` | وديعة التنسيق | دفعة التنسيق |
| X-2 | ar.json | `portalWork.myCare.estimate.bar.depositNote` | تُدفع أولًا، ثم تُخصم من السعر في خطة العلاج والعرض النهائي. | تُسدَّد أولًا، ثم تُخصم من السعر في خطة العلاج وعرض السعر النهائي. |
| X-2 | ar.json | `portalWork.myCare.estimate.bar.depositMark` | الوديعة | دفعة التنسيق |
| X-2 | ar.json | `portalWork.myCare.estimate.bar.chart.deposit` | وديعة التنسيق {deposit} تُدفع أولًا. | دفعة التنسيق {deposit} تُسدَّد أولًا. |
| X-2 | ar.json | `portalWork.myCare.admission.inYourCurrency` | حوالي {amount} بالسعر المثبّت في عرضك | حوالي {amount} بسعر الصرف المثبّت في عرض السعر |
| X-2 | ar.json | `portalWork.myCare.admission.feeBalanceNote` | لم يغطِّ العربون هذا الجزء من رسوم المنصة. سيخبرك منسقك بطريقة دفعه. | لم تغطِّ دفعة التنسيق هذا الجزء من رسوم المنصة. سيخبرك منسّقك بطريقة دفعه. |
| X-2 | ar.json | `portalWork.myCare.admission.depositCredit` | مغطّى بالفعل من عربونك | مغطّى بالفعل من دفعة التنسيق |
| X-2 | ar.json | `portalWork.myCare.treatment.change.inYourCurrency` | حوالي {amount} بالسعر المثبّت في عرضك | حوالي {amount} بسعر الصرف المثبّت في عرض السعر |
| X-2 | ar.json | `portalWork.recordDecision.quote` | عرض العلاج النهائي | عرض السعر النهائي |
| X-2 | ar.json | `portalWork.recordDecision.attestEstimate` | راجعتُ بالعربية شروط وديعة التنسيق والاسترداد والإلغاء مع المريض أو ممثّله، وتأكّدتُ من فهمها. | راجعتُ بالعربية شروط دفعة التنسيق والاسترداد والإلغاء مع المريض أو ممثّله، وتأكّدتُ من فهمها. |
| X-2 | ar.json | `portalWork.recordDecision.attestQuote` | راجعتُ بالعربية شروط الدفع في هذا العرض مع المريض أو ممثّله، وتأكّدتُ من فهمها. | راجعتُ بالعربية شروط الدفع في عرض السعر هذا مع المريض أو ممثّله، وتأكّدتُ من فهمها. |
| X-2 | ar.json | `portalWork.recordDecision.accept` | قبول العرض | قبول عرض السعر |
| X-2 | ar.json | `portalWork.financeApproval.caption` | بنود العرض بسعر الاستشاري وسعر المريض | بنود عرض السعر بسعر الاستشاري وسعر المريض |
| X-2 | ar.json | `portalWork.financeApproval.rateLater` | بسعر صرف اليوم؛ ويُثبَّت السعر عند إرسال العرض إلى المريض. | بسعر صرف اليوم؛ ويُثبَّت سعر الصرف عند إرسال عرض السعر إلى المريض. |
| X-2 | ar.json | `portalWork.financeApproval.approveTitle` | اعتماد الشروط المالية بإجمالي {amount}؟ | اعتماد الشروط التجارية بإجمالي {amount}؟ |
| X-2 | ar.json | `portalWork.financeApproval.approveBody` | يمكن للمنسّق بعدها إرسال العرض إلى المريض بهذه الأسعار. قد يُطلب منك تسجيل الدخول مجددًا للتأكيد. | يمكن للمنسّق بعدها إرسال عرض السعر إلى المريض بهذه الأسعار. قد يُطلب منك تسجيل الدخول مجددًا للتأكيد. |
| X-2 | ar.json | `portalWork.depositTransfer.confirmBody` | يُضاف المبلغ إلى وديعة المريض. قد يُطلب منك تسجيل الدخول مجددًا للتأكيد. | يُضاف المبلغ إلى دفعة التنسيق للمريض. قد يُطلب منك تسجيل الدخول مجددًا للتأكيد. |
| X-2 | ar.json | `portalWork.workTitles.PROPOSAL_TERMS_CALL` | مراجعة شروط المقترح مع المريض بالعربية | مراجعة شروط عرض السعر مع المريض بالعربية |
| X-2 | ar.json | `portalWork.workTitles.PREPARE_PROPOSAL` | تجهيز العرض | تجهيز التقدير |
| X-2 | ar.json | `portalWork.workTitles.PROPOSAL_REVISION` | تعديل العرض | تعديل التقدير |
| X-2 | ar.json | `portalWork.workTitles.PROPOSAL_DECLINED_REVIEW` | مراجعة العرض المرفوض | مراجعة عرض السعر المرفوض |
| X-2 | ar.json | `portalWork.workTitles.ASSIGN_FINANCE` | يلزم اعتماد المالية للشروط التجارية | يلزم اعتماد الفريق المالي للشروط التجارية |
| X-2 | ar.json | `portalWork.workTitles.RELEASE_PROPOSAL` | أصدر العرض للمريض | أصدر التقدير للمريض |
| X-2 | ar.json | `portalWork.workTitles.APPROVE_COMMERCIAL_TERMS` | اعتمد الشروط المالية | اعتمد الشروط التجارية |
| X-2 | ar.json | `portalWork.workTitles.SECOND_OPINION` | تقديم الرأي الطبي الثاني | قدّم رأيك الطبي الثاني |
| X-2 | ar.json | `portalWork.workTitles.FX_REAPPROVAL` | راجع سعر الصرف في عرض نهائي | راجع سعر الصرف في عرض سعر نهائي |
| X-2 | ar.json | `portalWork.workTitles.FINAL_QUOTE_EXPIRED` | انتهى العرض النهائي: تواصل مع المريض | انتهى عرض السعر النهائي: تواصل مع المريض |
| X-2 | ar.json | `portalWork.waitingReason.reasons.DEPOSIT_TO_ARRANGE` | ترتيب وديعة التنسيق مع المريض | ترتيب دفعة التنسيق مع المريض |
| X-2 | ar.json | `portalWork.waitingReason.reasons.DEPOSIT_RECEIVED_START` | استُلمت الوديعة — بانتظار بدء المنسّق رحلة العلاج | استُلمت دفعة التنسيق — بانتظار بدء المنسّق رحلة العلاج |
| X-2 | ar.json | `portalWork.waitingReason.reasons.READY_AND_DEPOSIT_SETTLED` | المريض جاهز والوديعة مسدَّدة — بانتظار بدء المنسّق رحلة العلاج | المريض جاهز ودفعة التنسيق مسدَّدة — بانتظار بدء المنسّق رحلة العلاج |
| X-2 | ar.json | `portalWork.waitingReason.reasons.DEPOSIT_PENDING` | بانتظار وديعة التنسيق | بانتظار دفعة التنسيق |
| X-2 | ar.json | `portalWork.waitingReason.reasons.TRANSFER_TO_VERIFY` | وصل الرقم المرجعي للتحويل — بانتظار تحقق المالية | وصل الرقم المرجعي للتحويل — بانتظار تحقق الفريق المالي |
| X-2 | ar.json | `portalWork.waitingReason.reasons.DEPOSIT_BALANCE_DUE` | استُلم جزء من الوديعة — المتبقي على المريض | استُلم جزء من دفعة التنسيق — المتبقي على المريض |
| X-2 | ar.json | `portalWork.waitingReason.reasons.ADMISSION_BALANCE_TO_CHECK` | سُجّل إيصال المستشفى — بانتظار توقيع المالية | سُجّل إيصال المستشفى — بانتظار توقيع الفريق المالي |
| X-2 | ar.json | `portalWork.caseCover.journey.phases[2]` | العرض | التقدير |
| X-2 | ar.json | `portalWork.caseCover.journey.phases[4]` | وديعة التنسيق | دفعة التنسيق |
| X-2 | ar.json | `portalWork.workCopy.items.RECOMMENDATION_READY.title` | التوصية السريرية جاهزة — تجهيز العرض | التوصية السريرية جاهزة — تجهيز التقدير |
| X-2 | ar.json | `portalWork.workCopy.items.RECOMMENDATION_READY.context` | وصلت توصية سريرية والخدمات الموصى بها من {consultant}. الخطوة التالية: مراجعتها وتجهيز عرض المريض. | وصلت توصية سريرية والخدمات الموصى بها من {consultant}. الخطوة التالية: مراجعتها وتجهيز التقدير للمريض. |
| X-2 | ar.json | `portalWork.workCopy.items.PROPOSAL_DECLINED.title` | رفض المريض العرض | رفض المريض عرض السعر |
| X-2 | ar.json | `portalWork.workCopy.items.PROPOSAL_DECLINED.context` | رفض المريض هذا العرض. | رفض المريض عرض السعر هذا. |
| X-2 | ar.json | `portalWork.workCopy.items.PROPOSAL_CHANGES_REQUESTED.title` | طلب المريض تعديلات على العرض | طلب المريض تعديلات على عرض السعر |
| X-2 | ar.json | `portalWork.workCopy.items.PROPOSAL_TERMS_CALL.title` | مراجعة شروط المقترح مع المريض بالعربية | مراجعة شروط عرض السعر مع المريض بالعربية |
| X-2 | ar.json | `portalWork.workCopy.items.PROPOSAL_TERMS_CALL.context` | طلب المريض مراجعة شروط المقترح معه بالعربية وتسجيل قراره. | طلب المريض مراجعة شروط عرض السعر معه بالعربية وتسجيل قراره. |
| X-2 | ar.json | `portalWork.workCopy.items.DEPOSIT_VERIFY_TRANSFER.context` | أدخل المريض الرقم المرجعي لتحويله البنكي لوديعة التنسيق. تحقّق منه لدى البنك، ثم أكّد المبلغ المستلَم أو ارفضه مع ذكر السبب. | أدخل المريض الرقم المرجعي لتحويله البنكي لدفعة التنسيق. تحقّق منه لدى البنك، ثم أكّد المبلغ المستلَم أو ارفضه مع ذكر السبب. |
| X-2 | ar.json | `portalWork.workCopy.items.DEPOSIT_TRANSFER_REPORTED.context` | يتحقق فريق المالية من تحويل وديعة التنسيق. | يتحقق الفريق المالي من تحويل دفعة التنسيق. |
| X-2 | ar.json | `portalWork.workCopy.items.DEPOSIT_REFERENCE_OVERDUE.context` | ذُكّر المريض ثلاثة أيام ولم يُدخل الرقم المرجعي للتحويل البنكي لوديعة التنسيق. تواصل معه، وأرسل له رابط الدفع إن احتاجه. | ذُكّر المريض ثلاثة أيام ولم يُدخل الرقم المرجعي للتحويل البنكي لدفعة التنسيق. تواصل معه، وأرسل له رابط الدفع إن احتاجه. |
| X-2 | ar.json | `portalWork.workCopy.items.CASE_EXPIRED_UNPAID.title` | انتهت صلاحية الحالة — لم تُدفع الوديعة | انتهت صلاحية الحالة — لم تُسدَّد دفعة التنسيق |
| X-2 | ar.json | `portalWork.workCopy.items.ASSIGN_OPERATIONS_PLAN.context` | طلب المريض باقة سفر. عيّن فريق العمليات لتخطيطها وتسعيرها قبل إرسال العرض. | طلب المريض باقة سفر. عيّن فريق العمليات لتخطيطها وتسعيرها قبل إرسال التقدير. |
| X-2 | ar.json | `portalWork.workCopy.items.ASSIGN_FINANCE.title` | يلزم اعتماد المالية للشروط التجارية | يلزم اعتماد الفريق المالي للشروط التجارية |
| X-2 | ar.json | `portalWork.workCopy.items.ASSIGN_FINANCE.context` | خدمة مسعّرة يدويًا تحتاج إلى اعتماد المالية قبل الإصدار. عيّن من يعتمدها. | خدمة مسعّرة يدويًا تحتاج إلى اعتماد الفريق المالي قبل الإصدار. عيّن من يعتمدها. |
| X-2 | ar.json | `portalWork.workCopy.items.RECORD_FEE_BALANCE.context` | لم تغطِّ الوديعة رسوم المنصة. سجّل المبلغ المتبقي الذي دفعه المريض والرقم المرجعي للدفعة. | لم تغطِّ دفعة التنسيق رسوم المنصة. سجّل المبلغ المتبقي الذي دفعه المريض والرقم المرجعي للدفعة. |
| X-2 | ar.json | `portalWork.workCopy.items.RELEASE_PROPOSAL.title` | أصدر العرض للمريض | أصدر التقدير للمريض |
| X-2 | ar.json | `portalWork.workCopy.items.APPROVE_COMMERCIAL_TERMS.title` | اعتمد الشروط المالية | اعتمد الشروط التجارية |
| X-2 | ar.json | `portalWork.workCopy.items.APPROVE_COMMERCIAL_TERMS.context` | راجع الخدمات المسعّرة يدويًا قبل إصدار العرض. | راجع الخدمات المسعّرة يدويًا قبل إصدار عرض السعر. |
| X-2 | ar.json | `portalWork.workCopy.items.PREPARE_TRAVEL_PACKAGE.context` | صِف باقة السفر للعرض قبل إرساله. تُرتَّب الحجوزات والوصول بعد استلام وديعة المريض فقط. | صِف باقة السفر للتقدير قبل إرساله. تُرتَّب الحجوزات والوصول بعد استلام دفعة التنسيق من المريض فقط. |
| X-2 | ar.json | `portalWork.workCopy.items.RECORD_ADMISSION_LETTER.context` | سجّل خطاب الدخول الصادر من المستشفى بسعر الباقة المعروض، لتراجعه المالية. | سجّل خطاب الدخول الصادر من المستشفى بسعر الباقة المعروض، ليراجعه الفريق المالي. |
| X-2 | ar.json | `portalWork.workCopy.items.TREATMENT_COORDINATION_START.title` | بدء تنسيق العلاج — استُلمت الوديعة | بدء تنسيق العلاج — استُلمت دفعة التنسيق |
| X-2 | ar.json | `portalWork.workCopy.items.TREATMENT_COORDINATION_START.context` | تأكّدت وديعة التنسيق. الخطوة التالية: بدء رحلة العلاج لهذه الحالة. | تأكّدت دفعة التنسيق. الخطوة التالية: بدء رحلة العلاج لهذه الحالة. |
| X-2 | ar.json | `portalWork.workCopy.items.REVISE_ADMISSION_LETTER.title` | رفضت المالية خطاب الدخول للحالة {caseNumber} | رفض الفريق المالي خطاب الدخول للحالة {caseNumber} |
| X-2 | ar.json | `portalWork.workCopy.items.ADMISSION_VOUCHER_BLOCKED.context` | العربون أكبر من باقة المستشفى ورسوم المنصة معًا، فلم تُصدر قسيمة. يظل قبول المريض قائمًا؛ اتفق مع العمليات على الخطوة التالية. | دفعة التنسيق أكبر من باقة المستشفى ورسوم المنصة معًا، فلم تُصدر قسيمة. يظل قبول المريض قائمًا؛ اتفق مع العمليات على الخطوة التالية. |
| X-2 | ar.json | `portalWork.workCopy.items.REFUND_CREDIT.context` | يُظهر كشف الحساب رصيدًا مستحقًا للمريض. رده مع استرداد الدفعة المقدمة. | يُظهر كشف الحساب رصيدًا مستحقًا للمريض. رده مع استرداد دفعة التنسيق. |
| X-2 | ar.json | `portalWork.travelPlan.confirmedHint` | يتطلب التأكيد موعد وصول مخططًا. يُتحقق أولًا من هوية المريض وموافقاته والعربون. | يتطلب التأكيد موعد وصول مخططًا. يُتحقق أولًا من هوية المريض وموافقاته ودفعة التنسيق. |
| X-2 | ar.json | `portalWork.admission.acts.checked` | اعتمدته المالية | اعتمده الفريق المالي |
| X-2 | ar.json | `portalWork.admission.acts.awaitingCheck` | بانتظار اعتماد المالية | بانتظار اعتماد الفريق المالي |
| X-2 | ar.json | `portalWork.admission.letterCheck.CHECK_PENDING` | بانتظار مراجعة المالية | بانتظار مراجعة الفريق المالي |
| X-2 | ar.json | `portalWork.admission.letterCheck.VARIANCE_OPEN` | أعلى من التقدير المقبول — بانتظار قرار المالية | أعلى من التقدير المقبول — بانتظار قرار الفريق المالي |
| X-2 | ar.json | `portalWork.admission.letterCheck.REFUSED` | رفضته المالية — يلزم خطاب جديد | رفضه الفريق المالي — يلزم خطاب جديد |
| X-2 | ar.json | `portalWork.admission.money.depositPaid` | العربون المدفوع | دفعة التنسيق المدفوعة |
| X-2 | ar.json | `portalWork.admission.money.depositCredit` | العربون المحتسب للمستشفى | دفعة التنسيق المحتسبة للمستشفى |
| X-2 | ar.json | `portalWork.admission.pnrApproved` | اعتمدتها المالية | اعتمدها الفريق المالي |
| X-2 | ar.json | `portalWork.admission.pnrPending` | بانتظار المالية | بانتظار الفريق المالي |
| X-2 | ar.json | `portalWork.admission.emergencyRecorded` | سجّل الاستشاري دخولًا طارئًا؛ وتراجعه المالية. | سجّل الاستشاري دخولًا طارئًا؛ ويراجعه الفريق المالي. |
| X-2 | ar.json | `portalWork.admission.checklist.blockers.BALANCE_NOT_EVIDENCED` | لم يُثبت سداد رصيد المستشفى (إيصال الخزينة موقّع من المالية) | لم يُثبت سداد رصيد المستشفى (إيصال الخزينة موقّع من الفريق المالي) |
| X-2 | ar.json | `portalWork.admission.forms.pnrHint` | لا تُستردّ تكاليف السفر بعد هذا الوقت. تعتمده المالية بعد تحديده. | لا تُستردّ تكاليف السفر بعد هذا الوقت. يعتمده الفريق المالي بعد تحديده. |
| X-2 | ar.json | `portalWork.admission.finance.feeDerivation` | رسوم المنصة {fee} − ما غطّاه العربون من الرسوم {applied} = {balance} | رسوم المنصة {fee} − ما غطّته دفعة التنسيق من الرسوم {applied} = {balance} |
| X-2 | ar.json | `portalWork.admission.emergency.body` | أدخل المريض قبل إثبات سداد الرصيد فقط عندما لا تحتمل حالته الانتظار. تراجعه المالية لاحقًا. لا يحل أبدًا محل عرض السعر النهائي أو الموافقة. | أدخل المريض قبل إثبات سداد الرصيد فقط عندما لا تحتمل حالته الانتظار. يراجعه الفريق المالي لاحقًا. لا يحل أبدًا محل عرض السعر النهائي أو الموافقة. |
| X-2 | ar.json | `portalWork.admission.emergency.confirmBody` | يجوز للمستشفى إدخال المريض قبل إثبات سداد الرصيد. ستُطلب مراجعة المالية. | يجوز للمستشفى إدخال المريض قبل إثبات سداد الرصيد. ستُطلب مراجعة الفريق المالي. |
| X-2 | ar.json | `portalWork.errorCodes.REFUND_PAYMENT_REQUIRED` | يتطلب الاسترداد دفعة مقدمة مسجلة. | يتطلب الاسترداد دفعة تنسيق مسجّلة. |
| X-2 | ar.json | `portalWork.errorCodes.FACILITY_LINE_REQUIRED` | حُجز مستشفى لهذه الحالة، لذلك يحتاج العرض النهائي إلى بند خاص بالمستشفى. اطلب من الاستشاري إضافة باقة المنشأة، أو بند يُدفع للمستشفى، إلى التقييم النهائي. | حُجز مستشفى لهذه الحالة، لذلك يحتاج عرض السعر النهائي إلى بند خاص بالمستشفى. اطلب من الاستشاري إضافة باقة المنشأة، أو بند يُدفع للمستشفى، إلى التقييم النهائي. |
| X-2 | ar.json | `portalWork.treatment.orders.status.PROPOSED` | لدى المالية للتسعير | لدى الفريق المالي للتسعير |
| X-2 | ar.json | `portalWork.treatment.orders.withinBand` | داخل النطاق: تقرر المالية | داخل النطاق: يقرر الفريق المالي |
| X-2 | ar.json | `portalWork.treatment.orders.channels.FINANCE` | قبلته المالية | قبله الفريق المالي |
| X-2 | ar.json | `portalWork.treatment.orderForm.hint` | تسعّر المالية كل بند. داخل النطاق تقبله المالية؛ وفوقه يقرر المريض. | يسعّر الفريق المالي كل بند. داخل النطاق يقبله الفريق المالي؛ وفوقه يقرر المريض. |
| X-2 | ar.json | `portalWork.treatment.orderForm.emergencyHint` | فقط لتغيير لا يحتمل الانتظار. يُنفّذ الآن بقرارك السريري؛ وتسعّره المالية وتراجعه لاحقًا ويُبلَّغ المريض. | فقط لتغيير لا يحتمل الانتظار. يُنفّذ الآن بقرارك السريري؛ ويسعّره الفريق المالي ويراجعه لاحقًا ويُبلَّغ المريض. |
| X-2 | ar.json | `portalWork.treatment.orderForm.send` | أرسل إلى المالية | أرسل إلى الفريق المالي |
| X-2 | ar.json | `portalWork.treatment.orderForm.emergencyConfirmBody` | يُسجّل التغيير على أنه نُفّذ بقرارك السريري. تسعّره المالية وتراجعه، ويُبلَّغ المريض. | يُسجّل التغيير على أنه نُفّذ بقرارك السريري. يسعّره الفريق المالي ويراجعه، ويُبلَّغ المريض. |
| X-2 | ar.json | `portalWork.treatment.bills.awaiting` | بانتظار المالية | بانتظار الفريق المالي |
| X-2 | ar.json | `portalWork.treatment.checklist.items.FINAL_QUOTE_ACCEPTED` | قبول العرض النهائي | قبول عرض السعر النهائي |
| X-2 | ar.json | `portalWork.discharge.invoice.countersigned` | اعتمدتها المالية | اعتمدها الفريق المالي |
| X-2 | ar.json | `portalWork.discharge.acts.countersigned` | اعتمدتها المالية | اعتمدها الفريق المالي |
| X-2 | ar.json | `portalWork.discharge.acts.awaitingCheck` | بانتظار اعتماد المالية | بانتظار اعتماد الفريق المالي |
| X-2 | ar.json | `portalWork.reconciliation.quote.empty` | لا يوجد ما هو معتمد في العرض. | لا يوجد ما هو معتمد في عرض السعر. |
| X-2 | ar.json | `portalWork.reconciliation.credit` | للمريض رصيد دائن قدره {amount}: يُرد مع استرداد الدفعة المقدمة. | للمريض رصيد دائن قدره {amount}: يُرد مع استرداد دفعة التنسيق. |
| X-2 | ar.json | `portalWork.statement.lineKinds.DEPOSIT_PAID` | الدفعة المقدمة المدفوعة | دفعة التنسيق المدفوعة |
| X-2 | ar.json | `portalWork.statement.rate` | العمود الثاني بسعر الصرف المثبّت في العرض. | العمود الثاني بسعر الصرف المثبّت في عرض السعر. |
| X-2 | ar.json | `portalWork.virtualClinic.services.lead` | خدماتك المهنية فقط. لا تُدرج هنا رسوم المستشفى ولا الغرسات ولا الإقامة ولا باقات السفر ولا خدمات الجهات الأخرى. تُحفظ الأسعار بالجنيه المصري، ويرى المريض عملته في العرض. | خدماتك المهنية فقط. لا تُدرج هنا رسوم المستشفى ولا الغرسات ولا الإقامة ولا باقات السفر ولا خدمات الجهات الأخرى. تُحفظ الأسعار بالجنيه المصري، ويرى المريض عملته في عرض السعر. |
| X-2 | ar.json | `portalWork.compliance.scorecards.facts.averageFinalToEstimateMaximum` | متوسط العرض النهائي مقارنةً بالحد الأعلى للتقدير | متوسط عرض السعر النهائي مقارنةً بالحد الأعلى للتقدير |
| X-2 | ar.json | `portalWork.compliance.samples.mismatchCodes.FINAL_QUOTE_NOT_SEPARATED` | العرض النهائي لا يفصل بنود الاستشاري عن بنود المستشفى. | عرض السعر النهائي لا يفصل بنود الاستشاري عن بنود المستشفى. |
| X-2 | ar.json | `portalWork.compliance.samples.recordKeys.statementDepositPaidEgp` | الدفعة المقدمة المدفوعة (ج.م) | دفعة التنسيق المدفوعة (ج.م) |
| X-2 | ar.json | `portalWork.compliance.samples.recordKeys.finalQuoteCONSULTANTEgp` | العرض النهائي، الاستشاري (ج.م) | عرض السعر النهائي، الاستشاري (ج.م) |
| X-2 | ar.json | `portalWork.compliance.samples.recordKeys.finalQuoteFACILITYEgp` | العرض النهائي، المستشفى (ج.م) | عرض السعر النهائي، المستشفى (ج.م) |
| X-2 | ar.json | `portalWork.compliance.samples.recordKeys.finalQuoteOTHEREgp` | العرض النهائي، جهات أخرى (ج.م) | عرض السعر النهائي، جهات أخرى (ج.م) |
| X-2 | ar.json | `portalWork.compliance.samples.recordKeys.finalQuotePLATFORMEgp` | العرض النهائي، رحلة الشفاء (ج.م) | عرض السعر النهائي، رحلة شفاء (ج.م) |
| X-2 | ar.json | `secureLink.status.proposalPreparing` | يجري إعداد عرضك. سنرسل لك رابطًا آمنًا فور جاهزيته. | يجري إعداد تقديرك. سنرسل لك رابطًا آمنًا فور جاهزيته. |
| X-2 | ar.json | `secureLink.status.proposalPreparingTitle` | نجهّز عرضك | نجهّز تقديرك |
| X-2 | ar.json | `secureLink.status.proposalUnavailable` | لم يعد هذا العرض متاحًا للمراجعة. يرجى التحديث للاطلاع على آخر حالة. | لم يعد عرض السعر هذا متاحًا للمراجعة. يرجى التحديث للاطلاع على آخر حالة. |
| X-2 | ar.json | `secureLink.proposal.invalid` | رابط العرض غير صالح أو منتهي الصلاحية. | رابط عرض السعر غير صالح أو منتهي الصلاحية. |
| X-2 | ar.json | `secureLink.proposal.payNowNote` | وديعة تنسيق للبدء — تُخصم من رصيدك النهائي. | دفعة التنسيق، وتُخصم من السعر في خطة العلاج وعرض السعر النهائي. تُعرض شروطها قبل أن تتابع. |
| X-2 | ar.json | `secureLink.proposal.alreadyPaid` | مدفوع مسبقًا (يُخصم من هذا العرض) | مدفوع مسبقًا (يُخصم من عرض السعر هذا) |
| X-2 | ar.json | `secureLink.proposal.nextPrelim[2]` | تسدّد وديعة التنسيق، وتُخصم من رصيدك النهائي. | تسدّد دفعة التنسيق، ونبدأ تنسيق رعايتك فور استلامها. |
| X-2 | ar.json | `secureLink.proposal.nextPrelim[4]` | بعد فحصك الحضوري تستلم عرضًا نهائيًا لتقرّره. | بعد فحصك الحضوري تستلم عرض السعر النهائي لتقبله أو ترفضه. |
| X-2 | ar.json | `secureLink.proposal.nextFinal[0]` | تقبل خطة العلاج والعرض النهائي. | تقبل خطة العلاج وعرض السعر النهائي. |
| X-2 | ar.json | `secureLink.proposal.ackStatement` | قد ترتفع أو تنخفض خطة العلاج النهائية وسعرها بعد فحص الطبيب المعالج لي. سأستلم عرضًا نهائيًا وأقرّره قبل أي علاج غير طارئ. | قد ترتفع أو تنخفض خطة العلاج النهائية وسعرها بعد فحص الطبيب المعالج لي. سأستلم عرض السعر النهائي وأقرّر قبوله أو رفضه قبل أي علاج غير طارئ. |
| X-2 | ar.json | `secureLink.proposal.ackShortFinal` | أفهم أن قبول هذا العرض اتفاق مالي. | أقبل خطة العلاج وعرض السعر النهائي هذين للخدمات المؤكدة المذكورة، بالسعر المبيّن. |
| X-2 | ar.json | `secureLink.proposal.ackDoneDeposit` | نبدأ تنسيق رعايتك فور استلام وديعة التنسيق. | نبدأ تنسيق رعايتك فور استلام دفعة التنسيق. |
| X-2 | ar.json | `secureLink.activation.stepDeposit` | تم استلام الوديعة | تم استلام دفعة التنسيق |
| X-2 | ar.json | `secureLink.activation.nextPay` | ادفع وديعة التنسيق | سدّد دفعة التنسيق |
| X-2 | ar.json | `secureLink.activation.nextPayHow` | تدفعها في «رعايتي» بتحويل بنكي أو عبر وكيل، ثم تُدخل الرقم المرجعي الذي يعطيك إياه البنك أو الوكيل. يبدأ منسّقك ترتيب رعايتك بعد أن يؤكّد فريق المالية دفعتك. | تدفعها في «رعايتي» بتحويل بنكي أو عبر وكيل، ثم تُدخل الرقم المرجعي الذي يعطيك إياه البنك أو الوكيل. يبدأ منسّقك ترتيب رعايتك بعد أن يؤكّد الفريق المالي دفعتك. |
| X-2 | ar.json | `secureLink.activation.stepDepositWaived` | لا تلزم وديعة | لا تلزم دفعة تنسيق |
| X-2 | ar.json | `secureLink.journey.phases.proposal` | عرضك | تقديرك |
| X-2 | ar.json | `secureLink.journey.phases.deposit` | وديعة التنسيق | دفعة التنسيق |
| X-2 | ar.json | `secureLink.journey.explain.proposal.title` | عرضك | تقديرك |
| X-2 | ar.json | `secureLink.journey.explain.deposit.title` | وديعة التنسيق | دفعة التنسيق |
| X-2 | ar.json | `secureLink.journey.explain.deposit.body` | إن لم تدفعها بعد، سجّل الدخول إلى «رعايتي» لتدفعها بتحويل بنكي أو عبر وكيل، وأدخل الرقم المرجعي الذي تحصل عليه. وإن كنت أرسلت الرقم المرجعي، فإن فريق المالية يتحقق منه. | إن لم تدفعها بعد، سجّل الدخول إلى «رعايتي» لتدفعها بتحويل بنكي أو عبر وكيل، وأدخل الرقم المرجعي الذي تحصل عليه. وإن كنت أرسلت الرقم المرجعي، فإن الفريق المالي يتحقق منه. |
| X-2 | ar.json | 98 keys, shadda only (منسق → منسّق, no other change): `home.assurances[2]`, `home.heroCardNote`, `home.story.steps[0].body`, `home.story.steps[1].body`, `home.story.send.coordinator`, `home.story.send.check`, `home.story.review.photoAlt`, `home.story.review.coordinatorTag`, `home.story.care.followBody`, `home.video.intro`, `home.steps[1]`, `home.coordinatorBody`, `form.errors.forOthersLimit`, `consultantProfile.matchNote`, `portalProposal.optionalNote`, `portalWork.portal.signedOut.help`, `portalWork.caseView.send.locked`, `portalWork.safety.guardian.noEvidence`, `portalWork.safety.guardian.loadFailed`, `portalWork.safety.concerns.intro`, `portalWork.safety.reopen.body`, `portalWork.clinicalDecision.recommendation.risksHint`, `portalWork.clinicalDecision.exits.hint.RETURN_TO_COORDINATOR`, `portalWork.clinicalDecision.exits.action.RETURN_TO_COORDINATOR`, `portalWork.clinicalDecision.exits.reasonPlaceholder`, `portalWork.clinicalDecision.exits.confirm.RETURN_TO_COORDINATOR.body`, `portalWork.clinicalDecision.exits.confirm.NOT_SUITABLE.body`, `portalWork.referrals.referHint`, `portalWork.referrals.send`, `portalWork.referrals.status.AWAITING_COORDINATOR`, `portalWork.referrals.status.DECLINED_BY_COORDINATOR`, `portalWork.referrals.coordinatorNote`, `portalWork.currentAction.states.CLAIM_CASE.title`, `portalWork.currentAction.states.VIEW_ONLY.title`, `portalWork.currentAction.states.ACCEPT_ASSIGNMENT.body`, `portalWork.currentAction.states.ACCEPT_ASSIGNMENT_DOCTOR.body`, `portalWork.myWork.coordinator`, `portalWork.queue.unowned`, `portalWork.queue.unownedHint`, `portalWork.queue.teamHint`, `portalWork.queue.mineHint`, `portalWork.queue.owner`, `portalWork.queue.unownedInQueue`, `portalWork.myCare.step.requestedBy`, `portalWork.myCare.withdraw.body`, `portalWork.myCare.steps.PROVIDE_INFORMATION.body`, `portalWork.myCare.steps.PROVIDE_INFORMATION.next`, `portalWork.myCare.steps.REVIEW_FINAL_QUOTE.next`, `portalWork.myCare.steps.COMPLETE_PROFILE.body`, `portalWork.myCare.steps.COMPLETE_PROFILE.next`, `portalWork.myCare.steps.VERIFY_IDENTITY.next`, `portalWork.myCare.steps.WAIT_CASE_RECEIVED.body`, `portalWork.myCare.steps.WAIT_CASE_RECEIVED.next`, `portalWork.myCare.steps.WAIT_COORDINATOR_REVIEW.title`, `portalWork.myCare.steps.WAIT_COORDINATOR_REVIEW.body`, `portalWork.myCare.steps.WAIT_PROPOSAL.body`, `portalWork.myCare.steps.WAIT_COORDINATION.body`, `portalWork.myCare.steps.DECLINED.body`, `portalWork.myCare.steps.CLINICALLY_NOT_SUITABLE.body`, `portalWork.myCare.steps.WITHDRAWN.body`, `portalWork.myCare.steps.CANCELLED.body`, `portalWork.myCare.steps.COMPLETED.body`, `portalWork.myCare.steps.CLOSED.body`, `portalWork.myCare.steps.CONFIRM_ARRIVAL.body`, `portalWork.myCare.steps.GOING_HOME.next`, `portalWork.myCare.journey.phases[1]`, `portalWork.myCare.people.title`, `portalWork.myCare.people.pending`, `portalWork.myCare.upload.full`, `portalWork.myCare.upload.failed`, `portalWork.myCare.admission.arrivedBody`, `portalWork.myCare.treatment.change.declineBody`, `portalWork.myCare.followUp.route.coordinator`, `portalWork.myCare.followUp.route.consultant`, `portalWork.myCare.followUp.outcome.notice.who`, `portalWork.myCare.followUp.outcome.notice.withdraw`, `portalWork.myCare.followUp.outcome.sentComplication`, `portalWork.workCopy.items.CHANGE_ORDER_REJECTED.context`, `portalWork.admission.trail.roles.COORDINATOR`, `portalWork.retention.erase.blockers.ERASURE_CASE_ACTIVE`, `secureLink.status.quoteReadyNext`, `secureLink.status.noItems`, `secureLink.status.doneBody`, `secureLink.status.proposalDeclined`, `secureLink.status.proposalRevision`, `secureLink.status.proposalExpired`, `secureLink.activation.passportNote`, `secureLink.activation.doneIntro`, `secureLink.activation.invalid`, `secureLink.journey.phases.coordinator`, `secureLink.journey.needed.body`, `secureLink.journey.needed.next`, `secureLink.journey.explain.received.body`, `secureLink.journey.explain.received.next`, `secureLink.journey.explain.coordinator.title`, `secureLink.journey.explain.coordinator.body`, `secureLink.journey.explain.deposit.next`, `secureLink.journey.explain.treatment.body` | منسق… | منسّق… |
| X-2 | en.json | `portalWork.caseView.finalQuote.financeWait` | Waiting for finance approval of the manually-priced services. | Waiting for Finance approval of the manually-priced services. |
| X-2 | en.json | `portalWork.myCare.steps.PAY_DEPOSIT.next` | Once our finance team confirms your payment, your coordinator starts arranging your treatment. | Once our Finance team confirms your payment, your coordinator starts arranging your treatment. |
| X-2 | en.json | `portalWork.myCare.steps.WAIT_PAYMENT_CHECK.body` | Thank you. Our finance team is matching your payment with the number you sent, and we'll let you know as soon as it's confirmed. | Thank you. Our Finance team is matching your payment with the number you sent, and we'll let you know as soon as it's confirmed. |
| X-2 | en.json | `portalWork.myCare.steps.PAY_BALANCE.next` | Our finance team checks the receipt, then you are cleared for admission. | Our Finance team checks the receipt, then you are cleared for admission. |
| X-2 | en.json | `portalWork.myCare.steps.WAIT_BALANCE_CHECK.body` | The hospital's receipt for your balance is recorded. Our finance team is checking it. | The hospital's receipt for your balance is recorded. Our Finance team is checking it. |
| X-2 | en.json | `portalWork.myCare.payment.receiptWhat` | The agent gives you a receipt with a number. Enter it here so our finance team can confirm your payment with the agent. | The agent gives you a receipt with a number. Enter it here so our Finance team can confirm your payment with the agent. |
| X-2 | en.json | `portalWork.myCare.payment.referenceWhat` | After you transfer, your bank gives you a reference number for the transaction. Enter it here so our finance team can find your payment and confirm it. | After you transfer, your bank gives you a reference number for the transaction. Enter it here so our Finance team can find your payment and confirm it. |
| X-2 | en.json | `secureLink.activation.nextPayHow` | You pay it in My Care, by bank transfer or through an agent, and then enter the reference your bank or agent gives you. Your coordinator starts arranging your care once our finance team confirms it. | You pay it in My Care, by bank transfer or through an agent, and then enter the reference your bank or agent gives you. Your coordinator starts arranging your care once our Finance team confirms it. |
| X-2 | en.json | `secureLink.journey.explain.deposit.body` | If you have not paid it yet, sign in to My Care to pay it by bank transfer or through an agent, and enter the reference you are given. If you already sent the reference, our finance team is checking it. | If you have not paid it yet, sign in to My Care to pay it by bank transfer or through an agent, and enter the reference you are given. If you already sent the reference, our Finance team is checking it. |
| X-3 | ar.json | `nav.careAreasMenu.notSureTitle` | لست متأكدًا أي مجال يناسبك؟ | لم يتضح لك أي مجال يناسبك؟ |
| X-3 | ar.json | `common.whatsapp` | تحدث مع منسّق | تحدّث مع منسّق |
| X-3 | ar.json | `home.coordinatorIntro.body` | منسّق واحد يتحدث العربية والإنجليزية يرافق حالتك من أول رسالة حتى المتابعة، ويمكنك التواصل معه عبر واتساب. | منسّق واحد يتحدّث العربية والإنجليزية يرافق حالتك من أول رسالة حتى المتابعة، ويمكنك التواصل معه عبر واتساب. |
| X-3 | ar.json | `home.howReady` | متى ما كنت مستعدًا. | في الوقت الذي يناسبك. |
| X-3 | ar.json | `cardiology.finalTitle` | لست متأكداً أين تندرج حالتك؟ | لم يتضح لك أين تندرج حالتك؟ |
| X-3 | ar.json | `consultants.people[0].position` | يحتاج إلى التحقق | يحتاج إلى التحققّ |
| X-3 | ar.json | `consultants.people[0].experience` | تحتاج إلى التحقق | تحتاج إلى التحققّ |
| X-3 | ar.json | `consultants.people[0].qualifications` | تحتاج إلى التحقق | تحتاج إلى التحققّ |
| X-3 | ar.json | `consultants.people[0].memberships` | تحتاج إلى التحقق | تحتاج إلى التحققّ |
| X-3 | ar.json | `consultants.people[1].position` | يحتاج إلى التحقق | يحتاج إلى التحققّ |
| X-3 | ar.json | `consultants.people[1].experience` | تحتاج إلى التحقق | تحتاج إلى التحققّ |
| X-3 | ar.json | `consultants.people[1].qualifications` | تحتاج إلى التحقق | تحتاج إلى التحققّ |
| X-3 | ar.json | `consultants.people[1].memberships` | تحتاج إلى التحقق | تحتاج إلى التحققّ |
| X-3 | ar.json | `consultants.people[2].position` | يحتاج إلى التحقق | يحتاج إلى التحققّ |
| X-3 | ar.json | `consultants.people[2].experience` | تحتاج إلى التحقق | تحتاج إلى التحققّ |
| X-3 | ar.json | `consultants.people[2].qualifications` | تحتاج إلى التحقق | تحتاج إلى التحققّ |
| X-3 | ar.json | `consultants.people[2].memberships` | تحتاج إلى التحقق | تحتاج إلى التحققّ |
| X-3 | ar.json | `how.stages[1].what` | ينظّم منسّقك المعلومات ويتحقق مما إذا كان هناك شيء مهم ناقص. | ينظّم منسّقك المعلومات ويتحققّ مما إذا كان هناك شيء مهم ناقص. |
| X-3 | ar.json | `form.flow.emailHint` | للتواصل معك الآن فقط، ولا يصبح بريد الدخول إلا بعد التحقق منه. | للتواصل معك الآن فقط، ولا يصبح بريد الدخول إلا بعد التحققّ منه. |
| X-3 | ar.json | `form.nextSteps.whatsapp` | تفضّل أن تتحدث أولًا؟ | تفضّل أن تتحدّث أولًا؟ |
| X-3 | ar.json | `form.errors.name` | يرجى إدخال الاسم الأول. | أدخل الاسم الأول. |
| X-3 | ar.json | `form.errors.familyName` | يرجى إدخال اسم العائلة، أو تأكيد أن الاسم القانوني مفرد. | أدخل اسم العائلة، أو أكّد أن الاسم القانوني مفرد. |
| X-3 | ar.json | `form.errors.representative` | يرجى تحديد مقدّم الطلب وصلة قرابته بالمريض. | حدّد مقدّم الطلب وصلة قرابته بالمريض. |
| X-3 | ar.json | `form.errors.phone` | يرجى إدخال رقم واتساب صحيح. | أدخل رقم واتساب صحيحًا. |
| X-3 | ar.json | `form.errors.email` | يرجى إدخال بريد إلكتروني صحيح. | أدخل بريدًا إلكترونيًا صحيحًا. |
| X-3 | ar.json | `form.errors.server` | تعذر إرسال حالتك الآن. حاول مرة أخرى أو تواصل معنا عبر واتساب. | تعذّر إرسال حالتك الآن. حاول مرة أخرى أو تواصل معنا عبر واتساب. |
| X-3 | ar.json | `form.errors.forOthersLimit` | أرسلت عدة حالات لأشخاص آخرين مؤخرًا. يُرجى المحاولة لاحقًا، أو مراسلة منسّقك. | أرسلت عدة حالات لأشخاص آخرين مؤخرًا. حاول مرة أخرى لاحقًا، أو راسل منسّقك. |
| X-3 | ar.json | `form.category.help` | لست متأكدًا؟ اتركه، وسيوجّه منسّقك حالتك إلى التخصص المناسب. | لم يتضح لك التخصص؟ اتركه، وسيوجّه منسّقك حالتك إلى التخصص المناسب. |
| X-3 | ar.json | `careAreasPage.router.eyebrow` | لست متأكدًا أين تندرج حالتك؟ | لم يتضح لك أين تندرج حالتك؟ |
| X-3 | ar.json | `rheumatology.finalTitle` | لست متأكدًا أين تندرج حالتك؟ | لم يتضح لك أين تندرج حالتك؟ |
| X-3 | ar.json | `orthopedics.finalTitle` | لست متأكدًا أين تندرج حالتك؟ | لم يتضح لك أين تندرج حالتك؟ |
| X-3 | ar.json | `consultantsPage.router.eyebrow` | لست متأكدًا من تختار؟ | لم يتضح لك أي استشاري يناسبك؟ |
| X-3 | ar.json | `portalProposal.declineConsequence` | سيُبلَّغ منسّقك بذلك. يمكنك التحدث مع منسّقك قبل اتخاذ القرار. | سيُبلَّغ منسّقك بذلك. يمكنك التحدّث مع منسّقك قبل اتخاذ القرار. |
| X-3 | ar.json | `portalProposal.assisted.requestFailed` | لم يُرسَل طلبك. يُرجى التحقّق من الاتصال والمحاولة مرة أخرى. | لم يُرسَل طلبك. تحقّق من الاتصال وحاول مرة أخرى. |
| X-3 | ar.json | `portalWork.replyCover.intro` | أثناء غيابك يردّ زميل واحد على مرضاك، وتبقى قادراً على قراءة كل المحادثات. | أثناء غيابك يردّ زميل واحد على مرضاك، ويبقى بإمكانك قراءة كل المحادثات. |
| X-3 | ar.json | `portalWork.caseView.logistics.stage.ARRIVAL_CONFIRMED` | تم الوصول، ولم يدخل المستشفى بعد | تم الوصول، ولم يتم الدخول إلى المستشفى بعد |
| X-3 | ar.json | `portalWork.caseView.logistics.stage.ADMISSION_READY` | تم الوصول، وجاهز للدخول إلى المستشفى | تم الوصول، والدخول إلى المستشفى معتمد |
| X-3 | ar.json | `portalWork.caseView.logistics.stage.DISCHARGED` | خرج من المستشفى | تم الخروج من المستشفى |
| X-3 | ar.json | `portalWork.caseView.logistics.stage.FOLLOW_UP` | خرج من المستشفى، في مرحلة المتابعة | تم الخروج من المستشفى، في مرحلة المتابعة |
| X-3 | ar.json | `portalWork.caseView.delivery.resendHint` | يُلغي الرابط ورمز التحقق السابقين ويُرسل رابطًا آمنًا جديدًا. لا يُنشئ عرض سعر جديدًا ولا يغيّر وضع الحالة. | يُلغي الرابط ورمز التحققّ السابقين ويُرسل رابطًا آمنًا جديدًا. لا يُنشئ عرض سعر جديدًا ولا يغيّر وضع الحالة. |
| X-3 | ar.json | `portalWork.safety.guardianReview.states.EVIDENCE_UNVERIFIED` | مستند بانتظار تحققك | مستند بانتظار تحققّك |
| X-3 | ar.json | `portalWork.safety.guardianReview.states.VERIFIED` | تم التحقق | تم التحققّ |
| X-3 | ar.json | `portalWork.safety.guardianReview.verify` | تحقق | تحققّ |
| X-3 | ar.json | `portalWork.safety.guardianReview.verifiedOn` | تم التحقق في {date} | تم التحققّ في {date} |
| X-3 | ar.json | `portalWork.empty.noOperations` | لا يوجد بعد أحد في فريق العمليات يمكن تعيينه. يُرجى الطلب من مدير الفريق إضافة عضو. | لا يوجد بعد أحد في فريق العمليات يمكن تعيينه. اطلب من مدير الفريق إضافة عضو. |
| X-3 | ar.json | `portalWork.empty.noFinance` | لا يوجد بعد أحد في الفريق المالي يمكن تعيينه. يُرجى الطلب من مدير الفريق إضافة عضو. | لا يوجد بعد أحد في الفريق المالي يمكن تعيينه. اطلب من مدير الفريق إضافة عضو. |
| X-3 | ar.json | `portalWork.empty.teamUnavailable` | تعذّر تحميل قائمة الفريق. يُرجى إعادة تحميل الصفحة للمحاولة مرة أخرى. | تعذّر تحميل قائمة الفريق. أعد تحميل الصفحة للمحاولة مرة أخرى. |
| X-3 | ar.json | `portalWork.confirm.refundBody` | يسجّل هذا مبلغًا أُعيد إلى المريض من دفعة التنسيق هذه. يُرجى التحقق من المبلغ قبل المتابعة. | يسجّل هذا مبلغًا أُعيد إلى المريض من دفعة التنسيق هذه. تحقّق من المبلغ قبل المتابعة. |
| X-3 | ar.json | `portalWork.confirm.opinionBody` | بإرسال الرأي ينتهي الوصول إلى هذه الحالة، لذا يُرجى مراجعته قبل الإرسال. | بإرسال الرأي ينتهي الوصول إلى هذه الحالة، فراجعه قبل الإرسال. |
| X-3 | ar.json | `portalWork.accessUnavailable.message` | تعذّر التحقق من صلاحياتك، لذلك لا يمكن عرض مساحة عملك. لم يتغيّر شيء. | تعذّر التحققّ من صلاحياتك، لذلك لا يمكن عرض مساحة عملك. لم يتغيّر شيء. |
| X-3 | ar.json | `portalWork.currentAction.work.DEPOSIT_RECORD` | التحقق من التحويل | التحققّ من التحويل |
| X-3 | ar.json | `portalWork.currentAction.states.RELEASE_PROPOSAL.body` | تحقق من متطلبات الإصدار ثم أرسل الرابط الآمن. | تحققّ من متطلبات الإصدار ثم أرسل الرابط الآمن. |
| X-3 | ar.json | `portalWork.currentAction.readiness.GUARDIAN_EVIDENCE_UNVERIFIED.title` | مستند الوصي بانتظار تحققك | مستند الوصي بانتظار تحققّك |
| X-3 | ar.json | `portalWork.currentAction.readiness.GUARDIAN_EVIDENCE_UNVERIFIED.body` | افتح «العمر والوصي» في الحالة واطّلع على المستند، ثم تحقق منه أو ارفضه. | افتح «العمر والوصي» في الحالة واطّلع على المستند، ثم تحققّ منه أو ارفضه. |
| X-3 | ar.json | `portalWork.currentAction.readiness.DEPOSIT_UNPAID.body` | يدفع المريض بتحويل بنكي ويُدخل الرقم المرجعي للعملية في صفحة حالته، ثم يتحقق منه الفريق المالي. | يدفع المريض بتحويل بنكي ويُدخل الرقم المرجعي للعملية في صفحة حالته، ثم يتحققّ منه الفريق المالي. |
| X-3 | ar.json | `portalWork.queue.createdFrom` | أُنشئت من | أُنشئت منذ |
| X-3 | ar.json | `portalWork.queue.createdTo` | أُنشئت إلى | أُنشئت حتى |
| X-3 | ar.json | `portalWork.queue.updatedFrom` | حُدّثت من | حُدّثت منذ |
| X-3 | ar.json | `portalWork.queue.updatedTo` | حُدّثت إلى | حُدّثت حتى |
| X-3 | ar.json | `portalWork.queue.requestFailed` | لم يُرسَل الطلب. لم يتغيّر شيء؛ يُرجى المحاولة مرة أخرى. | لم يُرسَل الطلب. لم يتغيّر شيء؛ حاول مرة أخرى. |
| X-3 | ar.json | `portalWork.myCare.step.replyBy` | يُرجى الرد قبل | الرد مطلوب قبل |
| X-3 | ar.json | `portalWork.myCare.steps.VERIFY_IDENTITY.title` | التحقق من الهوية | التحققّ من الهوية |
| X-3 | ar.json | `portalWork.myCare.steps.VERIFY_IDENTITY.body` | لأن دعم السفر جزء من رعايتك، نحتاج إلى التحقق من هويتك قبل تأكيد الترتيبات. نُخزّن الحد الأدنى فقط ومشفّرًا. | لأن دعم السفر جزء من رعايتك، نحتاج إلى التحققّ من هويتك قبل تأكيد الترتيبات. نُخزّن الحد الأدنى فقط ومشفّرًا. |
| X-3 | ar.json | `portalWork.myCare.steps.WAIT_CASE_RECEIVED.next` | سيتحقق المنسّق مما أرسلته ويخبرك إن كان ينقص شيء. | سيتحققّ المنسّق مما أرسلته ويخبرك إن كان ينقص شيء. |
| X-3 | ar.json | `portalWork.myCare.steps.WAIT_PAYMENT_CHECK.title` | نتحقق من دفعتك | نتحققّ من دفعتك |
| X-3 | ar.json | `portalWork.myCare.steps.PAY_BALANCE.next` | يراجع فريقنا المالي الإيصال، ثم تصبح جاهزًا للدخول. | يراجع فريقنا المالي الإيصال، ثم يُعتمد دخولك إلى المستشفى. |
| X-3 | ar.json | `portalWork.myCare.steps.WAIT_BALANCE_CHECK.next` | بعد المراجعة تصبح جاهزًا للدخول. | بعد المراجعة يُعتمد دخولك إلى المستشفى. |
| X-3 | ar.json | `portalWork.myCare.steps.CLEARED_FOR_ADMISSION.title` | أنت جاهز للدخول إلى المستشفى | اعتُمد دخولك إلى المستشفى |
| X-3 | ar.json | `portalWork.myCare.deposit.track.steps[1]` | يتحقق الفريق المالي منه | يتحققّ الفريق المالي منه |
| X-3 | ar.json | `portalWork.myCare.deposit.status.CHECKING` | قيد التحقق | قيد التحققّ |
| X-3 | ar.json | `portalWork.myCare.admission.clearedOn` | أنت جاهز للدخول إلى المستشفى في {date}. | اعتُمد دخولك إلى المستشفى في {date}. |
| X-3 | ar.json | `portalWork.depositTransfer.amountInvalidMax` (new) | — | أدخل المبلغ المستلَم بالأرقام، أكبر من صفر ولا يزيد على الرصيد المتبقي {amount}. |
| X-3 | ar.json | `portalWork.workTitles.DEPOSIT_RECORD` | التحقق من التحويل | التحققّ من التحويل |
| X-3 | ar.json | `portalWork.waitingReason.reasons.TRANSFER_TO_VERIFY` | وصل الرقم المرجعي للتحويل — بانتظار تحقق الفريق المالي | وصل الرقم المرجعي للتحويل — بانتظار تحققّ الفريق المالي |
| X-3 | ar.json | `portalWork.caseMessages.attachments.UNSUPPORTED_TYPE` | لا يُحفظ هذا النوع من المرفقات. يُرجى إرسال الملفات بصيغة PDF أو JPG أو PNG. | لا يُحفظ هذا النوع من المرفقات. أرسل الملفات بصيغة PDF أو JPG أو PNG. |
| X-3 | ar.json | `portalWork.caseMessages.attachments.TOO_LARGE` | الملف أكبر من الحجم المسموح به ولم يُحفظ. يُرجى إرسال ملف أصغر. | الملف أكبر من الحجم المسموح به ولم يُحفظ. أرسل ملفًا أصغر. |
| X-3 | ar.json | `portalWork.caseMessages.attachments.EXPIRED` | تعذّر استلام هذا المرفق. يُرجى إرساله مرة أخرى. | تعذّر استلام هذا المرفق. أرسله مرة أخرى. |
| X-3 | ar.json | `portalWork.caseMessages.attachments.UNAVAILABLE` | تعذّر استلام هذا المرفق. يُرجى إرساله مرة أخرى. | تعذّر استلام هذا المرفق. أرسله مرة أخرى. |
| X-3 | ar.json | `portalWork.workCopy.items.INTAKE_MESSAGE.context` | كتب لك مجدداً شخص تتحدث معه عبر واتساب. ردّ من صفحة المحادثات. | كتب لك مجدداً شخص تتحدّث معه عبر واتساب. ردّ من صفحة المحادثات. |
| X-3 | ar.json | `portalWork.workCopy.items.PROPOSAL_TERMS_CALL.context` | طلب المريض مراجعة شروط عرض السعر معه بالعربية وتسجيل قراره. | طُلب منك مراجعة شروط عرض السعر بالعربية مع المريض، وتسجيل القرار. |
| X-3 | ar.json | `portalWork.workCopy.items.DEPOSIT_VERIFY_TRANSFER.title` | التحقق من التحويل | التحققّ من التحويل |
| X-3 | ar.json | `portalWork.workCopy.items.DEPOSIT_TRANSFER_REPORTED.context` | يتحقق الفريق المالي من تحويل دفعة التنسيق. | يتحققّ الفريق المالي من تحويل دفعة التنسيق. |
| X-3 | ar.json | `portalWork.workCopy.items.RELEASE_PROPOSAL.context` | تحقق من متطلبات الإصدار ثم أرسل الرابط الآمن. | تحققّ من متطلبات الإصدار ثم أرسل الرابط الآمن. |
| X-3 | ar.json | `portalWork.travelPlan.confirmedHint` | يتطلب التأكيد موعد وصول مخططًا. يُتحقق أولًا من هوية المريض وموافقاته ودفعة التنسيق. | يتطلب التأكيد موعد وصول مخططًا. يُتحققّ أولًا من هوية المريض وموافقاته ودفعة التنسيق. |
| X-3 | ar.json | `portalWork.admission.forms.paidAmountInvalid` (new) | — | اكتب المبلغ المدفوع بتلك العملة بالأرقام وأكبر من صفر، مثل 4,000. |
| X-3 | ar.json | `portalWork.admission.finance.feeDerivation` | رسوم المنصة {fee} − ما غطّته دفعة التنسيق من الرسوم {applied} = {balance} | رسوم المنصة {fee}، غطّت منها دفعة التنسيق {applied}، فيبقى {balance}. |
| X-3 | ar.json | `portalWork.discharge.blockers.TREATMENT_CHECKLIST_INCOMPLETE` | قائمة تحقق العلاج غير مكتملة | قائمة تحققّ العلاج غير مكتملة |
| X-3 | ar.json | `portalWork.discharge.invoice.amountInvalid` (new) | — | اكتب الإجمالي بالأرقام، صفرًا أو أكثر، مثل 195,500. |
| X-3 | ar.json | `portalWork.retention.classes.ACCESS_SECRET` | الروابط والرموز وتحققات الدخول | الروابط والرموز وتحققّات الدخول |
| X-3 | ar.json | `portalWork.retention.identityOperations.RESET_MFA` | إعادة تعيين خطوة التحقق الثانية | إعادة تعيين خطوة التحققّ الثانية |
| X-3 | ar.json | `portalWork.retention.errors.CASE_NOT_FOUND` | لا توجد حالة بهذا الرقم. تحقق منه وحاول مجددًا. | لا توجد حالة بهذا الرقم. تحققّ منه وحاول مجددًا. |
| X-3 | ar.json | `secureLink.status.loading` | جارٍ التحقق من الرابط الآمن… | جارٍ التحققّ من الرابط الآمن… |
| X-3 | ar.json | `secureLink.status.send` | إرسال رمز التحقق | إرسال رمز التحققّ |
| X-3 | ar.json | `secureLink.status.code` | رمز التحقق | رمز التحققّ |
| X-3 | ar.json | `secureLink.status.verify` | تحقق وتابع | تحققّ وتابع |
| X-3 | ar.json | `secureLink.status.verifying` | جارٍ التحقق… | جارٍ التحققّ… |
| X-3 | ar.json | `secureLink.status.private` | لا تظهر معلوماتك الطبية إلا بعد التحقق من جهة الاتصال. | لا تظهر معلوماتك الطبية إلا بعد التحققّ من جهة الاتصال. |
| X-3 | ar.json | `secureLink.status.error` | تعذر إكمال الطلب. يرجى المحاولة مرة أخرى. | تعذّر إكمال الطلب. حاول مرة أخرى. |
| X-3 | ar.json | `secureLink.status.missing` | يرجى تقديم هذه المعلومة. | أضف هذه المعلومة. |
| X-3 | ar.json | `secureLink.status.missingFile` | يرجى رفع المستند المطلوب. | ارفع المستند المطلوب. |
| X-3 | ar.json | `secureLink.status.proposalUnavailable` | لم يعد عرض السعر هذا متاحًا للمراجعة. يرجى التحديث للاطلاع على آخر حالة. | لم يعد عرض السعر هذا متاحًا للمراجعة. حدّث الصفحة للاطلاع على آخر حالة. |
| X-3 | ar.json | `secureLink.status.tooManyCodes` | طُلبت عدة رموز لهذا الرابط خلال الساعة الماضية. يرجى المحاولة بعد ساعة. | طُلبت عدة رموز لهذا الرابط خلال الساعة الماضية. حاول مرة أخرى بعد ساعة. |
| X-3 | ar.json | `secureLink.status.noteMissing` | يرجى كتابة رسالتك قبل الإرسال. | اكتب رسالتك قبل الإرسال. |
| X-3 | ar.json | `secureLink.proposal.verifying` | جارٍ التحقق… | جارٍ التحققّ… |
| X-3 | ar.json | `secureLink.proposal.error` | تعذر إكمال الطلب. | تعذّر إكمال الطلب. |
| X-3 | ar.json | `secureLink.proposal.tooMany` | طلبات كثيرة جدًا. يُرجى المحاولة لاحقًا. | طلبات كثيرة جدًا. حاول مرة أخرى لاحقًا. |
| X-3 | ar.json | `secureLink.proposal.ackRequired` | يرجى تأكيد فهمك قبل المتابعة. | أكّد فهمك قبل المتابعة. |
| X-3 | ar.json | `secureLink.activation.verifyTitle` | لنتأكد أنه أنت | لنتحققّ من هويتك |
| X-3 | ar.json | `secureLink.activation.verifying` | جارٍ التحقق… | جارٍ التحققّ… |
| X-3 | ar.json | `secureLink.activation.formIntro` | أدخلنا مسبقًا ما شاركته معنا. يرجى مراجعته وإكمال الناقص فقط. | أدخلنا مسبقًا ما شاركته معنا. راجعه وأكمل الناقص فقط. |
| X-3 | ar.json | `secureLink.activation.accountEmailHelp` | ستستخدم هذا البريد لتسجيل الدخول. سنتحقق منه قبل أن يصبح حسابك. | ستستخدم هذا البريد لتسجيل الدخول. سنتحققّ منه قبل أن يصبح حسابك. |
| X-3 | ar.json | `secureLink.activation.steps[0]` | التحقق | التحققّ |
| X-3 | ar.json | `secureLink.activation.invalid` | هذا الرابط غير صالح أو انتهت صلاحيته. يرجى طلب رابط جديد من منسّقك. | هذا الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من منسّقك. |
| X-3 | ar.json | `secureLink.activation.error` | حدث خطأ ما. يرجى المحاولة مرة أخرى. | تعذّر إكمال هذه الخطوة. حاول مرة أخرى، وإن تكرّر ذلك فراسل منسّقك. |
| X-3 | ar.json | `secureLink.activation.tooMany` | محاولات كثيرة. يرجى المحاولة بعد قليل. | محاولات كثيرة. حاول مرة أخرى بعد قليل. |
| X-3 | ar.json | `secureLink.activation.errConsents` | يرجى قبول جميع الموافقات المطلوبة للمتابعة. | اقبل جميع الموافقات المطلوبة للمتابعة. |
| X-3 | ar.json | `secureLink.journey.explain.received.next` | سيتحقق المنسّق مما أرسلته ويخبرك إن كان ينقص شيء. | سيتحققّ المنسّق مما أرسلته ويخبرك إن كان ينقص شيء. |
| X-3 | ar.json | `secureLink.journey.explain.deposit.body` | إن لم تدفعها بعد، سجّل الدخول إلى «رعايتي» لتدفعها بتحويل بنكي أو عبر وكيل، وأدخل الرقم المرجعي الذي تحصل عليه. وإن كنت أرسلت الرقم المرجعي، فإن الفريق المالي يتحقق منه. | إن لم تدفعها بعد، سجّل الدخول إلى «رعايتي» لتدفعها بتحويل بنكي أو عبر وكيل، وأدخل الرقم المرجعي الذي تحصل عليه. وإن كنت أرسلت الرقم المرجعي، فإن الفريق المالي يتحققّ منه. |
| X-3 | en.json | `portalWork.depositTransfer.amountInvalidMax` (new) | — | Enter the amount received in figures, above zero and no more than the balance of {amount}. |
| X-3 | en.json | `portalWork.admission.forms.paidAmountInvalid` (new) | — | Enter the amount paid in that currency in figures, above zero, for example 4,000. |
| X-3 | en.json | `portalWork.discharge.invoice.amountInvalid` (new) | — | Enter the total in figures, zero or more, for example 195,500. |
| X-3 | en.json | `secureLink.activation.error` | Something went wrong. Please try again. | This step could not be completed. Try again, and if it keeps happening, message your coordinator. |
| X-3 | messages_ar.properties (login) | `rememberMe` | إبقائي مسجّلًا على هذا الجهاز | إبقاء تسجيل الدخول على هذا الجهاز |
| X-3 | messages_ar.properties (login) | `doContactCoordinator` | تحدث مع منسّق | تحدّث مع منسّق |
| X-3 | messages_ar.properties (login) | `differentUserAuthenticated` | أنت مسجّل الدخول بالفعل إلى رحلة شفاء باسم ⁨{0}⁩ في هذا المتصفح. سجّل الخروج أولًا، ثم افتح هذا الرابط مجددًا. | في هذا المتصفح جلسة رحلة شفاء مفتوحة باسم ⁨{0}⁩. سجّل الخروج أولًا، ثم افتح هذا الرابط مجددًا. |

### X-2 notes for the reviewer (one term per concept)

- Proof: `node scripts/arabic-terms.mjs` counts each glossary row over `ar.json`, both Keycloak Arabic bundles and the Arabic
  hard-coded in `frontend/src` (minus tests), and fails when a replaced variant comes back. At X-2: deposit 71 strings, Finance (team)
  67, commercial terms 6, coordinator 226, estimate 124, priced proposal 115; no replaced variant.
- Kept on purpose (another concept): «المالية» as a role, queue or thread label (`roles.FINANCE`, `threads.COORDINATOR_FINANCE`,
  `actions.ASSIGN_FINANCE`) and as the adjective (المصلحة المالية، السجلات المالية); «مقترح» = "suggested" in referrals; «عرض» the verb
  (show, view, display name) and the Consultant's assignment *offer* (`ASSIGNMENT_OFFER_EXPIRED`, `pendingOffers`).
- The proposal rule applied: a stage-specific estimate string says «التقدير» (staff "Prepare/Release the proposal", the journey phase
  "Your proposal", "We are preparing your proposal"); a string shown for either document says «عرض السعر» (the proposal page title,
  declined/expired, decline buttons, finance approval, terms call); a final-quote string says «عرض السعر النهائي». So the English
  "Your proposal" reads «تقديرك» on the journey phase and «عرض السعر» on the document card: deliberate, confirm or overturn.
- Verbs: «سدّد دفعة التنسيق» / «تُسدَّد» rather than «ادفع دفعة» (root repeated). Finance agreement moved to the masculine
  («يراجعه الفريق المالي» for «تراجعه المالية»).
- **Legal (with native):** four acceptance/deposit sentences were brought back to the English meaning, not only re-termed —
  `secureLink.proposal.ackShortFinal` (was «أفهم أن قبول هذا العرض اتفاق مالي», which said something the English does not),
  `payNowNote`, `nextPrelim[2]`, `ackStatement` («أقرّره» read as "ratify"). They stay on the legal list (backlog 506/576).
- Keycloak (backlog 779/783/797): both Arabic bundles already used the glossary («منسّق» with shadda; no deposit, Finance or
  proposal terms); no string changed. The NFC wording, the password-rule ranges and «يو إس بي» remain for the native reviewer.
- Not in this pass: the backend's own Arabic (WhatsApp templates in `NotificationOutboxProcessor`, status and readiness labels in
  `PublicCaseAccessService`/`CustomerReadinessService`/`CaseActionService`, the activation consent text in
  `PatientActivationService`) still says «وديعة التنسيق», «فريق المالية», «العرض», «المقترح», «منسق» (backlog "Area X").

### X-3 notes for the reviewer (register, the native rows, close)

- **Register.** Every «يرجى/يُرجى» (31 in `ar.json`, 0 in Keycloak) became the imperative its neighbours use («أدخل…», «حاول مرة
  أخرى»، «راجعه وأكمل الناقص»); a label before a date became a noun («الرد مطلوب قبل»). English keeps its "Please" (not changed).
  Proof: 0 «يرجى/يُرجى/الرجاء/نرجو» in `ar.json` and both bundles; 0 rendered on /ar, /ar/how-it-works, /ar/send-my-case, /ar/track-case.
- **Neutral where cheap.** Masculine adjectives about the reader → impersonal phrasing (public «لست متأكدًا» ×7 sites, «متى ما كنت
  مستعدًا»; My Care «أنت جاهز/تصبح جاهزًا» ×4; activation «لنتأكد أنه أنت»; staff «تبقى قادراً»; Keycloak `rememberMe`,
  `differentUserAuthenticated`). Not changed: masculine imperatives and present verbs (the UI convention, see the Address decision);
  the consent `REPRESENTATIVE_AUTHORIZATION` («مفوّض») and `form.errors.representative` («قرابته») — consent text is versioned and
  legal, the second is the generic form.
- **Backlog rows.** 429/465/588 register: done as above, masculine imperative carried here. 454: `PROPOSAL_TERMS_CALL.context` no
  longer says «معه… قراره». 434: date filters «أُنشئت/حُدّثت منذ/حتى» (were «من/إلى», which read as a source, not a lower bound).
  731: `feeDerivation` is now prose («رسوم المنصة {fee}، غطّت منها دفعة التنسيق {applied}، فيبقى {balance}.»); the English keeps the
  equation. X-1's reused field messages: three keys of their own (`discharge.invoice.amountInvalid` zero allowed,
  `admission.forms.paidAmountInvalid` no EGP example, `depositTransfer.amountInvalidMax` names the balance), en + ar.
  Carried to this gate unchanged: 393, 506, 576 (legal), 779, 783, 797 (Keycloak wording), the staff voucher's «ج.م.», Latin initials.
- **Shadda.** The closing critique found «تحقق/تحقّق» (54/15) and «تعذر/تعذّر» (2/42) on the same screens; 92 sites in `ar.json`,
  Keycloak and the patient/portal components now carry the shadda (decision above). The Control Center keeps the plain spelling
  until its convergence (backlog "Area X").
- **Activation error.** `secureLink.activation.error` now says what to do if it repeats («…وإن تكرّر ذلك فراسل منسّقك»); the English
  was changed to match.
