package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.document.domain.DocumentStatus;
import com.rehletshifaa.document.infrastructure.MedicalDocumentRepository;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.journey.domain.CaseEvidence.Fact;
import com.rehletshifaa.journey.domain.CaseEvidence.Kind;
import com.rehletshifaa.journey.infrastructure.CaseEvidenceRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The case evidence ledger (post-deposit design §9; architecture §4.1; P1-15): one append-only trail of facts that stage gates
 * read. It records and countersigns; it never authorises — the service that owns the act (admission, treatment) has already
 * checked who may do it. Every write is audited with the kind, the ids and the amount, never the payload.
 *
 * <p>Rules kept here so no caller can skip them: a document is a clean document of the same case; a countersignature is set
 * once, by someone other than the recorder ({@code SELF_COUNTERSIGN_REFUSED}); a correction supersedes a live row of the same
 * case and kind, and a superseded row no longer counts for any gate.
 */
@Component
public class EvidenceLedger {
    private final CaseEvidenceRepository evidence;
    private final MedicalCaseRepository cases;
    private final MedicalDocumentRepository documents;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public EvidenceLedger(CaseEvidenceRepository evidence, MedicalCaseRepository cases, MedicalDocumentRepository documents, AuditTrail auditTrail, Clock clock) {
        this.evidence = evidence; this.cases = cases; this.documents = documents; this.auditTrail = auditTrail; this.clock = clock;
    }

    /** The ledger's name for the role a row is recorded or countersigned under. */
    public static String roleOf(Role role) {
        return switch (role) {
            case CONSULTANT -> "CONSULTANT";
            case OPERATIONS -> "OPERATIONS";
            case FINANCE, FINANCE_MANAGER -> "FINANCE";
            case COORDINATOR -> "COORDINATOR";
            case PATIENT, PATIENT_REPRESENTATIVE -> "PATIENT";
            default -> throw new ApiException(403, "PERMISSION_NOT_HELD", "This role does not record case evidence");
        };
    }

    /** Appends a fact; {@code supersedes} (nullable) is a live row of the same case and kind that this one corrects. */
    @Transactional
    public CaseEvidence record(UUID caseId, Fact fact, String subject, String role, UUID supersedes) {
        String stage = cases.findById(caseId).map(c -> c.getStatus().name())
                .orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        if (fact.documentId() != null && !documents.existsByIdAndMedicalCaseIdAndStatus(fact.documentId(), caseId, DocumentStatus.CLEAN))
            throw new ApiException(409, "INVALID_EVIDENCE_DOCUMENT", "The evidence must be a clean document from this case");
        if (supersedes != null) {
            CaseEvidence old = evidence.findByIdAndCaseId(supersedes, caseId)
                    .orElseThrow(() -> new ApiException(404, "EVIDENCE_NOT_FOUND", "The entry to correct was not found on this case"));
            if (old.getKind() != fact.kind() || evidence.existsBySupersedesId(supersedes))
                throw new ApiException(409, "EVIDENCE_NOT_CORRECTABLE", "Only a live entry of the same kind can be corrected");
        }
        Instant now = clock.instant();
        CaseEvidence row = evidence.saveAndFlush(new CaseEvidence(caseId, stage, fact, subject, role, supersedes, now));
        audit("CASE_EVIDENCE_RECORDED", subject, role, row);
        return row;
    }

    /** The second signature on a live row: once, never the recorder's own. */
    @Transactional
    public CaseEvidence countersign(UUID caseId, UUID evidenceId, String subject, String role) {
        CaseEvidence row = evidence.lockById(evidenceId).filter(e -> e.getCaseId().equals(caseId))
                .orElseThrow(() -> new ApiException(404, "EVIDENCE_NOT_FOUND", "The entry was not found on this case"));
        if (evidence.existsBySupersedesId(evidenceId))
            throw new ApiException(409, "EVIDENCE_SUPERSEDED", "This entry was corrected; countersign the correction");
        if (row.countersigned()) throw new ApiException(409, "EVIDENCE_ALREADY_COUNTERSIGNED", "This entry is already countersigned");
        if (row.getRecordedBy().equals(subject))
            throw new ApiException(409, "SELF_COUNTERSIGN_REFUSED", "Someone other than the person who recorded it must countersign");
        row.countersign(subject, role, clock.instant());
        evidence.saveAndFlush(row);
        audit("CASE_EVIDENCE_COUNTERSIGNED", subject, role, row);
        return row;
    }

    @Transactional(readOnly = true)
    public Optional<CaseEvidence> latest(UUID caseId, Kind kind) { return evidence.findLive(caseId, kind.name()).stream().findFirst(); }

    @Transactional(readOnly = true)
    public List<CaseEvidence> live(UUID caseId, Kind kind) { return evidence.findLive(caseId, kind.name()); }

    /** A live row of the kind exists; for a kind Finance countersigns, only a countersigned row counts. */
    @Transactional(readOnly = true)
    public boolean has(UUID caseId, Kind kind) {
        return evidence.existsLive(caseId, kind.name(), CaseEvidence.COUNTERSIGNED_BY_FINANCE.contains(kind));
    }

    /** The live amount of a kind; for a kind Finance countersigns, only countersigned rows count. */
    @Transactional(readOnly = true)
    public BigDecimal total(UUID caseId, Kind kind) {
        return evidence.sumLive(caseId, kind.name(), CaseEvidence.COUNTERSIGNED_BY_FINANCE.contains(kind));
    }

    /** The live amount of a kind whether countersigned or not: what is already claimed against an amount due. */
    @Transactional(readOnly = true)
    public BigDecimal claimed(UUID caseId, Kind kind) { return evidence.sumLive(caseId, kind.name(), false); }

    /** The whole trail, oldest first, corrections included. */
    @Transactional(readOnly = true)
    public List<CaseEvidence> trail(UUID caseId) { return evidence.findByCaseIdOrderByRecordedAtAscIdAsc(caseId); }

    @Transactional(readOnly = true)
    public Optional<CaseEvidence> find(UUID caseId, UUID evidenceId) { return evidence.findByIdAndCaseId(evidenceId, caseId); }

    /** True when another row corrects this one. */
    @Transactional(readOnly = true)
    public boolean superseded(UUID evidenceId) { return evidence.existsBySupersedesId(evidenceId); }

    private void audit(String type, String subject, String role, CaseEvidence row) {
        String reason = row.getKind().name() + (row.getAmountEgp() == null ? "" : " EGP " + row.getAmountEgp().toPlainString());
        auditTrail.event(type).actor(subject, role).caseId(row.getCaseId()).entity("CaseEvidence", row.getId())
                .action(type.endsWith("COUNTERSIGNED") ? "COUNTERSIGN" : "RECORD").reason(reason).record();
    }
}
