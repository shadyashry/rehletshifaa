package com.rehletshifaa.compliance.infrastructure;

import com.rehletshifaa.journey.domain.FollowUpWindow;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Read-only aggregates for the Consultant and facility scorecards (P1-19, design §7.6). The cohort is the cases discharged in the
 * period; every figure is a count, a sum or an average over the cohort. Nothing here selects a free-text column: the outcome answers
 * are read as aggregates only (health data, PDPL), with the answers given by a representative counted apart.
 */
public interface ScorecardRepository extends Repository<FollowUpWindow, UUID> {
    /** Cases discharged in [from, to) whose active primary Consultant is the practitioner. */
    @Query("""
            select w.caseId from FollowUpWindow w where w.dischargedAt >= :from and w.dischargedAt < :to
            and exists (select 1 from CaseAssignment a, PractitionerProfile p where p.externalSubject = a.assigneeSubject and a.caseId = w.caseId
                and a.assigneeRole = 'DOCTOR' and a.assignmentType = 'PRIMARY' and a.status = 'ACTIVE' and p.id = :practitionerId)""")
    List<UUID> consultantCohort(@Param("practitionerId") UUID practitionerId, @Param("from") Instant from, @Param("to") Instant to);

    /** Cases discharged in [from, to) admitted at the facility. */
    @Query("""
            select w.caseId from FollowUpWindow w where w.dischargedAt >= :from and w.dischargedAt < :to
            and exists (select 1 from FacilityAdmission f where f.caseId = w.caseId and f.facilityId = :facilityId and f.status <> 'CANCELLED')""")
    List<UUID> facilityCohort(@Param("facilityId") UUID facilityId, @Param("from") Instant from, @Param("to") Instant to);

    interface OutcomeAggregate {
        String getPoint(); Long getAsked(); Long getAnswered(); Long getByRepresentative(); Long getComplications();
        Double getPain(); Double getFunctionScore(); Double getSatisfaction();
    }

    @Query("""
            select o.point as point, count(o) as asked, count(o.reportedAt) as answered,
                sum(case when o.reportedRole = 'PATIENT_REPRESENTATIVE' then 1 else 0 end) as byRepresentative,
                sum(case when o.complication = true then 1 else 0 end) as complications,
                avg(o.painScore) as pain, avg(o.functionScore) as functionScore, avg(o.satisfactionScore) as satisfaction
            from CaseOutcome o where o.caseId in :cases group by o.point order by o.point""")
    List<OutcomeAggregate> outcomes(@Param("cases") Collection<UUID> cases);

    interface ChangeOrderAggregate { Long getCases(); Long getOrders(); Long getEmergency(); }

    @Query("""
            select count(distinct c.caseId) as cases, count(c) as orders, sum(case when c.emergency = true then 1 else 0 end) as emergency
            from ChangeOrder c where c.caseId in :cases and c.status in ('ACCEPTED', 'EMERGENCY')""")
    ChangeOrderAggregate changeOrders(@Param("cases") Collection<UUID> cases);

    interface ReconciliationAggregate { Long getReconciled(); Long getWithVariance(); Long getDisputed(); }

    @Query("""
            select count(r) as reconciled, sum(case when r.varianceEgp <> 0 then 1 else 0 end) as withVariance,
                sum(case when r.disputedEgp > 0 then 1 else 0 end) as disputed
            from Reconciliation r where r.caseId in :cases and r.settledAt is not null""")
    ReconciliationAggregate reconciliations(@Param("cases") Collection<UUID> cases);

    interface LineAggregate { Long getCases(); Long getLines(); BigDecimal getAmountEgp(); }

    /** Settled reconciliation lines of one variance code (UNAPPROVED_EXTRA, BILLING_ERROR): cases, lines and the invoiced amount. */
    @Query("""
            select count(distinct r.caseId) as cases, count(l) as lines, coalesce(sum(l.invoiceEgp), 0) as amountEgp
            from ReconciliationLine l join Reconciliation r on r.id = l.reconciliationId
            where r.caseId in :cases and r.settledAt is not null and l.varianceCode = :code""")
    LineAggregate lines(@Param("cases") Collection<UUID> cases, @Param("code") String code);

    @Query("select count(distinct x.caseId) from CaseReopening x where x.caseId in :cases")
    long reopenedCases(@Param("cases") Collection<UUID> cases);

    @Query("select count(distinct i.caseId) from CaseIncident i where i.caseId in :cases and i.incidentType = :type")
    long casesWithIncident(@Param("cases") Collection<UUID> cases, @Param("type") String type);

    interface ConcernAggregate { Long getConcerns(); Long getDisputes(); }

    @Query("""
            select count(i) as concerns, sum(case when i.incidentType = 'DISPUTE' then 1 else 0 end) as disputes
            from CaseIncident i where i.caseId in :cases and i.source = 'PATIENT'""")
    ConcernAggregate patientConcerns(@Param("cases") Collection<UUID> cases);

    interface ContactAggregate { Long getHeld(); Long getMissed(); }

    @Query("""
            select sum(case when c.status = 'DONE' then 1 else 0 end) as held, sum(case when c.status = 'MISSED' then 1 else 0 end) as missed
            from FollowUpContact c where c.caseId in :cases""")
    ContactAggregate contacts(@Param("cases") Collection<UUID> cases);

    interface QuoteRow { UUID getCaseId(); String getDocumentType(); Integer getVersionNumber(); BigDecimal getExpectedEgp(); BigDecimal getMaxEgp(); Boolean getAboveMaximum(); }

    /** The accepted estimate and final quote versions of the cohort (the newest of each kind per case is used). */
    @Query("""
            select p.caseId as caseId, v.documentType as documentType, v.versionNumber as versionNumber, v.patientTotalExpectedEgp as expectedEgp,
                v.patientTotalMaxEgp as maxEgp, v.aboveEstimateMaximum as aboveMaximum
            from ProposalVersion v join Proposal p on p.id = v.proposalId
            where p.caseId in :cases and v.status = 'ACCEPTED' and v.documentType in ('PRELIMINARY_ESTIMATE', 'FINAL_TREATMENT_QUOTE')
            order by p.caseId, v.versionNumber""")
    List<QuoteRow> acceptedQuotes(@Param("cases") Collection<UUID> cases);

    @Query("select count(f) from AffiliationFlag f where f.caseId in :cases and f.practitionerId = :practitionerId")
    long undeclaredFlagsOfConsultant(@Param("cases") Collection<UUID> cases, @Param("practitionerId") UUID practitionerId);

    @Query("select count(f) from AffiliationFlag f where f.caseId in :cases and f.facilityId = :facilityId")
    long undeclaredFlagsAtFacility(@Param("cases") Collection<UUID> cases, @Param("facilityId") UUID facilityId);
}
