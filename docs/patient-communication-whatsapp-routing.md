# Patient communication: WhatsApp and the one-coordinator rule

Status: **rules agreed, design not started** (owner decisions 2026-10-10).
Evidence: [research report](research/reports/WhatsApp%20patient%20coordinator%20routing.md) and its
[notes](research/research_notes/WhatsApp%20patient%20coordinator%20routing/).

This document closes the end-to-end rule set for how patients reach a coordinator and who may answer them. It is the
input to the design; it does not describe an implementation.

## 1. The rule

**At any moment, exactly one person may answer a given patient conversation, and every patient conversation that
needs an answer has that person (or is in a queue someone is accountable for).**

## 2. Owner decisions (2026-10-10)

| # | Decision |
|---|---|
| D1 | **One business WhatsApp number**, on Meta's WhatsApp Cloud API, connected **directly** (no BSP; a BSP only if Meta verification or onboarding is blocked). The same number sends notifications and receives patient messages. It is never used in the WhatsApp Business app; coexistence is not used. |
| D2 | **Build, no stopgap tool.** No third-party shared inbox. If launch comes before the build, launch with the case form and call-back only and switch WhatsApp on when the build ships. The advertised number must not go live while inbound messages are not ingested. |
| D3 | **Secure messaging is the conversation of record** for every patient who has a case. WhatsApp is the doorbell: inbound WhatsApp from a case patient is copied into the case's secure thread; replies go as secure messages with a WhatsApp nudge carrying the secure link. |
| D4 | **Free-text WhatsApp replies only before a case exists** (intake conversations). Once a case exists, no free-text content goes to WhatsApp. |
| D5 | **What may go on WhatsApp:** greetings, scheduling, logistics, reminders, "your proposal is ready", links into the portal. **Portal only:** diagnoses, consultant opinions, proposals, prices. Files a patient sends on WhatsApp are accepted, stored in our storage, virus-scanned and attached to the case. Coordinators never give medical opinions. |
| D6 | **Every coordinator may take intake conversations**, switched on per coordinator, while the team is small (no separate intake team for now). |
| D7 | **The intake owner is the preferred case owner** when the case is submitted, if still eligible. |
| D8 | **Short absences use temporary cover; long absences use reassignment.** Never two voices at once. |
| D9 | **Leads and managers do not reply directly.** They cover or reassign first, so there is always one voice. |
| D10 | **Service levels:** working hours Saturday–Thursday 10:00–20:00 Africa/Cairo; public promise "a coordinator replies within 2 working hours"; internal first-response target 30 minutes, escalation to the lead at 60 minutes; bilingual out-of-hours auto-reply. |
| D11 | **Timers:** a silent intake conversation closes after 72 hours; a person who returns within 30 days goes back to the same intake owner. |

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
| `intakeEligible` | Takes intake conversations (D6). |
| `maxOpenIntakeConversations` | Intake limit, separate from the case limit. |
| `workingSchedule` | Weekly hours + time zone. "On duty" is derived from it instead of a manual switch. |
| `outOfOffice` (from, to) + `coverCoordinator` | Automatic temporary cover (D8). |

### Routing policy (extends `PolicyConfig`)

| Setting | Agreed value |
|---|---|
| `intakeTeamsByLanguage` | `ar` → Arabic intake team, `en` → English intake team, plus a fallback |
| `preferIntakeOwnerAsCaseOwner` | `true` (D7) |
| `businessHours` | Sat–Thu 10:00–20:00, `Africa/Cairo` (D10) |
| `firstResponseMinutes` | 30 (D10) |
| `escalationMinutes` | 60 (D10) |
| `intakeIdleCloseHours` | 72 (D11) |
| `intakeReturnDays` | 30 (D11) |

Policy changes follow the existing versioned, effective-dated policy model.

### WhatsApp channel (with the existing `app.whatsapp.meta.*` settings)

| Setting | Value |
|---|---|
| Templates (en + ar, utility category) | out-of-hours auto-reply; new secure message; your coordinator is {name}; 24-hour window closed follow-up |
| `directRepliesBeforeCase` | `true` (D4) |
| `directRepliesWithCase` | `false` (D4) |

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
