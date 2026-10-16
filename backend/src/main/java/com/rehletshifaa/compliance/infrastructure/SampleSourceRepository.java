package com.rehletshifaa.compliance.infrastructure;

import com.rehletshifaa.casemanagement.domain.CaseStatusChange;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Read-only sources of the monthly sampling audit (P1-19, design §7.8): which cases closed in the month, and the money facts a
 * sampled case's record is assembled from. Amounts and references only; no clinical or free-text column is read.
 */
public interface SampleSourceRepository extends Repository<CaseStatusChange, UUID> {
    interface Closed { UUID getCaseId(); Instant getClosedAt(); }

    /** Cases moved to CLOSED in [from, to), each once at its last closing in the window. */
    @Query("""
            select h.caseId as caseId, max(h.createdAt) as closedAt from CaseStatusChange h
            where h.toStatus = 'CLOSED' and h.createdAt >= :from and h.createdAt < :to group by h.caseId order by h.caseId""")
    List<Closed> closedBetween(@Param("from") Instant from, @Param("to") Instant to);

    /** The case's active primary Consultant (practitioner id). */
    @Query("""
            select p.id from CaseAssignment a, PractitionerProfile p where p.externalSubject = a.assigneeSubject and a.caseId = :caseId
            and a.assigneeRole = 'DOCTOR' and a.assignmentType = 'PRIMARY' and a.status = 'ACTIVE' order by a.assignedAt desc""")
    List<UUID> primaryConsultant(@Param("caseId") UUID caseId, Limit limit);

    /** The newest accepted final quote of the case. */
    @Query("""
            select v.id from ProposalVersion v join Proposal p on p.id = v.proposalId
            where p.caseId = :caseId and v.status = 'ACCEPTED' and v.documentType = 'FINAL_TREATMENT_QUOTE' order by v.versionNumber desc""")
    List<UUID> acceptedFinalQuote(@Param("caseId") UUID caseId, Limit limit);

    interface PayeeSum { String getPayee(); BigDecimal getTotalEgp(); }

    /** The version's mandatory lines summed in EGP by payee (the patient's price; the fee line is PLATFORM). */
    @Query("""
            select i.payee as payee, sum(i.unitPriceEgp * i.quantity) as totalEgp from ProposalItem i
            where i.proposalVersionId = :versionId and i.optional = false and i.unitPriceEgp is not null group by i.payee order by i.payee""")
    List<PayeeSum> payeeTotals(@Param("versionId") UUID versionId);

    @Query("select count(f) from AffiliationFlag f where f.caseId = :caseId")
    long undeclaredFlags(@Param("caseId") UUID caseId);

    @Query("""
            select count(l) from ReconciliationLine l join Reconciliation r on r.id = l.reconciliationId
            where r.caseId = :caseId and l.varianceCode = 'UNAPPROVED_EXTRA'""")
    long unapprovedExtraLines(@Param("caseId") UUID caseId);
}
