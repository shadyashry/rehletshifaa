package com.rehletshifaa.journey.application;

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
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Focused verification of the workflow / security corrections in {@link JourneyService}. */
@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class SecureJourneyCorrectionsTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired PublicCaseAccessService publicCases; @Autowired ProposalExpiryService expiry; @Autowired CredentialExpiryService credentialExpiry; @Autowired JdbcTemplate jdbc; @Autowired ObjectMapper json; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear(){SecurityContextHolder.clearContext();}

    // ---- Core product decision: OTP timing + verification does not change status ----

    @Test void statusAccessIsOnlyCreatedAfterSubmission() {
        var created=cases.create(new CreateCaseRequest("Draft Patient","Kenya","+254700000010","Reports","en",true,null,"d@local.test","Africa/Nairobi"));
        em.flush();
        assertThat(count("SELECT count(*) FROM case_claim_challenges WHERE case_id=?",created.caseId())).isZero();
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE idempotency_key LIKE 'claim:%' AND destination=?","+254700000010")).isZero();
        var submitted=cases.submit(created.caseId()); em.flush();
        assertThat(submitted.statusToken()).isNotBlank();
        assertThat(count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='STATUS'",created.caseId())).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_access_challenges")).isZero();
    }

    @Test void statusVerificationDoesNotAdvanceCaseStatus() throws Exception {
        var created=cases.create(new CreateCaseRequest("Verify Patient","Kenya","+254700000011","Reports","en",true,null,null,null));
        var submitted=cases.submit(created.caseId()); em.flush(); em.clear();
        publicCases.requestAccess(submitted.statusToken());em.flush();
        String code=caseAccessCode("+254700000011");
        var grant=publicCases.verify(submitted.statusToken(),code);
        publicCases.view(submitted.statusToken(),grant.grant());
        assertThat(status(created.caseId())).isEqualTo("RECEIVED");
        assertThatThrownBy(()->publicCases.verify(submitted.statusToken(),code)).isInstanceOf(ApiException.class);
    }

    @Test void patientCanRecoverStatusLinkWithoutCaseEnumeration() throws Exception {
        var created=cases.create(new CreateCaseRequest("Recovery Patient","Egypt","+20 101 044 7898","Reports","en",true,null,null,null));
        cases.submit(created.caseId());em.flush();
        int originalLinks=count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='STATUS'",created.caseId());
        publicCases.recoverStatusLink(new CaseLinkRecoveryRequest(created.caseNumber(),"+20 000 000 0000","en"));em.flush();
        assertThat(count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='STATUS'",created.caseId())).isEqualTo(originalLinks);
        publicCases.recoverStatusLink(new CaseLinkRecoveryRequest(created.caseNumber().toLowerCase(Locale.ROOT),"00201010447898","en"));em.flush();
        assertThat(count("SELECT count(*) FROM case_access_links WHERE case_id=? AND purpose='STATUS'",created.caseId())).isEqualTo(originalLinks+1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE notification_type='CASE_STATUS_RECOVERY' AND destination=?","+20 101 044 7898")).isEqualTo(1);
    }

    @Test void informationResponseIsPurposeScopedCompletesPatientActionAndReturnsToIntake() throws Exception {
        var created=cases.create(new CreateCaseRequest("Action Patient","Kenya","+254700000012","Reports","en",true,null,null,null));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject","COORDINATOR");
        journey.claimCoordinatorCase(created.caseId(),"pod");
        long version=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("INFORMATION_REQUIRED","Please add the missing report",version)); em.flush();
        String token=informationActionToken(created.caseId());
        publicCases.requestAccess(token); em.flush();
        String code=caseAccessCode("+254700000012");
        var grant=publicCases.verify(token,code);
        assertThat(publicCases.view(token,grant.grant()).actionRequired()).isTrue();
        publicCases.respond(token,new InformationResponseRequest(grant.grant(),"The requested report has been added","en"));
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

    @Test void verifiedPatientCanViewDecideAndTriggersActivationInvite() throws Exception {
        var ctx=releaseProposalWithoutPatientAccount();
        journey.requestProposalAccess(ctx.token); em.flush();
        String code=proposalAccessCode(ctx.caseId);
        ProposalAccessGrant grant=journey.verifyProposalAccess(ctx.token,code);
        PublicProposalView full=journey.viewProposal(ctx.token,grant.grant());
        assertThat(full.recommendedTreatment()).isNotBlank();
        var decision=journey.decideProposalPublic(ctx.token,grant.grant(),new PublicProposalDecisionRequest(grant.grant(),"ACCEPTED","Yes"));
        assertThat(decision.status()).isEqualTo("ACCEPTED");
        assertThat(status(ctx.caseId)).isEqualTo("ACCEPTED");
        assertThat(count("SELECT count(*) FROM account_activations WHERE case_id=?",ctx.caseId)).isEqualTo(1);
        assertThatThrownBy(()->journey.viewProposal(ctx.token,grant.grant())).isInstanceOf(ApiException.class);
    }

    @Test void activationLinksExistingProfileAndAllCases() throws Exception {
        var ctx=releaseProposalWithoutPatientAccount();
        journey.requestProposalAccess(ctx.token); em.flush();
        String code=proposalAccessCode(ctx.caseId);
        var grant=journey.verifyProposalAccess(ctx.token,code);
        journey.decideProposalPublic(ctx.token,grant.grant(),new PublicProposalDecisionRequest(grant.grant(),"ACCEPTED",null)); em.flush();
        String activation=activationToken(ctx.caseId);
        authenticate("new-account-subject","PATIENT");
        var res=journey.activateAccount(activation);
        assertThat(res.status()).isEqualTo("ACTIVATED");
        assertThat(journey.patientCases()).extracting(CaseView::caseNumber).contains(ctx.caseNumber);
        assertThatThrownBy(()->journey.activateAccount(activation)).isInstanceOf(ApiException.class).hasMessageContaining("already been used");
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
        authenticate("coordinator-subject","COORDINATOR");
        journey.message(ctx.caseId,new MessageRequest("PATIENT_COORDINATOR","We received your case","en",false));
        journey.message(ctx.caseId,new MessageRequest("COORDINATOR_DOCTOR","Internal note for the doctor","en",true));
        // Doctor may only use the coordinator-doctor thread.
        authenticate("doctor-subject","DOCTOR");
        assertThatThrownBy(()->journey.message(ctx.caseId,new MessageRequest("PATIENT_COORDINATOR","hi patient","en",false)))
            .isInstanceOf(ApiException.class).hasMessageContaining("conversation");
        var doctorView=journey.workspace(ctx.caseId).messages();
        assertThat(doctorView).extracting(MessageView::threadType).containsOnly("COORDINATOR_DOCTOR");
    }

    @Test void clientInternalFlagIsIgnoredForPatientThread() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("coordinator-subject","COORDINATOR");
        // Even though the client asks for internalOnly=true, a PATIENT_COORDINATOR message is public.
        journey.message(ctx.caseId,new MessageRequest("PATIENT_COORDINATOR","Visible to patient","en",true));
        Boolean internal=jdbc.queryForObject("SELECT internal_only FROM case_messages WHERE case_id=? AND thread_type='PATIENT_COORDINATOR' ORDER BY created_at DESC LIMIT 1",Boolean.class,ctx.caseId);
        assertThat(internal).isFalse();
        String stored=jdbc.queryForObject("SELECT body FROM case_messages WHERE case_id=? AND thread_type='PATIENT_COORDINATOR' ORDER BY created_at DESC LIMIT 1",String.class,ctx.caseId);
        assertThat(stored).startsWith("enc:").doesNotContain("Visible to patient");
        String notification=payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='SECURE_MESSAGE' ORDER BY created_at DESC LIMIT 1",String.class));
        assertThat(notification).doesNotContain("Visible to patient");
    }

    @Test void messageReadStateIsPerUser() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("coordinator-subject","COORDINATOR");
        UUID messageId=journey.message(ctx.caseId,new MessageRequest("COORDINATOR_DOCTOR","Internal review note","en",true)).id();
        authenticate("doctor-subject","DOCTOR");
        assertThat(journey.workspace(ctx.caseId).messages()).filteredOn(m->m.id().equals(messageId)).extracting(MessageView::read).containsExactly(false);
        journey.markMessageRead(ctx.caseId,messageId);
        assertThat(journey.workspace(ctx.caseId).messages()).filteredOn(m->m.id().equals(messageId)).extracting(MessageView::read).containsExactly(true);
    }

    @Test void blockingTaskPreventsClinicalApproval() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("coordinator-subject","COORDINATOR");
        var task=journey.task(ctx.caseId,new TaskRequest("CLINICAL_REVIEW","Complete clinical review","Document the recommendation","doctor-subject","DOCTOR","HIGH",true,Instant.now().plusSeconds(3600)));
        assertThat(jdbc.queryForObject("SELECT title FROM case_tasks WHERE id=?",String.class,task.id())).startsWith("enc:");
        authenticate("doctor-subject","DOCTOR");
        var review=journey.saveClinicalReview(ctx.caseId,new ClinicalReviewRequest("Reviewed","SUITABLE",null,null,"Treatment",null,"Risks",null,null,null));
        assertThatThrownBy(()->journey.approveClinicalReview(ctx.caseId,review.id())).isInstanceOf(ApiException.class).hasMessageContaining("blocking tasks");
    }

    @Test void assignedDoctorCanStartAndCompleteOwnTaskWithOptimisticVersion() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("coordinator-subject","COORDINATOR");
        var task=journey.task(ctx.caseId,new TaskRequest("CLINICAL_REVIEW","Complete clinical review",null,"doctor-subject","DOCTOR","HIGH",false,Instant.now().plusSeconds(3600)));
        authenticate("doctor-subject","DOCTOR");
        journey.startTask(ctx.caseId,task.id(),new TaskVersionRequest(0L));
        journey.completeTask(ctx.caseId,task.id(),new CompleteTaskRequest("Clinical review completed",1L));
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE id=?",String.class,task.id())).isEqualTo("COMPLETED");
    }

    // ---- Doctor clinical outcomes replace whole-case cancel ----

    @Test void doctorReassignReturnsToConsultantQueueAndEndsAssignment() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject","DOCTOR");
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("REASSIGN",null,"Needs a different specialty",null));
        assertThat(status(ctx.caseId)).isEqualTo("READY_FOR_CONSULTANT");
        assertThat(count("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_role='DOCTOR' AND status='ACTIVE'",ctx.caseId)).isZero();
    }

    @Test void declinedDoctorAssignmentReturnsCaseToMatchingQueue() throws Exception {
        var ctx=assignedDoctorCase();
        UUID assignment=jdbc.queryForObject("SELECT id FROM case_assignments WHERE case_id=? AND assignee_role='DOCTOR'",UUID.class,ctx.caseId);
        jdbc.update("UPDATE case_assignments SET status='PENDING',accepted_at=NULL WHERE id=?",assignment);
        jdbc.update("UPDATE medical_cases SET status='CONSULTANT_ASSIGNMENT_PENDING' WHERE id=?",ctx.caseId);
        authenticate("doctor-subject","DOCTOR");
        journey.decideAssignment(ctx.caseId,assignment,false,com.rehletshifaa.security.ActorRole.DOCTOR);
        assertThat(status(ctx.caseId)).isEqualTo("READY_FOR_CONSULTANT");
        assertThat(jdbc.queryForObject("SELECT status FROM case_assignments WHERE id=?",String.class,assignment)).isEqualTo("DECLINED");
    }

    @Test void endedAssignmentCannotReadCaseWorkspace() throws Exception {
        var ctx=assignedDoctorCase();
        jdbc.update("UPDATE case_assignments SET status='ENDED',ended_at=? WHERE case_id=? AND assignee_role='DOCTOR'",Instant.now(),ctx.caseId);
        authenticate("doctor-subject","DOCTOR");
        assertThatThrownBy(()->journey.workspace(ctx.caseId)).isInstanceOf(ApiException.class).hasMessageContaining("not authorized");
    }

    @Test void coordinatorLeadCanRebalanceOwnershipAndOldOwnerLosesAccess() {
        var created=cases.create(new CreateCaseRequest("Rebalance Patient","Kenya","+254700000022","Reports","en",true,null,null,null));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject","COORDINATOR");
        journey.claimCoordinatorCase(created.caseId(),"pod");
        jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)",UUID.randomUUID(),"replacement-coordinator","COORDINATOR",crypto.encrypt("Replacement Coordinator"),Instant.now(),Instant.now());
        authenticate("lead-subject","COORDINATOR_LEAD");
        journey.reassignCoordinator(created.caseId(),new CoordinatorReassignmentRequest("replacement-coordinator","Workload rebalance"));
        authenticate("coordinator-subject","COORDINATOR");
        assertThatThrownBy(()->journey.workspace(created.caseId())).isInstanceOf(ApiException.class).hasMessageContaining("not authorized");
        authenticate("replacement-coordinator","COORDINATOR");
        assertThat(journey.workspace(created.caseId()).caseSummary().coordinatorSubject()).isEqualTo("replacement-coordinator");
    }

    @Test void doctorNotSuitableIsADistinctClinicalOutcome() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject","DOCTOR");
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("NOT_SUITABLE",null,"Not a candidate",null));
        assertThat(status(ctx.caseId)).isEqualTo("CLINICALLY_NOT_SUITABLE");
    }

    @Test void doctorAcceptPersistsCostEstimatesAndExposesThemOnTheApprovedReview() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject","DOCTOR");
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

    // ---- No create-and-release shortcut at the transition level ----

    @Test void proposalPreparationCannotJumpStraightToPatientDecision() throws Exception {
        var ctx=releaseProposalWithoutPatientAccount(); // ends at PATIENT_DECISION already; test the guard on a fresh prep
        var created=cases.create(new CreateCaseRequest("Guard Patient","Kenya","+254700000030","Reports","en",true,null,null,null));
        cases.submit(created.caseId()); em.flush();
        authenticate("coordinator-subject","COORDINATOR");
        journey.claimCoordinatorCase(created.caseId(),"pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        assertThatThrownBy(()->journey.transition(created.caseId(),new TransitionRequest("PATIENT_DECISION","skip",v)))
            .isInstanceOf(ApiException.class).hasMessageContaining("dedicated authorized operation");
    }

    @Test void coordinatorClassifiesCaseAndCanOnlyAssignAMatchingConsultant() {
        var created=cases.create(new CreateCaseRequest("Category Patient","Kenya","+254700000031","Reports","en",true,null,null,null));
        cases.submit(created.caseId());em.flush();em.clear();
        authenticate("coordinator-subject","COORDINATOR");
        journey.claimCoordinatorCase(created.caseId(),"intake-pod");
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
        var created=cases.create(new CreateCaseRequest("Link Patient","Kenya","+254700000020","Cardiac reports","en",true,null,"link@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject","COORDINATOR");
        journey.claimCoordinatorCase(created.caseId(),"cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","ready",v));
        seedDoctor();
        seedStaff();
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject","DOCTOR");
        journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(),true);
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended intervention","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        authenticate("coordinator-subject","COORDINATOR");
        var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Plan","USD","Incl","Excl","Deposit","Refund","Not consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Treatment package",BigDecimal.ONE,new BigDecimal("1000.00"),false,0)),null));
        var operationsAssignment=journey.assign(created.caseId(),new AssignmentRequest("operations-subject","OPERATIONS","PRIMARY","cardiac-pod","Ops"));
        var financeAssignment=journey.assign(created.caseId(),new AssignmentRequest("finance-subject","FINANCE","PRIMARY","cardiac-pod","Finance"));
        authenticate("operations-subject","OPERATIONS");journey.decideAssignment(created.caseId(),operationsAssignment.id(),true,com.rehletshifaa.security.ActorRole.OPERATIONS);journey.completeOperations(created.caseId(),proposal.versionId(),"Ops plan");
        authenticate("finance-subject","FINANCE");journey.decideAssignment(created.caseId(),financeAssignment.id(),true,com.rehletshifaa.security.ActorRole.FINANCE);journey.approveFinance(created.caseId(),proposal.versionId());
        authenticate("coordinator-subject","COORDINATOR");journey.releaseProposal(created.caseId(),proposal.versionId());
        em.flush();
        String token=payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?",String.class,"proposal-ready:"+proposal.versionId()));
        String raw=json.readValue(token,new TypeReference<Map<String,String>>(){}).get("token");
        return new Ctx(created.caseId(),proposal.versionId(),raw,created.caseNumber());
    }

    private Ctx assignedDoctorCase() throws Exception {
        var created=cases.create(new CreateCaseRequest("Doc Patient","Kenya","+254700000021","Reports","en",true,null,null,null,"cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject","COORDINATOR");
        journey.claimCoordinatorCase(created.caseId(),"pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","ready",v));
        seedDoctor();
        var a=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","pod","review"));
        authenticate("doctor-subject","DOCTOR");journey.acceptDoctorAssignment(created.caseId(),a.id(),true);
        return new Ctx(created.caseId(),null,null,created.caseNumber());
    }

    private void seedDoctor(){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",id,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),id,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());}
    private void seedStaff(){jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)",UUID.randomUUID(),"operations-subject","OPERATIONS",crypto.encrypt("Operations One"),Instant.now(),Instant.now());jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)",UUID.randomUUID(),"finance-subject","FINANCE",crypto.encrypt("Finance One"),Instant.now(),Instant.now());}
    private String caseAccessCode(String dest) throws Exception {String raw=payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='CASE_ACCESS' AND destination=? ORDER BY created_at DESC LIMIT 1",String.class,dest));return json.readValue(raw,new TypeReference<Map<String,String>>(){}).get("code");}
    private String proposalAccessCode(UUID caseId) throws Exception {String raw=payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='PROPOSAL_ACCESS' AND destination IN (SELECT p.whatsapp_number FROM patient_profiles p JOIN medical_cases c ON c.patient_id=p.id WHERE c.id=?) ORDER BY created_at DESC LIMIT 1",String.class,caseId));return json.readValue(raw,new TypeReference<Map<String,String>>(){}).get("code");}
    private String activationToken(UUID caseId) throws Exception {String raw=payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='ACCOUNT_ACTIVATION' ORDER BY created_at DESC LIMIT 1",String.class));return json.readValue(raw,new TypeReference<Map<String,String>>(){}).get("token");}
    private String informationActionToken(UUID caseId) throws Exception {String raw=payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='PATIENT_ACTION' AND idempotency_key LIKE 'patient-action:%' ORDER BY created_at DESC LIMIT 1",String.class));return json.readValue(raw,new TypeReference<Map<String,String>>(){}).get("token");}
    private String payload(String stored){return stored.startsWith("enc:")?crypto.decrypt(stored.substring(4)):stored;}
    private int count(String sql,Object... args){Integer n=jdbc.queryForObject(sql,Integer.class,args);return n==null?0:n;}
    private String status(UUID caseId){return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?",String.class,caseId);}
    private void authenticate(String subject,String role){Jwt jwt=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",Instant.now().getEpochSecond()).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,List.of(new SimpleGrantedAuthority("ROLE_"+role)),subject));}
}
