package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.api.PublicCaseDtos.*;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Focused verification of the workflow / security corrections in {@link JourneyService}. */
@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class SecureJourneyCorrectionsTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired PublicCaseAccessService publicCases; @Autowired ProposalExpiryService expiry; @Autowired CredentialExpiryService credentialExpiry; @Autowired JdbcTemplate jdbc; @Autowired com.rehletshifaa.casemanagement.application.IntakeLifecycleService intakeLifecycle; @Autowired ObjectMapper json; @Autowired CryptoService crypto; @Autowired EntityManager em;
    /** System time plus an offset a test can advance, so writes that must be ordered never share a clock tick. */
    @TestBean Clock clock;
    static Clock clock(){return new AdvanceableClock();}
    static final class AdvanceableClock extends Clock {
        private volatile Duration offset=Duration.ZERO;
        void advance(Duration by){offset=offset.plus(by);} void reset(){offset=Duration.ZERO;}
        @Override public Instant instant(){return Clock.systemUTC().instant().plus(offset);}
        @Override public ZoneId getZone(){return ZoneOffset.UTC;}
        @Override public Clock withZone(ZoneId zone){throw new UnsupportedOperationException();}
    }
    private void tick(){((AdvanceableClock)clock).advance(Duration.ofSeconds(1));}
    @AfterEach void clear(){SecurityContextHolder.clearContext();((AdvanceableClock)clock).reset();}

    // ---- Core product decision: OTP timing + verification does not change status ----

    @Test void statusAccessIsOnlyCreatedAfterSubmission() {
        var created=cases.create(new CreateCaseRequest("Draft", "Patient","Kenya","+254700000010","Reports","en",true,null,"d@local.test","Africa/Nairobi"));
        em.flush();
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE idempotency_key LIKE 'claim:%' AND destination=?","+254700000010")).isZero();
        var submitted=cases.submit(created.caseId()); em.flush();
        assertThat(submitted.statusToken()).isNotBlank();
        assertThat(count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='STATUS'",created.caseId())).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_access_challenges")).isZero();
    }

    @Test void statusVerificationDoesNotAdvanceCaseStatus() throws Exception {
        var created=cases.create(new CreateCaseRequest("Verify", "Patient","Kenya","+254700000011","Reports","en",true,null,null,null));
        var submitted=cases.submit(created.caseId()); em.flush(); em.clear();
        publicCases.requestAccess(submitted.statusToken());em.flush();
        String code=caseAccessCode(submitted.statusToken(),"+254700000011");
        var grant=publicCases.verify(submitted.statusToken(),code);
        publicCases.view(submitted.statusToken(),grant.grant());
        assertThat(status(created.caseId())).isEqualTo("RECEIVED");
        assertThatThrownBy(()->publicCases.verify(submitted.statusToken(),code)).isInstanceOf(ApiException.class);
    }

    @Test void patientCanRecoverStatusLinkWithoutCaseEnumeration() throws Exception {
        var created=cases.create(new CreateCaseRequest("Recovery", "Patient","Egypt","+20 101 044 7898","Reports","en",true,null,null,null));
        cases.submit(created.caseId());em.flush();
        int originalLinks=count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='STATUS'",created.caseId());
        publicCases.recoverStatusLink(new CaseLinkRecoveryRequest(created.caseNumber(),"+20 000 000 0000","en"));em.flush();
        assertThat(count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='STATUS'",created.caseId())).isEqualTo(originalLinks);
        publicCases.recoverStatusLink(new CaseLinkRecoveryRequest(created.caseNumber().toLowerCase(Locale.ROOT),"00201010447898","en"));em.flush();
        assertThat(count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='STATUS'",created.caseId())).isEqualTo(originalLinks+1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE notification_type='CASE_STATUS_RECOVERY' AND destination=?","+20 101 044 7898")).isEqualTo(1);
    }

    @Test void caseAccessChecksTheOpenCodeLimitsSendsAndExpiresGrantsAndLinks() throws Exception {
        var created=cases.create(new CreateCaseRequest("Access", "Patient","Kenya","+254700000091","Reports","en",true,null,null,null));
        String token=cases.submit(created.caseId()).statusToken();
        var other=cases.create(new CreateCaseRequest("Other", "Patient","Kenya","+254700000092","Reports","en",true,null,null,null));
        String otherToken=cases.submit(other.caseId()).statusToken();
        var draft=cases.create(new CreateCaseRequest("Draft", "Patient","Kenya","+254700000093","Reports","en",true,null,null,null));
        em.flush(); em.clear();
        // Recovery: a draft is never matched; a submitted case is sent at most three recovery links an hour.
        publicCases.recoverStatusLink(new CaseLinkRecoveryRequest(draft.caseNumber(),"+254700000093","en")); em.flush();
        assertThat(count("SELECT count(*) FROM case_access_links WHERE case_id=?",draft.caseId())).isZero();
        for(int i=0;i<4;i++){publicCases.recoverStatusLink(new CaseLinkRecoveryRequest(other.caseNumber(),"+254700000092","en")); em.flush(); tick();}
        assertThat(count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='STATUS'",other.caseId())).isEqualTo(1+3);
        // Codes: a resend revokes the earlier code; a wrong code counts one attempt; the open code still verifies.
        var summary=publicCases.requestAccess(token); em.flush();
        assertThat(summary).isEqualTo(new CaseAccessSummary(created.caseNumber(),"STATUS","WHATSAPP","***0091"));
        String first=caseAccessCode(token,"+254700000091");
        tick(); publicCases.requestAccess(token,"WHATSAPP"); em.flush();
        String second=caseAccessCode(token,"+254700000091");
        assertThat(second).isNotEqualTo(first);
        fails("VERIFICATION_INVALID",()->publicCases.verify(token,first));
        String grant=publicCases.verify(token,second).grant();
        PublicCaseStatus status=publicCases.view(token,grant);
        assertThat(status.caseNumber()).isEqualTo(created.caseNumber());
        assertThat(status.statusEn()).isEqualTo("Case received");
        assertThat(status.phase()).isEqualTo("received");
        assertThat(status.actionRequired()).isFalse();
        // A grant opens only its own link.
        fails("VERIFICATION_REQUIRED",()->publicCases.view(otherToken,grant));
        // At most five codes an hour; new codes do not revoke a grant already issued.
        for(int i=0;i<3;i++){tick(); publicCases.requestAccess(token); em.flush();}
        fails("TOO_MANY_REQUESTS",()->publicCases.requestAccess(token));
        assertThat(publicCases.view(token,grant).caseNumber()).isEqualTo(created.caseNumber());
        // The grant lasts 30 minutes, the status link 30 days.
        ((AdvanceableClock)clock).advance(Duration.ofMinutes(31));
        fails("VERIFICATION_REQUIRED",()->publicCases.view(token,grant));
        assertThat(publicCases.summary(token).caseNumber()).isEqualTo(created.caseNumber());
        ((AdvanceableClock)clock).advance(Duration.ofDays(30));
        fails("CASE_LINK_INVALID",()->publicCases.summary(token));
    }

    private static void fails(String code,org.assertj.core.api.ThrowableAssert.ThrowingCallable call){
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code()).isEqualTo(code));
    }

    @Test void informationResponseIsPurposeScopedCompletesPatientActionAndReturnsToIntake() throws Exception {
        var created=cases.create(new CreateCaseRequest("Action", "Patient","Kenya","+254700000012","Reports","en",true,null,null,null));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject",Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(),"pod");
        long version=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("INFORMATION_REQUIRED","Please add the missing report",version)); em.flush();
        String token=informationActionToken(created.caseId());
        publicCases.requestAccess(token); em.flush();
        String code=caseAccessCode(token,"+254700000012");
        var grant=publicCases.verify(token,code);
        assertThat(publicCases.view(token,grant.grant()).actionRequired()).isTrue();
        publicCases.respond(token,new InformationResponseRequest(grant.grant(),"The requested report has been added","en",null));
        assertThat(status(created.caseId())).isEqualTo("INTAKE_REVIEW");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE case_id=? AND visibility_scope='PATIENT_ACTION'",String.class,created.caseId())).isEqualTo("COMPLETED");
        assertThat(jdbc.queryForObject("SELECT body FROM case_messages WHERE case_id=? ORDER BY created_at DESC LIMIT 1",String.class,created.caseId())).startsWith("enc:");
        assertThatThrownBy(()->publicCases.view(token,grant.grant())).isInstanceOf(ApiException.class);
    }

    // ---- Secure proposal link + OTP ----

    @Test void secureLinkSummaryHidesSensitiveDataAndViewNeedsAGrant() throws Exception {
        var ctx=releaseProposalWithoutPatientAccount();
        PublicProposalSummary summary=journey.publicProposalSummary(ctx.token);
        assertThat(summary.caseNumber()).isEqualTo(ctx.caseNumber);
        assertThat(summary.destinationHint()).contains("***");
        assertThatThrownBy(()->journey.viewProposal(ctx.token,"not-a-real-grant"))
            .isInstanceOf(ApiException.class).hasMessageContaining("verify");
    }

    @Test void wrongOtpIsRejectedAndLockedAfterMaxAttempts() throws Exception {
        var ctx=releaseProposalWithoutPatientAccount();
        journey.requestProposalAccess(ctx.token); em.flush();
        for(int i=0;i<5;i++) assertThatThrownBy(()->journey.verifyProposalAccess(ctx.token,"000000")).isInstanceOf(ApiException.class);
        // Even the correct code no longer works once the challenge is revoked by max attempts.
        String correct=proposalAccessCode(ctx.caseId);
        assertThatThrownBy(()->journey.verifyProposalAccess(ctx.token,correct)).isInstanceOf(ApiException.class);
    }

    @Test void verifiedPatientCanViewDecideAndReceivesOneContinuationMessage() throws Exception {
        var ctx=releaseProposalWithoutPatientAccount();
        journey.requestProposalAccess(ctx.token); em.flush();
        String code=proposalAccessCode(ctx.caseId);
        ProposalAccessGrant grant=journey.verifyProposalAccess(ctx.token,code);
        PublicProposalView full=journey.viewProposal(ctx.token,grant.grant());
        assertThat(full.recommendedTreatment()).isNotBlank();
        var decision=journey.decideProposalPublic(ctx.token,grant.grant(),new PublicProposalDecisionRequest(grant.grant(), "ACCEPTED", "Yes", true));
        assertThat(decision.status()).isEqualTo("ACCEPTED");
        assertThat(status(ctx.caseId)).isEqualTo("ACCEPTED");
        // Exactly one customer-facing message: the secure continuation link.
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE idempotency_key LIKE 'onboarding:%'")).isEqualTo(1);
        assertThatThrownBy(()->journey.viewProposal(ctx.token,grant.grant())).isInstanceOf(ApiException.class);
    }

    @Test void expiredProposalIsPersistedAndItsLinkIsRevoked() throws Exception {
        var ctx=releaseProposalWithoutPatientAccount();
        jdbc.update("UPDATE proposal_versions SET valid_until=? WHERE id=?",Instant.now().minusSeconds(60),ctx.versionId);
        expiry.expireReleasedProposals();
        assertThat(status(ctx.caseId)).isEqualTo("EXPIRED");
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?",String.class,ctx.versionId)).isEqualTo("EXPIRED");
        assertThatThrownBy(()->journey.publicProposalSummary(ctx.token)).isInstanceOf(ApiException.class);
    }

    @Test void expiredCredentialRemovesPractitionerFromAvailability() {
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,0)",practitionerId,"expired-doctor","Expired Doctor","Expired Doctor","VERIFIED","CONSULTANT","AVAILABLE",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().minusSeconds(60),Instant.now().minusSeconds(3600));
        credentialExpiry.expireCredentials();
        assertThat(jdbc.queryForObject("SELECT status FROM practitioner_credentials WHERE practitioner_id=?",String.class,practitionerId)).isEqualTo("EXPIRED");
        assertThat(jdbc.queryForObject("SELECT credentialing_status FROM practitioner_profiles WHERE id=?",String.class,practitionerId)).isEqualTo("EXPIRED");
        assertThat(jdbc.queryForObject("SELECT availability_status FROM practitioner_profiles WHERE id=?",String.class,practitionerId)).isEqualTo("UNAVAILABLE");
    }

    // ---- Messages: server-side thread membership ----

    @Test void doctorCannotPostToOrSeeThePatientThread() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("coordinator-subject",Role.COORDINATOR);
        journey.message(ctx.caseId,new MessageRequest("PATIENT_COORDINATOR","We received your case","en",false));
        journey.message(ctx.caseId,new MessageRequest("COORDINATOR_DOCTOR","Internal note for the doctor","en",true));
        // Doctor may only use the coordinator-doctor thread.
        authenticate("doctor-subject",Role.CONSULTANT);
        assertThatThrownBy(()->journey.message(ctx.caseId,new MessageRequest("PATIENT_COORDINATOR","hi patient","en",false)))
            .isInstanceOf(ApiException.class).hasMessageContaining("conversation");
        var doctorView=journey.workspace(ctx.caseId).messages();
        assertThat(doctorView).extracting(MessageView::threadType).containsOnly("COORDINATOR_DOCTOR");
    }

    @Test void clientInternalFlagIsIgnoredForPatientThread() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("coordinator-subject",Role.COORDINATOR);
        // Even though the client asks for internalOnly=true, a PATIENT_COORDINATOR message is public.
        journey.message(ctx.caseId,new MessageRequest("PATIENT_COORDINATOR","Visible to patient","en",true));
        Boolean internal=jdbc.queryForObject("SELECT internal_only FROM case_messages WHERE case_id=? AND thread_type='PATIENT_COORDINATOR' ORDER BY created_at DESC LIMIT 1",Boolean.class,ctx.caseId);
        assertThat(internal).isFalse();
        String stored=jdbc.queryForObject("SELECT body FROM case_messages WHERE case_id=? AND thread_type='PATIENT_COORDINATOR' ORDER BY created_at DESC LIMIT 1",String.class,ctx.caseId);
        assertThat(stored).startsWith("enc:").doesNotContain("Visible to patient");
        String notification=payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='SECURE_MESSAGE' ORDER BY created_at DESC, _ROWID_ DESC LIMIT 1",String.class));
        assertThat(notification).doesNotContain("Visible to patient");
    }

    @Test void messageReadStateIsPerUser() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("coordinator-subject",Role.COORDINATOR);
        UUID messageId=journey.message(ctx.caseId,new MessageRequest("COORDINATOR_DOCTOR","Internal review note","en",true)).id();
        authenticate("doctor-subject",Role.CONSULTANT);
        assertThat(journey.workspace(ctx.caseId).messages()).filteredOn(m->m.id().equals(messageId)).extracting(MessageView::read).containsExactly(false);
        journey.markMessageRead(ctx.caseId,messageId);
        assertThat(journey.workspace(ctx.caseId).messages()).filteredOn(m->m.id().equals(messageId)).extracting(MessageView::read).containsExactly(true);
    }

    @Test void blockingTaskPreventsClinicalApproval() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("coordinator-subject",Role.COORDINATOR);
        var task=journey.task(ctx.caseId,new TaskRequest("CLINICAL_REVIEW","Complete clinical review","Document the recommendation","doctor-subject","DOCTOR","HIGH",true,Instant.now().plusSeconds(3600)));
        assertThat(jdbc.queryForObject("SELECT title FROM case_tasks WHERE id=?",String.class,task.id())).startsWith("enc:");
        authenticate("doctor-subject",Role.CONSULTANT);
        var review=journey.saveClinicalReview(ctx.caseId,new ClinicalReviewRequest("Reviewed","SUITABLE",null,null,"Treatment",null,"Risks",null,null,null));
        assertThatThrownBy(()->journey.approveClinicalReview(ctx.caseId,review.id())).isInstanceOf(ApiException.class).hasMessageContaining("blocking tasks");
    }

    @Test void assignedDoctorCanStartAndCompleteOwnTaskWithOptimisticVersion() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("coordinator-subject",Role.COORDINATOR);
        var task=journey.task(ctx.caseId,new TaskRequest("CLINICAL_REVIEW","Complete clinical review",null,"doctor-subject","DOCTOR","HIGH",false,Instant.now().plusSeconds(3600)));
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.startTask(ctx.caseId,task.id(),new TaskVersionRequest(0L));
        journey.completeTask(ctx.caseId,task.id(),new CompleteTaskRequest("Clinical review completed",1L));
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?",String.class,task.id())).isEqualTo("COMPLETED");
    }

    // ---- Doctor clinical outcomes replace whole-case cancel ----

    @Test void doctorReassignReturnsToConsultantQueueAndEndsAssignment() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("REASSIGN",null,"Needs a different specialty",null));
        assertThat(status(ctx.caseId)).isEqualTo("READY_FOR_CONSULTANT");
        assertThat(count("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_role='DOCTOR' AND status='ACTIVE'",ctx.caseId)).isZero();
    }

    @Test void declinedDoctorAssignmentReturnsCaseToMatchingQueue() throws Exception {
        var ctx=assignedDoctorCase();
        UUID assignment=jdbc.queryForObject("SELECT id FROM case_assignments WHERE case_id=? AND assignee_role='DOCTOR'",UUID.class,ctx.caseId);
        jdbc.update("UPDATE case_assignments SET status='PENDING',accepted_at=NULL WHERE id=?",assignment);
        jdbc.update("UPDATE medical_cases SET status='CONSULTANT_ASSIGNMENT_PENDING' WHERE id=?",ctx.caseId);
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.decideAssignment(ctx.caseId,assignment, new AssignmentDecisionRequest(false,null), com.rehletshifaa.authority.domain.Role.CONSULTANT);
        assertThat(status(ctx.caseId)).isEqualTo("READY_FOR_CONSULTANT");
        assertThat(jdbc.queryForObject("SELECT status FROM case_assignments WHERE id=?",String.class,assignment)).isEqualTo("DECLINED");
    }

    @Test void endedAssignmentCannotReadCaseWorkspace() throws Exception {
        var ctx=assignedDoctorCase();
        jdbc.update("UPDATE case_assignments SET status='ENDED',ended_at=? WHERE case_id=? AND assignee_role='DOCTOR'",Instant.now(),ctx.caseId);
        authenticate("doctor-subject",Role.CONSULTANT);
        assertThatThrownBy(()->journey.workspace(ctx.caseId)).isInstanceOf(ApiException.class).hasMessageContaining("not related to this record");
    }

    @Test void coordinatorLeadCanRebalanceOwnershipAndOldOwnerLosesAccess() {
        var created=cases.create(new CreateCaseRequest("Rebalance", "Patient","Kenya","+254700000022","Reports","en",true,null,null,null));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject",Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(),"pod");
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "replacement-coordinator", "COORDINATOR", crypto.encrypt("Replacement Coordinator"));
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "lead-subject", "COORDINATOR_LEAD", crypto.encrypt("Team Lead"));
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "coordinator-subject", "COORDINATOR", crypto.encrypt("Original Coordinator"));
        com.rehletshifaa.workforce.WorkforceTestData.leadTeam(jdbc, "CARE_COORDINATION", "lead-subject", "coordinator-subject","replacement-coordinator");
        for(String target:new String[]{"replacement-coordinator","lead-subject"})com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, target);
        authenticate("lead-subject",Role.COORDINATOR);
        journey.reassignCoordinator(created.caseId(),new CoordinatorReassignmentRequest("replacement-coordinator","Workload rebalance"));
        authenticate("coordinator-subject",Role.COORDINATOR);
        assertThatThrownBy(()->journey.workspace(created.caseId())).isInstanceOf(ApiException.class).hasMessageContaining("not related to this record");
        authenticate("replacement-coordinator",Role.COORDINATOR);
        assertThat(journey.workspace(created.caseId()).caseSummary().coordinatorSubject()).isEqualTo("replacement-coordinator");
    }

    @Test void transferMovesOpenCoordinatorWorkOnlyRecordsHistoryAndRefusesDisabledCoordinators() {
        var created=cases.create(new CreateCaseRequest("Transfer", "Patient","Kenya","+254700000023","Transfer","en",true,null,null,null));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject",Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(),"pod");
        for(String[] person:new String[][]{{"replacement-coordinator","COORDINATOR","Replacement Coordinator"},{"lead-subject","COORDINATOR_LEAD","Team Lead"},{"coordinator-subject","COORDINATOR","Original Coordinator"},{"disabled-coordinator","COORDINATOR","Disabled Coordinator"}})
            com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, person[0], person[1], crypto.encrypt(person[2]));
        com.rehletshifaa.workforce.WorkforceTestData.leadTeam(jdbc, "CARE_COORDINATION", "lead-subject", "coordinator-subject","replacement-coordinator","disabled-coordinator");
        for(String target:new String[]{"replacement-coordinator","lead-subject"})com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, target);
        jdbc.update("UPDATE workforce_people SET lifecycle_status='SIGNIN_DISABLED' WHERE subject='disabled-coordinator'");
        UUID coordinatorWork=workItem(created.caseId(),"coordinator-subject","COORDINATOR","OPEN"),operationsWork=workItem(created.caseId(),"operations-subject","OPERATIONS","OPEN"),doneWork=workItem(created.caseId(),"coordinator-subject","COORDINATOR","COMPLETED");
        authenticate("lead-subject",Role.COORDINATOR);
        assertThat(journey.staffDirectory("COORDINATOR")).extracting(StaffDirectoryView::subject).contains("replacement-coordinator").doesNotContain("disabled-coordinator");
        assertThatThrownBy(()->journey.reassignCoordinator(created.caseId(),new CoordinatorReassignmentRequest("disabled-coordinator","Coverage"))).isInstanceOf(ApiException.class);
        journey.reassignCoordinator(created.caseId(),new CoordinatorReassignmentRequest("replacement-coordinator","Leave coverage"));
        assertThat(owner(coordinatorWork)).isEqualTo("replacement-coordinator");
        assertThat(owner(operationsWork)).isEqualTo("operations-subject");
        assertThat(owner(doneWork)).isEqualTo("coordinator-subject");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=? AND owner_role='COORDINATOR' AND visibility_scope='INTERNAL' AND status IN ('OPEN','IN_PROGRESS') AND (owner_subject IS NULL OR owner_subject<>'replacement-coordinator')",Long.class,created.caseId())).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM staff_notifications WHERE recipient_subject='replacement-coordinator' AND event_type='CASE_OWNERSHIP_TRANSFERRED'",Long.class)).isEqualTo(1);
        // Claim and transfer can share a clock tick; pin that case so the history order never depends on row ids.
        jdbc.update("UPDATE case_assignments SET assigned_at=(SELECT max(assigned_at) FROM case_assignments WHERE case_id=?) WHERE case_id=? AND assignee_role='COORDINATOR'",created.caseId(),created.caseId());
        var history=journey.assignmentHistory(created.caseId());
        assertThat(history.getFirst().role()).isEqualTo("COORDINATOR");assertThat(history.getFirst().assigneeName()).isEqualTo("Replacement Coordinator");assertThat(history.getFirst().status()).isEqualTo("ACTIVE");
        assertThat(history.getFirst().assignedByKind()).isEqualTo("PERSON");assertThat(history.getFirst().assignedByName()).isEqualTo("Team Lead");assertThat(history.getFirst().reason()).isEqualTo("Leave coverage");
        assertThat(history).anySatisfy(entry->{assertThat(entry.assigneeName()).isEqualTo("Original Coordinator");assertThat(entry.status()).isEqualTo("ENDED");assertThat(entry.endedAt()).isNotNull();});
        authenticate("doctor-subject",Role.CONSULTANT);
        assertThatThrownBy(()->journey.assignmentHistory(created.caseId())).isInstanceOf(ApiException.class);
    }
    /** OPS-1: a completed transfer notifies the new owner once (in-app + queued work email); nothing else notifies anyone. */
    @Test void transferNotifiesOnlyTheNewOwnerOnceAndOnlyWhenItCommits() {
        var created=cases.create(new CreateCaseRequest("Ops", "Transferee","Kenya","+254700000031","Private clinical history","en",true,null,null,null));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject",Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(),"pod");
        for(String[] person:new String[][]{{"new-owner","COORDINATOR","New Owner"},{"lead-subject","COORDINATOR_LEAD","Team Lead"},{"coordinator-subject","COORDINATOR","Original Coordinator"},{"disabled-coordinator","COORDINATOR","Disabled Coordinator"}})
            com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, person[0], person[1], crypto.encrypt(person[2]));
        com.rehletshifaa.workforce.WorkforceTestData.leadTeam(jdbc, "CARE_COORDINATION", "lead-subject", "coordinator-subject","new-owner","disabled-coordinator");
        for(String target:new String[]{"new-owner","lead-subject"})com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, target);
        jdbc.update("UPDATE workforce_people SET lifecycle_status='SIGNIN_DISABLED' WHERE subject='disabled-coordinator'");
        String caseNumber=jdbc.queryForObject("SELECT case_number FROM medical_cases WHERE id=?",String.class,created.caseId());
        // Unauthorized and refused transfers notify nobody.
        authenticate("coordinator-subject",Role.COORDINATOR);
        assertThatThrownBy(()->journey.reassignCoordinator(created.caseId(),new CoordinatorReassignmentRequest("new-owner","Not my call"))).isInstanceOf(ApiException.class);
        authenticate("lead-subject",Role.COORDINATOR);
        assertThatThrownBy(()->journey.reassignCoordinator(created.caseId(),new CoordinatorReassignmentRequest("disabled-coordinator","Coverage"))).isInstanceOf(ApiException.class);
        assertThat(transferNotifications()).isZero();assertThat(transferEmails()).isZero();
        // A transfer that rolls back leaves no notification and no queued email behind.
        jdbc.execute("SAVEPOINT ops1");
        journey.reassignCoordinator(created.caseId(),new CoordinatorReassignmentRequest("new-owner","Rolled back"));
        assertThat(transferNotifications()).isEqualTo(1);
        jdbc.execute("ROLLBACK TO SAVEPOINT ops1");
        assertThat(transferNotifications()).isZero();assertThat(transferEmails()).isZero();
        assertThat(caseOwner(created.caseId())).isEqualTo("coordinator-subject");
        // The committed transfer: owner changes, the new owner gets exactly one notification and one queued work email.
        journey.reassignCoordinator(created.caseId(),new CoordinatorReassignmentRequest("new-owner","Leave coverage for the patient's cardiology follow-up"));
        assertThat(caseOwner(created.caseId())).isEqualTo("new-owner");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM staff_notifications WHERE event_type='CASE_OWNERSHIP_TRANSFERRED' AND recipient_subject='new-owner' AND case_id=?",Long.class,created.caseId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM staff_notifications WHERE event_type='CASE_OWNERSHIP_TRANSFERRED' AND recipient_subject<>'new-owner'",Long.class)).isZero();
        assertThat(transferEmails()).isEqualTo(1);
        var stored=jdbc.queryForMap("SELECT title,context FROM staff_notifications WHERE event_type='CASE_OWNERSHIP_TRANSFERRED'");
        String title=crypto.decrypt(((String)stored.get("title")).substring(4)),context=crypto.decrypt(((String)stored.get("context")).substring(4));
        assertThat(title).isEqualTo("A case has been transferred to you");
        assertThat(context).contains(caseNumber).contains("Original Coordinator").contains("Team Lead")
            .doesNotContain("Ops").doesNotContain("Transferee").doesNotContain("+254700000031").doesNotContain("Private clinical history").doesNotContain("cardiology");
        String email=jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key LIKE 'work-email:ownership-transfer:%'",String.class);
        String clear=email.startsWith("enc:")?crypto.decrypt(email.substring(4)):email;
        assertThat(clear).contains(caseNumber).doesNotContain("Transferee").doesNotContain("+254700000031").doesNotContain("cardiology");
        // Repeating the same transfer (a retried request) and a lead taking the case themselves notify nobody new.
        // History orders by assigned_at, so each transfer gets its own clock tick.
        tick();journey.reassignCoordinator(created.caseId(),new CoordinatorReassignmentRequest("new-owner","Retried request"));
        tick();journey.reassignCoordinator(created.caseId(),new CoordinatorReassignmentRequest("lead-subject","Taking it over myself"));
        assertThat(transferNotifications()).isEqualTo(1);assertThat(transferEmails()).isEqualTo(1);
        // Every transfer keeps its reason. These three can share one clock tick, and history orders equal instants by id, so order is not asserted.
        assertThat(journey.assignmentHistory(created.caseId())).extracting(AssignmentHistoryEntry::reason).contains("Taking it over myself","Retried request","Leave coverage for the patient's cardiology follow-up");
    }
    private long transferNotifications(){return jdbc.queryForObject("SELECT count(*) FROM staff_notifications WHERE event_type='CASE_OWNERSHIP_TRANSFERRED'",Long.class);}
    private long transferEmails(){return jdbc.queryForObject("SELECT count(*) FROM notification_outbox WHERE idempotency_key LIKE 'work-email:ownership-transfer:%'",Long.class);}
    private String caseOwner(UUID caseId){return jdbc.queryForObject("SELECT assignee_subject FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND assignment_type='PRIMARY' AND status='ACTIVE'",String.class,caseId);}
    private UUID workItem(UUID caseId,String owner,String role,String status){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO case_tasks(id,case_id,task_type,title,owner_subject,owner_role,visibility_scope,priority,status,blocking,created_by,created_at,updated_at,version) VALUES(?,?,'OTHER','Fixture work',?,?,'INTERNAL','NORMAL',?,FALSE,'TEST',?,?,0)",id,caseId,owner,role,status,java.sql.Timestamp.from(Instant.now()),java.sql.Timestamp.from(Instant.now()));return id;}
    private String owner(UUID task){return jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE id=?",String.class,task);}

    @Test void doctorNotSuitableIsADistinctClinicalOutcome() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("NOT_SUITABLE",null,"Not a candidate",null));
        assertThat(status(ctx.caseId)).isEqualTo("CLINICALLY_NOT_SUITABLE");
    }

    @Test void doctorAcceptPersistsCostEstimatesAndExposesThemOnTheApprovedReview() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","Angioplasty with stent","Standard cardiac risks",
            List.of(new CostEstimateItem("Coronary angioplasty",new BigDecimal("8500.00"),"USD"),
                    new CostEstimateItem("Hospital stay (3 nights)",new BigDecimal("2100.00"),"USD"))));
        assertThat(status(ctx.caseId)).isEqualTo("CLINICAL_RECOMMENDATION_READY");
        assertThat(count("SELECT count(*) FROM clinical_review_cost_estimates")).isEqualTo(2);
        var approved=journey.workspace(ctx.caseId).clinicalReviews().stream().filter(r->"APPROVED".equals(r.status())).findFirst().orElseThrow();
        assertThat(approved.costEstimates()).hasSize(2);
        assertThat(approved.costEstimates().get(0).serviceDescription()).isEqualTo("Coronary angioplasty");
        assertThat(approved.costEstimates().get(0).estimatedCost()).isEqualByComparingTo("8500.00");
        assertThat(approved.costEstimates().get(0).currency()).isEqualTo("USD");
    }

    // ---- Consultant clinical review: catalogue authority, currency, and the automatic coordinator handoff ----

    @Test void submitRecommendationCompletesConsultantWorkAndHandsTheCaseBackAutomatically() throws Exception {
        var ctx=assignedDoctorCase();
        UUID service=seedCatalogService("PACE-DUAL","Dual-chamber pacemaker implant","Procedure",new BigDecimal("390000.00"));
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","Pacemaker implantation","Standard cardiac risks",
            List.of(new CostEstimateItem("Dual-chamber pacemaker implant",new BigDecimal("390000.00"),"EGP",service))));
        em.flush();

        assertThat(status(ctx.caseId)).isEqualTo("CLINICAL_RECOMMENDATION_READY");
        // The consultant's own work is done and they never had to press a second "return" button.
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE case_id=? AND task_type='CLINICAL_REVIEW'",String.class,ctx.caseId)).isEqualTo("COMPLETED");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='PREPARE_PROPOSAL' AND owner_subject=? AND status='OPEN'",ctx.caseId,"coordinator-subject")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='CONSULTANT_OUTCOME_RECORDED' AND read_at IS NULL","coordinator-subject")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?",String.class,ctx.caseId)).isEqualTo("STAFF");
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='CONSULTANT_REVIEW_DECISION'",ctx.caseId)).isEqualTo(1);
    }

    @Test void aRetriedSubmissionIsRejectedAndDuplicatesNothing() throws Exception {
        var ctx=assignedDoctorCase();
        UUID service=seedCatalogService("PACE-DUAL","Dual-chamber pacemaker implant","Procedure",new BigDecimal("390000.00"));
        authenticate("doctor-subject",Role.CONSULTANT);
        var request=new ReviewDecisionRequest("ACCEPT","Pacemaker implantation",null,
            List.of(new CostEstimateItem("Dual-chamber pacemaker implant",new BigDecimal("390000.00"),"EGP",service)));
        journey.reviewDecision(ctx.caseId,request); em.flush();
        assertThatThrownBy(()->journey.reviewDecision(ctx.caseId,request)).isInstanceOf(ApiException.class);
        em.flush();
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='PREPARE_PROPOSAL'",ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='CONSULTANT_OUTCOME_RECORDED'","coordinator-subject")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM clinical_review_cost_estimates")).isEqualTo(1);
    }

    @Test void aCatalogueServiceIsStoredAtItsApprovedPriceWhateverTheClientSends() throws Exception {
        var ctx=assignedDoctorCase();
        UUID service=seedCatalogService("PACE-DUAL","Dual-chamber pacemaker implant","Procedure",new BigDecimal("390000.00"));
        authenticate("doctor-subject",Role.CONSULTANT);
        // A display currency (or a tampered amount) must never redefine the consultant's approved price.
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","Pacemaker implantation",null,
            List.of(new CostEstimateItem("Dual-chamber pacemaker implant",new BigDecimal("8240.00"),"USD",service))));
        em.flush();
        var row=jdbc.queryForMap("SELECT estimated_cost,currency,price_egp,requires_finance_approval FROM clinical_review_cost_estimates");
        assertThat((BigDecimal)row.get("estimated_cost")).isEqualByComparingTo("390000.00");
        assertThat(row.get("currency")).isEqualTo("EGP");
        assertThat((BigDecimal)row.get("price_egp")).isEqualByComparingTo("390000.00");
        assertThat(row.get("requires_finance_approval")).isEqualTo(false);
    }

    @Test void aServiceOutsideTheApprovedListStillRequiresFinanceApproval() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","Pacemaker implantation",null,
            List.of(new CostEstimateItem("Bespoke lead extraction",new BigDecimal("50000.00"),"EGP"))));
        em.flush();
        assertThat(jdbc.queryForObject("SELECT requires_finance_approval FROM clinical_review_cost_estimates",Boolean.class)).isTrue();
    }

    @Test void aCatalogueServiceBelongingToAnotherConsultantIsRejected() throws Exception {
        var ctx=assignedDoctorCase();
        UUID foreign=UUID.randomUUID();
        UUID other=jdbc.queryForObject("SELECT id FROM practitioner_profiles WHERE external_subject=?",UUID.class,"doctor-subject");
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
            foreign,"other-doctor","Other Doctor","Other Doctor","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        UUID service=UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
            service,foreign,"FOREIGN-1","Somebody else's service","Procedure",new BigDecimal("1000.00"),true,"admin",Instant.now(),Instant.now());
        assertThat(other).isNotEqualTo(foreign);
        authenticate("doctor-subject",Role.CONSULTANT);
        assertThatThrownBy(()->journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","Pacemaker implantation",null,
            List.of(new CostEstimateItem("Somebody else's service",new BigDecimal("1000.00"),"EGP",service)))))
            .isInstanceOf(ApiException.class).hasMessageContaining("active price list");
    }

    @Test void submittingWithoutAClinicalRecommendationIsRejected() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject",Role.CONSULTANT);
        assertThatThrownBy(()->journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","  ",null,
            List.of(new CostEstimateItem("Something",new BigDecimal("100.00"),"EGP")))))
            .isInstanceOf(ApiException.class).hasMessageContaining("clinical recommendation");
        assertThat(status(ctx.caseId)).isEqualTo("CONSULTANT_REVIEW");
    }

    @Test void anExceptionalOutcomeWithoutAReasonIsRejected() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject",Role.CONSULTANT);
        assertThatThrownBy(()->journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("RETURN_TO_COORDINATOR",null,null,null)))
            .isInstanceOf(ApiException.class).hasMessageContaining("reason");
        assertThat(status(ctx.caseId)).isEqualTo("CONSULTANT_REVIEW");
    }

    @Test void aConsultantWhoDoesNotHoldTheCaseCannotSubmitARecommendation() throws Exception {
        var ctx=assignedDoctorCase();
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
            id,"outsider-doctor","Outsider","Outsider","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        authenticate("outsider-doctor",Role.CONSULTANT);
        assertThatThrownBy(()->journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","Pacemaker implantation",null,
            List.of(new CostEstimateItem("Something",new BigDecimal("100.00"),"EGP")))))
            .isInstanceOf(ApiException.class);
        assertThat(status(ctx.caseId)).isEqualTo("CONSULTANT_REVIEW");
    }

    @Test void requestingMoreInformationCreatesAPatientActionAndTellsTheCoordinator() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("INFO",null,"Recent echocardiogram is missing",null));
        em.flush();
        assertThat(status(ctx.caseId)).isEqualTo("INFORMATION_REQUIRED");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND visibility_scope='PATIENT_ACTION' AND status='OPEN'",ctx.caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?",String.class,ctx.caseId)).isEqualTo("PATIENT");
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='CONSULTANT_REQUESTED_INFORMATION'","coordinator-subject")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE case_id=? AND task_type='CLINICAL_REVIEW'",String.class,ctx.caseId)).isEqualTo("COMPLETED");
    }

    @Test void aSecondOpinionRequestGivesTheCoordinatorActionableWork() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("REASSIGN",null,"Electrophysiology opinion needed",null));
        em.flush();
        assertThat(status(ctx.caseId)).isEqualTo("READY_FOR_CONSULTANT");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='REASSIGN_CONSULTANT' AND owner_subject=? AND status='OPEN'",ctx.caseId,"coordinator-subject")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?",String.class,ctx.caseId)).isEqualTo("STAFF");
    }

    @Test void returningWithoutARecommendationHandsResponsibilityBackWithoutCancellingTheCase() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("RETURN_TO_COORDINATOR",null,"Imaging predates the referral",null));
        em.flush();
        assertThat(status(ctx.caseId)).isEqualTo("INTAKE_REVIEW");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='CLINICAL_OUTCOME_REVIEW' AND owner_subject=? AND status='OPEN'",ctx.caseId,"coordinator-subject")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?",String.class,ctx.caseId)).isEqualTo("STAFF");
        // The reason survives on the case history, and the case itself is not cancelled.
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='CONSULTANT_REVIEW_DECISION' AND reason=?",ctx.caseId,"Imaging predates the referral")).isEqualTo(1);
    }

    @Test void aClinicallyUnsuitableCaseNotifiesTheCoordinatorAndCannotBecomeAProposal() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("NOT_SUITABLE",null,"Comorbidities preclude surgery",null));
        em.flush();
        assertThat(status(ctx.caseId)).isEqualTo("CLINICALLY_NOT_SUITABLE");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='CLINICAL_OUTCOME_REVIEW' AND owner_subject=? AND status='OPEN'",ctx.caseId,"coordinator-subject")).isEqualTo(1);
        // No approved recommendation exists, so the normal proposal path cannot continue behind it.
        assertThat(count("SELECT count(*) FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'",ctx.caseId)).isZero();
    }

    @Test void savingADraftKeepsTheCaseAndTheConsultantsWorkOpen() throws Exception {
        var ctx=assignedDoctorCase();
        UUID service=seedCatalogService("PACE-DUAL","Dual-chamber pacemaker implant","Procedure",new BigDecimal("390000.00"));
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.saveClinicalReview(ctx.caseId,new ClinicalReviewRequest(null,"SUITABLE",null,null,"Pacemaker implantation",null,"Frailty",null,null,null,
            List.of(new CostEstimateItem("Dual-chamber pacemaker implant",new BigDecimal("390000.00"),"EGP",service)),null));
        em.flush();

        assertThat(status(ctx.caseId)).isEqualTo("CONSULTANT_REVIEW");
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?",String.class,ctx.caseId)).isEqualTo("CONSULTANT");
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE case_id=? AND task_type='CLINICAL_REVIEW'",String.class,ctx.caseId)).isEqualTo("OPEN");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND owner_role='COORDINATOR' AND status='OPEN'",ctx.caseId)).isZero();
        // The draft is resumable: recommendation, considerations and the picked service all come back.
        var draft=journey.workspace(ctx.caseId).clinicalReviews().stream().filter(r->"DRAFT".equals(r.status())).findFirst().orElseThrow();
        assertThat(draft.recommendedTreatment()).isEqualTo("Pacemaker implantation");
        assertThat(draft.risksAndLimitations()).isEqualTo("Frailty");
        assertThat(draft.costEstimates()).hasSize(1);
        assertThat(draft.costEstimates().get(0).catalogServiceId()).isEqualTo(service);
        assertThat(draft.costEstimates().get(0).estimatedCost()).isEqualByComparingTo("390000.00");
    }

    // ---- The consultant's chosen proposal currency must survive all the way to the patient ----

    @Test void theCurrencyTheConsultantSubmittedInIsTheCurrencyTheProposalIsIssuedIn() throws Exception {
        var ctx=assignedDoctorCase();
        UUID service=seedCatalogService("PACE-DUAL","Dual-chamber pacemaker implant","Procedure",new BigDecimal("390000.00"));
        seedFxRate("USD",new BigDecimal("0.0200"));
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","Pacemaker implantation",null,
            List.of(new CostEstimateItem("Dual-chamber pacemaker implant",new BigDecimal("390000.00"),"EGP",service)),"USD"));
        em.flush();

        assertThat(jdbc.queryForObject("SELECT proposal_currency FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'",String.class,ctx.caseId)).isEqualTo("USD");

        // The coordinator states no currency: silence must inherit the clinical choice, never reset to EGP.
        authenticate("coordinator-subject",Role.COORDINATOR);
        var proposal=journey.createProposal(ctx.caseId,draftRequest(approvedReview(ctx.caseId),null));
        assertThat(proposal.currency()).isEqualTo("USD");
        assertThat(proposal.items()).allSatisfy(item->assertThat(item.unitPrice()).isLessThan(new BigDecimal("100000")));
        // 390000 EGP * 1.12 margin * 0.02 = 8736.00 — line and total agree in the same currency.
        assertThat(proposal.items()).singleElement().satisfies(i->assertThat(i.unitPrice()).isEqualByComparingTo("8736.00"));
    }

    @Test void anotherSupportedCurrencyPropagatesJustTheSame() throws Exception {
        var ctx=assignedDoctorCase();
        UUID service=seedCatalogService("ECHO","Echocardiogram","Diagnostic",new BigDecimal("8500.00"));
        seedFxRate("AED",new BigDecimal("0.0760"));
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","Echocardiography",null,
            List.of(new CostEstimateItem("Echocardiogram",new BigDecimal("8500.00"),"EGP",service)),"AED"));
        em.flush();
        authenticate("coordinator-subject",Role.COORDINATOR);
        assertThat(journey.createProposal(ctx.caseId,draftRequest(approvedReview(ctx.caseId),null)).currency()).isEqualTo("AED");
    }

    @Test void theCatalogueKeepsItsEgpBasePriceWhateverCurrencyTheProposalUses() throws Exception {
        var ctx=assignedDoctorCase();
        UUID service=seedCatalogService("PACE-DUAL","Dual-chamber pacemaker implant","Procedure",new BigDecimal("390000.00"));
        seedFxRate("USD",new BigDecimal("0.0200"));
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","Pacemaker implantation",null,
            List.of(new CostEstimateItem("Dual-chamber pacemaker implant",new BigDecimal("390000.00"),"EGP",service)),"USD"));
        em.flush();
        assertThat(jdbc.queryForObject("SELECT price_egp FROM consultant_service_catalog WHERE id=?",BigDecimal.class,service)).isEqualByComparingTo("390000.00");
        var row=jdbc.queryForMap("SELECT price_egp,currency FROM clinical_review_cost_estimates");
        assertThat((BigDecimal)row.get("price_egp")).isEqualByComparingTo("390000.00");
        assertThat(row.get("currency")).isEqualTo("EGP");
    }

    @Test void aDraftRemembersTheChosenProposalCurrency() throws Exception {
        var ctx=assignedDoctorCase();
        seedFxRate("AED",new BigDecimal("0.0760"));
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.saveClinicalReview(ctx.caseId,new ClinicalReviewRequest(null,"SUITABLE",null,null,"Echocardiography",null,null,null,null,null,List.of(),"AED"));
        em.flush();
        var draft=journey.workspace(ctx.caseId).clinicalReviews().stream().filter(r->"DRAFT".equals(r.status())).findFirst().orElseThrow();
        assertThat(draft.proposalCurrency()).isEqualTo("AED");
    }

    @Test void anUnsupportedCurrencyIsRejectedInsteadOfQuietlyBecomingEgp() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject",Role.CONSULTANT);
        assertThatThrownBy(()->journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","Pacemaker implantation",null,
            List.of(new CostEstimateItem("Something",new BigDecimal("100.00"),"EGP")),"XYZ")))
            .isInstanceOf(ApiException.class);
        assertThat(status(ctx.caseId)).isEqualTo("CONSULTANT_REVIEW");
    }

    @Test void aCurrencyWithNoAvailableRateFailsLoudlyRatherThanFallingBackToEgp() throws Exception {
        var ctx=assignedDoctorCase();
        jdbc.update("DELETE FROM fx_rates WHERE quote_currency='GBP'");
        authenticate("doctor-subject",Role.CONSULTANT);
        // GBP is a supported currency but has no rate seeded: the consultant must be told, not silently overridden.
        assertThatThrownBy(()->journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","Pacemaker implantation",null,
            List.of(new CostEstimateItem("Something",new BigDecimal("100.00"),"EGP")),"GBP")))
            .isInstanceOf(ApiException.class);
        assertThat(count("SELECT count(*) FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'",ctx.caseId)).isZero();
    }

    @Test void anIssuedProposalDoesNotRepriceItselfWhenTheRateLaterMoves() throws Exception {
        var ctx=assignedDoctorCase();
        UUID service=seedCatalogService("PACE-DUAL","Dual-chamber pacemaker implant","Procedure",new BigDecimal("390000.00"));
        seedFxRate("USD",new BigDecimal("0.0200"));
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","Pacemaker implantation",null,
            List.of(new CostEstimateItem("Dual-chamber pacemaker implant",new BigDecimal("390000.00"),"EGP",service)),"USD"));
        em.flush();
        authenticate("coordinator-subject",Role.COORDINATOR);
        var proposal=journey.createProposal(ctx.caseId,draftRequest(approvedReview(ctx.caseId),null));
        UUID proposalVersion=proposal.versionId();
        proposal=journey.releaseProposal(ctx.caseId,proposalVersion); em.flush();
        BigDecimal frozen=proposal.items().get(0).unitPrice();

        jdbc.update("UPDATE fx_rates SET rate=? WHERE quote_currency='USD'",new BigDecimal("0.0500"));
        // The released line is frozen against the snapshotted rate, so the patient price cannot drift.
        assertThat(jdbc.queryForObject("SELECT unit_price FROM proposal_items WHERE proposal_version_id=?",BigDecimal.class,proposalVersion)).isEqualByComparingTo(frozen);
    }

    @Test void aCoordinatorCanStillChooseADifferentCurrencyExplicitly() throws Exception {
        var ctx=assignedDoctorCase();
        UUID service=seedCatalogService("PACE-DUAL","Dual-chamber pacemaker implant","Procedure",new BigDecimal("390000.00"));
        seedFxRate("USD",new BigDecimal("0.0200"));seedFxRate("AED",new BigDecimal("0.0760"));
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","Pacemaker implantation",null,
            List.of(new CostEstimateItem("Dual-chamber pacemaker implant",new BigDecimal("390000.00"),"EGP",service)),"USD"));
        em.flush();
        authenticate("coordinator-subject",Role.COORDINATOR);
        assertThat(journey.createProposal(ctx.caseId,draftRequest(approvedReview(ctx.caseId),"AED")).currency()).isEqualTo("AED");
    }

    // ---- The patient's answer to a proposal must reach the coordinator ----

    @Test void aPatientAskingForChangesGivesTheCoordinatorRealWork() throws Exception {
        var ctx=releasedProposal();
        journey.decideProposalPublic(ctx.token,ctx.grant,new PublicProposalDecisionRequest(ctx.grant,"REVISION_REQUESTED","The estimated cost is higher than I expected"));
        em.flush();

        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?",String.class,ctx.versionId)).isEqualTo("REVISION_REQUESTED");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='PROPOSAL_REVISION' AND owner_subject=? AND status='OPEN'",ctx.caseId,"coordinator-subject")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='PATIENT_PROPOSAL_DECISION' AND read_at IS NULL","coordinator-subject")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?",String.class,ctx.caseId)).isEqualTo("STAFF");
        // What the patient wrote is kept with the decision, not just in a notification.
        assertThat(jdbc.queryForObject("SELECT comment FROM proposal_decisions WHERE proposal_version_id=?",String.class,ctx.versionId))
            .contains("higher than I expected");
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='PROPOSAL_DECIDED'",ctx.caseId)).isEqualTo(1);
    }

    @Test void aDeclinedProposalIsHandedBackToTheCoordinatorWithoutTouchingTheRestOfTheCase() throws Exception {
        var ctx=releasedProposal();
        journey.decideProposalPublic(ctx.token,ctx.grant,new PublicProposalDecisionRequest(ctx.grant,"DECLINED","Treating locally instead"));
        em.flush();

        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?",String.class,ctx.versionId)).isEqualTo("DECLINED");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='PROPOSAL_DECLINED_REVIEW' AND owner_subject=? AND status='OPEN'",ctx.caseId,"coordinator-subject")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='PATIENT_PROPOSAL_DECISION'","coordinator-subject")).isEqualTo(1);
        // Declining answers the proposal; it must not delete or cancel the case behind it.
        assertThat(count("SELECT count(*) FROM medical_cases WHERE id=?",ctx.caseId)).isEqualTo(1);
        assertThat(status(ctx.caseId)).isNotEqualTo("CANCELLED");
    }

    @Test void aRepeatedDecisionOnTheSameProposalIsRejectedAndDuplicatesNothing() throws Exception {
        var ctx=releasedProposal();
        journey.decideProposalPublic(ctx.token,ctx.grant,new PublicProposalDecisionRequest(ctx.grant,"DECLINED","Treating locally instead"));
        em.flush();
        // The grant is consumed with the decision, so a replay cannot even re-authorize.
        assertThatThrownBy(()->journey.decideProposalPublic(ctx.token,ctx.grant,new PublicProposalDecisionRequest(ctx.grant,"DECLINED","again")))
            .isInstanceOf(ApiException.class);
        em.flush();
        assertThat(count("SELECT count(*) FROM proposal_decisions WHERE proposal_version_id=?",ctx.versionId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='PROPOSAL_DECLINED_REVIEW'",ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='PATIENT_PROPOSAL_DECISION'","coordinator-subject")).isEqualTo(1);
    }

    @Test void anExpiredProposalCannotBeDecided() throws Exception {
        var ctx=releasedProposal();
        jdbc.update("UPDATE proposal_versions SET valid_until=? WHERE id=?",Instant.now().minusSeconds(60),ctx.versionId);
        assertThatThrownBy(()->journey.decideProposalPublic(ctx.token,ctx.grant,new PublicProposalDecisionRequest(ctx.grant,"ACKNOWLEDGED",null,true)))
            .isInstanceOf(ApiException.class);
        em.flush();
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?",String.class,ctx.versionId)).isEqualTo("EXPIRED");
        assertThat(count("SELECT count(*) FROM proposal_decisions WHERE proposal_version_id=?",ctx.versionId)).isZero();
    }

    @Test void theProposalTheProposalPageShowsIsIssuedInTheConsultantsCurrency() throws Exception {
        var ctx=releasedProposal();
        var view=journey.viewProposal(ctx.token,ctx.grant);
        assertThat(view.currency()).isEqualTo("USD");
        assertThat(view.items()).isNotEmpty();
        assertThat(view.totalExpected()).isNotNull();
        // No internal identifiers reach the patient payload.
        assertThat(view.items()).allSatisfy(item->assertThat(item.description()).doesNotContain("-"));
    }

    @Test void thePatientViewNamesTheDayOfTheFrozenRateAndReadingItChangesNoStoredTerms() throws Exception {
        var ctx=releasedProposal();
        var before=jdbc.queryForMap("SELECT payment_terms,refund_terms,disclaimers,excluded_services,fx_rate,fx_rate_date FROM proposal_versions WHERE id=?",ctx.versionId);
        var view=journey.viewProposal(ctx.token,ctx.grant);
        em.flush();
        // F4: the patient is told which day's stored rate is fixed on this document.
        assertThat(before.get("fx_rate_date")).isNotNull();
        assertThat(view.fxRateDate()).isEqualTo(jdbc.queryForObject("SELECT fx_rate_date FROM proposal_versions WHERE id=?",java.time.LocalDate.class,ctx.versionId));
        // Rendering never rewrites the historical record of what the version said.
        assertThat(jdbc.queryForMap("SELECT payment_terms,refund_terms,disclaimers,excluded_services,fx_rate,fx_rate_date FROM proposal_versions WHERE id=?",ctx.versionId)).isEqualTo(before);
    }

    // ---- The acknowledgement is a server-side precondition, not a checkbox ----

    @Test void continuingWithoutTheAcknowledgementIsRefusedEvenWhenTheApiIsCalledDirectly() throws Exception {
        var ctx=releasedProposal();
        // Exactly what a caller bypassing the page would send: a valid grant and a valid decision, no acknowledgement.
        assertThatThrownBy(()->journey.decideProposalPublic(ctx.token,ctx.grant,new PublicProposalDecisionRequest(ctx.grant,"ACKNOWLEDGED",null)))
            .isInstanceOf(ApiException.class).hasMessageContaining("acknowledgement");
        assertThatThrownBy(()->journey.decideProposalPublic(ctx.token,ctx.grant,new PublicProposalDecisionRequest(ctx.grant,"ACKNOWLEDGED",null,false)))
            .isInstanceOf(ApiException.class).hasMessageContaining("acknowledgement");
        em.flush();
        // Nothing moved: not the version, not the case, not the decision record.
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?",String.class,ctx.versionId)).isIn("RELEASED","VIEWED");
        assertThat(count("SELECT count(*) FROM proposal_decisions WHERE proposal_version_id=?",ctx.versionId)).isZero();
        assertThat(status(ctx.caseId)).isNotEqualTo("ACCEPTED");
    }

    @Test void anAcknowledgedContinuationSucceedsAndKeepsTheEvidenceAgainstThatVersion() throws Exception {
        var ctx=releasedProposal();
        journey.decideProposalPublic(ctx.token,ctx.grant,new PublicProposalDecisionRequest(ctx.grant,"ACKNOWLEDGED",null,true));
        em.flush();

        var row=jdbc.queryForMap("SELECT proposal_version_id,decision,acknowledged,acknowledged_at,acknowledgement_version FROM proposal_decisions");
        assertThat(row.get("proposal_version_id")).isEqualTo(ctx.versionId);
        assertThat(row.get("decision")).isEqualTo("ACKNOWLEDGED");
        assertThat(row.get("acknowledged")).isEqualTo(true);
        assertThat(row.get("acknowledged_at")).isNotNull();
        // The wording version is stamped by the server, so evidence cannot be shaped by the caller.
        assertThat(row.get("acknowledgement_version")).isEqualTo("proposal-ack-2026-09-25");
        assertThat(status(ctx.caseId)).isEqualTo("ACCEPTED");
    }

    @Test void askingForChangesNeedsNoAcknowledgement() throws Exception {
        var ctx=releasedProposal();
        journey.decideProposalPublic(ctx.token,ctx.grant,new PublicProposalDecisionRequest(ctx.grant,"REVISION_REQUESTED","Please review the cost"));
        em.flush();
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?",String.class,ctx.versionId)).isEqualTo("REVISION_REQUESTED");
        // Asking for changes commits the patient to nothing, so no acknowledgement is recorded.
        assertThat(jdbc.queryForObject("SELECT acknowledged FROM proposal_decisions WHERE proposal_version_id=?",Boolean.class,ctx.versionId)).isNotEqualTo(true);
    }

    @Test void decliningNeedsNoAcknowledgement() throws Exception {
        var ctx=releasedProposal();
        journey.decideProposalPublic(ctx.token,ctx.grant,new PublicProposalDecisionRequest(ctx.grant,"DECLINED",null));
        em.flush();
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?",String.class,ctx.versionId)).isEqualTo("DECLINED");
        assertThat(jdbc.queryForObject("SELECT acknowledged FROM proposal_decisions WHERE proposal_version_id=?",Boolean.class,ctx.versionId)).isNotEqualTo(true);
    }

    @Test void aSecondAcknowledgementOfTheSameProposalChangesNothing() throws Exception {
        var ctx=releasedProposal();
        var request=new PublicProposalDecisionRequest(ctx.grant,"ACKNOWLEDGED",null,true);
        journey.decideProposalPublic(ctx.token,ctx.grant,request); em.flush();
        assertThatThrownBy(()->journey.decideProposalPublic(ctx.token,ctx.grant,request)).isInstanceOf(ApiException.class);
        em.flush();
        assertThat(count("SELECT count(*) FROM proposal_decisions WHERE proposal_version_id=?",ctx.versionId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM proposal_decisions WHERE acknowledged=TRUE")).isEqualTo(1);
    }

    @Test void anExpiredProposalCannotBeAcknowledgedEvenWithTheAcknowledgementSet() throws Exception {
        var ctx=releasedProposal();
        jdbc.update("UPDATE proposal_versions SET valid_until=? WHERE id=?",Instant.now().minusSeconds(60),ctx.versionId);
        assertThatThrownBy(()->journey.decideProposalPublic(ctx.token,ctx.grant,new PublicProposalDecisionRequest(ctx.grant,"ACKNOWLEDGED",null,true)))
            .isInstanceOf(ApiException.class);
        em.flush();
        assertThat(count("SELECT count(*) FROM proposal_decisions WHERE proposal_version_id=?",ctx.versionId)).isZero();
    }

    @Test void aSupersededProposalCannotBeAcknowledged() throws Exception {
        var ctx=releasedProposal();
        jdbc.update("UPDATE proposal_versions SET status='SUPERSEDED' WHERE id=?",ctx.versionId);
        assertThatThrownBy(()->journey.decideProposalPublic(ctx.token,ctx.grant,new PublicProposalDecisionRequest(ctx.grant,"ACKNOWLEDGED",null,true)))
            .isInstanceOf(ApiException.class);
        em.flush();
        assertThat(count("SELECT count(*) FROM proposal_decisions WHERE proposal_version_id=?",ctx.versionId)).isZero();
    }

    @Test void thePatientSeesTheConsultantWhoActuallyReviewedTheCase() throws Exception {
        var ctx=releasedProposal();
        var view=journey.viewProposal(ctx.token,ctx.grant);
        // Resolved through the proposal's clinical review, not supplied by any caller.
        assertThat(view.consultantName()).isEqualTo("Doctor One");
        // No internal identifiers travel with it.
        assertThat(view.consultantName()).doesNotContain("-");
    }

    /** A released USD proposal on a case whose coordinator is "coordinator-subject", with a usable grant. */
    private ProposalCtx releasedProposal() throws Exception {
        var ctx=assignedDoctorCase();
        UUID service=seedCatalogService("PACE-DUAL","Dual chamber pacemaker implant","Procedure",new BigDecimal("390000.00"));
        seedFxRate("USD",new BigDecimal("0.0200"));
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("ACCEPT","Pacemaker implantation",null,
            List.of(new CostEstimateItem("Dual chamber pacemaker implant",new BigDecimal("390000.00"),"EGP",service)),"USD"));
        authenticate("coordinator-subject",Role.COORDINATOR);
        var proposal=journey.createProposal(ctx.caseId,draftRequest(approvedReview(ctx.caseId),null));
        UUID versionId=proposal.versionId();
        jdbc.update("UPDATE proposal_versions SET requires_finance_approval=FALSE WHERE id=?",versionId);
        journey.releaseProposal(ctx.caseId,versionId); em.flush();
        String stored=payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?",String.class,"proposal-ready:"+versionId));
        String token=json.readValue(stored,new TypeReference<Map<String,String>>(){}).get("token");
        SecurityContextHolder.clearContext();
        journey.requestProposalAccess(token,"WHATSAPP");
        String code=proposalAccessCode(ctx.caseId);
        String grant=journey.verifyProposalAccess(token,code).grant();
        return new ProposalCtx(ctx.caseId,versionId,token,grant);
    }

    private record ProposalCtx(UUID caseId,UUID versionId,String token,String grant){}

    private UUID approvedReview(UUID caseId){
        return jdbc.queryForObject("SELECT id FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'",UUID.class,caseId);
    }

    private ProposalDraftRequest draftRequest(UUID reviewId,String currency){
        return new ProposalDraftRequest(reviewId,"en","Plan",currency,"Included","Excluded","Deposit","Refund","Consent",
            Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Line",BigDecimal.ONE,new BigDecimal("1.00"),false,0)),null);
    }

    private void seedFxRate(String quoteCurrency,BigDecimal rate){
        jdbc.update("DELETE FROM fx_rates WHERE quote_currency=? AND rate_date=?",quoteCurrency,java.time.LocalDate.now(java.time.ZoneOffset.UTC));
        jdbc.update("INSERT INTO fx_rates(id,base_currency,quote_currency,rate,rate_date,source,fetched_at) VALUES(?,?,?,?,?,?,?)",
            UUID.randomUUID(),"EGP",quoteCurrency,rate,java.time.LocalDate.now(java.time.ZoneOffset.UTC),"API",Instant.now());
    }

    private UUID seedCatalogService(String code,String name,String category,BigDecimal priceEgp){
        UUID practitioner=jdbc.queryForObject("SELECT id FROM practitioner_profiles WHERE external_subject=?",UUID.class,"doctor-subject");
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
            id,practitioner,code,name,category,priceEgp,true,"admin",Instant.now(),Instant.now());
        return id;
    }

    // ---- No create-and-release shortcut at the transition level ----

    @Test void proposalPreparationCannotJumpStraightToPatientDecision() throws Exception {
        var ctx=releaseProposalWithoutPatientAccount(); // ends at PATIENT_DECISION already; test the guard on a fresh prep
        var created=cases.create(new CreateCaseRequest("Guard", "Patient","Kenya","+254700000030","Reports","en",true,null,null,null));
        cases.submit(created.caseId()); em.flush();
        authenticate("coordinator-subject",Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(),"pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        assertThatThrownBy(()->journey.transition(created.caseId(),new TransitionRequest("PATIENT_DECISION","skip",v)))
            .isInstanceOf(ApiException.class).hasMessageContaining("dedicated authorized operation");
    }

    @Test void staffLeadsAreListedUnderTheirBaseFunctionDirectory() {
        seedStaffMember("ops-lead-subject","OPERATIONS_LEAD");
        seedStaffMember("ops-base-subject","OPERATIONS");
        seedStaffMember("fin-lead-subject","FINANCE_LEAD");
        // A lead is listed in — and therefore assignable through — its base-function directory.
        authenticate("coordinator-subject",Role.COORDINATOR);
        assertThat(journey.staffDirectory("OPERATIONS")).extracting(StaffDirectoryView::subject).contains("ops-lead-subject","ops-base-subject");
        assertThat(journey.staffDirectory("FINANCE")).extracting(StaffDirectoryView::subject).contains("fin-lead-subject");
    }
    private void seedStaffMember(String subject,String role){com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, subject, role, crypto.encrypt(role+" member"));}

    @Test void coordinatorClassifiesCaseAndCanOnlyAssignAMatchingConsultant() {
        var created=cases.create(new CreateCaseRequest("Category", "Patient","Kenya","+254700000031","Reports","en",true,null,null,null));
        cases.submit(created.caseId());em.flush();em.clear();
        authenticate("coordinator-subject",Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(),"intake-pod");
        var intake=journey.workspace(created.caseId()).caseSummary();
        assertThat(intake.careCategory()).isNull();

        var classified=journey.updateCareCategory(created.caseId(),new CareCategoryUpdateRequest("cardiology",intake.version(),"Coordinator clinical routing review"));
        assertThat(classified.careCategory()).isEqualTo("cardiology");

        UUID orthopedistId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",orthopedistId,"orthopedist-subject","Orthopedist","Orthopedist","VERIFIED","CONSULTANT","AVAILABLE","orthopedics",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),orthopedistId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        assertThatThrownBy(()->journey.assign(created.caseId(),new AssignmentRequest("orthopedist-subject","DOCTOR","PRIMARY",null,"Clinical review")))
            .isInstanceOf(ApiException.class).hasMessageContaining("matches the case care area");

        seedDoctor();
        assertThat(journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY",null,"Clinical review")).status()).isEqualTo("PENDING");
    }

    // ================= helpers =================
    private record Ctx(UUID caseId,UUID versionId,String token,String caseNumber){}

    private Ctx releaseProposalWithoutPatientAccount() throws Exception {
        var created=cases.create(new CreateCaseRequest("Link", "Patient","Kenya","+254700000020","Cardiac reports","en",true,null,"link@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        jdbc.update("UPDATE medical_cases SET travel_package_requested=true WHERE id=?",created.caseId()); // exercises the Operations gate
        authenticate("coordinator-subject",Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(),"cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","ready",v));
        seedDoctor();
        seedStaff();
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(), new AssignmentDecisionRequest(true,null));
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended intervention","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Consultant treatment package",new BigDecimal("1000.00"),"EGP",0,new BigDecimal("1000.00"),true);
        authenticate("coordinator-subject",Role.COORDINATOR);
        var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Plan","EGP","Incl","Excl","Deposit","Refund","Not consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Treatment package",BigDecimal.ONE,new BigDecimal("1000.00"),false,0)),null));
        var operationsAssignment=journey.assign(created.caseId(),new AssignmentRequest("operations-subject","OPERATIONS","PRIMARY","cardiac-pod","Ops"));
        var financeAssignment=journey.assign(created.caseId(),new AssignmentRequest("finance-subject","FINANCE","PRIMARY","cardiac-pod","Finance"));
        authenticate("operations-subject",Role.OPERATIONS);journey.decideAssignment(created.caseId(),operationsAssignment.id(), new AssignmentDecisionRequest(true,null), com.rehletshifaa.authority.domain.Role.OPERATIONS);journey.completeOperations(created.caseId(),proposal.versionId(),"Ops plan");
        authenticate("finance-subject",Role.FINANCE);journey.decideAssignment(created.caseId(),financeAssignment.id(), new AssignmentDecisionRequest(true,null), com.rehletshifaa.authority.domain.Role.FINANCE);journey.approveFinance(created.caseId(),proposal.versionId());
        authenticate("coordinator-subject",Role.COORDINATOR);journey.releaseProposal(created.caseId(),proposal.versionId());
        em.flush();
        String token=payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?",String.class,"proposal-ready:"+proposal.versionId()));
        String raw=json.readValue(token,new TypeReference<Map<String,String>>(){}).get("token");
        return new Ctx(created.caseId(),proposal.versionId(),raw,created.caseNumber());
    }

    private Ctx assignedDoctorCase() throws Exception {
        var created=cases.create(new CreateCaseRequest("Doc", "Patient","Kenya","+254700000021","Reports","en",true,null,null,null,"cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject",Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(),"pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","ready",v));
        seedDoctor();
        var a=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","pod","review"));
        authenticate("doctor-subject",Role.CONSULTANT);journey.acceptDoctorAssignment(created.caseId(),a.id(), new AssignmentDecisionRequest(true,null));
        return new Ctx(created.caseId(),null,null,created.caseNumber());
    }

    private void seedDoctor(){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",id,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),id,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());}
    private void seedStaff(){com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "operations-subject", "OPERATIONS", crypto.encrypt("Operations One"));com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "finance-subject", "FINANCE", crypto.encrypt("Finance One"));}
    // Outbox reads are scoped to the link/share token/case that owns the row; _ROWID_ (insertion order) breaks created_at ties on coarse clocks.
    private String caseAccessCode(String token,String dest) throws Exception {String raw=payload(jdbc.queryForObject("SELECT o.template_data FROM notification_outbox o JOIN case_access_challenges ch ON o.idempotency_key='case-access:'||ch.id JOIN case_access_links l ON l.id=ch.link_id WHERE l.token_hash=? AND o.destination=? ORDER BY o.created_at DESC, o._ROWID_ DESC LIMIT 1",String.class,intakeLifecycle.hash(token),dest));return json.readValue(raw,new TypeReference<Map<String,String>>(){}).get("code");}
    private String proposalAccessCode(UUID caseId) throws Exception {String raw=payload(jdbc.queryForObject("SELECT o.template_data FROM notification_outbox o JOIN proposal_access_challenges ch ON o.idempotency_key='proposal-access:'||ch.id WHERE ch.case_id=? ORDER BY o.created_at DESC, o._ROWID_ DESC LIMIT 1",String.class,caseId));return json.readValue(raw,new TypeReference<Map<String,String>>(){}).get("code");}
    private String informationActionToken(UUID caseId) throws Exception {String raw=payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='PATIENT_ACTION' AND idempotency_key IN (SELECT 'patient-action:'||id FROM case_access_links WHERE case_id=? AND purpose='INFORMATION_RESPONSE') ORDER BY created_at DESC, _ROWID_ DESC LIMIT 1",String.class,caseId));return json.readValue(raw,new TypeReference<Map<String,String>>(){}).get("token");}
    private String payload(String stored){return stored.startsWith("enc:")?crypto.decrypt(stored.substring(4)):stored;}
    private int count(String sql,Object... args){Integer n=jdbc.queryForObject(sql,Integer.class,args);return n==null?0:n;}
    private String status(UUID caseId){return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?",String.class,caseId);}
    private void authenticate(String subject,Role role){com.rehletshifaa.authority.TestPrincipals.signIn(jdbc,crypto,subject,role);}
}
