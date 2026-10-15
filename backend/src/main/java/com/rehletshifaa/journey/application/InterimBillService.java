package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.TreatmentDtos.InterimBillRequest;
import com.rehletshifaa.journey.api.TreatmentDtos.TreatmentView;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.journey.domain.CaseEvidence.Fact;
import com.rehletshifaa.journey.domain.CaseEvidence.Kind;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.UUID;

/**
 * The hospital's interim bills during the stay (P1-16; design §5 stage 4; architecture §4.1a): Operations records each one (a
 * clean case document, the bill number, the EGP amount, when it was issued) and Finance countersigns it with a fresh sign-in
 * ({@code COUNTERSIGN_INTERIM_BILL}, four working hours). An interim bill is the hospital's running statement to date, so the
 * latest countersigned one is "billed to date" against the authorised total (package plus counted change orders) on the
 * treatment panel ({@link TreatmentViews#money}); the final invoice and its reconciliation are P1-17's ({@link DischargeService}, the settlement module).
 */
@Service
public class InterimBillService {
    public static final String COUNTERSIGN_WORK = "COUNTERSIGN_INTERIM_BILL";

    private final Authority authority;
    private final Clock clock;
    private final EvidenceLedger ledger;
    private final TreatmentViews views;
    private final MedicalCaseRepository cases;
    private final StaffWorkService work;
    private final FinanceWork financeWork;
    private final SlaPolicy sla;
    private final ApplicationEventPublisher events;

    public InterimBillService(Authority authority, Clock clock, EvidenceLedger ledger, TreatmentViews views, MedicalCaseRepository cases,
                              StaffWorkService work, FinanceWork financeWork, SlaPolicy sla, ApplicationEventPublisher events) {
        this.authority = authority; this.clock = clock; this.ledger = ledger; this.views = views; this.cases = cases; this.work = work;
        this.financeWork = financeWork; this.sla = sla; this.events = events;
    }

    /** Operations records the hospital's interim bill; Finance is asked to countersign it. */
    @Transactional
    public TreatmentView record(UUID caseId, InterimBillRequest request) {
        Actor actor = authority.authorize(Permission.ADMISSION_MANAGE, Resource.ofCase(caseId));
        if (!"TREATMENT_IN_PROGRESS".equals(lockStage(caseId)))
            throw new ApiException(409, "NOT_IN_TREATMENT", "Interim bills are recorded while the patient is in treatment");
        if (request.billedAt().isAfter(clock.instant().plusSeconds(300))) throw new ApiException(400, "BILLED_IN_FUTURE", "The bill date cannot be in the future");
        CaseEvidence bill = ledger.record(caseId, new Fact(Kind.INTERIM_BILL, request.documentId(), request.billNumber().trim(), request.amountEgp(), request.billedAt(), null),
                actor.subject(), EvidenceLedger.roleOf(actor.role()), null);
        financeWork.open(caseId, COUNTERSIGN_WORK, "Countersign the hospital's interim bill", "Operations recorded the hospital's interim bill. Check it against the authorised total, then countersign it.",
                sla.plusWorkingHours(clock.instant(), 4), "interim-bill:" + bill.getId(), WorkCopy.of(COUNTERSIGN_WORK, "caseNumber", cases.findCaseNumber(caseId).orElse("")));
        return views.staffView(caseId);
    }

    /** Finance countersigns an interim bill (fresh sign-in; never the recorder). */
    @Transactional
    public TreatmentView countersign(UUID caseId, UUID evidenceId) {
        Actor actor = authority.authorize(Permission.EVIDENCE_COUNTERSIGN, Resource.ofCase(caseId));
        lockStage(caseId);
        CaseEvidence row = ledger.find(caseId, evidenceId).orElseThrow(() -> new ApiException(404, "EVIDENCE_NOT_FOUND", "The entry was not found on this case"));
        if (row.getKind() != Kind.INTERIM_BILL) throw new ApiException(409, "EVIDENCE_NOT_COUNTERSIGNABLE", "Only an interim bill is countersigned here");
        ledger.countersign(caseId, evidenceId, actor.subject(), EvidenceLedger.roleOf(actor.role()));
        if (ledger.live(caseId, Kind.INTERIM_BILL).stream().allMatch(CaseEvidence::countersigned))
            work.closeWorkItems(caseId, COUNTERSIGN_WORK, "Interim bills countersigned");
        events.publishEvent(new CaseEvents.DischargeEvidenceChanged(caseId)); // P1-17: the discharge gate reads the treatment checklist
        return views.staffView(caseId);
    }

    private String lockStage(UUID caseId) {
        MedicalCase c = cases.lockById(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        return c.getStatus().name();
    }
}
