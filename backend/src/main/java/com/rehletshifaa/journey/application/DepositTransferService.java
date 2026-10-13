package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.DepositView;
import com.rehletshifaa.journey.api.JourneyDtos.IdResponse;
import com.rehletshifaa.journey.api.JourneyDtos.TransferReferenceRequest;
import com.rehletshifaa.journey.api.JourneyDtos.TransferRejectionRequest;
import com.rehletshifaa.journey.domain.DepositTransferReport;
import com.rehletshifaa.journey.infrastructure.DepositRepository;
import com.rehletshifaa.journey.infrastructure.DepositTransferReportRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import java.util.regex.Pattern;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The patient's payment step for the coordination deposit (DEP-3, owner decision 2026-10-13). The patient pays by bank
 * transfer and enters the transaction reference their bank gave them; that reference is the only proof asked for and it
 * is mandatory: Finance confirms the amount received against it ({@link PaymentService#recordReceipt}) or rejects it with
 * a reason, and the deposit never settles without one. Online payment is shown to the patient but not offered until a
 * provider is chosen (DEP-2).
 */
@Service
public class DepositTransferService {
    /** Letters, digits and the separators banks print (space . / _ -), 4 to 64 characters. */
    private static final Pattern REFERENCE = Pattern.compile("[A-Za-z0-9][A-Za-z0-9 ./_-]{2,62}[A-Za-z0-9]");

    private final Authority authority;
    private final DepositQueryService queries;
    private final DepositRepository deposits;
    private final DepositTransferReportRepository transfers;
    private final MedicalCaseRepository cases;
    private final DepositPaymentNotices notices;
    private final CaseActionService caseActions;
    private final AuditTrail auditTrail;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public DepositTransferService(Authority authority, DepositQueryService queries, DepositRepository deposits,
                                  DepositTransferReportRepository transfers, MedicalCaseRepository cases, DepositPaymentNotices notices,
                                  CaseActionService caseActions, AuditTrail auditTrail, ApplicationEventPublisher events, Clock clock) {
        this.authority = authority; this.queries = queries; this.deposits = deposits; this.transfers = transfers; this.cases = cases;
        this.notices = notices; this.caseActions = caseActions; this.auditTrail = auditTrail; this.events = events; this.clock = clock;
    }

    /**
     * The patient (or their representative) enters the transaction reference of their bank transfer. Finance is asked to
     * verify it. One reference waits at a time: the same one again is a replay; a different one while the first is being
     * checked is refused, so Finance never verifies a moving target.
     */
    @Transactional
    public DepositView submitReference(UUID caseId, TransferReferenceRequest request) {
        Actor actor = authority.authorize(Permission.DEPOSIT_TRANSFER_REPORT, Resource.ofCase(caseId));
        String reference = normalize(request.reference());
        cases.lockById(caseId);
        cases.touch(caseId, micros(clock.instant())); // QA W-22
        DepositRepository.Quoted deposit = payableDeposit(caseId);
        var pending = transfers.findPendingOn(deposit.getId(), Limit.of(1)).stream().findFirst();
        if (pending.isPresent()) {
            if (pending.get().getTransferReference().equals(reference)) return queries.depositForCase(caseId);
            throw new ApiException(409, "TRANSFER_ALREADY_SUBMITTED", "We are already checking the reference you sent. We will tell you as soon as it is confirmed.");
        }
        // The payment step is the patient's once every other step is done (owner decision).
        if (!patientOwesReference(caseId)) throw new ApiException(409, "DEPOSIT_NOT_PAYABLE", "There is no deposit to pay on this case right now");
        var last = transfers.findLatestOn(deposit.getId(), Limit.of(1)).stream().findFirst();
        if (last.isPresent() && "REJECTED".equals(last.get().getStatus()) && last.get().getTransferReference().equals(reference))
            throw new ApiException(409, "TRANSFER_REFERENCE_REJECTED", "We could not confirm this reference. Check it with your bank and enter the correct one.");
        if (transfers.existsByTransferReferenceAndStatusInAndDepositIdNot(reference, java.util.List.of("SUBMITTED", "CONFIRMED"), deposit.getId()))
            throw new ApiException(409, "TRANSFER_REFERENCE_IN_USE", "This reference is already recorded for another payment. Check it, or contact your coordinator.");
        UUID id = UUID.randomUUID();
        transfers.saveAndFlush(new DepositTransferReport(id, caseId, deposit.getId(), reference, actor.subject(), clock.instant()));
        audit(actor, caseId, "DEPOSIT_TRANSFER_REPORTED", id, "method=BANK_TRANSFER");
        events.publishEvent(new CaseEvents.TransferReported(caseId));
        return queries.depositForCase(caseId);
    }

    /** Finance cannot match the transfer to the reference: the payment step returns to the patient with the reason. */
    @Transactional
    public DepositView reject(UUID caseId, UUID depositId, UUID reportId, TransferRejectionRequest request) {
        Actor actor = authorizeFinance(caseId);
        cases.lockById(caseId);
        cases.touch(caseId, micros(clock.instant())); // QA W-22
        DepositRepository.Quoted deposit = payableDeposit(caseId);
        if (!deposit.getId().equals(depositId)) throw new ApiException(404, "DEPOSIT_NOT_FOUND", "The deposit was not found for this case");
        Instant now = clock.instant();
        var pending = transfers.findPendingOn(depositId, Limit.of(1)).stream().findFirst().filter(r -> r.getId().equals(reportId))
                .orElseThrow(() -> new ApiException(409, "TRANSFER_NOT_PENDING", "This transfer reference was already decided"));
        if (pending.getSubmittedBy().equals(actor.subject()))
            throw new ApiException(403, "SELF_CONFIRMATION", "A transfer you reported yourself must be decided by someone else in Finance");
        int decided = transfers.decide(reportId, depositId, "REJECTED", actor.subject(), request.reason().trim(), micros(now));
        if (decided != 1) throw new ApiException(409, "TRANSFER_NOT_PENDING", "This transfer reference was already decided");
        deposits.restartPayable(depositId, micros(now));
        audit(actor, caseId, "DEPOSIT_TRANSFER_REJECTED", reportId, request.reason().trim());
        events.publishEvent(new CaseEvents.TransferRejected(caseId));
        return queries.depositForCase(caseId);
    }

    /**
     * The patient asked on WhatsApp how to pay: the case's one voice sends them the link to their payment step, where the
     * account details are and where they enter the reference. Only while the patient owes it.
     */
    @Transactional
    public IdResponse sendPaymentLink(UUID caseId) {
        Actor actor = authority.authorize(Permission.CASE_PATIENT_REPLY, Resource.ofCase(caseId));
        if (!patientOwesReference(caseId))
            throw new ApiException(409, "PAYMENT_LINK_NOT_DUE", "The patient has no deposit payment to make right now");
        Instant now = clock.instant();
        // At most one link a day: a repeated click sends nothing more.
        if (!notices.send(caseId, DepositPaymentNotices.DUE, "deposit-payment-link:" + caseId + ":" + java.time.LocalDate.ofInstant(now, java.time.ZoneOffset.UTC)))
            throw new ApiException(409, "PATIENT_CHANNEL_MISSING", "The patient has no WhatsApp number or email on record");
        audit(actor, caseId, "DEPOSIT_PAYMENT_LINK_SENT", caseId, null);
        return new IdResponse(caseId, "SENT");
    }

    /** The deposit is open and the patient, with every other step done, still owes the transfer reference. */
    boolean patientOwesReference(UUID caseId) {
        return caseActions.readinessBlockers(caseId).stream().anyMatch(b -> "DEPOSIT_UNPAID".equals(b.code()) && "PATIENT".equals(b.owner()));
    }

    /** Payments are Finance-wide (PAYMENT_RECORD), on a case Finance may see: assigned, or its payment view while the deposit is open. */
    private Actor authorizeFinance(UUID caseId) {
        Actor actor = authority.authorize(Permission.PAYMENT_RECORD);
        Resource onCase = Resource.ofCase(caseId);
        if (!authority.allowed(Permission.CASE_READ, onCase)) authority.require(Permission.CASE_DEPOSIT_READ, onCase);
        return actor;
    }

    private DepositRepository.Quoted payableDeposit(UUID caseId) {
        DepositRepository.Quoted deposit = queries.openDeposit(caseId);
        if (deposit == null || !deposits.isOpenOn(caseId))
            throw new ApiException(409, "DEPOSIT_NOT_PAYABLE", "There is no deposit to pay on this case right now");
        return deposit;
    }

    /** As the bank shows it: trimmed, single spaces, Arabic-Indic digits as 0-9, upper case (banks match without case). */
    static String normalize(String raw) {
        if (raw == null) throw invalid();
        StringBuilder out = new StringBuilder();
        for (char ch : raw.trim().toCharArray()) {
            if (ch >= '٠' && ch <= '٩') ch = (char) ('0' + (ch - '٠'));
            else if (ch >= '۰' && ch <= '۹') ch = (char) ('0' + (ch - '۰'));
            out.append(ch);
        }
        String value = out.toString().replaceAll("\\s+", " ").toUpperCase(java.util.Locale.ROOT);
        if (!REFERENCE.matcher(value).matches()) throw invalid();
        return value;
    }

    private static ApiException invalid() {
        return new ApiException(400, "TRANSFER_REFERENCE_INVALID", "Enter the transaction reference exactly as your bank shows it: letters and numbers, 4 to 64 characters");
    }

    private void audit(Actor actor, UUID caseId, String type, UUID entityId, String reason) {
        auditTrail.event(type).actor(actor.subject(), actor.label()).caseId(caseId).entity("Deposit", entityId).action("PAYMENT").reason(reason).record();
    }
}
