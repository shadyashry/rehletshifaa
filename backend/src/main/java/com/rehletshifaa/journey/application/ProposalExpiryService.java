package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.application.CaseStatusLog;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.infrastructure.ProposalShareTokenRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.shared.audit.AuditTrail;

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
    private final ProposalShareTokenRepository shareTokens;
    private final ProposalVersionRepository proposalVersions;
    private final CaseStatusLog statusLog;
    private final MedicalCaseRepository cases;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public ProposalExpiryService(Clock clock, AuditTrail auditTrail, MedicalCaseRepository cases, CaseStatusLog statusLog, ProposalVersionRepository proposalVersions, ProposalShareTokenRepository shareTokens) { this.shareTokens = shareTokens; this.proposalVersions = proposalVersions; this.statusLog = statusLog; this.cases = cases; this.auditTrail = auditTrail;
                this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${app.proposals.expiry-scan-ms:60000}")
    @Transactional
    public void expireReleasedProposals() {
        Instant now = clock.instant();
        List<Expired> expired = proposalVersions.findExpiring(micros(now)).stream().map(e -> new Expired(e.getVersionId(), e.getCaseId())).toList();
        for (Expired item : expired) expire(item, now);
    }

    private void expire(Expired item, Instant now) {
        int versionChanged = proposalVersions.expire(item.versionId());
        if (versionChanged != 1) return;
        shareTokens.revokeForVersion(item.versionId(), micros(now));
        int caseChanged = cases.moveStatus(item.caseId(), CaseStatus.PATIENT_DECISION, CaseStatus.EXPIRED, micros(now));
        if (caseChanged == 1) statusLog.record(item.caseId(),"PATIENT_DECISION","EXPIRED","SYSTEM","SYSTEM","Proposal validity period ended", now);
        auditTrail.event("PROPOSAL_EXPIRED").actor("SYSTEM", "SYSTEM").caseId(item.caseId()).entity("ProposalVersion", item.versionId()).action("EXPIRE").at(now).record();
    }

    private record Expired(UUID versionId, UUID caseId) {}
}
