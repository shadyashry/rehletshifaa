package com.rehletshifaa.settlement.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.journey.application.PublicCaseAccessService;
import com.rehletshifaa.journey.application.SettlementBasis;
import com.rehletshifaa.journey.application.SettlementBasis.Money;
import com.rehletshifaa.settlement.api.SettlementDtos.EInvoiceRequest;
import com.rehletshifaa.settlement.api.SettlementDtos.PatientStatementView;
import com.rehletshifaa.settlement.api.SettlementDtos.StatementLineView;
import com.rehletshifaa.settlement.api.SettlementDtos.StatementTotalsView;
import com.rehletshifaa.settlement.api.SettlementDtos.StatementView;
import com.rehletshifaa.settlement.domain.Reconciliation;
import com.rehletshifaa.settlement.domain.ReconciliationLine;
import com.rehletshifaa.settlement.domain.Statement;
import com.rehletshifaa.settlement.infrastructure.ReconciliationLineRepository;
import com.rehletshifaa.settlement.infrastructure.StatementRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The patient's statements (P1-17; post-deposit design §6 rules 1 and 5; architecture §4.5, §5.5): the {@code DISCHARGE} statement
 * is issued when the hospital's final invoice is reconciled, from the voucher's frozen split, the reconciliation, the payments
 * and the refunds. One statement shows the three legs together — the platform fee, the medical care (the package and the change
 * orders as reconciled), and every payment — in EGP and in the patient's currency at the frozen rate.
 *
 * <p>The money rule is P1-15's (the deposit covers the platform fee first); untouched here. What the patient was charged for
 * medical care is the reconciled amount: an unapproved extra or a billing error on the invoice is never on it. The balance is the
 * total charged less every payment plus every refund: above zero it is still due, below zero it is a credit Finance refunds to
 * source ({@code REFUND_CREDIT}). A statement is immutable; the platform e-invoice reference is the one slot filled later.
 *
 * <p>P1-18: the {@code CLOSURE} statement is the same account when the case closes (refunds made since discharge included); it is
 * issued on {@link com.rehletshifaa.journey.application.CaseEvents.CaseClosed}, again only when the figures changed since the last
 * closure statement (a reopened case that closes again with the same account gets no second one). The patient hears about it in
 * the closure message ({@code closure-review}), not in a separate one.
 */
@Service
public class StatementService {
    /** Patient-facing line kinds, in the order a statement lists them. */
    static final String PACKAGE = "PACKAGE", CHANGE_ORDER = "CHANGE_ORDER", CREDIT = "CREDIT", PLATFORM_FEE = "PLATFORM_FEE", DEPOSIT_PAID = "DEPOSIT_PAID",
            FEE_BALANCE_PAID = "FEE_BALANCE_PAID", PAID_AT_FACILITY = "PAID_AT_FACILITY", REFUNDED = "REFUNDED";
    record Line(String kind, String description, BigDecimal amountEgp) {}

    private final Authority authority;
    private final Clock clock;
    private final AuditTrail auditTrail;
    private final SettlementBasis basis;
    private final StatementRepository statements;
    private final ReconciliationLineRepository lines;
    private final com.rehletshifaa.settlement.infrastructure.ReconciliationRepository reconciliations;
    private final PublicCaseAccessService publicAccess;
    private final ObjectMapper json;

    public StatementService(Authority authority, Clock clock, AuditTrail auditTrail, SettlementBasis basis, StatementRepository statements,
                            ReconciliationLineRepository lines, PublicCaseAccessService publicAccess, ObjectMapper json,
                            com.rehletshifaa.settlement.infrastructure.ReconciliationRepository reconciliations) {
        this.reconciliations = reconciliations;
        this.authority = authority; this.clock = clock; this.auditTrail = auditTrail; this.basis = basis; this.statements = statements; this.lines = lines;
        this.publicAccess = publicAccess; this.json = json;
    }

    /**
     * Issues the case's DISCHARGE statement from its settled reconciliation (the next revision, superseding the last); the patient
     * is told it is ready (portal link only). Called by the reconciliation inside its transaction; the caller has authorised.
     */
    @Transactional
    public Statement issueDischarge(UUID caseId, Reconciliation reconciliation, String subject) {
        Statement statement = issue(caseId, Statement.Kind.DISCHARGE, reconciliation, subject);
        basis.notifyPatient(caseId, "statement-ready", "statement-ready:" + statement.getId());
        return statement;
    }

    /** The case closed: its CLOSURE statement from the settled reconciliation, when it has one and the account changed. */
    @org.springframework.context.event.EventListener
    public void on(com.rehletshifaa.journey.application.CaseEvents.CaseClosed event) {
        UUID caseId = event.caseId();
        Reconciliation reconciliation = reconciliations.findByCaseId(caseId).filter(Reconciliation::settled).orElse(null);
        if (reconciliation == null) return;
        Statement last = statements.findFirstByCaseIdAndKindOrderByRevisionDesc(caseId, Statement.Kind.CLOSURE.name()).orElse(null);
        if (last != null && sameAccount(last.totals(), totals(caseId, reconciliation))) return;
        issue(caseId, Statement.Kind.CLOSURE, reconciliation, "SYSTEM");
    }

    private static boolean sameAccount(Statement.Totals a, Statement.Totals b) {
        return a.totalChargedEgp().compareTo(b.totalChargedEgp()) == 0 && a.refundedEgp().compareTo(b.refundedEgp()) == 0
                && a.balanceDueEgp().compareTo(b.balanceDueEgp()) == 0 && a.creditDueEgp().compareTo(b.creditDueEgp()) == 0;
    }

    private Statement.Totals totals(UUID caseId, Reconciliation reconciliation) {
        Money money = basis.money(caseId);
        BigDecimal medical = reconciliation.getChargedEgp();
        BigDecimal fee = money.platformFeeEgp();
        BigDecimal total = medical.add(fee);
        BigDecimal paid = money.depositPaidEgp().add(money.feeBalancePaidEgp()).add(reconciliation.getPaidAtFacilityEgp());
        BigDecimal net = total.subtract(paid).add(money.depositRefundedEgp());
        return new Statement.Totals(money.packageEgp(), basis.countedChangeOrdersEgp(caseId), medical, fee, total, money.depositPaidEgp(), money.feeBalancePaidEgp(),
                reconciliation.getPaidAtFacilityEgp(), money.depositRefundedEgp(), net.max(BigDecimal.ZERO), net.negate().max(BigDecimal.ZERO));
    }

    /** The next revision of a kind from the reconciliation and the money now; the caller tells the patient. */
    private Statement issue(UUID caseId, Statement.Kind kind, Reconciliation reconciliation, String subject) {
        Money money = basis.money(caseId);
        List<ReconciliationLine> invoiceLines = lines.findByReconciliationIdOrderByLineNoAsc(reconciliation.getId());
        Statement.Totals totals = totals(caseId, reconciliation);
        BigDecimal fee = totals.platformFeeEgp(), total = totals.totalChargedEgp();
        BigDecimal net = totals.balanceDueEgp().subtract(totals.creditDueEgp());

        List<Line> out = new ArrayList<>();
        for (ReconciliationLine l : invoiceLines) {
            if (l.getChargedEgp().signum() == 0) continue; // never charged: not on the patient's statement
            String line = l.getChargedEgp().signum() < 0 ? CREDIT : l.getMatchedSource() == ReconciliationLine.Source.PACKAGE ? PACKAGE : CHANGE_ORDER;
            out.add(new Line(line, l.getDescription(), l.getChargedEgp()));
        }
        if (fee.signum() > 0) out.add(new Line(PLATFORM_FEE, null, fee));
        if (money.depositPaidEgp().signum() > 0) out.add(new Line(DEPOSIT_PAID, null, money.depositPaidEgp().negate()));
        if (money.feeBalancePaidEgp().signum() > 0) out.add(new Line(FEE_BALANCE_PAID, null, money.feeBalancePaidEgp().negate()));
        if (reconciliation.getPaidAtFacilityEgp().signum() > 0) out.add(new Line(PAID_AT_FACILITY, null, reconciliation.getPaidAtFacilityEgp().negate()));
        if (money.depositRefundedEgp().signum() > 0) out.add(new Line(REFUNDED, null, money.depositRefundedEgp()));

        Statement previous = statements.findFirstByCaseIdAndKindOrderByRevisionDesc(caseId, kind.name()).orElse(null);
        int revision = previous == null ? 1 : previous.getRevision() + 1;
        Instant now = clock.instant();
        Statement statement = statements.saveAndFlush(new Statement(caseId, kind, basis.caseNumber(caseId), revision, reconciliation.getId(),
                money.displayCurrency() == null ? "EGP" : money.displayCurrency(), money.fxRate(), totals, write(out), previous == null ? null : previous.getId(),
                subject, now));
        auditTrail.event("STATEMENT_ISSUED").actor(subject, "SYSTEM".equals(subject) ? "SYSTEM" : "FINANCE").caseId(caseId).entity("Statement", statement.getId()).action("ISSUE")
                .reason(statement.getStatementNumber() + " total EGP " + total.toPlainString() + " balance EGP " + net.toPlainString()).record();
        return statement;
    }

    /** Finance records the platform's e-invoice reference on a statement (fresh sign-in; once). */
    @Transactional
    public StatementView recordEInvoice(UUID caseId, UUID statementId, EInvoiceRequest request) {
        Actor actor = authority.authorize(Permission.STATEMENT_ISSUE, Resource.ofCase(caseId));
        Statement statement = statements.lockById(statementId).filter(s -> s.getCaseId().equals(caseId))
                .orElseThrow(() -> new ApiException(404, "STATEMENT_NOT_FOUND", "The statement was not found on this case"));
        if (statement.getEInvoiceRef() != null) throw new ApiException(409, "E_INVOICE_ALREADY_RECORDED", "This statement already carries its e-invoice reference");
        statement.recordEInvoice(request.reference().trim(), actor.subject(), clock.instant());
        statements.saveAndFlush(statement);
        auditTrail.event("STATEMENT_E_INVOICE_RECORDED").actor(actor.subject(), actor.label()).caseId(caseId).entity("Statement", statementId)
                .action("UPDATE").reason(statement.getStatementNumber()).record();
        return view(statement, true);
    }

    /** The patient's (or representative's) statements: the current revision of each kind. */
    @Transactional(readOnly = true)
    public List<PatientStatementView> patientStatements(UUID caseId) {
        authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        return forPatient(caseId);
    }

    /** The same from the verified secure status link. */
    @Transactional(readOnly = true)
    public List<PatientStatementView> statementsFromLink(String token, String grant) {
        return forPatient(publicAccess.requireCaseGrant(token, grant).caseId());
    }

    /** Every statement of the case, newest first (the caller has authorised). */
    List<StatementView> staffStatements(UUID caseId) {
        List<Statement> all = statements.findByCaseIdOrderByIssuedAtDescRevisionDesc(caseId);
        Set<UUID> superseded = all.stream().map(Statement::getSupersedesId).filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        return all.stream().map(s -> view(s, !superseded.contains(s.getId()))).toList();
    }

    private List<PatientStatementView> forPatient(UUID caseId) {
        List<Statement> all = statements.findByCaseIdOrderByIssuedAtDescRevisionDesc(caseId);
        Set<UUID> superseded = all.stream().map(Statement::getSupersedesId).filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        return all.stream().filter(s -> !superseded.contains(s.getId())).map(s -> new PatientStatementView(s.getId(), s.getKind().name(), s.getStatementNumber(),
                s.getRevision(), s.getIssuedAt(), s.getDisplayCurrency(), totals(s), lines(s))).toList();
    }

    private StatementView view(Statement s, boolean current) {
        return new StatementView(s.getId(), s.getKind().name(), s.getStatementNumber(), s.getRevision(), current, s.getIssuedAt(), s.getIssuedBy(),
                s.getDisplayCurrency(), s.getFxRate(), totals(s), lines(s), s.getEInvoiceRef(), s.getEInvoiceRecordedAt(), s.getSupersedesId());
    }

    private static StatementTotalsView totals(Statement s) {
        Statement.Totals t = s.totals();
        BigDecimal rate = s.getFxRate();
        return new StatementTotalsView(t.packageEgp(), t.changeOrdersEgp(), t.medicalChargedEgp(), t.platformFeeEgp(), t.totalChargedEgp(),
                SettlementBasis.display(t.totalChargedEgp(), rate), t.depositPaidEgp(), t.feeBalancePaidEgp(), t.paidAtFacilityEgp(), t.refundedEgp(),
                t.balanceDueEgp(), SettlementBasis.display(t.balanceDueEgp(), rate), t.creditDueEgp(), SettlementBasis.display(t.creditDueEgp(), rate));
    }

    private List<StatementLineView> lines(Statement s) {
        List<Line> stored;
        try { stored = json.readValue(s.getLines(), new TypeReference<List<Line>>() {}); }
        catch (Exception e) { stored = List.of(); }
        return stored.stream().map(l -> new StatementLineView(l.kind(), l.description(), l.amountEgp(), SettlementBasis.display(l.amountEgp(), s.getFxRate()))).toList();
    }

    private String write(Object value) {
        try { return json.writeValueAsString(value); } catch (Exception e) { throw new IllegalStateException("Cannot write the statement lines", e); }
    }
}
