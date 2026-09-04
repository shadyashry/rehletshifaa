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
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@Transactional
class JourneyServiceIntegrationTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto; @Autowired EntityManager entityManager; @Autowired PaymentService payment;
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

    @Test void acknowledgementCreatesDepositIdempotentAndAuthorizedPayments()throws Exception{
        var created=cases.create(new CreateCaseRequest("Deposit Patient","Kenya","+254700000092","Cardiac reports","en",true,null,"dep@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        authenticate("coordinator-subject","COORDINATOR");journey.claimCoordinatorCase(created.caseId(),"cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",v));
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        UUID catalogId=UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",catalogId,practitionerId,"CARD-CONSULT","Consultation","Consultation",new BigDecimal("3500.00"),true,"admin-subject",Instant.now(),Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject","DOCTOR");journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(),true);
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Consultation",new BigDecimal("3500.00"),"EGP",0,catalogId,new BigDecimal("3500.00"),false);
        authenticate("coordinator-subject","COORDINATOR");
        var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Consultation","EGP","Incl","Excl","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Consultation",BigDecimal.ONE,new BigDecimal("3500.00"),false,0)),null));
        journey.releaseProposal(created.caseId(),proposal.versionId());
        // Patient acknowledges the preliminary estimate -> deposit created from the default 3000 EGP policy.
        authenticate("patient-subject","PATIENT");
        journey.decideProposal(created.caseId(),proposal.versionId(),new ProposalDecisionRequest("ACCEPTED",List.of(),"Acknowledged"));
        var deposit=payment.depositForCase(created.caseId());
        assertThat(deposit).isNotNull();
        assertThat(deposit.totalEgp()).isEqualByComparingTo("3000.00");
        assertThat(deposit.status()).isEqualTo("REQUESTED");
        // #21: a non-Finance actor cannot record a receipt.
        authenticate("coordinator-subject","COORDINATOR");
        assertThatThrownBy(()->payment.recordReceipt(created.caseId(),deposit.id(),new RecordReceiptRequest(new BigDecimal("3000.00"),"BANK","ref1","idem-1"))).isInstanceOf(com.rehletshifaa.shared.api.ApiException.class);
        // Finance records the receipt (recent auth) -> PAID.
        authenticate("finance-subject","FINANCE");
        assertThat(payment.recordReceipt(created.caseId(),deposit.id(),new RecordReceiptRequest(new BigDecimal("3000.00"),"BANK","ref1","idem-1")).status()).isEqualTo("PAID");
        // #20: replaying the same idempotency key records no second payment.
        assertThat(payment.recordReceipt(created.caseId(),deposit.id(),new RecordReceiptRequest(new BigDecimal("3000.00"),"BANK","ref1","idem-1")).status()).isEqualTo("PAID");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM payment_events WHERE deposit_id=? AND event_type='PAYMENT_RECORDED'",Integer.class,deposit.id())).isEqualTo(1);
    }

    @Test void resendRefreshesLinkWithoutNewVersionOrTransition()throws Exception{
        var created=cases.create(new CreateCaseRequest("Resend Patient","Kenya","+254700000091","Cardiac reports","en",true,null,"rs@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        authenticate("coordinator-subject","COORDINATOR");journey.claimCoordinatorCase(created.caseId(),"cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",v));
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        UUID catalogId=UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",catalogId,practitionerId,"CARD-CONSULT","Consultation","Consultation",new BigDecimal("3500.00"),true,"admin-subject",Instant.now(),Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject","DOCTOR");journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(),true);
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Consultation",new BigDecimal("3500.00"),"EGP",0,catalogId,new BigDecimal("3500.00"),false);
        authenticate("coordinator-subject","COORDINATOR");
        var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Consultation","EGP","Incl","Excl","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Consultation",BigDecimal.ONE,new BigDecimal("3500.00"),false,0)),null));
        UUID versionId=proposal.versionId();
        journey.releaseProposal(created.caseId(),versionId);
        assertThat(journey.workspace(created.caseId()).caseSummary().status()).isEqualTo("PATIENT_DECISION");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_outbox WHERE idempotency_key=?",Integer.class,"proposal-ready:"+versionId)).isEqualTo(1); // #22 exactly one
        UUID shareId=jdbc.queryForObject("SELECT id FROM proposal_share_tokens WHERE proposal_version_id=? AND revoked_at IS NULL AND consumed_at IS NULL",UUID.class,versionId);
        jdbc.update("INSERT INTO proposal_access_challenges(id,share_token_id,proposal_version_id,case_id,code_hash,delivery_channel,destination_hint,expires_at,attempts,max_attempts,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),shareId,versionId,created.caseId(),"hash","EMAIL","r***@x",Instant.now().plusSeconds(600),0,5,Instant.now());
        int versionsBefore=jdbc.queryForObject("SELECT count(*) FROM proposal_versions pv JOIN proposals p ON p.id=pv.proposal_id WHERE p.case_id=?",Integer.class,created.caseId());
        journey.resendProposalLink(created.caseId(),versionId);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM proposal_versions pv JOIN proposals p ON p.id=pv.proposal_id WHERE p.case_id=?",Integer.class,created.caseId())).isEqualTo(versionsBefore); // #23 no new version
        assertThat(journey.workspace(created.caseId()).caseSummary().status()).isEqualTo("PATIENT_DECISION"); // #23 no transition
        assertThat(jdbc.queryForObject("SELECT count(*) FROM proposal_access_challenges WHERE proposal_version_id=? AND revoked_at IS NOT NULL",Integer.class,versionId)).isEqualTo(1); // #24 old challenge revoked
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification_outbox WHERE idempotency_key LIKE ?",Integer.class,"proposal-ready:resend:"+versionId+":%")).isEqualTo(1); // one resend job
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
        jdbc.update("INSERT INTO fx_rates(id,base_currency,quote_currency,rate,rate_date,source,fetched_at) VALUES(?,?,?,?,?,?,?)",UUID.randomUUID(),"EGP","USD",new BigDecimal("0.02"),LocalDate.now(java.time.ZoneOffset.UTC),"API",Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject","DOCTOR");journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(),true);
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended intervention","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Consultation",new BigDecimal("3500.00"),"EGP",0,catalogId,new BigDecimal("3500.00"),false);
        authenticate("coordinator-subject","COORDINATOR");
        var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Consultation only","USD","Consultation","None","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Consultation",BigDecimal.ONE,new BigDecimal("3500.00"),false,0)),null));
        assertThat(proposal.currency()).isEqualTo("USD");
        assertThat(proposal.items()).singleElement().satisfies(i->assertThat(i.unitPrice()).isEqualByComparingTo("78.40")); // 3500 EGP * 1.12 margin * 0.02 fx
        proposal=journey.releaseProposal(created.caseId(),proposal.versionId());
        assertThat(proposal.status()).isEqualTo("RELEASED");
        assertThat(proposal.items()).singleElement().satisfies(i->assertThat(i.unitPrice()).isEqualByComparingTo("78.40")); // frozen: 3500 * 1.12 * 0.02
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

    @Test void appliesCentralMarginPolicyDeterministicallyAndSnapshotsIt()throws Exception{
        var created=cases.create(new CreateCaseRequest("Margin Patient","Kenya","+254700000077","Cardiac reports","en",true,null,"mg@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        authenticate("coordinator-subject","COORDINATOR");journey.claimCoordinatorCase(created.caseId(),"cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",v));
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        UUID catalogId=UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",catalogId,practitionerId,"CARD-CONSULT","Consultation","Consultation",new BigDecimal("10000.00"),true,"admin-subject",Instant.now(),Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject","DOCTOR");journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(),true);
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended intervention","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,price_egp_min,price_egp_max,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Consultation",new BigDecimal("10000.00"),"EGP",0,catalogId,new BigDecimal("10000.00"),new BigDecimal("10000.00"),new BigDecimal("10000.00"),false);
        authenticate("coordinator-subject","COORDINATOR");
        journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Consultation only","EGP","Consultation","None","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Consultation",BigDecimal.ONE,new BigDecimal("10000.00"),false,0)),null));
        // Seeded default policy is 12%: patient inclusive expected = 10000 * 1.12 = 11200; margin held internally.
        var pv=jdbc.queryForMap("SELECT provider_net_egp,margin_rate,margin_amount_egp,patient_total_expected_egp,commercial_policy_id FROM proposal_versions WHERE clinical_review_id=? ORDER BY version_number DESC LIMIT 1",review.id());
        assertThat(new BigDecimal(pv.get("provider_net_egp").toString())).isEqualByComparingTo("10000.00");
        assertThat(new BigDecimal(pv.get("margin_rate").toString())).isEqualByComparingTo("0.1200");
        assertThat(new BigDecimal(pv.get("margin_amount_egp").toString())).isEqualByComparingTo("1200.00");
        assertThat(new BigDecimal(pv.get("patient_total_expected_egp").toString())).isEqualByComparingTo("11200.00");
        assertThat(pv.get("commercial_policy_id")).isNotNull();
        // The patient-facing item price is the inclusive amount (margin baked in), not the provider price.
        var proposal=journey.workspace(created.caseId()).proposal();
        assertThat(proposal.items()).singleElement().satisfies(i->assertThat(i.unitPrice()).isEqualByComparingTo("11200.00"));
    }

    private UUID arriveWithDoctor(String name,String phone,String email)throws Exception{
        var created=cases.create(new CreateCaseRequest(name,"Kenya",phone,"Cardiac reports","en",true,null,email,"Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,version) VALUES(?,?,?,?,?,?,?,?,?,0)",UUID.randomUUID(),created.caseId(),"doctor-subject","DOCTOR","PRIMARY","ACTIVE","Treatment","coordinator-subject",Instant.now());
        jdbc.update("UPDATE medical_cases SET status='ARRIVAL_CONFIRMED' WHERE id=?",created.caseId());
        return created.caseId();
    }

    @Test void treatmentRequiresProcedureConsentThenSucceeds()throws Exception{
        UUID caseId=arriveWithDoctor("Consent Patient","+254700000088","cn@local.test");
        authenticate("doctor-subject","DOCTOR");
        var episode=new TreatmentRequest("Cairo Heart",null,Instant.now(),null,"IN_PROGRESS","Angioplasty",null,null,null,false,null);
        assertThatThrownBy(()->journey.treatment(caseId,episode)).isInstanceOf(com.rehletshifaa.shared.api.ApiException.class).hasMessageContaining("consent");
        journey.captureProcedureConsent(caseId,new ProcedureConsentRequest("The treating doctor explained the procedure, risks and alternatives; I consent.","en","v1",null,null,"Provider consent ref #123"));
        var result=journey.treatment(caseId,new TreatmentRequest("Cairo Heart",null,Instant.now(),null,"IN_PROGRESS","Angioplasty",null,null,null,false,null));
        assertThat(result.status()).isEqualTo("IN_PROGRESS");
    }

    @Test void emergencyOverrideAllowsTreatmentAndCreatesReviewTask()throws Exception{
        UUID caseId=arriveWithDoctor("Emergency Patient","+254700000089","em@local.test");
        authenticate("doctor-subject","DOCTOR");
        journey.emergencyOverride(caseId,new EmergencyOverrideRequest("Acute STEMI — immediate primary PCI required"));
        var result=journey.treatment(caseId,new TreatmentRequest("Cairo Heart",null,Instant.now(),null,"IN_PROGRESS","Primary PCI",null,null,null,false,null));
        assertThat(result.status()).isEqualTo("IN_PROGRESS");
        Integer reviewTasks=jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='EMERGENCY_OVERRIDE_REVIEW'",Integer.class,caseId);
        assertThat(reviewTasks).isEqualTo(1);
    }

    @Test void finalQuoteStaysAtArrivalConfirmedAndReducesWithScope()throws Exception{
        var created=cases.create(new CreateCaseRequest("Final Patient","Kenya","+254700000090","Cardiac reports","en",true,null,"fq2@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        authenticate("coordinator-subject","COORDINATOR");journey.claimCoordinatorCase(created.caseId(),"cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",v));
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        UUID svc1=UUID.randomUUID();UUID svc2=UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",svc1,practitionerId,"CARD-CONSULT","Consultation","Consultation",new BigDecimal("10000.00"),true,"admin-subject",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",svc2,practitionerId,"CARD-ECHO","Echo","Diagnostics",new BigDecimal("5000.00"),true,"admin-subject",Instant.now(),Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject","DOCTOR");journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(),true);
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        // Preliminary scope: two catalog services (15000 provider -> 16800 inclusive at 12%).
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,price_egp_min,price_egp_max,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Consultation",new BigDecimal("10000.00"),"EGP",0,svc1,new BigDecimal("10000.00"),new BigDecimal("10000.00"),new BigDecimal("10000.00"),false);
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,price_egp_min,price_egp_max,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Echo",new BigDecimal("5000.00"),"EGP",1,svc2,new BigDecimal("5000.00"),new BigDecimal("5000.00"),new BigDecimal("5000.00"),false);
        authenticate("coordinator-subject","COORDINATOR");
        journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Plan","EGP","Incl","Excl","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Consultation",BigDecimal.ONE,new BigDecimal("10000.00"),false,0)),null));
        jdbc.update("UPDATE medical_cases SET status='ARRIVAL_CONFIRMED' WHERE id=?",created.caseId()); // patient arrived (details are a separate sub-workflow)
        // Doctor's physical assessment reduces scope to one service.
        authenticate("doctor-subject","DOCTOR");
        var finalReview=journey.saveFinalAssessment(created.caseId(),new FinalAssessmentRequest("Single procedure confirmed","Standard risks",List.of(new CostEstimateItem("Consultation",new BigDecimal("10000.00"),"EGP",svc1))));
        authenticate("coordinator-subject","COORDINATOR");
        var fq=journey.createFinalQuote(created.caseId(),new FinalQuoteRequest(finalReview.id(),"EGP","Second procedure no longer indicated after examination","Excl","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),null));
        var pv=jdbc.queryForMap("SELECT document_type,patient_total_expected_egp,margin_amount_egp,margin_rate FROM proposal_versions WHERE id=?",fq.versionId());
        assertThat(pv.get("document_type")).isEqualTo("FINAL_TREATMENT_QUOTE");
        assertThat(new BigDecimal(pv.get("patient_total_expected_egp").toString())).isEqualByComparingTo("11200.00"); // 10000 * 1.12 (< 16800 preliminary)
        assertThat(new BigDecimal(pv.get("margin_amount_egp").toString())).isEqualByComparingTo("1200.00");           // < 1800 preliminary
        assertThat(new BigDecimal(pv.get("margin_rate").toString())).isEqualByComparingTo("0.1200");                  // reused locked rate
        // #13: releasing the final quote does not move the macro case.
        fq=journey.releaseFinalQuote(created.caseId(),fq.versionId());
        assertThat(fq.status()).isEqualTo("RELEASED");
        assertThat(journey.workspace(created.caseId()).caseSummary().status()).isEqualTo("ARRIVAL_CONFIRMED");
        // #14: the patient's final decision does not move the macro case.
        authenticate("patient-subject","PATIENT");
        journey.decideProposal(created.caseId(),fq.versionId(),new ProposalDecisionRequest("ACCEPTED",List.of(),"Accepted final plan"));
        assertThat(journey.workspace(created.caseId()).caseSummary().status()).isEqualTo("ARRIVAL_CONFIRMED");
    }

    private void authenticate(String subject,String role){Jwt jwt=Jwt.withTokenValue("test").header("alg","none").subject(subject).claim("auth_time",Instant.now().getEpochSecond()).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,List.of(new SimpleGrantedAuthority("ROLE_"+role)),subject));}
}
