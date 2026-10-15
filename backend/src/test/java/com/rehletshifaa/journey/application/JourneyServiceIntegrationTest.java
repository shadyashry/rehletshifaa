package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.api.CaseDtos.NewCaseForPatientRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@AutoConfigureMockMvc
@Transactional
class JourneyServiceIntegrationTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto; @Autowired EntityManager entityManager; @Autowired PaymentService payment; @Autowired MockMvc mvc;
    /** P0-5: treatment records name a facility record; an active one seeded straight into the table. */
    private UUID facility(){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO facilities(id,name,city,kind,status,accreditation_status,settlement_terms,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,"Cairo Heart "+id,"Cairo","HOSPITAL","ACTIVE","NONE","NET_30","test",Instant.now(),"test",Instant.now());return id;}
    @Autowired com.rehletshifaa.journey.application.ConsultantOnboardingService onboarding;
    @Autowired CommercialPolicyService commercialPolicies;
    @Autowired CaseExitService exits;
    @AfterEach void clearSecurity(){SecurityContextHolder.clearContext();}

    @Test void credentialDecisionRequiresIndependentReviewerEvenForSystemAdministrators() {
        UUID practitioner=UUID.randomUUID(), credential=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                practitioner,"self-reviewer","Reviewer","Reviewer","UNDER_REVIEW","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",
                credential,practitioner,"LICENSE","UNDER_REVIEW",Instant.now().plusSeconds(86400),Instant.now());
        // SOD-08: System Administrator authority never reaches credential decisions.
        authenticate("self-reviewer",Role.SYSTEM_ADMINISTRATOR);
        assertThatThrownBy(()->onboarding.verifyPractitioner(practitioner,true,"Review decision"))
                .isInstanceOf(com.rehletshifaa.shared.api.ApiException.class).hasMessageContaining("do not include this action");
        authenticate("self-reviewer", Role.SYSTEM_ADMINISTRATOR, Role.CREDENTIAL_VERIFIER);
        for(boolean approved:List.of(true,false))
            assertThatThrownBy(()->onboarding.verifyPractitioner(practitioner,approved,"Review decision"))
                    .isInstanceOf(com.rehletshifaa.shared.api.ApiException.class).hasMessageContaining("cannot decide this review");
        assertThat(jdbc.queryForObject("SELECT status FROM practitioner_credentials WHERE id=?",String.class,credential)).isEqualTo("UNDER_REVIEW");
        authenticate("independent-reviewer",Role.CREDENTIAL_VERIFIER);
        assertThat(onboarding.verifyPractitioner(practitioner,true,"Independent review").status()).isEqualTo("VERIFIED");
        assertThat(jdbc.queryForObject("SELECT verified_by FROM practitioner_credentials WHERE id=?",String.class,credential)).isEqualTo("independent-reviewer");
    }

    @Test void completesClaimAssignmentClinicalProposalAndDecisionFlow()throws Exception{
        var created=cases.create(new CreateCaseRequest("Patient", "One","Kenya","+254700000001","Cardiac reports","en",true,null,"patient@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());
        entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        jdbc.update("UPDATE medical_cases SET travel_package_requested=true WHERE id=?",created.caseId()); // manual estimate + travel -> full ops+finance chain

        authenticate("coordinator-subject",Role.COORDINATOR);com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(), "cardiac-pod");
        long intakeVersion=journey.workspace(created.caseId()).caseSummary().version();
        var ready=journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",intakeVersion));assertThat(ready.status()).isEqualTo("READY_FOR_CONSULTANT");
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "operations-subject", "OPERATIONS", crypto.encrypt("Operations One"));
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "finance-subject", "FINANCE", crypto.encrypt("Finance One"));
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));

        authenticate("doctor-subject",Role.CONSULTANT);journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(), new AssignmentDecisionRequest(true,null));
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed records","SUITABLE",null,"Updated imaging","Recommended intervention","Medical management","Standard procedural risks","Assessment then intervention","7 days","Virtual follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Consultant treatment package",new BigDecimal("1000.00"),"EGP",0,new BigDecimal("1000.00"),true);

        authenticate("coordinator-subject",Role.COORDINATOR);var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Hospital and travel plan","EGP","Clinical review and treatment","Complications and extra nights","Deposit before travel","Provider refund policy","Not procedure-specific consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Treatment package",BigDecimal.ONE,new BigDecimal("1000.00"),false,0)),"Coordinator note"));
        UUID proposalVersionId=proposal.versionId();
        assertThat(proposal.items()).extracting(ProposalItemView::description).containsExactly("Consultant treatment package","Coordination and guarantee fee"); // P1-10: the fee is its own last line
        var operationsAssignment=journey.assign(created.caseId(),new AssignmentRequest("operations-subject","OPERATIONS","PRIMARY","cardiac-pod","Travel and hospital planning"));
        var financeAssignment=journey.assign(created.caseId(),new AssignmentRequest("finance-subject","FINANCE","PRIMARY","cardiac-pod","Commercial approval"));
        authenticate("operations-subject",Role.OPERATIONS);journey.decideAssignment(created.caseId(),operationsAssignment.id(), new AssignmentDecisionRequest(true,null), com.rehletshifaa.authority.domain.Role.OPERATIONS);
        assertThat(journey.workspace(created.caseId()).actions().availableActions()).contains("PREPARE_TRAVEL_PACKAGE");
        authenticate("finance-subject",Role.FINANCE);journey.decideAssignment(created.caseId(),financeAssignment.id(), new AssignmentDecisionRequest(true,null), com.rehletshifaa.authority.domain.Role.FINANCE);
        // Direct POST cannot bypass the same current business preconditions that kept the action absent.
        assertThat(journey.workspace(created.caseId()).actions().availableActions()).doesNotContain("APPROVE_COMMERCIAL_TERMS");
        mvc.perform(post("/api/v1/finance/cases/{caseId}/proposals/{versionId}/approve", created.caseId(), proposalVersionId)
                        .with(jwt().jwt(token -> token.subject("finance-subject").claim("auth_time", Instant.now().getEpochSecond()).claim("acr", "3"))
                                .authorities(new SimpleGrantedAuthority("ROLE_FINANCE"))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("OPERATIONS_REQUIRED_FIRST"));
        authenticate("operations-subject",Role.OPERATIONS);proposal=journey.completeOperations(created.caseId(),proposal.versionId(),"Operational plan confirmed");assertThat(proposal.status()).isEqualTo("OPERATIONS_COMPLETED");
        authenticate("finance-subject",Role.FINANCE);assertThat(journey.workspace(created.caseId()).actions().availableActions()).contains("APPROVE_COMMERCIAL_TERMS");
        UUID approvedVersionId=proposal.versionId();proposal=journey.approveFinance(created.caseId(),approvedVersionId);assertThat(proposal.status()).isEqualTo("FINANCE_APPROVED");
        // A once-valid action is stale after the transition; the endpoint revalidates and rejects it.
        mvc.perform(post("/api/v1/finance/cases/{caseId}/proposals/{versionId}/approve", created.caseId(), approvedVersionId)
                        .with(jwt().jwt(token -> token.subject("finance-subject").claim("auth_time", Instant.now().getEpochSecond()).claim("acr", "3"))
                                .authorities(new SimpleGrantedAuthority("ROLE_FINANCE"))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CASE_STATE_CONFLICT"));
        authenticate("coordinator-subject",Role.COORDINATOR);proposal=journey.releaseProposal(created.caseId(),proposal.versionId());assertThat(proposal.status()).isEqualTo("RELEASED");
        authenticate("patient-subject",Role.PATIENT);proposal=journey.decideProposal(created.caseId(),proposal.versionId(),new ProposalDecisionRequest("ACCEPTED",List.of(),"Approved"));assertThat(proposal.status()).isEqualTo("ACCEPTED");
        assertThat(journey.patientCases()).extracting(CaseView::status).contains("ACCEPTED");
    }

    @Test void fastLaneReleasesCatalogOnlyProposalWithoutOpsOrFinance()throws Exception{
        var created=cases.create(new CreateCaseRequest("Fast", "Patient","Kenya","+254700000099","Cardiac reports","en",true,null,"fast@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        // travel_package_requested stays false -> Operations not required.
        authenticate("coordinator-subject",Role.COORDINATOR);com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(), "cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",v));
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        UUID catalogId=UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",catalogId,practitionerId,"CARD-CONSULT","Diagnostic cardiology consultation","Consultation",new BigDecimal("3500.00"),true,"admin-subject",Instant.now(),Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject",Role.CONSULTANT);journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(), new AssignmentDecisionRequest(true,null));
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended intervention","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        // Catalog-sourced estimate -> no finance approval required.
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Diagnostic cardiology consultation",new BigDecimal("3500.00"),"EGP",0,catalogId,new BigDecimal("3500.00"),false);
        authenticate("coordinator-subject",Role.COORDINATOR);
        var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Consultation only","EGP","Consultation","None","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Diagnostic cardiology consultation",BigDecimal.ONE,new BigDecimal("3500.00"),false,0)),null));
        // No Operations, no Finance: coordinator releases straight to the patient.
        proposal=journey.releaseProposal(created.caseId(),proposal.versionId());
        assertThat(proposal.status()).isEqualTo("RELEASED");
        assertThat(journey.workspace(created.caseId()).caseSummary().status()).isEqualTo("PATIENT_DECISION");
    }

    @Test void acknowledgementCreatesDepositIdempotentAndAuthorizedPayments()throws Exception{
        var created=cases.create(new CreateCaseRequest("Deposit", "Patient","Kenya","+254700000092","Cardiac reports","en",true,null,"dep@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        authenticate("coordinator-subject",Role.COORDINATOR);com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(), "cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",v));
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        UUID catalogId=UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",catalogId,practitionerId,"CARD-CONSULT","Consultation","Consultation",new BigDecimal("3500.00"),true,"admin-subject",Instant.now(),Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject",Role.CONSULTANT);journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(), new AssignmentDecisionRequest(true,null));
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Consultation",new BigDecimal("3500.00"),"EGP",0,catalogId,new BigDecimal("3500.00"),false);
        authenticate("coordinator-subject",Role.COORDINATOR);
        var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Consultation","EGP","Incl","Excl","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Consultation",BigDecimal.ONE,new BigDecimal("3500.00"),false,0)),null));
        journey.releaseProposal(created.caseId(),proposal.versionId());
        // Patient ACKNOWLEDGES the preliminary estimate -> recorded as ACKNOWLEDGED, macro case ACCEPTED, deposit created.
        authenticate("patient-subject",Role.PATIENT);
        journey.decideProposal(created.caseId(),proposal.versionId(),new ProposalDecisionRequest("ACKNOWLEDGED",List.of(),"Acknowledged"));
        assertThat(journey.workspace(created.caseId()).caseSummary().status()).isEqualTo("ACCEPTED");
        assertThat(jdbc.queryForObject("SELECT decision FROM proposal_decisions WHERE proposal_version_id=?",String.class,proposal.versionId())).isEqualTo("ACKNOWLEDGED");
        var deposit=payment.depositForCase(created.caseId());
        assertThat(deposit).isNotNull();
        // W-1 + P0-4 (owner, 2026-10-14): 15% of the estimate the patient acknowledged, rounded up to the next EGP 100
        // (this fixture has no USD rate, so the dollar bounds do not apply: 603.75 -> 700).
        BigDecimal estimate=jdbc.queryForObject("SELECT patient_total_expected_egp FROM proposal_versions WHERE id=?",BigDecimal.class,proposal.versionId());
        BigDecimal share=estimate.multiply(new BigDecimal("0.15"));
        assertThat(deposit.totalEgp()).isEqualByComparingTo(share.divide(new BigDecimal("100"),0,java.math.RoundingMode.CEILING).multiply(new BigDecimal("100")));
        BigDecimal due=deposit.totalEgp();
        assertThat(deposit.status()).isEqualTo("REQUESTED");
        // DEP-3: without the patient's transfer reference there is nothing for Finance to confirm.
        authenticate("finance-subject",Role.FINANCE);
        assertThat(catchThrowableOfType(()->payment.recordReceipt(created.caseId(),deposit.id(),new RecordReceiptRequest(due,"idem-1")),
                com.rehletshifaa.shared.api.ApiException.class).code()).isEqualTo("TRANSFER_REFERENCE_REQUIRED");
        com.rehletshifaa.journey.DepositTestData.reportTransfer(jdbc,created.caseId(),"FT123456");
        // #21: a non-Finance actor cannot record a receipt.
        authenticate("coordinator-subject",Role.COORDINATOR);
        assertThatThrownBy(()->payment.recordReceipt(created.caseId(),deposit.id(),new RecordReceiptRequest(due,"idem-1"))).isInstanceOf(com.rehletshifaa.shared.api.ApiException.class);
        // Finance records the receipt (recent auth) -> PAID, against the patient's reference.
        authenticate("finance-subject",Role.FINANCE);
        var paid=payment.recordReceipt(created.caseId(),deposit.id(),new RecordReceiptRequest(due,"idem-1"));
        assertThat(paid.status()).isEqualTo("PAID");
        assertThat(paid.events()).filteredOn(e->"PAYMENT_RECORDED".equals(e.eventType())).singleElement().satisfies(e->{assertThat(e.providerReference()).isEqualTo("FT123456");assertThat(e.method()).isEqualTo("BANK_TRANSFER");});
        assertThat(paid.transfer().status()).isEqualTo("CONFIRMED");
        // #20: replaying the same idempotency key records no second payment.
        assertThat(payment.recordReceipt(created.caseId(),deposit.id(),new RecordReceiptRequest(due,"idem-1")).status()).isEqualTo("PAID");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM payment_events WHERE deposit_id=? AND event_type='PAYMENT_RECORDED'",Integer.class,deposit.id())).isEqualTo(1);
    }

    @Test void depositLedgerTracksPartialPaymentsAndRefundsAtTheQuotedRateAndPoliciesListDefaultFirst(){
        var created=cases.create(new CreateCaseRequest("Ledger", "Patient","Kenya","+254700000093","Cardiac reports","en",true,null,"ledger@local.test","Africa/Nairobi","cardiology"));
        UUID caseId=created.caseId();
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "finance-subject", "FINANCE", crypto.encrypt("Finance One"));
        // Owner, 2026-10-14: Finance reads the deposit rate; Finance Managers and System Administrators set it.
        authenticate("finance-subject",Role.FINANCE);
        assertThat(catchThrowableOfType(()->payment.configurePolicy(new DepositPolicyRequest(null,null,new BigDecimal("0.20"))),com.rehletshifaa.shared.api.ApiException.class).status()).isEqualTo(403);
        assertThat(catchThrowableOfType(()->commercialPolicies.configure(new CommercialPolicyRequest(null,null,new BigDecimal("0.20"))),com.rehletshifaa.shared.api.ApiException.class).status()).isEqualTo(403);
        authenticate("system-admin-subject",Role.SYSTEM_ADMINISTRATOR);
        payment.configurePolicy(new DepositPolicyRequest(null,null,new BigDecimal("0.15")));
        authenticate("finance-manager-subject",Role.FINANCE_MANAGER);
        assertThat(catchThrowableOfType(()->payment.configurePolicy(new DepositPolicyRequest(null,null,new BigDecimal("1.50"))),com.rehletshifaa.shared.api.ApiException.class).code()).isEqualTo("DEPOSIT_RATE_INVALID");
        payment.configurePolicy(new DepositPolicyRequest("Cardiology deposit","cardiology",new BigDecimal("0.20")));
        var current=payment.configurePolicy(new DepositPolicyRequest("Cardiology deposit","cardiology",new BigDecimal("0.25")));
        // P0-4: the dollar bounds are part of each revision, validated and kept as set.
        assertThat(catchThrowableOfType(()->payment.configurePolicy(new DepositPolicyRequest(null,null,new BigDecimal("0.15"),new BigDecimal("1600"),new BigDecimal("1500"))),com.rehletshifaa.shared.api.ApiException.class).code()).isEqualTo("DEPOSIT_BOUNDS_INVALID");
        var bounded=payment.configurePolicy(new DepositPolicyRequest(null,null,new BigDecimal("0.15"),new BigDecimal("200"),new BigDecimal("1500")));
        assertThat(bounded.minimumUsd()).isEqualByComparingTo("200");
        assertThat(bounded.maximumUsd()).isEqualByComparingTo("1500");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='DEPOSIT_POLICY_CONFIGURED' AND reason='rate=0.15; minUsd=200; maxUsd=1500'",Integer.class)).isEqualTo(1);
        // QA #22: a policy can be set for every managed care area, and only for one.
        assertThat(commercialPolicies.careAreas()).extracting(CareCategoryView::slug)
                .hasSize(jdbc.queryForObject("SELECT count(*) FROM care_categories",Integer.class)).contains("cardiology","womens-health","general-surgery");
        assertThat(catchThrowableOfType(()->payment.configurePolicy(new DepositPolicyRequest("Typo","cardiolgy",new BigDecimal("0.15"))),com.rehletshifaa.shared.api.ApiException.class).code()).isEqualTo("CARE_AREA_UNKNOWN");
        assertThat(catchThrowableOfType(()->commercialPolicies.configure(new CommercialPolicyRequest("Typo","cardiolgy",new BigDecimal("0.10"))),com.rehletshifaa.shared.api.ApiException.class).code()).isEqualTo("CARE_AREA_UNKNOWN");
        authenticate("finance-subject",Role.FINANCE);
        var listed=payment.listPolicies();
        int firstCareArea=(int)listed.stream().takeWhile(p->p.careCategory()==null).count();
        assertThat(listed.subList(firstCareArea,listed.size())).allSatisfy(p->assertThat(p.careCategory()).isNotNull());
        assertThat(listed.stream().filter(p->"cardiology".equals(p.careCategory())).toList())
                .extracting(DepositPolicyView::version,DepositPolicyView::active).startsWith(tuple(current.version(),true),tuple(current.version()-1,false));
        // No deposit and no estimate yet: one is required (the policy asks for 25%); its amount follows the estimate.
        assertThat(payment.depositForCase(caseId)).isNull();
        assertThat(payment.anticipatedCoordinationDepositEgp(caseId)).isEqualByComparingTo("0.00");
        assertThat(payment.depositStatusFor(caseId)).isEqualTo("REQUIRED");
        assertThat(payment.depositSatisfied(caseId)).isFalse();

        UUID depositId=UUID.randomUUID();
        entityManager.flush();
        jdbc.update("INSERT INTO deposits(id,case_id,currency,fx_rate,total_egp,total_display,status,created_at,version) VALUES(?,?,?,?,?,?,?,?,0)",
                depositId,caseId,"USD",new BigDecimal("0.02035"),new BigDecimal("3000.00"),new BigDecimal("61.05"),"REQUESTED",Instant.now());
        jdbc.update("INSERT INTO deposit_components(id,deposit_id,beneficiary,purpose,amount_egp,refundability,credited_to_final,sort_order) VALUES(?,?,?,?,?,?,?,?)",
                UUID.randomUUID(),depositId,"PLATFORM","Case coordination initiation",new BigDecimal("3000.00"),"NON_REFUNDABLE",true,0);
        // Finance on the case, at the deposit stage: payments are recorded on a case Finance may see (DEP-3).
        jdbc.update("UPDATE medical_cases SET status='ACCEPTED' WHERE id=?",caseId);
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                UUID.randomUUID(),caseId,"finance-subject","FINANCE","PRIMARY","ACTIVE","Ledger","coordinator-subject",Instant.now(),Instant.now());
        com.rehletshifaa.journey.DepositTestData.reportTransfer(jdbc,caseId,"FT-A");
        entityManager.clear();

        var partial=payment.recordReceipt(caseId,depositId,new RecordReceiptRequest(new BigDecimal("1234.56"),"ledger-a-"+caseId));
        assertThat(partial.status()).isEqualTo("PARTIALLY_PAID");
        assertThat(partial.currency()).isEqualTo("USD");
        assertThat(partial.paidDisplay()).isEqualByComparingTo("25.12");     // 1234.56 × 0.02035, half-up
        assertThat(partial.balanceDisplay()).isEqualByComparingTo("35.93");  // 1765.44 × 0.02035, half-up
        // QA W-26: Finance records in EGP, so the EGP paid and balance are on the deposit beside the patient's currency.
        assertThat(partial.paidEgp()).isEqualByComparingTo("1234.56");
        assertThat(partial.balanceEgp()).isEqualByComparingTo("1765.44");
        assertThat(partial.components()).singleElement().satisfies(c->assertThat(c.amountDisplay()).isEqualByComparingTo("61.05"));
        assertThat(partial.events()).singleElement().satisfies(e->{assertThat(e.amountDisplay()).isEqualByComparingTo("25.12");assertThat(e.currency()).isEqualTo("USD");});
        assertThat(payment.netPaidEgp(caseId)).isEqualByComparingTo("1234.56");
        assertThat(payment.anticipatedCoordinationDepositEgp(caseId)).isEqualByComparingTo("3000.00");
        assertThat(payment.depositStatusFor(caseId)).isEqualTo("PARTIALLY_PAID");

        com.rehletshifaa.journey.DepositTestData.reportTransfer(jdbc,caseId,"FT-B");
        assertThat(payment.recordReceipt(caseId,depositId,new RecordReceiptRequest(new BigDecimal("1765.44"),"ledger-b-"+caseId)).status()).isEqualTo("PAID");
        assertThat(payment.depositSatisfied(caseId)).isTrue();
        assertThat(payment.recordRefund(caseId,depositId,new RefundRequest(new BigDecimal("500.00"),"Partial refund","ledger-c-"+caseId)).status()).isEqualTo("PARTIALLY_PAID");
        var refunded=payment.recordRefund(caseId,depositId,new RefundRequest(new BigDecimal("2500.00"),"Full refund","ledger-d-"+caseId));
        assertThat(refunded.status()).isEqualTo("REFUNDED");
        assertThat(refunded.paidDisplay()).isEqualByComparingTo("0.00");
        assertThat(refunded.balanceDisplay()).isEqualByComparingTo("61.05");
        assertThat(refunded.events()).extracting(PaymentEventView::eventType).containsExactly("PAYMENT_RECORDED","PAYMENT_RECORDED","REFUND_RECORDED","REFUND_RECORDED");
        assertThat(payment.netPaidEgp(caseId)).isEqualByComparingTo("0");
        assertThatThrownBy(()->payment.recordReceipt(caseId,UUID.randomUUID(),new RecordReceiptRequest(BigDecimal.ONE,"ledger-x-"+caseId)))
                .isInstanceOf(com.rehletshifaa.shared.api.ApiException.class).hasMessageContaining("not found for this case");
    }

    @Test void resendRefreshesLinkWithoutNewVersionOrTransition()throws Exception{
        var created=cases.create(new CreateCaseRequest("Resend", "Patient","Kenya","+254700000091","Cardiac reports","en",true,null,"rs@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        authenticate("coordinator-subject",Role.COORDINATOR);com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(), "cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",v));
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        UUID catalogId=UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",catalogId,practitionerId,"CARD-CONSULT","Consultation","Consultation",new BigDecimal("3500.00"),true,"admin-subject",Instant.now(),Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject",Role.CONSULTANT);journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(), new AssignmentDecisionRequest(true,null));
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Consultation",new BigDecimal("3500.00"),"EGP",0,catalogId,new BigDecimal("3500.00"),false);
        authenticate("coordinator-subject",Role.COORDINATOR);
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
        var created=cases.create(new CreateCaseRequest("FX", "Patient","Kuwait","+96500000010","Cardiac reports","en",true,null,"fx@local.test","Asia/Kuwait","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        authenticate("coordinator-subject",Role.COORDINATOR);com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(), "cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",v));
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        UUID catalogId=UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",catalogId,practitionerId,"CARD-CONSULT","Diagnostic cardiology consultation","Consultation",new BigDecimal("3500.00"),true,"admin-subject",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO fx_rates(id,base_currency,quote_currency,rate,rate_date,source,fetched_at) VALUES(?,?,?,?,?,?,?)",UUID.randomUUID(),"EGP","USD",new BigDecimal("0.02"),LocalDate.now(java.time.ZoneOffset.UTC),"API",Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject",Role.CONSULTANT);journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(), new AssignmentDecisionRequest(true,null));
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended intervention","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Consultation",new BigDecimal("3500.00"),"EGP",0,catalogId,new BigDecimal("3500.00"),false);
        authenticate("coordinator-subject",Role.COORDINATOR);
        var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Consultation only","USD","Consultation","None","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Consultation",BigDecimal.ONE,new BigDecimal("3500.00"),false,0)),null));
        assertThat(proposal.currency()).isEqualTo("USD");
        // P1-10: 3500 EGP * 0.02 = 70.00 and the 15% fee 525 EGP * 0.02 = 10.50, together the 80.50 of the old markup.
        assertThat(proposal.items()).extracting(ProposalItemView::unitPrice).usingElementComparator(BigDecimal::compareTo).containsExactly(new BigDecimal("70.00"),new BigDecimal("10.50"));
        proposal=journey.releaseProposal(created.caseId(),proposal.versionId());
        assertThat(proposal.status()).isEqualTo("RELEASED");
        assertThat(proposal.items()).extracting(ProposalItemView::unitPrice).usingElementComparator(BigDecimal::compareTo).containsExactly(new BigDecimal("70.00"),new BigDecimal("10.50")); // frozen at 0.02
    }

    @Test void manualNoTravelRequiresFinanceFromClinicallyApprovedAndGatesReflectIt()throws Exception{
        var created=cases.create(new CreateCaseRequest("Manual", "Patient","Kenya","+254700000055","Cardiac reports","en",true,null,"m@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        // travel stays false -> Operations not required.
        authenticate("coordinator-subject",Role.COORDINATOR);com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(), "cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",v));
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "finance-subject", "FINANCE", crypto.encrypt("Finance One"));
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject",Role.CONSULTANT);journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(), new AssignmentDecisionRequest(true,null));
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended intervention","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        // MANUAL (non-catalog) estimate -> requires finance approval.
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Custom hybrid procedure",new BigDecimal("5000.00"),"EGP",0,new BigDecimal("5000.00"),true);
        authenticate("coordinator-subject",Role.COORDINATOR);
        var proposal=journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Plan","EGP","Incl","Excl","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Custom hybrid procedure",BigDecimal.ONE,new BigDecimal("5000.00"),false,0)),null));
        var ws=journey.workspace(created.caseId());
        assertThat(ws.gates().operationsRequired()).isFalse();
        assertThat(ws.gates().financeRequired()).isTrue();
        assertThat(ws.gates().financeCompleted()).isFalse();
        assertThat(ws.gates().readyForRelease()).isFalse();
        // Finance approves directly from CLINICALLY_APPROVED (no Operations step).
        var financeAssignment=journey.assign(created.caseId(),new AssignmentRequest("finance-subject","FINANCE","PRIMARY","cardiac-pod","Commercial approval"));
        authenticate("finance-subject",Role.FINANCE);journey.decideAssignment(created.caseId(),financeAssignment.id(), new AssignmentDecisionRequest(true,null), com.rehletshifaa.authority.domain.Role.FINANCE);journey.approveFinance(created.caseId(),proposal.versionId());
        authenticate("coordinator-subject",Role.COORDINATOR);ws=journey.workspace(created.caseId());
        assertThat(ws.gates().financeCompleted()).isTrue();
        assertThat(ws.gates().readyForRelease()).isTrue();
    }

    @Test void appliesCentralMarginPolicyDeterministicallyAndSnapshotsIt()throws Exception{
        var created=cases.create(new CreateCaseRequest("Margin", "Patient","Kenya","+254700000077","Cardiac reports","en",true,null,"mg@local.test","Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        authenticate("coordinator-subject",Role.COORDINATOR);com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(), "cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",v));
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        UUID catalogId=UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",catalogId,practitionerId,"CARD-CONSULT","Consultation","Consultation",new BigDecimal("10000.00"),true,"admin-subject",Instant.now(),Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject",Role.CONSULTANT);journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(), new AssignmentDecisionRequest(true,null));
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended intervention","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,price_egp_min,price_egp_max,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Consultation",new BigDecimal("10000.00"),"EGP",0,catalogId,new BigDecimal("10000.00"),new BigDecimal("10000.00"),new BigDecimal("10000.00"),false);
        authenticate("coordinator-subject",Role.COORDINATOR);
        journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Consultation only","EGP","Consultation","None","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Consultation",BigDecimal.ONE,new BigDecimal("10000.00"),false,0)),null));
        // Default policy is 15% (owner, 2026-10-14): patient inclusive expected = 10000 * 1.15 = 11500; margin held internally.
        var pv=jdbc.queryForMap("SELECT provider_net_egp,margin_rate,margin_amount_egp,patient_total_expected_egp,commercial_policy_id FROM proposal_versions WHERE clinical_review_id=? ORDER BY version_number DESC LIMIT 1",review.id());
        assertThat(new BigDecimal(pv.get("provider_net_egp").toString())).isEqualByComparingTo("10000.00");
        assertThat(new BigDecimal(pv.get("margin_rate").toString())).isEqualByComparingTo("0.1500");
        assertThat(new BigDecimal(pv.get("margin_amount_egp").toString())).isEqualByComparingTo("1500.00");
        assertThat(new BigDecimal(pv.get("patient_total_expected_egp").toString())).isEqualByComparingTo("11500.00");
        assertThat(pv.get("commercial_policy_id")).isNotNull();
        // P1-10 (D-A): the medical line carries the provider's own price and the margin is the disclosed coordination and guarantee fee.
        var proposal=journey.workspace(created.caseId()).proposal();
        assertThat(proposal.items()).extracting(ProposalItemView::category).containsExactly("MEDICAL","PLATFORM_FEE");
        assertThat(proposal.items()).extracting(ProposalItemView::unitPrice).usingElementComparator(BigDecimal::compareTo).containsExactly(new BigDecimal("10000.00"),new BigDecimal("1500.00"));
    }

    private UUID arriveWithDoctor(String name,String phone,String email)throws Exception{
        var created=cases.create(new CreateCaseRequest(name,"Patient","Kenya",phone,"Cardiac reports","en",true,null,email,"Africa/Nairobi","cardiology"));
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
        authenticate("doctor-subject",Role.CONSULTANT);
        var episode=new TreatmentRequest(facility(),null,Instant.now(),null,"IN_PROGRESS","Angioplasty",null,null,null,false,null,"ADM-1");
        assertThatThrownBy(()->journey.treatment(caseId,episode)).isInstanceOf(com.rehletshifaa.shared.api.ApiException.class).hasMessageContaining("consent");
        journey.captureProcedureConsent(caseId,new ProcedureConsentRequest("The treating doctor explained the procedure, risks and alternatives; I consent.","en","v1",null,null,"Provider consent ref #123"));
        // P1-15 (D-C): consent alone does not open treatment; the balance must be evidenced first.
        assertThatThrownBy(()->journey.treatment(caseId,episode)).isInstanceOf(com.rehletshifaa.shared.api.ApiException.class).extracting("code").isEqualTo("BALANCE_EVIDENCE_REQUIRED");
        clearedToAdmit(caseId);
        var result=journey.treatment(caseId,new TreatmentRequest(facility(),null,Instant.now(),null,"IN_PROGRESS","Angioplasty",null,null,null,false,null,"ADM-1"));
        assertThat(result.status()).isEqualTo("IN_PROGRESS");
    }

    @Test void emergencyOverrideAllowsTreatmentAndCreatesReviewTask()throws Exception{
        UUID caseId=arriveWithDoctor("Emergency Patient","+254700000089","em@local.test");
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.emergencyOverride(caseId,new EmergencyOverrideRequest("Acute STEMI — immediate primary PCI required"));
        clearedToAdmit(caseId);
        var result=journey.treatment(caseId,new TreatmentRequest(facility(),null,Instant.now(),null,"IN_PROGRESS","Primary PCI",null,null,null,false,null,"ADM-1"));
        assertThat(result.status()).isEqualTo("IN_PROGRESS");
        Integer reviewTasks=jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=? AND task_type='EMERGENCY_OVERRIDE_REVIEW'",Integer.class,caseId);
        assertThat(reviewTasks).isEqualTo(1);
    }

    @Test void aCaseIsSentInAnyManagedCareAreaAndAnUnknownOneIsRefused()throws Exception{
        var newer=cases.create(new CreateCaseRequest("Surgery","Patient","Kenya","+254700000094","Reports","en",true,null,"cs1@local.test","Africa/Nairobi","general-surgery"));
        assertThat(jdbc.queryForObject("SELECT care_category FROM medical_cases WHERE id=?",String.class,newer.caseId())).isEqualTo("general-surgery");
        assertThatThrownBy(()->cases.create(new CreateCaseRequest("Unknown","Patient","Kenya","+254700000095","Reports","en",true,null,"cs2@local.test","Africa/Nairobi","not-a-care-area")))
            .isInstanceOf(com.rehletshifaa.shared.api.ApiException.class).hasMessageContaining("care area");
        UUID patientId=jdbc.queryForObject("SELECT patient_id FROM medical_cases WHERE id=?",UUID.class,newer.caseId());
        var next=cases.createForExistingPatient(patientId,new NewCaseForPatientRequest("Second case",
            "womens-health",null,true));
        assertThat(jdbc.queryForObject("SELECT care_category FROM medical_cases WHERE id=?",String.class,next.caseId())).isEqualTo("womens-health");
        assertThatThrownBy(()->cases.createForExistingPatient(patientId,new NewCaseForPatientRequest("Third case","not-a-care-area",null,true)))
            .isInstanceOf(com.rehletshifaa.shared.api.ApiException.class).hasMessageContaining("care area");
    }

    // UC-12: the clinical end of the journey. Written from the protocol (docs/qa-test-protocol.md UC-12), not from the code.
    // P1-17: discharge also waits for the treatment evidence, the pack and the final invoice (written directly here; the gate is
    // DischargeServiceTest's); the follow-up plan is part of the pack, and follow-up starts once the final invoice is reconciled.
    @Test void dischargeNeedsACleanDocumentOfThisCaseAndFollowUpOnlyComesAfterTheReconciledDischarge()throws Exception{
        UUID caseId=arriveWithDoctor("Discharge Patient","+254700000091","dc@local.test");
        UUID otherCase=cases.create(new CreateCaseRequest("Other","Patient","Kenya","+254700000092","Reports","en",true,null,"dc2@local.test","Africa/Nairobi","cardiology")).caseId();
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.captureProcedureConsent(caseId,new ProcedureConsentRequest("The treating doctor explained the procedure, risks and alternatives; I consent.","en","v1",null,null,"Provider consent ref #124"));
        clearedToAdmit(caseId);
        Instant start=Instant.now().minusSeconds(3600);
        journey.treatment(caseId,new TreatmentRequest(facility(),null,start,null,"IN_PROGRESS","Angioplasty",null,null,null,false,null,"ADM-1"));
        assertThat(caseStatus(caseId)).isEqualTo("TREATMENT_IN_PROGRESS");

        var followUp=new FollowUpRequest(null,null,Instant.now().plusSeconds(7*86400),"VIDEO","ECG","Rest for a week");
        journey.followUp(caseId,followUp);
        assertThat(caseStatus(caseId)).as("the plan is part of the pack; it moves nothing").isEqualTo("TREATMENT_IN_PROGRESS");
        dischargeable(caseId);

        UUID unscanned=document(caseId,"PENDING");
        UUID quarantined=document(caseId,"QUARANTINED");
        UUID otherCasesClean=document(otherCase,"CLEAN");
        for(UUID notUsable:Arrays.asList(null,unscanned,quarantined,otherCasesClean))
            assertThatThrownBy(()->journey.treatment(caseId,discharge(start,notUsable)))
                .as("discharge with document %s",notUsable).isInstanceOf(com.rehletshifaa.shared.api.ApiException.class);
        assertThat(caseStatus(caseId)).isEqualTo("TREATMENT_IN_PROGRESS");

        var discharged=journey.treatment(caseId,discharge(start,document(caseId,"CLEAN")));
        assertThat(caseStatus(caseId)).isEqualTo("DISCHARGED");

        journey.followUp(caseId,new FollowUpRequest(discharged.id(),null,Instant.now().plusSeconds(7*86400),"VIDEO","ECG","Rest for a week"));
        assertThat(caseStatus(caseId)).as("the final invoice is not reconciled yet").isEqualTo("DISCHARGED");
        reconciled(caseId);
        journey.followUp(caseId,new FollowUpRequest(discharged.id(),null,Instant.now().plusSeconds(7*86400),"VIDEO","ECG","Rest for a week"));
        assertThat(caseStatus(caseId)).isEqualTo("FOLLOW_UP");
    }

    @Test void treatmentNeedsTheAcceptedFinalQuoteAsWellAsProcedureConsent()throws Exception{
        var fq=finalQuoteAfterArrival("Quote Patient","+254700000093","fq3@local.test");
        authenticate("coordinator-subject",Role.COORDINATOR);
        journey.releaseFinalQuote(fq.caseId(),fq.versionId());
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.captureProcedureConsent(fq.caseId(),new ProcedureConsentRequest("The treating doctor explained the procedure, risks and alternatives; I consent.","en","v1",null,null,"Provider consent ref #125"));
        clearedToAdmit(fq.caseId());
        var episode=new TreatmentRequest(facility(),null,Instant.now(),null,"IN_PROGRESS","Consultation",null,null,null,false,null,"ADM-1");
        assertThatThrownBy(()->journey.treatment(fq.caseId(),episode)).isInstanceOf(com.rehletshifaa.shared.api.ApiException.class);
        assertThat(caseStatus(fq.caseId())).isEqualTo("ARRIVAL_CONFIRMED");

        authenticate("patient-subject",Role.PATIENT);
        journey.decideProposal(fq.caseId(),fq.versionId(),new ProposalDecisionRequest("ACCEPTED",List.of(),"Accepted final plan"));
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.treatment(fq.caseId(),episode);
        assertThat(caseStatus(fq.caseId())).isEqualTo("TREATMENT_IN_PROGRESS");
    }

    // ---------- P0-2 lifecycle exits (review A-01 / V6): one test per new edge ----------

    /** ARRIVAL_CONFIRMED -> CANCELLED: the coordinator's typed reason is mandatory, every open item closes, and the exit is on record. */
    @Test void anArrivedCaseIsCancelledOnlyWithATypedReasonAndEveryOpenItemCloses()throws Exception{
        UUID caseId=arriveWithDoctor("Refused Patient","+254700000101","rf@local.test");
        coordinate(caseId);
        for(String type:List.of("TRAVEL","EMERGENCY_OVERRIDE_REVIEW"))
            jdbc.update("INSERT INTO case_tasks(id,case_id,task_type,title,owner_subject,owner_role,visibility_scope,priority,blocking,status,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0)",
                UUID.randomUUID(),caseId,type,"enc:"+crypto.encrypt("Open item"),"operations-subject","OPERATIONS","INTERNAL","NORMAL",false,"OPEN","coordinator-subject",Instant.now(),Instant.now());
        // A Consultant never cancels a whole case.
        authenticate("doctor-subject",Role.CONSULTANT);
        assertThatThrownBy(()->journey.transition(caseId,new TransitionRequest("CANCELLED","Refused",version(caseId),"HOSPITAL_REFUSED")))
            .isInstanceOf(com.rehletshifaa.shared.api.ApiException.class).extracting("status").isEqualTo(403);
        authenticate("coordinator-subject",Role.COORDINATOR);
        assertThatThrownBy(()->journey.transition(caseId,new TransitionRequest("CANCELLED","Refused",version(caseId))))
            .isInstanceOf(com.rehletshifaa.shared.api.ApiException.class).extracting("code").isEqualTo("CANCELLATION_REASON_REQUIRED");
        assertThat(caseStatus(caseId)).isEqualTo("ARRIVAL_CONFIRMED");

        var view=journey.transition(caseId,new TransitionRequest("CANCELLED","No bed on the ward",version(caseId),"HOSPITAL_REFUSED"));
        assertThat(view.status()).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("SELECT reason FROM case_exit_reasons WHERE case_id=? AND from_status='ARRIVAL_CONFIRMED' AND to_status='CANCELLED'",String.class,caseId)).isEqualTo("HOSPITAL_REFUSED");
        assertThat(jdbc.queryForObject("SELECT note FROM case_exit_reasons WHERE case_id=?",String.class,caseId)).as("the note is stored encrypted").doesNotContain("No bed");
        // The note lives only on the encrypted exit row: history and audit carry the typed reason alone.
        assertThat(jdbc.queryForObject("SELECT reason FROM case_status_history WHERE case_id=? AND to_status='CANCELLED'",String.class,caseId)).isEqualTo("HOSPITAL_REFUSED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE case_id=? AND event_type='CASE_EXIT_RECORDED' AND action='HOSPITAL_REFUSED' AND reason IS NULL",Integer.class,caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE case_id=? AND reason LIKE '%No bed%'",Integer.class,caseId)).isZero();
        // Ordinary work closes; a governance review of what was done outlives the case.
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND status IN ('OPEN','IN_PROGRESS') AND task_type<>'EMERGENCY_OVERRIDE_REVIEW'",Integer.class,caseId)).as("no ordinary work left").isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM case_tasks WHERE case_id=? AND task_type='EMERGENCY_OVERRIDE_REVIEW'",String.class,caseId)).isEqualTo("OPEN");
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?",String.class,caseId)).isEqualTo("NONE");
    }

    /** TREATMENT_IN_PROGRESS -> CANCELLED with a medical contraindication. */
    @Test void treatmentInProgressCancelsWithAContraindication()throws Exception{
        UUID caseId=arriveWithDoctor("Contra Patient","+254700000102","ct@local.test");
        coordinate(caseId);
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.captureProcedureConsent(caseId,new ProcedureConsentRequest("Explained; I consent.","en","v1",null,null,"Provider consent ref #201"));
        clearedToAdmit(caseId);
        journey.treatment(caseId,new TreatmentRequest(facility(),null,Instant.now().minusSeconds(3600),null,"IN_PROGRESS","Angioplasty",null,null,null,false,null,"ADM-1"));
        assertThat(caseStatus(caseId)).isEqualTo("TREATMENT_IN_PROGRESS");
        authenticate("coordinator-subject",Role.COORDINATOR);
        journey.transition(caseId,new TransitionRequest("CANCELLED",null,version(caseId),"MEDICAL_CONTRAINDICATION"));
        assertThat(caseStatus(caseId)).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("SELECT reason FROM case_exit_reasons WHERE case_id=? AND from_status='TREATMENT_IN_PROGRESS'",String.class,caseId)).isEqualTo("MEDICAL_CONTRAINDICATION");
        assertThat(jdbc.queryForObject("SELECT reason FROM case_status_history WHERE case_id=? AND to_status='CANCELLED'",String.class,caseId)).isEqualTo("MEDICAL_CONTRAINDICATION");
    }

    /** DISCHARGED -> CLOSED when the Consultant records "no follow-up needed"; nobody else, and not before discharge. */
    @Test void aDischargedPatientClosesWhenTheConsultantRecordsNoFollowUp()throws Exception{
        UUID caseId=arriveWithDoctor("Done Patient","+254700000103","dn@local.test");
        coordinate(caseId);
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.captureProcedureConsent(caseId,new ProcedureConsentRequest("Explained; I consent.","en","v1",null,null,"Provider consent ref #202"));
        clearedToAdmit(caseId);
        Instant start=Instant.now().minusSeconds(3600);
        journey.treatment(caseId,new TreatmentRequest(facility(),null,start,null,"IN_PROGRESS","Angioplasty",null,null,null,false,null,"ADM-1"));
        assertThatThrownBy(()->exits.closeWithoutFollowUp(caseId,"Too early")).isInstanceOf(com.rehletshifaa.shared.api.ApiException.class).extracting("code").isEqualTo("CASE_STATE_CONFLICT");
        journey.followUp(caseId,new FollowUpRequest(null,null,Instant.now().plusSeconds(7*86400),"VIDEO","ECG","Review only if needed"));
        dischargeable(caseId);
        journey.treatment(caseId,discharge(start,document(caseId,"CLEAN")));
        assertThat(caseStatus(caseId)).isEqualTo("DISCHARGED");
        reconciled(caseId);
        authenticate("coordinator-subject",Role.COORDINATOR);
        assertThatThrownBy(()->exits.closeWithoutFollowUp(caseId,"Not mine to say")).isInstanceOf(com.rehletshifaa.shared.api.ApiException.class).extracting("status").isEqualTo(403);
        authenticate("doctor-subject",Role.CONSULTANT);
        assertThat(exits.closeWithoutFollowUp(caseId,"Full recovery, no review needed").status()).isEqualTo("CLOSED");
        assertThat(caseStatus(caseId)).isEqualTo("CLOSED");
        assertThat(jdbc.queryForObject("SELECT reason FROM case_exit_reasons WHERE case_id=? AND from_status='DISCHARGED' AND to_status='CLOSED'",String.class,caseId)).isEqualTo("NO_FOLLOW_UP_NEEDED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND status IN ('OPEN','IN_PROGRESS')",Integer.class,caseId)).isZero();
    }

    /** DISCHARGED -> CANCELLED: the patient died before follow-up. */
    @Test void aDischargedCaseCancelsWhenThePatientDied()throws Exception{ cancelsTyped("DISCHARGED","PATIENT_DECEASED","+254700000104","ex1@local.test"); }

    /** FOLLOW_UP -> CANCELLED: the patient never came back for follow-up. */
    @Test void aFollowUpCaseCancelsAsANoShow()throws Exception{ cancelsTyped("FOLLOW_UP","NO_SHOW","+254700000105","ex2@local.test"); }

    private void cancelsTyped(String stage,String reason,String phone,String email)throws Exception{
        UUID caseId=arriveWithDoctor("Exit Patient",phone,email);
        coordinate(caseId);
        authenticate("doctor-subject",Role.CONSULTANT);
        journey.captureProcedureConsent(caseId,new ProcedureConsentRequest("Explained; I consent.","en","v1",null,null,"Provider consent ref #203"));
        clearedToAdmit(caseId);
        Instant start=Instant.now().minusSeconds(3600);
        journey.treatment(caseId,new TreatmentRequest(facility(),null,start,null,"IN_PROGRESS","Angioplasty",null,null,null,false,null,"ADM-1"));
        journey.followUp(caseId,new FollowUpRequest(null,null,Instant.now().plusSeconds(7*86400),"VIDEO","ECG","Rest"));
        dischargeable(caseId);
        var discharged=journey.treatment(caseId,discharge(start,document(caseId,"CLEAN")));
        if("FOLLOW_UP".equals(stage)){reconciled(caseId);journey.followUp(caseId,new FollowUpRequest(discharged.id(),null,Instant.now().plusSeconds(7*86400),"VIDEO","ECG","Rest"));}
        assertThat(caseStatus(caseId)).isEqualTo(stage);
        authenticate("coordinator-subject",Role.COORDINATOR);
        journey.transition(caseId,new TransitionRequest("CANCELLED","Recorded by phone",version(caseId),reason));
        assertThat(caseStatus(caseId)).as(stage).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("SELECT reason FROM case_exit_reasons WHERE case_id=? AND from_status=?",String.class,caseId,stage)).isEqualTo(reason);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND status IN ('OPEN','IN_PROGRESS')",Integer.class,caseId)).isZero();
    }

    /** The HTTP contract: the typed reason rides on the existing transition endpoint, and is refused when missing. */
    @Test void theTransitionEndpointCarriesTheTypedReasonOverHttp()throws Exception{
        UUID caseId=arriveWithDoctor("Http Patient","+254700000106","http@local.test");
        coordinate(caseId);
        var asCoordinator=jwt().jwt(token->token.subject("coordinator-subject").claim("auth_time",Instant.now().getEpochSecond()).claim("acr","3")).authorities(new SimpleGrantedAuthority("ROLE_COORDINATOR"));
        mvc.perform(post("/api/v1/coordinator/cases/{caseId}/transition",caseId).with(asCoordinator).contentType("application/json")
                .content("{\"targetStatus\":\"CANCELLED\",\"reason\":\"Never arrived\",\"expectedVersion\":"+version(caseId)+"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CANCELLATION_REASON_REQUIRED"));
        mvc.perform(post("/api/v1/coordinator/cases/{caseId}/transition",caseId).with(asCoordinator).contentType("application/json")
                .content("{\"targetStatus\":\"CANCELLED\",\"reason\":\"Never arrived\",\"expectedVersion\":"+version(caseId)+",\"cancellationReason\":\"NO_SHOW\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(jdbc.queryForObject("SELECT reason FROM case_exit_reasons WHERE case_id=?",String.class,caseId)).isEqualTo("NO_SHOW");
    }

    /** The coordinator owns the case (the transition endpoint is theirs, under CASE_COORDINATE). */
    private void coordinate(UUID caseId){
        if(jdbc.queryForObject("SELECT COUNT(*) FROM workforce_people WHERE subject='coordinator-subject'",Integer.class)==0)
            com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc,"coordinator-subject","COORDINATOR",crypto.encrypt("Layla Hassan"));
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc,"coordinator-subject");
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
            UUID.randomUUID(),caseId,"coordinator-subject","COORDINATOR","PRIMARY","ACTIVE","Owner","system",Instant.now(),Instant.now());
    }
    /**
     * P1-15: these tests are about consent, discharge and exits, not money. A Consultant's emergency admission row stands in for
     * the countersigned cashier receipt the pay-to-admit gate reads (written directly, so no Finance review item is opened);
     * the gate and the override themselves are covered in AdmissionServiceTest.
     */
    private void clearedToAdmit(UUID caseId){
        jdbc.update("INSERT INTO case_evidence(id,case_id,stage,kind,payload,recorded_by,recorded_role,recorded_at,version) VALUES(?,?,?,?,?,?,?,?,0)",
            UUID.randomUUID(),caseId,"ARRIVAL_CONFIRMED","EMERGENCY_ADMISSION_OVERRIDE",null,"doctor-subject","CONSULTANT",Instant.now());
    }
    private long version(UUID caseId){return jdbc.queryForObject("SELECT version FROM medical_cases WHERE id=?",Long.class,caseId);}
    /**
     * P1-17: these tests are about the episode, follow-up and exits, not the pack or money. The treatment milestones, the pack
     * documents and the hospital's final invoice the discharge gate reads are written directly (the gate is DischargeServiceTest's).
     */
    private void dischargeable(UUID caseId){
        for(String kind:List.of("MILESTONE_PROCEDURE_STARTED","MILESTONE_PROCEDURE_COMPLETED","MILESTONE_DISCHARGE_PLANNED","DISCHARGE_SUMMARY","MEDICATION_LIST","OPERATIVE_NOTE"))
            evidence(caseId,kind,null);
        evidence(caseId,"FINAL_INVOICE",new java.math.BigDecimal("100000.00"));
    }
    /** P1-17: the settlement module's ledger row for a reconciled final invoice (ReconciliationService is SettlementServiceTest's). */
    private void reconciled(UUID caseId){ evidence(caseId,"RECONCILIATION",new java.math.BigDecimal("100000.00")); }
    private void evidence(UUID caseId,String kind,java.math.BigDecimal amount){
        jdbc.update("INSERT INTO case_evidence(id,case_id,stage,kind,amount_egp,recorded_by,recorded_role,recorded_at,version) VALUES(?,?,?,?,?,?,?,?,0)",
            UUID.randomUUID(),caseId,"TREATMENT_IN_PROGRESS",kind,amount,"doctor-subject","CONSULTANT",Instant.now());
    }

    private TreatmentRequest discharge(Instant start,UUID documentId){
        return new TreatmentRequest(facility(),null,start,Instant.now(),"COMPLETED","Angioplasty","Angioplasty",null,null,true,documentId,null);
    }

    private UUID document(UUID caseId,String status){
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO medical_documents(id,case_id,object_key,original_file_name,safe_file_name,content_type,size_bytes,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            id,caseId,"cases/"+caseId+"/"+id,"discharge.pdf","discharge.pdf","application/pdf",2048L,status,Instant.now());
        return id;
    }

    private String caseStatus(UUID caseId){return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?",String.class,caseId);}

    @Test void finalQuoteStaysAtArrivalConfirmedAndReducesWithScope()throws Exception{
        var fq=finalQuoteAfterArrival("Final","+254700000090","fq2@local.test");
        var pv=jdbc.queryForMap("SELECT document_type,patient_total_expected_egp,margin_amount_egp,margin_rate FROM proposal_versions WHERE id=?",fq.versionId());
        assertThat(pv.get("document_type")).isEqualTo("FINAL_TREATMENT_QUOTE");
        assertThat(new BigDecimal(pv.get("patient_total_expected_egp").toString())).isEqualByComparingTo("11500.00"); // 10000 * 1.15 (< 17250 preliminary)
        assertThat(new BigDecimal(pv.get("margin_amount_egp").toString())).isEqualByComparingTo("1500.00");           // < 2250 preliminary
        assertThat(new BigDecimal(pv.get("margin_rate").toString())).isEqualByComparingTo("0.1500");                  // reused locked rate
        // #13: releasing the final quote does not move the macro case.
        authenticate("coordinator-subject",Role.COORDINATOR);
        var released=journey.releaseFinalQuote(fq.caseId(),fq.versionId());
        assertThat(released.status()).isEqualTo("RELEASED");
        assertThat(journey.workspace(fq.caseId()).caseSummary().status()).isEqualTo("ARRIVAL_CONFIRMED");
        // #14: the patient's final decision does not move the macro case.
        authenticate("patient-subject",Role.PATIENT);
        journey.decideProposal(fq.caseId(),fq.versionId(),new ProposalDecisionRequest("ACCEPTED",List.of(),"Accepted final plan"));
        assertThat(journey.workspace(fq.caseId()).caseSummary().status()).isEqualTo("ARRIVAL_CONFIRMED");
    }

    private record FinalQuote(UUID caseId,UUID versionId){}

    /** A preliminary for two catalog services, arrival, then a final assessment and final quote (created, not released) for one. */
    private FinalQuote finalQuoteAfterArrival(String firstName,String phone,String email)throws Exception{
        var created=cases.create(new CreateCaseRequest(firstName, "Patient","Kenya",phone,"Cardiac reports","en",true,null,email,"Africa/Nairobi","cardiology"));
        cases.submit(created.caseId());entityManager.flush();entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)","patient-subject",created.caseId());
        authenticate("coordinator-subject",Role.COORDINATOR);com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject")) journey.claimCoordinatorCase(created.caseId(), "cardiac-pod");
        long v=journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(),new TransitionRequest("READY_FOR_CONSULTANT","Intake complete",v));
        UUID practitionerId=UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",practitionerId,"doctor-subject","Doctor One","Doctor One","VERIFIED","CONSULTANT","AVAILABLE","cardiology",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),practitionerId,"LICENSE","VERIFIED",Instant.now().plusSeconds(86400),Instant.now());
        UUID svc1=UUID.randomUUID();UUID svc2=UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",svc1,practitionerId,"CARD-CONSULT","Consultation","Consultation",new BigDecimal("10000.00"),true,"admin-subject",Instant.now(),Instant.now());
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",svc2,practitionerId,"CARD-ECHO","Echo","Diagnostics",new BigDecimal("5000.00"),true,"admin-subject",Instant.now(),Instant.now());
        var doctorAssignment=journey.assign(created.caseId(),new AssignmentRequest("doctor-subject","DOCTOR","PRIMARY","cardiac-pod","Clinical review"));
        authenticate("doctor-subject",Role.CONSULTANT);journey.acceptDoctorAssignment(created.caseId(),doctorAssignment.id(), new AssignmentDecisionRequest(true,null));
        var review=journey.saveClinicalReview(created.caseId(),new ClinicalReviewRequest("Reviewed","SUITABLE",null,"Imaging","Recommended","Alt","Risks","Seq","7 days","Follow-up"));
        journey.approveClinicalReview(created.caseId(),review.id());
        // Preliminary scope: two catalog services (15000 provider -> 16800 inclusive at 12%).
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,price_egp_min,price_egp_max,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Consultation",new BigDecimal("10000.00"),"EGP",0,svc1,new BigDecimal("10000.00"),new BigDecimal("10000.00"),new BigDecimal("10000.00"),false);
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,price_egp_min,price_egp_max,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),review.id(),"Echo",new BigDecimal("5000.00"),"EGP",1,svc2,new BigDecimal("5000.00"),new BigDecimal("5000.00"),new BigDecimal("5000.00"),false);
        authenticate("coordinator-subject",Role.COORDINATOR);
        journey.createProposal(created.caseId(),new ProposalDraftRequest(review.id(),"en","Plan","EGP","Incl","Excl","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),List.of(new ProposalItemRequest("MEDICAL","Consultation",BigDecimal.ONE,new BigDecimal("10000.00"),false,0)),null));
        jdbc.update("UPDATE medical_cases SET status='ARRIVAL_CONFIRMED' WHERE id=?",created.caseId()); // patient arrived (details are a separate sub-workflow)
        // Doctor's physical assessment reduces scope to one service.
        authenticate("doctor-subject",Role.CONSULTANT);
        var finalReview=journey.saveFinalAssessment(created.caseId(),new FinalAssessmentRequest("Single procedure confirmed","Standard risks",List.of(new CostEstimateItem("Consultation",new BigDecimal("10000.00"),"EGP",svc1))));
        authenticate("coordinator-subject",Role.COORDINATOR);
        var fq=journey.createFinalQuote(created.caseId(),new FinalQuoteRequest(finalReview.id(),"EGP","Second procedure no longer indicated after examination","Excl","Deposit","Refund","Consent",Instant.now().plusSeconds(86400),null));
        return new FinalQuote(created.caseId(),fq.versionId());
    }

    private void authenticate(String subject, Role... roles) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, roles); }
}
