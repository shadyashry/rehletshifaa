# Shape plan — Coordinator-mediated Arabic proposal decision

Status: **approved at GATE P2-1 (2026-10-08)**: O1 all surfaces, O2 keep the quiet English link, O3 owning
coordinator only. Build waits on its own run; legal questions L1–L5 stay open. No code. Source: portal re-critique P0
(`.impeccable/critique/2026-10-07T21-50-23Z__frontend-src-components-portal.md`, heuristic 3 "User control and
freedom" = 2) and the owner's GATE 5 follow-up (STATUS.md, 2026-10-08).

## What exists today (verified in code, 2026-10-08)

| Surface | Arabic behaviour | Where |
|---|---|---|
| Portal proposal drawer (My Care → "Review proposal") | Acknowledge/Accept **blocked**: checkbox and primary disabled; a note says "switch the page to English". Request changes and Decline stay live; Decline is a `btn-secondary` equal to Request changes and confirms through `window.confirm`. | `components/portal/PatientProposal.tsx` `PatientProposalDecision` (`blocked = locale === "ar" && !ARABIC_TERMS_APPROVED`) |
| Secure proposal link (pre-activation, where most first estimates are decided) | **Not gated.** Arabic patients can acknowledge with the English terms block + `ARABIC_PENDING_NOTICE`. | `components/ProposalSign.tsx` (no `ARABIC_TERMS_APPROVED` check) |
| Account activation | **Not gated.** The deposit-terms consent is ticked in Arabic beside the English terms; the backend records Arabic consent text. | `components/ProfileActivation.tsx`, `PatientActivationService.consentText("DEPOSIT_CANCELLATION_TERMS","ar")` |
| Staff "Record patient response" | Records answers to an **information request** only (`POST /coordinator/cases/{id}/information-requests/on-behalf`, stored `PATIENT_REPORTED` with channel + `recorded_by`). It renders nothing when no request is open. **It cannot record a proposal decision.** | `components/portal/RecordPatientResponse.tsx`, `JourneyService.recordPatientInformation`, `PatientActionService.applyResponses` |
| Backend proposal decision | Only the patient (or authorised representative) can decide: `PATIENT_DECIDE` on `OWN_PATIENT`; `ProposalDecision` stores `patient_subject` (not null) and `reauthenticated_at` (not null); no source/channel/recorded-by. Accept/acknowledge triggers deposit creation and onboarding. | `JourneyService.decideProposal`, `domain/ProposalDecision.java`, `RolePolicy` |

So the GATE 2 "option B" block applies to one surface only, the drawer is a dead end for the one action that moves
the case forward, and there is **no backend path** for a coordinator to record a decision. This plan needs a
backend contract change (below).

## Job and audience

An Arabic-speaking patient, or a relative acting for them, has a released estimate or final quote and wants to go
ahead. They are on a phone, often not comfortable reading English legal terms, and already talk to their
coordinator on WhatsApp. Mode: **Operate**, with one Read moment (the terms).

Product truths this leans on: **one accountable person** (the coordinator relationship *is* the product) and
**Arabic is not a translation** — a patient is never told to change language to finish their own decision.

## Outcome

- **Patient success:** in one tap they ask their coordinator to go through the terms with them in Arabic, see that
  the request was received and who will call, and later see the decision that was recorded, by whom, how and when.
- **Coordinator success:** one clear work item, one dialog that records the decision with provenance, and the same
  downstream effects (deposit, onboarding, journey step) as a self-service decision.
- **Never:** a coordinator decision that looks as if the patient typed it; a decline made easier than going ahead.

## Direction (inside Petrol & Paper; enhance the accepted drawer, do not revamp)

### Patient — `/ar` decision section, while `ARABIC_TERMS_APPROVED` is false

Same drawer, same reading order (header → price → honesty line → items → recommendation → notes → terms → decision).
Only the decision section changes:

1. **Heading** stays "قرارك" (copy.decisionTitle).
2. **One plain explanation** (replaces `arabicTermsPending`, drops "switch to English"): the deposit, refund and
   cancellation terms are not yet available in approved Arabic wording, so your coordinator will go through them
   with you in Arabic and record your decision.
3. **One primary action:** "اطلب من منسّقك مراجعة الشروط معك" / "Ask {coordinatorName} to go through the terms with
   me" (falls back to "your coordinator" when none is assigned). The acknowledgement checkbox and the disabled
   primary are **removed** on `/ar`, not disabled — a control nobody can use is noise and fails the disabled-contrast
   item already in the backlog.
4. **After the request:** the button is replaced in place by a status line (polite live region):
   "Requested on {date}. {coordinatorName} will contact you on WhatsApp." It survives reload (backend state). A
   second request is not offered; "Message your coordinator" opens the existing secure-messages drawer.
5. **Request changes** stays a secondary button with the required note (unchanged behaviour).
6. **Decline is de-emphasised:** a quiet text button at the end of the section ("لا أرغب في المتابعة بهذا المقترح" /
   "Decline this proposal"), and it opens an **in-drawer confirm step** instead of `window.confirm`: consequence
   text ("Your coordinator will be told. You can still talk to them before deciding."), "Decline" (destructive
   style) and "Keep the proposal" (default focus). This also closes the backlog P2 `window.confirm` item for both
   locales.
7. **English route (quiet):** one secondary line, "تفضّل القراءة بالإنجليزية؟ راجع المقترح وقرّر بالإنجليزية" linking
   to the same drawer on `/en` (closes backlog P2 "no direct link to the same view in `/en`"). It is an option, not
   the instruction. *Owner decision O2.*

English pages are unchanged except the shared in-drawer decline confirm.

### Patient — after a coordinator records the decision (both locales)

- Drawer header status uses the existing plain status words plus a provenance line: "Recorded by {coordinatorName}
  on {date} after a phone call with you" (or "…with {representativeName}"). My Care's current step follows the
  normal post-decision state (deposit / onboarding), never a second decision prompt.
- A line under it: "If this is not what you agreed, message your coordinator." (dispute route; legal L4).

### Coordinator — case workspace

- **Trigger:** the patient's request creates a coordinator work item ("Go through the proposal terms in Arabic and
  record the decision"), routed to the owning coordinator through the existing role-routed notifications and
  derived priority. It appears as the case's **current action** — one entry point, consistent with the
  "one control per business action" rule already used for Record patient response.
- **The action is also available without a request** (patient phoned or messaged on WhatsApp first) from
  More actions → "Record the patient's proposal decision", whenever a released proposal is decidable and the
  coordinator owns the case. *Owner decision O3 on who may record.*
- **Dialog "Record the patient's decision"** (new component beside `RecordPatientResponse`, sharing its
  provenance pattern and `account-dialog` shell; converge to component tokens while there):
  1. read-only proposal summary: document type, total, valid until, version;
  2. **attestation (required checkbox):** "I went through the coordination deposit, refund and cancellation terms
     ({termsVersion}) with the patient in Arabic, and they confirmed they understood them" — final quotes use the
     quote payment terms wording;
  3. **who confirmed:** the patient, or a named authorised representative (only representatives already on the
     case; otherwise the dialog says the representative must be authorised first);
  4. **decision:** Acknowledge (estimate) / Accept (quote), Request changes (note required), Decline;
  5. **channel and time:** Phone, WhatsApp call, Video call, In person; when the conversation took place
     (defaults to now, cannot be in the future or before the proposal release);
  6. note (optional except for Request changes);
  7. provenance line: "Recorded as the patient's decision, captured by you. The patient will see who recorded it."
  8. one primary "Record decision"; errors render inside the dialog (the page banner is inert behind a modal).
- After saving: the work item completes, the case moves exactly as for a self-service decision, and the patient is
  notified (existing channels) with the provenance line above.

## States and ranges

| State | Patient (`/ar`) | Coordinator |
|---|---|---|
| Decision owed, no request | explanation + "Ask … to go through the terms" + Request changes + quiet Decline | More actions entry only |
| Requested | "Requested on {date} …" status line; messages route | current action + work item + notification |
| No coordinator assigned | button reads "your coordinator"; request routes to the coordinator lead queue | lead sees the work item unassigned |
| Proposal expired / superseded / already decided | existing blocked messages; request button hidden | dialog not offered; server answers 409/410, dialog shows it |
| Recorded | provenance line, normal next step | work item done; audit `PROPOSAL_DECIDED_ON_BEHALF` |
| Request or record fails | inline error in the drawer / dialog | same |
| `ARABIC_TERMS_APPROVED` flipped to true | today's self-service decision returns on `/ar`; the request route disappears | More actions entry stays (phone decisions remain valid) |

Text ranges: coordinator and representative names up to ~40 chars, Latin or Arabic (`<bdi>`); dates via
`Intl.DateTimeFormat` with the Western-digit default; amounts as today (`<bdi dir="ltr">`).

## Backend contract change (required)

1. **Patient request** — `POST /api/v1/patient/cases/{caseId}/proposals/{versionId}/assisted-decision-request`
   (`PATIENT_DECIDE`, idempotent per version). Creates a coordinator case action
   (e.g. `PROPOSAL_TERMS_CALL`) and a notification; `ProposalView` (patient) gains `assistedRequestAt`.
   The secure-link equivalent (`/public/proposals/{token}/assisted-decision-request`, grant-checked) only if O1 = all
   surfaces.
2. **Recorded decision** — `POST /api/v1/coordinator/cases/{caseId}/proposals/{versionId}/decision/on-behalf`
   `{ decision, comment?, channel, confirmedBy: PATIENT|REPRESENTATIVE, representativeId?, conversationAt,
   termsVersion, termsExplainedLanguage: "ar", attested: true }`.
   - New permission (e.g. `PROPOSAL_DECISION_RECORD`) granted to the coordinator on **owned** cases only; never
     Consultants, operations or finance. Separation of duties per O3.
   - `decideProposal` is split into one shared core so both paths revoke share tokens, transition the case, create
     the deposit and onboarding, complete the journey `REVIEW_PROPOSAL` action (a third
     `ReviewProposalActionHandler` decision variant) and audit identically.
   - `ProposalDecision` gains `source` (`PATIENT_SELF` | `RECORDED_ON_BEHALF`), `channel`, `recorded_by`,
     `confirmed_by`, `representative_id`, `conversation_at`, `terms_explained_language`; `reauthenticated_at`
     becomes nullable for recorded decisions. New V-migration (pre-production: final design, H2-safe, one
     `ADD COLUMN` per `ALTER`, JPA mapping proven by `PostgresJpaMappingTest`).
   - Audit `PROPOSAL_DECIDED_ON_BEHALF` with the staff subject; never logs the note.
   - Patient `ProposalView` gains `decisionSource`, `recordedByName`, `decisionChannel`, `decidedAt`.
3. **Deposit-terms consent:** if L2 allows, the recorded acknowledgement also writes the `DEPOSIT_CANCELLATION_TERMS`
   consent record (channel `ASSISTED`, language `ar`, the attested terms version), so activation does not ask again
   (`PatientActivationService` already skips a given consent). Otherwise activation keeps asking.
4. `CaseActionService` exposes `RECORD_PROPOSAL_DECISION` in available actions under the same conditions.

## Legal questions (do not fill in; refund wording is still "Pending legal review", F2 open)

- **L1** Is a decision recorded by staff after an Arabic phone/WhatsApp explanation a valid acknowledgement of the
  deposit, refund and cancellation terms, given those terms exist only in English and their enforceability (F2) is
  undecided? Is a written confirmation from the patient (e.g. a WhatsApp message kept on file) required?
- **L2** Does the recorded acknowledgement also count as the deposit-terms **consent** collected at activation, or
  must the patient still give it themselves — and in which language, since activation already accepts it in Arabic?
- **L3** May an authorised representative confirm by phone on the patient's behalf for a final quote (money due
  before treatment), or only for an estimate?
- **L4** What dispute window and process applies if the patient later says the recorded decision is wrong?
- **L5** Is the current inconsistency acceptable meanwhile: the secure link and activation already let Arabic
  patients acknowledge/consent beside English terms, while the portal drawer blocks it?

Escalation: approved Arabic deposit/refund/cancellation wording remains a **launch blocker**; this path is the
interim, not the fix.

## Owner decisions needed

Answered at GATE P2-1: **O1 all surfaces**, **O2 keep**, **O3 owning coordinator**.

- **O1 Scope** — apply the same rule to every Arabic surface that relies on these terms (portal drawer **and** the
  secure proposal link; activation per L2)? Recommended: yes, one rule; build the portal drawer + staff recording
  first, the secure link in the same run if the backend lands together.
- **O2 English route** — keep a quiet "decide on the English page" link as a secondary option? Recommended: yes.
- **O3 Who may record** — the owning coordinator alone (recommended; provenance, audit and patient notification are
  the safeguards), or the coordinator plus a lead countersign for final quotes.

## Boundaries and anti-goals

- No change to the terms wording, `ARABIC_PENDING_NOTICE` or the English page decision.
- No machine-written Arabic legal text; new Arabic UI copy is pending native review like the rest.
- No new colours or tokens; destructive style uses existing alert tokens; no new cards — hairlines and type.
- One primary per section; Decline never equal to the forward action while Accept is blocked.
- Out of scope: native Arabic terms themselves, optional-item selection, My Care redesign.

## Acceptance and verification (for the build run)

- Unit: `PatientProposalDecision` en/ar variants (request, requested, decline confirm, flag on/off); new dialog.
- Backend: decision core shared by both paths; permission denied for non-owners, Consultants and patients;
  409/410 parity; audit and journey action completion; Postgres mapping.
- e2e on `frontend-dev` :3100 with `portal-fixture.ts` / `patient-fixture.ts` (synthetic only): Arabic request →
  coordinator records → patient sees provenance; `a11y.spec.ts` en + ar stays at baseline.
- Keyboard: focus moves to the confirm step and back; live region announces "Requested"; 44px targets; RTL
  logical properties only.
