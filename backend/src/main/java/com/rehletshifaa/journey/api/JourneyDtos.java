package com.rehletshifaa.journey.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class JourneyDtos {
    private JourneyDtos() {}
    public record ClaimRequest(@NotBlank @Pattern(regexp="[0-9]{6}") String code) {}
    public record ClaimCaseRequest(@NotBlank @Pattern(regexp="RS-[0-9]{4}-[0-9]{6}")String caseNumber,@NotBlank @Pattern(regexp="[0-9]{6}")String code) {}
    public record TransitionRequest(@NotBlank String targetStatus,@Size(max=1000)String reason,@NotNull Long expectedVersion) {}
    public record AssignmentRequest(@NotBlank @Size(max=255)String assigneeSubject,@NotBlank String assigneeRole,@NotBlank String assignmentType,@Size(max=100)String pod,@NotBlank @Size(max=500)String reason) {}
    public record MessageRequest(@NotBlank String threadType,@NotBlank @Size(max=10000)String body,@Pattern(regexp="en|ar")String language,boolean internalOnly) {}
    public record TaskRequest(@NotBlank @Size(max=80)String taskType,@NotBlank @Size(max=240)String title,@Size(max=10000)String description,@Size(max=255)String ownerSubject,@Size(max=40)String ownerRole,@NotBlank String priority,boolean blocking,Instant dueAt) {}
    public record CompleteTaskRequest(@NotBlank @Size(max=10000)String evidence,@NotNull Long expectedVersion) {}
    public record ClinicalReviewRequest(@Size(max=20000)String caseSummary,@Size(max=80)String suitability,@Size(max=20000)String missingInformation,@Size(max=20000)String recommendedInvestigations,@Size(max=20000)String recommendedTreatment,@Size(max=20000)String alternatives,@Size(max=20000)String risksAndLimitations,@Size(max=20000)String expectedSequence,@Size(max=200)String expectedDuration,@Size(max=20000)String followUpRecommendation) {}
    public record ProposalItemRequest(@NotBlank String category,@NotBlank @Size(max=500)String description,@NotNull @DecimalMin("0.01")BigDecimal quantity,@NotNull @DecimalMin("0.00")BigDecimal unitPrice,boolean optional,Integer sortOrder) {}
    public record ProposalDraftRequest(@NotNull UUID clinicalReviewId,@Pattern(regexp="en|ar")String language,@Size(max=30000)String operationalPlan,@Pattern(regexp="[A-Z]{3}")String currency,@Size(max=20000)String includedServices,@Size(max=20000)String excludedServices,@Size(max=20000)String paymentTerms,@Size(max=20000)String refundTerms,@Size(max=20000)String disclaimers,Instant validUntil,@NotEmpty List<@Valid ProposalItemRequest> items) {}
    public record ProposalDecisionRequest(@NotBlank @Pattern(regexp="ACCEPTED|DECLINED|REVISION_REQUESTED")String decision,List<UUID>selectedOptionalItemIds,@Size(max=10000)String comment) {}
    public record TravelPlanRequest(Instant plannedArrival,Instant confirmedArrival,@Size(max=80)String visaStatus,@Size(max=5000)String flightDetails,@Size(max=5000)String airportReception,@Size(max=5000)String accommodation,@Size(max=5000)String localTransport,@Size(max=5000)String companionDetails,@Size(max=300)String facility,@Size(max=5000)String exceptions,@NotBlank String status) {}
    public record TreatmentRequest(@NotBlank @Size(max=300)String facility,UUID practitionerId,Instant startAt,Instant endAt,@NotBlank String status,@Size(max=20000)String plannedProcedures,@Size(max=20000)String actualProcedures,@Size(max=20000)String milestones,@Size(max=20000)String complications,boolean dischargeReady,UUID dischargeDocumentId) {}
    public record FollowUpRequest(UUID treatmentEpisodeId,UUID practitionerId,@NotNull Instant dueAt,@NotBlank String mode,@Size(max=20000)String requiredTests,@Size(max=20000)String instructions) {}
    public record PractitionerRequest(@NotBlank @Size(max=160)String legalName,@NotBlank @Size(max=160)String displayName,@Size(max=255)String externalSubject,@Size(max=100)String registrationNumber,@Size(max=120)String specialty,@Size(max=160)String subspecialty,@Size(max=10000)String qualifications,@Size(max=10000)String appointments,@Size(max=10000)String hospitalPrivileges,@Size(max=300)String languages,@Size(max=10000)String approvedProcedures,@Size(max=255)String indemnityReference,@Size(max=40)String contractStatus,@Size(max=40)String availabilityStatus,@Positive Integer expectedReviewHours) {}
    public record CredentialRequest(@NotBlank @Size(max=80)String credentialType,@Size(max=160)String referenceNumber,@Size(max=500)String source,UUID evidenceDocumentId,Instant issuedAt,Instant expiresAt) {}
    public record CaseView(UUID id,String caseNumber,String status,String patientName,String country,String preferredLanguage,Instant createdAt,Instant updatedAt,long version,String coordinatorSubject,String doctorSubject,String coordinatorName) {}
    public record StaffRequest(@NotBlank @Size(max=160)String name,@NotBlank @Size(max=255)String externalSubject,@Size(max=40)String role) {}
    public record ReviewDecisionRequest(@NotBlank String decision,@Size(max=20000)String recommendedTreatment,@Size(max=20000)String risksAndLimitations) {}
    public record SendProposalResponse(UUID versionId,String token,String patientWhatsapp,String patientEmail,String caseNumber) {}
    public record PublicProposalView(UUID caseId,String caseNumber,String patientName,String currency,List<ProposalItemView>items,Instant validUntil,boolean signed,String recommendedTreatment,String risksAndLimitations) {}
    public record SignProposalRequest(@NotBlank @Size(max=160)String signatureName,UUID signedDocumentId) {}
    public record TimelineEvent(String type,String label,Instant occurredAt,String status) {}
    public record MessageView(UUID id,String threadType,String senderRole,String body,String language,boolean internalOnly,Instant createdAt) {}
    public record TaskView(UUID id,String type,String title,String description,String ownerRole,String priority,String status,boolean blocking,Instant dueAt,long version) {}
    public record ProposalView(UUID proposalId,UUID versionId,int versionNumber,String status,String language,String currency,Instant validUntil,String operationalPlan,String includedServices,String excludedServices,String paymentTerms,String refundTerms,String disclaimers,List<ProposalItemView>items) {}
    public record ProposalItemView(UUID id,String category,String description,BigDecimal quantity,BigDecimal unitPrice,boolean optional) {}
    public record AssignmentView(UUID id,String assigneeSubject,String assigneeRole,String assignmentType,String status,Instant assignedAt,long version) {}
    public record VerifiedDoctorView(String subject,String displayName,String specialty,String subspecialty,String availabilityStatus,String careCategory) {}
    public record CareCategoryView(String slug,String nameEn,String nameAr) {}
    public record ClinicalReviewView(UUID id,int versionNumber,String status,String suitability,String recommendedTreatment,String risksAndLimitations,Instant createdAt) {}
    public record CaseWorkspace(CaseView caseSummary,List<TimelineEvent>timeline,List<TaskView>tasks,List<MessageView>messages,List<AssignmentView>assignments,List<ClinicalReviewView>clinicalReviews,ProposalView proposal) {}
    public record IdResponse(UUID id,String status) {}
}
