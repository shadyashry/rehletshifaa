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
import java.time.LocalDate;
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
        jdbc.update("UPDATE medical_cases SET travel_package_requested=true WHERE id=?",created.caseId()); // manual estimate + travel -> full ops+finance chain

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
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Consultant treatment package",new BigDecimal("1000.00"),"EGP",0,new BigDecimal("1000.00"),true);

        authenticate("coordinator-subject","COORDINATOR");var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Hospital and travel plan","EGP","Clinical review and treatment","Complications and extra nights","Deposit before travel","Provider refund policy","Not procedure-specific consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Treatment package",BigDecimal.ONE,new BigDecimal("1000.00"),false,0)),"Coordinator note"));
        assertThat(proposal.items()).singleElement().satisfies(item->assertThat(item.description()).isEqualTo("Consultant treatment package"));
        var operationsAssignment=journey.assign(created.caseId(),new AssignmentRequest("operations-subject","OPERATIONS","PRIMARY","cardiac-pod","Travel and hospital planning"));
        var financeAssignment=journey.assign(created.caseId(),new AssignmentRequest("finance-subject","FINANCE","PRIMARY","cardiac-pod","Commercial approval"));
        authenticate("operations-subject","OPERATIONS");journey.decideAssignment(created.caseId(),operationsAssignment.id(),true,com.rehletshifaa.security.ActorRole.OPERATIONS);proposal=journey.completeOperations(created.caseId(),proposal.versionId(),"Operational plan confirmed");assertThat(proposal.status()).isEqualTo("OPERATIONS_COMPLETED");
        authenticate("finance-subject","FINANCE");journey.decideAssignment(created.caseId(),financeAssignment.id(),true,com.rehletshifaa.security.ActorRole.FINANCE);proposal=journey.approveFinance(created.caseId(),proposal.versionId());assertThat(proposal.status()).isEqualTo("FINANCE_APPROVED");
        authenticate("coordinator-subject","COORDINATOR");proposal=journey.releaseProposal(created.caseId(),proposal.versionId());assertThat(proposal.status()).isEqualTo("RELEASED");
        authenticate("patient-subject","PATIENT");proposal=journey.decideProposal(created.caseId(),proposal.versionId(),new ProposalDecisionRequest("ACCEPTED",List.of(),"Approved"));assertThat(proposal.status()).isEqualTo("ACCEPTED");
        assertThat(journey.patientCases()).extracting(CaseView::status).contains("ACCEPTED");
    }

    @Test void fastLaneReleasesCatalogOnlyProposalWithoutOpsOrFinance()throws Exception{
        var created=cases.create(new CreateCaseRequest("Fast Patient","Kenya","+254700000099","Cardiac reports","en",true,null,"fast@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        // travel_package_requested stays false -> Operations not required.
        authenticate("coordinator-subject","COORDINATOR");journey.claimCoordinatorCase(created.caseId(),"cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",v));
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        UUID catalogId=UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",catalogId,practitionerId,"CARD-CONSULT","Diagnostic cardiology consultation","Consultation",new BigDecimal("3500.00"),true,"admin-subject",Instant.now(),Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject","DOCTOR");journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(),true);
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended intervention","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        // Catalog-sourced estimate -> no finance approval required.
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Diagnostic cardiology consultation",new BigDecimal("3500.00"),"EGP",0,catalogId,new BigDecimal("3500.00"),false);
        authenticate("coordinator-subject","COORDINATOR");
        var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Consultation only","EGP","Consultation","None","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Diagnostic cardiology consultation",BigDecimal.ONE,new BigDecimal("3500.00"),false,0)),null));
        // No Operations, no Finance: coordinator releases straight to the patient.
        proposal=journey.releaseProposal(created.caseId(),proposal.versionId());
        assertThat(proposal.status()).isEqualTo("RELEASED");
        assertThat(journey.workspace(created.caseId()).caseSummary().status()).isEqualTo("PATIENT_DECISION");
    }

    @Test void proposalConvertsEgpBaseToDisplayCurrencyAndFreezesAtRelease()throws Exception{
        var created=cases.create(new CreateCaseRequest("FX Patient","Kuwait","+96500000010","Cardiac reports","en",true,null,"fx@local.test","Asia/Kuwait","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        authenticate("coordinator-subject","COORDINATOR");journey.claimCoordinatorCase(created.caseId(),"cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",v));
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        UUID catalogId=UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",catalogId,practitionerId,"CARD-CONSULT","Diagnostic cardiology consultation","Consultation",new BigDecimal("3500.00"),true,"admin-subject",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO fx_rates(id,base_currency,quote_currency,rate,rate_date,source,fetched_at) VALUES(?,?,?,?,?,?,?)",UUID.randomUUID(),"EGP","USD",new BigDecimal("0.02"),LocalDate.now(),"API",Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject","DOCTOR");journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(),true);
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended intervention","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Consultation",new BigDecimal("3500.00"),"EGP",0,catalogId,new BigDecimal("3500.00"),false);
        authenticate("coordinator-subject","COORDINATOR");
        var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Consultation only","USD","Consultation","None","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Consultation",BigDecimal.ONE,new BigDecimal("3500.00"),false,0)),null));
        assertThat(proposal.currency()).isEqualTo("USD");
        assertThat(proposal.items()).singleElement().satisfies(i->assertThat(i.unitPrice()).isEqualByComparingTo("70.00")); // 3500 EGP * 0.02
        proposal=journey.releaseProposal(created.caseId(),proposal.versionId());
        assertThat(proposal.status()).isEqualTo("RELEASED");
        assertThat(proposal.items()).singleElement().satisfies(i->assertThat(i.unitPrice()).isEqualByComparingTo("70.00")); // frozen at the release rate
    }

    @Test void manualNoTravelRequiresFinanceFromClinicallyApprovedAndGatesReflectIt()throws Exception{
        var created=cases.create(new CreateCaseRequest("Manual Patient","Kenya","+254700000055","Cardiac reports","en",true,null,"m@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        // travel stays false -> Operations not required.
        authenticate("coordinator-subject","COORDINATOR");journey.claimCoordinatorCase(created.caseId(),"cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",v));
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)",UUID.randomUUID(),"finance-subject","FINANCE",crypto.encrypt("Finance One"),Instant.now(),Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject","DOCTOR");journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(),true);
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended intervention","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        // MANUAL (non-catalog) estimate -> requires finance approval.
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Custom hybrid procedure",new BigDecimal("5000.00"),"EGP",0,new BigDecimal("5000.00"),true);
        authenticate("coordinator-subject","COORDINATOR");
        var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Plan","EGP","Incl","Excl","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Custom hybrid procedure",BigDecimal.ONE,new BigDecimal("5000.00"),false,0)),null));
        var ws=journey.workspace(created.caseId());
        assertThat(ws.gates().operationsRequired()).isFalse();
        assertThat(ws.gates().financeRequired()).isTrue();
        assertThat(ws.gates().financeCompleted()).isFalse();
        assertThat(ws.gates().readyForRelease()).isFalse();
        // Finance approves directly from CLINICALLY_APPROVED (no Operations step).
        var financeAssignment=journey.assign(created.caseId(),new AssignmentRequest("finance-subject","FINANCE","PRIMARY","cardiac-pod","Commercial approval"));
        authenticate("finance-subject","FINANCE");journey.decideAssignment(created.caseId(),financeAssignment.id(),true,com.rehletshifaa.security.ActorRole.FINANCE);journey.approveFinance(created.caseId(),proposal.versionId());
        authenticate("coordinator-subject","COORDINATOR");ws=journey.workspace(created.caseId());
        assertThat(ws.gates().financeCompleted()).isTrue();
        assertThat(ws.gates().readyForRelease()).isTrue();
    }

    private void authenticate(String subject,String role){Jwt jwt=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",Instant.now().getEpochSecond()).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,List.of(new SimpleGrantedAuthority("ROLE_"+role)),subject));}
}
