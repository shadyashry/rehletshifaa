package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.facility.api.FacilityDtos.DecisionRequest;
import com.rehletshifaa.facility.api.FacilityDtos.FacilityRequest;
import com.rehletshifaa.facility.api.FacilityDtos.PackageRequest;
import com.rehletshifaa.facility.application.FacilityCatalogService;
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
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P0-5 session 2 (B-02 / A-07): the Finance gate matrix with the two pre-approved sources. A line from a Finance-approved
 * facility package, and a manual line inside the care area's pre-approved band, release without a Finance work item; a
 * manual line outside the band, a missing band, or a package retired before the proposal is built keep the gate.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class FacilityPackageLineGateTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired FacilityCatalogService facilities;
    @Autowired CommercialPolicyService commercialPolicies;
    @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto; @Autowired EntityManager em;

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    private void authenticate(String subject, Role... roles) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, roles); }
    private int raw(String sql, Object... args) { em.flush(); int changed = jdbc.update(sql, args); em.clear(); return changed; }

    private record Approved(UUID facilityId, UUID packageId) {}

    /** Consultant Operations proposes a CABG package of EGP 150,000–200,000 and a Finance Manager approves it. */
    private Approved approvedPackage() {
        authenticate("ops-subject", Role.CONSULTANT_OPERATIONS_MANAGER);
        UUID facilityId = facilities.create(new FacilityRequest("Nile Heart Hospital " + UUID.randomUUID(), "Cairo", "HOSPITAL", "NET_30", null, null, null, null)).id();
        UUID packageId = facilities.propose(facilityId, new PackageRequest("CABG", "Bypass package", "cardiology", new BigDecimal("150000"), new BigDecimal("200000"),
                "Theatre, 2 ICU nights, 5 ward days", null, LocalDate.now(), null)).id();
        authenticate("finance-manager", Role.FINANCE_MANAGER);
        facilities.approve(facilityId, packageId, new DecisionRequest("2026 agreement"));
        SecurityContextHolder.clearContext();
        return new Approved(facilityId, packageId);
    }

    /** A cardiology case accepted by a verified consultant, up to the clinical review that carries the given lines. */
    private UUID reviewedCase(List<CostEstimateItem> lines) throws Exception {
        var created = cases.create(new CreateCaseRequest("Case", "Patient", "Kenya", "+2547000000" + (int) (Math.random() * 90 + 10), "Cardiac reports", "en", true, null, "gate@local.test", "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        UUID caseId = created.caseId();
        authenticate("coordinator-subject", Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, caseId, "coordinator-subject")) journey.claimCoordinatorCase(caseId, "cardiac-pod");
        long v = journey.workspace(caseId).caseSummary().version();
        journey.transition(caseId, new TransitionRequest("READY_FOR_CONSULTANT", "ready", v));
        seedDoctor(); com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "coordinator-subject", "COORDINATOR", crypto.encrypt("Layla Hassan"));
        var assignment = journey.assign(caseId, new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "cardiac-pod", "Clinical review"));
        authenticate("doctor-subject", Role.CONSULTANT);
        journey.acceptDoctorAssignment(caseId, assignment.id(), new AssignmentDecisionRequest(true, null));
        journey.reviewDecision(caseId, new ReviewDecisionRequest("ACCEPT", "Recommended intervention", "Standard risks", lines, "EGP"));
        em.flush(); SecurityContextHolder.clearContext();
        return caseId;
    }

    private void seedDoctor() {
        if (jdbc.queryForObject("SELECT count(*) FROM practitioner_profiles WHERE external_subject='doctor-subject'", Integer.class) > 0) return;
        UUID id = UUID.randomUUID();
        raw("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                id, "doctor-subject", "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now());
        raw("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)", UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now());
    }

    private ProposalView createProposal(UUID caseId) {
        UUID reviewId = jdbc.queryForObject("SELECT id FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'", UUID.class, caseId);
        authenticate("coordinator-subject", Role.COORDINATOR);
        return journey.createProposal(caseId, new ProposalDraftRequest(reviewId, "en", "Plan", "EGP", "Services", "None", "Deposit", "Refund", "Consent",
                Instant.now().plusSeconds(86400), List.of(new ProposalItemRequest("MEDICAL", "Line", BigDecimal.ONE, BigDecimal.ONE, false, 0)), null));
    }

    /** The version flag every downstream gate reads (work items, release, Finance approval). */
    private boolean requiresFinance(ProposalView p) { return Boolean.TRUE.equals(jdbc.queryForObject("SELECT requires_finance_approval FROM proposal_versions WHERE id=?", Boolean.class, p.versionId())); }

    private static CostEstimateItem packageLine(UUID packageId, String egp) { return new CostEstimateItem("Coronary bypass at the facility", new BigDecimal(egp), "EGP", null, null, null, packageId); }
    private static CostEstimateItem manualLine(String egp) { return new CostEstimateItem("Implant, manually priced", new BigDecimal(egp), "EGP"); }

    @Test void anApprovedFacilityPackageLineReleasesWithoutFinance() throws Exception {
        Approved pkg = approvedPackage();
        UUID caseId = reviewedCase(List.of(packageLine(pkg.packageId(), "180000")));
        ProposalView proposal = createProposal(caseId);
        assertThat(requiresFinance(proposal)).isFalse();
        assertThat(jdbc.queryForObject("SELECT source FROM proposal_items WHERE proposal_version_id=?", String.class, proposal.versionId())).isEqualTo("FACILITY_PACKAGE");
        assertThat(jdbc.queryForObject("SELECT provider_price_egp FROM proposal_items WHERE proposal_version_id=?", BigDecimal.class, proposal.versionId())).isEqualByComparingTo("180000.00");
        assertThat(jdbc.queryForObject("SELECT facility_package_id FROM proposal_items WHERE proposal_version_id=?", UUID.class, proposal.versionId())).isEqualTo(pkg.packageId());
        // The range travels with the line: the patient sees the marked-up band, never a bare point.
        assertThat(jdbc.queryForObject("SELECT unit_price_min_egp < unit_price_max_egp FROM proposal_items WHERE proposal_version_id=?", Boolean.class, proposal.versionId())).isTrue();
        // No Finance step: the coordinator releases straight away, with no Finance work item ever opened.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM case_tasks WHERE case_id=? AND owner_role='FINANCE' AND status IN ('OPEN','IN_PROGRESS')", Integer.class, caseId)).isZero();
        authenticate("coordinator-subject", Role.COORDINATOR);
        journey.releaseProposal(caseId, proposal.versionId()); em.flush();
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, proposal.versionId())).isNotIn("CLINICALLY_APPROVED", "FINANCE_APPROVED");
    }

    @Test void aPackageRetiredBeforeTheProposalFallsBackToTheFinanceGate() throws Exception {
        Approved pkg = approvedPackage();
        UUID caseId = reviewedCase(List.of(packageLine(pkg.packageId(), "180000")));
        authenticate("ops-subject", Role.CONSULTANT_OPERATIONS_MANAGER);
        facilities.retire(pkg.facilityId(), pkg.packageId(), new DecisionRequest("Facility stopped offering it"));
        ProposalView proposal = createProposal(caseId);
        assertThat(requiresFinance(proposal)).isTrue();
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThatThrownBy(() -> journey.releaseProposal(caseId, proposal.versionId())).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("FINANCE_APPROVAL_REQUIRED"));
    }

    @Test void thePackagePriceMustBeAnApprovedPackageInsideItsRange() throws Exception {
        Approved pkg = approvedPackage();
        assertThatThrownBy(() -> reviewedCase(List.of(packageLine(pkg.packageId(), "250000")))).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("FACILITY_PACKAGE_RANGE"));
        authenticate("ops-subject", Role.CONSULTANT_OPERATIONS_MANAGER);
        UUID pendingId = facilities.propose(pkg.facilityId(), new PackageRequest("TKR", "Knee", "cardiology", BigDecimal.ONE, BigDecimal.TEN, "x", null, LocalDate.now(), null)).id();
        assertThatThrownBy(() -> reviewedCase(List.of(packageLine(pendingId, "5")))).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("FACILITY_PACKAGE_INVALID"));
    }

    @Test void aManualLineInsideThePreApprovedBandReleasesWithoutFinanceAndOutsideItDoesNot() throws Exception {
        authenticate("finance-manager", Role.FINANCE_MANAGER);
        commercialPolicies.configure(new CommercialPolicyRequest("Cardiology with band", "cardiology", new BigDecimal("0.15"), new BigDecimal("5000")));
        SecurityContextHolder.clearContext();
        UUID inside = reviewedCase(List.of(manualLine("4800")));
        ProposalView insideProposal = createProposal(inside);
        assertThat(requiresFinance(insideProposal)).isFalse();
        assertThat(jdbc.queryForObject("SELECT source FROM proposal_items WHERE proposal_version_id=?", String.class, insideProposal.versionId())).isEqualTo("MANUAL");

        UUID outside = reviewedCase(List.of(manualLine("5000.01")));
        ProposalView proposal = createProposal(outside);
        assertThat(requiresFinance(proposal)).isTrue();
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThatThrownBy(() -> journey.releaseProposal(outside, proposal.versionId())).isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("FINANCE_APPROVAL_REQUIRED"));
    }

    @Test void withoutABandEveryManualLineStillWaitsForFinance() throws Exception {
        authenticate("finance-manager", Role.FINANCE_MANAGER);
        commercialPolicies.configure(new CommercialPolicyRequest("Cardiology, no band", "cardiology", new BigDecimal("0.15")));
        assertThatThrownBy(() -> commercialPolicies.configure(new CommercialPolicyRequest("Bad band", "cardiology", new BigDecimal("0.15"), new BigDecimal("-1"))))
                .isInstanceOf(ApiException.class).satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("MANUAL_BAND_INVALID"));
        SecurityContextHolder.clearContext();
        UUID caseId = reviewedCase(List.of(manualLine("100")));
        assertThat(requiresFinance(createProposal(caseId))).isTrue();
    }
}
