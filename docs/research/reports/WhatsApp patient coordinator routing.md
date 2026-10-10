# Route one shared number to one owner

Successful medical-tourism platforms and hospital international offices all do the same thing. They publish **one shared business WhatsApp number per brand or region**, alongside a web form or call-back. They never publish a coordinator's personal number. They assign a **named coordinator only after a qualifying inquiry**: a form, a verified phone number, or records. That coordinator answers from the shared inbox under their own name. Nothing in WhatsApp itself stops two coordinators replying to the same patient. The free Business app gives up to five devices full, equal access to every chat. Commercial shared inboxes only prevent collisions softly, through badges, typing indicators and visibility filters. The only hard guarantee comes from sending every reply through a backend that checks ownership before calling the Cloud API. That matters for RehletShifaa because it already owns the hard part: a case-ownership engine with locks, continuity, language and capacity scoring, a queue and controlled reassignment. What it lacks is plumbing. Its webhook ignores inbound messages, its site link carries no identity, and prospects have no owner at all. The recommended path has three steps. First, complete pre-launch hygiene and compliance work that needs little or no code. Second, build a minimal in-platform WhatsApp inbox on the Cloud API, where only the case or intake owner can send. Third, add bot triage and SLA escalation as volume grows. A bought shared inbox is a viable bridge, but it duplicates the routing engine and assigns per contact rather than per case. Two constraints shape everything: **Egypt's PDPL executive regulations, enforceable from about November 2026**, and an **unresolved October 2026 Meta pricing change** that the owner needs to verify before launch.

## The industry fronts one shared number and names the coordinator later

### One shared number, segmented by region or language

None of the hospitals or facilitators examined publishes per-coordinator WhatsApp numbers. Acibadem's international site lists **one WhatsApp number, marketed as "24/7" and the "fastest channel"**. Its buttons for different offices reuse that same number with different prefilled text. It also offers a phone line, call-back forms and a lead-capturing chat widget ([Acibadem International](https://acibademinternational.com/?p=208)). Cleveland Clinic Abu Dhabi publishes one WhatsApp number next to phone lines, a call-back request form and an intake form ([CCAD International Patient Services](https://clevelandclinicabudhabi.ae/international-patients/international-patient-services)). Mount Elizabeth in Singapore runs one WhatsApp line per hospital, staffed **only Mon–Fri 9:00–17:00**, and sends after-hours demand to a 24-hour phone hotline ([Mount Elizabeth contact](https://www.mountelizabeth.com.sg/contact-us)). Where hospitals segment by language, they use separate phone lines (Anadolu publishes eight) or a dedicated language hotline, such as Vejthani's Arabic line that doubles as WhatsApp ([Anadolu International Patient Services](https://www.anadolumedicalcenter.com/patient-guide/international-patient-services); [Vejthani International Service Center](https://www.vejthani.com/patient-services/hospital-services-facilities/international-service-center/)). US and German academic centres do not publish WhatsApp at all. Mayo uses a request form, email and phone ([Mayo – Requesting an appointment](https://mayoclinic.org/departments-centers/international/appointments)).

### Facilitators tag the source before the chat opens

Facilitators follow the same front-door pattern, and the advanced ones add a layer before the chat starts. PlacidWay uses one number for both phone and WhatsApp, with generic prefilled text ([PlacidWay](https://www.placidway.com)). Vaidam prefills the page URL into the WhatsApp message so the inbox knows where the patient came from ([Vaidam](https://www.vaidam.com)). Flymedi sends WhatsApp clicks through its own **signed `/wa/` redirect, which encodes the source page, template and locale** ([Flymedi](https://www.flymedi.com)). Bookimed asks the patient to "choose a messenger" and verify their phone via WhatsApp or SMS before the request is created ([Bookimed](https://bookimed.com)). MediGence splits by region, with one US number and one Turkish number ([MediGence](https://www.medigence.com)). RehletShifaa's current link, one number with a generic greeting and no reference, locale or source page, sits at the least informative end of this range.

### The named coordinator arrives after intake

Timing of assignment is consistent wherever it is stated. Vaidam says: "Once you leave enquiry with Vaidam, we assign you a dedicated case manager" ([Vaidam](https://www.vaidam.com)). Flymedi's step 2 is "A dedicated medical coordinator reviews your case and calls you back within 24 hours" ([Flymedi](https://www.flymedi.com)). At Johns Hopkins, a care coordinator emails the patient after the interest form is submitted ([JHI – What to expect next](https://www.hopkinsmedicine.org/international/patients/appointments)). Cleveland Clinic Abu Dhabi promises a "dedicated global patient services coordinator, who will remain the single point of contact throughout your journey" ([CCAD](https://clevelandclinicabudhabi.ae/international-patients/international-patient-services)). Cleveland Clinic London, by contrast, makes the *team* the single point of contact ([Cleveland Clinic London GPS](https://clevelandcliniclondon.uk/patients/global-patient-services)). So "dedicated coordinator" is sometimes a marketing word for a pool.

### Handoffs are common but accepted when named

A two-tier model is common. Bookimed's coordinators work **only "hot" leads** and own the "full cycle" in a CRM ([DOU job posting](https://jobs.dou.ua/companies/bookimed/vacancies/298655/)). A Flymedi patient describes a WhatsApp consultation with one named person, after which "I was contacted by Aysenur who would be my FlyMedi contact" ([Trustpilot – Flymedi](https://www.trustpilot.com/review/flymedi.com)). The reviews show the stakes. Positive reviews nearly always name one coordinator. Negative ones cite "a lack of clear and consistent communication from my assigned coordinator" and unsolicited daily WhatsApp follow-ups ([Trustpilot – Bookimed](https://uk.trustpilot.com/review/www.bookimed.com)), or coordinators who "literally stopped responding" after payment ([Trustpilot – Qunomedical](https://www.trustpilot.com/review/qunomedical.com)).

*Inference:* continuity with one named person drives satisfaction. The failure modes are over-contact before the sale and under-contact after it. That means ownership rules and SLAs have to cover the whole journey, not just the first reply.

## Nothing on WhatsApp itself stops two coordinators replying

### The free Business app has no ownership model

The free WhatsApp Business app allows **one phone plus up to four linked devices on a number**. Every device sees and can answer every chat, and there is no assignment, lock or "who is handling this" indicator ([WhatsApp FAQ: linked devices](https://faq.whatsapp.com/647349420360876); [Chakra: Team Inbox vs Business App](https://chakrahq.com/article/whatsapp-team-inbox-vs-business-app/)). For a health business there is a sharper problem. The WhatsApp Business Messaging Policy, updated **23 September 2026**, states that businesses are "prohibited from messaging about any Regulated Verticals on the WhatsApp Business App", and those verticals include medical and healthcare products ([WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)).

*Inference:* care coordination is a service, not a product. Even so, running patient conversations on the Business app combines a policy grey zone with zero ownership enforcement. The On-Premises API was sunset on 23 October 2025, so the Cloud API is now the only API route ([Meta On-Premises sunset](https://developers.facebook.com/docs/whatsapp/on-premises/sunset)).

### Coexistence lets the phone bypass the backend

Coexistence keeps the Business app running alongside the Cloud API on the same number. That works against single ownership. Replies typed on the phone reach the backend only afterwards, as `smb_message_echoes` webhooks. Replies from WhatsApp for Windows or WearOS companions **trigger no webhook at all** ([Meta: Onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)). Coexistence also disables broadcast lists, does not sync groups and caps throughput at 20 messages per second. Meta's document lists no excluded countries. No source confirms Egypt either way, and an older BSP page excluded many markets ([360dialog](https://docs.360dialog.com/partner/waba-management/phone-number-and-hosting/using-whatsapp-app-and-cloud-api-simultaneously)).

### Shared inboxes prevent collisions only softly

Commercial shared inboxes add ownership, but none of them locks replies to the assignee. Chatwoot relies on typing indicators and assignment badges ([Chatwoot: Preventing Agent Collision](https://www.chatwoot.com/hc/user-guide/articles/1732243644-preventing-agent-collision)). respond.io comes closest. Its "Restrict Contact Visibility" setting can show agents only the contacts assigned to themselves, and unassigned contacts are hidden ([respond.io User settings](https://respond.io/help/workspace-settings/users)). But replying to an unassigned contact silently assigns it to whoever replied ([respond.io Responding to Messages](https://respond.io/help/quick-start/responding-to-messages)).

Three products treat "sticky" routing back to the previous agent as a first-class feature:

| Product | How sticky routing works | Fallback |
|---|---|---|
| Infobip | Sticky agent, with a lookback of up to "ever" | Standard auto-assignment |
| Twilio | Known Agent Routing | Other agents after a timeout |
| Zendesk | Reopened tickets stay with the original assignee | None by default: the ticket stays with that agent even if they are offline, unless an admin configures otherwise |

Sources: [Infobip basic settings](https://www.infobip.com/docs/conversations/conversations-setup/basic-settings); [Twilio Known Agent Routing](https://www.twilio.com/docs/taskrouter/workflow-configuration/known-agent-routing); [Zendesk reopened-ticket reassignment](https://support.zendesk.com/hc/en-us/articles/5952305148442-Announcing-the-ability-to-reassign-reopened-tickets-with-omnichannel-routing).

Most tools also hang the assignee on the **contact (phone number)**, not on a case. In respond.io, for example, `GET /v2/contact/{identifier}` returns a single `assignee` ([respond.io API](https://developers.respond.io/docs/api/cbcfb23486778-get-a-contact)).

*Inference:* a patient with two cases, or a relative writing about someone else's case, does not map onto a contact-level assignee. RehletShifaa's case-level ownership has no clean equivalent in these tools.

### Large hospitals keep continuity at the CRM case

The best-documented hospital setup is Bumrungrad's. All LINE, WhatsApp and Messenger chats land in one Bird inbox, AI language detection routes them to **Thai, English, Japanese and Arabic teams**, and each chat becomes a ticket synced to a **Salesforce case** that serves as the single source of truth ([Bird – Bumrungrad](https://bird.com/zh-sg/kehu/bumrungrad-international-hospital/)). That routes to a team. The case study does not say whether one agent stays with the patient.

### The Cloud API makes the backend the choke point

The Cloud API changes what is possible. Every inbound message reaches your webhook with the business `phone_number_id`, the sender's `wa_id`, and a `wamid` message ID ([Meta webhook payload examples](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples)). Since roughly April 2026 it also carries a **business-scoped user ID (BSUID)**. The BSUID is the stable key for a user who adopts a username instead of showing a phone number, and it is regenerated if the user changes number ([Meta: Business-scoped user IDs](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids)). Replies are `POST /{phone-number-id}/messages`, which only your server can call ([Meta: Send messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)).

*Inference:* if coordinators hold no WhatsApp client for the number, the server is the only place a reply can come from. The server can check `case.owner == caller`. It can apply the same check to read receipts and typing indicators, so a non-owner who merely opens a thread does not mark it read for the patient. No surveyed tool offers this hard guarantee natively.

## Volume is absorbed by a pooled front door, not by individuals

### The front door is a pool, segmented by language

Nobody handles "many patients at once" by giving each one a person on first contact. The front door is a **pool segmented by language or market**. Automation captures greeting, language and intent, and routing hands off to a named owner. Bumrungrad's pipeline runs a welcome menu, then language detection, then a language team, then a CRM case ([Bird – Bumrungrad](https://bird.com/zh-sg/kehu/bumrungrad-international-hospital/)). Praga Medica, a Prague facilitator, moved inquiries to the WhatsApp API on respond.io and put an AI agent in front to filter spam. Automated workflows **collect contact details "when no advisor is available"**, and webhooks push leads into its CRM. The vendor reports 70% more leads recovered and 97% of spam filtered ([respond.io – Praga Medica](https://respond.io/de/customers/praga-medica-recovers-70-percent-more-leads)). These are vendor-reported figures.

### Automation must offer a human escalation path

Meta permits automation inside the conversation, but the business must provide "prompt, clear, direct escalation paths" to a human ([WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)).

### Published response promises cluster at 24 hours

Published response promises fall into two bands:

| Source | Published promise |
|---|---|
| Flymedi, Vaidam, MedSurge, Booking Health | First human contact within 24 hours or one business day |
| Mayo | Two to three business days |
| Acibadem | WhatsApp replies "within minutes", but the same page puts the typical first reply at about two hours |

Sources: [Flymedi](https://www.flymedi.com); [Vaidam](https://www.vaidam.com); [Booking Health](https://www.bookinghealth.com); [Mayo – appointment process](https://www.mayoclinic.org/international/appointment-process); [Acibadem International](https://acibademinternational.com/?p=208).

*Inference:* "24/7" claims usually describe support during treatment, not the pre-sales queue. Arab-market patients will compare RehletShifaa with the faster Turkish and facilitator promises, not with US academic centres.

### Sticky ownership needs explicit fallback rules

Continuity creates its own volume problem: what happens when the owner is busy, offline or on leave. Twilio's known-agent routing falls back to other agents after a timeout ([Twilio](https://www.twilio.com/docs/taskrouter/workflow-configuration/known-agent-routing)). Bitrix24 forwards an unanswered chat to the next agent on a timer and caps open conversations per agent ([Bitrix24: Configure agent queue](https://helpdesk.bitrix24.com/open/25782447/)). Zendesk shows the opposite failure, where a reopened ticket stays with an agent who has gone home unless "Offline" is configured as a reassignable status ([Zendesk](https://support.zendesk.com/hc/en-us/articles/5952305148442-Announcing-the-ability-to-reassign-reopened-tickets-with-omnichannel-routing)). Even mature open-source software struggles here. Chatwoot has an open race-condition bug in which new conversations are sometimes not auto-assigned, and it has no native "reassign if unanswered" feature ([chatwoot#16134](https://github.com/chatwoot/chatwoot/issues/16134); [chatwoot#13516](https://github.com/chatwoot/chatwoot/issues/13516)).

*Inference:* RehletShifaa's engine already has the hard primitives: capacity, a queue, claiming, and lead/manager reassignment with a reason. What is missing is time-based escalation ("unanswered for N minutes, so alert the lead and offer it to the queue") and an off-shift cover rule.

## Compliance and cost decide what may travel over WhatsApp

### Meta's health clause and data handling

Meta's policy does not ban health-service businesses. It does say: "Don't use WhatsApp for telemedicine or to send or request any health related information, if applicable regulations prohibit distribution of such information to systems that do not meet heightened requirements" ([WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)).

Meta is explicit about Cloud API data handling. **Cloud API decrypts messages**, Meta acts as a data processor, messages are retained for **up to 30 days**, and customers "must meet their own obligations under data protection laws" ([Meta: Data privacy & security](https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security)). That contradicts BSP marketing claiming Meta cannot read content. The default at-rest location is the US ([360dialog local storage](https://docs.360dialog.com/docs/hub/local-storage)). A per-number Local Storage setting exists, but the list of supported regions was not visible ([Meta: Local storage](https://developers.facebook.com/documentation/business-messaging/whatsapp/local-storage/)). No source says whether HIPAA BAAs are available. Secondary sources say Meta does not sign them ([Paubox](https://www.paubox.com/blog/whatsapp-hipaa-compliant)).

### Egypt's PDPL applies from about November 2026

Egypt's PDPL executive regulations (Ministerial Decree **816 of 2025**) were issued on 1 November 2025 and start a one-year grace period, so **enforcement is expected from about 1 November 2026**. The obligations that matter here:

- Health data is sensitive and needs **explicit written consent**, which CMS advises should be in Arabic.
- Cross-border transfers, explicitly **including to cloud environments**, need a licence or authorisation.
- A registered DPO is mandatory.
- Breaches must be reported to the regulator within 72 hours.

Sources: [CMS](https://cms.law/en/are/legal-updates/egypt-s-pdpl-executive-regulations-issued-one-year-compliance-countdown-begins); [Al Tamimi](https://www.tamimi.com/law_update_articles/from-policy-to-practice-egypt-issues-executive-regulations-of-the-personal-data-protection-law/).

*Inference, to verify with counsel:* sending an Egyptian patient's diagnosis through Cloud API is a cross-border transfer of sensitive data to Meta. A bought inbox adds a second processor, and a second transfer. Hospitals that advertise WhatsApp as their main channel rely on generic consent-to-process wording. Acibadem's forms, for example, say nothing specific about WhatsApp ([Acibadem International](https://acibademinternational.com/?p=208)). So stating in consent text exactly what belongs on WhatsApp would put RehletShifaa above the observed norm.

### The 24-hour window and templates constrain the composer

The window mechanics directly shape the coordinator's composer. A **24-hour customer-service window opens and resets with each patient message or call**. Inside it, any free-form message is allowed. Outside it, only approved templates can be sent ([Meta: Send messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)). Reassigning a case does not reset the window, because it belongs to the patient and the number, not to the agent.

Utility templates must be non-promotional and tied to a user request; "continuing a conversation a user started on another channel" is one of Meta's listed examples. Meta can recategorise a template to marketing on one day's notice. Repeated misuse escalates to template suspension and portfolio-wide restrictions ([Meta: Template categorization guidelines](https://developers.facebook.com/docs/whatsapp/updates-to-pricing/new-template-guidelines)).

New portfolios can reach only **250 unique users per rolling 24 hours outside the window**. Business Verification lifts that to 2,000. Replies inside the window are not limited ([Meta: Messaging limits](https://developers.facebook.com/docs/whatsapp/messaging-limits)).

### Egypt prices are small; the October 2026 change is unresolved

Cost is small per message but currently ambiguous. Since 1 July 2025, Meta has charged per delivered template ([Meta: Pricing updates](https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing)). Secondary sources quote these Egypt rates, before 14% VAT ([ChatMaxima Egypt](https://chatmaxima.com/whatsapp-api-pricing/egypt/)):

| Category | Egypt rate (USD per delivered message) |
|---|---|
| Marketing | $0.0644 |
| Utility | $0.0036 |
| Authentication | $0.0036 |

Patients in other countries are billed at their own country's rate.

Several BSPs and a 28 September 2026 news report describe a change **from 1 October 2026**. Under it, free-form service replies are billed after 1,000 free per number per month, at the utility rate, and in-window utility templates stop being free ([respond.io](https://respond.io/blog/whatsapp-pricing-change-2026); [Techweez](https://techweez.com/2026/09/28/whatsapp-business-pricing-october-2026/)). But **two direct fetches of Meta's own pricing page on 2026-10-10 still said non-template messages and in-window utility templates are free** ([Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)). This is unresolved.

*Inference, illustrative only:* even if the change holds, 100 active Egyptian patients each receiving 40 coordinator messages a month comes to 4,000 replies. About 3,000 of those would be billable, roughly **$11 a month before VAT**. Ten coordinators share a single allowance, because it is per number. Cost is therefore not a reason to choose between building and buying. It is a reason to record the `pricing` object from status webhooks and to discourage splitting one reply into many short messages.

## What RehletShifaa should do: three phases around the routing engine it already has

### First check what happens to messages today

One fact needs checking before anything else. RehletShifaa's backend already sends outbound notifications through the Meta Cloud API, and its webhook processes only delivery statuses.

*Inference, verify immediately:* if the `NEXT_PUBLIC_WHATSAPP_NUMBER` on the site is the same number that is registered to the Cloud API, then every patient who taps "Talk to a coordinator" is writing into a webhook that discards the message. Without coexistence, no phone shows those chats. If the site number is instead a separate Business-app number, coordinators are working in a tool that has no ownership enforcement and sits under the Regulated Verticals clause. Either way, today's set-up cannot deliver "exactly one coordinator per patient".

### Phase 0: pre-launch, little or no code

**Settle the number.** Use one number, on the Cloud API, API-only. Do not use the Business app or coexistence for patients. Complete Business Verification, display-name approval and two-step verification; verification also lifts the template limit to 2,000 ([Meta: Messaging limits](https://developers.facebook.com/docs/whatsapp/messaging-limits)). Stop planning around the blue tick: it requires press notability ([Meta: OBA](https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts/)).

**Make the website link informative.** Follow the Flymedi pattern ([Flymedi](https://www.flymedi.com)):

- Send the button through a first-party redirect that logs locale, source page and an anonymous reference.
- Prefill a bilingual message that matches the page language and carries that reference, for example "Ref P-7KQ2".
- Keep the case number in the post-submission "Continue on WhatsApp" link.
- Treat the reference as a routing hint, never as authentication: the patient can edit the text, and anyone can type any reference ([Meta: QR codes and short links](https://developers.facebook.com/documentation/business-messaging/whatsapp/qr-codes/)).
- Copy changes go to both `en.json` and `ar.json`.

**Publish hours and a first-response promise.** Do this in Arabic and English, and make the promise one the team can keep. Twenty-four hours is the industry floor; a few hours during staffed hours would be differentiating. *Inference:* this is a business choice, not a sourced benchmark.

**Prepare compliance and templates.**

- Write a WhatsApp-specific consent and notice, in Arabic, that names Meta as a processor.
- Set a rule that clinical documents and medical detail go through the secure portal, with WhatsApp carrying nudges and links.
- Start PDPL work with counsel before the November 2026 enforcement date: sensitive-data licence, cross-border authorisation, DPO.
- Draft and submit a small set of non-promotional utility templates in both languages, such as "update on your case, reply to continue" and "we received your message outside hours".

**Write the ownership rule down.** Prospects go to a language-segmented intake pool. A submitted case goes to its routing-engine owner. Coordinators sign with their first name on the shared number, and nobody uses a personal number.

### Phase 1: build the minimal in-platform inbox before WhatsApp goes live

The notes favour building, as an inference. The domain-specific part (one owner, continuity, scoring, queue, claim and reassign) already exists. What is missing is commodity plumbing.

**Webhook ingestion.** The webhook should:

- verify `X-Hub-Signature-256` and acknowledge fast;
- store the raw event;
- upsert idempotently on `wamid` and status IDs, backed by a unique constraint;
- never move a status backwards.

Webhooks are delivered at least once and out of order ([Hookdeck guide](https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices)).

**Media.** Download media into MinIO immediately, because media URLs expire after **five minutes** ([Meta: Media](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media)).

**Linking to cases.** Key conversations on BSUID, with `wa_id` as the secondary key, and re-link when the system webhook reports a number change. Resolve each inbound message to a case through `CaseContactResolver`, using the prefilled reference as a hint. An unmatched sender becomes an **intake conversation**. That gives prospects a first-class owner: the same routing locks and claim mechanics apply, but the target is the intake pool, segmented by language. When the prospect submits a case, the continuity rule makes the intake owner the preferred case owner. If the engine picks someone else, the handoff is announced by name, which the Flymedi review shows patients accept.

**Owner-only sending.** The send service is the only path to `/messages`. It refuses any send, read receipt or typing indicator from anyone other than the current owner. It shows a window countdown and switches the composer to template-only once the window closes.

**Escalation.** Time-based escalation ("unanswered for N minutes during staffed hours") alerts the lead and returns the conversation to the queue. Absence cover reuses the existing manager or lead reassignment with a reason.

### Phase 2: scale and refine

Add the following as volume grows:

- a WhatsApp Flow or bot greeting that captures language, intent and consent before human pickup, with a visible "talk to a person" escape;
- per-coordinator response-time metrics;
- Click-to-WhatsApp ads, whose 72-hour free entry window makes paid acquisition cheaper ([Meta: Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing));
- Local Storage, if Meta offers a suitable region.

### Choosing a launch bridge

If launch cannot wait for Phase 1, choose a bridge with its costs in view.

| Option | Single-owner enforcement | Compliance posture | Cost (dated 2026-10-10) | Integration and coexistence limits |
|---|---|---|---|---|
| **Build in-platform (recommended)** | Hard: the server refuses non-owner sends | Data stays in RehletShifaa's infrastructure, with Meta as the only processor | Engineering time plus Meta fees | Must handle idempotency, media expiry, window logic and on-call for the webhook |
| **Buy: respond.io Growth** | Soft: "Restrict Contact Visibility" set to self, auto-assign off, owner pushed from the backend through the API | Third-party processor of health data; ISO 27001 and DPA, but **no published hosting region or BAA** ([respond.io Security](https://respond.io/security)) | $159/mo annual for 10 users, plus MAC overage and Meta fees ([respond.io Pricing](https://respond.io/pricing)) | Contact-level assignee, so one phone with several cases breaks; two sources of truth; echo-loop handling; outbound notifications must move to the vendor's API (*inference*) |
| **Buy and self-host: Chatwoot** | Soft (badges and typing indicators); RehletShifaa remains the authority through the assignments API | Data stays on own infrastructure | Community edition free; capacity and roles at about $19 per agent per month ([eesel.ai](https://www.eesel.ai/blog/chatwoot-pricing)) | A second Rails app to run; no `performed_by` field on webhooks makes echo suppression fiddly ([chatwoot#15914](https://github.com/chatwoot/chatwoot/issues/15914)); the auto-assign race bug |
| **Business app or coexistence** | None; companion replies can bypass the backend | Business app is barred from Regulated Verticals messaging | App messages are free | Egypt eligibility unconfirmed; broadcast disabled; not suitable for this requirement |

*Inference:* both buy options have to take over the number's webhook. The existing status-webhook handling would then need to read from the vendor or move to the vendor.

### Open decisions for the owner

The owner needs to decide:

- whether notifications and conversations share one number, which is strongly suggested;
- whether the intake claimant should become the default case owner (fewer handoffs) or intake should stay a separate role (cleaner specialisation);
- staffed hours, the first-response promise, and after-hours behaviour (template acknowledgement only, or an on-call coordinator);
- the exact line between what may be said on WhatsApp and what must go through the portal;
- whether to delay WhatsApp go-live until Phase 1 is built, or accept a bought bridge and its migration cost;
- whether to go direct to the Cloud API or through a BSP. Direct avoids markup and a second processor; a BSP adds support and an inbox.

### Items to verify before relying on them

These need verification first:

- the October 2026 service-message billing, in WhatsApp Manager's billing view;
- whether the site number equals the Cloud API sender number;
- the PDPL sensitive-data licence and cross-border requirements, with Egyptian counsel;
- coexistence availability for +20 numbers, if it is ever considered;
- the Local Storage region list;
- the webhook acknowledgement deadline and 7-day retry behaviour, which are third-party claims that conflict;
- BSUID presence in RehletShifaa's own webhook payloads;
- the out-of-window error code, commonly cited as 131047 but unconfirmed.

## Conclusion

The question "personal coordinator or shared number?" turns out to be a false choice. The industry runs both at once. The shared number is the transport and the named coordinator is a record in a system of record. Where hospitals and facilitators struggle is not routing on first contact. It is enforcement and continuity later on: tools that only soft-lock, ownership that lives on a phone number instead of a case, and coordinators who go quiet after payment. RehletShifaa's case-ownership engine is already stricter than anything the surveyed inbox vendors ship. Its real gap sits at both ends: a front door that captures no identity or language, and a webhook that ignores what patients write. Closing both gaps lets the platform make a promise its competitors only imply: one named coordinator per case, enforced by the server rather than by etiquette.

The deadlines that matter come from outside the codebase. PDPL enforcement around November 2026 and Meta's unsettled pricing make consent wording, data minimisation on WhatsApp and number configuration launch blockers, not polish. The most urgent single action costs nothing: confirm today whether patient messages to the advertised number are being silently discarded.
