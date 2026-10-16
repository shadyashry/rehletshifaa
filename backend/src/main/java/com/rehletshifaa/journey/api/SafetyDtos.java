package com.rehletshifaa.journey.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

/**
 * P1-13 (review 2026-10-14, A-05 and A-06): the wire contracts of the age band, the guardian delegation, case incidents and
 * reopening a closed case. Reasons, summaries and notes are free text that may hold clinical detail; none of them is ever
 * echoed into audit or notifications.
 */
public final class SafetyDtos {
    private SafetyDtos() {}

    // ---- age band and guardians (A-05) ----

    /** A coordinator records or corrects the patient's age band in intake review. */
    public record AgeBandRequest(@NotBlank @Pattern(regexp = "UNDER_12|AGE_12_17|AGE_18_64|AGE_65_PLUS") String ageBand) {}

    public record AgeBandView(UUID caseId, String ageBand, boolean minor) {}

    /** The guardian attaches (or replaces) the document that proves their authority; it must be a clean document of this case. */
    public record GuardianEvidenceRequest(@NotNull UUID documentId) {}

    /** The coordinator's decision on a guardian's evidence. A refusal drops the document link; the coordinator tells the guardian why through the case thread. */
    public record GuardianEvidenceDecision(@NotBlank @Pattern(regexp = "VERIFY|REJECT") String decision) {}

    /** What the coordinator (or the guardian) sees of a guardian delegation; never the evidence content. */
    public record GuardianView(UUID caseId, String ageBand, boolean minor, String state, String legalBasis, String relationship, UUID evidenceDocumentId,
                               Instant evidenceVerifiedAt, String evidenceVerifiedBy) {}

    // ---- incidents (A-06) ----

    /** The patient (or their representative) raises a concern from My Care: a complaint, or a health problem after treatment. */
    public record ConcernRequest(@NotBlank @Pattern(regexp = "COMPLAINT|ADVERSE_EVENT") String type,
                                 @NotBlank @Size(max = 2000) String summary) {}

    /** What the patient sees of their own concern: that it is received and where it stands, nothing internal. */
    public record ConcernView(UUID id, String type, String status, Instant raisedAt, Instant resolvedAt) {}

    /** The case team raises an incident it witnessed; DEATH is always CRITICAL. */
    public record IncidentRequest(@NotBlank @Pattern(regexp = "COMPLAINT|DISPUTE|ADVERSE_EVENT|DEATH") String type,
                                  @NotBlank @Pattern(regexp = "LOW|MEDIUM|HIGH|CRITICAL") String severity,
                                  @NotBlank @Size(max = 2000) String summary) {}

    public record IncidentAssignRequest(@NotBlank @Size(max = 255) String ownerSubject) {}
    public record IncidentSeverityRequest(@NotBlank @Pattern(regexp = "LOW|MEDIUM|HIGH|CRITICAL") String severity) {}
    public record IncidentResolveRequest(
            @NotBlank @Pattern(regexp = "NO_ACTION_NEEDED|EXPLAINED_TO_PATIENT|CORRECTIVE_ACTION|REFERRED_TO_PROVIDER|REFERRED_TO_AUTHORITY|WITHDRAWN_BY_PATIENT") String resolution,
            @NotBlank @Size(max = 2000) String note) {}

    /** An incident as managers and Compliance read it. The summary and the resolution note are decrypted for these readers only. */
    public record IncidentView(UUID id, UUID caseId, String caseNumber, String type, String severity, String status, String source, String caseStage,
                               String summary, Instant raisedAt, String raisedByRole, String ownerSubject, Instant ownerAssignedAt,
                               String resolution, String resolutionNote, String resolvedBy, Instant resolvedAt, Instant updatedAt) {}

    // ---- reopening (A-06) ----

    /** A manager or the case's Consultant reopens a CLOSED case into FOLLOW_UP; the incident link is optional. */
    public record ReopenRequest(@NotBlank @Pattern(regexp = "COMPLICATION_REPORTED|PATIENT_REQUEST|CLINICAL_FOLLOW_UP_NEEDED|INCIDENT_REVIEW") String reason,
                                UUID incidentId, @Size(max = 1000) String note) {}
}
