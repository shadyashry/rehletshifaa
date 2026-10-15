package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.application.CaseStatusLog;
import com.rehletshifaa.casemanagement.application.IntakeLifecycleService;
import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.facility.application.FacilityDirectory;
import com.rehletshifaa.facility.domain.Facility;
import com.rehletshifaa.journey.api.AdmissionDtos.AdmissionLetterRequest;
import com.rehletshifaa.journey.api.AdmissionDtos.AdmissionNumberRequest;
import com.rehletshifaa.journey.api.AdmissionDtos.AdmissionView;
import com.rehletshifaa.journey.api.AdmissionDtos.BalanceReceiptRequest;
import com.rehletshifaa.journey.api.AdmissionDtos.EmergencyAdmissionRequest;
import com.rehletshifaa.journey.api.AdmissionDtos.EvidenceView;
import com.rehletshifaa.journey.api.AdmissionDtos.FeeBalanceRequest;
import com.rehletshifaa.journey.api.AdmissionDtos.LetterDecisionRequest;
import com.rehletshifaa.journey.api.AdmissionDtos.PatientAdmissionView;
import com.rehletshifaa.journey.api.AdmissionDtos.PointOfNoReturnRequest;
import com.rehletshifaa.journey.api.AdmissionDtos.ReserveAdmissionRequest;
import com.rehletshifaa.journey.api.AdmissionDtos.VoucherView;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.WaitingReason;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.domain.AdmissionVoucher;
import com.rehletshifaa.journey.domain.AdmissionVoucher.Rate;
import com.rehletshifaa.journey.domain.AdmissionVoucher.Split;
import com.rehletshifaa.journey.domain.CaseEvidence;
import com.rehletshifaa.journey.domain.CaseEvidence.Fact;
import com.rehletshifaa.journey.domain.CaseEvidence.Kind;
import com.rehletshifaa.journey.domain.FacilityAdmission;
import com.rehletshifaa.journey.infrastructure.AdmissionVoucherRepository;
import com.rehletshifaa.journey.infrastructure.FacilityAdmissionRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository.VoucherBasis;
import com.rehletshifaa.journey.infrastructure.TravelPlanRepository;
import com.rehletshifaa.notification.application.NotificationOutbox;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.workforce.application.WorkforceDirectory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Admission, voucher and balance (P1-15; post-deposit design §5 stages 1-3, §6 rules 2 and 3; architecture §5.1; owner
 * decisions D-B, D-C, D-D, 2026-10-15).
 * <ol>
 *   <li><b>Reserve</b> (Operations, treatment coordination or after arrival): the facility and the planned admission date.</li>
 *   <li><b>Letter</b> (Operations): the hospital's pro-forma with the quoted package price. Finance checks it ({@code CHECK_PROFORMA},
 *       one working day); a price above the accepted estimate's provider maximum is a {@code PRICE_VARIANCE} (HIGH, four working
 *       hours) that Finance accepts with a reason or refuses, and travel cannot be confirmed while it is open.</li>
 *   <li><b>Voucher</b> (system, when the final quote is accepted and the letter is checked; Operations for a case with no final
 *       quote): the money split frozen ({@link AdmissionMoney}), the hospital emailed, the patient told what to pay and where.</li>
 *   <li><b>Balance</b> (Operations records the cashier receipt; Finance countersigns with a fresh sign-in; Finance records the
 *       platform's receipt for any fee balance). When the last gate passes the handoff clears the patient for admission.</li>
 *   <li><b>Emergency</b> (Consultant): admit before the balance with a reason; Finance reviews it after. Same pattern as the
 *       emergency treatment override on consent.</li>
 *   <li><b>Admission number</b> (Operations, or the Consultant opening the treatment episode) and the point of no return
 *       (Operations sets it, Finance approves it).</li>
 * </ol>
 * Every fact is an {@link EvidenceLedger} row; the case moves only through {@link CaseTransitionPolicy}. The platform never
 * holds the hospital's money: the patient pays the hospital at its cashier against the voucher (phase 1; a licensed PSP is
 * phase 2).
 */
@Service
public class AdmissionService {
    /** Work types (also the SLA keys in {@link SlaPolicy}). */
    public static final String CHECK_PROFORMA = "CHECK_PROFORMA", PRICE_VARIANCE = "PRICE_VARIANCE", REVISE_LETTER = "REVISE_ADMISSION_LETTER",
            COUNTERSIGN_BALANCE = "COUNTERSIGN_BALANCE", APPROVE_PNR = "APPROVE_POINT_OF_NO_RETURN", EMERGENCY_REVIEW = "EMERGENCY_ADMISSION_REVIEW",
            VOUCHER_BLOCKED = "ADMISSION_VOUCHER_BLOCKED";
    /** Stages a reservation can be made or changed in. */
    private static final Set<String> RESERVABLE = Set.of("TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED");
    private static final Set<String> OPEN_WORK = Set.of("OPEN", "IN_PROGRESS");
    static final String WITHIN = "WITHIN_ESTIMATE", VARIANCE_OPEN = "VARIANCE_OPEN", VARIANCE_ACCEPTED = "VARIANCE_ACCEPTED",
            CHECK_PENDING = "CHECK_PENDING", REFUSED = "REFUSED";

    private final Authority authority;
    private final Clock clock;
    private final AuditTrail auditTrail;
    private final EvidenceLedger ledger;
    private final AdmissionReadiness readiness;
    private final FacilityAdmissionRepository admissions;
    private final AdmissionVoucherRepository vouchers;
    private final ProposalVersionRepository proposalVersions;
    private final TravelPlanRepository travelPlans;
    private final MedicalCaseRepository cases;
    private final CaseAssignmentRepository assignments;
    private final CaseTaskRepository tasks;
    private final CaseStatusLog statusLog;
    private final FacilityDirectory facilities;
    private final PaymentService payment;
    private final StaffWorkService work;
    private final SlaPolicy sla;
    private final WorkforceDirectory workforce;
    private final CaseTransitionPolicy policy;
    private final DepositPaymentNotices notices;
    private final NotificationOutbox outbox;
    private final IntakeLifecycleService intake;
    private final ApplicationEventPublisher events;
    private final ObjectMapper json;

    public AdmissionService(Authority authority, Clock clock, AuditTrail auditTrail, EvidenceLedger ledger, AdmissionReadiness readiness,
                            FacilityAdmissionRepository admissions, AdmissionVoucherRepository vouchers, ProposalVersionRepository proposalVersions,
                            TravelPlanRepository travelPlans, MedicalCaseRepository cases, CaseAssignmentRepository assignments, CaseTaskRepository tasks,
                            CaseStatusLog statusLog, FacilityDirectory facilities, PaymentService payment, StaffWorkService work, SlaPolicy sla,
                            WorkforceDirectory workforce, CaseTransitionPolicy policy, DepositPaymentNotices notices, NotificationOutbox outbox,
                            IntakeLifecycleService intake, ApplicationEventPublisher events, ObjectMapper json) {
        this.authority = authority; this.clock = clock; this.auditTrail = auditTrail; this.ledger = ledger; this.readiness = readiness;
        this.admissions = admissions; this.vouchers = vouchers; this.proposalVersions = proposalVersions; this.travelPlans = travelPlans;
        this.cases = cases; this.assignments = assignments; this.tasks = tasks; this.statusLog = statusLog; this.facilities = facilities;
        this.payment = payment; this.work = work; this.sla = sla; this.workforce = workforce; this.policy = policy; this.notices = notices;
        this.outbox = outbox; this.intake = intake; this.events = events; this.json = json;
    }

    // ---- reservation and letter (Operations; Finance checks) ----

    /** Reserves the facility and the date; a change of either supersedes an issued voucher (the letter is asked again). */
    @Transactional
    public AdmissionView reserve(UUID caseId, ReserveAdmissionRequest request) {
        Actor actor = authority.authorize(Permission.ADMISSION_MANAGE, Resource.ofCase(caseId));
        String stage = lockStage(caseId);
        if (!RESERVABLE.contains(stage))
            throw new ApiException(409, "ADMISSION_NOT_RESERVABLE", "A hospital admission is reserved in treatment coordination or after arrival");
        if (facilities.active(request.facilityId()).isEmpty()) throw new ApiException(409, "FACILITY_INVALID", "This facility does not exist or is suspended");
        Instant now = clock.instant();
        FacilityAdmission admission = admissions.findByCaseId(caseId).orElse(null);
        if (admission == null) admission = new FacilityAdmission(caseId, request.facilityId(), request.plannedAdmissionAt(), actor.subject(), now);
        else {
            if (admission.getStatus() == FacilityAdmission.Status.ADMITTED) throw new ApiException(409, "ALREADY_ADMITTED", "The patient is already admitted");
            boolean changed = !admission.getFacilityId().equals(request.facilityId());
            admission.reserve(request.facilityId(), request.plannedAdmissionAt(), actor.subject(), now);
            // Another hospital prices another package: its letter is asked again and the old voucher no longer holds.
            if (changed) readiness.currentVoucher(caseId).ifPresent(v -> { v.supersede(now); vouchers.saveAndFlush(v); });
        }
        admissions.saveAndFlush(admission);
        audit("ADMISSION_RESERVED", actor.subject(), actor.label(), caseId, "FacilityAdmission", admission.getId(), "RESERVE", null);
        work.changed(caseId);
        return view(caseId, admission);
    }

    /** The hospital's letter with its quoted package price; Finance is asked to check it (a variance is HIGH). */
    @Transactional
    public AdmissionView recordLetter(UUID caseId, AdmissionLetterRequest request) {
        Actor actor = authority.authorize(Permission.ADMISSION_MANAGE, Resource.ofCase(caseId));
        lockStage(caseId);
        FacilityAdmission admission = openAdmission(caseId);
        UUID supersedes = ledger.latest(caseId, Kind.FACILITY_ADMISSION_LETTER).map(CaseEvidence::getId).orElse(null);
        CaseEvidence letter = ledger.record(caseId, new Fact(Kind.FACILITY_ADMISSION_LETTER, request.documentId(), blankToNull(request.reference()),
                request.quotedPackageEgp(), null, null), actor.subject(), EvidenceLedger.roleOf(actor.role()), supersedes);
        work.closeWorkItems(caseId, CHECK_PROFORMA, "A newer letter was recorded");
        work.closeWorkItems(caseId, PRICE_VARIANCE, "A newer letter was recorded");
        work.closeWorkItems(caseId, REVISE_LETTER, "The letter was recorded again");
        boolean within = withinEstimate(caseId, request.quotedPackageEgp());
        String caseNumber = caseNumber(caseId);
        Instant now = clock.instant();
        if (within) openFinanceWork(caseId, CHECK_PROFORMA, "Check the hospital's admission letter", "Compare the hospital's quoted package with the accepted estimate, then countersign the letter.",
                null, "letter:" + letter.getId(), WorkCopy.of(CHECK_PROFORMA, "caseNumber", caseNumber));
        else {
            openFinanceWork(caseId, PRICE_VARIANCE, "Hospital price above the accepted estimate", "The hospital quoted more than the estimate the patient accepted. Accept it with a reason or refuse it before travel is confirmed.",
                    sla.plusWorkingHours(now, 4), "variance:" + letter.getId(), WorkCopy.of(PRICE_VARIANCE, "caseNumber", caseNumber));
            audit("ADMISSION_PRICE_VARIANCE", actor.subject(), actor.label(), caseId, "CaseEvidence", letter.getId(), "RAISE",
                    "quoted EGP " + request.quotedPackageEgp().toPlainString());
        }
        return view(caseId, admission);
    }

    /** Finance checks the latest letter: accepting countersigns it (with a reason when it is a variance); refusing sends it back. */
    @Transactional
    public AdmissionView decideLetter(UUID caseId, LetterDecisionRequest request) {
        Actor actor = authority.authorize(Permission.EVIDENCE_COUNTERSIGN, Resource.ofCase(caseId));
        lockStage(caseId);
        FacilityAdmission admission = openAdmission(caseId);
        CaseEvidence letter = ledger.latest(caseId, Kind.FACILITY_ADMISSION_LETTER).filter(l -> l.getId().equals(request.evidenceId()))
                .orElseThrow(() -> new ApiException(409, "LETTER_NOT_CURRENT", "Only the latest admission letter of the case can be checked"));
        if (letter.countersigned()) throw new ApiException(409, "EVIDENCE_ALREADY_COUNTERSIGNED", "This letter is already checked");
        boolean within = withinEstimate(caseId, letter.getAmountEgp());
        String note = blankToNull(request.note());
        String role = EvidenceLedger.roleOf(actor.role());
        if ("ACCEPT".equals(request.decision())) {
            if (!within) {
                if (note == null) throw new ApiException(400, "VARIANCE_REASON_REQUIRED", "Say why the higher hospital price is accepted");
                ledger.record(caseId, new Fact(Kind.PRICE_VARIANCE_CHECK, null, "ACCEPTED", letter.getAmountEgp(), null, note), actor.subject(), role, null);
            }
            ledger.countersign(caseId, letter.getId(), actor.subject(), role);
            work.closeWorkItems(caseId, within ? CHECK_PROFORMA : PRICE_VARIANCE, "Letter checked by Finance");
            issueIfReady(caseId);
        } else {
            if (note == null) throw new ApiException(400, "REFUSAL_REASON_REQUIRED", "Say why the letter is refused so Operations can ask the hospital again");
            ledger.record(caseId, new Fact(Kind.PRICE_VARIANCE_CHECK, null, "REFUSED", letter.getAmountEgp(), null, note), actor.subject(), role, null);
            work.closeWorkItems(caseId, within ? CHECK_PROFORMA : PRICE_VARIANCE, "Letter refused by Finance");
            String ops = assignee(caseId, "OPERATIONS");
            work.openWorkItem(new NewWorkItem(caseId, REVISE_LETTER, "Ask the hospital for a new admission letter",
                    "Finance refused the hospital's letter. Ask the hospital again and record the new letter.", ops, "OPERATIONS", false, null,
                    actor.subject(), "ADMISSION_LETTER_REFUSED", "letter-refused:" + letter.getId(), true, WorkCopy.of(REVISE_LETTER, "caseNumber", caseNumber(caseId))));
        }
        audit("ADMISSION_LETTER_" + ("ACCEPT".equals(request.decision()) ? "ACCEPTED" : "REFUSED"), actor.subject(), actor.label(), caseId,
                "CaseEvidence", letter.getId(), request.decision(), within ? WITHIN : "variance");
        return view(caseId, admission);
    }

    /** True while the latest letter quotes above the accepted estimate and Finance has not accepted it: travel waits for it. */
    @Transactional(readOnly = true)
    public boolean priceVarianceOpen(UUID caseId) {
        return ledger.latest(caseId, Kind.FACILITY_ADMISSION_LETTER).map(l -> !l.countersigned() && !withinEstimate(caseId, l.getAmountEgp())).orElse(false);
    }

    // ---- the voucher (D-B) ----

    /** The patient accepted a final quote: issue (or reissue) the voucher if the letter is checked. Runs as the system. */
    @Transactional
    public void onFinalQuoteAccepted(UUID caseId) { issueIfReady(caseId); }

    /**
     * Operations issues the voucher by hand: for a care area that never issues a final quote (the accepted preliminary then
     * prices it), or to retry. A final quote on the case that is not accepted yet is refused.
     */
    @Transactional
    public AdmissionView issueVoucher(UUID caseId) {
        Actor actor = authority.authorize(Permission.ADMISSION_MANAGE, Resource.ofCase(caseId));
        lockStage(caseId);
        FacilityAdmission admission = openAdmission(caseId);
        if (!ledger.has(caseId, Kind.FACILITY_ADMISSION_LETTER))
            throw new ApiException(409, "LETTER_NOT_CHECKED", "Finance must check the hospital's admission letter before the voucher is issued");
        if (!readiness.finalQuoteAcceptedIfAny(caseId))
            throw new ApiException(409, "FINAL_QUOTE_NOT_ACCEPTED", "The final treatment quote must be accepted before the voucher is issued");
        VoucherBasis basis = proposalVersions.findAcceptedBases(caseId, Limit.of(1)).stream().findFirst()
                .orElseThrow(() -> new ApiException(409, "NO_ACCEPTED_QUOTE", "No accepted estimate or quote prices this admission"));
        issue(caseId, admission, basis, actor.subject());
        return view(caseId, admission);
    }

    /** Issues when the letter is checked and an accepted final quote prices the admission; quiet otherwise (idempotent). */
    private void issueIfReady(UUID caseId) {
        FacilityAdmission admission = admissions.findByCaseId(caseId).filter(a -> a.getStatus() == FacilityAdmission.Status.RESERVED
                || a.getStatus() == FacilityAdmission.Status.CONFIRMED).orElse(null);
        if (admission == null || !ledger.has(caseId, Kind.FACILITY_ADMISSION_LETTER) || !readiness.finalQuoteAcceptedIfAny(caseId)) return;
        VoucherBasis basis = proposalVersions.findAcceptedBases(caseId, Limit.of(1)).stream().findFirst()
                .filter(b -> "FINAL_TREATMENT_QUOTE".equals(b.getDocumentType())).orElse(null);
        if (basis == null) return;
        // Issued on the side of another act (the patient's acceptance, Finance's letter check): a refusal here must never undo
        // that act. It becomes Finance's work instead (today only a deposit above the package and the fee can refuse it).
        try { issue(caseId, admission, basis, "SYSTEM"); }
        catch (ApiException refused) {
            audit("ADMISSION_VOUCHER_BLOCKED", "SYSTEM", "SYSTEM", caseId, "FacilityAdmission", admission.getId(), "ISSUE", refused.code());
            openFinanceWork(caseId, VOUCHER_BLOCKED, "The admission voucher could not be issued", refused.getMessage(), null,
                    "voucher-blocked:" + caseId + ":" + basis.getId(), WorkCopy.of(VOUCHER_BLOCKED, "caseNumber", caseNumber(caseId)));
        }
    }

    private void issue(UUID caseId, FacilityAdmission admission, VoucherBasis basis, String by) {
        BigDecimal fee = nz(basis.getMarginAmountEgp()).add(nz(basis.getTaxEgp()));
        Split split;
        try { split = AdmissionMoney.split(nz(basis.getProviderNetEgp()), fee, payment.netPaidEgp(caseId)); }
        catch (AdmissionMoney.DepositExceedsPackage e) {
            throw new ApiException(409, "DEPOSIT_EXCEEDS_PACKAGE", "The deposit received exceeds what the package and the fee leave to pay; Finance settles this before a voucher");
        }
        Optional<AdmissionVoucher> current = readiness.currentVoucher(caseId);
        // Idempotent: the same quote, the same deposit, the same hospital is the same voucher.
        if (current.isPresent() && current.get().getProposalVersionId().equals(basis.getId()) && current.get().split().equals(split)
                && current.get().getAdmissionId().equals(admission.getId())) return;
        Instant now = clock.instant();
        current.ifPresent(v -> { v.supersede(now); vouchers.saveAndFlush(v); });
        int revision = vouchers.findFirstByCaseIdOrderByRevisionDesc(caseId).map(AdmissionVoucher::getRevision).orElse(0) + 1;
        String caseNumber = caseNumber(caseId);
        String currency = basis.getCurrency() == null ? "EGP" : basis.getCurrency();
        AdmissionVoucher voucher = vouchers.saveAndFlush(new AdmissionVoucher(admission.getId(), caseId, caseNumber, revision, basis.getId(), split,
                new Rate(currency, "EGP".equals(currency) ? null : basis.getFxRate(), "EGP".equals(currency) ? null : basis.getFxRateDate()), by, now));
        admission.confirm(by, now);
        admissions.saveAndFlush(admission);
        audit("ADMISSION_VOUCHER_ISSUED", by, "SYSTEM".equals(by) ? "SYSTEM" : "OPERATIONS", caseId, "AdmissionVoucher", voucher.getId(), "ISSUE",
                voucher.getVoucherNumber() + " package EGP " + split.packageTotalEgp().toPlainString() + " credit EGP " + split.depositCreditEgp().toPlainString()
                        + " at facility EGP " + split.patientPaysAtFacilityEgp().toPlainString() + " fee balance EGP " + split.feeBalanceEgp().toPlainString());
        tellFacility(caseId, admission, voucher, caseNumber, now);
        notices.send(caseId, "ADMISSION", "admission-balance-due", "admission-voucher:" + voucher.getId());
        work.refreshWaitingOn(caseId, "PATIENT", WaitingReason.of("ADMISSION_BALANCE_DUE", "Voucher issued — the patient pays the balance at the hospital"));
        events.publishEvent(new CaseEvents.AdmissionEvidenceChanged(caseId));
    }

    // ---- the balance (D-C) ----

    /** Operations records the hospital cashier's receipt; Finance is asked to countersign it (four working hours). */
    @Transactional
    public AdmissionView recordBalance(UUID caseId, BalanceReceiptRequest request) {
        Actor actor = authority.authorize(Permission.ADMISSION_MANAGE, Resource.ofCase(caseId));
        requireStage(lockStage(caseId), Set.of("ARRIVAL_CONFIRMED"), "BALANCE_NOT_DUE", "The hospital balance is recorded once the patient has arrived");
        FacilityAdmission admission = openAdmission(caseId);
        AdmissionVoucher voucher = readiness.currentVoucher(caseId)
                .orElseThrow(() -> new ApiException(409, "VOUCHER_NOT_ISSUED", "No admission voucher is issued for this case"));
        BigDecimal due = voucher.split().patientPaysAtFacilityEgp();
        if (ledger.claimed(caseId, Kind.BALANCE_EVIDENCED).add(request.amountEgp()).compareTo(due) > 0)
            throw new ApiException(409, "AMOUNT_EXCEEDS_BALANCE", "The receipts would exceed what the patient pays at the hospital (EGP " + due.toPlainString() + ")");
        if (request.paidAt().isAfter(clock.instant().plusSeconds(300))) throw new ApiException(400, "PAID_IN_FUTURE", "The receipt date cannot be in the future");
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("method", request.method());
        payload.put("voucher", voucher.getVoucherNumber());
        if (request.paidCurrency() != null) payload.put("paidCurrency", request.paidCurrency());
        if (request.paidAmount() != null) payload.put("paidAmount", request.paidAmount().toPlainString());
        CaseEvidence receipt = ledger.record(caseId, new Fact(Kind.BALANCE_EVIDENCED, request.documentId(), request.receiptNumber().trim(), request.amountEgp(),
                request.paidAt(), write(payload)), actor.subject(), EvidenceLedger.roleOf(actor.role()), null);
        openFinanceWork(caseId, COUNTERSIGN_BALANCE, "Countersign the hospital receipt", "Operations recorded the cashier's receipt for the hospital balance. Check it, then countersign it.",
                sla.plusWorkingHours(clock.instant(), 4), "balance:" + receipt.getId(), WorkCopy.of(COUNTERSIGN_BALANCE, "caseNumber", caseNumber(caseId)));
        work.refreshWaitingOn(caseId, "PAYMENT", WaitingReason.of("ADMISSION_BALANCE_TO_CHECK", "Hospital receipt recorded — Finance to countersign it"));
        return view(caseId, admission);
    }

    /** Finance countersigns a cashier receipt or approves the point of no return (fresh sign-in; never the recorder). */
    @Transactional
    public AdmissionView countersign(UUID caseId, UUID evidenceId) {
        Actor actor = authority.authorize(Permission.EVIDENCE_COUNTERSIGN, Resource.ofCase(caseId));
        lockStage(caseId);
        CaseEvidence row = ledger.find(caseId, evidenceId).orElseThrow(() -> new ApiException(404, "EVIDENCE_NOT_FOUND", "The entry was not found on this case"));
        if (row.getKind() != Kind.BALANCE_EVIDENCED && row.getKind() != Kind.POINT_OF_NO_RETURN)
            throw new ApiException(409, "EVIDENCE_NOT_COUNTERSIGNABLE", "This entry is not countersigned here");
        ledger.countersign(caseId, evidenceId, actor.subject(), EvidenceLedger.roleOf(actor.role()));
        if (row.getKind() == Kind.BALANCE_EVIDENCED) {
            if (ledger.live(caseId, Kind.BALANCE_EVIDENCED).stream().allMatch(CaseEvidence::countersigned))
                work.closeWorkItems(caseId, COUNTERSIGN_BALANCE, "Hospital receipt countersigned");
            events.publishEvent(new CaseEvents.AdmissionEvidenceChanged(caseId));
        } else work.closeWorkItems(caseId, APPROVE_PNR, "Point of no return approved");
        return view(caseId, admissions.findByCaseId(caseId).orElse(null));
    }

    /** Finance records the platform's receipt for the fee balance the deposit did not cover. */
    @Transactional
    public AdmissionView recordFeeBalance(UUID caseId, FeeBalanceRequest request) {
        Actor actor = authority.authorize(Permission.PAYMENT_RECORD, Resource.ofCase(caseId));
        lockStage(caseId);
        AdmissionVoucher voucher = readiness.currentVoucher(caseId)
                .orElseThrow(() -> new ApiException(409, "VOUCHER_NOT_ISSUED", "No admission voucher is issued for this case"));
        BigDecimal due = voucher.split().feeBalanceEgp();
        if (ledger.claimed(caseId, Kind.FEE_BALANCE_RECEIVED).add(request.amountEgp()).compareTo(due) > 0)
            throw new ApiException(409, "AMOUNT_EXCEEDS_BALANCE", "The amount exceeds the platform fee balance (EGP " + due.toPlainString() + ")");
        ledger.record(caseId, new Fact(Kind.FEE_BALANCE_RECEIVED, null, request.reference().trim(), request.amountEgp(), request.receivedAt(), null),
                actor.subject(), EvidenceLedger.roleOf(actor.role()), null);
        events.publishEvent(new CaseEvents.AdmissionEvidenceChanged(caseId));
        return view(caseId, admissions.findByCaseId(caseId).orElse(null));
    }

    // ---- point of no return, admission number ----

    /** Operations sets the point after which travel is not refundable; Finance approves it (a new time supersedes the old). */
    @Transactional
    public AdmissionView setPointOfNoReturn(UUID caseId, PointOfNoReturnRequest request) {
        Actor actor = authority.authorize(Permission.ADMISSION_MANAGE, Resource.ofCase(caseId));
        requireStage(lockStage(caseId), Set.of("TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", "ADMISSION_READY"), "ADMISSION_NOT_OPEN", "The point of no return is set before treatment");
        FacilityAdmission admission = openAdmission(caseId);
        UUID supersedes = ledger.latest(caseId, Kind.POINT_OF_NO_RETURN).map(CaseEvidence::getId).orElse(null);
        CaseEvidence row = ledger.record(caseId, new Fact(Kind.POINT_OF_NO_RETURN, null, null, null, request.at(), null), actor.subject(),
                EvidenceLedger.roleOf(actor.role()), supersedes);
        work.closeWorkItems(caseId, APPROVE_PNR, "A new point of no return was set");
        openFinanceWork(caseId, APPROVE_PNR, "Approve the point of no return", "Operations set the time after which travel is no longer refundable. Approve it.",
                null, "pnr:" + row.getId(), WorkCopy.of(APPROVE_PNR, "caseNumber", caseNumber(caseId)));
        return view(caseId, admission);
    }

    /** Operations records the hospital's admission number once the patient is cleared for admission. */
    @Transactional
    public AdmissionView recordAdmissionNumber(UUID caseId, AdmissionNumberRequest request) {
        Actor actor = authority.authorize(Permission.ADMISSION_MANAGE, Resource.ofCase(caseId));
        requireStage(lockStage(caseId), Set.of("ADMISSION_READY", "TREATMENT_IN_PROGRESS"), "NOT_CLEARED_FOR_ADMISSION",
                "The admission number is recorded once the patient is cleared for admission");
        recordAdmissionNumber(caseId, request.admissionNumber(), actor.subject(), EvidenceLedger.roleOf(actor.role()));
        return view(caseId, admissions.findByCaseId(caseId).orElse(null));
    }

    /**
     * The admission number as part of another act the caller has authorised (the Consultant opening the treatment episode).
     * A different number supersedes the one on file; the same number is a no-op.
     */
    @Transactional
    public void recordAdmissionNumber(UUID caseId, String number, String subject, String role) {
        String value = number == null ? null : number.trim();
        if (value == null || value.isEmpty()) throw new ApiException(400, "ADMISSION_NUMBER_REQUIRED", "Record the hospital's admission number");
        Optional<CaseEvidence> current = ledger.latest(caseId, Kind.ADMISSION_NUMBER);
        if (current.isPresent() && value.equals(current.get().getReference())) return;
        ledger.record(caseId, new Fact(Kind.ADMISSION_NUMBER, null, value, null, clock.instant(), null), subject, role, current.map(CaseEvidence::getId).orElse(null));
        admissions.findByCaseId(caseId).filter(a -> a.getStatus() != FacilityAdmission.Status.CANCELLED).ifPresent(a -> {
            a.admit(subject, clock.instant());
            admissions.saveAndFlush(a);
        });
    }

    // ---- emergency (Consultant) ----

    /**
     * The Consultant admits before the balance is evidenced (D-C emergency path): the reason is kept encrypted, Finance reviews
     * it after ({@code EMERGENCY_ADMISSION_REVIEW}, HIGH, survives the case's exit). It never stands in for the final quote or the
     * procedure consent (the consent has its own emergency override).
     */
    @Transactional
    public UUID emergencyAdmission(UUID caseId, EmergencyAdmissionRequest request) {
        Actor actor = authority.authorize(Permission.CLINICAL_REVIEW, Resource.ofCase(caseId));
        requireStage(lockStage(caseId), Set.of("ARRIVAL_CONFIRMED"), "EMERGENCY_ADMISSION_NOT_APPLICABLE", "An emergency admission is recorded for an arrived patient not yet cleared");
        String reason = blankToNull(request.reason());
        if (reason == null) throw new ApiException(400, "OVERRIDE_REASON_REQUIRED", "A reason is required for an emergency admission");
        CaseEvidence row = ledger.record(caseId, new Fact(Kind.EMERGENCY_ADMISSION_OVERRIDE, null, null, null, clock.instant(), reason),
                actor.subject(), EvidenceLedger.roleOf(actor.role()), null);
        openFinanceWork(caseId, EMERGENCY_REVIEW, "Review an emergency admission", "The Consultant admitted the patient before the balance was evidenced. Review the money with Operations and the hospital.",
                null, "emergency-admission:" + row.getId(), WorkCopy.of(EMERGENCY_REVIEW, "caseNumber", caseNumber(caseId)));
        audit("EMERGENCY_ADMISSION_OVERRIDE", actor.subject(), actor.label(), caseId, "CaseEvidence", row.getId(), "OVERRIDE", null);
        events.publishEvent(new CaseEvents.AdmissionEvidenceChanged(caseId));
        return row.getId();
    }

    // ---- arrival (patient and Operations) ----

    /** The patient (or their representative) says they have arrived: evidence, and the move to ARRIVAL_CONFIRMED under the policy. */
    @Transactional
    public void patientArrived(UUID caseId) {
        Actor actor = authority.authorize(Permission.ARRIVAL_REPORT, Resource.ofCase(caseId));
        String stage = lockStage(caseId);
        if ("ARRIVAL_CONFIRMED".equals(stage) || "ADMISSION_READY".equals(stage)) return; // already arrived: nothing to record twice
        requireStage(stage, Set.of("TRAVEL_COORDINATION"), "ARRIVAL_NOT_EXPECTED", "Your arrival is confirmed once your travel is confirmed");
        if (!"CONFIRMED".equals(travelPlans.findStatusByCaseId(caseId).orElse(null)))
            throw new ApiException(409, "ARRIVAL_NOT_EXPECTED", "Your arrival is confirmed once your travel is confirmed");
        ledger.record(caseId, new Fact(Kind.PATIENT_ARRIVED, null, null, null, clock.instant(), null), actor.subject(), "PATIENT", null);
        move(caseId, "TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", actor.subject(), "PATIENT", "The patient confirmed their arrival");
    }

    /** Operations recorded the confirmed arrival on the travel plan (JourneyService.upsertTravel, already authorised). */
    @Transactional
    public void arrivalAttested(UUID caseId, Instant arrivedAt, String subject) {
        if (ledger.latest(caseId, Kind.ARRIVAL_ATTESTED).isPresent()) return;
        ledger.record(caseId, new Fact(Kind.ARRIVAL_ATTESTED, null, null, null, arrivedAt, null), subject, "OPERATIONS", null);
    }

    // ---- views ----

    @Transactional(readOnly = true)
    public AdmissionView view(UUID caseId) {
        authority.authorize(Permission.ADMISSION_READ, Resource.ofCase(caseId));
        return view(caseId, admissions.findByCaseId(caseId).orElse(null));
    }

    /** The patient's own view: where, when, the voucher number, what to pay where; null before a reservation exists. */
    @Transactional(readOnly = true)
    public PatientAdmissionView patientView(UUID caseId) {
        authority.authorize(Permission.CASE_READ, Resource.ofCase(caseId));
        FacilityAdmission admission = admissions.findByCaseId(caseId).filter(a -> a.getStatus() != FacilityAdmission.Status.CANCELLED).orElse(null);
        if (admission == null) return null;
        Facility facility = facilities.active(admission.getFacilityId()).orElse(null);
        AdmissionVoucher voucher = readiness.currentVoucher(caseId).orElse(null);
        String status = cases.findStageAndVersion(caseId).map(s -> s.getStatus().name()).orElse("");
        boolean cleared = Set.of("ADMISSION_READY", "TREATMENT_IN_PROGRESS").contains(status);
        if (voucher == null)
            return new PatientAdmissionView(facility == null ? null : facility.getName(), facility == null ? null : facility.getCity(), admission.getPlannedAdmissionAt(),
                    null, null, null, null, null, null, null, "NO_VOUCHER", cleared);
        Split s = voucher.split();
        Rate r = voucher.rate();
        return new PatientAdmissionView(facility == null ? null : facility.getName(), facility == null ? null : facility.getCity(), admission.getPlannedAdmissionAt(),
                voucher.getVoucherNumber(), s.patientPaysAtFacilityEgp(), display(s.patientPaysAtFacilityEgp(), r), s.feeBalanceEgp(), display(s.feeBalanceEgp(), r),
                s.depositCreditEgp(), r.displayCurrency(), balanceState(caseId, voucher), cleared);
    }

    /** Where the balance stands, for the patient: DUE, CHECKING (receipt recorded, Finance checking), PAID. */
    String balanceState(UUID caseId, AdmissionVoucher voucher) {
        if (readiness.paidToAdmit(caseId)) return "PAID";
        if (readiness.feeBalanceOwed(caseId, voucher).signum() > 0) return "DUE";
        BigDecimal awaitingCountersign = ledger.claimed(caseId, Kind.BALANCE_EVIDENCED).subtract(ledger.total(caseId, Kind.BALANCE_EVIDENCED));
        return awaitingCountersign.compareTo(readiness.balanceOwed(caseId, voucher)) >= 0 ? "CHECKING" : "DUE";
    }

    private AdmissionView view(UUID caseId, FacilityAdmission admission) {
        String status = cases.findStageAndVersion(caseId).map(s -> s.getStatus().name()).orElse(null);
        List<EvidenceView> trail = ledger.trail(caseId).stream().map(this::evidence).toList();
        List<String> blockers = readiness.admissionBlockers(caseId);
        Optional<CaseEvidence> pnr = ledger.latest(caseId, Kind.POINT_OF_NO_RETURN);
        String number = ledger.latest(caseId, Kind.ADMISSION_NUMBER).map(CaseEvidence::getReference).orElse(null);
        if (admission == null)
            return new AdmissionView(caseId, status, null, null, null, null, null, null, null, null, null, null, null,
                    pnr.map(CaseEvidence::getEffectiveAt).orElse(null), pnr.map(CaseEvidence::countersigned).orElse(false), number,
                    readiness.emergencyOverride(caseId), blockers, trail);
        Facility facility = facilities.active(admission.getFacilityId()).orElse(null);
        AdmissionVoucher voucher = readiness.currentVoucher(caseId).orElse(null);
        return new AdmissionView(caseId, status, admission.getId(), admission.getFacilityId(), facility == null ? null : facility.getName(),
                facility == null ? null : facility.getCity(), admission.getPlannedAdmissionAt(), admission.getStatus().name(), letterCheck(caseId),
                referenceMaximum(caseId), voucher == null ? null : voucherView(voucher),
                voucher == null ? null : readiness.balanceOwed(caseId, voucher), voucher == null ? null : readiness.feeBalanceOwed(caseId, voucher),
                pnr.map(CaseEvidence::getEffectiveAt).orElse(null), pnr.map(CaseEvidence::countersigned).orElse(false), number,
                readiness.emergencyOverride(caseId), blockers, trail);
    }

    /** NONE, CHECK_PENDING, VARIANCE_OPEN, REFUSED, WITHIN_ESTIMATE (checked) or VARIANCE_ACCEPTED (checked above the estimate). */
    private String letterCheck(UUID caseId) {
        CaseEvidence letter = ledger.latest(caseId, Kind.FACILITY_ADMISSION_LETTER).orElse(null);
        if (letter == null) return "NONE";
        boolean within = withinEstimate(caseId, letter.getAmountEgp());
        if (letter.countersigned()) return within ? WITHIN : VARIANCE_ACCEPTED;
        boolean refused = ledger.latest(caseId, Kind.PRICE_VARIANCE_CHECK)
                .filter(c -> "REFUSED".equals(c.getReference()) && !c.getRecordedAt().isBefore(letter.getRecordedAt())).isPresent();
        if (refused) return REFUSED;
        return within ? CHECK_PENDING : VARIANCE_OPEN;
    }

    private VoucherView voucherView(AdmissionVoucher v) {
        Split s = v.split();
        Rate r = v.rate();
        return new VoucherView(v.getId(), v.getVoucherNumber(), v.getRevision(), v.getStatus().name(), v.getProposalVersionId(), s.packageTotalEgp(),
                s.platformFeeEgp(), s.depositPaidEgp(), s.depositCreditEgp(), s.feeBalanceEgp(), s.patientPaysAtFacilityEgp(), r.displayCurrency(),
                r.fxRate(), r.fxRateDate(), display(s.patientPaysAtFacilityEgp(), r), display(s.feeBalanceEgp(), r), v.getIssuedAt());
    }

    private EvidenceView evidence(CaseEvidence e) {
        return new EvidenceView(e.getId(), e.getKind().name(), e.getStage(), e.getDocumentId(), e.getReference(), e.getAmountEgp(), e.getEffectiveAt(),
                e.getRecordedBy(), e.getRecordedRole(), e.getRecordedAt(), e.getCountersignedBy(), e.getCountersignedRole(), e.getCountersignedAt(),
                e.getSupersedesId(), ledger.superseded(e.getId()));
    }

    // ---- internals ----

    /** The hospital's quoted package is within the estimate when it is at most the accepted version's provider maximum. */
    private boolean withinEstimate(UUID caseId, BigDecimal quotedEgp) {
        BigDecimal max = referenceMaximum(caseId);
        return max == null || quotedEgp == null || quotedEgp.compareTo(max) <= 0;
    }

    /** The provider maximum of the accepted version that prices the admission (final quote first); null without one. */
    private BigDecimal referenceMaximum(UUID caseId) {
        return proposalVersions.findAcceptedBases(caseId, Limit.of(1)).stream().findFirst()
                .map(b -> proposalVersions.providerMaximumEgp(b.getId())).orElse(null);
    }

    private FacilityAdmission openAdmission(UUID caseId) {
        FacilityAdmission admission = admissions.findByCaseId(caseId)
                .orElseThrow(() -> new ApiException(409, "ADMISSION_NOT_RESERVED", "Reserve the hospital admission first"));
        if (admission.getStatus() == FacilityAdmission.Status.CANCELLED) throw new ApiException(409, "ADMISSION_CANCELLED", "The admission is cancelled");
        if (admission.getStatus() == FacilityAdmission.Status.ADMITTED) throw new ApiException(409, "ALREADY_ADMITTED", "The patient is already admitted");
        return admission;
    }

    /** Finance's money work goes to the case's Finance person, else the least-loaded Finance holder; every holder is told. */
    private void openFinanceWork(UUID caseId, String type, String title, String context, Instant dueAt, String key, WorkCopy copy) {
        String owner = assignee(caseId, "FINANCE");
        if (owner == null) owner = workforce.activeHolders("FINANCE").stream().map(WorkforceDirectory.Member::subject).distinct()
                .min(Comparator.<String>comparingLong(s -> tasks.countByOwnerSubjectAndStatusIn(s, OPEN_WORK)).thenComparing(Comparator.naturalOrder())).orElse(null);
        work.openWorkItem(new NewWorkItem(caseId, type, title, context, owner, "FINANCE", false, dueAt, "SYSTEM", type, key, true, copy));
        for (var holder : workforce.activeHolders("FINANCE")) {
            if (holder.subject().equals(owner)) continue;
            work.notifyStaff(holder.subject(), caseId, null, type, title, context, key + ":" + holder.subject(), false, copy);
        }
    }

    /** The case's active assignee of a role who still holds it (QA A3: a Finance person who left owns nothing new). */
    private String assignee(UUID caseId, String role) {
        return assignments.findActiveAssignees(caseId, role).stream().filter(s -> workforce.holds(s, role)).findFirst().orElse(null);
    }

    /** Locks the case row and returns its stage. */
    private String lockStage(UUID caseId) {
        MedicalCase c = cases.lockById(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        return c.getStatus().name();
    }

    private static void requireStage(String stage, Set<String> allowed, String code, String message) {
        if (!allowed.contains(stage)) throw new ApiException(409, code, message);
    }

    /** A move the policy allows, written like the deposit handoff's (status log, audit, the stage's default responsibility). */
    private void move(UUID caseId, String from, String to, String subject, String role, String reason) {
        policy.assertAllowed(caseId, from, to);
        Instant now = clock.instant();
        if (cases.moveStatus(caseId, CaseStatus.valueOf(from), CaseStatus.valueOf(to), micros(now)) != 1)
            throw new ApiException(409, "CASE_VERSION_CONFLICT", "The case was updated by another user");
        statusLog.record(caseId, from, to, subject, role, reason, now);
        audit("CASE_STATUS_CHANGED", subject, role, caseId, "MedicalCase", caseId, "TRANSITION", from + " -> " + to);
        work.refreshWaitingOn(caseId, StaffWorkService.stageDefault(to), null);
    }

    /** The hospital is emailed the voucher (phase 1: no hospital portal). Only the facts the hospital needs to admit and bill. */
    private void tellFacility(UUID caseId, FacilityAdmission admission, AdmissionVoucher voucher, String caseNumber, Instant now) {
        Facility facility = facilities.active(admission.getFacilityId()).orElse(null);
        if (facility == null || facility.getContactEmail() == null || facility.getContactEmail().isBlank()) return;
        Split s = voucher.split();
        Map<String, String> data = new LinkedHashMap<>();
        data.put("lang", "en");
        data.put("voucher", voucher.getVoucherNumber());
        data.put("caseNumber", caseNumber);
        data.put("patient", cases.findPatientName(caseId).orElse(""));
        data.put("facility", facility.getName());
        data.put("admission", admission.getPlannedAdmissionAt().toString());
        data.put("package", s.packageTotalEgp().toPlainString());
        data.put("credit", s.depositCreditEgp().toPlainString());
        data.put("atFacility", s.patientPaysAtFacilityEgp().toPlainString());
        outbox.enqueueOnce("ADMISSION_VOUCHER", "EMAIL", facility.getContactEmail().trim(), "admission-voucher-facility",
                intake.encryptedJson(write(data)), "admission-voucher-facility:" + voucher.getId(), now);
    }

    private String caseNumber(UUID caseId) { return cases.findCaseNumber(caseId).orElse(""); }

    private String write(Map<String, String> value) {
        try { return json.writeValueAsString(value); } catch (Exception e) { throw new IllegalStateException("Cannot write the evidence payload", e); }
    }

    private static BigDecimal display(BigDecimal egp, Rate rate) {
        if (egp == null) return null;
        if ("EGP".equals(rate.displayCurrency()) || rate.fxRate() == null) return egp;
        return ProposalPricing.display(egp, rate.fxRate());
    }

    private static BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }

    private static String blankToNull(String v) { return v == null || v.isBlank() ? null : v.trim(); }

    private void audit(String type, String subject, String role, UUID caseId, String entity, Object entityId, String action, String reason) {
        auditTrail.event(type).actor(subject, role).caseId(caseId).entity(entity, entityId).action(action).reason(reason).record();
    }
}
