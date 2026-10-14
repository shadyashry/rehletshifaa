package com.rehletshifaa.facility;

import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.facility.api.FacilityDtos.AccreditationRequest;
import com.rehletshifaa.facility.api.FacilityDtos.DecisionRequest;
import com.rehletshifaa.facility.api.FacilityDtos.FacilityRequest;
import com.rehletshifaa.facility.api.FacilityDtos.FacilityStatusRequest;
import com.rehletshifaa.facility.api.FacilityDtos.FacilityView;
import com.rehletshifaa.facility.api.FacilityDtos.PackageRequest;
import com.rehletshifaa.facility.api.FacilityDtos.PackageView;
import com.rehletshifaa.facility.application.FacilityCatalogService;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P0-5 (B-02 / A-07): Consultant Operations owns facilities, their accreditation and proposes package prices; a Finance
 * Manager approves a price once and never their own; a facility is never a user.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class FacilityCatalogServiceTest {
    @Autowired FacilityCatalogService catalog;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    private void signIn(String subject, Role... roles) { TestPrincipals.signIn(jdbc, crypto, subject, roles); }

    private FacilityView newFacility(String name) {
        return catalog.create(new FacilityRequest(name, "Cairo", "HOSPITAL", "NET_30", "Invoice after discharge", "Quality office", "quality@" + name.toLowerCase().replace(' ', '-') + ".test", "+20 2 1234 5678"));
    }

    private static PackageRequest cabg(String min, String max) {
        return new PackageRequest("cabg", "Coronary bypass package", "cardiology", new BigDecimal(min), new BigDecimal(max),
                "Theatre, 2 ICU nights, 5 ward days, anaesthesia", "Blood products", LocalDate.now(), null);
    }

    private static String code(Throwable e) { return ((ApiException) e).code(); }

    @Test void consultantOperationsOwnsTheRecordItsAccreditationAndProposesPrices() {
        signIn("ops-subject", Role.CONSULTANT_OPERATIONS_MANAGER);
        FacilityView facility = newFacility("Nile Heart Hospital");
        assertThat(facility.status()).isEqualTo("ACTIVE");
        assertThat(facility.accreditationStatus()).isEqualTo("NONE");
        assertThat(facility.kind()).isEqualTo("HOSPITAL");
        assertThatThrownBy(() -> newFacility("nile heart hospital")).isInstanceOf(ApiException.class).satisfies(e -> assertThat(code(e)).isEqualTo("FACILITY_DUPLICATE"));

        facility = catalog.recordAccreditation(facility.id(), new AccreditationRequest("JCI", "JCI-2026-001", LocalDate.now().minusYears(1), LocalDate.now().plusYears(2)));
        assertThat(facility.accreditationStatus()).isEqualTo("CURRENT");
        assertThat(facility.accreditations()).singleElement().satisfies(a -> assertThat(a.status()).isEqualTo("CURRENT"));
        UUID facilityId = facility.id();
        assertThatThrownBy(() -> catalog.recordAccreditation(facilityId, new AccreditationRequest("GAHAR", null, null, LocalDate.now().minusDays(1))))
                .isInstanceOf(ApiException.class).satisfies(e -> assertThat(code(e)).isEqualTo("VALID_EXPIRY_REQUIRED"));

        PackageView proposed = catalog.propose(facilityId, cabg("180000", "220000"));
        assertThat(proposed.approvalStatus()).isEqualTo("PENDING_FINANCE");
        assertThat(proposed.procedureCode()).isEqualTo("CABG");
        assertThat(proposed.version()).isEqualTo(1);
        assertThat(proposed.proposedBy()).isEqualTo("ops-subject");
        assertThatThrownBy(() -> catalog.propose(facilityId, cabg("1", "2"))).isInstanceOf(ApiException.class).satisfies(e -> assertThat(code(e)).isEqualTo("PACKAGE_PENDING_EXISTS"));
        assertThatThrownBy(() -> catalog.propose(facilityId, new PackageRequest("TKR", "Knee", "no-such-area", BigDecimal.ONE, BigDecimal.TEN, "x", null, LocalDate.now(), null)))
                .isInstanceOf(ApiException.class).satisfies(e -> assertThat(code(e)).isEqualTo("CARE_AREA_UNKNOWN"));
        assertThatThrownBy(() -> catalog.propose(facilityId, new PackageRequest("TKR", "Knee", "cardiology", BigDecimal.TEN, BigDecimal.ONE, "x", null, LocalDate.now(), null)))
                .isInstanceOf(ApiException.class).satisfies(e -> assertThat(code(e)).isEqualTo("PACKAGE_RANGE_INVALID"));

        // Consultant Operations never approves a price, and a facility is never a user: no account, role or assignment appeared.
        assertThatThrownBy(() -> catalog.approve(facilityId, proposed.id(), new DecisionRequest(null))).isInstanceOf(ApiException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM workforce_people WHERE subject LIKE 'facility%'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type IN ('FACILITY_CREATED','FACILITY_ACCREDITATION_RECORDED','FACILITY_PACKAGE_PROPOSED')", Integer.class)).isEqualTo(3);
        assertThat(catalog.pendingPackages()).extracting(PackageView::facilityName).containsExactly("Nile Heart Hospital");
    }

    @Test void financeManagerApprovesOnceAndANewVersionSupersedesTheApprovedOne() {
        signIn("ops-subject", Role.CONSULTANT_OPERATIONS_MANAGER);
        UUID facilityId = newFacility("Delta Surgical Centre").id();
        PackageView v1 = catalog.propose(facilityId, cabg("180000", "220000"));

        signIn("finance-manager", Role.FINANCE_MANAGER);
        assertThatThrownBy(() -> catalog.reject(facilityId, v1.id(), new DecisionRequest(" "))).isInstanceOf(ApiException.class).satisfies(e -> assertThat(code(e)).isEqualTo("DECISION_NOTE_REQUIRED"));
        PackageView approved = catalog.approve(facilityId, v1.id(), new DecisionRequest("Within the 2026 agreement"));
        assertThat(approved.approvalStatus()).isEqualTo("APPROVED");
        assertThat(approved.decidedBy()).isEqualTo("finance-manager");
        assertThatThrownBy(() -> catalog.approve(facilityId, v1.id(), null)).isInstanceOf(ApiException.class).satisfies(e -> assertThat(code(e)).isEqualTo("PACKAGE_NOT_PENDING"));
        // Finance maintains nothing on the facility record itself.
        assertThatThrownBy(() -> catalog.propose(facilityId, cabg("1", "2"))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> catalog.setStatus(facilityId, new FacilityStatusRequest("SUSPENDED"))).isInstanceOf(ApiException.class);

        signIn("ops-subject", Role.CONSULTANT_OPERATIONS_MANAGER);
        PackageView v2 = catalog.propose(facilityId, cabg("190000", "230000"));
        assertThat(v2.version()).isEqualTo(2);
        assertThat(catalog.get(facilityId).packages()).extracting(PackageView::approvalStatus).containsExactly("PENDING_FINANCE", "APPROVED");

        signIn("finance-manager", Role.FINANCE_MANAGER);
        PackageView rejected = catalog.reject(facilityId, v2.id(), new DecisionRequest("Above the agreed ceiling"));
        assertThat(rejected.approvalStatus()).isEqualTo("REJECTED");
        assertThat(catalog.get(facilityId).packages()).filteredOn(p -> p.version() == 1).singleElement().satisfies(p -> assertThat(p.approvalStatus()).isEqualTo("APPROVED"));

        signIn("ops-subject", Role.CONSULTANT_OPERATIONS_MANAGER);
        PackageView v3 = catalog.propose(facilityId, cabg("185000", "225000"));
        signIn("finance-manager", Role.FINANCE_MANAGER);
        catalog.approve(facilityId, v3.id(), null);
        var versions = catalog.get(facilityId).packages();
        assertThat(versions).filteredOn(p -> p.version() == 1).singleElement().satisfies(p -> { assertThat(p.approvalStatus()).isEqualTo("RETIRED"); assertThat(p.decisionNote()).isEqualTo("Superseded by version 3"); });
        assertThat(versions).filteredOn(p -> p.version() == 3).singleElement().satisfies(p -> assertThat(p.approvalStatus()).isEqualTo("APPROVED"));
        assertThat(catalog.pendingPackages()).isEmpty();
    }

    @Test void theProposerNeverApprovesTheirOwnPrice() {
        signIn("dual-subject", Role.CONSULTANT_OPERATIONS_MANAGER, Role.FINANCE_MANAGER);
        UUID facilityId = newFacility("Alex Ortho Hospital").id();
        PackageView own = catalog.propose(facilityId, cabg("100000", "120000"));
        assertThatThrownBy(() -> catalog.approve(facilityId, own.id(), null)).isInstanceOf(ApiException.class).satisfies(e -> assertThat(code(e)).isEqualTo("PACKAGE_SELF_APPROVAL"));
        assertThat(catalog.get(facilityId).packages()).singleElement().satisfies(p -> assertThat(p.approvalStatus()).isEqualTo("PENDING_FINANCE"));
    }

    @Test void readersReadAndNobodyElseSeesFacilities() {
        signIn("ops-subject", Role.CONSULTANT_OPERATIONS_MANAGER);
        UUID facilityId = newFacility("Red Sea Rehab").id();

        signIn("finance-staff", Role.FINANCE);
        assertThat(catalog.list()).extracting(FacilityView::id).contains(facilityId);
        assertThatThrownBy(() -> catalog.update(facilityId, new FacilityRequest("X", "Y", "CLINIC", "PREPAID", null, null, null, null))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> catalog.propose(facilityId, cabg("1", "2"))).isInstanceOf(ApiException.class);

        signIn("auditor", Role.COMPLIANCE_AUDITOR);
        assertThat(catalog.get(facilityId).name()).isEqualTo("Red Sea Rehab");

        signIn("coordinator-subject", Role.COORDINATOR);
        assertThatThrownBy(() -> catalog.list()).isInstanceOf(ApiException.class);
        signIn("admin-subject", Role.SYSTEM_ADMINISTRATOR);
        assertThatThrownBy(() -> catalog.list()).isInstanceOf(ApiException.class);
    }

    @Test void withdrawingTheLastAccreditationAndSuspendingTheFacilityAreRecorded() {
        signIn("ops-subject", Role.CONSULTANT_OPERATIONS_MANAGER);
        FacilityView facility = newFacility("Giza Day Surgery");
        UUID facilityId = facility.id();
        facility = catalog.recordAccreditation(facilityId, new AccreditationRequest("GAHAR", null, null, LocalDate.now().plusDays(30)));
        UUID accreditationId = facility.accreditations().get(0).id();
        facility = catalog.withdrawAccreditation(facilityId, accreditationId);
        assertThat(facility.accreditationStatus()).isEqualTo("NONE");
        assertThat(facility.accreditations()).singleElement().satisfies(a -> { assertThat(a.status()).isEqualTo("WITHDRAWN"); assertThat(a.withdrawnBy()).isEqualTo("ops-subject"); });
        assertThatThrownBy(() -> catalog.withdrawAccreditation(facilityId, accreditationId)).isInstanceOf(ApiException.class).satisfies(e -> assertThat(code(e)).isEqualTo("ACCREDITATION_NOT_CURRENT"));

        facility = catalog.setStatus(facilityId, new FacilityStatusRequest("SUSPENDED"));
        assertThat(facility.status()).isEqualTo("SUSPENDED");
        assertThatThrownBy(() -> catalog.propose(facilityId, cabg("1", "2"))).isInstanceOf(ApiException.class).satisfies(e -> assertThat(code(e)).isEqualTo("FACILITY_SUSPENDED"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type IN ('FACILITY_ACCREDITATION_WITHDRAWN','FACILITY_SUSPENDED') AND actor_subject='ops-subject'", Integer.class)).isEqualTo(2);
    }
}
