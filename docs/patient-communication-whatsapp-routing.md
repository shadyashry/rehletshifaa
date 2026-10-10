# Patient communication: WhatsApp and the one-coordinator rule

Status: **recommendations from the research (2026-10-10); design in progress** — [design](patient-communication-whatsapp-design.md).
Evidence: [research report](research/reports/WhatsApp%20patient%20coordinator%20routing.md) and its
[notes](research/research_notes/WhatsApp%20patient%20coordinator%20routing/).

This document closes the end-to-end rule set for how patients reach a coordinator and who may answer them. It is the
input to the design; it does not describe an implementation.

## 1. The rule

**At any moment, exactly one person may answer a given patient conversation, and every patient conversation that
needs an answer has that person (or is in a queue someone is accountable for).**

## 2. Recommendations (from the research)

Each recommendation follows what the research found working elsewhere, adapted to what this platform already has. It
reuses existing practice and existing platform parts; nothing here is new invention.

| # | Recommendation | Precedent |
|---|---|---|
| R1 | **One business WhatsApp number on Meta's WhatsApp Cloud API**, connected directly. The same number sends notifications and receives patient messages. Never used in the WhatsApp Business app; no coexistence. | Every hospital and facilitator studied publishes one official number per brand or region (Acibadem, Cleveland Clinic Abu Dhabi, Bookimed, Vaidam). The Business app cannot assign chats and Meta's Sep 2026 policy bars healthcare messaging on it; coexistence lets phone replies bypass the backend. |
| R2 | **Shared inbox in front, the platform's case as the system of record.** The platform already is the CRM (case ownership, routing, secure messaging), so it plays that part; no second inbox product. Launch WhatsApp only once inbound messages are ingested. | Bumrungrad: one inbox for LINE/WhatsApp/Messenger, each chat tied to a Salesforce case as "single source of truth". Inbox tools only discourage collisions; the hard one-voice guarantee needs the backend to send. |
| R3 | **Secure messaging is the conversation of record once a case exists**; WhatsApp is the doorbell (nudge + secure link). | Hospitals keep clinical exchange in portals and forms (Mayo, Johns Hopkins, Charité publish no WhatsApp); NHS/HSE/HIPAA guidance restricts patient data on consumer messaging. |
| R4 | **Free-text WhatsApp only before a case exists** (intake conversations). | Facilitators use WhatsApp for first contact and qualification, then a case process (Bookimed, Flymedi, Vaidam). |
| R5 | **WhatsApp carries logistics, scheduling, reminders and links; diagnoses, opinions, proposals and prices stay in the portal.** Files sent on WhatsApp are kept, stored in our storage and scanned. | As R3; Meta's healthcare rules and Egypt PDPL treat health data as sensitive. |
| R6 | **Coordinators take intake conversations by language**, switched on per coordinator. | Bumrungrad routes by detected language to Thai/English/Japanese/Arabic teams; Anadolu has per-language lines; Bangkok Hospital an Arabic centre. |
| R7 | **The intake person is preferred as case owner**, and introduces any new owner by name. | Positive reviews name one coordinator; handover is accepted when introduced by name (Flymedi, Bookimed). |
| R8 | **Short absences: temporary cover. Long absences: reassignment.** One voice at a time. | Infobip "sticky agent" and Twilio known-agent routing fall back to another agent on timeout; Zendesk keeps reopened tickets with the original agent. |
| R9 | **Leads and managers supervise, cover or reassign; they do not reply alongside the owner.** | respond.io "Restrict Contact Visibility" (agents see their own contacts); single point of contact promised by Cleveland Clinic Abu Dhabi. |
| R10 | **Service levels:** Sat–Thu 10:00–20:00 Africa/Cairo; public promise "a coordinator replies within 2 working hours"; internal first response 30 minutes, lead alert at 60; bilingual out-of-hours auto-reply. | Industry promises cluster at "within 24 hours"; Bookimed shows a typical-response label; Hospitals Co Egypt runs Sat–Thu hours. |
| R11 | **Timers:** a silent intake conversation closes after 72 hours; a person returning within 30 days goes back to the same intake owner. | Infobip sticky-agent look-back windows (30/60 days); inbox tools auto-close idle chats. |

## 3. Current platform state (verified in code, 2026-10-10)

- **"Talk to a coordinator"** is a plain `wa.me` link to `NEXT_PUBLIC_WHATSAPP_NUMBER` with generic prefilled text
  (`frontend/src/lib/links.ts`). No case reference, no identity, no coordinator. The post-submission "Continue on
  WhatsApp" button prefills the case number.
- **Inbound WhatsApp is not ingested.** `MetaWhatsAppWebhookService.process` handles only delivery `statuses`.
  WhatsApp sending is off by default (`app.whatsapp.mode: noop`).
- **Secure messaging exists** (`case_messages`, `JourneyService.message`): per-case threads, bodies encrypted, every
  message audited. The patient-facing thread is `PATIENT_COORDINATOR`. A staff message there issues the patient a
  secure status link.
- **Who may write in the patient thread today:** only a coordinator with an ACTIVE assignment on the case
  (`RolePolicy`: `COORDINATOR, CASE_MESSAGE, CASE_ASSIGNED`). Consultant, Operations and Finance write only to their
  internal thread (`CaseWorkspaceQueryService.ROLE_THREADS`). Leads and managers can read supervised cases (audited)
  and reassign, but hold no message grant.
- **Case ownership** comes from the routing engine (`AssignmentEngine`): continuity → consultant-preferred
  coordinator → capacity/language scoring → coordination queue (manager assigns or an eligible coordinator claims).
  Reassignment is by a lead or manager, with a reason.

### Gaps against the rule

| Gap | Effect |
|---|---|
| G1 No owner before a case exists | A pre-case WhatsApp chat has nobody accountable. |
| G2 Received but unowned case | Nobody can answer the patient while the case is in the coordination queue. |
| G3 No temporary cover | An absent owner leaves the patient unanswered; the only remedy is a permanent reassignment. |
| G4 No response timers | Nothing tells anyone a patient is waiting. |
| G5 Reply right is "any active coordinator assignment", not "the primary coordinator" | Safe only because `PRIMARY` is the only coordinator assignment type today; a future second type would silently add a second voice. |
| G6 No rule for one phone number on several cases, or a message after the case closed | Messages could land in the wrong thread or nowhere. |

## 4. Who replies, stage by stage

1. **Before a case exists — intake conversation.**
   - An inbound WhatsApp message from a phone that matches no open case opens an intake conversation.
   - It is assigned automatically to one coordinator who is intake-eligible, on duty, speaks the patient's language
     (from the routing hint in the prefilled text, else detected) and is under their intake limit.
   - If nobody qualifies, it waits in the intake queue; an intake-eligible coordinator claims it, under the same lock
     discipline as a case claim.
   - Only the owner replies, free text on WhatsApp, within the 24-hour window; outside it, approved templates only.
   - Out of hours: the auto-reply template is sent once per conversation per out-of-hours period.
   - The goal of the conversation is to answer basic questions and get the case sent through the case form.
2. **Case submitted.**
   - If the submitting phone has an open intake conversation, routing tries the intake owner first (continuity),
     subject to the normal eligibility checks.
   - If the intake owner is not eligible, normal routing applies and the intake owner introduces the new owner by
     name in the same chat before the conversation closes.
   - The intake conversation closes and is linked to the case; the conversation continues in secure messaging.
3. **Case has an owner.**
   - Only the case's **active primary coordinator** (or the active cover, §4.4) may write in `PATIENT_COORDINATOR`.
   - Inbound WhatsApp from the patient or representative is copied into that thread, with its attachments.
   - Replies are secure messages; the patient gets the "new secure message" WhatsApp nudge with the secure link.
4. **Owner unavailable.**
   - **Short absence:** a time-bounded cover, set by the owner (out-of-office) or by the owner's lead. While active,
     only the cover may write; the owner reads only. On expiry, rights return to the owner automatically. The cover
     must be eligible for the case.
   - **Long absence:** permanent reassignment with a reason, as today.
5. **Nobody answers.**
   - At `firstResponseMinutes` after an unanswered patient message (counted in working hours), the replier is
     reminded.
   - At `escalationMinutes`, the replier's lead is alerted and can cover or reassign.
6. **Edge cases.**
   - **Phone on exactly one open case:** that case's thread.
   - **Phone on several open cases** (e.g. a parent for two children): the case with the most recent activity; its
     owner can move the message to the correct case (audited).
   - **Case closed:** to the last owner if still eligible (a new intake conversation linked to the closed case),
     otherwise a new intake conversation routed normally.
   - **Unknown phone mentioning a case number in the prefilled text:** treated as a routing hint only, never as
     identity. It opens an intake conversation; the owner verifies before linking it to the case.
   - **Representative's phone:** matched through the case submission contacts like the patient's own phone.

## 5. Configuration to add

### Per coordinator (extends the routing `Capacity`: maximum, on duty, languages, care areas)

| Setting | Meaning |
|---|---|
| `intakeEligible` | Takes intake conversations (R6). |
| `maxOpenIntakeConversations` | Intake limit, separate from the case limit. |
| `workingSchedule` | Weekly hours + time zone. "On duty" is derived from it instead of a manual switch. |
| `outOfOffice` (from, to) + `coverCoordinator` | Automatic temporary cover (R8). |

### Routing policy (extends `PolicyConfig`)

| Setting | Agreed value |
|---|---|
| `intakeTeamsByLanguage` | `ar` → Arabic intake team, `en` → English intake team, plus a fallback |
| `preferIntakeOwnerAsCaseOwner` | `true` (R7) |
| `businessHours` | Sat–Thu 10:00–20:00, `Africa/Cairo` (R10) |
| `firstResponseMinutes` | 30 (R10) |
| `escalationMinutes` | 60 (R10) |
| `intakeIdleCloseHours` | 72 (R11) |
| `intakeReturnDays` | 30 (R11) |

Policy changes follow the existing versioned, effective-dated policy model.

### WhatsApp channel (with the existing `app.whatsapp.meta.*` settings)

| Setting | Value |
|---|---|
| Templates (en + ar, utility category) | out-of-hours auto-reply; new secure message; your coordinator is {name}; 24-hour window closed follow-up |
| `directRepliesBeforeCase` | `true` (R4) |
| `directRepliesWithCase` | `false` (R4) |

### Permissions

| Permission | Who | Scope |
|---|---|---|
| Reply in an intake conversation | Coordinator | The conversation's owner or its active cover |
| Claim an intake conversation | Intake-eligible coordinator | Unowned intake conversations |
| Set cover / reassign an intake conversation or case | Coordinator lead; manager | Supervised; manager platform-wide |
| Write in a case's `PATIENT_COORDINATOR` thread | Coordinator | **Case primary coordinator or active cover** (tightens G5) |
| Read intake conversations | Lead; manager | Supervised; every read audited, no send |

## 6. Acceptance criteria

1. Two coordinators acting at the same moment can never both send to the same patient conversation; the second is
   refused by the server.
2. Every inbound patient message is either in a conversation with an owner or in a queue with a deadline.
3. No free-text content reaches WhatsApp for a patient who has a case.
4. An owner going out of office hands the reply right to exactly one cover and gets it back automatically.
5. An unanswered patient message raises a reminder at 30 working minutes and a lead alert at 60.
6. Inbound media is stored in our storage and scanned before anyone can open it.
7. Every reply, claim, cover, reassignment, message move and supervisory read is audited.
8. Everything works in English and Arabic (RTL), including templates and the auto-reply.

## 7. To verify before design is final

- Meta pricing from 1 Oct 2026 (sources conflict on whether in-window replies stay free); check WhatsApp Manager.
- Egypt PDPL: licence for processing health data and for the transfer to Meta; consent wording naming Meta. With counsel.
- Meta Business Verification, display-name approval, two-step verification for the number.
- Whether Meta's local-storage setting offers a usable region.
- Webhook delivery guarantees (acknowledgement deadline, retry window) and the business-scoped `user_id` in our webhooks.
- The error returned when sending free text outside the 24-hour window.

## 8. Out of scope here

Chatbot triage, click-to-WhatsApp ads, response-time dashboards, and any channel other than WhatsApp.
