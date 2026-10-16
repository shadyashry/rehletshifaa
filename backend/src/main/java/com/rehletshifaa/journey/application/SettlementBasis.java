package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.facility.application.FacilityDirectory;
import com.rehletshifaa.journey.domain.AdmissionVoucher;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.journey.domain.CaseEvidence.Kind;
import com.rehletshifaa.journey.domain.ChangeOrder;
import com.rehletshifaa.journey.domain.ChangeOrderLine;
import com.rehletshifaa.journey.domain.FacilityAdmission;
import com.rehletshifaa.journey.infrastructure.ChangeOrderLineRepository;
import com.rehletshifaa.journey.infrastructure.ChangeOrderRepository;
import com.rehletshifaa.journey.infrastructure.FacilityAdmissionRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * What the settlement module reads from the journey (P1-17; architecture §5.5): the money a case's statement is built from, the
 * change-order lines that authorise invoice lines, the hospital's final invoice, the band, and the patient's message. One public
 * door, so the settlement module never reaches into the journey's repositories and the two modules never import each other back.
 *
 * <p>Money: the current voucher's frozen split (package, platform fee, the deposit paid and the credit it leaves for the hospital,
 * the patient's currency and rate); for a case admitted in an emergency without a voucher, the accepted version's provider net and
 * fee under the same rule (the deposit covers the fee first). The deposit's paid and refunded totals and the platform fee balance
 * received are read as they stand now.
 */
@Component
public class SettlementBasis {
    /** The money a case's statement is built from (EGP; the patient's currency at the frozen rate). */
    public record Money(BigDecimal packageEgp, BigDecimal platformFeeEgp, BigDecimal depositPaidEgp, BigDecimal depositRefundedEgp,
                        BigDecimal depositCreditEgp, BigDecimal feeBalancePaidEgp, BigDecimal admissionReceiptsEgp, String displayCurrency,
                        BigDecimal fxRate, String voucherNumber) {}

    /** A priced line of a change order that counts (accepted, or done in an emergency): what can authorise an invoice line. */
    public record CountedLine(UUID lineId, UUID orderId, String orderNumber, String kind, String description, BigDecimal quantity, BigDecimal lineEgp) {}

    /** The hospital's live final invoice. */
    public record FinalInvoice(UUID evidenceId, String invoiceNumber, BigDecimal amountEgp, Instant issuedAt, UUID documentId, boolean countersigned,
                               String recordedBy) {}

    private final EvidenceLedger ledger;
    private final AdmissionReadiness readiness;
    private final TreatmentViews treatment;
    private final ChangeOrderRepository orders;
    private final ChangeOrderLineRepository lines;
    private final ProposalVersionRepository proposalVersions;
    private final FacilityAdmissionRepository admissions;
    private final FacilityDirectory facilities;
    private final MedicalCaseRepository cases;
    private final DepositQueryService deposits;
    private final DepositPaymentNotices notices;

    public SettlementBasis(EvidenceLedger ledger, AdmissionReadiness readiness, TreatmentViews treatment, ChangeOrderRepository orders,
                           ChangeOrderLineRepository lines, ProposalVersionRepository proposalVersions, FacilityAdmissionRepository admissions,
                           FacilityDirectory facilities, MedicalCaseRepository cases, DepositQueryService deposits, DepositPaymentNotices notices) {
        this.ledger = ledger; this.readiness = readiness; this.treatment = treatment; this.orders = orders; this.lines = lines;
        this.proposalVersions = proposalVersions; this.admissions = admissions; this.facilities = facilities; this.cases = cases;
        this.deposits = deposits; this.notices = notices;
    }

    /** Locks the case row (the settlement's writes serialise with the journey's) and returns its stage. */
    @Transactional
    public String lockStage(UUID caseId) {
        return cases.lockById(caseId).map(c -> c.getStatus().name()).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
    }

    @Transactional(readOnly = true)
    public String caseNumber(UUID caseId) { return cases.findCaseNumber(caseId).orElse(""); }

    /** The case's stage, read without a lock. */
    @Transactional(readOnly = true)
    public String stage(UUID caseId) { return cases.findStageAndVersion(caseId).map(s -> s.getStatus().name()).orElse(null); }

    @Transactional(readOnly = true)
    public Money money(UUID caseId) {
        BigDecimal feeBalancePaid = ledger.total(caseId, Kind.FEE_BALANCE_RECEIVED);
        BigDecimal receipts = ledger.total(caseId, Kind.BALANCE_EVIDENCED);
        DepositQueryService.Totals totals = deposits.activeTotals(caseId);
        Optional<AdmissionVoucher> voucher = readiness.currentVoucher(caseId);
        if (voucher.isPresent()) {
            AdmissionVoucher.Split s = voucher.get().split();
            AdmissionVoucher.Rate r = voucher.get().rate();
            return new Money(s.packageTotalEgp(), s.platformFeeEgp(), totals.paidEgp(), totals.refundedEgp(), s.depositCreditEgp(), feeBalancePaid, receipts,
                    r.displayCurrency(), r.fxRate(), voucher.get().getVoucherNumber());
        }
        var basis = proposalVersions.findAcceptedBases(caseId, Limit.of(1)).stream().findFirst().orElse(null);
        BigDecimal pkg = basis == null ? BigDecimal.ZERO : nz(basis.getProviderNetEgp());
        BigDecimal fee = basis == null ? BigDecimal.ZERO : nz(basis.getMarginAmountEgp()).add(nz(basis.getTaxEgp()));
        BigDecimal credit = totals.netEgp().subtract(fee.min(totals.netEgp())).max(BigDecimal.ZERO);
        String currency = basis == null || basis.getCurrency() == null ? "EGP" : basis.getCurrency();
        return new Money(pkg, fee, totals.paidEgp(), totals.refundedEgp(), credit, feeBalancePaid, receipts, currency,
                basis == null || "EGP".equals(currency) ? null : basis.getFxRate(), null);
    }

    /** The case's counted change orders' priced lines, oldest order first. */
    @Transactional(readOnly = true)
    public List<CountedLine> countedLines(UUID caseId) {
        Map<UUID, ChangeOrder> counted = orders.findByCaseIdOrderBySeqNoAsc(caseId).stream()
                .filter(o -> Set.of(ChangeOrder.Status.ACCEPTED, ChangeOrder.Status.EMERGENCY).contains(o.getStatus()) && o.priced())
                .collect(Collectors.toMap(ChangeOrder::getId, o -> o, (a, b) -> a, java.util.LinkedHashMap::new));
        if (counted.isEmpty()) return List.of();
        return lines.findByChangeOrderIdInOrderByLineNoAsc(List.copyOf(counted.keySet())).stream()
                .sorted(java.util.Comparator.comparing((ChangeOrderLine l) -> counted.get(l.getChangeOrderId()).getSeqNo()).thenComparing(ChangeOrderLine::getLineNo))
                .map(l -> { ChangeOrder o = counted.get(l.getChangeOrderId());
                    return new CountedLine(l.getId(), o.getId(), o.getOrderNumber(), l.getKind().name(), l.getDescription(), l.getQuantity(), l.getLineEgp()); })
                .toList();
    }

    /** The priced total of the case's counted change orders. */
    @Transactional(readOnly = true)
    public BigDecimal countedChangeOrdersEgp(UUID caseId) { return orders.sumCounted(caseId); }

    /** The change-order band for the case (D-E): what a reconciliation variance above needs a manager's countersignature for. */
    @Transactional(readOnly = true)
    public BigDecimal bandLimit(UUID caseId) { return treatment.bandLimit(caseId); }

    @Transactional(readOnly = true)
    public Optional<FinalInvoice> finalInvoice(UUID caseId) {
        return ledger.latest(caseId, Kind.FINAL_INVOICE).map(SettlementBasis::invoice);
    }

    /** The facility the patient was admitted to, for the dispute's wording; null when none is on file. */
    @Transactional(readOnly = true)
    /** The facility the case is (or was) admitted at, unless the admission was cancelled. */
    public java.util.Optional<UUID> facilityId(UUID caseId) {
        return admissions.findByCaseId(caseId).filter(a -> a.getStatus() != FacilityAdmission.Status.CANCELLED).map(FacilityAdmission::getFacilityId);
    }

    public String facilityName(UUID caseId) {
        return admissions.findByCaseId(caseId).filter(a -> a.getStatus() != FacilityAdmission.Status.CANCELLED)
                .flatMap(a -> facilities.active(a.getFacilityId())).map(f -> f.getName()).orElse(null);
    }

    /** One message to the patient (portal link only, their channel and language), once per key. */
    public boolean notifyPatient(UUID caseId, String template, String key) { return notices.send(caseId, "SETTLEMENT", template, key); }

    /** An EGP amount in the patient's currency at the frozen rate (the EGP amount itself when there is no rate). */
    public static BigDecimal display(BigDecimal egp, BigDecimal fxRate) { return TreatmentViews.display(egp, fxRate); }

    private static FinalInvoice invoice(CaseEvidence e) {
        return new FinalInvoice(e.getId(), e.getReference(), e.getAmountEgp(), e.getEffectiveAt(), e.getDocumentId(), e.countersigned(), e.getRecordedBy());
    }

    private static BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }
}
