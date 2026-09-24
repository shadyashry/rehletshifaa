# Pre-8C commercial copy decisions (COPY-2 outcome)

Date: 2026-09-25 · Branch `codex/platform-control-plane` · Base `f3ce109` · Claude Code.
Source: the business/legal review returned on the [COPY-2 review pack](pre-8c-commercial-copy-review-pack.md). This file is
the **authoritative record** of what that review decided and what it left open. Where the review *recommended* wording but
flagged a legal question, the item is recorded as open. A recommendation is **not** treated as legally approved policy.

Status labels:

- **APPROVED FOR IMPLEMENTATION**: the business approved the wording or behaviour and it is safe to ship. Where noted, the
  legal review of the final wording may still refine it.
- **BUSINESS CONFIRMATION REQUIRED**: the review proposed a value (a number, a rule, a channel) that the business has not
  confirmed.
- **LEGAL DECISION STILL REQUIRED**: needs Egyptian counsel (or counsel for the patient's jurisdiction) before production.

**Scope of this session:** English patient copy only, plus the backend facts that copy depends on. Phase 8C not started. Journey
production intake OFF. No migration. No historical row changed.

## 1. Facts verified in code (corrections to the review brief)

| # | Fact | Evidence |
|---|---|---|
| C1 | **Paying the deposit starts coordination.** "Refundable until coordination starts" in practice meant not refundable once paid. | Deposit settlement drives the case into coordination (`CaseHandoffService`, deposit-settled handoff); `PaymentService.depositPaid` gates travel confirmation |
| C2 | **Deposit terms were accepted after the deposit was already owed.** The deposit is created when the patient acknowledges the preliminary estimate; the terms checkbox came later, at profile activation, with no terms on screen. | `PaymentService.createDepositForAcknowledgement` (called from both proposal decision paths) · `ProfileActivation` consent list |
| C3 | **Exchange rates are daily rows that are either fetched automatically or set by hand.** When the rate feed is enabled, the day's rate is fetched from an external rate service on first use. An authorised manual rate replaces that day's rate. | `CurrencyService.ensureRatesFor` (source `API`), `setOverride` (source `MANUAL`, "wins over the API") |
| C4 | **If a day has no rate, the latest earlier rate is used.** | `CurrencyService.effectiveRate` → `latestOnOrBefore` |
| C5 | **A proposal stores its rate when it is sent (released)**: `fx_rate`, `fx_rate_date` (release day) and `fx_source`, and every line is frozen to it. The deposit uses the same frozen rate. A later rate change never changes a released document. | `JourneyService` release / final-quote release |
| C6 | **A preliminary estimate is acknowledged, not accepted.** The decision is `ACKNOWLEDGED`, and it is not a binding final price. The final treatment plan and quote is *accepted*. | `decideProposalPublic` / `decideProposal` |
| C7 | A signed-in patient can also acknowledge an estimate, from the My Care proposal drawer (`PatientProposalDecision`). F1 therefore applies there too. | `CaseMessages.PatientProposalDecision` |
| C8 | Nothing blocks treatment on an unpaid **remaining balance**. The treatment gate checks the accepted final quote, the deposit and consent evidence only. | `JourneyService` treatment gate |
| C9 | The deposit refund class column allows only `REFUNDABLE`, `NON_REFUNDABLE`, `PARTIALLY_REFUNDABLE` (V15 CHECK). None of these truthfully represents *conditional* refund eligibility. | `V15__deposits_and_payment_ledger.sql` |

## 2. Decisions by item

| # | Item | Returned decision | Status |
|---|---|---|---|
| 1 | Coordination deposit — concept and description | Short description approved (text in §3). Earned when RehletShifaa confirms the first appointment/booking. Deducted from the final package price on the final patient invoice. Never a fee, provider charge, treatment or hospital payment. | **APPROVED FOR IMPLEMENTATION** |
| 1a | Deposit refundability — *business direction* | Conditional: full refund before the first confirmed appointment/booking; full refund if RehletShifaa cannot arrange care, the provider does not accept the case, or the treating doctor decides treatment is not suitable; no refund after the first confirmed appointment/booking if the patient cancels or does not attend; a change of provider keeps the deposit credited to the case. | **APPROVED FOR IMPLEMENTATION** as patient copy |
| 1b | Deposit refundability — *enforceability* | Whether the no-refund rule can be enforced (Consumer Protection Law 181/2018; cancellation rights for remotely made contracts) | **LEGAL DECISION STILL REQUIRED** |
| 2 | Refund processing time ("within 14 days") | Proposed only | **BUSINESS CONFIRMATION REQUIRED** — not shown |
| 2a | Refund method ("to the original payment method") | Proposed only | **BUSINESS CONFIRMATION REQUIRED** — not shown |
| 3 | Cancellation — deposit | "You can cancel at any time by telling your coordinator…", with the refund terms above deciding what is returned | **APPROVED FOR IMPLEMENTATION** |
| 3a | Cancellation / no-show charges for provider services after the final quote | Depends on provider contracts, which the product does not store. The promise "we will show you these charges before you accept" is **not** made. | **LEGAL DECISION STILL REQUIRED** + **BUSINESS CONFIRMATION REQUIRED** |
| 4 | Terms before acceptance (F1) | Full short-form terms shown inline before the estimate is acknowledged **and** again above the activation consent checkbox. A link to full terms is optional. | **APPROVED FOR IMPLEMENTATION** |
| 4a | Activation checkbox wording | "I have read the coordination deposit, refund and cancellation terms shown above and accept them." | **APPROVED FOR IMPLEMENTATION** |
| 5 | Preliminary care estimate — non-binding statement, basis, "may increase or decrease", final quote before non-emergency treatment | Approved (text in §3). Basis = remote review of the medical information the patient provided; consultant-recommended services and their current prices; listed assumptions; RehletShifaa's stored exchange rate on the date issued. | **APPROVED FOR IMPLEMENTATION** |
| 5a | Estimate price presentation | A stored low/high range must be shown as a range with the expected figure, never "Expected" alone | **APPROVED FOR IMPLEMENTATION** |
| 5b | Included / not included | Included: listed services, RehletShifaa care coordination. Not included unless listed: flights, visas, accommodation, local transport, companion costs, additional tests or procedures, treatment of complications. | **APPROVED FOR IMPLEMENTATION** (preliminary estimate) |
| 5c | Taxes included or excluded | No statement allowed yet | **LEGAL DECISION STILL REQUIRED** (ETA VAT / invoicing) |
| 6 | Final treatment plan and quote — meaning | Prepared after the in-person assessment; covers the confirmed listed services at the price shown; changes need a revised quote the patient accepts; the quote's exchange rate is fixed while it is valid; accepting is not medical consent. | **APPROVED FOR IMPLEMENTATION** |
| 6a | The word "binding" / "financial agreement" for the final quote | Recommended, but legal questions remain (emergency treatment, provider liability). The product states factual behaviour instead. | **LEGAL DECISION STILL REQUIRED** |
| 6b | Emergency additional-treatment cost clause | Not introduced | **LEGAL DECISION STILL REQUIRED** |
| 7 | Validity — preliminary estimate | 14 days | **APPROVED FOR IMPLEMENTATION** (unchanged behaviour) |
| 7a | Validity — final quote | 14 days is under business/provider review (the review suggested 7 days or the day before treatment). **Unchanged at 14 days**; no frontend-only rule. | **BUSINESS CONFIRMATION REQUIRED** + **LEGAL DECISION STILL REQUIRED** |
| 7b | After expiry | Estimate: "…has expired and can no longer be acknowledged". Quote: "…can no longer be accepted". Both: contact your coordinator for an updated version, which may have different prices and exchange rate. No promise about the deposit beyond current behaviour. | **APPROVED FOR IMPLEMENTATION** |
| 8 | Payment terms | Deposit due after acknowledging the preliminary estimate; coordination begins once it is received; remaining balance as set out in the final treatment plan and quote, before treatment unless that quote states otherwise; offline, coordinator-provided instructions; no card details taken on the platform. | **APPROVED FOR IMPLEMENTATION** |
| 8a | Enforcing the remaining balance before treatment | The product does **not** gate treatment on it (C8). The copy does not claim it does. | **BUSINESS CONFIRMATION REQUIRED** (future control decision) |
| 9 | Exchange-rate explanation (F4) | Short form: "The exchange rate used in your proposal is fixed for that proposal." Full form: "Amounts in [currency] are converted using RehletShifaa's exchange rate for [date]. This rate is fixed for this estimate/quote while it is valid. A new estimate or quote may use a different rate." Never "live", "real-time", "official" or "Central Bank". | **APPROVED FOR IMPLEMENTATION** |
| 9a | "Your bank or payment provider may apply its own exchange rate and fees." | Left pending with the currency question | **LEGAL DECISION STILL REQUIRED** — not shown |
| 9b | Which currency is legally payable; who pays conversion/bank fees (CBE rules) | — | **LEGAL DECISION STILL REQUIRED** |
| 10 | General disclaimers | "Preliminary estimate is not a price guarantee", "Accepting a quote is not medical consent", "No medical outcome is guaranteed", "This service is not for emergencies. In an emergency, contact local emergency services." Each shown once, at the most relevant point. | **APPROVED FOR IMPLEMENTATION** |
| 10a | RehletShifaa as provider / agent / broker / medical provider (principal vs agent), especially for Direct consultants | No wording added | **LEGAL DECISION STILL REQUIRED** |
| 11 | Other jurisdictions (EU/Gulf consumer law) and which language governs (Arabic or English) | — | **LEGAL DECISION STILL REQUIRED** |
| 12 | Arabic wording of all commercial/legal terms (M1–M4, X1–X3 and the new rows in the Arabic pack) | Native Arabic review not returned | **WAITING FOR ARABIC REVIEW** |

## 3. Approved English wording as implemented

Single source: `frontend/src/lib/commercial-terms.ts` (version `deposit-terms-2026-09-25`).

**Coordination deposit, refunds and cancellation** (estimate, before acknowledgement · activation, above the consent · signed-in
estimate decision):

> You pay this deposit after you acknowledge your preliminary estimate, before we make any appointments or bookings for you. It
> covers starting your care coordination: contacting providers, scheduling your assessment and arranging your care. The full
> deposit is deducted from the price in your final treatment plan and quote.
>
> **Refunds of your coordination deposit**
> • Full refund if you cancel before we confirm any appointment or booking for you.
> • Full refund if we cannot arrange your care, the provider does not accept your case, or the treating doctor decides the
> treatment is not suitable for you.
> • No refund if you cancel, or do not attend, after we have confirmed an appointment or booking for you.
> • If you change provider, your deposit stays with your case and is still deducted from your final price.
>
> **Cancellation** — You can cancel at any time by telling your coordinator. Whether your deposit is refunded depends on the terms
> above.
>
> **How to pay** — Your coordinator sends you the payment instructions. We start coordinating your care once your deposit is
> received. We never take card details on this website.
>
> *(foreign currency only)* The exchange rate used in your proposal is fixed for that proposal.

Not included, on purpose: refund processing time, refund method, provider cancellation charges, bank fees.

**Activation consent:** "I have read the coordination deposit, refund and cancellation terms shown above and accept them."

**Preliminary care estimate:** "This is a preliminary, non-binding estimate, not a final price or a price guarantee." · *What this
estimate is based on:* a remote review of the medical information you provided; your consultant's recommended services and
their current prices; the assumptions listed in this estimate (only when there are any); RehletShifaa's stored exchange rate on
the date it was issued (foreign currency only). · "Your treatment and its price may increase or decrease after your treating
doctor examines you in person. You will receive a final treatment plan and quote to accept or decline before any non-emergency
treatment." · "RehletShifaa's care coordination is included in this price." · *Not included unless listed:* the seven items
in §2 row 5b.

**Final treatment plan and quote:** "Prepared after your in-person assessment. It covers the confirmed services listed, at the
price shown. Changes to the confirmed services need a revised quote, which you will be asked to accept." · Checkbox: "I accept
this final treatment plan and quote for the confirmed services listed, at the price shown." · "Accepting this quote is not
medical consent. Your treating doctor will ask for separate informed consent before treatment." · *Payment:* "The remaining
balance is due before treatment begins, unless this quote states otherwise. Your coordinator sends you the payment
instructions. We never take card details on this website."

**Exchange rate (documents):** "Amounts in {currency} are converted using RehletShifaa's exchange rate for {release day}. This rate
is fixed for this {estimate|quote} while it is valid. A new estimate or quote may use a different rate." (Legacy versions without a
stored day say "…on the date this {estimate|quote} was issued.")

**Disclaimer footer (proposal document):** "No medical outcome is guaranteed. This service is not for emergencies. In an
emergency, contact local emergency services."

## 4. Wording that must NOT be used

"Refundable before coordination starts" (any form); "credited to your final balance" (replaced); "accepted estimate", "accepted
care estimate", "approved estimate", "accept"/"approve" for a preliminary estimate; "binding" or "financial agreement" for either
document (only "non-binding" for the estimate); "guaranteed price", "fixed price" (except the FX rate "fixed for this
estimate/quote"), "all-inclusive", "no hidden costs", "free cancellation"; "live", "real-time", "official" or "Central Bank"
rate; "fee" for the deposit, or calling it a provider, hospital or treatment payment; "Payment schedule to be confirmed",
"Subject to provider terms", "Services not explicitly included"; "within 14 days" for refunds; "We will show you these charges
before you accept"; any wording that makes RehletShifaa provider, agent, broker or medical provider; any tax
included/excluded statement; any promise about emergency-treatment costs.

## 5. Finding status

| Finding | Status | Detail |
|---|---|---|
| **F1** Consent to unseen deposit terms | **IMPLEMENTED, subject to final legal copy wording** | Terms inline on the preliminary estimate before acknowledgement (secure link and signed-in drawer) and above the activation checkbox. The checkbox references them (`aria-describedby`). The consent record now stores the exact checkbox text shown and `policy_version = deposit-terms-2026-09-25`. Existing consents keep `v1`. Proposal acknowledgement evidence version bumped to `proposal-ack-2026-09-25`. Arabic pages show the English terms with an Arabic notice. The signed-in drawer shows the terms without an amount, because its payload has no anticipated deposit (follow-up). |
| **F2** Refund class contradicts refund text | **BLOCKED — LEGAL DECISION STILL REQUIRED** | *Conditional refund eligibility is not represented accurately by the current model.* `PARTIALLY_REFUNDABLE` means a partial amount and is not used. `CONDITIONAL` is not added: enforceability is unresolved, and adding a value would imply the rule is legally settled. New deposit components keep `refundability = NON_REFUNDABLE` (unchanged) and their terms text is now neutral: "Deducted from the final treatment plan and quote price. Refund and cancellation terms: as shown to the patient (deposit-terms-2026-09-25). Refund classification awaits a legal decision." The contradictory "refundable before coordination begins" text is no longer written. **Historical rows are unchanged** (no migration): they may be agreements already presented to patients. Any future migration must be explicit and reviewed. The refund class is not read by any logic or UI (Finance decides refunds by hand). |
| **F3** Placeholder payment/refund terms, fixed 14-day validity | **PARTIAL** | New preliminary estimates no longer store "Services not explicitly included", "Subject to provider terms" or the English-only disclaimer. `payment_terms` stores the approved factual record (class A, below). `refund_terms` is left empty while its legal status is open (class B). The patient document never renders stored placeholders (legacy rows keep them in the record). Open: final-quote validity (still 14 days), provider cancellation terms. |
| **F4** No patient-facing FX explanation | **IMPLEMENTED** | Proposal document (both types, foreign currency only) names the stored rate's day (`PublicProposalView.fxRateDate`, additive) and states that it is fixed for the document. Short form on the deposit terms. Arabic pages show the English sentence (Arabic pending). |

F3 classification of placeholder fields on proposals:

| Field | Old value (new versions) | Class | New value (new versions) | Historical versions |
|---|---|---|---|---|
| `payment_terms` | "Payment schedule to be confirmed" | **A** — safe to replace with approved facts | `PROPOSAL_PAYMENT_TERMS_RECORD` (approved payment facts, English, not rendered to patients) | Unchanged |
| `refund_terms` | "Subject to provider terms" | **B** — unresolved legal policy | Not stored (NULL; column nullable) | Unchanged |
| `excluded_services` | "Services not explicitly included" | **A** — the approved exclusion list is rendered by the document | Not stored | Unchanged; filtered at render |
| `disclaimers` | "This proposal is not procedure-specific medical consent." (English only) | **A** — replaced by approved copy at the right point | Not stored | Unchanged; still shown for those versions |
| `valid_until` | +14 days (both documents) | Estimate **approved**; final quote **open** | Unchanged | Unchanged |

## 6. Gate

Phase 8C entry stays **NO** while any of these remain: F2 / refund enforceability; provider cancellation-charge policy;
final-quote validity; principal-vs-agent wording (if production copy needs it); tax/currency legal wording; native Arabic
approval. No product-leadership exception has been recorded. If one is made (testing Phase 8C with these as known
pre-production blockers), it must be recorded separately and not by editing this file's statuses.
