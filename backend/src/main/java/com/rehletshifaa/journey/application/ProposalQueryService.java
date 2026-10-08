package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.DeliveryStatus;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalAssistanceView;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalGates;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalItemView;
import com.rehletshifaa.journey.api.JourneyDtos.ProposalView;
import com.rehletshifaa.journey.domain.ProposalDecision;
import com.rehletshifaa.journey.infrastructure.ProposalAssistanceRequestRepository;
import com.rehletshifaa.journey.infrastructure.ProposalDecisionRepository;
import com.rehletshifaa.journey.infrastructure.ProposalItemRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository.ApprovalGates;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository.PatientDocument;
import com.rehletshifaa.notification.infrastructure.QueuedNotificationRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Proposal documents as staff and patients read them, and the facts the approval gates are decided on.
 *
 * <p>A document is two reads: the version, then its lines. The approval gates of a version are one read.
 */
@Service
public class ProposalQueryService {
    /** The versions a patient may see: released to them, and every outcome after. */
    private static final Set<String> PATIENT_VISIBLE = Set.of("RELEASED", "VIEWED", "ACCEPTED", "DECLINED", "REVISION_REQUESTED", "EXPIRED");
    private static final Set<String> IN_APPROVAL = Set.of("CLINICALLY_APPROVED", "OPERATIONS_COMPLETED", "FINANCE_APPROVED");

    private final ProposalVersionRepository versions;
    private final ProposalItemRepository items;
    private final MedicalCaseRepository cases;
    private final QueuedNotificationRepository outbox;
    private final ProposalDecisionRepository decisions;
    private final ProposalAssistanceRequestRepository assistance;
    private final JourneyCaseQueryService people;

    public ProposalQueryService(ProposalVersionRepository versions, ProposalItemRepository items, MedicalCaseRepository cases,
                                QueuedNotificationRepository outbox, ProposalDecisionRepository decisions,
                                ProposalAssistanceRequestRepository assistance, JourneyCaseQueryService people) {
        this.versions = versions; this.items = items; this.cases = cases; this.outbox = outbox;
        this.decisions = decisions; this.assistance = assistance; this.people = people;
    }

    ProposalView proposal(UUID versionId) {
        var v = versions.findDocument(versionId).orElseThrow(() -> new ApiException(404, "PROPOSAL_NOT_FOUND", "Proposal version was not found"));
        List<ProposalItemView> lines = items.findRowsOf(versionId).stream()
                .map(i -> new ProposalItemView(i.getId(), i.getCategory(), i.getDescription(), i.getQuantity(), i.getUnitPrice(),
                        Boolean.TRUE.equals(i.getOptionalItem())))
                .toList();
        return new ProposalView(v.getProposalId(), v.getId(), v.getVersionNumber(), v.getStatus(), v.getLanguage(), v.getCurrency(),
                v.getValidUntil(), v.getOperationalPlan(), v.getIncludedServices(), v.getExcludedServices(), v.getPaymentTerms(),
                v.getRefundTerms(), v.getDisclaimers(), lines, v.getCoordinatorNotes(), v.getDocumentType(), v.getScopeChangeReason(), assistance(versionId));
    }

    /**
     * The assisted-decision facts of a version, or null when there are none: no request was made and the decision (if any)
     * was the patient's own. A recorded decision names the staff member who recorded it, never their identity subject.
     */
    ProposalAssistanceView assistance(UUID versionId) {
        var request = assistance.findByProposalVersionId(versionId).orElse(null);
        ProposalDecision decision = decisions.findByProposalVersionId(versionId).orElse(null);
        boolean recorded = decision != null && ProposalDecision.SOURCE_RECORDED.equals(decision.getDecisionSource());
        if (request == null && !recorded) return null;
        String recordedBy = recorded ? people.names(List.of(decision.getRecordedBy())).staff(decision.getRecordedBy()) : null;
        return new ProposalAssistanceView(request == null ? null : request.getRequestedAt(), decision == null ? null : decision.getDecisionSource(),
                recordedBy, recorded ? decision.getDecisionChannel() : null, recorded ? decision.getConfirmedBy() : null,
                recorded ? decision.getConversationAt() : null, decision == null ? null : decision.getCreatedAt());
    }

    /** The case's latest version, or for a patient its latest version released to them; null when there is none. */
    ProposalView latest(UUID caseId, boolean patient) {
        List<UUID> ids = patient ? versions.findLatestIdOf(caseId, PATIENT_VISIBLE, Limit.of(1)) : versions.findLatestIdOf(caseId, Limit.of(1));
        return ids.isEmpty() ? null : proposal(ids.get(0));
    }

    /** The case, patient, clinical recommendation, totals and rate snapshot behind the patient's secure view. */
    PatientDocument patientDocument(UUID versionId) {
        return versions.findPatientDocument(versionId)
                .orElseThrow(() -> new ApiException(404, "PROPOSAL_NOT_FOUND", "Proposal version was not found"));
    }

    boolean isFinalQuote(UUID versionId) {
        return "FINAL_TREATMENT_QUOTE".equals(gatesOf(versionId).map(ApprovalGates::getDocumentType).orElse("PRELIMINARY_ESTIMATE"));
    }

    /** Unknown versions and unset flags count as requiring finance. */
    boolean requiresFinanceApproval(UUID versionId) {
        Boolean required = gatesOf(versionId).map(ApprovalGates::getRequiresFinanceApproval).orElse(true);
        return required == null || required;
    }

    boolean operationsCompleted(UUID versionId) { return gatesOf(versionId).map(g -> g.getOperationsCompletedAt() != null).orElse(false); }

    boolean travelRequested(UUID caseId) {
        return cases.findActionFacts(caseId).map(f -> Boolean.TRUE.equals(f.getTravelPackageRequested())).orElse(false);
    }

    /**
     * Authoritative approval-gate computation for the latest pre-release proposal. The UI must drive the
     * Operations/Finance/Release actions from these fields rather than inferring them from proposal.status.
     */
    ProposalGates gates(UUID caseId, ProposalView p) {
        if (p == null || !IN_APPROVAL.contains(p.status())) return null;
        Optional<ApprovalGates> gates = gatesOf(p.versionId());
        boolean finalQuote = "FINAL_TREATMENT_QUOTE".equals(gates.map(ApprovalGates::getDocumentType).orElse("PRELIMINARY_ESTIMATE"));
        boolean opsReq = !finalQuote && travelRequested(caseId);
        boolean opsDone = gates.map(g -> g.getOperationsCompletedAt() != null).orElse(false);
        Boolean finance = gates.map(ApprovalGates::getRequiresFinanceApproval).orElse(true);
        boolean finReq = finance == null || finance;
        boolean finDone = gates.map(g -> g.getFinanceApprovedAt() != null).orElse(false);
        boolean ready = (!opsReq || opsDone) && (!finReq || finDone);
        String opsReason = opsReq ? "A travel package was requested — Operations must complete the plan." : "Operations not required for this document.";
        List<String> finReasons = finReq ? List.of("A manually-priced (non-catalog) service requires finance approval.") : List.of();
        return new ProposalGates(opsReq, opsReason, opsDone, finReq, finReasons, finDone, ready);
    }

    /** Delivery of the latest notification carrying this version's link, as the coordinator sees it. */
    DeliveryStatus deliveryStatus(UUID versionId) {
        return outbox.findFirstByIdempotencyKeyContainingOrderByCreatedAtDesc(versionId.toString())
                .map(m -> {
                    String ui = switch (m.getStatus()) { case "DELIVERED" -> "DELIVERED"; case "RETRY" -> "RETRY"; case "DEAD_LETTER" -> "FAILED"; default -> "QUEUED"; };
                    return new DeliveryStatus(ui, m.getChannel(), maskContact(m.getDestination()), m.getAttempts(), m.getDeliveredAt(), m.getNextAttemptAt());
                }).orElse(null);
    }

    /** A contact shown only by its shape: the first letter of an email's user part, or the last four digits of a number. */
    static String maskContact(String value) {
        if (value == null) return "***";
        String clean = value.replaceAll("\\s", "");
        if (clean.contains("@")) {
            int at = clean.indexOf('@');
            String user = clean.substring(0, at);
            return (user.isEmpty() ? "*" : user.charAt(0) + "***") + clean.substring(at);
        }
        return clean.length() < 4 ? "***" : "***" + clean.substring(clean.length() - 4);
    }

    private Optional<ApprovalGates> gatesOf(UUID versionId) { return versions.findApprovalGatesOf(versionId); }
}
