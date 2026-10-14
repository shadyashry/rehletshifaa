package com.rehletshifaa.facility.application;

import com.rehletshifaa.facility.domain.Facility;
import com.rehletshifaa.facility.domain.FacilityPackage;
import com.rehletshifaa.facility.infrastructure.FacilityPackageRepository;
import com.rehletshifaa.facility.infrastructure.FacilityRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

/**
 * The facility catalogue as a price source for the journey module (P0-5 session 2, review B-02 / A-07): a package is
 * priceable only while Finance has approved it, today lies inside its validity and its facility is active. Called from
 * the consultant's cost estimate and again when the proposal is built, so a package retired in between falls back to the
 * Finance gate instead of releasing on a stale approval. No authorization here: the caller has already authorized the
 * case action, and nothing about a package is confidential to staff.
 */
@Service
public class FacilityPackagePricing {
    private final FacilityPackageRepository packages;
    private final FacilityRepository facilities;

    public FacilityPackagePricing(FacilityPackageRepository packages, FacilityRepository facilities) {
        this.packages = packages; this.facilities = facilities;
    }

    public record ApprovedPackage(UUID id, UUID facilityId, String facilityName, String procedureCode, String name, String careCategory,
                                  BigDecimal minEgp, BigDecimal maxEgp) {}

    public Optional<ApprovedPackage> approved(UUID packageId, LocalDate today) {
        return packages.findById(packageId).filter(FacilityPackage::isApproved)
                .filter(p -> !p.getValidFrom().isAfter(today) && (p.getValidTo() == null || !p.getValidTo().isBefore(today)))
                .flatMap(p -> facilities.findById(p.getFacilityId()).filter(f -> f.getStatus() == Facility.Status.ACTIVE)
                        .map(f -> new ApprovedPackage(p.getId(), f.getId(), f.getName(), p.getProcedureCode(), p.getName(), p.getCareCategory(), p.getMinEgp(), p.getMaxEgp())));
    }
}
