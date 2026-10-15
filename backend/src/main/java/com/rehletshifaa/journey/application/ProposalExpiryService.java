package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.application.CaseStatusLog;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.infrastructure.ProposalShareTokenRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.scheduling.application.LeasedJob;

import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

@Service
public class ProposalExpiryService {
    static final String FINAL_QUOTE_DOCUMENT = "FINAL_TREATMENT_QUOTE";
    static final String FINAL_QUOTE_EXPIRED_WORK = "FINAL_QUOTE_EXPIRED";

    private final ProposalShareTokenRepository shareTokens;
    private final ProposalVersionRepository proposalVersions;
    private final CaseStatusLog statusLog;
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;
    private final StaffWorkService work;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public ProposalExpiryService(Clock clock, AuditTrail auditTrail, MedicalCaseRepository cases, CaseStatusLog statusLog, ProposalVersionRepository proposalVersions, ProposalShareTokenRepository shareTokens,
                                 CaseAssignmentRepository assignments, StaffWorkService work) {
        this.shareTokens = shareTokens; this.proposalVersions = proposalVersions; this.statusLog = statusLog; this.cases = cases; this.auditTrail = auditTrail;
        this.assignments = assignments; this.work = work;
        this.clock = clock;
    }

    @LeasedJob(maxHold = LeasedJob.EXPIRY_SCAN)
    @Scheduled(fixedDelayString = "${app.proposals.expiry-scan-ms:60000}")
    @Transactional
    public void expireReleasedProposals() {
        Instant now = clock.instant();
        List<Expired> expired = proposalVersions.findExpiring(micros(now)).stream()
            .map(e -> new Expired(e.getVersionId(), e.getCaseId(), FINAL_QUOTE_DOCUMENT.equals(e.getDocumentType()))).toList();
        for (Expired item : expired) expire(item, now);
    }

    private void expire(Expired item, Instant now) {
        int versionChanged = proposalVersions.expire(item.versionId());
        if (versionChanged != 1) return;
        shareTokens.revokeForVersion(item.versionId(), micros(now));
        // P1-10 (B-05): a final quote expires as a commercial sub-workflow; the macro case stays ARRIVAL_CONFIRMED.
        if (!item.finalQuote()) {
            int caseChanged = cases.moveStatus(item.caseId(), CaseStatus.PATIENT_DECISION, CaseStatus.EXPIRED, micros(now));
            if (caseChanged == 1) statusLog.record(item.caseId(),"PATIENT_DECISION","EXPIRED","SYSTEM","SYSTEM","Proposal validity period ended", now);
        }
        auditTrail.event("PROPOSAL_EXPIRED").actor("SYSTEM", "SYSTEM").caseId(item.caseId()).entity("ProposalVersion", item.versionId()).action("EXPIRE").at(now).record();
        if (item.finalQuote()) onFinalQuoteExpired(item.caseId(), item.versionId(), now);
    }

    /**
     * P1-10 (B-05): a final quote lapsed before the patient accepted it. A pending exchange-rate re-approval is no longer owed,
     * and the case's primary coordinator owes the patient a new final quote. Idempotent: an open item of the type is reused.
     */
    void onFinalQuoteExpired(UUID caseId, UUID versionId, Instant now) {
        work.closeWorkItems(caseId, JourneyService.FX_REAPPROVAL_WORK, "The final quote expired before the patient accepted it");
        String coordinator = assignments.findActivePrimaryCoordinator(caseId, Limit.of(1)).stream().findFirst().orElse(null);
        work.openWorkItem(new NewWorkItem(caseId, FINAL_QUOTE_EXPIRED_WORK, "Final quote expired before the patient accepted it",
            "The patient's final quote passed its validity date without being accepted. Speak with the patient and prepare a new final quote.",
            coordinator, "COORDINATOR", false, null, "SYSTEM", "FINAL_QUOTE_EXPIRED", "final-quote-expired:" + versionId, true));
        auditTrail.event("FINAL_QUOTE_EXPIRED").actor("SYSTEM", "SYSTEM").caseId(caseId).entity("ProposalVersion", versionId).action("EXPIRE").at(now).record();
    }

    private record Expired(UUID versionId, UUID caseId, boolean finalQuote) {}
}
