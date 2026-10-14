package com.rehletshifaa.facility.api;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Control Center contracts for facilities and their package catalogue (P0-5). Enum-valued fields travel as their names. */
public final class FacilityDtos {
    private FacilityDtos() {}

    public record FacilityRequest(@NotBlank @Size(max = 200) String name, @NotBlank @Size(max = 120) String city,
                                  @NotBlank @Size(max = 40) String kind, @NotBlank @Size(max = 40) String settlementTerms,
                                  @Size(max = 1000) String settlementNotes, @Size(max = 160) String contactName,
                                  @Size(max = 255) @Email String contactEmail, @Size(max = 40) String contactPhone) {}

    public record FacilityStatusRequest(@NotBlank @Size(max = 20) String status) {}

    public record AccreditationRequest(@NotBlank @Size(max = 80) String body, @Size(max = 160) String referenceNumber,
                                       LocalDate issuedOn, @NotNull LocalDate expiresOn) {}

    public record PackageRequest(@NotBlank @Size(max = 40) String procedureCode, @NotBlank @Size(max = 200) String name,
                                 @NotBlank @Size(max = 60) String careCategory,
                                 @NotNull @DecimalMin("0") BigDecimal minEgp, @NotNull @DecimalMin("0") BigDecimal maxEgp,
                                 @NotBlank @Size(max = 2000) String inclusions, @Size(max = 2000) String exclusions,
                                 @NotNull LocalDate validFrom, LocalDate validTo) {}

    /** Finance's note on an approval or rejection, or Consultant Operations' reason for retiring; required on rejection. */
    public record DecisionRequest(@Size(max = 500) String note) {}

    public record AccreditationView(UUID id, String body, String referenceNumber, LocalDate issuedOn, LocalDate expiresOn,
                                    String status, String recordedBy, Instant createdAt, String withdrawnBy, Instant withdrawnAt) {}

    public record PackageView(UUID id, UUID facilityId, String facilityName, String procedureCode, String name, String careCategory,
                              BigDecimal minEgp, BigDecimal maxEgp, String inclusions, String exclusions, LocalDate validFrom, LocalDate validTo,
                              int version, String approvalStatus, String proposedBy, Instant createdAt,
                              String decidedBy, Instant decidedAt, String decisionNote) {}

    public record FacilityView(UUID id, String name, String city, String kind, String status, String accreditationStatus,
                               String contactName, String contactEmail, String contactPhone, String settlementTerms, String settlementNotes,
                               String createdBy, Instant createdAt, String updatedBy, Instant updatedAt,
                               List<AccreditationView> accreditations, List<PackageView> packages) {}

    public record CareAreaView(String slug, String nameEn, String nameAr) {}

    /** The picker view (session 3): approved, in-validity packages with their ranges; no contacts or settlement terms. */
    public record DirectoryPackage(UUID id, String procedureCode, String name, String careCategory, BigDecimal minEgp, BigDecimal maxEgp, LocalDate validTo) {}

    public record DirectoryFacility(UUID id, String name, String city, String kind, String accreditationStatus, List<DirectoryPackage> packages) {}
}
