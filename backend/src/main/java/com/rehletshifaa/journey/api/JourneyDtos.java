package com.rehletshifaa.journey.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class JourneyDtos {
    private JourneyDtos() {}
    public record TransitionRequest(@NotBlank String targetStatus,@Size(max=1000)String reason,@NotNull Long expectedVersion) {}
    public record AssignmentRequest(@NotBlank @Size(max=255)String assigneeSubject,@NotBlank String assigneeRole,@NotBlank @Pattern(regexp="PRIMARY|SECONDARY")String assignmentType,@Size(max=100)String pod,@NotBlank @Size(max=500)String reason) {}
    public record CoordinatorReassignmentRequest(@NotBlank @Size(max=255)String assigneeSubject,@NotBlank @Size(max=500)String reason) {}
    public record TravelPackageRequest(@NotNull Boolean requested) {}
    public record CareCategoryUpdateRequest(@NotBlank @Pattern(regexp="cardiology|rheumatology-rehabilitation|orthopedics")String careCategory,@NotNull Long expectedVersion,@Size(max=500)String reason) {}
    public record MessageRequest(@NotBlank @Pattern(regexp="PATIENT_COORDINATOR|COORDINATOR_DOCTOR|COORDINATOR_OPERATIONS|COORDINATOR_FINANCE")String threadType,@NotBlank @Size(max=10000)String body,@Pattern(regexp="en|ar")String language,boolean internalOnly) {}
    public record TaskRequest(@NotBlank @Size(max=80)String taskType,@NotBlank @Size(max=240)String title,@Size(max=10000)String description,@Size(max=255)String ownerSubject,@Size(max=40)String ownerRole,@NotBlank String priority,boolean blocking,Instant dueAt) {}
    public record CompleteTaskRequest(@NotBlank @Size(max=10000)String evidence,@NotNull Long expectedVersion) {}
    public record TaskVersionRequest(@NotNull Long expectedVersion) {}
    public record CancelTaskRequest(@NotBlank @Size(max=500)String reason,@NotNull Long expectedVersion) {}
    public record ReassignTaskRequest(@Size(max=255)String ownerSubject,@NotBlank @Size(max=40)String ownerRole,@NotNull Long expectedVersion) {}
    public record ClinicalReviewRequest(@Size(max=20000)String caseSummary,@Size(max=80)String suitability,@Size(max=20000)String missingInformation,@Size(max=20000)String recommendedInvestigations,@Size(max=20000)String recommendedTreatment,@Size(max=20000)String alternatives,@Size(max=20000)String risksAndLimitations,@Size(max=20000)String expectedSequence,@Size(max=200)String expectedDuration,@Size(max=20000)String followUpRecommendation) {}
    public record ProposalItemRequest(@NotBlank String category,@NotBlank @Size(max=500)String description,@NotNull @DecimalMin("0.01")BigDecimal quantity,@NotNull @DecimalMin("0.00")BigDecimal unitPrice,boolean optional,Integer sortOrder) {}
    public record ProposalDraftRequest(@NotNull UUID clinicalReviewId,@Pattern(regexp="en|ar")String language,@Size(max=30000)String operationalPlan,@NotBlank @Pattern(regexp="[A-Z]{3}")String currency,@Size(max=20000)String includedServices,@Size(max=20000)String excludedServices,@Size(max=20000)String paymentTerms,@Size(max=20000)String refundTerms,@Size(max=20000)String disclaimers,@NotNull @Future Instant validUntil,@NotEmpty List<@Valid ProposalItemRequest> items,@Size(max=20000)String coordinatorNotes) {}
    public record OperationsPlanRequest(@NotBlank @Size(max=30000)String plan) {}
    public record ProposalDecisionRequest(@NotBlank @Pattern(regexp="ACCEPTED|ACKNOWLEDGED|DECLINED|REVISION_REQUESTED")String decision,List<UUID>selectedOptionalItemIds,@Size(max=10000)String comment) {}
    public record TravelPlanRequest(Instant plannedArrival,Instant confirmedArrival,@Size(max=80)String visaStatus,@Size(max=5000)String flightDetails,@Size(max=5000)String airportReception,@Size(max=5000)String accommodation,@Size(max=5000)String localTransport,@Size(max=5000)String companionDetails,@Size(max=300)String facility,@Size(max=5000)String exceptions,@NotBlank @Pattern(regexp="PLANNING|CONFIRMED|ARRIVED")String status) {}
    public record TreatmentRequest(@NotBlank @Size(max=300)String facility,UUID practitionerId,@NotNull Instant startAt,Instant endAt,@NotBlank @Pattern(regexp="PLANNED|IN_PROGRESS|COMPLETED")String status,@Size(max=20000)String plannedProcedures,@Size(max=20000)String actualProcedures,@Size(max=20000)String milestones,@Size(max=20000)String complications,boolean dischargeReady,UUID dischargeDocumentId) {}
    public record FinalAssessmentRequest(@Size(max=20000)String recommendedTreatment,@Size(max=20000)String risksAndLimitations,@Size(max=50)List<@Valid CostEstimateItem>costEstimates) {}
    public record FinalQuoteRequest(@NotNull UUID clinicalReviewId,@NotBlank @Pattern(regexp="[A-Z]{3}")String currency,@Size(max=20000)String scopeChangeReason,@Size(max=20000)String excludedServices,@Size(max=20000)String paymentTerms,@Size(max=20000)String refundTerms,@Size(max=20000)String disclaimers,@NotNull @Future Instant validUntil,@Size(max=20000)String coordinatorNotes) {}
    public record ProcedureConsentRequest(@NotBlank @Size(max=20000)String exactText,@Pattern(regexp="en|ar")String language,@Size(max=40)String policyVersion,UUID relatedProposalVersionId,UUID evidenceDocumentId,@Size(max=300)String evidenceReference) {}
    public record EmergencyOverrideRequest(@NotBlank @Size(max=2000)String reason) {}
    public record FollowUpRequest(UUID treatmentEpisodeId,UUID practitionerId,@NotNull @Future Instant dueAt,@NotBlank @Pattern(regexp="VIDEO|PHONE|IN_PERSON")String mode,@Size(max=20000)String requiredTests,@Size(max=20000)String instructions) {}
    public record PractitionerRequest(@NotBlank @Size(max=160)String legalName,@NotBlank @Size(max=160)String displayName,@NotBlank @Size(max=255)String externalSubject,@Size(max=100)String registrationNumber,@Size(max=120)String specialty,@Size(max=160)String subspecialty,@Size(max=10000)String qualifications,@Size(max=10000)String appointments,@Size(max=10000)String hospitalPrivileges,@Size(max=300)String languages,@Size(max=10000)String approvedProcedures,@Size(max=255)String indemnityReference,@Size(max=40)String contractStatus,@Pattern(regexp="AVAILABLE|UNAVAILABLE|ON_LEAVE")String availabilityStatus,@Positive Integer expectedReviewHours,@Pattern(regexp="CONSULTANT|STAFF")String practitionerType,@Size(max=60)String careCategory) {}
    public record CredentialRequest(@NotBlank @Size(max=80)String credentialType,@NotBlank @Size(max=160)String referenceNumber,@NotBlank @Size(max=500)String source,UUID evidenceDocumentId,Instant issuedAt,Instant expiresAt) {}
    public record CaseView(UUID id,String caseNumber,String status,String patientName,String country,String preferredLanguage,String careCategory,Instant createdAt,Instant updatedAt,long version,String coordinatorSubject,String doctorSubject,String coordinatorName,String doctorName,boolean travelPackageRequested) {}
    public record StaffRequest(@NotBlank @Size(max=160)String name,@NotBlank @Size(max=255)String externalSubject,@Size(max=40)String role) {}
    // catalogServiceId set => the service was picked from the consultant's approved catalog (no Finance approval);
    // null => a manually entered service (Finance approval required before the quote can reach the patient).
    public record CostEstimateItem(@NotBlank @Size(max=500)String serviceDescription,@NotNull @DecimalMin("0.00")BigDecimal estimatedCost,@NotBlank @Pattern(regexp="[A-Z]{3}")String currency,UUID catalogServiceId) {
        public CostEstimateItem(String serviceDescription,BigDecimal estimatedCost,String currency){this(serviceDescription,estimatedCost,currency,null);}
    }
    public record ReviewDecisionRequest(@NotBlank @Pattern(regexp="INFO|NOT_SUITABLE|RETURN_TO_COORDINATOR|REASSIGN|ACCEPT")String decision,@Size(max=20000)String recommendedTreatment,@Size(max=20000)String risksAndLimitations,@Size(max=50)List<@Valid CostEstimateItem>costEstimates) {}
    // Patient-facing proposal view. Never exposes provider net cost, margin rate, or profit.
    public record PublicProposalView(String caseNumber,String patientName,String documentType,int versionNumber,String currency,List<ProposalItemView>items,BigDecimal totalMin,BigDecimal totalExpected,BigDecimal totalMax,String assumptions,String includedServices,String excludedServices,String scopeChangeReason,String paymentTerms,String refundTerms,String disclaimers,Instant validUntil,boolean decided,String decisionState,String recommendedTreatment,String risksAndLimitations,String notes,BigDecimal depositDueDisplay,BigDecimal depositPaidDisplay) {}
    // channel is the currently-selected/default OTP channel; whatsappHint/emailHint are non-null only when
    // that channel is on file for the patient, so the UI can offer a switch without leaking real contacts.
    public record PublicProposalSummary(String caseNumber,String channel,String destinationHint,String whatsappHint,String emailHint) {}
    public record ProposalVerifyRequest(@NotBlank @Pattern(regexp="[0-9]{6}")String code) {}
    public record ProposalAccessGrant(String grant,Instant expiresAt,UUID versionId) {}
    public record ProposalViewRequest(@NotBlank @Size(max=256)String grant) {}
    public record PublicProposalDecisionRequest(@NotBlank @Size(max=256)String grant,@NotBlank @Pattern(regexp="ACCEPTED|ACKNOWLEDGED|DECLINED|REVISION_REQUESTED")String decision,@Size(max=10000)String comment) {}
    public record ActivateAccountRequest(@NotBlank @Size(max=256)String activationToken) {}
    public record TimelineEvent(String type,String label,Instant occurredAt,String status) {}
    public record MessageView(UUID id,String threadType,String senderRole,String senderName,String direction,String body,String language,boolean internalOnly,boolean read,Instant createdAt) {}
    public record TaskView(UUID id,UUID caseId,String type,String title,String description,String ownerSubject,String ownerRole,String visibilityScope,String priority,String status,boolean blocking,boolean overdue,Instant dueAt,long version) {}
    public record StaffDirectoryView(String subject,String name,String role) {}
    public record ProposalView(UUID proposalId,UUID versionId,int versionNumber,String status,String language,String currency,Instant validUntil,String operationalPlan,String includedServices,String excludedServices,String paymentTerms,String refundTerms,String disclaimers,List<ProposalItemView>items,String coordinatorNotes,String documentType,String scopeChangeReason) {}
    public record ProposalItemView(UUID id,String category,String description,BigDecimal quantity,BigDecimal unitPrice,boolean optional) {}
    public record AssignmentView(UUID id,String assigneeSubject,String assigneeRole,String assignmentType,String status,Instant assignedAt,long version) {}
    public record VerifiedDoctorView(String subject,String displayName,String specialty,String subspecialty,String availabilityStatus,String careCategory) {}
    public record DoctorProfileView(String displayName,String specialty,String subspecialty,String careCategory,String availabilityStatus,String credentialingStatus) {}
    public record StaffProfileView(String displayName,String role) {}
    public record CareCategoryView(String slug,String nameEn,String nameAr) {}
    public record ClinicalReviewView(UUID id,int versionNumber,String status,String suitability,String recommendedTreatment,String risksAndLimitations,Instant createdAt,List<CostEstimateItem>costEstimates) {}
    // Backend-computed approval gates for the latest pre-release proposal; null once released or when no proposal exists.
    // The UI must drive Operations/Finance/Release from these, never infer requirements from proposal.status alone.
    public record ProposalGates(boolean operationsRequired,String operationsReason,boolean operationsCompleted,boolean financeRequired,List<String>financeReasons,boolean financeCompleted,boolean readyForRelease) {}
    // Secure-delivery status of the latest released proposal notification (masked; no raw contact or token).
    public record DeliveryStatus(String status,String channel,String destinationMasked,int attempts,Instant deliveredAt,Instant nextAttemptAt) {}
    public record CaseWorkspace(CaseView caseSummary,List<TimelineEvent>timeline,List<TaskView>tasks,List<MessageView>messages,List<AssignmentView>assignments,List<ClinicalReviewView>clinicalReviews,ProposalView proposal,ProposalGates gates,DeliveryStatus delivery,DepositView deposit) {}
    public record IdResponse(UUID id,String status) {}
    // --- Consultant price catalog, specialty templates, and FX (Phase 2) ---
    public record CatalogServiceView(UUID id,String serviceCode,String serviceName,String category,BigDecimal priceEgp,boolean active,LocalDate validUntil) {}
    public record CatalogServiceRequest(@NotBlank @Size(max=60)String serviceCode,@NotBlank @Size(max=500)String serviceName,@Size(max=120)String category,@NotNull @DecimalMin("0.00")BigDecimal priceEgp,Boolean active,LocalDate validUntil) {}
    public record ServiceTemplateView(UUID id,String careCategory,String name) {}
    public record ServiceTemplateItemView(String serviceCode,String serviceName,String category,BigDecimal suggestedPriceEgp,int sortOrder) {}
    public record FxRateView(String currency,BigDecimal rate,LocalDate rateDate,String source) {}
    public record FxOverrideRequest(@NotNull @DecimalMin("0.00000001")BigDecimal rate,LocalDate date) {}
    public record PractitionerSummaryView(UUID id,String displayName,String specialty,String subspecialty,String careCategory,String credentialingStatus,String availabilityStatus) {}
    public record CommercialPolicyView(UUID id,String name,String careCategory,BigDecimal marginRate,boolean active,int version,String createdBy,LocalDate validFrom) {}
    public record CommercialPolicyRequest(@Size(max=160)String name,@Size(max=60)String careCategory,@NotNull @DecimalMin("0.0")BigDecimal marginRate) {}
    // Deposit + payment sub-workflow (offline record-only in this build).
    public record DepositComponentView(String beneficiary,String purpose,BigDecimal amountEgp,BigDecimal amountDisplay,String refundability,String cancellationTerms,boolean creditedToFinal) {}
    public record PaymentEventView(String eventType,BigDecimal amountDisplay,String currency,String method,String provider,String providerReference,String status,String reason,Instant occurredAt) {}
    public record DepositView(UUID id,String status,String currency,BigDecimal totalEgp,BigDecimal totalDisplay,BigDecimal paidDisplay,BigDecimal balanceDisplay,List<DepositComponentView>components,List<PaymentEventView>events) {}
    public record RecordReceiptRequest(@NotNull @DecimalMin("0.01")BigDecimal amountEgp,@Size(max=40)String method,@Size(max=200)String providerReference,@NotBlank @Size(max=180)String idempotencyKey) {}
    public record RefundRequest(@NotNull @DecimalMin("0.01")BigDecimal amountEgp,@NotBlank @Size(max=2000)String reason,@NotBlank @Size(max=180)String idempotencyKey) {}
    public record DepositPolicyView(UUID id,String name,String careCategory,BigDecimal coordinationDepositEgp,boolean active,int version,String createdBy,LocalDate validFrom) {}
    public record DepositPolicyRequest(@Size(max=160)String name,@Size(max=60)String careCategory,@NotNull @DecimalMin("0.0")BigDecimal coordinationDepositEgp) {}
    public record CatalogImportRow(int line,String serviceCode,String serviceName,String category,BigDecimal priceEgp,String action,String message) {}
    public record CatalogImportResult(boolean committed,int added,int updated,int unchanged,int errors,List<CatalogImportRow> rows) {}

    // --- Patient conversion layer: contact-channel choice, onboarding, identity, readiness, waiver ---
    // Optional channel for a proposal/case-status OTP challenge. Absent => default (WhatsApp when
    // available, else email) for backward compatibility. Only WHATSAPP or EMAIL — never a
    // caller-supplied destination; the destination always comes from the patient profile.
    public record ProposalAccessRequest(@Pattern(regexp="WHATSAPP|EMAIL")String channel) {}
    // A single, patient-safe blocking reason for customer readiness (bilingual label; no internals).
    public record BlockingItem(String code,String labelEn,String labelAr) {}
    // Backend-computed customer readiness. The frontend renders this verbatim and must NEVER infer
    // readiness from unrelated case/proposal statuses. verifiedChannel is WHATSAPP, EMAIL, BOTH or null.
    public record CustomerReadiness(
        boolean accountActivated,boolean contactVerified,String verifiedChannel,
        boolean identityRequired,boolean identityVerified,
        boolean onboardingCompleted,boolean requiredConsentsCompleted,boolean representativeAuthorizationValid,
        boolean depositRequired,String depositStatus,boolean depositSatisfied,
        List<BlockingItem>blockingItems,boolean readyForCoordination,Instant updatedAt) {}
    // Contact verification (OTP possession) is NOT legal identity. subjectType says who is onboarding.
    public record OnboardingView(
        UUID id,UUID caseId,String caseNumber,String state,String subjectType,
        Instant startedAt,Instant contactVerifiedAt,Instant identityVerifiedAt,Instant submittedAt,Instant completedAt,Instant expiresAt,
        long version,CustomerReadiness readiness,IdentityVerificationView identity,List<String>completedConsentTypes,List<String>requiredConsentTypes) {}
    public record OnboardingSubjectRequest(@NotBlank @Pattern(regexp="PATIENT|GUARDIAN|REPRESENTATIVE|PAYER")String subjectType,@Size(max=80)String relationship,@Size(max=500)String permissionScope,Instant expiresAt,@NotNull Long expectedVersion) {}
    public record OnboardingConsentRequest(@NotBlank @Size(max=60)String consentType,@NotBlank @Size(max=20000)String exactText,@Size(max=40)String policyVersion,@Pattern(regexp="en|ar")String language,@Size(max=500)String purpose,@Size(max=500)String scope) {}
    public record OnboardingSubmitRequest(@NotNull Long expectedVersion) {}
    // Patient-facing identity verification view — never exposes encrypted legal name/DOB or document content.
    public record IdentityVerificationView(UUID id,String subjectType,String status,String assuranceLevel,String method,String provider,String nationality,String documentType,String issuingCountry,String documentReferenceMasked,Instant requestedAt,Instant verifiedAt,Instant expiresAt,String rejectionReason,long version) {}
    // Patient-submitted identity proofing. legalName/dateOfBirth are encrypted at rest; documentReference is masked.
    public record IdentityStartRequest(@NotBlank @Pattern(regexp="PATIENT|REPRESENTATIVE")String subjectType,@Size(max=80)String representativeRelationship,@Size(max=40)String method,@NotBlank @Size(max=160)String legalName,@Size(max=40)String dateOfBirth,@Size(max=80)String nationality,@Size(max=40)String documentType,@Size(max=80)String issuingCountry,@Size(max=80)String documentReference) {}
    // Reviewer decision (authorized identity reviewer only; requires recent authentication + reason).
    public record IdentityReviewRequest(@NotBlank @Pattern(regexp="VERIFY|REJECT")String decision,@NotBlank @Size(max=2000)String reason,@Size(max=20)String assuranceLevel) {}
    // Finance/System-Admin deposit waiver (recent authentication + mandatory reason; never silent).
    public record DepositWaiverRequest(@NotBlank @Size(max=2000)String reason) {}
}
