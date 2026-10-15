package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.FollowUpDtos.CheckInRequest;
import com.rehletshifaa.journey.api.FollowUpDtos.CheckInView;
import com.rehletshifaa.journey.api.FollowUpDtos.ClosureBlocker;
import com.rehletshifaa.journey.api.FollowUpDtos.ComplicationReviewRequest;
import com.rehletshifaa.journey.api.FollowUpDtos.ContactCancelRequest;
import com.rehletshifaa.journey.api.FollowUpDtos.ContactRecordRequest;
import com.rehletshifaa.journey.api.FollowUpDtos.ContactRequest;
import com.rehletshifaa.journey.api.FollowUpDtos.ContactView;
import com.rehletshifaa.journey.api.FollowUpDtos.FollowUpView;
import com.rehletshifaa.journey.api.FollowUpDtos.OutcomeRequest;
import com.rehletshifaa.journey.api.FollowUpDtos.OutcomeView;
import com.rehletshifaa.journey.api.FollowUpDtos.PatientContactView;
import com.rehletshifaa.journey.api.FollowUpDtos.PatientFollowUpView;
import com.rehletshifaa.journey.api.FollowUpDtos.PatientOutcomeView;
import com.rehletshifaa.journey.api.FollowUpDtos.PlanView;
import com.rehletshifaa.journey.api.FollowUpDtos.PublicOutcomeRequest;
import com.rehletshifaa.journey.api.FollowUpDtos.WindowView;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.journey.domain.CaseEvidence.Fact;
import com.rehletshifaa.journey.domain.CaseEvidence.Kind;
import com.rehletshifaa.journey.domain.CaseIncident;
import com.rehletshifaa.journey.domain.CaseOutcome;
import com.rehletshifaa.journey.domain.FollowUpContact;
import com.rehletshifaa.journey.domain.FollowUpPlan;
import com.rehletshifaa.journey.domain.FollowUpWindow;
import com.rehletshifaa.journey.infrastructure.CaseOutcomeRepository;
import com.rehletshifaa.journey.infrastructure.FollowUpContactRepository;
import com.rehletshifaa.journey.infrastructure.FollowUpPlanRepository;
import com.rehletshifaa.journey.infrastructure.FollowUpWindowRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.scheduling.application.LeasedJob;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Follow-up after discharge (P1-18; post-deposit design §5 stage 6, decision D-G; architecture §4.6, §5.6).
 * <ul>
 *   <li><b>The window</b>: opened when the case is discharged ({@link CaseEvents.PatientDischarged}), {@code follow_up_free_days} long
 *       (30 by default, D-G; frozen at discharge). When it is over and no reported complication waits for the Consultant, the
 *       scheduler writes {@code FOLLOW_UP_WINDOW_CLOSED}; the case then closes once every contact and check-in is done
 *       ({@link FollowUpReadiness}, {@link CaseExitService#closeAfterFollowUp}). Paid teleconsultation after it is P2-25.</li>
 *   <li><b>Contacts</b> (the case's Consultant): the plan's first contact is scheduled at discharge, then as the Consultant adds;
 *       each is held (a short note) or missed (the coordinator rebooks it: {@code REBOOK_FOLLOW_UP}) or cancelled. The
 *       Consultant's one {@code FOLLOW_UP_CONTACT} item points at the next contact, due on its date; the patient is reminded once
 *       the day before ({@code follow-up-reminder}).</li>
 *   <li><b>Check-ins</b> (the coordinator): day 3, 14 and 30 after discharge ({@code CHECK_IN_D3/D14/D30}, opened the day before,
 *       due 18:00 Cairo on the day), each one that falls inside the free window and is opened before it ends (a case reopened later
 *       owes none); recorded as reached or not with a note.</li>
 *   <li><b>Outcomes</b> (the patient): at day 30 and day 90 the patient is asked (My Care's {@code REPORT_OUTCOME}, or the OUTCOME
 *       secure link in {@code outcome-request}); open 30 days. A reported complication opens an adverse-event incident (P1-13) and
 *       the Consultant's {@code REVIEW_COMPLICATION} (4 working hours); on a closed case the Consultant or a manager may reopen it
 *       (P1-13's reopen).</li>
 *   <li><b>Closure</b>: a case that closes (here or with no follow-up needed) gets the patient's review request
 *       ({@code closure-review}) and the settlement module's CLOSURE statement ({@link CaseEvents.CaseClosed}).</li>
 * </ul>
 * Outcome answers are health data (PDPL): the case's Consultant reads them, its coordinator the scores and flags without the free
 * text ({@code FOLLOW_UP_READ}; the clinical text needs {@code FOLLOW_UP_RECORD}); a reported complication also reaches the
 * incident's owner and Compliance as the incident summary (adverse-event governance). The free text is encrypted; every answer
 * stores the purpose notice it was given under ({@link #OUTCOME_NOTICE_VERSION}) and who answered (someone answering for the patient
 * on the link declares it); audit, notifications and logs carry the point and ids, never an answer.
 */
@Service
public class FollowUpService {
    private static final Logger log = LoggerFactory.getLogger(FollowUpService.class);
    /** Work types. */
    public static final String CONTACT_WORK = "FOLLOW_UP_CONTACT", REBOOK_WORK = "REBOOK_FOLLOW_UP", REVIEW_WORK = "REVIEW_COMPLICATION",
            CHECK_IN_WORK = "CHECK_IN_";
    /** How long an outcome question stays open (the OUTCOME link's life). */
    public static final int OUTCOME_OPEN_DAYS = 30;
    /** The purpose notice shown above the outcome questions (session 2 copy); bump it whenever that text changes. */
    public static final String OUTCOME_NOTICE_VERSION = "outcome-notice-2026-10";
    static final int REVIEW_WORKING_HOURS = 4;
    static final String REMINDER_TEMPLATE = "follow-up-reminder", CLOSURE_TEMPLATE = "closure-review";
    private static final Map<String, Integer> CHECK_IN_DAYS = Map.of("D3", 3, "D14", 14, "D30", 30);
    private static final Map<CaseOutcome.Point, Integer> OUTCOME_DAYS = Map.of(CaseOutcome.Point.D30, 30, CaseOutcome.Point.D90, 90);
    private static final Set<String> ACTIVE = Set.of("DISCHARGED", "FOLLOW_UP");
    private static final Set<String> AFTER_DISCHARGE = Set.of("DISCHARGED", "FOLLOW_UP", "CLOSED");
    /** The check-in item is due at the end of its day, Cairo time. */
    private static final LocalTime END_OF_DAY = LocalTime.of(18, 0);

    private final Authority authority;
    private final Clock clock;
    private final AuditTrail auditTrail;
    private final EvidenceLedger ledger;
    private final FollowUpReadiness readiness;
    private final CaseExitService exits;
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;
    private final FollowUpPlanRepository plans;
    private final FollowUpWindowRepository windows;
    private final FollowUpContactRepository contacts;
    private final CaseOutcomeRepository outcomes;
    private final CommercialPolicyService commercialPolicies;
    private final StaffWorkService work;
    private final SlaPolicy sla;
    private final DepositPaymentNotices notices;
    private final PublicCaseAccessService publicAccess;
    private final IncidentService incidents;
    private final ObjectMapper json;
    private final TransactionTemplate perCase;

    public FollowUpService(Authority authority, Clock clock, AuditTrail auditTrail, EvidenceLedger ledger, FollowUpReadiness readiness, CaseExitService exits,
                           MedicalCaseRepository cases, CaseAssignmentRepository assignments, FollowUpPlanRepository plans, FollowUpWindowRepository windows,
                           FollowUpContactRepository contacts, CaseOutcomeRepository outcomes, CommercialPolicyService commercialPolicies, StaffWorkService work,
                           SlaPolicy sla, DepositPaymentNotices notices, PublicCaseAccessService publicAccess, IncidentService incidents, ObjectMapper json,
                           PlatformTransactionManager transactions) {
        this.authority = authority; this.clock = clock; this.auditTrail = auditTrail; this.ledger = ledger; this.readiness = readiness; this.exits = exits;
        this.cases = cases; this.assignments = assignments; this.plans = plans; this.windows = windows; this.contacts = contacts; this.outcomes = outcomes;
        this.commercialPolicies = commercialPolicies; this.work = work; this.sla = sla; this.notices = notices; this.publicAccess = publicAccess;
        this.incidents = incidents; this.json = json;
        this.perCase = new TransactionTemplate(transactions);
        this.perCase.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    // ---- the Consultant: contacts and complication reviews ----

    /** The Consultant adds a follow-up contact to the schedule (it joins the plan on file). */
    @Transactional
    public FollowUpView addContact(UUID caseId, ContactRequest request) {
        Actor actor = authority.authorize(Permission.FOLLOW_UP_RECORD, Resource.ofCase(caseId));
        requireActive(lockStage(caseId));
        FollowUpPlan plan = plans.findFirstByCaseIdOrderByCreatedAtDesc(caseId)
                .orElseThrow(() -> new ApiException(409, "FOLLOW_UP_PLAN_MISSING", "Record the follow-up plan first"));
        Instant now = clock.instant();
        FollowUpContact contact = contacts.saveAndFlush(new FollowUpContact(caseId, plan.getId(), FollowUpContact.Origin.ADDED, request.dueAt(), request.mode(),
                actor.subject(), now));
        work.closeWorkItems(caseId, REBOOK_WORK, "A new follow-up contact was booked");
        syncContactWork(caseId);
        audit("FOLLOW_UP_CONTACT_ADDED", actor.subject(), "CONSULTANT", caseId, "FollowUpContact", contact.getId(), request.mode());
        return staffView(caseId);
    }

    /** The Consultant records a contact as held (with a short note) or missed; a missed one goes to the coordinator to rebook. */
    @Transactional
    public FollowUpView recordContact(UUID caseId, UUID contactId, ContactRecordRequest request) {
        Actor actor = authority.authorize(Permission.FOLLOW_UP_RECORD, Resource.ofCase(caseId));
        requireActive(lockStage(caseId));
        FollowUpContact contact = scheduled(caseId, contactId);
        FollowUpContact.Status outcome = FollowUpContact.Status.valueOf(request.outcome());
        Instant now = clock.instant();
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("outcome", outcome.name());
        payload.put("note", request.note().trim());
        CaseEvidence row = ledger.record(caseId, new Fact(Kind.FOLLOW_UP_CONTACT, null, contact.getId().toString(), null, now, write(payload)),
                actor.subject(), "CONSULTANT", null);
        contact.record(outcome, request.note().trim(), row.getId(), actor.subject(), now);
        contacts.saveAndFlush(contact);
        if (outcome == FollowUpContact.Status.MISSED) {
            String number = caseNumber(caseId);
            work.openWorkItem(new NewWorkItem(caseId, REBOOK_WORK, "Rebook the patient's follow-up contact",
                    "The patient missed a follow-up contact. Reach them and agree a new time with the Consultant.", coordinator(caseId), "COORDINATOR",
                    false, null, actor.subject(), REBOOK_WORK, "rebook:" + contact.getId(), true, WorkCopy.of(REBOOK_WORK, "caseNumber", number)));
        }
        syncContactWork(caseId);
        audit("FOLLOW_UP_CONTACT_RECORDED", actor.subject(), "CONSULTANT", caseId, "FollowUpContact", contact.getId(), outcome.name());
        tryClose(caseId);
        return staffView(caseId);
    }

    /** The Consultant cancels a scheduled contact (booked by mistake, or no longer needed), with the reason. */
    @Transactional
    public FollowUpView cancelContact(UUID caseId, UUID contactId, ContactCancelRequest request) {
        Actor actor = authority.authorize(Permission.FOLLOW_UP_RECORD, Resource.ofCase(caseId));
        requireActive(lockStage(caseId));
        FollowUpContact contact = scheduled(caseId, contactId);
        contact.cancel(request.reason().trim(), actor.subject(), clock.instant());
        contacts.saveAndFlush(contact);
        syncContactWork(caseId);
        audit("FOLLOW_UP_CONTACT_CANCELLED", actor.subject(), "CONSULTANT", caseId, "FollowUpContact", contact.getId(), null);
        tryClose(caseId);
        return staffView(caseId);
    }

    /**
     * The Consultant reviews a reported complication (what was done or advised). The review item closes with the case's last
     * unreviewed complication; in follow-up the window and the closure may then proceed. A closed case stays closed: reopening is
     * P1-13's own act.
     */
    @Transactional
    public FollowUpView reviewComplication(UUID caseId, String point, ComplicationReviewRequest request) {
        Actor actor = authority.authorize(Permission.FOLLOW_UP_RECORD, Resource.ofCase(caseId));
        lockStage(caseId);
        CaseOutcome outcome = outcomes.findByCaseIdAndPoint(caseId, CaseOutcome.Point.valueOf(point).name())
                .filter(CaseOutcome::awaitingReview)
                .orElseThrow(() -> new ApiException(409, "COMPLICATION_NOT_AWAITING_REVIEW", "There is no reported complication waiting for review at this point"));
        Instant now = clock.instant();
        outcome.review(request.note().trim(), actor.subject(), now);
        outcomes.saveAndFlush(outcome);
        if (!outcomes.existsByCaseIdAndComplicationTrueAndReviewedAtIsNull(caseId)) work.closeWorkItems(caseId, REVIEW_WORK, "Complication reviewed");
        audit("OUTCOME_COMPLICATION_REVIEWED", actor.subject(), "CONSULTANT", caseId, "CaseOutcome", outcome.getId(), point);
        windows.findByCaseId(caseId).ifPresent(w -> closeWindowIfDue(caseId, w, now));
        tryClose(caseId);
        return staffView(caseId);
    }

    // ---- the coordinator: check-ins ----

    /** The coordinator records a check-in call (from the day before its day; once per point). */
    @Transactional
    public FollowUpView recordCheckIn(UUID caseId, String point, CheckInRequest request) {
        Actor actor = authority.authorize(Permission.CHECK_IN_RECORD, Resource.ofCase(caseId));
        Integer days = CHECK_IN_DAYS.get(point);
        if (days == null) throw new ApiException(400, "CHECK_IN_UNKNOWN", "A check-in is on day 3, 14 or 30 after discharge");
        requireActive(lockStage(caseId));
        FollowUpWindow window = windows.findByCaseId(caseId).orElseThrow(() -> new ApiException(409, "NOT_DISCHARGED", "Check-ins start after discharge"));
        if (!readiness.checkInsPending(caseId).contains(point)) throw new ApiException(409, "CHECK_IN_ALREADY_RECORDED", "This check-in is already recorded");
        Instant now = clock.instant();
        if (now.isBefore(window.day(days - 1))) throw new ApiException(409, "CHECK_IN_NOT_DUE", "This check-in is due on day " + days + " after discharge");
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("outcome", request.outcome());
        if (request.note() != null && !request.note().isBlank()) payload.put("note", request.note().trim());
        ledger.record(caseId, new Fact(Kind.CHECK_IN, null, point, null, now, write(payload)), actor.subject(), "COORDINATOR", null);
        work.closeWorkItems(caseId, CHECK_IN_WORK + point, "Check-in recorded");
        tryClose(caseId);
        return staffView(caseId);
    }

    // ---- the patient: outcomes ----

    /** The patient (or representative) answers an open outcome question from My Care. */
    @Transactional
    public PatientFollowUpView reportOutcome(UUID caseId, String point, OutcomeRequest request) {
        Actor actor = authority.authorize(Permission.OUTCOME_REPORT, Resource.ofCase(caseId));
        String role = actor.role() == Role.PATIENT_REPRESENTATIVE ? "PATIENT_REPRESENTATIVE" : "PATIENT";
        report(caseId, point, request, CaseOutcome.Channel.MY_CARE, actor.subject(), role);
        return forPatient(caseId);
    }

    /** The same from the verified OUTCOME secure link (the one-time code went to the case's contact). */
    @Transactional
    public PatientFollowUpView reportOutcomeFromLink(String token, String point, PublicOutcomeRequest request) {
        var link = publicAccess.requireOutcomeGrant(token, request.grant());
        String role = "REPRESENTATIVE".equals(request.answeredBy()) ? "PATIENT_REPRESENTATIVE" : "PATIENT";
        report(link.caseId(), point, request.answer(), CaseOutcome.Channel.SECURE_LINK, "SECURE_LINK:" + link.patientId(), role);
        return forPatient(link.caseId());
    }

    private void report(UUID caseId, String point, OutcomeRequest request, CaseOutcome.Channel channel, String subject, String role) {
        lockStage(caseId);
        CaseOutcome.Point at = CaseOutcome.Point.valueOf(point);
        CaseOutcome outcome = outcomes.findByCaseIdAndPoint(caseId, at.name())
                .orElseThrow(() -> new ApiException(409, "OUTCOME_NOT_REQUESTED", "These questions are asked 30 and 90 days after discharge"));
        if (outcome.answered()) throw new ApiException(409, "OUTCOME_ALREADY_REPORTED", "You have already answered these questions");
        Instant now = clock.instant();
        if (!open(outcome, now)) throw new ApiException(409, "OUTCOME_CLOSED", "These questions are no longer open; contact your coordinator");
        boolean complication = Boolean.TRUE.equals(request.complication());
        String note = request.complicationNote() == null || request.complicationNote().isBlank() ? null : request.complicationNote().trim();
        if (complication && note == null) throw new ApiException(400, "COMPLICATION_DETAILS_REQUIRED", "Tell us what happened");
        if (!OUTCOME_NOTICE_VERSION.equals(request.noticeVersion()))
            throw new ApiException(409, "OUTCOME_NOTICE_OUTDATED", "The questions were updated; reload the page and answer again");
        outcome.answer(new CaseOutcome.Answer(request.pain(), request.function(), request.satisfaction(), complication, note, request.noticeVersion()),
                channel, subject, role, now);
        outcomes.saveAndFlush(outcome);
        // Audit carries the point and the channel, never an answer (health data).
        audit("OUTCOME_REPORTED", subject, role, caseId, "CaseOutcome", outcome.getId(), at.name() + " " + channel.name());
        if (complication) complicationReported(caseId, outcome, now);
    }

    /** A reported complication: an adverse-event incident (P1-13) and the Consultant's review within four working hours. */
    private void complicationReported(UUID caseId, CaseOutcome outcome, Instant now) {
        UUID incident = incidents.raiseFromSystem(caseId, CaseIncident.Type.ADVERSE_EVENT, CaseIncident.Severity.HIGH, outcome.getComplicationNote(),
                "OUTCOME_" + outcome.getPoint().name());
        outcome.linkIncident(incident);
        outcomes.saveAndFlush(outcome);
        String number = caseNumber(caseId);
        work.openWorkItem(new NewWorkItem(caseId, REVIEW_WORK, "Review a complication the patient reported",
                "The patient reported a problem since discharge in their follow-up answers. Review it and contact them.",
                consultant(caseId), "DOCTOR", false, sla.plusWorkingHours(now, REVIEW_WORKING_HOURS), "SYSTEM", "OUTCOME_REPORTED",
                "complication:" + outcome.getId(), true, WorkCopy.of(REVIEW_WORK, "caseNumber", number)));
        for (String coordinator : assignments.findActiveAssignees(caseId, "COORDINATOR"))
            work.notifyStaff(coordinator, caseId, null, "COMPLICATION_REPORTED", "The patient reported a problem after discharge",
                    "Their Consultant has been asked to review it.", "complication:" + outcome.getId() + ":" + coordinator, true,
                    WorkCopy.of("COMPLICATION_REPORTED", "caseNumber", number));
    }

    // ---- the handoffs ----

    /** The case was discharged: the window opens (D-G) and the plan's first contact is scheduled. */
    @EventListener
    public void on(CaseEvents.PatientDischarged event) {
        UUID caseId = event.caseId();
        if (windows.findByCaseId(caseId).isEmpty()) {
            FollowUpWindow window = windows.saveAndFlush(new FollowUpWindow(caseId, clock.instant(), freeDays(caseId)));
            auditTrail.event("FOLLOW_UP_WINDOW_OPENED").actor("SYSTEM", "SYSTEM").caseId(caseId).entity("FollowUpWindow", window.getId()).action("CREATE")
                    .reason(window.getFreeDays() + " days").record();
        }
        ensureContacts(caseId);
    }

    /** A follow-up plan recorded after discharge schedules its first contact too. */
    @EventListener
    public void on(CaseEvents.DischargeEvidenceChanged event) {
        String status = cases.findStageAndVersion(event.caseId()).map(s -> s.getStatus().name()).orElse("");
        if (ACTIVE.contains(status) && windows.findByCaseId(event.caseId()).isPresent()) ensureContacts(event.caseId());
    }

    /** The case closed: the patient is asked for a review, once per case (the closure statement is the settlement module's). */
    @EventListener
    public void on(CaseEvents.CaseClosed event) {
        notices.send(event.caseId(), "FOLLOW_UP", CLOSURE_TEMPLATE, "closure-review:" + event.caseId());
    }

    // ---- the scheduler ----

    /** Every case with follow-up still scheduled (or reopened into follow-up), each in its own transaction. */
    @LeasedJob(maxHold = LeasedJob.SWEEP)
    @Scheduled(fixedDelayString = "${app.follow-up.scan-ms:3600000}")
    public void sweep() {
        for (UUID caseId : windows.findCasesToSweep(CaseStatus.FOLLOW_UP)) {
            try { perCase.executeWithoutResult(status -> evaluate(caseId, clock.instant())); }
            catch (RuntimeException e) { log.warn("Follow-up sweep for case {} failed", caseId, e); }
        }
    }

    /**
     * What the case is owed at {@code now}: contact reminders (the day before), check-in items (from the day before their day), the
     * outcome questions (day 30 and 90), the window closing, then the closure. Idempotent; returns the steps taken (for the log and
     * the tests).
     */
    @Transactional
    public List<String> evaluate(UUID caseId, Instant now) {
        List<String> steps = new ArrayList<>();
        FollowUpWindow window = windows.findByCaseId(caseId).orElse(null);
        if (window == null) return steps;
        String status = lockStage(caseId);
        if ("CANCELLED".equals(status)) { window.complete(now); windows.saveAndFlush(window); return steps; }
        if (ACTIVE.contains(status)) {
            ensureContacts(caseId);
            for (FollowUpContact c : contacts.findByCaseIdOrderByDueAtAscCreatedAtAsc(caseId)) {
                if (c.getStatus() != FollowUpContact.Status.SCHEDULED || c.getReminderSentAt() != null) continue;
                if (!c.getDueAt().isAfter(now) || c.getDueAt().isAfter(now.plus(Duration.ofDays(1)))) continue;
                notices.send(caseId, "FOLLOW_UP", REMINDER_TEMPLATE, "follow-up-reminder:" + c.getId());
                c.reminded(now);
                contacts.saveAndFlush(c);
                steps.add("REMINDED");
            }
            for (String point : readiness.checkInsPending(caseId)) {
                int day = CHECK_IN_DAYS.get(point);
                if (day > window.getFreeDays() || now.isBefore(window.day(day - 1)) || !now.isBefore(window.getEndsAt())
                        || !work.openWorkOwners(caseId, Set.of(CHECK_IN_WORK + point)).isEmpty()) continue;
                LocalDate on = LocalDate.ofInstant(window.day(day), sla.zone());
                work.openWorkItem(new NewWorkItem(caseId, CHECK_IN_WORK + point, "Check in with the patient (day " + day + " after discharge)",
                        "Call the patient: how they are, their medicines, the warning signs and the next follow-up. Record what you heard.",
                        coordinator(caseId), "COORDINATOR", false, on.atTime(END_OF_DAY).atZone(sla.zone()).toInstant(), "SYSTEM", CHECK_IN_WORK + point,
                        "check-in:" + caseId + ":" + point, false, WorkCopy.of(CHECK_IN_WORK + point, "caseNumber", caseNumber(caseId))), false);
                steps.add("CHECK_IN_" + point);
            }
        }
        if (AFTER_DISCHARGE.contains(status))
            for (var entry : OUTCOME_DAYS.entrySet()) {
                if (now.isBefore(window.day(entry.getValue())) || outcomes.findByCaseIdAndPoint(caseId, entry.getKey().name()).isPresent()) continue;
                UUID link = publicAccess.issueOutcomeLink(caseId, language(caseId));
                CaseOutcome asked = outcomes.saveAndFlush(new CaseOutcome(caseId, entry.getKey(), link, now));
                audit("OUTCOME_REQUESTED", "SYSTEM", "SYSTEM", caseId, "CaseOutcome", asked.getId(), entry.getKey().name());
                work.changed(caseId);
                steps.add("OUTCOME_" + entry.getKey().name());
            }
        if (ACTIVE.contains(status) && closeWindowIfDue(caseId, window, now)) steps.add("WINDOW_CLOSED");
        if (exits.closeAfterFollowUp(caseId)) { status = "CLOSED"; steps.add("CLOSED"); }
        boolean nothingLeft = outcomes.findByCaseIdAndPoint(caseId, CaseOutcome.Point.D90.name()).isPresent()
                && (window.getClosedAt() != null || "CLOSED".equals(status));
        if (nothingLeft && window.getCompletedAt() == null) { window.complete(now); windows.saveAndFlush(window); }
        if (!steps.isEmpty()) log.info("Follow-up of case {}: {}", caseId, steps);
        return steps;
    }

    /** The window is over and no complication waits: the ledger row the closure gate reads. True when written now. */
    private boolean closeWindowIfDue(UUID caseId, FollowUpWindow window, Instant now) {
        if (window.getClosedAt() != null || now.isBefore(window.getEndsAt()) || outcomes.existsByCaseIdAndComplicationTrueAndReviewedAtIsNull(caseId)) return false;
        if (!ACTIVE.contains(cases.findStageAndVersion(caseId).map(s -> s.getStatus().name()).orElse(""))) return false;
        ledger.record(caseId, new Fact(Kind.FOLLOW_UP_WINDOW_CLOSED, null, window.getFreeDays() + "d", null, window.getEndsAt(), null), "SYSTEM", "SYSTEM", null);
        window.close(now);
        windows.saveAndFlush(window);
        return true;
    }

    // ---- reads ----

    /** The staff "Follow-up" panel (the case's Consultant and coordinator). */
    @Transactional(readOnly = true)
    public FollowUpView view(UUID caseId) {
        authority.authorize(Permission.FOLLOW_UP_READ, Resource.ofCase(caseId));
        return staffView(caseId);
    }

    /** The patient's (or representative's) follow-up. */
    @Transactional(readOnly = true)
    public PatientFollowUpView patientView(UUID caseId) {
        authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        return forPatient(caseId);
    }

    /** The same from a verified secure link of the case (status or outcome). */
    @Transactional(readOnly = true)
    public PatientFollowUpView viewFromLink(String token, String grant) {
        return forPatient(publicAccess.requireCaseGrant(token, grant).caseId());
    }

    FollowUpView staffView(UUID caseId) {
        String status = cases.findStageAndVersion(caseId).map(s -> s.getStatus().name()).orElse(null);
        // Data minimisation: the clinical free text is the Consultant's; the coordinator sees the schedule, the scores and the flags.
        boolean clinical = authority.allowed(Permission.FOLLOW_UP_RECORD, Resource.ofCase(caseId));
        Instant now = clock.instant();
        FollowUpWindow w = windows.findByCaseId(caseId).orElse(null);
        WindowView window = w == null ? null : new WindowView(w.getDischargedAt(), w.getFreeDays(), w.getEndsAt(), w.getClosedAt());
        PlanView plan = plans.findFirstByCaseIdOrderByCreatedAtDesc(caseId)
                .map(p -> new PlanView(p.getId(), p.getDueAt(), p.getMode(), p.getRequiredTests(), p.getInstructions())).orElse(null);
        List<ContactView> schedule = contacts.findByCaseIdOrderByDueAtAscCreatedAtAsc(caseId).stream().map(c -> new ContactView(c.getId(), c.getOrigin().name(),
                c.getDueAt(), c.getMode(), c.getStatus().name(), c.getReminderSentAt(), c.getRecordedBy(), c.getRecordedAt(), clinical ? c.getNote() : null)).toList();
        List<CheckInView> checkIns = new ArrayList<>();
        if (w != null) {
            Map<String, CaseEvidence> recorded = new LinkedHashMap<>();
            for (CaseEvidence e : ledger.live(caseId, Kind.CHECK_IN)) recorded.putIfAbsent(e.getReference(), e);
            for (String point : FollowUpReadiness.CHECK_INS) {
                int day = CHECK_IN_DAYS.get(point);
                CaseEvidence e = recorded.get(point);
                Map<String, String> p = e == null ? Map.of() : payload(e);
                String state = e != null ? "DONE" : now.isBefore(w.day(day - 1)) ? "NOT_YET" : "DUE";
                checkIns.add(new CheckInView(point, w.day(day), state, p.get("outcome"), p.get("note"), e == null ? null : e.getRecordedBy(),
                        e == null ? null : e.getRecordedAt()));
            }
        }
        List<OutcomeView> answers = outcomes.findByCaseIdOrderByRequestedAtAsc(caseId).stream().map(o -> new OutcomeView(o.getPoint().name(), o.getRequestedAt(),
                open(o, now), o.getReportedAt(), o.getChannel(), o.getReportedRole(), o.getPainScore(), o.getFunctionScore(), o.getSatisfactionScore(),
                o.getComplication(), clinical ? o.getComplicationNote() : null, o.getIncidentId(), o.getReviewedAt(), o.getReviewedBy(),
                clinical ? o.getReviewNote() : null)).toList();
        List<ClosureBlocker> blockers = "FOLLOW_UP".equals(status)
                ? readiness.closureBlockers(caseId).stream().map(c -> new ClosureBlocker(c, FollowUpReadiness.label(c))).toList() : List.of();
        boolean reopen = "CLOSED".equals(status) && authority.allowed(Permission.CASE_REOPEN, Resource.ofCase(caseId));
        return new FollowUpView(caseId, status, window, plan, schedule, checkIns, answers, blockers, reopen);
    }

    PatientFollowUpView forPatient(UUID caseId) {
        String status = cases.findStageAndVersion(caseId).map(s -> s.getStatus().name()).orElse("");
        FollowUpWindow w = windows.findByCaseId(caseId).orElse(null);
        if (w == null || !AFTER_DISCHARGE.contains(status)) return new PatientFollowUpView(false, List.of(), null, false, List.of(), null, "CLOSED".equals(status));
        Instant now = clock.instant();
        List<PatientContactView> schedule = contacts.findByCaseIdOrderByDueAtAscCreatedAtAsc(caseId).stream()
                .filter(c -> c.getStatus() != FollowUpContact.Status.CANCELLED)
                .map(c -> new PatientContactView(c.getDueAt(), c.getMode(), c.getStatus().name())).toList();
        List<PatientOutcomeView> asked = outcomes.findByCaseIdOrderByRequestedAtAsc(caseId).stream()
                .map(o -> new PatientOutcomeView(o.getPoint().name(), o.getRequestedAt(), open(o, now), o.getReportedAt())).toList();
        String openOutcome = asked.stream().filter(PatientOutcomeView::open).map(PatientOutcomeView::point).findFirst().orElse(null);
        return new PatientFollowUpView(true, schedule, w.getEndsAt(), w.getClosedAt() != null, asked, openOutcome, "CLOSED".equals(status));
    }

    // ---- internals ----

    /** The plan's first contact, once per plan (in follow-up, after discharge). */
    private void ensureContacts(UUID caseId) {
        FollowUpPlan plan = plans.findFirstByCaseIdOrderByCreatedAtDesc(caseId).orElse(null);
        if (plan == null || "CANCELLED".equals(plan.getStatus()) || contacts.existsByFollowUpPlanIdAndOrigin(plan.getId(), FollowUpContact.Origin.PLAN.name())) return;
        contacts.saveAndFlush(new FollowUpContact(caseId, plan.getId(), FollowUpContact.Origin.PLAN, plan.getDueAt(), plan.getMode(), "SYSTEM", clock.instant()));
        syncContactWork(caseId);
    }

    /** The Consultant's one FOLLOW_UP_CONTACT item points at the next scheduled contact, due on its date. */
    private void syncContactWork(UUID caseId) {
        work.closeWorkItems(caseId, CONTACT_WORK, "Follow-up schedule changed", false);
        FollowUpContact next = contacts.findFirstByCaseIdAndStatusOrderByDueAtAscCreatedAtAsc(caseId, FollowUpContact.Status.SCHEDULED.name()).orElse(null);
        if (next == null) return;
        work.openWorkItem(new NewWorkItem(caseId, CONTACT_WORK, "Hold the follow-up contact", "Hold the follow-up " + next.getMode().toLowerCase(java.util.Locale.ROOT).replace('_', ' ')
                + " with the patient and record it.", consultant(caseId), "DOCTOR", false, next.getDueAt(), "SYSTEM", CONTACT_WORK,
                "follow-up-contact:" + next.getId(), false, WorkCopy.of(CONTACT_WORK, "caseNumber", caseNumber(caseId), "mode", next.getMode())), false);
    }

    private void tryClose(UUID caseId) { exits.closeAfterFollowUp(caseId); }

    private FollowUpContact scheduled(UUID caseId, UUID contactId) {
        FollowUpContact contact = contacts.findByIdAndCaseId(contactId, caseId)
                .orElseThrow(() -> new ApiException(404, "FOLLOW_UP_CONTACT_NOT_FOUND", "The follow-up contact was not found on this case"));
        if (contact.getStatus() != FollowUpContact.Status.SCHEDULED) throw new ApiException(409, "FOLLOW_UP_CONTACT_RECORDED", "This contact is already recorded");
        return contact;
    }

    private static boolean open(CaseOutcome o, Instant now) {
        return !o.answered() && now.isBefore(o.getRequestedAt().plus(Duration.ofDays(OUTCOME_OPEN_DAYS)));
    }

    private int freeDays(UUID caseId) {
        var p = commercialPolicies.activePolicyFor(cases.findCareCategory(caseId).orElse(null));
        return p == null ? com.rehletshifaa.journey.domain.CommercialPolicy.DEFAULT_FOLLOW_UP_FREE_DAYS : p.followUpDays();
    }

    private String lockStage(UUID caseId) {
        MedicalCase c = cases.lockById(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        return c.getStatus().name();
    }

    private static void requireActive(String stage) {
        if (!ACTIVE.contains(stage)) throw new ApiException(409, "FOLLOW_UP_NOT_ACTIVE", "Follow-up is recorded after discharge, before the case closes");
    }

    private String consultant(UUID caseId) { return assignments.findActiveAssignees(caseId, "DOCTOR").stream().findFirst().orElse(null); }

    private String coordinator(UUID caseId) { return assignments.findActivePrimaryCoordinator(caseId, Limit.of(1)).stream().findFirst().orElse(null); }

    private String language(UUID caseId) {
        return cases.findPatientContact(caseId).map(c -> "ar".equals(c.getPreferredLanguage()) ? "ar" : "en").orElse("en");
    }

    private String caseNumber(UUID caseId) { return cases.findCaseNumber(caseId).orElse(""); }

    private Map<String, String> payload(CaseEvidence e) {
        if (e.getPayload() == null) return Map.of();
        try { return json.readValue(e.getPayload(), new com.fasterxml.jackson.core.type.TypeReference<Map<String, String>>() {}); }
        catch (Exception ex) { return Map.of(); }
    }

    private String write(Object value) {
        try { return json.writeValueAsString(value); } catch (Exception e) { throw new IllegalStateException("Cannot write the follow-up payload", e); }
    }

    private void audit(String type, String subject, String role, UUID caseId, String entity, UUID id, String reason) {
        auditTrail.event(type).actor(subject, role).caseId(caseId).entity(entity, id).action("FOLLOW_UP").outcome("SUCCESS").reason(reason).record();
    }
}
