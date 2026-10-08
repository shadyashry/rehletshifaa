package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

/**
 * The coordinator-mediated proposal decision (plans/arabic-proposal-decision.md): the patient asks for an Arabic
 * conversation from the portal or the secure link, and only the owning coordinator records the decision — with the
 * same state change as the patient's own, and a row that says it was recorded.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class AssistedProposalDecisionTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired ProposalAssistanceService assistance;
    @Autowired PublicCaseAccessService publicCases; @Autowired JdbcTemplate jdbc; @Autowired ObjectMapper json;
    @Autowired CryptoService crypto; @Autowired EntityManager em; @Autowired com.rehletshifaa.casemanagement.application.IntakeLifecycleService intakeLifecycle;
    @Autowired StaffWorkQueryService staffWork;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void thePatientAsksOnceAndTheOwningCoordinatorGetsOneWorkItem() throws Exception {
        UUID caseId = ownedCase("+254700000801", "assist-a@local.test");
        UUID versionId = releasedProposal(caseId);
        linkPatient(caseId, "patient-assist-a");
        authenticate("patient-assist-a", Role.PATIENT);
        ProposalAssistanceView first = assistance.requestFromPortal(caseId, versionId);
        ProposalAssistanceView again = assistance.requestFromPortal(caseId, versionId);
        em.flush();
        assertThat(first.requestedAt()).isNotNull();
        assertThat(again.requestedAt()).isEqualTo(first.requestedAt());
        assertThat(count("SELECT count(*) FROM proposal_assistance_requests WHERE proposal_version_id=?", versionId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='PROPOSAL_TERMS_CALL' AND status='OPEN' AND owner_subject='coordinator-subject'", caseId)).isEqualTo(1);
        // The patient's own page says the request was made, after a reload.
        assertThat(journey.workspace(caseId).proposal().assistance().requestedAt()).isEqualTo(first.requestedAt());
        assertThat(count("SELECT count(*) FROM proposal_decisions WHERE proposal_version_id=?", versionId)).isZero();
    }

    @Test void theOwningCoordinatorRecordsAnAcknowledgementWithTheSameEffectAsThePatients() throws Exception {
        UUID caseId = ownedCase("+254700000802", "assist-b@local.test");
        UUID versionId = releasedProposal(caseId);
        linkPatient(caseId, "patient-assist-b");
        authenticate("patient-assist-b", Role.PATIENT);
        assistance.requestFromPortal(caseId, versionId);
        authenticate("coordinator-subject", Role.COORDINATOR);
        Instant call = Instant.now();
        ProposalView recorded = assistance.recordDecision(caseId, versionId, new RecordedDecisionRequest("ACKNOWLEDGED", null, "PHONE", "PATIENT", call, true));
        em.flush();
        assertThat(recorded.status()).isEqualTo("ACCEPTED");
        assertThat(status(caseId)).isEqualTo("ACCEPTED");
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM proposal_decisions WHERE proposal_version_id=?", versionId);
        assertThat(row.get("DECISION_SOURCE")).isEqualTo("RECORDED_ON_BEHALF");
        assertThat(row.get("RECORDED_BY")).isEqualTo("coordinator-subject");
        assertThat(row.get("DECISION_CHANNEL")).isEqualTo("PHONE");
        assertThat(row.get("CONFIRMED_BY")).isEqualTo("PATIENT");
        assertThat(row.get("TERMS_LANGUAGE")).isEqualTo("ar");
        assertThat(row.get("ACKNOWLEDGED")).isEqualTo(true);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='PROPOSAL_TERMS_CALL' AND status='OPEN'", caseId)).isZero();
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='PROPOSAL_DECIDED_ON_BEHALF' AND case_id=?", caseId)).isEqualTo(1);
        // The patient is told once, on the case's contact channel, that a decision was recorded for them.
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE template_key='proposal-decision-recorded' AND idempotency_key=?", "proposal-decision-recorded:" + versionId)).isEqualTo(1);
        // The patient sees who recorded it and how — never a decision that looks like their own click.
        authenticate("patient-assist-b", Role.PATIENT);
        ProposalAssistanceView view = journey.workspace(caseId).proposal().assistance();
        assertThat(view.decisionSource()).isEqualTo("RECORDED_ON_BEHALF");
        assertThat(view.recordedByName()).isEqualTo("Coordinator One");
        assertThat(view.channel()).isEqualTo("PHONE");
        // Decided once: a second recording is refused.
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThatThrownBy(() -> assistance.recordDecision(caseId, versionId, new RecordedDecisionRequest("DECLINED", null, "PHONE", "PATIENT", call, true)))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("PROPOSAL_NOT_DECIDABLE"));
    }

    @Test void onlyTheOwningCoordinatorMayRecordAndOnlyThePatientMayAsk() throws Exception {
        UUID caseId = ownedCase("+254700000803", "assist-c@local.test");
        UUID versionId = releasedProposal(caseId);
        linkPatient(caseId, "patient-assist-c");
        RecordedDecisionRequest acknowledge = new RecordedDecisionRequest("ACKNOWLEDGED", null, "PHONE", "PATIENT", Instant.now(), true);

        authenticate("coordinator-other", Role.COORDINATOR);
        assertCode("OUT_OF_SCOPE", () -> assistance.recordDecision(caseId, versionId, acknowledge));
        assertCode("OUT_OF_SCOPE", () -> assistance.requestFromPortal(caseId, versionId));
        authenticate("doctor-subject", Role.CONSULTANT);
        assertCode("PERMISSION_NOT_HELD", () -> assistance.recordDecision(caseId, versionId, acknowledge));
        authenticate("coordinator-subject", Role.COORDINATOR);
        // The owner can message the case but is not the patient: they cannot ask on the patient's behalf.
        assertThatThrownBy(() -> assistance.requestFromPortal(caseId, versionId))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("PATIENT_ONLY"));
        authenticate("patient-assist-c", Role.PATIENT);
        assertCode("PERMISSION_NOT_HELD", () -> assistance.recordDecision(caseId, versionId, acknowledge));
        authenticate("patient-other", Role.PATIENT);
        assertCode("PERMISSION_NOT_HELD", () -> assistance.requestFromPortal(caseId, versionId)); // another patient holds no grant on this case
        em.flush();
        assertThat(count("SELECT count(*) FROM proposal_decisions WHERE proposal_version_id=?", versionId)).isZero();
        assertThat(count("SELECT count(*) FROM proposal_assistance_requests WHERE proposal_version_id=?", versionId)).isZero();
    }

    @Test void aRecordingNeedsTheAttestationANoteForChangesAPastCallAndARealRepresentative() throws Exception {
        UUID caseId = ownedCase("+254700000804", "assist-d@local.test");
        UUID versionId = releasedProposal(caseId);
        authenticate("coordinator-subject", Role.COORDINATOR);
        Instant now = Instant.now();
        assertCode("ATTESTATION_REQUIRED", () -> assistance.recordDecision(caseId, versionId, new RecordedDecisionRequest("ACKNOWLEDGED", null, "PHONE", "PATIENT", now, false)));
        assertCode("NOTE_REQUIRED", () -> assistance.recordDecision(caseId, versionId, new RecordedDecisionRequest("REVISION_REQUESTED", "  ", "PHONE", "PATIENT", now, true)));
        assertCode("CONVERSATION_IN_FUTURE", () -> assistance.recordDecision(caseId, versionId, new RecordedDecisionRequest("ACKNOWLEDGED", null, "PHONE", "PATIENT", now.plusSeconds(3600), true)));
        // Nobody holds an authorised representative link for this patient, so no representative could have confirmed.
        assertCode("REPRESENTATIVE_NOT_AUTHORISED", () -> assistance.recordDecision(caseId, versionId, new RecordedDecisionRequest("ACKNOWLEDGED", null, "PHONE", "REPRESENTATIVE", now, true)));
        em.flush();
        assertThat(count("SELECT count(*) FROM proposal_decisions WHERE proposal_version_id=?", versionId)).isZero();
        assertThat(status(caseId)).isEqualTo("PATIENT_DECISION");
    }

    @Test void onlyAnAuthorisedRepresentativeCanConfirmAndTheRecordSaysWhich() throws Exception {
        UUID caseId = ownedCase("+254700000811", "assist-k@local.test");
        UUID versionId = releasedProposal(caseId);
        RecordedDecisionRequest byRepresentative = new RecordedDecisionRequest("ACKNOWLEDGED", null, "PHONE", "REPRESENTATIVE", Instant.now(), true);
        // A submitter who called themselves a representative holds no authorisation to act for the patient.
        jdbc.update("UPDATE case_submission_contacts SET contact_role='REPRESENTATIVE' WHERE case_id=?", caseId);
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertCode("REPRESENTATIVE_NOT_AUTHORISED", () -> assistance.recordDecision(caseId, versionId, byRepresentative));
        // Expired and revoked links do not count either.
        represent(caseId, "rep-expired", Instant.now().minusSeconds(60), null);
        represent(caseId, "rep-revoked", null, Instant.now().minusSeconds(60));
        assertCode("REPRESENTATIVE_NOT_AUTHORISED", () -> assistance.recordDecision(caseId, versionId, byRepresentative));
        represent(caseId, "rep-in-force", null, null);
        assistance.recordDecision(caseId, versionId, byRepresentative);
        em.flush();
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM proposal_decisions WHERE proposal_version_id=?", versionId);
        assertThat(row.get("CONFIRMED_BY")).isEqualTo("REPRESENTATIVE");
        assertThat(row.get("CONFIRMED_REPRESENTATIVE_SUBJECT")).isEqualTo("rep-in-force");
    }

    @Test void twoAuthorisedRepresentativesAreAmbiguousAndAPatientConfirmationNamesNoRepresentative() throws Exception {
        UUID caseId = ownedCase("+254700000812", "assist-l@local.test");
        UUID versionId = releasedProposal(caseId);
        represent(caseId, "rep-one", null, null);
        represent(caseId, "rep-two", null, null);
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertCode("REPRESENTATIVE_AMBIGUOUS", () -> assistance.recordDecision(caseId, versionId,
                new RecordedDecisionRequest("ACKNOWLEDGED", null, "PHONE", "REPRESENTATIVE", Instant.now(), true)));
        assistance.recordDecision(caseId, versionId, new RecordedDecisionRequest("ACKNOWLEDGED", null, "PHONE", "PATIENT", Instant.now(), true));
        em.flush();
        assertThat(jdbc.queryForObject("SELECT confirmed_representative_subject FROM proposal_decisions WHERE proposal_version_id=?", String.class, versionId)).isNull();
    }

    @Test void workItemsCarryACopyCodeAndParametersSoThePortalCanWordThemInEveryLocale() throws Exception {
        UUID caseId = ownedCase("+254700000813", "assist-m@local.test");
        // The consultant's recommendation opened "prepare the proposal" work, keyed for translation; the name is encrypted.
        UUID versionId = releasedProposal(caseId);
        Map<String, Object> prepare = jdbc.queryForMap("SELECT copy_code, copy_params FROM case_tasks WHERE case_id=? AND task_type='PREPARE_PROPOSAL'", caseId);
        assertThat(prepare.get("COPY_CODE")).isEqualTo("RECOMMENDATION_READY");
        String params = (String) prepare.get("COPY_PARAMS");
        assertThat(params).startsWith("enc:");
        assertThat(json.readValue(crypto.decrypt(params.substring(4)), new TypeReference<Map<String, String>>() {})).containsEntry("consultant", "Doctor One");

        linkPatient(caseId, "patient-assist-m");
        authenticate("patient-assist-m", Role.PATIENT);
        assistance.requestFromPortal(caseId, versionId);
        em.flush();
        authenticate("coordinator-subject", Role.COORDINATOR);
        var item = staffWork.myWork().stream().filter(w -> w.caseId().equals(caseId) && ProposalAssistanceService.WORK_TYPE.equals(w.type())).findFirst().orElseThrow();
        assertThat(item.copy()).isEqualTo(new com.rehletshifaa.journey.api.WorkDtos.WorkCopy("PROPOSAL_TERMS_CALL", Map.of()));
        var actions = journey.workspace(caseId).actions();
        var current = actions.currentAction();
        assertThat(current.workType()).isEqualTo(ProposalAssistanceService.WORK_TYPE);
        assertThat(current.copy()).isEqualTo(item.copy());
        // The stage still waits on the patient's decision, so the reason is the patient default — now as a code too.
        assertThat(actions.waitingReasonCode()).isEqualTo("DEFAULT_PATIENT");
        var notice = staffWork.myNotifications().items().stream().filter(n -> caseId.equals(n.caseId()) && "PROPOSAL_ASSISTANCE_REQUESTED".equals(n.eventType())).findFirst().orElseThrow();
        assertThat(notice.copy()).isEqualTo(item.copy());
    }

    @Test void aDeclineBecomesWorkWhoseCopyQuotesThePatient() throws Exception {
        UUID caseId = ownedCase("+254700000814", "assist-n@local.test");
        releasedProposal(caseId);
        var link = openViaStatusLink(caseId, "+254700000814");
        journey.decideProposalPublic(link.token(), link.grant(), new PublicProposalDecisionRequest(link.grant(), "DECLINED", "Too far to travel", null));
        em.flush();
        authenticate("coordinator-subject", Role.COORDINATOR);
        var item = staffWork.myWork().stream().filter(w -> w.caseId().equals(caseId) && "PROPOSAL_DECLINED_REVIEW".equals(w.type())).findFirst().orElseThrow();
        assertThat(item.copy()).isEqualTo(new com.rehletshifaa.journey.api.WorkDtos.WorkCopy("PROPOSAL_DECLINED", Map.of("said", "Too far to travel")));
        // The English text stays for e-mail and older clients.
        assertThat(item.title()).isEqualTo("Patient declined the proposal");
    }

    @Test void theCoordinatorPicksWhichAuthorisedRepresentativeConfirmed() throws Exception {
        UUID caseId = ownedCase("+254700000815", "assist-o@local.test");
        UUID versionId = releasedProposal(caseId);
        UUID one = represent(caseId, "rep-picked-one", null, null);
        UUID two = represent(caseId, "rep-picked-two", null, null);
        UUID revoked = represent(caseId, "rep-picked-revoked", null, Instant.now().minusSeconds(60));
        UUID otherCase = ownedCase("+254700000816", "assist-p@local.test");
        UUID elsewhere = represent(otherCase, "rep-elsewhere", null, null);
        jdbc.update("INSERT INTO portal_preferences(subject,display_name_encrypted,locale,updated_at) VALUES(?,?,?,?)", "rep-picked-two", crypto.encrypt("Omar Example"), "ar", Instant.now());
        linkPatient(caseId, "patient-assist-o");

        // The owning coordinator sees who may confirm: in-force links only, named when the person set a name.
        authenticate("coordinator-subject", Role.COORDINATOR);
        var options = journey.workspace(caseId).representatives();
        assertThat(options).extracting(RepresentativeOption::id).containsExactlyInAnyOrder(one, two);
        assertThat(options).filteredOn(o -> o.id().equals(two)).first().satisfies(o -> {
            assertThat(o.name()).isEqualTo("Omar Example");
            assertThat(o.relationship()).isEqualTo("PARENT");
            assertThat(o.since()).isNotNull();
        });
        // A revoked link, or another patient's representative, cannot be named as the one who confirmed.
        assertCode("REPRESENTATIVE_NOT_AUTHORISED", () -> assistance.recordDecision(caseId, versionId,
                new RecordedDecisionRequest("ACKNOWLEDGED", null, "PHONE", "REPRESENTATIVE", Instant.now(), true, revoked)));
        assertCode("REPRESENTATIVE_NOT_AUTHORISED", () -> assistance.recordDecision(caseId, versionId,
                new RecordedDecisionRequest("ACKNOWLEDGED", null, "PHONE", "REPRESENTATIVE", Instant.now(), true, elsewhere)));
        assistance.recordDecision(caseId, versionId, new RecordedDecisionRequest("ACKNOWLEDGED", null, "PHONE", "REPRESENTATIVE", Instant.now(), true, two));
        em.flush();
        assertThat(jdbc.queryForObject("SELECT confirmed_representative_subject FROM proposal_decisions WHERE proposal_version_id=?", String.class, versionId)).isEqualTo("rep-picked-two");

        // The patient's own page never lists the people who may act for them.
        authenticate("patient-assist-o", Role.PATIENT);
        assertThat(journey.workspace(caseId).representatives()).isEmpty();
    }

    @Test void anotherCasesVersionCannotBeRecordedOrRequestedThroughThisCase() throws Exception {
        UUID caseA = ownedCase("+254700000807", "assist-g@local.test");
        UUID caseB = ownedCase("+254700000808", "assist-h@local.test");
        UUID versionB = releasedProposal(caseB);
        linkPatient(caseA, "patient-assist-g");
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertCode("PROPOSAL_NOT_FOUND", () -> assistance.recordDecision(caseA, versionB, new RecordedDecisionRequest("ACKNOWLEDGED", null, "PHONE", "PATIENT", Instant.now(), true)));
        authenticate("patient-assist-g", Role.PATIENT);
        assertCode("PROPOSAL_NOT_FOUND", () -> assistance.requestFromPortal(caseA, versionB));
        em.flush();
        assertThat(count("SELECT count(*) FROM proposal_decisions WHERE proposal_version_id=?", versionB)).isZero();
        assertThat(count("SELECT count(*) FROM proposal_assistance_requests WHERE proposal_version_id=?", versionB)).isZero();
    }

    @Test void aLapsedVersionCanNeitherBeRequestedNorRecordedAndACallCannotPredateTheRelease() throws Exception {
        UUID caseId = ownedCase("+254700000809", "assist-i@local.test");
        UUID versionId = releasedProposal(caseId);
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertCode("CONVERSATION_BEFORE_RELEASE", () -> assistance.recordDecision(caseId, versionId,
                new RecordedDecisionRequest("ACKNOWLEDGED", null, "PHONE", "PATIENT", Instant.now().minusSeconds(30 * 86400), true)));
        jdbc.update("UPDATE proposal_versions SET valid_until=? WHERE id=?", Instant.now().minusSeconds(60), versionId);
        linkPatient(caseId, "patient-assist-i");
        authenticate("patient-assist-i", Role.PATIENT);
        assertCode("PROPOSAL_EXPIRED", () -> assistance.requestFromPortal(caseId, versionId));
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertCode("PROPOSAL_EXPIRED", () -> assistance.recordDecision(caseId, versionId, new RecordedDecisionRequest("ACKNOWLEDGED", null, "PHONE", "PATIENT", Instant.now(), true)));
        em.flush();
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, versionId)).isEqualTo("EXPIRED");
        assertThat(count("SELECT count(*) FROM proposal_decisions WHERE proposal_version_id=?", versionId)).isZero();
    }

    @Test void aRecordedAcknowledgementOpensTheDepositAndProfileStepsAndStampsItsOwnEvidenceVersion() throws Exception {
        UUID caseId = ownedCase("+254700000810", "assist-j@local.test");
        UUID versionId = releasedProposal(caseId);
        jdbc.update("UPDATE deposit_policies SET active=FALSE");
        jdbc.update("INSERT INTO deposit_policies(id,name,care_category,coordination_deposit_egp,active,version,created_by,valid_from,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), "Assisted deposit", null, new BigDecimal("5000.00"), true, 1, "test", java.time.LocalDate.now(java.time.ZoneOffset.UTC).minusDays(1), Instant.now());
        authenticate("coordinator-subject", Role.COORDINATOR);
        assistance.recordDecision(caseId, versionId, new RecordedDecisionRequest("ACKNOWLEDGED", null, "VIDEO", "PATIENT", Instant.now(), true));
        em.flush();
        assertThat(count("SELECT count(*) FROM deposits WHERE case_id=?", caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT copy_code FROM case_tasks WHERE case_id=? AND task_type='DEPOSIT_ARRANGEMENT'", String.class, caseId)).isEqualTo("DEPOSIT_DUE");
        assertThat(jdbc.queryForObject("SELECT waiting_reason_code FROM medical_cases WHERE id=?", String.class, caseId)).isNotNull();
        assertThat(count("SELECT count(*) FROM patient_onboardings WHERE case_id=?", caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT acknowledgement_version FROM proposal_decisions WHERE proposal_version_id=?", String.class, versionId))
                .isEqualTo("proposal-ack-assisted-ar-2026-10-08");
    }

    @Test void aRecordedChangeRequestBecomesProposalRevisionWork() throws Exception {
        UUID caseId = ownedCase("+254700000805", "assist-e@local.test");
        UUID versionId = releasedProposal(caseId);
        authenticate("coordinator-subject", Role.COORDINATOR);
        assistance.recordDecision(caseId, versionId, new RecordedDecisionRequest("REVISION_REQUESTED", "A shorter stay, please", "WHATSAPP_CALL", "PATIENT", Instant.now(), true));
        em.flush();
        assertThat(status(caseId)).isEqualTo("REVISION_REQUESTED");
        // Our team owes the revision: the case waits on that work item, worded from its code.
        assertThat(jdbc.queryForObject("SELECT waiting_reason_code FROM medical_cases WHERE id=?", String.class, caseId)).isEqualTo("WORK:PROPOSAL_CHANGES_REQUESTED");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='PROPOSAL_REVISION' AND status='OPEN'", caseId)).isEqualTo(1);
        // The coordinator who recorded it is not emailed about their own entry; the patient is told.
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE idempotency_key LIKE ?", "work-email:%" + versionId + "%")).isZero();
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE idempotency_key=?", "proposal-decision-recorded:" + versionId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT comment FROM proposal_decisions WHERE proposal_version_id=?", String.class, versionId)).isEqualTo("A shorter stay, please");
    }

    @Test void theSecureLinkCanAskAndThePatientsOwnDecisionClosesTheRequest() throws Exception {
        UUID caseId = ownedCase("+254700000806", "assist-f@local.test");
        UUID versionId = releasedProposal(caseId);
        var link = openViaStatusLink(caseId, "+254700000806");
        ProposalAssistanceView view = assistance.requestFromSecureLink(link.token(), link.grant());
        em.flush();
        assertThat(view.requestedAt()).isNotNull();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='PROPOSAL_TERMS_CALL' AND status='OPEN'", caseId)).isEqualTo(1);
        assertThat(journey.viewProposal(link.token(), link.grant()).assistance().requestedAt()).isEqualTo(view.requestedAt());
        // A forged grant cannot ask.
        assertThatThrownBy(() -> assistance.requestFromSecureLink(link.token(), "forged-grant")).isInstanceOf(ApiException.class);

        journey.decideProposalPublic(link.token(), link.grant(), new PublicProposalDecisionRequest(link.grant(), "DECLINED", null, null));
        em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='PROPOSAL_TERMS_CALL' AND status='OPEN'", caseId)).isZero();
        assertThat(versionId).isNotNull();
    }

    // ---------------- fixtures (synthetic data only) ----------------

    private record Handoff(String token, String grant) {}

    private void assertCode(String code, org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo(code));
    }

    private UUID ownedCase(String whatsapp, String email) throws Exception {
        var created = cases.create(new CreateCaseRequest("Assist", "Patient", "Libya", whatsapp, "Reports", "en", true, null, email, "Africa/Tripoli", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        seedDoctorProfile(); seedCoordinatorProfile();
        authenticate("coordinator-subject", Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(), "pod");
        em.flush(); SecurityContextHolder.clearContext();
        return created.caseId();
    }

    private UUID releasedProposal(UUID caseId) throws Exception {
        authenticate("coordinator-subject", Role.COORDINATOR);
        long version = journey.workspace(caseId).caseSummary().version();
        if ("INTAKE_REVIEW".equals(status(caseId))) journey.transition(caseId, new TransitionRequest("READY_FOR_CONSULTANT", "Ready", version));
        UUID assignment = journey.assign(caseId, new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "pod", "Clinical review")).id();
        authenticate("doctor-subject", Role.CONSULTANT);
        journey.acceptDoctorAssignment(caseId, assignment, new AssignmentDecisionRequest(true, null));
        UUID service = seedCatalogService("PACE-DUAL", "Dual chamber pacemaker implant", "Procedure", new BigDecimal("390000.00"));
        journey.reviewDecision(caseId, new ReviewDecisionRequest("ACCEPT", "Pacemaker implantation", null,
                List.of(new CostEstimateItem("Dual chamber pacemaker implant", new BigDecimal("390000.00"), "EGP", service)), "EGP"));
        em.flush();
        authenticate("coordinator-subject", Role.COORDINATOR);
        UUID review = jdbc.queryForObject("SELECT id FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'", UUID.class, caseId);
        var proposal = journey.createProposal(caseId, new ProposalDraftRequest(review, "ar", "Plan", null, "Included", "Excluded", "Deposit", "Refund", "Consent",
                Instant.now().plusSeconds(86400), List.of(new ProposalItemRequest("MEDICAL", "Line", BigDecimal.ONE, new BigDecimal("1.00"), false, 0)), null));
        jdbc.update("UPDATE proposal_versions SET requires_finance_approval=FALSE WHERE id=?", proposal.versionId());
        journey.releaseProposal(caseId, proposal.versionId());
        em.flush(); SecurityContextHolder.clearContext();
        return proposal.versionId();
    }

    private Handoff openViaStatusLink(UUID caseId, String whatsapp) throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='CASE_STATUS_LINK' AND idempotency_key IN (SELECT 'case-status:'||id FROM case_access_links WHERE case_id=? AND purpose='STATUS') ORDER BY created_at DESC LIMIT 1", String.class, caseId));
        String token = json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("token");
        publicCases.requestAccess(token); em.flush();
        String codeRaw = payload(jdbc.queryForObject("SELECT o.template_data FROM notification_outbox o JOIN case_access_challenges ch ON o.idempotency_key='case-access:'||ch.id JOIN case_access_links l ON l.id=ch.link_id WHERE l.token_hash=? AND o.destination=? ORDER BY o.created_at DESC, o._ROWID_ DESC LIMIT 1", String.class, intakeLifecycle.hash(token), whatsapp));
        String grant = publicCases.verify(token, json.readValue(codeRaw, new TypeReference<Map<String, String>>() {}).get("code")).grant();
        var handoff = publicCases.proposalAccess(token, grant); em.flush();
        return new Handoff(handoff.token(), handoff.grant());
    }


    private void linkPatient(UUID caseId, String subject) {
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", subject, caseId);
    }

    private UUID represent(UUID caseId, String subject, Instant expiresAt, Instant revokedAt) {
        Instant now = Instant.now();
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO patient_representatives(id,patient_id,representative_subject,relationship,permissions,effective_from,expires_at,revoked_at,created_at) "
                        + "SELECT ?,patient_id,?,'PARENT','VIEW,MESSAGE,COORDINATE',?,?,?,? FROM medical_cases WHERE id=?",
                id, subject, now.minusSeconds(3600), expiresAt, revokedAt, now, caseId);
        return id;
    }

    private void seedCoordinatorProfile() {
        if (count("SELECT count(*) FROM workforce_people WHERE subject=?", "coordinator-subject") > 0) return;
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "coordinator-subject", "COORDINATOR", crypto.encrypt("Coordinator One"));
    }

    private void seedDoctorProfile() {
        if (count("SELECT count(*) FROM practitioner_profiles WHERE external_subject=?", "doctor-subject") > 0) return;
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                id, "doctor-subject", "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",
                UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now());
    }

    private UUID seedCatalogService(String code, String name, String category, BigDecimal priceEgp) {
        UUID practitioner = jdbc.queryForObject("SELECT id FROM practitioner_profiles WHERE external_subject=?", UUID.class, "doctor-subject");
        UUID existing = jdbc.query("SELECT id FROM consultant_service_catalog WHERE practitioner_id=? AND service_code=?", rs -> rs.next() ? rs.getObject("id", UUID.class) : null, practitioner, code);
        if (existing != null) return existing;
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                id, practitioner, code, name, category, priceEgp, true, "admin", Instant.now(), Instant.now());
        return id;
    }

    private String payload(String stored) { return stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored; }
    private String status(UUID caseId) { return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId); }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
    private void authenticate(String subject, Role role) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, role); }
}
