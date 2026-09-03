package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.shared.api.ApiException;
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
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired JdbcTemplate jdbc; @Autowired ObjectMapper json; @Autowired EntityManager em;
    @AfterEach void clear(){SecurityContextHolder.clearContext();}

    // ---- Core product decision: OTP timing + verification does not change status ----

    @Test void otpIsNotGeneratedForADraftAndOnlyMintedAfterSubmission() throws Exception {
        var created=cases.create(new CreateCaseRequest("Draft Patient","Kenya","+254700000010","Reports","en",true,null,"d@local.test","Africa/Nairobi"));
        em.flush();
        assertThat(count("SELECT count(*) FROM case_claim_challenges WHERE case_id=?",created.caseId())).isZero();
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE idempotency_key LIKE 'claim:%' AND destination=?","+254700000010")).isZero();
        cases.submit(created.caseId()); em.flush();
        assertThat(count("SELECT count(*) FROM case_claim_challenges WHERE case_id=?",created.caseId())).isEqualTo(1);
    }

    @Test void patientVerificationDoesNotAdvanceCaseStatus() throws Exception {
        var created=cases.create(new CreateCaseRequest("Verify Patient","Kenya","+254700000011","Reports","en",true,null,null,null));
        cases.submit(created.caseId()); em.flush(); em.clear();
        String code=claimCode("+254700000011");
        authenticate("patient-verify","PATIENT");
        var view=journey.claim(created.caseId(),new ClaimRequest(code));
        assertThat(view.status()).isEqualTo("RECEIVED"); // NOT INTAKE_REVIEW
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
    }

    // ---- Doctor clinical outcomes replace whole-case cancel ----

    @Test void doctorReassignReturnsToConsultantQueueAndEndsAssignment() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject","DOCTOR");
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("REASSIGN",null,"Needs a different specialty"));
        assertThat(status(ctx.caseId)).isEqualTo("READY_FOR_CONSULTANT");
        assertThat(count("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_role='DOCTOR' AND status='ACTIVE'",ctx.caseId)).isZero();
    }

    @Test void doctorNotSuitableIsADistinctClinicalOutcome() throws Exception {
        var ctx=assignedDoctorCase();
        authenticate("doctor-subject","DOCTOR");
        journey.reviewDecision(ctx.caseId,new ReviewDecisionRequest("NOT_SUITABLE",null,"Not a candidate"));
        assertThat(status(ctx.caseId)).isEqualTo("CLINICALLY_NOT_SUITABLE");
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
            .isInstanceOf(ApiException.class).hasMessageContaining("transition");
    }

    // ================= helpers =================
    private record Ctx(UUID caseId,UUID versionId,String token,String caseNumber){}

    private Ctx releaseProposalWithoutPatientAccount() throws Exception {
        var created=cases.create(new CreateCaseRequest("Link Patient","Kenya","+254700000020","Cardiac reports","en",true,null,"link@local.test","Africa/Nairobi"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        authenticate("coordinator-subject","COORDINATOR");
        journey.claimCoordinatorCase(created.caseId(),"cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","ready",v));
        seedDoctor();
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        journey.assign(created.caseId(),new AssignmentRequest("operations-subject","OPERATIONS","PRIMARY","cardiac-pod","Ops"));
        journey.assign(created.caseId(),new AssignmentRequest("finance-subject","FINANCE","PRIMARY","cardiac-pod","Finance"));
        authenticate("doctor-subject","DOCTOR");
        journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(),true);
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended intervention","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        authenticate("coordinator-subject","COORDINATOR");
        var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Plan","USD","Incl","Excl","Deposit","Refund","Not consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Treatment package",BigDecimal.ONE,new BigDecimal("1000.00"),false,0))));
        authenticate("operations-subject","OPERATIONS");journey.completeOperations(created.caseId(),proposal.versionId(),"Ops plan");
        authenticate("finance-subject","FINANCE");journey.approveFinance(created.caseId(),proposal.versionId());
        authenticate("coordinator-subject","COORDINATOR");journey.releaseProposal(created.caseId(),proposal.versionId());
        em.flush();
        String token=jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?",String.class,"proposal-ready:"+proposal.versionId());
        String raw=json.readValue(token,new TypeReference<Map<String,String>>(){}).get("token");
        return new Ctx(created.caseId(),proposal.versionId(),raw,created.caseNumber());
    }

    private Ctx assignedDoctorCase() throws Exception {
        var created=cases.create(new CreateCaseRequest("Doc Patient","Kenya","+254700000021","Reports","en",true,null,null,null));
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

    private void seedDoctor(){jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,created_at,updated_at,version) SELECT ?,?,?,?,?,?,?,?,0 WHERE NOT EXISTS (SELECT 1 FROM practitioner_profiles WHERE external_subject=?)",UUID.randomUUID(),"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT",Instant.now(),Instant.now(),"doctor-subject");}
    private String claimCode(String dest) throws Exception {String raw=jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key LIKE 'claim:%' AND destination=?",String.class,dest);return json.readValue(raw,new TypeReference<Map<String,String>>(){}).get("code");}
    private String proposalAccessCode(UUID caseId) throws Exception {String raw=jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='PROPOSAL_ACCESS' AND destination IN (SELECT p.whatsapp_number FROM patient_profiles p JOIN medical_cases c ON c.patient_id=p.id WHERE c.id=?) ORDER BY created_at DESC LIMIT 1",String.class,caseId);return json.readValue(raw,new TypeReference<Map<String,String>>(){}).get("code");}
    private String activationToken(UUID caseId) throws Exception {String raw=jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='ACCOUNT_ACTIVATION' ORDER BY created_at DESC LIMIT 1",String.class);return json.readValue(raw,new TypeReference<Map<String,String>>(){}).get("token");}
    private int count(String sql,Object... args){Integer n=jdbc.queryForObject(sql,Integer.class,args);return n==null?0:n;}
    private String status(UUID caseId){return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?",String.class,caseId);}
    private void authenticate(String subject,String role){Jwt jwt=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",Instant.now().getEpochSecond()).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,List.of(new SimpleGrantedAuthority("ROLE_"+role)),subject));}
}
