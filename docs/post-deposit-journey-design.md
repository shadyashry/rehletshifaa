# After the deposit: treatment coordination, arrival, treatment, discharge, follow-up

**Status:** proposal for the owner, 2026-10-14. Based on the code on `feat/review-p0` at `e68dbc5` (dev stack at V94),
the expert review (`platform-review-2026-10-14.md`), the implementation plan, research on how Bookimed, Bumrungrad,
Apollo, Vaidam, Acibadem and Türkiye's USHAŞ regime handle this phase, and the Egyptian rules that apply.

**The question:** the patient has paid the coordination deposit and Finance has confirmed it. What happens next, who
does what, which payments go through the platform and when, and how do we audit every step until follow-up, including
the agreements Consultants make with hospitals on their own?

**The short answer:** the platform already moves the case into treatment coordination correctly, but after that the
journey is a set of data-entry screens with no money, no evidence gates and no patient-facing story. The fix is not
new macro states. It is (1) an **evidence ledger** that every stage must satisfy before the next one opens, (2) a
**three-leg money model** that keeps the platform out of the hospital's cash in the first release but captures every
peso of it as evidence, (3) a **hospital-agreement audit** built on the facility registry you already have, (4) a
**duties contract** for the Consultant, Operations and Finance with service levels, and (5) a legal restructuring of the
15% markup into a disclosed platform fee, because the Egyptian medical ethics regulation forbids doctors from sharing
fees with or using intermediaries.

---

## 1. What is built today, after the deposit

| Step | Built behaviour | Where |
|---|---|---|
| Deposit confirmed | Finance confirms the patient's transfer reference. `CaseHandoffService.onDepositSettled` closes the Finance item, opens the coordinator's work item "Start treatment coordination — deposit received", tells the patient, and moves `ACCEPTED → TRAVEL_COORDINATION` once the readiness gate passes (profile, contact, consents, onboarding). Idempotent; audited as `CASE_DEPOSIT_HANDOFF`. | `journey/application/CaseHandoffService.java`, `CaseTransitionPolicy.java` |
| Coordinator | Current action `ASSIGN_OPERATIONS` (focus) once readiness is complete; `WAIT_OPERATIONS` after. Nothing else is asked of the coordinator until the final quote. | `CaseActionService.stageFallback` |
| Operations | Accepts the offer; focus `UPDATE_TRAVEL_PLAN`. One travel plan per case: planned/confirmed arrival, visa status, flights, airport reception, accommodation, local transport, companions, **facility (picker, P0-5)**, exceptions, status `PLANNING / CONFIRMED / ARRIVED`. `CONFIRMED` requires full readiness (identity when travel was requested). A confirmed arrival moves the case to `ARRIVAL_CONFIRMED`. | `JourneyService.upsertTravel`, V92 |
| Consultant at arrival | Final assessment (recommended treatment, risks, cost lines incl. **facility package lines**) → coordinator's final quote (locked margin, Finance only for exceptions) → secure link → patient accepts / revises / declines; case stays `ARRIVAL_CONFIRMED`. | `saveFinalAssessment`, `createFinalQuote`, `releaseFinalQuote` |
| Consent | Procedure-specific consent (exact text, language, evidence document or provider reference) or audited emergency override with a 2-day review task. | `captureProcedureConsent`, `emergencyOverride` |
| Treatment | Treatment episode: **facility required**, practitioner, start/end, `PLANNED / IN_PROGRESS / COMPLETED`, planned/actual procedures, milestones, complications (free text), discharge-ready flag, clean discharge document. Gate: accepted final quote (if any) + consent. First episode moves to `TREATMENT_IN_PROGRESS`; completion with discharge document moves to `DISCHARGED`. | `JourneyService.treatment` |
| Follow-up | Follow-up plan: due date, mode `VIDEO / PHONE / IN_PERSON`, tests, instructions → `FOLLOW_UP`. Exit `CLOSED`, incl. "no follow-up needed" (P0-2). | `JourneyService.followUp`, `CaseExitService` |
| Patient | Calm waits only: "We are arranging your treatment", "Your arrival is confirmed", "Your treatment is under way", "You are in follow-up". No arrival card, no treatment timeline, no money statement. | `messages/en.json` 1405–1425, `MyCare.tsx` |
| Money | One deposit: 15% of the marked-up medical total, bounded USD 200–1,500, bank transfer or agent cash, Finance verifies against the patient's reference. Refund and waiver recordable. Ledger is append-only. **Nothing after the deposit:** no balance, no invoice, no receipt, no payout. `deposit_components.beneficiary` allows `PROVIDER` and `SUPPLIER` but only `PLATFORM` is used. `facilities.settlement_terms` (`PREPAID / ON_DISCHARGE / NET_15/30/60`) is stored and used by nothing. | `PaymentService`, V15, V84, V89, V90 |
| Audit | Every transition is in `case_status_log`; every service call writes `audit_events` with actor, entity, action, outcome, correlation id. Responsibility per stage: `TRAVEL_COORDINATION → TRAVEL_TEAM`, `ARRIVAL_CONFIRMED / TREATMENT_IN_PROGRESS → HOSPITAL`. | `StaffWorkService.stageDefault` |
| Planned, not built | P1-10 commercial truth (final ≤ preliminary max unless a scope-change reason; 14-day validity; FX band). P1-12 payouts, payer organisations, partners. P1-13 incidents, guardians, reopen. P2-18 R1 travel items. P2-20 signature moments (welcome, discharge summary). P2-24 refund enforcement. DEP-2 payment adapter. | `platform-review-implementation-plan-2026-10-14.md` |

## 2. The gaps, in order of consequence

| # | Gap | Why it matters |
|---|---|---|
| G1 | **No money after the deposit.** The final quote is accepted and treatment can begin with 15% paid. The platform never collects or records the balance, never reconciles the hospital's bill, never pays anyone. | The platform does not know what the patient actually paid, so it cannot defend its price, refund correctly, or pay the Consultant. Revenue is unproven. |
| G2 | **No admission record.** There is no reservation with the facility (date, surgeon, admission letter, price confirmed by the hospital), no hospital pro-forma, no hospital invoice, no reconciliation. The facility registry and Finance-approved packages exist, but nothing ties a real admission to them. | The price shown to the patient and the price the hospital charges are never compared. |
| G3 | **The Consultant's hospital deal is invisible.** The Consultant picks a facility package; the actual arrangement (surgeon share, extras, who bills whom) is off-platform. | Cannot detect inflated bills, kickbacks or side agreements; cannot prove to the patient or a regulator what was charged. |
| G4 | **Treatment is a form, not a process.** No milestone events (admitted, procedure started/done, ICU, ward, stable), no scope-change control after the final quote, no incident workflow, no SLA on Consultant updates. Complications are a text box. | The family hears nothing for days; extras are discovered on the bill; adverse events are not managed. |
| G5 | **Discharge is a document id.** No structured discharge pack (summary, medication list, implant details, fit-to-fly, follow-up dates), no departure logistics, no "fit to fly before you book the return". | The patient flies home without the papers their home doctor needs; a 30-day complication has no owner. |
| G6 | **Follow-up has no execution.** A plan is recorded; nothing schedules the teleconsult, captures the outcome, closes the 30-day window, hands over to a home doctor or asks for a review. No reopen path (P1-13). | No aftercare, no outcomes, no word of mouth, no learning. |
| G7 | **No evidence contract per stage.** Stages change on a staff click. Nothing requires the admission letter before travel is confirmed, the hospital invoice before discharge, the consent before admission (the last one exists). | Audit is a log of clicks, not of proof. |
| G8 | **Legal shape of the 15%.** The markup is baked into the doctor's fee; the patient is quoted the doctor's inflated price and the platform keeps the difference. Under the Egyptian medical ethics regulation this reads as fee-sharing through an intermediary (see §3.1). | Exposure for every Consultant on the platform, and therefore for the platform. |

## 3. The legal frame in Egypt (what it changes in the design)

Verify every item with Egyptian counsel before launch. Sources are listed at the end. The ethics regulation text
below is from a public copy of Ministerial Decree 238/2003; the Syndicate's own page could not be fetched.

### 3.1 Medical profession ethics regulation (Ministerial Decree 238/2003)

- **Article 8(1):** a doctor may not use intermediaries in practising the profession, paid or unpaid
  ("الاستعانة بالوسطاء في مزاولة المهنة سواء كان ذلك بأجر أو بدون أجر").
- **Article 8(3):** no reward or fee of any kind for undertaking to prescribe particular medicines or devices, or for
  sending patients to a hospital, treatment centre, nursing home or pharmacy.
- **Article 8(7):** a doctor may not share their fee with a colleague who did not actually take part in the
  treatment, nor act as an intermediary for another doctor or a hospital in any form.
- **Article 10:** no self-promotion or advertising in any form; **Article 11** allows a limited announcement when
  opening or moving a clinic.
- **Article 13:** no personal gain from the patient beyond the professional fee; **Article 23:** fees must not be
  excessive and must consider the patient's means.

**Consequence.** The platform must not be the doctor's intermediary and must not take a share of the doctor's fee.
The safe shape is the one the review already recommended (B-03): the **patient is the platform's client**; the
platform charges the patient a **disclosed coordination and guarantee fee** on its own invoice; the Consultant's fee
and the hospital's package are passed through at their own prices and paid to them in full. The Consultant pays the
platform nothing and receives nothing from it beyond their fee. Consultant public profiles (P1-14) must be factual
directory entries (name, specialty, credentials, languages, where they practise) with no promotional copy, ratings or
testimonials, because of Article 10. Keep the 15% number if you wish; change what it is called, who it is charged to
and how it is invoiced.

### 3.2 Medical Liability and Patient Safety Law 13/2025

In force since 29 October 2025. Every practitioner and establishment must subscribe to the national liability
**fund**; patient complaints go to technical sub-committees (30-day review) and conciliation committees whose
settlements are enforceable. **Consequence:** record each Consultant's fund subscription as a credential with an
expiry; give every post-arrival incident a record and a route to the committee (P1-13); keep consent, operative notes
and discharge documents as retrievable evidence.

### 3.3 Private medical establishments Law 51/1981

Facilities must be licensed by the governor and registered with the Syndicate; a price list must be posted. The law's
fee committee (Article 12) is contested in practice (the Ministry says it does not set private prices). **Consequence:**
the facility record should carry the licence number and GAHAR accreditation (P0-5 has accreditation records; add the
licence), and the hospital's **own** price confirmation must be on file for every admission.

### 3.4 Personal Data Protection Law 151/2020 and Executive Regulations (PM Decree 816/2025)

Compliance deadline reported as 31 October / 1 November 2026; licence from the Personal Data Protection Center for
processing sensitive (health) data; breach notice to the regulator within 72 hours and to patients within three
business days; licence and explicit consent for cross-border transfer. **Consequence:** a licence application is a
launch blocker; the WhatsApp (Meta) transfer and any foreign hosting need the transfer licence; hospital documents
exchanged through the platform must stay inside the scanned, encrypted document pipeline.

### 3.5 Central Bank of Egypt PSP rules (June 2025)

A business that receives a customer's money into its own account and forwards it to the merchant is a payment
facilitator and now needs a CBE licence or a formal arrangement with a licensed PSP (segregated client funds,
settlement timing, AML). **Consequence:** in the first release the platform should **not** collect the hospital's
money. It collects only what it is itself owed (deposit as a payment for its own services, credited to the patient's
bill, as Bookimed structures it; and its coordination fee). Collecting the hospital package through the platform is a
second phase behind a licensed PSP (DEP-2 adapter).

### 3.6 VAT Law 67/2016 and e-invoicing

Healthcare services are VAT-exempt; a coordination or brokerage service is most likely standard-rated at 14% and must
be issued as an ETA-cleared e-invoice (B2B) or e-receipt (B2C waves). **Consequence:** the platform's fee is a separate
taxable line on its own e-invoice; the medical lines are the providers' exempt invoices. Design the patient statement
accordingly from day one.

### 3.7 Consumer Protection Law 181/2018 (ER 822/2019)

Services must be announced with details, timing and an all-inclusive price; remote contracts carry a 14-day
withdrawal right. **Consequence:** the proposal must state the all-inclusive patient price with the platform fee
visible (P1-10), and the refund policy must be at least as generous as the statutory withdrawal right. The decided
rule (deposit refundable until 10 days before the first confirmed appointment) already is.

### 3.8 National Medical Tourism Council (PM Decision 1688/2025) and GAHAR

The council is defining criteria for providers on a national health-tourism platform; GAHAR accredits facilities
(ISQua-recognised). **Consequence:** prefer GAHAR- or JCI-accredited facilities in the registry; register the platform
with the council when the provider criteria are published.

## 4. What the successful operators do (and what to copy)

| Operator | Practice | Copy into RehletShifaa |
|---|---|---|
| **Bookimed** | The deposit is legally "a payment for our services" and the clinic reduces its bill by that amount; the patient pays the clinic directly; Bookimed never holds treatment money; no markup on the clinic price. | Same legal construction for our deposit and fee (§3.5); patient pays the hospital package at the hospital in phase 1. |
| **Bumrungrad** | Written itemised estimate with explicit exclusions; **full deposit of the estimate before any procedure**; staff never handle a patient's money; excess refunded after the procedure; refunds follow the original payment method. | "Pay to admit" gate before the treatment episode; exclusions on the final quote; refund-to-source rule. |
| **Apollo / Vaidam / HOSMAT (India)** | Full surgical amount (or 90–100% of the estimate) at admission; interim bills during the stay; payment due within hours; excess refunded at discharge. | Interim-bill capture and a running balance in the treatment stage; a tolerance band for extras. |
| **Acibadem (Türkiye)** | Discharge pack: summary, medication list, operative note, implant details, warning signs in plain language, dated follow-up plan; fit-to-fly letter is a separate document from the treating doctor; post-discharge support line. | The structured discharge pack and the fit-to-fly gate (§5, stage 7). |
| **USHAŞ (Türkiye, 2025 regulation)** | Facilitators are certified; the certificate is tied to performance criteria (patient complaints, response time, waiting time) reviewed yearly; 24/7 call centre in two languages. | Our own SLA set and complaint channel (P1-6, P1-13); a performance scorecard per Consultant and facility. |
| **JCI / GHA** | Cost information at admission; consent in a language the patient understands; no abbreviations on documents patients take home; a care continuum from first contact to follow-up at home. | The evidence ledger in §6 mirrors the continuum; consent language is already captured. |

## 5. Target journey after the deposit, stage by stage

Keep the macro states. Add **milestones** (evidence entries) inside them. The patient's strip and the staff's current
action are derived from milestones, exactly as `syncStageWork` derives work items today. One new macro state is
worth adding, `ADMISSION_READY`, because "arrived" and "cleared to be admitted" are different moments for the patient,
for money and for liability; everything else stays as it is.

```
ACCEPTED ──deposit settled + ready──► TRAVEL_COORDINATION ──arrival attested──► ARRIVAL_CONFIRMED
   ──final quote accepted + balance evidenced + consent──► ADMISSION_READY ──admitted──► TREATMENT_IN_PROGRESS
   ──discharge pack complete + bill reconciled──► DISCHARGED ──follow-up plan──► FOLLOW_UP ──window closed──► CLOSED
```

### Stage 1 — Treatment coordination (`TRAVEL_COORDINATION`)

| | |
|---|---|
| Trigger | Deposit settled and patient ready (built). |
| Coordinator | Assign Operations (built). **New:** confirm the **care plan dates** with the Consultant (proposed admission week) and introduce Operations to the patient by name. |
| Consultant | **New:** confirm availability for the admission week and the facility; declare any affiliation with the facility (§7). SLA 2 working days. |
| Operations | **New: reservation** with the facility: admission date, surgeon, procedure/package reference, and the hospital's **pro-forma or admission letter** stating the package price and inclusions, uploaded as a document of type `FACILITY_ADMISSION_LETTER`. Travel items (R1) and logistics as today. Point of no return recorded (decided). |
| Finance | **New:** check the hospital pro-forma against the approved package range and the released preliminary estimate; variance outside the band → `PRICE_VARIANCE` work item before travel is confirmed. |
| Evidence to leave the stage | Admission letter on file and checked; travel confirmed (readiness, built); arrival attested. |
| Patient sees | "Your dates": admission week, facility name and city, Consultant, what to bring (documents, medicines, companion), travel items; a running money line: deposit paid, balance due at admission, fee breakdown. |
| Money | None new. |

### Stage 2 — Arrival (`ARRIVAL_CONFIRMED`)

| | |
|---|---|
| Trigger | Operations records the confirmed arrival (built). **New:** the patient confirms "I have arrived" in My Care or on the status link, or the airport reception confirms; both are evidence entries. |
| Coordinator | Welcome message (signature moment, P2-20); check identity at arrival (passport seen by Operations or the hospital) → `IDENTITY_SEEN_AT_ARRIVAL`. |
| Consultant | In-person assessment within the agreed window (SLA 1–2 days): final assessment (built) with the facility package lines. |
| Finance | Final quote exceptions (built); P1-10 rule: expected ≤ preliminary maximum unless a scope-change reason is recorded and shown. |
| Evidence to leave the stage | Final quote accepted by the patient (built) **and** balance evidence (§6) **and** procedure consent (built). |
| Patient sees | Arrival card: hotel, hospital, first appointment, coordinator's number; then the final quote with "what changed and why". |
| Money | Final quote states, separately: Consultant fee, facility package, implants/consumables, platform coordination fee (taxable), travel (R1), deposit credited, **balance due before admission** and where to pay it. |

### Stage 3 — Admission ready (`ADMISSION_READY`, new)

| | |
|---|---|
| Trigger | Final quote accepted + balance evidenced + consent on file. |
| Operations | Confirms admission date/time with the hospital; hospital **admission number** recorded. |
| Consultant | Confirms the surgical plan (procedure, anaesthesia, expected length of stay). |
| Patient sees | "You are cleared for admission on …". |
| Why a state | It is the point of no return for the hospital; refunds change class here; the patient and the family need an explicit "all clear". |

### Stage 4 — Treatment (`TREATMENT_IN_PROGRESS`)

| | |
|---|---|
| Trigger | Consultant (or Operations on the Consultant's behalf, countersigned) records `ADMITTED` with the hospital admission number. |
| Consultant duties (SLA: each within 24 h of the event) | Milestones: `ADMITTED`, `PROCEDURE_STARTED`, `PROCEDURE_COMPLETED` (operative note reference, implants used), `ICU`, `WARD`, `COMPLICATION` (becomes an incident, P1-13), `STABLE`, `DISCHARGE_PLANNED` (date). Each milestone is one patient-visible calm line. |
| Scope change | **New:** any procedure, implant or extra night outside the accepted final quote is a `CHANGE_ORDER`: Consultant states the clinical reason, Finance prices it against the package/band, the patient or representative accepts it in My Care (step-up) before it is billed, except a documented emergency (then post-event review, like the consent override). Tolerance band (setting, e.g. 10% of the facility package) below which Finance approval alone suffices. |
| Operations | Companion and hotel changes; interim bills from the hospital uploaded as `FACILITY_INTERIM_BILL`. |
| Finance | Records interim bills against the final quote; running variance visible on the case. |
| Evidence to leave the stage | Discharge pack complete (stage 5) and the hospital's final invoice uploaded. |
| Patient / family sees | A treatment timeline with the milestones in plain language, who to call, visiting information; the family representative sees the same. |

### Stage 5 — Discharge (`DISCHARGED`)

| | |
|---|---|
| Trigger | Consultant marks discharge-ready **and** the discharge pack is complete. |
| Discharge pack (documents, each a typed clean document) | `DISCHARGE_SUMMARY` (diagnosis, procedures, pending results, medications with doses and duration, warning signs in plain language — EN/AR), `MEDICATION_LIST`, `OPERATIVE_NOTE` (or reference), `IMPLANT_RECORD` when applicable, `FIT_TO_FLY` (dated; required before Operations books or confirms the return flight; validity window setting, e.g. 72 h), `FOLLOW_UP_PLAN` with the first teleconsult date. |
| Finance | **Reconciliation:** hospital final invoice vs facility package vs accepted final quote vs change orders vs payments. Variance codes (`WITHIN_BAND`, `CHANGE_ORDER`, `UNAPPROVED_EXTRA`, `BILLING_ERROR`). Unapproved extras are disputed with the facility, never passed to the patient silently. Patient statement issued; platform e-invoice for the fee; deposit settled to the facility or netted under its settlement terms. |
| Operations | Return travel and transfer; departure confirmed. |
| Evidence to leave the stage | Pack complete; reconciliation closed or an open dispute recorded; follow-up plan created (built). |
| Patient sees | "Going home": the pack as downloadable documents, the statement, the follow-up date, the 30-day line. |

### Stage 6 — Follow-up (`FOLLOW_UP`)

| | |
|---|---|
| Consultant | Teleconsult at the planned date(s) (VIDEO/PHONE, built as a field): mark done with a short note; outcome questions at day 30 and day 90 (PROMs-light: pain, function, satisfaction, complication yes/no). |
| Coordinator | Day-3 and day-14 check-in messages; **30-day complication window** with a named on-call route (coordinator → Consultant → local emergency). |
| Platform | Home-doctor handover letter (generated from the discharge pack, EN/AR); a review request at closure; reopen path if a complication is reported (P1-13). |
| Exit | `CLOSED` when the window is over and follow-ups are done, or `NO_FOLLOW_UP_NEEDED` (built). |

## 6. The money model: which payments, through whom, at which stage

**Rule 1 — three legs, one statement.** Every case has exactly three money legs, each with its own payee, invoice
and evidence, all shown on one patient statement in the patient's currency at the frozen rate and in EGP.

| Leg | Payee | What | When | Through the platform? | Evidence |
|---|---|---|---|---|---|
| A. Coordination deposit | Platform (credited to the patient's bill) | 15% of the medical total, USD 200–1,500 (built) | At acknowledgement | **Yes** (bank transfer, agent cash; card via DEP-2 later) | Patient reference → Finance confirmation (built) |
| B. Platform fee | Platform | The disclosed coordination and guarantee fee (today's 15%, restructured per §3.1), VAT 14% e-invoiced | Due at the final quote; the deposit covers it first, the rest with the balance | **Yes** | Platform e-invoice + receipt |
| C. Medical package | Facility (hospital package incl. the Consultant's fee when the hospital bills it) and/or Consultant (when billed separately) | The accepted final quote minus the deposit credit and the platform fee | **Before admission** ("pay to admit") | **Phase 1: no** — paid at the hospital cashier against the platform's **admission voucher**; the hospital reports the receipt. **Phase 2: yes**, through a licensed PSP (DEP-2) into a segregated client account, settled to providers under their settlement terms. | Hospital receipt uploaded by Operations or sent by the hospital; PSP webhook in phase 2 |
| D. Change orders / extras | Facility | Approved change orders | During the stay, after approval | As leg C | Change-order record + interim bill |
| E. Travel services (R1) | Platform (then suppliers) or supplier | Visa, hotel, transfers, flights | At travel confirmation; refundable to the point of no return | **Yes** (platform-arranged) | Supplier confirmations |
| F. Refunds | Patient | Deposit per the 10-day rule; travel to the point of no return; overpayment at discharge | On the rule's trigger | **Yes**, to the original method | Refund event in the ledger (built) |
| G. Payouts | Facility / Consultant / suppliers | Deposit credit settled to the facility; platform-collected amounts in phase 2 | Per `facilities.settlement_terms` (built field) | **Yes** | Settlement statement, "mark paid" with reference (P1-12) |

**Rule 2 — the admission voucher (phase 1).** When the final quote is accepted, the platform issues the hospital a
voucher: case number, patient, package reference and price, inclusions, the deposit credit the platform will settle,
the amount the patient pays at the cashier, and the frozen rate. The hospital confirms admission against it and
returns the cashier receipt. The platform never touches the hospital's money, yet the price is fixed by a document
both sides hold, and the reconciliation at discharge has a baseline. This is how the platform honours "what you were
quoted is what you pay" without a CBE licence.

**Rule 3 — pay to admit.** No treatment episode can be opened without balance evidence on file (receipt or PSP
confirmation), in the same way consent gates it today. Emergency exception: Consultant override with a reason and a
Finance review task, as for consent.

**Rule 4 — tolerance band and change orders.** Extras inside the band need Finance only; above it, the patient's
step-up acceptance. Unapproved extras on the final invoice are disputed with the facility, not charged to the patient.

**Rule 5 — statements, not screens.** At the final quote, at discharge and at closure, Finance issues a statement
(PDF, EN/AR): lines, payments, credits, refunds, balance. The platform's own e-invoice is attached. The patient keeps
these; a payer organisation (P1-12) receives the same.

**Rule 6 — refund to source** and the decided cut-offs, enforced in `PaymentService` (P2-24).

## 7. Auditing the Consultant's agreements with hospitals

You cannot and should not stop Consultants from having their own arrangements with hospitals; that is how private
medicine works in Egypt. You can make every case **provable** and make hidden arrangements **visible by their
effects**.

1. **Only registry facilities with Finance-approved packages** (built, P0-5). Add to the facility record: licence
   number (Law 51/1981), GAHAR/JCI accreditation (built), the hospital's **international-patient contact**, and the
   signed **facility agreement** (package validity, price guarantee, cancellation terms, invoice format, no extra
   charges without a change order, data handling).
2. **Declared affiliations.** At onboarding and yearly, each Consultant declares privileges at, employment by, or
   financial interest in each facility they use (`consultant_affiliations`). A case that uses an undeclared facility
   is flagged to Compliance; an undeclared financial interest is a breach of the Consultant agreement.
3. **Two-source price confirmation.** The hospital's pro-forma/admission letter must come from the hospital's named
   contact to the platform, not through the Consultant, and must match the package band. Operations records who sent
   it.
4. **Separate lines, no blending.** The final quote shows the Consultant fee and the hospital package separately
   (even if the hospital collects both), so a blended "surgeon package" cannot hide a mark-up.
5. **Reconciliation at discharge** (§5 stage 5) with variance codes; `UNAPPROVED_EXTRA` on a facility twice in a
   quarter suspends the facility's packages pending review.
6. **Consultant scorecard** (Compliance and Consultant Operations): final-quote-to-preliminary-max ratio, change-order
   ratio, unapproved extras, complication and reopen rate, discharge-pack completeness, follow-up completion, patient
   rating. Thresholds feed availability (the eligibility rule already excludes unavailable Consultants).
7. **Non-circumvention and no-kickback clauses** in the Consultant and facility agreements; a patient-facing line on
   the proposal: "No doctor or hospital pays us for sending you; our fee is shown here." This is also the §3.1 defence.
8. **Sampling audit.** Compliance samples closed cases monthly: compares the hospital invoice, the patient's receipt,
   the statement and the Consultant's fee record. Findings go to incidents (P1-13).
9. **A complaint channel the patient can reach** without the Consultant: the coordinator thread (built) plus a
   "raise a concern" action on My Care that creates an incident visible to Compliance.

## 8. Duties by role after the deposit (summary)

| Role | Must do | Must not |
|---|---|---|
| Coordinator | Keep the one voice to the patient; assign Operations; confirm dates with the Consultant; welcome at arrival; issue the final quote; day-3/14/30 check-ins; close the case | Touch money, consent, clinical fields |
| Consultant | Confirm dates and facility; declare affiliations; in-person assessment and final quote inputs; consent; milestones within 24 h; change-order reasons; discharge pack; fit-to-fly; follow-up contacts; outcomes | Collect money through the platform's name; use an unregistered facility; blend fees |
| Operations | Reservation and admission letter; travel items; arrival attestation and identity seen; admission number; interim bills and final invoice upload; departure after fit-to-fly | Confirm travel before readiness; change prices |
| Finance | Pro-forma check; final-quote exceptions; balance evidence; change-order pricing; interim-bill tracking; reconciliation; statements and e-invoices; settlements and payouts; refunds per rule | Approve their own entries (maker/checker above a threshold) |
| Compliance | Affiliation checks; sampling audits; incident oversight; scorecards | Mutate cases |
| Patient / representative | Confirm arrival; accept the final quote and change orders; pay the balance; receive the pack; answer outcome questions | — |

## 9. The audit design: an evidence ledger, not more logs

Add one table, `case_evidence` (append-only): `case_id`, `stage`, `kind` (enum: `FACILITY_ADMISSION_LETTER`,
`PRICE_VARIANCE_CHECK`, `ARRIVAL_ATTESTED`, `IDENTITY_SEEN`, `BALANCE_RECEIPT`, `ADMISSION_NUMBER`, `MILESTONE_*`,
`CHANGE_ORDER`, `INTERIM_BILL`, `FINAL_INVOICE`, `RECONCILIATION`, `DISCHARGE_SUMMARY`, `MEDICATION_LIST`,
`OPERATIVE_NOTE`, `IMPLANT_RECORD`, `FIT_TO_FLY`, `FOLLOW_UP_DONE`, `OUTCOME_30D`, `OUTCOME_90D`, `HANDOVER_LETTER`),
`document_id` (clean document) or `reference`, `recorded_by` + role, `countersigned_by` + role (required for money
and for anything Operations records on the Consultant's behalf), `recorded_at`, `note` (encrypted), `supersedes`.

- **Stage gates** read the ledger: `CaseTransitionPolicy.entryBlockers(target)` returns the missing evidence kinds, as
  it returns readiness blockers for `TRAVEL_COORDINATION` today. The UI shows them as the stage's checklist.
- **Milestones** are evidence rows; the patient's timeline, the current action and the staff "At a glance" are
  derived from them (one source, as A3 established).
- **Reconciliation** is an evidence row with a structured payload (lines, variance codes) and Finance's countersign.
- **Every money row** points at a ledger event in `payment_events` and at its evidence row; nothing is "paid" without
  a reference.
- **Reports** (Compliance): per case, the evidence trail in order; per Consultant and facility, the scorecard; per
  month, the reconciliation summary and the settlement register. Export as CSV/PDF with the correlation ids.

## 10. Data and code delta (for the implementation plan)

| Area | Change |
|---|---|
| Schema | `case_evidence`; `facility_admissions` (facility, admission date, admission number, surgeon, package, voucher reference, status `RESERVED / CONFIRMED / ADMITTED / DISCHARGED`); `change_orders` (case, episode, reason, lines, EGP, approval chain, status); `consultant_affiliations`; document types for the pack and bills; `ADMISSION_READY` in the status constraint and `CaseTransitionPolicy`; `treatment_milestones` can live in `case_evidence`. |
| Money | `deposit_components` with `PROVIDER` beneficiary for the deposit credit to be settled; `payment_events` gains `BALANCE_EVIDENCED`, `SETTLEMENT_RECORDED`; `statements` (case, kind `FINAL_QUOTE / DISCHARGE / CLOSURE`, PDF document, e-invoice reference). Restructure the margin as a platform fee line type (`PLATFORM_FEE`) on `proposal_items`, shown; the Consultant and facility lines at their own prices. |
| Services | `AdmissionService` (voucher, letter, number); `ChangeOrderService`; `ReconciliationService`; `DischargePackService` (completeness, fit-to-fly window); `FollowUpService` (schedule, outcomes, 30-day window); `EvidenceLedger`; `CaseHandoffService` gains `onBalanceEvidenced`, `onDischargePackComplete`. Treatment episode opening checks balance evidence. |
| Work and SLA | New work types with SLA from `SlaPolicy`: `RESERVE_ADMISSION` (Ops, 3 days), `CHECK_PROFORMA` (Finance, 1 day), `FINAL_ASSESSMENT` (Consultant, 2 days from arrival), `RECORD_MILESTONE` (Consultant, 24 h), `PRICE_CHANGE_ORDER` (Finance, 4 h), `RECONCILE_INVOICE` (Finance, 2 days), `DISCHARGE_PACK` (Consultant, before discharge), `FIT_TO_FLY` (Consultant, before return booking), `FOLLOW_UP_CONTACT` (Consultant, due date), `CHECK_IN_30D` (Coordinator). Escalation to the lead on breach (built pattern). |
| Permissions | `EVIDENCE_RECORD` (Consultant, Operations: case-assigned), `EVIDENCE_COUNTERSIGN` (Finance for money, Consultant for Ops-entered clinical rows), `CHANGE_ORDER_APPROVE` (Finance; patient via `PATIENT_DECIDE`), `RECONCILE` (Finance, step-up), `AFFILIATION_REVIEW` (Compliance). |
| Patient UI | My Care stages: Your dates → Arrival → Final quote → Cleared for admission → Treatment timeline → Going home (pack + statement) → Follow-up. Representative sees the same. Signature moments per P2-20. |
| Staff UI | Case page gains "Admission & money" (voucher, receipts, change orders, reconciliation) and "Treatment timeline"; Consultant portal gains the milestone and discharge-pack forms; Finance workspace redesign (C2) hosts reconciliation and statements. |
| Documents | Pack templates EN/AR; the handover letter generated from structured fields; no abbreviations (JCI). |
| Integration later | PSP adapter (DEP-2) turns leg C into a platform collection with the same evidence rows; hospital e-invoice intake (ETA format) replaces manual invoice upload. |

## 11. Phasing (slots into the existing plan)

| Phase | Content | Depends on |
|---|---|---|
| **P1-10+** (now) | Platform fee restructuring (§3.1), separate lines, statement at final quote, final ≤ preliminary max, validity, FX band. | Owner decision D-A |
| **P1-15 Admission and balance** (new, 2 sessions) | `facility_admissions`, voucher, admission letter + pro-forma check, pay-to-admit gate, `ADMISSION_READY`, balance evidence, receipts. | P1-10 |
| **P1-16 Treatment evidence** (new, 2 sessions) | Evidence ledger, milestones, change orders with tolerance band, interim bills, patient timeline. | P1-15, P1-13 (incidents) |
| **P1-17 Discharge and reconciliation** (new, 2 sessions) | Discharge pack with fit-to-fly gate, final invoice, reconciliation with variance codes, discharge statement and e-invoice, departure. | P1-16, P1-12 (settlement statement) |
| **P1-18 Follow-up execution** (new, 1–2 sessions) | Scheduled contacts, 30/90-day outcomes, 30-day window and on-call route, handover letter, closure survey, reopen. | P1-13 |
| **P1-19 Hospital-agreement audit** (new, 1 session) | Affiliations, scorecards, sampling audit report, facility suspension rule, "raise a concern". | P1-16, P1-17 |
| **P2** | PSP collection of leg C (DEP-2), hospital e-invoice intake, payer statements (P1-12), paid teleconsult after the free window (P2-25). | CBE/PSP partner |

## 12. Decisions for the owner (with my recommendation)

| # | Decision | Recommendation |
|---|---|---|
| D-A | Restructure the 15% as a disclosed platform fee charged to the patient (Consultant and hospital at their own prices)? | **Yes, before launch.** Required by the ethics regulation reading in §3.1 and by consumer-protection price disclosure; it also makes VAT/e-invoicing clean. Counsel to confirm the reading and the VAT rate on the fee. |
| D-B | Phase 1: hospital package paid at the hospital against a platform voucher, platform never holding hospital money? | **Yes.** Avoids CBE payment-facilitation licensing at launch; keeps price control through the voucher and reconciliation. Move to platform collection with a licensed PSP in phase 2. |
| D-C | "Pay to admit": the balance must be evidenced before the treatment episode opens? | **Yes**, with the same emergency override pattern as consent. Bumrungrad/Apollo practice; protects the hospital relationship and the refund logic. |
| D-D | Add `ADMISSION_READY` as a macro state? | **Yes** (one state, well-defined); everything else as milestones in the evidence ledger. |
| D-E | Change-order tolerance band | **10% of the facility package or EGP 15,000, whichever is lower**, Finance-only below, patient step-up above; emergency override with review. |
| D-F | Fit-to-fly validity window | **72 hours** before the flight; Operations cannot confirm the return without it. |
| D-G | Free follow-up window | **30 days** of teleconsult included in the package; paid teleconsult after (P2-25). |
| D-H | Declared affiliations as a condition of Consultant eligibility | **Yes**, yearly, with Compliance review. |
| D-I | PDPL licence application and liability-fund subscription as credential | **Start now**; both are launch blockers in time, not in effort. |

## 13. What this does not change

The macro lifecycle (one map), the one-voice rule, the readiness gate, the deposit mechanics, the immutable commercial
snapshot, the facility and package registry, the work-item and SLA engine. Everything above is layered on them.

---

### Sources

Egyptian law and regulation
- Medical profession ethics regulation (Ministerial Decree 238/2003), public copy: [ar.wikisource](https://ar.wikisource.org/wiki/%D9%84%D8%A7%D8%A6%D8%AD%D8%A9_%D8%A2%D8%AF%D8%A7%D8%A8_%D9%85%D9%87%D9%86%D8%A9_%D8%A7%D9%84%D8%B7%D8%A8_%D9%81%D9%8A_%D9%85%D8%B5%D8%B1); official page: [Egyptian Medical Syndicate](https://www.ems.org.eg/legal/ethics) (not reachable at the time of writing); Dar al-Ifta on paid referrals: [dar-alifta.org](https://www.dar-alifta.org/en/fatwa/details/4047/physicians-referring-patients-to-a-particular-medical-facility-in-return-for-a-fe)
- Medical Liability and Patient Safety Law 13/2025: [Legal 500 summary](https://www.legal500.com/developments/press-releases/egypts-new-medical-liability-law-2025/), [Andersen translation](https://eg.andersen.com/translation-law-13-2025/), [Middle East Insurance Review](https://meinsurancereview.com/News/ViewNewsLetterArticle/id/91533/Type/MiddleEast/Egypt-Law-providing-for-medical-liability-insurance-pool-published-in-Official-Gazette)
- Private medical establishments Law 51/1981: [Sadany & Khalifa guide](https://sadanykhalifa.com/en/single-blog/Guide-to-Licensing-Private-Hospitals-and-Convalescent-Homes), [Al-Manassa on the pricing dispute](https://almanassa.com/en/news/31234), [WHO EMRO private-sector regulation review](https://applications.emro.who.int/dsaf/EMROPUB_2014_EN_1757.pdf)
- PDPL 151/2020 and Executive Regulations 816/2025: [Baker McKenzie](https://www.bakermckenzie.com/-/media/files/insight/publications/2026/01/egypt--important-data-protection-update.pdf), [Kennedys](https://www.kennedyslaw.com/en/thought-leadership/article/2026/egypt-s-personal-data-protection-law-the-compliance-countdown-has-begun/), [ADSERO](https://adsero.me/executive-regulations-issued-for-egypts-personal-data-protection-law-business-impact-and-compliance-considerations/), [Lexis Middle East](https://www.lexismiddleeast.com/eJournal/2026-03-05_1/en)
- CBE payment service provider rules (June 2025): [CBE rules PDF](https://www.cbe.org.eg/-/media/project/cbe/page-content/rich-text/payment-system/payment-systems-and-services-oversight/rules-for-licensing-and-registration-of-payment-system-operators.pdf), [Matouk Bassiouny](https://matoukbassiouny.com/egypts-central-bank-issues-the-licensing-framework-for-psos-and-psps/), [Daily News Egypt](https://www.dailynewsegypt.com/2025/06/21/cbe-issues-new-licensing-framework-for-electronic-payment-service-providers/), [Global Law Experts on escrow/marketplace](https://globallawexperts.com/scaling-fintech-egypt-2026-licensing-payments/), [Al Tamimi (earlier regime)](https://www.tamimi.com/law-update-articles/fintech-in-egypt-be-aware-of-the-regulatory-landscape/)
- VAT and e-invoicing: [PwC Egypt tax summary](https://taxsummaries.pwc.com/Egypt/Corporate/Other-taxes), [e-invoicing.org Egypt](https://e-invoicing.org/egypt/), [Comarch on the 2025 e-receipt wave](https://www.comarch.com/trade-and-services/data-management/legal-regulation-changes/egypt-expands-e-receipt-requirements-for-b2c-transactions-from-september-2025/), [EY VAT updates July 2025](https://taxnews.ey.com/news/2025-1554-egypt-introduces-significant-vat-updates-on-certain-goods-and-services)
- Consumer Protection Law 181/2018: [Mondaq summary](https://www.mondaq.com/Article/820956/New-Egyptian-Consumer-Protection-Law), [UNESCWA text](https://alp.unescwa.org/legislations/law-181-2018-promulgating-consumer-protection-law), [Chambers practice guide 2025](https://gpg-pdf.chambers.com/view/731628805/62/)
- National Medical Tourism Council and GAHAR: [Daily News Egypt, April 2025](https://www.dailynewsegypt.com/2025/04/29/cabinet-approves-establishment-of-national-medical-tourism-council-to-boost-healthcare-sector/), [Mada Masr, Sept 2026](https://www.madamasr.com/en/2026/09/21/feature/politics/future-of-egypt-enters-healthcare-govt-military-hospitals-to-serve-tourist-dollars/), [GAHAR ISQua accreditation](https://sis.gov.eg/en/media-center/news/gahar-gets-isqua-accreditation/), [GAHAR 945 facilities 2025/26](https://www.dailynewsegypt.com/2026/10/06/egypts-healthcare-accreditation-body-certifies-945-facilities-across-26-governorates/)

International practice
- Bookimed: [Payment and deposit terms](https://us-uk.bookimed.com/page/payment-and-deposit-terms/), [Finance policy](https://us-uk.bookimed.com/doc/finance-policy/), [Terms of service](https://us-uk.bookimed.com/doc/terms-of-service/)
- Bumrungrad: [Patient finance information](https://www.bumrungrad.com/en/patient-finance-information), [Finance and insurance guide](https://www.bumrungrad.com/en/medical-travel-guides/patient-finance-insurance-information)
- Apollo / Vaidam / HOSMAT / Reliance: [Apollo admission](https://www.apollohospitals.com/region/bangalore/?p=627), [Vaidam FAQ](https://www.vaidam.com/frequently-asked-questions), [HOSMAT international patients](https://hosmathospitals.com/international-patients), [Reliance Foundation Hospital billing](https://www.rfhospital.org/patients-visitor-services/inpatient-stay/billing)
- Acibadem discharge and aftercare guides: [before discharge](https://acibademinternational.com/patient-guides/at-acibadem-what-international-patients-receive-before-discharge-and-return-travel/), [discharge summary contents](https://acibademinternational.com/patient-guides/what-your-discharge-summary-should-include-before-you-fly-home/), [fit-to-fly](https://acibademinternational.com/patient-guides/fit-to-fly-clearance-after-surgery-in-turkey/), [after discharge](https://acibademinternational.com/patient-guides/at-acibadem-what-happens-after-discharge-and-when-you-return-home/)
- Türkiye USHAŞ 2025 regulation: [Mondaq 2025 update](https://www.mondaq.com/turkey/healthcare/1658834/major-changes-to-turkeys-medical-tourism-sector-2025-regulatory-update), [HealthTürkiye certified providers](https://healthturkiye.gov.tr/certificated-health-service-providers), [TRT World](https://www.trtworld.com/article/196af45af27c)
- JCI and GHA: [JCI hospital standards sample](https://digitalassets.jointcommission.org/api/public/content/assets/3/7/ebjcih24_sample_pages.pdf), [JCI 6th edition review](https://persi.or.id/wp-content/uploads/2018/08/jci6th_intro.pdf), [GHA standards for medical travel](https://www.globalhealthcareaccreditation.com/gha-standards-for-medical-travel), [GHA continuity of care](https://globalhealthcareaccreditation.com/supporting-continuity-of-care-in-medical-travel)
- Facilitator economics and ethics: [MTQUA agency business models](https://mtqua.org/2013/03/17/medical-tourism-agency-business-models/), [Maria Todd on prices and commissions](https://www.linkedin.com/pulse/real-truth-medical-tourism-prices-abroad-maria-k-todd-mha-phd), [SEC-filed 2010 escrow agreement](https://www.sec.gov/Archives/edgar/data/318622/000149315211000396/ex10-7.htm)
- Post-discharge follow-up evidence: [Medical Tourism Magazine on follow-up care](https://www.magazine.medicaltourism.com/article/best-follow-up-care-for-international-patients-2), [The Treatment Registry, post-operative care at a distance](https://thetreatmentregistry.com/guides/post-operative-care-at-a-distance), [ACC on telehealth post-op follow-up](https://www.acc.org/latest-in-cardiology/journal-scans/2013/07/11/16/27/telehealth-follow-up-in-lieu-of-postoperative-clinic-visit-for-ambulatory-surgery)
