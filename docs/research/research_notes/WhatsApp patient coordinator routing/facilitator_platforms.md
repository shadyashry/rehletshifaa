# How medical-tourism facilitator platforms handle "talk to a coordinator" and the dedicated-coordinator model

Research date: 2026-10-10. Method: (a) live homepage HTML fetched with curl on 2026-10-10 and grepped for `wa.me` / `api.whatsapp.com` links, `tel:` links, chat-widget vendor strings and coordinator/SLA copy; (b) web search/fetch of Trustpilot, job boards, vendor case studies and facilitator pages. "Homepage HTML (2026-10-10)" below means a string found in the platform's own homepage source on that date; the URL given is the homepage.

**Method caveat (applies everywhere):** most chat widgets (Intercom, Zendesk, Tidio, respond.io, WATI, HubSpot chat) are injected later by Google Tag Manager, so the static HTML often does not show them. Not finding a vendor string does **not** prove a platform doesn't use that vendor. Several grep hits were false positives: "wati" matched Indonesian "khawatir" on Bookimed and "Pushpawati" on MedSurge India; "livechat" on Medical Departures is a review-platform rating key, not a widget. These are excluded from the findings.

---

## 1. Which contact channels do the platforms expose on the website?

### Takeaway
Almost every platform offers a **web inquiry or call-back form** as the main call to action, with **WhatsApp click-to-chat to one company number** as the second channel. Many show several country phone numbers. Third-party live-chat widgets were rarely visible in the static HTML. The more advanced players send WhatsApp clicks through their own redirect or "choose a messenger" step, so they can tag the source page before the chat opens.

### Cited Findings
- **Bookimed:** the CTAs go to a Bookimed-hosted `order-create/question-about-medical-entity/?type=messenger-priority&button=upper_button&operationId=…&clinicId=…` flow rather than a raw `wa.me` link. The copy reads "Choose a Messenger to Get Free Translation and Medical Records Analysis", and phone verification offers "Verify via WhatsApp" or SMS ("Your request is almost ready! Complete it with your number"). The HTML also has many `callback` strings and `tel:` links for several countries (+48, +1). — [Bookimed homepage HTML (2026-10-10)](https://bookimed.com)
- **MediGence:** WhatsApp links to two company numbers, `wa.me/19294192722` (US) and `wa.me/905444032369` (Turkey), plus `tel:` numbers for the US (+1 424…, +1 929…), Turkey (+90 212…), Thailand (+66…) and Kenya (+254…). The homepage says "24/7 Assistance — Round-the-clock by phone, WhatsApp, and Salus". Salus is MediGence's own AI widget, loaded from `salus.medigence.com`, with a `widget/api/classify` endpoint. — [MediGence homepage HTML (2026-10-10)](https://www.medigence.com)
- **Mozocare:** WhatsApp `wa.me/14387883282` and `api.whatsapp.com/send?phone=13024519218`, plus a `#callbackFrm` call-back popup form and US/Canada/India phone numbers. The how-it-works page offers "Continue on WhatsApp", "Scan to speak with a Care Coordinator" (a QR code) and "WhatsApp: +1 438 788 3282". — [Mozocare homepage](https://www.mozocare.com); [Mozocare how it works](https://www.mozocare.com/how-it-works)
- **PlacidWay:** a single number, +1 888 296 6664, used for both `tel:` and WhatsApp. The WhatsApp link pre-fills "Hello PlacidWay! I'm interested in exploring your services…". There is a large custom call-back form (`.callback-form`, `.callback-submit.call-btn`) and an on-site chat panel headed "You're talking with PlacidWay — We're here to help you 24/7". The panel is in-house markup; no third-party vendor string was found. — [PlacidWay homepage HTML (2026-10-10)](https://www.placidway.com)
- **Qunomedical:** one German WhatsApp number in the site config (`"whatsAppLink":"https://api.whatsapp.com/send?phone=4915735988550"`), alongside a "Let's talk — Patient manager — Still unsure? Feeling overwhelmed? Talking to a real person…" block. — [Qunomedical homepage HTML (2026-10-10)](https://www.qunomedical.com)
- **Flymedi:** WhatsApp buttons ("Chat with us on WhatsApp") link to an internal redirect, `/wa/<signed token>`. The token's payload encodes `{"path":"/","template":"home","locale":"en"}`, meaning source page, template and locale. The phone number is +90 212 222 33 44. Analytics are PostHog and Plausible. — [Flymedi homepage HTML (2026-10-10)](https://www.flymedi.com)
- **Vaidam Health:** a single WhatsApp number, `api.whatsapp.com/send?phone=919971616131`, pre-filled with "Hello, please contact me regarding https://www.vaidam.com/, Thank you!", which sends the page URL as context. The banner form says "our medical experts will contact you within 24 hours". — [Vaidam homepage HTML (2026-10-10)](https://www.vaidam.com)
- **Medical Departures (a dental/medical clinic marketplace):** shows a toll-free number (+1-855-912-8960), "Schedule your appointment online or call Toll Free", and "Superior Customer Service — 24/7 availability". No WhatsApp link was found on the homepage or contact page. — [Medical Departures homepage](https://www.medicaldepartures.com); [contact page](https://www.medicaldepartures.com/contact-us/)
- **MyMediTravel:** `wa.me/12138086048` plus a custom WhatsApp chat-box widget (CSS classes `ayoan_whatsapp_chatbox_container`). The page source contains a comment that tapping "Enquire Now" opens WhatsApp. It also lists Thai and Singapore phone numbers. — [MyMediTravel homepage HTML (2026-10-10)](https://www.mymeditravel.com)
- **Healthtrip (India):** WhatsApp `api.whatsapp.com/send?phone=918448845300&text=Hi!`, a UK phone number and a call-back option, under "personalized assistance from start to finish, at no extra cost". — [Healthtrip homepage HTML (2026-10-10)](https://www.healthtrip.com)
- **Lyfboat (India):** phone +91 98101 47453 and the claim "You can contact us anytime via website chat, email or telephone… 24 hours a day". — [Lyfboat homepage](https://www.lyfboat.com)
- **MedSurge India:** `wa.me/918800303633`, call-back forms, and "our health expert will get back to you within 24 hours". — [MedSurge India homepage](https://www.medsurgeindia.com)
- **Booking Health (Germany):** phone +49 228 9727 2320. After the form, the page says "You can expect a call from us within one business day… The incoming call will appear as a German number or your local area code. This call is entirely free of charge." — [Booking Health homepage HTML (2026-10-10)](https://www.bookinghealth.com)
- **Estetik International (Turkish clinic group):** WhatsApp `api.whatsapp.com/send?phone=905498261041`, a call-back form, and a "kommo" string in the HTML, possibly Kommo (ex-amoCRM). Context was not verified. — [Estetik International homepage](https://www.estetikinternational.com)
- **Aïro Medical:** phone numbers in Poland and Germany, and "Connect with our high-qualified patient manager, describe your problem". No WhatsApp link was found. — [Aïro Medical homepage](https://www.airomedical.com)
- **MedicalTourism.com (Medical Tourism Association):** loads HubSpot `hs-scripts` (tracking and forms, which can include HubSpot chat). — [MedicalTourism.com homepage HTML](https://www.medicaltourism.com)
- **Medigo and CloudHospital:** both returned bot-protection pages ("Checking your browser…", "Enable JavaScript and cookies"), so no channel data could be extracted. — [medigo.com](https://www.medigo.com); [cloudhospital.com](https://www.cloudhospital.com)
- **Egypt — Hospitals Co Egypt (Cairo):** "WhatsApp-first". Its WhatsApp number (+20 10 3441 6653) is also its phone number. Hours are Sat–Thu 10:00–18:00. It also has a contact form and email. — [Hospitals Co Egypt – About](https://hospitalscoegypt.com/about.html)
- **Turkey — Alp Medical Travel (Antalya, USHAŞ-approved):** says coordinators respond "in 1–2 minutes via WhatsApp or secure form". — [alpmedicaltravel.com](https://alpmedicaltravel.com/) (search-result summary; not fetched directly)

### Inferences
- The common pattern is **one shared company WhatsApp number per market or region**, not personal numbers on the website. MediGence (US and Turkey numbers) and Mozocare (two North American numbers) split by region. None of the sites inspected publishes a coordinator's personal number.
- Bookimed (messenger-choice step with phone verification) and Flymedi (signed `/wa/` redirect) put an **attribution and identity layer in front of WhatsApp**. They can log the lead in the CRM with source page and locale, and verify the phone, before the chat starts. Vaidam does a lighter version by pre-filling the page URL into the WhatsApp text.
- Explicit call-back forms are near-universal (Bookimed, Mozocare, PlacidWay, MedSurge, Booking Health). The call-back is the main "talk to a human" path for complex cases, and WhatsApp is the low-friction path.

### Gaps
- No live-chat vendor (Intercom, Zendesk, Tidio, Jivo, respond.io, WATI) could be confirmed for any of the named platforms from static HTML. A JavaScript-rendering crawl or a BuiltWith/Wappalyzer lookup would be needed.
- CloudHospital and Medigo could not be inspected (bot wall). Medigo may be largely inactive; this is unverified.
- Treatment Abroad (UK) is a directory where enquiries go to listed providers. The static HTML showed only a HubSpot string. Coordinator-model questions don't really apply to it.
- No Arab-focused facilitator for Germany or India with a published WhatsApp/coordinator workflow was found within the search budget.

---

## 2. Do they promise a personal or dedicated coordinator, and when is that person assigned?

### Takeaway
Yes. "Personal / dedicated / named coordinator (case manager / patient manager)" is the core promise of almost every platform. It is typically **assigned after the first inquiry (form or first message)**, not before. Reviews show a **named person**, usually reaching the patient on WhatsApp after the inquiry. Some platforms (Flymedi; inferred at Bookimed) split the work: one person at intake or consultation, then a separate coordinator for the case.

### Cited Findings
- **Bookimed:**
  - Homepage copy includes "Personal medical coordinator", "Medically trained personal coordinators", "Bookimed medical coordinator stays in touch 24/7 during your treatment" and "Free 24/7 Support During Treatment".
  - Coordinators are specialised by procedure: the copy has a role label "{{procedure}} coordinator" and says "A coordinator who specializes in {{procedure}} … usually finds an option within 2 hours".
  - A patient story says the patient "was immediately introduced to her personal coordinator, Tetiana".
  - Source: [Bookimed homepage HTML (2026-10-10)](https://bookimed.com)
- **Bookimed reviews and staffing:**
  - Trustpilot reviews name individual coordinators ("Liliia acted incredibly quickly and professionally", Sep 2026).
  - A 1★ review (Oct 2026) cites "a lack of clear and consistent communication from my assigned coordinator".
  - Source: [Trustpilot – Bookimed](https://uk.trustpilot.com/review/www.bookimed.com)
  - Bookimed's medical-coordinator job ad (Jul 2025, now inactive) describes the "full cycle of work with the patient" (повний цикл роботи з пацієнтом): assess needs, select a clinic offer, accompany the patient through treatment. Coordinators work **only with "hot" leads**. The channels listed are chat, email and IP telephony, with patient records kept in the CRM. The ad does not mention WhatsApp. — [DOU job posting 298655](https://jobs.dou.ua/companies/bookimed/vacancies/298655/)
  - A Bookimed sales-manager posting describes communicating with patients "via chat, email and IP telephony" alongside the CRM. — [DOU Bookimed vacancies (search summary)](https://jobs.dou.ua/companies/bookimed/vacancies/346557/)
- **Vaidam Health:** "Once you leave enquiry with Vaidam, we assign you a dedicated case manager who will organise everything for you thereafter — including hotel booking, airport transf[ers]…" This is assigned **after the inquiry**. — [Vaidam homepage FAQ (2026-10-10)](https://www.vaidam.com)
- **Flymedi:**
  - Process copy: "Step 2: A coordinator studies your case — A dedicated medical coordinator reviews your case and calls you back within 24 hours."
  - Guarantee: "Free coordinator, reply within 24 hours — A named coordinator answers every question within 24 hours. Free, always."
  - During treatment: "Your coordinator stays reachable on WhatsApp throughout your stay, with translation help."
  - Source: [Flymedi homepage HTML (2026-10-10)](https://www.flymedi.com)
- **Flymedi review showing a handoff:** "My consultation process with Yagmur via WhatsApp was so easy" and then "I was contacted by Aysenur who would be my FlyMedi contact" (Sep 2026). — [Trustpilot – Flymedi](https://www.trustpilot.com/review/flymedi.com)
- **Qunomedical:**
  - Uses the title "Patient Manager" in a "Patient Management Team". A staff profile in the site JSON names Frieda Adler, jobTitle "Patient Manager".
  - A testimonial reads "My patient manager Nicola guided me through every step".
  - UI copy: "Contact your patient manager to request a new one [quote]".
  - "24/7 Patient Support — Our Patient Managers are available to assist you with your booking…"
  - Source: [Qunomedical homepage HTML (2026-10-10)](https://www.qunomedical.com)
- **Qunomedical reviews:** reviews name managers (Yonela, Felix, Mohamad, Vita) and a coordinator "Seher" plus a separate translator "Selin". — [Trustpilot – Qunomedical](https://www.trustpilot.com/review/qunomedical.com)
- **Booking Health:** "24/7 Personal Coordinator in Your Language — Your dedicated health tourism assistant is always available." — [Booking Health homepage HTML (2026-10-10)](https://www.bookinghealth.com)
- **MedSurge India:** "Dedicated Case Manager — You'll get a personal case manager who helps coordinate appointments, interpreters, visa letters, and post treatment care." — [MedSurge India homepage](https://www.medsurgeindia.com)
- **Mozocare:** uses "Care Coordinator" and is careful about scope: "Care coordinators assist with non-clinical support and communication." — [Mozocare how it works](https://www.mozocare.com/how-it-works)
- **Aïro Medical:** "Connect with our high-qualified patient manager". — [Aïro Medical homepage](https://www.airomedical.com)
- **Hospitals Co Egypt:** promises "One Point of Contact", meaning a team rather than a named individual: "deal with the same team from your first message through to your follow-up call at home". — [Hospitals Co Egypt – About](https://hospitalscoegypt.com/about.html)
- **My 1Health (Turkey):** "patients benefit from a dedicated medical tourism facilitator at zero cost", paid for by partner hospitals. — [my1health.com guide](https://my1health.com/guides/medical-tourism-in-turkey-a-step-by-step-guide-for-international-patients) (search-result summary)
- **Bookimed review on a clinic page:** distinguishes the platform coordinator ("Olga") from a separate clinic-side manager who ran the online consultation. — [Bookimed clinic review page (search summary)](https://us-uk.bookimed.com/clinic/reviews/group-florence-nightingale-hospitals/direction=stem-cells/)

### Inferences
- Assignment happens **after a qualifying inquiry** everywhere. No platform assigns a named person before the patient submits something (form, phone verification or first WhatsApp message).
- The shared number is the front door. The named coordinator is then **introduced by name inside the conversation** (for example, Flymedi: "I was contacted by Aysenur who would be my FlyMedi contact"). Whether that message comes from a personal number or the company number isn't stated anywhere public. The company number with a named agent is more likely given the shared-inbox tooling below, but this is an inference.
- There is a common **two-tier model**:
  - an intake / sales / "consultation" person, or a procedure-specialist coordinator, on the platform side;
  - a clinic-side international-patient manager and translator on the ground.
- Patients often see 2–3 named people (Bookimed's "Olga" plus a clinic manager; Qunomedical's Seher plus translator Selin; Flymedi's Yagmur, then Aysenur).
- **Procedure-specialised coordinators** (Bookimed) suggest leads are routed by procedure or specialty, not round-robin.

### Gaps
- No public source says whether coordinators message from personal WhatsApp numbers or from the company WhatsApp Business API number.
- No coordinator photos or profile cards in the inquiry flow could be confirmed. Qunomedical's JSON has staff profiles with a motto field, which suggests "meet your manager" cards, but the UI was not viewed.

---

## 3. Do they qualify the patient before a human takes over (form, records, chatbot)?

### Takeaway
Yes. The dominant pattern is a **short form or messenger opt-in with phone verification**, followed by **medical-records upload** and a free "medical review" or doctor opinion. AI pre-qualification is now appearing (MediGence's Salus; the respond.io AI agent at Praga Medica). Humans work only on "hot" or qualified leads.

### Cited Findings
- **Bookimed:**
  - Multi-step request ending in "Your request is almost ready! Complete it with your number", with "Verify via WhatsApp" or SMS.
  - "Choose a Messenger to Get Free Translation and Medical Records Analysis", "Send Records", "Receive Personalized Recommendations".
  - "Free review of medical documents by top doctors"; "After a free medical review, you'll get exact cost breakdowns."
  - Source: [Bookimed homepage HTML](https://bookimed.com)
  - Coordinators handle only hot leads. — [DOU job posting](https://jobs.dou.ua/companies/bookimed/vacancies/298655/)
- **MediGence:** the AI widget "Salus" (`salus.medigence.com`, `widget/api/classify` endpoint) produces a "Hospital shortlist (Salus-ranked)" and a "Bundled cost estimate", with "Quick Access 24-48 Hours Video Consult". — [MediGence homepage HTML](https://www.medigence.com)
- **Flymedi:** a form described as "About 2 minutes", then a coordinator "studies your case" and calls back within 24 hours. — [Flymedi homepage HTML](https://www.flymedi.com)
- **Vaidam:** "Receive medical opinion and cost estimate within 48 Hours" after the details form. — [Vaidam homepage HTML](https://www.vaidam.com)
- **Qunomedical:** a free teleconsultation ("free of charge — it is an exclusive service for our users") and photo upload ("Submit Photos"). — [Qunomedical homepage HTML](https://www.qunomedical.com)
- **Praga Medica (Prague facilitator) on respond.io:**
  - Set up an AI agent "to collect information from all contacts and filter out spam" so only qualified contacts reach advisors.
  - Moved from web chat to the WhatsApp API so the phone number is captured and pushed to its "industry-specific CRM" via webhooks and HTTP requests.
  - Automated workflows request contact details "when no advisor is available".
  - Reported: 70% more leads recovered, 97% of spam filtered, first-response time halved. These are vendor-reported figures.
  - Source: [respond.io customer story – Praga Medica](https://respond.io/de/customers/praga-medica-recovers-70-percent-more-leads) (localized versions; English URL pattern `respond.io/customers/praga-medica-recovers-70-percent-more-leads`)
- **Hospitals Co Egypt:** Step 1 is to send medical reports and a description via WhatsApp, form or email. Step 2 is a case review by a partner hospital or specialist. — [Hospitals Co Egypt – About](https://hospitalscoegypt.com/about.html)

### Inferences
- **Phone verification and messenger choice** (Bookimed) act as a spam/intent filter and an identity anchor. The verified number becomes the CRM key, so later messages from the same number reach the same case owner.
- The **records-upload step** marks the handoff from "lead" to "case". Coordinators are paid against monthly targets (Bookimed job ad), so the business has a reason to keep humans off unqualified chats.

### Gaps
- No public detail on which chatbot or flow tool Bookimed, Flymedi or Qunomedical use for qualification.

---

## 4. Response-time SLAs, working hours and languages (especially Arabic)

### Takeaway
Advertised SLAs cluster at **"within 24 hours"** for the first human contact or call-back, and **24–48 h** for a medical opinion or quote. "24/7 support" usually means during treatment, not the pre-sales queue. Faster claims ("within 2 hours", "1–2 minutes") come from Bookimed and small Turkish facilitators. Arabic is widely offered (Bookimed, MediGence, PlacidWay, Mozocare, Qunomedical, Booking Health, Hospitals Co Egypt).

### Cited Findings
- **Bookimed:**
  - The UI has a "Typical response:" label (value rendered at runtime).
  - Procedure coordinator "usually finds an option within 2 hours"; "Diagnostics within 5 days".
  - "Bookimed managers speak 11 languages including English, German, and Arabic".
  - Source: [Bookimed homepage HTML](https://bookimed.com)
  - Trustpilot profile: replies to 97% of negative reviews, typically within 24 h. — [Trustpilot – Bookimed](https://uk.trustpilot.com/review/www.bookimed.com)
- **Flymedi:** "Free coordinator, reply within 24 hours"; "calls you back within 24 hours"; "24/7 support during treatment" on WhatsApp. — [Flymedi homepage HTML](https://www.flymedi.com)
- **Vaidam:** "contact you within 24 hours"; "medical opinion and cost estimate within 48 Hours". — [Vaidam homepage HTML](https://www.vaidam.com)
- **MedSurge India:** "get back to you within 24 hours". — [MedSurge India homepage](https://www.medsurgeindia.com)
- **Booking Health:**
  - "a call from us within one business day".
  - Its own positioning text says "Generally agents require anywhere from 24 hours and up to 7 days for feedback to clients".
  - The site has an Arabic UI (an `isArabicUi` check).
  - Source: [Booking Health homepage HTML](https://www.bookinghealth.com)
- **MediGence:**
  - "24/7 Assistance — Round-the-clock by phone, WhatsApp, and Salus"; "24-48 Hours Video Consult".
  - Site languages include Arabic, English, French, German, Russian, Spanish, Portuguese, Uzbek and Kyrgyz.
  - Source: [MediGence homepage HTML](https://www.medigence.com)
- **PlacidWay:** "We're here to help you 24/7". Schema `availableLanguage` lists English, Arabic, Spanish, Hindi, Urdu, Romanian, Tagalog, Russian, German, Italian, French and more. — [PlacidWay homepage HTML](https://www.placidway.com)
- **Mozocare:** "24/7 Patient Support"; Arabic (العربية) language option. — [Mozocare homepage](https://www.mozocare.com)
- **Qunomedical:** "Our 24/7 personalised support service"; the language list includes Arabic. — [Qunomedical homepage HTML](https://www.qunomedical.com)
- **Medical Departures:** "24/7 availability with a 4.6 Rating". — [Medical Departures homepage](https://www.medicaldepartures.com)
- **Lyfboat:** "real people are ready to help you 24 hours a day". — [Lyfboat homepage](https://www.lyfboat.com)
- **Hospitals Co Egypt:** Arabic or English; Sat–Thu 10:00–18:00 (Egyptian working week); no response-time promise. — [Hospitals Co Egypt – About](https://hospitalscoegypt.com/about.html)
- **Alp Medical Travel (Turkey):** "1–2 minutes via WhatsApp or secure form" (languages not stated). — [alpmedicaltravel.com](https://alpmedicaltravel.com/) (search summary)
- **Turkey state service (older, c. 2019 article):** the Health Ministry's International Patient Assistance Unit offers 24/7 oral translation, including Arabic. — [Anadolu Agency](https://www.aa.com.tr/en/health/turkey-gives-7-24-language-support-for-medical-tourists/1488028)

### Inferences
- "24/7" is marketing for availability during the trip. The concrete pre-sales commitment is **24 h to first human contact** (Flymedi, Vaidam, MedSurge, Booking Health).
- A "within 30 minutes" style promise was not found on any major platform. Bookimed's "Typical response:" label suggests it shows a measured response time per coordinator or role, but the value is rendered client-side and could not be read.
- Arabic is a standard selling point. Booking Health is notable for **masking outbound calls as a German or local number**.

### Gaps
- Per-language staffing and hours (for example, whether Arabic is covered in Gulf evening hours) are not published by any platform.

---

## 5. Tooling and routing evidence (CRM, WhatsApp platforms, one coordinator per patient)

### Takeaway
Public evidence is thin. The clearest case is **Praga Medica on respond.io**: shared WhatsApp inbox, AI qualification, sync to an industry CRM. **Bookimed** runs an in-house CRM with chat, email and IP telephony, and coordinators own the full patient cycle. **Flymedi** uses its own signed WhatsApp redirect for attribution. No public case study was found for Bookimed, MediGence, Qunomedical or Flymedi with respond.io, WATI, Kommo, Bitrix24, HubSpot, Zendesk or Freshworks.

### Cited Findings
- **Praga Medica:**
  - Before respond.io it was losing WhatsApp leads because agents "across multiple markets had no shared inbox, no routing logic, and no way to re-engage contacts who went cold".
  - After: everything is "centralized on WhatsApp"; the AI agent filters spam; webhooks sync to its CRM; automation captures details when no advisor is free.
  - Co-founder David Fiala said nobody liked the previous live-chat tool.
  - Source: [respond.io – Praga Medica](https://respond.io/de/customers/praga-medica-recovers-70-percent-more-leads)
- **respond.io** markets a healthcare vertical (AI chat for bookings). — [respond.io/industry/healthcare](https://respond.io/industry/healthcare)
- **WATI:** its case-study index shows no medical-tourism client. The closest is Rockethealth (Indian healthcare), with 25,000+ WhatsApp chats per month and response time cut by 97%. — [WATI – Rockethealth](https://www.wati.io/case-studies/rockethealth/); [WATI case studies](https://www.wati.io/case-studies/)
- **Bookimed:**
  - Coordinators work in a CRM: they fill in patient requests, create profiles and handle records. They contact patients via chat, email and IP telephony, work remote 7–8 h shifts, and must be "willing to contact patients outside working hours". Pay is a fixed salary plus a bonus against a monthly target.
  - Sources: [DOU 298655 (Jul 2025, inactive)](https://jobs.dou.ua/companies/bookimed/vacancies/298655/); [Djinni – Bookimed medical coordinator](https://djinni.co/jobs/677456-medical-coordinator)
  - A former coordinator's CV lists calls, SMS, WhatsApp and Instagram as working tools. This is self-reported. — [work.ua résumé (search summary)](https://www.work.ua/en/resumes/11008896/)
- **Bookimed reply to a 1★ review (Oct 2026):** the patient complained "Now they send me every day whatsapp messages" and "I would never have asked for any information". Bookimed attributed this to "a technical issue within our system", which points to automated WhatsApp follow-up sequences. — [Trustpilot – Bookimed](https://uk.trustpilot.com/review/www.bookimed.com)
- **Estetik International:** a "kommo" string appears in its homepage HTML (Kommo is a WhatsApp-centric sales CRM). The context was not verified. — [Estetik International homepage](https://www.estetikinternational.com)
- **Flymedi:** WhatsApp entry goes through a signed `/wa/` redirect that carries page, template and locale. Analytics are PostHog and Plausible. — [Flymedi homepage HTML](https://www.flymedi.com)
- **MediGence:** in-house AI widget (Salus) with a classification API. — [MediGence homepage HTML](https://www.medigence.com)

### Inferences
- The model these platforms converge on, inferred from the evidence above:
  1. One business WhatsApp number per region.
  2. Source tagging (redirect or pre-filled text).
  3. Phone or identity capture into the CRM.
  4. Bot or form qualification.
  5. Routing to a specialist coordinator, by procedure (Bookimed) or market (Praga Medica's "multiple markets").
  6. That coordinator owns the case "full cycle" and answers from the shared inbox under their own name.
- Keeping "one coordinator per patient" appears to be done by **CRM ownership keyed on the verified phone number**, not by giving out personal numbers. This is inferred; no platform documents it publicly.
- Automated nurture sequences on WhatsApp are in use (Bookimed) and can produce complaints about over-messaging.

### Gaps
- No public vendor case study for Bookimed, MediGence, Qunomedical, Flymedi, Vaidam, PlacidWay or Mozocare.
- No IMTJ or Medical Tourism Magazine article on coordinator routing was found within the search budget.
- Bookimed's CRM and telephony vendor is unknown; the job ads say "CRM" and "IP telephony" only.

---

## 6. What problems do patient reviews report?

### Takeaway
Most reviews praise **named, fast coordinators**. The recurring complaints are:
- over-messaging or pushy follow-ups;
- going silent after payment or when problems arise;
- inconsistent communication from the assigned coordinator;
- confusion about platform versus clinic responsibility.

Explicit complaints about being "passed between multiple people" were rare, but handoffs are visible in the reviews.

### Cited Findings
- **Bookimed:** TrustScore 4.5 from 1,127 reviews; 9% are 1★.
  - Negatives: "a lack of clear and consistent communication from my assigned coordinator" (Oct 2026); daily unsolicited WhatsApp messages (Oct 2026); "patients are just sales volume and commissions" (Sep 2026).
  - Bookimed's replies cast it as "an informational and organizational platform" that does not control clinic refunds.
  - Source: [Trustpilot – Bookimed](https://uk.trustpilot.com/review/www.bookimed.com)
- **Bookimed reviewer on a clinic page:** suggested changing partner clinics, saying the clinic side made evaluation impossible. — [Bookimed clinic page (search summary)](https://us-uk.bookimed.com/clinics/country=turkey/city=tekirdag/direction=check-up/)
- **Qunomedical:** TrustScore 4.4 from 1,368 reviews; Trustpilot flags that it "Hasn't replied to negative reviews".
  - "the near constant messaging and repeated explanations" (Mar 2024)
  - "did not get a single reply" after emailing three addresses (Feb 2026, manager Vita named)
  - "literally stopped responding" (Nov 2025)
  - "responses were slow and ultimately dismissive" (Jan 2026)
  - waited "over ten days to receive a booking date" (Aug 2026)
  - "Took initial payment after endless pressure" (Sep 2026)
  - Source: [Trustpilot – Qunomedical](https://www.trustpilot.com/review/qunomedical.com)
- **Flymedi:** TrustScore 4.7 from 2,226 reviews.
  - Mostly praise for named, quick coordinators (Alexandra, Yagmur, Angela).
  - One review shows the WhatsApp consultation with one person, then a different named contact taking over.
  - Negatives: "The staff were good when they were available" (Aug 2026); a patient reported telling "my coordinator and the driver that something was wrong" (Sep 2026).
  - Source: [Trustpilot – Flymedi](https://www.trustpilot.com/review/flymedi.com)

### Inferences
- **Positive reviews almost always name one coordinator.** Continuity with a single named person is the main driver of satisfaction.
- **Negative patterns** fall into two groups:
  - **Pre-sale over-contact:** automated or pushy WhatsApp follow-ups (Bookimed, Qunomedical).
  - **Post-sale under-contact:** slow or absent replies once paid or during complications (Qunomedical, Flymedi).
- This points to SLA and ownership rules that need to cover the post-payment and recovery phases, not just first response. Handoffs from intake to case coordinator are common and seem accepted when they are announced by name.

### Gaps
- Not checked within budget: Trustpilot pages for MediGence, Vaidam, PlacidWay, Mozocare and Medical Departures; Google reviews; Arabic-language reviews.
- No review explicitly complained about "multiple different people contacting me". Absence in the sampled pages is not proof that it doesn't happen.
