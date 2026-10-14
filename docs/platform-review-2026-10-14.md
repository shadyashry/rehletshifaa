# RehletShifaa — Expert panel review (2026-10-14)

Reviewer: Claude (acting as the five-person panel in brief §17). Input: `docs/platform-review-brief.md` plus the
local checkout of `shadyashry/rehletshifaa`, branch `codex/platform-control-plane`.

## 0. How this review was done, and where the code disagrees with the brief

I read the whole brief, then verified the claims in Appendix A against the source. The brief cites commit `7024c00`
as the latest; the branch is four commits ahead (`4f3abf3`, `a180bc2`, `494e650`, `99d5a16`). I reviewed at the
head and checked the cited commit where it mattered. Findings that come from the code say so.

Disagreements between brief and code (the code wins, per your rule):

| # | Brief says | Code says | Consequence |
|---|---|---|---|
| V1 | §2.2 **[Built]** markup 15% | At `7024c00` the seeded platform default was **12%** (`V13`); 15% arrives in `V85__default_margin_15.sql` (commit `494e650`, after the brief) | Brief mislabels a [Decided] item as [Built] at the cited commit. Now true at head. |
| V2 | §2.5 **[Built]** deposit = 15% of **total doctor fees** | At `7024c00` the deposit was a **fixed EGP amount** per policy (`coordinationDepositEgp`). At head (`V84`, `PaymentService.createDepositForAcknowledgement`) it is `policy.of(patientTotalExpectedEgp)`: 15% of the **patient's expected total**, which already includes the 15% markup and any manual/hospital lines | The brief's wording ("doctor fees") and the code's basis ("patient total") differ. The deposit is effectively 17.25% of doctor fees, and it scales with hospital/implant manual lines. Decide which you mean. |
| V3 | §4.3 "[Decided, not built] second factor at sign-in" | Commit `99d5a16` "staff sign in with a second factor; passkeys for privileged roles" touches the realm, the login theme and `KeycloakRealmContractTest` | Appears built after the brief. I did not run the realm to confirm the browser flow enforces OTP for every workforce user; treat as "built, verify live". |
| V4 | §15.3 "Encryption at rest for names, messages, task text, clinical reasons and identity data" | `PatientProfile` stores `given_name`, `family_name`, `whatsapp_number`, `whatsapp_digits` as plain columns; no encrypt call in that entity. `CryptoService` javadoc says "stored PII (e.g. staff names)". Only `email_hash` exists as a blind index | **Patient** names and WhatsApp numbers are plaintext in PostgreSQL. The brief overstates. |
| V5 | §15.3 implies managed key handling | `CryptoService`: AES-256-GCM, key = SHA-256 of one passphrase, default `rehletshifaa-local-dev-only-change-me`, no key id, no rotation | Must fail closed in production and needs envelope encryption + key versioning before real data. |
| V6 | §6 diagram | `CaseTransitionPolicy` also allows `CANCELLED` from `INTAKE_REVIEW`, `INFORMATION_REQUIRED`, `READY_FOR_CONSULTANT` (text in §6 is right; diagram is incomplete). More important: **no exit at all** from `ACCEPTED`, `ARRIVAL_CONFIRMED`, `TREATMENT_IN_PROGRESS`, `DISCHARGED`, `FOLLOW_UP` except the happy path | A patient who acknowledges and never pays is stuck in `ACCEPTED` forever; a patient who arrives and declines the final quote is stuck in `ARRIVAL_CONFIRMED`. See A-01. |
| V7 | §14 journey runtime "covers intake → proposal → profile" | `JourneyStageRegistry` lists 11 stages ending at `COMPLETE_PROFILE` / `RESEND_PROPOSAL_LINK` | Confirmed. Deposit, travel, treatment, follow-up are outside the runtime. |
| V8 | §15.3 observability | `pom.xml` has `spring-boot-starter-actuator` only: no Micrometer registry, Prometheus or OpenTelemetry. ELK is an optional compose file with Filebeat | Logs yes, **metrics and alerting no**. |
| V9 | §7.13 draft clean-up [Decided]; §16.3 retention open | `grep` for retention/purge/erasure in `backend/src/main/java` returns nothing | No deletion, retention or subject-erasure path exists anywhere. |
| V10 | §15.4 "single instance-class" | 16 `@Scheduled` jobs (outbox, reminders, expiry, timers, queue retry, reconciliation…) and **no** ShedLock or leader election | Running two backend replicas would double-fire reminders and timers unless each store claims rows atomically. I did not verify row-claiming in every store. |
| V11 | §7.0 Track case "neutral" | `recoverStatusLink` returns 202 for match and miss; a miss returns early, a match hits the outbox | Response body is neutral; response **time** is not. Minor. |
| V12 | §6 case numbers `RS-YYYY-NNNNNN` | `case_number_seq` is a plain sequence starting at 1 | Numbers are sequential: they reveal volume to anyone who sees two of them and shrink the enumeration space for Track case. |
| V13 | §7.9 bank details | `application.yml` ships `PAYMENT_BANK_IBAN:EG000…`, `Test Bank (dummy details)` defaults | Must fail to start in production when unset, or a real patient could be shown dummy bank details. |

Confirmed as described (sampled): transition map and `TRAVEL_COORDINATION` gate; routing order, scoring, tie-breaks,
case + global locks, `QUEUE_RETRY`; OTP 15 min / 5 attempts / 5 resends per hour / 30-min grant with `SecureRandom`;
step-up 10 minutes; gateway limits 300/60/30 r/m (+600 r/m webhooks), 16 MB body, security headers,
`CF-Connecting-IP`; Meta `X-Hub-Signature-256` with required app secret; Turnstile `siteverify` server-side; deposit
reminders days 1–3 then coordinator; waiver only after a confirmed reference; final quote reuses the locked margin
(`findLockedMargin`); FX snapshot refused when missing; Redis `CacheErrorHandler` degrade; ArchUnit rules (layering,
no cycles, no native queries, tokens carry no authority, Flowable fenced to journey infrastructure); 720 backend
tests, 434 frontend tests (brief: ~727 / ~428). The Oracle deploy option has `scripts/backup.sh`; PITR is documented
only for the target cloud.

Outside knowledge is marked **[OK: confidence]** below.

---

## 1. Executive verdict

1. **The control plane is ahead of the business.** Authority, routing, one-voice messaging, secure links, work items
   and audit are unusually well built for a pre-launch product. The commercial and clinical-network layers are
   thin by comparison: no facility pricing, no payouts, no retention, no outcomes. Launch risk sits in the business
   model and operations, not in the software's ability to move a case.
2. **The deposit is the conversion killer.** 15% of the marked-up total, by international bank transfer, from Libya,
   Sudan, Iraq or Yemen, before any travel is booked, with manual verification. Most of your target patients cannot
   execute that transfer easily **[OK: medium]**. Redesign the deposit before launch (smaller commitment fee, corridor-
   specific methods, agent cash-in) or accept a funnel that dies at `ACCEPTED`.
3. **The hidden markup will not stay hidden.** The patient meets the Consultant in Egypt and will be told the fee.
   The doctor also gains the patient's contact at arrival. Without a non-circumvention agreement, a visible
   "coordination fee" line and a clear value story, the model leaks on both sides.
4. **Every real surgical case needs Finance today**, because hospital, theatre, implant and anaesthesia costs can only
   enter as manual lines. The "catalogue → release immediately" path is the exception, not the rule, for the
   specialties you list. A simple facility price model is a must before launch.
5. **The lifecycle has dead ends.** No exit from `ACCEPTED` (unpaid), `ARRIVAL_CONFIRMED` (final quote declined,
   hospital refuses, patient deteriorates), or `FOLLOW_UP` without a plan. No urgency flag, no complaint, no dispute,
   no deceased/incapacitated handling, no reopen after discharge.
6. **Privacy claims are stronger than the code.** Patient names and WhatsApp numbers are plaintext, the encryption
   key is one passphrase with no rotation, and nothing can delete data. Egypt PDPL, Gulf laws and your own positioning
   ("privacy by design") all need these fixed **[OK: medium on PDPL specifics]**.
7. **Operations has no metrics.** Actuator only; no SLA, funnel or queue dashboards; schedulers assume one instance.
   You cannot run a 2-working-hour promise you cannot measure.
8. **Keep the architecture.** Modular monolith, one transition policy, event-driven handoffs, outbox, immutable
   proposals: all correct for this stage. Do not extend Flowable before launch. Split `JourneyService` (892 lines,
   127 KB, several 400-character lines) along the "one rule per question" boundaries you already named.
9. **The strongest differentiator is unexploited:** "review before you travel, final quote only after examination,
   no surprises". Turn it into a stated guarantee (final quote capped at the preliminary maximum unless scope changes
   with a written reason) and make it the hero of the product and the UI.
10. **Globalisation is a data-model and licensing problem, not a rewrite.** Add a destination/market dimension to
    care areas, policies, base currency and residency; most of the engine is already destination-agnostic.

---

## 2. Findings table

Severity: Critical = blocks a safe or viable launch; High = fix before first paying patient; Medium = first quarter
after launch; Low = backlog. Effort S < 1 week, M 1–4 weeks, L > 1 month.

### A. Journey and process

| ID | Area | Finding | Evidence | Impact | Severity | Recommendation | Effort |
|---|---|---|---|---|---|---|---|
| A-01 | A | No exit from `ACCEPTED`, `ARRIVAL_CONFIRMED`, `TREATMENT_IN_PROGRESS`, `DISCHARGED`, `FOLLOW_UP` except the happy path. An acknowledging patient who never pays, a patient who declines the final quote after arriving, a hospital that refuses the patient, a patient who deteriorates or dies: all leave the case in a stage the policy cannot leave. | §6; `CaseTransitionPolicy` TRANSITIONS map (code) | Stuck cases, wrong dashboards, coordinator capacity consumed forever, no honest patient status | **Critical** | Add `WITHDRAWN` (patient, any stage after `ACCEPTED`), `CANCELLED` from `ARRIVAL_CONFIRMED`/`TREATMENT_IN_PROGRESS` with a typed reason (`HOSPITAL_REFUSED`, `MEDICAL_CONTRAINDICATION`, `PATIENT_DECEASED`, `PATIENT_WITHDREW`, `NO_SHOW`), an `ACCEPTED → EXPIRED/CANCELLED` path after the deposit reminder cycle ends, and `DISCHARGED → CLOSED` when no follow-up is needed. Keep sub-workflow data where it is. | M |
| A-02 | A | No clinical urgency anywhere. A patient with a bleeding aneurysm and a patient wanting elective rhinoplasty enter the same queue, the same 2-working-hour promise and the same offer → accept → review cadence. No triage, no "urgent" flag, no fast path, no instruction to go to local emergency care. | §7.1, §7.4, §8.6 (priority derived only from blocking/due date) | Patient harm and liability; the one scenario that produces a headline | **Critical** | Add a coordinator-set `urgency` (ROUTINE / PRIORITY / URGENT) at intake with a reason; URGENT raises work priority, shortens the Consultant offer deadline, triggers lead alert, and shows a bilingual "if this is an emergency, seek local care now" banner on Send my case and status pages. Medical disclaimer in consent. | S–M |
| A-03 | A | Consultant offer has no deadline. `CONSULTANT_ASSIGNMENT_PENDING` waits until the Consultant acts; I found no expiry job for offers (there is one for proposals and credentials). | §7.5; schedulers list (code) | Patient waits with "Waiting for Consultant" and no bound; coordinator gets no nudge | High | Offer TTL (e.g. 48 working hours) → auto-decline, coordinator work item, Consultant availability penalty after repeated expiry | S |
| A-04 | A | Deposit step blocks on three manual queues with no patient-visible SLA: Finance "Verify the transfer", identity review (when travel requested), and `TRAVEL_COORDINATION` entry. Patient sees "We're checking your payment" indefinitely. | §7.9, §7.8 step 4, §7.2 | Anxiety, duplicate transfers, WhatsApp pressure on the coordinator | High | Publish an internal SLA per queue (Finance 1 working day, identity 2), show "usually within N working days" to the patient, escalate to the Finance Manager on breach, add the SLA to the work item's due date so it becomes HIGH automatically | S |
| A-05 | A | Minors and incapacitated patients: a representative exists, but there is no guardian concept with legal basis (parent, court order), no age capture at intake, and consent for a minor is not distinguished from a representative's acknowledgement. | §3.3, §7.1, §7.8 step 3 | Invalid consent for paediatric cases (several care areas serve children) | High | Add date of birth / age band at intake, a `GUARDIAN` delegation type with evidence requirement, and a separate consent text. Paediatric capability `AGE_GROUP` already exists on the Consultant side: use it. | M |
| A-06 | A | Deceased or incapacitated patient, complaint, dispute, and "complication after return" have no workflow. Follow-up is a data field; there is no "reopen case" or "post-return event". | §7.12, §7.13, §16.4 | Legal exposure, lost learning, no aftercare revenue | High | Minimal set: case-level `incident` record (type, severity, owner, resolution) visible to Compliance; `REOPEN` from `CLOSED` into `FOLLOW_UP` with the same Consultant; complaint intake from My Care routed to the Care Coordination Manager, not the coordinator being complained about | M |
| A-07 | A | Hospital, implant and anaesthesia costs are manual lines → Finance gate on nearly every surgical case. The "release immediately" row of the gate table will be rare. | §2.3, §7.6 table, §16.4 item 2 | Finance becomes the bottleneck; preliminary estimates are slow and inconsistent | High | See B-02. Until then, give Finance a per-care-area "pre-approved manual range" so coordinators can release inside the band without a work item. | M |
| A-08 | A | Final quote is decided after the patient has travelled, with no cap relative to the preliminary range. The point of maximum leverage is also the point of maximum complaint. | §7.11 | Price-escalation disputes, reviews, chargebacks later | High | "No-surprise rule": final quote expected ≤ preliminary **maximum** unless scope changed; a scope change requires a Consultant reason shown to the patient and a 24-hour cooling period before acceptance. Make this a public guarantee (see §5). | S (rule) |
| A-09 | A | Returning patient routes as a new case (S11 not built); a patient with two open cases in different care areas can have two coordinators, contradicting "one coordinator stays with the patient". | §8.5 S11, §1.2 | Two voices, duplicated context, confusion over WhatsApp | Medium | Build S11 (already decided). Add a patient-level "primary coordinator" that wins across cases unless the care-area team differs and the manager overrides. | S |
| A-10 | A | Information requests: no reminder cadence or expiry for `INFORMATION_REQUIRED` (deposit has one; proposals expire). A silent patient keeps a coordinator slot forever. | §7.4; schedulers (code) | Capacity leak; stale cases in queues | Medium | Reuse the deposit reminder pattern: day 2, day 5, then coordinator, then auto-cancel at 30 days with a recoverable path | S |
| A-11 | A | Second opinion is invisible to the patient. A reassuring, paid-for-elsewhere feature is hidden. | §11.4 | Lost trust signal, lost revenue line | Medium | Show "A second specialist reviewed your case" on the proposal when one was given; later sell it (F-03) | S |
| A-12 | A | Care-area change by coordinator without a reason (decided, not built); patient never sees why their case went to Rheumatology instead of Orthopedics. | §7.4 step 2 | Confusion; wrong Consultant match goes unnoticed | Medium | Build the decided item and surface "Reviewed by: <specialty>" on the status page | S |
| A-13 | A | Companions: the travel plan holds companion details; intake, consent and document tasks do not know companions exist until R1. Visa for a companion is usually the long pole **[OK: medium]**. | §7.10, §2.7 | Travel confirmed for the patient, companion stuck | Medium | Companion count at acknowledgement; per-traveller document tasks (part of R1) | M (R1) |
| A-14 | A | Coordinator model under load: capacity is a case count, not effort; a case in `FOLLOW_UP` costs the same slot as one in intake. Reply cover is reply-only; covers cannot progress the case. | §8.2, §8.5 S10 | Under-utilised coordinators; stuck cases during leave | Medium | Weighted capacity by stage (intake 3, proposal 2, travel 2, follow-up 0.5); a "full cover" mode for leave > 3 days that temporarily grants `CASE_OWNER` scope with audit | M |
| A-15 | A | Sequential case numbers leak volume and aid enumeration. | §6; `case_number_seq` (code) | Competitors infer throughput; small help to attackers | Low | Non-sequential public number (e.g. year + 6 random base-32 chars with a check digit); keep UUID internally | S |
| A-16 | A | Track case timing side-channel (early return vs outbox write). | `PublicCaseAccessService.recoverStatusLink` (code) | Theoretical enumeration | Low | Constant-time: always enqueue a no-op or add jitter | S |
| A-17 | A | Practice Manager cannot book slots for patients; Consultant slots exist but nothing uses them. Staff may build parallel scheduling on WhatsApp. | §11.5, §11.6 | Shadow processes | Low | Tie the final-assessment appointment to a slot; let Operations see it | M |

### B. Business model gaps

| ID | Area | Finding | Evidence | Impact | Severity | Recommendation | Effort |
|---|---|---|---|---|---|---|---|
| B-01 | B | Deposit design does not fit the corridors. 15% of a marked-up total (effectively 17.25% of doctor fees, more with hospital lines), by SWIFT transfer, from countries with capital controls, sanctions, or collapsed banking (Libya, Sudan, Yemen) **[OK: medium]**, verified manually, before any travel is booked. | §2.5, §7.9; `PaymentService` basis (code) | Funnel collapses at `ACCEPTED`; coordinators spend their day chasing transfers | **Critical** | Split the deposit into (a) a small fixed **commitment fee** (e.g. USD 100–200 equivalent) that unlocks coordination and is refundable per §2.6, and (b) the balance due at arrival or at travel confirmation. Accept corridor-specific rails: card via an Egyptian PSP for those who have one, cash-in through a vetted agent network in Tripoli/Benghazi/Baghdad/Erbil/Khartoum, and exchange-house transfers. Keep the ledger; add `method` values. | M |
| B-02 | B | No facility pricing model. Hospital, theatre, ICU, implants, anaesthesia are the majority of cost for surgery and arrive as untyped manual lines. No facility contracts, so no guaranteed price and no payout basis. | §2.3, §2.9, §16.4 item 2 | Estimates are guesses; margin on hospital lines is unprotected; Finance bottleneck (A-07) | **Critical** | Model `Facility` (name, accreditation, contact, settlement terms) and a per-facility **package catalogue** (procedure code → range) maintained by Consultant Operations, approved by Finance once, then released without a work item. Keep "no hospital in the consultant workflow"; the facility is a pricing source and a travel-plan destination, not a user. | L |
| B-03 | B | Hidden markup leaks at the bedside. The Consultant knows their fee; the patient learns the package price; the arithmetic is obvious at the final assessment. Fee-splitting rules of the Egyptian Medical Syndicate may also view an undisclosed markup on physician fees as brokerage **[OK: low; needs Egyptian counsel]**. | §2.2, §1.2 | Trust collapse at the worst moment; bypass incentive for both sides | High | Keep the inclusive price but **name** a "coordination & guarantee fee" as part of what the package includes (not itemised in money, itemised in services). Sign Consultants to a non-circumvention and referral agreement with a defined platform service fee. Re-label the margin in contracts as a platform service fee, not a doctor-fee markup. | S–M |
| B-04 | B | No provider payout, settlement or invoicing; money out is undefined. Consultants have no reason to prefer the platform's channel if they are paid late or opaquely. | §2.9, §13 | Cannot operate at all beyond a handful of cases; tax exposure | High | Minimum viable payouts: a per-case settlement statement (provider net from the frozen snapshot, deposits received, balance), Finance "mark paid" with reference, monthly export. Tax invoices per Egyptian e-invoicing rules **[OK: medium]** come with the accounting entity decision. | M |
| B-05 | B | Cash-flow and FX exposure: patient pays in a foreign currency at a frozen rate; providers are paid in EGP; the balance is settled weeks later. EGP has devalued sharply three times since 2022 **[OK: high]**. The validity period of the final quote is open. | §2.4, §2.9 | Margin can be wiped by FX between estimate and arrival, or the platform gains and the patient feels cheated | High | Price the **balance** in EGP at the day-of-payment rate, or re-freeze at final quote with a validity (7–14 days). Hold deposits in the display currency where possible. Add an FX tolerance band setting; outside it, Finance re-approves. | S (rules) |
| B-06 | B | Refund rules not enforced; "always refunded in full if the hospital cancels" has no counter-party contract behind it. | §2.6 | Platform absorbs provider failures | Medium | Enforce §2.6 in `PaymentService` with the cut-off setting; back it with facility/Consultant cancellation terms (B-02, B-03) | M |
| B-07 | B | Unit economics are unknown: no funnel, no cost per case, no coordinator throughput. Markup × doctor fee minus coordinator time may be negative for low-fee care areas (rheumatology, follow-up). | §16.4 item 11 | Cannot price, cannot staff | Medium | Instrument the funnel (E-06), then set a **minimum coordination fee** per case so low-fee cases are not loss-making | S + data |
| B-08 | B | Nothing is monetised before the Consultant review. The highest-intent moment (patient has uploaded a dossier and waits) carries no product. | §2.9 (teleconsultation, second-opinion-only) | Lost revenue; weaker commitment signal | Medium | See F-02/F-03: paid remote second opinion and paid video consultation, both reusing the review flow | M |

### C. Globalisation

| ID | Area | Finding | Evidence | Impact | Severity | Recommendation | Effort |
|---|---|---|---|---|---|---|---|
| C-01 | C | Single base currency and single destination are structural in policies (`commercial_policies`, `deposit_policies` keyed by care area only), catalogues (EGP), and readiness. | §1.3, §2.4, §15.4 | Second destination means data-model surgery later | High (if destination 2 is < 18 months away) | Introduce a `market`/`destination` dimension now on care-area catalogue, policies, base currency and facility; default `EG`. Cheap today, expensive later. | M |
| C-02 | C | Data residency: Egypt PDPL requires a licence for processing sensitive data and for cross-border transfer; the executive regulations were long delayed, enforcement has been light but the licence regime exists **[OK: medium]**. KSA PDPL (in force Sept 2024) treats health data as sensitive and restricts transfer **[OK: medium]**. GDPR applies the moment you market to EU residents (diaspora) **[OK: high]**. HIPAA does not apply to you unless a US covered entity is involved **[OK: high]**. | §9.3 open item, §16.3 | Market entry blocked or illegal; Meta transfer is itself a cross-border transfer | High | Decide the data controller entity and hosting country per market; engineer region-per-market (Postgres, S3, Keycloak realm) behind the existing ports; sign Meta's and the host's data-processing terms before launch | L (legal), M (arch) |
| C-03 | C | Government payers are the largest buyers from Libya and Iraq (treatment-abroad committees, embassy medical offices) **[OK: medium]**; they need a quote addressed to a payer, a guarantee letter, and invoices, none of which exist. | §2.9 | Excluded from the biggest demand pool | High | A `Payer` organisation entity with a payer-facing quote PDF, guarantee-letter upload, and settlement terms. The Payer role exists; give it a document surface, not medical access. | M |
| C-04 | C | Language: EN/AR only; routing has language weights, but Consultant capability `LANGUAGE` and coordinator languages cannot express interpreter support. Next corridors (Francophone Africa, Russian-speaking patients, Somali, Kurdish) need interpreters, not UI locales. | §1.1, §8.2 | Cannot serve beyond Arabic/English | Medium | Separate **UI locale** (add FR next) from **care language** (interpreter as a travel item in R1) | M |
| C-05 | C | Accreditation and credential portability: no facility accreditation (JCI, GAHAR) field, no cross-border licence recognition. | §11.1, §16.4 | Cannot answer "is this hospital accredited?" | Medium | Facility entity with accreditation records and expiry (B-02); Consultant credential types per issuing country | S after B-02 |
| C-06 | C | 24/7 across time zones: service hours are one Cairo window hard-coded in copy; reply timers are single-zone. | §9.2 R10; `IntakeConversationService` (code) | Cannot promise SLAs to a second region | Low now | Service-hours per team with zone; already half-built via intake schedules | S |
| C-07 | C | Interoperability: no FHIR/HL7, no DICOM; uploads are PDFs and images. Fine for now; a hospital partner will ask for a FHIR DocumentReference/Bundle export and imaging transfer. | §15 | Blocks hospital integration later | Low now | Design the case export as a FHIR Bundle (Patient, Condition, DocumentReference, ServiceRequest) when the first facility partner needs it; no earlier | M later |

### D. UI / UX

| ID | Area | Finding | Evidence | Impact | Severity | Recommendation | Effort |
|---|---|---|---|---|---|---|---|
| D-01 | D | The product's unique promise ("a specialist reviews before you decide; final quote only after examination; no surprises") is a positioning line, not a product surface. The proposal page shows ranges and terms; nothing says "this is why you can trust the number". | §1.2, §7.7 | Looks like every other facilitator | High | A "How your price works" panel on the proposal with three fixed steps and the no-surprise guarantee (A-08); the same three steps on the homepage | S |
| D-02 | D | Waiting states name whose move it is (good) but never say how long. Anxious patients fill silence with WhatsApp messages. | §7.14 | Coordinator load; churn | High | Every `WAIT_*` gets an expected window from the SLA table (A-04) and a "what you can do meanwhile" line | S |
| D-03 | D | Consultant trust: public profiles are decided but not rendered; credentials show as a status, not evidence; no outcomes, volumes or photos. | §11.5, §16.2 item 5, §16.4 item 7 | Patients choose on trust and have nothing to hold | High | Render verified profiles with "Credentials reviewed · current" (your wording), years, sub-specialties, languages, case volume on the platform, a 60-second bilingual intro video; no star ratings until volume > 30 cases | M |
| D-04 | D | No signature moments: case sent, Consultant assigned, proposal ready, arrival, discharge are status changes with calm copy. Calm is right; forgettable is not. | §7.14, §15.5 | No emotional memory, no word of mouth | Medium | See §5 of this review | M |
| D-05 | D | Arabic is "fully supported" but written second (every copy decision lands in `en.json` first, Arabic review is open). Arabic typography, numerals and date conventions are not stated in `DESIGN.md`. | §16.3, §15.5; `DESIGN.md` tokens (code) | Arabic reads translated | Medium | Arabic-first copy for patient surfaces, a stated Arabic type scale, Eastern/Western numeral rule per locale, Hijri optional | M |
| D-06 | D | Staff tools: fast and calm is claimed; the case workspace is one large view, and `JourneyService` suggests many actions on one screen. No keyboard-first patterns, no "next case" flow. | §10, §15.5 | Coordinator throughput | Medium | A "My work" queue with keyboard navigation, a per-case "one next action" strip mirroring the patient's current step, and inline reply with templates | M |
| D-07 | D | Control Center still on the legacy theme. | §15.5 | Two products in one | Low | Converge when touched (your rule) | S each |

### E. Architecture

| ID | Area | Finding | Evidence | Impact | Severity | Recommendation | Effort |
|---|---|---|---|---|---|---|---|
| E-01 | E | Patient names and WhatsApp numbers are plaintext; email has a hash; the brief claims names are encrypted. | V4 (code) | Breach impact; PDPL sensitive-data duty; contradicts positioning | **Critical** | Encrypt `given_name`, `family_name`, `whatsapp_number` with the existing `CryptoService` and keep `whatsapp_digits` as an HMAC blind index for matching (routing and recovery only need equality) | M |
| E-02 | E | Key management: one passphrase → SHA-256 → AES key; dev default fallback; no key id; no rotation. | V5 (code) | Cannot rotate after a leak; a mis-set env var silently uses the dev key | **Critical** | Fail startup when the key is the default in a non-dev profile; envelope encryption (data keys wrapped by a KMS key or a versioned master key), `key_version` column on encrypted fields, rotation job | M |
| E-03 | E | No retention, deletion or erasure path. | V9 (code) | Cannot honour subject requests or your own draft clean-up decision | High | Retention policy table (per record class), scheduled purge with audit, subject-erasure that keeps the ledger and audit but pseudonymises the person | M |
| E-04 | E | Schedulers assume one instance; no leader election. | V10 (code) | Horizontal scaling doubles side effects | High (before scaling), Low (single instance) | ShedLock or a `scheduler` profile that runs jobs on one replica only; verify each store claims rows with `SELECT … FOR UPDATE SKIP LOCKED` | S |
| E-05 | E | Observability: logs only; no metrics, no alerts, no SLOs. | V8 (code) | Blind operations; the 2-working-hour promise is unmeasured | High | Micrometer + Prometheus/Grafana (or OTel to a hosted backend); business metrics (queue depth, time-to-proposal, deposit cycle time, outbox failures); alert on dead-letter growth and timer breaches | M |
| E-06 | E | `JourneyService` is a 127 KB god-class with minified-style lines; it owns assignment, reviews, proposals, release, decisions, final quotes, travel, treatment and follow-up. | Appendix A.2; `wc` (code) | Review and change risk; the one file every bug touches | High | Split along the already-named boundaries: `ConsultantAssignmentService`, `ClinicalReviewService`, `ProposalService` (create/release/decide), `FinalQuoteService`, `TreatmentService`, `FollowUpService`. Reformat to normal line lengths. No behaviour change; ArchUnit stays green. | M |
| E-07 | E | Two lifecycle engines: `CaseTransitionPolicy` (truth) and Flowable (runtime for intake → profile). Extending Flowable to arrival → closure would create a second source of truth. | §14, V7 | Divergence; the designer approves journeys the runtime cannot enforce | Medium | Freeze Flowable's role as **definition + history projection + simulation**; do not extend it to enforce stages before launch. Revisit only if you need per-market journey variants. | S (decision) |
| E-08 | E | Production config fails open: dummy bank details and the dev crypto key are defaults. | V13, V5 (code) | Real patient sees "Test Bank"; data encrypted with a public key | High | A production profile validator that refuses to start when any `*_dummy`/default secret is in effect | S |
| E-09 | E | Backups/DR: a script in the Oracle option; PITR only in the documented target; restore never drilled; RTO/RPO open. | §15.4, §16.3 | Unrecoverable loss of health records | High | Managed Postgres with PITR, versioned S3 with cross-region copy, Keycloak realm export nightly, a quarterly restore drill with a written RTO (4 h) / RPO (15 min) | M |
| E-10 | E | Single region, no residency partitioning; blocks C-02. | §15.4 | Market entry | Medium (later) | Region-per-market deployment of the same monolith; the `identity` and `document` ports already isolate the stateful dependencies | L later |
| E-11 | E | Rate limits are per IP; a national mobile carrier NAT in Libya or Sudan can put thousands of patients behind one IP **[OK: medium]**. | §15.3; `nginx.conf` (code) | Legitimate patients throttled at 30 r/m public | Medium | Add per-link/per-case limits (already present for codes) and raise the public IP limit with a Turnstile-backed exemption for `send-my-case` uploads | S |
| E-12 | E | Over-engineering candidates: journey designer/simulator/approval, service accounts, recertification campaigns, three-party ownership transfer: all built before a single patient. | §14, §5 | Maintenance load without revenue | Low | Keep; do not extend. Mark them "frozen" in the roadmap. | — |

### F. Business model enhancements (summary; detail in §3)

| ID | Area | Finding | Evidence | Impact | Severity | Recommendation | Effort |
|---|---|---|---|---|---|---|---|
| F-01 | F | Government and employer payers (Libya, Iraq, Kuwait, Oman) are the largest cheque-writers in these corridors **[OK: medium]**. | §2.9 | Highest-value channel absent | High | Payer organisation + guarantee letter + payer quote (C-03) | M |
| F-02 | F | Paid remote second opinion reuses the built review flow almost entirely. | §11.4, §2.9 | New revenue in weeks | High | Product "Specialist opinion in 5 days" at a fixed fee; the Consultant catalogue gets an `OPINION` service kind | M |
| F-03 | F | Paid video consultation: slots exist; no booking, payment or video. | §11.5, §16.4 item 6 | Pre-travel revenue; higher conversion | Medium | Booking on existing slots + payment adapter + an embedded video provider; keep the record in the case | M–L |
| F-04 | F | Agents/referral partners (Libyan and Iraqi medical-travel agents, hospital liaison offices) drive volume today **[OK: medium]** and are unmodelled. | §2.9 | Volume constrained to organic | High | `Partner` entity with a referral code, attribution on the case, commission statement; partners see status only, never the record | M |
| F-05 | F | Aftercare and chronic programmes (oncology follow-up, rheumatology, hepatology) are recurring revenue and fit the one-coordinator model. | §7.12 | Recurring revenue absent | Medium | "Care continuity" subscription: scheduled video follow-ups, lab-result upload tasks, home-doctor letter | L |
| F-06 | F | Travel margin (R1) and preferred hotel/airline partners. | §2.7 | Ancillary revenue | Medium | R1 as planned; add partner rate cards later | (R1) |

---

## 3. Business model gap analysis and target model

**What works and should stay:** inclusive package pricing with ranges; a single frozen commercial snapshot per version;
the preliminary → final staging; Finance approval only for exceptions; deposit credited to the balance; a versioned
policy per care area.

**What breaks:** the deposit mechanics (B-01), the invisibility of the platform's fee (B-03), the absence of facility
pricing (B-02) and payouts (B-04), and FX timing (B-05).

**Target model**

| Element | Today | Target |
|---|---|---|
| Revenue line 1: coordinated care | 15% markup on doctor fee, hidden | **Platform service fee** inside the package, named as "coordination, guarantee and aftercare" on the proposal; rate per care area and per line type (doctor 15%, facility 8–12%, implants pass-through + handling, travel per R1). Contracts with Consultants and facilities define it as a service fee, not a doctor markup. |
| Revenue line 2: pre-travel products | None | Paid specialist opinion (fixed fee), paid video consultation, both credited 100% against the package if the patient proceeds within 60 days. |
| Revenue line 3: payer channel | None | Payer quote + guarantee letter + invoice; payer pays 100% at confirmation; platform fee may be higher (payers accept it) **[OK: medium]**. |
| Revenue line 4: partners | None | Referral agents with attribution and commission out of the platform fee, never on top of the patient price. |
| Revenue line 5: aftercare | None | Subscription or per-episode follow-up; home-doctor handover letter included. |
| Deposit | 15% of patient total, bank transfer, manual verification | **Commitment fee** (fixed, small, corridor-priced) at acknowledgement; **treatment deposit** (remaining 15% or a per-care-area amount) due at travel confirmation, by any supported rail including cash-in through partners; balance at arrival after the final quote. Finance verification stays; add PSP webhooks when the adapter lands. |
| Refund | Decided rules, not enforced | Enforce §2.6; add "no-surprise guarantee": if the final quote exceeds the preliminary maximum without a documented scope change, the patient may withdraw with a full refund of all deposits and the platform absorbs the travel cost difference up to a cap. |
| FX | Frozen at release; balance exposure unmanaged | Deposit frozen; balance quoted in EGP equivalent at payment day, or final quote re-frozen with 7–14 days validity; tolerance band setting. |
| Payouts | None | Per-case settlement statement from the snapshot; Finance marks paid with reference; monthly provider statements; e-invoice export. |
| Pricing transparency | Ranges, inclusions, exclusions | Keep. Add "what is included" by service, the three-step price story, and the guarantee. |

---

## 4. Globalisation blueprint

**Decisions you must take first**

1. The legal entity per market (who is the data controller and the merchant of record) and where health data is hosted.
2. Whether a second destination (Turkey, Jordan, India, Tunisia) comes before a fourth source market. Destination
   expansion is a data-model change; source-market expansion is a payments and language change.
3. Whether hospitals become a pricing source only (recommended) or a user population (not recommended before 18 months).
4. The payment rails per corridor and who carries FX risk.

**Phase 0 (now → launch, 3 months)**
- Add `market`/`destination` columns with default `EG` to care-area catalogue, commercial and deposit policies,
  facility, currency base and readiness rules (C-01). No behaviour change.
- Facility entity + package catalogue (B-02), payouts statement (B-04), commitment fee + corridor rails (B-01).
- Egypt PDPL licence application, Meta DPA, hosting DPA, consent texts, Arabic legal copy (C-02).
- Payer organisation + guarantee letter (C-03/F-01); partner attribution (F-04).

**Phase 1 (6 months)**
- Paid specialist opinion and video consultation (F-02/F-03) with the payment adapter.
- Region-per-market deployment profile (same monolith, separate Postgres/S3/realm) tested with a second region that
  only serves staff; interpreter as a travel item; FR UI locale.
- Metrics and SLO dashboards (E-05); outcomes capture at discharge and 30/90 days (PROMs light).
- Non-circumvention and service-fee contracts signed with all active Consultants.

**Phase 2 (18 months)**
- Second destination on the same platform: per-destination catalogues, policies, base currency, facility network,
  accreditation records; coordinator teams per destination.
- Partner/white-label API: read-only case status, referral creation, payer quote retrieval; FHIR Bundle export for
  facilities that ask.
- Insurance/TPA pre-authorisation channel if a Gulf insurer signs; otherwise skip.
- Multi-region data residency (KSA/UAE) only when a paying market requires it.

---

## 5. UI/UX concept (within Petrol & Paper, hand-heart logo, calm tone, one primary action)

**Principles**
1. **The dossier is the hero.** The brand already says "clinical dossier". Make the case feel like a physical file
   that gains stamped pages: submitted, reviewed, estimated, confirmed, treated, discharged. Each stamp is a dated,
   signed artefact the patient can keep. No progress bars, no percentages.
2. **Name the human, show the move.** Every screen answers: who is holding my file, what are they doing, how long
   it usually takes, what I can do meanwhile.
3. **Arabic first, mirrored second.** Write patient copy in Arabic, then English. Set an Arabic type scale (larger
   x-height, looser line-height), numerals per locale, and test RTL on a 360-px phone before desktop.
4. **Calm is not silent.** One quiet, well-timed message beats three badges.
5. **Prove, don't claim.** "Credentials reviewed · current", "Reviewed by a second specialist", "Final quote capped
   at your estimate's maximum" are stronger than any adjective.

**Signature moments (concrete)**
1. **Case sent.** After submit, the confirmation page renders the first dossier page: case number as a stamped
   header, "Your file is with <coordinator first name>" once routing has run (it runs synchronously at submission,
   so you can show the name immediately), the service hours, and one button: Continue on WhatsApp. Motion: the page
   slides in like a sheet placed on a desk (200 ms, reduced-motion aware). Anti-pattern to avoid: confetti, "Success!"
   headings, three CTAs.
2. **A specialist is reviewing.** When the Consultant accepts, the status page adds a second stamped page: the
   Consultant's name, specialty, "Credentials reviewed · current", expected review time from their clinic setting, and
   the sentence "Nothing is decided yet". Optional: a 20-second bilingual intro video from the Consultant's public
   profile.
3. **Your estimate is ready.** The proposal opens with the three-step price story (remote review → estimate →
   final quote after examination) and the guarantee, then the recommendation, then the ranges. "What you pay now" is
   a single calm card with the commitment fee and what it unlocks. The acknowledgement checkbox text is in the patient's
   words: "I understand this is an estimate and I want to continue."
4. **Welcome to Egypt.** On `ARRIVAL_CONFIRMED`, My Care turns the current-step card into an arrival card: the
   driver's first name and plate, the hotel, the appointment date with the Consultant, the coordinator's WhatsApp, and
   a one-line Arabic welcome. Operations fills it from the travel plan; no new data.
5. **Discharge summary.** On `DISCHARGED`, a printable bilingual care summary (what was done, medication, follow-up
   dates, who to call) as the last dossier page, with a home-doctor letter. This is the artefact the family shows
   relatives; it is your referral engine.

**Mobile and RTL patterns:** bottom-anchored primary action; the current-step card first, journey strip second,
documents third; file upload with camera capture and per-file scan status; code entry with 6 separate boxes and
auto-advance, LTR digits even in RTL; phone numbers always LTR with `dir="ltr"` and `unicode-bidi: isolate`;
Arabic line-height ≥ 1.7; no text in images; icons that do not imply direction (no arrows for "next").

**Staff tools:** a "My work" list with `j/k` navigation and a one-key "open next"; the case workspace shows the same
"current step" strip the patient sees plus the staff action; reply composer with bilingual templates and the
2-working-hour timer visible; Finance verification as a two-column "patient said / bank shows" screen; Control
Center converges to Petrol & Paper when touched.

**Avoid:** chatbots on the patient path; star ratings under 30 cases; stock photos of smiling surgeons; countdown
timers on deposits; "limited offer" language; red error banners for ordinary waits; dark patterns on the
acknowledgement; animated progress percentages; notification badges that count unread internal events.

---

## 6. Architecture review

**Risks ranked:** E-01/E-02 (plaintext PII, key management), E-03 (no deletion), E-08 (fail-open defaults),
E-09 (DR), E-05 (no metrics), E-04 (schedulers on scale-out), E-06 (god-class), E-07 (two lifecycle engines).

**Target architecture (same monolith, hardened)**

```mermaid
flowchart LR
  subgraph Edge
    CF[Cloudflare CDN/WAF/Turnstile]
    GW[nginx gateway<br/>per-IP + per-link limits]
  end
  subgraph App["App (per market/region)"]
    FE[Next.js]
    BE[Spring Boot monolith<br/>journey split into bounded services]
    SCH[Scheduler role<br/>single leader (ShedLock)]
  end
  subgraph Data
    PG[(Managed PostgreSQL<br/>PITR, encrypted PII + blind indexes)]
    RD[(Redis cache/limits)]
    S3[(Versioned S3 + KMS<br/>cross-region copy)]
    AV[Scanner]
    KMS[KMS / master key<br/>versioned data keys]
  end
  subgraph Identity
    KC[Keycloak realm per market<br/>MFA at sign-in, passkeys]
  end
  subgraph Ops
    MET[Metrics + alerts<br/>Micrometer → Prometheus/Grafana]
    LOG[ECS logs → ELK/OTel]
  end
  subgraph External
    META[Meta Cloud API]
    PSP[Payment adapter<br/>hosted checkout + webhook]
    FX[FX API]
    SMTP[SMTP]
  end
  CF --> FE & GW --> BE
  BE --> PG & RD & S3 & KC & KMS
  SCH --> PG
  S3 --> AV
  BE -- outbox --> META & SMTP & PSP
  META & PSP -- signed webhooks --> GW
  BE --> FX
  BE --> MET & LOG
```

**Go-live checklist (must)**
- [ ] Patient names and WhatsApp numbers encrypted; blind index for matching; migration run on dev with a full
      regression (E-01).
- [ ] Envelope encryption with key version; production refuses default secrets, dummy bank details, missing Meta app
      secret, missing FX source (E-02, E-08).
- [ ] Retention table + purge job + subject-erasure procedure, documented for PDPL (E-03).
- [ ] Managed Postgres with PITR; versioned S3 with cross-region copy; nightly Keycloak export; one restore drill
      passed and timed (E-09).
- [ ] Metrics and alerts for outbox dead letters, reply-timer breaches, queue depth, deposit verification age (E-05).
- [ ] ShedLock or scheduler-only replica before running more than one backend instance (E-04).
- [ ] Lifecycle exits added (A-01); urgency flag (A-02); offer TTL (A-03).
- [ ] MFA at sign-in verified live against the realm for every workforce role (V3).
- [ ] Penetration test, dependency scan, threat model (your own list in `docs/security-and-production-readiness.md`).
- [ ] Legal: PDPL licence, Meta DPA, consent and refund wording, native Arabic copy.

**Should (first quarter)**
- Split `JourneyService` (E-06); freeze Flowable's role (E-07); per-link rate limits (E-11); non-sequential case
  numbers (A-15); facility catalogue (B-02); payouts statement (B-04).

**Can wait**
- Multi-region (E-10); FHIR export (C-07); journey-runtime extension (do not); white-label API.

---

## 7. Top 10 actions for the next 90 days

| # | Action | Success metric |
|---|---|---|
| 1 | Redesign the deposit: commitment fee + treatment deposit at travel confirmation; add two corridor rails (PSP card, partner cash-in) | ≥ 60% of `ACCEPTED` cases reach `TRAVEL_COORDINATION` within 14 days on dev walks with corridor personas; zero cases older than 30 days in `ACCEPTED` |
| 2 | Encrypt patient PII with blind indexes; envelope keys; fail-closed production profile | Column audit shows no plaintext name/phone; startup refuses default secrets in `prod` |
| 3 | Add lifecycle exits, urgency flag, offer TTL and SLA due dates | No case without an allowed exit; 100% of URGENT cases get a Consultant offer within 4 working hours in simulation |
| 4 | Facility entity + package catalogue; Finance pre-approves bands | ≥ 70% of surgical preliminary estimates release without a Finance work item |
| 5 | Payout statements and provider contracts (service fee + non-circumvention) | 100% of active Consultants under contract; monthly statement generated from snapshots |
| 6 | Metrics, SLO dashboard and alerts | Time-to-proposal, reply-timer breach rate and deposit-verification age visible daily; alert on outbox dead letters |
| 7 | Retention/erasure + PDPL licence filing + Meta/hosting DPAs | Policy table live; purge job audited; licence filed |
| 8 | No-surprise guarantee + three-step price story on proposal and homepage; render Consultant public profiles | Proposal acknowledgement rate up vs. baseline on live walks; guarantee text approved by counsel |
| 9 | Payer organisation + guarantee letter + payer quote PDF | One government or employer payer case completed end-to-end on dev |
| 10 | Split `JourneyService`; ShedLock; restore drill | File < 300 lines each; drill RTO ≤ 4 h documented |

---

## 8. Questions back to you

1. Which deposit basis do you intend: doctor fees (brief) or the patient's expected total including markup and
   manual lines (code)? Should hospital/implant lines count toward the deposit?
2. How do your Libyan, Sudanese and Yemeni patients actually move money today (bank, exchange house, cash with a
   relative, agent)? I assumed SWIFT is impractical for most; confirm from your intake conversations.
3. What is the Consultant contract today? Is there any exclusivity, service-fee acknowledgement or
   non-circumvention clause?
4. Who is the merchant of record and data controller: an Egyptian company, and in which jurisdiction do the terms
   sit? This decides PDPL, consumer-protection and tax answers.
5. Do you expect government treatment-abroad committees as payers in year one? If yes, F-01/C-03 moves to "now".
6. Which care areas are elective (plastic, orthopaedics) vs. urgent (interventional neuroradiology, vascular)? The
   urgency design and the SLA table depend on the mix.
7. Is there a facility you already work with that would sign package prices? Without one, B-02 is a catalogue of
   your own estimates, which is still better than manual lines.
8. What is the coordinator's realistic caseload (cases per month) and cost? I could not judge unit economics.
9. Will a second destination come before 18 months? If not, C-01 can be lighter.
10. Is the Flowable journey designer used by anyone today, or is it an investment waiting for a need?
