package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.*;
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
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class JourneyServiceIntegrationTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto; @Autowired EntityManager entityManager;
    @AfterEach void clearSecurity(){SecurityContextHolder.clearContext();}

    @Test void completesClaimAssignmentClinicalProposalAndDecisionFlow()throws Exception{
        var created=cases.create(new CreateCaseRequest("Patient One","Kenya","+254700000001","Cardiac reports","en",true,null,"patient@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());
        entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());

        authenticate("coordinator-subject","COORDINATOR");journey.claimCoordinatorCase(created.caseId(),"cardiac-pod");
        long intakeVersion=journey.workspace(created.caseId()).caseSummary().version();
        var ready=journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",intakeVersion));assertThat(ready.status()).isEqualTo("READY_FOR_CONSULTANT");
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)",UUID.randomUUID(),"operations-subject","OPERATIONS",crypto.encrypt("Operations One"),Instant.now(),Instant.now());
        jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)",UUID.randomUUID(),"finance-subject","FINANCE",crypto.encrypt("Finance One"),Instant.now(),Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));

        authenticate("doctor-subject","DOCTOR");journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(),true);
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed records","SUITABLE",null,"Updated imaging","Recommended intervention","Medical management","Standard procedural risks","Assessment then intervention","7 days","Virtual follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());

        authenticate("coordinator-subject","COORDINATOR");var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Hospital and travel plan","USD","Clinical review and treatment","Complications and extra nights","Deposit before travel","Provider refund policy","Not procedure-specific consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Treatment package",BigDecimal.ONE,new BigDecimal("1000.00"),false,0)),"Coordinator note"));
        var operationsAssignment=journey.assign(created.caseId(),new AssignmentRequest("operations-subject","OPERATIONS","PRIMARY","cardiac-pod","Travel and hospital planning"));
        var financeAssignment=journey.assign(created.caseId(),new AssignmentRequest("finance-subject","FINANCE","PRIMARY","cardiac-pod","Commercial approval"));
        authenticate("operations-subject","OPERATIONS");journey.decideAssignment(created.caseId(),operationsAssignment.id(),true,com.rehletshifaa.security.ActorRole.OPERATIONS);proposal=journey.completeOperations(created.caseId(),proposal.versionId(),"Operational plan confirmed");assertThat(proposal.status()).isEqualTo("OPERATIONS_COMPLETED");
        authenticate("finance-subject","FINANCE");journey.decideAssignment(created.caseId(),financeAssignment.id(),true,com.rehletshifaa.security.ActorRole.FINANCE);proposal=journey.approveFinance(created.caseId(),proposal.versionId());assertThat(proposal.status()).isEqualTo("FINANCE_APPROVED");
        authenticate("coordinator-subject","COORDINATOR");proposal=journey.releaseProposal(created.caseId(),proposal.versionId());assertThat(proposal.status()).isEqualTo("RELEASED");
        authenticate("patient-subject","PATIENT");proposal=journey.decideProposal(created.caseId(),proposal.versionId(),new ProposalDecisionRequest("ACCEPTED",List.of(),"Approved"));assertThat(proposal.status()).isEqualTo("ACCEPTED");
        assertThat(journey.patientCases()).extracting(CaseView::status).contains("ACCEPTED");
    }

    private void authenticate(String subject,String role){Jwt jwt=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",Instant.now().getEpochSecond()).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,List.of(new SimpleGrantedAuthority("ROLE_"+role)),subject));}
}
