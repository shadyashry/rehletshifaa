package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.ConsentRecordRepository;
import com.rehletshifaa.journey.domain.AdmissionVoucher;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.journey.domain.FacilityAdmission;
import com.rehletshifaa.journey.domain.CaseEvidence.Kind;
import com.rehletshifaa.journey.infrastructure.AdmissionVoucherRepository;
import com.rehletshifaa.journey.infrastructure.FacilityAdmissionRepository;
import com.rehletshifaa.journey.infrastructure.ProposalDecisionRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.journey.infrastructure.TravelPlanRepository;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * What stands between an arrived patient and admission, read from the evidence ledger (P1-15; design §5 stage 3, §6 rule 3;
 * owner decisions D-C and D-D, 2026-10-15). One answer, read by {@link CaseTransitionPolicy} (the gate), by the treatment
 * episode (pay to admit) and by the patient's and staff's views (the checklist), so no screen can disagree with the gate.
 *
 * <p>{@code ADMISSION_READY} needs: the final quote accepted when one exists; procedure consent (or the Consultant's emergency
 * treatment override); and the balance evidenced against the voucher — the hospital's receipt countersigned by Finance for what
 * the patient pays at the cashier, and the platform's receipt for any fee balance. The Consultant's emergency admission
 * override stands in for the voucher and both balances (Finance reviews it after), never for the quote or the consent.
 * {@code TREATMENT_IN_PROGRESS} needs the hospital's admission number.
 */
@Component
public class AdmissionReadiness {
    /** The codes, in the order they are owed; the staff checklist and the error message read the English label. */
    public static final String FINAL_QUOTE_NOT_ACCEPTED = "FINAL_QUOTE_NOT_ACCEPTED", PROCEDURE_CONSENT_MISSING = "PROCEDURE_CONSENT_MISSING",
            VOUCHER_NOT_ISSUED = "VOUCHER_NOT_ISSUED", BALANCE_NOT_EVIDENCED = "BALANCE_NOT_EVIDENCED", FEE_BALANCE_DUE = "FEE_BALANCE_DUE",
            ADMISSION_NUMBER_MISSING = "ADMISSION_NUMBER_MISSING";
    static final Map<String, String> LABELS = Map.of(
            FINAL_QUOTE_NOT_ACCEPTED, "the final quote is not accepted",
            PROCEDURE_CONSENT_MISSING, "procedure consent is not on file",
            VOUCHER_NOT_ISSUED, "no admission voucher is issued",
            BALANCE_NOT_EVIDENCED, "the hospital balance is not evidenced (cashier receipt countersigned by Finance)",
            FEE_BALANCE_DUE, "the platform fee balance is not received",
            ADMISSION_NUMBER_MISSING, "the hospital admission number is not recorded");

    private final EvidenceLedger ledger;
    private final AdmissionVoucherRepository vouchers;
    private final ProposalVersionRepository proposalVersions;
    private final ProposalDecisionRepository proposalDecisions;
    private final ConsentRecordRepository consents;
    private final TravelPlanRepository travelPlans;
    private final FacilityAdmissionRepository admissions;
    private final Clock clock;

    public AdmissionReadiness(EvidenceLedger ledger, AdmissionVoucherRepository vouchers, ProposalVersionRepository proposalVersions,
                              ProposalDecisionRepository proposalDecisions, ConsentRecordRepository consents, TravelPlanRepository travelPlans,
                              FacilityAdmissionRepository admissions, Clock clock) {
        this.ledger = ledger; this.vouchers = vouchers; this.proposalVersions = proposalVersions; this.proposalDecisions = proposalDecisions; this.consents = consents;
        this.travelPlans = travelPlans; this.admissions = admissions; this.clock = clock;
    }

    /**
     * Whether the patient in treatment coordination should be asked to confirm their arrival now: travel is confirmed and the
     * planned arrival is within a day (or past), and nobody has recorded the arrival yet.
     */
    @Transactional(readOnly = true)
    public boolean arrivalDue(UUID caseId) {
        var plan = travelPlans.findByCaseId(caseId).orElse(null);
        if (plan == null || !"CONFIRMED".equals(plan.getStatus()) || plan.getPlannedArrival() == null) return false;
        if (ledger.latest(caseId, Kind.PATIENT_ARRIVED).isPresent()) return false;
        return !plan.getPlannedArrival().isAfter(clock.instant().plus(Duration.ofDays(1)));
    }

    /** B-5-1: Operations' acts on the hospital file before the travel plan, in the order they happen. */
    public static final String RESERVE_HOSPITAL = "RESERVE_HOSPITAL", RECORD_ADMISSION_LETTER = "RECORD_ADMISSION_LETTER";

    /**
     * B-5-1: Operations' open act on the hospital file in treatment coordination: {@code RESERVE_HOSPITAL} while nothing is reserved,
     * {@code RECORD_ADMISSION_LETTER} while the hospital's letter is owed (none yet, or Finance refused the latest); empty once
     * both are on file, when their step is the travel plan.
     */
    @Transactional(readOnly = true)
    public Optional<String> hospitalStep(UUID caseId) {
        if (admissions.findByCaseId(caseId).filter(a -> a.getStatus() != FacilityAdmission.Status.CANCELLED).isEmpty()) return Optional.of(RESERVE_HOSPITAL);
        CaseEvidence letter = ledger.latest(caseId, Kind.FACILITY_ADMISSION_LETTER).orElse(null);
        return letter == null || letterRefused(caseId, letter) ? Optional.of(RECORD_ADMISSION_LETTER) : Optional.empty();
    }

    /** Finance refused this letter (a refusal recorded after it) and it is not countersigned: the hospital is asked again. */
    boolean letterRefused(UUID caseId, CaseEvidence letter) {
        return !letter.countersigned() && ledger.latest(caseId, Kind.PRICE_VARIANCE_CHECK)
                .filter(c -> "REFUSED".equals(c.getReference()) && !c.getRecordedAt().isBefore(letter.getRecordedAt())).isPresent();
    }

    /** Whether a receipt is recorded and waiting for Finance's countersignature (the patient's "we are checking it"). */
    @Transactional(readOnly = true)
    public boolean balanceAwaitingCountersign(UUID caseId) {
        return ledger.claimed(caseId, Kind.BALANCE_EVIDENCED).compareTo(ledger.total(caseId, Kind.BALANCE_EVIDENCED)) > 0;
    }

    /** The codes still owed before the case may enter ADMISSION_READY; empty when it may. */
    @Transactional(readOnly = true)
    public List<String> admissionBlockers(UUID caseId) {
        List<String> out = new ArrayList<>();
        if (!finalQuoteAcceptedIfAny(caseId)) out.add(FINAL_QUOTE_NOT_ACCEPTED);
        if (!consents.existsByCaseIdAndConsentTypeInAndRevokedAtIsNull(caseId, List.of("PROCEDURE_SPECIFIC", "EMERGENCY_TREATMENT_OVERRIDE")))
            out.add(PROCEDURE_CONSENT_MISSING);
        if (emergencyOverride(caseId)) return out;
        Optional<AdmissionVoucher> voucher = currentVoucher(caseId);
        if (voucher.isEmpty()) { out.add(VOUCHER_NOT_ISSUED); return out; }
        if (balanceOwed(caseId, voucher.get()).signum() > 0) out.add(BALANCE_NOT_EVIDENCED);
        if (feeBalanceOwed(caseId, voucher.get()).signum() > 0) out.add(FEE_BALANCE_DUE);
        return out;
    }

    /** The codes still owed before the case may enter TREATMENT_IN_PROGRESS from ADMISSION_READY. */
    @Transactional(readOnly = true)
    public List<String> treatmentBlockers(UUID caseId) {
        return ledger.has(caseId, Kind.ADMISSION_NUMBER) ? List.of() : List.of(ADMISSION_NUMBER_MISSING);
    }

    /** Pay to admit (D-C): the balance is evidenced in full, or the Consultant's emergency admission override is on file. */
    @Transactional(readOnly = true)
    public boolean paidToAdmit(UUID caseId) {
        if (emergencyOverride(caseId)) return true;
        Optional<AdmissionVoucher> voucher = currentVoucher(caseId);
        return voucher.isPresent() && balanceOwed(caseId, voucher.get()).signum() <= 0 && feeBalanceOwed(caseId, voucher.get()).signum() <= 0;
    }

    @Transactional(readOnly = true)
    public boolean emergencyOverride(UUID caseId) { return ledger.has(caseId, Kind.EMERGENCY_ADMISSION_OVERRIDE); }

    @Transactional(readOnly = true)
    public Optional<AdmissionVoucher> currentVoucher(UUID caseId) {
        return vouchers.findFirstByCaseIdAndStatusOrderByRevisionDesc(caseId, AdmissionVoucher.Status.ISSUED.name());
    }

    /** What the patient still owes the hospital against the voucher, counting only countersigned receipts. */
    BigDecimal balanceOwed(UUID caseId, AdmissionVoucher voucher) {
        return voucher.split().patientPaysAtFacilityEgp().subtract(ledger.total(caseId, Kind.BALANCE_EVIDENCED)).max(BigDecimal.ZERO);
    }

    /** What the patient still owes the platform of its fee. */
    BigDecimal feeBalanceOwed(UUID caseId, AdmissionVoucher voucher) {
        return voucher.split().feeBalanceEgp().subtract(ledger.total(caseId, Kind.FEE_BALANCE_RECEIVED)).max(BigDecimal.ZERO);
    }

    /** True when no final quote is live, or the live one is accepted. */
    boolean finalQuoteAcceptedIfAny(UUID caseId) {
        UUID latestFinal = proposalVersions.findLatestLiveFinalQuote(caseId, Limit.of(1)).stream().findFirst().orElse(null);
        return latestFinal == null || proposalDecisions.existsByProposalVersionIdAndDecision(latestFinal, "ACCEPTED");
    }

    static String label(String code) { return LABELS.getOrDefault(code, code); }
}
