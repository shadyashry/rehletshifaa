package com.rehletshifaa.facility.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.facility.api.FacilityDtos.DirectoryFacility;
import com.rehletshifaa.facility.api.FacilityDtos.DirectoryPackage;
import com.rehletshifaa.facility.domain.Facility;
import com.rehletshifaa.facility.domain.FacilityPackage;
import com.rehletshifaa.facility.infrastructure.FacilityPackageRepository;
import com.rehletshifaa.facility.infrastructure.FacilityRepository;
import com.rehletshifaa.facility.infrastructure.FacilityPackageSuspensionRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The facility directory as pickers see it (P0-5 session 3): active facilities with their Finance-approved, in-validity
 * packages, and nothing commercial beyond the approved price ranges (no contacts, no settlement terms). It is reference
 * data for everyone who builds a case (consultants, coordinators, Operations), hence {@code REFERENCE_DATA_READ}; the
 * full record stays behind {@code FACILITY_READ} in the Control Center.
 */
@Service
public class FacilityDirectory implements com.rehletshifaa.clinic.application.FacilityNames {
    private final FacilityRepository facilities;
    private final FacilityPackageRepository packages;
    private final Authority authority;
    private final Clock clock;
    private final FacilityPackageSuspensionRepository suspensions;

    public FacilityDirectory(FacilityRepository facilities, FacilityPackageRepository packages, Authority authority, Clock clock,
                             FacilityPackageSuspensionRepository suspensions) {
        this.facilities = facilities; this.packages = packages; this.authority = authority; this.clock = clock; this.suspensions = suspensions;
    }

    /** The facility a travel plan or treatment record may name: it exists and is active. No authorization: the case action was. */
    public Optional<Facility> active(UUID facilityId) {
        return facilityId == null ? Optional.empty() : facilities.findById(facilityId).filter(f -> f.getStatus() == Facility.Status.ACTIVE);
    }

    /** Facility names by id, for views that store only the id (travel plan, treatment episode). No authorization: the case read was. */
    @Override
    public Map<UUID, String> names(java.util.Collection<UUID> facilityIds) {
        if (facilityIds.isEmpty()) return Map.of();
        return facilities.findAllById(facilityIds).stream().collect(Collectors.toMap(Facility::getId, Facility::getName));
    }

    /** Facility names by package id, so a proposal line priced from a package says whose approved price it carries. */
    public Map<UUID, String> facilityNamesOfPackages(java.util.Collection<UUID> packageIds) {
        if (packageIds.isEmpty()) return Map.of();
        List<FacilityPackage> found = packages.findAllById(packageIds);
        Map<UUID, String> names = names(found.stream().map(FacilityPackage::getFacilityId).distinct().toList());
        return found.stream().filter(p -> names.containsKey(p.getFacilityId())).collect(Collectors.toMap(FacilityPackage::getId, p -> names.get(p.getFacilityId())));
    }

    /** Active facilities, each with the packages priceable today (optionally only those of one care area). */
    public List<DirectoryFacility> directory(String careArea) {
        authority.authorize(Permission.REFERENCE_DATA_READ);
        LocalDate today = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
        List<Facility> active = facilities.findAllByOrderByNameAscCityAsc().stream().filter(f -> f.getStatus() == Facility.Status.ACTIVE).toList();
        if (active.isEmpty()) return List.of();
        String area = careArea == null || careArea.isBlank() ? null : careArea.trim();
        // P1-19: a facility whose packages are suspended pending review is still a destination, with no package to pick.
        java.util.Set<UUID> suspended = suspensions.findByLiftedAtIsNull().stream().map(s -> s.getFacilityId()).collect(Collectors.toSet());
        Map<UUID, List<DirectoryPackage>> byFacility = packages.findByFacilities(active.stream().map(Facility::getId).toList()).stream()
                .filter(FacilityPackage::isApproved)
                .filter(p -> !suspended.contains(p.getFacilityId()))
                .filter(p -> !p.getValidFrom().isAfter(today) && (p.getValidTo() == null || !p.getValidTo().isBefore(today)))
                .filter(p -> area == null || area.equals(p.getCareCategory()))
                .collect(Collectors.groupingBy(FacilityPackage::getFacilityId, Collectors.mapping(
                        p -> new DirectoryPackage(p.getId(), p.getProcedureCode(), p.getName(), p.getCareCategory(), p.getMinEgp(), p.getMaxEgp(), p.getValidTo()),
                        Collectors.toList())));
        return active.stream().map(f -> new DirectoryFacility(f.getId(), f.getName(), f.getCity(), f.getKind().name(), f.getAccreditationStatus().name(),
                byFacility.getOrDefault(f.getId(), List.of()))).toList();
    }
}
