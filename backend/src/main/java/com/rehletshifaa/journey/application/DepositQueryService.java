package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.DepositComponentView;
import com.rehletshifaa.journey.api.JourneyDtos.DepositPolicyView;
import com.rehletshifaa.journey.api.JourneyDtos.DepositView;
import com.rehletshifaa.journey.api.JourneyDtos.PaymentEventView;
import com.rehletshifaa.journey.api.JourneyDtos.TransferReportView;
import com.rehletshifaa.journey.infrastructure.CoordinationDepositPolicyRepository;
import com.rehletshifaa.journey.infrastructure.DepositComponentRepository;
import com.rehletshifaa.journey.infrastructure.DepositRepository;
import com.rehletshifaa.journey.infrastructure.DepositTransferReportRepository;
import com.rehletshifaa.journey.infrastructure.PaymentEventRepository;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;

/**
 * The reads behind {@link PaymentService}: the deposit view, where a case's deposit stands for readiness, the ledger
 * totals and the deposit policies. A deposit view costs a fixed four queries (deposit, components, ledger, totals);
 * the readiness standing reads the active deposit once, and the policy only when no deposit exists yet.
 */
@Service
public class DepositQueryService {
    private final DepositRepository deposits;
    private final DepositComponentRepository components;
    private final PaymentEventRepository ledger;
    private final CoordinationDepositPolicyRepository policies;
    private final MedicalCaseRepository cases;
    private final DepositTransferReportRepository transfers;
    private final BankTransferDetails bank;
    private final com.rehletshifaa.journey.infrastructure.ProposalVersionRepository proposalVersions;
    private final DepositCalculator calculator;

    public DepositQueryService(DepositRepository deposits, DepositComponentRepository components, PaymentEventRepository ledger,
                               CoordinationDepositPolicyRepository policies, MedicalCaseRepository cases,
                               DepositTransferReportRepository transfers, BankTransferDetails bank,
                               com.rehletshifaa.journey.infrastructure.ProposalVersionRepository proposalVersions, DepositCalculator calculator) {
        this.deposits = deposits; this.components = components; this.ledger = ledger; this.policies = policies; this.cases = cases;
        this.transfers = transfers; this.bank = bank; this.proposalVersions = proposalVersions; this.calculator = calculator;
    }

    /** EGP recorded as paid and as refunded on one deposit. */
    record Totals(BigDecimal paidEgp, BigDecimal refundedEgp) {
        BigDecimal netEgp() { return paidEgp.subtract(refundedEgp); }
    }

    /**
     * The active deposit policy: the share of the estimate due as the deposit (W-1) and its bounds in US dollars (P0-4,
     * null: unbounded). The amount itself is {@link DepositCalculator}'s.
     */
    record ActivePolicy(UUID id, BigDecimal rate, int version, BigDecimal minimumUsd, BigDecimal maximumUsd) {
        boolean due() { return rate != null && rate.signum() > 0; }
    }

    /**
     * Where the case's deposit stands for readiness: its patient-safe status (NONE / REQUIRED / REQUESTED /
     * PARTIALLY_PAID / PAID / WAIVED), whether an authorized waiver is recorded, whether it no longer blocks
     * (none due, PAID or WAIVED), and the amount due on acknowledgement (the live deposit's total, else the policy amount).
     */
    record Standing(String status, boolean waived, boolean satisfied, BigDecimal anticipatedEgp, BigDecimal anticipatedDisplay, String currency) {}

    /** The case's latest deposit (cancelled included) with its components, ledger and paid/balance amounts; null when none. */
    @Transactional(readOnly = true)
    public DepositView depositForCase(UUID caseId) {
        DepositRepository.Quoted d = deposits.findLatestOf(caseId, Limit.of(1)).stream().findFirst().orElse(null);
        if (d == null) return null;
        BigDecimal rate = d.getFxRate() == null ? BigDecimal.ONE : d.getFxRate();
        List<DepositComponentView> lines = components.findLinesOf(d.getId()).stream()
                .map(c -> new DepositComponentView(c.getBeneficiary(), c.getPurpose(), c.getAmountEgp(), display(c.getAmountEgp(), rate),
                        c.getRefundability(), c.getCancellationTerms(), Boolean.TRUE.equals(c.getCreditedToFinal())))
                .toList();
        List<PaymentEventView> events = ledger.findLedgerOf(d.getId()).stream()
                .map(e -> new PaymentEventView(e.getEventType(), e.getAmountDisplay(), e.getCurrency(), e.getMethod(), e.getProvider(),
                        e.getProviderReference(), e.getStatus(), e.getReason(), e.getOccurredAt()))
                .toList();
        BigDecimal netPaidEgp = totalsOf(d.getId()).netEgp();
        BigDecimal paidDisplay = display(netPaidEgp, rate);
        BigDecimal balanceEgp = d.getTotalEgp().subtract(netPaidEgp).max(BigDecimal.ZERO);
        BigDecimal balanceDisplay = display(balanceEgp, rate);
        TransferReportView transfer = transfers.findLatestOn(d.getId(), Limit.of(1)).stream().findFirst().map(DepositQueryService::transferView).orElse(null);
        return new DepositView(d.getId(), d.getStatus(), d.getCurrency(), d.getTotalEgp(), d.getTotalDisplay(), paidDisplay, balanceDisplay, lines, events,
                transfer, bank.forCase(cases.findCaseNumber(caseId).orElse(null)), netPaidEgp, balanceEgp);
    }

    Standing standing(UUID caseId) {
        DepositRepository.Quoted d = activeDeposit(caseId);
        if (d == null) {
            ActivePolicy policy = activePolicyFor(cases.findCareCategory(caseId).orElse(null));
            // W-1: a share of the latest estimate; required whenever the policy asks for one, even before an estimate exists.
            boolean due = policy != null && policy.due();
            var estimate = proposalVersions.findLatestEstimate(caseId, Limit.of(1)).stream().findFirst().orElse(null);
            DepositCalculator.Amount anticipated = !due || estimate == null ? DepositCalculator.Amount.none(estimate == null ? "EGP" : estimate.getCurrency())
                    : calculator.quote(policy, estimate.getPatientTotalExpectedEgp(), estimate.getCurrency(), estimate.getFxRate(), estimate.getFxRateDate());
            return new Standing(due ? "REQUIRED" : "NONE", false, !due, anticipated.egp(), anticipated.display(), anticipated.currency());
        }
        boolean waived = d.getWaivedAt() != null;
        return new Standing(waived ? "WAIVED" : d.getStatus(), waived, waived || "PAID".equals(d.getStatus()), d.getTotalEgp(), d.getTotalDisplay(), d.getCurrency());
    }

    /** The bank-transfer reference waiting for Finance on the case's active deposit, if any (DEP-3). */
    TransferReportView pendingTransfer(UUID caseId) {
        DepositRepository.Quoted d = activeDeposit(caseId);
        return d == null ? null : transfers.findPendingOn(d.getId(), Limit.of(1)).stream().findFirst().map(DepositQueryService::transferView).orElse(null);
    }

    /** The case's active deposit while it is open (requested or part paid, not waived), or null. */
    DepositRepository.Quoted openDeposit(UUID caseId) {
        DepositRepository.Quoted d = activeDeposit(caseId);
        return d != null && d.getWaivedAt() == null && java.util.Set.of("REQUESTED", "PARTIALLY_PAID").contains(d.getStatus()) ? d : null;
    }

    private static TransferReportView transferView(DepositTransferReportRepository.Row r) {
        return new TransferReportView(r.getId(), r.getMethod(), r.getTransferReference(), r.getStatus(), r.getSubmittedAt(), r.getDecidedAt(),
                r.getDecisionReason(), r.getVersion() == null ? 0 : r.getVersion(), r.getAgentName());
    }

    /** Net EGP recorded as paid on the case's active deposit (paid minus refunded); zero without one. */
    BigDecimal netPaidEgp(UUID caseId) {
        DepositRepository.Quoted d = activeDeposit(caseId);
        return d == null ? BigDecimal.ZERO : totalsOf(d.getId()).netEgp();
    }

    /** P1-17: EGP recorded as paid and as refunded on the case's active deposit (the statement's lines); zeros without one. */
    Totals activeTotals(UUID caseId) {
        DepositRepository.Quoted d = activeDeposit(caseId);
        return d == null ? new Totals(BigDecimal.ZERO, BigDecimal.ZERO) : totalsOf(d.getId());
    }

    Totals totalsOf(UUID depositId) {
        PaymentEventRepository.Totals t = ledger.findTotalsOf(depositId);
        return new Totals(zeroIfNull(t == null ? null : t.getPaidEgp()), zeroIfNull(t == null ? null : t.getRefundedEgp()));
    }

    /** The care area's active policy, else the active default; null when neither exists. */
    ActivePolicy activePolicyFor(String careCategory) {
        CoordinationDepositPolicyRepository.Row p = careCategory == null ? null
                : policies.findActiveFor(careCategory, Limit.of(1)).stream().findFirst().orElse(null);
        if (p == null) p = policies.findActiveDefault(Limit.of(1)).stream().findFirst().orElse(null);
        return p == null ? null : new ActivePolicy(p.getId(), p.getDepositRate(), p.getVersion(), p.getMinimumUsd(), p.getMaximumUsd());
    }

    List<DepositPolicyView> policies() {
        return policies.findAllRows().stream().map(DepositQueryService::policyView).toList();
    }

    DepositPolicyView policy(UUID id) {
        return policies.findRow(id).map(DepositQueryService::policyView).orElseThrow();
    }

    /** The case's active (latest, not cancelled) deposit, or null. */
    private DepositRepository.Quoted activeDeposit(UUID caseId) {
        return deposits.findLatestLiveOf(caseId, Limit.of(1)).stream().findFirst().orElse(null);
    }

    private static DepositPolicyView policyView(CoordinationDepositPolicyRepository.Row p) {
        return new DepositPolicyView(p.getId(), p.getName(), p.getCareCategory(), p.getDepositRate(), p.getMinimumUsd(), p.getMaximumUsd(), Boolean.TRUE.equals(p.getActive()),
                p.getVersion(), p.getCreatedBy(), p.getValidFrom());
    }

    static BigDecimal display(BigDecimal egp, BigDecimal rate) { return egp.multiply(rate).setScale(2, RoundingMode.HALF_UP); }

    private static BigDecimal zeroIfNull(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }
}
