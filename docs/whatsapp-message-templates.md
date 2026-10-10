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

## Bound now (S0, S3, S4)

| Template | Outbox key | Button (en / ar) → route |
|---|---|---|
| `rs_case_received` | `case-status-link` | View case status / متابعة حالة الطلب → `status` |
| `rs_secure_message` | `secure-message` | Open message / فتح الرسالة → `status` |
| `rs_patient_action` | `patient-action-link` | Respond securely / الرد بأمان → `status` |
| `rs_proposal_ready` | `proposal-ready` | Review proposal / مراجعة المقترح → `proposal` |
| `rs_final_quote_ready` | `final-quote-ready` | Review final quote / مراجعة العرض النهائي → `proposal` |
| `rs_onboarding` | `onboarding-activation` | Complete my profile / إكمال ملفي → `activate` |
| `rs_deposit_settled` | `deposit-settled-patient` | none |
| `rs_decision_recorded` | `proposal-decision-recorded` | none (3 body variables) |
| `rs_followup_window_closed` | `intake-followup` | none |
| `rs_coordinator_intro` | `coordinator-intro` | none (1 body variable: the coordinator's name) |
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

**`rs_followup_window_closed`** (S3: sent once after WhatsApp's 24-hour window has closed)
- en: Your RehletShifaa coordinator has an update for you. Reply to this message to continue the conversation.
- ar: لدى منسّقك في رحلة شفاء تحديث لك. ردّ على هذه الرسالة لمتابعة المحادثة.

**`rs_coordinator_intro`** (S4: the case went to a different coordinator than the one on WhatsApp) — `{{1}}` the coordinator's name
- en: Hello, {{1}} from RehletShifaa will be your coordinator from now on and will continue your conversation here.
- ar: مرحباً، سيكون {{1}} من رحلة شفاء منسّقك من الآن وسيتابع محادثتك هنا.
- Sample value for review: `Omar Ali` / `عمر علي`.

**`rs_decision_recorded`** — `{{1}}` the decision in words, `{{2}}` who was spoken to, `{{3}}` the date
(all filled by the backend in the template's language)
- en: Your coordinator recorded your decision on your RehletShifaa proposal ({{1}}) after speaking with {{2}} on {{3}}. If this is not what was agreed, please contact your coordinator.
- ar: سُجّل قرارك بشأن مقترح رحلة شفاء ({{1}}) بعد التحدث {{2}} في {{3}}. إن لم يكن هذا ما اتُّفق عليه، يُرجى التواصل مع منسّقك.
- Sample values for review: en `you accepted the final quote` / `you` / `8 October 2026`;
  ar `قبول العرض النهائي` / `معك` / `8 أكتوبر 2026`.

## Later slices (drafts, not bound yet)

| Template | Slice | en |
|---|---|---|
| `rs_out_of_hours` | S5 | Thank you for contacting RehletShifaa. Our coordinators are available Saturday to Thursday, 10:00–20:00 Cairo time, and will reply when we open. |

Arabic for these is written when the slice starts, with the same native review.
