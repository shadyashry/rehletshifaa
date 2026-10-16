package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.journey.api.FollowUpDtos.CheckInRequest;
import com.rehletshifaa.journey.api.FollowUpDtos.ComplicationReviewRequest;
import com.rehletshifaa.journey.api.FollowUpDtos.ContactCancelRequest;
import com.rehletshifaa.journey.api.FollowUpDtos.ContactRecordRequest;
import com.rehletshifaa.journey.api.FollowUpDtos.ContactRequest;
import com.rehletshifaa.journey.api.FollowUpDtos.ContactView;
import com.rehletshifaa.journey.api.FollowUpDtos.FollowUpView;
import com.rehletshifaa.journey.api.FollowUpDtos.OutcomeRequest;
import com.rehletshifaa.journey.api.FollowUpDtos.PatientFollowUpView;
import com.rehletshifaa.journey.api.FollowUpDtos.PublicOutcomeRequest;
import com.rehletshifaa.journey.api.JourneyDtos.CommercialPolicyRequest;
import com.rehletshifaa.journey.api.SafetyDtos.ReopenRequest;
import com.rehletshifaa.settlement.api.SettlementDtos.InvoiceLineRequest;
import com.rehletshifaa.settlement.api.SettlementDtos.SubmitReconciliationRequest;
import com.rehletshifaa.settlement.application.ReconciliationService;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P1-18 session 1 (post-deposit design §5 stage 6, decision D-G; architecture §4.6, §5.6): the follow-up window opened at discharge,
 * the Consultant's contact schedule (held, missed and rebooked, cancelled) with the patient's reminder the day before, the
 * coordinator's day-3/14/30 check-ins, the day-30/90 outcome questions from My Care or the OUTCOME secure link, a reported
 * complication (incident, the Consultant's review, the window held), the case closing on its own with the CLOSURE statement and the
 * review request, and a reopened case closing again. Time moves by ageing the window (the commands run on the real clock).
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class FollowUpServiceTest extends DischargeFixture {
    static final String NOTICE = FollowUpService.OUTCOME_NOTICE_VERSION;
    @Autowired FollowUpService followUps; @Autowired ReconciliationService reconciliations; @Autowired CaseReopenService reopening;
    @Autowired StaffWorkService work; @Autowired CommercialPolicyService commercialPolicies; @Autowired PublicCaseAccessService publicCases;
    @Autowired IntakeLifecycleService intakeLifecycle; @Autowired ObjectMapper json;

    @Test void theScheduleIsKeptCheckedInAndTheCaseClosesOnItsOwnWithTheClosureStatement() {
        Arrived c = inFollowUp();
        assertThat(jdbc.queryForObject("SELECT free_days FROM follow_up_windows WHERE case_id=?", Integer.class, c.caseId)).as("D-G default").isEqualTo(30);
        asDoctor();
        FollowUpView view = followUps.view(c.caseId);
        assertThat(view.window().endsAt()).isEqualTo(view.window().dischargedAt().plus(Duration.ofDays(30)));
        assertThat(view.contacts()).extracting(ContactView::origin, ContactView::status, ContactView::mode).containsExactly(org.assertj.core.groups.Tuple.tuple("PLAN", "SCHEDULED", "VIDEO"));
        assertThat(view.checkIns()).extracting(v -> v.point() + ":" + v.status()).containsExactly("D3:NOT_YET", "D14:NOT_YET", "D30:NOT_YET");
        assertThat(view.closureBlockers()).extracting(b -> b.code()).containsExactly("FOLLOW_UP_WINDOW_OPEN", "FOLLOW_UP_CONTACT_OPEN");
        assertThat(openWork(c.caseId, "FOLLOW_UP_CONTACT", DOCTOR)).isEqualTo(1);
        UUID first = view.contacts().get(0).id();

        // The patient is reminded once, the day before.
        jdbc.update("UPDATE follow_up_contacts SET due_at=? WHERE id=?", Instant.now().plus(Duration.ofHours(12)), first);
        em.flush(); em.clear();
        assertThat(followUps.evaluate(c.caseId, Instant.now())).contains("REMINDED");
        assertThat(followUps.evaluate(c.caseId, Instant.now())).doesNotContain("REMINDED");
        assertThat(count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='follow-up-reminder'")).isEqualTo(1);

        // Held, then an added contact the patient misses: the coordinator rebooks, which holds the closure until a new one is booked.
        asDoctor();
        view = followUps.addContact(c.caseId, new ContactRequest(Instant.now().plus(Duration.ofDays(20)), "PHONE"));
        UUID second = view.contacts().get(1).id();
        view = followUps.recordContact(c.caseId, first, new ContactRecordRequest("DONE", "Wound healing well, ECG normal"));
        assertThat(view.contacts().get(0).status()).isEqualTo("DONE");
        assertThat(jdbc.queryForObject("SELECT note FROM follow_up_contacts WHERE id=?", String.class, first)).as("encrypted").doesNotContain("Wound");
        assertThat(count("SELECT COUNT(*) FROM case_evidence WHERE case_id=? AND kind='FOLLOW_UP_CONTACT' AND reference=?", c.caseId, first.toString())).isEqualTo(1);
        assertThatThrownBy(() -> followUps.recordContact(c.caseId, first, new ContactRecordRequest("DONE", "again")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("FOLLOW_UP_CONTACT_RECORDED");
        assertThat(jdbc.queryForObject("SELECT due_at FROM case_tasks WHERE case_id=? AND task_type='FOLLOW_UP_CONTACT' AND status='OPEN'", Instant.class, c.caseId))
                .as("the item points at the next contact").isEqualTo(view.contacts().get(1).dueAt());
        view = followUps.recordContact(c.caseId, second, new ContactRecordRequest("MISSED", "No answer on the phone"));
        assertThat(openWork(c.caseId, "REBOOK_FOLLOW_UP", COORDINATOR)).isEqualTo(1);
        assertThat(openWork(c.caseId, "FOLLOW_UP_CONTACT", DOCTOR)).isZero();
        assertThat(view.closureBlockers()).extracting(b -> b.code()).contains("FOLLOW_UP_REVIEW_OPEN");
        view = followUps.addContact(c.caseId, new ContactRequest(Instant.now().plus(Duration.ofDays(2)), "VIDEO"));
        assertThat(openWork(c.caseId, "REBOOK_FOLLOW_UP", COORDINATOR)).as("booking a new contact closes the rebooking").isZero();
        UUID third = view.contacts().stream().filter(v -> "SCHEDULED".equals(v.status())).findFirst().orElseThrow().id();
        followUps.recordContact(c.caseId, third, new ContactRecordRequest("DONE", "Seen by video; resume normal activity"));
        UUID extra = followUps.addContact(c.caseId, new ContactRequest(Instant.now().plus(Duration.ofDays(60)), "IN_PERSON")).contacts().stream()
                .filter(v -> "SCHEDULED".equals(v.status())).findFirst().orElseThrow().id();
        assertThat(followUps.cancelContact(c.caseId, extra, new ContactCancelRequest("Booked by mistake")).contacts())
                .as("in date order").extracting(ContactView::status).containsExactly("DONE", "DONE", "MISSED", "CANCELLED");

        // Day 29.5: the check-ins inside the window are open (none before their day); the coordinator records them.
        asCoordinator();
        assertThatThrownBy(() -> followUps.recordCheckIn(c.caseId, "D3", new CheckInRequest("REACHED", null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CHECK_IN_NOT_DUE");
        age(c.caseId, Duration.ofHours(29 * 24 + 12));
        assertThat(followUps.evaluate(c.caseId, Instant.now())).contains("CHECK_IN_D3", "CHECK_IN_D14", "CHECK_IN_D30").doesNotContain("OUTCOME_D30", "CLOSED");
        assertThat(followUps.evaluate(c.caseId, Instant.now())).as("opened once").doesNotContain("CHECK_IN_D3");
        assertThat(openWork(c.caseId, "CHECK_IN_D14", COORDINATOR)).isEqualTo(1);
        followUps.recordCheckIn(c.caseId, "D3", new CheckInRequest("REACHED", "Feeling well, taking the medicines"));
        followUps.recordCheckIn(c.caseId, "D14", new CheckInRequest("NOT_REACHED", "Two calls, no answer"));
        assertThatThrownBy(() -> followUps.recordCheckIn(c.caseId, "D3", new CheckInRequest("REACHED", null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CHECK_IN_ALREADY_RECORDED");
        assertThatThrownBy(() -> followUps.recordCheckIn(c.caseId, "D7", new CheckInRequest("REACHED", null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CHECK_IN_UNKNOWN");
        view = followUps.recordCheckIn(c.caseId, "D30", new CheckInRequest("REACHED", null));
        assertThat(view.checkIns()).extracting(v -> v.point() + ":" + v.status() + ":" + v.outcome()).containsExactly("D3:DONE:REACHED", "D14:DONE:NOT_REACHED", "D30:DONE:REACHED");
        assertThat(view.closureBlockers()).extracting(b -> b.code()).containsExactly("FOLLOW_UP_WINDOW_OPEN");

        // Day 31: the day-30 question is asked, the window closes and the case closes: the closure statement and the review request.
        age(c.caseId, Duration.ofDays(31));
        assertThat(followUps.evaluate(c.caseId, Instant.now())).containsExactly("OUTCOME_D30", "WINDOW_CLOSED", "CLOSED");
        assertThat(caseStatus(c.caseId)).isEqualTo("CLOSED");
        assertThat(jdbc.queryForObject("SELECT reason FROM case_exit_reasons WHERE case_id=? ORDER BY recorded_at DESC LIMIT 1", String.class, c.caseId))
                .isEqualTo("FOLLOW_UP_COMPLETED");
        assertThat(count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='closure-review'")).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='outcome-request'")).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM case_access_links WHERE case_id=? AND purpose='OUTCOME'", c.caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT statement_number FROM statements WHERE case_id=? AND kind='CLOSURE'", String.class, c.caseId))
                .isEqualTo("RS-SC-" + caseNumber(c.caseId).substring(3) + "-1");
        asDoctor();
        assertThatThrownBy(() -> followUps.addContact(c.caseId, new ContactRequest(Instant.now().plus(Duration.ofDays(3)), "PHONE")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("FOLLOW_UP_NOT_ACTIVE");

        // The patient answers the day-30 question in My Care (no complication); once.
        asPatient();
        assertThat(journey.workspace(c.caseId).actions().currentAction().code()).isEqualTo("REPORT_OUTCOME");
        PatientFollowUpView mine = followUps.patientView(c.caseId);
        assertThat(mine.openOutcome()).isEqualTo("D30");
        assertThat(mine.closed()).isTrue();
        assertThat(mine.contacts()).as("the cancelled one is not shown").hasSize(3);
        assertThatThrownBy(() -> followUps.reportOutcome(c.caseId, "D90", new OutcomeRequest(1, 9, 9, false, null, NOTICE)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("OUTCOME_NOT_REQUESTED");
        mine = followUps.reportOutcome(c.caseId, "D30", new OutcomeRequest(2, 8, 9, false, null, NOTICE));
        assertThat(mine.openOutcome()).isNull();
        assertThatThrownBy(() -> followUps.reportOutcome(c.caseId, "D30", new OutcomeRequest(2, 8, 9, false, null, NOTICE)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("OUTCOME_ALREADY_REPORTED");
        assertThat(journey.workspace(c.caseId).actions().currentAction().exit()).as("answered: the journey reads as completed").isEqualTo("COMPLETED");
        assertThat(count("SELECT COUNT(*) FROM case_incidents WHERE case_id=?", c.caseId)).isZero();

        // Day 91: the day-90 question; then nothing more is scheduled. A second sweep issues no second closure statement or message.
        age(c.caseId, Duration.ofDays(91));
        assertThat(followUps.evaluate(c.caseId, Instant.now())).containsExactly("OUTCOME_D90");
        assertThat(jdbc.queryForObject("SELECT completed_at FROM follow_up_windows WHERE case_id=?", Instant.class, c.caseId)).isNotNull();
        assertThat(count("SELECT COUNT(*) FROM case_access_links WHERE case_id=? AND purpose='OUTCOME' AND revoked_at IS NULL", c.caseId))
                .as("the day-30 link is revoked by the day-90 one").isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM statements WHERE case_id=? AND kind='CLOSURE'", c.caseId)).isEqualTo(1);
        // A question left unanswered for 30 days closes.
        jdbc.update("UPDATE case_outcomes SET requested_at=? WHERE case_id=? AND point='D90'", Instant.now().minus(Duration.ofDays(31)), c.caseId);
        em.flush(); em.clear();
        asPatient();
        assertThatThrownBy(() -> followUps.reportOutcome(c.caseId, "D90", new OutcomeRequest(1, 9, 9, false, null, NOTICE)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("OUTCOME_CLOSED");
        // Finance and Operations never read the outcome answers.
        asOps();
        assertThatThrownBy(() -> followUps.view(c.caseId)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("PERMISSION_NOT_HELD");
    }

    @Test void aComplicationOnTheOutcomeLinkIsReviewedBeforeTheWindowClosesAndAReopenedCaseClosesAgain() throws Exception {
        signIn("finance-manager-subject", Role.FINANCE_MANAGER);
        assertThatThrownBy(() -> commercialPolicies.configure(policy(5))).isInstanceOf(ApiException.class).extracting("code").isEqualTo("FOLLOW_UP_WINDOW_INVALID");
        assertThat(commercialPolicies.configure(policy(45)).followUpFreeDays()).isEqualTo(45);
        Arrived c = inFollowUp();
        assertThat(jdbc.queryForObject("SELECT free_days FROM follow_up_windows WHERE case_id=?", Integer.class, c.caseId)).isEqualTo(45);
        asDoctor();
        UUID planned = followUps.view(c.caseId).contacts().get(0).id();
        followUps.recordContact(c.caseId, planned, new ContactRecordRequest("DONE", "Recovering as expected"));
        age(c.caseId, Duration.ofHours(30 * 24 + 12));
        assertThat(followUps.evaluate(c.caseId, Instant.now())).contains("CHECK_IN_D30", "OUTCOME_D30").doesNotContain("WINDOW_CLOSED");
        asCoordinator();
        for (String point : List.of("D3", "D14", "D30")) followUps.recordCheckIn(c.caseId, point, new CheckInRequest("REACHED", null));

        // The patient answers on the OUTCOME link; a complication must say what happened.
        String token = outcomeToken(c.caseId);
        String grant = grant(token);
        assertThatThrownBy(() -> followUps.reportOutcomeFromLink(token, "D30", new PublicOutcomeRequest(grant, "PATIENT", 6, 4, 7, true, " ", NOTICE)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("COMPLICATION_DETAILS_REQUIRED");
        assertThatThrownBy(() -> followUps.reportOutcomeFromLink(token, "D30", new PublicOutcomeRequest(grant, "PATIENT", 6, 4, 7, false, null, "outcome-notice-old")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("OUTCOME_NOTICE_OUTDATED");
        // The code went to the person who sent the case: they declare they answer for the patient.
        PatientFollowUpView seen = followUps.reportOutcomeFromLink(token, "D30", new PublicOutcomeRequest(grant, "REPRESENTATIVE", 6, 4, 7, true, "Swelling and fever at the wrist", NOTICE));
        assertThat(jdbc.queryForObject("SELECT reported_role || ' ' || notice_version FROM case_outcomes WHERE case_id=? AND point='D30'", String.class, c.caseId))
                .isEqualTo("PATIENT_REPRESENTATIVE " + NOTICE);
        assertThat(seen.outcomes()).extracting(o -> o.point() + ":" + o.open()).containsExactly("D30:false");
        assertThat(jdbc.queryForObject("SELECT channel FROM case_outcomes WHERE case_id=? AND point='D30'", String.class, c.caseId)).isEqualTo("SECURE_LINK");
        assertThat(jdbc.queryForObject("SELECT complication_note FROM case_outcomes WHERE case_id=? AND point='D30'", String.class, c.caseId))
                .as("encrypted").doesNotContain("Swelling");
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE case_id=? AND event_type='OUTCOME_REPORTED' AND reason LIKE '%Swelling%'", c.caseId))
                .as("audit carries no answer").isZero();
        assertThat(count("SELECT COUNT(*) FROM case_incidents WHERE case_id=? AND incident_type='ADVERSE_EVENT' AND source='SYSTEM'", c.caseId)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM case_outcomes WHERE case_id=? AND incident_id IS NOT NULL", c.caseId)).isEqualTo(1);
        assertThat(openWork(c.caseId, "REVIEW_COMPLICATION", DOCTOR)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='COMPLICATION_REPORTED'", COORDINATOR)).isEqualTo(1);
        var coordinatorView = followUps.view(c.caseId).outcomes().get(0);
        assertThat(coordinatorView.complication()).as("the coordinator sees the flag").isTrue();
        assertThat(coordinatorView.complicationNote()).as("not the clinical text").isNull();

        // Day 46: the window would be over, but the complication waits for the Consultant: nothing closes.
        age(c.caseId, Duration.ofDays(46));
        assertThat(followUps.evaluate(c.caseId, Instant.now())).doesNotContain("WINDOW_CLOSED", "CLOSED");
        asDoctor();
        FollowUpView view = followUps.view(c.caseId);
        assertThat(view.closureBlockers()).extracting(b -> b.code()).containsExactly("FOLLOW_UP_WINDOW_OPEN", "COMPLICATION_UNDER_REVIEW");
        assertThat(view.outcomes().get(0).complicationNote()).isEqualTo("Swelling and fever at the wrist");
        assertThat(view.outcomes().get(0).pain()).isEqualTo(6);

        // The Consultant's review lets the window close and the case close.
        view = followUps.reviewComplication(c.caseId, "D30", new ComplicationReviewRequest("Local infection; antibiotics started by the home doctor"));
        assertThat(caseStatus(c.caseId)).isEqualTo("CLOSED");
        assertThat(view.reopenAvailable()).isTrue();
        assertThat(openWork(c.caseId, "REVIEW_COMPLICATION", DOCTOR)).isZero();
        assertThatThrownBy(() -> followUps.reviewComplication(c.caseId, "D30", new ComplicationReviewRequest("again")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("COMPLICATION_NOT_AWAITING_REVIEW");

        // Reopened (P1-13), the case closes again once the Consultant's reopen review is done; the account did not change.
        reopening.reopen(c.caseId, new ReopenRequest("COMPLICATION_REPORTED", null, "Check the wrist again"));
        assertThat(followUps.evaluate(c.caseId, Instant.now())).doesNotContain("CLOSED");
        assertThat(followUps.view(c.caseId).closureBlockers()).extracting(b -> b.code()).containsExactly("FOLLOW_UP_REVIEW_OPEN");
        work.closeWorkItems(c.caseId, "FOLLOW_UP_REVIEW", "Reviewed: healing");
        assertThat(followUps.evaluate(c.caseId, Instant.now())).contains("CLOSED");
        assertThat(count("SELECT COUNT(*) FROM statements WHERE case_id=? AND kind='CLOSURE'", c.caseId)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='closure-review'")).isEqualTo(1);
    }

    @Test void onlyTheOutcomeLinkAnswersTheQuestions() throws Exception {
        Arrived c = inFollowUp();
        age(c.caseId, Duration.ofDays(31));
        followUps.evaluate(c.caseId, Instant.now());
        String status = publicCases.issueStatusLink(c.caseId, "en", "case-status-link", "p118-link:" + c.caseId);
        String grant = grant(status);
        assertThat(followUps.viewFromLink(status, grant).openOutcome()).as("any verified link reads the follow-up").isEqualTo("D30");
        assertThatThrownBy(() -> followUps.reportOutcomeFromLink(status, "D30", new PublicOutcomeRequest(grant, "PATIENT", 1, 9, 9, false, null, NOTICE)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("LINK_PURPOSE_MISMATCH");
    }

    // ---------- fixture ----------

    /** A discharged case whose final invoice Finance reconciled at the quoted price: in FOLLOW_UP, the window open. */
    Arrived inFollowUp() {
        Arrived c = discharged("100000.00");
        asFinance();
        reconciliations.open(c.caseId);
        reconciliations.submit(c.caseId, new SubmitReconciliationRequest(List.of(new InvoiceLineRequest("Cardiac package", new BigDecimal("100000.00"), "PACKAGE", null, null)),
                new BigDecimal("97750.00"), null));
        assertThat(caseStatus(c.caseId)).isEqualTo("FOLLOW_UP");
        return c;
    }

    /** Moves the case's discharge {@code ago} into the past (the window keeps its length). */
    void age(UUID caseId, Duration ago) {
        Instant discharged = Instant.now().minus(ago);
        int days = jdbc.queryForObject("SELECT free_days FROM follow_up_windows WHERE case_id=?", Integer.class, caseId);
        jdbc.update("UPDATE follow_up_windows SET discharged_at=?, ends_at=? WHERE case_id=?", discharged, discharged.plus(Duration.ofDays(days)), caseId);
        em.flush(); em.clear();
    }

    int openWork(UUID caseId, String type, String owner) {
        return count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type=? AND owner_subject=? AND status='OPEN'", caseId, type, owner);
    }

    static CommercialPolicyRequest policy(int followUpDays) {
        return new CommercialPolicyRequest("Cardiology", "cardiology", new BigDecimal("0.15"), null, null, null, null, null, null, followUpDays);
    }

    /** The OUTCOME link's token, read back from the outcome-request message (decrypted). */
    String outcomeToken(UUID caseId) throws Exception {
        em.flush();
        String raw = jdbc.queryForObject("SELECT o.template_data FROM notification_outbox o WHERE o.template_key='outcome-request' ORDER BY o.created_at DESC LIMIT 1", String.class);
        return data(raw).get("token");
    }

    /** Verify the one-time code sent for the link and return the grant. */
    String grant(String token) throws Exception {
        publicCases.requestAccess(token); em.flush();
        String raw = jdbc.queryForObject("SELECT o.template_data FROM notification_outbox o JOIN case_access_challenges ch ON o.idempotency_key='case-access:'||ch.id "
                + "JOIN case_access_links l ON l.id=ch.link_id WHERE l.token_hash=? ORDER BY o.created_at DESC LIMIT 1", String.class, intakeLifecycle.hash(token));
        return publicCases.verify(token, data(raw).get("code")).grant();
    }

    Map<String, String> data(String raw) throws Exception {
        return json.readValue(raw.startsWith("enc:") ? crypto.decrypt(raw.substring(4)) : raw, new TypeReference<Map<String, String>>() {});
    }
}
