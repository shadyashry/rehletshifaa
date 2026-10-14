package com.rehletshifaa.facility;

import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.facility.api.FacilityDtos.DecisionRequest;
import com.rehletshifaa.facility.api.FacilityDtos.DirectoryFacility;
import com.rehletshifaa.facility.api.FacilityDtos.DirectoryPackage;
import com.rehletshifaa.facility.api.FacilityDtos.FacilityRequest;
import com.rehletshifaa.facility.api.FacilityDtos.FacilityStatusRequest;
import com.rehletshifaa.facility.api.FacilityDtos.PackageRequest;
import com.rehletshifaa.facility.application.FacilityCatalogService;
import com.rehletshifaa.facility.application.FacilityDirectory;
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

/** P0-5 session 3: the picker sees active facilities and their priceable packages only, as reference data; nothing commercial beyond the ranges. */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class FacilityDirectoryTest {
    @Autowired FacilityCatalogService catalog;
    @Autowired FacilityDirectory directory;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    private void signIn(String subject, Role... roles) { TestPrincipals.signIn(jdbc, crypto, subject, roles); }

    private UUID facility(String name) {
        return catalog.create(new FacilityRequest(name, "Cairo", "HOSPITAL", "NET_30", "Invoice", "Quality office", "quality@" + name.toLowerCase().replace(' ', '-') + ".test", null)).id();
    }

    private UUID propose(UUID facilityId, String code, String careArea, LocalDate validFrom, LocalDate validTo) {
        return catalog.propose(facilityId, new PackageRequest(code, code + " package", careArea, new BigDecimal("100000"), new BigDecimal("150000"), "Theatre, ICU", null, validFrom, validTo)).id();
    }

    @Test void listsActiveFacilitiesWithPriceablePackagesOnlyAndNothingCommercialBeyondTheRange() {
        signIn("ops-subject", Role.CONSULTANT_OPERATIONS_MANAGER);
        UUID open = facility("Nile Heart Hospital"), suspended = facility("Closed Clinic");
        UUID approved = propose(open, "CABG", "cardiology", LocalDate.now(), null);
        UUID expired = propose(open, "OLD", "cardiology", LocalDate.now().minusYears(2), LocalDate.now().minusDays(1));
        UUID future = propose(open, "NEXT", "cardiology", LocalDate.now().plusDays(1), null);
        propose(open, "TKR", "general-surgery", LocalDate.now(), null); // stays pending: not priceable
        UUID onSuspended = propose(suspended, "CABG", "cardiology", LocalDate.now(), null);
        signIn("finance-manager", Role.FINANCE_MANAGER);
        for (UUID id : new UUID[] {approved, expired, future}) catalog.approve(open, id, new DecisionRequest(null));
        catalog.approve(suspended, onSuspended, new DecisionRequest(null));
        signIn("ops-subject", Role.CONSULTANT_OPERATIONS_MANAGER);
        catalog.setStatus(suspended, new FacilityStatusRequest("SUSPENDED"));

        signIn("doctor-subject", Role.CONSULTANT);
        var listed = directory.directory(null);
        assertThat(listed).extracting(DirectoryFacility::id).contains(open).doesNotContain(suspended);
        DirectoryFacility nile = listed.stream().filter(f -> f.id().equals(open)).findFirst().orElseThrow();
        assertThat(nile.name()).isEqualTo("Nile Heart Hospital");
        assertThat(nile.packages()).extracting(DirectoryPackage::id).containsExactly(approved);
        assertThat(nile.packages().get(0).minEgp()).isEqualByComparingTo("100000.00");
        // Name lookups for the views that store only ids (travel plan, treatment episode, package lines).
        assertThat(directory.names(java.util.List.of(open, suspended))).containsEntry(open, "Nile Heart Hospital").containsEntry(suspended, "Closed Clinic");
        assertThat(directory.facilityNamesOfPackages(java.util.List.of(approved, UUID.randomUUID()))).containsExactly(java.util.Map.entry(approved, "Nile Heart Hospital"));
        // Filtered by care area: no cardiology package means an empty list for that facility, not a missing facility.
        assertThat(directory.directory("general-surgery")).filteredOn(f -> f.id().equals(open)).singleElement().satisfies(f -> assertThat(f.packages()).isEmpty());

        signIn("coordinator-subject", Role.COORDINATOR);
        assertThat(directory.directory(null)).isNotEmpty();
        signIn("operations-subject", Role.OPERATIONS);
        assertThat(directory.directory(null)).isNotEmpty();
        // The full record (contacts, settlement terms) stays behind FACILITY_READ.
        assertThatThrownBy(() -> catalog.list()).isInstanceOf(ApiException.class);
        signIn("patient-subject", Role.PATIENT);
        assertThatThrownBy(() -> directory.directory(null)).isInstanceOf(ApiException.class);
    }

    @Test void onlyAnActiveFacilityMayBeNamedByAPlanOrARecord() {
        signIn("ops-subject", Role.CONSULTANT_OPERATIONS_MANAGER);
        UUID open = facility("Delta Surgical"), suspended = facility("Paused Hospital");
        catalog.setStatus(suspended, new FacilityStatusRequest("SUSPENDED"));
        assertThat(directory.active(open)).isPresent();
        assertThat(directory.active(suspended)).isEmpty();
        assertThat(directory.active(UUID.randomUUID())).isEmpty();
        assertThat(directory.active(null)).isEmpty();
    }
}
