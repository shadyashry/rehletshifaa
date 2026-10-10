# WhatsApp Business Platform rules and mechanics for one shared number, many coordinators, one owner per patient conversation

Research date: 2026-10-10. Every rule below is dated where the source dates it. Meta moved its developer docs from `developers.facebook.com/docs/whatsapp/...` to `developers.facebook.com/documentation/business-messaging/whatsapp/...` during 2026. Both paths are cited, and some old-path pages now return 404. WhatsApp's business site moved from business.whatsapp.com to whatsappbusiness.com (301 redirect).

## Q1. Can several coordinators use one number on the WhatsApp Business app at the same time? How many linked devices? Is there any assignment or locking? How does Meta Business Suite compare? Which Meta product line covers what?

### Takeaway
The free WhatsApp Business app allows 1 phone plus up to 4 linked companion devices on one number. All devices see and can reply to every chat, and the app has no chat assignment, lock or "who is handling this" indicator, so it cannot stop two coordinators replying to the same patient. The On-Premises API was sunset on 23 Oct 2025, so the Cloud API, reached directly or through a BSP, is now the only API route. Only an API integration lets a backend decide who may reply.

### Cited Findings
**Product lines**
- The On-Premises API was officially sunset on **23 Oct 2025** and is no longer available. Its final client version, v2.61.1, has been marked SUNSET since that date. After the On-Premises v2.53 release in Jan 2024, all new features shipped only to Cloud API. — [Meta On-Premises sunset](https://developers.facebook.com/docs/whatsapp/on-premises/sunset); [On-Prem changelog](https://developers.facebook.com/docs/whatsapp/on-premises/changelog)
- A BSP notice says that after 23 Oct 2025, messages sent from or to businesses via the On-Premises API are no longer delivered. — [360dialog partner update](https://wa.360dialog.com/partner-updates/january-whatsapp-business-platform-updates)
- Meta says Cloud API offers up to 1,000 messages per second, about 4x On-Premises. — [Meta On-Premises sunset](https://developers.facebook.com/docs/whatsapp/on-premises/sunset)

**Business app linked devices**
- The WhatsApp Business FAQ says a business can use "up to four linked devices and one phone at a time": Web, Desktop, companion phones, Android tablets, Portal and others. (This quote comes from a search-result snippet. The FAQ pages would not render through the fetch tool.) — [WhatsApp FAQ: About linked devices on the WhatsApp Business app](https://faq.whatsapp.com/647349420360876); [WhatsApp Blog: one account across multiple phones](https://blog.whatsapp.com/one-whatsapp-account-now-across-multiple-phones)
- The FAQs disagree on inactivity rules. One says linked devices disconnect after 30 days of inactivity. Another says they log out if the primary phone is unused for more than 14 days. — [WhatsApp FAQ: How to link a device](https://faq.whatsapp.com/1317564962315842/?cms_platform=android). Meta's coexistence doc gives figures that match both: the primary device disconnects after about 14 days of inactivity and a companion after about 30 days. — [Meta: Onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- The free app cannot assign chats, add internal notes or show who is already handling a conversation. These claims come from vendor sources, which have a commercial interest, but they consistently agree. — [Chakra: Team Inbox vs Business App](https://chakrahq.com/article/whatsapp-team-inbox-vs-business-app/); [TimelinesAI](https://timelines.ai/whatsapp-business-multiple-users); [Wati](https://www.wati.io/en/blog/whatsapp-business-multiple-devices/)
- A paid "Premium" tier, and the newer "Meta One" plans now in limited testing, are said to add more devices and possibly chat assignment. Sources conflict on the device limit (4 vs 10) and on regional availability. A WhatsApp FAQ says Meta One's Essential plan lets you connect "multiple devices" and that it is in limited testing, not available everywhere. — [WhatsApp FAQ: About Meta One plans](https://faq.whatsapp.com/975910528178219); [TimelinesAI](https://timelines.ai/whatsapp-business-multiple-users)
- Meta Business Suite Inbox: a Meta developer case study says integrating WhatsApp into the MBS Inbox gives an omnichannel inbox in which "multiple team members" manage WhatsApp, Messenger and IG messages, and conversations can be routed to individual team members. — [Meta success story: OLB Impresiones](https://developers.facebook.com/success-stories/OLB-Impresiones/)

**Policy constraint on the Business app (important for a health business)**
- The WhatsApp Business Messaging Policy, last updated **23 Sep 2026**, says: "You are prohibited from messaging about any Regulated Verticals on the WhatsApp Business App." Regulated Verticals include "Medical and healthcare products" and drugs. The limited exceptions (OTC drugs, gambling, alcohol) apply only to the Business Platform. — [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)

### Inferences
- Any coordinator on any of the up to 5 devices can reply to any chat on the Business app. The app gives no ownership semantics, so "one owner per patient" cannot be enforced there. Business Suite assignment and the Premium/Meta One plans are soft routing aids, not an enforced reply lock tied to your own case model.
- The only way to enforce "only the case owner may reply" is to put all sends through your own backend on the Cloud API. Coordinators then never hold a WhatsApp client for that number, or they hold only a supervised one under coexistence (see Q4).
- Under the Business app's Regulated Verticals clause, a care-coordination business on the Business app risks breaching policy if conversations stray into medical or healthcare products. This is another reason to prefer the Platform.

### Gaps
- I could not read the full text of the WhatsApp Help Center pages (they render client-side), so I could not confirm the exact current device cap for Premium or Meta One, or whether either has a true assignment lock.
- I found no official Meta help article describing the exact assignment UI or permissions in the Business Suite Inbox for WhatsApp, or whether assignment there blocks other agents from replying. The case study suggests routing, not locking.

## Q2. How does the Cloud API let a backend receive each inbound message and send replies, so the backend can enforce "only the case owner can reply"?

### Takeaway
Every inbound message arrives at your HTTPS webhook as a `whatsapp_business_account` object with `field: "messages"`. It carries the business number (`phone_number_id`), the sender (`contacts[].wa_id` plus profile name, and since about Mar/Apr 2026 a business-scoped `user_id`/BSUID) and a `messages[]` entry with a `wamid` id and a `type`. Replies are `POST /{phone-number-id}/messages`, which only your server can call with its token. The backend is therefore the single choke point that can check case ownership before sending.

### Cited Findings
- Webhook shape: `object: "whatsapp_business_account"`, then `entry[].changes[]` with `field: "messages"`. The `value` holds `messaging_product`, `metadata.display_phone_number` and `metadata.phone_number_id`, `contacts[]` (`profile.name`, `wa_id`) and `messages[]` (`from`, `id` prefixed "wamid.", `timestamp`, `type`, plus a type-specific object such as `text.body`). An `unsupported` type signals an inbound error. — [Meta webhook payload examples](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples)
- Outbound delivery status uses the same webhook field with a `statuses[]` array (`id`, `status`, `timestamp`, `recipient_id`, `conversation`, and `pricing` with `billable`, `pricing_model` and `category`). There are up to three status webhooks per message: sent, delivered, read. Errors also arrive in `statuses`. — [Meta webhook payload examples](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples)
- Send endpoint: `POST /<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/messages` with `messaging_product: "whatsapp"`, `recipient_type` (`individual` or `group`), `to`, `type` and a content object. The API response confirms acceptance only. Delivery is reported through webhooks. Contextual replies, which quote a prior message, are supported. — [Meta: Send messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)
- Service message types allowed inside the window: text, image, audio, video, document, sticker, location, contacts, address, reaction and interactive (reply buttons, lists, CTA URL, Flows, location request). — [Meta: Send messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)
- **Business-scoped user IDs (BSUID), 2026.** Meta added a `user_id` field (BSUID) to all `messages` webhooks whether or not the user enabled usernames. Its format is the ISO country code, a period, then up to 128 alphanumerics, e.g. `US.13491208655302741918`. It is scoped to the business portfolio, so sending from a number owned by another portfolio fails. It is regenerated if the user changes phone number, which triggers a system webhook. There is an optional `username`, and a user who adopts a username shows that instead of a phone number. Start dates differ across sources: 31 Mar 2026 vs "early April 2026". — [Meta: Business-scoped user IDs](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids); [YCloud BSUID reference](https://docs.ycloud.com/reference/bsuid); [ChatArchitect mirror of Meta doc](https://support.chatarchitect.com/books/meta-whatsapp/page/business-scoped-user-ids-developer-documentation)
- **Read receipts and typing indicator.** You mark an inbound message as read with `status: "read"` and its `message_id` (wamid). Adding `typing_indicator: {type: "text"}` shows "typing…" until the reply is delivered or 25 seconds pass, whichever is first. Marking one message read also marks earlier messages in the thread read. Read status applies only to incoming messages. (Sources are BSP docs that mirror Meta's API. I could not fetch Meta's own page; the old URL returns 404.) — [360dialog message statuses](https://docs.360dialog.com/partner/messaging-and-calling/messaging-health-and-troubleshooting/messages-statuses); [Twilio typing indicators](https://www.twilio.com/docs/whatsapp/api/typing-indicators-resource); [YCloud typing indicator](https://docs.ycloud.com/reference/whatsapp_inbound_message-typing-indicator)
- Under coexistence, messages the business sends from the Business app or a supported companion trigger `smb_message_echoes` webhooks so the backend can mirror them. Messages from unsupported companions (WhatsApp for Windows, WearOS) trigger no webhooks and cannot be mirrored. — [Meta: Onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)

### Inferences
- Routing key: use `metadata.phone_number_id` for the business number and `user_id` (BSUID) as the stable patient key, with `wa_id` as a secondary key. `wa_id`/phone may be absent for username users, and BSUID changes when the patient changes number, so the system-status webhook must re-link the case.
- The ownership rule is enforced by policy in the backend: inbound goes to the case thread, the case owner's UI is the only one with a send action, and the server checks `case.owner == caller` before calling `/messages`. WhatsApp has no native per-agent identity. The patient sees one business sender whoever typed the message.
- Showing a typing indicator or read receipt is also a send-side action, so it should be limited to the case owner too. Otherwise a non-owner opening the thread would mark it read for the patient.
- Under coexistence, `smb_message_echoes` lets the backend *detect* (not prevent) replies sent from the phone app. That is useful for auditing ownership violations.

### Gaps
- I did not fetch Meta's current webhook reference for the `referral` object on Click-to-WhatsApp inbound messages (fields like `source_url`, `source_id`, `ctwa_clid`), or for the `context` object in reply payloads. Verify field names on Meta's current webhook reference before implementing.
- I could not confirm the exact date BSUID became mandatory or default in webhooks, nor the global rollout date of usernames. A third-party planning note mentions an August 2026 global rollout, which is unofficial.

## Q3. What are the 24-hour window rules, and how do they affect coordinator replies after a patient goes silent?

### Takeaway
A 24-hour customer service window opens or resets with every patient message (or call). Inside it, coordinators can send any free-form message. After it expires, only approved templates (marketing, utility or authentication) can be sent until the patient writes again. Separately, a 72-hour free entry point window applies when the patient arrived via a Click-to-WhatsApp ad or a Facebook Page CTA on mobile.

### Cited Findings
- "24-hour customer service window, which opens and resets with each user message." "You may only initiate conversations using an approved Message Template." "Outside the 24-hour customer service window, you may only send messages via approved Message Templates." — [WhatsApp Business Messaging Policy (updated 23 Sep 2026)](https://whatsappbusiness.com/policy/)
- The window starts when the user messages *or calls* the business and resets if they message or call again. Inside it, any service message type is allowed without pre-approval. "When the window closes, you can only send pre-approved template messages." You may only message users who opted in. — [Meta: Send messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)
- Automation is allowed in the window, but the business must provide "prompt, clear, direct escalation paths", such as an in-chat human-agent transfer, phone, email or web support. — [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)
- Free entry point (FEP) window: if a user messages via a Click-to-WhatsApp ad or Facebook Page CTA on Android or iOS (desktop and web excluded) and you reply within 24 hours, the reply opens a 72-hour FEP window. "While open, you can send any type of message to the user at no charge." The customer service window still governs free-form messaging, so once it closes you can only send templates. — [Meta: Pricing (documentation path)](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- **Template categories** (Meta, current):
  - **Marketing**: awareness, sales, retargeting and relationship-building, plus mixed or unclear content.
  - **Utility**: must be "non-promotional" and follow up a user action or request, or be essential to the user. Listed examples are opt-in management, order management, account alerts (balance, payment reminders), feedback surveys tied to a specific interaction, and "continuing a conversation a user started on another channel".
  - **Authentication**: OTP only, using library templates with an OTP button and no URLs, media or emoji.
  Re-categorization rules: Meta can move utility to marketing with 1 day's notice, or instantly after misuse warnings. Repeated miscategorization escalates from rate limits of at least 7 days to 7/30-day suspension of utility templates to 30-day portfolio-wide restrictions. Templates go through PENDING, then APPROVED or REJECTED (e.g. `INCORRECT_CATEGORY`), and category appeals are possible within 60 days. — [Meta: Template categorization guidelines](https://developers.facebook.com/docs/whatsapp/updates-to-pricing/new-template-guidelines)
- "Service" is a *pricing* category for non-template replies in the window, not a template category. The template categories are marketing, utility and authentication. — [Meta: Pricing](https://developers.facebook.com/docs/whatsapp/pricing)

### Inferences
- If a patient goes silent for more than 24 hours, the case owner cannot send a free-form follow-up. The backend must offer only approved templates, for example a utility template "We have an update on your case; reply to continue" tied to the patient's own request. A patient reply then reopens the window. The UI should show a countdown to window expiry per case and switch the composer to template-only mode.
- Templates should be owned by the platform, not composed freely by coordinators. Keep them non-promotional and tied to the patient's request so they stay classed as utility; promotional wording gets them recategorized as marketing, which is priced higher.
- The window is per patient and business number, not per agent. Reassigning a case to another coordinator does not reset it.

### Gaps
- Meta's current docs do not say whether appointment or case-status reminders count as utility. They fit the "account/order update tied to a user request" pattern, but that is an inference.
- I did not confirm the exact error code returned when sending free-form outside the window. 131047 "Re-engagement message" is the commonly cited code, but the page I fetched does not state it.

## Q4. What does coexistence allow and not allow (history sync, groups, broadcast, which messages echo to the app), and is it available for Egyptian numbers?

### Takeaway
Coexistence lets a number keep running the WhatsApp Business app (primary phone plus up to 4 supported companions) while also connected to the Cloud API. 1:1 messages mirror both ways, and app-sent messages echo to the backend via `smb_message_echoes`. Groups are not synced, broadcast lists become read-only, several features are disabled, and throughput is fixed at 20 mps. Meta's current doc lists no excluded countries, and no source mentions Egypt either way, so Egypt availability is unconfirmed.

### Cited Findings (all from Meta's coexistence doc unless noted)
- It onboards an existing Business app number to Cloud API via Embedded Signup. "Messages sent and received are mirrored between the Cloud API and WhatsApp Business app" for 1:1 chats. — [Meta: Onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users); [old path](https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users)
- History sync covers 180 days (about 6 months) before onboarding, excluding groups. Media asset IDs are sent only for media from the 14 days after onboarding. History must be synced within 24 hours of onboarding or the business must offboard and redo it. Each sync type (contacts, history) can run only once per onboarding. Contacts sync via `smb_app_state_sync`, including later adds, edits and removals. — same
- App-sent messages produce `smb_message_echoes` webhooks. — same
- Not supported or disabled:
  - Group chats are not synchronized.
  - Broadcast lists are disabled: none can be created and existing ones become read-only.
  - Disappearing, view-once and live-location messages are disabled in 1:1 chats.
  - Calls, catalog, orders, status, quick replies, labels, away messages, business profile settings and Channels are not supported on the Cloud API side.
  - Message edit and revoke are newly supported for 1:1.
  — same
- Companion devices: up to 4, all supported except WhatsApp for Windows and WearOS. Onboarding unlinks all companions, which can then be relinked. Messages from unsupported companions do not trigger webhooks, and business messages viewed there show placeholder text. — same
- Throughput is fixed at **20 mps** for coexistence numbers. — same. A BSP (Wassenger) says 5 mps, which conflicts with Meta. — [Wassenger](https://wassenger.com/help/coexistence); [seven.io: 20 mps](https://help.seven.io/en/whatsapp/whatsapp-coexistence)
- Requirements: Business app v2.24.17 or later. Onboarding requires a Solution Partner or Tech Provider using Embedded Signup. **Embedded Signup v2 is deprecated on 15 Oct 2026**, so migrate to v4. — [Meta coexistence doc](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- Pricing: messages sent from the Business app stay free, and Cloud API messages follow Cloud API pricing. — same
- **Country availability conflict:**
  - Meta's current doc lists no unsupported countries.
  - An older 360dialog page excludes many markets (EU/EEA, UK, India, Japan, Nigeria, Philippines, Russia, South Korea, South Africa, Turkey, Australia…). — [360dialog](https://docs.360dialog.com/partner/waba-management/phone-number-and-hosting/using-whatsapp-app-and-cloud-api-simultaneously)
  - Other partners name only Nigeria and South Africa. — [ChatArchitect mirror](https://support.chatarchitect.com/books/meta-whatsapp/page/onboarding-whatsapp-business-app-users-aka-coexistence-developer-documentation); [Wassenger](https://wassenger.com/help/coexistence)
  - Chakra says coexistence is now global, including the EU, UK and Australia. — [Chakra](https://chakrahq.com/product/whatsapp/tools/whatsapp-coexistence-support)
  - No source mentions Egypt (+20).
- Local storage (data residency) is reportedly not supported for coexistence numbers. — [360dialog local storage](https://docs.360dialog.com/docs/hub/local-storage)

### Inferences
- Coexistence works *against* strict single-owner enforcement. Any person holding the primary phone or a companion can reply to any patient outside your backend's control. The backend only learns about it afterwards via `smb_message_echoes`. Replies from WhatsApp for Windows or WearOS are invisible to the backend entirely. If the ownership guarantee matters, run the number API-only, or keep the app on one supervised device used solely for audit or emergencies.
- Egypt is likely supported, since it appears on none of the exclusion lists found, but this must be confirmed with the chosen BSP during Embedded Signup.

### Gaps
- No official Meta country list for coexistence was found, and Egypt support is unconfirmed.
- I found no official statement on whether Cloud API–sent messages appear on companion devices other than as described above.

## Q5. What does messaging cost in Egypt now (per message, by category), and which windows are free?

### Takeaway
Since **1 Jul 2025** Meta bills per delivered template message by category and recipient country. Egypt was cut for utility/auth on 1 Oct 2025 and for marketing on 1 Jan 2026. Secondary sources give current Egypt list prices of marketing $0.0644, utility $0.0036, authentication $0.0036 and authentication-international $0.0650 (USD, excluding 14% VAT). A major change reportedly took effect **1 Oct 2026**: service (free-form) replies are billed after the first 1,000 per number per month, at the utility rate, and in-window utility templates are no longer free. That change is widely reported but did **not** appear in my fetch of Meta's pricing page, so verify it in WhatsApp Manager.

### Cited Findings
- "Effective July 1, 2025, Meta charges on a per-message basis." You are charged only when a template is delivered, by category (marketing, utility, authentication) and recipient calling code. Marketing conversation rates became marketing message rates. — [Meta: Pricing updates](https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing); [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- Egypt-specific history from Meta:
  - 1 Feb 2025: lower authentication rates.
  - 1 Apr 2025: lower authentication-international rates.
  - 1 Oct 2025: lower utility and authentication rates.
  - 1 Jan 2026: lower marketing rates.
  - No Egypt changes are listed for 1 Oct 2026.
  — [Meta: Pricing updates](https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing)
- Volume tiers apply only to utility and authentication. They are aggregated across a portfolio's WABAs per market and category and reset monthly, and messages in a free or service window don't count. A tiering webhook (`account_update`) was added on 1 Oct 2025. — [Meta: Pricing](https://developers.facebook.com/docs/whatsapp/pricing)
- Egypt rates, from secondary sources citing Meta's USD rate card:
  - Marketing $0.0644, utility $0.0036, authentication $0.0036, authentication-international $0.0650.
  - Service $0.0036 after 1,000 free per number per month.
  - Utility and auth tier discounts down to −25% ($0.0027).
  - Rates exclude 14% Egyptian VAT.
  — [ChatMaxima Egypt](https://chatmaxima.com/whatsapp-api-pricing/egypt/); same marketing and utility figures at [Whatsetter](https://www.whatsetter.com/tools/whatsapp-api-pricing-calculator); utility $0.0036 (about 20 piastres) at [ArabyBot](https://arabybot.com/guides/whatsapp-api-pricing-egypt?lang=en).
  - Conflicting higher figures (marketing $0.1073, utility $0.0073, auth $0.0130) appear to be the pre-2025/2026 rates. — [Ominiflow](https://ominiflow.com/whatsapp-api-pricing/egypt)
  - In EUR: marketing €0.0533, utility and auth €0.0030. — [wha.tools](https://wha.tools/whatsapp-api-pricing)
- **1 Oct 2026 service-message billing (conflicting evidence):**
  - Reported terms: service messages are charged per delivered message from 1 Oct 2026. Each business phone number gets 1,000 free delivered service messages per month; billing starts at the 1,001st, with no rollover. The rate equals the utility/auth rate for the market, with no volume discounts on service messages. Utility templates inside the window become billable and do not count toward the 1,000. Messages inside an active FEP window remain free. A payment method had to be added by 30 Sep 2026. — [respond.io](https://respond.io/blog/whatsapp-pricing-change-2026); [YCloud](https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-october-1-2026); [SendPulse](https://sendpulse.com/blog/whatsapp-service-message-pricing); [Techweez, 28 Sep 2026](https://techweez.com/2026/09/28/whatsapp-business-pricing-october-2026/)
  - A search-engine summary attributes the 1,000-free rule to Meta's pricing page ("as of 12am by Messaging account timezone on October 1, 2026"). However, **two direct fetches of Meta's pricing pages on 2026-10-10 returned text saying "non-template messages … are free" and "Utility templates delivered within an open customer service window are free"**, with no 1,000 tier. — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing). This may be a stale cache or rendering difference, but it is unresolved.
- WhatsApp's marketing page (pre-change wording) says Meta does "not charge for service messages, or for utility messages businesses send in response to users." — [WhatsApp Business platform pricing](https://whatsappbusiness.com/products/platform-pricing/)
- Free entry point: CTWA ads or FB Page CTA on mobile, reply within 24 hours, then 72 hours in which all messages are free, including templates. Meta Business Agent (AI) messages are still charged per secondary sources. — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing); [respond.io](https://respond.io/blog/whatsapp-pricing-change-2026)
- BSPs may add their own markup or platform fees on top of Meta rates. — [ChatMaxima Egypt](https://chatmaxima.com/whatsapp-api-pricing/egypt/)

### Inferences
- If the 1 Oct 2026 change holds, coordinator chatter has a marginal cost. For an Egyptian patient that is about $0.0036 per delivered reply after 1,000 per number per month. Ten coordinators sharing one number share one 1,000 allowance. Splitting replies into many short messages costs more than consolidated replies, which favours a composer that discourages message-splitting.
- Patients from other countries are billed at their own country's rate, since rates follow the recipient's calling code.

### Gaps
- I could not read Meta's official rate-card file directly, so the Egypt figures are from secondary sources that cite it.
- Meta's own page text on the 1 Oct 2026 service charge is unconfirmed (see the conflict above). Check the WhatsApp Manager billing view or the official rate card.

## Q6. Click-to-WhatsApp ads and wa.me links with prefilled text: can a prefilled text carry a case number?

### Takeaway
Yes. `https://wa.me/<number>?text=<url-encoded text>` opens a chat with editable prefilled text, which can contain a reference such as a case number. Meta's official QR codes and short links (`wa.me/message/<CODE>`) support up to 140 characters of prefilled text and hide the number. The patient can edit or delete the text before sending, so it should be treated as a hint, not as authentication.

### Cited Findings
- `wa.me` format: the phone number with country code, no + or -, followed by `?text=` and a URL-encoded message. WhatsApp opens with the message prefilled, ready to send. (Meta community forum; this is not official docs.) — [Meta Developer Community thread](https://developers.facebook.com/community/threads/957849225969148/)
- The QR Codes API creates `https://wa.me/message/<CODE>` links with a prefilled message of up to 140 characters. The message is not embedded in the URL, the number stays hidden, and the message can be edited or deleted at any time. There is a cap of 2,000 QR codes or short links per business number. — [Meta: QR codes and short links](https://developers.facebook.com/documentation/business-messaging/whatsapp/qr-codes/)
- Click-to-WhatsApp ads can show Welcome Message Sequences with predefined text, FAQs or a prefilled message. — [Meta WhatsApp changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog)
- CTWA and FB Page CTA entry opens the 72-hour free entry point window (mobile only). — [Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)

### Inferences
- A prefilled `Ref: RS-12345` lets the webhook handler pre-route the first message to the right case or owner. The backend must still verify identity: match BSUID/`wa_id` against the patient on file, or run an in-chat verification step before discussing case details. Anyone can type any case number.
- Per-case short links (up to 2,000 per number) can embed the reference without exposing it in the URL, but the 2,000 cap makes per-patient links impractical at scale. A static `?text=` template with the reference is simpler.

### Gaps
- I found no official character limit for the plain `wa.me?text=` parameter.
- I did not verify the CTWA `referral` webhook fields (ad id, `ctwa_clid`) against a Meta page during this research.

## Q7. Official Business Account badge, display name, messaging limits and quality, and BSP vs direct Cloud API

### Takeaway
An OBA blue checkmark requires a business portfolio that is policy-compliant, has been on the Platform at least 30 days, has passed Business Verification, has 2-step verification enabled and has an approved display name. In practice it also requires notability. Messaging limits cap business-initiated (template) sends to unique users outside the service window per rolling 24 hours. They start at 250, rise to 2,000 via verification or a scaling path and scale automatically to unlimited, and they are set at portfolio level. Replies inside the window are not limited.

### Cited Findings
- OBA: a blue checkmark next to the name. Business employee numbers, test accounts and **WhatsApp Business app numbers are ineligible**. Criteria: policy compliance, at least 30 days on the Platform, Business Verification, 2SV and an approved display name. Request it in WhatsApp Manager under Phone numbers > Profile > Official business account. If denied, wait 30 days before reapplying. — [Meta: Official Business Accounts](https://developers.facebook.com/docs/whatsapp/official-business-accounts)
- The OBA page also requires "a well-known business that has a substantial presence in news articles from publications with sizable audiences" (search snippet of the current Meta page). — [Meta: OBA (documentation path)](https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts/)
- Non-OBA numbers do not appear in WhatsApp search, but users who saved the number see the display name. — [Meta: OBA](https://developers.facebook.com/docs/whatsapp/official-business-accounts)
- Display name: it must relate to the business, comply with the Commerce and Business policies and follow the display-name formatting guidelines. Names may not be false, misleading, a parody, or use character symbols, excessive punctuation or trademark designations. Display-name review starts after Business Verification, and later changes need re-approval. `name_status` takes values such as APPROVED, DECLINED and PENDING_REVIEW. — [Meta: About display name](https://developers.facebook.com/docs/whatsapp/overview/display-name); [Meta Terms for WhatsApp Business Platform](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform)
- Messaging limits:
  - The limit counts unique users messaged **outside a customer service window** in a moving 24 hours.
  - Tiers: 250 by default for new portfolios, 2,000 via a scaling path, then 10K, 100K and unlimited by automatic scaling.
  - Limits are calculated at **business portfolio level** and shared by all its numbers.
  - The paths to 2,000 are Business Verification, or 2,000 delivered out-of-window messages to unique users in 30 days with high-quality templates.
  - Automatic scaling: the limit goes up a tier within 6 hours if quality is high and at least half the current limit was used in the last 7 days.
  - API fields: `messaging_limit_tier` is deprecated in favour of `whatsapp_business_manager_messaging_limit`. Webhooks v24.0+ use `max_daily_conversations_per_business`, while ≤v23.0 kept `max_daily_conversation_per_phone` until Feb 2026.
  — [Meta: Messaging limits](https://developers.facebook.com/docs/whatsapp/messaging-limits)
- BSP vs direct: coexistence onboarding requires a Solution Partner or Tech Provider with Embedded Signup. — [Meta coexistence doc](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users). If you use a BSP, the BSP sets up the display name. — [Meta: About display name](https://developers.facebook.com/docs/whatsapp/overview/display-name). BSPs may mark up Meta rates. — [ChatMaxima](https://chatmaxima.com/whatsapp-api-pricing/egypt/)

### Inferences
- A care-coordination startup is unlikely to get a blue tick early because of the notability criterion. Plan around display name, Business Verification and 2SV instead. Business Verification also lifts the template limit to 2,000.
- Coordinator replies inside the window do not consume messaging-limit capacity. Only template re-engagement does.
- Going direct to Cloud API avoids BSP markup and keeps message content off a third party's servers, which matters for health data (see Q8). A BSP adds an inbox UI and support but is an extra processor. Coexistence onboarding needs a Tech Provider app or a BSP.

### Gaps
- I did not find Meta's current quality-rating (green/yellow/red) effects page. The messaging-limits page fetched only mentions "high quality" as a scaling condition.
- I found no authoritative date for the switch to portfolio-level limits. Other sources suggest Oct 2025, but this is unconfirmed here.

## Q8. Healthcare policy restrictions and privacy/compliance for medical information over WhatsApp (encryption, GDPR, Egypt PDPL 151/2020, HIPAA)

### Takeaway
WhatsApp's policy (updated 23 Sep 2026) prohibits promoting or selling medical and healthcare products and drugs. It does not ban health-service businesses outright, but it bars using WhatsApp for telemedicine or health information wherever applicable regulations require systems with "heightened requirements". Cloud API is encrypted from the user to Meta's Cloud API only: Meta decrypts messages, acts as processor, keeps them up to 30 days and processes them in Meta data centers (US by default unless Local Storage is set). Under Egypt's PDPL and its Executive Regulations (Decree 816/2025, issued 1 Nov 2025, compliance by about Nov 2026), health data is sensitive. It needs explicit written consent and likely a licence, and cross-border transfer (e.g. to Meta's cloud) needs a licence or authorisation.

### Cited Findings
**WhatsApp/Meta policy**
- Section 3: "Don't use WhatsApp for telemedicine or to send or request any health related information, if applicable regulations prohibit distribution of such information to systems that do not meet heightened requirements … to handle health related information." — [WhatsApp Business Messaging Policy (23 Sep 2026)](https://whatsappbusiness.com/policy/)
- Section 4 prohibited goods include "Medical and healthcare products" and drugs, "whether prescription, recreational, or otherwise", irrespective of licences. The OTC-drug exception covers Platform messaging only, in listed countries, for over-18s. Commerce experiences (catalog or sale) in Regulated Verticals are prohibited. — same
- Other relevant rules:
  - Don't request or share full payment card numbers, financial account numbers, personal ID numbers or other sensitive identifiers.
  - Keep a published privacy policy and obtain all notices and consents.
  - Use WhatsApp data only to support messaging with that person.
  - "Do not forward or share one customer's chat information with another customer."
  - Don't discriminate based on "medical or genetic condition".
  - Opt-in is required, and opt-outs must be honoured on or off WhatsApp.
  — same
- The Business app cannot be used to message about Regulated Verticals at all. — same

**Cloud API data handling**
- "The message travels encrypted via WhatsApp between the user and Cloud API. Once Cloud API receives the message, Cloud API decrypts the message and forwards it to the business." "Meta, in providing Cloud API service, acts as a data processor/service provider on behalf of the business." "Messages have a maximum retention period of 30 days." "Cloud API customers must meet their own obligations under data protection laws." It refers to the Meta Hosting Terms for Cloud API and the WhatsApp Business Data Processing Terms (sub-processors). The page does not address HIPAA or health data. — [Meta: Data privacy & security](https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security)
- Some BSPs claim WhatsApp or Meta cannot read message content. That contradicts Meta's own statement that Cloud API decrypts messages. — [360dialog architecture](https://docs.360dialog.com/whatsapp-api/background); [Infobip](https://www.infobip.com/blog/whatsapp-data-security)
- Local Storage: a per-phone-number setting that pins message data at rest to a chosen country. The data-in-use period is up to 60 minutes for Cloud API (90 for the Marketing Messages API), during which content may be processed in Meta data centers internationally. Afterwards it is deleted outside the region. Supported regions are given via the `data_localization_region` parameter, and the list was not visible. — [Meta: Local storage](https://developers.facebook.com/documentation/business-messaging/whatsapp/local-storage/). The default at-rest location is US. — [360dialog local storage](https://docs.360dialog.com/docs/hub/local-storage). A "No Storage" option keeps in-transit data at most 1 hour without persisting it at rest, with a configurable media TTL. — [Meta: No storage](https://developers.facebook.com/documentation/business-messaging/whatsapp/no-storage/)

**Egypt PDPL (Law 151/2020) and Executive Regulations**
- Executive Regulations: Ministerial Decree **No. 816 of 2025**, issued 1 Nov 2025 and made public 25 Dec 2025. This starts a one-year grace period, so enforcement is expected from about 1 Nov 2026. Sources conflict on the gazette and effective dates (2 Nov vs 10 Nov 2025). — [CMS](https://cms.law/en/are/legal-updates/egypt-s-pdpl-executive-regulations-issued-one-year-compliance-countdown-begins); [Al Tamimi](https://www.tamimi.com/law_update_articles/from-policy-to-practice-egypt-issues-executive-regulations-of-the-personal-data-protection-law/); [Tsaaro](https://tsaaro.com/blogs/egypts-pdpl-is-finally-live-why-november-2026-is-a-hard-stop-for-compliance)
- Health data is "sensitive" and needs explicit **written** consent. CMS says it should be in Arabic with heightened record-keeping, and it must be flagged in the record of processing. — [CMS](https://cms.law/en/are/legal-updates/egypt-s-pdpl-executive-regulations-issued-one-year-compliance-countdown-begins); [Tsaaro on consent](https://tsaaro.com/blogs/navigating-consent-what-egyptian-businesses-need-to-know-about-data-subject-consent-under-the-pdpl); [Baker McKenzie](https://connectontech.bakermckenzie.com/egypt-important-data-protection-update/)
- A licence from the Personal Data Protection Center (PDPC) is needed to possess or process sensitive data, per some summaries; others say "in many cases". There are tiered licence fees, with 1–100K records exempt from fees. — [Al Tamimi](https://www.tamimi.com/law_update_articles/from-policy-to-practice-egypt-issues-executive-regulations-of-the-personal-data-protection-law/); [Mondaq](https://www.mondaq.com/privacy-protection/1768986/the-issuance-of-the-executive-regulations-of-the-data-protection-law-in-egypt-and-the-establishment-of-the-data-protection-centre)
- Cross-border transfers, **including to cloud environments**, require a licence or authorisation describing the destination, storage, security, data categories and retention. The recipient's protection must be no lower than Egypt's, transfer impact assessments are expected, and an adequacy framework is to come. — [CMS](https://cms.law/en/are/legal-updates/egypt-s-pdpl-executive-regulations-issued-one-year-compliance-countdown-begins)
- A DPO is mandatory for legal entities and must be PDPC-registered. Breaches must be notified to the PDPC within 72 hours and to data subjects within 3 days after that. — [CMS](https://cms.law/en/are/legal-updates/egypt-s-pdpl-executive-regulations-issued-one-year-compliance-countdown-begins); [Al Tamimi](https://www.tamimi.com/law_update_articles/from-policy-to-practice-egypt-issues-executive-regulations-of-the-personal-data-protection-law/)

### Inferences
- A care-coordination service is not itself a "medical or healthcare product". Coordinating cases over the Platform appears permitted, but the telemedicine clause makes it conditional on local health-data rules. Diagnoses, reports and clinical advice over WhatsApp are the high-risk part. A defensible design keeps clinical content in the portal and sends WhatsApp nudges and links ("new document in your secure portal") rather than medical records. Do not use WhatsApp product catalogs or payments for medical items.
- Because Meta decrypts and processes content (in the US by default), sending Egyptian patients' health data through Cloud API is a cross-border transfer of sensitive data under the PDPL. It likely requires PDPC authorisation plus explicit written (Arabic) consent that names WhatsApp/Meta as a channel. Local Storage could reduce exposure if a suitable region exists. A BSP adds another processor and transfer.
- GDPR (for EU patients): health data is Article 9 special-category data. Meta's processor role and Data Processing Terms support an Art. 28 arrangement, but the business remains controller and must have an Art. 9 condition (typically explicit consent) and lawful transfer mechanisms. This is general GDPR knowledge, not sourced in this research; verify with counsel.
- Policy rule "don't share one customer's chat with another": coordinators must not forward patient chats outside the case. This aligns with single-owner routing.

### Gaps
- **HIPAA:** I found no Meta statement on whether Meta signs Business Associate Agreements for Cloud API. Meta's privacy page does not mention HIPAA. Commonly reported industry understanding is that Meta does not sign BAAs, but this is unverified here.
- I found no official list of Local Storage regions, so whether any Middle East or Egypt region exists is unknown.
- I did not access the official text of the PDPL Executive Regulations. The exact articles on sensitive-data licensing and the cross-border exceptions (e.g. explicit consent as a basis) rely on law-firm summaries that differ in detail.
- I did not separately review the Meta Commerce Policy text (it is not reproduced in the WhatsApp policy). The WhatsApp policy's Regulated Verticals list was used instead.
