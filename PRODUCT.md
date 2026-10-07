# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: patients and their families or representatives**, mainly from Libya, Sudan, Iraq and Yemen. They are
considering specialist treatment in Egypt and want to understand their options before they travel or pay. They arrive
with whatever medical paperwork they already have, often without a final diagnosis, and frequently act through a
relative or representative. Arabic is the first language for most of them; English is fully supported.

Their jobs:
- send their case without having to choose a specialty or assemble a complete file;
- learn what a Consultant recommends, what it is likely to cost and what happens next, before committing;
- follow their case and respond to proposals through secure links, then through My Care once their account is active.

**Secondary: platform staff**, who work in the authenticated portal and Control Center: coordinators and coordinator
leads, Consultants and their practice teams, operations, finance, identity reviewers, credentialing and system
administrators, and auditors. When patient and staff needs conflict, the patient journey wins.

## Product Purpose

RehletShifaa ("healing journey") coordinates specialist medical care in Egypt for international patients. A patient
shares the medical information they already have; a coordinator prepares the case; a Consultant in the right specialty
reviews it; the patient then receives a recommendation, a cost estimate and the practical next steps, and decides
whether to go ahead.

Success means a patient can make an informed decision about treatment abroad with clear expectations, and each step
after that is coordinated by one person they already know.

## Positioning

- **Consultant review before commitment.** A Consultant reviews the case before the patient travels, pays or decides
  anything.
- **One bilingual coordinator** stays with the patient from the first message through treatment and follow-up.
- **Routing by clinical need.** Patients do not have to pick a specialty or doctor; the case is routed for them.
- **Honest cost staging.** Costs move from a preliminary estimate to a final quote; both are labelled as such, and
  recommendations can change after an in-person assessment.

## Operating Context

- Public journey: home → care areas and Consultant profiles → how it works → **Send my case** (intake with uploads) →
  secure status link → secure proposal link (one-time-code access, acknowledge, request changes or decline) →
  account activation → **My Care**.
- Case recovery: **Track case** with the case number (`RS-YYYY-NNNNNN`) and the WhatsApp number given at intake.
  WhatsApp is the patient's working channel with their coordinator.
- Staff work happens in the portal: ownership queues, review before claiming, case workspaces, Consultant virtual
  clinics, operations and finance stages, identity checks, and the Control Center for people, roles, journeys,
  prices, exchange rates and audit.
- Every patient-facing surface ships in English and Arabic (RTL), and is used on phones as much as desktops.

## Capabilities and Constraints

- Nine care areas, each with Consultants drawn from a sourced directory (`frontend/src/lib/consultants.ts`,
  `care-area-catalog.ts`, `additional-care-areas.ts`).
- Uploads go through private, short-lived links and are virus-scanned. Business authority lives in the backend; the
  UI never decides access.
- Multi-currency pricing (including EGP) with an exchange-rate snapshot fixed per quote; deposits and margin policy
  are part of the commercial workflow.
- Terminology: **Consultant** (capitalised), **coordinator**, **case**, **preliminary estimate**, **final quote**,
  **My Care**, **Send my case**, **Track case**.
- Consultant profiles are CV-sourced and subject to credential review before clinical matching. **Never label a
  profile or Consultant "Verified".**
- Medical copy never offers a diagnosis or promises an outcome; preliminary recommendations and costs are always
  framed as subject to change after in-person assessment.

**Open decisions (do not fill in):**
- Privacy Policy, Terms and Medical Disclaimer are placeholders pending legal review.
- Refund and cancellation terms (8C item F2) and final-quote validity are awaiting legal and business decisions.
- Native Arabic copy review is pending; current Arabic is not yet signed off by a native reviewer.

## Brand Commitments

- Name: RehletShifaa.
- The existing hand-and-heart mark is settled brand equity. Requests to improve "the logo" mean the wordmark beside
  it; confirm before changing the mark.
- Voice: calm, evidence-first and professional. Informational pages lead with facts; calls to action are few and
  quiet, with at most one route to the case form inside page content.

## Evidence on Hand

- Consultant profiles and care-area content sourced from Consultants' CVs.
- Bilingual journey explainer video with posters and voice-over (`frontend/public/media/rehletshifaa-journey-{en,ar}.*`)
  and a hero consultation photo (`frontend/public/media/rehletshifaa-hero-consultation.jpg`).
- **Not available, and must not be fabricated:** patient testimonials, outcome or success-rate figures, case volumes,
  hospital partnerships, accreditations, awards or press.

## Product Principles

1. **Understanding before commitment.** Every surface helps the patient know what happens next and what it costs
   before asking them to act.
2. **One accountable person.** The coordinator relationship is the product; interfaces reinforce continuity, not
   self-service mazes.
3. **Truthful by default.** Say only what is sourced and confirmed; label estimates as estimates and unverified
   credentials as unverified.
4. **Arabic is not a translation.** Arabic and English are equal first-class experiences in layout, copy quality and
   function.
5. **Calm over persuasion.** Patients facing treatment abroad need clarity and restraint, not sales pressure.

## Accessibility & Inclusion

- WCAG 2.2 AA across public and portal surfaces.
- Full English/Arabic parity with RTL layout; layouts must hold from 320px phones upward.
- Patients may act through a family member or representative; flows must work for someone acting on another's
  behalf.
- Never use real patient data in prompts, screenshots, fixtures or live previews.
