package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.*;
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
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class JourneyServiceIntegrationTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired JdbcTemplate jdbc; @Autowired ObjectMapper json; @Autowired EntityManager entityManager;
    @AfterEach void clearSecurity(){SecurityContextHolder.clearContext();}

    @Test void completesClaimAssignmentClinicalProposalAndDecisionFlow()throws Exception{
        var created=cases.create(new CreateCaseRequest("Patient One","Kenya","+254700000001","Cardiac reports","en",true,null,"patient@local.test","Africa/Nairobi"));
        cases.submit(created.caseId());
        entityManager.flush();entityManager.clear();
        String raw=jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key LIKE 'claim:%' AND destination=?",String.class,"+254700000001");
        String code=json.readValue(raw,new TypeReference<Map<String,String>>(){}).get("code");
        authenticate("patient-subject","PATIENT");var claimed=journey.claim(created.caseId(),new ClaimRequest(code));assertThat(claimed.status()).isEqualTo("RECEIVED");

        authenticate("coordinator-subject","COORDINATOR");journey.claimCoordinatorCase(created.caseId(),"cardiac-pod");
        long intakeVersion=journey.workspace(created.caseId()).caseSummary().version();
        var ready=journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",intakeVersion));assertThat(ready.status()).isEqualTo("READY_FOR_CONSULTANT");
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,0)",UUID.randomUUID(),"doctor-subject","Doctor One","Doctor One","VERIFIED",Instant.now(),Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        journey.assign(created.caseId(),new AssignmentRequest("operations-subject","OPERATIONS","PRIMARY","cardiac-pod","Travel and hospital planning"));
        journey.assign(created.caseId(),new AssignmentRequest("finance-subject","FINANCE","PRIMARY","cardiac-pod","Commercial approval"));

        authenticate("doctor-subject","DOCTOR");journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(),true);
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed records","SUITABLE",null,"Updated imaging","Recommended intervention","Medical management","Standard procedural risks","Assessment then intervention","7 days","Virtual follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());

        authenticate("coordinator-subject","COORDINATOR");var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Hospital and travel plan","USD","Clinical review and treatment","Complications and extra nights","Deposit before travel","Provider refund policy","Not procedure-specific consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Treatment package",BigDecimal.ONE,new BigDecimal("1000.00"),false,0))));
        authenticate("operations-subject","OPERATIONS");proposal=journey.completeOperations(created.caseId(),proposal.versionId(),"Operational plan confirmed");assertThat(proposal.status()).isEqualTo("OPERATIONS_COMPLETED");
        authenticate("finance-subject","FINANCE");proposal=journey.approveFinance(created.caseId(),proposal.versionId());assertThat(proposal.status()).isEqualTo("FINANCE_APPROVED");
        authenticate("coordinator-subject","COORDINATOR");proposal=journey.releaseProposal(created.caseId(),proposal.versionId());assertThat(proposal.status()).isEqualTo("RELEASED");
        authenticate("patient-subject","PATIENT");proposal=journey.decideProposal(created.caseId(),proposal.versionId(),new ProposalDecisionRequest("ACCEPTED",List.of(),"Approved"));assertThat(proposal.status()).isEqualTo("ACCEPTED");
        assertThat(journey.patientCases()).extracting(CaseView::status).contains("ACCEPTED");
    }

    private void authenticate(String subject,String role){Jwt jwt=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",Instant.now().getEpochSecond()).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,List.of(new SimpleGrantedAuthority("ROLE_"+role)),subject));}
}
