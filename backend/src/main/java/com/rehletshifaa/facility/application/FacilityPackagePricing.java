package com.rehletshifaa.facility.application;

import com.rehletshifaa.facility.domain.Facility;
import com.rehletshifaa.facility.domain.FacilityPackage;
import com.rehletshifaa.facility.infrastructure.FacilityPackageRepository;
import com.rehletshifaa.facility.infrastructure.FacilityRepository;
import com.rehletshifaa.facility.infrastructure.FacilityPackageSuspensionRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

/**
 * The facility catalogue as a price source for the journey module (P0-5 session 2, review B-02 / A-07): a package is
 * priceable only while Finance has approved it, today lies inside its validity, its facility is active and the facility's packages
 * are not suspended pending review (P1-19). Called from
 * the consultant's cost estimate and again when the proposal is built, so a package retired in between falls back to the
 * Finance gate instead of releasing on a stale approval. No authorization here: the caller has already authorized the
 * case action, and nothing about a package is confidential to staff.
 */
@Service
public class FacilityPackagePricing {
    private final FacilityPackageRepository packages;
    private final FacilityRepository facilities;
    private final FacilityPackageSuspensionRepository suspensions;

    public FacilityPackagePricing(FacilityPackageRepository packages, FacilityRepository facilities, FacilityPackageSuspensionRepository suspensions) {
        this.packages = packages; this.facilities = facilities; this.suspensions = suspensions;
    }

    public record ApprovedPackage(UUID id, UUID facilityId, String facilityName, String procedureCode, String name, String careCategory,
                                  BigDecimal minEgp, BigDecimal maxEgp) {}

    public Optional<ApprovedPackage> approved(UUID packageId, LocalDate today) {
        return packages.findById(packageId).filter(FacilityPackage::isApproved)
                .filter(p -> !p.getValidFrom().isAfter(today) && (p.getValidTo() == null || !p.getValidTo().isBefore(today)))
                // P1-19 (design §7.5): a facility whose packages are suspended pending review releases nothing without Finance.
                .filter(p -> !suspensions.existsByFacilityIdAndLiftedAtIsNull(p.getFacilityId()))
                .flatMap(p -> facilities.findById(p.getFacilityId()).filter(f -> f.getStatus() == Facility.Status.ACTIVE)
                        .map(f -> new ApprovedPackage(p.getId(), f.getId(), f.getName(), p.getProcedureCode(), p.getName(), p.getCareCategory(), p.getMinEgp(), p.getMaxEgp())));
    }
}
