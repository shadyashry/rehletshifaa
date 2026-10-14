# Kickoff prompts for the review implementation phases

Paste one block into a **new** Claude Code session per phase. Set the model, effort and fast mode as the header
says before sending. Plan: `docs/platform-review-implementation-plan-2026-10-14.md`. Review:
`docs/platform-review-2026-10-14.md`.

Common tail for every prompt (already included below): verify first, then build; commit when green; do not push;
update the plan file's phase entry with what was delivered, tests, open gaps and the next action.

---

## P0-1 — Patient PII encryption, key versioning, fail-closed production
Model: Fable 5.1 · Effort: xhigh · Fast: off · Sessions: 2

```
Implement phase P0-1 of docs/platform-review-implementation-plan-2026-10-14.md (findings E-01, E-02, E-08, V13 in
docs/platform-review-2026-10-14.md).

Scope, in this order:
1. Encrypt patient_profiles.given_name, family_name and whatsapp_number with CryptoService; add whatsapp_hmac as an
   HMAC blind index and switch routing, status-link recovery (PublicCaseAccessService.samePhone) and WhatsApp inbound
   matching to it. One Flyway migration (next free version), pre-production clean cutover: no dual-read.
2. Add key_version to every encrypted column family; envelope encryption (master key from env wraps versioned data
   keys); a rotation job that re-encrypts and bumps key_version.
3. A prod-profile guard that refuses to start when the crypto key is the default, bank details are the dummy
   defaults, the Meta app secret is missing, or the FX source is missing.

Constraints: AGENTS.md and CLAUDE.md rules; ArchUnit stays green; full backend suite (mvn -o) and the PostgreSQL
mapping proof must pass. Delegate reformatting and test scaffolds to the mechanical-worker subagent. Do not change
the case lifecycle or payment logic in this phase.

Commit when green with a conventional message. Do not push. Finish by updating the P0-1 entry in the plan file with
delivered work, tests, open gaps and the next exact action.
```

## P0-2 — Lifecycle exits
Model: Fable 5.1 · Effort: high · Fast: off · Sessions: 1–2

```
Implement phase P0-2 (finding A-01, V6). In journey/application/CaseTransitionPolicy.java add: ACCEPTED -> EXPIRED
(when the deposit reminder cycle ends unpaid) and ACCEPTED -> CANCELLED; ARRIVAL_CONFIRMED, TREATMENT_IN_PROGRESS,
DISCHARGED, FOLLOW_UP -> CANCELLED with a typed reason (PATIENT_WITHDREW, HOSPITAL_REFUSED, MEDICAL_CONTRAINDICATION,
PATIENT_DECEASED, NO_SHOW); DISCHARGED -> CLOSED when the Consultant records "no follow-up needed"; a patient
"withdraw" action from My Care after ACCEPTED. Store the reason in a new table (next Flyway version). Make
StaffWorkService.syncStageWork close open work on every exit and CaseActionService return NONE with a calm,
bilingual status word per exit (en.json and ar.json). Add a property test: every non-terminal stage has at least one
exit. Verify first, build second, full backend suite green, commit, do not push, update the P0-2 plan entry.
```

## P0-3 — Clinical urgency and emergency guidance
Model: Opus 5.5 · Effort: medium · Fast: on · Sessions: 1

```
Implement phase P0-3 (finding A-02). Add a coordinator-set urgency (ROUTINE / PRIORITY / URGENT) with a mandatory
reason on the case, settable at intake and during review (new Flyway version). URGENT: work priority HIGH in
StaffWorkService, Consultant offer deadline halved (if P1-6 is not built yet, record the intent in a TODO in the plan
file), lead alert, and a routing tie-break in CoordinatorScoringService. Add a bilingual "If this is an emergency,
seek local care now" banner to Send my case (CaseForm.tsx), the status link (CaseStatusAccess.tsx) and My Care, and a
medical disclaimer line in the consent record. Copy in en.json and ar.json; logical CSS only; WCAG 2.2 AA. Use the
mechanical-worker subagent for the i18n sweep. Tests for priority derivation and tie-break. Commit when green, do
not push, update the P0-3 plan entry.
```

## P0-4 — Deposit redesign (needs owner decisions first)
Model: Fable 5.1 · Effort: high · Fast: off · Sessions: 2

Fill in before sending: commitment fee per currency: ____ ; treatment-deposit basis: doctor fees / patient total ;
launch rails: ____ .

```
Implement phase P0-4 (finding B-01, V2) with these owner decisions: commitment fee = <amount per currency>;
treatment deposit = 15% of <doctor fees | patient expected total>; rails at launch = <list>.

Build two deposit components on the existing deposit components model: COMMITMENT due at acknowledgement (unlocks
coordination; CustomerReadinessService and CaseTransitionPolicy.entryBlockers consume this one only) and TREATMENT
due at travel confirmation (JourneyService.upsertTravel confirm gate requires it settled). Extend the payment method
enum with CARD, AGENT_CASH, EXCHANGE_HOUSE; Finance records agent cash-in against a partner reference string.
Patient UI (PatientDepositPayment.tsx, MyCare.tsx) shows both amounts, when each is due and what each unlocks.
Ledger recompute, waiver and reminders work per component. Tests: readiness with commitment only; travel confirm
refused without treatment deposit; per-component ledger. Full suite green, commit, do not push, update the P0-4 plan
entry.
```

## P0-5 — Facility entity and package catalogue
Model: Fable 5.1 · Effort: high · Fast: off · Sessions: 3

```
Implement phase P0-5 (findings B-02, A-07). Session 1: facilities (name, city, accreditation records with expiry,
settlement terms, contact) and facility_packages (procedure code, care area, EGP range, inclusions, valid from/to,
approval status) with Control Center screens for Consultant Operations and a one-time Finance approval; expiry job
mirroring CredentialExpiryService. Session 2: proposal line source FACILITY_PACKAGE that releases without a Finance
work item, and a per-care-area pre-approved manual band on the commercial policy so a manual line inside the band
needs no Finance; update the gate computation in JourneyService.createProposal and the gate matrix tests. Session 3:
facility picker replaces the free-text facility field on the travel plan and treatment record; ClinicalReview.tsx
line picker. Keep facilities out of the Consultant workflow as users. ArchUnit: no cycles. Commit each session when
green, do not push, update the P0-5 plan entry.
```

---

## Delegation inside a session

A Fable session can hand bounded work to the project subagents in `.claude/agents/`:

- `workflow-builder` (Opus, medium effort): well-specified rule and workflow slices.
- `mechanical-worker` (Sonnet, low effort): reformatting, i18n sweeps, test scaffolds, docs.

Ask in plain words, naming the agent: "Use the mechanical-worker subagent to add the Arabic keys for the new
status words" or "Delegate the reminder job to the workflow-builder subagent, then review its diff." The lead
session reviews every subagent diff before committing.
