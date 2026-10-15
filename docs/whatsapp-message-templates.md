# WhatsApp message templates (submission pack)

Every patient notification on WhatsApp is sent as an **approved Meta template**; the backend never sends free text
through the outbox (design slice S0, [design](patient-communication-whatsapp-design.md) §6). This page is what to
create in WhatsApp Manager for each business number, and what the backend binds them to.

**Arabic text is a draft and needs native review before submission.** English is the source; both languages are
created under the same template name.

## Rules that apply to every template

- **Category:** Utility, except `rs_code` (Authentication). No promotional wording, or Meta re-categorises the
  template as Marketing.
- **URL button:** type *Visit website*, dynamic URL `https://<site>/{{1}}`, where `<site>` is the environment's web
  domain (production `APP_DOMAIN`; dev `dev.rehletshifaa.com`). The backend fills `{{1}}` with
  `<lang>/<route>/<token>`, so a secure token never appears in a message body.
- **Languages:** `en` and `ar` (`app.whatsapp.meta.languages`).
- Button text ≤ 25 characters; bodies do not start or end with a variable.

## Bound now (S0, S3–S5)

| Template | Outbox key | Button (en / ar) → route |
|---|---|---|
| `rs_case_received` | `case-status-link` | View case status / متابعة حالة الطلب → `status` |
| `rs_secure_message` | `secure-message` | Open message / فتح الرسالة → `status` |
| `rs_patient_action` | `patient-action-link` | Respond securely / الرد بأمان → `status` |
| `rs_patient_action_reminder` | `patient-action-reminder` | Respond securely / الرد بأمان → `status` (P1-6: day 2 and day 5 of an unanswered request) |
| `rs_information_request_closed` | `information-request-closed` | none (P1-6: the case closed after 30 days without an answer) |
| `rs_proposal_ready` | `proposal-ready` | Review proposal / مراجعة المقترح → `proposal` |
| `rs_final_quote_ready` | `final-quote-ready` | Review final quote / مراجعة العرض النهائي → `proposal` |
| `rs_onboarding` | `onboarding-activation` | Complete my profile / إكمال ملفي → `activate` |
| `rs_deposit_settled` | `deposit-settled-patient` | none |
| `rs_deposit_payment_due` | `deposit-payment-due` | Pay deposit / دفع الوديعة → portal (suffix `<lang>/portal?case=<case id>`; sign-in required, no token) |
| `rs_deposit_payment_reminder` | `deposit-payment-reminder` | Pay deposit / دفع الوديعة → portal (as above) |
| `rs_deposit_transfer_rejected` | `deposit-transfer-rejected` | Check my payment / مراجعة دفعتي → portal (as above) |
| `rs_deposit_balance_due` | `deposit-balance-due` | Pay the balance / دفع المتبقي → portal (as above) |
| `rs_document_cleared` | `document-cleared` | See my documents / عرض مستنداتي → portal (as above). **New, to be created and approved in WhatsApp Manager**; until it exists Meta refuses the send and the outbox retries it into a dead letter (email to patients without WhatsApp still works) |
| `rs_admission_voucher` | `admission-balance-due` | See what to pay / ما عليّ دفعه → portal (as above). **New (P1-15), to be created and approved in WhatsApp Manager** |
| `rs_cleared_for_admission` | `cleared-for-admission` | My admission / دخولي إلى المستشفى → portal (as above). **New (P1-15), to be created and approved in WhatsApp Manager** |
| `rs_decision_recorded` | `proposal-decision-recorded` | none (3 body variables) |
| `rs_followup_window_closed` | `intake-followup` | none |
| `rs_coordinator_intro` | `coordinator-intro` | none (1 body variable: the coordinator's name) |
| `rs_out_of_hours` | `out-of-hours` | none |
| `rs_code` (Authentication) | `case-access-code`, `proposal-access-code` | Copy code (Meta preset); set `WHATSAPP_META_AUTH_TEMPLATE` |

Each binding can be renamed with `WHATSAPP_TEMPLATE_*` environment variables (see `application.yml`).

### Bodies

**`rs_case_received`**
- en: Your RehletShifaa case has been received. You can check its status securely using the button below.
- ar: تم استلام حالتك لدى رحلة شفاء. يمكنك متابعة حالة طلبك بأمان عبر الزر أدناه.

**`rs_secure_message`**
- en: You have a new secure message about your RehletShifaa case. Open it securely using the button below.
- ar: لديك رسالة آمنة جديدة بخصوص حالتك لدى رحلة شفاء. افتحها بأمان عبر الزر أدناه.

**`rs_patient_action`**
- en: Your RehletShifaa coordinator needs some information from you. Please respond securely using the button below.
- ar: يحتاج منسّقك في رحلة شفاء إلى بعض المعلومات منك. يُرجى الرد بأمان عبر الزر أدناه.

**`rs_proposal_ready`**
- en: Your RehletShifaa treatment proposal is ready. Open it securely using the button below; you will confirm a one-time code before anything is shown.
- ar: مقترح العلاج الخاص بك من رحلة شفاء جاهز. افتحه بأمان عبر الزر أدناه، وستؤكد رمزاً لمرة واحدة قبل عرض أي تفاصيل.

**`rs_final_quote_ready`**
- en: Your RehletShifaa final quote is ready. Open it securely using the button below; you will confirm a one-time code before anything is shown.
- ar: العرض النهائي الخاص بك من رحلة شفاء جاهز. افتحه بأمان عبر الزر أدناه، وستؤكد رمزاً لمرة واحدة قبل عرض أي تفاصيل.

**`rs_onboarding`**
- en: Your treatment proposal has been accepted. Complete your RehletShifaa profile securely using the button below; you will confirm a one-time code first.
- ar: تم قبول مقترح العلاج الخاص بك. أكمل ملفك في رحلة شفاء بأمان عبر الزر أدناه، وستؤكد رمزاً لمرة واحدة أولاً.

**`rs_deposit_settled`**
- en: We have received your coordination deposit. Your RehletShifaa coordinator is starting the next stage of your treatment journey and will contact you shortly.
- ar: استلمنا دفعة التنسيق الخاصة بك. يبدأ منسّقك في رحلة شفاء المرحلة التالية من رحلتك العلاجية وسيتواصل معك قريباً.

**`rs_deposit_payment_due`** (DEP-3: the profile is done; also the coordinator's "Send payment link")
- en: Your profile is complete. Pay your coordination deposit by bank transfer, then enter the transaction reference your bank gives you on your case page using the button below.
- ar: اكتمل ملفك. ادفع وديعة التنسيق بتحويل بنكي، ثم أدخل الرقم المرجعي للعملية الذي يعطيك إياه البنك في صفحة حالتك عبر الزر أدناه.

**`rs_deposit_payment_reminder`** (DEP-3: daily, days 1–3, until the patient enters the reference)
- en: We have not received the reference for your coordination deposit transfer yet. Once you have paid by bank transfer, enter the transaction reference on your case page using the button below.
- ar: لم يصلنا بعد الرقم المرجعي لتحويل وديعة التنسيق. بعد إتمام التحويل البنكي، أدخل الرقم المرجعي للعملية في صفحة حالتك عبر الزر أدناه.

**`rs_deposit_transfer_rejected`** (DEP-3: Finance could not confirm the reference)
- en: Our finance team could not confirm the transfer reference you sent. Please check the details on your case page and enter the reference again using the button below.
- ar: لم يتمكن فريق المالية من تأكيد الرقم المرجعي الذي أرسلته. راجِع التفاصيل في صفحة حالتك وأدخل الرقم المرجعي مرة أخرى عبر الزر أدناه.

**`rs_deposit_balance_due`** (DEP-3: part of the deposit received)
- en: We received part of your coordination deposit. The remaining amount is on your case page: pay it by bank transfer and enter the new transaction reference there using the button below.
- ar: استلمنا جزءًا من وديعة التنسيق. المبلغ المتبقي موضّح في صفحة حالتك: ادفعه بتحويل بنكي وأدخل الرقم المرجعي الجديد للعملية هناك عبر الزر أدناه.

**`rs_document_cleared`** (a file uploaded while the virus check was down passed it later, in the sweep; no file name in the message)
- en: A file you sent us could not be checked for viruses at the time. It has now passed the check and is on your case. See it on your case page using the button below.
- ar: تعذّر فحص ملف أرسلته إلينا من الفيروسات في حينه. وقد اجتاز الفحص الآن وأصبح ضمن حالتك. اطّلع عليه في صفحة حالتك عبر الزر أدناه.

**`rs_admission_voucher`** (P1-15, D-B: the platform issued the hospital its admission voucher; the patient pays the balance at the hospital cashier)
- en: Your hospital has your admission voucher. Pay the balance at the hospital cashier before admission: the amount and your voucher number are on your case page, using the button below.
- ar: تسلّم المستشفى قسيمة دخولك. ادفع الرصيد المتبقي في خزينة المستشفى قبل الدخول: المبلغ ورقم القسيمة في صفحة حالتك عبر الزر أدناه.

**`rs_cleared_for_admission`** (P1-15, D-C/D-D: the balance is evidenced and the case entered ADMISSION_READY)
- en: Your payment is confirmed and you are cleared for admission. Your admission details are on your case page, using the button below.
- ar: تأكّد سدادك وأصبحت جاهزًا للدخول إلى المستشفى. تفاصيل دخولك في صفحة حالتك عبر الزر أدناه.

**`rs_followup_window_closed`** (S3: sent once after WhatsApp's 24-hour window has closed)
- en: Your RehletShifaa coordinator has an update for you. Reply to this message to continue the conversation.
- ar: لدى منسّقك في رحلة شفاء تحديث لك. ردّ على هذه الرسالة لمتابعة المحادثة.

**`rs_coordinator_intro`** (S4: the case went to a different coordinator than the one on WhatsApp) — `{{1}}` the coordinator's name
- en: Hello, {{1}} from RehletShifaa will be your coordinator from now on and will continue your conversation here.
- ar: مرحباً، سيكون {{1}} من رحلة شفاء منسّقك من الآن وسيتابع محادثتك هنا.
- Sample value for review: `Omar Ali` / `عمر علي`.

**`rs_patient_action_reminder`** (P1-6: an information request still unanswered on day 2 and day 5; each carries a fresh link, the earlier one is revoked)
- en: Your RehletShifaa coordinator is still waiting for the information they asked for, so your case can continue. Please respond securely using the button below.
- ar: ما زال منسّقك في رحلة شفاء بانتظار المعلومات التي طلبها لمتابعة حالتك. يُرجى الرد بأمان عبر الزر أدناه.

**`rs_information_request_closed`** (P1-6: the case was cancelled after 30 days without an answer)
- en: We closed your RehletShifaa case because we did not hear back about the information your coordinator asked for. If you still need care, reply to this message or send your case again.
- ar: أغلقنا حالتك في رحلة شفاء لأننا لم نتلقَّ ردّك على المعلومات التي طلبها منسّقك. إن كنت ما زلت بحاجة إلى العلاج، فردّ على هذه الرسالة أو أرسل حالتك من جديد.

**`rs_out_of_hours`** (S5: first message in a closed period from someone without a case; once per closed period)
- en: Thank you for contacting RehletShifaa. Our coordinators are available Saturday to Thursday, 10:00–20:00 Cairo time, and will reply when we open.
- ar: شكراً لتواصلك مع رحلة شفاء. منسّقونا متاحون من السبت إلى الخميس، من 10:00 إلى 20:00 بتوقيت القاهرة، وسيردّون عليك عند بدء العمل.
- The hours are written into the template: change the template if the team's hours change.

**`rs_decision_recorded`** — `{{1}}` the decision in words, `{{2}}` who was spoken to, `{{3}}` the date
(all filled by the backend in the template's language)
- en: Your coordinator recorded your decision on your RehletShifaa proposal ({{1}}) after speaking with {{2}} on {{3}}. If this is not what was agreed, please contact your coordinator.
- ar: سُجّل قرارك بشأن مقترح رحلة شفاء ({{1}}) بعد التحدث {{2}} في {{3}}. إن لم يكن هذا ما اتُّفق عليه، يُرجى التواصل مع منسّقك.
- Sample values for review: en `you accepted the final quote` / `you` / `8 October 2026`;
  ar `قبول العرض النهائي` / `معك` / `8 أكتوبر 2026`.
