package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.clinic.api.ClinicDtos.AffiliationLineRequest;
import com.rehletshifaa.clinic.api.ClinicDtos.AffiliationsView;
import com.rehletshifaa.clinic.api.ClinicDtos.DeclarationRequest;
import com.rehletshifaa.clinic.api.ClinicDtos.DeclarationReviewRequest;
import com.rehletshifaa.clinic.application.ConsultantAffiliationService;
import com.rehletshifaa.clinic.application.ConsultantEligibilityService;
import com.rehletshifaa.compliance.api.ComplianceDtos.SampleCaseView;
import com.rehletshifaa.compliance.api.ComplianceDtos.SampleRequest;
import com.rehletshifaa.compliance.api.ComplianceDtos.SampleReviewRequest;
import com.rehletshifaa.compliance.api.ComplianceDtos.ScorecardView;
import com.rehletshifaa.compliance.application.SamplingAuditService;
import com.rehletshifaa.compliance.application.ScorecardService;
import com.rehletshifaa.facility.api.FacilityDtos.LiftSuspensionRequest;
import com.rehletshifaa.facility.application.FacilityCatalogService;
import com.rehletshifaa.facility.application.FacilityPackagePricing;
import com.rehletshifaa.journey.api.AdmissionDtos.ReserveAdmissionRequest;
import com.rehletshifaa.journey.api.JourneyDtos.CostEstimateItem;
import com.rehletshifaa.journey.api.JourneyDtos.FinalAssessmentRequest;
import com.rehletshifaa.journey.api.JourneyDtos.FinalQuoteRequest;
import com.rehletshifaa.journey.api.JourneyDtos.PayeeTotal;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalItemView;
import com.rehletshifaa.journey.api.SafetyDtos.ConcernRequest;
import com.rehletshifaa.settlement.api.SettlementDtos.InvoiceLineRequest;
import com.rehletshifaa.settlement.api.SettlementDtos.SubmitReconciliationRequest;
import com.rehletshifaa.settlement.application.ReconciliationService;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P1-19 session 1 (design §7, decision D-H): declared affiliations as a condition of eligibility, the undeclared-facility flag at
 * reservation, separate Consultant and hospital lines on the final quote, the facility package suspension after repeated
 * unapproved extras, the scorecards (outcome aggregates only, representative answers flagged) and the monthly sampling audit.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class HospitalAgreementAuditTest extends DischargeFixture {
    static final String COMPLIANCE = "compliance-auditor-subject", CONSULTANT_OPS = "consultant-ops-subject", FINANCE_MANAGER = "finance-manager-subject",
            OTHER_DOCTOR = "other-doctor-subject";

    @Autowired ConsultantAffiliationService affiliations; @Autowired ConsultantEligibilityService eligibility;
    @Autowired ReconciliationService reconciliations; @Autowired FacilityCatalogService facilityCatalog; @Autowired FacilityPackagePricing pricing;
    @Autowired ScorecardService scorecards; @Autowired SamplingAuditService sampling; @Autowired IncidentService incidents;
    @Autowired com.rehletshifaa.compliance.application.DeclarationReviewService declarationReviews;

    // ---------- D-H: the declaration and eligibility ----------

    @Test void aConsultantWithoutACurrentDeclarationIsNotEligibleUntilTheyFileOne() {
        UUID facility = facility("decl@hospital.test");
        UUID p = consultant("decl-doctor-subject");
        assertThat(eligibility.isEligible(p, "cardiology")).as("credentials current, no declaration").isFalse();

        signIn("decl-doctor-subject", Role.CONSULTANT);
        assertThat(affiliations.view(p).declarationCurrent()).isFalse();
        assertCode(() -> affiliations.declare(p, new DeclarationRequest(List.of(), false, ConsultantAffiliationService.ATTESTATION_VERSION)), "AFFILIATION_ATTESTATION_REQUIRED");
        assertCode(() -> affiliations.declare(p, new DeclarationRequest(List.of(), true, "affiliation-attestation-2020-01")), "AFFILIATION_ATTESTATION_OUTDATED");
        assertCode(() -> affiliations.declare(p, declaration(new AffiliationLineRequest(facility, "FINANCIAL_INTEREST", " "))), "AFFILIATION_NOTE_REQUIRED");
        assertCode(() -> affiliations.declare(p, declaration(new AffiliationLineRequest(facility, "PRIVILEGES", null),
                new AffiliationLineRequest(facility, "NONE_DECLARED", null))), "AFFILIATION_KIND_CONFLICT");
        assertCode(() -> affiliations.declare(p, declaration(new AffiliationLineRequest(facility, "PRIVILEGES", null),
                new AffiliationLineRequest(facility, "PRIVILEGES", null))), "AFFILIATION_DUPLICATE");
        assertCode(() -> affiliations.declare(p, declaration(new AffiliationLineRequest(UUID.randomUUID(), "PRIVILEGES", null))), "FACILITY_INVALID");

        AffiliationsView first = affiliations.declare(p, declaration(new AffiliationLineRequest(facility, "PRIVILEGES", null),
                new AffiliationLineRequest(facility, "FINANCIAL_INTEREST", "10% share in the cath lab company")));
        assertThat(first.declarationCurrent()).isTrue();
        assertThat(first.current().lines()).extracting(l -> l.kind()).containsExactly("PRIVILEGES", "FINANCIAL_INTEREST");
        assertThat(first.current().reviewStatus()).as("the Consultant does not see the review").isNull();
        assertThat(jdbc.queryForObject("SELECT note FROM consultant_affiliations WHERE kind='FINANCIAL_INTEREST' AND practitioner_id=?", String.class, p))
                .as("encrypted at rest").doesNotContain("share");
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE event_type='AFFILIATIONS_DECLARED' AND reason LIKE '%share%'")).isZero();
        assertThat(eligibility.isEligible(p, "cardiology")).isTrue();
        assertThat(first.current().validUntil()).isAfter(Instant.now().plusSeconds(364L * 86400));

        AffiliationsView second = affiliations.declare(p, declaration(new AffiliationLineRequest(facility, "NONE_DECLARED", null)));
        assertThat(second.history()).as("the first is replaced").hasSize(1);
        assertThat(second.history().get(0).supersededAt()).isNotNull();
        assertThat(count("SELECT COUNT(*) FROM affiliation_declarations WHERE practitioner_id=? AND superseded_at IS NULL", p)).isEqualTo(1);

        // A year on (simulated), the declaration has lapsed and the Consultant receives no new case.
        jdbc.update("UPDATE affiliation_declarations SET declared_at=?, valid_until=? WHERE practitioner_id=? AND superseded_at IS NULL",
                Instant.now().minusSeconds(400L * 86400), Instant.now().minusSeconds(60), p);
        assertThat(eligibility.isEligible(p, "cardiology")).isFalse();

        // Only the Consultant themself declares; another consultant cannot read or file it.
        consultant(OTHER_DOCTOR);
        signIn(OTHER_DOCTOR, Role.CONSULTANT);
        assertThatThrownBy(() -> affiliations.view(p)).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        assertThatThrownBy(() -> affiliations.declare(p, declaration())).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
    }

    @Test void complianceReviewsADeclarationOnceAndConsultantOperationsReadsIt() {
        UUID p = consultant("review-doctor-subject");
        signIn("review-doctor-subject", Role.CONSULTANT);
        UUID declaration = affiliations.declare(p, declaration()).current().id();

        signIn(CONSULTANT_OPS, Role.CONSULTANT_OPERATIONS_MANAGER);
        assertThat(affiliations.view(p).current().reviewStatus()).isEqualTo("PENDING");
        assertThatThrownBy(() -> affiliations.review(declaration, new DeclarationReviewRequest("CLEARED", null)))
                .as("only Compliance records a review").isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);

        signIn(COMPLIANCE, Role.COMPLIANCE_AUDITOR);
        assertThat(affiliations.declarations("PENDING")).extracting(d -> d.id()).contains(declaration);
        assertCode(() -> affiliations.review(declaration, new DeclarationReviewRequest("FINDING", " ")), "FINDING_NOTE_REQUIRED");
        var reviewed = declarationReviews.review(declaration, new DeclarationReviewRequest("FINDING", "Privileges at Cairo Heart are on the hospital's list but not declared"));
        assertThat(reviewed.reviewStatus()).isEqualTo("FINDING");
        assertCode(() -> affiliations.review(declaration, new DeclarationReviewRequest("CLEARED", null)), "DECLARATION_ALREADY_REVIEWED");
        assertThat(eligibility.isEligible(p, "cardiology")).as("a finding never changes eligibility here").isTrue();
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE event_type='AFFILIATION_DECLARATION_REVIEWED' AND reason='FINDING'")).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='AFFILIATION_FINDING'", CONSULTANT_OPS))
                .as("Consultant Operations is told; the text stays with Compliance").isEqualTo(1);
        assertThatThrownBy(() -> affiliations.declarations("ANYTHING")).isInstanceOf(ApiException.class).extracting("code").isEqualTo("REVIEW_STATUS_INVALID");
    }

    // ---------- the undeclared facility at reservation ----------

    @Test void aReservationAtAnUndeclaredFacilityGoesAheadFlaggedAndDeclaringItClearsTheFlag() {
        Arrived c = arrivedWithFinalQuote("17250.00");
        asOps();
        admissions.reserve(c.caseId, new ReserveAdmissionRequest(c.facilityId, Instant.now().plusSeconds(2 * 86400)));
        admissions.reserve(c.caseId, new ReserveAdmissionRequest(c.facilityId, Instant.now().plusSeconds(3 * 86400)));
        assertThat(count("SELECT COUNT(*) FROM facility_admissions WHERE case_id=?", c.caseId)).as("the reservation stands").isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM affiliation_flags WHERE case_id=? AND code='UNDECLARED_FACILITY' AND cleared_at IS NULL", c.caseId)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='UNDECLARED_FACILITY' AND case_id=?", DOCTOR, c.caseId)).isEqualTo(1);

        signIn(COMPLIANCE, Role.COMPLIANCE_AUDITOR);
        assertThat(affiliations.flags(true)).extracting(f -> f.caseId()).contains(c.caseId);

        UUID p = doctorId();
        asDoctor();
        affiliations.declare(p, declaration(new AffiliationLineRequest(c.facilityId, "PRIVILEGES", null)));
        assertThat(count("SELECT COUNT(*) FROM affiliation_flags WHERE case_id=? AND cleared_at IS NOT NULL AND cleared_by_declaration_id IS NOT NULL", c.caseId)).isEqualTo(1);
        // Declared now: another case reserved there raises nothing.
        nextPatient();
        Arrived d = arrived("17250.00");
        asOps();
        admissions.reserve(d.caseId, new ReserveAdmissionRequest(c.facilityId, Instant.now().plusSeconds(2 * 86400)));
        assertThat(count("SELECT COUNT(*) FROM affiliation_flags WHERE case_id=?", d.caseId)).isZero();
    }

    // ---------- separate lines on the final quote ----------

    @Test void onceTheHospitalIsReservedTheFinalQuoteShowsItsChargesApartFromTheConsultantsFee() {
        Arrived c = arrived("17250.00");
        UUID service = jdbc.queryForObject("SELECT catalog_service_id FROM clinical_review_cost_estimates WHERE clinical_review_id=?", UUID.class, c.reviewId);
        asOps();
        admissions.reserve(c.caseId, new ReserveAdmissionRequest(c.facilityId, Instant.now().plusSeconds(2 * 86400)));
        asDoctor();
        assertCode(() -> journey.saveFinalAssessment(c.caseId, new FinalAssessmentRequest("Scope", "Risks",
                List.of(new CostEstimateItem("Angioplasty", new BigDecimal("80000.00"), "EGP", service, null, null, null, "FACILITY")))), "LINE_PAYEE_CONFLICT");
        UUID blended = journey.saveFinalAssessment(c.caseId, new FinalAssessmentRequest("Scope", "Risks",
                List.of(new CostEstimateItem("Angioplasty package", new BigDecimal("100000.00"), "EGP", service)))).id();
        asCoordinator();
        assertCode(() -> journey.createFinalQuote(c.caseId, quote(blended)), "FACILITY_LINE_REQUIRED");

        asDoctor();
        UUID separate = journey.saveFinalAssessment(c.caseId, new FinalAssessmentRequest("Scope", "Risks",
                List.of(new CostEstimateItem("Consultant's fee", new BigDecimal("80000.00"), "EGP", null, null, null, null, "CONSULTANT"),
                        new CostEstimateItem("Hospital stay and cath lab", new BigDecimal("20000.00"), "EGP", null, null, null, null, "FACILITY")))).id();
        asCoordinator();
        var fq = journey.createFinalQuote(c.caseId, quote(separate));
        assertThat(fq.items()).extracting(ProposalItemView::payee).containsExactly("CONSULTANT", "FACILITY", "PLATFORM");
        assertThat(fq.payeeTotals()).extracting(PayeeTotal::payee).containsExactly("CONSULTANT", "FACILITY", "PLATFORM");
        assertThat(fq.payeeTotals().get(1).total()).isEqualByComparingTo("20000");
        assertThat(JourneyService.renderProposal(fq)).as("the released document names the payees and their totals apart")
                .contains("Hospital stay and cath lab — ").contains("(paid to the hospital)").contains("(paid to the Consultant)")
                .contains("<h2>Who is paid</h2>").contains("<li>Paid to the hospital — 20000");
        assertThatThrownBy(() -> jdbc.update("UPDATE proposal_items SET payee='CONSULTANT' WHERE category='PLATFORM_FEE' AND proposal_version_id=?", fq.versionId()))
                .as("the fee line is the platform's in the schema").isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    // ---------- the facility package suspension ----------

    @Test void anUnapprovedExtraTwiceInAQuarterSuspendsTheFacilitysPackagesUntilAFinanceManagerLiftsIt() {
        Arrived first = settledWithExtra(null);
        UUID facility = first.facilityId;
        UUID pkg = approvedPackage(facility);
        assertThat(pricing.approved(pkg, LocalDate.now())).as("one extra: still priceable").isPresent();
        assertThat(facilityCatalog.packagesSuspended(facility)).isFalse();

        settledWithExtra(facility);
        assertThat(facilityCatalog.packagesSuspended(facility)).isTrue();
        assertThat(pricing.approved(pkg, LocalDate.now())).as("suspended: no line without Finance").isEmpty();
        assertThat(count("SELECT COUNT(*) FROM facility_package_suspensions WHERE facility_id=? AND occurrences=2 AND lifted_at IS NULL", facility)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE event_type='FACILITY_PACKAGES_SUSPENDED'")).isEqualTo(1);

        signIn(FINANCE_MANAGER, Role.FINANCE_MANAGER);
        var lifted = facilityCatalog.liftPackageSuspension(facility, new LiftSuspensionRequest("Hospital credited both nights; agreement reissued"));
        assertThat(lifted.packageSuspension()).isNull();
        assertThat(lifted.suspensions()).hasSize(1);
        assertThat(pricing.approved(pkg, LocalDate.now())).isPresent();
        assertCode(() -> facilityCatalog.liftPackageSuspension(facility, new LiftSuspensionRequest("again")), "PACKAGES_NOT_SUSPENDED");
    }

    // ---------- scorecards ----------

    @Test void theScorecardsCountTheCohortReadOutcomeAggregatesOnlyAndFlagRepresentativeAnswers() {
        Arrived c = settledWithExtra(null);
        // One answered day-30 question, by a representative, and a money concern raised from My Care.
        jdbc.update("""
                INSERT INTO case_outcomes(id,case_id,point,requested_at,pain_score,function_score,satisfaction_score,complication,channel,reported_by,reported_role,
                    reported_at,notice_version,version) VALUES(?,?,'D30',?,2,8,9,FALSE,'SECURE_LINK','rep','PATIENT_REPRESENTATIVE',?,'outcome-notice-2026-10',0)""",
                UUID.randomUUID(), c.caseId, Instant.now(), Instant.now());
        asPatient();
        incidents.raiseConcern(c.caseId, new ConcernRequest("DISPUTE", "The hospital asked me for 3,000 in cash for an extra night"));

        signIn(COMPLIANCE, Role.COMPLIANCE_AUDITOR);
        ScorecardView facility = scorecards.facility(c.facilityId, null, null);
        assertThat(facility.cases()).isEqualTo(1);
        assertThat(facility.smallCohort()).isTrue();
        assertThat(facility.reconciliation().unapprovedExtraCases()).isEqualTo(1);
        assertThat(facility.reconciliation().unapprovedExtrasEgp()).isEqualByComparingTo("3000");
        assertThat(facility.reconciliation().disputed()).isEqualTo(1);
        assertThat(facility.safety().chargeDisputes()).isEqualTo(1);
        assertThat(facility.undeclaredFacilityFlags()).isEqualTo(1);
        assertThat(facility.packagesSuspended()).isFalse();
        assertThat(facility.patientRating()).isEqualTo("NOT_COLLECTED");
        assertThat(facility.quotes().finalQuotesAccepted()).isEqualTo(1);
        assertThat(facility.quotes().averageFinalToEstimateMaximum()).isEqualByComparingTo("1.0000");
        assertThat(facility.outcomes()).singleElement().satisfies(o -> {
            assertThat(o.point()).isEqualTo("D30");
            assertThat(o.answered()).isEqualTo(1);
            assertThat(o.byRepresentative()).isEqualTo(1);
            assertThat(o.suppressed()).as("one answer is too few to show an average").isTrue();
            assertThat(o.averagePain()).isNull();
        });

        ScorecardView consultant = scorecards.consultant(doctorId(), null, null);
        assertThat(consultant.cases()).isGreaterThanOrEqualTo(1);
        assertThat(consultant.packagesSuspended()).isNull();
        assertCode(() -> scorecards.facility(c.facilityId, LocalDate.now(), LocalDate.now().minusDays(1)), "PERIOD_INVALID");

        signIn(CONSULTANT_OPS, Role.CONSULTANT_OPERATIONS_MANAGER);
        assertThat(scorecards.facility(c.facilityId, null, null).cases()).isEqualTo(1);
        asFinance();
        assertThatThrownBy(() -> scorecards.facility(c.facilityId, null, null)).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
    }

    // ---------- the sampling audit ----------

    @Test void complianceSamplesClosedCasesNamesTheMismatchesAndAFindingBecomesAnIncident() {
        Arrived c = settledWithExtra(null);
        closed(c.caseId);

        signIn(CONSULTANT_OPS, Role.CONSULTANT_OPERATIONS_MANAGER);
        assertThatThrownBy(() -> sampling.samples()).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);

        signIn(COMPLIANCE, Role.COMPLIANCE_AUDITOR);
        String month = YearMonth.now(ZoneId.of("Africa/Cairo")).toString();
        var sample = sampling.drawOnDemand(new SampleRequest(month, 50));
        SampleCaseView row = sample.cases().stream().filter(x -> x.caseId().equals(c.caseId)).findFirst().orElseThrow();
        assertThat(row.mismatches()).contains("UNAPPROVED_EXTRA", "UNDECLARED_FACILITY", "FACILITY_DISPUTE_OPEN", "FINAL_QUOTE_NOT_SEPARATED")
                .doesNotContain("STATEMENT_MISSING", "FINAL_INVOICE_MISSING", "RECONCILIATION_NOT_SETTLED", "PAID_AT_FACILITY_ABOVE_RECEIPTS");
        assertThat(row.record()).containsEntry("finalInvoiceEgp", "103000.00").containsKey("statementNumber").containsEntry("receiptsEgp", "97750.00");
        assertThat(row.record().get("finalQuoteCONSULTANTEgp")).isNotNull();
        assertThat(row.reviewStatus()).isEqualTo("PENDING");

        assertCode(() -> sampling.review(sample.sample().id(), c.caseId, new SampleReviewRequest("FINDING", null)), "FINDING_NOTE_REQUIRED");
        var reviewed = sampling.review(sample.sample().id(), c.caseId, new SampleReviewRequest("FINDING", "The hospital billed an extra night the patient also paid in cash"));
        SampleCaseView after = reviewed.cases().stream().filter(x -> x.caseId().equals(c.caseId)).findFirst().orElseThrow();
        assertThat(after.reviewStatus()).isEqualTo("FINDING");
        assertThat(after.incidentId()).isNotNull();
        assertThat(count("SELECT COUNT(*) FROM case_incidents WHERE id=? AND incident_type='DISPUTE' AND source='SYSTEM' AND raised_by_role='AUDIT_SAMPLE'", after.incidentId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT finding_note FROM audit_sample_cases WHERE case_id=?", String.class, c.caseId)).doesNotContain("cash");
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE event_type='AUDIT_SAMPLE_CASE_REVIEWED' AND reason LIKE '%cash%'")).isZero();
        assertCode(() -> sampling.review(sample.sample().id(), c.caseId, new SampleReviewRequest("NO_FINDING", null)), "SAMPLE_CASE_ALREADY_REVIEWED");
        assertCode(() -> sampling.drawOnDemand(new SampleRequest(YearMonth.now(ZoneId.of("Africa/Cairo")).plusMonths(1).toString(), 5)), "SAMPLE_MONTH_INVALID");

        // The monthly sample is drawn once per month.
        sampling.drawMonthly();
        assertThat(sampling.drawMonthly()).isZero();
        assertThat(count("SELECT COUNT(*) FROM audit_samples WHERE kind='MONTHLY'")).isEqualTo(1);
    }

    // ---------- helpers ----------

    /** A discharged case whose final invoice (103,000) carried a 3,000 unapproved extra, reconciled; optionally at a given facility. */
    private Arrived settledWithExtra(UUID atFacility) {
        if (atFacility != null) nextPatient();
        Arrived c = discharged("103000.00");
        UUID facility = c.facilityId;
        if (atFacility != null) {
            em.flush();
            jdbc.update("UPDATE facility_admissions SET facility_id=? WHERE case_id=?", atFacility, c.caseId);
            em.flush(); em.clear();
            facility = atFacility;
        }
        asFinance();
        reconciliations.open(c.caseId);
        reconciliations.submit(c.caseId, new SubmitReconciliationRequest(List.of(
                new InvoiceLineRequest("Cardiac package", new BigDecimal("100000.00"), "PACKAGE", null, null),
                new InvoiceLineRequest("Extra night", new BigDecimal("3000.00"), "NONE", null, null)), new BigDecimal("97750.00"), null));
        return new Arrived(c.caseId, c.estimateVersionId, c.finalVersionId, c.reviewId, facility);
    }

    /** The fixture binds one patient subject; release it so the test can take a second case. */
    private void nextPatient() {
        em.flush();
        jdbc.update("UPDATE patient_profiles SET external_subject=NULL WHERE external_subject=?", PATIENT);
    }

    /** The case closed now (as the follow-up scheduler would close it), with its status history row. */
    private void closed(UUID caseId) {
        em.flush();
        String from = jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId);
        jdbc.update("UPDATE medical_cases SET status='CLOSED' WHERE id=?", caseId);
        jdbc.update("INSERT INTO case_status_history(id,case_id,from_status,to_status,actor_subject,actor_role,reason,created_at) VALUES(?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), caseId, from, "CLOSED", "SYSTEM", "SYSTEM", "Follow-up completed", Instant.now());
        em.clear();
    }

    private UUID approvedPackage(UUID facility) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO facility_packages(id,facility_id,procedure_code,name,care_category,min_egp,max_egp,inclusions,valid_from,version,approval_status,
                    proposed_by,created_at,decided_by,decided_at) VALUES(?,?,'PCI-1','Angioplasty','cardiology',90000,110000,'Stay and cath lab',?,1,'APPROVED','ops',?,'fm',?)""",
                id, facility, LocalDate.now().minusDays(1), Instant.now(), Instant.now());
        return id;
    }

    /** A verified, available cardiology consultant with a current credential and no declaration. */
    private UUID consultant(String subject) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                id, subject, subject, subject, "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",
                UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now());
        return id;
    }

    private UUID doctorId() { return jdbc.queryForObject("SELECT id FROM practitioner_profiles WHERE external_subject=?", UUID.class, DOCTOR); }

    private static DeclarationRequest declaration(AffiliationLineRequest... lines) {
        return new DeclarationRequest(List.of(lines), true, ConsultantAffiliationService.ATTESTATION_VERSION);
    }

    private static FinalQuoteRequest quote(UUID review) { return new FinalQuoteRequest(review, "EGP", null, "Excl", "Deposit", "Refund", "Consent", null, null); }

    private static void assertCode(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, String code) {
        assertThatThrownBy(call).isInstanceOf(ApiException.class).extracting("code").isEqualTo(code);
    }
}
