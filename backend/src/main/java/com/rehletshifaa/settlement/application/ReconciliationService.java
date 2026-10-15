package com.rehletshifaa.settlement.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.application.CaseEvents;
import com.rehletshifaa.journey.application.DischargeService;
import com.rehletshifaa.journey.application.EvidenceLedger;
import com.rehletshifaa.journey.application.FinanceWork;
import com.rehletshifaa.journey.application.SettlementBasis;
import com.rehletshifaa.journey.application.SettlementBasis.CountedLine;
import com.rehletshifaa.journey.application.SettlementBasis.FinalInvoice;
import com.rehletshifaa.journey.application.SettlementBasis.Money;
import com.rehletshifaa.journey.application.StaffWorkService;
import com.rehletshifaa.journey.domain.CaseEvidence.Fact;
import com.rehletshifaa.journey.domain.CaseEvidence.Kind;
import com.rehletshifaa.settlement.api.SettlementDtos.CountersignReconciliationRequest;
import com.rehletshifaa.settlement.api.SettlementDtos.FinalInvoiceView;
import com.rehletshifaa.settlement.api.SettlementDtos.InvoiceLineRequest;
import com.rehletshifaa.settlement.api.SettlementDtos.InvoiceLineView;
import com.rehletshifaa.settlement.api.SettlementDtos.QuoteLineView;
import com.rehletshifaa.settlement.api.SettlementDtos.ReconciliationView;
import com.rehletshifaa.settlement.api.SettlementDtos.ResolveDisputeRequest;
import com.rehletshifaa.settlement.api.SettlementDtos.SubmitReconciliationRequest;
import com.rehletshifaa.settlement.domain.Reconciliation;
import com.rehletshifaa.settlement.domain.ReconciliationLine;
import com.rehletshifaa.settlement.domain.ReconciliationLine.Code;
import com.rehletshifaa.settlement.domain.ReconciliationLine.Source;
import com.rehletshifaa.settlement.domain.Statement;
import com.rehletshifaa.settlement.infrastructure.ReconciliationLineRepository;
import com.rehletshifaa.settlement.infrastructure.ReconciliationRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The reconciliation of the hospital's final invoice (P1-17; post-deposit design §5 stage 5, §6 rule 4; architecture §4.4, §5.5).
 * <ol>
 *   <li><b>Open</b> (Finance, fresh sign-in): countersigns Operations' final invoice and sets what was authorised — the voucher's
 *       package plus the case's counted change orders — and the case's change-order band.</li>
 *   <li><b>Submit</b> (Finance, fresh sign-in): the invoice lines, each matched to the package, a counted change-order line or
 *       nothing. A matched line is charged at most what was authorised (above it: {@code BILLING_ERROR}, the excess disputed; below
 *       it: {@code CREDIT}); an unmatched line is an {@code UNAPPROVED_EXTRA} (or a {@code BILLING_ERROR}) and is never charged to
 *       the patient. A variance (invoice less authorised) above the band waits for a Finance Manager's countersignature.</li>
 *   <li><b>Settle</b>: the {@code RECONCILIATION} ledger row (which ends Finance's open money on the case and lets the discharged
 *       case move to follow-up), the patient's {@code DISCHARGE} statement, a {@code FACILITY_DISPUTE} for the Finance Manager when
 *       anything was not charged, and a {@code REFUND_CREDIT} for Finance when the patient paid more than they were charged.</li>
 *   <li><b>Dispute</b> (Finance Manager, fresh sign-in): the hospital withdrew the charge, or the platform absorbed it; never the
 *       patient.</li>
 * </ol>
 */
@Service
public class ReconciliationService {
    /** Work types: Finance reconciles (opened by the final invoice) and refunds a credit; a Finance Manager countersigns and settles a dispute. */
    public static final String RECONCILE_WORK = DischargeService.RECONCILE_WORK, COUNTERSIGN_WORK = "COUNTERSIGN_RECONCILIATION",
            DISPUTE_WORK = "FACILITY_DISPUTE", REFUND_WORK = "REFUND_CREDIT";
    private static final String MANAGER = "FINANCE_MANAGER";

    private final Authority authority;
    private final Clock clock;
    private final AuditTrail auditTrail;
    private final SettlementBasis basis;
    private final EvidenceLedger ledger;
    private final ReconciliationRepository reconciliations;
    private final ReconciliationLineRepository lines;
    private final StatementService statements;
    private final StaffWorkService work;
    private final FinanceWork financeWork;
    private final WorkforceDirectory workforce;
    private final ApplicationEventPublisher events;
    private final ObjectMapper json;

    public ReconciliationService(Authority authority, Clock clock, AuditTrail auditTrail, SettlementBasis basis, EvidenceLedger ledger,
                                 ReconciliationRepository reconciliations, ReconciliationLineRepository lines, StatementService statements, StaffWorkService work,
                                 FinanceWork financeWork, WorkforceDirectory workforce, ApplicationEventPublisher events, ObjectMapper json) {
        this.authority = authority; this.clock = clock; this.auditTrail = auditTrail; this.basis = basis; this.ledger = ledger;
        this.reconciliations = reconciliations; this.lines = lines; this.statements = statements; this.work = work; this.financeWork = financeWork;
        this.workforce = workforce; this.events = events; this.json = json;
    }

    // ---- Finance ----

    /** Finance opens the reconciliation (fresh sign-in), countersigning Operations' final invoice; again after a corrected invoice. */
    @Transactional
    public ReconciliationView open(UUID caseId) {
        Actor actor = authority.authorize(Permission.RECONCILE, Resource.ofCase(caseId));
        basis.lockStage(caseId);
        FinalInvoice invoice = basis.finalInvoice(caseId).orElseThrow(() -> new ApiException(409, "FINAL_INVOICE_MISSING", "Operations has not recorded the hospital's final invoice"));
        Reconciliation current = reconciliations.findByCaseId(caseId).orElse(null);
        if (current != null && current.getStatus() != Reconciliation.Status.OPEN)
            throw new ApiException(409, "RECONCILIATION_SUBMITTED", "This reconciliation is already submitted");
        if (!invoice.countersigned()) ledger.countersign(caseId, invoice.evidenceId(), actor.subject(), "FINANCE");
        BigDecimal authorised = authorised(caseId);
        BigDecimal band = basis.bandLimit(caseId);
        if (current == null) current = new Reconciliation(caseId, invoice.evidenceId(), invoice.amountEgp(), authorised, band, actor.subject(), clock.instant());
        else current.repoint(invoice.evidenceId(), invoice.amountEgp(), authorised, band);
        reconciliations.saveAndFlush(current);
        audit("RECONCILIATION_OPENED", actor, caseId, current.getId(), "OPEN", invoice.invoiceNumber() + " EGP " + invoice.amountEgp().toPlainString()
                + " authorised EGP " + authorised.toPlainString());
        return views(caseId);
    }

    /** Finance submits the invoice lines (fresh sign-in): above the band it waits for a Finance Manager, else it is settled now. */
    @Transactional
    public ReconciliationView submit(UUID caseId, SubmitReconciliationRequest request) {
        Actor actor = authority.authorize(Permission.RECONCILE, Resource.ofCase(caseId));
        basis.lockStage(caseId);
        Reconciliation r = reconciliations.findByCaseId(caseId).flatMap(x -> reconciliations.lockById(x.getId()))
                .orElseThrow(() -> new ApiException(409, "RECONCILIATION_NOT_OPEN", "Open the reconciliation first"));
        if (r.getStatus() != Reconciliation.Status.OPEN) throw new ApiException(409, "RECONCILIATION_NOT_OPEN", "This reconciliation is not open");
        FinalInvoice invoice = basis.finalInvoice(caseId).orElseThrow(() -> new ApiException(409, "FINAL_INVOICE_MISSING", "Operations has not recorded the hospital's final invoice"));
        if (!invoice.evidenceId().equals(r.getFinalInvoiceEvidenceId()))
            throw new ApiException(409, "FINAL_INVOICE_CHANGED", "Operations corrected the final invoice; open the reconciliation again");
        BigDecimal sum = request.lines().stream().map(InvoiceLineRequest::invoiceEgp).reduce(BigDecimal.ZERO, BigDecimal::add);
        if (sum.compareTo(r.getInvoiceTotalEgp()) != 0)
            throw new ApiException(400, "INVOICE_LINES_MISMATCH", "The lines add up to EGP " + sum.toPlainString() + ", not the invoice total of EGP " + r.getInvoiceTotalEgp().toPlainString());
        Money money = basis.money(caseId);
        if (request.paidAtFacilityEgp().compareTo(money.admissionReceiptsEgp()) < 0)
            throw new ApiException(400, "PAID_AT_FACILITY_BELOW_RECEIPTS", "The patient paid the hospital at least the countersigned admission receipts (EGP "
                    + money.admissionReceiptsEgp().toPlainString() + ")");

        Map<UUID, CountedLine> counted = basis.countedLines(caseId).stream().collect(Collectors.toMap(CountedLine::lineId, Function.identity()));
        // Re-read what was authorised now: a change order counted since opening is part of it.
        BigDecimal authorised = authorised(caseId);
        if (authorised.compareTo(r.getAuthorisedEgp()) != 0 || basis.bandLimit(caseId).compareTo(r.getBandLimitEgp()) != 0)
            r.repoint(r.getFinalInvoiceEvidenceId(), r.getInvoiceTotalEgp(), authorised, basis.bandLimit(caseId));
        List<ReconciliationLine> built = new ArrayList<>();
        Set<UUID> used = new HashSet<>();
        boolean packageUsed = false;
        int n = 0;
        BigDecimal charged = BigDecimal.ZERO, disputed = BigDecimal.ZERO;
        for (InvoiceLineRequest l : request.lines()) {
            Source source = Source.valueOf(l.source());
            BigDecimal invoiceEgp = l.invoiceEgp().setScale(2, java.math.RoundingMode.HALF_UP);
            BigDecimal authorisedLine = null;
            UUID matched = null;
            switch (source) {
                case PACKAGE -> {
                    if (packageUsed) throw new ApiException(400, "LINE_MATCHED_TWICE", "Only one invoice line can be matched to the package");
                    packageUsed = true;
                    authorisedLine = money.packageEgp();
                }
                case CHANGE_ORDER_LINE -> {
                    CountedLine line = l.matchedId() == null ? null : counted.get(l.matchedId());
                    if (line == null) throw new ApiException(409, "CHANGE_ORDER_LINE_NOT_COUNTED", "Match only a line of an accepted or emergency change order that is priced");
                    if (!used.add(line.lineId())) throw new ApiException(400, "LINE_MATCHED_TWICE", "Each change-order line can be matched to one invoice line");
                    authorisedLine = line.lineEgp();
                    matched = line.lineId();
                }
                case NONE -> { }
            }
            Code code;
            BigDecimal chargedLine;
            if (authorisedLine != null) {
                int cmp = invoiceEgp.compareTo(authorisedLine);
                code = cmp == 0 ? (source == Source.PACKAGE ? Code.WITHIN_BAND : Code.CHANGE_ORDER) : cmp > 0 ? Code.BILLING_ERROR : Code.CREDIT;
                chargedLine = invoiceEgp.min(authorisedLine);
            } else if (invoiceEgp.signum() > 0) {
                code = "BILLING_ERROR".equals(l.code()) ? Code.BILLING_ERROR : Code.UNAPPROVED_EXTRA;
                chargedLine = BigDecimal.ZERO;
            } else {
                code = Code.CREDIT;
                chargedLine = invoiceEgp;
            }
            if (code.disputed()) disputed = disputed.add(invoiceEgp.subtract(chargedLine));
            charged = charged.add(chargedLine);
            built.add(new ReconciliationLine(r.getId(), ++n, l.description().trim(), invoiceEgp, source, matched, authorisedLine, chargedLine, code));
        }
        lines.deleteByReconciliationId(r.getId());
        lines.flush();
        lines.saveAllAndFlush(built);
        BigDecimal variance = r.getInvoiceTotalEgp().subtract(r.getAuthorisedEgp());
        boolean needsCountersign = variance.abs().compareTo(r.getBandLimitEgp()) > 0;
        Instant now = clock.instant();
        r.submit(new Reconciliation.Figures(charged, variance, disputed, request.paidAtFacilityEgp()), blankToNull(request.note()), actor.subject(), now, needsCountersign);
        reconciliations.saveAndFlush(r);
        work.closeWorkItems(caseId, RECONCILE_WORK, "Final invoice reconciled");
        audit("RECONCILIATION_SUBMITTED", actor, caseId, r.getId(), "SUBMIT", "charged EGP " + charged.toPlainString() + " variance EGP " + variance.toPlainString()
                + " disputed EGP " + disputed.toPlainString() + " band EGP " + r.getBandLimitEgp().toPlainString() + (needsCountersign ? " above band" : ""));
        if (needsCountersign) {
            String caseNumber = basis.caseNumber(caseId);
            List<String> managers = managers(actor.subject());
            work.openWorkItem(new NewWorkItem(caseId, COUNTERSIGN_WORK, "Countersign a reconciliation above the band",
                    "The hospital's final invoice differs from what was authorised by more than the change-order band. Check Finance's reconciliation, then approve or return it.",
                    managers.isEmpty() ? null : managers.get(0), MANAGER, false, null, "SYSTEM", COUNTERSIGN_WORK, "countersign-reconciliation:" + r.getId() + ":" + now, true,
                    WorkCopy.of(COUNTERSIGN_WORK, "caseNumber", caseNumber)));
        } else settle(caseId, r, actor.subject());
        return views(caseId);
    }

    // ---- Finance Manager ----

    /** A Finance Manager approves a variance above the band (fresh sign-in; never the submitter), or returns it to Finance. */
    @Transactional
    public ReconciliationView countersign(UUID caseId, CountersignReconciliationRequest request) {
        Actor actor = authority.authorize(Permission.RECONCILE_COUNTERSIGN, Resource.ofCase(caseId));
        basis.lockStage(caseId);
        Reconciliation r = locked(caseId);
        if (r.getStatus() != Reconciliation.Status.AWAITING_COUNTERSIGN)
            throw new ApiException(409, "RECONCILIATION_NOT_AWAITING", "This reconciliation is not waiting for a countersignature");
        if (actor.subject().equals(r.getSubmittedBy()))
            throw new ApiException(409, "SELF_COUNTERSIGN_REFUSED", "Someone other than the person who submitted it must countersign");
        work.closeWorkItems(caseId, COUNTERSIGN_WORK, "APPROVE".equals(request.decision()) ? "Countersigned" : "Returned to Finance");
        if ("APPROVE".equals(request.decision())) {
            r.countersign(actor.subject(), clock.instant());
            reconciliations.saveAndFlush(r);
            audit("RECONCILIATION_COUNTERSIGNED", actor, caseId, r.getId(), "COUNTERSIGN", "variance EGP " + r.getVarianceEgp().toPlainString());
            settle(caseId, r, actor.subject());
        } else {
            String submitter = r.getSubmittedBy();
            r.returnToFinance();
            reconciliations.saveAndFlush(r);
            lines.deleteByReconciliationId(r.getId());
            financeWork.open(caseId, RECONCILE_WORK, "Reconcile the hospital's final invoice again",
                    "A Finance Manager returned the reconciliation. Check the lines against the invoice and submit it again.", null,
                    "reconcile-returned:" + r.getId() + ":" + clock.instant(), WorkCopy.of(RECONCILE_WORK, "caseNumber", basis.caseNumber(caseId)));
            audit("RECONCILIATION_RETURNED", actor, caseId, r.getId(), "RETURN", "returned to " + submitter);
        }
        return views(caseId);
    }

    /** A Finance Manager settles the facility dispute (fresh sign-in): the hospital withdrew the charge or the platform absorbed it. */
    @Transactional
    public ReconciliationView resolveDispute(UUID caseId, ResolveDisputeRequest request) {
        Actor actor = authority.authorize(Permission.RECONCILE_COUNTERSIGN, Resource.ofCase(caseId));
        basis.lockStage(caseId);
        Reconciliation r = locked(caseId);
        if (r.getStatus() != Reconciliation.Status.DISPUTED) throw new ApiException(409, "NO_OPEN_DISPUTE", "This reconciliation has no open facility dispute");
        Reconciliation.DisputeOutcome outcome = Reconciliation.DisputeOutcome.valueOf(request.outcome());
        Instant now = clock.instant();
        r.resolveDispute(outcome, actor.subject(), now);
        reconciliations.saveAndFlush(r);
        UUID live = ledger.latest(caseId, Kind.RECONCILIATION).map(e -> e.getId()).orElse(null);
        ledger.record(caseId, new Fact(Kind.RECONCILIATION, null, r.getId().toString(), r.getChargedEgp(), now, payload(r)), actor.subject(), "FINANCE", live);
        work.closeWorkItems(caseId, DISPUTE_WORK, "Facility dispute settled: " + outcome.name());
        audit("FACILITY_DISPUTE_RESOLVED", actor, caseId, r.getId(), "RESOLVE", outcome.name() + " EGP " + r.getDisputedEgp().toPlainString());
        return views(caseId);
    }

    // ---- reads ----

    /** The reconciliation workbench and the statements (Finance, a Finance Manager, the case's coordinator and Operations). */
    @Transactional(readOnly = true)
    public ReconciliationView view(UUID caseId) {
        authority.authorize(Permission.SETTLEMENT_READ, Resource.ofCase(caseId));
        return views(caseId);
    }

    ReconciliationView views(UUID caseId) {
        FinalInvoice invoice = basis.finalInvoice(caseId).orElse(null);
        Reconciliation r = reconciliations.findByCaseId(caseId).orElse(null);
        Money money = basis.money(caseId);
        List<QuoteLineView> quote = new ArrayList<>();
        quote.add(new QuoteLineView(Source.PACKAGE.name(), null, money.voucherNumber(), null, "Facility package", BigDecimal.ONE, money.packageEgp()));
        for (CountedLine l : basis.countedLines(caseId))
            quote.add(new QuoteLineView(Source.CHANGE_ORDER_LINE.name(), l.lineId(), l.orderNumber(), l.kind(), l.description(), l.quantity(), l.lineEgp()));
        BigDecimal authorised = r != null ? r.getAuthorisedEgp() : authorised(caseId);
        BigDecimal band = r != null ? r.getBandLimitEgp() : basis.bandLimit(caseId);
        List<InvoiceLineView> invoiceLines = r == null ? List.of() : lines.findByReconciliationIdOrderByLineNoAsc(r.getId()).stream()
                .map(l -> new InvoiceLineView(l.getLineNo(), l.getDescription(), l.getInvoiceEgp(), l.getMatchedSource().name(), l.getMatchedId(), l.getAuthorisedEgp(),
                        l.getChargedEgp(), l.getVarianceEgp(), l.getVarianceCode().name())).toList();
        BigDecimal variance = invoice == null ? null : invoice.amountEgp().subtract(authorised);
        return new ReconciliationView(caseId, basis.stage(caseId),
                invoice == null ? null : new FinalInvoiceView(invoice.evidenceId(), invoice.invoiceNumber(), invoice.amountEgp(), invoice.issuedAt(), invoice.documentId(), invoice.countersigned()),
                r == null ? null : r.getId(), r == null ? null : r.getStatus().name(), authorised, band, quote, invoiceLines,
                r == null ? null : r.getChargedEgp(), r != null && r.getVarianceEgp() != null ? r.getVarianceEgp() : variance, r == null ? null : r.getDisputedEgp(),
                r == null ? null : r.getPaidAtFacilityEgp(), variance != null && variance.abs().compareTo(band) > 0,
                r == null ? null : r.getOpenedBy(), r == null ? null : r.getOpenedAt(), r == null ? null : r.getSubmittedBy(), r == null ? null : r.getSubmittedAt(),
                r == null ? null : r.getCountersignedBy(), r == null ? null : r.getCountersignedAt(), r == null ? null : r.getSettledAt(),
                r == null || r.getDisputeOutcome() == null ? null : r.getDisputeOutcome().name(), r == null ? null : r.getDisputeResolvedAt(),
                r == null ? null : r.getNote(), basis.facilityName(caseId), statements.staffStatements(caseId));
    }

    // ---- internals ----

    /**
     * The reconciliation is settled: its ledger row (Finance's open money on the case ends; a discharged case may move to follow-up),
     * the patient's statement, the facility dispute when anything was not charged, and the refund when the patient paid too much.
     */
    private void settle(UUID caseId, Reconciliation r, String subject) {
        Instant now = clock.instant();
        ledger.record(caseId, new Fact(Kind.RECONCILIATION, null, r.getId().toString(), r.getChargedEgp(), now, payload(r)), subject, "FINANCE", null);
        Statement statement = statements.issueDischarge(caseId, r, subject);
        String caseNumber = basis.caseNumber(caseId);
        if (r.getStatus() == Reconciliation.Status.DISPUTED) {
            List<String> managers = managers(null);
            String facility = basis.facilityName(caseId);
            work.openWorkItem(new NewWorkItem(caseId, DISPUTE_WORK, "Settle a dispute with the hospital",
                    "EGP " + r.getDisputedEgp().toPlainString() + " on " + (facility == null ? "the hospital's" : facility + "'s")
                            + " final invoice was not approved and is not charged to the patient. Settle it with the hospital.",
                    managers.isEmpty() ? null : managers.get(0), MANAGER, false, null, "SYSTEM", DISPUTE_WORK, "facility-dispute:" + r.getId(), true,
                    WorkCopy.of(DISPUTE_WORK, "caseNumber", caseNumber)));
        }
        BigDecimal credit = statement.totals().creditDueEgp();
        if (credit.signum() > 0)
            financeWork.open(caseId, REFUND_WORK, "Refund the patient's credit",
                    "The patient paid EGP " + credit.toPlainString() + " more than they were charged. Refund it to the original method; the hospital refunds any part it collected.",
                    null, "refund-credit:" + statement.getId(), WorkCopy.of(REFUND_WORK, "caseNumber", caseNumber));
        events.publishEvent(new CaseEvents.DischargeEvidenceChanged(caseId));
    }

    /** What authorises the invoice: the facility package plus the case's counted change orders. */
    private BigDecimal authorised(UUID caseId) { return basis.money(caseId).packageEgp().add(basis.countedChangeOrdersEgp(caseId)); }

    private Reconciliation locked(UUID caseId) {
        return reconciliations.findByCaseId(caseId).flatMap(x -> reconciliations.lockById(x.getId()))
                .orElseThrow(() -> new ApiException(404, "RECONCILIATION_NOT_FOUND", "This case has no reconciliation"));
    }

    /** The active Finance Managers, the given subject (the submitter) excluded, in a stable order. */
    private List<String> managers(String excluded) {
        return workforce.activeHolders(MANAGER).stream().map(WorkforceDirectory.Member::subject).distinct().filter(s -> !s.equals(excluded)).sorted().toList();
    }

    private String payload(Reconciliation r) {
        Map<String, String> p = new LinkedHashMap<>();
        p.put("status", r.getStatus().name());
        p.put("varianceEgp", r.getVarianceEgp().toPlainString());
        p.put("disputedEgp", r.getDisputedEgp().toPlainString());
        if (r.getDisputeOutcome() != null) p.put("disputeOutcome", r.getDisputeOutcome().name());
        try { return json.writeValueAsString(p); } catch (Exception e) { throw new IllegalStateException("Cannot write the reconciliation payload", e); }
    }

    private void audit(String type, Actor actor, UUID caseId, UUID id, String action, String reason) {
        auditTrail.event(type).actor(actor.subject(), actor.label()).caseId(caseId).entity("Reconciliation", id).action(action).reason(reason).record();
    }

    private static String blankToNull(String v) { return v == null || v.isBlank() ? null : v.trim(); }
}
